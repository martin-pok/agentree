#!/usr/bin/env node
// Raster PWA/Apple icons must follow the same reviewed SVG as the native Dock icon.
// Playwright is used only for build/QA; the shipped app has no browser dependency.
import { createRequire } from 'node:module';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_PATH || 'playwright');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = path.join(root, 'public/brand/agenteeq-dock.svg');
const write = process.argv.includes('--write');
const icons = [
  ['public/icons/icon-192.png', 192],
  ['public/icons/icon-512.png', 512],
  ['public/icons/apple-touch-icon.png', 180],
];

const browser = await chromium.launch({
  ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || process.env.CHROME
    ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || process.env.CHROME }
    : {}),
  headless: true,
});
try {
  for (const [name, size] of icons) {
    const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
    try {
      await page.goto(pathToFileURL(source).href, { waitUntil: 'load' });
      await page.evaluate((n) => {
        const svg = document.querySelector('svg');
        if (!svg) throw new Error('Missing canonical SVG');
        svg.setAttribute('width', String(n));
        svg.setAttribute('height', String(n));
        document.documentElement.style.cssText = 'margin:0;padding:0;background:transparent';
        if (document.body) document.body.style.cssText = 'margin:0;padding:0;background:transparent';
      }, size);
      const generated = await page.screenshot({ omitBackground: true, animations: 'disabled' });
      const output = path.join(root, name);
      if (write) {
        await fs.writeFile(output, generated);
        console.log(`Updated ${name} from canonical SVG (${size} px)`);
        continue;
      }
      const tracked = await fs.readFile(output);
      const delta = await page.evaluate(async ({ a, b, size: expected }) => {
        async function pixels(base64) {
          const image = new Image();
          image.src = 'data:image/png;base64,' + base64;
          await image.decode();
          const canvas = document.createElementNS('http://www.w3.org/1999/xhtml', 'canvas');
          canvas.width = image.naturalWidth;
          canvas.height = image.naturalHeight;
          const context = canvas.getContext('2d', { willReadFrequently: true });
          context.drawImage(image, 0, 0);
          return { width: canvas.width, height: canvas.height, data: context.getImageData(0, 0, canvas.width, canvas.height).data };
        }
        const original = await pixels(a), current = await pixels(b);
        if (original.width !== expected || original.height !== expected || current.width !== expected || current.height !== expected) {
          throw new Error(`Expected ${expected}×${expected} PNG icon`);
        }
        let sum = 0;
        for (let i = 0; i < original.data.length; i++) sum += Math.abs(original.data[i] - current.data[i]);
        return sum / original.data.length;
      }, { a: tracked.toString('base64'), b: generated.toString('base64'), size });
      if (delta > 2) throw new Error(`${name} differs from canonical Dock SVG (${delta.toFixed(2)} mean RGBA delta)`);
      console.log(`Verified ${name} against canonical SVG (${delta.toFixed(2)} mean RGBA delta)`);
    } finally { await page.close(); }
  }
} finally { await browser.close(); }
