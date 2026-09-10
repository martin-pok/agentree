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
  const sourceHome = env.DIRIGENT_SOURCE_HOME || os.homedir();
  return {
    port: env.PORT !== undefined && env.PORT !== '' ? Number(env.PORT) : 4620,
    host: '127.0.0.1',
    sourceHome,
    dataDir: env.DIRIGENT_HOME || path.join(os.homedir(), '.dirigent'),
    windowDays: Number(env.DIRIGENT_WINDOW_DAYS) || 30,
    nativeNotify: env.DIRIGENT_NATIVE_NOTIFY !== '0' && process.platform === 'darwin',
    cloudFetch: env.DIRIGENT_CLOUD !== '0',
    keychain: env.DIRIGENT_KEYCHAIN !== '0' && process.platform === 'darwin',
    processes: env.DIRIGENT_PROCESSES !== '0',
    scanIntervalMs: Number(env.DIRIGENT_SCAN_MS) || 10000,
    processIntervalMs: Number(env.DIRIGENT_PROCESS_MS) || 5000,
    quiet: env.DIRIGENT_QUIET === '1',
  };
}
