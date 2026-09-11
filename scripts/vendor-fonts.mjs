// Reproducible asset download, run only when updating the bundled Google Fonts.
import fs from 'node:fs/promises';
const base = new URL('../public/fonts/', import.meta.url);
await fs.mkdir(base, { recursive: true });
const spec = [
  ['Geist Mono', 'geist-mono', 400, 'geistmono/v6/or3yQ6H-1_WfwkMZI_qYPLs1a-t7PU0AbeE9KJ5T.ttf'],
  ['Geist Mono', 'geist-mono', 500, 'geistmono/v6/or3yQ6H-1_WfwkMZI_qYPLs1a-t7PU0AbeEPKJ5T.ttf'],
  ['Onest', 'onest', 400, 'onest/v11/gNMZW3F-SZuj7zOT0IfSjTS16cPh9R-Zsg.ttf'],
  ['Onest', 'onest', 500, 'onest/v11/gNMZW3F-SZuj7zOT0IfSjTS16cPhxx-Zsg.ttf'],
  ['Urbanist', 'urbanist', 300, 'urbanist/v18/L0xjDF02iFML4hGCyOCpRdycFsGxSrqDlR4fFg.ttf'],
  ['Urbanist', 'urbanist', 400, 'urbanist/v18/L0xjDF02iFML4hGCyOCpRdycFsGxSrqDyx4fFg.ttf'],
  ['Urbanist', 'urbanist', 500, 'urbanist/v18/L0xjDF02iFML4hGCyOCpRdycFsGxSrqD-R4fFg.ttf'],
];
for (const [, slug, weight, source] of spec) {
  const r = await fetch(`https://fonts.gstatic.com/s/${source}`);
  if (!r.ok) throw new Error(`Font download: ${r.status}`);
  await fs.writeFile(new URL(`${slug}-${weight}.ttf`, base), Buffer.from(await r.arrayBuffer()));
}
await fs.writeFile(new URL('fonts.css', base), spec.map(([name, slug, weight]) => `@font-face { font-family: '${name}'; font-style: normal; font-weight: ${weight}; font-display: swap; src: url('./${slug}-${weight}.ttf') format('truetype'); }`).join('\n') + '\n');
for (const name of ['geistmono', 'onest', 'urbanist']) {
  const r = await fetch(`https://raw.githubusercontent.com/google/fonts/main/ofl/${name}/OFL.txt`);
  if (!r.ok) throw new Error(`Font license: ${r.status}`);
  await fs.writeFile(new URL(`${name}-OFL.txt`, base), await r.text());
}
console.log('7 local fonts and 3 OFL licenses downloaded.');
