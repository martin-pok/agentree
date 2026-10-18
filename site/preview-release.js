// Only show a Preview after GitHub has actually published its exact Mac DMG or Windows ZIP.
// The HTML contains a known-good published Preview link, so network/API failures never
// produce a broken CTA or expose a private Draft. The Stable CTA is separate.
const REPO = 'https://github.com/martin-pok/agentree';
export const PREVIEW_API = 'https://api.github.com/repos/martin-pok/agentree/releases?per_page=20';
const VERSION = /^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const SHA256 = /^sha256:[0-9a-f]{64}$/;
const MAX_BYTES = 500 * 1024 * 1024;

function parts(tag) {
  const match = typeof tag === 'string' ? tag.match(VERSION) : null;
  if (!match) return null;
  const nums = match.slice(1).map(Number);
  return nums.every(Number.isSafeInteger) ? nums : null;
}

function newer(a, b) {
  const left = parts(a), right = parts(b);
  if (!left || !right) return false;
  for (let i = 0; i < left.length; i++) {
    if (left[i] !== right[i]) return left[i] > right[i];
  }
  return false;
}

// Each platform's Preview is the exact, permanently named asset of a published prerelease.
export const PREVIEW_ASSETS = Object.freeze({
  mac: (version) => `Agenteeq-${version}-macOS-arm64.dmg`,
  windows: (version) => `Agenteeq-${version}-Windows-x64.zip`,
});

export function latestPublicPreview(releases, fallback = 'v0.46.6', platform = 'mac') {
  const assetName = PREVIEW_ASSETS[platform];
  if (!assetName || !Array.isArray(releases) || !parts(fallback)) return null;
  let best = null;
  // GitHub lists by creation time, which need not be SemVer order.
  for (const release of releases) {
    if (!release || release.draft !== false || release.prerelease !== true || !parts(release.tag_name)) continue;
    if (!newer(release.tag_name, best?.tag || fallback)) continue;
    const version = release.tag_name.slice(1);
    const name = assetName(version);
    const href = `${REPO}/releases/download/${release.tag_name}/${name}`;
    const asset = Array.isArray(release.assets) && release.assets.find((a) => a?.name === name);
    // Never use an API-provided arbitrary link. Require an exact repo/tag/name,
    // a nonempty bounded file and a GitHub-disclosed checksum.
    if (!asset || asset.browser_download_url !== href || !Number.isSafeInteger(asset.size)
        || asset.size < 1 || asset.size > MAX_BYTES || !SHA256.test(asset.digest)) continue;
    best = { tag: release.tag_name, version, href, notes: `${REPO}/releases/tag/${release.tag_name}` };
  }
  return best;
}

export const latestPublicMacPreview = (releases, fallback) => latestPublicPreview(releases, fallback, 'mac');

// Fetch only when a Preview block approaches the viewport, not on page load.
// Reduces Lighthouse contention, browser traffic and GitHub rate-limit usage.
// One request serves both blocks (Mac and Windows); each block takes its own platform's
// newest valid Preview, and its changelog link always moves together with its download.
export function enableLivePreview(root = document, fetchImpl = globalThis.fetch) {
  if (typeof fetchImpl !== 'function') return;
  const blocks = [];
  for (const platform of Object.keys(PREVIEW_ASSETS)) {
    const link = root.querySelector(`[data-preview-${platform}]`);
    const container = link?.closest('.preview-option');
    const notes = container?.querySelector('[data-preview-notes]');
    const label = link?.querySelector('[data-preview-label]');
    if (!link || !notes || !label || !parts('v' + link.dataset.previewVersion)) continue;
    blocks.push({ platform, link, notes, label, container });
  }
  if (!blocks.length) return;
  let requested = false;
  const refresh = async () => {
    if (requested) return;
    requested = true;
    try {
      const response = await fetchImpl(PREVIEW_API, { cache: 'default', signal: AbortSignal.timeout(6000) });
      if (!response.ok) return;
      const releases = await response.json();
      for (const { platform, link, notes, label } of blocks) {
        const item = latestPublicPreview(releases, 'v' + link.dataset.previewVersion, platform);
        if (!item) continue;
        link.href = item.href;
        notes.href = item.notes;
        label.textContent = label.textContent.replace(link.dataset.previewVersion, item.version);
        link.dataset.previewVersion = item.version;
      }
    } catch { /* Offline, rate limit or unsupported browser: keep valid public fallback. */ }
  };
  if ('IntersectionObserver' in globalThis) {
    // Only the block of the chosen system is displayed; a hidden one never intersects.
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      observer.disconnect();
      void refresh();
    }, { rootMargin: '400px 0px 400px 0px', threshold: 0 });
    for (const { container } of blocks) observer.observe(container);
  } else if ('requestIdleCallback' in globalThis) {
    requestIdleCallback(() => { void refresh(); }, { timeout: 3000 });
  } else {
    setTimeout(() => { void refresh(); }, 1800);
  }
}
