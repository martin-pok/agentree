// Landing page. Produkt ukazují výřezy skutečného rozhraní (site/detail, scripts/shots-site.mjs)
// a jejich nástup obstará CSS – ve stránce není žádný vložený rám, který by si mohl nechat dotyk
// nebo kolečko myši a zastavit posouvání stránky. Tady zbývají jen drobnosti kolem návodu.

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
