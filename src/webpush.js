// Web Push bez závislostí a bez cloudu Agenteeq: Mac pošle zprávu přímo push službě prohlížeče
// v telefonu (Apple, Google, Mozilla, Microsoft) a ta ji doručí. Obsah je šifrovaný pro konkrétní
// telefon (RFC 8291, aes128gcm podle RFC 8188), takže push služba ho nepřečte; odesílatele
// prokazuje podpis VAPID (RFC 8292). Vše jen přes node:crypto a https.
import crypto from 'node:crypto';
import https from 'node:https';

const b64u = (buf) => Buffer.from(buf).toString('base64url');
const zB64u = (s) => Buffer.from(String(s || ''), 'base64url');
const hmac = (klic, data) => crypto.createHmac('sha256', klic).update(data).digest();

// Kam smí Mac posílat. Odběr přichází od spárovaného telefonu; i tak by bez seznamu ukradený
// token dokázal z Macu poslat POST na libovolnou adresu (třeba do domácí sítě). Proto jen známé
// push služby a jen HTTPS.
const PUSH_HOSTY = [/\.push\.apple\.com$/, /^fcm\.googleapis\.com$/, /^updates\.push\.services\.mozilla\.com$/, /\.notify\.windows\.com$/, /^android\.googleapis\.com$/];
export function povolenyEndpoint(endpoint) {
  try {
    const u = new URL(endpoint);
    return u.protocol === 'https:' && !u.port && PUSH_HOSTY.some((re) => re.test(u.hostname));
  } catch {
    return false;
  }
}

/** Nový pár klíčů VAPID (P-256). Veřejný klíč jako 65 bajtů base64url, soukromý jako JWK. */
export function vytvorVapid() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const jwk = privateKey.export({ format: 'jwk' });
  const verejny = Buffer.concat([Buffer.from([4]), zB64u(jwk.x), zB64u(jwk.y)]);
  void publicKey;
  return { publicKey: b64u(verejny), privateJwk: jwk };
}

/** Hlavička Authorization pro VAPID (RFC 8292): JWT ES256 pro původ push služby, platný 12 h. */
export function vapidHlavicka(endpoint, vapid, { subject = 'mailto:agenteeq@localhost', ted = Date.now() } = {}) {
  const aud = new URL(endpoint).origin;
  const head = b64u(JSON.stringify({ typ: 'JWT', alg: 'ES256' }));
  const body = b64u(JSON.stringify({ aud, exp: Math.floor(ted / 1000) + 12 * 3600, sub: subject }));
  const klic = crypto.createPrivateKey({ key: vapid.privateJwk, format: 'jwk' });
  const podpis = crypto.sign('sha256', Buffer.from(`${head}.${body}`), { key: klic, dsaEncoding: 'ieee-p1363' });
  return `vapid t=${head}.${body}.${b64u(podpis)}, k=${vapid.publicKey}`;
}

/**
 * Zašifruje zprávu pro odběr (RFC 8291). `p256dh` a `auth` jsou z PushSubscription telefonu.
 * `pevne` (jen testy) dosadí sůl a soukromý klíč odesílatele, aby šlo porovnat s RFC.
 */
export function zasifruj(zprava, { p256dh, auth }, pevne = {}) {
  const uaPublic = zB64u(p256dh);
  const authSecret = zB64u(auth);
  if (uaPublic.length !== 65 || uaPublic[0] !== 4 || authSecret.length !== 16) throw new Error('invalid subscription keys');
  const ecdh = crypto.createECDH('prime256v1');
  if (pevne.asPrivate) ecdh.setPrivateKey(zB64u(pevne.asPrivate));
  else ecdh.generateKeys();
  const asPublic = ecdh.getPublicKey();
  const ecdhSecret = ecdh.computeSecret(uaPublic);
  const prkKey = hmac(authSecret, ecdhSecret);
  const keyInfo = Buffer.concat([Buffer.from('WebPush: info\0'), uaPublic, asPublic]);
  const ikm = hmac(prkKey, Buffer.concat([keyInfo, Buffer.from([1])]));
  const salt = pevne.salt ? zB64u(pevne.salt) : crypto.randomBytes(16);
  const prk = hmac(salt, ikm);
  const cek = hmac(prk, Buffer.from('Content-Encoding: aes128gcm\0\x01', 'binary')).subarray(0, 16);
  const nonce = hmac(prk, Buffer.from('Content-Encoding: nonce\0\x01', 'binary')).subarray(0, 12);
  const cipher = crypto.createCipheriv('aes-128-gcm', cek, nonce);
  const sifra = Buffer.concat([cipher.update(Buffer.concat([Buffer.from(zprava), Buffer.from([2])])), cipher.final(), cipher.getAuthTag()]);
  const rs = Buffer.alloc(4);
  rs.writeUInt32BE(4096);
  return Buffer.concat([salt, rs, Buffer.from([asPublic.length]), asPublic, sifra]);
}

/**
 * Pošle zprávu na odběr. Vrací { ok, status, zrusit } – `zrusit` = push služba odběr nezná
 * (404/410), telefon ho zrušil nebo vypršel a je třeba ho zapomenout.
 */
export function posli(odber, zprava, vapid, { ttl = 3600, urgency = 'high', odeslat = poslatHttps } = {}) {
  if (!povolenyEndpoint(odber.endpoint)) return Promise.resolve({ ok: false, status: 0, zrusit: true, chyba: 'endpoint' });
  let telo;
  try {
    telo = zasifruj(JSON.stringify(zprava), odber.keys);
  } catch {
    // Klíče, které nejdou použít, se už nespraví – odběr je třeba zapomenout.
    return Promise.resolve({ ok: false, status: 0, zrusit: true, chyba: 'keys' });
  }
  const hlavicky = {
    'Content-Type': 'application/octet-stream',
    'Content-Encoding': 'aes128gcm',
    'Content-Length': String(telo.length),
    TTL: String(ttl),
    Urgency: urgency,
    Authorization: vapidHlavicka(odber.endpoint, vapid),
  };
  return odeslat(odber.endpoint, hlavicky, telo).then(
    (status) => ({ ok: status >= 200 && status < 300, status, zrusit: status === 404 || status === 410 }),
    (err) => ({ ok: false, status: 0, zrusit: false, chyba: err.code || 'network' }),
  );
}

function poslatHttps(endpoint, hlavicky, telo) {
  return new Promise((resolve, reject) => {
    const req = https.request(endpoint, { method: 'POST', headers: hlavicky, timeout: 10000 }, (res) => {
      res.resume();
      res.on('end', () => resolve(res.statusCode));
    });
    req.on('timeout', () => req.destroy(Object.assign(new Error('timeout'), { code: 'timeout' })));
    req.on('error', reject);
    req.end(telo);
  });
}
