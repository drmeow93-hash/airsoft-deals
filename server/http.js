// Polite HTTP helper: honest User-Agent, timeout, tiny in-memory cache.
const UA = 'AirsoftDealsFinder/1.0 (personal price-comparison app; respects robots.txt)';
const cache = new Map();
const inflight = new Map(); // identical concurrent requests share one fetch

async function get(url, { ttlMs = 10 * 60 * 1000, json = false, timeoutMs = 15000 } = {}) {
  const key = (json ? 'j:' : 'h:') + url;
  const hit = cache.get(key);
  if (hit && hit.exp > Date.now()) return hit.val;
  if (inflight.has(key)) return inflight.get(key);
  const p = fetchOnce(url, key, { ttlMs, json, timeoutMs });
  inflight.set(key, p);
  try { return await p; } finally { inflight.delete(key); }
}

async function fetchOnce(url, key, { ttlMs, json, timeoutMs }) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': UA, Accept: json ? 'application/json' : 'text/html,application/xhtml+xml' },
      signal: ctrl.signal,
      redirect: 'follow',
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${new URL(url).host}`);
    const val = json ? await res.json() : await res.text();
    cache.set(key, { val, exp: Date.now() + ttlMs });
    if (cache.size > 500) cache.delete(cache.keys().next().value);
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
function thumb(url, w = 500) {
  if (!url) return url;
  try {
    const u = new URL(url);
    if (u.hostname === 'cdn.shopify.com' || u.pathname.includes('/cdn/shop/')) { u.searchParams.set('width', String(w)); return u.toString(); }
    if (/bigcommerce\.com$/.test(u.hostname)) return url.replace(/\/stencil\/\d+x\d+\//, `/stencil/${w}x${w}/`);
  } catch { /* not a URL */ }
  return url;
}

module.exports = { get, money, thumb, UA };
