// Clandestine Airsoft (Zen Cart, R-hop/parts specialist). No robots.txt restrictions; the public
// search_result page lists products with prices.
const cheerio = require('cheerio');
const { get, money, sliceHtml } = require('../http');
const base = 'https://www.clandestineairsoft.com';

function parse(html) {
  const $ = cheerio.load(sliceHtml(html, { marker: 'itemTitle', startTag: '<div', tail: 3000 }));
  const out = [];
  $('div[class^="productListing-"]').each((_, el) => {
    const box = $(el);
    const a = box.find('h3.itemTitle a').first();
    const title = a.text().replace(/\s+/g, ' ').trim();
    const special = money(box.find('.productSpecialPrice, .productSalePrice').first().text());
    const normal = money(box.find('.normalprice').first().text());
    const basePrice = money(box.find('.productBasePrice').first().text());
    const price = special || basePrice || normal;
    if (!title || !price) return;
    const img = box.find('img.listingProductImage').attr('src');
    out.push({
      title, brand: null, price,
      originalPrice: special && normal && normal > special ? normal : null,
      inStock: /sold out|out of stock/i.test(box.text()) ? false : null,
      image: img ? new URL(img, base + '/').toString() : null,
      url: (a.attr('href') || '').replace(/&amp;/g, '&').replace(/&cPath=[^&]*/, ''),
    });
  });
  return out;
}

module.exports = {
  id: 'clandestine', name: 'Clandestine Airsoft', base, location: 'USA',
  blurb: 'R-hop and upgrade-parts specialist, Zen Cart storefront',
  platform: 'Zen Cart',
  search: async (q) => parse(await get(`${base}/index.php?main_page=search_result&search_in_description=0&keyword=${encodeURIComponent(q)}`)).slice(0, 20),
  deals: async () => parse(await get(`${base}/index.php?main_page=specials`, { ttlMs: 30 * 60 * 1000 })).filter((p) => p.originalPrice),
};
