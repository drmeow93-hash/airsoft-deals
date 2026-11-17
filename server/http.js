// Polite HTTP helper: honest User-Agent, timeout, tiny in-memory cache.
const UA = 'AirsoftDealsFinder/1.0 (personal price-comparison app; respects robots.txt)';
const { isVetted } = require('./vetting');
const cache = new Map();
const inflight = new Map(); // identical concurrent requests share one fetch

// Politeness: a host that answers 429 (rate limited) is left alone until its Retry-After passes
// (default 60 s, doubling up to 15 min if it keeps happening). Meanwhile the last good copy is served
// if we have one. Requests in a pool (all Shopify storefronts share one) run a few at a time, not in bursts.
const backoff = new Map(); // host -> { until, ms }
const pools = { shopify: { max: 4, active: 0, q: [] } };
const acquire = (name) => { const p = pools[name]; if (!p) return Promise.resolve(); if (p.active < p.max) { p.active++; return Promise.resolve(); } return new Promise((r) => p.q.push(r)); };
const release = (name) => { const p = pools[name]; if (!p) return; const next = p.q.shift(); if (next) next(); else p.active--; };

// Memory budget for cached responses (the free instance has a ~256 MB JS heap): sized by response length,
// oldest entries evicted first. Big catalog pages can opt out with { store: false }.
const BUDGET = 40 * 1024 * 1024;
let cacheBytes = 0;
function remember(key, val, size, ttlMs) {
  const old = cache.get(key); if (old) { cacheBytes -= old.size; cache.delete(key); }
  cache.set(key, { val, exp: Date.now() + ttlMs, size });
  cacheBytes += size;
  for (const [k, e] of cache) { if (cacheBytes <= BUDGET && cache.size <= 600) break; cache.delete(k); cacheBytes -= e.size; }
}

async function get(url, { ttlMs = 10 * 60 * 1000, json = false, timeoutMs = 15000, pool = null, store = true } = {}) {
  // Allowlist: only domains that passed the legitimacy vetting (data/vetting.json) are ever fetched.
  if (!isVetted(url)) throw new Error(`Blocked: ${(() => { try { return new URL(url).hostname; } catch { return url; } })()} is not a vetted domain`);
  const key = (json ? 'j:' : 'h:') + url;
  const hit = cache.get(key);
  if (hit && hit.exp > Date.now()) return hit.val;
  const host = new URL(url).host;
  const b = backoff.get(host);
  if (b && b.until > Date.now()) {
    if (hit) return hit.val; // stale but honest: last copy we were allowed to fetch
    throw new Error(`${host} asked us to slow down (HTTP 429); waiting ${Math.ceil((b.until - Date.now()) / 1000)} s`);
  }
  if (inflight.has(key)) return inflight.get(key);
  const p = (async () => {
    await acquire(pool);
    try { return await fetchOnce(url, key, { ttlMs, json, timeoutMs, store }); } finally { release(pool); }
  })();
  inflight.set(key, p);
  try { return await p; } catch (e) { if (hit && /HTTP (429|5\d\d)|abort/i.test(e.message)) return hit.val; throw e; } finally { inflight.delete(key); }
}

async function fetchOnce(url, key, { ttlMs, json, timeoutMs, store }) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': UA, Accept: json ? 'application/json' : 'text/html,application/xhtml+xml' },
      signal: ctrl.signal,
      redirect: 'follow',
    });
    const host = new URL(url).host;
    if (res.status === 429) {
      const ra = parseInt(res.headers.get('retry-after'), 10);
      const prev = backoff.get(host);
      const ms = Math.min(15 * 60 * 1000, Number.isFinite(ra) && ra > 0 ? ra * 1000 : prev && prev.until > Date.now() - 10 * 60 * 1000 ? prev.ms * 2 : 60 * 1000);
      backoff.set(host, { until: Date.now() + ms, ms });
    }
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${host}`);
    backoff.delete(host);
    const text = await res.text();
    const val = json ? JSON.parse(text) : text;
    if (store) remember(key, val, text.length * (json ? 2 : 1) + 200, ttlMs); // parsed JSON costs about twice its text
    return val;
  } finally {
    clearTimeout(t);
  }
}

const money = (s) => {
  if (s == null) return null;
  const m = String(s).replace(/,/g, '').match(/\d+(\.\d+)?/);
  const n = m ? parseFloat(m[0]) : NaN;
  return Number.isFinite(n) && n > 0 ? n : null;
};

// Ask store CDNs for a card-sized image instead of the full-size original (much smaller downloads).
function thumb(url, w = 400) {
  if (!url) return url;
  try {
    const u = new URL(url);
    if (u.hostname === 'cdn.shopify.com' || u.pathname.includes('/cdn/shop/')) { u.searchParams.set('width', String(w)); return u.toString(); }
    if (/bigcommerce\.com$/.test(u.hostname)) return url.replace(/\/stencil\/\d+x\d+\//, `/stencil/${w}x${w}/`);
  } catch { /* not a URL */ }
  return url;
}

// Cut a page down to its product-list region before parsing. Parsing a whole store page costs
// 50-150 ms of CPU, which is over a second on a free 0.1-CPU instance; the list region alone is far cheaper.
// Falls back to the whole page if the markers aren't found.
function sliceHtml(html, { marker, startTag, endTag, tail = 0 }) {
  const first = html.indexOf(marker), last = html.lastIndexOf(marker);
  if (first < 0) return html;
  const start = startTag ? html.lastIndexOf(startTag, first) : first;
  let end = endTag ? html.indexOf(endTag, last) : -1;
  end = end < 0 ? Math.min(html.length, last + (tail || 8000)) : end + endTag.length + tail;
  return start < 0 ? html : html.slice(start, end);
}

const backoffStatus = () => Object.fromEntries([...backoff].filter(([, b]) => b.until > Date.now()).map(([h, b]) => [h, Math.ceil((b.until - Date.now()) / 1000)]));

module.exports = { get, backoffStatus, money, thumb, sliceHtml, UA };
