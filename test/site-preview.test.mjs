import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { latestPublicMacPreview, enableLivePreview, PREVIEW_API } from '../site/preview-release.js';

const REPO = 'https://github.com/martin-pok/agentree';
const make = (version, overrides = {}) => ({
  tag_name: 'v' + version,
  draft: false,
  prerelease: true,
  assets: [{
    name: `Agenteeq-${version}-macOS-arm64.dmg`,
    size: 125_000_000,
    digest: 'sha256:' + 'a'.repeat(64),
    browser_download_url: `${REPO}/releases/download/v${version}/Agenteeq-${version}-macOS-arm64.dmg`,
  }],
  ...overrides,
});

test('newest published Preview is chosen by semantic version, not GitHub list order', () => {
  const result = latestPublicMacPreview([make('0.46.8'), make('0.46.10'), make('0.46.9')]);
  assert.deepEqual(result, {
    tag: 'v0.46.10', version: '0.46.10',
    href: `${REPO}/releases/download/v0.46.10/Agenteeq-0.46.10-macOS-arm64.dmg`,
    notes: `${REPO}/releases/tag/v0.46.10`,
  });
});

test('drafts, stable releases, malformed tags and old previews cannot overwrite published fallback', () => {
  assert.equal(latestPublicMacPreview([
    make('0.46.99', { draft: true }),
    make('0.47.0', { prerelease: false }),
    make('0.46.5'),
    make('9007199254740992.1.0'),
    make('0.46.10', { tag_name: 'v0.46.10-preview' }),
  ]), null);
});

test('missing/malicious asset metadata never creates a broken or attacker-controlled download', () => {
  const valid = make('0.46.10');
  for (const asset of [
    { ...valid.assets[0], browser_download_url: 'https://attacker.invalid/installer.dmg' },
    { ...valid.assets[0], digest: '' },
    { ...valid.assets[0], size: 0 },
    { ...valid.assets[0], size: 600 * 1024 * 1024 },
    { ...valid.assets[0], name: '../Agenteeq.app' },
  ]) {
    assert.equal(latestPublicMacPreview([{ ...valid, assets: [asset] }]), null);
  }
  assert.equal(latestPublicMacPreview([{ ...valid, assets: [] }]), null);
  assert.equal(latestPublicMacPreview(null), null);
});

test('newest broken published candidate is skipped in favor of an older valid published Preview', () => {
  const chosen = latestPublicMacPreview([
    make('0.46.12', { assets: [] }),
    make('0.46.11'),
    make('0.46.10'),
  ]);
  assert.equal(chosen.version, '0.46.11');
});

test('site Preview and changelog always update atomically from one published release', async () => {
  const saved = globalThis.IntersectionObserver;
  let reveal, observed, disconnected = false, requests = 0;
  globalThis.IntersectionObserver = class {
    constructor(callback, options) { reveal = callback; assert.ok(options.rootMargin.includes('400px')); }
    observe(element) { observed = element; }
    disconnect() { disconnected = true; }
  };
  const label = { textContent: 'Stáhnout 0.46.6 Preview pro Mac' };
  const container = {};
  const link = {
    href: `${REPO}/releases/download/v0.46.6/Agenteeq-0.46.6-macOS-arm64.dmg`,
    dataset: { previewVersion: '0.46.6' },
    closest() { return container; },
    querySelector(selector) { return selector === '[data-preview-label]' ? label : null; },
  };
  const notes = { href: `${REPO}/releases/tag/v0.46.6` };
  const root = { querySelector(selector) { return selector === '[data-preview-mac]' ? link : selector === '[data-preview-notes]' ? notes : null; } };
  try {
    enableLivePreview(root, async (url) => {
      requests++;
      assert.equal(url, PREVIEW_API);
      return new Response(JSON.stringify([make('0.46.10')]), { status: 200 });
    });
    assert.equal(observed, container);
    assert.equal(requests, 0, 'do not block first paint with Github requests');
    reveal([{ isIntersecting: true }]);
    await new Promise(setImmediate);
    assert.equal(disconnected, true);
    assert.equal(requests, 1);
    assert.match(link.href, /releases\/download\/v0\.46\.10\/Agenteeq-0\.46\.10-macOS-arm64\.dmg$/);
    assert.equal(notes.href, `${REPO}/releases/tag/v0.46.10`);
    assert.equal(label.textContent, 'Stáhnout 0.46.10 Preview pro Mac');
    assert.equal(link.dataset.previewVersion, '0.46.10');
    reveal([{ isIntersecting: true }]);
    await new Promise(setImmediate);
    assert.equal(requests, 1, 'IntersectionObserver may fire repeatedly; fetch only once');
  } finally {
    if (saved === undefined) delete globalThis.IntersectionObserver;
    else globalThis.IntersectionObserver = saved;
  }
});

test('all four public pages provide a real public fallback, notes and a stable primary CTA', async () => {
  for (const page of ['site/index.html', 'site/en/index.html', 'site/instalace/index.html', 'site/en/install/index.html']) {
    const html = await fs.readFile(new URL('../' + page, import.meta.url), 'utf8');
    assert.match(html, /data-preview-mac data-preview-version="0\.46\.12"/, page);
    assert.match(html, /data-preview-notes href="https:\/\/github\.com\/martin-pok\/agentree\/releases\/tag\/v0\.46\.12"/, page);
    assert.match(html, /data-stahnout="mac-arm64"/, page + ' must retain distinct stable CTA');
  }
  const app = await fs.readFile(new URL('../site/lp.js', import.meta.url), 'utf8');
  assert.match(app, /enableLivePreview\(\)/);
  const csp = JSON.parse(await fs.readFile(new URL('../vercel.json', import.meta.url), 'utf8'))
    .headers[0].headers.find((item) => item.key === 'Content-Security-Policy').value;
  assert.match(csp, /connect-src [^;]*https:\/\/api\.github\.com;/);
  assert.match(csp, /script-src 'self'/, 'do not weaken script CSP for the new feature');
});
