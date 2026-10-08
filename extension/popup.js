// Okno rozšíření: kolik agentů právě pracuje, seznam otevřených konverzací (kliknutím se přepneš do
// karty), nastavení sledovaných služeb a ověření stránky. Text zpráv tu nikde není – okno ukazuje
// jen stav, časy a počty (viz content.js a background.js).
const SITES = [
  ['chatgpt', 'ChatGPT', 'openai'],
  ['codex-web', 'Codex na webu', 'codex'],
  ['claude', 'Claude.ai', 'claude'],
  ['gemini', 'Gemini', 'gemini'],
  ['mscopilot', 'Microsoft Copilot', 'copilot'],
  ['perplexity', 'Perplexity', 'perplexity'],
  ['grok', 'Grok', 'grok'],
  ['qwen', 'Qwen Chat', 'qwen'],
  ['github-copilot', 'GitHub Copilot', 'githubcopilot'],
];
// Loga, která jsou černá a v tmavém režimu se obracejí do světlé.
const MONO = new Set(['openai', 'grok', 'githubcopilot']);
// Adresa aplikace: výchozí port 4620, jiný se nastaví níž (Agenteeq běží na jiném portu?).
// Port mimo výchozí potřebuje volitelné oprávnění pro 127.0.0.1 (manifest, optional_host_permissions).
const VYCHOZI_PORT = 4620;
const platnyPort = (p) => Number.isInteger(p) && p >= 1024 && p <= 65535;
let APLIKACE = `http://127.0.0.1:${VYCHOZI_PORT}/`;
const WEB = 'https://agentree-fawn.vercel.app/';
// Background zapomene kartu, která přes 150 s mlčí (hlásí se nejpozději po minutě).
const OTEVRENA_MS = 150e3;
// Chrome ukáže okno rozšíření nejvýš 600 px vysoké.
const MAX_VYSKA = 600;

const $ = (id) => document.getElementById(id);
// Texty jsou česky a tr() je v angličtině přeloží (i18n.js); mnozne() volí tvar podle počtu.
const { tr, mnozne, jazyk, LOCALE, prelozStranku } = window.AgenteeqI18n;
// Česká sazba: jednopísmenná předložka nebo spojka (v, k, s, z, o, u, a, i) nezůstane na konci řádku.
const sazba = (text) => (jazyk() === 'cs' ? String(text).replace(/(?<=^|\s)([vkszouaiVKSZOUAI]) (?=\S)/g, '$1\u00a0') : String(text));
const sluzba = (id) => SITES.find(([s]) => s === id);
const nazevSluzby = (id) => tr((sluzba(id) || [id, id])[1]);
const el = (tag, trida, text) => {
  const e = document.createElement(tag);
  if (trida) e.className = trida;
  if (text !== undefined) e.textContent = text;
  return e;
};
const SIPKA = '<svg class="sipka" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>';

function ago(at) {
  const s = Math.max(0, Math.round((Date.now() - at) / 1000));
  if (s < 3600) return tr('před {0} min', Math.max(1, Math.round(s / 60)));
  if (s < 86400) return tr('před {0} h', Math.round(s / 3600));
  return new Date(at).toLocaleDateString(LOCALE);
}
// Jak dlouho agent odpovídá: 0:42, 3:05, 1:02:10.
function trvani(od) {
  const s = Math.max(0, Math.floor((Date.now() - od) / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

function logo(img, klic) {
  img.src = `logos/${klic}.svg`;
  img.alt = '';
  img.classList.toggle('logo--mono', MONO.has(klic));
}
function dlazdice(klic) {
  const t = el('span', 'tile');
  const img = el('img');
  img.width = 16;
  img.height = 16;
  if (klic) logo(img, klic);
  t.append(img);
  return t;
}

async function vypnute() {
  const { disabledSites = [] } = await chrome.storage.local.get(['disabledSites']);
  return disabledSites;
}

// ── Pohledy ─────────────────────────────────────────────────────────────────
// Hlavní pohled, nastavení služeb a ověření stránky. Podpohled má v liště tlačítko zpět.
let otevrel = null;
function ukaz(pohled) {
  if (pohled !== 'hlavni') otevrel = document.activeElement;
  document.body.dataset.pohled = pohled;
  $('view-hlavni').hidden = pohled !== 'hlavni';
  $('view-sluzby').hidden = pohled !== 'sluzby';
  $('view-overeni').hidden = pohled !== 'overeni';
  $('brand').hidden = pohled !== 'hlavni';
  $('back').hidden = pohled === 'hlavni';
  $('back-title').textContent = tr(pohled === 'sluzby' ? 'Sledované služby' : 'Ověření stránky');
  // Tlačítko nese název pohledu, čtečce ale musí říct, co udělá.
  $('back').setAttribute('aria-label', tr('Zpět'));
  $('sites-open').setAttribute('aria-expanded', String(pohled === 'sluzby'));
  clearInterval(overeni.casovac);
  if (pohled === 'overeni') {
    obnovOvereni();
    overeni.casovac = setInterval(obnovOvereni, 2000);
  }
  if (pohled === 'sluzby') {
    const seznam = $('sites');
    seznam.style.maxHeight = '';
    const navic = document.body.getBoundingClientRect().height - MAX_VYSKA;
    if (navic > 0) seznam.style.maxHeight = `${Math.max(144, Math.floor(seznam.getBoundingClientRect().height - navic))}px`;
  }
  if (pohled === 'hlavni') {
    vykresliSeznam();
    const zpet = otevrel?.id ? $(otevrel.id) : null;
    (zpet && !zpet.hidden ? zpet : $('sites-open')).focus({ preventScroll: true });
  } else $('back').focus({ preventScroll: true });
}
$('back').addEventListener('click', () => ukaz('hlavni'));
$('sites-open').addEventListener('click', () => ukaz('sluzby'));
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && document.body.dataset.pohled !== 'hlavni') { e.preventDefault(); ukaz('hlavni'); } });

// Horní část: stav spojení, a buď velké číslo s popisem, nebo jedna věta.
function setHero({ tone, pill, headline, sub, pocet = null }) {
  $('pill').dataset.tone = tone;
  $('pill-text').textContent = tr(pill);
  $('hero').classList.toggle('hero--cislo', pocet !== null);
  $('hero-num').hidden = pocet === null;
  $('hero-num').textContent = pocet === null ? '' : String(pocet);
  $('headline').textContent = sazba(headline);
  $('sub').textContent = sazba(sub);
  $('sub').hidden = !sub;
  delete $('sub').dataset.stav;
}

// ── Sledované služby ────────────────────────────────────────────────────────
async function renderSites(lastStatus) {
  const off = await vypnute();
  const box = $('sites');
  box.textContent = '';
  const loga = $('sites-logos');
  loga.textContent = '';
  $('sites-count').textContent = tr('{0} z {1}', SITES.length - off.length, SITES.length).replace(/ /g, '\u00a0');
  for (const [id, name, klic] of SITES) {
    const img = el('img');
    img.width = 14;
    img.height = 14;
    logo(img, klic);
    img.classList.toggle('vyp', off.includes(id));
    loga.append(img);

    const row = el('label', 'site');
    if (off.includes(id)) row.dataset.off = '';
    const nazev = el('span', 'name', tr(name));
    if (lastStatus?.ok && lastStatus.site === id) nazev.append(el('small', '', tr('naposledy {0}', ago(lastStatus.at))));
    const sw = el('span', 'switch');
    const input = el('input');
    input.type = 'checkbox';
    input.setAttribute('role', 'switch');
    input.checked = !off.includes(id);
    input.setAttribute('aria-label', tr('Sledovat {0}', tr(name)));
    input.addEventListener('change', async () => {
      const cur = await vypnute();
      const next = input.checked ? cur.filter((x) => x !== id) : [...new Set([...cur, id])];
      await chrome.storage.local.set({ disabledSites: next });
      if (input.checked) delete row.dataset.off;
      else row.dataset.off = '';
      img.classList.toggle('vyp', !input.checked);
      $('sites-count').textContent = tr('{0} z {1}', SITES.length - next.length, SITES.length).replace(/ /g, '\u00a0');
      // Vypnutá služba hned zmizí ze seznamu i z počtu nahoře.
      seznam.off = next;
      vykresliSeznam();
      hlavicka();
      if (overeni.diagnostika) vykresliOvereni(overeni.diagnostika);
    });
    sw.append(input, el('i'));
    row.append(dlazdice(klic), nazev, sw);
    box.append(row);
  }
}

// ── Ověření stránky ─────────────────────────────────────────────────────────
// Rozšíření se na stránce zeptá svého adaptéru, co našel (bez textu, jen ano/ne a počty). Ověření
// nechá uživatele potvrdit, jestli počty sedí, a uložit vzorek stránky – stavbu bez obsahu, podle
// které se adaptér opraví (test/fixtures/web/). Nic z toho se neposílá.
const overeni = { tab: null, diagnostika: null, potvrzeni: null, casovac: null };

async function aktivniKarta() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    return tab?.id ?? null;
  } catch {
    return null;
  }
}

async function zeptejSe(tab, type) {
  if (tab === null || !chrome.tabs?.sendMessage) return null;
  try {
    return (await chrome.tabs.sendMessage(tab, { type })) || null;
  } catch {
    return null; // na stránce neběží náš skript – není to podporovaná služba
  }
}

function vykresliOvereni(d) {
  const [, , klic] = sluzba(d.site) || [d.site, d.site, ''];
  $('check-site').textContent = nazevSluzby(d.site);
  if (klic) logo($('check-logo'), klic);
  const seznam = $('checks');
  const radky = window.AgenteeqSites.radkyOvereni(d);
  // Obnovuje se každé 2 s; beze změny se nepřekresluje, aby čtečka neopakovala totéž dokola.
  const podpis = JSON.stringify(radky);
  if (seznam.dataset.podpis === podpis) return;
  seznam.dataset.podpis = podpis;
  seznam.textContent = '';
  for (const [ton, text] of radky) {
    const li = el('li');
    li.dataset.tone = ton;
    li.append(el('i'), el('span', '', text));
    seznam.append(li);
  }
}

async function obnovOvereni() {
  const d = await zeptejSe(overeni.tab, 'agenteeq:diagnostika');
  if (!d) return;
  overeni.diagnostika = d;
  vykresliOvereni(d);
  vykresliSeznam();
}

function potvrd(hodnota) {
  overeni.potvrzeni = hodnota;
  $('check-yes').setAttribute('aria-pressed', String(hodnota === 'sedi'));
  $('check-no').setAttribute('aria-pressed', String(hodnota === 'nesedi'));
  const msg = $('check-msg');
  msg.dataset.tone = '';
  msg.textContent = sazba(tr(hodnota === 'sedi' ? 'Díky. Ulož vzorek – poslouží jako test, že to tak zůstane.' : 'Díky. Ulož vzorek, podle něj se rozpoznávání opraví.'));
}

$('check-yes').addEventListener('click', () => potvrd('sedi'));
$('check-no').addEventListener('click', () => potvrd('nesedi'));
$('check-save').addEventListener('click', async () => {
  const msg = $('check-msg');
  await obnovOvereni();
  const v = await zeptejSe(overeni.tab, 'agenteeq:vzorek');
  if (!v || !overeni.diagnostika) {
    msg.dataset.tone = 'err';
    msg.textContent = sazba(tr('Vzorek se nepodařilo získat. Obnov stránku a zkus to znovu.'));
    return;
  }
  const soubor = { ...v, porizeno: new Date().toISOString(), verzeRozsireni: chrome.runtime.getManifest().version, diagnostika: overeni.diagnostika, potvrzeni: overeni.potvrzeni };
  const odkaz = document.createElement('a');
  odkaz.href = URL.createObjectURL(new Blob([JSON.stringify(soubor)], { type: 'application/json' }));
  setTimeout(() => URL.revokeObjectURL(odkaz.href), 10000);
  odkaz.download = `agenteeq-vzorek-${v.site || 'stranka'}-${soubor.porizeno.slice(0, 10)}.json`;
  document.body.append(odkaz);
  odkaz.click();
  odkaz.remove();
  msg.dataset.tone = 'ok';
  msg.textContent = sazba(tr('Uloženo do Stažených souborů ({0} prvků{1}).', v.prvku, v.zkraceno ? tr(', zkráceno') : ''));
});

// ── Otevřené konverzace ─────────────────────────────────────────────────────
// Background si pamatuje, které konverzace se v poslední chvíli hlásily (storage.session): službu,
// kartu, jestli agent odpovídá, kdy začal a kdy skončil. Nic ze stránky.
const seznam = { konverzace: [], off: [], casovac: null, lastStatus: null, zastarala: false, pripojeno: false };

async function nactiKonverzace() {
  try {
    const { otevrene = {} } = (await chrome.storage.session?.get(['otevrene'])) || {};
    const ted = Date.now();
    return Object.values(otevrene).filter((k) => ted - k.at <= OTEVRENA_MS);
  } catch {
    return [];
  }
}

// Stav řádku jednou větou. Aktuální karta bere čerstvou diagnostiku ze stránky.
function stavRadku(k, d, off) {
  if (d && off.includes(d.site)) return ['', tr('sledování této služby je vypnuté')];
  const generuje = d ? d.generuje : k?.generating;
  const limit = d ? d.limit : k?.limit;
  if (generuje) return ['work', k?.od ? tr('odpovídá · {0}', trvani(k.od)) : tr('odpovídá'), k?.od];
  if (limit) return ['warn', tr('narazil na limit')];
  if (d && !d.zpravy?.user && !d.zpravy?.assistant) return ['', tr('zatím bez zpráv')];
  if (k?.konec) return ['', Date.now() - k.konec < 60e3 ? tr('právě dokončil') : tr('dokončil {0}', ago(k.konec))];
  return ['', tr('čeká na zadání')];
}

function radekStav(ton, text, od) {
  const st = el('span', 'st');
  if (ton) st.dataset.tone = ton;
  const popis = el('span', '', text);
  if (od) popis.dataset.od = String(od);
  st.append(el('i'), popis);
  return st;
}
// Každou sekundu se přepíše jen čas odpovědi – seznam zůstane, jak je, a zaostření neuteče.
function tikni() {
  for (const x of document.querySelectorAll('#konverzace [data-od]')) x.textContent = tr('odpovídá · {0}', trvani(Number(x.dataset.od)));
}

async function prepni(k) {
  try {
    await chrome.tabs.update(k.tab, { active: true });
    if (k.okno !== null && k.okno !== undefined) await chrome.windows?.update(k.okno, { focused: true });
    window.close();
  } catch {
    // Karta se mezitím zavřela – seznam se překreslí bez ní.
    const { otevrene = {} } = (await chrome.storage.session?.get(['otevrene'])) || {};
    for (const [klic, x] of Object.entries(otevrene)) if (x.tab === k.tab) delete otevrene[klic];
    await chrome.storage.session?.set({ otevrene });
    obnovSeznam();
  }
}

function vykresliSeznam() {
  const box = $('konverzace');
  if (box.hidden && !seznam.konverzace.length && !overeni.diagnostika) return;
  const d = overeni.diagnostika;
  const off = seznam.off;
  const tato = seznam.konverzace.find((k) => overeni.tab !== null && k.tab === overeni.tab) || null;
  const ostatni = seznam.konverzace
    .filter((k) => k !== tato && !off.includes(k.site))
    .sort((a, b) => (b.generating - a.generating) || (Boolean(b.limit) - Boolean(a.limit)) || (b.at - a.at));
  // Beze změny dat se nepřekresluje (jen čas), jinak by čtečka i zaostření začínaly znovu.
  const podpis = JSON.stringify([d && [d.site, d.generuje, d.limit, d.zpravy], tato && [tato.od, tato.konec], ostatni.map((k) => [k.site, k.tab, k.generating, k.limit, k.od, k.konec, Math.floor((Date.now() - (k.konec || 0)) / 60e3)]), off]);
  if (box.dataset.podpis === podpis) { tikni(); return; }
  box.dataset.podpis = podpis;
  box.textContent = '';
  let bezi = false;

  if (d) {
    const [, , klic] = sluzba(d.site) || [d.site, d.site, ''];
    const name = nazevSluzby(d.site);
    const li = el('li');
    const radek = el('div', 'radek radek--tato');
    const t = el('div', 't');
    const [ton, text, od] = stavRadku(tato, d, off);
    bezi ||= Boolean(od);
    t.append(el('b', '', name), radekStav(ton, text, od));
    const { user = 0, assistant = 0 } = d.zpravy || {};
    if (!off.includes(d.site) && (user || assistant)) {
      const pocty = el('div', 'pocty');
      for (const [n, a, b, c] of [[user, 'tvoje zpráva', 'tvoje zprávy', 'tvých zpráv'], [assistant, 'odpověď', 'odpovědi', 'odpovědí']]) {
        const bunka = el('div', '', String(n));
        bunka.append(el('small', '', mnozne(n, a, b, c)));
        pocty.append(bunka);
      }
      t.append(pocty);
    }
    const overit = el('button', 'overit', tr('Počty nesedí? Ověřit stránku'));
    overit.type = 'button';
    overit.id = 'check-open';
    overit.setAttribute('aria-controls', 'view-overeni');
    overit.addEventListener('click', () => ukaz('overeni'));
    t.append(overit);
    radek.append(dlazdice(klic), t, el('span', 'tag', tr('tato karta')));
    li.append(radek);
    box.append(li);
  }

  for (const k of ostatni) {
    const [, , klic] = sluzba(k.site) || [k.site, k.site, ''];
    const name = nazevSluzby(k.site);
    const [ton, text, od] = stavRadku(k, null, off);
    bezi ||= Boolean(od);
    const li = el('li');
    const radek = el('button', 'radek');
    radek.type = 'button';
    radek.setAttribute('aria-label', tr('Přepnout na kartu {0}, {1}', name, text));
    const t = el('div', 't');
    t.append(el('b', '', name), radekStav(ton, text, od));
    radek.append(dlazdice(klic), t);
    radek.insertAdjacentHTML('beforeend', SIPKA);
    if (typeof k.tab === 'number') radek.addEventListener('click', () => prepni(k));
    else radek.disabled = true;
    li.append(radek);
    box.append(li);
  }

  box.hidden = !box.children.length;
  $('web-nadpis').hidden = box.hidden || !prehled;
  // Čas odpovědi běží po sekundách, jen dokud nějaký agent odpovídá.
  clearInterval(seznam.casovac);
  if (bezi) seznam.casovac = setInterval(tikni, 1000);
  // Dlouhý seznam se posune uvnitř, okno zůstane do 600 px.
  box.style.maxHeight = '';
  const navic = document.body.getBoundingClientRect().height - MAX_VYSKA;
  if (navic > 0) box.style.maxHeight = `${Math.max(120, Math.floor(box.getBoundingClientRect().height - navic))}px`;
}

async function obnovSeznam() {
  seznam.konverzace = await nactiKonverzace();
  seznam.off = await vypnute();
  vykresliSeznam();
  return seznam.konverzace;
}

// ── Agenti na tomto počítači ────────────────────────────────────────────────
// Souhrn posílá aplikace (POST /api/extension/prehled) přes background se tokenem spárování.
// Okno ukáže, kdo čeká na tvé rozhodnutí a kdo pracuje; klik otevře agenta přímo v Agenteeq.
const ROBOT = '<svg viewBox="0 0 48 48" fill="none" aria-hidden="true"><path class="ant" d="M24 4.5V13" stroke-width="3.5" stroke-linecap="round"/><circle class="ant-svetlo" cx="24" cy="4.5" r="3.2"/><rect class="hlava" x="5" y="12" width="38" height="31" rx="12"/><rect class="oko" x="15" y="22" width="5" height="10" rx="2.5"/><rect class="oko" x="28" y="22" width="5" height="10" rx="2.5"/></svg>';
const TON_AGENTA = { working: 'work', needs_input: 'warn', failed: 'err', limited: 'err' };
const STAV_AGENTA = { working: tr('Pracuje'), needs_input: tr('Čeká na tebe'), failed: tr('Selhalo'), limited: tr('Narazil na limit') };
let prehled = null;

async function nactiPrehled() {
  const r = await chrome.runtime.sendMessage({ type: 'agenteeq:prehled' }).catch(() => null);
  return r && r.zdravi ? r : null;
}

function radekAgenta(a) {
  const odkaz = el('a', 'agent');
  odkaz.href = `${APLIKACE}#/agent/${encodeURIComponent(a.id)}`;
  odkaz.target = '_blank';
  odkaz.rel = 'noopener';
  odkaz.dataset.ton = TON_AGENTA[a.status || 'working'] || 'work';
  const bot = el('span', 'bot');
  bot.innerHTML = ROBOT;
  const t = el('span', 't');
  t.append(el('b', '', a.title || a.app || tr('Agent')));
  const st = el('span', 'st');
  const popis = [a.app, a.reason || STAV_AGENTA[a.status] || STAV_AGENTA.working].filter(Boolean).join(' · ');
  st.append(el('span', '', sazba(popis)));
  if (a.at) st.title = ago(a.at);
  t.append(st);
  odkaz.append(bot, t);
  odkaz.insertAdjacentHTML('beforeend', SIPKA);
  const li = el('li');
  li.append(odkaz);
  return li;
}

function vykresliAgenty() {
  const box = $('agenti');
  if (!prehled || !seznam.pripojeno) { box.hidden = true; return; }
  const { rozhodnuti, pracuji } = prehled;
  $('rozhodnuti').replaceChildren(...rozhodnuti.slice(0, 3).map(radekAgenta));
  $('pracuji').replaceChildren(...pracuji.slice(0, 3).map((a) => radekAgenta({ ...a, status: 'working' })));
  $('sk-rozhodnuti').hidden = !rozhodnuti.length;
  $('sk-pracuji').hidden = !pracuji.length;
  box.hidden = false;
  // Okno má nejvýš 600 px: když se nevejde, ubírají se nejdřív pracující, rozhodnutí zůstanou.
  for (const id of ['pracuji', 'rozhodnuti']) {
    const ol = $(id);
    while (ol.children.length > 1 && document.body.getBoundingClientRect().height > MAX_VYSKA) ol.lastElementChild.remove();
  }
}

// ── Celkový stav ────────────────────────────────────────────────────────────
function zakladniStav() {
  seznam.pripojeno = false;
  $('outdated').hidden = true;
  $('konverzace').hidden = true;
  $('agenti').hidden = true;
  $('web-nadpis').hidden = true;
  $('sites-open').hidden = true;
  $('pairing').hidden = true;
  $('feats').hidden = true;
  $('app-link').href = APLIKACE;
  $('app-link-text').textContent = tr('Otevřít Agenteeq');
}

// Viditelnost se přepíná až ve chvíli, kdy je nový stav známý – jinak by okno při každém
// načtení na okamžik prázdně bliklo.
async function render() {
  const { lastStatus, port } = await chrome.storage.local.get(['lastStatus', 'port']);
  const aktualniPort = platnyPort(port) ? port : VYCHOZI_PORT;
  APLIKACE = `http://127.0.0.1:${aktualniPort}/`;
  if (document.activeElement !== $('port')) $('port').value = String(aktualniPort);
  await renderSites(lastStatus);

  let health = null;
  try {
    const res = await fetch(`${APLIKACE}api/health`, { signal: AbortSignal.timeout(2000) });
    health = await res.json();
  } catch {
    health = null;
  }
  if (!health?.ok) {
    zakladniStav();
    $('feats').hidden = false;
    $('app-link').href = WEB;
    $('app-link-text').textContent = tr('Stáhnout Agenteeq');
    setHero({ tone: 'err', pill: 'Neběží', headline: tr('Agenteeq na tomto počítači neběží'), sub: tr('Spusť aplikaci, rozšíření se k ní připojí samo.') });
    return;
  }

  // Naše rozšíření se spáruje samo (background při „hello“). Kód je jen záloha pro jiné případy.
  const r = await chrome.runtime.sendMessage({ type: 'agenteeq:hello' }).catch(() => null);
  if (!r?.paired) {
    zakladniStav();
    $('pairing').hidden = false;
    setHero({
      tone: 'warn',
      pill: 'Nespárováno',
      headline: tr(r?.revoked ? 'Spáruj rozšíření znovu' : 'Spáruj rozšíření kódem'),
      sub: r?.revoked ? tr('Předchozí spárování už neplatí.') : '',
    });
    return;
  }

  const version = chrome.runtime.getManifest().version;
  const expected = r.status?.expectedVersion;
  const outdated = Boolean(expected && expected !== version);

  overeni.tab = await aktivniKarta();
  overeni.diagnostika = await zeptejSe(overeni.tab, 'agenteeq:diagnostika');
  [seznam.konverzace, seznam.off, prehled] = await Promise.all([nactiKonverzace(), vypnute(), nactiPrehled()]);
  zakladniStav();
  $('sites-open').hidden = false;
  $('outdated').hidden = !outdated;
  if (outdated) $('outdated').textContent = sazba(tr('Je k dispozici verze {0}. Chrome ji nainstaluje sám; hned ji získáš na stránce chrome://extensions tlačítkem Aktualizovat.', expected));
  seznam.lastStatus = lastStatus;
  seznam.zastarala = outdated;
  seznam.pripojeno = true;
  vykresliAgenty();
  vykresliSeznam();
  vykresliAgenty();
  hlavicka();
}

// Kolik agentů pracuje a kolik je otevřených konverzací (aktuální karta se počítá, i když se ještě
// nestihla ohlásit).
function hlavicka() {
  if (!seznam.pripojeno) return;
  const { lastStatus, zastarala: outdated, off } = seznam;
  const zive = seznam.konverzace.filter((k) => !off.includes(k.site));
  const d = overeni.diagnostika && !off.includes(overeni.diagnostika.site) ? overeni.diagnostika : null;
  const tataVSeznamu = zive.some((k) => overeni.tab !== null && k.tab === overeni.tab);
  const pocet = zive.length + (d && !tataVSeznamu && (d.zpravy?.user || d.zpravy?.assistant || d.generuje) ? 1 : 0);
  const pracuje = zive.filter((k) => (k.tab === overeni.tab && d ? d.generuje : k.generating)).length + (d && !tataVSeznamu && d.generuje ? 1 : 0);
  const failed = Boolean(lastStatus && !lastStatus.ok);
  const tone = outdated || failed ? 'warn' : 'ok';
  const selhalo = tr('Poslední hlášení se do Agenteeq nedostalo. Rozšíření to zkusí znovu samo.');
  if (!pocet && !prehled) {
    setHero({ tone, pill: 'Připojeno', headline: tr('Žádná otevřená konverzace'), sub: failed ? selhalo : tr('Otevři chat s AI a objeví se tady i v Agenteeq.') });
    return;
  }
  // Číslo nahoře sčítá agenty na počítači i chaty v prohlížeči, které právě odpovídají.
  const vsech = pracuje + (prehled?.zdravi.pracuje || 0);
  const popis = vsech === 0 ? tr('agentů teď pracuje') : mnozne(vsech, 'agent právě pracuje', 'agenti právě pracují', 'agentů právě pracuje');
  // Pod číslem stav agentů z aplikace; bez něj počet otevřených chatů v prohlížeči.
  const sub = failed ? selhalo : prehled ? prehled.zdravi.veta : `${pocet} ${mnozne(pocet, 'otevřená konverzace', 'otevřené konverzace', 'otevřených konverzací')}`;
  setHero({ tone, pill: 'Připojeno', headline: popis, sub, pocet: vsech });
  if (prehled && !failed) $('sub').dataset.stav = prehled.zdravi.stav;
}

// Konverzace se mění, i když je okno otevřené: agent dopíše, karta se zavře.
chrome.storage.onChanged?.addListener(async (zmeny, oblast) => {
  if (oblast !== 'session' || !zmeny.otevrene || !seznam.pripojeno) return;
  await obnovSeznam();
  hlavicka();
});

// Stav agentů se mění i při otevřeném okně: každých 5 s se souhrn načte znovu.
setInterval(async () => {
  if (!seznam.pripojeno || document.hidden) return;
  prehled = await nactiPrehled();
  vykresliAgenty();
  hlavicka();
}, 5000);

$('retry').addEventListener('click', () => render());

// Agenteeq běží na jiném portu (PORT): rozšíření si ho uloží. Jiný než výchozí port
// potřebuje oprávnění pro 127.0.0.1 na libovolném portu – Chrome se zeptá jednou, v tomhle kliknutí.
$('port-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const zprava = $('port-msg');
  const novy = Number($('port').value.trim());
  zprava.removeAttribute('data-tone');
  if (!platnyPort(novy)) { zprava.dataset.tone = 'err'; zprava.textContent = tr('Port je číslo od 1024 do 65535.'); return; }
  if (novy !== VYCHOZI_PORT) {
    let povoleno = false;
    try { povoleno = await chrome.permissions.request({ origins: ['http://127.0.0.1/*'] }); } catch { povoleno = false; }
    if (!povoleno) { zprava.dataset.tone = 'err'; zprava.textContent = tr('Bez povolení se rozšíření k jinému portu nepřipojí.'); return; }
  }
  await chrome.storage.local.set({ port: novy });
  await chrome.storage.local.remove(['token', 'parovani']);
  zprava.dataset.tone = 'ok';
  zprava.textContent = tr('Uloženo. Hledám Agenteeq na portu {0}…', novy);
  render();
});
$('refresh-popup').addEventListener('click', async () => {
  const button = $('refresh-popup');
  if (button.disabled) return;
  button.disabled = true;
  try {
    // Vynutit nové hlášení i pro nezměněnou konverzaci. Odpověď čeká až na uložení
    // a odeslání přes background worker; následné render() čte tentýž aktuální stav.
    const matches = chrome.runtime.getManifest().content_scripts?.flatMap((script) => script.matches || []) || [];
    const tabs = matches.length ? await chrome.tabs.query({ url: matches }).catch(() => []) : [];
    await Promise.allSettled(tabs.map((tab) => chrome.tabs.sendMessage(tab.id, { type: 'agenteeq:refresh' })));
    await render();
  } catch {
    // Selhání jedné stránky ani dočasně nedostupná aplikace nesmí rozbít okno rozšíření.
    await render().catch(() => {});
  } finally {
    button.disabled = false;
  }
});

$('pair-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const code = $('code').value.trim();
  const msg = $('pair-msg');
  if (!/^[A-Za-z0-9_-]{16}$/.test(code)) {
    $('code').setAttribute('aria-invalid', 'true');
    msg.dataset.tone = 'err';
    msg.textContent = sazba(tr('Kód má 16 znaků – zkopíruj ho z Agenteeq celý.'));
    return;
  }
  $('code').removeAttribute('aria-invalid');
  $('pair').disabled = true;
  const result = await chrome.runtime.sendMessage({ type: 'agenteeq:pair', code }).catch(() => null);
  $('pair').disabled = false;
  if (!result?.ok) {
    msg.dataset.tone = 'err';
    // Chybu hlásí aplikace česky; v angličtině okno řekne totéž obecně.
    msg.textContent = sazba(jazyk() === 'cs' && result?.error ? result.error : tr('Spárování se nepovedlo. Vytvoř v Agenteeq nový kód.'));
    return;
  }
  $('code').value = '';
  msg.dataset.tone = 'ok';
  msg.textContent = sazba(tr('Spárováno.'));
  render();
});

prelozStranku();
render();
