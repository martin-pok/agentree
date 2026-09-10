import { state } from '../state.js';
import { api } from '../api.js';
import { esc, fmtMoney, fmtNum, localDate, dateLong, MONTHS, MONTHS_SHORT } from '../format.js';
import { glyph, PROVIDERS, pkey, ICON } from '../icons.js';
import { gauge, columnChart, donut, areaChart } from '../charts.js';
import { fill, tween, modal, confirmDialog, toast, emptyState } from '../ui.js';

const v = { el: null };
const KIND_COLORS = { subscription: '#16141D', extra: '#C2335A', credits: '#C99A3E', api: '#22A38C' };

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

function entryForm(sp) {
  const opt = (obj, sel) => Object.entries(obj).map(([k, x]) => `<option value="${esc(k)}"${k === sel ? ' selected' : ''}>${esc(typeof x === 'string' ? x : x.label)}</option>`).join('');
  return `<div class="form-grid">
    <label class="field"><span>Služba</span><select name="service" required>${opt(sp.services, 'chatgpt')}</select></label>
    <label class="field"><span>Typ platby</span><select name="kind">${opt(sp.kinds, 'extra')}</select></label>
    <label class="field"><span>Částka</span><input name="amount" inputmode="decimal" autocomplete="off" required placeholder="0"></label>
    <label class="field"><span>Měna</span><select name="currency">${sp.currencies.map((c) => `<option${c === sp.currency ? ' selected' : ''}>${c}</option>`).join('')}</select></label>
    <label class="field"><span>Datum platby</span><input type="date" name="date" value="${localDate()}" required></label>
    <label class="field field--wide"><span>Poznámka</span><input name="note" maxlength="140" placeholder="Např. dokoupené extra usage na víkendový sprint"></label>
    <label class="check field--wide"><input type="checkbox" name="recurring" value="monthly"> Opakuje se každý měsíc (předplatné)</label>
  </div>`;
}

export function openAddEntry() {
  const sp = state.spend;
  if (!sp) return;
  modal({
    title: 'Přidat výdaj',
    body: entryForm(sp),
    submitLabel: 'Přidat výdaj',
    onSubmit: async (form) => {
      const d = new FormData(form);
      const r = await api.addLedger({
        service: d.get('service'),
        kind: d.get('kind'),
        amount: d.get('amount'),
        currency: d.get('currency'),
        date: d.get('date'),
        note: d.get('note'),
        recurring: d.get('recurring') ? 'monthly' : null,
      });
      applySpend(r);
      toast('Výdaj přidán');
    },
  });
}

function openBudgets() {
  const sp = state.spend;
  const cfg = sp.budgetsConfig;
  const services = Object.entries(sp.services)
    .map(([k, s]) => `<label class="field field--inline"><span>${glyph(s.provider)}${esc(s.label)}</span><input name="svc_${esc(k)}" inputmode="decimal" autocomplete="off" placeholder="bez limitu" value="${cfg.services[k] ?? ''}"></label>`)
    .join('');
  modal({
    title: 'Měsíční rozpočty',
    wide: true,
    submitLabel: 'Uložit rozpočty',
    body: `<p class="modal-text">Dirigent tě upozorní při 80 % a 100 % rozpočtu. Prázdné pole znamená bez limitu.</p>
      <div class="form-grid">
        <label class="field"><span>Celkový měsíční rozpočet</span><input name="total" inputmode="decimal" autocomplete="off" placeholder="bez limitu" value="${cfg.total || ''}"></label>
        <label class="field"><span>Hlavní měna</span><select name="currency">${sp.currencies.map((c) => `<option${c === sp.currency ? ' selected' : ''}>${c}</option>`).join('')}</select></label>
        <label class="field"><span>Kurz USD (Kč za 1 $)</span><input name="rate_USD" inputmode="decimal" value="${sp.rates.USD}"></label>
        <label class="field"><span>Kurz EUR (Kč za 1 €)</span><input name="rate_EUR" inputmode="decimal" value="${sp.rates.EUR}"></label>
      </div>
      <h3 class="form-sub">Rozpočet podle služby</h3>
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
      toast('Rozpočty uloženy');
    },
  });
}

function mount(el, _params, query) {
  v.el = el;
  el.innerHTML = `
    <div class="toolbar" data-enter style="--i:1">
      <span class="toolbar-title" data-region="month"></span>
      <div class="toolbar-actions">
        <button class="btn" type="button" data-action="budgets">${ICON.sliders}Rozpočty</button>
        <button class="btn btn--primary" type="button" data-action="add">${ICON.plus}Přidat výdaj</button>
      </div>
    </div>
    <div class="spend-hero card" data-enter style="--i:2" data-region="hero"></div>
    <div data-enter style="--i:3" data-region="budgets"></div>
    <div class="grid-2 grid-2--wide" data-enter style="--i:4">
      <section class="card pad" aria-labelledby="mo-h"><div class="sec-head"><h2 id="mo-h">Posledních 6 měsíců</h2></div><div data-region="months"></div><div class="legend legend--static" data-region="mlegend"></div></section>
      <section class="card pad" aria-labelledby="kind-h"><div class="sec-head"><h2 id="kind-h">Za co platíš</h2><span class="muted small">tento měsíc</span></div><div data-region="kinds"></div></section>
    </div>
    <div data-enter style="--i:5" data-region="credits"></div>
    <section class="card pad" data-enter style="--i:6" aria-labelledby="led-h">
      <div class="sec-head"><h2 id="led-h">Výdaje</h2></div>
      <div data-region="ledger"></div>
    </section>
    <p class="note">Útratu za API doplní Dirigent sám po připojení Admin API klíčů. Předplatné a dokoupené extra usage u ChatGPT, Claude, Copilotu, Gemini, Perplexity, Groku nebo Qwenu zapisuj ručně — tyto služby útratu přes API nesdílejí.</p>`;
  el.addEventListener('click', async (e) => {
    const a = e.target.closest('[data-action]');
    if (!a) return;
    const id = a.dataset.id;
    try {
      if (a.dataset.action === 'add') openAddEntry();
      else if (a.dataset.action === 'budgets') openBudgets();
      else if (a.dataset.action === 'end') {
        const ok = await confirmDialog({ title: 'Ukončit předplatné', message: 'Od příštího měsíce se platba přestane započítávat. Historie zůstane.', confirmLabel: 'Ukončit předplatné' });
        if (ok) { applySpend(await api.endLedger(id, localDate())); toast('Předplatné ukončeno'); }
      } else if (a.dataset.action === 'delete') {
        const ok = await confirmDialog({ title: 'Smazat výdaj', message: 'Výdaj zmizí z grafů i rozpočtů. Tuto akci nelze vrátit.', confirmLabel: 'Smazat výdaj', danger: true });
        if (ok) { applySpend(await api.deleteLedger(id)); toast('Výdaj smazán'); }
      }
    } catch (err) {
      toast(err.message, { tone: 'coral' });
    }
  });
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
      value: total ? `${Math.round(pct)} %` : '—',
      label: total ? 'rozpočtu' : 'bez rozpočtu',
      size: 'lg',
      reached: pct >= 100,
    })}</div>
    <div class="spend-stats">
      <div><span class="eyebrow">Utraceno tento měsíc</span><span class="val">${tween('sp-month', sp.month.total, `money:${sp.currency}`)}</span></div>
      <div><span class="eyebrow">Prognóza do konce měsíce</span><span class="val val--soft">${money(sp.forecast)}</span></div>
      <div><span class="eyebrow">Pravidelné platby</span><span class="val val--soft">${money(sp.recurring)}</span></div>
      <div><span class="eyebrow">${total ? (sp.month.total > total ? 'Přečerpáno' : 'Zbývá z rozpočtu') : 'Rozpočet'}</span>
        <span class="val val--soft${total && sp.month.total > total ? ' is-over' : ''}">${total ? money(Math.abs(total - sp.month.total)) : `<button class="link-inline" type="button" data-action="budgets">Nastavit</button>`}</span></div>
    </div>`);

  fill(el, 'budgets', sp.budgets.length
    ? `<div class="budget-cards">${sp.budgets.map((b) => {
      const over = b.pct >= 100;
      const warn = b.pct >= 80;
      const svc = sp.services[b.scope];
      return `<div class="card budget-card${over ? ' is-over' : warn ? ' is-warn' : ''}">
        <div class="budget-top">${svc ? glyph(svc.provider) : ''}<span>${esc(b.label)}</span><b>${Math.round(b.pct)} %</b></div>
        <div class="budget-track"><i style="width:${Math.min(100, b.pct).toFixed(1)}%"></i></div>
        <span class="muted small">${money(b.spent)} z ${money(b.budget)}</span>
      </div>`;
    }).join('')}</div>`
    : `<div class="cta-card card">${ICON.wallet}<div><strong>Nastav si měsíční rozpočet</strong><p class="muted small">Dirigent tě upozorní, jakmile útrata dosáhne 80 % a 100 %.</p></div><button class="btn" type="button" data-action="budgets">Nastavit rozpočet</button></div>`);

  const used = [...new Set(sp.months.flatMap((m) => Object.keys(m.services)))];
  fill(el, 'months', columnChart({
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
    label: 'Útrata za posledních 6 měsíců',
  }));
  fill(el, 'mlegend', used.map((k) => `<span class="legend-item"><i class="swatch" style="background:${serviceColor(sp, k)}"></i>${esc(sp.services[k]?.label || k)}</span>`).join(''));

  const kinds = Object.entries(sp.month.kinds).filter(([, x]) => x > 0);
  fill(el, 'kinds', kinds.length
    ? donut({ segments: kinds.map(([k, x]) => ({ label: sp.kinds[k] || k, value: x, color: KIND_COLORS[k] || '#8A8594' })), center: fmtMoney(sp.month.total, sp.currency, { compact: true }), sub: 'tento měsíc', format: money, label: 'Útrata podle typu platby' })
    : '<p class="muted">Tento měsíc zatím žádné výdaje.</p>');

  const credits = state.credits.filter((c) => c.history?.length >= 2);
  fill(el, 'credits', credits.length
    ? `<section class="card pad" aria-labelledby="cr-h"><div class="sec-head"><h2 id="cr-h">Kredity a extra usage</h2><span class="muted small">zůstatek podle aplikace</span></div>${credits.map((c) => {
      const h = c.history.slice(-60);
      const markers = h.map((p, i) => (i && p.balance > h[i - 1].balance ? { index: i, value: p.balance, label: `Dokoupeno +${fmtNum(p.balance - h[i - 1].balance)}` } : null)).filter(Boolean);
      return `<div class="credit-chart"><div class="credit-head">${glyph(c.provider)}<strong>${esc(c.label)}</strong><span class="muted small">${c.balance.toLocaleString('cs-CZ', { maximumFractionDigits: 1 })} zbývá · ${markers.length}× dokoupeno</span></div>
        ${areaChart({ id: `sp-credits-${c.id}`, labels: h.map((p) => dateLong(p.at)), series: [{ key: c.id, label: 'Zůstatek', color: PROVIDERS[pkey(c.provider)].color, stroke: PROVIDERS[pkey(c.provider)].ink, values: h.map((p) => p.balance) }], stacked: false, height: 150, format: (x) => x.toLocaleString('cs-CZ', { maximumFractionDigits: 1 }), axisFormat: fmtNum, markers, label: c.label })}</div>`;
    }).join('')}</section>`
    : '');

  const rows = [...sp.ledger].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt);
  fill(el, 'ledger', rows.length
    ? `<div class="table-wrap"><table class="ledger">
        <thead><tr><th scope="col">Datum</th><th scope="col">Služba</th><th scope="col">Typ</th><th scope="col">Poznámka</th><th scope="col" class="num">Částka</th><th scope="col"><span class="sr-only">Akce</span></th></tr></thead>
        <tbody>${rows.map((e) => {
          const svc = sp.services[e.service];
          const running = e.recurring === 'monthly' && !e.endDate;
          return `<tr>
            <td>${dateLong(Date.parse(e.date))}</td>
            <td><span class="svc">${glyph(svc?.provider)}${esc(svc?.label || e.service)}</span></td>
            <td>${esc(sp.kinds[e.kind] || e.kind)}${e.recurring === 'monthly' ? ` <span class="badge">${e.endDate ? `do ${dateLong(Date.parse(e.endDate))}` : 'měsíčně'}</span>` : ''}</td>
            <td class="muted">${esc(e.note || '')}</td>
            <td class="num">${fmtMoney(e.amount, e.currency)}</td>
            <td class="actions">${running ? `<button class="btn btn--sm" type="button" data-action="end" data-id="${esc(e.id)}">Ukončit</button>` : ''}<button class="icon-btn" type="button" data-action="delete" data-id="${esc(e.id)}" aria-label="Smazat výdaj ${esc(svc?.label || '')} ${esc(e.date)}">${ICON.trash}</button></td>
          </tr>`;
        }).join('')}</tbody></table></div>`
    : emptyState({ title: 'Zatím žádné výdaje', text: 'Zapiš předplatné nebo dokoupené extra usage a uvidíš, kolik tě AI stojí.', action: `<button class="btn btn--primary" type="button" data-action="add">${ICON.plus}Přidat výdaj</button>` }));
}

export default {
  id: 'utrata',
  title: 'Útrata',
  mount,
  update,
  query(q) {
    if (q?.get('pridat')) openAddEntry();
  },
  unmount: () => { v.el = null; },
};
