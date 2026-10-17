// Prázdný profil (issue #255): čerstvá instalace bez agentů, projektů, upozornění, dovedností,
// aktivity a připojených zdrojů. Sdílí ho `npm run qa:tvary` a `npm run qa:contrast`: oba projdou
// stejné obrazovky a k vlastnímu měření (tvary, kontrast) přidají kontrolu, že prázdná obrazovka
// vypadá záměrně – jeden prázdný stav s hlavní akcí (kapsle) a žádná čísla, která by vypadala
// jako změřená data (nulové dlaždice, prázdné grafy, filtry s nulami).
import { startTestServer, api } from '../test/helpers.mjs';

// Obrazovka → kde stojí prázdný stav a jeho hlavní akce. Nastavení prázdný stav nemá (je to
// nastavení zdrojů, ne data), měří se ale stejně.
export const PRAZDNE_OBRAZOVKY = {
  prehled: '[data-region="prazdno"] .empty .btn--primary',
  agenti: '[data-region="table"] .empty .btn--primary',
  projekty: '[data-region="grid"] .empty .btn--primary',
  statistiky: '[data-region="prazdno"] .empty .btn--primary',
  utrata: '.spend-hero.is-unavailable .btn--primary',
  upozorneni: '[data-region="list"] .empty .btn--primary',
  dovednosti: '[data-region="list"] .empty .btn--primary',
  nastaveni: null,
  'agent/neexistuje': '[data-region="head"] .empty .btn--primary',
};

// Co se v prázdném profilu nesmí ukázat: dlaždice a počty, které by tvrdily „0“ jako změřenou
// hodnotu, a grafy nad prázdnými daty.
const FALESNA_CISLA = ['.kpi', '.zdravi-pocty', '.pb-num', '.meter-track', '.chart-plot', '.heat', '.seg .count', '.pcard'];

function zkontroluj({ cta, falesna }) {
  const videt = (n) => Boolean(n && n.getClientRects().length && getComputedStyle(n).visibility !== 'hidden');
  const chyby = [];
  if (cta) {
    const tlacitko = document.querySelector(cta);
    if (!videt(tlacitko)) chyby.push(`chybí prázdný stav s hlavní akcí (${cta})`);
    else {
      if (!tlacitko.textContent.trim()) chyby.push('hlavní akce nemá popisek');
      const prazdno = tlacitko.closest('.empty');
      if (prazdno && !prazdno.querySelector('.empty-mark')) chyby.push('prázdný stav bez robota (emptyState())');
      if (prazdno && !prazdno.querySelector('p')?.textContent.trim()) chyby.push('prázdný stav bez vysvětlující věty');
    }
  }
  for (const sel of falesna) {
    const n = [...document.querySelectorAll(sel)].find(videt);
    if (n) chyby.push(`viditelné „${sel}“ nad prázdnými daty: „${n.textContent.trim().slice(0, 40)}“`);
  }
  return chyby;
}

// Ověří, že hlavní akce opravdu někam vede (ne jen vypadá jako tlačítko).
const AKCE = {
  prehled: async (page) => page.waitForFunction(() => location.hash.startsWith('#/nastaveni')),
  upozorneni: async (page) => page.waitForFunction(() => location.hash.startsWith('#/nastaveni')),
  projekty: async (page) => page.waitForSelector('.modal-scrim'),
  'agent/neexistuje': async (page) => page.waitForFunction(() => location.hash === '#/agenti'),
};

/**
 * Spustí server nad prázdnými dočasnými složkami a projde obrazovky. `mer(page, popis)` je měření
 * volajícího skriptu; vrácené chyby kontroly prázdných stavů jdou do `chyby(popis, seznam)`.
 */
export async function projdiPrazdnyProfil(browser, { sirky, rezimy = ['light'], mer, chyby }) {
  const app = await startTestServer();
  try {
    const verze = (await api(app.url).get('/api/state')).body.version;
    // Úvodní průvodce a „Co je nového“ by obrazovku zakryly; průvodce na Přehledu (onboarding) zůstává.
    await api(app.url).send('PUT', '/api/settings', { welcomeCompleted: true, lastSeenVersion: verze });
    let akceOvereny = false;
    for (const rezim of rezimy) {
      await api(app.url).send('PUT', '/api/settings', { appearance: rezim });
      for (const sirka of sirky) {
        const page = await browser.newPage({ viewport: { width: sirka, height: 1000 }, reducedMotion: 'reduce', serviceWorkers: 'block' });
        const konzole = [];
        page.on('pageerror', (e) => konzole.push(e.message));
        page.on('console', (m) => { if (m.type() === 'error' && !/404 \(Not Found\)/.test(m.text())) konzole.push(m.text()); });
        for (const [trasa, cta] of Object.entries(PRAZDNE_OBRAZOVKY)) {
          const popis = `prázdný profil ${rezim} ${sirka}px /${trasa}`;
          await page.goto(`${app.url}/#/${trasa}`, { waitUntil: 'domcontentloaded' });
          await page.waitForFunction(() => (document.querySelector('#view')?.innerText || '').trim().length > 0, null, { timeout: 20000 });
          if (cta) await page.waitForSelector(cta, { timeout: 10000 }).catch(() => {});
          await page.evaluate(() => document.fonts.ready);
          await page.waitForTimeout(300);
          chyby(popis, await page.evaluate(zkontroluj, { cta, falesna: FALESNA_CISLA }));
          await mer(page, popis);
          if (trasa === 'prehled') {
            await page.evaluate(() => { const d = document.querySelector('details.home-history'); if (d) d.open = true; });
            await page.waitForTimeout(300);
            chyby(`${popis} › průběh dne`, await page.evaluate(zkontroluj, { cta: null, falesna: FALESNA_CISLA }));
            await mer(page, `${popis} › průběh dne`);
          }
          if (!akceOvereny && AKCE[trasa]) {
            await page.click(cta);
            const ok = await AKCE[trasa](page).then(() => true, () => false);
            if (!ok) chyby(`${popis} › klik na hlavní akci`, ['hlavní akce nikam nevede']);
            await page.keyboard.press('Escape');
          }
        }
        akceOvereny = true;
        chyby(`prázdný profil ${rezim} ${sirka}px konzole`, konzole);
        await page.close();
      }
    }
  } finally {
    await app.close();
  }
}
