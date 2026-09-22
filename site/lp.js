// Prohlídka přepíná skutečné snímky aplikace. Žádná smyšlená čísla se na stránce nedopočítávají.
const POHLEDY = {
  prehled: { popis: 'Obrazovka Přehled v Agenteeq: dva pracující agenti, jeden čeká na rozhodnutí, pod tím nabídka na spuštění dalšího agenta.', nazev: 'Přehled' },
  projekty: { popis: 'Obrazovka Projekty v Agenteeq: karty projektů s počtem konverzací a použitými nástroji.', nazev: 'Projekty' },
  utrata: { popis: 'Obrazovka Útrata v Agenteeq: zadaná předplatná, dokoupené kredity a měřené tokeny oddělené od sebe.', nazev: 'Útrata' },
};

const obrazek = document.getElementById('tour-obrazek');
const varianty = document.querySelectorAll('#tour-figure [data-vzor]');
const hlaseni = document.getElementById('tour-announcement');
const pohyb = matchMedia('(prefers-reduced-motion: reduce)');
let prechod;

for (const tlacitko of document.querySelectorAll('[data-tour]')) {
  tlacitko.addEventListener('click', () => {
    const klic = tlacitko.dataset.tour;
    const pohled = POHLEDY[klic];
    if (!pohled || tlacitko.getAttribute('aria-pressed') === 'true') return;
    for (const jine of document.querySelectorAll('[data-tour]')) jine.setAttribute('aria-pressed', String(jine === tlacitko));
    // Každá varianta (světlá, tmavá, telefon) má vlastní předlohu adresy; mění se jen název obrazovky.
    for (const prvek of varianty) {
      const adresa = prvek.dataset.vzor.replace('{}', klic);
      if (prvek.tagName === 'SOURCE') prvek.srcset = adresa; else prvek.src = adresa;
    }
    obrazek.alt = pohled.popis;
    if (hlaseni) hlaseni.textContent = `Obrazovka ${pohled.nazev}. ${pohled.popis}`;
    prechod?.cancel();
    if (!pohyb.matches) prechod = obrazek.animate([{ opacity: .45 }, { opacity: 1 }], { duration: 240, easing: 'cubic-bezier(.2,.8,.2,1)' });
  });
}
pohyb.addEventListener('change', () => { if (pohyb.matches) prechod?.cancel(); });

// Adresa rozšíření v Chromu nejde otevřít odkazem, ale zkopírovat se dá.
for (const pole of document.querySelectorAll('[data-kopirovat]')) {
  pole.setAttribute('role', 'button');
  pole.setAttribute('tabindex', '0');
  pole.setAttribute('title', 'Kliknutím zkopíruješ');
  const kopiruj = async () => {
    try {
      await navigator.clipboard.writeText(pole.dataset.kopirovat);
      const puvodni = pole.textContent;
      pole.textContent = 'zkopírováno';
      setTimeout(() => { pole.textContent = puvodni; }, 1200);
    } catch { /* prohlížeč bez schránky – text zůstane k ručnímu označení */ }
  };
  pole.addEventListener('click', kopiruj);
  pole.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); kopiruj(); } });
}

const odkryjRozsireni = () => { if (location.hash === '#rozsireni') document.getElementById('rozsireni').open = true; };
addEventListener('hashchange', odkryjRozsireni);
odkryjRozsireni();
