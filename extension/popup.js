const SITES = [
  ['chatgpt', 'ChatGPT'],
  ['claude', 'Claude.ai'],
  ['gemini', 'Gemini'],
  ['mscopilot', 'Microsoft Copilot'],
  ['perplexity', 'Perplexity'],
  ['grok', 'Grok'],
  ['qwen', 'Qwen Chat'],
  ['github-copilot', 'GitHub Copilot'],
];

const $ = (id) => document.getElementById(id);

async function render() {
  const { disabledSites = [], lastStatus } = await chrome.storage.local.get(['disabledSites', 'lastStatus']);
  $('sites').innerHTML = '';
  for (const [id, name] of SITES) {
    const label = document.createElement('label');
    label.className = 'site';
    label.textContent = name;
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = !disabledSites.includes(id);
    input.setAttribute('aria-label', `Sledovat ${name}`);
    input.addEventListener('change', async () => {
      const cur = (await chrome.storage.local.get(['disabledSites'])).disabledSites || [];
      const next = input.checked ? cur.filter((x) => x !== id) : [...new Set([...cur, id])];
      await chrome.storage.local.set({ disabledSites: next });
    });
    label.appendChild(input);
    $('sites').appendChild(label);
  }
  if (lastStatus) {
    const when = new Date(lastStatus.at).toLocaleTimeString('cs-CZ');
    $('last').textContent = lastStatus.ok ? `Naposledy odesláno v ${when} (${lastStatus.site}).` : `Odeslání selhalo v ${when}: ${lastStatus.error || lastStatus.code}.`;
  }
}

async function checkServer() {
  try {
    const res = await fetch('http://127.0.0.1:4620/api/health', { signal: AbortSignal.timeout(2000) });
    const json = await res.json();
    $('status').textContent = `Připojeno · ${json.version}`;
    $('dot').className = 'dot ok';
  } catch {
    $('status').textContent = 'Dirigent neběží';
    $('dot').className = 'dot err';
  }
}

$('save').addEventListener('click', async () => {
  const value = $('token').value.trim();
  if (!/^[a-f0-9]{32,}$/.test(value)) {
    $('last').textContent = 'Klíč nemá správný tvar.';
    return;
  }
  await chrome.runtime.sendMessage({ type: 'dirigent:set-token', token: value });
  $('token').value = '';
  $('last').textContent = 'Klíč uložen.';
});

render();
checkServer();
