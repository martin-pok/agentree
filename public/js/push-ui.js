// Upozornění na telefon (Web Push, src/push.js). Odběr zapíná telefon sám: prohlížeč v telefonu
// vytvoří adresu u své push služby a klíče pro šifrování, Mac na ni pak posílá. Na Macu se jen
// ukazuje, které telefony odběr mají, a dají se zrušit.
//
// Podmínky jsou dané prohlížeči, ne Agenteeq: push funguje jen přes HTTPS (tailscale serve nebo
// tunel) a v iPhonu jen z aplikace uložené na plochu (iOS 16.4 a novější).
import { request } from './api.js';

const naMacu = () => Boolean(window.agenteeqDesktop) || ['127.0.0.1', 'localhost', '[::1]'].includes(location.hostname);
const jeIos = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const naPlose = () => navigator.standalone === true || window.matchMedia?.('(display-mode: standalone)').matches === true;

/**
 * Co tenhle prohlížeč umí. `duvod`: 'mac' (okno na Macu, upozornění chodí do systému), 'https'
 * (spojení bez HTTPS), 'plocha' (iPhone mimo aplikaci na ploše), 'prohlizec' (bez Web Push), nebo null.
 */
export function podporaPush() {
  if (naMacu()) return { ok: false, duvod: 'mac' };
  if (!window.isSecureContext) return { ok: false, duvod: 'https' };
  const umi = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  if (!umi) return { ok: false, duvod: jeIos() && !naPlose() ? 'plocha' : 'prohlizec' };
  return { ok: true, duvod: null };
}

// base64url → Uint8Array (applicationServerKey).
function klic(b64u) {
  const s = atob(b64u.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (b64u.length % 4)) % 4));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
}

async function registrace() {
  const reg = await navigator.serviceWorker.register('/sw.js');
  await navigator.serviceWorker.ready;
  return reg;
}

/** Stav ze serveru a odběr tohoto prohlížeče (jen na telefonu s podporou). */
export async function nactiPush() {
  const server = await request('GET', '/api/push');
  const podpora = podporaPush();
  let tady = null;
  if (podpora.ok) {
    const reg = await navigator.serviceWorker.getRegistration('/');
    const sub = reg ? await reg.pushManager.getSubscription() : null;
    // Odběr v prohlížeči, o kterém Mac neví (zrušený na Macu, odpárovaný telefon), se nepočítá.
    tady = sub && server.odbery.length ? { endpoint: sub.endpoint } : null;
  }
  return { ...server, podpora, tady, povoleni: 'Notification' in window ? Notification.permission : 'default' };
}

/** Zapne upozornění na tomto telefonu. Hází chybu s textem pro uživatele. */
export async function zapniPush(publicKey) {
  const povoleni = await Notification.requestPermission();
  if (povoleni !== 'granted') throw Object.assign(new Error('denied'), { kod: 'denied' });
  const reg = await registrace();
  let sub = await reg.pushManager.getSubscription();
  // Odběr s jiným klíčem (Mac si vytvořil nový) by push služba odmítla – založí se znovu.
  if (sub && sub.options?.applicationServerKey) {
    const stary = new Uint8Array(sub.options.applicationServerKey);
    const novy = klic(publicKey);
    if (stary.length !== novy.length || stary.some((b, i) => b !== novy[i])) { await sub.unsubscribe(); sub = null; }
  }
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: klic(publicKey) });
  return request('POST', '/api/push/subscribe', { subscription: sub.toJSON() });
}

/** Vypne upozornění na tomto telefonu (v prohlížeči i na Macu). */
export async function vypniPush() {
  const reg = await navigator.serviceWorker.getRegistration('/');
  const sub = reg ? await reg.pushManager.getSubscription() : null;
  if (!sub) return null;
  const endpoint = sub.endpoint;
  await sub.unsubscribe().catch(() => {});
  return request('POST', '/api/push/unsubscribe', { endpoint }).catch((err) => { if (err.status !== 404) throw err; return null; });
}

export const zkusPush = () => request('POST', '/api/push/test', {});
export const zrusOdber = (id) => request('POST', '/api/push/unsubscribe', { id });
