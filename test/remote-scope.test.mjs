import test from 'node:test';
import assert from 'node:assert/strict';
import { remoteScope } from '../src/remote-scope.js';

test('telefon smí číst stav a přepisy', () => {
  for (const p of ['/api/state', '/api/sessions/abc', '/api/sessions/abc/transcript', '/api/alerts', '/api/projects', '/api/stream', '/api/skills']) {
    assert.equal(remoteScope('GET', p).ok, true, p);
  }
  assert.equal(remoteScope('GET', '/app.js').ok, true, 'statické soubory');
});

test('telefon nesmí nic spustit, nainstalovat, uložit ani smazat', () => {
  const zakazano = [
    ['POST', '/api/launch'], ['POST', '/api/integrations/claude-hooks/install'], ['PUT', '/api/secrets/openai-admin'],
    ['DELETE', '/api/secrets/x'], ['POST', '/api/sessions/abc/open'], ['PATCH', '/api/projects/x'], ['DELETE', '/api/projects/x'],
    ['PUT', '/api/settings'], ['POST', '/api/custom-agents'], ['POST', '/api/spend/ledger'], ['POST', '/api/runs/x/stop'],
    ['POST', '/api/projects/x/team'], ['PUT', '/api/projects/x/media/cover'], ['POST', '/api/license/activate'], ['PUT', '/api/projects/order'],
  ];
  for (const [m, p] of zakazano) assert.equal(remoteScope(m, p).ok, false, `${m} ${p}`);
});

test('výjimky: párování a označení upozornění za přečtená; disk se nečte', () => {
  assert.equal(remoteScope('POST', '/api/lan/pair').ok, true);
  assert.equal(remoteScope('POST', '/api/alerts/read').ok, true);
  assert.equal(remoteScope('POST', '/api/alerts/clear').ok, false);
  assert.equal(remoteScope('GET', '/api/fs/folders').ok, false);
  assert.match(remoteScope('POST', '/api/launch').error, /jen na Macu/);
});
