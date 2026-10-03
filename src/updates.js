import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { ui } from './texty.js';
import { ARCHITECTURE, PLATFORM } from './platform.js';

// Jediný zdroj aktualizací je veřejný release stejného repozitáře. URL ani název souboru nikdy
// nepřicházejí z prohlížeče; odpověď GitHubu je navíc tvarově ověřená dřív, než se ukáže v UI.
export const RELEASE_URL = 'https://api.github.com/repos/martin-pok/agentree/releases/latest';
const SEMVER = /^(?:v)?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const MAX_PACKAGE_BYTES = 500 * 1024 * 1024;
// GitHub u každé přílohy vydání zveřejňuje otisk obsahu. Balíček bez něj se nestahuje.
const DIGEST = /^sha256:([0-9a-f]{64})$/;
// Balíček má desítky MB. Na pomalé síti (mobilní připojení, hotel) trvá stažení minuty.
const DOWNLOAD_TIMEOUT_MS = 15 * 60_000;

export function parseVersion(value) {
  const match = typeof value === 'string' ? value.match(SEMVER) : null;
  return match ? match.slice(1).map(Number) : null;
}

export function compareVersions(left, right) {
  const a = parseVersion(left);
  const b = parseVersion(right);
  if (!a || !b) return null;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return a[i] > b[i] ? 1 : -1;
  }
  return 0;
}

export function assetName(version, { platform = PLATFORM, arch = ARCHITECTURE } = {}) {
  const os = platform === 'darwin' ? 'macOS' : platform === 'win32' ? 'Windows' : '';
  if (!os || !['arm64', 'x64'].includes(arch) || !parseVersion(version)) return '';
  return `Agenteeq-${version}-${os}-${arch}.zip`;
}

function empty(version, status = 'checking') {
  return { status, currentVersion: version, checkedAt: 0, latestVersion: '', asset: null, downloaded: null, error: '' };
}

function validRelease(payload, version, target) {
  if (!payload || typeof payload !== 'object' || payload.draft || payload.prerelease) return null;
  const latestVersion = String(payload.tag_name || '').replace(/^v/, '');
  if (compareVersions(latestVersion, version) !== 1) return { latestVersion: parseVersion(latestVersion) ? latestVersion : '', asset: null };
  const wanted = assetName(latestVersion, target);
  const asset = Array.isArray(payload.assets)
    ? payload.assets.find((item) => item && item.name === wanted && typeof item.browser_download_url === 'string' && /^https:\/\/github\.com\/martin-pok\/agentree\/releases\/download\//.test(item.browser_download_url))
    : null;
  if (!asset) return { latestVersion, asset: null };
  const size = Number(asset.size);
  if (!Number.isSafeInteger(size) || size < 1 || size > MAX_PACKAGE_BYTES) return { latestVersion, asset: null };
  const sha256 = typeof asset.digest === 'string' ? asset.digest.match(DIGEST)?.[1] : null;
  if (!sha256) return { latestVersion, asset: null };
  return { latestVersion, asset: { name: wanted, url: asset.browser_download_url, size, sha256 } };
}

async function responseBytes(response, expected) {
  const length = Number(response.headers.get('content-length'));
  if (Number.isFinite(length) && (length < 1 || length > MAX_PACKAGE_BYTES)) throw new Error(ui('Aktualizační balíček má neplatnou velikost.'));
  if (Number.isFinite(length) && length !== expected.size) throw new Error(ui('Aktualizační balíček neodpovídá vydání.'));
  const body = Buffer.from(await response.arrayBuffer());
  if (!body.length || body.length > MAX_PACKAGE_BYTES || body.length !== expected.size) throw new Error(ui('Aktualizační balíček neodpovídá vydání.'));
  const otisk = crypto.createHash('sha256').update(body).digest('hex');
  if (!expected.sha256 || otisk !== expected.sha256) throw new Error(ui('Aktualizační balíček neodpovídá vydání.'));
  return body;
}

export class UpdateService {
  constructor({ version, dataDir, fetchImpl = globalThis.fetch, platform = PLATFORM, arch = ARCHITECTURE, enabled = true, now = () => Date.now() } = {}) {
    if (!parseVersion(version)) throw new Error(ui('Služba aktualizací potřebuje platnou verzi.'));
    this.version = version;
    this.dataDir = dataDir;
    this.fetch = fetchImpl;
    this.target = { platform, arch };
    this.enabled = enabled && typeof fetchImpl === 'function';
    this.now = now;
    this.value = empty(version, this.enabled ? 'checking' : 'disabled');
    this.inFlight = null;
  }

  state() { return { ...this.value, asset: this.value.asset ? { ...this.value.asset } : null, downloaded: this.value.downloaded ? { ...this.value.downloaded } : null }; }

  async check() {
    if (!this.enabled) {
      this.value = empty(this.version, 'disabled');
      return this.state();
    }
    if (this.inFlight) return this.inFlight;
    this.inFlight = this.#check().finally(() => { this.inFlight = null; });
    return this.inFlight;
  }

  async #check() {
    const checkedAt = this.now();
    const previous = this.value;
    try {
      const response = await this.fetch(RELEASE_URL, {
        headers: { Accept: 'application/vnd.github+json', 'User-Agent': `Agenteeq/${this.version}` },
        cache: 'no-store', signal: AbortSignal.timeout(12_000),
      });
      if (!response.ok) throw new Error(ui('Zdroj aktualizací teď neodpovídá.'));
      const release = validRelease(await response.json(), this.version, this.target);
      if (!release) throw new Error(ui('Zdroj aktualizací poslal neplatná data.'));
      if (release.asset) {
        const sameDownloaded = previous.status === 'downloaded' && previous.latestVersion === release.latestVersion && previous.downloaded?.name === release.asset.name;
        this.value = sameDownloaded
          ? { ...empty(this.version, 'downloaded'), checkedAt, latestVersion: release.latestVersion, asset: release.asset, downloaded: previous.downloaded }
          : { ...empty(this.version, 'available'), checkedAt, latestVersion: release.latestVersion, asset: release.asset };
      } else if (release.latestVersion && compareVersions(release.latestVersion, this.version) === 1) {
        this.value = { ...empty(this.version, 'unsupported'), checkedAt, latestVersion: release.latestVersion };
      } else {
        this.value = { ...empty(this.version, 'current'), checkedAt, latestVersion: release.latestVersion || this.version };
      }
    } catch (err) {
      this.value = { ...empty(this.version, 'error'), checkedAt, error: err?.message || ui('Aktualizace se nepodařilo zkontrolovat.') };
    }
    return this.state();
  }

  async download() {
    if (this.value.status !== 'available' || !this.value.asset) return { status: 409, error: ui('Nová aktualizace zatím není připravená ke stažení.') };
    const asset = this.value.asset;
    try {
      const response = await this.fetch(asset.url, { headers: { Accept: 'application/octet-stream', 'User-Agent': `Agenteeq/${this.version}` }, cache: 'no-store', signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS), redirect: 'follow' });
      if (!response.ok) throw new Error(ui('Aktualizační balíček se nepodařilo stáhnout.'));
      const body = await responseBytes(response, asset);
      const dir = path.join(this.dataDir, 'updates');
      const file = path.join(dir, asset.name);
      await fs.mkdir(dir, { recursive: true, mode: 0o700 });
      await fs.writeFile(`${file}.tmp`, body, { mode: 0o600 });
      await fs.rename(`${file}.tmp`, file);
      this.value = { ...this.value, status: 'downloaded', downloaded: { name: asset.name, path: file, size: body.length, at: this.now() } };
      return { ok: true, update: this.state() };
    } catch (err) {
      return { status: 502, error: err?.message || ui('Aktualizační balíček se nepodařilo stáhnout.') };
    }
  }

  downloadedPath() { return this.value.status === 'downloaded' ? this.value.downloaded?.path || null : null; }
}
