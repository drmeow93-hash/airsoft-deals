// Wolverine Airsoft (WooCommerce, HPA manufacturer selling direct). Their HTML pages sit behind a
// Cloudflare check for scripts, which we do NOT try to pass. The public WooCommerce Store API
// (/wp-json/wc/store/v1/products) answers normally and is not disallowed by robots.txt.
const { get } = require('../http');
const base = 'https://www.wolverineairsoft.com';

const cents = (v, unit = 2) => (v == null || v === '' ? null : Number(v) / 10 ** unit);
function norm(p, storeDeal = false) {
  const unit = p.prices?.currency_minor_unit ?? 2;
  const price = cents(p.prices?.price, unit);
  const reg = cents(p.prices?.regular_price, unit);
  return {
    title: p.name.replace(/&#8211;/g, '–').replace(/&amp;/g, '&').replace(/&#8217;/g, '’'),
    brand: 'Wolverine Airsoft',
    cats: (p.categories || []).map((c) => c.name).slice(0, 8),
    price,
    originalPrice: reg && price && reg > price ? reg : null,
    inStock: typeof p.is_in_stock === 'boolean' ? p.is_in_stock : null,
    image: (p.images?.[0]?.srcset || '').match(/(\S+) 416w/)?.[1] || p.images?.[0]?.thumbnail || p.images?.[0]?.src || null,
    url: p.permalink,
    storeDeal,
  };
}

module.exports = {
  id: 'wolverine', name: 'Wolverine Airsoft', base, location: 'Pennsylvania, USA',
  blurb: 'HPA engine manufacturer, direct store (WooCommerce Store API)',
  platform: 'WooCommerce', mode: 'live', airsoftOnly: true, // HPA airsoft maker: everything it sells is airsoft
  search: async (q) => (await get(`${base}/wp-json/wc/store/v1/products?search=${encodeURIComponent(q)}&per_page=20`, { json: true })).map((p) => norm(p)).filter((p) => p.price),
  // Whole catalog for the price-history collector.
  catalog: async ({ fetchJson }) => {
    const out = [];
    for (let page = 1; page <= 20; page++) {
      const list = await fetchJson(`${base}/wp-json/wc/store/v1/products?per_page=100&page=${page}`);
      out.push(...list.map((p) => norm(p)).filter((p) => p.price));
      if (list.length < 100) break;
    }
    return out;
  },
  deals: async () => (await get(`${base}/wp-json/wc/store/v1/products?on_sale=true&per_page=100`, { json: true })).map((p) => norm(p, true)).filter((p) => p.price),
};
