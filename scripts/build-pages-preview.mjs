import fs from 'node:fs/promises';
import path from 'node:path';

const out = path.resolve('.pages-preview');
const prefix = '/agentree';
await fs.rm(out, { recursive:true, force:true });
await fs.mkdir(out, { recursive:true });
await fs.cp('public', out, { recursive:true, force:true });
await fs.cp('site', out, { recursive:true, force:true });
async function visit(dir) {
  for (const entry of await fs.readdir(dir, { withFileTypes:true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) { await visit(file); continue; }
    if (!/\.(html|css|js|json|xml)$/i.test(entry.name)) continue;
    let source = await fs.readFile(file, 'utf8');
    // Rewrite only rooted local links; never alter protocol-relative or remote URLs.
    source = source.replace(/(href|src|srcset|poster|content)=(["'])\/(?!\/)/g, (_,key,q)=>key+'='+q+prefix+'/');
    source = source.replace(/url\((["']?)\/(?!\/)/g, (_,q)=>'url('+q+prefix+'/');
    source = source.replace(/(["'`])\/(detail|fonts|logos|icons|brand|lp\.css|lp\.js|instalace|soukromi|en|install\.sh|brand-mark-clean\.svg)(?=\/|["'`?#])/g, (_,q,segment)=>q+prefix+'/'+segment);
    await fs.writeFile(file, source);
  }
}
await visit(out);
console.log('GitHub Pages preview prepared at', out);
