import { state } from '../state.js';
import { api } from '../api.js';
import { esc, fmtMoney, fmtNum, localDate, dateLong, dateOnlyTs, rel, MONTHS, MONTHS_SHORT } from '../format.js';
import { glyph, PROVIDERS, pkey, ICON } from '../icons.js';
import { gauge, columnChart, donut, timeLine } from '../charts.js';
import { chartColor } from '../data.js';
import { fill, tween, modal, confirmDialog, toast, emptyState, limitAge, creditAgeHtml } from '../ui.js';
import { tr, LOCALE, mnozne as plural } from '../i18n.js';

const v = { el: null, onClick: null };
const KIND_COLORS = { subscription: '#16141D', extra: '#C2335A', credits: '#C99A3E', api: '#22A38C' };

// Dokoupení kreditů rozpoznává server ze všech odečtů zůstatku (src/credits.js) – v prohlížeči
// by na to byla jen zkrácená historie, ze které vycházejí jiné částky.

const money = (x) => fmtMoney(x, state.spend?.currency || 'CZK');
const serviceColor = (sp, k) => PROVIDERS[pkey(sp.services[k]?.provider)].color;
const monthLabel = (key) => {
  const [y, m] = key.split('-').map(Number);
  return `${MONTHS[m - 1]} ${y}`;
};

function applySpend(r) {
  if (r?.spend) {
    state.spend = r.spend;
    update();
  }
}

function entryForm(sp, pre = {}) {
  const opt = (obj, sel) => Object.entries(obj).map(([k, x]) => `<option value="${esc(k)}"${k === sel ? ' selected' : ''}>${esc(typeof x === 'string' ? x : x.label)}</option>`).join('');
  return `<div class="form-grid">
    <label class="field"><span>${tr('Služba')}</span><select name="service" required>${opt(sp.services, pre.service || 'chatgpt')}</select></label>
    <label class="field"><span>${tr('Typ platby')}</span><select name="kind">${opt(sp.kinds, pre.kind || 'extra')}</select></label>
    <label class="field"><span>${tr('Částka')}</span><input name="amount" inputmode="decimal" autocomplete="off" required placeholder="0" value="${pre.amount ?? ''}"></label>
    <label class="field"><span>${tr('Měna')}</span><select name="currency">${sp.currencies.map((c) => `<option${c === (pre.currency || sp.currency) ? ' selected' : ''}>${c}</option>`).join('')}</select></label>
    <label class="field"><span>${tr('Datum platby')}</span><input type="date" name="date" value="${localDate()}" required></label>
    <label class="field"><span>${tr('Účet / licence (volitelné)')}</span><input name="account" maxlength="80" autocomplete="off" value="${esc(pre.account || '')}" placeholder="${tr('Osobní, studio nebo klient')}"></label>
    <label class="field field--wide"><span>${tr('Poznámka')}</span><input name="note" maxlength="140" placeholder="${tr('Např. dokoupené extra usage na víkendový sprint')}"></label>
    <label class="check field--wide"><input type="checkbox" name="recurring" value="monthly"${pre.recurring ? ' checked' : ''}> ${tr('Opakuje se každý měsíc (předplatné)')}</label>
  </div>`;
}

export function openAddEntry(pre = {}) {
  const sp = state.spend;
  if (!sp) return;
  modal({
    title: pre.title || tr('Přidat výdaj'),
    body: entryForm(sp, pre),
    submitLabel: pre.submitLabel || tr('Přidat výdaj'),
    onSubmit: async (form) => {
      const d = new FormData(form);
      const r = await api.addLedger({
        service: d.get('service'),
        kind: d.get('kind'),
        amount: d.get('amount'),
        currency: d.get('currency'),
        date: d.get('date'),
        account: d.get('account'),
        note: d.get('note'),
        recurring: d.get('recurring') ? 'monthly' : null,
      });
      applySpend(r);
      toast(pre.kind === 'subscription' ? tr('Licence přidána') : tr('Výdaj přidán'));
    },
  });
}

function openBudgets(opener = null) {
  const sp = state.spend;
  const cfg = sp.budgetsConfig;
  const services = Object.entries(sp.services)
    .map(([k, s]) => `<label class="field field--inline"><span>${glyph(s.provider)}${esc(s.label)}</span><input name="svc_${esc(k)}" inputmode="decimal" autocomplete="off" placeholder="${tr('bez limitu')}" value="${cfg.services[k] ?? ''}"></label>`)
    .join('');
  modal({
    title: tr('Měsíční rozpočty'),
    wide: true,
    opener,
    submitLabel: tr('Uložit rozpočty'),
    body: `<p class="modal-text">${tr('Agenteeq tě upozorní při 80 % a 100 % rozpočtu. Prázdné pole znamená bez limitu.')}</p>
      <div class="form-grid">
        <label class="field"><span>${tr('Celkový měsíční rozpočet')}</span><input name="total" inputmode="decimal" autocomplete="off" placeholder="${tr('bez limitu')}" value="${cfg.total || ''}"></label>
        <label class="field"><span>${tr('Hlavní měna')}</span><select name="currency">${sp.currencies.map((c) => `<option${c === sp.currency ? ' selected' : ''}>${c}</option>`).join('')}</select></label>
        <label class="field"><span>${tr('Kurz USD (Kč za 1 $)')}</span><input name="rate_USD" inputmode="decimal" value="${sp.rates.USD}"></label>
        <label class="field"><span>${tr('Kurz EUR (Kč za 1 €)')}</span><input name="rate_EUR" inputmode="decimal" value="${sp.rates.EUR}"></label>
      </div>
      <h3 class="form-sub">${tr('Rozpočet podle služby')}</h3>
      <div class="form-grid form-grid--services">${services}</div>`,
    onSubmit: async (form) => {
      const d = new FormData(form);
      const body = {
        total: d.get('total') || 0,
        currency: d.get('currency'),
        rates: { USD: d.get('rate_USD'), EUR: d.get('rate_EUR') },
        services: Object.fromEntries(Object.keys(sp.services).map((k) => [k, d.get(`svc_${k}`) ?? ''])),
      };
      applySpend(await api.saveBudgets(body));
      toast(tr('Rozpočty uloženy'));
    },
  });
}

// Nástroj umí přímo potvrdit identitu plánu, ne skutečně strženou částku. Částka se proto
// zobrazuje a počítá jen tehdy, když ji uživatel doložil záznamem ve Výdajích.
function plansHtml(sp) {
  const rows = (sp.subscriptions || []).map((p) => {
    const svc = sp.services[p.service];
    const payments = Array.isArray(p.payments) ? p.payments : p.payment ? [p.payment] : [];
    const label = p.label || svc?.label || p.service;
    const price = payments.length
      ? `<span class="plan-price"><b>${payments.length === 1 ? tr('1 licence') : payments.length < 5 ? tr('{0} licence', payments.length) : tr('{0} licencí', payments.length)}</b></span>`
      : p.free ? `<span class="plan-price"><b>${tr('Bezplatný plán')}</b></span>` : '';
    const licenses = payments.length ? `<div class="license-list" aria-label="${esc(tr('Evidované licence'))}">${payments.map((payment, index) => `
      <div class="license-row">
        <span class="license-copy"><b>${esc(payment.account || tr('Licence {0}', index + 1))}</b><small>${esc(payment.note || tr('platba od {0}', dateLong(Date.parse(payment.date))))}</small></span>
        <span class="license-amount">${esc(fmtMoney(payment.amount, payment.currency))}<small>${tr('/ měsíc')}</small></span>
        <button class="btn btn--sm" type="button" data-action="end" data-id="${esc(payment.id)}">${tr('Ukončit')}</button>
      </div>`).join('')}</div>` : '';
    return `<li class="plan-row">
      <span class="lwin-logo">${glyph(svc?.provider || 'other')}</span>
      <span class="plan-main"><span class="plan-title"><b>${esc(label)}</b>${price}</span>
        ${p.detected ? `<span class="plan-sub"><span class="plan-kind">${tr('Zjištěno automaticky')}</span> ${esc(p.evidence)}${p.observedAt ? ` · ${tr('ověřeno')} <span data-ago="${p.observedAt}">${esc(rel(p.observedAt))}</span>` : ''}</span>` : `<span class="plan-sub">${tr('Další licence')}</span>`}
        ${licenses}
        ${p.detected && !payments.length ? '' : `<span class="plan-actions"><button class="btn btn--sm" type="button" data-action="plan-edit" data-service="${esc(p.service)}">${tr('Přidat další licenci')}</button></span>`}
      </span>
    </li>`;
  }).join('');
  return `<section class="card pad plans" aria-labelledby="plans-h">
    <div class="sec-head"><h2 id="plans-h">${tr('Plány a licence')}</h2><button class="btn btn--sm" type="button" data-action="license-add">${ICON.plus}${tr('Další licence')}</button></div>
    ${rows ? `<ul class="plan-list">${rows}</ul>` : `<p class="muted">${tr('Napoj Claude Code nebo Codex v Nastavení a Agenteeq plán zjistí automaticky.')}</p>`}
  </section>`;
}

function mount(el, _params, query) {
  v.el = el;
  el.innerHTML = `
    <div class="toolbar" data-enter style="--i:1">
      <span class="toolbar-title" data-region="month"></span>
      <div class="toolbar-actions">
        <button class="btn" type="button" data-action="budgets">${ICON.sliders}${tr('Rozpočty')}</button>
        <button class="btn btn--primary" type="button" data-action="add">${ICON.plus}${tr('Přidat výdaj')}</button>
      </div>
    </div>
    <div class="spend-hero card" data-enter style="--i:2" data-region="hero"></div>
    <div data-enter style="--i:3" data-region="plans"></div>
    <div data-enter style="--i:3" data-region="credits"></div>
    <div data-enter style="--i:4" data-region="budgets"></div>
    <div class="grid-2 grid-2--wide" data-enter style="--i:5">
      <section class="card pad" aria-labelledby="mo-h"><div class="sec-head"><h2 id="mo-h">${tr('Posledních 6 měsíců')}</h2></div><div data-region="months"></div><div class="legend legend--static" data-region="mlegend"></div></section>
      <section class="card pad" aria-labelledby="kind-h"><div class="sec-head"><h2 id="kind-h">${tr('Za co platíš')}</h2><span class="muted small">${tr('tento měsíc')}</span></div><div data-region="kinds"></div></section>
    </div>
    <section class="card pad" data-enter style="--i:6" aria-labelledby="led-h">
      <div class="sec-head"><h2 id="led-h">${tr('Výdaje')}</h2>${exportTlacitko()}</div>
      <div data-region="ledger"></div>
    </section>`;
  // `el` je trvalý uzel #view, který router mezi navigacemi jen vyprazdňuje (innerHTML = ''),
  // nikdy nenahrazuje – starý posluchač proto musí zmizet, jinak se při každém návratu na
  // Útratu přidá další a jediný klik pak otevře tolik dialogů, kolik bylo návštěv (nejde zavřít,
  // protože se hned pod zavřeným objeví další identický).
  if (v.onClick) el.removeEventListener('click', v.onClick);
  v.onClick = async (e) => {
    const a = e.target.closest('[data-action]');
    if (!a) return;
    const id = a.dataset.id;
    try {
      if (a.dataset.action === 'add') openAddEntry();
      else if (a.dataset.action === 'license-add') openAddEntry({ title: tr('Přidat licenci'), submitLabel: tr('Přidat licenci'), kind: 'subscription', recurring: true });
      else if (a.dataset.action === 'plan-edit') {
        const p = state.spend.subscriptions.find((x) => x.service === a.dataset.service);
        if (p) openAddEntry({ title: `${tr('Přidat licenci:')} ${p.label || state.spend.services[p.service]?.label || p.service}`, submitLabel: tr('Přidat licenci'), service: p.service, kind: 'subscription', recurring: true });
      } else if (a.dataset.action === 'budgets') openBudgets(a);
      else if (a.dataset.action === 'end') {
        const ok = await confirmDialog({ title: tr('Ukončit předplatné'), message: tr('Od příštího měsíce se platba přestane započítávat. Historie zůstane.'), confirmLabel: tr('Ukončit předplatné') });
        if (ok) { applySpend(await api.endLedger(id, localDate())); toast(tr('Předplatné ukončeno')); }
      } else if (a.dataset.action === 'delete') {
        const ok = await confirmDialog({ title: tr('Smazat výdaj'), message: tr('Výdaj zmizí z grafů i rozpočtů. Tuto akci nelze vrátit.'), confirmLabel: tr('Smazat výdaj'), danger: true });
        if (ok) { applySpend(await api.deleteLedger(id)); toast(tr('Výdaj smazán')); }
      }
    } catch (err) {
      toast(err.message, { tone: 'err' });
    }
  };
  el.addEventListener('click', v.onClick);
  if (query?.get('pridat')) requestAnimationFrame(() => openAddEntry());
}

function update() {
  const el = v.el;
  const sp = state.spend;
  if (!el || !sp) return;
  const total = sp.budgetsConfig?.total || 0;
  const pct = total ? (sp.month.total / total) * 100 : 0;
  fill(el, 'month', esc(monthLabel(sp.monthKey)));

  fill(el, 'hero', `
    <div class="spend-ring">${gauge({
      pct: total ? pct : 0,
      color: pct >= 100 ? 'var(--velvet-ink)' : pct >= 80 ? 'var(--brass)' : 'var(--teal)',
      value: total ? `${Math.round(pct)} %` : '–',
      label: total ? tr('rozpočtu') : tr('bez rozpočtu'),
      size: 'lg',
      reached: pct >= 100,
    })}</div>
    <div class="spend-stats">
      <div><span class="eyebrow">${tr('Utraceno tento měsíc')}</span><span class="val">${tween('sp-month', sp.month.total, `money:${sp.currency}`)}</span></div>
      <div><span class="eyebrow">${tr('Prognóza do konce měsíce')}</span><span class="val val--soft" data-odo>${money(sp.forecast)}</span></div>
      <div><span class="eyebrow">${tr('Pravidelné platby')}</span><span class="val val--soft" data-odo>${money(sp.recurring)}</span></div>
      <div><span class="eyebrow">${total ? (sp.month.total > total ? tr('Přečerpáno') : tr('Zbývá z rozpočtu')) : tr('Rozpočet')}</span>
        <span class="val val--soft${total && sp.month.total > total ? ' is-over' : ''}"${total ? ' data-odo' : ''}>${total ? money(Math.abs(total - sp.month.total)) : `<button class="link-inline" type="button" data-action="budgets">${tr('Nastavit')}</button>`}</span></div>
    </div>`);

  fill(el, 'plans', plansHtml(sp));

  fill(el, 'budgets', sp.budgets.length
    ? `<div class="budget-cards">${sp.budgets.map((b) => {
      const over = b.pct >= 100;
      const warn = b.pct >= 80;
      const svc = sp.services[b.scope];
      return `<div class="card budget-card${over ? ' is-over' : warn ? ' is-warn' : ''}">
        <div class="budget-top">${svc ? glyph(svc.provider) : ''}<span>${esc(b.label)}</span><b>${Math.round(b.pct)} %</b></div>
        <div class="budget-track"><i style="width:${Math.min(100, b.pct).toFixed(1)}%"></i></div>
        <span class="muted small">${tr('{0} z {1}', money(b.spent), money(b.budget))}</span>
      </div>`;
    }).join('')}</div>`
    : `<div class="cta-card card">${ICON.wallet}<div><strong>${tr('Nastav si měsíční rozpočet')}</strong><p class="muted small">${tr('Agenteeq tě upozorní, jakmile útrata dosáhne 80 % a 100 %.')}</p></div><button class="btn" type="button" data-action="budgets">${tr('Nastavit rozpočet')}</button></div>`);

  const used = [...new Set(sp.months.flatMap((m) => Object.keys(m.services)))];
  // Osa je tvrzení o řádu čísel. Když se za půl roku nic nezapsalo, nakreslil by graf
  // stupnici „4 Kč, 3 Kč, 2 Kč…“ nad prázdnou plochou – vymyšlené měřítko místo dat.
  const jeCoUkazat = sp.months.some((m) => m.total > 0) || total > 0;
  fill(el, 'months', jeCoUkazat ? columnChart({
    columns: sp.months.map((m) => {
      const [y, mm] = m.key.split('-').map(Number);
      return {
        label: MONTHS_SHORT[mm - 1],
        current: m.key === sp.monthKey,
        tip: `${MONTHS[mm - 1]} ${y}: ${money(m.total)}`,
        segments: used.map((k) => ({ key: k, label: sp.services[k]?.label || k, value: m.services[k] || 0, color: serviceColor(sp, k) })),
      };
    }),
    budget: total,
    format: money,
    axisFormat: (x) => fmtMoney(x, sp.currency, { compact: true }),
    label: tr('Útrata za posledních 6 měsíců'),
  }) : emptyState({ title: tr('Zatím žádná útrata'), text: tr('Jakmile zapíšeš první výdaj, uvidíš tu vývoj po měsících.') }));
  fill(el, 'mlegend', jeCoUkazat ? used.map((k) => `<span class="legend-item"><i class="swatch" style="background:${serviceColor(sp, k)}"></i>${esc(sp.services[k]?.label || k)}</span>`).join('') : '');

  const kinds = Object.entries(sp.month.kinds).filter(([, x]) => x > 0);
  fill(el, 'kinds', kinds.length
    ? donut({ segments: kinds.map(([k, x]) => ({ label: sp.kinds[k] || k, value: x, color: KIND_COLORS[k] || '#8A8594' })), center: fmtMoney(sp.month.total, sp.currency, { compact: true }), sub: tr('tento měsíc'), format: money, label: tr('Útrata podle typu platby') })
    : `<p class="muted">${tr('Tento měsíc zatím žádné výdaje.')}</p>`);

  const credits = state.credits.filter((c) => c.history?.length >= 2);
  const now = Date.now();
  const spendLimits = state.limits.filter((l) => l.kind === 'spend' && l.source !== 'plan-history'
    && now - l.at <= 30 * 60 * 1000 && l.at - now <= 60 * 1000
    && (!l.resetsAt || l.resetsAt > now)
    && (typeof l.usedPercent === 'number' || typeof l.value === 'number'));
  const num = (x) => x.toLocaleString(LOCALE, { maximumFractionDigits: 1 });

  const spendRow = (l) => {
    const pct = typeof l.usedPercent === 'number' ? Math.max(0, Math.min(100, l.usedPercent)) : null;
    const stari = limitAge(l);
    const meta = (pct === null ? `${num(l.value)} ${tr('· jednotku zdroj neuvádí')}` : tr('vyčerpáno {0} %', Math.round(pct))) + (stari ? ` · ${stari}` : '');
    const bar = pct === null ? '' : `<span class="lwin-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(pct)}" aria-label="${esc(`${l.app} ${l.label}`)}"><i style="width:${pct}%"></i></span>`;
    return `<div class="spend-limit"><div class="credit-head">${glyph(l.provider)}<strong>${esc(l.app)} – ${esc(l.label)}</strong><span class="muted small">${meta}${l.resetsAt ? ` · ${tr('obnova {0}', dateLong(l.resetsAt))}` : ''}</span></div>${bar}</div>`;
  };
  fill(el, 'credits', credits.length || spendLimits.length
    ? `<section class="card pad" aria-labelledby="cr-h"><div class="sec-head"><h2 id="cr-h">${tr('Kredity a čerpání')}</h2></div>
      ${spendLimits.map(spendRow).join('')}
      ${credits.map((c) => {
      const ups = c.topUps || [];
      const recent = ups.slice(-6).reverse();
      return `<div class="credit-chart"><div class="credit-head">${glyph(c.provider)}<strong>${esc(c.label)}</strong><span class="muted small">${num(c.balance)} ${tr('zbývá')}${creditAgeHtml(c) ? ` · ${creditAgeHtml(c)}` : ''}${ups.length ? ` ${tr('· {0}× doplněno', ups.length)}` : ''}</span></div>
        ${timeLine({ id: `sp-credits-${c.id}`, points: c.history.slice(-60).map((p) => ({ at: p.at, value: p.balance })), height: 150, color: chartColor(c.provider), format: num, axisFormat: fmtNum, label: c.label, riseLabel: tr('Doplněno') })}
        ${recent.length ? `<ul class="topups">${recent.map((u) => `<li><span>${dateLong(u.at)}</span><b>+${num(u.amount)}</b></li>`).join('')}</ul>` : ''}</div>`;
    }).join('')}</section>`
    : '');

  fill(el, 'ledger', ledgerHtml(sp));
}

// Převedená částka pod cizí měnou: z tabulky pak jde poskládat měsíční součet v hlavní měně.
const converted = (sp, amount, currency) => (currency === sp.currency ? '' : `<small class="ledger-conv">≈ ${esc(money(amount))}</small>`);
const toApp = (sp, amount, currency) => {
  const rate = (c) => (c === 'CZK' ? 1 : Number(sp.rates?.[c]) || 0);
  const to = rate(sp.currency || 'CZK');
  return to > 0 ? (Number(amount) || 0) * rate(currency) / to : 0;
};
const shortDay = (s) => new Date(dateOnlyTs(s)).toLocaleDateString(LOCALE, { day: 'numeric', month: 'numeric' });

// Výdaje = ručně zapsané řádky + automatické řádky z Admin API. Dřív tabulka ukazovala jen ruční
// zápisy, zatímco součet měsíce nahoře obsahoval i Admin API – čísla nešlo z viditelných řádků
// složit. Automatické řádky jsou jen ke čtení: mění je dodavatel, ne člověk.
export function ledgerHtml(sp) {
  const rows = [...sp.ledger].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt);
  const auto = sp.automatic || [];
  if (!rows.length && !auto.length) {
    return emptyState({ title: tr('Zatím žádné výdaje'), text: tr('Zapiš předplatné nebo dokoupené extra usage a uvidíš, kolik tě AI stojí.'), action: `<button class="btn btn--primary" type="button" data-action="add">${ICON.plus}${tr('Přidat výdaj')}</button>` });
  }
  const vendors = [...new Set(auto.map((r) => String(sp.services[r.service]?.label || r.service).replace(/ API$/, '')))];
  const groupRow = (title, extra = '') => `<tr class="ledger-group"><th scope="rowgroup" colspan="6"><div class="ledger-group-head"><span class="ledger-group-title">${title}</span>${extra}</div></th></tr>`;
  const manualRows = rows.map((e) => {
    const svc = sp.services[e.service];
    const running = e.recurring === 'monthly' && !e.endDate;
    return `<tr>
            <td>${dateLong(dateOnlyTs(e.date))}</td>
            <td><span class="svc">${glyph(svc?.provider)}${esc(svc?.label || e.service)}</span></td>
            <td>${esc(sp.kinds[e.kind] || e.kind)}${e.recurring === 'monthly' ? ` <span class="badge">${e.endDate ? tr('do {0}', dateLong(dateOnlyTs(e.endDate))) : tr('měsíčně')}</span>` : ''}</td>
            <td class="muted">${esc(e.note || '')}</td>
            <td class="num">${fmtMoney(e.amount, e.currency)}${converted(sp, toApp(sp, e.amount, e.currency), e.currency)}</td>
            <td class="actions">${running ? `<button class="btn btn--sm" type="button" data-action="end" data-id="${esc(e.id)}">${tr('Ukončit')}</button>` : ''}<button class="icon-btn" type="button" data-action="delete" data-id="${esc(e.id)}" aria-label="${tr('Smazat výdaj')} ${esc(svc?.label || '')} ${esc(e.date)}">${ICON.trash}</button></td>
          </tr>`;
  }).join('');
  const autoRows = auto.map((r) => {
    const svc = sp.services[r.service];
    const days = `${r.days} ${plural(r.days, 'den', 'dny', 'dní')}`;
    return `<tr class="ledger-auto">
            <td>${esc(monthLabel(r.month))}</td>
            <td><span class="svc">${glyph(svc?.provider)}${esc(svc?.label || r.service)}</span></td>
            <td>${esc(sp.kinds[r.kind] || r.kind)}</td>
            <td class="muted">${esc(days)} · ${esc(r.from === r.to ? shortDay(r.from) : `${shortDay(r.from)}–${shortDay(r.to)}`)}</td>
            <td class="num">${fmtMoney(r.amount, r.currency)}${converted(sp, r.converted, r.currency)}</td>
            <td class="actions"><span class="sr-only">${tr('jen ke čtení')}</span></td>
          </tr>`;
  }).join('');
  const autoMonth = sp.month.auto || 0;
  const split = autoMonth > 0
    ? `<p class="ledger-sum">${tr('Tento měsíc {0} = zapsáno ručně {1} + automaticky z Admin API {2}', `<b>${esc(money(sp.month.total))}</b>`, esc(money(Math.max(0, sp.month.total - autoMonth))), esc(money(autoMonth)))}</p>`
    : '';
  return `${split}<div class="table-wrap"><table class="ledger">
        <thead><tr><th scope="col">${tr('Datum')}</th><th scope="col">${tr('Služba')}</th><th scope="col">${tr('Typ')}</th><th scope="col">${tr('Poznámka')}</th><th scope="col" class="num">${tr('Částka')}</th><th scope="col"><span class="sr-only">${tr('Akce')}</span></th></tr></thead>
        ${rows.length ? `<tbody>${auto.length ? groupRow(tr('Zapsané ručně')) : ''}${manualRows}</tbody>` : ''}
        ${auto.length ? `<tbody>${groupRow(`${tr('Automaticky z Admin API')} · ${esc(vendors.join(' / '))}`, `<span class="badge">${tr('jen ke čtení')}</span><span class="ledger-group-note" title="${esc(tr('Admin API sčítá náklady po dnech v UTC. Na přelomu měsíce proto může den spadnout do jiného měsíce než podle místního kalendáře.'))}">${tr('dny podle UTC, jak je počítá dodavatel')}</span>`)}${autoRows}</tbody>` : ''}
      </table></div>${rateNote(sp, rows, auto)}`;
}

// Odkud je kurz. Převádí se dnešním kurzem i za minulé měsíce – historické kurzy aplikace nemá,
// tak to aspoň říká nahlas. Výchozí kurz je jen orientační a je tak označený.
export function rateNote(sp, rows, auto) {
  const app = sp.currency || 'CZK';
  if (!auto.length && app === 'CZK' && rows.every((e) => e.currency === app)) return '';
  const info = sp.rateInfo || { source: 'default' };
  const n = (x) => Number(x).toLocaleString(LOCALE, { maximumFractionDigits: 3 });
  const rates = tr('1 $ = {0} Kč, 1 € = {1} Kč', n(sp.rates?.USD), n(sp.rates?.EUR));
  if (info.source === 'default') {
    return `<p class="spend-foot spend-foot--warn"><b>${tr('Orientační kurz')}</b> ${esc(rates)}. ${tr('Kurz ČNB se zatím nepodařilo načíst. Přesný kurz zadáš v Rozpočtech.')}</p>`;
  }
  const source = info.source === 'cnb' && info.date ? tr('Kurz ČNB z {0}', esc(dateLong(dateOnlyTs(info.date)))) : tr('Vlastní kurz z Rozpočtů');
  return `<p class="spend-foot">${source}: ${esc(rates)}. ${tr('Minulé měsíce se přepočítávají stejným kurzem, ne kurzem ze dne platby.')}</p>`;
}

// Export do CSV: posledních 12 měsíců, měsíční předplatné v každém měsíci, převod podle kurzů
// v aplikaci (src/spend.js#spendCsv). Živá prohlídka na webu nemá server, stahovat nemá co.
function exportTlacitko() {
  if (document.documentElement.hasAttribute('data-ukazka')) return '';
  return `<a class="btn btn--sm" href="/api/spend/export" download>${ICON.down}${tr('Export CSV')}</a>`;
}

export default {
  id: 'utrata',
  title: tr('Útrata'),
  mount,
  update,
  query(q) {
    if (q?.get('pridat')) openAddEntry();
  },
  unmount: () => {
    if (v.el && v.onClick) v.el.removeEventListener('click', v.onClick);
    v.el = null;
    v.onClick = null;
  },
};
