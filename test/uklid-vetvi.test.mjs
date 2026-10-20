import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

// Sloučené větve se hromadily (přes 160). Úklid smí smazat jen větev, jejíž hlava je přesně
// commit sloučeného PR; main, chráněné větve, otevřené PR a novější práci nechává.
const yml = await fs.readFile(new URL('../.github/workflows/uklid-vetvi.yml', import.meta.url), 'utf8');

test('úklid větví: maže jen přesnou shodu větev + commit sloučeného PR', () => {
  assert.match(yml, /\[ "\$JMENO" != "main" \] \|\| continue/);
  assert.match(yml, /\[ "\$CHRANENA" != "true" \] \|\| continue/);
  assert.match(yml, /grep -Fxq -- "\$JMENO" otevrene\.txt/, 'větev s otevřeným PR zůstává');
  assert.match(yml, /grep -Fxq -- "\$\(printf '%s\\t%s' "\$JMENO" "\$SHA"\)" sloucene\.tsv/, 'jen přesná hlava sloučeného PR');
  assert.match(yml, /\[ "\$STAV" = "behind" \] \|\| \[ "\$STAV" = "identical" \] \|\| continue/, 'nebo je celá větev v historii main; selhání zjištění = nemazat');
  assert.match(yml, /select\(\.merged_at != null/, 'jen sloučené, ne zavřené bez sloučení');
  assert.match(yml, /gh api --method DELETE "repos\/\$REPO\/git\/refs\/\$REF"/);
  assert.doesNotMatch(yml, /refs\/tags|heads\/main"/, 'tagy ani main se nemažou');
  assert.doesNotMatch(yml, /\$\{\{\s*(inputs|github\.event)\./, 'do skriptu nevstupuje nic zvenku');
});
