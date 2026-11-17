const { makeShopifyStore } = require('./shopify');
const { feedStores } = require('./feed');

const stores = [
  makeShopifyStore({ id: 'airsoftatlanta', name: 'Airsoft Atlanta', base: 'https://www.airsoftatlanta.com', location: 'Georgia, USA', blurb: 'Retail store & field supplier, Shopify storefront' }),
  makeShopifyStore({ id: 'airsoftnmore', name: 'Airsoft N More', base: 'https://airsoftnmore.com', location: 'Los Angeles, USA', blurb: 'LA airsoft shop, Shopify storefront' }),
  makeShopifyStore({ id: 'speedqb', name: 'SpeedQB', base: 'https://www.speedqb.com', location: 'Utah, USA', blurb: 'Gear & HPA specialist, Shopify storefront' }),
  makeShopifyStore({ id: 'foxairsoft', name: 'Fox Airsoft', base: 'https://www.foxairsoft.com', location: 'USA', blurb: 'US airsoft retailer, Shopify storefront' }),
  makeShopifyStore({ id: 'ballahack', name: 'Ballahack Airsoft', base: 'https://www.ballahackairsoft.com', location: 'Virginia, USA', blurb: 'Virginia shop & field, Shopify storefront' }),
  makeShopifyStore({ id: 'brill', name: 'Brill Armory', base: 'https://brillarmory.com', location: 'USA', blurb: 'Upgrade parts & airsmithing specialist, Shopify storefront' }),
  makeShopifyStore({ id: 'echo1', name: 'Echo1 USA', base: 'https://echo1usa.com', location: 'California, USA', blurb: 'Echo1 / JAG Arms brand store, Shopify storefront' }),
  // WGC Shop prices only in Hong Kong dollars (HKD is pegged at ~7.8 per USD); shown converted to USD.
  makeShopifyStore({ id: 'wgc', name: 'WGC Shop', base: 'https://wgcshop.com', location: 'Hong Kong (HKD, shown in USD)', blurb: 'Hong Kong retailer, Shopify storefront; prices converted from HKD', fx: { cur: 'HKD', rate: 7.8 } }),
  require('./redwolf'),
  require('./clandestine'),
  require('./airsoftstation'),
  require('./megastore'),
  require('./wolverine'),
  require('./ehobbyasia'),
  require('./airsoftextreme'),
  require('./amped'),
  require('./airsoftgi'),
  ...feedStores(), // optional affiliate feeds, enabled via FEED_* env vars
];

// Free-shipping thresholds as each store publishes them on its own site (checked Nov 2026).
const SHIPPING = {
  airsoftnmore: { freeOver: 149, note: 'Free shipping over $149' },
  speedqb: { freeOver: 100, note: 'Free US shipping over $100' },
  foxairsoft: { freeOver: 200, note: 'Free shipping over $200' },
  airsoftstation: { freeOver: 199, note: 'Free shipping over $199' },
  megastore: { freeOver: 149, note: 'Free shipping over $149 (code FREESHIP, lower 48)' },
  airsoftextreme: { freeOver: 199.99, note: 'Free shipping over $199.99' },
  amped: { freeOver: 149, note: 'Free shipping over $149' },
  ehobbyasia: { freeOver: null, note: 'Ships from Hong Kong; shipping charged' },
  wgc: { freeOver: null, note: 'Ships from Hong Kong; shipping charged' },
  redwolf: { freeOver: null, note: 'Ships from Hong Kong; shipping charged' },
};
for (const s of stores) if (SHIPPING[s.id]) s.shipping = SHIPPING[s.id];

// Stores we can't price-check. They're shown on the "More Stores" tab as plain links.
const skipped = [
  { id: 'evike', name: 'Evike.com', url: 'https://www.evike.com', note: 'Large US retailer (California)', reason: 'Every page, including robots.txt, sits behind a Cloudflare bot check (HTTP 403, re-checked Nov 2026). We don\'t bypass bot checks.' },
  { id: 'mirtactical', name: 'MiR Tactical', url: 'https://mirtactical.com', note: 'Midwest airsoft & tactical retailer', reason: 'BigCommerce store behind a Cloudflare challenge; its search can\'t be read without passing a bot check.' },
  { id: 'airsoftjunkiez', name: 'Airsoft Junkiez', url: 'https://www.airsoftjunkiez.com', note: 'Custom PolarStar & Wolverine builds', reason: 'BigCommerce store behind a Cloudflare challenge with captcha.' },
  { id: 'usairsoft', name: 'US Airsoft', url: 'https://www.usairsoft.com', note: 'Anderson, California', reason: 'robots.txt disallows its search (/s/search) and there is no public product JSON.' },
  { id: 'novritsch', name: 'Novritsch (US)', url: 'https://us.novritsch.com', note: 'Sniper rifles & gear, direct from the maker', reason: 'robots.txt disallows both the WooCommerce API (/wp-json/) and the site search (?s=).' },
  { id: 'taiwangun', name: 'Taiwangun', url: 'https://www.taiwangun.com', note: 'Large EU retailer (Poland)', reason: 'Cloudflare challenge with captcha on search pages.' },
  { id: 'jkarmy', name: 'JK Army', url: 'https://www.jkarmy.com', note: 'Hong Kong retailer', reason: 'Every page returns a Cloudflare "Just a moment" bot check.' },
  { id: 'eastcoastairsoft', name: 'East Coast Airsoft', url: 'https://eastcoastairsoft.com', note: 'Maryland\'s largest airsoft store', reason: 'Products are drawn by JavaScript from an /api endpoint that robots.txt disallows; the HTML has no product list.' },
  { id: 'nashvilleairsoft', name: 'Nashville Airsoft', url: 'https://nashvilleairsoft.com', note: 'Tennessee shop', reason: 'Products load through a JavaScript store widget; there is no public product JSON or plain HTML results page.' },
  { id: 'opsgear', name: 'OPSGEAR', url: 'https://opsgear.com', note: 'Airsoft gear retailer', reason: 'JavaScript app whose product data comes from /api/, which robots.txt disallows.' },
  { id: 'sniperas', name: 'Sniper Airsoft', url: 'https://www.sniper-as.de', note: 'German retailer (prices in EUR)', reason: 'EU store with euro pricing, so it isn\'t compared against US prices. The old sniperairsoft.com domain is now a parked domain for sale.' },
];
// Reviewed and dropped (Nov 2026): Just Airsoft Guns (justairsoftguns.com redirects to a parked
// lander page), Xtreme Airsoft Superstore, Liberty Tactical, GI Tactical and Airsoft Tactical (domains
// don't resolve or are parked). Elite Tactical Supply (elitetacticalsupply.com is a parked domain for sale, and the
// business is an Ohio firearms gunsmith, not an airsoft store).
const reviews = [
  { id: 'replicaairguns', name: 'ReplicaAirguns', url: 'https://www.replicaairguns.com', note: 'Airsoft & BB gun reviews blog. Not a store.' },
];

module.exports = { stores, skipped, reviews };
