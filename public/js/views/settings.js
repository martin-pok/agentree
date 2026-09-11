import { state } from '../state.js';
import { api } from '../api.js';
import { esc, rel } from '../format.js';
import { glyph, ICON } from '../icons.js';
import { fill, switchRow, stateBadge, toast, modal, confirmDialog } from '../ui.js';

const v = { el: null };
const STATE_LABEL = { connected: 'Připojeno', idle: 'Bez dat', missing: 'Nenalezeno', error: 'Chyba', unavailable: 'Nedostupné' };
const FEATURE_LABEL = { launchBackground: 'Spouštění agentů na pozadí', localChat: 'Lokální chat s modely v Ollamě', projectsUnlimited: 'Neomezený počet projektů', projectExport: 'Export projektů do CSV' };
const DONE_OPTIONS =[[0, 'každé'], [60, 'delší než 1 minuta'], [120, 'delší než 2 minuty'], [300, 'delší než 5 minut'], [900, 'delší než 15 minut']];
const CLOUD = [
  ['openai-admin', 'OpenAI Admin API', 'openai', 'sk-admin-…', 'Náklady organizace za API (ne předplatné ChatGPT).'],
  ['anthropic-admin', 'Anthropic Admin API', 'anthropic', 'sk-ant-admin01-…', 'Náklady organizace za API (ne předplatné Claude).'],
];

function mount(el) {
  v.el = el;
  el.innerHTML = `
    <div class="settings">
      <section class="card set-card" data-enter style="--i:1" data-region="hooks" aria-label="Okamžité události Claude Code"></section>
      <section class="card set-card" data-enter style="--i:2" data-region="extension" aria-label="Webové AI aplikace"></section>
      <section class="card set-card" data-enter style="--i:3" data-region="notifications" aria-label="Upozornění"></section>
      <section class="card set-card" data-enter style="--i:4" data-region="cloud" aria-label="Cloudová API"></section>
      <section class="card set-card" data-enter style="--i:5" data-region="license" aria-label="Licence"></section>
      <section class="card set-card" data-enter style="--i:5" data-region="share" aria-label="Instalace pro další uživatele"></section>
      <section class="card set-card set-card--wide" data-enter style="--i:5" aria-labelledby="conn-h">
        <div class="set-card-head"><span class="icon-tile">${ICON.plug}</span><div><h2 id="conn-h">Konektory</h2><p class="set-desc">Odkud Agentree bere data. „Ověřeno“ znamená otestováno na skutečných datech, „Beta“ podle dokumentovaného formátu.</p></div>
          <button class="btn btn--sm" type="button" data-action="rescan">${ICON.refresh}Znovu načíst</button></div>
        <div class="conn-grid" data-region="connectors"></div>
      </section>
      <section class="card set-card set-card--wide" data-enter style="--i:6" data-region="system" aria-label="Spouštění a data"></section>
    </div>`;

  el.addEventListener('click', async (e) => {
    const sw = e.target.closest('[data-setting]');
    if (sw) return toggleSetting(sw);
    const a = e.target.closest('[data-action]');
    if (!a) return;
    try {
      if (a.dataset.action === 'hooks-install') await installHooks();
      else if (a.dataset.action === 'hooks-uninstall') {
        if (await confirmDialog({ title: 'Vypnout okamžité události', message: 'Agentree odebere své hooky z ~/.claude/settings.json. Tvoje ostatní nastavení zůstane beze změny.', confirmLabel: 'Vypnout' })) {
          state.integrations.claudeHooks = (await api.hooks('uninstall')).claudeHooks;
          toast('Okamžité události vypnuty');
          update();
        }
      } else if (a.dataset.action === 'test-alert') {
        await api.testAlert();
      } else if (a.dataset.action === 'rescan') {
        a.disabled = true;
        state.connectors = (await api.rescan()).connectors;
        toast('Konektory znovu načteny');
        update();
        a.disabled = false;
      } else if (a.dataset.action === 'license-remove') {
        if (await confirmDialog({ title: 'Odebrat licenci', message: 'Licenční klíč se z tohoto Macu odebere. Znovu ho můžeš kdykoli vložit.', confirmLabel: 'Odebrat licenci', danger: true })) {
          state.license = (await api.removeLicense()).license;
          toast('Licence odebrána');
          update();
        }
      } else if (a.dataset.action === 'autostart-install') {
        const ok = await modal({
          title: 'Spouštět Agentree po přihlášení',
          submitLabel: 'Zapnout',
          body: `<p class="modal-text">Agentree přidá do <code>~/Library/LaunchAgents</code> soubor <code>cz.agentree.agent.plist</code>. macOS pak Agentree spustí po každém přihlášení a po pádu ho restartuje — upozornění chodí, i když dashboard nemáš otevřený.</p>
            <ul class="checklist"><li>Kdykoli vypneš jedním kliknutím tady.</li><li>Když už Agentree běží (třeba z Terminálu), druhá instance se v klidu ukončí.</li></ul>`,
        });
        if (ok) {
          const r = await api.autostart('install');
          state.integrations = r.integrations;
          toast(r.dry ? 'Zkušební režim: automatické spouštění se nezapnulo' : 'Agentree se bude spouštět po přihlášení');
          update();
        }
      } else if (a.dataset.action === 'autostart-uninstall') {
        if (await confirmDialog({ title: 'Vypnout automatické spouštění', message: 'Agentree se přestane spouštět po přihlášení. Pokud právě běží z LaunchAgentu, ukončí se a dashboard bude nedostupný, dokud ho znovu nespustíš.', confirmLabel: 'Vypnout' })) {
          const r = await api.autostart('uninstall');
          state.integrations = r.integrations;
          toast('Automatické spouštění vypnuto');
          update();
        }
      } else if (a.dataset.action === 'secret-remove') {
        if (await confirmDialog({ title: 'Odebrat klíč', message: 'Klíč se smaže z Klíčenky a automatické načítání nákladů se zastaví.', confirmLabel: 'Odebrat klíč', danger: true })) {
          state.integrations = (await api.removeSecret(a.dataset.id)).integrations;
          toast('Klíč odebrán');
          update();
        }
      }
    } catch (err) {
      a.disabled = false;
      toast(err.message, { tone: 'coral' });
    }
  });

  el.addEventListener('change', async (e) => {
    if (!e.target.matches('[data-done-min]')) return;
    try {
      state.settings = (await api.saveSettings({ notifications: { doneMinSeconds: Number(e.target.value) } })).settings;
      toast('Nastavení uloženo');
    } catch (err) {
      toast(err.message, { tone: 'coral' });
    }
  });

  el.addEventListener('submit', async (e) => {
    const lic = e.target.closest('[data-license-form]');
    if (lic) {
      e.preventDefault();
      const btn = lic.querySelector('button[type="submit"]');
      const input = lic.elements.key;
      btn.disabled = true;
      input.removeAttribute('aria-invalid');
      lic.querySelector('.field-error')?.remove();
      try {
        state.license = (await api.activateLicense(input.value)).license;
        toast(`Licence ${state.license.planLabel} aktivována. Děkujeme!`);
        update();
      } catch (err) {
        input.setAttribute('aria-invalid', 'true');
        input.insertAdjacentHTML('afterend', `<span class="field-error" role="alert">${esc(err.message)}</span>`);
        btn.disabled = false;
      }
      return;
    }
    const form = e.target.closest('[data-secret-form]');
    if (!form) return;
    e.preventDefault();
    const btn = form.querySelector('button[type="submit"]');
    btn.disabled = true;
    try {
      state.integrations = (await api.setSecret(form.dataset.secretForm, form.elements.value.value)).integrations;
      form.reset();
      toast('Klíč uložen do Klíčenky');
      update();
    } catch (err) {
      toast(err.message, { tone: 'coral' });
    } finally {
      btn.disabled = false;
    }
  });
}

async function toggleSetting(sw) {
  const key = sw.dataset.setting;
  const next = sw.getAttribute('aria-checked') !== 'true';
  if (key === 'browser' && next) {
    if (!('Notification' in window)) { toast('Tento prohlížeč notifikace nepodporuje.', { tone: 'coral' }); return; }
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') { toast('Prohlížeč notifikace nepovolil. Povol je v nastavení webu.', { tone: 'coral' }); return; }
  }
  sw.setAttribute('aria-checked', String(next));
  try {
    state.settings = (await api.saveSettings({ notifications: { [key]: next } })).settings;
    toast('Nastavení uloženo');
  } catch (err) {
    sw.setAttribute('aria-checked', String(!next));
    toast(err.message, { tone: 'coral' });
  }
}

async function installHooks() {
  const h = state.integrations?.claudeHooks;
  const ok = await modal({
    title: 'Zapnout okamžité události',
    submitLabel: 'Zapnout',
    body: `<p class="modal-text">Agentree přidá do <code>~/.claude/settings.json</code> hooky pro události <b>SessionStart, UserPromptSubmit, Notification, Stop a SessionEnd</b>. Každý hook jen pošle krátkou zprávu na tento Mac (127.0.0.1) a nikdy nezablokuje Claude Code.</p>
      <ul class="checklist"><li>Původní soubor se uloží jako záloha vedle něj.</li><li>Tvoje ostatní nastavení a hooky zůstanou beze změny.</li><li>Projeví se v nově spuštěných sessions.</li></ul>${h?.path ? `<p class="small muted">${esc(h.path)}</p>` : ''}`,
  });
  if (!ok) return;
  state.integrations.claudeHooks = (await api.hooks('install')).claudeHooks;
  toast('Okamžité události zapnuty. Platí pro nové sessions Claude Code.');
  update();
}

function update() {
  const el = v.el;
  const i = state.integrations;
  const n = state.settings?.notifications;
  if (!el || !i || !n) return;

  const h = i.claudeHooks;
  const hookState = h.error ? ['error', 'Chyba'] : h.installed && h.current ? ['connected', 'Zapnuto'] : h.installed || h.partial ? ['missing', 'Potřebuje obnovit'] : ['idle', 'Vypnuto'];
  fill(el, 'hooks', `
    <div class="set-card-head"><span class="icon-tile">${glyph('anthropic')}</span><div><h2>Okamžité události Claude Code</h2>
      <p class="set-desc">Žádost o povolení, start a konec tahu uvidíš v řádu milisekund. Bez hooků Agentree pozná stav z přepisu; žádost o povolení nástroje se v přepisu neobjeví.</p></div>
      ${stateBadge(...hookState)}</div>
    ${h.error ? `<p class="form-error">${esc(h.error)}</p>` : ''}
    <div class="set-actions">${h.installed && h.current
      ? '<button class="btn" type="button" data-action="hooks-uninstall">Vypnout</button>'
      : `<button class="btn btn--primary" type="button" data-action="hooks-install">${h.installed || h.partial ? 'Obnovit hooky' : 'Zapnout okamžité události'}</button>`}</div>`);

  const web = state.connectors.find((c) => c.id === 'web');
  const sites = i.extension?.sites || {};
  fill(el, 'extension', `
    <div class="set-card-head"><span class="icon-tile">${ICON.spark}</span><div><h2>Webové AI aplikace <span class="badge">Beta</span></h2>
      <p class="set-desc">ChatGPT, Claude.ai, Gemini, Microsoft Copilot, Perplexity, Grok, Qwen Chat a GitHub Copilot sleduje rozšíření pro Chrome. Data posílá jen do Agentree na tomto Macu.</p></div>
      ${stateBadge(web?.state || 'missing', web?.state === 'connected' ? 'Aktivní' : web?.state === 'idle' ? 'Bez nových dat' : 'Nenainstalováno')}</div>
    <ol class="steps">
      <li>Otevři <code>chrome://extensions</code> a zapni <b>Režim pro vývojáře</b>.</li>
      <li>Klikni na <b>Načíst rozbalené</b> a vyber složku:
        <div class="code-line"><code>${esc(i.extension.path)}</code><button class="btn btn--sm btn--on-dark" type="button" data-copy="${esc(i.extension.path)}">${ICON.copy}Kopírovat</button></div></li>
      <li>Otevři některou z aplikací níže. Rozšíření se s Agentree spáruje samo.</li>
    </ol>
    <details class="details"><summary>Ruční spárování</summary><p class="set-desc">Když se rozšíření nespáruje samo, vlož tento klíč do jeho okna.</p>
      <div class="code-line"><code class="secret">••••••••••••${esc(i.extension.token.slice(-6))}</code><button class="btn btn--sm btn--on-dark" type="button" data-copy="${esc(i.extension.token)}" data-copy-message="Klíč pro rozšíření zkopírován">${ICON.copy}Kopírovat klíč</button></div></details>
    <div class="site-grid">${Object.entries(sites).map(([k, s]) => {
      const at = web?.sites?.[k];
      return `<div class="site">${glyph({ connector: 'web', app: s.name, provider: s.provider })}<span>${esc(s.name)}</span><small>${at ? `data <span data-ago="${at}">${rel(at)}</span>` : 'zatím bez dat'}</small></div>`;
    }).join('')}</div>`);

  fill(el, 'notifications', `
    <div class="set-card-head"><span class="icon-tile">${ICON.bell}</span><div><h2>Upozornění</h2><p class="set-desc">Kdy a jak tě má Agentree upozornit.</p></div>
      <button class="btn btn--sm" type="button" data-action="test-alert">Vyzkoušet</button></div>
    ${switchRow({ key: 'native', label: 'Notifikace macOS', desc: i.nativeNotify ? 'Přijdou i se zavřeným prohlížečem, dokud Agentree běží.' : 'Na tomto systému nejsou dostupné.', checked: n.native && i.nativeNotify, disabled: !i.nativeNotify })}
    ${switchRow({ key: 'browser', label: 'Notifikace prohlížeče', desc: 'Když je dashboard otevřený na pozadí.', checked: n.browser })}
    <div class="set-divider"></div>
    ${switchRow({ key: 'needsInput', label: 'Agent potřebuje rozhodnutí', desc: 'Povolení nástroje, otázka nebo schválení plánu.', checked: n.needsInput })}
    ${switchRow({ key: 'limits', label: 'Limity předplatného', desc: 'Při 80 %, 95 % a vyčerpání limitu.', checked: n.limits })}
    ${switchRow({ key: 'budget', label: 'Rozpočet', desc: 'Při 80 % a 100 % měsíčního rozpočtu.', checked: n.budget })}
    ${switchRow({ key: 'done', label: 'Dokončená úloha', desc: 'Když agent dokončí tah.', checked: n.done })}
    <label class="field field--row"><span>Hlásit dokončené úlohy</span>
      <select data-done-min${n.done ? '' : ' disabled'}>${DONE_OPTIONS.map(([s, l]) => `<option value="${s}"${n.doneMinSeconds === s ? ' selected' : ''}>${l}</option>`).join('')}</select></label>`);

  fill(el, 'cloud', `
    <div class="set-card-head"><span class="icon-tile">${ICON.key}</span><div><h2>Náklady z API <span class="badge">Beta</span></h2>
      <p class="set-desc">Admin klíče doplní útratu za API automaticky do grafů a rozpočtů. ${i.keychain ? 'Klíč se uloží do Klíčenky macOS a prohlížeč ho znovu neuvidí.' : 'Klíčenka není dostupná — použij proměnné prostředí.'}</p></div></div>
    ${CLOUD.map(([id, label, provider, placeholder, desc]) => {
      const c = i.cloud?.[id] || { state: 'missing' };
      return `<div class="key-row">
        <div class="key-head">${glyph(provider)}<strong>${esc(label)}</strong>${stateBadge(c.state, c.state === 'missing' ? 'Nepřipojeno' : STATE_LABEL[c.state] || c.state)}</div>
        <p class="set-desc">${esc(c.state === 'error' ? c.detail : desc)}</p>
        ${c.source === 'env'
          ? '<p class="small muted">Klíč je nastavený proměnnou prostředí.</p>'
          : `<form class="key-form" data-secret-form="${id}"><label class="sr-only" for="key-${id}">${esc(label)}</label><input id="key-${id}" name="value" type="password" autocomplete="off" spellcheck="false" placeholder="${esc(placeholder)}"${i.keychain ? '' : ' disabled'}>
            <button class="btn btn--sm" type="submit"${i.keychain ? '' : ' disabled'}>Uložit</button>${c.state !== 'missing' ? `<button class="btn btn--sm" type="button" data-action="secret-remove" data-id="${id}">Odebrat</button>` : ''}</form>`}
      </div>`;
    }).join('')}`);

  fill(el, 'connectors', state.connectors.map((c) => `
    <article class="conn">
      <div class="conn-head">${glyph(c)}<h3>${esc(c.name)}</h3>${stateBadge(c.state, STATE_LABEL[c.state] || c.state)}</div>
      <p>${esc(c.detail || c.description)}</p>
      <div class="conn-foot"><code>${esc(c.source)}</code><span class="badge${c.verified ? ' badge--ok' : ''}">${c.verified ? 'Ověřeno' : 'Beta'}</span></div>
      ${c.lastEventAt ? `<span class="small muted">Poslední data <span data-ago="${c.lastEventAt}">${rel(c.lastEventAt)}</span></span>` : ''}
    </article>`).join(''));

  const lic = state.license;
  if (lic) {
    const locked = Object.entries(lic.paidFeatures || {});
    const expires = lic.license?.expiresAt ? new Date(lic.license.expiresAt).toLocaleDateString('cs-CZ') : 'bez omezení';
    fill(el, 'license', `
      <div class="set-card-head"><span class="icon-tile">${ICON.key}</span><div><h2>Licence</h2>
        <p class="set-desc">${lic.valid ? `Agentree ${esc(lic.planLabel)} pro ${esc(lic.license.name)}.` : locked.length ? 'Verze Zdarma. Licence Pro odemkne placené funkce.' : 'Všechny funkce jsou teď odemčené. Licenční klíč si schovej pro budoucí verze.'}</p></div>
        ${stateBadge(lic.valid ? 'connected' : lic.expired ? 'missing' : 'idle', lic.valid ? lic.planLabel : lic.expired ? 'Vypršela' : 'Zdarma')}</div>
      ${lic.valid ? `<dl class="facts">
          <div><dt>Držitel</dt><dd>${esc(lic.license.name)}</dd></div>
          <div><dt>E-mail</dt><dd>${esc(lic.license.email)}</dd></div>
          <div><dt>Počet míst</dt><dd>${lic.license.seats}</dd></div>
          <div><dt>Platnost</dt><dd>${esc(expires)}</dd></div>
          <div class="wide"><dt>Klíč</dt><dd class="mono-sm">${esc(lic.maskedKey)}</dd></div>
        </dl>
        <div class="set-actions"><button class="btn btn--sm" type="button" data-action="license-remove">Odebrat licenci</button></div>`
      : `${lic.hasKey && lic.reason ? `<p class="form-error form-error--inline">${esc(lic.reason)}</p>` : ''}
        ${locked.length ? `<ul class="checklist checklist--locked">${locked.map(([k, plan]) => `<li>${esc(FEATURE_LABEL[k] || k)} <span class="badge">${esc(lic.plans?.[plan]?.label || plan)}</span></li>`).join('')}</ul>` : ''}
        <form class="key-form key-form--stack" data-license-form novalidate>
          <label class="sr-only" for="license-key">Licenční klíč</label>
          <input id="license-key" name="key" type="text" autocomplete="off" spellcheck="false" placeholder="AGT1.…">
          <button class="btn btn--sm btn--primary" type="submit">Aktivovat</button>
        </form>`}`);
  }

  const inst = i.install || {};
  const packCmd = 'npm run pack';
  const installCmd = `npm install -g ./agentree-${state.version}.tgz`;
  fill(el, 'share', `
    <div class="set-card-head"><span class="icon-tile">${ICON.external}</span><div><h2>Instalace pro další uživatele</h2>
      <p class="set-desc">Každý si Agentree nainstaluje na svůj Mac a napojí vlastní agenty a předplatná. Data nikam neodcházejí a nejsou svázaná s tvým účtem.</p></div></div>
    <ol class="steps">
      <li>Ve složce Agentree vytvoř instalační balíček:<div class="code-line"><code>${esc(packCmd)}</code><button class="btn btn--sm btn--on-dark" type="button" data-copy="${esc(packCmd)}">${ICON.copy}Kopírovat</button></div></li>
      <li>Pošli soubor <code>dist/agentree-${esc(state.version)}.tgz</code>. Příjemce potřebuje Node.js 22.13 nebo novější a spustí:<div class="code-line"><code>${esc(installCmd)}</code><button class="btn btn--sm btn--on-dark" type="button" data-copy="${esc(installCmd)}">${ICON.copy}Kopírovat</button></div></li>
      <li>Dashboard otevře příkazem <code>agentree --open</code>. Průvodce v Přehledu ho provede napojením.</li>
    </ol>
    <p class="small muted">Podrobný návod pro zákazníky: <code>docs/INSTALL.md</code>${inst.root ? ` · tato instalace: <code>${esc(inst.root)}</code>` : ''}</p>`);

  const auto = i.autostart || { supported: false };
  const cmd = auto.command || '';
  fill(el, 'system', `
    <div class="set-card-head"><span class="icon-tile">${ICON.terminal}</span><div><h2>Spouštění a data</h2>
      <p class="set-desc">Aby upozornění chodila vždy, nech Agentree spouštět automaticky po přihlášení. Při pádu se sám restartuje.</p></div>
      ${auto.supported ? stateBadge(auto.installed ? 'connected' : 'idle', auto.installed ? 'Spouští se po přihlášení' : 'Ručně') : stateBadge('unavailable', 'Jen macOS')}</div>
    ${auto.supported ? `<div class="set-actions">${auto.installed
      ? '<button class="btn" type="button" data-action="autostart-uninstall">Vypnout automatické spouštění</button>'
      : '<button class="btn btn--primary" type="button" data-action="autostart-install">Spouštět po přihlášení</button>'}</div>
    <details class="details"><summary>Příkaz pro Terminál</summary><div class="code-line"><code>${esc(cmd)}</code><button class="btn btn--sm btn--on-dark" type="button" data-copy="${esc(cmd)}" data-copy-message="Příkaz zkopírován — vlož ho do Terminálu">${ICON.copy}Kopírovat</button></div></details>` : ''}
    <dl class="facts facts--row">
      <div><dt>Verze</dt><dd>${esc(state.version)}</dd></div>
      <div><dt>Data aplikace</dt><dd>${esc((inst.dataDir || '~/.agentree').replace(/^\/Users\/[^/]+/, '~'))}/data.json</dd></div>
      <div><dt>Okno sledování</dt><dd>${state.windowDays} dní</dd></div>
      <div><dt>Soukromí</dt><dd>vše zůstává na tomto Macu</dd></div>
    </dl>`);
}

export default { id: 'nastaveni', title: 'Nastavení', mount, update, unmount: () => { v.el = null; } };
