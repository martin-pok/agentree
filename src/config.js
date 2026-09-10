import os from 'node:os';
import path from 'node:path';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const PUBLIC_DIR = path.join(ROOT_DIR, 'public');
export const EXTENSION_DIR = path.join(ROOT_DIR, 'extension');
export const VERSION = JSON.parse(readFileSync(path.join(ROOT_DIR, 'package.json'), 'utf8')).version;

// Veškerá konfigurace přes proměnné prostředí — testy tak běží nad fixturami, ne nad skutečným HOME.
export function loadConfig(env = process.env) {
  const sourceHome = env.AGENTREE_SOURCE_HOME || os.homedir();
  return {
    port: env.PORT !== undefined && env.PORT !== '' ? Number(env.PORT) : 4620,
    host: '127.0.0.1',
    sourceHome,
    dataDir: env.AGENTREE_HOME || path.join(os.homedir(), '.agentree'),
    // Před přejmenováním (0.4.0) se data ukládala do ~/.dirigent — jednou se zkopírují.
    legacyDataDir: env.AGENTREE_HOME ? null : path.join(os.homedir(), '.dirigent'),
    windowDays: Number(env.AGENTREE_WINDOW_DAYS) || 30,
    nativeNotify: env.AGENTREE_NATIVE_NOTIFY !== '0' && process.platform === 'darwin',
    cloudFetch: env.AGENTREE_CLOUD !== '0',
    keychain: env.AGENTREE_KEYCHAIN !== '0' && process.platform === 'darwin',
    processes: env.AGENTREE_PROCESSES !== '0',
    // exec = skutečně otevírat aplikace (macOS), dry = jen vrátit plán (testy), off = vypnuto
    openMode: env.AGENTREE_OPEN === 'dry' ? 'dry' : env.AGENTREE_OPEN === '0' || process.platform !== 'darwin' ? 'off' : 'exec',
    scanIntervalMs: Number(env.AGENTREE_SCAN_MS) || 10000,
    processIntervalMs: Number(env.AGENTREE_PROCESS_MS) || 5000,
    quiet: env.AGENTREE_QUIET === '1',
  };
}
