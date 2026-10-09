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
// Browser ES modules do not work reliably through file://. Preserve exactly the
// production behavior, but bundle its two dependency-free modules into a
// classic script and defer execution until all HTML has been parsed.
const robot=(await fs.readFile('public/js/robot-svg.js','utf8')).replace(/^export\\s+/gm,'');
const scroll=(await fs.readFile('public/js/plynule-posouvani.js','utf8')).replace(/^export\\s+/gm,'');
const original=(await fs.readFile('site/lp.js','utf8'))
 .replace(/^import\\s+\\{[^}]+\\}\\s+from\\s+['\"][^'\"]+['\"];?\\s*$/gm,'');
const bundled='document.addEventListener("DOMContentLoaded",()=>{\\n"use strict";\\n'+robot+'\\n'+scroll+'\\n'+original+'\\n});';
if(/^\\s*(import|export)\\s/m.test(bundled))throw new Error('Offline bundle still has ES module syntax');
async function walk(dir,depth=0){
 for(const entry of await fs.readdir(dir,{withFileTypes:true})){
  const filename=path.join(dir,entry.name);
  if(entry.isDirectory()){await walk(filename,depth+1);continue;}
  if(!/\.(html|css|js|json)$/i.test(entry.name))continue;
  let s=await fs.readFile(filename,'utf8');
  if(entry.name.endsWith('.html')){
   // Bundle the entire interactive experience into each page instead of
   // leaving imports rooted at /js, which fail for local files.
   s=s.replace(/<script\\s+type=["']module["']\\s+src=["']\\/lp\\.js["']><\\/script>/g,
     '<script>'+bundled.replace(/<\\/script/gi,'<\\\\/script')+'</script>');
   s=s.replace(/(href|src|srcset|poster)=(["'])(\/[^"']*)\2/g,(_m,k,q,url)=>`${k}=${q}${destination(url,depth)}${q}`);
   s=s.replace(/<link[^>]+rel=["']canonical["'][^>]*>/gi,'');
   s=s.replace(/<link[^>]+rel=["']alternate["'][^>]*>/gi,'');
   s=s.replace('</head>','<meta name="robots" content="noindex,nofollow"></head>');
  }
  s=s.replace(/url\((["']?)(\/[^)'"]+)\1\)/g,(_m,q,url)=>`url(${q}${destination(url,depth)}${q})`);
  // JS navigation and static asset URLs are rooted in the hosted build.
  // For local preview, translate explicit path literals at runtime.
  await fs.writeFile(filename,s);
 }
}
await walk(output);
for(const f of ['index.html','lp.css','lp.js','instalace/index.html','en/index.html','soukromi/index.html']){
 if(!await fileExists(path.join(output,f)))throw new Error('Missing required preview file: '+f);
}
const landing=await fs.readFile(path.join(output,'index.html'),'utf8');
if(!landing.includes('document.addEventListener("DOMContentLoaded"')||landing.includes('type="module" src="./lp.js"'))throw new Error('Interactive script not bundled');
const readme=`AGENTEEQ — OFFLINE WEB PREVIEW

1. Unzip the package.
2. Double-click index.html in a browser.
3. Other pages are linked inside.

This is a frontend preview, not a production installer.
Some product interactions requiring a backend may not function offline.
`;
await fs.writeFile(path.join(output,'README.txt'),readme);
console.log('Built offline preview:',output);
