import { state } from '../state.js';
import { api } from '../api.js';
import { esc, rel, initials } from '../format.js';
import { AVATAR_COUNT, avatarSvg, hasAvatar, setAvatar } from '../avatars.js';
import { glyph, ICON } from '../icons.js';
import { fill, switchRow, stateBadge, toast, modal, confirmDialog } from '../ui.js';

const v = { el: null, observer: null };
const STATE_LABEL = { connected: 'Připojeno', idle: 'Bez nových dat', missing: 'Nenalezeno', error: 'Chyba', unavailable: 'Nedostupné' };
const FEATURE_LABEL = { launchBackground: 'Spouštění agentů na pozadí', localChat: 'Chat s lokálními modely v Ollamě', projectsUnlimited: 'Neomezený počet projektů', projectExport: 'Export projektů do CSV' };
const DONE_OPTIONS = [[0, 'každou'], [60, 'delší než 1 minuta'], [120, 'delší než 2 minuty'], [300, 'delší než 5 minut'], [900, 'delší než 15 minut']];
const CLOUD = [
  ['openai-admin', 'OpenAI', 'openai', 'sk-admin-…', 'Náklady organizace za API OpenAI. Nezahrnuje předplatné ChatGPT.'],
  ['anthropic-admin', 'Anthropic', 'anthropic', 'sk-ant-admin01-…', 'Náklady organizace za API Anthropic. Nezahrnuje předplatné Claude.'],
];

// Skupiny nastavení: pořadí odpovídá tomu, jak často je člověk potřebuje.
const GROUPS = [
  ['set-propojeni', 'Propojení', ['claude', 'extension', 'connectors']],
  ['set-upozorneni', 'Upozornění', ['notifications']],
  ['set-ucet', 'Profil a licence', ['profile', 'license']],
  ['set-naklady', 'Náklady za API', ['cloud']],
  ['set-aplikace', 'Aplikace na tomto Macu', ['system', 'share']],
];

function mount(el) {
  v.el = el;
  el.innerHTML = `
    <div class="settings2">
      <nav class="set-nav" aria-label="Sekce nastavení">
        ${GROUPS.map(([id, label], i) => `<button type="button" data-jump="${id}"${i === 0 ? ' aria-current="true"' : ''}>${label}</button>`).join('')}
      </nav>
      <div class="set-main">
        ${GROUPS.map(([id, label, regions], gi) => `<section class="set-group" id="${id}" aria-labelledby="${id}-h" data-enter style="--i:${gi + 1}">
          <h2 class="set-group-title" id="${id}-h">${label}</h2>
          ${regions.map((r) => `<section class="card set-card" data-region="${r}"></section>`).join('')}
        </section>`).join('')}
      </div>
    </div>`;

  const nav = el.querySelector('.set-nav');
  const setCurrent = (id) => {
    for (const b of nav.querySelectorAll('[data-jump]')) b.toggleAttribute('aria-current', b.dataset.jump === id);
    if (b(id)) nav.querySelector(`[data-jump="${id}"]`)?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  };
  const b = (id) => Boolean(nav.querySelector(`[data-jump="${id}"]`));
  if ('IntersectionObserver' in window) {
    v.observer = new IntersectionObserver((entries) => {
      const visible = entries.filter((e) => e.isIntersecting).sort((x, y) => x.boundingClientRect.top - y.boundingClientRect.top)[0];
      if (visible) setCurrent(visible.target.id);
    }, { rootMargin: '-15% 0px -70% 0px' });
    for (const g of el.querySelectorAll('.set-group')) v.observer.observe(g);
  }

  el.addEventListener('click', async (e) => {
    const jump = e.target.closest('[data-jump]');
    if (jump) {
      const target = document.getElementById(jump.dataset.jump);
      target?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
      setCurrent(jump.dataset.jump);
      return;
    }
    const pick = e.target.closest('[data-avatar-pick]');
    if (pick) {
      setAvatar(pick.dataset.avatarPick === 'i' ? null : Number(pick.dataset.avatarPick));
      return;
    }
    const sw = e.target.closest('[data-setting]');
    if (sw) return toggleSetting(sw);
    const a = e.target.closest('[data-action]');
    if (!a) return;
    try {
      if (a.dataset.action === 'claude-connect') await connectClaude();
      else if (a.dataset.action === 'claude-disconnect') {
        if (await confirmDialog({ title: 'Vypnout propojení s Claude Code', message: 'Agentree odebere své příkazy a informační řádek z nastavení Claude Code. Tvoje ostatní nastavení zůstane beze změny.', confirmLabel: 'Vypnout propojení' })) {
          state.integrations.claudeHooks = (await api.hooks('uninstall')).claudeHooks;
          toast('Propojení s Claude Code je vypnuté');
          update();
        }
      } else if (a.dataset.action === 'test-alert') {
        await api.testAlert();
      } else if (a.dataset.action === 'rescan') {
        a.disabled = true;
        state.connectors = (await api.rescan()).connectors;
        toast('Zdroje dat jsou načtené znovu');
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
          body: `<p class="modal-text">macOS pak Agentree spustí po každém přihlášení, a když nečekaně spadne, znovu ho zapne. Upozornění tak chodí, i když aplikaci nemáš otevřenou.</p>
            <ul class="checklist"><li>Vypneš to kdykoli jedním kliknutím tady.</li><li>Když už Agentree běží (třeba spuštěný ručně), druhá kopie se sama v klidu ukončí.</li></ul>
            <p class="small muted">Technicky: soubor ~/Library/LaunchAgents/cz.agentree.agent.plist</p>`,
        });
        if (ok) {
          const r = await api.autostart('install');
          state.integrations = r.integrations;
          toast(r.dry ? 'Zkušební režim: spouštění po přihlášení se nezapnulo' : 'Agentree se bude spouštět po přihlášení');
          update();
        }
      } else if (a.dataset.action === 'autostart-uninstall') {
        if (await confirmDialog({ title: 'Vypnout spouštění po přihlášení', message: 'Agentree se přestane spouštět po přihlášení. Pokud právě běží tímto způsobem, ukončí se a bude nedostupný, dokud ho znovu nespustíš.', confirmLabel: 'Vypnout' })) {
          const r = await api.autostart('uninstall');
          state.integrations = r.integrations;
          toast('Spouštění po přihlášení je vypnuté');
          update();
        }
      } else if (a.dataset.action === 'secret-remove') {
        if (await confirmDialog({ title: 'Odebrat klíč', message: 'Klíč se smaže z Klíčenky a načítání nákladů se zastaví.', confirmLabel: 'Odebrat klíč', danger: true })) {
          state.integrations = (await api.removeSecret(a.dataset.id)).integrations;
          toast('Klíč odebrán');
          update();
        }
      }
    } catch (err) {
      a.disabled = false;
      toast(err.message, { tone: 'velvet' });
    }
  });

  el.addEventListener('change', async (e) => {
    if (!e.target.matches('[data-done-min]')) return;
    try {
      state.settings = (await api.saveSettings({ notifications: { doneMinSeconds: Number(e.target.value) } })).settings;
      toast('Uloženo');
    } catch (err) {
      toast(err.message, { tone: 'velvet' });
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
        toast(`Licence ${state.license.planLabel} je aktivní. Děkujeme!`);
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
      toast('Klíč je uložený v Klíčence');
      update();
    } catch (err) {
      toast(err.message, { tone: 'velvet' });
    } finally {
      btn.disabled = false;
    }
  });
}

async function toggleSetting(sw) {
  const key = sw.dataset.setting;
  const next = sw.getAttribute('aria-checked') !== 'true';
  if (key === 'browser' && next) {
    if (!('Notification' in window)) { toast('Tento prohlížeč oznámení nepodporuje.', { tone: 'velvet' }); return; }
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') { toast('Prohlížeč oznámení nepovolil. Povol je v nastavení webu.', { tone: 'velvet' }); return; }
  }
  sw.setAttribute('aria-checked', String(next));
  try {
    state.settings = (await api.saveSettings({ notifications: { [key]: next } })).settings;
    toast('Uloženo');
  } catch (err) {
    sw.setAttribute('aria-checked', String(!next));
    toast(err.message, { tone: 'velvet' });
  }
}

async function connectClaude() {
  const h = state.integrations?.claudeHooks;
  const ok = await modal({
    title: 'Zapnout propojení s Claude Code',
    submitLabel: 'Zapnout propojení',
    body: `<p class="modal-text">Agentree zapíše do nastavení Claude Code dvě věci: krátké příkazy, které mu dají vědět o každé změně (začátek práce, dokončení, žádost o povolení), a informační řádek pod zadáním s limity předplatného. Vše zůstává jen na tomto Macu a Claude Code to nikdy nezpomalí.</p>
      <ul class="checklist"><li>Původní nastavení se uloží jako záloha.</li><li>Tvoje ostatní nastavení zůstane beze změny. Vlastní informační řádek, pokud ho máš, nepřepíšeme.</li><li>Pod zadáním v Claude Code uvidíš: „Agentree · 5 h 34 % · týden 12 % · kontext 41 %“.</li><li>Platí pro nově otevřené konverzace v Claude Code.</li></ul>${h?.path ? `<p class="small muted">Soubor: ${esc(h.path)}</p>` : ''}`,
  });
  if (!ok) return;
  state.integrations.claudeHooks = (await api.hooks('install')).claudeHooks;
  toast('Propojení s Claude Code je zapnuté. Platí pro nově otevřené konverzace.');
  update();
}

const head = (icon, title, desc, aside = '') => `<div class="set-card-head"><span class="icon-tile">${icon}</span><div><h3>${title}</h3>${desc ? `<p class="set-desc">${desc}</p>` : ''}</div>${aside}</div>`;

function update() {
  const el = v.el;
  const i = state.integrations;
  const n = state.settings?.notifications;
  if (!el || !i || !n) return;

  /* Propojení s Claude Code */
  const h = i.claudeHooks;
  const outdated = !h.error && (h.installed || h.partial) && !h.current;
  const claudeState = h.error ? ['error', 'Chyba'] : h.installed && h.current ? ['connected', 'Zapnuto'] : outdated ? ['missing', 'Je potřeba obnovit'] : ['idle', 'Vypnuto'];
  fill(el, 'claude', `
    ${head(glyph('anthropic'), 'Propojení s Claude Code',
      'Agentree se hned dozví, když Claude Code začne pracovat, dokončí úkol nebo čeká na tvé povolení. Uvidíš i přesné limity předplatného (5 hodin a týden) a zaplnění paměti konverzace. Bez propojení vidí Agentree jen historii konverzací — se zpožděním a bez žádostí o povolení.',
      stateBadge(...claudeState))}
    ${h.error ? `<p class="form-error form-error--inline">${esc(h.error)}</p>` : ''}
    ${outdated ? '<p class="set-note">Propojení vzniklo ve starší verzi Agentree. Obnov ho, aby se zobrazovaly i limity předplatného.</p>' : ''}
    ${h.statusLine === 'foreign' ? '<p class="set-note">V Claude Code máš vlastní informační řádek pod zadáním, proto ho Agentree nemění. Přesné limity Claude se kvůli tomu nezobrazí.</p>' : ''}
    <div class="set-actions">${h.installed && h.current
      ? '<button class="btn" type="button" data-action="claude-disconnect">Vypnout propojení</button>'
      : `<button class="btn btn--primary" type="button" data-action="claude-connect">${outdated ? 'Obnovit propojení' : 'Zapnout propojení'}</button>`}</div>`);

  /* Webové AI aplikace */
  const web = state.connectors.find((c) => c.id === 'web');
  const sites = i.extension?.sites || {};
  fill(el, 'extension', `
    ${head(ICON.spark, 'Webové AI aplikace <span class="badge">Zkušební</span>',
      'Konverzace z ChatGPT, Claude.ai, Gemini, Microsoft Copilot, Perplexity, Grok, Qwen Chat a GitHub Copilot uvidíš díky rozšíření pro Chrome. Rozšíření posílá data jen do Agentree na tomto Macu.',
      stateBadge(web?.state || 'missing', web?.state === 'connected' ? 'Aktivní' : web?.state === 'idle' ? 'Bez nových dat' : 'Nenainstalováno'))}
    <ol class="steps">
      <li>V Chromu otevři adresu <code>chrome://extensions</code> a vpravo nahoře zapni <b>Režim pro vývojáře</b>.</li>
      <li>Klikni na <b>Načíst rozbalené</b> a vyber tuto složku:
        <div class="code-line"><code>${esc(i.extension.path)}</code><button class="btn btn--sm btn--on-dark" type="button" data-copy="${esc(i.extension.path)}" data-copy-message="Cesta zkopírována">${ICON.copy}Kopírovat</button></div></li>
      <li>Otevři některou z aplikací níže. Rozšíření se s Agentree propojí samo.</li>
    </ol>
    <details class="details"><summary>Rozšíření se nepropojilo samo?</summary><p class="set-desc">Zkopíruj tento klíč a vlož ho do okna rozšíření.</p>
      <div class="code-line"><code class="secret">••••••••••••${esc(i.extension.token.slice(-6))}</code><button class="btn btn--sm btn--on-dark" type="button" data-copy="${esc(i.extension.token)}" data-copy-message="Klíč pro rozšíření zkopírován">${ICON.copy}Kopírovat klíč</button></div></details>
    <div class="site-grid">${Object.entries(sites).map(([k, s]) => {
      const at = web?.sites?.[k];
      return `<div class="site">${glyph({ connector: 'web', app: s.name, provider: s.provider })}<span>${esc(s.name)}</span><small>${at ? `data <span data-ago="${at}">${rel(at)}</span>` : 'zatím bez dat'}</small></div>`;
    }).join('')}</div>`);

  /* Zdroje dat */
  fill(el, 'connectors', `
    ${head(ICON.plug, 'Zdroje dat', 'Odkud Agentree čte práci agentů na tomto Macu. „Ověřeno“ znamená vyzkoušeno na skutečných datech, „Zkušební“ podle dokumentace výrobce.',
      `<button class="btn btn--sm" type="button" data-action="rescan">${ICON.refresh}Načíst znovu</button>`)}
    <div class="conn-grid">${state.connectors.map((c) => `
      <article class="conn">
        <div class="conn-head">${glyph(c)}<h4>${esc(c.name)}</h4>${stateBadge(c.state, STATE_LABEL[c.state] || c.state)}</div>
        <p>${esc(c.detail || c.description)}</p>
        <div class="conn-foot"><code>${esc(c.source)}</code><span class="badge${c.verified ? ' badge--ok' : ''}">${c.verified ? 'Ověřeno' : 'Zkušební'}</span></div>
        ${c.lastEventAt ? `<span class="small muted">Poslední data <span data-ago="${c.lastEventAt}">${rel(c.lastEventAt)}</span></span>` : ''}
      </article>`).join('')}</div>`);

  /* Upozornění */
  fill(el, 'notifications', `
    ${head(ICON.bell, 'Kdy a jak tě upozornit', '', '<button class="btn btn--sm" type="button" data-action="test-alert">Poslat zkušební</button>')}
    ${switchRow({ key: 'native', label: 'Oznámení v macOS', desc: i.nativeNotify ? 'Přijdou i se zavřeným prohlížečem, dokud Agentree běží.' : 'Na tomto systému nejsou dostupná.', checked: n.native && i.nativeNotify, disabled: !i.nativeNotify })}
    ${switchRow({ key: 'browser', label: 'Oznámení v prohlížeči', desc: 'Když máš Agentree otevřené na pozadí.', checked: n.browser })}
    <div class="set-divider"></div>
    ${switchRow({ key: 'needsInput', label: 'Agent potřebuje tvé rozhodnutí', desc: 'Povolení akce, otázka, schválení plánu nebo selhané spuštění.', checked: n.needsInput })}
    ${switchRow({ key: 'limits', label: 'Docházející limit předplatného', desc: 'Při 80 %, 95 % a vyčerpání.', checked: n.limits })}
    ${switchRow({ key: 'limitReset', label: 'Obnovený limit', desc: 'Když se obnoví 5hodinový nebo týdenní limit — víš, že můžeš zase naplno zadávat úkoly.', checked: n.limitReset !== false })}
    ${switchRow({ key: 'budget', label: 'Rozpočet', desc: 'Při 80 % a 100 % měsíčního rozpočtu útraty i tokenů projektu.', checked: n.budget })}
    ${switchRow({ key: 'done', label: 'Dokončený úkol', desc: 'Když agent dokončí zadaný úkol.', checked: n.done })}
    <label class="field field--row"><span>Hlásit dokončené úkoly</span>
      <select data-done-min${n.done ? '' : ' disabled'}>${DONE_OPTIONS.map(([s, l]) => `<option value="${s}"${n.doneMinSeconds === s ? ' selected' : ''}>${l}</option>`).join('')}</select></label>`);

  /* Profil */
  const current = state.settings.avatar;
  const who = state.host?.fullName || state.host?.user || '';
  fill(el, 'profile', `
    ${head(hasAvatar(current) ? `<span class="avatar-mini">${avatarSvg(current)}</span>` : ICON.spark, 'Profilový obrázek', 'Rychlá změna: v postranním panelu na obrázek najeď a klikni — pokaždé se ukáže jiný.')}
    <div class="avatar-grid" role="group" aria-label="Vyber profilový obrázek">
      <button class="avatar-pick" type="button" data-avatar-pick="i" aria-pressed="${!hasAvatar(current)}" aria-label="Iniciály">${esc(initials(who || 'Agentree'))}</button>
      ${Array.from({ length: AVATAR_COUNT }, (_, k) => `<button class="avatar-pick" type="button" data-avatar-pick="${k}" aria-pressed="${current === k}" aria-label="Abstraktní obrázek ${k + 1}">${avatarSvg(k)}</button>`).join('')}
    </div>`);

  /* Licence */
  const lic = state.license;
  if (lic) {
    const locked = Object.entries(lic.paidFeatures || {});
    const expires = lic.license?.expiresAt ? new Date(lic.license.expiresAt).toLocaleDateString('cs-CZ') : 'bez omezení';
    fill(el, 'license', `
      ${head(ICON.key, 'Licence', lic.valid ? `Agentree ${esc(lic.planLabel)} pro ${esc(lic.license.name)}.` : locked.length ? 'Verze Zdarma. Licence Pro odemkne placené funkce.' : 'Všechny funkce jsou teď odemčené. Licenční klíč si schovej pro budoucí verze.',
        stateBadge(lic.valid ? 'connected' : lic.expired ? 'missing' : 'idle', lic.valid ? lic.planLabel : lic.expired ? 'Vypršela' : 'Zdarma'))}
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
          <input id="license-key" name="key" type="text" autocomplete="off" spellcheck="false" placeholder="Licenční klíč, začíná AGT1.">
          <button class="btn btn--sm btn--primary" type="submit">Aktivovat</button>
        </form>`}`);
  }

  /* Náklady za API */
  fill(el, 'cloud', `
    ${head(ICON.wallet, 'Skutečné náklady za API <span class="badge">Zkušební</span>',
      `Platíte za API (ne jen předplatné)? Správcovský klíč organizace doplní skutečné náklady do grafů a rozpočtů. ${i.keychain ? 'Klíč se uloží do Klíčenky macOS a prohlížeč ho už neuvidí.' : 'Klíčenka tu není dostupná — klíč nastav proměnnou prostředí.'}`)}
    ${CLOUD.map(([id, label, provider, placeholder, desc]) => {
      const c = i.cloud?.[id] || { state: 'missing' };
      return `<div class="key-row">
        <div class="key-head">${glyph(provider)}<strong>${esc(label)} — správcovský klíč</strong>${stateBadge(c.state, c.state === 'missing' ? 'Nepřipojeno' : STATE_LABEL[c.state] || c.state)}</div>
        <p class="set-desc">${esc(c.state === 'error' ? c.detail : desc)}</p>
        ${c.source === 'env'
          ? '<p class="small muted">Klíč je nastavený proměnnou prostředí.</p>'
          : `<form class="key-form" data-secret-form="${id}"><label class="sr-only" for="key-${id}">${esc(label)} — správcovský klíč</label><input id="key-${id}" name="value" type="password" autocomplete="off" spellcheck="false" placeholder="${esc(placeholder)}"${i.keychain ? '' : ' disabled'}>
            <button class="btn btn--sm" type="submit"${i.keychain ? '' : ' disabled'}>Uložit</button>${c.state !== 'missing' ? `<button class="btn btn--sm" type="button" data-action="secret-remove" data-id="${id}">Odebrat</button>` : ''}</form>`}
      </div>`;
    }).join('')}`);

  /* Aplikace na tomto Macu */
  const inst = i.install || {};
  const auto = i.autostart || { supported: false };
  fill(el, 'system', `
    ${head(ICON.terminal, 'Spouštění po přihlášení',
      'Aby upozornění chodila vždy, nech Agentree spouštět automaticky po přihlášení. Když nečekaně spadne, znovu se zapne.',
      auto.supported ? stateBadge(auto.installed ? 'connected' : 'idle', auto.installed ? 'Zapnuto' : 'Vypnuto') : stateBadge('unavailable', 'Jen macOS'))}
    ${auto.supported ? `<div class="set-actions">${auto.installed
      ? '<button class="btn" type="button" data-action="autostart-uninstall">Vypnout spouštění po přihlášení</button>'
      : '<button class="btn btn--primary" type="button" data-action="autostart-install">Spouštět po přihlášení</button>'}</div>
    <details class="details"><summary>Raději přes Terminál?</summary><div class="code-line"><code>${esc(auto.command || '')}</code><button class="btn btn--sm btn--on-dark" type="button" data-copy="${esc(auto.command || '')}" data-copy-message="Příkaz zkopírován — vlož ho do Terminálu">${ICON.copy}Kopírovat</button></div></details>` : ''}
    <dl class="facts facts--row">
      <div><dt>Verze</dt><dd>${esc(state.version)}</dd></div>
      <div><dt>Data aplikace</dt><dd>${esc((inst.dataDir || '~/.agentree').replace(/^\/Users\/[^/]+/, '~'))}</dd></div>
      <div><dt>Historie</dt><dd>posledních ${state.windowDays} dní</dd></div>
      <div><dt>Soukromí</dt><dd>vše zůstává na tomto Macu</dd></div>
    </dl>`);

  const packCmd = 'npm run pack';
  const installCmd = `npm install -g ./agentree-${state.version}.tgz`;
  fill(el, 'share', `
    ${head(ICON.external, 'Instalace pro další lidi', 'Každý si Agentree nainstaluje na svůj Mac a propojí vlastní agenty a předplatná. Data nikam neodcházejí a nejsou svázaná s tvým účtem.')}
    <ol class="steps">
      <li>Ve složce Agentree vytvoř instalační balíček:<div class="code-line"><code>${esc(packCmd)}</code><button class="btn btn--sm btn--on-dark" type="button" data-copy="${esc(packCmd)}">${ICON.copy}Kopírovat</button></div></li>
      <li>Pošli soubor <code>dist/agentree-${esc(state.version)}.tgz</code>. Příjemce potřebuje Node.js 22.13 nebo novější a v Terminálu spustí:<div class="code-line"><code>${esc(installCmd)}</code><button class="btn btn--sm btn--on-dark" type="button" data-copy="${esc(installCmd)}">${ICON.copy}Kopírovat</button></div></li>
      <li>Aplikaci otevře příkazem <code>agentree --open</code>. Průvodce ho provede propojením.</li>
    </ol>
    <p class="small muted">Podrobný návod pro zákazníky je v souboru docs/INSTALL.md.</p>`);
}

export default {
  id: 'nastaveni',
  title: 'Nastavení',
  mount,
  update,
  unmount: () => {
    v.observer?.disconnect();
    Object.assign(v, { el: null, observer: null });
  },
};
