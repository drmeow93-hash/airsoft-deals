// RedWolf Airsoft (Hong Kong, Magento). /catalogsearch/result/ is allowed by robots.txt (only
// account, checkout, wishlist and /sales are disallowed) and there's no bot challenge. The default
// storefront currency is USD, so prices are already in dollars.
const cheerio = require('cheerio');
const { get, money, sliceHtml } = require('../http');
const base = 'https://www.redwolfairsoft.com';

function parse(html) {
  const $ = cheerio.load(sliceHtml(html, { marker: 'product-item-info', startTag: '<li', tail: 4000 }));
  const out = [];
  $('.product-item-info').each((_, el) => {
    const box = $(el);
    const a = box.find('a.product-item-link').first();
    const title = a.text().replace(/\s+/g, ' ').trim();
    const price = money(box.find('[data-price-type="finalPrice"]').attr('data-price-amount'));
    const old = money(box.find('[data-price-type="oldPrice"]').attr('data-price-amount'));
    if (!title || !price) return;
    out.push({
      title, brand: null, price,
      originalPrice: old && old > price ? old : null,
      inStock: /out of stock/i.test(box.find('.out-of-stock').text()) ? false : true,
      image: box.find('img.product-image-photo').attr('src') || null,
      url: (a.attr('href') || '').split('?')[0],
    });
  });
  return out;
}

module.exports = {
  id: 'redwolf', name: 'RedWolf Airsoft', base, location: 'Hong Kong (prices in USD)',
  blurb: 'Large Hong Kong retailer, Magento storefront; ships internationally',
  platform: 'Magento',
  search: async (q) => parse(await get(`${base}/catalogsearch/result/?q=${encodeURIComponent(q)}`)).slice(0, 30),
  // Sale feed: what their search shows as discounted for a few broad terms.
  deals: async () => {
    const out = [];
    for (const q of ['airsoft gbb pistol', 'airsoft aeg']) out.push(...parse(await get(`${base}/catalogsearch/result/?q=${encodeURIComponent(q)}`)).filter((p) => p.originalPrice));
    return out;
  },
};
