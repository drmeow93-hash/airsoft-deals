// Airsoft Station (BigCommerce). /search.php and /deals/ are not disallowed in robots.txt.
const { get } = require('../http');
const { parseBigCommerceCards } = require('./bigcommerce');
const base = 'https://airsoftstation.com';

const parse = (html, opts) => parseBigCommerceCards(html, opts);

module.exports = {
  id: 'airsoftstation',
  name: 'Airsoft Station',
  base,
  location: 'Kentucky, USA',
  blurb: 'Large US retailer, BigCommerce storefront',
  platform: 'BigCommerce',
  search: async (q) => parse(await get(`${base}/search.php?search_query=${encodeURIComponent(q)}`)).slice(0, 24),
  deals: async () => parse(await get(`${base}/deals/`), { storeDeal: true }),
};
