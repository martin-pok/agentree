import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { pripravUkazku } from './demo-fixture.mjs';
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_PATH || 'playwright');
const demo = await pripravUkazku({}, { oznacit: false });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox'] });
const out = 'dist/refinement'; await fs.mkdir(out, { recursive:true });
try {
 const page = await browser.newPage({ viewport: { width:1600, height:1100 }, reducedMotion:'no-preference' });
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`${demo.url}/#/prehled`);
 await page.locator('.home-robot .robot').waitFor(); await page.evaluate(()=>document.fonts.ready);
 const brand = await page.locator('.brand > span').evaluate(el=>({tracking:getComputedStyle(el).letterSpacing,size:getComputedStyle(el).fontSize}));
 assert.equal(brand.size,'20px');
 const bot = page.locator('.home-robot .robot');const box=await bot.boundingBox();
 await page.mouse.move(box.x+box.width+80,box.y+20);await page.waitForTimeout(250);
 assert.notEqual(await bot.evaluate(el=>el.style.getPropertyValue('--gaze-x')),'');
 await page.evaluate(()=>document.dispatchEvent(new CustomEvent('robot:celebrate')));
 assert.equal(await bot.getAttribute('data-emote'),null);
 assert.equal(await bot.locator('.robot-body').evaluate(el=>getComputedStyle(el).animationName),'none');
 await page.screenshot({path:`${out}/homepage.png`,fullPage:true});
 // Přepínač pohybu je v radě plovoucího robota (mimo Přehled).
 await page.goto(`${demo.url}/#/agenti`); await page.locator('.robot-fab').click();
 await page.locator('[data-mascot-motion]').click();
 assert.equal(await page.locator('[data-mascot-motion]').getAttribute('aria-pressed'),'false');
 assert.equal(await page.locator('.robot-fab .robot').getAttribute('data-emote'),null);
 await page.reload();await page.locator('.robot-fab').click();await page.locator('[data-mascot-motion][aria-pressed="false"]').waitFor();
 await page.locator('[data-mascot-motion]').click();
 await page.emulateMedia({reducedMotion:'reduce'});
 await page.evaluate(()=>document.dispatchEvent(new CustomEvent('robot:celebrate')));
 assert.equal(await page.locator('.robot[data-emote]').count(),0);
 await page.goto(`${demo.url}/#/agenti`); await page.locator('.agent-portrait').first().waitFor();
 await page.screenshot({path:`${out}/agents.png`,fullPage:true});
 // WCAG 1.4.12 text spacing override, plus narrow viewport reflow.
 await page.addStyleTag({content:'* { line-height:1.5!important; letter-spacing:.12em!important; word-spacing:.16em!important; } p { margin-bottom:2em!important; }'});
 await page.setViewportSize({width:375,height:900});
 assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Text-spacing reflow overflow');
 await page.screenshot({path:`${out}/text-spacing-mobile.png`,fullPage:true});
 const ratios = await page.evaluate(() => {
  const style=getComputedStyle(document.documentElement);
  const rgb=color=>{const c=document.createElement('canvas').getContext('2d');c.fillStyle=color;c.fillRect(0,0,1,1);return [...c.getImageData(0,0,1,1).data].slice(0,3);};
  const lum=c=>rgb(c).map(n=>{n/=255;return n<=.04045?n/12.92:((n+.055)/1.055)**2.4;}).reduce((a,n,i)=>a+n*[.2126,.7152,.0722][i],0);
  const ratio=(a,b)=>{const x=lum(style.getPropertyValue(a).trim()),y=lum(style.getPropertyValue(b).trim());return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);};
  return {body:ratio('--ink','--card'),secondary:ratio('--mute','--paper'),button:ratio('--on-action','--action')};
 });
 for(const [name,ratio] of Object.entries(ratios)) assert(ratio>=4.5, `${name}: ${ratio}`);
 await fs.writeFile(`${out}/checks.json`,JSON.stringify({brand,ratios,errors},null,2));
 assert.deepEqual(errors,[]);
 console.log('PASS: logo, gaze, static bodies without action emotes, pause persistence, live reduced-motion setting, narrow text-spacing reflow, no page errors');
} finally {await browser.close(); await demo.close();}
