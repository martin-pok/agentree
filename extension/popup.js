// Okno rozšíření: stav spojení s Agenteeq, co rozšíření vidí na aktuální stránce a které služby
// sleduje. Text zpráv tu nikde není – okno ukazuje jen stav a počty (viz content.js).
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

const $ = (id) => document.getElementById(id);
// Česká sazba: jednopísmenná předložka nebo spojka (v, k, s, z, o, u, a, i) nezůstane na konci řádku.
const sazba = (text) => String(text).replace(/(?<=^|\s)([vkszouaiVKSZOUAI]) (?=\S)/g, '$1\u00a0');
const sluzba = (id) => SITES.find(([s]) => s === id);

// Český tvar podle počtu: 1 zpráva, 2–4 zprávy, 0 a 5+ zpráv.
const tvar = (n, jedna, dve, pet) => (n === 1 ? jedna : n >= 2 && n <= 4 ? dve : pet);

function ago(at) {
  const s = Math.max(0, Math.round((Date.now() - at) / 1000));
  if (s < 60) return 'teď';
  if (s < 3600) return `před ${Math.round(s / 60)} min`;
  if (s < 86400) return `před ${Math.round(s / 3600)} h`;
  return new Date(at).toLocaleDateString('cs-CZ');
}

function logo(img, klic) {
  img.src = `logos/${klic}.svg`;
  img.classList.toggle('logo--mono', MONO.has(klic));
}

// Pás nahoře: stav spojení, nadpis (volitelně s velkým číslem) a jedna věta pod ním.
function setHero({ tone, pill, headline, sub, pocet = null }) {
  $('pill').dataset.tone = tone;
  $('pill-text').textContent = pill;
  const h = $('headline');
  h.textContent = '';
  if (pocet !== null) {
    const num = document.createElement('span');
    num.className = 'num';
    num.textContent = String(pocet);
    const popis = document.createElement('span');
    popis.className = 'num-label';
    popis.textContent = sazba(headline);
    h.append(num, popis);
  } else {
    h.textContent = sazba(headline);
  }
  $('sub').textContent = sazba(sub);
}

// ── Sledované služby ────────────────────────────────────────────────────────
async function renderSites(lastStatus) {
  const { disabledSites = [] } = await chrome.storage.local.get(['disabledSites']);
  const box = $('sites');
  box.textContent = '';
  const zapnute = SITES.filter(([id]) => !disabledSites.includes(id)).length;
  $('sites-count').textContent = `${zapnute}\u00a0z\u00a0${SITES.length}`;
  for (const [id, name, klic] of SITES) {
    const row = document.createElement('label');
    row.className = 'site';
    if (disabledSites.includes(id)) row.dataset.off = '';
    const img = document.createElement('img');
    img.alt = '';
    img.width = 18;
    img.height = 18;
    logo(img, klic);
    const label = document.createElement('span');
    label.className = 'name';
    label.textContent = name;
    row.append(img, label);
    if (lastStatus?.ok && lastStatus.site === id) {
      const seen = document.createElement('span');
      seen.className = 'seen';
      seen.textContent = ago(lastStatus.at);
      row.append(seen);
    }
    const sw = document.createElement('span');
    sw.className = 'switch';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = !disabledSites.includes(id);
    input.setAttribute('aria-label', `Sledovat ${name}`);
    input.addEventListener('change', async () => {
      const cur = (await chrome.storage.local.get(['disabledSites'])).disabledSites || [];
      const next = input.checked ? cur.filter((x) => x !== id) : [...new Set([...cur, id])];
      await chrome.storage.local.set({ disabledSites: next });
      if (input.checked) delete row.dataset.off;
      else row.dataset.off = '';
      $('sites-count').textContent = `${SITES.length - next.length}\u00a0z\u00a0${SITES.length}`;
      if (overeni.diagnostika) vykresliKartu(overeni.diagnostika);
    });
    sw.append(input, document.createElement('i'));
    row.append(sw);
    box.append(row);
  }
}

// Chrome ukáže okno rozšíření nejvýš 600 px vysoké. Rozbalený seznam proto na chvíli schová kartu
// stránky a vezme si jen místo, které zbývá – zbytek služeb se posune uvnitř seznamu.
const MAX_VYSKA = 600;
function rozbalSluzby(otevrit) {
  $('sites-open').setAttribute('aria-expanded', String(otevrit));
  const seznam = $('sites');
  seznam.hidden = !otevrit;
  document.body.classList.toggle('sluzby-rozbalene', otevrit);
  if (!otevrit) return;
  rozbalOvereni(false);
  seznam.style.maxHeight = '';
  const navic = document.body.getBoundingClientRect().height - MAX_VYSKA;
  if (navic > 0) seznam.style.maxHeight = `${Math.max(132, Math.floor(seznam.getBoundingClientRect().height - navic))}px`;
}
$('sites-open').addEventListener('click', () => rozbalSluzby($('sites-open').getAttribute('aria-expanded') !== 'true'));

// ── Tato stránka ────────────────────────────────────────────────────────────
// Rozšíření se na stránce zeptá svého adaptéru, co našel (bez textu, jen ano/ne a počty). Ověření
// pod „Počty nesedí?“ nechá uživatele potvrdit, jestli počty sedí, a uložit vzorek stránky – stavbu
// bez obsahu, podle které se adaptér opraví (test/fixtures/web/). Nic z toho se neposílá.
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
  if (tab === null) return null;
  try {
    return (await chrome.tabs.sendMessage(tab, { type })) || null;
  } catch {
    return null; // na stránce neběží náš skript – není to podporovaná služba
  }
}

async function vykresliKartu(d) {
  const [, name, klic] = sluzba(d.site) || [d.site, d.site, ''];
  $('check-site').textContent = name;
  if (klic) logo($('tab-logo'), klic);
  const { disabledSites = [] } = await chrome.storage.local.get(['disabledSites']);
  const stav = $('tab-state');
  const { user = 0, assistant = 0 } = d.zpravy || {};
  if (disabledSites.includes(d.site)) {
    stav.dataset.tone = '';
    stav.textContent = 'Sledování této služby je vypnuté';
  } else if (d.generuje) {
    stav.dataset.tone = 'work';
    stav.textContent = 'Agent právě odpovídá';
  } else if (d.limit) {
    stav.dataset.tone = 'warn';
    stav.textContent = 'Služba hlásí vyčerpaný limit';
  } else if (!user && !assistant) {
    stav.dataset.tone = '';
    stav.textContent = 'Zatím bez zpráv';
  } else {
    stav.dataset.tone = '';
    stav.textContent = `${user} ${tvar(user, 'tvoje zpráva', 'tvoje zprávy', 'tvých zpráv')} · ${assistant} ${tvar(assistant, 'odpověď', 'odpovědi', 'odpovědí')}`;
  }
}

function vykresliOvereni(d) {
  const seznam = $('checks');
  const radky = window.AgenteeqSites.radkyOvereni(d);
  // Obnovuje se každé 2 s; beze změny se nepřekresluje, aby čtečka neopakovala totéž dokola.
  const podpis = JSON.stringify(radky);
  if (seznam.dataset.podpis === podpis) return;
  seznam.dataset.podpis = podpis;
  seznam.textContent = '';
  for (const [ton, text] of radky) {
    const li = document.createElement('li');
    li.dataset.tone = ton;
    const span = document.createElement('span');
    span.textContent = text;
    li.append(document.createElement('i'), span);
    seznam.append(li);
  }
}

async function obnovOvereni() {
  const d = await zeptejSe(overeni.tab, 'agenteeq:diagnostika');
  if (!d) return;
  overeni.diagnostika = d;
  vykresliKartu(d);
  vykresliOvereni(d);
}

function rozbalOvereni(otevrit) {
  $('check-open').setAttribute('aria-expanded', String(otevrit));
  $('check-body').hidden = !otevrit;
  // Rozbalené ověření by se se seznamem služeb nevešlo do 600 px okna.
  document.body.classList.toggle('overeni-rozbalene', otevrit);
  clearInterval(overeni.casovac);
  if (otevrit) {
    rozbalSluzby(false);
    obnovOvereni();
    overeni.casovac = setInterval(obnovOvereni, 2000);
  }
}

async function nabidniKartu() {
  overeni.tab = await aktivniKarta();
  const d = await zeptejSe(overeni.tab, 'agenteeq:diagnostika');
  $('check-card').hidden = !d;
  $('tab-other').hidden = Boolean(d);
  if (!d) return;
  overeni.diagnostika = d;
  vykresliKartu(d);
  vykresliOvereni(d);
}

function potvrd(hodnota) {
  overeni.potvrzeni = hodnota;
  $('check-yes').setAttribute('aria-pressed', String(hodnota === 'sedi'));
  $('check-no').setAttribute('aria-pressed', String(hodnota === 'nesedi'));
  const msg = $('check-msg');
  msg.dataset.tone = '';
  msg.textContent = sazba(hodnota === 'sedi' ? 'Díky. Ulož vzorek – poslouží jako test, že to tak zůstane.' : 'Díky. Ulož vzorek, podle něj se rozpoznávání opraví.');
}

$('check-open').addEventListener('click', () => rozbalOvereni($('check-open').getAttribute('aria-expanded') !== 'true'));
$('check-yes').addEventListener('click', () => potvrd('sedi'));
$('check-no').addEventListener('click', () => potvrd('nesedi'));
$('check-save').addEventListener('click', async () => {
  const msg = $('check-msg');
  await obnovOvereni();
  const v = await zeptejSe(overeni.tab, 'agenteeq:vzorek');
  if (!v || !overeni.diagnostika) {
    msg.dataset.tone = 'err';
    msg.textContent = sazba('Vzorek se nepodařilo získat. Obnov stránku a zkus to znovu.');
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
  msg.textContent = sazba(`Uloženo do Stažených souborů (${v.prvku} prvků${v.zkraceno ? ', zkráceno' : ''}).`);
});

// ── Otevřené konverzace (pás nahoře) ────────────────────────────────────────
// Background si pamatuje, které konverzace se v poslední chvíli hlásily (storage.session).
async function otevreneKonverzace() {
  try {
    const { otevrene = {} } = (await chrome.storage.session?.get(['otevrene'])) || {};
    const ted = Date.now();
    const zive = Object.values(otevrene).filter((k) => ted - k.at <= 150e3);
    return { pocet: zive.length, pracuje: zive.filter((k) => k.generating).length };
  } catch {
    return null;
  }
}

// ── Celkový stav ────────────────────────────────────────────────────────────
async function render() {
  const { lastStatus } = await chrome.storage.local.get(['lastStatus']);
  await renderSites(lastStatus);
  $('outdated').hidden = true;
  $('check-card').hidden = true;
  $('tab-other').hidden = true;
  $('sites-card').hidden = true;

  let health = null;
  try {
    const res = await fetch('http://127.0.0.1:4620/api/health', { signal: AbortSignal.timeout(2000) });
    health = await res.json();
  } catch {
    health = null;
  }
  if (!health?.ok) {
    $('pairing').hidden = true;
    $('feats').hidden = false;
    setHero({ tone: 'err', pill: 'Neběží', headline: 'Agenteeq neběží', sub: 'Otevři aplikaci Agenteeq na tomto počítači. Rozšíření se k ní připojí samo.' });
    return;
  }
  $('feats').hidden = true;

  // Naše rozšíření se spáruje samo (background při „hello“). Kód je jen záloha pro jiné případy.
  const r = await chrome.runtime.sendMessage({ type: 'agenteeq:hello' }).catch(() => null);
  if (!r?.paired) {
    $('pairing').hidden = false;
    setHero({
      tone: 'warn',
      pill: 'Nespárováno',
      headline: r?.revoked ? 'Spáruj rozšíření znovu' : 'Spáruj rozšíření kódem',
      sub: r?.revoked ? 'Předchozí spárování už neplatí. Stačí nový jednorázový kód.' : 'Tohle rozšíření se s Agenteeq nespárovalo samo. Stačí jednorázový kód.',
    });
    return;
  }

  $('pairing').hidden = true;
  $('sites-card').hidden = false;
  nabidniKartu();
  const version = chrome.runtime.getManifest().version;
  const expected = r.status?.expectedVersion;
  const outdated = Boolean(expected && expected !== version);
  $('outdated').hidden = !outdated;
  if (outdated) $('outdated').textContent = sazba(`Je k dispozici verze ${expected}. Chrome ji nainstaluje sám; hned ji získáš na stránce chrome://extensions tlačítkem Aktualizovat.`);

  const failed = lastStatus && !lastStatus.ok;
  const k = await otevreneKonverzace();
  const pocet = k ? k.pocet : 0;
  let sub;
  if (failed) sub = 'Poslední hlášení se do Agenteeq nedostalo. Rozšíření to zkusí znovu samo.';
  else if (!pocet) sub = 'Jakmile otevřeš chat s AI, objeví se tady i v Agenteeq.';
  else if (k.pracuje) sub = `${k.pracuje} ${tvar(k.pracuje, 'agent právě pracuje', 'agenti právě pracují', 'agentů právě pracuje')}`;
  else sub = 'Žádný agent teď nepracuje';
  setHero({ tone: outdated || failed ? 'warn' : 'ok', pill: 'Připojeno', headline: `${tvar(pocet, 'konverzace', 'konverzace', 'konverzací')} v prohlížeči`, sub, pocet });
}

$('retry').addEventListener('click', () => render());

$('pair-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const code = $('code').value.trim();
  const msg = $('pair-msg');
  if (!/^[A-Za-z0-9_-]{16}$/.test(code)) {
    $('code').setAttribute('aria-invalid', 'true');
    msg.dataset.tone = 'err';
    msg.textContent = sazba('Kód má 16 znaků – zkopíruj ho z Agenteeq celý.');
    return;
  }
  $('code').removeAttribute('aria-invalid');
  $('pair').disabled = true;
  const result = await chrome.runtime.sendMessage({ type: 'agenteeq:pair', code }).catch(() => null);
  $('pair').disabled = false;
  if (!result?.ok) {
    msg.dataset.tone = 'err';
    msg.textContent = sazba(result?.error || 'Spárování se nepovedlo. Vytvoř v Agenteeq nový kód.');
    return;
  }
  $('code').value = '';
  msg.dataset.tone = 'ok';
  msg.textContent = sazba('Spárováno.');
  render();
});

render();
