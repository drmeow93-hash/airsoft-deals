// Shared parser for BigCommerce Stencil product cards (category/search/deals listings).
const cheerio = require('cheerio');
const { money } = require('../http');

function parseBigCommerceCards(html, { storeDeal = false } = {}) {
  const $ = cheerio.load(html);
  const out = [];
  $('article.card').each((_, el) => {
    const c = $(el);
    const a = c.find('.card-title a').first();
    const title = a.text().trim();
    if (!title) return;
    const price = money(c.find('[data-product-price-without-tax]').first().text()) || money(c.find('[data-product-price-with-tax]').first().text());
    const was = money(c.find('[data-product-non-sale-price-without-tax]').first().text()) || money(c.find('[data-product-rrp-price-without-tax]').first().text());
    const btns = c.find('.card-figcaption-button, .button').map((i, b) => $(b).text().trim().toLowerCase()).get().join('|');
    let inStock = null;
    if (/out of stock|sold out/.test(btns)) inStock = false;
    else if (/add to cart|choose options|pre-?order/.test(btns)) inStock = true;
    const img = c.find('img').first();
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

module.exports = { parseBigCommerceCards };
