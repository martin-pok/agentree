#!/usr/bin/env node
// Nástroj vydavatele: klíč pro podepisování licencí a vydávání licenčních klíčů zákazníkům.
// Soukromý klíč NIKDY nepatří do repozitáře ani do balíčku pro zákazníky.
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { signLicense, verifyLicense } from '../src/license.js';
import { PLANS } from '../src/plans.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const KEY_FILE = process.env.AGENTEEQ_SIGNING_KEY || path.join(os.homedir(), '.agenteeq-vendor', 'license-signing-key.pem');
const PUBLIC_FILE = path.join(ROOT, 'src', 'license-public-key.js');

const HELP = `Použití:
  node scripts/license.mjs keygen
      Vytvoří podpisový klíč (${KEY_FILE}) a zapíše veřejný klíč do src/license-public-key.js.
  node scripts/license.mjs issue --name "Jan Novák" --email jan@firma.cz [--plan pro|team] [--seats 1] [--days 365]
      Vydá licenční klíč. Bez --days je licence bez časového omezení.
  node scripts/license.mjs verify <klíč>
      Ověří klíč stejně jako aplikace.`;

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

function fail(msg) {
  console.error(msg);
  process.exit(1);
}

const cmd = process.argv[2];

if (cmd === 'keygen') {
  if (fs.existsSync(KEY_FILE)) fail(`Podpisový klíč už existuje: ${KEY_FILE}\nNepřepisuji ho — všechny vydané licence by přestaly platit.`);
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
  fs.mkdirSync(path.dirname(KEY_FILE), { recursive: true, mode: 0o700 });
  fs.writeFileSync(KEY_FILE, privateKey.export({ type: 'pkcs8', format: 'pem' }), { mode: 0o600 });
  const pub = publicKey.export({ type: 'spki', format: 'pem' });
  fs.writeFileSync(PUBLIC_FILE, `// Veřejný klíč vydavatele licencí (vytvořen: node scripts/license.mjs keygen). Soukromý klíč není v repozitáři.\nexport const LICENSE_PUBLIC_KEY = ${JSON.stringify(pub)};\n`);
  console.log(`Hotovo.\nSoukromý klíč: ${KEY_FILE} (zálohuj ho bezpečně — bez něj nepůjde vydávat licence)\nVeřejný klíč: ${PUBLIC_FILE}`);
} else if (cmd === 'issue') {
  if (!fs.existsSync(KEY_FILE)) fail(`Chybí podpisový klíč ${KEY_FILE}. Nejdřív spusť: node scripts/license.mjs keygen`);
  const name = arg('name');
  const email = arg('email');
  const plan = arg('plan', 'pro');
  const seats = Number(arg('seats', '1'));
  const days = arg('days');
  if (!name || !email) fail(`Chybí --name nebo --email.\n\n${HELP}`);
  if (!PLANS[plan] || plan === 'free') fail('Tarif musí být pro nebo team.');
  if (!Number.isInteger(seats) || seats < 1) fail('--seats musí být kladné celé číslo.');
  if (days !== undefined && !(Number(days) > 0)) fail('--days musí být kladné číslo.');
  const now = new Date();
  const payload = {
    v: 1,
    id: crypto.randomUUID(),
    name,
    email,
    plan,
    seats,
    issuedAt: now.toISOString(),
    expiresAt: days ? new Date(now.getTime() + Number(days) * 86400e3).toISOString() : null,
  };
  const key = signLicense(payload, fs.readFileSync(KEY_FILE, 'utf8'));
  const check = verifyLicense(key);
  if (!check.valid) fail(`Vydaný klíč neprošel kontrolou (${check.reason}). Odpovídá src/license-public-key.js podpisovému klíči?`);
  console.log(key);
} else if (cmd === 'verify') {
  const r = verifyLicense(process.argv[3]);
  console.log(JSON.stringify(r, null, 2));
  process.exit(r.valid ? 0 : 1);
} else {
  console.log(HELP);
  process.exit(cmd ? 1 : 0);
}
