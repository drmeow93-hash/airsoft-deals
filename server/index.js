const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { stores, skipped, fields, reviews } = require('./stores');
const vetting = require('./vetting');
const zlib = require('zlib');
const { enrich, prep, judgeCached, groupProducts, filterStats, brandList, noteBrand, brands } = require('./deals');
const marketplaces = require('./marketplaces');
const history = require('./history');
const verdicts = require('./verdict');
const refresh = require('./refresh');
const keepWarm = require('./keepwarm');
const storeById = Object.fromEntries(stores.map((s) => [s.id, s]));

const app = express();
app.disable('x-powered-by');
app.use((req, res, next) => {
  res.set('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') { res.set({ 'Access-Control-Allow-Methods': 'GET, POST', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Max-Age': '86400' }); return res.sendStatus(204); }
  next();
});

// Smaller JSON: offers drop fields the app never reads (they repeat the group's own title/brand/category).
// Each group carries its score badge (cached AI score, else the labeled estimate; null if we can't judge).
const slim = (gs) => gs.map((g) => ({ ...g, score: verdicts.scoreFor(g), offers: g.offers.map(({ title, brand, brandId, cat, indexedAt, image, tags, ptype, cats, ...o }) => o) }));
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
      .then((v) => (v === TIMEOUT ? { slow: true } : { value: v }), (e) => ({ error: e }))
      .then((r) => {
        // Report each store as soon as it answers, so the live status counts up store by store.
        refresh.noteStore(s, r.value ? { ok: true, snapshotAt: r.value.snapshotAt } : r.slow ? { ok: false, slow: true } : { ok: false, error: String(r.error?.message || r.error) });
        return r;
      });
  }));
  const items = [];
  let slow = 0;
  const status = settled.map((r, i) => statusOf(r, i));
  return { items, status, slow, ms: Date.now() - t0, fetchedAt: new Date().toISOString() };
  function statusOf(r, i) {
    const s = stores[i];
    if (r.value) { let n = 0; r.value.forEach((p) => { const x = prep(p, s); if (x) { items.push(x); n++; } }); return { store: s.name, id: s.id, ok: true, count: n, filtered: r.value.length - n || undefined, snapshotAt: r.value.snapshotAt, note: r.value.snapshotAt ? `live search unavailable (${r.value.liveError}); showing prices from ${r.value.snapshotAt.slice(0, 10)}` : undefined }; }
    if (r.slow) { slow++; return { store: s.name, id: s.id, ok: false, slow: true, error: 'Still loading' }; }
    const error = String(r.error?.message || r.error);
    return { store: s.name, id: s.id, ok: false, indexing: /^Building catalog index/.test(error), error };
  }
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
  if (e && e.body) { results.delete(key); results.set(key, e); } // LRU: hot keys (deals, drops) are never the ones evicted
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
  return { partial: out.slow > 0, body: JSON.stringify({ query: q, groups: slim(groups), status: out.status, partial: out.slow > 0, ms: out.ms, fetchedAt: out.fetchedAt, offerCount: out.items.length }) };
}

async function computeDeals(timeoutMs = 15000) {
  // Keep each store's top 40 by discount so one big catalog doesn't drown out the rest.
  const out = await fanOut(async (s) => (await s.deals())
    .map((p) => ({ ...p, _d: p.originalPrice ? (p.originalPrice - p.price) / p.originalPrice : 0 }))
    .filter((p) => p._d <= 0.8 || p.storeDeal)
    .sort((a, b) => b._d - a._d)
    // Collapse color/size variants ("Pouch - Black", "Pouch - Tan") so one product doesn't fill the feed.
    .filter(((seen) => (p) => { const k = p.title.split(/\s[-–|]\s/)[0].toLowerCase(); return seen.has(k) ? false : seen.add(k); })(new Set()))
    .slice(0, 40).map(({ _d, ...p }) => p), timeoutMs);
  // Interleave stores (each in its own discount order) so the default feed is a fair mix.
  const byStore = {};
  for (const g of groupProducts(out.items)) (byStore[g.offers[0].storeId] ||= []).push(g);
  const lists = Object.values(byStore).map((l) => l.sort((a, b) => b.discountPct - a.discountPct));
  const mixed = [];
  for (let i = 0; lists.some((l) => l[i]); i++) lists.forEach((l) => l[i] && mixed.push(l[i]));
  return { partial: out.slow > 0, body: JSON.stringify({ groups: slim(mixed), status: out.status, ms: out.ms, fetchedAt: out.fetchedAt, offerCount: out.items.length }) };
}

app.get('/api/stores', (req, res) => res.json({
  stores: stores.map(({ id, name, base, location, blurb, platform, mode, index, shipping, currency }) => ({ id, name, url: base, location, blurb, platform, mode: mode || 'live', shipping, currency, index: index ? index.info() : undefined })),
  history: history.meta(),
  airsoftFilter: (({ dropped, kept, byReason, byStore }) => ({ dropped, kept, byReason, byStore }))(filterStats()),
  skipped,
  fields,
  reviews,
  vetting: vetting.meta(),
}));

// The full legitimacy-vetting record (every domain, every check, pass/fail, date), for auditing.
// Ask Grok: buyer's verdict for one product (AI with XAI_API_KEY, otherwise a labeled rule-based quick take).
app.post('/api/verdict', express.json({ limit: '16kb' }), async (req, res) => {
  const ip = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
  try { const r = await verdicts.verdict(req.body, ip); res.status(r.status).set('Cache-Control', 'no-store').json(r.body); } catch (e) { res.status(500).json({ error: 'verdict failed' }); }
});
// ---- Accounts: watchlist sync, target-price alerts (email via Resend when RESEND_API_KEY is set) ----
const accounts = require('./accounts');
const ipOf = (req) => String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
for (const [route, fn] of [['sync', accounts.sync], ['confirm', accounts.confirm], ['get', accounts.get], ['delete', accounts.del]]) {
  app.post('/api/account/' + route, express.json({ limit: '96kb' }), async (req, res) => {
    try { const r = await fn(req.body || {}, ipOf(req)); res.status(r.status).set('Cache-Control', 'no-store').json(r.body); } catch (e) { console.log('[accounts]', e.message); res.status(500).json({ error: 'Account service unavailable' }); }
  });
}
app.get('/api/account/info', (req, res) => res.set('Cache-Control', 'no-store').json(accounts.info()));

// ---- Wishlist import: match pasted URLs / names / CSV rows to listings, using only local catalogs ----
// (Shopify snapshots + catalog-index stores already in memory: no store requests, so an import can't
// cause a burst of traffic.) URLs are turned into a query from their product slug.
function queryOf(line) {
  const t = String(line || '').trim();
  if (/^https?:\/\//i.test(t)) {
    try {
      const u = new URL(t);
      if (!vetting.isVetted(t)) return { q: null, why: 'not a store we track' };
      const slug = decodeURIComponent(u.pathname.split('/').filter(Boolean).pop() || '').replace(/\.(html?|php)$/i, '').replace(/[-_+]+/g, ' ').replace(/\b\d{4,}\b/g, ' ');
      return { q: slug.replace(/\s+/g, ' ').trim().slice(0, 80), url: t };
    } catch { return { q: null, why: 'bad URL' }; }
  }
  return { q: t.replace(/[^\w.&' /-]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80) };
}
function localSearch(q) {
  const items = [];
  for (const s of stores) {
    let list = [];
    try { list = s.local ? s.local(q, 12) : s.index && s.index.idx.items.length ? s.index.idx.items.filter((p) => q.toLowerCase().split(' ').every((w) => p._n.includes(w))).slice(0, 12).map(({ _n, _w, ...p }) => p) : []; } catch { list = []; }
    for (const p of list) { const x = prep({ ...p }, s); if (x) items.push(x); }
  }
  return groupProducts(items);
}
const toks = (s) => new Set(String(s).toLowerCase().replace(/[^a-z0-9.]+/g, ' ').split(' ').filter((w) => w.length > 1));
app.post('/api/match', express.json({ limit: '64kb' }), (req, res) => {
  const lines = (Array.isArray(req.body?.lines) ? req.body.lines : []).map((l) => String(l || '').slice(0, 400)).filter((l) => l.trim()).slice(0, 25);
  const out = lines.map((line) => {
    const { q, url, why } = queryOf(line);
    if (!q || q.length < 3) return { line, query: q, match: null, why: why || 'too short' };
    // Drop words until something matches (store titles rarely contain every word of a wishlist line).
    let words = q.split(' '), groups = [];
    while (words.length && !(groups = localSearch(words.join(' '))).length) words = words.slice(0, -1);
    if (!groups.length) return { line, query: q, match: null, why: 'no listing found in our stores' };
    const want = toks(q);
    const scoreOf = (g) => { const t = toks(`${g.brand || ''} ${g.title}`); let n = 0; for (const w of want) if (t.has(w)) n++; return n / Math.max(want.size, 1) + (url && g.offers.some((o) => history.normUrl(o.url) === history.normUrl(url)) ? 2 : 0) + g.storeCount * 0.01; };
    const best = groups.sort((a, b) => scoreOf(b) - scoreOf(a))[0];
    const conf = scoreOf(best);
    const frac = Math.min(1, conf >= 2 ? conf - 2 : conf);
    return { line, query: q, match: slim([best])[0], confidence: conf >= 2 ? 'exact' : conf >= 0.6 ? 'good' : 'weak', why: conf >= 2 ? 'same listing as your link' : `${Math.round(frac * 100)}% of the words match` };
  });
  res.set('Cache-Control', 'no-store').json({ results: out });
});

// Popular products: the most widely stocked items from the popular searches we keep warm.
const POPULAR_Q = ['Hi-Capa 5.1', 'Glock 17', 'MP5', 'AK47', 'VSR-10', 'M4 MWS', 'Desert Eagle', '1911', 'G36', 'SCAR', 'Hi-Capa 4.3', 'M9', 'AUG', 'L96'];
app.get('/api/popular', async (req, res) => {
  sendJson(res, await cached('popular', 10 * 60 * 1000, 6 * 60 * 60 * 1000, async () => {
    const seen = new Set(), picks = [];
    for (const q of WARM) {
      const e = results.get('s:' + q.toLowerCase()); if (!e || !e.body) continue;
      const gs = JSON.parse(e.body.replace(/^\{"refreshing":true,/, '{')).groups.filter((g) => g.storeCount >= 2 && ['rifles', 'pistols', 'snipers'].includes(g.cat));
      for (const g of gs.slice(0, 3)) { const k = g.title.toLowerCase(); if (!seen.has(k)) { seen.add(k); picks.push({ ...g, popularFrom: q }); } }
    }
    // Cold start (searches not warmed yet): the same kind of picks from the in-memory catalogs, no store requests.
    let src = 'live';
    if (picks.length < 6) {
      src = picks.length ? 'live+catalog' : 'catalog';
      for (const q of POPULAR_Q) {
        const g = slim(localSearch(q).filter((x) => x.storeCount >= 2 && ['rifles', 'pistols', 'snipers'].includes(x.cat)).sort((a, b) => b.storeCount - a.storeCount).slice(0, 1))[0];
        if (g && !seen.has(g.title.toLowerCase())) { seen.add(g.title.toLowerCase()); picks.push({ ...g, popularFrom: q }); }
      }
    }
    return { partial: src !== 'live', body: JSON.stringify({ groups: picks.slice(0, 16), src, fetchedAt: new Date().toISOString() }) };
  }));
});

// Visit-triggered refresh: every page view calls this; stale stores are re-checked in one shared
// background cycle (see server/refresh.js). The page never waits for it.
app.get('/api/refresh', (req, res) => {
  const q = req.query;
  const key = q.q ? refresh.scopeKey('search', q.q) : q.cat ? refresh.scopeKey('cat', String(q.cat)) : q.brand ? refresh.scopeKey('brand', String(q.brand)) : 'deals';
  refresh.touch(key);
  keepWarm.visit();
  refresh.run('visit');
  res.set('Cache-Control', 'no-store').json({ key, ...refresh.status(key) });
});
app.get('/api/refresh/status', (req, res) => res.set('Cache-Control', 'no-store').json(refresh.status(String(req.query.key || '')) ));
app.post('/api/recheck', express.json({ limit: '16kb' }), async (req, res) => {
  try { res.set('Cache-Control', 'no-store').json({ offers: await refresh.recheck(req.body && req.body.offers, String((req.body && req.body.title) || '').slice(0, 120)), minutes: refresh.PRODUCT_MS / 60000 }); } catch (e) { res.status(500).json({ error: 'recheck failed' }); }
});
const lag = require('perf_hooks').monitorEventLoopDelay({ resolution: 10 }); lag.enable();
app.get('/api/health', (req, res) => { const m = process.memoryUsage(); res.set('Cache-Control', 'no-store').json({ ok: true, uptimeS: Math.round(process.uptime()), bootMs: BOOT_MS, shell: SHELL.from, loopLagMs: { p50: Math.round(lag.percentile(50) / 1e6), p99: Math.round(lag.percentile(99) / 1e6), max: Math.round(lag.max / 1e6) }, keepWarm: keepWarm.status(), heapMB: Math.round(m.heapUsed / 1048576), rssMB: Math.round(m.rss / 1048576), img: require('./imgproxy').stats(), backoff: require('./http').backoffStatus() }); });
app.get('/img', require('./imgproxy').handler);
app.get('/api/verdict/info', (req, res) => res.json(verdicts.info()));
app.get('/api/vetting', (req, res) => res.json(vetting.doc));

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

// ?top=1: just the first 60 groups of the store-interleaved feed, for the home page (about 10x smaller).
let dealsTop = { src: null, body: null };
app.get('/api/deals', async (req, res) => {
  const full = await cached('deals', 10 * 60 * 1000, 24 * 60 * 60 * 1000, computeDeals);
  if (!req.query.top) return sendJson(res, full);
  const raw = full.body.replace(/^\{"refreshing":true,/, '{');
  if (dealsTop.src !== raw) { const d = JSON.parse(raw); d.total = d.groups.length; d.groups = d.groups.slice(0, 60); dealsTop = { src: raw, body: JSON.stringify(d) }; }
  sendJson(res, { body: dealsTop.body, cache: full.cache });
});

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
  return { partial: out.slow > 0, body: JSON.stringify({ cat, groups: slim(groups), status: out.status, partial: out.slow > 0, ms: out.ms, fetchedAt: out.fetchedAt }) };
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
  return { partial: false, body: JSON.stringify({ groups: slim(groups), history: { since: m.since, updated: m.updated, tracked: m.tracked }, fetchedAt: new Date().toISOString(), status: [] }) };
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
  return { partial: out.slow > 0, body: JSON.stringify({ brand: { id: b.id, name: b.name, aliases: b.aliases, licensed: b.licensed || undefined }, groups: slim(groups), status: out.status, partial: out.slow > 0, ms: out.ms, fetchedAt: out.fetchedAt }) };
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
// app.js and styles.css are minified, the CSS is inlined into the HTML (one render-blocking request
// fewer), and text responses are pre-compressed; see server/packer.js (done at install time).
const PUB = path.join(__dirname, '..', 'public');
const packer = require('./packer');
const SHELL = packer.get();
const PACKS = SHELL.packs;
app.get(Object.keys(PACKS), (req, res) => packer.send(req, res, PACKS[req.path]));
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
refresh.init({ stores, cached, computeDeals, computeSearch, computeBrowse, computeBrand, history, afterCycle: () => accounts.checkAlerts() });
accounts.init({ recheck: (offers, title) => refresh.recheck(offers, title), latest: (urls) => history.latestFor(urls) });
const BG = !process.env.NO_BACKGROUND; // NO_BACKGROUND=1 for a UI-only dev server (no crawls, no warming)
stores.filter((s) => s.index).forEach((s, i) => (BG ? s.index.start(20000 + i * 1000) : s.index.start(1e9)));
const WARM = ['Tokyo Marui', 'Gas blowback', 'M4 AEG', 'Glock', 'Hi-Capa', 'Sniper rifle', 'Plate carrier', 'HPA', '0.28g BBs'];
async function warmChips() {
  for (const q of WARM) { await cached('s:' + q.toLowerCase(), 10 * 60 * 1000, 0, () => computeSearch(q), { force: true }).catch(() => {}); await sleep(6000); }
  for (const c of Object.keys(CAT_TERMS)) { await cached('c:' + c, 10 * 60 * 1000, 0, () => computeBrowse(c), { force: true }).catch(() => {}); await sleep(6000); }
  cached('drops', 10 * 60 * 1000, 0, computeDrops, { force: true }).catch(() => {});
}
// History: pull the newest copy committed by the GitHub Action shortly after boot and every 3 hours.
// New history changes every arrow, so cached results are dropped when it arrives.
// Cached results are marked stale (not dropped): the next request gets the old copy instantly and the
// recompute runs in the background, instead of a visitor waiting ~8 s on the 0.1-CPU instance.
history.onUpdate.push(() => { const t = Date.now(); for (const e of results.values()) if (e.body) e.at = Math.min(e.at, t - e.freshMs - 1); });
if (BG) {
  setTimeout(() => history.refreshRemote(), 45 * 1000);
  setInterval(() => history.refreshRemote(), 3 * 60 * 60 * 1000);
}
// Shopify fallback snapshots are parsed shortly after boot, one at a time, so the first search
// during a Shopify rate limit doesn't pay for decompressing them all at once.
if (BG) stores.filter((s) => s.snapshotInfo).forEach((s, i) => setTimeout(() => s.snapshotInfo(), 8000 + i * 700));
if (BG) {
  // Cold start: Render just woke us (a visitor is waiting), so check every store right away.
  // (A short pause first, so the waking visitor's own page requests get the CPU before the crawl.)
  setTimeout(async () => { await refresh.run('boot'); await sleep(5000); warmChips(); }, 2500);
  setInterval(() => { if (keepWarm.visitedWithin(60 * 60 * 1000)) warmChips(); }, 30 * 60 * 1000);
  keepWarm.start(() => accounts.checkAlerts().catch(() => {}));
}

const port = process.env.PORT || 8787;
let BOOT_MS = null;
app.listen(port, () => { BOOT_MS = Math.round(process.uptime() * 1000); console.log(`Felony's Airsoft Emporium running on http://localhost:${port} (boot ${BOOT_MS} ms, static shell ${SHELL.from})`); });
