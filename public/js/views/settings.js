import { state } from '../state.js';
import { api } from '../api.js';
import { esc, rel, initials, dateLong } from '../format.js';
import { AVATAR_COUNT, avatarSvg, hasAvatar, setAvatar } from '../avatars.js';
import { glyph, ICON, BULB } from '../icons.js';
import { fill, switchRow, stateBadge, toast, modal, confirmDialog, copy } from '../ui.js';
import { applyAppearance, normalizeAppearance } from '../appearance.js';
import { qrSvg, parovaciAdresa } from '../qr.js';
import { takeJump } from '../jump.js';
import { resetLayout } from '../layout-prefs.js';
import { radekNapojeni, spustNapojeni } from '../napojeni-ui.js';
import { tr, LOCALE, jazyk } from '../i18n.js';

const v = { folds: {}, el: null, tab: null, ukazSkupinu: null, pairCode: null, customTypes: null, customError: '', customDraft: null, pin: null, ucetUrl: '', napojeni: null, napojeniNacita: false, napojeniChyba: '', nahled: '' };
const STATE_LABEL = { connected: tr('Připojeno'), idle: tr('Bez nových dat'), missing: tr('Nenalezeno'), error: tr('Chyba'), unavailable: tr('Nedostupné') };
const FEATURE_LABEL = { launchBackground: tr('Spouštění agentů na pozadí'), localChat: tr('Chat s lokálními modely v Ollamě'), projectsUnlimited: tr('Neomezený počet projektů'), projectExport: tr('Export projektů do CSV') };
const DONE_OPTIONS = [[0, tr('každou')], [60, tr('delší než 1 minuta')], [120, tr('delší než 2 minuty')], [300, tr('delší než 5 minut')], [900, tr('delší než 15 minut')]];
const CLOUD = [
  ['openai-admin', 'OpenAI', 'openai', 'sk-admin-…', tr('Náklady organizace za API OpenAI. Nezahrnuje předplatné ChatGPT.')],
  ['anthropic-admin', 'Anthropic', 'anthropic', 'sk-ant-admin01-…', tr('Náklady organizace za API Anthropic. Nezahrnuje předplatné Claude.')],
];

const WEB_FRESH_MS = 10 * 60 * 1000;

// Webová služba v kartě rozšíření: čip s tečkou, když od ní přišla data. Podrobnost je v popisku,
// aby se nerozpadlo na devět karet, které říkají pořád totéž.
function webChip(id, site, web, now) {
  const at = web?.sites?.[id] || 0;
  const title = at && now - at < WEB_FRESH_MS ? tr('Rozšíření právě čte otevřenou konverzaci.') : at ? tr('Naposledy data {0}.', rel(at, now)) : tr('Zatím bez dat – otevři službu v Chromu.');
  return `<li class="site-chip${at ? ' is-seen' : ''}" data-web-source="${esc(id)}" title="${esc(title)}">${glyph({ connector: 'web', app: site.name, provider: site.provider })}<span>${esc(site.name)}</span></li>`;
}

// Sbalitelná část. Otevřené/zavřené se pamatuje mimo vykreslení, jinak by se každé překreslení
// (a přepisují se i „před 2 min“) zavřelo pod rukama.
const fold = (key, summary, body, { open = false, count = null, cls = '' } = {}) =>
  `<details class="src-fold${cls ? ` ${cls}` : ''}" data-fold="${key}"${(v.folds[key] ?? open) ? ' open' : ''}><summary>${summary}${count ? `<span class="src-count">${count}</span>` : ''}</summary>${body}</details>`;

const SOURCE_IDS = ['claude-code', 'codex', 'cursor', 'copilot-cli', 'vscode-copilot', 'gemini-cli', 'qwen-code'];
const EXTRA_IDS = ['claude-desktop-usage', 'processes', 'local-agents', 'cloud-billing'];

function sourceRow(c) {
  const posledni = c.lastEventAt ? ` ${tr('· poslední data')} <span data-ago="${c.lastEventAt}">${rel(c.lastEventAt)}</span>` : '';
  return `<li class="src-row" data-state="${esc(c.state)}">
    <span class="src-logo">${glyph(c)}</span>
    <div class="src-main"><b>${esc(c.name)}</b>${c.verified ? '' : `<span class="src-beta" title="${tr('Zatím ověřeno jen podle dokumentace výrobce, ne na skutečných datech.')}">${tr('Beta')}</span>`}
      <p>${esc(c.detail || c.description)}${posledni}</p></div>
    ${stateBadge(c.state, STATE_LABEL[c.state] || c.state)}
  </li>`;
}

// Skupiny nastavení: pořadí odpovídá tomu, jak často je člověk potřebuje.
const GROUPS = [
  ['set-propojeni', tr('Propojení'), ['models', 'claude', 'extension', 'connectors', 'custom']],
  ['set-upozorneni', tr('Upozornění'), ['notifications']],
  ['set-ucet', tr('Účet a vzhled'), ['account', 'appearance', 'language', 'profile', 'license']],
  ['set-naklady', tr('Náklady za API'), ['cloud']],
  ['set-aplikace', tr('Aplikace na tomto Macu'), ['system', 'phone', 'tailscale', 'remote', 'share', 'privacy']],
];

// Vlastní agenti: uživatel přidá jen adresu lokální služby. Server ji pustí dál až po kontrole,
// že míří na tenhle Mac nebo do místní sítě – do karty se proto nic neověřuje „pro jistotu" znovu,
// jen se poctivě zobrazí, co server vrátil.
// Vzdálený přístup mimo domov. Agenteeq nikdy neotevírá cestu ven sám – jen zjistí, jestli má
// uživatel nainstalovaný tunel, a poradí, který zvolit. Rozdíl mezi privátní sítí a veřejnou
// adresou říkáme narovinu, protože to má jiný dopad na soukromí.
function remoteCard() {
  const t = state.tunnels || { at: 0, list: [], advice: null };
  const rada = t.advice;
  const bezi = t.list.find((x) => x.running);
  return `
    ${head(ICON.cloud, tr('Mimo domov'), tr('V domácí síti stačí přístup z telefonu. Venku (mobilní data, cizí Wi-Fi) je potřeba tunel, který si spustíš sám – Agenteeq žádnou cestu ven neotvírá.'))}
    ${bezi ? `<div class="code-line"><code>${esc(bezi.remoteUrl || bezi.url)}</code><button class="btn btn--sm btn--on-dark" type="button" data-copy="${esc(bezi.remoteUrl || bezi.url)}" data-copy-message="${tr('Adresa zkopírována')}">${ICON.copy}${tr('Kopírovat')}</button></div>
      <p class="set-note">${esc(bezi.name)} ${tr('běží.')} ${esc(bezi.security)}</p>` : ''}
    ${t.list.length ? `<ul class="privacy-list">${t.list.map((x) => `<li>
      <div class="custom-agent-head"><b>${esc(x.name)}</b>${x.running ? `<span class="badge badge--ok">${tr('běží')}</span>` : x.installed ? `<span class="badge">${tr('nainstalováno')}</span>` : `<span class="badge badge--beta">${tr('není')}</span>`}${x.kind === 'verejny-tunel' ? `<span class="badge badge--beta">${tr('veřejná adresa')}</span>` : `<span class="badge">${tr('privátní síť')}</span>`}</div>
      <span>${esc(x.description)}</span>
      <span class="muted small">${esc(x.security)}</span>
      ${x.hint ? `<span class="muted small">${esc(x.hint)}</span>` : ''}
    </li>`).join('')}</ul>` : `<p class="set-note">${tr('Zjištění ještě neproběhlo.')}</p>`}
    ${rada && rada.doporuceni !== 'zadny' ? `<p class="set-note"><b>${tr('Doporučení:')}</b> ${esc(rada.text)}</p>` : rada ? `<p class="set-note">${esc(rada.text)}</p>` : ''}
    ${rada?.kroky?.length ? `<ol class="steps steps--compact">${rada.kroky.map((k) => `<li>${esc(k)}</li>`).join('')}</ol>` : ''}
    <div class="set-actions"><button class="btn btn--sm" type="button" data-action="remote-detect">${ICON.refresh}${tr('Zjistit znovu')}</button></div>
    <p class="set-note">${tr('Ať zvolíš cokoli, párování kódem a token zůstávají v platnosti – bez spárovaného zařízení se k datům nedostane nikdo, ani kdo zná adresu. Instalovatelná aplikace na domovské obrazovce potřebuje HTTPS; u veřejného tunelu ho dostaneš automaticky, u Tailscale se zapíná v jeho nastavení.')}</p>`;
}

// Tailscale: privátní síť jen mezi vlastními zařízeními. Na rozdíl od karty „Mimo domov“ tady
// Agenteeq nejen radí – se zapnutým přepínačem začne naslouchat i na adrese tohoto Macu v tailnetu
// (100.x, respektive jméno v MagicDNS). Žádná veřejná adresa nikde nevzniká a párování kódem
// platí i tady: bez spárovaného telefonu se z tailnetu nepřečte nic.
function tailscaleCard() {
  const t = (state.lan || {}).tailscale || { enabled: false, available: false, addresses: [], name: '', url: '', error: '' };
  const detekce = (state.tunnels?.list || []).find((x) => x.id === 'tailscale') || null;
  const serve = detekce?.serve || null;
  // Přepínač se nabízí, teprve když Tailscale opravdu běží. Adresa z rozsahu 100.64.0.0/10
  // sama nestačí – je to rozsah pro CGNAT a od některých operátorů ji Mac dostane i bez Tailscale.
  const bezi = Boolean(detekce?.running);
  const pripraveno = bezi && t.available;
  const popis = pripraveno
    ? `${tr('Adresa tohoto Macu v síti Tailscale:')} ${t.name || t.addresses[0]}`
    : bezi
      ? tr('Tailscale běží, ale tenhle Mac zatím nemá adresu v tailnetu.')
      : detekce?.installed
        ? tr('Tailscale je nainstalovaný, ale nejsi přihlášený – spusť „tailscale up“.')
        : tr('Tailscale na tomto Macu není. Nainstaluj ho z tailscale.com a přihlas se.');
  return `
    ${head(ICON.shield, tr('Přístup přes Tailscale'), tr('Privátní síť jen mezi tvými vlastními zařízeními. Telefon se k Macu dostane odkudkoli – z mobilních dat i z cizí Wi-Fi – a adresa přitom nikde veřejně neexistuje.'))}
    ${switchRow({ key: 'tailscaleAccess', label: tr('Přístup ze sítě Tailscale'), desc: esc(popis), checked: t.enabled, disabled: !pripraveno })}
    ${t.error ? `<p class="form-error form-error--inline">${esc(t.error)}</p>` : ''}
    ${t.enabled && t.url ? `<div class="code-line"><code>${esc(t.url)}</code><button class="btn btn--sm btn--on-dark" type="button" data-copy="${esc(t.url)}" data-copy-message="${tr('Adresa zkopírována')}">${ICON.copy}${tr('Kopírovat adresu')}</button></div>
      <p class="set-note">${tr('Tuhle adresu otevři na telefonu, který je přihlášený do stejné sítě Tailscale. Kód pro spárování vytvoříš o kartu výš.')}</p>` : ''}
    ${t.enabled && t.addresses.length > 1 ? `<p class="set-note">${tr('Další adresy v síti Tailscale:')} ${esc(t.addresses.slice(1).join(', '))}</p>` : ''}
    ${serve && !serve.unknown ? `<p class="set-note">${serve.running
      ? `${tr('HTTPS přes „tailscale serve“ běží na')} <code>${esc(serve.url || '')}</code>  ${tr('Na téhle adrese si aplikaci uložíš na plochu telefonu.')}`
      : tr('HTTPS zatím zapnuté není. Bez něj aplikace v prohlížeči funguje normálně, jen si ji telefon neuloží na plochu. Zapneš ho příkazem <code>tailscale serve</code> – Agenteeq ho sám nespouští.')}</p>` : ''}
    ${!pripraveno ? `<ol class="steps steps--compact">
      <li>${tr('Nainstaluj Tailscale (tailscale.com nebo <code>brew install --cask tailscale</code>).')}</li>
      <li>${tr('Přihlas se na Macu (')}<code>tailscale up</code>${tr(') i v appce na telefonu – stejným účtem.')}</li>
      <li>${tr('Vrať se sem, zapni přepínač a spáruj telefon kódem.')}</li>
    </ol>` : ''}
    <p class="set-note">${tr('Provoz jde šifrovaným tunelem (WireGuard) přímo mezi tvými zařízeními. Agenteeq nic neinstaluje ani nespouští – jen se zapnutým přepínačem začne naslouchat na adrese, kterou ti Tailscale už přidělil. Vypnutím naslouchání skončí.')}</p>`;
}

// Spárování telefonu: QR kód je jen zkratka k témuž jednorázovému kódu, který je vidět pod ním.
// Když čtečka selže nebo ji někdo nechce použít, číslo se dá pořád opsat – proto zůstává.
function parovaciKod(url, pin, cas) {
  const adresa = parovaciAdresa(url, pin.code);
  const kod = adresa ? qrSvg(adresa, { popis: tr('QR kód pro spárování telefonu') }) : null;
  return `<div class="pair-invite">
    ${kod ? `<div class="pair-qr">${kod}</div>` : ''}
    <div class="pair-invite-text">
      ${kod ? `<b>${tr('Namiř na kód foťák telefonu')}</b><p class="muted small">${tr('Otevře se přímo spárovaná aplikace. Telefon musí být ve stejné síti.')}</p>` : ''}
      <div class="pin-box"><b>${esc(pin.code.slice(0, 3))} ${esc(pin.code.slice(3))}</b><span class="muted small">${tr('Nebo na telefonu otevři adresu výše a zadej tenhle kód. Platí do {0} a jen na jedno spárování.', cas(pin.expiresAt))}</span></div>
    </div>
  </div>`;
}

// Otevřít na telefonu: přepínač, jednorázový kód a seznam spárovaných zařízení.
// Kód i seznam se ukazují jen tady na Macu – z telefonu je server nevydá.
function phoneCard() {
  const l = state.lan || { enabled: false, addresses: [], devices: [] };
  const pin = v.pin && v.pin.expiresAt > Date.now() ? v.pin : null;
  const cas = (ms) => new Date(ms).toLocaleTimeString(LOCALE, { hour: '2-digit', minute: '2-digit' });
  return `
    ${head(ICON.mac, tr('Otevřít na telefonu'), tr('Agenteeq normálně poslouchá jen na tomto Macu. Když to zapneš, přidá se adresa v tvé domácí síti – a telefon se k datům dostane jen po spárování jednorázovým kódem.'))}
    ${switchRow({ key: 'lanAccess', label: tr('Přístup z domácí sítě'), desc: l.addresses.length ? `${tr('Adresa tohoto Macu:')} ${l.addresses.join(', ')}` : tr('Mac není v žádné místní síti – připoj se na Wi-Fi.'), checked: l.enabled, disabled: !l.addresses.length })}
    ${l.error ? `<p class="form-error form-error--inline">${esc(l.error)}</p>` : ''}
    ${l.enabled && l.url ? `<div class="code-line"><code>${esc(l.url)}</code><button class="btn btn--sm btn--on-dark" type="button" data-copy="${esc(l.url)}" data-copy-message="${tr('Adresa zkopírována')}">${ICON.copy}${tr('Kopírovat adresu')}</button></div>
      <div class="set-actions">
        <button class="btn btn--sm btn--primary" type="button" data-action="lan-pin">${ICON.key}${pin ? tr('Nový kód') : tr('Vytvořit kód pro telefon')}</button>
      </div>
      ${pin ? parovaciKod(l.url, pin, cas) : ''}
      ${l.devices?.length ? `<div class="conn-source-head"><span>${tr('Spárované telefony')}</span><small>${tr('Odpárováním přestane zařízení vidět cokoli.')}</small></div>
        <ul class="privacy-list">${l.devices.map((d) => `<li><b>${esc(d.label)}</b><span>${tr('spárováno {0} ·', dateLong(d.at))} <button class="link-inline" type="button" data-action="lan-forget" data-id="${esc(d.id)}">${tr('Odpárovat')}</button></span></li>`).join('')}</ul>` : `<p class="set-note">${tr('Zatím žádný spárovaný telefon.')}</p>`}` : ''}
    <p class="set-note">${tr('Zapnuté jen doma: adresa je z privátního rozsahu, z internetu se na ni nikdo nedostane. Token má telefon v cookie, kterou nepřečte žádný skript, a v datech aplikace je z něj jen kontrolní součet. Vypnutím se spojení zavře a všechna zařízení se odpárují.')}</p>`;
}

function customAgentsCard() {
  const list = state.customAgents || [];
  const types = v.customTypes || [];
  const draft = v.customDraft || {}; // co uživatel napsal, přežije překreslení i chybu
  const rows = list.map((a) => `<article class="custom-agent">
    <div class="custom-agent-main">
      <div class="custom-agent-head"><span class="rt-disc">${glyph({ provider: 'local' })}${a.running ? '<i class="rt-status"></i>' : ''}</span>
        <h4>${esc(a.name)}</h4><span class="badge">${esc(a.typeLabel)}</span></div>
      <p class="muted small">${esc(a.detail || (a.at ? tr('Neodpovídá.') : tr('Zatím nezjištěno.')))}${a.at ? ` ${tr('· zjištěno')} <span data-ago="${a.at}">${rel(a.at)}</span>` : ''}</p>
      <code class="skill-path">${esc(a.origin)}</code>
    </div>
    <button class="btn btn--sm" type="button" data-action="custom-remove" data-id="${esc(a.id)}">${tr('Odebrat')}</button>
  </article>`).join('');

  return fold('custom', tr('Přidat vlastního agenta (ComfyUI, Ollama, server s rozhraním OpenAI)'), `
    <p class="set-desc">${tr('Lokální služby, které nemají vlastní konektor. Agenteeq se jich jen ptá na stav.')}</p>
    ${rows ? `<div class="custom-agents">${rows}</div>` : ''}
    <form class="custom-agent-form" data-custom-form novalidate>
      <label class="field"><span>${tr('Název')}</span><input name="name" type="text" maxlength="40" autocomplete="off" placeholder="${tr('Třeba ComfyUI na Macu')}" value="${esc(draft.name || '')}"></label>
      <label class="field"><span>${tr('Typ')}</span><select name="type">${types.map((t) => `<option value="${esc(t.id)}"${draft.type === t.id ? ' selected' : ''}>${esc(t.label)}</option>`).join('')}</select></label>
      <label class="field"><span>${tr('Adresa')}</span><input name="url" type="text" autocomplete="off" spellcheck="false" placeholder="http://127.0.0.1:8188" value="${esc(draft.url || '')}"${v.customError ? ' aria-invalid="true"' : ''}>${v.customError ? `<span class="field-error" role="alert">${esc(v.customError)}</span>` : ''}</label>
      <button class="btn btn--sm btn--primary" type="submit">${tr('Přidat agenta')}</button>
    </form>
    <p class="set-note">${tr('Adresa smí mířit jen na tento Mac nebo do místní sítě (127.0.0.1, 192.168.x, .local). Veřejné adresy Agenteeq odmítne, dotaz posílá vždy jen jako čtení, nenásleduje přesměrování a nikdy neukládá přihlašovací údaje.')}</p>`, { open: Boolean(list.length || v.customError), count: list.length || null });
}

// Soukromí: karta říká jen ověřitelná fakta – co je v paměti, co na disku a co odchází ven.
function privacyCard() {
  const alertCount = state.alerts?.items?.length || 0;
  const dataFile = `${state.integrations?.install?.dataDir || '~/.agenteeq'}/data.json`;
  const keysOn = (state.connectors || []).filter((c) => c.id === 'cloud-billing' && c.state !== 'missing').length > 0;
  return `
    ${head(ICON.key, tr('Soukromí a bezpečnost'), tr('Agenteeq běží jen na tomto Macu. Server poslouchá výhradně na 127.0.0.1, takže se k němu z jiného počítače nikdo nepřipojí, a nikam neodesílá telemetrii.'))}
    <ul class="privacy-list">
      <li><b>${tr('Konverzace agentů')}</b><span>${tr('Čtou se ze souborů na disku ({0}, {1} a dalších) a drží se jen v paměti běžícího serveru. Agenteeq si z nich nedělá vlastní kopii.', esc(`~/.claude`), esc(`~/.codex`))}</span></li>
      <li><b>${tr('Na disku v ~/.agenteeq/data.json')}</b><span>${tr('Nastavení, projekty, rozpočty a historie upozornění – soubor má práva jen pro tebe (0600) a složka 0700.')}</span></li>
      <li><b>${tr('Klíče k API')}</b><span>${keysOn ? tr('Uložené v systémové Klíčence, nikdy v souboru aplikace.') : tr('Zatím žádné. Když je přidáš, uloží se do systémové Klíčenky, ne do souboru.')}</span></li>
      <li><b>${tr('Ven z Macu')}</b><span>${tr('Jen když si sám zapneš náklady za API – pak se Agenteeq zeptá tvým klíčem přímo výrobce. Vlastní agenti se dotazují pouze na lokální a privátní adresy.')}</span></li>
    </ul>
    <div class="set-actions">
      <button class="btn btn--sm" type="button" data-action="clear-alerts"${alertCount ? '' : ' disabled'}>${tr('Smazat historii upozornění')}${alertCount ? ` (${alertCount})` : ''}</button>
    </div>
    <div class="code-line"><code>${esc(dataFile)}</code><button class="btn btn--sm btn--on-dark" type="button" data-copy="${esc(dataFile)}" data-copy-message="${tr('Cesta zkopírována')}">${ICON.copy}${tr('Kopírovat cestu')}</button></div>
    <p class="set-note">${tr('Texty upozornění jsou jediná trvale ukládaná data odvozená z obsahu konverzací. Smazáním zmizí i klíče, podle kterých Agenteeq pozná, že už upozornil.')}</p>`;
}

// Karta rozšíření je `[data-region="extension"]`. Kromě skoku je potřeba ukázat, kam vedl,
// a dát fokus na tlačítko s kódem (nebo na rozbalení instalace, když už je spárováno).
function calloutExtension() {
  const card = v.el?.querySelector('[data-region="extension"]');
  if (!card) return;
  const skupina = card.closest('.set-group');
  if (skupina?.hidden) v.ukazSkupinu?.(skupina.id);
  // Stránka má v CSS `scroll-behavior: smooth`, takže `scrollIntoView` s 'auto' posouvá plynule –
  // a v okně, které zrovna nekreslí, se plynulý posun vůbec nerozběhne. Cíl se proto počítá
  // přesně a u skrytého okna nebo omezeného pohybu se skočí okamžitě. 96 px = místo pod lištou.
  const instant = document.hidden || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const top = Math.max(0, window.scrollY + card.getBoundingClientRect().top - 96);
  window.scrollTo({ top, behavior: instant ? 'instant' : 'smooth' });
  card.classList.remove('is-called-out');
  void card.offsetWidth;
  card.classList.add('is-called-out');
  card.querySelector('[data-action="extension-pair-code"], .ext-reinstall summary')?.focus({ preventScroll: true });
}

// Skok až po dokončení přechodu: router po vykreslení posune stránku nahoru a dá fokus nadpisu,
// takže okamžitý skok by se hned přepsal. Časovač místo requestAnimationFrame běží i ve skrytém okně.
function onJump() {
  if (takeJump() === 'extension') setTimeout(calloutExtension, 80);
}

function mount(el) {
  v.el = el;
  window.addEventListener('agenteeq-jump', onJump);
  nactiNapojeni();
  if (!v.customTypes) api.customAgents().then((r) => { v.customTypes = r.types; state.customAgents = r.agents; update(); }).catch(() => { v.customTypes = []; });
  if (!GROUPS.some(([id]) => id === v.tab)) v.tab = GROUPS[0][0];
  el.innerHTML = `
    <div class="settings2">
      <nav class="set-nav" aria-label="${tr('Sekce nastavení')}">
        ${GROUPS.map(([id, label]) => `<button type="button" data-jump="${id}" aria-controls="${id}"${id === v.tab ? ' aria-current="true"' : ''}>${label}</button>`).join('')}
      </nav>
      <div class="set-main">
        <section class="guide-banner" data-enter style="--i:0">
          <span class="guide-art" aria-hidden="true">${BULB}</span>
          <div class="guide-text">
            <strong>${tr('Průvodce Agenteeq')}</strong>
            <p>${tr('Šest obrazovek o tom, co Agenteeq umí: přehled agentů, kdy je řada na tobě, limity a útrata, projekty, chaty z prohlížeče a kde zůstávají tvá data.')}</p>
          </div>
          <button class="btn btn--primary" type="button" data-welcome>${tr('Prohlédnout průvodce')}</button>
        </section>
        ${GROUPS.map(([id, label, regions]) => `<section class="set-group" id="${id}" aria-labelledby="${id}-h"${id === v.tab ? '' : ' hidden'} data-enter style="--i:1">
          <h2 class="set-group-title" id="${id}-h">${label}</h2>
          ${regions.map((r) => `<section class="card set-card" data-region="${r}"></section>`).join('')}
        </section>`).join('')}
      </div>
    </div>`;

  // `toggle` nebublá, proto zachytávání. Stav sbalených částí přežije překreslení.
  el.addEventListener('toggle', (e) => {
    const key = e.target?.dataset?.fold;
    if (key) v.folds[key] = e.target.open;
    // Náhled toho, co odchází do účtu, se načte až při otevření – je to přesně tentýž balík.
    if (key === 'nahled' && e.target.open) api.ucetNahled().then((r) => { v.nahled = JSON.stringify(r.nahled, null, 2); update(); }).catch((err) => { v.nahled = err.message; update(); });
  }, true);

  const nav = el.querySelector('.set-nav');
  const reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Vodorovná lišta záložek (mobil) se posouvá přímo přes scrollLeft na `nav` samotné –
  // nikdy přes scrollIntoView na tlačítku, to by rozhýbalo i stránku.
  const scrollNavTo = (btn) => {
    if (nav.scrollWidth <= nav.clientWidth) return; // desktop: svislá lišta se neposouvá
    const left = btn.offsetLeft;
    const right = left + btn.offsetWidth;
    const viewLeft = nav.scrollLeft;
    const viewRight = viewLeft + nav.clientWidth;
    const target = left < viewLeft ? left : right > viewRight ? right - nav.clientWidth : null;
    if (target === null) return;
    nav.scrollTo({ left: target, behavior: reduceMotion() ? 'auto' : 'smooth' });
  };

  // Menu přepíná skupiny jako Nastavení v macOS: klik ukáže vybranou skupinu a stránka ani
  // menu se nehnou. Dřív to byly kotvy na jedné dlouhé stránce – klik ji posunul k sekci
  // a nadpis „Nastavení“ odjel z obrazovky.
  v.ukazSkupinu = (id) => {
    if (!GROUPS.some(([g]) => g === id)) return;
    v.tab = id;
    for (const btn of nav.querySelectorAll('[data-jump]')) {
      if (btn.dataset.jump === id) btn.setAttribute('aria-current', 'true');
      else btn.removeAttribute('aria-current');
    }
    for (const g of el.querySelectorAll('.set-group')) g.hidden = g.id !== id;
    const btn = nav.querySelector(`[data-jump="${id}"]`);
    if (btn) scrollNavTo(btn);
  };

  el.addEventListener('click', async (e) => {
    const jump = e.target.closest('[data-jump]');
    if (jump) {
      v.ukazSkupinu(jump.dataset.jump);
      // Hluboko v dlouhé skupině by nová začala někde uprostřed. Stránka se proto srovná tak, aby
      // skupina začínala tam, kde má vedle lepivého menu (na mobilu pod ním) – menu stojí dál
      // na svém místě. Nahoře, kde je vidět nadpis, se nehýbe nic.
      const menu = nav.getBoundingClientRect();
      const skupina = el.querySelector('.set-group:not([hidden])').getBoundingClientRect();
      const vedle = menu.right <= skupina.left; // počítač: menu vlevo; mobil: lišta nad obsahem
      const posun = skupina.top - (vedle ? menu.top : menu.bottom + 16);
      if (posun < -1) window.scrollTo({ top: window.scrollY + posun, behavior: 'instant' });
      return;
    }
    const pick = e.target.closest('[data-avatar-pick]');
    if (pick) {
      setAvatar(pick.dataset.avatarPick === 'i' ? null : Number(pick.dataset.avatarPick));
      return;
    }
    // Pozor: `data-appearance` nese i kořenové <html> (nastavuje ho appearance.js), takže holý
    // `[data-appearance]` zachytil úplně každý klik v Nastavení a spolkl ho – žádné tlačítko pak
    // nefungovalo a v tmavém režimu se navíc appka potichu přepnula do světlé.
    const appearance = e.target.closest('button[data-appearance]');
    if (appearance) { await setAppearance(appearance.dataset.appearance); return; }
    const lang = e.target.closest('button[data-lang]');
    if (lang) { await setLanguage(lang.dataset.lang); return; }
    const sw = e.target.closest('[data-setting]');
    if (sw) return toggleSetting(sw);
    const nap = e.target.closest('[data-napojit]');
    if (nap) {
      const polozka = v.napojeni?.find((n) => n.id === nap.dataset.napojit);
      if (!polozka) return;
      nap.disabled = true;
      try {
        await spustNapojeni(polozka, { poZmene: nactiNapojeni });
      } catch (err) {
        toast(err.message, { tone: 'err', timeout: 8000 });
      } finally {
        nap.disabled = false;
      }
      return;
    }
    const a = e.target.closest('[data-action]');
    if (!a) return;
    try {
      if (a.dataset.action === 'browser-link') { await copy(await api.browserLink(), tr('Odkaz je ve schránce – vlož ho do prohlížeče')); }
      else if (a.dataset.action === 'reset-layout') { await resetLayout(); toast(tr('Karty mají zase výchozí pořadí')); update(); }
      else if (a.dataset.action === 'claude-connect') await connectClaude();
      else if (a.dataset.action === 'claude-disconnect') {
        if (await confirmDialog({ title: tr('Vypnout propojení s Claude Code'), message: tr('Agenteeq odebere své příkazy a informační řádek z nastavení Claude Code. Tvoje ostatní nastavení zůstane beze změny.'), confirmLabel: tr('Vypnout propojení') })) {
          state.integrations.claudeHooks = (await api.hooks('uninstall')).claudeHooks;
          toast(tr('Propojení s Claude Code je vypnuté'));
          update();
        }
      } else if (a.dataset.action === 'test-alert') {
        await api.testAlert();
      } else if (a.dataset.action === 'rescan') {
        a.disabled = true;
        state.connectors = (await api.rescan()).connectors;
        toast(tr('Zdroje dat jsou načtené znovu'));
        update();
        a.disabled = false;
      } else if (a.dataset.action === 'extension-pair-code') {
        v.pairCode = await api.extensionPairCode();
        toast(tr('Jednorázový kód je připravený na 10 minut'));
        update();
      } else if (a.dataset.action === 'extension-scroll') {
        calloutExtension();
      } else if (a.dataset.action === 'ucet-prihlasit') {
        a.disabled = true;
        try {
          const r = await api.ucetPrihlasit();
          v.ucetUrl = r.url;
          // Prohlížeč otevírá server. Když to nešlo (třeba bez grafického prostředí), nabídneme odkaz.
          if (!r.otevreno) toast(tr('Přihlášení se neotevřelo samo. Otevři ho odkazem v kartě Účet.'), { tone: 'info' });
        } finally { a.disabled = false; }
        update();
      } else if (a.dataset.action === 'ucet-zrusit') {
        state.ucet = (await api.ucetZrusit()).ucet;
        v.ucetUrl = '';
        update();
      } else if (a.dataset.action === 'ucet-odhlasit') {
        state.ucet = (await api.ucetOdhlasit()).ucet;
        toast(tr('Odhlášeno. Agenteeq funguje dál bez účtu.'));
        update();
      } else if (a.dataset.action === 'ucet-smazat') {
        if (await confirmDialog({ title: tr('Smazat účet Agenteeq'), message: tr('Účet a všechno, co je k němu uložené v cloudu, se nevratně smaže. Data na tomhle Macu zůstanou, jak jsou.'), confirmLabel: tr('Smazat účet'), danger: true })) {
          state.ucet = (await api.ucetSmazat()).ucet;
          toast(tr('Účet je smazaný.'));
          update();
        }
      } else if (a.dataset.action === 'license-remove') {
        if (await confirmDialog({ title: tr('Odebrat licenci'), message: tr('Licenční klíč se z tohoto Macu odebere. Znovu ho můžeš kdykoli vložit.'), confirmLabel: tr('Odebrat licenci'), danger: true })) {
          state.license = (await api.removeLicense()).license;
          toast(tr('Licence odebrána'));
          update();
        }
      } else if (a.dataset.action === 'autostart-install') {
        const ok = await modal({
          title: tr('Spouštět Agenteeq po přihlášení'),
          submitLabel: tr('Zapnout'),
          body: `<p class="modal-text">${tr('macOS pak Agenteeq spustí po každém přihlášení, a když nečekaně spadne, znovu ho zapne. Upozornění tak chodí, i když aplikaci nemáš otevřenou.')}</p>
            <ul class="checklist"><li>${tr('Vypneš to kdykoli jedním kliknutím tady.')}</li><li>${tr('Když už Agenteeq běží (třeba spuštěný ručně), druhá kopie se sama v klidu ukončí.')}</li></ul>
            <p class="small muted">${tr('Technicky: soubor ~/Library/LaunchAgents/cz.agenteeq.agent.plist')}</p>`,
        });
        if (ok) {
          const r = await api.autostart('install');
          state.integrations = r.integrations;
          toast(r.dry ? tr('Zkušební režim: spouštění po přihlášení se nezapnulo') : tr('Agenteeq se bude spouštět po přihlášení'));
          update();
        }
      } else if (a.dataset.action === 'autostart-uninstall') {
        if (await confirmDialog({ title: tr('Vypnout spouštění po přihlášení'), message: tr('Agenteeq se přestane spouštět po přihlášení. Pokud právě běží tímto způsobem, ukončí se a bude nedostupný, dokud ho znovu nespustíš.'), confirmLabel: tr('Vypnout') })) {
          const r = await api.autostart('uninstall');
          state.integrations = r.integrations;
          toast(tr('Spouštění po přihlášení je vypnuté'));
          update();
        }
      } else if (a.dataset.action === 'reveal-install-package') {
        const r = await api.revealInstallPackage();
        toast(r.dry ? tr('Zkušební režim: Finder se neotevřel') : tr('Balíček je vidět ve Finderu'));
      } else if (a.dataset.action === 'clear-alerts') {
        if (await confirmDialog({ title: tr('Smazat historii upozornění'), message: tr('Všechna uložená upozornění zmizí z tohoto Macu. Práci agentů to nijak neovlivní.'), confirmLabel: tr('Smazat'), danger: true })) {
          const r = await api.clearAlerts();
          state.alerts = { unread: r.unread, items: [] };
          toast(r.cleared ? tr('Smazáno {0} upozornění', r.cleared) : tr('Nebylo co mazat'), r.cleared ? {} : { tone: 'info' });
          update();
        }
      } else if (a.dataset.action === 'remote-detect') {
        state.tunnels = (await api.detectRemote()).tunnels;
        { const nalezen = state.tunnels.list.some((x) => x.installed); toast(nalezen ? tr('Zjištěno') : tr('Žádný nástroj pro vzdálený přístup není nainstalovaný'), nalezen ? {} : { tone: 'info' }); }
        update();
      } else if (a.dataset.action === 'lan-pin') {
        v.pin = (await api.lanPin()).pin;
        update();
      } else if (a.dataset.action === 'lan-forget') {
        const zarizeni = (state.lan?.devices || []).find((d) => d.id === a.dataset.id);
        if (await confirmDialog({ title: tr('Odpárovat zařízení'), message: `${zarizeni?.label || tr('Zařízení')} ${tr('přestane vidět cokoli z Agenteeq. Znovu se spáruje novým kódem.')}`, confirmLabel: tr('Odpárovat'), danger: true })) {
          state.lan = (await api.lanForget(a.dataset.id)).lan;
          toast(tr('Zařízení odpárováno'));
          update();
        }
      } else if (a.dataset.action === 'custom-remove') {
        const agent = (state.customAgents || []).find((x) => x.id === a.dataset.id);
        if (await confirmDialog({ title: tr('Odebrat agenta'), message: `${agent?.name || tr('Agent')} ${tr('zmizí ze seznamu a Agenteeq se ho přestane ptát na stav.')}`, confirmLabel: tr('Odebrat'), danger: true })) {
          state.customAgents = (await api.removeCustomAgent(a.dataset.id)).agents;
          toast(tr('Agent odebraný'));
          update();
        }
      } else if (a.dataset.action === 'secret-remove') {
        if (await confirmDialog({ title: tr('Odebrat klíč'), message: tr('Klíč se smaže z Klíčenky a načítání nákladů se zastaví.'), confirmLabel: tr('Odebrat klíč'), danger: true })) {
          state.integrations = (await api.removeSecret(a.dataset.id)).integrations;
          toast(tr('Klíč odebrán'));
          update();
        }
      }
    } catch (err) {
      a.disabled = false;
      toast(err.message, { tone: 'err' });
    }
  });

  el.addEventListener('change', async (e) => {
    if (!e.target.matches('[data-done-min]')) return;
    try {
      state.settings = (await api.saveSettings({ notifications: { doneMinSeconds: Number(e.target.value) } })).settings;
      toast(tr('Uloženo'));
    } catch (err) {
      toast(err.message, { tone: 'err' });
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
        toast(tr('Licence {0} je aktivní. Děkujeme!', state.license.planLabel));
        update();
      } catch (err) {
        input.setAttribute('aria-invalid', 'true');
        input.insertAdjacentHTML('afterend', `<span class="field-error" role="alert">${esc(err.message)}</span>`);
        btn.disabled = false;
      }
      return;
    }
    const custom = e.target.closest('[data-custom-form]');
    if (custom) {
      e.preventDefault();
      const btn = custom.querySelector('button[type="submit"]');
      const values = { name: custom.elements.name.value, type: custom.elements.type.value, url: custom.elements.url.value };
      btn.disabled = true;
      v.customError = '';
      v.customDraft = values;
      try {
        state.customAgents = (await api.addCustomAgent(values)).agents;
        v.customDraft = null;
        toast(tr('Agent přidaný. Stav se obnovuje každou půlminutu.'));
        update();
      } catch (err) {
        // Hláška patří do stavu pohledu – karta se překresluje i sama, když dorazí nový stav agentů.
        v.customError = err.message;
        update();
        v.el?.querySelector('[data-custom-form] input[name="url"]')?.focus();
      } finally {
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
      toast(tr('Klíč je uložený v Klíčence'));
      update();
    } catch (err) {
      toast(err.message, { tone: 'err' });
    } finally {
      btn.disabled = false;
    }
  });
}

async function toggleSetting(sw) {
  const key = sw.dataset.setting;
  const next = sw.getAttribute('aria-checked') !== 'true';
  if (key === 'browser' && next) {
    if (!('Notification' in window)) { toast(tr('Tento prohlížeč oznámení nepodporuje.'), { tone: 'err' }); return; }
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') { toast(tr('Prohlížeč oznámení nepovolil. Povol je v nastavení webu.'), { tone: 'err' }); return; }
  }
  sw.setAttribute('aria-checked', String(next));
  // Přístup z domácí sítě není jen nastavení – otevírá a zavírá spojení, takže má vlastní endpoint
  // a čeká se na skutečný výsledek (listener mohl selhat, třeba když je port obsazený).
  if (key === 'cloudSync') {
    try {
      state.ucet = (await api.ucetSynchronizace(next)).ucet;
      v.nahled = '';
      toast(next ? tr('Souhrny se synchronizují do účtu.') : tr('Synchronizace je vypnutá a souhrny jsou z účtu smazané.'));
    } catch (err) {
      sw.setAttribute('aria-checked', String(!next));
      toast(err.message, { tone: 'err' });
    }
    update();
    return;
  }
  if (key === 'lanAccess' || key === 'tailscaleAccess') {
    const tailscale = key === 'tailscaleAccess';
    try {
      state.lan = (await (tailscale ? api.setTailscaleAccess(next) : api.setLanAccess(next))).lan;
      v.pin = null;
      const zap = tailscale ? tr('Přístup přes Tailscale je zapnutý. Vytvoř kód a zadej ho v telefonu.') : tr('Přístup z telefonu je zapnutý. Vytvoř kód a zadej ho v telefonu.');
      const vyp = state.lan?.enabled || state.lan?.tailscale?.enabled
        ? tr('Vypnuto. Druhá cesta i spárované telefony zůstávají.')
        : tr('Vypnuto, zařízení odpárována.');
      toast(next ? zap : vyp);
      update();
    } catch (err) {
      sw.setAttribute('aria-checked', String(!next));
      toast(err.message, { tone: 'err' });
    }
    return;
  }
  try {
    state.settings = (await api.saveSettings({ notifications: { [key]: next } })).settings;
    toast(tr('Uloženo'));
  } catch (err) {
    sw.setAttribute('aria-checked', String(!next));
    toast(err.message, { tone: 'err' });
  }
}

async function setAppearance(value) {
  const next = normalizeAppearance(value);
  const previous = normalizeAppearance(state.settings?.appearance);
  if (next === previous) return;
  applyAppearance(next);
  try {
    state.settings = (await api.saveSettings({ appearance: next })).settings;
    applyAppearance(state.settings.appearance, { persist: true });
    toast(next === 'system' ? tr('Vzhled se řídí nastavením macOS') : next === 'dark' ? tr('Tmavý vzhled je zapnutý') : tr('Světlý vzhled je zapnutý'));
    update();
  } catch (err) {
    applyAppearance(previous);
    toast(`${tr('Vzhled se neuložil:')} ${err.message}`, { tone: 'err' });
  }
}

// Texty vznikají už při načtení modulu (public/js/i18n.js), takže změna jazyka stránku znovu
// načte – server pak vydá <html lang> podle nově uloženého nastavení (src/http.js).
async function setLanguage(value) {
  const next = value === 'en' ? 'en' : 'cs';
  if (next === jazyk()) return;
  try {
    await api.saveSettings({ language: next });
    location.reload();
  } catch (err) {
    toast(`${tr('Jazyk se neuložil:')} ${err.message}`, { tone: 'err' });
  }
}

async function connectClaude() {
  const h = state.integrations?.claudeHooks;
  const ok = await modal({
    title: tr('Zapnout propojení s Claude Code'),
    submitLabel: tr('Zapnout propojení'),
    body: `<p class="modal-text">${tr('Agenteeq zapíše do nastavení Claude Code dvě věci: krátké příkazy, které mu dají vědět o každé změně (začátek práce, dokončení, žádost o povolení), a informační řádek pod zadáním s limity předplatného. Vše zůstává jen na tomto Macu a Claude Code to nikdy nezpomalí.')}</p>
      <ul class="checklist"><li>${tr('Původní nastavení se uloží jako záloha.')}</li><li>${tr('Tvoje ostatní nastavení zůstane beze změny. Vlastní informační řádek, pokud ho máš, nepřepíšeme.')}</li><li>${tr('Pod zadáním v Claude Code uvidíš: „Agenteeq · 5 h 34 % · týden 12 % · kontext 41 %“.')}</li><li>${tr('Platí pro nově otevřené konverzace v Claude Code.')}</li></ul>${h?.path ? `<p class="small muted">${tr('Soubor:')} ${esc(h.path)}</p>` : ''}`,
  });
  if (!ok) return;
  state.integrations.claudeHooks = (await api.hooks('install')).claudeHooks;
  toast(tr('Propojení s Claude Code je zapnuté. Platí pro nově otevřené konverzace.'));
  update();
}

// Účet Agenteeq (src/ucet.js). Co se do účtu dostane, stojí přímo u tlačítka – ne až v zásadách.
const UCET_SOUKROMI = tr('Z Googlu si Agenteeq vezme jen jméno a e-mail. Konverzace, kód ani názvy složek tenhle Mac neopustí.');
// Synchronizace souhrnů (src/cloud-sync.js): přepínač, kdy naposledy odešla a přesně co odchází.
function syncBlock(u) {
  const s = u.sync || { zapnuto: false };
  const stav = s.zapnuto
    ? `<p class="set-desc">${s.posledni ? `${tr('Naposledy odesláno')} <span data-ago="${s.posledni}">${rel(s.posledni)}</span>.` : tr('Zatím nic neodešlo.')}</p>
      ${s.chyba ? `<p class="form-error form-error--inline" role="alert">${esc(s.chyba)}</p>` : ''}`
    : '';
  return `<div class="set-divider"></div>
    ${switchRow({ key: 'cloudSync', label: tr('Synchronizovat souhrny do účtu'), desc: tr('Tokeny po dnech, útrata po měsících, limity a počty agentů – uvidíš je i na webu. Nikdy text, názvy konverzací ani složky. Vypnutím se z účtu smažou.'), checked: s.zapnuto, disabled: u.stav !== 'prihlaseno' })}
    ${stav}
    ${fold('nahled', tr('Co přesně posíláme'), `<pre class="account-preview">${esc(v.nahled || tr('Načítám…'))}</pre>`)}`;
}

function accountCard() {
  const u = state.ucet;
  const chyba = u.chyba ? `<p class="form-error form-error--inline" role="alert">${esc(u.chyba)}</p>` : '';
  if (u.stav === 'prihlaseno' || u.stav === 'nedostupne') {
    const nedostupne = u.stav === 'nedostupne';
    return `${head(ICON.cloud, tr('Účet Agenteeq'), nedostupne ? tr('Přihlášení teď nejde ověřit – server účtů neodpovídá. Zkusíme to znovu za pár minut, nic se neztratí.') : tr('Přihlášení je aktivní. Agenteeq funguje stejně jako bez účtu, jen ví, že jsi to ty.'),
      stateBadge(nedostupne ? 'unavailable' : 'connected', nedostupne ? tr('Nedostupné') : tr('Přihlášeno')))}
      <div class="account-who"><span class="account-avatar" aria-hidden="true">${esc(initials(u.jmeno || u.email || '?'))}</span>
        <div><b>${esc(u.jmeno || u.email)}</b>${u.jmeno && u.email ? `<span>${esc(u.email)}</span>` : ''}</div></div>
      ${u.trvale ? '' : `<p class="set-note">${tr('Přihlášení vydrží do zavření Agenteeq – mimo desktopovou aplikaci na Macu ho nemáme kam bezpečně uložit.')}</p>`}
      <p class="account-privacy">${ICON.shield}<span>${esc(UCET_SOUKROMI)}</span></p>
      ${syncBlock(u)}
      <div class="set-actions"><button class="btn btn--sm" type="button" data-action="ucet-odhlasit">${tr('Odhlásit se')}</button>
        <button class="btn btn--sm btn--ghost-danger" type="button" data-action="ucet-smazat">${tr('Smazat účet')}</button></div>`;
  }
  if (u.stav === 'overuji') {
    return `${head(ICON.cloud, tr('Účet Agenteeq'), tr('Ověřuji uložené přihlášení…'), stateBadge('idle', tr('Ověřuji')))}`;
  }
  if (u.ceka) {
    return `${head(ICON.cloud, tr('Účet Agenteeq'), tr('Dokonči přihlášení v prohlížeči. Jakmile se přihlásíš, Agenteeq tě přivítá.'), stateBadge('idle', tr('Čeká na přihlášení')))}
      ${chyba}
      <div class="set-actions">${v.ucetUrl ? `<a class="btn btn--sm" href="${esc(v.ucetUrl)}" target="_blank" rel="noopener">${ICON.external}${tr('Otevřít přihlášení znovu')}</a>` : ''}
        <button class="btn btn--sm" type="button" data-action="ucet-zrusit">${tr('Zrušit')}</button></div>`;
  }
  return `${head(ICON.cloud, tr('Účet Agenteeq'), tr('Přihlas se, ať tě Agenteeq pozná na každém zařízení. Bez účtu funguje všechno dál.'), stateBadge('missing', tr('Nepřihlášeno')))}
    ${chyba}
    <p class="account-privacy">${ICON.shield}<span>${esc(UCET_SOUKROMI)}</span></p>
    <div class="set-actions"><button class="btn btn--primary" type="button" data-action="ucet-prihlasit">${tr('Přihlásit se přes Google')}</button></div>`;
}

// Napojené modely (public/js/napojeni-ui.js). Seznam se ptá nástrojů dodavatelů, proto se načítá
// jen při otevření Nastavení a po změně, ne s každým překreslením.
function nactiNapojeni() {
  if (v.napojeniNacita) return;
  v.napojeniNacita = true;
  api.napojeni()
    .then((r) => { v.napojeni = r.napojeni; v.napojeniChyba = ''; })
    .catch((err) => { v.napojeniChyba = err.status === 403 ? tr('Modely se napojují v Agenteeq na Macu.') : `${tr('Nepodařilo se zjistit, co je napojené:')} ${err.message}`; })
    .finally(() => { v.napojeniNacita = false; update(); });
}

function modelsCard() {
  const list = v.napojeni;
  return `${head(ICON.plug, tr('Napojené modely'), tr('Klikni na Napojit a přihlas se u dodavatele. Agenteeq sám pozná, až bude hotovo, a začne ukazovat práci, limity a spotřebu.'))}
    ${list ? `<ul class="model-list">${list.map(radekNapojeni).join('')}</ul>` : v.napojeniChyba ? `<p class="set-note">${esc(v.napojeniChyba)}</p>` : `<p class="set-desc">${tr('Zjišťuji, co je napojené…')}</p>`}
    <p class="account-privacy">${ICON.shield}<span>${tr('Přihlašuješ se vždy přímo u dodavatele. Agenteeq nevidí hesla ani klíče a z webových chatů si nebere text – jen jestli agent pracuje, nebo čeká.')}</span></p>`;
}

const head = (icon, title, desc, aside = '') => `<div class="set-card-head"><span class="icon-tile">${icon}</span><div><h3>${title}</h3>${desc ? `<p class="set-desc">${desc}</p>` : ''}</div>${aside}</div>`;

function update(topics) {
  if (v.el && v.napojeni && (topics?.has?.('napojeni') || topics?.has?.('integrations'))) nactiNapojeni();
  const el = v.el;
  const i = state.integrations;
  const n = state.settings?.notifications;
  if (!el || !i || !n) return;

  const appearance = normalizeAppearance(state.settings.appearance);
  const appearanceOption = (value, icon, label, desc) => `<button class="appearance-option" type="button" data-appearance="${value}" aria-pressed="${appearance === value}">
    <span class="appearance-icon">${icon}</span><span><strong>${label}</strong><small>${desc}</small></span>
  </button>`;
  fill(el, 'appearance', `
    ${head(ICON.sun, tr('Vzhled aplikace'), tr('Světlý vzhled je výchozí. Volba se uloží jen na tomto Macu a může sledovat nastavení systému.'))}
    <div class="appearance-options" role="group" aria-label="${tr('Vyber vzhled aplikace')}">
      ${appearanceOption('light', ICON.sun, tr('Světlý'), tr('Výchozí, jasný pracovní prostor'))}
      ${appearanceOption('dark', ICON.moon, tr('Tmavý'), tr('Klidný večerní režim s AA kontrastem'))}
      ${appearanceOption('system', ICON.system, tr('Podle systému'), tr('Automaticky podle macOS'))}
    </div>
    <div class="set-row-inline"><span><strong>${tr('Otevřít v prohlížeči')}</strong><small>${tr('Přehled se dá otevřít i v Safari nebo Chromu – hodí se na zvětšení, tisk nebo vývojářské nástroje. Odkaz platí jen pro tenhle Mac a jen do restartu aplikace.')}</small></span>
      <button class="btn btn--sm" type="button" data-action="browser-link">${tr('Zkopírovat odkaz')}</button></div>
    <div class="set-row-inline"><span><strong>${tr('Uspořádání karet')}</strong><small>${tr('Karty v pravém panelu detailu agenta a projektu si přesuneš tažením za úchyt nahoře. Pořadí se pamatuje.')}</small></span>
      <button class="btn btn--sm" type="button" data-action="reset-layout"${Object.keys(state.settings.layout || {}).length ? '' : ' disabled'}>${tr('Obnovit výchozí')}</button></div>`);

  const lang = jazyk();
  const langOption = (value, label) => `<button class="appearance-option" type="button" data-lang="${value}" aria-pressed="${lang === value}"><strong>${label}</strong></button>`;
  fill(el, 'language', `
    ${head(ICON.globe, tr('Jazyk aplikace'), tr('Změna jazyka stránku znovu načte.'))}
    <div class="appearance-options appearance-options--lang" role="group" aria-label="${tr('Vyber jazyk aplikace')}">
      ${langOption('cs', 'Čeština')}
      ${langOption('en', 'English')}
    </div>`);

  /* Propojení s Claude Code */
  const h = i.claudeHooks;
  const outdated = !h.error && (h.installed || h.partial) && !h.current;
  const claudeState = h.error ? ['error', tr('Chyba')] : h.installed && h.current ? ['connected', tr('Zapnuto')] : outdated ? ['missing', tr('Je potřeba obnovit')] : ['idle', tr('Vypnuto')];
  // Kdo Claude Code nemá, tuhle kartu vidět nepotřebuje – Agenteeq na něm nestojí.
  const maClaude = state.connectors.some((c) => c.id === 'claude-code' && c.state !== 'missing') || h.installed || h.partial;
  fill(el, 'claude', !maClaude ? '' : `
    ${head(glyph('anthropic'), tr('Propojení s Claude Code'),
      tr('Claude Code hned oznámí, že pracuje, čeká na tvé povolení nebo narazil na limit. Bez propojení se to Agenteeq dozví jen ze zpožděné historie.'),
      stateBadge(...claudeState))}
    ${h.error ? `<p class="form-error form-error--inline">${esc(h.error)}</p>` : ''}
    ${outdated ? `<p class="set-note">${tr('Propojení vzniklo ve starší verzi Agenteeq. Obnov ho, aby se zobrazovaly i limity předplatného.')}</p>` : ''}
    ${h.statusLine === 'foreign' ? `<p class="set-note">${tr('V Claude Code máš vlastní informační řádek pod zadáním, proto ho Agenteeq nemění. Přesné limity Claude se kvůli tomu nezobrazí.')}</p>` : ''}
    <div class="set-actions">${h.installed && h.current
      ? `<button class="btn" type="button" data-action="claude-disconnect">${tr('Vypnout propojení')}</button>`
      : `<button class="btn btn--primary" type="button" data-action="claude-connect">${outdated ? tr('Obnovit propojení') : tr('Zapnout propojení')}</button>`}</div>`);

  /* Rozšíření pro Chrome */
  const web = state.connectors.find((c) => c.id === 'web');
  const ext = i.extension || {};
  const sites = ext.sites || {};
  const paired = Boolean(ext.state && ext.state !== 'missing');
  const EXT_BADGE = { active: ['connected', tr('Aktivní')], ready: ['connected', tr('Připojeno')], quiet: ['idle', tr('Neozývá se')], missing: ['missing', tr('Nenainstalováno')] };
  const badge = ext.outdated ? ['idle', tr('Obnov rozšíření')] : ext.repair ? ['missing', tr('Spáruj znovu')] : EXT_BADGE[ext.state] || EXT_BADGE.missing;
  const seen = ext.seenAt ? `<span data-ago="${ext.seenAt}">${rel(ext.seenAt)}</span>` : '';
  const statusLine = {
    active: tr('Rozšíření {0} právě čte otevřenou konverzaci.', esc(ext.version)),
    ready: tr('Rozšíření {0} je připojené, naposledy se ozvalo {1}. Jakmile otevřeš konverzaci v Chromu, objeví se v přehledu.', esc(ext.version || ''), seen),
    quiet: `${tr('Rozšíření je spárované, ale naposledy se ozvalo {0}. Chrome je zavřený, nebo je rozšíření vypnuté v', seen)} <code>chrome://extensions</code>.`,
  }[ext.state];
  const installSteps = `<ol class="steps">
      <li>${tr('V Chromu otevři adresu')} <code>chrome://extensions</code> ${tr('a vpravo nahoře zapni')} <b>${tr('Režim pro vývojáře')}</b>.
        <div class="code-line"><code>chrome://extensions</code><button class="btn btn--sm btn--on-dark" type="button" data-copy="chrome://extensions" data-copy-message="${tr('Adresa zkopírována – vlož ji do Chromu')}">${ICON.copy}${tr('Kopírovat')}</button></div></li>
      <li>${tr('Klikni na')} <b>${tr('Načíst rozbalené')}</b> ${tr('a vyber tuto složku. Leží mimo aplikaci, takže ji aktualizace Agenteeq nerozbije:')}
        <div class="code-line"><code>${esc(ext.path)}</code><button class="btn btn--sm btn--on-dark" type="button" data-copy="${esc(ext.path)}" data-copy-message="${tr('Cesta zkopírována')}">${ICON.copy}${tr('Kopírovat')}</button></div></li>
      <li>${tr('Připni si ikonu Agenteeq v liště Chromu (dílek skládačky), otevři ji a vlož jednorázový kód:')}
        <div class="set-actions"><button class="btn btn--primary" type="button" data-action="extension-pair-code">${tr('Vytvořit jednorázový kód')}</button></div>
        ${v.pairCode ? `<div class="code-line"><code class="secret">${esc(v.pairCode.code)}</code><button class="btn btn--sm btn--on-dark" type="button" data-copy="${esc(v.pairCode.code)}" data-copy-message="${tr('Jednorázový kód zkopírován')}">${ICON.copy}${tr('Kopírovat kód')}</button></div><p class="set-note">${tr('Platí do {0} a po spárování se automaticky zneplatní.', new Date(v.pairCode.expiresAt).toLocaleTimeString(LOCALE, { hour: '2-digit', minute: '2-digit' }))}</p>` : ''}</li>
    </ol>`;
  fill(el, 'extension', `
    ${head(ICON.spark, tr('Rozšíření pro Chrome'),
      tr('Agenti z prohlížeče (ChatGPT, Gemini, Claude.ai a další) se objeví v přehledu se stavem i přepisem a zadání ze „Spustit agenta“ se vloží rovnou do okna služby. Data jdou jen do Agenteeq na tomto Macu – nic neodchází na internet.'),
      stateBadge(...badge))}
    <ul class="site-chips" aria-label="${tr('Podporované webové služby')}">${Object.entries(sites).map(([k, site]) => webChip(k, site, web, Date.now())).join('')}</ul>
    ${ext.repair ? `<p class="set-note set-note--warn">${tr('Rozšíření je potřeba spárovat znovu. Každý prohlížeč teď dostává vlastní přístupový klíč a ten dřívější přestal platit. Vytvoř jednorázový kód a vlož ho do rozšíření.')}</p>` : ''}
    ${ext.outdated ? `<p class="set-note set-note--warn">${tr('V Chromu běží rozšíření {0}, aplikace má {1}. Otevři', esc(ext.version), esc(ext.expectedVersion))} <code>chrome://extensions</code> ${tr('a u Agenteeq klikni na šipku obnovení ↻.')}</p>` : ''}
    ${statusLine ? `<p class="ext-status">${statusLine}</p>` : ''}
    ${paired ? fold('ext', tr('Instalace a spárování znovu'), installSteps, { cls: 'ext-reinstall' }) : installSteps}
    <p class="small muted">${tr('Rozšíření se instaluje v režimu pro vývojáře, dokud nebude v Chrome Web Store. Funguje i v Brave, Arcu a Edge.')}</p>`);
  // Přišel sem odkaz z průvodce, prvních kroků nebo „Co je nového“ – ukázat kartu rozšíření.
  onJump();

  /* Zdroje agentů: jeden seznam, ne mřížka karet. Nalezené nahoře, nenalezené a doplňkové sbalené. */
  const dle = (ids) => ids.map((id) => state.connectors.find((c) => c.id === id)).filter(Boolean);
  const zdroje = dle(SOURCE_IDS);
  const nalezene = zdroje.filter((c) => c.state !== 'missing');
  const nenalezene = zdroje.filter((c) => c.state === 'missing');
  const doplnky = dle(EXTRA_IDS);
  fill(el, 'connectors', `
    ${head(ICON.plug, tr('Zdroje agentů'), tr('Odkud Agenteeq čte práci agentů na tomto Macu. Nový nástroj se přidá sám, jakmile ho poprvé použiješ.'),
      `<button class="btn btn--sm" type="button" data-action="rescan">${ICON.refresh}${tr('Načíst znovu')}</button>`)}
    ${nalezene.length ? `<ul class="src-list">${nalezene.map(sourceRow).join('')}</ul>` : `<p class="set-note">${tr('Zatím nebyl nalezen žádný agent. Spusť třeba Claude Code, Codex nebo Cursor a objeví se tady.')}</p>`}
    ${nenalezene.length ? fold('missing', tr('Nenalezeno na tomto Macu'), `<ul class="src-list">${nenalezene.map(sourceRow).join('')}</ul>`, { count: nenalezene.length }) : ''}
    ${doplnky.length ? fold('extra', tr('Doplňková data'), `<ul class="src-list">${doplnky.map(sourceRow).join('')}</ul>`, { count: doplnky.length }) : ''}`);

  /* Soukromí */
  fill(el, 'privacy', privacyCard());

  /* Vlastní agenti */
  fill(el, 'phone', phoneCard());
  fill(el, 'tailscale', tailscaleCard());
  fill(el, 'remote', remoteCard());
  fill(el, 'custom', customAgentsCard());

  /* Upozornění */
  fill(el, 'notifications', `
    ${head(ICON.bell, tr('Kdy a jak tě upozornit'), '', `<button class="btn btn--sm" type="button" data-action="test-alert">${tr('Poslat zkušební')}</button>`)}
    ${switchRow({ key: 'native', label: tr('Oznámení v macOS'), desc: i.nativeNotify ? tr('Přijdou i se zavřeným prohlížečem, dokud Agenteeq běží.') : tr('Na tomto systému nejsou dostupná.'), checked: n.native && i.nativeNotify, disabled: !i.nativeNotify })}
    ${i.desktop ? '' : switchRow({ key: 'browser', label: tr('Oznámení v prohlížeči'), desc: tr('Když máš Agenteeq otevřené na pozadí.'), checked: n.browser })}
    <div class="set-divider"></div>
    ${switchRow({ key: 'needsInput', label: tr('Agent potřebuje tvé rozhodnutí'), desc: tr('Povolení akce, otázka, schválení plánu nebo selhané spuštění.'), checked: n.needsInput })}
    ${switchRow({ key: 'limits', label: tr('Docházející limit předplatného'), desc: tr('Při 80 %, 95 % a vyčerpání.'), checked: n.limits })}
    ${switchRow({ key: 'limitReset', label: tr('Obnovený limit'), desc: tr('Když se obnoví 5hodinový nebo týdenní limit – víš, že můžeš zase naplno zadávat úkoly.'), checked: n.limitReset !== false })}
    ${switchRow({ key: 'budget', label: tr('Rozpočet'), desc: tr('Při 80 % a 100 % měsíčního rozpočtu útraty i tokenů projektu.'), checked: n.budget })}
    ${switchRow({ key: 'done', label: tr('Dokončený úkol'), desc: tr('Když agent dokončí zadaný úkol.'), checked: n.done })}
    <label class="field field--row"><span>${tr('Hlásit dokončené úkoly')}</span>
      <select data-done-min${n.done ? '' : ' disabled'}>${DONE_OPTIONS.map(([s, l]) => `<option value="${s}"${n.doneMinSeconds === s ? ' selected' : ''}>${l}</option>`).join('')}</select></label>`);

  /* Napojené modely */
  fill(el, 'models', modelsCard());

  /* Účet Agenteeq */
  const ucetEl = el.querySelector('[data-region="account"]');
  if (ucetEl) ucetEl.hidden = !state.ucet || state.ucet.stav === 'nenastaveno';
  if (ucetEl && !ucetEl.hidden) fill(el, 'account', accountCard());

  /* Profil */
  const current = state.settings.avatar;
  const who = state.host?.fullName || state.host?.user || '';
  fill(el, 'profile', `
    ${head(hasAvatar(current) ? `<span class="avatar-mini">${avatarSvg(current)}</span>` : ICON.spark, tr('Profilový obrázek'), tr('Rychlá změna: v postranním panelu na obrázek najeď a klikni – pokaždé se ukáže jiný.'))}
    <div class="avatar-grid" role="group" aria-label="${tr('Vyber profilový obrázek')}">
      <button class="avatar-pick" type="button" data-avatar-pick="i" aria-pressed="${!hasAvatar(current)}" aria-label="${tr('Iniciály')}">${esc(initials(who || 'Agenteeq'))}</button>
      ${Array.from({ length: AVATAR_COUNT }, (_, k) => `<button class="avatar-pick" type="button" data-avatar-pick="${k}" aria-pressed="${current === k}" aria-label="${tr('Abstraktní obrázek')} ${k + 1}">${avatarSvg(k)}</button>`).join('')}
    </div>`);

  /* Licence */
  const lic = state.license;
  if (lic) {
    const locked = Object.entries(lic.paidFeatures || {});
    const expires = lic.license?.expiresAt ? new Date(lic.license.expiresAt).toLocaleDateString(LOCALE) : tr('bez omezení');
    fill(el, 'license', `
      ${head(ICON.key, tr('Licence'), lic.valid ? `Agenteeq ${esc(lic.planLabel)} pro ${esc(lic.license.name)}.` : locked.length ? tr('Verze Zdarma. Licence Pro odemkne placené funkce.') : tr('Všechny funkce jsou teď odemčené. Licenční klíč si schovej pro budoucí verze.'),
        stateBadge(lic.valid ? 'connected' : lic.expired ? 'missing' : 'idle', lic.valid ? lic.planLabel : lic.expired ? tr('Vypršela') : tr('Zdarma')))}
      ${lic.valid ? `<dl class="facts">
          <div><dt>${tr('Držitel')}</dt><dd>${esc(lic.license.name)}</dd></div>
          <div><dt>E-mail</dt><dd>${esc(lic.license.email)}</dd></div>
          <div><dt>${tr('Počet míst')}</dt><dd>${lic.license.seats}</dd></div>
          <div><dt>${tr('Platnost')}</dt><dd>${esc(expires)}</dd></div>
          <div class="wide"><dt>${tr('Klíč')}</dt><dd class="mono-sm">${esc(lic.maskedKey)}</dd></div>
        </dl>
        <div class="set-actions"><button class="btn btn--sm" type="button" data-action="license-remove">${tr('Odebrat licenci')}</button></div>`
      : `${lic.hasKey && lic.reason ? `<p class="form-error form-error--inline">${esc(lic.reason)}</p>` : ''}
        ${locked.length ? `<ul class="checklist checklist--locked">${locked.map(([k, plan]) => `<li>${esc(FEATURE_LABEL[k] || k)} <span class="badge">${esc(lic.plans?.[plan]?.label || plan)}</span></li>`).join('')}</ul>` : ''}
        <form class="key-form key-form--stack" data-license-form novalidate>
          <label class="sr-only" for="license-key">${tr('Licenční klíč')}</label>
          <input id="license-key" name="key" type="text" autocomplete="off" spellcheck="false" placeholder="${tr('Licenční klíč, začíná AGT1.')}">
          <button class="btn btn--sm btn--primary" type="submit">${tr('Aktivovat')}</button>
        </form>`}`);
  }

  /* Náklady za API */
  fill(el, 'cloud', `
    ${head(ICON.wallet, tr('Skutečné náklady za API <span class="badge">Zkušební</span>'),
      `${tr('Platíte za API (ne jen předplatné)? Správcovský klíč organizace doplní skutečné náklady do grafů a rozpočtů.')} ${i.keychain ? tr('Klíč se uloží do Klíčenky macOS a prohlížeč ho už neuvidí.') : tr('Klíčenka tu není dostupná – klíč nastav proměnnou prostředí.')}`)}
    ${CLOUD.map(([id, label, provider, placeholder, desc]) => {
      const c = i.cloud?.[id] || { state: 'missing' };
      return `<div class="key-row">
        <div class="key-head">${glyph(provider)}<strong>${esc(label)} ${tr('– správcovský klíč')}</strong>${stateBadge(c.state, c.state === 'missing' ? tr('Nepřipojeno') : STATE_LABEL[c.state] || c.state)}</div>
        <p class="set-desc">${esc(c.state === 'error' ? c.detail : desc)}</p>
        ${c.source === 'env'
          ? `<p class="small muted">${tr('Klíč je nastavený proměnnou prostředí.')}</p>`
          : `<form class="key-form" data-secret-form="${id}"><label class="sr-only" for="key-${id}">${esc(label)} ${tr('– správcovský klíč')}</label><input id="key-${id}" name="value" type="password" autocomplete="off" spellcheck="false" placeholder="${esc(placeholder)}"${i.keychain ? '' : ' disabled'}>
            <button class="btn btn--sm" type="submit"${i.keychain ? '' : ' disabled'}>${tr('Uložit')}</button>${c.state !== 'missing' ? `<button class="btn btn--sm" type="button" data-action="secret-remove" data-id="${id}">${tr('Odebrat')}</button>` : ''}</form>`}
      </div>`;
    }).join('')}`);

  /* Aplikace na tomto Macu */
  const inst = i.install || {};
  const auto = i.autostart || { supported: false };
  fill(el, 'system', `
    ${head(ICON.terminal, tr('Spouštění po přihlášení'),
      i.desktop ? tr('Zavřením okna zůstane Agenteeq na pozadí. Vrátíš se ikonou v Docku nebo v horní liště. Pro start po přihlášení přidej Agenteeq v Nastavení systému → Obecné → Přihlašovací položky.') : tr('Aby upozornění chodila vždy, nech Agenteeq spouštět automaticky po přihlášení. Když nečekaně spadne, znovu se zapne.'),
      i.desktop ? stateBadge('connected', tr('Aplikace pro Mac')) : auto.supported ? stateBadge(auto.installed ? 'connected' : 'idle', auto.installed ? tr('Zapnuto') : tr('Vypnuto')) : stateBadge('unavailable', tr('Jen macOS')))}
    ${auto.supported ? `<div class="set-actions">${auto.installed
      ? `<button class="btn" type="button" data-action="autostart-uninstall">${tr('Vypnout spouštění po přihlášení')}</button>`
      : `<button class="btn btn--primary" type="button" data-action="autostart-install">${tr('Spouštět po přihlášení')}</button>`}</div>
    <details class="details"><summary>${tr('Raději přes Terminál?')}</summary><div class="code-line"><code>${esc(auto.command || '')}</code><button class="btn btn--sm btn--on-dark" type="button" data-copy="${esc(auto.command || '')}" data-copy-message="${tr('Příkaz zkopírován – vlož ho do Terminálu')}">${ICON.copy}${tr('Kopírovat')}</button></div></details>` : ''}
    <dl class="facts facts--row">
      <div><dt>${tr('Verze')}</dt><dd>${esc(state.version)}</dd></div>
      <div><dt>${tr('Data aplikace')}</dt><dd>${esc((inst.dataDir || '~/.agenteeq').replace(/^\/Users\/[^/]+/, '~'))}</dd></div>
      <div><dt>${tr('Historie')}</dt><dd>${tr('posledních {0} dní', state.windowDays)}</dd></div>
      <div><dt>${tr('Soukromí')}</dt><dd>${tr('vše zůstává na tomto Macu')}</dd></div>
    </dl>`);

  const packCmd = 'npm run pack';
  const installCmd = `npm install -g ./agenteeq-${state.version}.tgz`;
  const pkg = inst.package;
  // Nástroj pro vydavatele: ukáže instalační balíček vzniklý buildem na TOMTO Macu. Zákazník žádný
  // balíček nemá a `npm pack` s cestami ve složce vývojáře by mu nic neříkaly – karta se tam nezobrazí.
  fill(el, 'share', !pkg ? '' : `
    ${head(ICON.external, tr('Instalace pro další lidi'), tr('Každý si Agenteeq nainstaluje na svůj Mac a propojí vlastní agenty a předplatná. Data nikam neodcházejí a nejsou svázaná s tvým účtem.'))}
    ${i.desktop ? (pkg ? `
      <p class="set-desc">${tr('Předej příjemci tento instalační ZIP Agenteeq pro Mac. Rozbalí ho a přesune Agenteeq do Aplikací; Node.js je součástí balíčku. Pro veřejnou distribuci použij podepsané a notarizované vydání.')}</p>
      <dl class="facts">
        <div><dt>${tr('Soubor')}</dt><dd>${esc(pkg.name)}</dd></div>
        <div><dt>${tr('Velikost')}</dt><dd>${(pkg.size / 1e6).toFixed(1)} MB</dd></div>
        <div><dt>${tr('Vytvořeno')}</dt><dd>${esc(dateLong(pkg.createdAt))}</dd></div>
      </dl>
      <div class="set-actions">
        <button class="btn btn--primary" type="button" data-action="reveal-install-package">${tr('Ukázat ve Finderu')}</button>
        <button class="btn btn--sm" type="button" data-copy="${esc(pkg.path)}" data-copy-message="${tr('Cesta k balíčku zkopírována')}">${ICON.copy}${tr('Kopírovat cestu')}</button>
      </div>` : `
      <p class="set-desc">${tr('Pošli příjemci samotnou aplikaci: ve Finderu na ni klikni pravým tlačítkem, zvol')} <b>${tr('Komprimovat')}</b> ${tr('a vzniklý ZIP předej. Node.js je uvnitř, příjemce nic doinstalovávat nemusí. Pro veřejnou distribuci použij podepsané a notarizované vydání.')}</p>
      <dl class="facts">
        <div class="wide"><dt>${tr('Aplikace')}</dt><dd class="mono-sm">${esc((i.install?.root || '').replace(/\/Contents\/Resources\/app$/, ''))}</dd></div>
        <div><dt>${tr('Verze')}</dt><dd>${esc(state.version)}</dd></div>
      </dl>
      <div class="set-actions">
        <button class="btn btn--primary" type="button" data-action="reveal-install-package">${tr('Ukázat ve Finderu')}</button>
        <button class="btn btn--sm" type="button" data-copy="${esc((i.install?.root || '').replace(/\/Contents\/Resources\/app$/, ''))}" data-copy-message="${tr('Cesta k aplikaci zkopírována')}">${ICON.copy}${tr('Kopírovat cestu')}</button>
      </div>`) : `<ol class="steps">
      <li>${tr('Ve složce Agenteeq vytvoř instalační balíček:')}<div class="code-line"><code>${esc(packCmd)}</code><button class="btn btn--sm btn--on-dark" type="button" data-copy="${esc(packCmd)}">${ICON.copy}${tr('Kopírovat')}</button></div></li>
      <li>${tr('Pošli soubor')} <code>dist/agenteeq-${esc(state.version)}.tgz</code>${tr('. Příjemce potřebuje Node.js 22.13 nebo novější a v Terminálu spustí:')}<div class="code-line"><code>${esc(installCmd)}</code><button class="btn btn--sm btn--on-dark" type="button" data-copy="${esc(installCmd)}">${ICON.copy}${tr('Kopírovat')}</button></div></li>
      <li>${tr('Aplikaci otevře příkazem')} <code>agenteeq --open</code>${tr('. Průvodce ho provede propojením.')}</li>
    </ol>
    <p class="small muted">${tr('Podrobný návod pro zákazníky je v souboru docs/INSTALL.md.')}</p>`}`);
}

export default {
  id: 'nastaveni',
  title: tr('Nastavení'),
  mount,
  update,
  unmount: () => {
    window.removeEventListener('agenteeq-jump', onJump);
    Object.assign(v, { el: null, ukazSkupinu: null, napojeni: null });
  },
};
