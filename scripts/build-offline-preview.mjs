import fs from 'node:fs/promises';
import path from 'node:path';

const output = path.resolve('dist/agenteeq-preview');
await fs.rm(output,{recursive:true,force:true});
await fs.mkdir(output,{recursive:true});
await fs.cp('public',output,{recursive:true});
await fs.cp('site',output,{recursive:true});
const fileExists=async p=>fs.access(p).then(()=>true,()=>false);
const destination=(url,depth)=>{
  if(!url.startsWith('/')||url.startsWith('//'))return url;
  const prefix='../'.repeat(depth)||'./';
  const pathname=url.split(/[?#]/,1)[0],trailing=url.slice(pathname.length);
  if(pathname==='/')return prefix+'index.html'+trailing;
  let p=pathname.slice(1);
  if(p==='en'||p==='instalace'||p==='soukromi'||p==='en/install'||p==='en/privacy')p+='/index.html';
  return prefix+p+trailing;
};
async function walk(dir,depth=0){
 for(const entry of await fs.readdir(dir,{withFileTypes:true})){
  const filename=path.join(dir,entry.name);
  if(entry.isDirectory()){await walk(filename,depth+1);continue;}
  if(!/\.(html|css|js|json)$/i.test(entry.name))continue;
  let s=await fs.readFile(filename,'utf8');
  if(entry.name.endsWith('.html')){
   s=s.replace(/(href|src|srcset|poster)=(["'])(\/[^"']*)\2/g,(_m,k,q,url)=>`${k}=${q}${destination(url,depth)}${q}`);
   s=s.replace(/<link[^>]+rel=["']canonical["'][^>]*>/gi,'');
   s=s.replace(/<link[^>]+rel=["']alternate["'][^>]*>/gi,'');
   s=s.replace('</head>','<meta name="robots" content="noindex,nofollow"></head>');
  }
  s=s.replace(/url\((["']?)(\/[^)'"]+)\1\)/g,(_m,q,url)=>`url(${q}${destination(url,depth)}${q})`);
  // JS navigation and static asset URLs are rooted in the hosted build.
  // For local preview, translate explicit path literals at runtime.
  if(entry.name==='lp.js'){
   s += `\n// Offline preview: intercept local navigation links without a server.\nif(location.protocol==='file:'){document.addEventListener('click',e=>{const a=e.target.closest('a[href]');if(!a)return;const href=a.getAttribute('href');if(!href||!href.startsWith('/')||href.startsWith('//'))return;const base=document.documentElement.dataset.previewBase||'./';e.preventDefault();location.href=new URL(base+href.slice(1),location.href);},true);}\n`;
  }
  await fs.writeFile(filename,s);
 }
}
await walk(output);
for(const f of ['index.html','lp.css','lp.js','instalace/index.html','en/index.html','soukromi/index.html']){
 if(!await fileExists(path.join(output,f)))throw new Error('Missing required preview file: '+f);
}
const readme=`AGENTEEQ — OFFLINE WEB PREVIEW

1. Unzip the package.
2. Double-click index.html in a browser.
3. Other pages are linked inside.

This is a frontend preview, not a production installer.
Some product interactions requiring a backend may not function offline.
`;
await fs.writeFile(path.join(output,'README.txt'),readme);
console.log('Built offline preview:',output);
