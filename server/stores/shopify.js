// Shopify storefronts: public predictive-search JSON for search, /products.json for the sale feed.
// Both paths are allowed by these stores' robots.txt.
const { get, money } = require('../http');

function makeShopifyStore({ id, name, base, location, blurb }) {
  const norm = (p) => {
    const price = money(p.price_min ?? p.price);
    const cmp = money(p.compare_at_price_max ?? p.compare_at_price_min);
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
    return (data?.resources?.results?.products || []).map(norm);
  }

  // Sale feed: scan the first few catalog pages and keep variants whose compare_at_price > price.
  async function deals() {
    const out = [];
    for (let page = 1; page <= 4; page++) {
      const data = await get(`${base}/products.json?limit=250&page=${page}`, { json: true, ttlMs: 30 * 60 * 1000 });
      const prods = data?.products || [];
      for (const p of prods) {
        let best = null;
        for (const v of p.variants || []) {
          const price = money(v.price), cmp = money(v.compare_at_price);
          if (price && cmp && cmp > price) {
            const pct = (cmp - price) / cmp;
            if (!best || pct > best.pct) best = { price, cmp, pct, available: v.available };
          }
        }
        if (best) {
          out.push({
            title: p.title,
            brand: p.vendor || null,
            price: best.price,
            originalPrice: best.cmp,
            inStock: (p.variants || []).some((v) => v.available),
            image: p.images?.[0]?.src || null,
            url: `${base}/products/${p.handle}`,
          });
        }
      }
      if (prods.length < 250) break;
    }
    return out;
  }

  return { id, name, base, location, blurb, platform: 'Shopify', search, deals };
}

module.exports = { makeShopifyStore };
