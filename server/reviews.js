// Real customer reviews for the score panel, read from the product pages of vetted stores.
//
// Only what the store itself publishes in the page HTML is used:
//   - Judge.me review widgets (server-rendered on Fox Airsoft, Airsoft N More, eHobbyAsia, Airsoft Atlanta,
//     WGC Shop, Brill Armory, Extreme Airsoft RI), checked to be for this exact product (data-product-url);
//   - schema.org JSON-LD on the page (Product.aggregateRating and Review items), e.g. Airsoft GI.
// Every page fetch goes through http.get (vetted domains only, honest User-Agent, 429 backoff) after a
// robots.txt check. Nothing is invented: if a page has no reviews we say so. Results are kept 24 h.
const { get } = require('./http');
const { canFetch } = require('./robots');

// Stores whose product pages carry reviews (surveyed Nov 2026). Others have no review data in the page,
// so we don't fetch them (fewer requests to stores).
const REVIEW_STORES = new Set(['foxairsoft', 'airsoftnmore', 'ehobbyasia', 'airsoftatlanta', 'wgc', 'brill', 'extremeri', 'airsoftgi']);
const TTL = 24 * 3600e3, MISS_TTL = 6 * 3600e3;
const cache = new Map(); // url -> { at, r }
const inflight = new Map();

const decode = (s) => String(s || '').replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, ' ')
  .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&#x27;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ')
  .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n)).replace(/\s+/g, ' ').trim();
const clip = (s, n = 240) => (s.length > n ? s.slice(0, n - 1).replace(/\s+\S*$/, '') + '…' : s);
const attr = (tag, name) => { const m = tag.match(new RegExp(`${name}=['"]([^'"]*)['"]`)); return m ? m[1] : null; };

// Judge.me: the widget's own summary plus up to 5 reviews, only when the widget is for this product.
function parseJudgeMe(html, path) {
  const i = html.indexOf("class='jdgm-rev-widg'") >= 0 ? html.indexOf("class='jdgm-rev-widg'") : html.indexOf('class="jdgm-rev-widg"');
  if (i < 0) return null;
  const tagStart = html.lastIndexOf('<', i), tag = html.slice(tagStart, html.indexOf('>', i) + 1);
  const avg = +attr(tag, 'data-average-rating'), count = +attr(tag, 'data-number-of-reviews');
  if (!(count > 0) || !(avg > 0)) return null;
  const region = html.slice(i, i + 120000);
  const reviews = [];
  const parts = region.split(/<div class=['"]jdgm-rev jdgm-divider-top['"]/).slice(1);
  for (const p of parts) {
    const head = p.slice(0, p.indexOf('>'));
    const purl = attr(head, 'data-product-url');
    if (path && purl && purl.replace(/\/$/, '') !== path.replace(/\/$/, '')) continue; // a store-wide review, not this product
    const score = +((p.match(/data-score=['"](\d)['"]/) || [])[1] || 0);
    const date = (p.match(/datetime=['"](\d{4}-\d{2}-\d{2})/) || [])[1] || null;
    const author = decode((p.match(/class=['"]jdgm-rev__author['"]>([\s\S]*?)<\/span>/) || [])[1]);
    const title = decode((p.match(/class=['"]jdgm-rev__title['"]>([\s\S]*?)<\/b>/) || [])[1]);
    const body = decode((p.match(/class=['"]jdgm-rev__body['"]>([\s\S]*?)<\/div>/) || [])[1]);
    const verified = /data-verified-buyer=['"]true['"]/.test(head);
    if (score && (body || title)) reviews.push({ rating: score, title: clip(title, 90), text: clip(body), author: clip(author, 30) || null, date, verified });
    if (reviews.length >= 5) break;
  }
  return { avg: Math.round(avg * 10) / 10, count, reviews, via: 'Judge.me reviews on the store page' };
}

// schema.org JSON-LD: Product.aggregateRating and Review items.
function parseJsonLd(html) {
  let agg = null; const reviews = [];
  const re = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html))) {
    let j; try { j = JSON.parse(m[1].trim()); } catch { continue; }
    const walk = (o, depth = 0) => {
      if (!o || typeof o !== 'object' || depth > 6) return;
      if (Array.isArray(o)) { o.forEach((x) => walk(x, depth + 1)); return; }
      const t = [].concat(o['@type'] || []);
      if (t.includes('AggregateRating') && !agg) {
        const avg = +o.ratingValue, count = +(o.reviewCount || o.ratingCount), best = +(o.bestRating || 5);
        if (avg > 0 && count > 0 && best > 0) agg = { avg: Math.round((avg * 5 / best) * 10) / 10, count };
      }
      if (t.includes('Review') && reviews.length < 5) {
        const r = o.reviewRating || {}; const best = +(r.bestRating || 5);
        const rating = r.ratingValue ? Math.round(+r.ratingValue * 5 / best) : null;
        const text = clip(decode(String(o.reviewBody || o.description || '').replace(/^\s*Product Information:\s*/i, '')).replace(/\s*Pros:\s*(None)?\s*Cons:\s*(None)?\s*$/i, ''));
        const author = typeof o.author === 'string' ? o.author : o.author?.name;
        if (text) reviews.push({ rating, title: clip(decode(o.name || ''), 90), text, author: clip(decode(author || ''), 30) || null, date: String(o.datePublished || '').slice(0, 10) || null, verified: false });
      }
      for (const k of Object.keys(o)) if (o[k] && typeof o[k] === 'object') walk(o[k], depth + 1);
    };
    walk(j);
  }
  if (!agg && !reviews.length) return null;
  if (!agg) return null; // individual reviews without a store-published rating summary aren't shown on their own
  return { ...agg, reviews, via: 'Ratings published on the store page (schema.org)' };
}

function parse(html, url) {
  const path = (() => { try { return new URL(url).pathname; } catch { return null; } })();
  return parseJudgeMe(html, path) || parseJsonLd(html);
}

// One offer -> { storeId, store, url, avg, count, reviews[], via, checkedAt } | { none: true } | { skipped }
async function forOffer(o) {
  if (!o || !REVIEW_STORES.has(o.storeId) || !o.url) return null;
  const url = String(o.url).split('#')[0];
  const hit = cache.get(url);
  if (hit && Date.now() - hit.at < (hit.r.none ? MISS_TTL : TTL)) return hit.r;
  if (inflight.has(url)) return inflight.get(url);
  const run = (async () => {
    const base = { storeId: o.storeId, store: o.store, url };
    if (!(await canFetch(url))) return { ...base, skipped: 'robots.txt' };
    let r;
    try {
      const html = await get(url, { store: false, timeoutMs: 10000, pool: /myshopify|\/products\//.test(url) ? 'shopify' : null });
      const p = parse(html, url);
      r = p ? { ...base, ...p, checkedAt: new Date().toISOString() } : { ...base, none: true, checkedAt: new Date().toISOString() };
    } catch (e) { return { ...base, skipped: /429|slow down/i.test(e.message) ? 'store asked us to slow down' : 'page unavailable' }; }
    cache.set(url, { at: Date.now(), r });
    if (cache.size > 3000) cache.delete(cache.keys().next().value);
    return r;
  })().finally(() => inflight.delete(url));
  inflight.set(url, run);
  return run;
}

// All offers of one product (at most 4 review pages per product). Combined rating weights each store by its count.
async function forOffers(offers) {
  const list = (offers || []).filter((o) => REVIEW_STORES.has(o.storeId)).slice(0, 4);
  const res = (await Promise.all(list.map((o) => forOffer(o).catch(() => null)))).filter(Boolean);
  return summarize(res);
}
function summarize(res) {
  const sources = res.filter((r) => r.count > 0);
  const count = sources.reduce((s, r) => s + r.count, 0);
  const avg = count ? Math.round((sources.reduce((s, r) => s + r.avg * r.count, 0) / count) * 10) / 10 : null;
  return { avg, count, sources, checked: res.map((r) => ({ store: r.store, url: r.url, state: r.count > 0 ? 'reviews' : r.none ? 'none' : 'skipped', note: r.skipped || null })) };
}
// Cached only (no fetch): used for score badges on cards.
function cachedFor(offers) {
  const res = [];
  for (const o of offers || []) { const h = o && cache.get(String(o.url || '').split('#')[0]); if (h && h.r.count > 0) res.push(h.r); }
  return res.length ? summarize(res) : null;
}

module.exports = { forOffers, forOffer, cachedFor, parse, parseJudgeMe, parseJsonLd, REVIEW_STORES };
