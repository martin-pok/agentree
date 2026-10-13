// Only show a Preview after GitHub has actually published its exact Mac DMG.
// The HTML contains a known-good v0.46.6 link, so network/API failures never
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

export function latestPublicMacPreview(releases, fallback = 'v0.46.6') {
  if (!Array.isArray(releases) || !parts(fallback)) return null;
  let best = null;
  // GitHub lists by creation time, which need not be SemVer order.
  for (const release of releases) {
    if (!release || release.draft !== false || release.prerelease !== true || !parts(release.tag_name)) continue;
    if (!newer(release.tag_name, best?.tag || fallback)) continue;
    const version = release.tag_name.slice(1);
    const name = `Agenteeq-${version}-macOS-arm64.dmg`;
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

// Fetch only when the Preview block approaches the viewport, not on page load.
// Reduces Lighthouse contention, browser traffic and GitHub rate-limit usage.
export function enableLivePreview(root = document, fetchImpl = globalThis.fetch) {
  const link = root.querySelector('[data-preview-mac]');
  const notes = root.querySelector('[data-preview-notes]');
  const label = link?.querySelector('[data-preview-label]');
  if (!link || !notes || !label || typeof fetchImpl !== 'function') return;
  const fallback = 'v' + link.dataset.previewVersion;
  if (!parts(fallback)) return;
  let requested = false;
  const refresh = async () => {
    if (requested) return;
    requested = true;
    try {
      const response = await fetchImpl(PREVIEW_API, { cache: 'default', signal: AbortSignal.timeout(6000) });
      if (!response.ok) return;
      const item = latestPublicMacPreview(await response.json(), fallback);
      if (!item) return;
      link.href = item.href;
      notes.href = item.notes;
      label.textContent = label.textContent.replace(link.dataset.previewVersion, item.version);
      link.dataset.previewVersion = item.version;
    } catch { /* Offline, rate limit or unsupported browser: keep valid public fallback. */ }
  };
  if ('IntersectionObserver' in globalThis) {
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      observer.disconnect();
      void refresh();
    }, { rootMargin: '400px 0px 400px 0px', threshold: 0 });
    observer.observe(link.closest('.preview-option') || link);
  } else if ('requestIdleCallback' in globalThis) {
    requestIdleCallback(() => { void refresh(); }, { timeout: 3000 });
  } else {
    setTimeout(() => { void refresh(); }, 1800);
  }
}
