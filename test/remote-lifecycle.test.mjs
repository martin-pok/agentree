import test from 'node:test';
import assert from 'node:assert/strict';
import { startTestServer, waitFor, openStream } from './helpers.mjs';
import { COOKIE } from '../src/lan.js';

async function remoteStream(s, token) {
  const controller = new AbortController();
  const res = await fetch(`${s.url}/api/stream`, { headers: { 'X-Forwarded-For': '100.100.100.2', Cookie: `${COOKIE}=${token}` }, signal: controller.signal });
  assert.equal(res.status, 200);
  const state = { text: '', closed: false, close: () => controller.abort() };
  (async () => {
    try { for await (const bytes of res.body) state.text += Buffer.from(bytes).toString(); }
    catch { /* socket revocation or explicit cleanup */ }
    finally { state.closed = true; }
  })();
  await waitFor(() => state.text.includes('event: hello'));
  return state;
}

test('remote stream: revocation closes only revoked device; local and other paired streams remain live', async (t) => {
  const s = await startTestServer(); t.after(() => s.close());
  s.app.datastore.data.settings.tailscaleAccess = true;
  const first = await s.app.lan.pair(s.app.lan.newPin().code, 'first');
  const second = await s.app.lan.pair(s.app.lan.newPin().code, 'second');
  const a = await remoteStream(s, first.token); t.after(a.close);
  const b = await remoteStream(s, second.token); t.after(b.close);
  const local = await openStream(s.url); t.after(local.close);
  await s.app.lan.revoke(first.device.id);
  await waitFor(() => a.closed);
  s.app.store.emit('transcript', { id: 'fixture', text: 'after-revocation' });
  await waitFor(() => b.text.includes('after-revocation') && local.events.some((e) => e.event === 'transcript'));
  assert.equal(a.text.includes('after-revocation'), false);
});

test('remote stream: disabling Tailscale closes proxy stream and rejects reconnect while LAN stays enabled', async (t) => {
  const s = await startTestServer({}, { networkInterfaces: () => ({}) }); t.after(() => s.close());
  Object.assign(s.app.datastore.data.settings, { tailscaleAccess: true, lanAccess: true });
  const pair = await s.app.lan.pair(s.app.lan.newPin().code, 'phone');
  const a = await remoteStream(s, pair.token); t.after(a.close);
  await s.app.setTailscaleAccess(false);
  await waitFor(() => a.closed);
  const res = await fetch(`${s.url}/api/state`, { headers: { 'X-Forwarded-For': '100.100.100.2', Cookie: `${COOKIE}=${pair.token}` } });
  assert.equal(res.status, 403);
  assert.equal(s.app.lan.tokenOk(pair.token), true, 'LAN device pairing is preserved');
  assert.equal((await fetch(`${s.url}/api/state`)).status, 200);
});

test('remote stream: expired token cannot receive another event', async (t) => {
  const s = await startTestServer(); t.after(() => s.close());
  s.app.datastore.data.settings.tailscaleAccess = true;
  const pair = await s.app.lan.pair(s.app.lan.newPin().code, 'phone');
  const a = await remoteStream(s, pair.token); t.after(a.close);
  s.app.datastore.data.lanDevices[0].at = 0;
  s.app.store.emit('transcript', { text: 'after-expiry' });
  await waitFor(() => a.closed);
  assert.equal(a.text.includes('after-expiry'), false);
});

test('remote restore verifies MagicDNS and owned IPs, clears stale identity after Tailscale stops', async (t) => {
  let running = true;
  const s = await startTestServer({}, {
    networkInterfaces: () => ({ tun: [{ family: 'IPv4', address: '100.100.100.1', internal: false }] }),
    tunnelDetector: async () => [{ id: 'tailscale', running, url: 'fixture.tail.ts.net', ips: running ? ['100.100.100.1'] : [] }],
  }); t.after(() => s.close());
  s.app.datastore.data.settings.tailscaleAccess = true;
  await s.app.restoreRemoteAccess();
  assert.deepEqual(s.app.lan.hosts(), ['100.100.100.1', 'fixture.tail.ts.net']);
  running = false;
  await s.app.restoreRemoteAccess();
  assert.deepEqual(s.app.lan.hosts(), []);
  assert.equal(s.app.lan.status().tailscale.available, false);
  assert.equal(s.app.datastore.data.settings.tailscaleAccess, true, 'preference remains for automatic recovery');
});

test('remote restore cannot reopen access after disable or stop while detection was pending', async (t) => {
  let resolveDetection;
  const s = await startTestServer({}, {
    networkInterfaces: () => ({}),
    tunnelDetector: () => new Promise((resolve) => { resolveDetection = resolve; }),
  }); t.after(() => s.close());
  s.app.datastore.data.settings.tailscaleAccess = true;
  const restore = s.app.restoreRemoteAccess();
  await s.app.setTailscaleAccess(false);
  resolveDetection([{ id: 'tailscale', running: true, url: 'fixture.tail.ts.net', ips: [] }]);
  await restore;
  assert.deepEqual(s.app.lan.hosts(), []);
  s.app.datastore.data.settings.tailscaleAccess = true;
  const again = s.app.restoreRemoteAccess();
  const stop = s.app.stop();
  resolveDetection([{ id: 'tailscale', running: true, url: 'fixture.tail.ts.net', ips: [] }]);
  await Promise.all([again, stop]);
  assert.equal(s.app.lan.listening, false);
});
