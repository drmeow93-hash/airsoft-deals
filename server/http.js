// Polite HTTP helper: honest User-Agent, timeout, tiny in-memory cache.
const UA = 'AirsoftDealsFinder/1.0 (personal price-comparison app; respects robots.txt)';
const cache = new Map();

async function get(url, { ttlMs = 10 * 60 * 1000, json = false, timeoutMs = 15000 } = {}) {
  const key = (json ? 'j:' : 'h:') + url;
  const hit = cache.get(key);
  if (hit && hit.exp > Date.now()) return hit.val;
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

module.exports = { get, money, UA };
