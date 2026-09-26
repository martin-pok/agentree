// Napojení modelů tlačítkem (src/napojeni.js). Klik spustí přihlášení u dodavatele rovnou
// v prohlížeči (bez Terminálu), okno Agenteeq čeká a samo pozná, až je hotovo – pak ukáže
// potvrzení. Zadává se jen v nouzi: kód ze stránky, když se prohlížeč sám neotevřel.
import { api } from './api.js';
import { esc, rel } from './format.js';
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
  // „Nevím“ (null) a „hledal jsem a nenašel“ (false) jsou dvě různé věci a musí tak i vypadat.
  if (n.druh === 'agent' && n.nainstalovano === null) {
    stav = stateBadge('unavailable', tr('Nepodařilo se zjistit'));
  } else if (n.druh === 'agent' && !n.nainstalovano) {
    stav = stateBadge('missing', tr('Nenalezen'));
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
    <div class="model-main"><b>${esc(n.label)}</b><span>${n.druh === 'web' ? tr('Webový chat') : `${tr('Agent na tomhle Macu')} · ${posledniPrace(n)}`}</span></div>
    ${stav}${akce}</li>`;
}

// Tokeny i stav se berou z přepisů na tomhle Macu. Když tu agent nepracoval (třeba běžel
// v cloudu), je to vidět přímo u něj – jinak nulové tokeny vypadají jako chyba.
function posledniPrace(n) {
  if (n.posledni) return `${tr('naposledy pracoval')} <span data-ago="${Number(n.posledni)}">${esc(rel(n.posledni))}</span>`;
  return n.oknoDni ? tr('posledních {0} dní tu nepracoval', Number(n.oknoDni)) : tr('zatím tu nepracoval');
}

function textCekani(n) {
  const kdo = DODAVATEL[n.provider] || n.label;
  return n.druh === 'web'
    ? tr('V prohlížeči se otevřel {0}. Přihlas se, pokud ještě nejsi, a otevři jakoukoli konverzaci – rozšíření dá Agenteeq vědět a napojení se potvrdí samo.', esc(n.label))
    : tr('V prohlížeči se otevírá přihlášení {0}. Přihlas se svým účtem u {1} a potvrď přístup. Až bude hotovo, Agenteeq to pozná sám.', esc(n.label), esc(kdo));
}

// „Prohlížeč se neotevřel?“ – server otevře záložní odkaz z přihlášení. Claude Code pak na stránce
// ukáže kód; pole pro něj vznikne až teď, aby okno při otevření nedávalo fokus skrytému poli.
function zaloha(n, scrim) {
  const box = scrim.querySelector('.model-wait-fallback');
  const tlacitko = box?.querySelector('[data-otevrit-znovu]');
  if (!tlacitko) return;
  const chyba = (text) => {
    const fe = scrim.querySelector('.form-error');
    fe.textContent = text;
    fe.hidden = !text;
  };
  tlacitko.addEventListener('click', async () => {
    chyba('');
    tlacitko.disabled = true;
    tlacitko.classList.add('is-busy');
    try {
      const r = await api.napojeniOdkaz(n.id);
      if (r.kod && !box.querySelector('input')) {
        const id = `kod-${n.id.replace(/[^\w-]/g, '')}`;
        box.insertAdjacentHTML('beforeend', `<div class="model-wait-code">
          <label for="${id}">${tr('Kód z přihlašovací stránky')}</label>
          <div class="model-wait-code-row"><input id="${id}" type="text" autocomplete="off" autocapitalize="off" spellcheck="false">
            <button type="button" class="btn btn--sm btn--primary" data-poslat-kod>${tr('Potvrdit')}</button></div>
          <p class="model-wait-hint">${tr('Po přihlášení ti stránka ukáže kód. Zkopíruj ho celý a vlož sem.')}</p></div>`);
        const pole = box.querySelector('input');
        const poslat = box.querySelector('[data-poslat-kod]');
        const odeslat = async () => {
          chyba('');
          poslat.disabled = true;
          try {
            await api.napojeniKod(n.id, pole.value);
            poslat.textContent = tr('Ověřuji…');
          } catch (err) {
            chyba(err.message);
            poslat.disabled = false;
          }
        };
        poslat.addEventListener('click', odeslat);
        // Enter v jediném poli by odeslal celý formulář a okno zavřel.
        pole.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); odeslat(); } });
        pole.focus();
      }
    } catch (err) {
      chyba(err.message);
    } finally {
      tlacitko.disabled = false;
      tlacitko.classList.remove('is-busy');
    }
  });
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
        ${n.druh === 'agent' ? `<div class="model-wait-fallback"><button type="button" class="btn btn--sm" data-otevrit-znovu>${tr('Prohlížeč se neotevřel?')}</button></div>` : ''}
        <p class="account-privacy">${ICON.shield}<span>${esc(SOUKROMI)}</span></p>
      </div>`,
    footer: `<button type="button" class="btn" data-close>${tr('Zrušit')}</button>`,
    onOpen: (scrim, close) => {
      cekajici = { id: n.id, label: n.label, scrim, close };
      zaloha(n, scrim);
    },
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
    } else if (u.udalost === 'vyprselo' || u.udalost === 'selhalo') {
      cekajici.hotovo = true;
      form.querySelector('.model-wait-state').innerHTML = `${ICON.alert}${u.udalost === 'selhalo' ? tr('Přihlášení {0} skončilo bez napojení. Zkus to prosím znovu.', esc(u.label)) : tr('Přihlášení za 10 minut nedoběhlo. Zkus to prosím znovu.')}`;
      form.querySelector('.model-wait-fallback')?.remove();
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
