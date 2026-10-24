// Našeptávač štítků ve stylu aplikace (místo systémového <datalist>, který vypadal cize a nešel
// vyladit): pod polem nabídka stejná jako rozbalovací výběr (.picker-menu). Pole drží štítky oddělené
// čárkou; nabízí se jen k právě psanému štítku a jen ty, které v poli ještě nejsou.
// Klávesnice: šipky vyberou, Enter nebo Tab doplní, Esc zavře. Pole je combobox (ARIA 1.2).
let pocitadlo = 0;
let zdroj = () => [];

const casti = (hodnota) => hodnota.split(',');
const normal = (t) => t.trim().toLocaleLowerCase('cs');

export function navrhyStitku(hodnota, vsechny) {
  const kusy = casti(hodnota);
  const psany = normal(kusy.at(-1) || '');
  const pouzite = new Set(kusy.slice(0, -1).map(normal).filter(Boolean));
  return vsechny
    .filter((t) => !pouzite.has(normal(t)) && normal(t) !== psany && (!psany || normal(t).includes(psany)))
    .sort((a, b) => Number(!normal(a).startsWith(psany)) - Number(!normal(b).startsWith(psany)) || a.localeCompare(b, 'cs'))
    .slice(0, 8);
}

export function doplnStitek(hodnota, stitek) {
  const kusy = casti(hodnota);
  kusy[kusy.length - 1] = ` ${stitek}`;
  return `${kusy.map((k) => k.trim()).filter(Boolean).join(', ')}, `;
}

function pripoj(pole) {
  if (pole.dataset.naseptavacPripojen) return false;
  pole.dataset.naseptavacPripojen = '1';
  const id = `naseptavac-${++pocitadlo}`;
  pole.setAttribute('role', 'combobox');
  pole.setAttribute('aria-autocomplete', 'list');
  pole.setAttribute('aria-expanded', 'false');
  pole.setAttribute('aria-controls', id);
  let panel = null, navrhy = [], index = -1;

  const zavri = () => {
    panel?.hidePopover?.();
    panel?.remove();
    panel = null;
    index = -1;
    pole.setAttribute('aria-expanded', 'false');
    pole.removeAttribute('aria-activedescendant');
  };
  const zvyrazni = () => {
    if (!panel) return;
    [...panel.children].forEach((x, i) => {
      x.classList.toggle('is-highlighted', i === index);
      x.setAttribute('aria-selected', String(i === index));
    });
    if (index >= 0) pole.setAttribute('aria-activedescendant', `${id}-${index}`);
    else pole.removeAttribute('aria-activedescendant');
  };
  const vyber = (i) => {
    const t = navrhy[i];
    if (!t) return;
    pole.value = doplnStitek(pole.value, t);
    pole.dispatchEvent(new Event('input', { bubbles: true }));
    pole.setSelectionRange(pole.value.length, pole.value.length);
  };
  const otevri = () => {
    navrhy = navrhyStitku(pole.value, zdroj());
    if (!navrhy.length || document.activeElement !== pole) { zavri(); return; }
    if (!panel) {
      panel = document.createElement('div');
      panel.className = 'picker-menu naseptavac';
      panel.id = id;
      panel.setAttribute('role', 'listbox');
      panel.setAttribute('popover', 'manual');
      // Uvnitř modálního okna musí být i nabídka (jinak ji čtečka obrazovky nevidí).
      (pole.closest('[aria-modal="true"]') || document.body).append(panel);
      panel.showPopover?.();
      pole.setAttribute('aria-expanded', 'true');
    }
    panel.replaceChildren(...navrhy.map((t, i) => {
      const x = document.createElement('div');
      x.className = 'picker-option';
      x.id = `${id}-${i}`;
      x.setAttribute('role', 'option');
      x.textContent = t;
      x.addEventListener('pointerdown', (e) => e.preventDefault());
      x.addEventListener('click', () => vyber(i));
      return x;
    }));
    index = Math.min(index, navrhy.length - 1);
    const r = pole.getBoundingClientRect();
    panel.style.width = `${Math.min(r.width, innerWidth - 24)}px`;
    panel.style.left = `${Math.max(12, r.left)}px`;
    const dole = innerHeight - r.bottom - 16;
    panel.style.maxHeight = `${Math.max(64, Math.min(280, Math.max(dole, r.top - 16)))}px`;
    panel.style.top = `${dole >= Math.min(panel.scrollHeight, 200) || dole >= r.top ? r.bottom + 6 : Math.max(8, r.top - panel.offsetHeight - 6)}px`;
    zvyrazni();
  };

  pole.addEventListener('input', otevri);
  pole.addEventListener('focus', otevri);
  pole.addEventListener('blur', () => setTimeout(zavri, 0));
  pole.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (!panel) otevri();
      if (!navrhy.length) return;
      e.preventDefault();
      index = (index + (e.key === 'ArrowDown' ? 1 : -1) + navrhy.length) % navrhy.length;
      zvyrazni();
    } else if ((e.key === 'Enter' || e.key === 'Tab') && panel && index >= 0) {
      e.preventDefault();
      vyber(index);
    } else if (e.key === 'Escape' && panel) {
      e.preventDefault();
      e.stopPropagation();
      zavri();
    }
  });
  return true;
}

// Pole se připojí samo při prvním zaostření – formulář projektu vzniká v dialogu až za běhu.
// `stitky` = funkce vracející všechny známé štítky (projects-ui.js#vsechnyStitky).
export function initNaseptavac(stitky) {
  zdroj = stitky;
  document.addEventListener('focusin', (e) => {
    if (e.target instanceof HTMLInputElement && e.target.matches('[data-naseptavac="stitky"]') && pripoj(e.target)) {
      e.target.dispatchEvent(new Event('focus'));
    }
  });
}
