// Shopify storefronts: public predictive-search JSON for search, /products.json for the sale feed
// and the price-history catalog. Both paths are allowed by these stores' robots.txt.
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { get, money } = require('../http');

// Fallback catalog written by the price-history collector (scripts/collect-history.js) from the same
// public /products.json route. Searched locally only when the live search fails, for example while
// Shopify rate-limits our server (HTTP 429). Results say which snapshot date they came from.
const snorm = (s) => String(s).toLowerCase().replace(/[^a-z0-9.]+/g, ' ').trim();
function loadSnapshot(id) {
  try {
    const snap = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(__dirname, '..', 'snapshot', `shopify-${id}.json.gz`))));
    for (const p of snap.items) { p._n = snorm(`${p.brand || ''} ${p.title}`); }
    return snap;
  } catch { return null; }
}
function searchSnapshot(snap, q, limit = 24) {
  const terms = snorm(q).split(' ').filter(Boolean);
  if (!terms.length) return [];
  const hits = [];
  for (const p of snap.items) {
    let score = 0, ok = true;
    for (const t of terms) { if (!p._n.includes(t)) { ok = false; break; } score += p._n.includes(` ${t} `) || p._n.startsWith(t + ' ') ? 2 : 1; }
    if (ok) hits.push([score - p._n.length / 500, p]);
  }
  return hits.sort((a, b) => b[0] - a[0]).slice(0, limit).map(([, { _n, ...p }]) => p);
}

// One price per product everywhere (search, deals, history): the cheapest variant, so price
// history never flips between variants.
function fromProduct(base, p, fx = null) {
  const vs = p.variants || [];
  let min = null;
  for (const v of vs) { const price = money(v.price); if (price && (!min || price < min.price)) min = { price, cmp: money(v.compare_at_price) }; }
  if (!min) return null;
  const cv = (v) => (v && fx ? Math.round((v / fx.rate) * 100) / 100 : v);
  return {
    title: p.title,
    brand: p.vendor || null,
    ptype: p.product_type || undefined,
    tags: Array.isArray(p.tags) ? p.tags.slice(0, 30) : typeof p.tags === 'string' ? p.tags.split(/,\s*/).slice(0, 30) : undefined,
    price: cv(min.price),
    originalPrice: min.cmp && min.cmp > min.price ? cv(min.cmp) : null,
    fx: fx ? { cur: fx.cur, price: min.price } : undefined,
    inStock: vs.some((v) => v.available),
    image: p.images?.[0]?.src || null,
    url: `${base}/products/${p.handle}`,
  };
}

// fx: { cur: 'HKD', rate: 7.8 } for stores that only price in another currency (shown converted to USD).
function makeShopifyStore({ id, name, base, location, blurb, fx = null, airsoftOnly = false }) {
  const cv = (v) => (v && fx ? Math.round((v / fx.rate) * 100) / 100 : v);
  const norm = (p) => {
    const raw = money(p.price_min ?? p.price);
    const price = cv(raw);
    const cmp = cv(money(p.compare_at_price_min ?? p.compare_at_price_max));
    return {
      title: p.title,
      brand: p.vendor || null,
      ptype: p.type || undefined,
      tags: Array.isArray(p.tags) ? p.tags.slice(0, 30) : undefined,
      price,
      originalPrice: cmp && price && cmp > price ? cmp : null,
      fx: fx ? { cur: fx.cur, price: raw } : undefined,
      inStock: typeof p.available === 'boolean' ? p.available : null,
      image: p.image || p.featured_image?.url || null,
      url: base + (p.url ? p.url.split('?')[0] : `/products/${p.handle}`),
    };
  };

  let snap; // loaded on first need
  const snapshot = () => (snap === undefined ? (snap = loadSnapshot(id)) : snap);
  const withFallback = (live, local) => async (...a) => {
    try { return await live(...a); } catch (e) {
      const sn = snapshot();
      if (!sn) throw e;
      const out = local(sn, ...a);
      out.snapshotAt = sn.builtAt;
      out.liveError = String(e.message || e);
      return out;
    }
  };

  async function search(q) {
    const u = `${base}/search/suggest.json?q=${encodeURIComponent(q)}&resources[type]=product&resources[limit]=10&resources[options][unavailable_products]=last`;
    const data = await get(u, { json: true, pool: 'shopify' });
    return (data?.resources?.results?.products || []).map(norm).filter((p) => p.price);
  }

  // Sale feed: the first catalog pages, products whose cheapest variant is below its compare-at price.
  async function deals() {
    const out = [];
    for (let page = 1; page <= 4; page++) {
      const data = await get(`${base}/products.json?limit=250&page=${page}`, { json: true, ttlMs: 30 * 60 * 1000, pool: 'shopify' });
      const prods = data?.products || [];
      for (const p of prods) { const x = fromProduct(base, p, fx); if (x && x.originalPrice) out.push(x); }
      if (prods.length < 250) break;
    }
    return out;
  }

  // Whole catalog for the price-history collector (GitHub Action), one page every 2 s.
  async function catalog({ fetchJson, maxPages = 40 }) {
    const out = [];
    for (let page = 1; page <= maxPages; page++) {
      const prods = (await fetchJson(`${base}/products.json?limit=250&page=${page}`))?.products || [];
      for (const p of prods) { const x = fromProduct(base, p, fx); if (x) out.push(x); }
      if (prods.length < 250) break;
    }
    return out;
  }

  return {
    id, name, base, location, blurb, platform: 'Shopify', currency: fx?.cur, airsoftOnly, catalog,
    search: withFallback(search, (sn, q) => searchSnapshot(sn, q)),
    deals: withFallback(deals, (sn) => sn.items.filter((p) => p.originalPrice).map(({ _n, ...p }) => p)),
    snapshotInfo: () => { const sn = snapshot(); return sn ? { builtAt: sn.builtAt, products: sn.items.length } : null; },
  };
}

module.exports = { makeShopifyStore, fromProduct };
