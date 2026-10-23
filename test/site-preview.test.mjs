import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { latestPublicMacPreview, latestPublicPreview, enableLivePreview, PREVIEW_API } from '../site/preview-release.js';

const REPO = 'https://github.com/martin-pok/agentree';
const asset = (version, name) => ({
  name,
  size: 125_000_000,
  digest: 'sha256:' + 'a'.repeat(64),
  browser_download_url: `${REPO}/releases/download/v${version}/${name}`,
});
const make = (version, overrides = {}) => ({
  tag_name: 'v' + version,
  draft: false,
  prerelease: true,
  assets: [asset(version, `Agenteeq-${version}-macOS-arm64.dmg`)],
  ...overrides,
});
const withWindows = (version) => make(version, { assets: [
  asset(version, `Agenteeq-${version}-macOS-arm64.dmg`), asset(version, `Agenteeq-${version}-Windows-x64.zip`),
] });

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

test('Windows Preview takes the exact Windows ZIP and never borrows a Mac-only release', () => {
  const chosen = latestPublicPreview([withWindows('0.46.10'), make('0.46.11')], 'v0.46.6', 'windows');
  assert.deepEqual(chosen, {
    tag: 'v0.46.10', version: '0.46.10',
    href: `${REPO}/releases/download/v0.46.10/Agenteeq-0.46.10-Windows-x64.zip`,
    notes: `${REPO}/releases/tag/v0.46.10`,
  });
  assert.equal(latestPublicPreview([withWindows('0.46.10')], 'v0.46.6', 'linux'), null);
  const tampered = withWindows('0.46.12');
  tampered.assets[1] = { ...tampered.assets[1], browser_download_url: 'https://attacker.invalid/Agenteeq.zip' };
  assert.equal(latestPublicPreview([tampered], 'v0.46.6', 'windows'), null);
});

test('site Preview and changelog always update atomically from one published release', async () => {
  const saved = globalThis.IntersectionObserver;
  let reveal, disconnected = false, requests = 0;
  const observed = [];
  globalThis.IntersectionObserver = class {
    constructor(callback, options) { reveal = callback; assert.ok(options.rootMargin.includes('400px')); }
    observe(element) { observed.push(element); }
    disconnect() { disconnected = true; }
  };
  const block = (platform, file, text) => {
    const label = { textContent: text };
    const notes = { href: `${REPO}/releases/tag/v0.46.6` };
    const container = { querySelector(selector) { return selector === '[data-preview-notes]' ? notes : null; } };
    const link = {
      href: `${REPO}/releases/download/v0.46.6/${file}`,
      dataset: { previewVersion: '0.46.6' },
      closest(selector) { return selector === '.preview-option' ? container : null; },
      querySelector(selector) { return selector === '[data-preview-label]' ? label : null; },
    };
    return { platform, link, notes, label, container };
  };
  const mac = block('mac', 'Agenteeq-0.46.6-macOS-arm64.dmg', 'Stáhnout 0.46.6 Preview pro Mac');
  const win = block('windows', 'Agenteeq-0.46.6-Windows-x64.zip', 'Stáhnout 0.46.6 Preview pro Windows');
  const root = { querySelector(selector) { return selector === '[data-preview-mac]' ? mac.link : selector === '[data-preview-windows]' ? win.link : null; } };
  try {
    enableLivePreview(root, async (url) => {
      requests++;
      assert.equal(url, PREVIEW_API);
      return new Response(JSON.stringify([make('0.46.11'), withWindows('0.46.10')]), { status: 200 });
    });
    assert.deepEqual(observed, [mac.container, win.container]);
    assert.equal(requests, 0, 'do not block first paint with Github requests');
    reveal([{ isIntersecting: true }]);
    await new Promise(setImmediate);
    assert.equal(disconnected, true);
    assert.equal(requests, 1);
    assert.match(mac.link.href, /releases\/download\/v0\.46\.11\/Agenteeq-0\.46\.11-macOS-arm64\.dmg$/);
    assert.equal(mac.notes.href, `${REPO}/releases/tag/v0.46.11`);
    assert.equal(mac.label.textContent, 'Stáhnout 0.46.11 Preview pro Mac');
    assert.equal(mac.link.dataset.previewVersion, '0.46.11');
    // 0.46.11 has no Windows ZIP: Windows keeps its own newest valid release and changelog.
    assert.match(win.link.href, /releases\/download\/v0\.46\.10\/Agenteeq-0\.46\.10-Windows-x64\.zip$/);
    assert.equal(win.notes.href, `${REPO}/releases/tag/v0.46.10`);
    assert.equal(win.label.textContent, 'Stáhnout 0.46.10 Preview pro Windows');
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
    assert.match(html, /data-preview-mac data-preview-version="0\.46\.60"/, page);
    assert.match(html, /data-preview-notes href="https:\/\/github\.com\/martin-pok\/agentree\/releases\/tag\/v0\.46\.60"/, page);
    assert.match(html, /data-preview-windows data-preview-version="0\.46\.60" href="https:\/\/github\.com\/martin-pok\/agentree\/releases\/download\/v0\.46\.60\/Agenteeq-0\.46\.60-Windows-x64\.zip"/, page);
    assert.equal(html.match(/data-preview-notes href="https:\/\/github\.com\/martin-pok\/agentree\/releases\/tag\/v0\.46\.60"/g)?.length, 2, page + ': each system has its own release notes link');
    assert.match(html, /data-stahnout="mac-arm64"/, page + ' must retain distinct stable CTA');
  }
  const app = await fs.readFile(new URL('../site/lp.js', import.meta.url), 'utf8');
  assert.match(app, /enableLivePreview\(\)/);
  const csp = JSON.parse(await fs.readFile(new URL('../vercel.json', import.meta.url), 'utf8'))
    .headers[0].headers.find((item) => item.key === 'Content-Security-Policy').value;
  assert.match(csp, /connect-src [^;]*https:\/\/api\.github\.com;/);
  assert.match(csp, /script-src 'self'/, 'do not weaken script CSP for the new feature');
});

test('a failed release API leaves the published Preview fallback and its notes intact', async () => {
  const saved = globalThis.IntersectionObserver;
  let reveal;
  globalThis.IntersectionObserver = class {
    constructor(callback) { reveal = callback; }
    observe() {}
    disconnect() {}
  };
  const link = {
    href: `${REPO}/releases/download/v0.46.60/Agenteeq-0.46.60-macOS-arm64.dmg`,
    dataset: { previewVersion: '0.46.60' },
    closest() { return container; },
    querySelector() { return label; },
  };
  const notes = { href: `${REPO}/releases/tag/v0.46.60` };
  const label = { textContent: 'Stáhnout 0.46.60 Preview pro Mac' };
  const container = { querySelector() { return notes; } };
  const root = { querySelector(selector) { return selector === '[data-preview-mac]' ? link : null; } };
  try {
    enableLivePreview(root, async () => new Response('', { status: 500 }));
    reveal([{ isIntersecting: true }]);
    await new Promise(setImmediate);
    assert.equal(link.dataset.previewVersion, '0.46.60');
    assert.equal(link.href, `${REPO}/releases/download/v0.46.60/Agenteeq-0.46.60-macOS-arm64.dmg`);
    assert.equal(notes.href, `${REPO}/releases/tag/v0.46.60`);
    assert.equal(label.textContent, 'Stáhnout 0.46.60 Preview pro Mac');
  } finally {
    if (saved === undefined) delete globalThis.IntersectionObserver;
    else globalThis.IntersectionObserver = saved;
  }
});
