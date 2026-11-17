// Airsoft Extreme (Lightspeed). robots.txt disallows /search/ and /collections/ and sets Crawl-delay: 2.
// Category pages are allowed, and Lightspeed serves them as JSON with ?format=json, so we build a
// background index from the 4 main categories + Clearance Deals at one request every 2+ seconds.
const { createIndex } = require('../indexer');
const base = 'https://www.airsoftextreme.com';
const SHOP_ID = 625090;
const CATEGORIES = ['airsoft-guns', 'accessories', 'tactical-gear', 'upgrade-parts'];

function toItems(json, storeDeal) {
  const c = json.collection || {};
  const list = Array.isArray(c.products) ? c.products : Object.values(c.products || {});
  return list.map((p) => {
    const price = p.price?.price_incl || p.price?.price || null;
    const old = p.price?.price_old_incl || p.price?.price_old || null;
    return {
      title: p.title,
      brand: p.brand?.title || null,
      price,
      originalPrice: old && price && old > price ? old : null,
      inStock: typeof p.available === 'boolean' ? p.available : null,
      image: p.image ? `https://cdn.shoplightspeed.com/shops/${SHOP_ID}/files/${p.image}/300x300x2/image.jpg` : null,
      url: `${base}/${p.url}`,
      storeDeal,
    };
  }).filter((p) => p.price && p.title);
}

async function crawlCategory(cat, fetchPage, add, { deal = false, maxPages = 15 } = {}) {
  for (let page = 1; page <= maxPages; page++) {
    const path = page === 1 ? `/${cat}/` : `/${cat}/page${page}.html`;
    const json = JSON.parse(await fetchPage(`${base}${path}?format=json&limit=100`));
    const items = toItems(json, deal);
    if (deal) add(items, { deal: true });
    else { add(items.filter((p) => !p.originalPrice)); add(items.filter((p) => p.originalPrice), { deal: true }); }
    if (!json.collection?.page_next || !items.length) break;
  }
}

const index = createIndex({
  workerModule: __filename,
  name: 'Airsoft Extreme',
  delayMs: 2500,
  refreshMs: 6 * 60 * 60 * 1000,
  crawl: async ({ fetchPage, add }) => {
    await crawlCategory('clearance-deals', fetchPage, add, { deal: true, maxPages: 5 });
    for (const cat of CATEGORIES) await crawlCategory(cat, fetchPage, add);
  },
});

module.exports = {
  id: 'airsoftextreme', name: 'Airsoft Extreme', base, location: 'California, USA',
  blurb: 'Bay Area retailer, Lightspeed storefront (indexed every 6h at its 2s crawl delay)',
  platform: 'Lightspeed', mode: 'index', index, search: index.search, deals: index.deals,
};
