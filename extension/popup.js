const SITES = [
  ['chatgpt', 'ChatGPT', '#10A37F'],
  ['codex-web', 'Codex na webu', '#10A37F'],
  ['claude', 'Claude.ai', '#D97757'],
  ['gemini', 'Gemini', '#4E86F5'],
  ['mscopilot', 'Microsoft Copilot', '#0E8EE9'],
  ['perplexity', 'Perplexity', '#20808D'],
  ['grok', 'Grok', '#6B6772'],
  ['qwen', 'Qwen Chat', '#615CED'],
  ['github-copilot', 'GitHub Copilot', '#6B6772'],
];

const $ = (id) => document.getElementById(id);

function ago(at) {
  const s = Math.max(0, Math.round((Date.now() - at) / 1000));
  if (s < 60) return 'právě teď';
  if (s < 3600) return `před ${Math.round(s / 60)} min`;
  if (s < 86400) return `před ${Math.round(s / 3600)} h`;
  return new Date(at).toLocaleDateString('cs-CZ');
}

function setHero({ tone, pill, headline, sub }) {
  $('pill').dataset.tone = tone;
  $('pill-text').textContent = pill;
  $('headline').textContent = headline;
  $('sub').textContent = sub;
}

async function renderSites(lastStatus) {
  const { disabledSites = [] } = await chrome.storage.local.get(['disabledSites']);
  const box = $('sites');
  box.textContent = '';
  for (const [id, name, color] of SITES) {
    const row = document.createElement('label');
    row.className = 'site';
    const dot = document.createElement('i');
    dot.className = 'dot';
    dot.style.background = color;
    const label = document.createElement('span');
    label.className = 'name';
    label.textContent = name;
    row.append(dot, label);
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
    });
    sw.append(input, document.createElement('i'));
    row.append(sw);
    box.append(row);
  }
}

// ── Ověření aktuální stránky ────────────────────────────────────────────────
// Rozšíření se na stránce zeptá svého adaptéru, co našel (bez textu, jen ano/ne a počty), a
// uživatel potvrdí, jestli počty sedí. Vzorek stránky je stavba bez obsahu – slouží k opravě
// adaptéru a jako test (test/fixtures/web/). Nic z toho se neposílá, soubor si uloží uživatel.
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

const nazevSluzby = (id) => SITES.find(([s]) => s === id)?.[1] || id;

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
  vykresliOvereni(d);
}

function rozbalOvereni(otevrit) {
  $('check-open').setAttribute('aria-expanded', String(otevrit));
  $('check-body').hidden = !otevrit;
  // Rozbalené ověření by se se seznamem služeb nevešlo do 600 px okna.
  $('sites-card').hidden = otevrit;
  clearInterval(overeni.casovac);
  if (otevrit) {
    obnovOvereni();
    overeni.casovac = setInterval(obnovOvereni, 2000);
  }
}

async function nabidniOvereni() {
  overeni.tab = await aktivniKarta();
  const d = await zeptejSe(overeni.tab, 'agenteeq:diagnostika');
  $('check-card').hidden = !d;
  if (!d) return;
  overeni.diagnostika = d;
  $('check-site').textContent = nazevSluzby(d.site);
  vykresliOvereni(d);
}

function potvrd(hodnota) {
  overeni.potvrzeni = hodnota;
  $('check-yes').setAttribute('aria-pressed', String(hodnota === 'sedi'));
  $('check-no').setAttribute('aria-pressed', String(hodnota === 'nesedi'));
  const msg = $('check-msg');
  msg.dataset.tone = '';
  msg.textContent = hodnota === 'sedi' ? 'Díky. Ulož vzorek – poslouží jako test, že to tak zůstane.' : 'Díky. Ulož vzorek a pošli ho, podle něj se adaptér opraví.';
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
    msg.textContent = 'Vzorek se nepodařilo získat. Obnov stránku a zkus to znovu.';
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
  msg.textContent = `Uloženo do Stažených souborů (${v.prvku} prvků${v.zkraceno ? ', zkráceno' : ''}).`;
});

async function render() {
  const { lastStatus } = await chrome.storage.local.get(['lastStatus']);
  await renderSites(lastStatus);
  $('feats').hidden = false;
  $('outdated').hidden = true;
  // Přepínat sledované služby má smysl, až rozšíření něco posílá – dřív okno jen natahovaly.
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
    setHero({ tone: 'err', pill: 'Neběží', headline: 'Agenteeq na Macu neběží', sub: 'Spusť aplikaci Agenteeq. Rozšíření se k ní připojí samo.' });
    return;
  }

  const r = await chrome.runtime.sendMessage({ type: 'agenteeq:hello' }).catch(() => null);
  if (!r?.paired) {
    // Při párování je na řadě jediná věc: vložit kód. Výčet funkcí okno jen natahoval nad 600 px,
    // které Chrome zobrazí – zůstává proto pro stav, kdy aplikace neběží a dělat nejde nic jiného.
    $('pairing').hidden = false;
    $('feats').hidden = true;
    setHero({ tone: 'warn', pill: 'Nespárováno', headline: r?.revoked ? 'Spáruj rozšíření znovu' : 'Ještě jeden krok', sub: r?.revoked ? 'Předchozí spárování už neplatí.' : 'Spáruj rozšíření s Agenteeq a začne pracovat.' });
    return;
  }

  // Spárovaný uživatel ví, co rozšíření dělá – okno zůstane pod 600 px, které mu Chrome dovolí.
  $('pairing').hidden = true;
  $('feats').hidden = true;
  $('sites-card').hidden = false;
  nabidniOvereni();
  const version = chrome.runtime.getManifest().version;
  const expected = r.status?.expectedVersion;
  const outdated = expected && expected !== version;
  $('outdated').hidden = !outdated;
  if (outdated) $('outdated').textContent = `Nová verze rozšíření (${expected}). Otevři chrome://extensions a obnov Agenteeq.`;
  const sent = lastStatus?.ok ? `Naposledy odesláno ${ago(lastStatus.at)}.` : 'Otevři konverzaci v některé ze služeb níž.';
  const failed = lastStatus && !lastStatus.ok ? `Poslední odeslání selhalo: ${lastStatus.error || lastStatus.code}.` : '';
  setHero({ tone: outdated || failed ? 'warn' : 'ok', pill: `Připojeno · ${version}`, headline: 'Rozšíření pracuje', sub: failed || sent });
}

$('pair-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const code = $('code').value.trim();
  const msg = $('pair-msg');
  if (!/^[A-Za-z0-9_-]{16}$/.test(code)) {
    $('code').setAttribute('aria-invalid', 'true');
    msg.dataset.tone = 'err';
    msg.textContent = 'Kód má 16 znaků – zkopíruj ho z Agenteeq celý.';
    return;
  }
  $('code').removeAttribute('aria-invalid');
  $('pair').disabled = true;
  const result = await chrome.runtime.sendMessage({ type: 'agenteeq:pair', code }).catch(() => null);
  $('pair').disabled = false;
  if (!result?.ok) {
    msg.dataset.tone = 'err';
    msg.textContent = result?.error || 'Spárování selhalo.';
    return;
  }
  $('code').value = '';
  msg.dataset.tone = 'ok';
  msg.textContent = 'Spárováno.';
  render();
});

render();
