// eHobbyAsia (Shopify, ships to the US from Hong Kong). robots.txt disallows /products.json and
// /search.json, so we don't use any JSON endpoint. The HTML search page (/search) is allowed and
// is server-rendered, so we read the product cards from it.
const cheerio = require('cheerio');
const { get, money, sliceHtml } = require('../http');
const base = 'https://www.ehobbyasia.com';

function parse(html) {
  const $ = cheerio.load(sliceHtml(html, { marker: 'boost-sd-fb__card', startTag: '<ul', endTag: '</ul>' }));
  const out = [];
  $('li.boost-sd-fb__card').each((_, el) => {
    const c = $(el);
    const title = c.find('.boost-sd-fb__title').first().text().trim();
    const href = c.find('a.boost-sd-fb__link').attr('href') || '';
    const price = money(c.find('.boost-sd__product-price--sale .money, .boost-sd-fb__price > .money, .boost-sd-fb__price .money').first().text());
    const was = money(c.find('s.boost-sd__product-price--compare .money').first().text());
    const btn = c.find('.boost-sd-fb__btn').text().trim().toLowerCase();
    let img = c.find('img').first().attr('src') || null;
    if (img && img.startsWith('//')) img = 'https:' + img;
    out.push({
      title,
      brand: null,
      price,
      originalPrice: was && price && was > price ? was : null,
      inStock: /add to cart/.test(btn) ? true : /sold out|unavailable/.test(btn) ? false : null,
      image: img,
      url: base + href.split('?')[0],
    });
  });
  return out.filter((p) => p.title && p.price);
}

module.exports = {
  id: 'ehobbyasia', name: 'eHobbyAsia', base, location: 'Hong Kong (ships to US)',
  blurb: 'Large Asian importer, prices in USD, Shopify (HTML search only)',
  platform: 'Shopify', mode: 'live',
  search: async (q) => parse(await get(`${base}/search?q=${encodeURIComponent(q)}&type=product`)).slice(0, 24),
  deals: async () => [],
};
