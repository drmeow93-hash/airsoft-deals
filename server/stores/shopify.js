// Shopify storefronts: public predictive-search JSON for search, /products.json for the sale feed
// and the price-history catalog. Both paths are allowed by these stores' robots.txt.
const { get, money } = require('../http');

// One price per product everywhere (search, deals, history): the cheapest variant, so price
// history never flips between variants.
function fromProduct(base, p) {
  const vs = p.variants || [];
  let min = null;
  for (const v of vs) { const price = money(v.price); if (price && (!min || price < min.price)) min = { price, cmp: money(v.compare_at_price) }; }
  if (!min) return null;
  return {
    title: p.title,
    brand: p.vendor || null,
    price: min.price,
    originalPrice: min.cmp && min.cmp > min.price ? min.cmp : null,
    inStock: vs.some((v) => v.available),
    image: p.images?.[0]?.src || null,
    url: `${base}/products/${p.handle}`,
  };
}

function makeShopifyStore({ id, name, base, location, blurb }) {
  const norm = (p) => {
    const price = money(p.price_min ?? p.price);
    const cmp = money(p.compare_at_price_min ?? p.compare_at_price_max);
    return {
      title: p.title,
      brand: p.vendor || null,
      price,
      originalPrice: cmp && price && cmp > price ? cmp : null,
      inStock: typeof p.available === 'boolean' ? p.available : null,
      image: p.image || p.featured_image?.url || null,
      url: base + (p.url ? p.url.split('?')[0] : `/products/${p.handle}`),
    };
  };

  async function search(q) {
    const u = `${base}/search/suggest.json?q=${encodeURIComponent(q)}&resources[type]=product&resources[limit]=10&resources[options][unavailable_products]=last`;
    const data = await get(u, { json: true });
    return (data?.resources?.results?.products || []).map(norm).filter((p) => p.price);
  }

  // Sale feed: the first catalog pages, products whose cheapest variant is below its compare-at price.
  async function deals() {
    const out = [];
    for (let page = 1; page <= 4; page++) {
      const data = await get(`${base}/products.json?limit=250&page=${page}`, { json: true, ttlMs: 30 * 60 * 1000 });
      const prods = data?.products || [];
      for (const p of prods) { const x = fromProduct(base, p); if (x && x.originalPrice) out.push(x); }
      if (prods.length < 250) break;
    }
    return out;
  }

  // Whole catalog for the price-history collector (GitHub Action), one page every 2 s.
  async function catalog({ fetchJson, maxPages = 40 }) {
    const out = [];
    for (let page = 1; page <= maxPages; page++) {
      const prods = (await fetchJson(`${base}/products.json?limit=250&page=${page}`))?.products || [];
      for (const p of prods) { const x = fromProduct(base, p); if (x) out.push(x); }
      if (prods.length < 250) break;
    }
    return out;
  }

  return { id, name, base, location, blurb, platform: 'Shopify', search, deals, catalog };
}

module.exports = { makeShopifyStore, fromProduct };
