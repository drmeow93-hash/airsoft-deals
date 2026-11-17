// Used / third-party airsoft marketplaces. These are kept apart from the new-retail price comparison.
// None of them can be read automatically within their rules, so they're links (with a prefilled
// search) unless an official API key is configured (eBay Browse API).
const { UA } = require('./http');
const { isVetted } = require('./vetting');

const enc = encodeURIComponent;
const allMarketplaces = [
  {
    id: 'hopup', name: 'HopUp', url: 'https://www.hopupairsoft.com', note: 'The biggest US airsoft buy/sell app. New and used gear from players.',
    search: (q) => `https://www.hopupairsoft.com/search?q=${enc(q)}`,
    why: "Link only. HopUp's Terms of Use forbid crawling or scraping listings without written permission, even though robots.txt allows it.",
  },
  {
    id: 'ebay', name: 'eBay Airsoft', url: 'https://www.ebay.com/sch/i.html?_sacat=31680', note: 'eBay airsoft category, new and used, auctions and Buy It Now.',
    search: (q) => `https://www.ebay.com/sch/i.html?_nkw=${enc(q)}&_sacat=31680`,
    why: "Link only unless an eBay Browse API key is configured. eBay blocks automated page requests (HTTP 403), and robots.txt disallows search pages. Its official API is the allowed route.",
  },
  {
    id: 'gunbroker', name: 'GunBroker Airsoft', url: 'https://www.gunbroker.com', note: 'Auction site with an Airsoft category (Air Guns › Airsoft).',
    search: (q) => `https://www.gunbroker.com/All/search?Keywords=${enc(q + ' airsoft')}`,
    why: 'Link only. Every page, including robots.txt, sits behind a Cloudflare bot check (HTTP 403). GunBroker has an official API, but it needs an approved developer key.',
  },
  {
    id: 'reddit', name: 'r/airsoftmarket', url: 'https://www.reddit.com/r/airsoftmarket/', note: 'Reddit buy/sell/trade community. Check seller feedback and use PayPal G&S.',
    search: (q) => `https://www.reddit.com/r/airsoftmarket/search/?q=${enc(q)}&restrict_sr=1&sort=new`,
    why: "Link only. Reddit's robots.txt disallows all crawling, and its Data API needs OAuth plus approval for commercial use.",
  },
  {
    id: 'fbmarket', name: 'Facebook Marketplace', url: 'https://www.facebook.com/marketplace/', note: 'Local pickup listings. Needs a Facebook login.',
    search: (q) => `https://www.facebook.com/marketplace/search/?query=${enc('airsoft ' + q)}`,
    why: 'Link only. Requires a login and has no public listings API.',
  },
  {
    id: 'fbgroups', name: 'Facebook airsoft groups', url: 'https://www.facebook.com/search/groups/?q=airsoft%20buy%20sell', note: 'Regional airsoft buy/sell/trade groups. Join one near you.',
    search: () => 'https://www.facebook.com/search/groups/?q=airsoft%20buy%20sell',
    why: 'Link only. Group posts need a login and there is no public API.',
  },
];
// Only marketplaces whose domain passed vetting (data/vetting.json) are shown or linked.
const marketplaces = allMarketplaces.filter((m) => isVetted(m.url) && isVetted(m.search('test')));

// Optional: official eBay Browse API (free developer account at developer.ebay.com).
// Set EBAY_CLIENT_ID and EBAY_CLIENT_SECRET on the server to show live eBay listings.
let ebayToken = null;
async function ebayAuth() {
  if (ebayToken && ebayToken.exp > Date.now()) return ebayToken.value;
  const basic = Buffer.from(`${process.env.EBAY_CLIENT_ID}:${process.env.EBAY_CLIENT_SECRET}`).toString('base64');
  const r = await fetch('https://api.ebay.com/identity/v1/oauth2/token', {
    method: 'POST',
    headers: { Authorization: `Basic ${basic}`, 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': UA },
    body: 'grant_type=client_credentials&scope=' + enc('https://api.ebay.com/oauth/api_scope'),
  });
  if (!r.ok) throw new Error(`eBay auth HTTP ${r.status}`);
  const j = await r.json();
  ebayToken = { value: j.access_token, exp: Date.now() + (j.expires_in - 120) * 1000 };
  return ebayToken.value;
}
const ebayCache = new Map();
async function ebaySearch(q) {
  const hit = ebayCache.get(q);
  if (hit && hit.exp > Date.now()) return hit.val;
  const token = await ebayAuth();
  if (!isVetted('https://api.ebay.com/')) throw new Error('eBay is not a vetted domain');
  const r = await fetch(`https://api.ebay.com/buy/browse/v1/item_summary/search?q=${enc(q)}&category_ids=31680&limit=24`, {
    headers: { Authorization: `Bearer ${token}`, 'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US', 'User-Agent': UA },
  });
  if (!r.ok) throw new Error(`eBay search HTTP ${r.status}`);
  const j = await r.json();
  const val = (j.itemSummaries || []).map((it) => ({
    marketplace: 'eBay', marketplaceId: 'ebay',
    title: it.title,
    price: it.price ? Number(it.price.value) : null,
    currency: it.price?.currency || 'USD',
    condition: it.condition || null,
    format: (it.buyingOptions || []).includes('AUCTION') ? 'Auction' : 'Buy It Now',
    image: it.image?.imageUrl || it.thumbnailImages?.[0]?.imageUrl || null,
    url: it.itemAffiliateWebUrl || it.itemWebUrl,
  })).filter((x) => x.price && isVetted(x.url));
  ebayCache.set(q, { val, exp: Date.now() + 10 * 60 * 1000 });
  return val;
}
const ebayEnabled = () => !!(process.env.EBAY_CLIENT_ID && process.env.EBAY_CLIENT_SECRET);

function list() {
  return marketplaces.map(({ id, name, url, note, why }) => ({ id, name, url, note, why, live: id === 'ebay' && ebayEnabled() }));
}

async function searchMarketplaces(q) {
  const links = marketplaces.map((m) => ({ id: m.id, name: m.name, url: m.search(q) }));
  let listings = [], errors = [];
  if (ebayEnabled()) {
    try { listings = await ebaySearch(q); } catch (e) { errors.push({ id: 'ebay', error: String(e.message || e) }); }
  }
  return { query: q, links, listings, errors, liveSources: ebayEnabled() ? ['eBay'] : [] };
}

module.exports = { list, searchMarketplaces };
