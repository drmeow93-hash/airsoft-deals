// Felony's Airsoft Emporium service worker.
// The app shell is served from cache instantly (stale-while-revalidate), so a returning visitor sees
// the app right away even while the free server is waking up. Prices are not cached here; the app
// keeps its own last results and always asks the server for fresh ones.
const V = __ASSET_VERSIONS__; // filled in by the server: content hashes of app.js / styles.css / config.js
const CACHE = 'felony-v10b-' + Object.values(V).join('').slice(0, 16);
const SHELL = ['/', '/manifest.webmanifest', '/icons/icon.svg', '/icons/icon-192.png', '/fonts/DancingScript-wordmark.woff2',
  ...Object.entries(V).map(([f, h]) => `/${f}?v=${h}`)];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL))); self.skipWaiting(); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k))))); self.clients.claim(); });

// Only keep real app responses (never a hosting "waking up" page or an error).
const good = (r, html) => r && r.ok && r.type === 'basic' && (!html || (r.headers.get('content-type') || '').includes('text/html'));

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const u = new URL(req.url);
  if (req.method !== 'GET' || u.origin !== location.origin || u.pathname.startsWith('/api/') || u.pathname === '/img' || u.pathname === '/sw.js') return; // /img: browser HTTP cache only
  const nav = req.mode === 'navigate';
  const key = nav ? '/' : req;
  e.respondWith(caches.open(CACHE).then(async (c) => {
    const hit = await c.match(key);
    const net = fetch(req).then(async (r) => {
      if (good(r, nav) && (!nav || (await r.clone().text()).includes('Felony'))) await c.put(key, r.clone());
      return r;
    });
    if (hit) { e.waitUntil(net.catch(() => {})); return hit; }
    return net.catch(() => c.match('/'));
  }));
});
