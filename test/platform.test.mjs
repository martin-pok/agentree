// Platformový šev a cesty v rozhraní.
//
// Většina těchhle testů běží na každém systému stejně, protože ověřuje čisté funkce nad
// řetězci. Tam, kde výsledek na systému skutečně závisí (appSupportDir), se testuje to,
// co platí vždycky: že se vychází ze zadaného domova a že se nikdy nesáhne jinam.
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { appSupportDir, openCommand, tailscalePaths, JE_MAC, JE_WINDOWS } from '../src/platform.js';
import { originOf } from '../src/skills.js';
import { jeAbsolutniCesta, castiCesty, shortPath } from '../public/js/format.js';

test('appSupportDir vychází ze zadaného domova a nikdy nesáhne mimo něj', () => {
  const domov = path.join(path.sep, 'tmp', 'falesny-domov');
  const dir = appSupportDir(domov);
  assert.ok(dir.startsWith(domov), `${dir} musí ležet pod ${domov}`);
  assert.notEqual(dir, domov, 'podsložka, ne samotný domov');

  // Testy podstrkávají falešný domov přes AGENTEEQ_SOURCE_HOME. Kdyby se tahle funkce
  // opřela o proměnnou prostředí (APPDATA), sáhla by při testech na skutečný profil.
  const jiny = appSupportDir(path.join(path.sep, 'tmp', 'jiny'));
  assert.notEqual(jiny, dir, 'jiný domov musí dát jinou cestu');

  if (JE_MAC) assert.equal(dir, path.join(domov, 'Library', 'Application Support'));
  else if (JE_WINDOWS) assert.equal(dir, path.join(domov, 'AppData', 'Roaming'));
  else assert.equal(dir, path.join(domov, '.config'));
});

test('openCommand vrací příkaz pro tento systém, nebo poctivě nic', () => {
  const p = openCommand('http://127.0.0.1:4620');
  if (JE_MAC) assert.deepEqual(p, { cmd: 'open', args: ['http://127.0.0.1:4620'] });
  else if (JE_WINDOWS) assert.deepEqual(p, { cmd: 'cmd.exe', args: ['/c', 'start', '', 'http://127.0.0.1:4620'] });
  else assert.equal(p, null, 'co neumíme, nehádáme');
});

test('tailscalePaths vrací jen absolutní cesty pro tento systém', () => {
  const cesty = tailscalePaths();
  assert.ok(cesty.length > 0);
  for (const c of cesty) assert.ok(path.isAbsolute(c), `${c} musí být absolutní`);
  if (JE_WINDOWS) assert.ok(cesty.every((c) => c.endsWith('.exe')), 'na Windows jsou to .exe');
});

test('původ dovednosti se pozná i z cesty psané zpětným lomítkem', () => {
  const pripady = [
    ['/Users/x/.claude/plugins/cache/claude-plugins-official/a', 'anthropic'],
    ['C:\\Users\\x\\.claude\\plugins\\cache\\claude-plugins-official\\a', 'anthropic'],
    ['/Users/x/.codex/skills/.system/a', 'openai'],
    ['C:\\Users\\x\\.codex\\skills\\.system\\a', 'openai'],
    ['/Users/x/.claude/plugins/marketplaces/cizi/a', 'plugin'],
    ['C:\\Users\\x\\.claude\\plugins\\cache\\cizi\\a', 'plugin'],
    ['C:\\Users\\x\\.claude\\skills\\moje', 'own'],
  ];
  for (const [cesta, cekany] of pripady) assert.equal(originOf(cesta), cekany, cesta);
});

// Rozhraní dostává cesty tak, jak je napsal systém, na kterém běží server. Telefon
// s Androidem se dívá na Mac, prohlížeč na Macu se přes Tailscale dívá na Windows.
// Proto nesmí nic v rozhraní předpokládat jeden konkrétní tvar cesty.
test('rozhraní pozná absolutní cestu na Macu, Linuxu i Windows', () => {
  for (const ano of ['/Users/jana/web', '/home/jana/web', 'C:\\Users\\jana\\web', 'D:/projekt', '\\\\server\\sdileni']) {
    assert.equal(jeAbsolutniCesta(ano), true, ano);
  }
  for (const ne of ['relativni/cesta', '', null, undefined, '~/web', 'web']) {
    assert.equal(jeAbsolutniCesta(ne), false, String(ne));
  }
});

test('rozhraní rozdělí cestu bez ohledu na oddělovač', () => {
  assert.deepEqual(castiCesty('/Users/jana/web'), ['Users', 'jana', 'web']);
  assert.deepEqual(castiCesty('C:\\Users\\jana\\web'), ['C:', 'Users', 'jana', 'web']);
  assert.deepEqual(castiCesty('a//b\\\\c'), ['a', 'b', 'c'], 'zdvojený oddělovač nevyrobí prázdnou část');
  assert.deepEqual(castiCesty(''), []);
});

test('domovská složka se v rozhraní zkrátí na vlnovku na všech systémech', () => {
  assert.equal(shortPath('/Users/jana/web'), '~/web');
  assert.equal(shortPath('/home/jana/web'), '~/web');
  assert.equal(shortPath('C:\\Users\\jana\\web'), '~\\web');
  assert.equal(shortPath('/opt/nastroje'), '/opt/nastroje', 'co není domov, se nezkracuje');
  assert.equal(shortPath('C:\\Program Files\\x'), 'C:\\Program Files\\x');
  assert.equal(shortPath(''), '');
});
