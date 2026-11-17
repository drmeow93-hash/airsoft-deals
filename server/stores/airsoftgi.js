// Airsoft GI. robots.txt disallows its search (advanced_search_result.php) and sets Crawl-delay: 5.
// Category and specials pages are allowed, so we index Airsoft Guns + Specials slowly (one page
// every 5+ seconds), refresh twice a day, and search that index in memory.
const cheerio = { load: (...a) => require('cheerio').load(...a) }; // loaded on first use (keeps cold start short)
const { createIndex } = require('../indexer');
const { money } = require('../http');
const base = 'https://www.airsoftgi.com';

function parse(html, storeDeal) {
  const $ = cheerio.load(html);
  const out = [];
  $('.mobileListThumb').each((_, el) => {
    const c = $(el);
    const a = c.find('.mobileListThumbName a').first();
    const title = a.text().trim();
    if (!title) return;
    const priceEl = c.find('.mobileListThumbPrice').first();
    const was = money(priceEl.find('.discountedPrice').first().text());
    const red = priceEl.find('span[style*="color"]').first().text();
    const price = money(red) || money(priceEl.clone().find('.discountedPrice').remove().end().text()) || was;
    const btn = c.find('.buyButton').attr('class') || '';
    let src = c.find('img').first().attr('src') || null;
    if (src && !/^https?:/.test(src)) src = `${base}/${src.replace(/^\//, '')}`;
    out.push({
      title,
      brand: null,
      price,
      originalPrice: was && price && was > price ? was : null,
      inStock: /instock/.test(btn) ? true : /outofstock|soldout/.test(btn) ? false : null,
      image: src,
      url: a.attr('href'),
      storeDeal,
    });
  });
  return { items: out.filter((p) => p.price), hasNext: /title=" Next Page "/.test(html) };
}

async function crawlList(path, fetchPage, add, { deal, maxPages }) {
  for (let page = 1; page <= maxPages; page++) {
    const html = await fetchPage(`${base}${path}${page > 1 ? `?page=${page}` : ''}`);
    const { items, hasNext } = parse(html, deal);
    if (deal) add(items, { deal: true });
    else { add(items.filter((p) => !p.originalPrice)); add(items.filter((p) => p.originalPrice), { deal: true }); }
    if (!hasNext || !items.length) break;
  }
}

const index = createIndex({
  workerModule: __filename,
  name: 'Airsoft GI',
  delayMs: 5500,
  refreshMs: 12 * 60 * 60 * 1000,
  crawl: async ({ fetchPage, add }) => {
    await crawlList('/specials.php', fetchPage, add, { deal: true, maxPages: 10 });
    await crawlList('/Airsoft-Guns/', fetchPage, add, { deal: false, maxPages: 60 });
  },
});

module.exports = {
  id: 'airsoftgi', name: 'Airsoft GI', base, location: 'California, USA',
  blurb: 'Big SoCal retailer, guns + specials indexed twice a day at its 5s crawl delay',
  platform: 'Custom', mode: 'index', index, search: index.search, deals: index.deals,
};
