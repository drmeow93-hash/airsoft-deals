// Felony's Airsoft Emporium service worker.
// Pages: network first (3 s), so a new release shows on the next visit; the cached shell is the fallback
// while the free server wakes up or when offline. Hashed assets (?v=…): cache first (they never change).
// Prices are never cached here; the app keeps its own last results and always asks the server.
// Upgrades: the new worker takes over at once (skipWaiting + clients.claim). If it replaced an older
// version, every open tab is reloaded once so no tab keeps running old JS against the new API.
const V = __ASSET_VERSIONS__; // filled in by the server: content hashes of app.js / styles.css / config.js
const CACHE = 'felony-v11c-' + Object.values(V).join('').slice(0, 16);
const SHELL = ['/', '/manifest.webmanifest', '/icons/icon.svg', '/icons/icon-192.png', '/fonts/DancingScript-wordmark.woff2',
  ...Object.entries(V).map(([f, h]) => `/${f}?v=${h}`)];
self.addEventListener('install', (e) => { self.skipWaiting(); e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).catch(() => {})); });
self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const old = (await caches.keys()).filter((k) => k !== CACHE);
    await Promise.all(old.map((k) => caches.delete(k)));
    await self.clients.claim();
    if (old.some((k) => k.startsWith('felony-'))) {
      // Tabs still running an older app.js are told to reload (newer app.js listens for this); tabs from
      // before that listener existed get a reload on their next page load (pages are network-first now).
      for (const c of await self.clients.matchAll({ type: 'window' })) c.postMessage({ type: 'felony-updated', v: V['app.js'] });
    }
  })());
});

// Only keep real app responses (never a hosting "waking up" page or an error).
const good = (r, html) => r && r.ok && r.type === 'basic' && (!html || (r.headers.get('content-type') || '').includes('text/html'));

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const u = new URL(req.url);
  if (req.method !== 'GET' || u.origin !== location.origin || u.pathname.startsWith('/api/') || u.pathname === '/img' || u.pathname === '/sw.js') return; // /img: browser HTTP cache only
  if (req.mode === 'navigate') {
    e.respondWith((async () => {
      const c = await caches.open(CACHE);
      const net = fetch(req).then(async (r) => { if (good(r, true) && (await r.clone().text()).includes('Felony')) await c.put('/', r.clone()); return r; });
      const timeout = new Promise((res) => setTimeout(res, 3000));
      const r = await Promise.race([net.catch(() => null), timeout]);
      if (r && r.ok) return r;
      return (await c.match('/')) || net;
    })());
    return;
  }
  e.respondWith(caches.open(CACHE).then(async (c) => {
    const hit = await c.match(req);
    if (hit && u.searchParams.has('v')) return hit;
    const net = fetch(req).then(async (r) => { if (good(r)) await c.put(req, r.clone()); return r; });
    if (hit) { e.waitUntil(net.catch(() => {})); return hit; }
    return net;
  }));
});
