// Airsoft Megastore (OpenCart). product/search and /Mega-Deals are allowed by robots.txt.
const cheerio = require('cheerio');
const { get, money } = require('../http');
const base = 'https://www.airsoftmegastore.com';

function parse(html, { storeDeal = false } = {}) {
  const $ = cheerio.load(html);
  const out = [];
  $('a.category-product-grid-prodname').each((_, el) => {
    const a = $(el);
    const box = a.closest('.box').length ? a.closest('.box') : a.closest('.product-thumb');
    const priceEl = box.find('.price').first();
    const old = money(priceEl.find('span').first().text());
    const priceText = priceEl.clone().children().remove().end().text();
    const price = money(priceText) || money(priceEl.text());
    const text = box.text();
    out.push({
      title: a.text().trim(),
      brand: null,
      price,
      originalPrice: old && price && old > price ? old : null,
      inStock: /sold out|out of stock/i.test(text) ? false : null,
      image: box.find('img').first().attr('src') || null,
      url: (a.attr('href') || '').replace(/&(search|limit|iid)=[^&]*/g, ''),
      storeDeal,
    });
  });
  return out.filter((p) => p.price && p.title);
}

module.exports = {
  id: 'megastore',
  name: 'Airsoft Megastore',
  base,
  location: 'California, USA',
  blurb: 'Long-running US retailer, OpenCart storefront',
  platform: 'OpenCart',
  search: async (q) => parse(await get(`${base}/index.php?route=product/search&search=${encodeURIComponent(q)}&limit=40`)).slice(0, 24),
  deals: async () => parse(await get(`${base}/Mega-Deals`, { ttlMs: 30 * 60 * 1000 }), { storeDeal: true }),
};
