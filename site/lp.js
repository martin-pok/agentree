// Prohlídka přepíná skutečné snímky aplikace. Všechny leží ve stránce nad sebou a mění se jen
// průhlednost – výměna `src` by znamenala prázdný rám, dokud prohlížeč nový soubor nedotáhne.
const NAZVY = { prehled: 'Přehled', projekty: 'Projekty', utrata: 'Útrata' };

const snimky = [...document.querySelectorAll('#tour-figure .shot')];
const hlaseni = document.getElementById('tour-announcement');

for (const tlacitko of document.querySelectorAll('[data-tour]')) {
  tlacitko.addEventListener('click', () => {
    const klic = tlacitko.dataset.tour;
    if (!NAZVY[klic] || tlacitko.getAttribute('aria-pressed') === 'true') return;
    for (const jine of document.querySelectorAll('[data-tour]')) jine.setAttribute('aria-pressed', String(jine === tlacitko));
    for (const snimek of snimky) {
      const aktivni = snimek.dataset.obrazovka === klic;
      snimek.classList.toggle('is-active', aktivni);
      // Neaktivní snímky zůstávají vykreslené kvůli prolnutí, ale odečítačka je číst nemá.
      snimek.toggleAttribute('aria-hidden', !aktivni);
    }
    const popis = snimky.find((s) => s.dataset.obrazovka === klic)?.querySelector('img')?.alt || '';
    if (hlaseni) hlaseni.textContent = `Obrazovka ${NAZVY[klic]}. ${popis}`;
  });
}

// Adresu rozšíření v Chromu nejde otevřít odkazem, ale zkopírovat se dá.
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
