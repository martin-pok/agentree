// Service worker Agenteeq: aplikace (HTML, CSS, JS, loga) se načte i při výpadku serveru a ukáže, co dělat.
// Strategie „nejdřív síť“: když server běží, vždy čerstvá verze; mezipaměť jen jako záloha. API a stream se nikdy neukládají.
const CACHE = 'agenteeq-shell-v6';
const PRECACHE = ['/', '/styles.css', '/js/boot.js', '/js/connect.js', '/js/app.js', '/brand/agenteeq-mark-dark.svg', '/manifest.webmanifest', '/icons/icon-192.png', '/icons/icon-512.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => Promise.allSettled(PRECACHE.map((url) => cache.add(new Request(url, { cache: 'reload' })))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('agenteeq-') && k !== CACHE).map((k) => caches.delete(k))))
      // Navigation preload: požadavek na stránku běží současně se startem workeru, ne až po něm.
      .then(() => self.registration.navigationPreload?.enable?.())
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;
  // Kód a styly se u serveru ověřují při každém načtení, aby se nikdy neukázala stará verze.
  // `no-cache` (ne `no-store`): prohlížeč pošle značku verze a server na nezměněný soubor odpoví
  // „nic nového“ v pár bajtech. `no-store` by zakázal i tohle ověření a stahoval celou aplikaci
  // pokaždé znovu – při vydání nové verze stejně rychlé, při běžném otevření zbytečné megabajty.
  const zivy = /\.(js|mjs|css|webmanifest)$/.test(url.pathname) || req.mode === 'navigate'
    ? new Request(req, { cache: 'no-cache' })
    : req;
  event.respondWith(
    (async () => {
      const preload = await event.preloadResponse;
      if (preload) {
        const kopie = preload.clone();
        caches.open(CACHE).then((cache) => cache.put(req, kopie)).catch(() => {});
        return preload;
      }
      return fetch(zivy)
      .then((res) => {
        if (res.ok && res.type === 'basic') {
          const copy = res.clone();
          caches.open(CACHE).then((cache) => cache.put(req, copy)).catch(() => {});
        }
        return res;
      })
      .catch(async () => {
        const hit = await caches.match(req, { ignoreSearch: req.mode === 'navigate' });
        if (hit) return hit;
        if (req.mode === 'navigate') return (await caches.match('/')) || Response.error();
        return Response.error();
      });
    })(),
  );
});
