// Visit-triggered price refresh.
//
// Every page view calls /api/refresh. If any live store hasn't been checked for REFRESH_MIN_MS
// (default 15 min), one shared background cycle starts. Concurrent visitors join the same cycle; it
// never runs twice at once. The cycle re-runs the deals feed and the searches/categories people
// viewed in the last 30 minutes through the normal polite fetchers (robots-allowed routes, honest
// User-Agent, Shopify 4-at-a-time pool, Retry-After backoff, crawl delays for catalog stores), so a
// rate-limited store is skipped until its backoff ends and keeps its last-checked time.
// Catalog-index stores (search disallowed) refresh on their own crawl schedule, never per visit.
const { canFetch } = require('./robots');
const { lastOkAt } = require('./http');

const MIN_MS = +process.env.REFRESH_MIN_MS || 15 * 60 * 1000;
const PRODUCT_MS = +process.env.PRODUCT_RECHECK_MS || 5 * 60 * 1000;
const GAP_MS = +process.env.REFRESH_GAP_MS || 60 * 1000; // at least this long between cycles
const SCOPE_TTL = 30 * 60 * 1000;
// A refresh cycle waits this long for each store (including time queued in the 4-at-a-time Shopify pool)
// before calling it failed. Page requests still give up after a few seconds and show what's ready.
const STORE_HARD_MS = +process.env.REFRESH_STORE_MS || 90 * 1000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let ctx = null; // { stores, cached, computeDeals, computeSearch, computeBrowse, computeBrand, history }
const S = { running: null, cycle: 0, startedAt: null, finishedAt: null, version: 0, stores: new Map(), scopes: new Map(), scopeVer: new Map() };
const products = new Map(); // url -> { at, result }

function init(c) {
  ctx = c;
  for (const s of c.stores) S.stores.set(s.id, { id: s.id, name: s.name, kind: s.index ? 'catalog' : 'live', state: 'pending', checkedAt: null, dueAt: 0 });
}

// Called by fanOut for every store answer (search, deals, category, brand).
function noteStore(s, st) {
  const e = S.stores.get(s.id); if (!e) return;
  const now = Date.now();
  if (e.kind === 'catalog') return;
  // A page request that gave up waiting says nothing about the store: keep whatever state it had.
  if (st.slow) return;
  if (st.ok && !st.snapshotAt) {
    // "Checked" means the store's site actually answered, not that a cached copy was reused.
    const t = lastOkAt(s.base) || e.checkedAt || now;
    // During a cycle, an answer from an older cached copy doesn't count as this cycle's check.
    if (S.running && e.state === 'checking' && t < S.startedAt) return;
    e.state = 'ok'; e.checkedAt = t; e.dueAt = t + MIN_MS; e.note = null; e.snapshotAt = null; return;
  }
  const err = String(st.note || st.error || '');
  if (st.snapshotAt || /429|slow down/i.test(err)) {
    const m = err.match(/waiting (\d+) s/);
    e.state = 'rate-limited'; e.snapshotAt = st.snapshotAt || e.snapshotAt || null; e.note = 'Store asked us to slow down';
    e.dueAt = now + (m ? +m[1] * 1000 : MIN_MS);
    return;
  }
  e.state = 'error'; e.note = err.slice(0, 120); e.dueAt = now + MIN_MS;
}

const scopeKey = (kind, v) => (kind === 'search' ? 's:' + String(v || '').toLowerCase().trim().slice(0, 80) : kind === 'cat' ? 'c:' + v : kind === 'brand' ? 'b:' + v : 'deals');
function touch(key) {
  S.scopes.set(key, Date.now());
  for (const [k, t] of S.scopes) if (Date.now() - t > SCOPE_TTL) S.scopes.delete(k);
  while (S.scopes.size > 12) S.scopes.delete(S.scopes.keys().next().value);
}

function due() {
  const now = Date.now();
  return [...S.stores.values()].filter((e) => e.kind === 'live' && e.dueAt <= now);
}

async function cycle(reason) {
  S.cycle++; S.startedAt = Date.now();
  const dueNow = due();
  dueNow.forEach((e) => { e.state = 'checking'; });
  console.log(`[refresh] cycle ${S.cycle} (${reason}): ${dueNow.length} stores due`);
  // The deals feed fetches every store's sale pages, so it IS the per-store check: here it waits up to
  // STORE_HARD_MS per store (instead of a page's 15 s) so every due store ends ok, failed or rate-limited.
  const jobFor = (k) => (k === 'deals' ? () => ctx.computeDeals() : k.startsWith('s:') ? () => ctx.computeSearch(k.slice(2)) : k.startsWith('c:') ? () => ctx.computeBrowse(k.slice(2)) : k.startsWith('b:') ? () => ctx.computeBrand(k.slice(2)) : null);
  // Scopes viewed while the cycle runs are picked up too (deals first, then newest views first).
  const done = new Set(['deals']);
  // Step 1, the store check itself (awaited directly, so a page's shorter deals request can't stand in for it).
  try { const r = await ctx.computeDeals(STORE_HARD_MS); await ctx.cached('deals', 10 * 60 * 1000, 0, async () => r, { force: true }); S.version++; S.scopeVer.set('deals', S.version); } catch (e) { console.log(`[refresh] deals failed: ${e.message}`); }
  const next = () => ['deals', ...[...S.scopes.keys()].reverse()].find((k) => !done.has(k) && jobFor(k));
  for (let k = next(); k && done.size < 16; k = next()) {
    done.add(k);
    const fn = jobFor(k);
    try { await ctx.cached(k, 10 * 60 * 1000, 0, fn, { force: true }); S.version++; S.scopeVer.set(k, S.version); } catch (e) { console.log(`[refresh] ${k} failed: ${e.message}`); }
    await sleep(800); // let page requests in between (0.1 CPU on the free plan)
  }
  // Anything still "checking" didn't answer within the hard limit: it's a failure (shown as "No answer",
  // with its last good check time), due again on the next visit.
  for (const e of S.stores.values()) if (e.state === 'checking') { e.state = 'error'; e.note = `No answer within ${Math.round(STORE_HARD_MS / 1000)} s`; e.dueAt = Date.now() + GAP_MS; }
  S.finishedAt = Date.now();
  // Price alerts piggyback on the cycle: a few due watchlist targets are re-checked right after it.
  if (ctx.afterCycle) { try { await ctx.afterCycle(); } catch (e) { console.log('[refresh] afterCycle failed', e.message); } }
  console.log(`[refresh] cycle ${S.cycle} done in ${Math.round((S.finishedAt - S.startedAt) / 1000)} s`);
}

function run(reason = 'visit') {
  if (S.running) return S.running;
  if (reason !== 'boot' && S.finishedAt && Date.now() - S.finishedAt < GAP_MS) return null;
  if (!due().length) return null;
  S.running = cycle(reason).catch((e) => console.log('[refresh] cycle error', e.message)).finally(() => { S.running = null; });
  return S.running;
}

function status(key) {
  const now = Date.now();
  const stores = [...S.stores.values()].map((e) => {
    let { checkedAt, state } = e;
    if (e.kind === 'catalog') { const s = ctx.stores.find((x) => x.id === e.id); const i = s.index.info(); checkedAt = i.builtAt ? Date.parse(i.builtAt) : null; state = i.status === 'ready' ? 'catalog' : i.status; }
    return { id: e.id, name: e.name, kind: e.kind, state, checkedAt: checkedAt ? new Date(checkedAt).toISOString() : null, snapshotAt: e.snapshotAt || undefined, note: e.note || undefined };
  });
  const live = stores.filter((s) => s.kind === 'live');
  const fresh = live.filter((s) => s.state === 'ok' && now - Date.parse(s.checkedAt) < MIN_MS);
  return {
    running: !!S.running, cycle: S.cycle, startedAt: S.startedAt && new Date(S.startedAt).toISOString(), finishedAt: S.finishedAt && new Date(S.finishedAt).toISOString(),
    lastCycleMs: S.finishedAt && S.startedAt && S.finishedAt >= S.startedAt ? S.finishedAt - S.startedAt : null,
    minIntervalMin: Math.round(MIN_MS / 60000), version: key ? S.scopeVer.get(key) || 0 : S.version,
    counts: { total: stores.length, live: live.length, fresh: fresh.length, checking: live.filter((s) => s.state === 'checking').length, rateLimited: live.filter((s) => s.state === 'rate-limited').length, catalog: stores.length - live.length },
    newest: fresh.length ? new Date(Math.max(...fresh.map((s) => Date.parse(s.checkedAt)))).toISOString() : null,
    stores,
  };
}

// Product page: re-check one product's offers directly when they're older than PRODUCT_MS.
// Shopify stores answer from /products/<handle>.js (robots-checked); other stores are re-searched by title.
async function recheck(offers, title) {
  const now = Date.now();
  const out = [];
  await Promise.all((offers || []).slice(0, 12).map(async (o) => {
    const url = String(o.url || ''); const s = ctx.stores.find((x) => x.id === o.storeId);
    if (!s || !url) return;
    const prev = products.get(url);
    if (prev && now - prev.at < PRODUCT_MS) { out.push({ ...prev.result, cached: true }); return; }
    const res = { url, storeId: s.id };
    try {
      if (s.index) { res.state = 'catalog'; res.checkedAt = s.index.info().builtAt; out.push(res); return; }
      let p = null;
      if (s.product) {
        if (!(await canFetch(url.split('?')[0] + '.js'))) { res.state = 'skipped'; res.note = 'robots.txt'; out.push(res); return; }
        p = await s.product(url);
      } else if (title) {
        const list = await s.search(title);
        if (list.snapshotAt) throw new Error('slow down (snapshot)');
        p = list.find((x) => x.url === url || x.url.split('?')[0] === url.split('?')[0]) || null;
      }
      if (!p) { res.state = 'not-found'; out.push(res); return; }
      Object.assign(res, { state: 'ok', price: p.price, originalPrice: p.originalPrice || null, inStock: p.inStock, checkedAt: new Date().toISOString() });
      ctx.history.attachOffer({ url, price: p.price }); // records the change so arrows reflect it
      products.set(url, { at: Date.now(), result: res });
      if (products.size > 2000) products.delete(products.keys().next().value);
    } catch (e) {
      const msg = String(e.message || e);
      res.state = /429|slow down/i.test(msg) ? 'rate-limited' : 'error';
      res.note = res.state === 'rate-limited' ? 'Store asked us to slow down' : msg.slice(0, 100);
      res.checkedAt = prev ? new Date(prev.at).toISOString() : null;
    }
    out.push(res);
  }));
  return out;
}

module.exports = { init, noteStore, run, status, touch, scopeKey, recheck, MIN_MS, PRODUCT_MS };
