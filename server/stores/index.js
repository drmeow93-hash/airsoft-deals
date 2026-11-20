const { makeShopifyStore } = require('./shopify');
const { feedStores } = require('./feed');

const stores = [
  makeShopifyStore({ id: 'airsoftatlanta', name: 'Airsoft Atlanta', base: 'https://www.airsoftatlanta.com', location: 'Georgia, USA', blurb: 'Retail store & field supplier, Shopify storefront' }),
  makeShopifyStore({ id: 'airsoftnmore', name: 'Airsoft N More', base: 'https://airsoftnmore.com', location: 'Los Angeles, USA', blurb: 'LA airsoft shop, Shopify storefront' }),
  makeShopifyStore({ id: 'speedqb', name: 'SpeedQB', base: 'https://www.speedqb.com', location: 'Utah, USA', blurb: 'Gear & HPA specialist, Shopify storefront' }),
  makeShopifyStore({ id: 'foxairsoft', name: 'Fox Airsoft', base: 'https://foxairsoft.com', location: 'USA', blurb: 'US airsoft retailer, Shopify storefront' }),
  makeShopifyStore({ id: 'ballahack', name: 'Ballahack Airsoft', base: 'https://ballahackairsoft.com', location: 'Virginia, USA', blurb: 'Virginia shop & field, Shopify storefront' }),
  makeShopifyStore({ id: 'brill', name: 'Brill Armory', base: 'https://brillarmory.com', location: 'USA', blurb: 'Upgrade parts & airsmithing specialist, Shopify storefront' }),
  makeShopifyStore({ id: 'echo1', name: 'Echo1 USA', base: 'https://echo1usa.com', location: 'California, USA', blurb: 'Echo1 / JAG Arms brand store, Shopify storefront' }),
  // WGC Shop prices only in Hong Kong dollars (HKD is pegged at ~7.8 per USD); shown converted to USD.
  makeShopifyStore({ id: 'wgc', name: 'WGC Shop', base: 'https://www.wgcshop.com', location: 'Hong Kong (HKD, shown in USD)', blurb: 'Hong Kong retailer, Shopify storefront; prices converted from HKD', fx: { cur: 'HKD', rate: 7.8 } }),
  // Added Nov 2026 after legitimacy vetting (data/vetting.json): public Shopify JSON, allowed by robots.txt.
  makeShopifyStore({ id: 'ssairsoft', name: 'SS Airsoft', base: 'https://store.ssairsoft.com', location: 'Atlanta, Georgia, USA', blurb: 'Atlanta airsoft shop, Shopify storefront' }),
  makeShopifyStore({ id: 'extremeri', name: 'Extreme Airsoft RI', base: 'https://extremeairsoftri.com', location: 'South Kingstown, Rhode Island, USA', blurb: 'Rhode Island pro shop & indoor field, Shopify storefront' }),
  makeShopifyStore({ id: 'vipairsoft', name: 'VIP Airsoft', base: 'https://vipairsoft.myshopify.com', location: 'Gilbert, Arizona, USA', blurb: 'Arizona arena pro shop, Shopify storefront' }),
  makeShopifyStore({ id: 'blackopsnc', name: 'Black Ops Paintball & Airsoft', base: 'https://blackopswebstore.com', location: 'Fayetteville, North Carolina, USA', blurb: 'Paintball & airsoft super store (airsoft items only shown), Shopify storefront' }),
  makeShopifyStore({ id: 'polarstar', name: 'PolarStar Airsoft', base: 'https://polarstarairsoft.com', location: 'USA', blurb: 'HPA engine manufacturer, direct store (Shopify)', airsoftOnly: true }),
  makeShopifyStore({ id: 'primary', name: 'Primary Airsoft', base: 'https://primaryairsoft.us', location: 'Hamden, Connecticut, USA', blurb: 'HPA adapters, direct from the maker (Shopify)', airsoftOnly: true }),
  makeShopifyStore({ id: 'taccity', name: 'Tac City Airsoft', base: 'https://taccityairsoft.com', location: 'Fullerton, California, USA', blurb: 'LA/OC indoor arena pro shop, Shopify storefront' }),
  require('./umarex'),
  require('./redwolf'),
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

// Link-only stores, fields/pro shops and review sites all come from the vetting file: only entries
// that passed the legitimacy checks (scripts/vet.js → data/vetting.json) are listed or linked.
const { ofKind, isVetted } = require('../vetting');
const asLink = (e) => ({ id: e.id, name: e.name, url: e.url, note: e.note || '', reason: e.why || '' });
const skipped = ofKind('link').map(asLink);
const fields = ofKind('field').map(asLink);
const reviews = ofKind('review').map(asLink);

// A store whose domain isn't vetted is never queried.
const vettedStores = stores.filter((s) => {
  if (s.feed || isVetted(s.base)) return true;
  console.warn(`[vetting] ${s.name} (${s.base}) is not on the vetted allowlist; skipped`);
  return false;
});

module.exports = { stores: vettedStores, skipped, fields, reviews };
