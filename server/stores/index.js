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

// Stores we can't price-check. They're shown on the "More Stores" tab as plain links.
const skipped = [
  { id: 'evike', name: 'Evike.com', url: 'https://www.evike.com', note: 'Large US retailer (California)', reason: 'Every page sits behind a Cloudflare bot check (HTTP 403), including robots.txt. We don\'t bypass bot checks. Prices could be added later through Evike\'s affiliate feed.' },
  { id: 'sniperas', name: 'Sniper Airsoft', url: 'https://www.sniper-as.de', note: 'German retailer (prices in EUR)', reason: 'EU store with euro pricing, so it isn\'t compared against US prices. The old sniperairsoft.com domain is now a parked domain for sale.' },
];
// Reviewed and dropped: Elite Tactical Supply (elitetacticalsupply.com is a parked domain for sale, and the
// business is an Ohio firearms gunsmith, not an airsoft store).
const reviews = [
  { id: 'replicaairguns', name: 'ReplicaAirguns', url: 'https://www.replicaairguns.com', note: 'Airsoft & BB gun reviews blog. Not a store.' },
];

module.exports = { stores, skipped, reviews };
