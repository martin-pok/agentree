import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { signLicense, verifyLicense } from '../src/license.js';
import { PAID_FEATURES, canUse } from '../src/plans.js';
import { RunManager } from '../src/runs.js';
import { tempDir, waitFor } from './helpers.mjs';

const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
const pub = publicKey.export({ type: 'spki', format: 'pem' });
const priv = privateKey.export({ type: 'pkcs8', format: 'pem' });
const payload = (over = {}) => ({ v: 1, id: 'lic-1', name: 'Jana Nováková', email: 'jana@studio.cz', plan: 'pro', seats: 2, issuedAt: '2026-09-11T08:00:00Z', expiresAt: null, ...over });

test('licence: platný klíč, podvržený obsah, cizí klíč, formát', () => {
  const key = signLicense(payload(), priv);
  const ok = verifyLicense(key, { publicKey: pub });
  assert.equal(ok.valid, true);
  assert.equal(ok.license.planLabel, 'Pro');
  assert.equal(ok.license.seats, 2);

  const [prefix, body, sig] = key.split('.');
  const forged = Buffer.from(JSON.stringify(payload({ plan: 'team' }))).toString('base64url');
  assert.equal(verifyLicense(`${prefix}.${forged}.${sig}`, { publicKey: pub }).valid, false, 'změna tarifu zneplatní podpis');
  assert.equal(verifyLicense(key, { publicKey: crypto.generateKeyPairSync('ed25519').publicKey.export({ type: 'spki', format: 'pem' }) }).valid, false);
  assert.equal(verifyLicense('nesmysl', { publicKey: pub }).reason, 'Klíč nemá správný formát.');
  assert.equal(verifyLicense('', { publicKey: pub }).valid, false);
  assert.equal(verifyLicense(`${prefix}.${body}`, { publicKey: pub }).valid, false);
});

test('licence: vypršení a neplatný tarif', () => {
  const expired = verifyLicense(signLicense(payload({ expiresAt: '2026-01-01T00:00:00Z' }), priv), { publicKey: pub, now: Date.parse('2026-09-11') });
  assert.equal(expired.valid, false);
  assert.equal(expired.expired, true);
  assert.equal(expired.license.email, 'jana@studio.cz');
  assert.equal(verifyLicense(signLicense(payload({ plan: 'free' }), priv), { publicKey: pub }).valid, false);
  assert.equal(verifyLicense(signLicense(payload({ v: 2 }), priv), { publicKey: pub }).valid, false);
});

test('tarify: bez placených funkcí je vše odemčené; s nimi rozhoduje licence', () => {
  assert.equal(canUse('launchBackground', { valid: false }), true);
  PAID_FEATURES.launchBackground = 'pro';
  try {
    assert.equal(canUse('launchBackground', { valid: false }), false);
    assert.equal(canUse('launchBackground', { valid: true, license: { plan: 'pro' } }), true);
    assert.equal(canUse('launchBackground', { valid: true, license: { plan: 'team' } }), true);
  } finally {
    delete PAID_FEATURES.launchBackground;
  }
});

test('běhy na pozadí: dokončení, selhání, zastavení, neexistující program', async () => {
  const dir = await tempDir();
  const changes = [];
  const rm = new RunManager({ dataDir: dir, onChange: (_list, run) => changes.push(`${run.label}:${run.status}`) });

  const ok = rm.start({ agent: 'test', label: 'ok', argv: [process.execPath, '-e', 'console.log("ahoj z agenta"); setTimeout(() => process.exit(0), 100)'], cwd: dir, prompt: 'x' });
  assert.equal(ok.status, 'running');
  assert.ok(ok.pid > 0);
  await waitFor(() => rm.get(ok.id).status === 'done');
  assert.equal(rm.get(ok.id).exitCode, 0);
  assert.match(rm.tail(ok.id), /ahoj z agenta/);

  const bad = rm.start({ agent: 'test', label: 'bad', argv: [process.execPath, '-e', 'console.error("Chyba: limit"); process.exit(3)'], cwd: dir, prompt: 'x' });
  await waitFor(() => rm.get(bad.id).status === 'failed');
  assert.equal(rm.get(bad.id).exitCode, 3);
  assert.equal(rm.get(bad.id).error, 'Chyba: limit');

  const long = rm.start({ agent: 'test', label: 'long', argv: [process.execPath, '-e', 'setInterval(() => {}, 1000)'], cwd: dir, prompt: 'x' });
  await new Promise((r) => setTimeout(r, 150));
  assert.equal(rm.stop(long.id), true);
  await waitFor(() => rm.get(long.id).status === 'stopped', 7000);
  assert.equal(rm.stop(long.id), false, 'zastavený běh nejde zastavit znovu');

  const missing = rm.start({ agent: 'test', label: 'missing', argv: ['/neexistuje/agent'], cwd: dir, prompt: 'x' });
  await waitFor(() => rm.get(missing.id).status === 'failed');
  assert.ok(changes.includes('ok:done') && changes.includes('long:stopped'));
});
