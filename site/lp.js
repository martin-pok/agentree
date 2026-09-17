// User-controlled illustrative tour: no accounts, live requests or automatic rotation.
const views = {
  overview: ['Přehled', '2', 'agenti pracují', '1', 'čeká na tebe', '3', 'aktivní projekty', 'Teď potřebuje tvoje rozhodnutí', 'Codex · nový web', 'Žádá o povolení zápisu do složky projektu.', 'Čeká na tebe', 'Claude Code · klientský portál', 'Připravuje komponentu navigace', 'Pracuje', 'Cursor · design systém', 'Doplňuje testy formuláře', 'Pracuje', 'Rozhodnutí otevřeš v původním nástroji.'],
  projects: ['Projekt · nový web', '3', 'konverzace', '2', 'nástroje', '1', 'pracovní složka', 'Společný kontext napříč nástroji', 'Nový web · klientský projekt', 'Zadání, pracovní složka a konverzace pohromadě.', 'Projekt', 'Claude Code · návrh navigace', 'Konverzace přiřazená podle pracovní složky', 'Přiřazeno', 'Cursor · testy formuláře', 'Stejný projekt, jiný nástroj', 'Přiřazeno', 'Projekty mají vlastní zadání, pravidla a přehled práce.'],
  limits: ['Limity a útrata', '62 %', 'limit Claude', '1,2 M', 'měřené tokeny', '890 Kč', 'zadané výdaje', 'Tři údaje. Tři různé významy.', 'Limit není cena', 'Procenta ukazují omezení služby, nikoli útratu.', 'Bez odhadů', 'Claude Code · pětihodinové okno', 'Ukázka limitu ze zdroje, který jej poskytuje', '62 %', 'Cursor · měsíční předplatné', 'Ukázka ručně zadané položky', 'Zadáno', 'Výdaje zadáš ručně nebo připojíš podporované Admin API.'],
};
const ids = ['preview-title', 'metric-a', 'metric-a-label', 'metric-b', 'metric-b-label', 'metric-c', 'metric-c-label', 'preview-caption', 'decision-title', 'decision-copy', 'decision-status', 'row-a-title', 'row-a-copy', 'row-a-status', 'row-b-title', 'row-b-copy', 'row-b-status', 'preview-foot'];
const motion = matchMedia('(prefers-reduced-motion: reduce)');
let transition;
for (const button of document.querySelectorAll('[data-tour]')) {
  button.addEventListener('click', () => {
    if (button.getAttribute('aria-pressed') === 'true') return;
    for (const choice of document.querySelectorAll('[data-tour]')) choice.setAttribute('aria-pressed', String(choice === button));
    const values = views[button.dataset.tour];
    ids.forEach((id, i) => { document.getElementById(id).textContent = values[i]; });
    document.getElementById('tour-announcement').textContent = `Ukázka: ${values[0]}. ${values[17]}`;
    transition?.cancel();
    if (!motion.matches) transition = document.getElementById('preview-body').animate([{ opacity: .3, transform: 'translateY(6px)' }, { opacity: 1, transform: 'translateY(0)' }], { duration: 280, easing: 'cubic-bezier(.2,.8,.2,1)' });
  });
}
motion.addEventListener('change', () => { if (motion.matches) transition?.cancel(); });
const exposeDetails = () => { if (location.hash === '#rozsireni') document.getElementById('rozsireni').open = true; };
addEventListener('hashchange', exposeDetails);
exposeDetails();
