import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { AGENTI, WEBY, createNapojeni } from '../src/napojeni.js';
import { spustPrihlaseni, odkazZVystupu, prostrediPro } from '../src/prihlaseni.js';
import { startTestServer, api, openStream, waitFor, pairExtension, tempDir, EXTENSION_ORIGIN } from './helpers.mjs';

// Napojení modelů tlačítkem (src/napojeni.js). Přihlašuje se u dodavatele; Agenteeq jen spustí jeho
// přihlášení a ptá se, jestli je hotovo. V testech odpovídá místo claude/codex atrapa.

test('stav přihlášení se čte jen z ověřeného výstupu – neznámý výstup je „nevím“, ne „ne“', () => {
  const claude = AGENTI['claude-code'].precti;
  assert.equal(claude({ stdout: '{"loggedIn":true,"authMethod":"claude.ai"}' }), true);
  assert.equal(claude({ stdout: '{"loggedIn":false}' }), false);
  assert.equal(claude({ stdout: 'command not found' }), null);
  assert.equal(claude({ stdout: '{"cosi":1}' }), null);
  const codex = AGENTI.codex.precti;
  // Codex píše stav na stderr (codex-rs/cli/src/login.rs).
  assert.equal(codex({ stdout: '', stderr: 'Logged in using ChatGPT\n' }), true);
  assert.equal(codex({ stdout: '', stderr: 'Logged in using an API key - sk-…abcd\n' }), true);
  assert.equal(codex({ stdout: '', stderr: 'Not logged in\n' }), false);
  assert.equal(codex({ stdout: '', stderr: 'Error checking login status: …' }), null);
});

// Dřív se přihlášení spouštělo v Terminálu: člověk viděl výpis a otázky, a teprve pak prohlížeč.
// Teď běží na pozadí jako obyčejný podproces – bez shellu, takže se cesta „Design & Web“ nerozpadne.
test('přihlášení běží na pozadí bez shellu: záložní odkaz z výstupu, kód na vstup, PATH se složkou programu', async (t) => {
  if (process.platform === 'win32') return t.skip('atrapa je shellový skript');
  const home = await tempDir('agenteeq-login-');
  const slozka = path.join(home, 'Design & Web', 'bin');
  await fs.mkdir(slozka, { recursive: true });
  const bin = path.join(slozka, 'claude');
  const zaznam = path.join(home, 'argumenty.txt');
  // Chová se jako `claude auth login`: vypíše záložní odkaz, zeptá se na kód a skončí po jeho přijetí.
  await fs.writeFile(bin, `#!/bin/sh
printf '%s\\n' "$@" > "${zaznam}"
echo "$PATH" >> "${zaznam}"
echo "Opening browser to sign in…"
echo "If the browser didn't open, visit: https://claude.com/cai/oauth/authorize?code=true&state=abc"
printf "Paste code here if prompted > "
read kod
echo "kod=$kod" >> "${zaznam}"
`, { mode: 0o755 });
  let konecKod;
  const p = await spustPrihlaseni(bin, ['auth', 'login', '--claudeai'], { env: prostrediPro(bin, { PATH: '/usr/bin:/bin' }), naKonec: (kod) => { konecKod = kod; } });
  assert.equal(p.ok, true);
  await waitFor(() => p.chceKod());
  assert.equal(p.odkaz(), 'https://claude.com/cai/oauth/authorize?code=true&state=abc');
  assert.equal(p.posliKod('abc123#def456'), true);
  assert.equal(await p.konec, 0);
  await waitFor(() => konecKod === 0);
  const radky = (await fs.readFile(zaznam, 'utf8')).trim().split('\n');
  assert.deepEqual(radky.slice(0, 3), ['auth', 'login', '--claudeai']);
  assert.equal(radky[3].split(':')[0], slozka, 'složka programu je v PATH první (node z nvm vedle claude)');
  assert.equal(radky[4], 'kod=abc123#def456');

  const chybi = await spustPrihlaseni(path.join(home, 'nic'), ['login']);
  assert.equal(chybi.ok, false);
  assert.match(chybi.error, /nepodařilo spustit/);
});

test('záložní odkaz se bere jen od dodavatele', () => {
  assert.equal(odkazZVystupu('visit: https://auth.openai.com/oauth/authorize?x=1 now'), 'https://auth.openai.com/oauth/authorize?x=1');
  assert.equal(odkazZVystupu('visit: https://evil.example/claude.com'), null);
  assert.equal(odkazZVystupu('https://claude.com.evil.example/'), null);
  assert.equal(odkazZVystupu('http://claude.com/'), null, 'jen https');
  assert.equal(odkazZVystupu(''), null);
});

// Atrapa nástrojů: `prihlasen` se dá přepnout, jako by člověk dokončil přihlášení v prohlížeči.
function atrapa({ prihlasen = { claude: false, codex: false }, spusteni = () => ({}) } = {}) {
  const zapis = { prihlas: [], open: [], emit: [], run: [], zastaveno: 0, kody: [], procesy: [] };
  const n = createNapojeni({
    bins: () => ({ claude: '/usr/local/bin/claude', codex: '/usr/local/bin/codex' }),
    run: async (bin, args) => {
      zapis.run.push([bin, ...args]);
      if (bin.endsWith('claude')) return { ok: true, stdout: JSON.stringify({ loggedIn: prihlasen.claude }), stderr: '' };
      return { ok: prihlasen.codex, stdout: '', stderr: prihlasen.codex ? 'Logged in using ChatGPT' : 'Not logged in' };
    },
    prihlas: async (bin, args, { naKonec }) => {
      zapis.prihlas.push([bin, ...args]);
      const jinak = spusteni(args);
      if (jinak.ok === false) return jinak;
      const proces = {
        ok: true,
        url: null,
        naKonec,
        odkaz: () => proces.url,
        chceKod: () => false,
        posliKod: (k) => { zapis.kody.push(k); return true; },
        zastav: () => { zapis.zastaveno++; },
        ...jinak,
      };
      zapis.procesy.push(proces);
      return proces;
    },
    open: async (url) => { zapis.open.push(url); return { ok: true }; },
    emit: (u) => zapis.emit.push(u),
    plan: async (id) => (id === 'claude-code' ? 'Claude Max' : ''),
    extension: () => zapis.rozsireni || { state: 'missing' },
    intervalMs: 5,
    limitMs: 400,
    odkazMs: 200,
  });
  return { n, zapis, prihlasen };
}

test('napojení Claude Code: přihlášení se spustí na pozadí (bez Terminálu) a po dokončení přijde potvrzení s plánem', async () => {
  const { n, zapis, prihlasen } = atrapa();
  const r = await n.napojit('claude-code');
  assert.deepEqual({ ok: r.ok, ceka: r.ceka }, { ok: true, ceka: true });
  assert.deepEqual(zapis.prihlas, [['/usr/local/bin/claude', 'auth', 'login', '--claudeai']]);
  await new Promise((res) => setTimeout(res, 30));
  assert.equal(zapis.emit.length, 0, 'dokud se člověk nepřihlásí, nic se nepotvrzuje');
  prihlasen.claude = true;
  await waitFor(() => zapis.emit.length);
  assert.deepEqual(zapis.emit[0], { id: 'claude-code', label: 'Claude Code', udalost: 'napojeno', plan: 'Claude Max' });
  assert.equal(n.ceka('claude-code'), false, 'po potvrzení se přestane hlídat');
  assert.equal(zapis.zastaveno, 1, 'proces přihlášení se uklidí');
});

test('už napojený Codex se jen potvrdí, přihlášení se nespouští', async () => {
  const { n, zapis } = atrapa({ prihlasen: { claude: false, codex: true } });
  const r = await n.napojit('codex');
  assert.equal(r.uz, true);
  assert.deepEqual(zapis.prihlas, []);
  assert.equal(zapis.emit[0].udalost, 'napojeno');
  assert.equal(zapis.emit[0].uz, true);
});

test('starší Claude Code bez --claudeai: přihlášení se jednou zopakuje bez přepínače', async () => {
  const { n, zapis, prihlasen } = atrapa();
  await n.napojit('claude-code');
  zapis.procesy[0].naKonec(1, "error: unknown option '--claudeai'");
  await waitFor(() => zapis.prihlas.length === 2);
  assert.deepEqual(zapis.prihlas[1], ['/usr/local/bin/claude', 'auth', 'login']);
  assert.equal(n.ceka('claude-code'), true, 'čeká se dál, teď na druhý pokus');
  prihlasen.claude = true;
  await waitFor(() => zapis.emit.find((u) => u.udalost === 'napojeno'));
});

test('přihlášení skončilo bez napojení: okno se to dozví hned, ne až za deset minut', async () => {
  const { n, zapis } = atrapa();
  await n.napojit('codex');
  zapis.procesy[0].naKonec(1, 'Error: login cancelled');
  const u = await waitFor(() => zapis.emit.find((x) => x.udalost === 'selhalo'));
  assert.equal(u.label, 'Codex');
  assert.equal(n.ceka('codex'), false);
});

test('když se přihlášení nepodaří spustit, řekne to a nečeká', async () => {
  const { n } = atrapa({ spusteni: () => ({ ok: false, error: 'Přihlášení se nepodařilo spustit: program nebyl nalezen' }) });
  const r = await n.napojit('claude-code');
  assert.equal(r.status, 422);
  assert.match(r.error, /nepodařilo spustit/);
  assert.doesNotMatch(r.error, /Terminál/);
  assert.equal(n.ceka('claude-code'), false);
});

test('„Prohlížeč se neotevřel?“ otevře odkaz z přihlášení; kód ze stránky jde procesu na vstup', async () => {
  const { n, zapis } = atrapa();
  assert.equal((await n.odkaz('claude-code')).status, 409, 'bez běžícího přihlášení není co otevřít');
  await n.napojit('claude-code');
  assert.equal((await n.odkaz('claude-code')).status, 409, 'odkaz se ještě neobjevil');
  zapis.procesy[0].url = 'https://claude.com/cai/oauth/authorize?code=true';
  const r = await n.odkaz('claude-code');
  assert.deepEqual(r, { ok: true, kod: true });
  assert.deepEqual(zapis.open, ['https://claude.com/cai/oauth/authorize?code=true']);
  assert.equal(n.kod('claude-code', 'kratky').status, 422);
  assert.equal(n.kod('claude-code', 'abc\nrm -rf ~').status, 422, 'jen jeden řádek');
  assert.deepEqual(n.kod('claude-code', '  abc123#def456  '), { ok: true });
  assert.deepEqual(zapis.kody, ['abc123#def456']);
  n.zrusit('claude-code');
  assert.equal(zapis.zastaveno, 1, 'zrušení ukončí proces přihlášení');
  assert.equal(n.kod('claude-code', 'abc123#def456').status, 409);
});

test('když přihlášení nedoběhne, hlídání skončí zprávou „vypršelo“; zrušení hlídání zastaví hned', async () => {
  const { n, zapis } = atrapa();
  await n.napojit('codex');
  await waitFor(() => zapis.emit.find((u) => u.udalost === 'vyprselo'), 3000);
  assert.equal(n.ceka('codex'), false);

  const druhy = atrapa();
  await druhy.n.napojit('claude-code');
  druhy.n.zrusit('claude-code');
  const volaniPoZruseni = druhy.zapis.run.length;
  await new Promise((res) => setTimeout(res, 40));
  assert.equal(druhy.zapis.run.length, volaniPoZruseni, 'po zrušení se nástroj už neptá');
});

test('webový chat se napojí přes rozšíření: otevře se služba a potvrdí ho první stav z ní', async () => {
  const { n, zapis } = atrapa();
  const bez = await n.napojit('web:chatgpt');
  assert.equal(bez.status, 409, 'bez rozšíření se jen poradí, co dělat');
  assert.equal(bez.rozsireni, true);
  zapis.rozsireni = { state: 'ready', sites: {} };
  const r = await n.napojit('web:chatgpt');
  assert.equal(r.ceka, true);
  assert.deepEqual(zapis.open, [WEBY.chatgpt.url]);
  n.webOzvalo('gemini');
  assert.equal(zapis.emit.length, 0, 'ozvala se jiná služba');
  n.webOzvalo('chatgpt');
  assert.deepEqual(zapis.emit[0], { id: 'web:chatgpt', label: 'ChatGPT', udalost: 'napojeno' });
  assert.equal((await n.napojit('web:neznamy')).status, 404);
});

test('přehled: nenainstalovaný nástroj, nevím, napojeno a webové chaty podle rozšíření', async () => {
  const { n, zapis } = atrapa({ prihlasen: { claude: true, codex: false } });
  zapis.rozsireni = { state: 'active', sites: { claude: Date.now() } };
  const p = Object.fromEntries((await n.prehled()).map((x) => [x.id, x]));
  assert.deepEqual({ napojeno: p['claude-code'].napojeno, plan: p['claude-code'].plan }, { napojeno: true, plan: 'Claude Max' });
  assert.equal(p.codex.napojeno, false);
  assert.equal(p['web:claude'].napojeno, true);
  assert.equal(p['web:chatgpt'].napojeno, null, 'rozšíření je, jen z ChatGPT zatím nic nepřišlo');
  const nic = createNapojeni({ bins: () => ({}), run: async () => ({}), prihlas: async () => ({ ok: true }), open: async () => ({ ok: true }) });
  const p2 = Object.fromEntries((await nic.prehled()).map((x) => [x.id, x]));
  assert.equal(p2['claude-code'].nainstalovano, false);
  assert.equal(p2['web:chatgpt'].nainstalovano, false);
});

test('HTTP: napojení jen z tohoto Macu, potvrzení přijde živým proudem i z rozšíření', async () => {
  const stav = { claude: false };
  const napojeniRun = async (bin) => (bin.endsWith('claude')
    ? { ok: true, stdout: JSON.stringify({ loggedIn: stav.claude }), stderr: '' }
    : { ok: false, stdout: '', stderr: 'Not logged in' });
  const srv = await startTestServer({}, { napojeniRun });
  const proud = await openStream(srv.url);
  try {
    const klient = api(srv.url);
    await srv.app.refreshLaunch();
    const prehled = await klient.get('/api/napojeni');
    assert.equal(prehled.status, 200);
    assert.equal(prehled.body.napojeni.find((x) => x.id === 'claude-code').napojeno, false);
    const zTelefonu = await fetch(`${srv.url}/api/napojeni`, { headers: { 'X-Forwarded-For': '100.64.0.9' } });
    assert.equal(zTelefonu.status, 403);

    const r = await klient.send('POST', '/api/napojeni/claude-code', {});
    assert.equal(r.status, 200);
    assert.equal(r.body.ceka, true);
    stav.claude = true;
    const u = await waitFor(() => proud.events.find((e) => e.event === 'napojeni' && e.data.id === 'claude-code'), 6000);
    assert.equal(u.data.udalost, 'napojeno');

    assert.equal((await klient.send('POST', '/api/napojeni/nic-takoveho', {})).status, 404);
    // Záložní cesta přihlášení: jen z tohoto Macu, kód se kontroluje dřív, než jde procesu.
    const odkazZTelefonu = await fetch(`${srv.url}/api/napojeni/claude-code/odkaz`, { method: 'POST', headers: { 'X-Forwarded-For': '100.64.0.9' } });
    assert.equal(odkazZTelefonu.status, 403);
    assert.equal((await klient.send('POST', '/api/napojeni/claude-code/kod', { kod: 'x' })).status, 422);
    assert.equal((await klient.send('POST', '/api/napojeni/claude-code/kod', { kod: 'abc123#def456' })).status, 409, 'přihlášení už doběhlo');
    const web = await klient.send('POST', '/api/napojeni/web:chatgpt', {});
    assert.equal(web.status, 409);
    assert.equal(web.body.rozsireni, true);

    // Se spárovaným rozšířením: první stav z ChatGPT napojení potvrdí.
    const par = await pairExtension(srv.url);
    assert.equal((await klient.send('POST', '/api/napojeni/web:chatgpt', {})).status, 200);
    const ingest = await klient.send('POST', '/api/ingest/web', { site: 'chatgpt', conversationId: 'abc-1', url: 'https://chatgpt.com/c/abc-1', generating: false, counts: { user: 1, assistant: 1 } }, { 'X-Agenteeq-Token': par.token, Origin: EXTENSION_ORIGIN });
    assert.equal(ingest.status, 200);
    const w = await waitFor(() => proud.events.find((e) => e.event === 'napojeni' && e.data.id === 'web:chatgpt'));
    assert.equal(w.data.label, 'ChatGPT');
  } finally {
    proud.close();
    await srv.close();
  }
});

// Na Macu zakladatele hlásilo Nastavení u Claude Code „Není nainstalovaný“, přestože Claude Code
// používal: aplikace z Finderu hledá programy přihlašovacím shellem, který nečte ~/.zshrc, a právě
// tam instalátor přidává ~/.local/bin. Nehledat ≠ nenajít ≠ není nainstalovaný.
test('přehled: „nehledalo se“ je nevím, „nenašlo se“ je nenalezen a u agenta je vidět poslední práce', async () => {
  const zaklad = { run: async () => ({}), prihlas: async () => ({ ok: true }), open: async () => ({ ok: true }) };
  const nehledalo = Object.fromEntries((await createNapojeni({ ...zaklad, bins: () => null }).prehled()).map((x) => [x.id, x]));
  assert.equal(nehledalo['claude-code'].nainstalovano, null);
  const napojit = await createNapojeni({ ...zaklad, bins: () => null }).napojit('claude-code');
  assert.equal(napojit.status, 422);
  assert.match(napojit.error, /Nepodařilo se zjistit/);
  const pred = Date.now() - 3600000;
  const s = createNapojeni({ ...zaklad, bins: () => ({}), posledni: (id) => (id === 'codex' ? pred : 0), oknoDni: 30 });
  const p = Object.fromEntries((await s.prehled()).map((x) => [x.id, x]));
  assert.equal(p['claude-code'].nainstalovano, false);
  assert.deepEqual([p['claude-code'].posledni, p['claude-code'].oknoDni], [0, 30]);
  assert.equal(p.codex.posledni, pred);
  assert.match((await s.napojit('claude-code')).error, /nepodařilo najít/);
});

test('program agenta se najde i mimo PATH přihlašovacího shellu (~/.local/bin, ~/.claude/local, nvm)', async () => {
  const fs = await import('node:fs/promises');
  const path = await import('node:path');
  const { tempDir } = await import('./helpers.mjs');
  const { detectLaunchEnv } = await import('../src/launcher.js');
  const { kandidatiProgramu } = await import('../src/platform.js');
  const home = await tempDir('agenteeq-bin-');
  const claude = path.join(home, '.local', 'bin', 'claude');
  await fs.mkdir(path.dirname(claude), { recursive: true });
  await fs.writeFile(claude, '#!/bin/sh\n', { mode: 0o755 });
  const gemini = path.join(home, '.nvm', 'versions', 'node', 'v22.1.0', 'bin', 'gemini');
  await fs.mkdir(path.dirname(gemini), { recursive: true });
  await fs.writeFile(gemini, '#!/bin/sh\n', { mode: 0o755 });
  const neSpustitelny = path.join(home, '.claude', 'local', 'qwen');
  await fs.mkdir(path.dirname(neSpustitelny), { recursive: true });
  await fs.writeFile(neSpustitelny, 'text', { mode: 0o644 });

  // Přihlašovací shell nenašel nic (přesně to se stalo na Macu z Finderu).
  const prazdnyShell = async () => ({ ok: true, stdout: '' });
  const ollama = { models: async () => ({ ok: false, models: [] }) };
  // Mimo domovskou složku (Homebrew, /usr/local) test nehledá – na počítači, kde běží, tam něco být může.
  const jenDomov = (name, h) => kandidatiProgramu(name, h).filter((p) => p.startsWith(h));
  const env = await detectLaunchEnv({ ollama, home, runImpl: prazdnyShell, kandidati: jenDomov });
  if (process.platform === 'win32') return;
  assert.equal(env.bins.claude, claude, 'Claude Code z vlastního instalátoru v ~/.local/bin');
  assert.equal(env.bins.gemini, gemini, 'program z nvm');
  assert.equal(env.bins.qwen, undefined, 'nespustitelný soubor není program');
  // Co našel shell, má přednost před odhadem.
  const zeShellu = await detectLaunchEnv({ ollama, home, runImpl: async () => ({ ok: true, stdout: 'claude=/opt/jinde/claude\n' }), kandidati: jenDomov });
  assert.equal(zeShellu.bins.claude, '/opt/jinde/claude');
  assert.ok(kandidatiProgramu('claude', home).includes(path.join(home, '.claude', 'local', 'claude')));
});
