import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

// Plášť pro Windows se sestavuje s nástroji Visual Studia. Dřív je nastavovala cizí akce
// ilammy/msvc-dev-cmd (bez vydání od dubna 2024, Node 20); teď vlastní skript bez cizího kódu.
const zdroj = (f) => fs.readFile(new URL(`../${f}`, import.meta.url), 'utf8');

test('Windows: prostředí Visual Studia nastavuje vlastní skript, ne cizí akce', async () => {
  for (const f of ['.github/workflows/test.yml', '.github/workflows/release.yml']) {
    const yml = await zdroj(f);
    assert.doesNotMatch(yml, /msvc-dev-cmd/, f);
    assert.match(yml, /- name: Nástroje Visual Studio\n\s+shell: pwsh\n\s+run: \.\/scripts\/msvc-prostredi\.ps1\n\s+- name: Sestavit/, f);
  }
  const ps = await zdroj('scripts/msvc-prostredi.ps1');
  assert.match(ps, /\$ErrorActionPreference = 'Stop'/);
  assert.match(ps, /-requires Microsoft\.VisualStudio\.Component\.VC\.Tools\.x86\.x64/);
  assert.match(ps, /-arch=x64 -host_arch=x64/);
  assert.match(ps, /if \(\$LASTEXITCODE -ne 0\) \{ throw/, 'selhání VsDevCmd nesmí projít potichu');
  assert.match(ps, /Out-File -FilePath \$env:GITHUB_ENV -Append/);
});
