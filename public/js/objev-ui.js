// Okno „Našli jsme na tvém Macu“ (src/objev.js). Ukáže AI nástroje, které Agenteeq na počítači
// opravdu našel, a každý jde napojit pár kliknutími. Napojení vždy vede přes potvrzovací obrazovku:
// co Agenteeq uvidí, co ne a co se po kliknutí stane. Bez potvrzení se nic nenapojí.
// Ukáže se jednou po úvodním průvodci; znovu ho otevře tlačítko v Nastavení (data-objev).
import { api } from './api.js';
import { state, subscribe } from './state.js';
import { esc, plural } from './format.js';
import { glyph, ICON } from './icons.js';
import { stateBadge, toast } from './ui.js';
import { goToExtension } from './jump.js';
import { druhNazev } from './nastroje.js';
import { tr, tomtoPocitaci, tentoPocitac, tvemPocitaci } from './i18n.js';
import { spustNapojeni } from './napojeni-ui.js';
import { adresaSouboru } from './verze.js';

const DODAVATEL = { anthropic: 'Anthropic', openai: 'OpenAI', google: 'Google', github: 'GitHub', cursor: 'Cursor', perplexity: 'Perplexity', microsoft: 'Microsoft', xai: 'xAI', alibaba: 'Alibaba' };
const WEB = { id: 'web', name: tr('Webové chaty v Chromu'), veVete: tr('webové chaty'), provider: 'openai', cesta: 'rozsireni', overeno: true, web: true };
const WEB_LOGA = ['openai', 'claude', 'gemini', 'perplexity'];

// Rozhodovat smí jen okno na počítači s Agenteeq – telefon je jen ke čtení (src/remote-scope.js).
const naMacu = () => Boolean(window.agenteeqDesktop) || ['127.0.0.1', 'localhost', '[::1]'].includes(location.hostname);

let dialog = null;
let data = null;
let zkontrolovano = false;

const logo = (n) => (n.web ? `<span class="objev-loga">${WEB_LOGA.map((p) => glyph(p)).join('')}</span>` : glyph({ runtime: n.id, provider: n.provider }));

function kde(n) {
  if (n.web) return (data?.web?.sluzby || []).filter((s) => !s.includes('·')).slice(0, 4).join(', ');
  const k = { bezi: tr('běží právě teď'), aplikace: tr('nainstalovaná aplikace'), program: tr('nainstalovaný program'), drive: tr('už tu běžel') }[n.kde] || '';
  return `${druhNazev(n)}${k ? ` · ${k}` : ''}`;
}

function radek(n) {
  const beta = n.overeno ? '' : `<span class="badge badge--beta" title="${esc(tr('Rozpoznání zatím neověřené na skutečném počítači.'))}">${tr('Beta')}</span>`;
  const akce = n.napojeno === true
    ? stateBadge('connected', n.cesta === 'rozsireni' ? tr('Rozšíření spárované') : tr('Napojeno'))
    : `<button class="btn btn--sm${n.web ? '' : ' btn--primary'}" type="button" data-objev-napojit="${esc(n.id)}" aria-label="${esc(tr('Napojit {0}', n.name))}">${tr('Napojit')}</button>`;
  return `<li class="objev-row"><span class="model-logo${n.web ? ' model-logo--skupina' : ''}">${logo(n)}</span>
    <span class="objev-main"><b>${esc(n.name)}${beta}</b><span>${esc(kde(n))}</span></span>${akce}</li>`;
}

function seznamHtml() {
  const list = data?.nastroje || [];
  const n = list.length;
  const titulek = n ? tr('Našli jsme {0}', `${n} ${plural(n, 'AI nástroj', 'AI nástroje', 'AI nástrojů')}`) : tr('Na {0} jsme zatím nic nenašli', tvemPocitaci());
  const uvod = n
    ? tr('Vyber, co má Agenteeq sledovat. Každé napojení nejdřív potvrdíš a uvidíš přesně, co Agenteeq uvidí.')
    : data?.hledano === false
      ? tr('Na {0} se nástroje hledat nedaly. Agenta pozná Agenteeq ve chvíli, kdy poběží.', tomtoPocitaci())
      : tr('Žádný známý AI nástroj tu není nainstalovaný ani nebězí. Jakmile nějaký spustíš, Agenteeq ho pozná sám.');
  return `<header class="objev-head"><p class="objev-kicker">${tr('Nalezeno na {0}', tvemPocitaci())}</p>
      <h2 id="objev-title" tabindex="-1">${esc(titulek)}</h2><p>${esc(spoj(uvod))}</p></header>
    ${n ? `<ul class="objev-list" aria-label="${esc(tr('Nalezené nástroje'))}">${list.map(radek).join('')}</ul>` : ''}
    <p class="objev-sekce">${tr('V prohlížeči')}</p>
    <ul class="objev-list">${radek({ ...WEB, napojeno: Boolean(data?.web?.sparovano) })}</ul>
    <footer class="objev-foot"><p class="account-privacy">${ICON.shield}<span>${esc(tr('Text konverzací, jejich názvy ani kód neopustí {0}.', tentoPocitac()))}</span></p>
      <button class="btn btn--primary" type="button" data-objev-hotovo>${tr('Hotovo')}</button></footer>`;
}

// Co Agenteeq uvidí, co ne a jak napojení proběhne. Tvrdí se jen to, co o Agenteeq platí.
function prava(n) {
  const kdo = DODAVATEL[n.provider] || n.name;
  if (n.cesta === 'prihlaseni') {
    return {
      ano: [tr('Konverzace a jejich stav z přepisů na {0}', tomtoPocitaci()), tr('Spotřebu tokenů a limity tvého plánu')],
      ne: [tr('Heslo ani přístupové klíče – přihlašuješ se přímo u {0}', kdo), tr('Text konverzací neopustí {0}', tentoPocitac())],
      jak: tr('V prohlížeči se otevře přihlášení u {0}. Terminál není potřeba.', kdo),
      tlacitko: tr('Povolit a přihlásit'),
    };
  }
  if (n.cesta === 'rozsireni') {
    return {
      ano: [tr('Stav konverzace v záložce: pracuje, čeká na tebe, dosažený limit'), tr('Název a nejvýš 60 viditelných zpráv konverzace')],
      ne: [tr('Přílohy, soubory cookie a přihlašovací údaje'), tr('Zprávy, které stránka právě nevykresluje')],
      jak: data?.web?.sparovano ? tr('Rozšíření pro Chrome už je spárované. Stačí mít službu otevřenou v záložce.') : tr('Přidáš rozšíření Agenteeq do Chromu a spáruješ ho kódem z této aplikace.'),
      tlacitko: data?.web?.sparovano ? tr('Povolit') : tr('Povolit a přidat rozšíření'),
    };
  }
  if (n.cesta === 'zaznamy') {
    return {
      ano: [n.vidim || tr('Konverzace, jejich stav a tokeny z přepisů na {0}', tomtoPocitaci())],
      ne: [tr('Text konverzací neopustí {0}', tentoPocitac()), tr('Nic se neinstaluje a v nástroji se nic nemění')],
      jak: tr('Agenteeq začne číst záznamy, které {0} ukládá na {1}. Sledování zrušíš v Nastavení → Moje nástroje.', n.name, tomtoPocitaci()),
      tlacitko: tr('Povolit'),
    };
  }
  return {
    ano: [tr('Kdy {0} běží a jak dlouho', n.name)],
    ne: [tr('Obsah konverzací – ten Agenteeq u tohoto nástroje číst neumí')],
    jak: tr('{0} přibude do Mých nástrojů a v Přehledu uvidíš, kdy pracuje.', n.name),
    tlacitko: tr('Povolit'),
  };
}

function potvrzeniHtml(n) {
  const p = prava(n);
  const li = (t) => `<li>${esc(spoj(t))}</li>`;
  return `<button class="link objev-zpet" type="button" data-objev-zpet>${ICON.back}${tr('Zpět na seznam')}</button>
    <div class="objev-par" aria-hidden="true"><span class="objev-dlazdice"><img src="${adresaSouboru('/brand/agenteeq-mark.svg')}" width="36" height="36" alt=""></span>
      <span class="objev-spoj"><i></i><i></i><i></i></span><span class="objev-dlazdice">${logo(n)}</span></div>
    <header class="objev-head objev-head--stred"><p class="objev-kicker">${tr('Potvrzení přístupu')}</p>
      <h2 id="objev-title" tabindex="-1">${esc(spoj(tr('Napojit {0} k Agenteeq?', n.veVete || n.name)))}</h2>${n.popis ? `<p>${esc(n.popis)}</p>` : ''}</header>
    <div class="objev-prava">
      <section class="objev-pravo objev-pravo--ano"><h3>${ICON.check}${tr('Agenteeq uvidí')}</h3><ul>${p.ano.map(li).join('')}</ul></section>
      <section class="objev-pravo objev-pravo--ne"><h3>${ICON.shield}${tr('Agenteeq neuvidí')}</h3><ul>${p.ne.map(li).join('')}</ul></section>
    </div>
    <p class="objev-jak">${esc(spoj(p.jak))}</p>
    <p class="objev-chyba" role="alert" hidden></p>
    <footer class="objev-foot objev-foot--potvrzeni"><button class="btn" type="button" data-objev-zpet>${tr('Zrušit')}</button>
      <button class="btn btn--primary" type="button" data-objev-povolit="${esc(n.id)}">${esc(p.tlacitko)}</button></footer>`;
}

// Jednopísmenná předložka nezůstane na konci řádku (česká sazba).
const spoj = (t) => String(t).replace(/(^|\s)([kvszouaiKVSZOUAI]) /g, '$1$2\u00a0');

const obsah = () => dialog?.querySelector('.objev-obsah');
const najdi = (id) => (id === 'web' ? { ...WEB, napojeno: Boolean(data?.web?.sparovano) } : (data?.nastroje || []).find((n) => n.id === id));

function ukazSeznam(fokusId) {
  if (!dialog) return;
  obsah().innerHTML = seznamHtml();
  const cil = fokusId && obsah().querySelector(`[data-objev-napojit="${CSS.escape(fokusId)}"]`);
  (cil || obsah().querySelector('#objev-title')).focus({ preventScroll: true });
}

function ukazPotvrzeni(n) {
  obsah().innerHTML = potvrzeniHtml(n);
  obsah().scrollTop = 0;
  obsah().querySelector('#objev-title').focus({ preventScroll: true });
}

async function nacti() {
  data = await api.objev();
  return data;
}

async function povolit(n, tlacitko) {
  const chyba = obsah().querySelector('.objev-chyba');
  chyba.hidden = true;
  tlacitko.disabled = true;
  tlacitko.classList.add('is-busy');
  try {
    if (n.cesta === 'prihlaseni') {
      // Přihlášení má vlastní okno s čekáním (napojeni-ui.js); to by pod modálním <dialog> nebylo vidět.
      zavri(false);
      await spustNapojeni({ id: n.napojeniId, label: n.name, provider: n.provider, druh: 'agent' }).catch((err) => toast(err.message, { tone: 'err' }));
      await otevri({ fokusId: n.id });
      return;
    }
    if (!n.web) await api.nastroj(n.id, 'pridat');
    if (n.cesta === 'rozsireni' && !data?.web?.sparovano) {
      zavri(false);
      goToExtension();
      return;
    }
    await nacti();
    toast(n.cesta === 'rozsireni'
      ? tr('Rozšíření je spárované. Konverzace se zobrazí, až odešle stav.')
      : tr('Napojeno: {0}', n.name), { tone: n.cesta === 'rozsireni' ? 'info' : 'ok' });
    ukazSeznam(n.id);
  } catch (err) {
    chyba.textContent = err.message || tr('Napojení se nepodařilo. Zkus to prosím znovu.');
    chyba.hidden = false;
    tlacitko.disabled = false;
    tlacitko.classList.remove('is-busy');
  }
}

function zavri(hotovo = true) {
  if (!dialog) return;
  dialog.close();
  dialog.remove();
  dialog = null;
  if (hotovo && !state.settings?.objevHotovo) {
    api.saveSettings({ objevHotovo: true }).then((r) => { state.settings = r.settings; }).catch(() => {});
  }
}

// `jenSNalezem`: samo otevřené okno (po průvodci) se bez nálezu neukáže a chybu nehlásí.
export async function otevri({ fokusId, jenSNalezem = false } = {}) {
  if (dialog || !naMacu()) return;
  try { await nacti(); } catch (err) { if (!jenSNalezem) toast(err.message || tr('Nástroje se nepodařilo zjistit.'), { tone: 'err' }); return; }
  if (dialog || (jenSNalezem && (!data?.nastroje?.length || state.settings?.objevHotovo))) return;
  dialog = document.createElement('dialog');
  dialog.className = 'objev-dialog';
  dialog.setAttribute('aria-labelledby', 'objev-title');
  dialog.innerHTML = '<div class="objev-obsah"></div>';
  document.body.append(dialog);
  dialog.addEventListener('cancel', (e) => {
    e.preventDefault();
    if (obsah().querySelector('[data-objev-povolit]')) ukazSeznam();
    else zavri();
  });
  dialog.addEventListener('click', (e) => {
    const napojit = e.target.closest('[data-objev-napojit]');
    if (napojit) { const n = najdi(napojit.dataset.objevNapojit); if (n) ukazPotvrzeni(n); return; }
    const zpet = e.target.closest('[data-objev-zpet]');
    if (zpet) { const id = obsah().querySelector('[data-objev-povolit]')?.dataset.objevPovolit; ukazSeznam(id); return; }
    const povol = e.target.closest('[data-objev-povolit]');
    if (povol && !povol.disabled) { const n = najdi(povol.dataset.objevPovolit); if (n) povolit(n, povol); return; }
    if (e.target.closest('[data-objev-hotovo]')) zavri();
  });
  dialog.showModal();
  ukazSeznam(fokusId);
}

export function initObjev() {
  subscribe(() => {
    if (zkontrolovano || !state.loaded || !state.settings?.welcomeCompleted) return;
    zkontrolovano = true;
    if (state.settings.objevHotovo || !naMacu() || document.querySelector('.welcome-dialog')) return;
    // Okno má smysl, jen když něco našlo. Prázdný výsledek ho neotevře ani neodškrtne – příště
    // může být Agenteeq chytřejší (programy se hledají až chvíli po startu).
    otevri({ jenSNalezem: true });
  });
  document.addEventListener('click', (e) => { if (e.target.closest('[data-objev]')) otevri(); });
  // Po dokončení úvodního průvodce (welcome.js) rovnou, ne až s další živou událostí.
  window.addEventListener('agenteeq-pruvodce-hotov', () => {
    zkontrolovano = true;
    if (!state.settings?.objevHotovo) otevri({ jenSNalezem: true });
  });
}
