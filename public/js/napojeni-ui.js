// Napojení modelů tlačítkem (src/napojeni.js). Klik spustí přihlášení u dodavatele, okno Agenteeq
// čeká a samo pozná, až je hotovo – pak ukáže potvrzení. Nic se tu nezadává a nic se neukládá.
import { api } from './api.js';
import { esc } from './format.js';
import { glyph, ICON } from './icons.js';
import { modal, toast, stateBadge } from './ui.js';
import { tr } from './i18n.js';

const DODAVATEL = { anthropic: 'Anthropic', openai: 'OpenAI', google: 'Google', perplexity: 'Perplexity' };
const SOUKROMI = tr('Heslo ani přístupové klíče Agenteeq neuvidí – přihlašuješ se přímo u dodavatele. Agenteeq se pak jen ptá, jestli je napojeno, a z webových chatů bere jen stav, ne text.');

let cekajici = null; // { id, label, scrim, close }
// Žádosti o napojení na cestě. Zpráva „napojeno“ může přijít dřív než odpověď na samotnou žádost
// (rozšíření se ozve hned, když je chat už otevřený) – pak se místo čekání rovnou potvrdí.
const vLetu = new Map();

export function radekNapojeni(n) {
  const logo = glyph({ logo: n.logo, provider: n.provider });
  let stav;
  let akce = '';
  if (n.druh === 'agent' && !n.nainstalovano) {
    stav = stateBadge('missing', tr('Není nainstalovaný'));
  } else if (n.druh === 'web' && !n.nainstalovano) {
    stav = stateBadge('missing', tr('Potřebuje rozšíření'));
    akce = `<button class="btn btn--sm" type="button" data-action="extension-scroll">${tr('Přidat rozšíření')}</button>`;
  } else if (n.napojeno === true) {
    stav = stateBadge('connected', n.plan ? `${tr('Napojeno')} · ${esc(n.plan)}` : tr('Napojeno'));
  } else {
    stav = n.ceka ? stateBadge('idle', tr('Čeká na přihlášení'))
      : n.napojeno === false ? stateBadge('idle', tr('Nenapojeno'))
      // U webu „nevím“ znamená jen, že z té služby zatím nic nepřišlo – rozšíření je v pořádku.
      : n.druh === 'web' ? stateBadge('idle', tr('Zatím bez dat'))
      : stateBadge('unavailable', tr('Nepodařilo se zjistit'));
    akce = `<button class="btn btn--sm${n.napojeno === false ? ' btn--primary' : ''}" type="button" data-napojit="${esc(n.id)}">${tr('Napojit')}</button>`;
  }
  return `<li class="model-row"><span class="model-logo">${logo}</span>
    <div class="model-main"><b>${esc(n.label)}</b><span>${n.druh === 'web' ? tr('Webový chat') : tr('Agent na tomhle Macu')}</span></div>
    ${stav}${akce}</li>`;
}

function textCekani(n) {
  const kdo = DODAVATEL[n.provider] || n.label;
  return n.druh === 'web'
    ? tr('V prohlížeči se otevřel {0}. Přihlas se, pokud ještě nejsi, a otevři jakoukoli konverzaci – rozšíření dá Agenteeq vědět a napojení se potvrdí samo.', esc(n.label))
    : tr('V Terminálu se spustilo přihlášení {0} a otevře se prohlížeč. Přihlas se svým účtem u {1}. Až bude hotovo, Agenteeq to pozná sám.', esc(n.label), esc(kdo));
}

function obsahHotovo(u) {
  return `<div class="model-done"><span class="model-done-check" aria-hidden="true">${ICON.check}</span>
    <b>${esc(u.uz ? `${u.label} ${tr('už je napojený')}` : tr('Napojení {0} proběhlo v pořádku', u.label))}</b>
    ${u.plan ? `<span>${esc(u.plan)}</span>` : ''}
    <p>${tr('Agenteeq teď ukazuje jeho práci, limity a spotřebu. Konverzace zůstávají jen na tomhle Macu.')}</p></div>`;
}

function ukazHotovo(u) {
  modal({ title: tr('Model je napojený'), body: obsahHotovo(u), footer: '<button type="submit" class="btn btn--primary">Hotovo</button>' });
}

// Klik na „Napojit“. Vrací, až okno zmizí (napojeno, zrušeno nebo vypršelo).
export async function spustNapojeni(n, { poZmene = () => {} } = {}) {
  let r;
  vLetu.set(n.id, null);
  try {
    r = await api.napojit(n.id);
  } catch (err) {
    vLetu.delete(n.id);
    if (err.status === 409) {
      toast(err.message, { tone: 'info', timeout: 8000 });
      document.querySelector('[data-region="extension"]')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    throw err;
  }
  const predbehlo = vLetu.get(n.id);
  vLetu.delete(n.id);
  if (predbehlo) {
    ukazHotovo(predbehlo);
    poZmene();
    return;
  }
  if (r.uz) {
    ukazHotovo({ label: n.label, plan: r.plan, uz: true });
    poZmene();
    return;
  }
  poZmene();
  const vysledek = await modal({
    title: `${tr('Napojit')} ${n.label}`,
    body: `<div class="model-wait" aria-live="polite">
        <p>${textCekani(n)}</p>
        <p class="model-wait-state"><span class="model-wait-dot" aria-hidden="true"></span>${tr('Čekám na přihlášení…')}</p>
        ${r.prikaz ? `<p class="model-wait-cmd">${tr('Příkaz v Terminálu:')} <code>${esc(r.prikaz)}</code></p>` : ''}
        <p class="account-privacy">${ICON.shield}<span>${esc(SOUKROMI)}</span></p>
      </div>`,
    footer: `<button type="button" class="btn" data-close>${tr('Zrušit')}</button>`,
    onOpen: (scrim, close) => { cekajici = { id: n.id, label: n.label, scrim, close }; },
  });
  const byloCekani = cekajici?.id === n.id && !cekajici.hotovo;
  cekajici = null;
  // Zavřené okno bez výsledku = člověk to vzdal. Server přestane hlídat.
  if (!vysledek && byloCekani) await api.napojeniZrusit(n.id).catch(() => {});
  poZmene();
}

// Zpráva ze serveru: napojeno, nebo vypršelo. Otevřené okno se přepne na výsledek.
export function udalostNapojeni(u) {
  if (cekajici && cekajici.id === u.id) {
    const form = cekajici.scrim.querySelector('form');
    if (u.udalost === 'napojeno') {
      cekajici.hotovo = true;
      form.querySelector('h2').textContent = tr('Model je napojený');
      form.querySelector('.modal-body').innerHTML = obsahHotovo(u);
      form.querySelector('.modal-foot').innerHTML = '<button type="submit" class="btn btn--primary">Hotovo</button>';
      form.querySelector('.modal-foot .btn').focus();
    } else if (u.udalost === 'vyprselo') {
      cekajici.hotovo = true;
      form.querySelector('.model-wait-state').innerHTML = `${ICON.alert}${tr('Přihlášení za 10 minut nedoběhlo. Zkus to prosím znovu.')}`;
      form.querySelector('.modal-foot').innerHTML = `<button type="button" class="btn" data-close-now>${tr('Zavřít')}</button>`;
      form.querySelector('[data-close-now]').addEventListener('click', () => cekajici?.close(false));
    }
    return;
  }
  if (u.udalost === 'napojeno' && vLetu.has(u.id)) {
    vLetu.set(u.id, u);
    return;
  }
  if (u.udalost === 'napojeno' && !u.uz) ukazHotovo(u);
}
