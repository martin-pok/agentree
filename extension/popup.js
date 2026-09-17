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

async function render() {
  const { lastStatus } = await chrome.storage.local.get(['lastStatus']);
  await renderSites(lastStatus);
  $('feats').hidden = false;
  $('outdated').hidden = true;

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
    $('pairing').hidden = false;
    setHero({ tone: 'warn', pill: 'Nespárováno', headline: r?.revoked ? 'Spáruj rozšíření znovu' : 'Ještě jeden krok', sub: r?.revoked ? 'Předchozí spárování už neplatí.' : 'Spáruj rozšíření s Agenteeq a začne pracovat.' });
    return;
  }

  // Spárovaný uživatel ví, co rozšíření dělá – okno zůstane pod 600 px, které mu Chrome dovolí.
  $('pairing').hidden = true;
  $('feats').hidden = true;
  const version = chrome.runtime.getManifest().version;
  const expected = r.status?.expectedVersion;
  const outdated = expected && expected !== version;
  $('outdated').hidden = !outdated;
  if (outdated) $('outdated').textContent = `Agenteeq má novější rozšíření (${expected}). Otevři chrome://extensions a u Agenteeq klikni na šipku obnovení.`;
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
