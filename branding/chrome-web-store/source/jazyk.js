// Jazyk snímku: s ?lang=en se texty a obrázky přepnou na anglickou verzi z atributů data-en
// a data-en-src. Kompozice zůstává jedna pro oba jazyky, mění se jen obsah.
if (new URLSearchParams(location.search).get('lang') === 'en') {
  document.documentElement.lang = 'en';
  for (const el of document.querySelectorAll('[data-en]')) el.innerHTML = el.dataset.en;
  for (const el of document.querySelectorAll('[data-en-src]')) el.src = el.dataset.enSrc;
}
