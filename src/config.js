import os from 'node:os';
import path from 'node:path';
import { readFileSync } from 'node:fs';
import { openCommand } from './platform.js';
import { fileURLToPath } from 'node:url';

export const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const PUBLIC_DIR = path.join(ROOT_DIR, 'public');
export const EXTENSION_DIR = path.join(ROOT_DIR, 'extension');
export const VERSION = JSON.parse(readFileSync(path.join(ROOT_DIR, 'package.json'), 'utf8')).version;

// Co smí Agenteeq na tomhle systému otevírat a spouštět.
//
// Dřív o tom rozhodoval jeden hrubý přepínač: mimo macOS „off“, a s ním zmizela
// i tlačítka, která by fungovala. Otevřít složku v Průzkumníku nebo odkaz v prohlížeči
// Windows umí — jen `open -a`, AppleScript a LaunchAgent tam nejsou.
//
//   openMode     jak se plán provede: exec skutečně, dry jen vrátí plán (testy), off vůbec
//   openApps     otevřít session v aplikaci a pokračovat v Terminálu (macOS)
//   launchAgents spustit agenta na pozadí – hledá CLI přes přihlašovací shell (macOS)
//   autostart    spuštění po přihlášení přes LaunchAgent (macOS)
function otevirani(env) {
  if (env.AGENTEEQ_OPEN === 'dry') {
    // Testovací režim simuluje macOS: plány se skládají celé, jen se neprovedou.
    return { openMode: 'dry', openApps: true, launchAgents: true, autostart: true };
  }
  if (env.AGENTEEQ_OPEN === '0' || !openCommand('x')) {
    return { openMode: 'off', openApps: false, launchAgents: false, autostart: false };
  }
  const mac = process.platform === 'darwin';
  return { openMode: 'exec', openApps: mac, launchAgents: mac, autostart: mac };
}

// Veškerá konfigurace přes proměnné prostředí – testy tak běží nad fixturami, ne nad skutečným HOME.
export function loadConfig(env = process.env) {
  // Přejmenování z Agentree na Agenteeq (0.8.0): staré proměnné prostředí i stará datová složka
  // dál fungují, aby se nikomu uprostřed práce nerozbil běžící systém.
  const e = new Proxy(env, {
    get: (cil, klic) => (typeof klic === 'string' && klic.startsWith('AGENTEEQ_') && cil[klic] === undefined
      ? cil[klic.replace('AGENTEEQ_', 'AGENTREE_')]
      : cil[klic]),
  });
  env = e;
  const sourceHome = env.AGENTEEQ_SOURCE_HOME || os.homedir();
  return {
    port: env.PORT !== undefined && env.PORT !== '' ? Number(env.PORT) : 4620,
    host: '127.0.0.1',
    desktop: env.AGENTEEQ_DESKTOP === '1',
    // Tajemství pro každé spuštění od okna aplikace (Swift ho vygeneruje a předá přes prostředí). Když je
    // nastavené, projde požadavek z tohoto Macu jen s ním – ostatní procesy (jiný uživatel Macu, cizí
    // program) mají otevřený port na 127.0.0.1, ale bez klíče jim server nic nevydá.
    localKey: /^[\w-]{32,128}$/.test(env.AGENTEEQ_LOCAL_KEY || '') ? env.AGENTEEQ_LOCAL_KEY : '',
    sourceHome,
    dataDir: env.AGENTEEQ_HOME || path.join(os.homedir(), '.agenteeq'),
    // Data ze starších názvů se jednou zkopírují: ~/.agentree (do 0.7.0) a ~/.dirigent (do 0.4.0).
    legacyDataDirs: env.AGENTEEQ_HOME ? [] : [path.join(os.homedir(), '.agentree'), path.join(os.homedir(), '.dirigent')],
    windowDays: Number(env.AGENTEEQ_WINDOW_DAYS) || 30,
    nativeNotify: env.AGENTEEQ_NATIVE_NOTIFY !== '0' && process.platform === 'darwin',
    cloudFetch: env.AGENTEEQ_CLOUD !== '0',
    keychain: env.AGENTEEQ_KEYCHAIN !== '0' && process.platform === 'darwin',
    processes: env.AGENTEEQ_PROCESSES !== '0',
    ...otevirani(env),
    ollamaUrl: env.AGENTEEQ_OLLAMA_URL || 'http://127.0.0.1:11434',
    scanIntervalMs: Number(env.AGENTEEQ_SCAN_MS) || 10000,
    processIntervalMs: Number(env.AGENTEEQ_PROCESS_MS) || 5000,
    quiet: env.AGENTEEQ_QUIET === '1',
  };
}
