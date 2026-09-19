const apiUrl = document.querySelector('meta[name="agentree-releases-api"]')?.content;
const fallbackUrl = 'https://github.com/martin-pok/agentree/releases/latest';

const byAssetName = (release, test) => release.assets?.find((asset) => test(asset.name));
const versionOf = (release) => String(release.tag_name || '').replace(/^v/, '') || 'neznámá verze';

function setLink(key, asset, fallbackLabel) {
  const link = document.querySelector(`[data-asset="${key}"]`);
  const meta = document.querySelector(`[data-asset-meta="${key}"]`);
  if (!link || !meta) return;
  if (!asset?.browser_download_url) {
    link.href = fallbackUrl;
    link.textContent = fallbackLabel;
    link.classList.add('is-disabled');
    link.setAttribute('aria-disabled', 'true');
    meta.textContent = 'Tento asset v posledním releasu není.';
    return;
  }
  link.href = asset.browser_download_url;
  link.textContent = 'Stáhnout balíček';
  link.classList.remove('is-disabled');
  link.removeAttribute('aria-disabled');
  meta.textContent = `${(asset.size / 1024 / 1024).toFixed(1)} MB · GitHub Release asset`;
}

function renderRelease(release) {
  const version = versionOf(release);
  const title = document.querySelector('[data-release-title]');
  const status = document.querySelector('[data-release-status-text]');
  const notes = document.querySelector('[data-release-notes]');
  const page = document.querySelector('[data-release-page]');
  const url = release.html_url || fallbackUrl;
  if (title) title.textContent = release.name || `Agentree v${version}`;
  if (status) status.textContent = `v${version} · vydáno ${release.published_at ? new Intl.DateTimeFormat('cs-CZ').format(new Date(release.published_at)) : 'na GitHubu'}`;
  if (notes) notes.href = url;
  if (page) page.href = url;

  setLink('macos-arm64', byAssetName(release, (name) => /macOS-arm64\.zip$/i.test(name)), 'Apple Silicon není v releasu');
  setLink('macos-x64', byAssetName(release, (name) => /macOS-(?:x64|x86_64|amd64)\.zip$/i.test(name)), 'Intel není v releasu');
  setLink('cli', byAssetName(release, (name) => /^agentree-[^/]+\.tgz$/i.test(name)), 'CLI balíček není v releasu');
  setLink('extension', byAssetName(release, (name) => /Chrome-extension\.zip$/i.test(name)), 'Chrome helper není v releasu');
}

function renderFallback() {
  const status = document.querySelector('[data-release-status-text]');
  const title = document.querySelector('[data-release-title]');
  if (status) status.textContent = 'Veřejné release metadata se nepodařilo načíst.';
  if (title) title.textContent = 'Release zatím není dostupný';
  for (const key of ['macos-arm64', 'macos-x64', 'cli', 'extension']) setLink(key, null, 'Otevřít GitHub Releases');
}

if (apiUrl) {
  fetch(apiUrl, { headers: { Accept: 'application/vnd.github+json' }, cache: 'no-store' })
    .then((response) => { if (!response.ok) throw new Error(`GitHub release ${response.status}`); return response.json(); })
    .then(renderRelease)
    .catch(() => renderFallback());
} else {
  renderFallback();
}
