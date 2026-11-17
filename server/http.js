// Polite HTTP helper: honest User-Agent, timeout, tiny in-memory cache.
const UA = 'AirsoftDealsFinder/1.0 (personal price-comparison app; respects robots.txt)';
const { isVetted } = require('./vetting');
const cache = new Map();
const inflight = new Map(); // identical concurrent requests share one fetch

async function get(url, { ttlMs = 10 * 60 * 1000, json = false, timeoutMs = 15000 } = {}) {
  // Allowlist: only domains that passed the legitimacy vetting (data/vetting.json) are ever fetched.
  if (!isVetted(url)) throw new Error(`Blocked: ${(() => { try { return new URL(url).hostname; } catch { return url; } })()} is not a vetted domain`);
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

module.exports = { get, money, thumb, sliceHtml, UA };
