import crypto from 'node:crypto';
import { PLANS } from './plans.js';
import { LICENSE_PUBLIC_KEY } from './license-public-key.js';

// Licenční klíč: AGT1.<base64url JSON>.<base64url Ed25519 podpis>. Ověření je offline – bez serveru a bez vazby na vydavatele.
export const LICENSE_PREFIX = 'AGT1';

const enc = (buf) => Buffer.from(buf).toString('base64url');
const dec = (s) => Buffer.from(s, 'base64url');

export function signLicense(payload, privateKeyPem) {
  const body = enc(JSON.stringify(payload));
  const signature = crypto.sign(null, Buffer.from(body), privateKeyPem);
  return `${LICENSE_PREFIX}.${body}.${enc(signature)}`;
}

function publicView(p) {
  return {
    id: p.id,
    name: typeof p.name === 'string' ? p.name : '',
    email: typeof p.email === 'string' ? p.email : '',
    plan: p.plan,
    planLabel: PLANS[p.plan]?.label || p.plan,
    seats: Number.isInteger(p.seats) && p.seats > 0 ? p.seats : 1,
    issuedAt: p.issuedAt || null,
    expiresAt: p.expiresAt || null,
  };
}

export function verifyLicense(key, { publicKey = LICENSE_PUBLIC_KEY, now = Date.now() } = {}) {
  if (typeof key !== 'string' || !key.trim()) return { valid: false, reason: 'Chybí licenční klíč.' };
  const parts = key.trim().split('.');
  if (parts.length !== 3 || parts[0] !== LICENSE_PREFIX) return { valid: false, reason: 'Klíč nemá správný formát.' };
  if (!publicKey) return { valid: false, reason: 'Tato instalace nemá veřejný klíč vydavatele.' };
  let signed = false;
  try {
    signed = crypto.verify(null, Buffer.from(parts[1]), publicKey, dec(parts[2]));
  } catch {
    signed = false;
  }
  if (!signed) return { valid: false, reason: 'Klíč není platný.' };
  let p;
  try {
    p = JSON.parse(dec(parts[1]).toString('utf8'));
  } catch {
    return { valid: false, reason: 'Klíč je poškozený.' };
  }
  if (!p || p.v !== 1 || typeof p.id !== 'string' || !PLANS[p.plan] || p.plan === 'free') return { valid: false, reason: 'Neznámý typ licence.' };
  const license = publicView(p);
  if (p.expiresAt) {
    const exp = Date.parse(p.expiresAt);
    if (!Number.isFinite(exp)) return { valid: false, reason: 'Klíč je poškozený.' };
    if (now > exp) return { valid: false, expired: true, reason: `Licence vypršela ${new Date(exp).toLocaleDateString('cs-CZ')}.`, license };
  }
  return { valid: true, license };
}
