import { state } from '../state.js';
import { api } from '../api.js';
import { esc, fmtMoney, fmtNum, localDate, dateLong, MONTHS, MONTHS_SHORT } from '../format.js';
import { glyph, PROVIDERS, pkey, ICON } from '../icons.js';
import { gauge, columnChart, donut, timeLine } from '../charts.js';
import { chartColor } from '../data.js';
import { fill, tween, modal, confirmDialog, toast, emptyState } from '../ui.js';

const v = { el: null, onClick: null, usage: undefined };
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

function openBudgets(opener = null) {
  const sp = state.spend;
  const cfg = sp.budgetsConfig;
  const services = Object.entries(sp.services)
    .map(([k, s]) => `<label class="field field--inline"><span>${glyph(s.provider)}${esc(s.label)}</span><input name="svc_${esc(k)}" inputmode="decimal" autocomplete="off" placeholder="bez limitu" value="${cfg.services[k] ?? ''}"></label>`)
    .join('');
  modal({
    title: 'Měsíční rozpočty',
    wide: true,
    opener,
    submitLabel: 'Uložit rozpočty',
    body: `<p class="modal-text">Agenteeq tě upozorní při 80 % a 100 % rozpočtu. Prázdné pole znamená bez limitu.</p>
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
  // Historie extra usage Claude – čte se jednou za návštěvu, na vyžádání.
  if (v.usage === undefined) {
    v.usage = null;
    api.planUsage(90).then((r) => { v.usage = r && r.available !== false ? r : null; update(); }).catch(() => { v.usage = null; });
  }
  el.innerHTML = `
    <div class="toolbar" data-enter style="--i:1">
      <span class="toolbar-title" data-region="month"></span>
      <div class="toolbar-actions">
        <button class="btn" type="button" data-action="budgets">${ICON.sliders}Rozpočty</button>
        <button class="btn btn--primary" type="button" data-action="add">${ICON.plus}Přidat výdaj</button>
      </div>
    </div>
    <div class="spend-hero card" data-enter style="--i:2" data-region="hero"></div>
    <!-- Kredity a extra usage jsou jediná část Útraty, kterou Agenteeq zná sám ze souborů na disku;
         výdaje, rozpočty a předplatné si uživatel zapisuje ručně. Patří proto nahoru, hned pod
         souhrn – dřív byly až pod třemi prázdnými bloky s nulami a stránka působila mrtvě. -->
    <div data-enter style="--i:3" data-region="credits"></div>
    <div data-enter style="--i:4" data-region="budgets"></div>
    <div class="grid-2 grid-2--wide" data-enter style="--i:5">
      <section class="card pad" aria-labelledby="mo-h"><div class="sec-head"><h2 id="mo-h">Posledních 6 měsíců</h2></div><div data-region="months"></div><div class="legend legend--static" data-region="mlegend"></div></section>
      <section class="card pad" aria-labelledby="kind-h"><div class="sec-head"><h2 id="kind-h">Za co platíš</h2><span class="muted small">tento měsíc</span></div><div data-region="kinds"></div></section>
    </div>
    <section class="card pad" data-enter style="--i:6" aria-labelledby="led-h">
      <div class="sec-head"><h2 id="led-h">Výdaje</h2></div>
      <div data-region="ledger"></div>
    </section>
    <p class="note">Útratu za API doplní Agenteeq sám po připojení Admin API klíčů. Předplatné a dokoupené extra usage u ChatGPT, Claude, Copilotu, Gemini, Perplexity, Groku nebo Qwenu zapisuj ručně – tyto služby útratu přes API nesdílejí.</p>`;
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
      else if (a.dataset.action === 'budgets') openBudgets(a);
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
    : `<div class="cta-card card">${ICON.wallet}<div><strong>Nastav si měsíční rozpočet</strong><p class="muted small">Agenteeq tě upozorní, jakmile útrata dosáhne 80 % a 100 %.</p></div><button class="btn" type="button" data-action="budgets">Nastavit rozpočet</button></div>`);

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
    label: 'Útrata za posledních 6 měsíců',
  }) : emptyState({ title: 'Zatím žádná útrata', text: 'Jakmile zapíšeš první výdaj, uvidíš tu vývoj po měsících.' }));
  fill(el, 'mlegend', jeCoUkazat ? used.map((k) => `<span class="legend-item"><i class="swatch" style="background:${serviceColor(sp, k)}"></i>${esc(sp.services[k]?.label || k)}</span>`).join('') : '');

  const kinds = Object.entries(sp.month.kinds).filter(([, x]) => x > 0);
  fill(el, 'kinds', kinds.length
    ? donut({ segments: kinds.map(([k, x]) => ({ label: sp.kinds[k] || k, value: x, color: KIND_COLORS[k] || '#8A8594' })), center: fmtMoney(sp.month.total, sp.currency, { compact: true }), sub: 'tento měsíc', format: money, label: 'Útrata podle typu platby' })
    : '<p class="muted">Tento měsíc zatím žádné výdaje.</p>');

  const credits = state.credits.filter((c) => c.history?.length >= 2);
  const spendLimits = state.limits.filter((l) => l.kind === 'spend' && (typeof l.usedPercent === 'number' || typeof l.value === 'number'));
  const num = (x) => x.toLocaleString('cs-CZ', { maximumFractionDigits: 1 });
  // Procenta kreslíme jen tam, kde je zdroj skutečně hlásí. Historie Claude Desktopu dává u extra usage
  // holé číslo bez zdokumentované jednotky – ukáže se jako číslo a označí za neověřené.
  // Historie extra usage Claude: kumulativní procento za období + skoky, kdy čerpání narostlo.
  // Čte se ze stejné historie plánu jako limity (na vyžádání, nikam se neukládá).
  const extraSeries = () => (v.usage?.extraUsage || []).filter((p) => Number.isFinite(p.value));
  const extraJumps = (body) => {
    const out = [];
    for (let i = 1; i < body.length; i++) {
      const d = body[i].value - body[i - 1].value;
      if (d <= 0.01) continue;
      const posledni = out[out.length - 1];
      if (posledni && body[i].at - posledni.at <= 15 * 60 * 1000) { posledni.at = body[i].at; posledni.amount += d; }
      else out.push({ at: body[i].at, amount: d });
    }
    return out;
  };
  const extraUsageHtml = () => {
    const body = extraSeries();
    if (body.length < 2) return '';
    const skoky = extraJumps(body).slice(-6).reverse();
    const od = dateLong(body[0].at);
    const doKdy = dateLong(body[body.length - 1].at);
    return `<div class="credit-chart"><div class="credit-head">${glyph('anthropic')}<strong>Claude – extra usage</strong>
        <span class="muted small">vyčerpáno ${num(body[body.length - 1].value)} % · ${od} – ${doKdy}</span></div>
      ${timeLine({ id: 'sp-claude-xu', points: body, height: 150, color: chartColor('anthropic'), format: (x) => `${num(x)} %`, axisFormat: (x) => `${Math.round(x)}`, label: 'Extra usage Claude', riseLabel: 'Přibylo čerpání' })}
      ${skoky.length ? `<ul class="topups">${skoky.map((u) => `<li><span>${dateLong(u.at)}</span><b>+${num(u.amount)} %</b></li>`).join('')}</ul>` : ''}
      <p class="small muted">Claude ukládá vytížení plánu do vlastního souboru; Agenteeq z něj čte i čerpání extra usage. Jednotku soubor neuvádí – že jde o procenta, plyne z toho, že vedle leží 5hodinové a týdenní okno také v procentech a stavový řádek Claude Code hlásí stejnou trojici. 🧪 Neověřeno oficiální dokumentací.</p></div>`;
  };

  const spendRow = (l) => {
    const pct = typeof l.usedPercent === 'number' ? Math.max(0, Math.min(100, l.usedPercent)) : null;
    const meta = pct === null ? `${num(l.value)} · jednotku zdroj neuvádí` : `vyčerpáno ${Math.round(pct)} %`;
    const bar = pct === null ? '' : `<span class="lwin-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(pct)}" aria-label="${esc(`${l.app} ${l.label}`)}"><i style="width:${pct}%"></i></span>`;
    return `<div class="spend-limit"><div class="credit-head">${glyph(l.provider)}<strong>${esc(l.app)} – ${esc(l.label)}</strong><span class="muted small">${meta}${l.resetsAt ? ` · obnova ${dateLong(l.resetsAt)}` : ''}</span></div>${bar}</div>`;
  };
  fill(el, 'credits', credits.length || spendLimits.length || extraSeries().length >= 2
    ? `<section class="card pad" aria-labelledby="cr-h"><div class="sec-head"><h2 id="cr-h">Kredity a extra usage</h2><span class="muted small">${spendLimits.length ? 'zůstatek a čerpání podle aplikace' : 'zůstatek podle aplikace'}</span></div>
      ${spendLimits.map(spendRow).join('')}
      ${extraUsageHtml()}
      ${credits.map((c) => {
      const ups = c.topUps || [];
      const recent = ups.slice(-6).reverse();
      return `<div class="credit-chart"><div class="credit-head">${glyph(c.provider)}<strong>${esc(c.label)}</strong><span class="muted small">${num(c.balance)} zbývá · ${ups.length}× dokoupeno</span></div>
        ${timeLine({ id: `sp-credits-${c.id}`, points: c.history.slice(-60).map((p) => ({ at: p.at, value: p.balance })), height: 150, color: chartColor(c.provider), format: num, axisFormat: fmtNum, label: c.label, riseLabel: 'Dokoupeno' })}
        ${recent.length ? `<ul class="topups">${recent.map((u) => `<li><span>${dateLong(u.at)}</span><b>+${num(u.amount)}</b></li>`).join('')}</ul>
          <p class="small muted">Dokoupení Agenteeq pozná z nárůstu zůstatku, který hlásí sám Codex. Prochází kvůli tomu i starší konverzace na tomto Macu, takže sahá dál než sledovaných ${state.windowDays} dní – ale jen tam, kam sahají soubory Codexu.</p>` : ''}</div>`;
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
  unmount: () => {
    if (v.el && v.onClick) v.el.removeEventListener('click', v.onClick);
    v.el = null;
    v.onClick = null;
  },
};
