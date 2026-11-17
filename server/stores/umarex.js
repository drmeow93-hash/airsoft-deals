// Umarex USA (Elite Force's parent company; nopCommerce storefront). Its /search page is plain
// HTML and allowed by robots.txt, with no bot challenge. Umarex also sells pellet and steel-BB
// airguns; the airsoft-only filter drops those (only 6mm airsoft items are kept).
const cheerio = require('cheerio');
const { get, money, sliceHtml } = require('../http');
const base = 'https://www.umarexusa.com';

function parse(html) {
  const $ = cheerio.load(sliceHtml(html, { marker: 'class="product-item"', startTag: '<div', tail: 3000 }));
  const out = [];
  $('.product-item').each((_, el) => {
    const box = $(el);
    const a = box.find('.product-title a').first();
    const title = a.text().replace(/\s+/g, ' ').trim();
    const price = money(box.find('.actual-price').first().text());
    const old = money(box.find('.old-price').first().text());
    if (!title || !price) return;
    const href = a.attr('href') || '';
    out.push({
      title, brand: 'Elite Force', price, // Umarex USA's airsoft line is sold under the Elite Force name
      originalPrice: old && old > price ? old : null,
      inStock: /out of stock/i.test(box.text()) ? false : null,
      image: box.find('img.picture-img').attr('src') || null,
      url: href.startsWith('http') ? href : base + href,
    });
  });
  return out;
}

module.exports = {
  id: 'umarex', name: 'Umarex USA (Elite Force)', base, location: 'Fort Smith, Arkansas, USA',
  blurb: 'Elite Force / Umarex airsoft, direct from the brand (nopCommerce search page)',
  platform: 'nopCommerce',
  search: async (q) => parse(await get(`${base}/search?q=${encodeURIComponent(q)}`)).slice(0, 30),
  deals: async () => [],
};
