// Optional affiliate/merchant product-feed adapter. Disabled unless configured with env vars, e.g.
//   FEED_STORES="evike:Evike.com"                     (comma-separated id:Display Name pairs)
//   FEED_EVIKE_URL="https://.../feed.csv?key=..."     (CSV, TSV, or JSON; .gz is fine)
//   FEED_EVIKE_MAP='{"title":"Product Name","price":"Sale Price","originalPrice":"Retail Price","url":"Buy Link","image":"Image URL","brand":"Brand Name","inStock":"In Stock"}'  (optional)
// The feed is downloaded every FEED_REFRESH_HOURS (default 6) and searched in memory.
const zlib = require('zlib');
const { createIndex } = require('../indexer');
const { money, UA } = require('../http');

const GUESS = {
  title: ['product name', 'name', 'title', 'product_name'],
  price: ['sale price', 'sale_price', 'price', 'current price', 'search_price'],
  originalPrice: ['retail price', 'retail_price', 'regular price', 'regular_price', 'list price', 'msrp', 'compare_at_price', 'rrp_price'],
  url: ['buy link', 'buy_link', 'affiliate url', 'aw_deep_link', 'link', 'url', 'product url', 'product_url', 'deeplink'],
  image: ['image url', 'image_url', 'image', 'imageurl', 'merchant_image_url', 'large image', 'thumbnail'],
  brand: ['brand name', 'brand', 'manufacturer', 'brand_name'],
  inStock: ['in stock', 'in_stock', 'availability', 'stock', 'stock_status'],
};

function parseDelimited(text) {
  const delim = (text.split('\n')[0].match(/\t/g) || []).length > (text.split('\n')[0].match(/,/g) || []).length ? '\t' : text.split('\n')[0].includes('|') && !text.split('\n')[0].includes(',') ? '|' : ',';
  const rows = []; let row = [], f = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
    else if (c === '"') q = true;
    else if (c === delim) { row.push(f); f = ''; }
    else if (c === '\n') { row.push(f.replace(/\r$/, '')); rows.push(row); row = []; f = ''; }
    else f += c;
  }
  if (f || row.length) { row.push(f); rows.push(row); }
  const head = rows.shift().map((h) => h.trim());
  return rows.filter((r) => r.length > 1).map((r) => Object.fromEntries(head.map((h, i) => [h, r[i]])));
}

function makeFeedStore(id, name) {
  const key = id.toUpperCase().replace(/[^A-Z0-9]/g, '_');
  const url = process.env[`FEED_${key}_URL`];
  if (!url) return null;
  const map = process.env[`FEED_${key}_MAP`] ? JSON.parse(process.env[`FEED_${key}_MAP`]) : {};
  const pick = (row, field) => {
    if (map[field]) return row[map[field]];
    const keys = Object.keys(row);
    for (const g of GUESS[field]) { const k = keys.find((x) => x.toLowerCase() === g); if (k) return row[k]; }
    return undefined;
  };
  const index = createIndex({
    name,
    delayMs: 0,
    refreshMs: (Number(process.env.FEED_REFRESH_HOURS) || 6) * 3600 * 1000,
    crawl: async ({ add }) => {
      const res = await fetch(url, { headers: { 'User-Agent': UA } });
      if (!res.ok) throw new Error(`Feed HTTP ${res.status}`);
      let buf = Buffer.from(await res.arrayBuffer());
      if (buf[0] === 0x1f && buf[1] === 0x8b) buf = zlib.gunzipSync(buf);
      const text = buf.toString('utf8');
      const rows = /^\s*[[{]/.test(text) ? [].concat(JSON.parse(text).products || JSON.parse(text)) : parseDelimited(text);
      const items = rows.map((r) => {
        const price = money(pick(r, 'price'));
        const orig = money(pick(r, 'originalPrice'));
        const stock = String(pick(r, 'inStock') ?? '').toLowerCase();
        return {
          title: pick(r, 'title'), brand: pick(r, 'brand') || null, price,
          originalPrice: orig && price && orig > price ? orig : null,
          inStock: /^(1|y|yes|true|in stock|instock|in_stock)$/.test(stock) ? true : /^(0|n|no|false|out of stock|outofstock|out_of_stock)$/.test(stock) ? false : null,
          image: pick(r, 'image') || null, url: pick(r, 'url'),
        };
      }).filter((p) => p.title && p.price && p.url);
      add(items.filter((p) => !p.originalPrice));
      add(items.filter((p) => p.originalPrice), { deal: true });
    },
  });
  return { id, name, base: new URL(url).origin, location: 'Affiliate feed', blurb: 'Loaded from the official affiliate product feed', platform: 'Feed', mode: 'index', index, search: index.search, deals: index.deals };
}

function feedStores() {
  return (process.env.FEED_STORES || '').split(',').map((s) => s.trim()).filter(Boolean)
    .map((s) => { const [id, ...n] = s.split(':'); return makeFeedStore(id.trim(), (n.join(':') || id).trim()); })
    .filter(Boolean);
}

module.exports = { feedStores, parseDelimited };
