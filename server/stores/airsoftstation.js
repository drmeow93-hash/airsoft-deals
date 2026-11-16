// Airsoft Station (BigCommerce). /search.php and /deals/ are not disallowed in robots.txt.
const cheerio = require('cheerio');
const { get, money } = require('../http');
const base = 'https://airsoftstation.com';

function parse(html, { storeDeal = false } = {}) {
  const $ = cheerio.load(html);
  const out = [];
  $('article.card').each((_, el) => {
    const c = $(el);
    const a = c.find('.card-title a').first();
    const title = a.text().trim();
    if (!title) return;
    const price = money(c.find('[data-product-price-without-tax]').first().text()) || money(c.find('[data-product-price-with-tax]').first().text());
    const was = money(c.find('[data-product-non-sale-price-without-tax]').first().text()) || money(c.find('[data-product-rrp-price-without-tax]').first().text());
    const btn = c.find('.card-figcaption-button').first().text().trim().toLowerCase();
    let inStock = null;
    if (/add to cart|choose options/.test(btn)) inStock = true;
    else if (/out of stock|sold out/.test(btn)) inStock = false;
    const img = c.find('img.card-image').first();
    out.push({
      title,
      brand: c.find('[data-test-info-type="brandName"]').first().text().trim() || null,
      price,
      originalPrice: was && price && was > price ? was : null,
      inStock,
      image: img.attr('data-src') || img.attr('src') || null,
      url: (a.attr('href') || '').split('?')[0],
      storeDeal,
    });
  });
  return out.filter((p) => p.price);
}

module.exports = {
  id: 'airsoftstation',
  name: 'Airsoft Station',
  base,
  location: 'Kentucky, USA',
  blurb: 'Large US retailer, BigCommerce storefront',
  platform: 'BigCommerce',
  search: async (q) => parse(await get(`${base}/search.php?search_query=${encodeURIComponent(q)}`)).slice(0, 24),
  deals: async () => parse(await get(`${base}/deals/`, { ttlMs: 30 * 60 * 1000 }), { storeDeal: true }),
};
