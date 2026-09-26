import { esc, rel, fmtTok, fmtMoney, STATUS, DAY, resetsLabel } from './format.js';
import { ICON, glyph } from './icons.js';
import { gauge } from './charts.js';
import { sessionTotal } from './data.js';
import { tr, LOCALE } from './i18n.js';

export function fill(root, name, html) {
  const el = root.querySelector(`[data-region="${name}"]`);
  if (!el || el._html === html) return false;
  el.innerHTML = html;
  el._html = html;
  oznacRolovani();
  return true;
}

/* ---------- Vodorovné rolování: dát najevo, že řádek pokračuje ---------- */
//
// Segmentované přepínače se na úzkém okně rolují vodorovně a posuvník je schovaný. Bez
// další značky se poslední popisek useknul uprostřed slova („Od největ“) a vypadalo to
// jako chyba sazby, ne jako „vpravo je toho víc“. Značky zapnou měkké doznění na té
// straně, kam se dá ještě posunout – když se vejde všechno, nekreslí se nic, jinak by
// doznění zbytečně stmívalo krajní tlačítko.

function znacky(el) {
  const zbyva = el.scrollWidth - el.clientWidth;
  el.classList.toggle('je-vlevo', zbyva > 1 && el.scrollLeft > 1);
  el.classList.toggle('je-vpravo', zbyva > 1 && el.scrollLeft < zbyva - 1);
}

let naplanovano = false;
export function oznacRolovani() {
  // Mimo prohlížeč (testy nad těmito moduly běží v Node) není co značit.
  if (typeof document === 'undefined' || typeof requestAnimationFrame !== 'function') return;
  if (naplanovano) return;
  naplanovano = true;
  // Po vložení HTML ještě neproběhlo rozvržení; měřit hned by dalo scrollWidth starého obsahu.
  requestAnimationFrame(() => {
    naplanovano = false;
    for (const el of document.querySelectorAll('.seg')) {
      if (!el._rolovani) {
        el._rolovani = true;
        el.addEventListener('scroll', () => znacky(el), { passive: true });
      }
      znacky(el);
    }
  });
}

if (typeof window !== 'undefined') window.addEventListener('resize', oznacRolovani, { passive: true });

/* ---------- Animovaná čísla ---------- */

const tweenMemory = new Map();
const formatter = (fmt) => (fmt?.startsWith('money:') ? (v) => fmtMoney(v, fmt.slice(6)) : fmt === 'tok' ? fmtTok : (v) => String(Math.round(v)));

export const tween = (key, value, fmt = 'int') =>
  `<span data-tween="${esc(key)}" data-fmt="${esc(fmt)}" data-value="${Number(value) || 0}">${esc(formatter(fmt)(tweenMemory.get(key) ?? value))}</span>`;

export function tweenAll(root) {
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  for (const el of root.querySelectorAll('[data-tween]')) {
    const to = Number(el.dataset.value) || 0;
    if (el._tweenTo === to) continue;
    el._tweenTo = to;
    const key = el.dataset.tween;
    const fmt = formatter(el.dataset.fmt);
    const from = tweenMemory.has(key) ? tweenMemory.get(key) : 0;
    tweenMemory.set(key, to);
    if (reduce || from === to) {
      el.textContent = fmt(to);
      continue;
    }
    const t0 = performance.now();
    const d = from === 0 ? 900 : 600;
    const step = (t) => {
      const p = Math.min(1, (t - t0) / d);
      el.textContent = fmt(from + (to - from) * (1 - (1 - p) ** 3));
      if (p < 1 && el.isConnected) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }
}

/* ---------- Nástup obrazovky: čísla vyjedou do okének ---------- */

// Číslice písma Urbanist nemají stejnou šířku (tabulkové číslice písmo neumí), takže obyčejné
// napočítávání by číslem cukalo do stran. Při nástupu proto každá číslice dostane okénko o šířce
// své konečné podoby a vyjede v něm jako na válečku počítadla.
// Každý řád se otočí tolikrát, kolikrát by se otočil při skutečném napočítávání od nuly (nejvýš
// dvakrát, rychlejší točení už oko nerozliší), a všechny válečky jedou po stejné křivce jako
// ukazatel. Číslo tak v každém okamžiku čte zhruba tutéž hodnotu jako měřidlo vedle něj a nikdy
// nepřestřelí cíl. Políčko 0 je prázdné: řád, ke kterému napočítávání ještě nedošlo, nesvítí nulou,
// takže číslo vyjede z prázdna.
const ODO_OTACKY = 2;
export function odoSloupce(text) {
  const znaky = [...String(text)];
  const cislice = znaky.filter((z) => z >= '0' && z <= '9');
  let vlevo = 0;
  return znaky.map((znak) => {
    if (znak < '0' || znak > '9') return { znak };
    // Kolik celých otáček řád udělá = číslo tvořené číslicemi vlevo od něj (nejvýš ODO_OTACKY).
    const predpona = cislice.slice(0, vlevo).join('').replace(/^0+/, '');
    vlevo += 1;
    const otacky = predpona.length > 1 ? ODO_OTACKY : Math.min(ODO_OTACKY, Number(predpona || 0));
    const sled = [null];
    for (let j = 1; j <= otacky * 10 + Number(znak); j++) sled.push(j % 10);
    if (sled.length === 1) sled.push(0);
    return { znak, sled };
  });
}

// Bez mezer mezi značkami: z mezery mezi dvěma okénky by se stala mezera v čísle.
// Řády se usazují zprava doleva (--odo-r = řád od jednotek): kdyby desítky dojely k cíli dřív,
// než jednotky přetočí z devítky na nulu, četlo by se chvíli „79 %“ místo „70 %“.
export function odometrHtml(text) {
  const sloupce = odoSloupce(text);
  let rad = sloupce.filter((s) => s.sled).length;
  const kusy = sloupce.map(({ znak, sled }) => {
    if (!sled) return esc(znak);
    rad -= 1;
    return `<span class="odo" style="--odo-r:${Math.min(rad, 4)}"><span class="odo-f">${znak}</span><span class="odo-s" style="--n:${sled.length}">${sled.map((c) => `<span>${c ?? '&nbsp;'}</span>`).join('')}</span></span>`;
  }).join('');
  return `<span class="odo-cislo" aria-hidden="true">${kusy}</span><span class="sr-only">${esc(text)}</span>`;
}

// Čísla nově otevřené obrazovky: animovaná (tween), označená `data-odo` a hodnota uprostřed
// ukazatele. Animovaná čísla se tím rovnou dostanou do cíle, aby je tweenAll nerozpočítal podruhé.
export function nastupCisel(root) {
  const cisla = [];
  for (const el of root.querySelectorAll('[data-tween], [data-odo], .gauge-value:not(.gauge-value--text)')) {
    if (el.firstElementChild) continue;
    let text;
    if (el.dataset.tween) {
      const to = Number(el.dataset.value) || 0;
      tweenMemory.set(el.dataset.tween, to);
      el._tweenTo = to;
      text = formatter(el.dataset.fmt)(to);
    } else {
      text = el.textContent.trim();
    }
    if (!/\d/.test(text) || text.length > 24) continue;
    el.innerHTML = odometrHtml(text);
    el._odo = text;
    cisla.push(el);
  }
  return cisla;
}

// Po nástupu zpátky obyčejný text: dá se vybrat, zkopírovat a čtečka ho přečte jako celek.
export function dokonciCisla(cisla) {
  for (const el of cisla) if (el.isConnected && el._odo && el.querySelector(':scope > .odo-cislo')) el.textContent = el._odo;
}

/* ---------- Toasty, schránka ---------- */

// Jedna zpráva naráz: druhá vždy nahradí první, jinak by se pod sebou hromadily čtyři černé
// pruhy po rychlých klicích. Druh zprávy (ikona a barva) se odvozuje z `tone`:
//   ink (výchozí) = povedlo se, velvet/coral = chyba, info = poznámka bez úspěchu, action = upozornění agenta.
// Jeden název pro jeden druh zprávy. Dřív se pro červený toast používalo 'velvet', 'coral' i 'err'
// (zbytky po starších názvech barev značky) a nešlo poznat, jestli je v tom rozdíl.
const TOAST_KIND = { ink: 'ok', ok: 'ok', err: 'err', info: 'info', action: 'action' };
const TOAST_ICON = () => ({ ok: ICON.check, err: ICON.alert, info: ICON.info, action: ICON.bell });
let toastTimer = 0;

export function toast(message, { tone = 'ink', action, timeout = 4000 } = {}) {
  const box = document.getElementById('toasts');
  if (!box) return;
  // Neznámý tón raději jako poznámka: tvářit se jako úspěch by u chybové hlášky bylo zavádějící.
  const kind = TOAST_KIND[tone] || 'info';
  const prev = box.firstElementChild;
  clearTimeout(toastTimer);
  // Totéž hlášení znovu (třeba opakované „Nabídka obnovena“) jen zopakuje pohyb, nic se nemění.
  if (prev && !prev.classList.contains('is-leaving') && prev.dataset.kind === kind && prev.querySelector('.toast-text')?.textContent === message && !action && !prev.querySelector('.toast-action')) {
    prev.classList.remove('is-bump');
    void prev.offsetWidth;
    prev.classList.add('is-bump');
    if (timeout) toastTimer = setTimeout(() => prev.isConnected && prev.querySelector('.toast-close')?.click(), timeout);
    return;
  }
  box.replaceChildren();
  const el = document.createElement('div');
  el.className = `toast toast--${kind}`;
  el.dataset.kind = kind;
  el.setAttribute('role', kind === 'err' ? 'alert' : 'status');
  el.innerHTML = `<span class="toast-icon" aria-hidden="true">${TOAST_ICON()[kind]}</span><span class="toast-text">${esc(message)}</span>${action ? `<a class="toast-action" href="${esc(action.href)}">${esc(action.label)}</a>` : ''}<button class="toast-close" type="button" aria-label="${tr('Zavřít')}">${ICON.close}</button>`;
  const remove = () => {
    if (!el.isConnected || el.classList.contains('is-leaving')) return;
    el.classList.add('is-leaving');
    setTimeout(() => el.remove(), 240);
  };
  el.querySelector('.toast-close').addEventListener('click', remove);
  el.querySelector('.toast-action')?.addEventListener('click', remove);
  box.appendChild(el);
  if (timeout) toastTimer = setTimeout(remove, timeout);
}

export async function copy(text, message = tr('Zkopírováno do schránky')) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.cssText = 'position:fixed;opacity:0';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
  }
  toast(message);
}

/* ---------- Sdílené kousky UI ---------- */

export const statusPill = (status) => `<span class="pill" data-status="${esc(status)}"><i></i>${esc(STATUS[status]?.label || status)}</span>`;

export function kindLabel(kind) {
  if (kind === 'permission') return tr('Žádá o povolení');
  if (kind === 'question') return tr('Ptá se tě');
  if (kind === 'plan') return tr('Čeká na schválení plánu');
  return tr('Potřebuje tvé rozhodnutí');
}

export function howToAnswer(s) {
  if (s.source === 'web') return tr('Odpověz přímo v konverzaci v prohlížeči.');
  if (s.connector === 'claude-code') return tr('Otevři Claude nebo Terminál tlačítkem výše a odpověz v okně, kde konverzace běží.');
  if (s.connector === 'codex') return tr('Otevři vlákno v Codexu tlačítkem výše a odpověz tam.');
  if (s.connector === 'cursor') return tr('Potvrď akci v Cursoru.');
  if (s.connector === 'vscode-copilot') return tr('Potvrď akci v panelu Copilotu ve VS Code.');
  return tr('Odpověz v aplikaci, kde agent běží.');
}

export const agentHref = (id) => `#/agent/${encodeURIComponent(id)}`;

export function activityItem(s) {
  const meta = s.status === 'working' && s.activity
    ? `<span class="live-dot" aria-hidden="true"></span>${esc(s.activity)}`
    : `<span data-ago="${s.lastAt}">${rel(s.lastAt)}</span> · ${esc(s.app)}`;
  return `<li><a class="act-item" href="${agentHref(s.id)}">
    <span class="icon-tile">${glyph(s)}<i class="status-dot status-${esc(s.status)}"></i></span>
    <span class="act-text"><span class="act-title">${esc(s.title)}</span><span class="act-meta"><span class="sr-only">${esc(STATUS[s.status]?.label || '')}, </span>${meta}</span></span>
    <span class="act-value">${sessionTotal(s) ? fmtTok(sessionTotal(s)) : ''}</span>${ICON.chev}
  </a></li>`;
}

export function decisionCard(s) {
  const limited = s.status === 'limited';
  const failed = s.status === 'failed';
  const since = s.failure?.at || s.pending?.at || s.limit?.at || s.lastAt;
  return `<li class="decision${limited ? ' is-limit' : ''}">
    <span class="icon-tile">${glyph(s)}</span>
    <div class="decision-body">
      <span class="decision-kicker">${failed ? tr('Spuštění selhalo') : limited ? tr('Vyčerpaný limit') : kindLabel(s.pending?.kind)} · ${esc(s.app)} · <span data-ago="${since}">${rel(since)}</span></span>
      <a class="decision-title" href="${agentHref(s.id)}">${esc(s.title)}</a>
      <p class="decision-reason">${esc(s.reason)}</p>
    </div>
    <div class="decision-actions">
      ${s.open?.length ? openButtons(s, { small: true, max: 2 }) : `<a class="btn btn--sm btn--primary" href="${agentHref(s.id)}">${tr('Detail')}</a>`}
    </div>
  </li>`;
}

// Tlačítka „Otevřít v aplikaci / Pokračovat v Terminálu / Otevřít složku“ – nabídku sestavuje server (session.open).
export function openButtons(s, { small = false, max = 3 } = {}) {
  const labels = {
    'Otevřít v Codexu': tr('Otevřít v Codexu'),
    'Otevřít Claude': tr('Otevřít Claude'),
    'Otevřít v Cursoru': tr('Otevřít v Cursoru'),
    'Otevřít ve VS Code': tr('Otevřít ve VS Code'),
    'Otevřít konverzaci': tr('Otevřít konverzaci'),
    'Pokračovat v Terminálu': tr('Pokračovat v Terminálu'),
    'Otevřít složku': tr('Otevřít složku'),
  };
  const icons = { terminal: ICON.terminal, folder: ICON.folder };
  return (s.open || [])
    .slice(0, max)
    .map((t, i) => {
      const sourceLabel = String(t.label ?? '');
      const label = Object.hasOwn(labels, sourceLabel) ? labels[sourceLabel] : (sourceLabel.startsWith('Přepnout do ') ? tr('Přepnout do {0}', sourceLabel.slice(12)) : sourceLabel);
      const icon = t.id === 'app' ? glyph(s, { onDark: i === 0 }) : icons[t.id] || ICON.open;
      return `<button class="btn${small ? ' btn--sm' : ''}${i === 0 ? ' btn--primary' : ''}" type="button" data-open-target="${esc(t.id)}" data-session-id="${esc(s.id)}">${icon}${esc(label)}</button>`;
    })
    .join('');
}

export function legendHtml(series, { box = false } = {}) {
  return series
    .map((s) => `<button class="legend-item" type="button" data-legend="${esc(s.key)}" aria-pressed="${!s.hidden}"><i class="swatch${box ? ' swatch--box' : ''}" style="background:${s.stroke || s.color}"></i>${esc(s.label)}</button>`)
    .join('');
}

export function emptyState({ title, text = '', action = '' }) {
  return `<div class="empty"><span class="empty-mark" aria-hidden="true"><i></i><i></i><i></i></span><strong>${esc(title)}</strong>${text ? `<p>${text}</p>` : ''}${action}</div>`;
}

export function stateBadge(stateName, label) {
  return `<span class="state" data-state="${esc(stateName)}"><i></i>${esc(label)}</span>`;
}

export function alertIcon(a) {
  if (a.kind === 'needs_input' || a.kind === 'test') return ICON.hand;
  if (a.kind === 'limit' || a.kind === 'limit_near' || a.kind === 'failed' || a.kind === 'system') return ICON.alert;
  if (a.kind === 'limit_reset') return ICON.refresh;
  if (a.kind === 'budget') return ICON.wallet;
  if (a.kind === 'done') return ICON.check;
  return ICON.bell;
}

export function untilLabel(ts, now = Date.now()) {
  const ms = ts - now;
  if (ms <= 0) return 'obnoveno';
  const m = Math.ceil(ms / 60e3);
  if (m < 60) return tr('za {0} min', m);
  const h = Math.floor(m / 60);
  if (h < 48) return `${tr('za {0} h', h)}${m % 60 ? ` ${m % 60} min` : ''}`;
  return tr('za {0} dní', Math.round(h / 24));
}

// Údaje o limitech ze stavového řádku Claude Code jsou přesné; odhady z textu hlášek pak nezobrazujeme.
// Vyčerpání dokoupeného extra usage není okno předplatného – patří na Útratu, ne mezi limity plánu.
export const isSpendLimit = (l) => l.kind === 'spend';

export function currentLimits(limits, now = Date.now()) {
  const fresh = limits.filter((l) => !isSpendLimit(l) && now - l.at < 7 * DAY);
  const claudeStatus = fresh.some((l) => l.source === 'statusline');
  return fresh.filter((l) => !(claudeStatus && l.provider === 'anthropic' && l.source !== 'statusline'));
}

// Stav jednoho okna limitu. Jedno místo pro všechna tři zobrazení (Přehled, Statistiky,
// rozbalený seznam nástrojů) – dřív každé počítalo vlastní popis a u obnoveného okna Codexu
// stálo na Přehledu „0 %“, ve Statistikách „Obnoven“ a v API pořád poslední naměřených 34 %.
// „0 %“ je přitom tvrzení o měření, které po obnově neproběhlo: okno je prázdné, ale změřené není.
// Kdy byl limit změřený, pokud už to není „teď“. Okno se od té doby mohlo změnit a číslo bez data
// by se četlo jako současný stav – týdenní limit Codexu tak 20 hodin po odečtu svítil jako živý.
export function limitAge(l, now = Date.now()) {
  return l.at && now - l.at > 30 * 60e3 ? `${tr('změřeno')} ${rel(l.at, now)}` : '';
}

// Kdy byl zůstatek kreditů zjištěný. Jedno místo pro Přehled, Statistiky i Útratu – číslo bez data
// se četlo jako současný stav, i když pocházelo z měsíc starého odečtu. Nad dva dny se zvýrazní.
export function creditAge(c, now = Date.now()) {
  if (!Number.isFinite(c?.at)) return null;
  return { text: `${tr('zjištěno')} ${rel(c.at, now)}`, kratce: rel(c.at, now), stary: now - c.at > 2 * DAY };
}
export function creditAgeHtml(c, now = Date.now()) {
  const v = creditAge(c, now);
  return v ? `<span class="${v.stary ? 'je-stare' : ''}">${esc(v.text)}</span>` : '';
}

export function limitState(l, now = Date.now()) {
  // Okno bez času obnovy (historie Claude Desktopu) po své délce vyprší: odečet starší než samo
  // okno o současném vytížení nic neříká. Bez toho by pětihodinové okno svítilo i týden starým číslem.
  const vyprselo = !l.resetsAt && Number(l.windowMinutes) > 0 && now - l.at > Number(l.windowMinutes) * 60e3;
  const renewed = Boolean(l.resetsAt && l.resetsAt <= now) || vyprselo;
  const reached = Boolean(l.reached) && !renewed;
  const pct = renewed ? 0 : reached ? 100 : Math.round(Number(l.usedPercent) || 0);
  return {
    renewed,
    reached,
    pct,
    // Co se ukáže místo čísla. Obnovené okno se nehlásí jako „0 %“, vyčerpané jako „100 %“.
    label: renewed ? tr('Obnoveno') : reached ? tr('Vyčerpáno') : `${pct} %`,
    tone: renewed ? 'free' : pct >= 95 ? 'out' : pct >= 80 ? 'low' : 'free',
    // Po obnově nikdo nové vytížení nezměřil – „plná kapacita“ ani „právě“ by nebyla pravda.
    advice: renewed ? tr('Okno se od měření obnovilo, nový stav zatím není')
      : reached || pct >= 100 ? tr('Vyčerpáno, počkej na obnovu')
        : pct >= 80 ? tr('Šetři na důležité úlohy')
          : pct >= 50 ? tr('V pohodě pro běžnou práci') : tr('Dobrý čas na velké úlohy'),
  };
}

// Okna limitů: kolik je vyčerpáno, kdy se obnoví a co z toho plyne pro práci.
export function limitWindows(limits, now = Date.now()) {
  const rows = currentLimits(limits, now)
    .filter((l) => typeof l.usedPercent === 'number' || l.reached)
    .sort((a, b) => (a.windowMinutes || 1e9) - (b.windowMinutes || 1e9) || a.app.localeCompare(b.app));
  if (!rows.length) return '';
  return `<ul class="lwin">${rows.map((l) => {
    const { renewed, pct, tone, advice, label } = limitState(l, now);
    return `<li class="lwin-row" data-tone="${tone}">
      <span class="lwin-logo">${glyph(l.id.startsWith('codex') ? { connector: 'codex' } : l.provider)}</span>
      <span class="lwin-main">
        <span class="lwin-top"><b>${esc(l.app)} · ${esc(l.label)}</b><span class="lwin-pct">${esc(label)}</span></span>
        <span class="lwin-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}" aria-label="${esc(`${l.app} ${l.label}`)}"><i style="width:${pct}%"></i></span>
        <span class="lwin-sub"><span>${esc(advice)}</span>${l.resetsAt && !renewed ? `<span>${tr('obnova')} <span data-until="${l.resetsAt}">${untilLabel(l.resetsAt, now)}</span> · ${new Date(l.resetsAt).toLocaleTimeString(LOCALE, { hour: '2-digit', minute: '2-digit' })}</span>` : ''}${limitAge(l, now) ? `<span class="lwin-age">${esc(limitAge(l, now))}</span>` : ''}</span>
      </span>
    </li>`;
  }).join('')}</ul>`;
}

export function limitGauges(limits, now, { size = 'md', provider } = {}) {
  // Stejná přednost zdrojů jako v `currentLimits`: jakmile dorazí přesná data ze stavového řádku,
  // záložní historie se skryje. Jinak by u jednoho limitu svítila dvě různá čísla.
  return currentLimits(limits, now)
    .filter((l) => !provider || l.provider === provider)
    .map((l) => {
      const s = limitState(l, now);
      const cerstve = s.reached && now - l.at < 7 * DAY;
      if (!cerstve && (now - l.at > 7 * DAY || typeof l.usedPercent !== 'number')) return null;
      const color = s.tone === 'out' ? 'var(--velvet-ink)' : s.tone === 'low' ? 'var(--brass)' : 'var(--teal)';
      const sub = l.resetsAt && !s.renewed ? tr('obnova {0}', resetsLabel(l.resetsAt, now)) : l.plan ? `${tr('plán')} ${l.plan}` : '';
      // Stáří na vlastním řádku; po šesti hodinách zvýrazněné, protože limity se mění rychle.
      const age = limitAge(l, now);
      return { at: l.at, html: gauge({ pct: s.pct, color, value: s.label, label: `${l.app} · ${l.label}`, sub, age, stare: now - l.at > 6 * 3600e3, size, reached: s.reached }) };
    })
    .filter(Boolean)
    .sort((a, b) => b.at - a.at)
    .map((x) => x.html);
}

/* ---------- Modální dialog ---------- */

function clearErrors(form) {
  for (const el of form.querySelectorAll('.field-error')) el.remove();
  for (const el of form.querySelectorAll('[aria-invalid]')) {
    el.removeAttribute('aria-invalid');
    el.removeAttribute('aria-describedby');
  }
  const fe = form.querySelector('.form-error');
  if (fe) fe.hidden = true;
}

function markErrors(form, errors) {
  let first = null;
  for (const [name, msg] of Object.entries(errors || {})) {
    const key = name.replace(/^services\./, 'svc_').replace(/^rates\./, 'rate_');
    const field = form.elements.namedItem(key);
    if (!field || !field.insertAdjacentHTML) continue;
    const id = `err-${key}`;
    field.setAttribute('aria-invalid', 'true');
    field.setAttribute('aria-describedby', id);
    field.insertAdjacentHTML('afterend', `<span class="field-error" id="${id}">${esc(msg)}</span>`);
    first = first || field;
  }
  (first?.classList.contains('picker-source') ? first.nextElementSibling : first)?.focus();
}

// `size` přidá variantu okna (např. 'reader' pro čtení souboru), `footer` nahradí výchozí dvojici
// tlačítek vlastním obsahem a `onOpen` dostane kořen okna hned po vložení do stránky –
// díky tomu má i vlastní patička kde navěsit obsluhu, aniž by se duplikovala práce s Esc,
// zámkem tabulátoru a vrácením zaostření.
export function modal({ title, body, submitLabel = tr('Uložit'), cancelLabel = tr('Zrušit'), danger = false, onSubmit, wide = false, size = '', footer = null, onOpen = null, opener: openerOverride = null }) {
  return new Promise((resolve) => {
    const opener = openerOverride || document.activeElement;
    const id = `m-${Math.random().toString(36).slice(2, 8)}`;
    const scrim = document.createElement('div');
    scrim.className = 'modal-scrim';
    scrim.innerHTML = `<div class="modal${wide ? ' modal--wide' : ''}${size ? ` modal--${size}` : ''}" role="dialog" aria-modal="true" aria-labelledby="${id}">
      <form novalidate>
        <header class="modal-head"><h2 id="${id}">${esc(title)}</h2><button type="button" class="icon-btn" data-close aria-label="${tr('Zavřít')}">${ICON.close}</button></header>
        <div class="modal-body">${body}</div>
        <p class="form-error" role="alert" hidden></p>
        <footer class="modal-foot">${footer ?? `<button type="button" class="btn" data-close>${esc(cancelLabel)}</button><button type="submit" class="btn ${danger ? 'btn--danger' : 'btn--primary'}">${esc(submitLabel)}</button>`}</footer>
      </form>
    </div>`;
    document.body.appendChild(scrim);
    document.body.classList.add('has-modal');
    const form = scrim.querySelector('form');
    const submit = form.querySelector('[type="submit"]');
    let closed = false;

    const close = (result) => {
      if (closed) return;
      closed = true;
      document.removeEventListener('keydown', onKey, true);
      scrim.classList.add('is-closing');
      setTimeout(() => scrim.remove(), 180);
      document.body.classList.remove('has-modal');
      if (opener?.isConnected) opener.focus();
      resolve(result);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        close(false);
      } else if (e.key === 'Tab') {
        const f = [...scrim.querySelectorAll('button, input, select, textarea, a[href]')].filter((x) => !x.disabled && x.offsetParent !== null);
        if (!f.length) return;
        if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
        else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
      }
    };
    document.addEventListener('keydown', onKey, true);
    onOpen?.(scrim, close);
    // Zavření až po clicku brání tomu, aby se po mousedown overlay odstranil a
    // zbytek gesta propadl na tlačítko pod ním.
    scrim.addEventListener('click', (e) => { if (e.target === scrim) close(false); });
    for (const b of scrim.querySelectorAll('[data-close]')) b.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      close(false);
    });
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      clearErrors(form);
      if (!onSubmit) { close(true); return; }
      submit.disabled = true;
      submit.classList.add('is-busy');
      try {
        const r = await onSubmit(form);
        if (r !== false) close(r ?? true);
      } catch (err) {
        if (err.errors) markErrors(form, err.errors);
        const fe = form.querySelector('.form-error');
        fe.textContent = err.message;
        fe.hidden = false;
      } finally {
        submit.disabled = false;
        submit.classList.remove('is-busy');
      }
    });
    requestAnimationFrame(() => (form.querySelector('.modal-body input, .modal-body .picker-trigger, .modal-body textarea') || submit || scrim.querySelector('button')).focus());
  });
}

export const confirmDialog = ({ title, message, confirmLabel = tr('Potvrdit'), danger = false }) =>
  modal({ title, body: `<p class="modal-text">${esc(message)}</p>`, submitLabel: confirmLabel, danger });

/* ---------- Paleta příkazů ---------- */

export function createPalette(getItems, onPick) {
  const root = document.createElement('div');
  root.className = 'palette';
  root.hidden = true;
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.setAttribute('aria-label', tr('Rychlé hledání'));
  root.innerHTML = `<div class="palette-box">
    <div class="palette-input">${ICON.search}<input type="text" placeholder="Hledat agenta, projekt nebo sekci…" autocomplete="off" spellcheck="false" role="combobox" aria-expanded="true" aria-controls="palette-list" aria-autocomplete="list"><kbd>Esc</kbd></div>
    <ul class="palette-list" id="palette-list" role="listbox"></ul>
  </div>`;
  document.body.appendChild(root);
  const input = root.querySelector('input');
  const list = root.querySelector('ul');
  let items = [];
  let index = 0;
  let opener = null;

  const setActive = ({ scroll = true } = {}) => {
    for (const option of list.querySelectorAll('[data-i]')) {
      option.setAttribute('aria-selected', String(Number(option.dataset.i) === index));
    }
    input.setAttribute('aria-activedescendant', items.length ? `pl-${index}` : '');
    if (scroll) list.querySelector(`#pl-${index}`)?.scrollIntoView({ block: 'nearest' });
  };

  const render = () => {
    items = getItems(input.value);
    index = Math.min(index, Math.max(0, items.length - 1));
    let group = '';
    list.innerHTML = items.length
      ? items.map((it, i) => {
        const head = it.group !== group ? `<li class="pl-group" role="presentation">${esc((group = it.group))}</li>` : '';
        return `${head}<li role="option" id="pl-${i}" data-i="${i}" aria-selected="${i === index}">${it.icon || ''}<span class="pl-text"><span>${esc(it.label)}</span>${it.sub ? `<small>${esc(it.sub)}</small>` : ''}</span></li>`;
      }).join('')
      : `<li class="pl-group" role="presentation">${tr('Nic nenalezeno')}</li>`;
    setActive();
  };
  const close = () => {
    if (root.hidden) return;
    root.hidden = true;
    // Stránka pod překryvem se smí zase posouvat, až když překryv zmizí.
    document.body.classList.remove('has-modal');
    if (opener?.isConnected) opener.focus();
  };
  const pick = (i) => {
    const it = items[i];
    if (!it) return;
    root.hidden = true;
    onPick(it);
  };

  input.addEventListener('input', () => { index = 0; render(); });
  // Capture chrání Escape i tehdy, když je fokus v comboboxu nebo v jiném
  // vloženém ovládacím prvku palety.
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || root.hidden) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    close();
  }, true);
  root.addEventListener('keydown', (e) => {
    const n = Math.max(1, items.length);
    if (e.key === 'Escape') { e.preventDefault(); close(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); index = (index + 1) % n; render(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); index = (index - 1 + n) % n; render(); }
    else if (e.key === 'Enter') { e.preventDefault(); pick(index); }
    else if (e.key === 'Tab') { e.preventDefault(); input.focus(); }
  });
  list.addEventListener('click', (e) => {
    const li = e.target.closest('[data-i]');
    if (li) pick(Number(li.dataset.i));
  });
  list.addEventListener('pointerover', (e) => {
    const li = e.target.closest('[data-i]');
    if (!li || !list.contains(li)) return;
    const next = Number(li.dataset.i);
    if (next !== index) { index = next; setActive(); }
  });
  // Stejná ochrana jako u modalu: neodstraňuj overlay v půlce gesta.
  root.addEventListener('click', (e) => { if (e.target === root) close(); });

  return {
    open() {
      opener = document.activeElement;
      root.hidden = false;
      // Vyhledávání překrývá celou stránku, takže pod ním nemá co rolovat. Bez tohohle zámku se
      // po dojetí seznamu na konec začala posouvat stránka vzadu – kolečko patří tomu, co je navrchu.
      document.body.classList.add('has-modal');
      input.value = '';
      index = 0;
      render();
      input.focus();
    },
    close,
    get isOpen() { return !root.hidden; },
  };
}

export function switchRow({ key, label, desc = '', checked, disabled = false }) {
  return `<div class="set-row">
    <div class="set-row-text"><span class="set-label" id="lbl-${esc(key)}">${esc(label)}</span>${desc ? `<p class="set-desc">${desc}</p>` : ''}</div>
    <button class="switch" type="button" role="switch" aria-checked="${Boolean(checked)}" aria-labelledby="lbl-${esc(key)}" data-setting="${esc(key)}"${disabled ? ' disabled' : ''}></button>
  </div>`;
}
