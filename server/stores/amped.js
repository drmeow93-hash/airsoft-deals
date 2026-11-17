// Amped Airsoft (BigCommerce). robots.txt disallows /search.php but allows category pages,
// so we index the main categories (100 products per page, one request every 2+ seconds).
const { createIndex } = require('../indexer');
const { parseBigCommerceCards } = require('./bigcommerce');
const base = 'https://ampedairsoft.com';
const CATEGORIES = ['airsoft-guns', 'magazines-accessories', 'hpa-systems-parts-accessories', 'internal-airsoft-upgrades', 'external-parts-accessories', 'optics-lights-lasers-tracers', 'tactical-gear'];

const index = createIndex({
  workerModule: __filename,
  name: 'Amped Airsoft',
  delayMs: 2500,
  refreshMs: 6 * 60 * 60 * 1000,
  crawl: async ({ fetchPage, add }) => {
    for (const cat of CATEGORIES) {
      for (let page = 1; page <= 15; page++) {
        const items = parseBigCommerceCards(await fetchPage(`${base}/${cat}/?limit=100&page=${page}`));
        add(items.filter((p) => !p.originalPrice));
        add(items.filter((p) => p.originalPrice), { deal: true });
        if (items.length < 100) break;
      }
    }
  },
});

module.exports = {
  id: 'amped', name: 'Amped Airsoft', base, location: 'Pennsylvania, USA',
  blurb: 'Speedsoft & HPA specialist, BigCommerce (categories indexed every 6h)',
  platform: 'BigCommerce', mode: 'index', index, search: index.search, deals: index.deals,
};
