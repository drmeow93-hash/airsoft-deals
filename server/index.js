const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { stores, skipped, reviews } = require('./stores');
const { enrich, groupProducts } = require('./deals');
const marketplaces = require('./marketplaces');

const app = express();
app.disable('x-powered-by');
app.use((req, res, next) => { res.set('Access-Control-Allow-Origin', '*'); next(); });

const STORE_TIMEOUT_MS = 4000; // one slow store can't hold up the whole page
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Ask every store at once. Stores slower than `timeoutMs` are reported as "still loading"; their
// request keeps running in the background and lands in the HTTP cache for the next call.
async function fanOut(fn, timeoutMs = STORE_TIMEOUT_MS) {
  const t0 = Date.now();
  const TIMEOUT = Symbol('timeout');
  const settled = await Promise.all(stores.map((s) => {
    const work = Promise.resolve().then(() => fn(s));
    work.catch(() => {});
    return Promise.race([work, sleep(timeoutMs).then(() => TIMEOUT)])
      .then((v) => (v === TIMEOUT ? { slow: true } : { value: v }), (e) => ({ error: e }));
  }));
  const items = [];
  let slow = 0;
  const status = settled.map((r, i) => {
    const s = stores[i];
    if (r.value) { r.value.forEach((p) => items.push(enrich(p, s))); return { store: s.name, id: s.id, ok: true, count: r.value.length }; }
    if (r.slow) { slow++; return { store: s.name, id: s.id, ok: false, slow: true, error: 'Still loading' }; }
    const error = String(r.error?.message || r.error);
    return { store: s.name, id: s.id, ok: false, indexing: /^Building catalog index/.test(error), error };
  });
  return { items, status, slow, ms: Date.now() - t0, fetchedAt: new Date().toISOString() };
}

// Response cache: finished JSON is kept per query. Fresh hits are served instantly; stale hits are
// also served instantly (flagged `refreshing`) while a background refresh runs.
const results = new Map();
async function cached(key, freshMs, maxAgeMs, compute, { force = false } = {}) {
  const now = Date.now();
  let e = results.get(key);
  const refresh = () => {
    if (e && e.pending) return e.pending;
    const pending = compute().then((v) => {
      // Results missing a slow store are kept only briefly, so the next request picks it up.
      results.set(key, { body: v.body, at: Date.now(), freshMs: v.partial ? 15000 : freshMs, pending: null });
      if (results.size > 300) results.delete(results.keys().next().value);
      return results.get(key);
    }).finally(() => { const cur = results.get(key); if (cur && cur.pending === pending) cur.pending = null; });
    if (e) e.pending = pending; else results.set(key, (e = { pending }));
    return pending;
  };
  if (force) return { body: (await refresh()).body, cache: 'warm' };
  if (e && e.body && now - e.at < e.freshMs) return { body: e.body, cache: 'hit' };
  if (e && e.body && now - e.at < maxAgeMs) { refresh().catch(() => {}); return { body: e.body.replace(/^\{/, '{"refreshing":true,'), cache: 'stale' }; }
  const r = await refresh();
  return { body: r.body, cache: 'miss' };
}
const sendJson = (res, { body, cache }) => res.set({ 'Content-Type': 'application/json; charset=utf-8', 'X-Cache': cache, 'Cache-Control': 'no-cache' }).send(body);

async function computeSearch(q, timeoutMs) {
  const out = await fanOut((s) => s.search(q), timeoutMs);
  const groups = groupProducts(out.items).sort((a, b) => b.storeCount - a.storeCount || a.bestPrice - b.bestPrice);
  return { partial: out.slow > 0, body: JSON.stringify({ query: q, groups, status: out.status, partial: out.slow > 0, ms: out.ms, fetchedAt: out.fetchedAt, offerCount: out.items.length }) };
}

async function computeDeals() {
  // Keep each store's top 60 by discount so one big catalog doesn't drown out the rest.
  const out = await fanOut(async (s) => (await s.deals())
    .map((p) => ({ ...p, _d: p.originalPrice ? (p.originalPrice - p.price) / p.originalPrice : 0 }))
    .filter((p) => p._d <= 0.8 || p.storeDeal)
    .sort((a, b) => b._d - a._d)
    // Collapse color/size variants ("Pouch - Black", "Pouch - Tan") so one product doesn't fill the feed.
    .filter(((seen) => (p) => { const k = p.title.split(/\s[-–|]\s/)[0].toLowerCase(); return seen.has(k) ? false : seen.add(k); })(new Set()))
    .slice(0, 60).map(({ _d, ...p }) => p), 15000);
  // Interleave stores (each in its own discount order) so the default feed is a fair mix.
  const byStore = {};
  for (const g of groupProducts(out.items)) (byStore[g.offers[0].storeId] ||= []).push(g);
  const lists = Object.values(byStore).map((l) => l.sort((a, b) => b.discountPct - a.discountPct));
  const mixed = [];
  for (let i = 0; lists.some((l) => l[i]); i++) lists.forEach((l) => l[i] && mixed.push(l[i]));
  return { partial: out.slow > 0, body: JSON.stringify({ groups: mixed, status: out.status, ms: out.ms, fetchedAt: out.fetchedAt, offerCount: out.items.length }) };
}

app.get('/api/stores', (req, res) => res.json({
  stores: stores.map(({ id, name, base, location, blurb, platform, mode, index }) => ({ id, name, url: base, location, blurb, platform, mode: mode || 'live', index: index ? index.info() : undefined })),
  skipped,
  reviews,
}));

app.get('/api/marketplaces', (req, res) => res.json({ marketplaces: marketplaces.list() }));
app.get('/api/marketplace-search', async (req, res) => {
  const q = String(req.query.q || '').trim().slice(0, 80);
  if (q.length < 2) return res.status(400).json({ error: 'Query too short' });
  res.json(await marketplaces.searchMarketplaces(q));
});

// ?fast=1 answers with whatever stores respond within ~1.2s (the page renders those right away);
// the app then makes a normal call that waits up to 4s per store for the rest.
app.get('/api/search', async (req, res) => {
  const q = String(req.query.q || '').trim().slice(0, 80);
  if (q.length < 2) return res.status(400).json({ error: 'Query too short' });
  const key = 's:' + q.toLowerCase();
  if (req.query.fast) {
    const e = results.get(key);
    if (!e || !e.body) {
      const fast = await computeSearch(q, 1200);
      if (!fast.partial) results.set(key, { body: fast.body, at: Date.now(), freshMs: 10 * 60 * 1000, pending: null });
      return sendJson(res, { body: fast.body, cache: 'fast' });
    }
  }
  sendJson(res, await cached(key, 10 * 60 * 1000, 6 * 60 * 60 * 1000, () => computeSearch(q)));
});

app.get('/api/deals', async (req, res) => sendJson(res, await cached('deals', 10 * 60 * 1000, 24 * 60 * 60 * 1000, computeDeals)));

// ---- static files: hashed asset URLs get long-lived caching ----
const PUB = path.join(__dirname, '..', 'public');
const hashOf = (f) => crypto.createHash('sha1').update(fs.readFileSync(path.join(PUB, f))).digest('hex').slice(0, 10);
const ASSETS = ['app.js', 'styles.css', 'config.js'];
const version = Object.fromEntries(ASSETS.map((f) => [f, hashOf(f)]));
const indexHtml = fs.readFileSync(path.join(PUB, 'index.html'), 'utf8')
  .replace(/(src|href)="\/(app\.js|styles\.css|config\.js)"/g, (m, attr, f) => `${attr}="/${f}?v=${version[f]}"`);
const sendIndex = (req, res) => res.set({ 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' }).send(indexHtml);
app.get(['/', '/index.html'], sendIndex);
app.get('/sw.js', (req, res) => res.set({ 'Cache-Control': 'no-cache', 'Content-Type': 'text/javascript; charset=utf-8' }).send(
  fs.readFileSync(path.join(PUB, 'sw.js'), 'utf8').replace('__ASSET_VERSIONS__', JSON.stringify(version))));
app.use(express.static(PUB, {
  extensions: ['html'],
  setHeaders: (res, file) => {
    const rel = path.relative(PUB, file);
    if (/^(fonts|icons)\//.test(rel)) res.set('Cache-Control', 'public, max-age=2592000, immutable');
    else if (res.req.query.v) res.set('Cache-Control', 'public, max-age=31536000, immutable');
    else res.set('Cache-Control', 'no-cache');
  },
}));

// Background work: catalog indexes load their bundled snapshot instantly, then refresh one at a
// time in a worker thread. The deals feed and the home-page search chips are kept warm.
const BG = !process.env.NO_BACKGROUND; // NO_BACKGROUND=1 for a UI-only dev server (no crawls, no warming)
stores.filter((s) => s.index).forEach((s, i) => (BG ? s.index.start(20000 + i * 1000) : s.index.start(1e9)));
const WARM = ['Tokyo Marui', 'Gas blowback', 'M4 AEG', 'Glock', 'Hi-Capa', 'Sniper rifle', 'Plate carrier', 'HPA', '0.28g BBs'];
const warmDeals = () => cached('deals', 10 * 60 * 1000, 0, computeDeals, { force: true }).catch(() => {});
async function warmChips() {
  for (const q of WARM) { await cached('s:' + q.toLowerCase(), 10 * 60 * 1000, 0, () => computeSearch(q), { force: true }).catch(() => {}); await sleep(1500); }
}
if (BG) {
  setTimeout(async () => { await warmDeals(); warmChips(); }, 300);
  setInterval(warmDeals, 9 * 60 * 1000);
  setInterval(warmChips, 30 * 60 * 1000);
}

const port = process.env.PORT || 8787;
app.listen(port, () => console.log(`Felony's Airsoft Emporium running on http://localhost:${port}`));
