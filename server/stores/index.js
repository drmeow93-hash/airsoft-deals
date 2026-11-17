const { makeShopifyStore } = require('./shopify');
const { feedStores } = require('./feed');

const stores = [
  makeShopifyStore({ id: 'airsoftatlanta', name: 'Airsoft Atlanta', base: 'https://www.airsoftatlanta.com', location: 'Georgia, USA', blurb: 'Retail store & field supplier, Shopify storefront' }),
  makeShopifyStore({ id: 'airsoftnmore', name: 'Airsoft N More', base: 'https://airsoftnmore.com', location: 'Los Angeles, USA', blurb: 'LA airsoft shop, Shopify storefront' }),
  makeShopifyStore({ id: 'speedqb', name: 'SpeedQB', base: 'https://www.speedqb.com', location: 'Utah, USA', blurb: 'Gear & HPA specialist, Shopify storefront' }),
  require('./airsoftstation'),
  require('./megastore'),
  require('./wolverine'),
  require('./ehobbyasia'),
  require('./airsoftextreme'),
  require('./amped'),
  require('./airsoftgi'),
  ...feedStores(), // optional affiliate feeds, enabled via FEED_* env vars
];

// Reviewed and intentionally NOT scraped.
const skipped = [
  { name: 'Evike.com', reason: 'Cloudflare "Just a moment" challenge (HTTP 403) on every page, including robots.txt. No public feed or API that answers without a browser check, and we do not bypass bot protection.' },
  { name: 'Elite Tactical Supply', reason: 'Cloudflare challenge (HTTP 403) on every page. robots.txt itself allows crawling, but there is no unprotected product feed or API, and we do not bypass the challenge.' },
  { name: 'Sniper Airsoft', reason: 'Cloudflare challenge (HTTP 403) on every page. robots.txt allows crawling, but there is no unprotected product feed or API.' },
  { name: 'ReplicaAirguns', reason: 'Not a store: it is a review blog (Squarespace) with no product prices to compare. robots.txt also disallows /search and JSON formats.' },
];

module.exports = { stores, skipped };
