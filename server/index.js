const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { stores, skipped, reviews } = require('./stores');
const zlib = require('zlib');
const { enrich, prep, judgeCached, groupProducts, filterStats, brandList, noteBrand, brands } = require('./deals');
const marketplaces = require('./marketplaces');
const history = require('./history');
const storeById = Object.fromEntries(stores.map((s) => [s.id, s]));

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
    if (r.value) { let n = 0; r.value.forEach((p) => { const x = prep(p, s); if (x) { items.push(x); n++; } }); return { store: s.name, id: s.id, ok: true, count: n, filtered: r.value.length - n || undefined }; }
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
// Compressed bodies are memoized per cached string, so a cache hit costs no CPU.
const zcache = new Map();
function sendJson(res, { body, cache }) {
  res.set({ 'Content-Type': 'application/json; charset=utf-8', 'X-Cache': cache, 'Cache-Control': 'no-cache', Vary: 'Accept-Encoding' });
  const ae = String(res.req.headers['accept-encoding'] || '');
  if (body.length < 1400 || !/\b(br|gzip)\b/.test(ae)) return res.send(body);
  let z = zcache.get(body);
  if (!z) {
    const useBr = /\bbr\b/.test(ae);
    z = { enc: useBr ? 'br' : 'gzip', buf: useBr ? zlib.brotliCompressSync(body, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 5 } }) : zlib.gzipSync(body, { level: 6 }) };
    if (useBr) zcache.set(body, z);
    if (zcache.size > 60) zcache.delete(zcache.keys().next().value);
  }
  res.set('Content-Encoding', z.enc).send(z.buf);
}

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
  stores: stores.map(({ id, name, base, location, blurb, platform, mode, index, shipping, currency }) => ({ id, name, url: base, location, blurb, platform, mode: mode || 'live', shipping, currency, index: index ? index.info() : undefined })),
  history: history.meta(),
  airsoftFilter: (({ dropped, kept, byReason, byStore }) => ({ dropped, kept, byReason, byStore }))(filterStats()),
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

// Category browse: catalog-indexed stores contribute their whole category (cheap, in memory);
// live stores answer one category search each.
const CAT_TERMS = { rifles: 'aeg', pistols: 'pistol', snipers: 'sniper', mags: 'magazine', holsters: 'holster', gear: 'plate carrier', optics: 'red dot', parts: 'hop up', batteries: 'lipo battery', bbs: 'bbs', gas: 'green gas', other: 'airsoft' };
async function computeBrowse(cat) {
  const out = await fanOut(async (s) => {
    if (s.index) {
      const list = s.index.idx.items.filter((p) => judgeCached(p) === cat);
      return list.sort((a, b) => (b.originalPrice ? 1 : 0) - (a.originalPrice ? 1 : 0)).slice(0, 36).map(({ _n, _w, ...p }) => p);
    }
    return s.search(CAT_TERMS[cat]);
  });
  const groups = groupProducts(out.items).filter((g) => g.cat === cat).sort((a, b) => b.storeCount - a.storeCount || (b.maxDiscountPct || 0) - (a.maxDiscountPct || 0));
  return { partial: out.slow > 0, body: JSON.stringify({ cat, groups, status: out.status, partial: out.slow > 0, ms: out.ms, fetchedAt: out.fetchedAt }) };
}
app.get('/api/browse', async (req, res) => {
  const cat = String(req.query.cat || '');
  if (!CAT_TERMS[cat]) return res.status(400).json({ error: 'Unknown category' });
  sendJson(res, await cached('c:' + cat, 10 * 60 * 1000, 6 * 60 * 60 * 1000, () => computeBrowse(cat)));
});

// Price drops: products whose latest recorded price is lower than the one before (last 21 days),
// from the committed history plus drops this server has seen live since it woke up.
async function computeDrops() {
  const items = history.dropItems().filter((d) => storeById[d.storeId]).map((d) => prep(d, storeById[d.storeId])).filter(Boolean);
  const groups = groupProducts(items).filter((g) => g.h && g.h.chg < 0)
    .sort((a, b) => a.h.pct - b.h.pct);
  const m = history.meta();
  return { partial: false, body: JSON.stringify({ groups, history: { since: m.since, updated: m.updated, tracked: m.tracked }, fetchedAt: new Date().toISOString(), status: [] }) };
}
app.get('/api/drops', async (req, res) => sendJson(res, await cached('drops', 10 * 60 * 1000, 60 * 60 * 1000, computeDrops)));

// Brands: the user's brand directory, shown only for brands with at least one live airsoft listing
// (seen in a catalog index, the deals feed, a search or a category page since the server woke up).
let brandSeeded = 0;
function seedBrands() {
  if (Date.now() - brandSeeded < 10 * 60 * 1000) return;
  brandSeeded = Date.now();
  for (const s of stores) {
    if (!s.index) continue;
    for (const p of s.index.idx.items) { const cat = judgeCached(p); if (!cat) continue; const b = brands.detect(p); if (b) noteBrand(b, p.url, cat); }
  }
}
app.get('/api/brands', (req, res) => { seedBrands(); res.set('Cache-Control', 'public, max-age=300'); res.json({ brands: brandList() }); });
async function computeBrand(id) {
  const b = brands.byId(id);
  const out = await fanOut(async (s) => {
    if (s.index) return s.index.idx.items.filter((p) => judgeCached(p) && brands.detect(p)?.id === id).slice(0, 48).map(({ _n, _w, ...p }) => p);
    return s.search(b.name);
  });
  const groups = groupProducts(out.items).filter((g) => g.brandId === id || g.offers.some((o) => o.brandId === id))
    .sort((a, b) => b.storeCount - a.storeCount || (b.maxDiscountPct || 0) - (a.maxDiscountPct || 0));
  return { partial: out.slow > 0, body: JSON.stringify({ brand: { id: b.id, name: b.name, aliases: b.aliases, licensed: b.licensed || undefined }, groups, status: out.status, partial: out.slow > 0, ms: out.ms, fetchedAt: out.fetchedAt }) };
}
app.get('/api/brand', async (req, res) => {
  const id = String(req.query.id || '');
  if (!brands.byId(id)) return res.status(404).json({ error: 'Unknown brand' });
  sendJson(res, await cached('b:' + id, 10 * 60 * 1000, 6 * 60 * 60 * 1000, () => computeBrand(id)));
});

// Autocomplete: product names from the in-memory catalogs, recent searches and popular terms.
const POPULAR = ['Glock', 'Hi-Capa', 'M4 AEG', 'AK', 'MP5', 'Tokyo Marui', 'Elite Force', 'Krytac Trident', 'VFC', 'KWA', 'Novritsch', 'Sniper rifle', 'VSR-10', 'HPA', 'Gas blowback', 'Plate carrier', 'Red dot', 'Green gas', '0.28g BBs', '0.25g BBs', 'Hop up', 'Magazine', 'Mask', 'Battery'];
app.get('/api/suggest', (req, res) => {
  const q = String(req.query.q || '').toLowerCase().replace(/[^a-z0-9.& -]+/g, ' ').trim().slice(0, 60);
  res.set('Cache-Control', 'public, max-age=300');
  if (!q) return res.json({ q, suggestions: POPULAR.slice(0, 8) });
  const terms = q.split(/\s+/);
  const out = new Map();
  const add = (s) => { const k = s.toLowerCase(); if (!out.has(k) && out.size < 8) out.set(k, s); };
  POPULAR.filter((p) => p.toLowerCase().startsWith(q)).forEach(add);
  seedBrands();
  brandList().filter((b) => b.name.toLowerCase().startsWith(q)).slice(0, 3).forEach((b) => add(b.name));
  for (const k of results.keys()) if (k.startsWith('s:' + q) && k.length < 40) add(k.slice(2).replace(/\b\w/g, (c) => c.toUpperCase()));
  for (const s of stores) {
    if (out.size >= 8 || !s.index) continue;
    for (const p of s.index.idx.items) {
      if (!terms.every((t) => p._n.includes(t)) || !judgeCached(p)) continue;
      const short = p.title.replace(/\s*[-–|(].*$/, '').split(/\s+/).slice(0, 7).join(' ');
      if (terms.every((t) => short.toLowerCase().includes(t))) add(short);
      if (out.size >= 8) break;
    }
  }
  res.json({ q, suggestions: [...out.values()] });
});

// ---- static files ----
// app.js and styles.css are minified with esbuild at boot; the CSS is inlined into the HTML (one
// render-blocking request fewer). Text responses are pre-compressed (brotli + gzip) once.
const PUB = path.join(__dirname, '..', 'public');
let esbuild = null;
try { esbuild = require('esbuild'); } catch { /* serve unminified */ }
const read = (f) => fs.readFileSync(path.join(PUB, f), 'utf8');
const minify = (code, loader) => { try { return esbuild ? esbuild.transformSync(code, { loader, minify: true, target: loader === 'js' ? 'es2020' : 'safari14' }).code : code; } catch (e) { console.log('minify failed', e.message); return code; } };
const hash = (s) => crypto.createHash('sha1').update(s).digest('hex').slice(0, 10);
const appJs = minify(read('app.js'), 'js');
const css = minify(read('styles.css'), 'css').trim();
const configJs = read('config.js');
const version = { 'app.js': hash(appJs), 'config.js': hash(configJs), 'styles.css': hash(css) };
const indexHtml = read('index.html')
  .replace(/<link rel="stylesheet" href="\/styles\.css" \/>/, `<style>${css}</style>`)
  .replace(/(src|href)="\/(app\.js|config\.js)"/g, (m, attr, f) => `${attr}="/${f}?v=${version[f]}"`)
  .replace(/>\s+</g, '><').replace(/\n\s*/g, '');
function packed(body, type, cacheControl) {
  const buf = Buffer.from(body);
  return { type, cacheControl, raw: buf, br: zlib.brotliCompressSync(buf, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 11 } }), gz: zlib.gzipSync(buf, { level: 9 }) };
}
function sendPacked(req, res, p) {
  const ae = String(req.headers['accept-encoding'] || '');
  const enc = /\bbr\b/.test(ae) ? 'br' : /\bgzip\b/.test(ae) ? 'gz' : null;
  res.set({ 'Content-Type': p.type, 'Cache-Control': p.cacheControl, Vary: 'Accept-Encoding' });
  if (enc) res.set('Content-Encoding', enc === 'br' ? 'br' : 'gzip');
  res.send(enc ? p[enc] : p.raw);
}
const IMMUTABLE = 'public, max-age=31536000, immutable';
const PACKS = {
  '/': packed(indexHtml, 'text/html; charset=utf-8', 'no-cache'),
  '/app.js': packed(appJs, 'text/javascript; charset=utf-8', IMMUTABLE),
  '/config.js': packed(configJs, 'text/javascript; charset=utf-8', IMMUTABLE),
  '/styles.css': packed(css, 'text/css; charset=utf-8', IMMUTABLE),
  '/sw.js': packed(minify(read('sw.js').replace('__ASSET_VERSIONS__', JSON.stringify(version)), 'js'), 'text/javascript; charset=utf-8', 'no-cache'),
  '/manifest.webmanifest': packed(read('manifest.webmanifest'), 'application/manifest+json', 'public, max-age=86400'),
  '/icons/icon.svg': packed(read('icons/icon.svg'), 'image/svg+xml', 'public, max-age=2592000, immutable'),
};
PACKS['/index.html'] = PACKS['/'];
app.get(Object.keys(PACKS), (req, res) => sendPacked(req, res, PACKS[req.path]));
app.use(express.static(PUB, {
  index: false,
  setHeaders: (res, file) => {
    const rel = path.relative(PUB, file);
    if (/^(fonts|icons)\//.test(rel)) res.set('Cache-Control', 'public, max-age=2592000, immutable');
    else res.set('Cache-Control', 'no-cache');
  },
}));

// Compress API JSON too (search/deals payloads compress ~8x).
// Background work: catalog indexes load their bundled snapshot instantly, then refresh one at a
// time in a worker thread. The deals feed and the home-page search chips are kept warm.
const BG = !process.env.NO_BACKGROUND; // NO_BACKGROUND=1 for a UI-only dev server (no crawls, no warming)
stores.filter((s) => s.index).forEach((s, i) => (BG ? s.index.start(20000 + i * 1000) : s.index.start(1e9)));
const WARM = ['Tokyo Marui', 'Gas blowback', 'M4 AEG', 'Glock', 'Hi-Capa', 'Sniper rifle', 'Plate carrier', 'HPA', '0.28g BBs'];
const warmDeals = () => cached('deals', 10 * 60 * 1000, 0, computeDeals, { force: true }).catch(() => {});
async function warmChips() {
  for (const q of WARM) { await cached('s:' + q.toLowerCase(), 10 * 60 * 1000, 0, () => computeSearch(q), { force: true }).catch(() => {}); await sleep(1500); }
  for (const c of Object.keys(CAT_TERMS)) { await cached('c:' + c, 10 * 60 * 1000, 0, () => computeBrowse(c), { force: true }).catch(() => {}); await sleep(1500); }
  cached('drops', 10 * 60 * 1000, 0, computeDrops, { force: true }).catch(() => {});
}
// History: pull the newest copy committed by the GitHub Action shortly after boot and every 3 hours.
// New history changes every arrow, so cached results are dropped when it arrives.
history.onUpdate.push(() => results.clear());
if (BG) {
  setTimeout(() => history.refreshRemote(), 45 * 1000);
  setInterval(() => history.refreshRemote(), 3 * 60 * 60 * 1000);
}
if (BG) {
  setTimeout(async () => { await warmDeals(); warmChips(); }, 300);
  setInterval(warmDeals, 9 * 60 * 1000);
  setInterval(warmChips, 30 * 60 * 1000);
}

const port = process.env.PORT || 8787;
app.listen(port, () => console.log(`Felony's Airsoft Emporium running on http://localhost:${port}`));
