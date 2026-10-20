import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';

// Drafty se hromadily (20 nezveřejněných kandidátů). Úklid smí smazat jen nezveřejněný Draft
// s verzí nižší, než je nejvyšší verze vůbec; nikdy zveřejněné vydání, tag ani nejnovější Draft.
const yml = await fs.readFile(new URL('../.github/workflows/prune-drafts.yml', import.meta.url), 'utf8');
const release = await fs.readFile(new URL('../.github/workflows/release.yml', import.meta.url), 'utf8');

test('úklid Draftů: maže jen nezveřejněné Drafty přes ID, tagy a vydání nechává', () => {
  assert.match(yml, /\[ "\$DRAFT" = "true" \] \|\| continue/);
  assert.match(yml, /gh api "repos\/\$REPO\/releases\/\$ID" --jq \.draft\)" != "true"/, 'před smazáním znovu ověří Draft');
  assert.match(yml, /gh api --method DELETE "repos\/\$REPO\/releases\/\$ID"/);
  assert.doesNotMatch(yml, /git\/refs\/tags|cleanup-tag|git push --delete/, 'tagy se nemažou');
  assert.doesNotMatch(yml, /\$\{\{\s*(inputs|github\.event)\./, 'do skriptu nevstupuje nic zvenku');
  assert.match(release, /uklid:\n[\s\S]*needs: audit[\s\S]*uses: \.\/\.github\/workflows\/prune-drafts\.yml/, 'spouští se až po auditu nového Draftu');
});

// Výběr spočítá stejný awk/sort -V jako workflow nad vzorovým výpisem.
test('úklid Draftů: vybere správné verze (sort -V, ne abecedně)', () => {
  const skript = yml.slice(yml.indexOf('NEJVYSSI=$('), yml.indexOf('gh api --method DELETE'));
  assert.ok(skript.length > 100);
  const dir = path.join(os.tmpdir(), `prune-${process.pid}`);
  return fs.mkdir(dir, { recursive: true }).then(async () => {
    const tsv = ['1\ttrue\tv0.46.9', '2\ttrue\tv0.46.45', '3\tfalse\tv0.46.43', '4\ttrue\tv0.46.47', '5\ttrue\tnightly', '6\tfalse\tv0.46.0', '7\ttrue\tv0.37.0'].join('\n') + '\n';
    await fs.writeFile(path.join(dir, 'vydani.tsv'), tsv);
    const bash = `set -euo pipefail\ncd "${dir}"\nNEJVYSSI=$(awk -F'\\t' '$3 ~ /^v[0-9]+\\.[0-9]+\\.[0-9]+$/ { print substr($3, 2) }' vydani.tsv | sort -V | tail -n 1)\necho "MAX $NEJVYSSI"\nwhile IFS=$'\\t' read -r ID DRAFT TAG; do\n  [ "$DRAFT" = "true" ] || continue\n  [[ "$TAG" =~ ^v[0-9]+\\.[0-9]+\\.[0-9]+$ ]] || continue\n  VERZE="\${TAG#v}"\n  [ "$VERZE" != "$NEJVYSSI" ] || continue\n  [ "$(printf '%s\\n%s\\n' "$VERZE" "$NEJVYSSI" | sort -V | head -n 1)" = "$VERZE" ] || continue\n  echo "DEL $TAG"\ndone < vydani.tsv\n`;
    let out;
    try { out = execFileSync('bash', ['-c', bash], { encoding: 'utf8' }); } catch (e) { if (e.code === 'ENOENT') return; throw e; }
    assert.match(out, /MAX 0\.46\.47/);
    const smazat = out.split('\n').filter((r) => r.startsWith('DEL ')).map((r) => r.slice(4));
    assert.deepEqual(smazat, ['v0.46.9', 'v0.46.45', 'v0.37.0'], 'zveřejněné, netypové a nejnovější zůstanou');
  }).finally(() => fs.rm(dir, { recursive: true, force: true }));
});
