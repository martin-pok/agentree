import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { ui } from './texty.js';
import { ARCHITECTURE, PLATFORM } from './platform.js';

// Jediný zdroj aktualizací je veřejný release stejného repozitáře. URL ani název souboru nikdy
// nepřicházejí z prohlížeče; odpověď GitHubu je navíc tvarově ověřená dřív, než se ukáže v UI.
export const RELEASE_URL = 'https://api.github.com/repos/martin-pok/agentree/releases/latest';
export const PREVIEW_RELEASES_URL = 'https://api.github.com/repos/martin-pok/agentree/releases?per_page=30';
const SEMVER = /^(?:v)?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const MAX_PACKAGE_BYTES = 500 * 1024 * 1024;
// GitHub u každé přílohy vydání zveřejňuje otisk obsahu. Balíček bez něj se nestahuje.
const DIGEST = /^sha256:([0-9a-f]{64})$/;
// Balíček má desítky MB. Na pomalé síti (mobilní připojení, hotel) trvá stažení minuty.
const DOWNLOAD_TIMEOUT_MS = 15 * 60_000;

export function parseVersion(value) {
  const match = typeof value === 'string' ? value.match(SEMVER) : null;
  if (!match) return null;
  const parts = match.slice(1).map(Number);
  // GitHub tag names are untrusted metadata. Values outside the exact integer
  // range collapse to the same Number and can break version comparisons.
  return parts.every(Number.isSafeInteger) ? parts : null;
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
  // Mac jen Apple Silicon (rozhodnutí vlastníka produktu od 0.34.0): Mac s Intelem žádnou přílohu
  // nemá, aktualizace se pro něj hlásí jako nepodporovaná místo stahování cizí architektury.
  const archs = os === 'macOS' ? ['arm64'] : ['arm64', 'x64'];
  if (!os || !archs.includes(arch) || !parseVersion(version)) return '';
  return `Agenteeq-${version}-${os}-${arch}.zip`;
}

function empty(version, status = 'checking') {
  return { status, currentVersion: version, checkedAt: 0, latestVersion: '', asset: null, downloaded: null, error: '' };
}

function validRelease(payload, version, target, allowPreview = false) {
  if (!payload || typeof payload !== 'object' || payload.draft || (payload.prerelease && !allowPreview)) return null;
  const latestVersion = String(payload.tag_name || '').replace(/^v/, '');
  if (compareVersions(latestVersion, version) !== 1) return { latestVersion: parseVersion(latestVersion) ? latestVersion : '', asset: null };
  const wanted = assetName(latestVersion, target);
  const asset = Array.isArray(payload.assets)
    ? payload.assets.find((item) => item && item.name === wanted && item.browser_download_url === `https://github.com/martin-pok/agentree/releases/download/v${latestVersion}/${wanted}`)
    : null;
  if (!asset) return { latestVersion, asset: null };
  const size = Number(asset.size);
  if (!Number.isSafeInteger(size) || size < 1 || size > MAX_PACKAGE_BYTES) return { latestVersion, asset: null };
  const sha256 = typeof asset.digest === 'string' ? asset.digest.match(DIGEST)?.[1] : null;
  if (!sha256) return { latestVersion, asset: null };
  return { latestVersion, asset: { name: wanted, url: asset.browser_download_url, size, sha256 } };
}

// Preview is explicit opt-in. Consider published releases by numeric version, not GitHub
// listing order, and never select a draft or a malformed/non-versioned tag.
function newestPreviewRelease(payload, version, target) {
  if (!Array.isArray(payload)) return null;
  const published = payload.filter((r) => r && r.draft === false && parseVersion(r.tag_name));
  published.sort((a, b) => compareVersions(b.tag_name, a.tag_name));
  const latest = published[0];
  return latest ? validRelease(latest, version, target, true) : { latestVersion: version, asset: null };
}

async function streamVerifiedPackage(response, expected, temporaryFile) {
  // A signed GitHub digest identifies the exact bytes. Never buffer an entire
  // installer (tens or hundreds of MB) in RAM: stream directly to a unique,
  // mode-0600 staging file. Only rename it after size and SHA-256 match.
  const rawLength = response.headers.get('content-length');
  const length = rawLength === null ? null : Number(rawLength);
  if (rawLength !== null && (!Number.isSafeInteger(length) || length < 1 || length > MAX_PACKAGE_BYTES)) {
    throw new Error(ui('Aktualizační balíček má neplatnou velikost.'));
  }
  if (length !== null && length !== expected.size) throw new Error(ui('Aktualizační balíček neodpovídá vydání.'));
  let received = 0;
  const digest = crypto.createHash('sha256');
  // 'wx' avoids overwriting another download's staged archive. A unique UUID
  // also prevents concurrent retries from corrupting each other's temp file.
  const out = await fs.open(temporaryFile, 'wx', 0o600);
  try {
    async function accept(value) {
      const chunk = Buffer.from(value);
      if (!chunk.length) return;
      received += chunk.length;
      if (received > expected.size || received > MAX_PACKAGE_BYTES) {
        throw new Error(ui('Aktualizační balíček neodpovídá vydání.'));
      }
      digest.update(chunk);
      for (let offset = 0; offset < chunk.length;) {
        const { bytesWritten } = await out.write(chunk, offset, chunk.length - offset, null);
        if (!bytesWritten) throw new Error(ui('Aktualizační balíček se nepodařilo uložit.'));
        offset += bytesWritten;
      }
    }
    if (response.body?.getReader) {
      const reader = response.body.getReader();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (value?.byteLength) await accept(value);
        }
      } catch (err) {
        await reader.cancel().catch(() => {});
        throw err;
      } finally {
        reader.releaseLock();
      }
    } else {
      // A few test doubles and legacy implementations expose only arrayBuffer.
      // Normal fetch Response bodies always use the incremental stream above.
      await accept(await response.arrayBuffer());
    }
    if (!received || received !== expected.size || !expected.sha256 || digest.digest('hex') !== expected.sha256) {
      throw new Error(ui('Aktualizační balíček neodpovídá vydání.'));
    }
    await out.sync();
    return received;
  } finally {
    await out.close();
  }
}

export class UpdateService {
  constructor({ version, dataDir, fetchImpl = globalThis.fetch, platform = PLATFORM, arch = ARCHITECTURE, enabled = true, channel = 'stable', now = () => Date.now() } = {}) {
    if (!['stable', 'preview'].includes(channel)) throw new Error(ui('Neplatný kanál aktualizací.'));
    if (!parseVersion(version)) throw new Error(ui('Služba aktualizací potřebuje platnou verzi.'));
    this.version = version;
    this.channel = channel;
    this.dataDir = dataDir;
    this.fetch = fetchImpl;
    this.target = { platform, arch };
    this.enabled = enabled && typeof fetchImpl === 'function';
    this.now = now;
    this.value = empty(version, this.enabled ? 'checking' : 'disabled');
    this.inFlight = null;
    // Identical simultaneous user actions reuse one verified network transfer.
    this.downloadInFlight = null;
    // A channel can change A → B → A while A's original HTTP request is pending.
    // Comparing the channel string alone cannot distinguish old and new requests.
    this.requestEpoch = 0;
  }

  state() { return { ...this.value, channel: this.channel, asset: this.value.asset ? { ...this.value.asset } : null, downloaded: this.value.downloaded ? { ...this.value.downloaded } : null }; }

  async check(channel = this.channel) {
    if (!['stable', 'preview'].includes(channel)) throw new Error(ui('Neplatný kanál aktualizací.'));
    if (channel !== this.channel) {
      // Cancel the obsolete network transfer immediately rather than letting
      // a full installer download continue in the background on the old channel.
      this.downloadInFlight?.controller.abort();
      this.channel = channel;
      this.requestEpoch += 1;
      // Switching channels invalidates an old available/downloaded update and its
      // in-flight response, so a stale stable reply cannot overwrite Preview.
      this.value = empty(this.version, this.enabled ? 'checking' : 'disabled');
      this.inFlight = null;
    }
    if (!this.enabled) {
      this.value = empty(this.version, 'disabled');
      return this.state();
    }
    if (this.inFlight) return this.inFlight;
    const epoch = this.requestEpoch;
    const pending = this.#check(channel, epoch).finally(() => {
      if (this.inFlight === pending) this.inFlight = null;
    });
    this.inFlight = pending;
    return pending;
  }

  async #check(channel, epoch) {
    const checkedAt = this.now();
    const previous = this.value;
    try {
      const response = await this.fetch(channel === 'preview' ? PREVIEW_RELEASES_URL : RELEASE_URL, {
        headers: { Accept: 'application/vnd.github+json', 'User-Agent': `Agenteeq/${this.version}` },
        cache: 'no-store', signal: AbortSignal.timeout(12_000),
      });
      if (!response.ok) throw new Error(ui('Zdroj aktualizací teď neodpovídá.'));
      const payload = await response.json();
      if (channel !== this.channel || epoch !== this.requestEpoch) return this.state();
      const release = channel === 'preview'
        ? newestPreviewRelease(payload, this.version, this.target)
        : validRelease(payload, this.version, this.target);
      if (!release) throw new Error(ui('Zdroj aktualizací poslal neplatná data.'));
      if (release.asset) {
        const sameDownloaded = previous.status === 'downloaded' && previous.latestVersion === release.latestVersion
          && previous.downloaded?.name === release.asset.name
          && previous.asset?.sha256 === release.asset.sha256 && previous.asset?.size === release.asset.size;
        this.value = sameDownloaded
          ? { ...empty(this.version, 'downloaded'), checkedAt, latestVersion: release.latestVersion, asset: release.asset, downloaded: previous.downloaded }
          : { ...empty(this.version, 'available'), checkedAt, latestVersion: release.latestVersion, asset: release.asset };
      } else if (release.latestVersion && compareVersions(release.latestVersion, this.version) === 1) {
        this.value = { ...empty(this.version, 'unsupported'), checkedAt, latestVersion: release.latestVersion };
      } else {
        this.value = { ...empty(this.version, 'current'), checkedAt, latestVersion: release.latestVersion || this.version };
      }
    } catch (err) {
      if (channel !== this.channel || epoch !== this.requestEpoch) return this.state();
      this.value = { ...empty(this.version, 'error'), checkedAt, error: err?.message || ui('Aktualizace se nepodařilo zkontrolovat.') };
    }
    return this.state();
  }

  download() {
    if (this.value.status !== 'available' || !this.value.asset) {
      return Promise.resolve({ status: 409, error: ui('Nová aktualizace zatím není připravená ke stažení.') });
    }
    // Repeated clicks / HTTP retries must not fetch the same 100MB package twice.
    // Key includes the generation AND published digest: after a channel switch
    // or metadata replacement, a new download starts independently.
    const asset = this.value.asset;
    const key = [this.requestEpoch, this.channel, asset.url, asset.sha256, asset.size].join('\0');
    if (this.downloadInFlight?.key === key) return this.downloadInFlight.promise;
    const controller = new AbortController();
    const promise = this.#download(controller.signal).finally(() => {
      if (this.downloadInFlight?.promise === promise) this.downloadInFlight = null;
    });
    this.downloadInFlight = { key, promise, controller };
    return promise;
  }

  async #download(abortSignal) {
    if (this.value.status !== 'available' || !this.value.asset) return { status: 409, error: ui('Nová aktualizace zatím není připravená ke stažení.') };
    const asset = this.value.asset;
    const channel = this.channel;
    const epoch = this.requestEpoch;
    try {
      const response = await this.fetch(asset.url, { headers: { Accept: 'application/octet-stream', 'User-Agent': `Agenteeq/${this.version}` }, cache: 'no-store', signal: AbortSignal.any([abortSignal, AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS)]), redirect: 'follow' });
      if (!response.ok) throw new Error(ui('Aktualizační balíček se nepodařilo stáhnout.'));
      const dir = path.join(this.dataDir, 'updates');
      const file = path.join(dir, asset.name);
      const unchanged = () => epoch === this.requestEpoch && channel === this.channel
        && this.value.asset?.url === asset.url
        && this.value.asset?.sha256 === asset.sha256 && this.value.asset?.size === asset.size;
      // An old channel can finish its fetch while a new Preview request starts.
      // Never create a temporary file when the request is already obsolete.
      if (!unchanged()) return { status: 409, error: ui('Nová aktualizace zatím není připravená ke stažení.') };
      await fs.mkdir(dir, { recursive: true, mode: 0o700 });
      const staging = path.join(dir, `.${asset.name}.${crypto.randomUUID()}.tmp`);
      try {
        const size = await streamVerifiedPackage(response, asset, staging);
        if (!unchanged()) return { status: 409, error: ui('Nová aktualizace zatím není připravená ke stažení.') };
        await fs.rename(staging, file);
        if (!unchanged()) return { status: 409, error: ui('Nová aktualizace zatím není připravená ke stažení.') };
        this.value = { ...this.value, status: 'downloaded', downloaded: { name: asset.name, path: file, size, at: this.now() } };
        return { ok: true, update: this.state() };
      } finally {
        await fs.rm(staging, { force: true }).catch(() => {});
      }
    } catch (err) {
      // A channel change is intentional cancellation, not a failed installer.
      if (abortSignal.aborted || epoch !== this.requestEpoch || channel !== this.channel) {
        return { status: 409, error: ui('Nová aktualizace zatím není připravená ke stažení.') };
      }
      return { status: 502, error: err?.message || ui('Aktualizační balíček se nepodařilo stáhnout.') };
    }
  }

  // Streamed SHA-256 verification happens during download, but the on-disk ZIP
  // can be deleted, truncated or modified before a user clicks Install/Reveal.
  // A successful metadata check MUST NOT turn a stale/corrupt disk copy into
  // an executable update. Stream it through a bounded 256 KiB buffer again.
  async verifiedDownloadedPath() {
    const snapshot = this.value;
    if (snapshot.status !== 'downloaded' || !snapshot.asset || !snapshot.downloaded) return null;
    const epoch = this.requestEpoch;
    const target = path.join(this.dataDir, 'updates', snapshot.asset.name);
    const invalidated = () => {
      // A concurrent channel switch/new release must not be overwritten by an
      // outdated verification result.
      if (this.requestEpoch === epoch && this.value === snapshot) {
        this.value = { ...snapshot, status: 'available', downloaded: null };
      }
      return null;
    };
    if (snapshot.downloaded.path !== target || snapshot.downloaded.name !== snapshot.asset.name
        || snapshot.downloaded.size !== snapshot.asset.size || !snapshot.asset.sha256) return invalidated();
    let ok = false;
    try {
      // Reject symlinks and non-regular files: the installer reads a local ZIP.
      const link = await fs.lstat(target);
      if (!link.isFile() || link.size !== snapshot.asset.size) return invalidated();
      const handle = await fs.open(target, 'r');
      try {
        const before = await handle.stat();
        if (!before.isFile() || before.size !== snapshot.asset.size) return invalidated();
        const digest = crypto.createHash('sha256');
        const buffer = Buffer.allocUnsafe(256 * 1024);
        let length = 0;
        while (true) {
          const { bytesRead } = await handle.read(buffer, 0, buffer.length, null);
          if (!bytesRead) break;
          length += bytesRead;
          if (length > snapshot.asset.size) break;
          digest.update(buffer.subarray(0, bytesRead));
        }
        const after = await handle.stat();
        ok = length === snapshot.asset.size && before.size === after.size
          && before.mtimeMs === after.mtimeMs && before.ctimeMs === after.ctimeMs
          && before.ino === after.ino && digest.digest('hex') === snapshot.asset.sha256;
      } finally {
        await handle.close();
      }
    } catch {
      // A removed file is the same recovery path as a corrupt file.
    }
    if (!ok) return invalidated();
    if (epoch !== this.requestEpoch || this.value !== snapshot) return null;
    return target;
  }

  downloadedPath() { return this.value.status === 'downloaded' ? this.value.downloaded?.path || null : null; }
}
