// Probuzení počítače ze spánku. Časovače Node se během spánku zastaví (monotónní hodiny spánek
// nepočítají), Date.now() ale běží dál. Pravidelná úloha po 5 s, mezi jejímiž průchody uplynulo
// přes minutu, tedy znamená, že počítač spal. Stejný práh používá souhrn upozornění (src/alerts.js).
export const PROBUZENI_MEZERA_MS = 60e3;

// Vrací funkci pro každý průchod pravidelné úlohy: `true` jednou, v prvním průchodu po probuzení.
export function hlidacProbuzeni({ mezeraMs = PROBUZENI_MEZERA_MS, now = Date.now } = {}) {
  let posledni = 0;
  return () => {
    const ted = now();
    const spal = posledni > 0 && ted - posledni > mezeraMs;
    posledni = ted;
    return spal;
  };
}
