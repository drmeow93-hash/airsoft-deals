const { makeShopifyStore } = require('./shopify');

const stores = [
  makeShopifyStore({ id: 'airsoftatlanta', name: 'Airsoft Atlanta', base: 'https://www.airsoftatlanta.com', location: 'Georgia, USA', blurb: 'Retail store & field supplier, Shopify storefront' }),
  makeShopifyStore({ id: 'airsoftnmore', name: 'Airsoft N More', base: 'https://airsoftnmore.com', location: 'Los Angeles, USA', blurb: 'LA airsoft shop, Shopify storefront' }),
  makeShopifyStore({ id: 'speedqb', name: 'SpeedQB', base: 'https://www.speedqb.com', location: 'Utah, USA', blurb: 'Gear & HPA specialist, Shopify storefront' }),
  require('./airsoftstation'),
  require('./megastore'),
];

// Reviewed and intentionally NOT scraped (see README for details).
const skipped = [
  { name: 'Evike.com', reason: 'Returns HTTP 403 (bot protection) to plain requests, even robots.txt. Not evaded.' },
  { name: 'Airsoft GI', reason: 'robots.txt disallows its search pages (advanced_search_result.php) and sets a 5s crawl delay.' },
  { name: 'Amped Airsoft', reason: 'robots.txt disallows /search.php.' },
  { name: 'ReplicaAirguns', reason: 'robots.txt disallows /search and JSON formats.' },
  { name: 'Airsoft Extreme', reason: 'robots.txt disallows /search/ and /collections/.' },
  { name: 'eHobbyAsia', reason: 'robots.txt disallows /products.json and /search.json.' },
  { name: 'Wolverine Airsoft, Elite Tactical Supply, Sniper Airsoft', reason: 'Cloudflare challenge / HTTP 403 on plain requests.' },
];

module.exports = { stores, skipped };
