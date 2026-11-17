# Felony's Airsoft Emporium

Live airsoft price comparison across trusted US retailers. Search once, and Felony's Airsoft Emporium checks every supported store in parallel, matches the same product across stores, and flags real deals. Ships as an installable iPhone web app (PWA) and as a native iOS shell (Capacitor).

## Stores

**Searched live on every query**

| Store | Route (all allowed by the store's robots.txt) |
|---|---|
| Airsoft Atlanta (GA) | Shopify `/search/suggest.json`; deals from `/products.json` items priced below compare-at |
| Airsoft N More (LA) | Same as above |
| SpeedQB (UT) | Same as above |
| Airsoft Station (KY) | BigCommerce `/search.php`; deals from `/deals/` |
| Airsoft Megastore (CA) | OpenCart `route=product/search`; deals from `/Mega-Deals` |
| Wolverine Airsoft (PA) | WooCommerce Store API `/wp-json/wc/store/v1/products` (public, not disallowed). Its HTML pages show a Cloudflare check to scripts, so we don't touch those. |
| eHobbyAsia (HK, ships US) | HTML `/search` page only. robots.txt disallows `/products.json` and `/search.json`, so we use no JSON endpoint. |

**Background catalog index** (for stores whose search is disallowed). These are crawled slowly in the background at or above each store's Crawl-delay, kept in memory, and searched locally. Nothing is fetched per user search.

| Store | What's indexed | Pace / refresh |
|---|---|---|
| Airsoft Extreme (CA) | 4 main categories + Clearance Deals, using Lightspeed's `?format=json` on category pages (`/search/` and `/collections/` are disallowed) | 2.5 s per request (Crawl-delay 2) / every 6 h |
| Amped Airsoft (PA) | 7 main BigCommerce categories at 100 per page (`/search.php` is disallowed) | 2.5 s per request / every 6 h |
| Airsoft GI (CA) | `/specials.php` + `/Airsoft-Guns/` listing pages (its search pages are disallowed) | 5.5 s per request (Crawl-delay 5) / every 12 h |

On Render's free plan the instance sleeps after about 15 minutes idle. Indexes rebuild when it wakes: Airsoft Extreme and Amped take about 1–3 minutes, Airsoft GI about 6–8 minutes. While a store is indexing, the app labels it "indexing…" instead of hiding it.

Requests use an honest User-Agent (`AirsoftDealsFinder/1.0`), never a browser disguise, and responses are cached.

**Not price-checked.** These are listed as direct links on the in-app **More Stores** tab.
- **Evike.com:** a Cloudflare bot check (HTTP 403) blocks every URL, including robots.txt. We don't bypass bot checks. The way in is their affiliate program (below).
- **Sniper Airsoft:** the real store is the German shop sniper-as.de, priced in EUR, so it isn't compared against US prices. sniperairsoft.com is a parked domain.
- **ReplicaAirguns:** a review blog, not a store. It's listed under "Reviews".
- **Elite Tactical Supply:** dropped. elitetacticalsupply.com is a parked domain for sale, and the business is an Ohio firearms gunsmith, not an airsoft store.

### Affiliate / product feeds
`server/stores/feed.js` can add any store from an official product feed (CSV, TSV, or JSON, optionally gzipped). Set these environment variables on Render:
```
FEED_STORES=evike:Evike.com
FEED_EVIKE_URL=https://<feed url with your affiliate key>
FEED_EVIKE_MAP={"title":"Product Name","price":"Sale Price","originalPrice":"Retail Price","url":"Buy Link","image":"Image URL"}   # optional, common column names are auto-detected
FEED_REFRESH_HOURS=6
```

## Deal detection (`server/deals.js`)
- **% OFF**: the store's own regular, compare-at, or "was" price is higher than the current price. **HOT DEAL** means 30% or more off. A "was" price more than 80% above the current price is treated as a placeholder and ignored.
- **STORE DEAL**: the item appears on the store's own deals or specials page.
- **LOWEST OF N**: the same product appears at N stores, and this store has the cheapest price.
- **Cross-store matching**: titles are tokenized (brand plus model), and two listings count as the same product only if all of these hold: token Jaccard similarity is at least 0.55, the accessory-type words agree (a magazine never matches a pistol), the model numbers agree (G17 vs G19, 4.3 vs 5.1), and the prices are within 1.6x of each other. For each group we compute the average price and each store's ±% and ±$ versus that average. The product page shows these numbers.
- Ratings are not shown. None of the stores' public endpoints provide them, and we don't make them up.

## Run locally
```bash
npm install
npm start            # http://localhost:8787
```
API: `GET /api/search?q=glock`, `GET /api/deals`, `GET /api/stores`.

## Put it on your phone (PWA, the fastest way)
1. Deploy the backend (it also serves the web app) to any Node host:
   - **Render** (free): push this folder to a GitHub repo, then go to Render → New → Blueprint. It picks up `render.yaml`. You get a URL like `https://airsoft-deals.onrender.com`.
   - **Fly.io**: `fly launch` (uses the `Dockerfile`), then `fly deploy`.
   - **Railway**: New Project → Deploy from repo. Start command: `npm start`.
2. On your iPhone, open that URL in **Safari**, tap Share, then **Add to Home Screen**. It opens full-screen with its own icon, like a native app.

## Native iOS app (Capacitor)
The native wrapper is already scaffolded in `ios/` (Capacitor 8, Swift Package Manager, no CocoaPods needed). Building a signed `.ipa` requires a Mac with Xcode. It can't be done on Linux.

On a Mac (Xcode 16+, Node 20+):
```bash
npm install
API_BASE=https://YOUR-DEPLOYED-BACKEND npm run ios:build   # copies public/ -> www/, bakes in the API URL, syncs into ios/
npm run ios:open                                           # opens ios/App/App.xcodeproj in Xcode
```
In Xcode:
1. Select the **App** target, then Signing & Capabilities. Pick your Team (a free Apple ID works for your own phone) and change the bundle ID if needed (`com.airsoftdeals.app`).
2. Plug in your iPhone and choose it as the run destination. Press **Run** (⌘R). The first time, go to Settings → General → VPN & Device Management on the phone and trust your developer certificate.
3. For TestFlight or the App Store you need a paid Apple Developer account ($99/yr). Then: Product → Archive → Distribute App.

The native app needs `API_BASE` because the stores don't allow cross-origin calls straight from the app. The backend does the fetching.

## Project layout
```
server/            Express API + store adapters (shopify.js, airsoftstation.js, megastore.js) + deals.js
public/            PWA (index.html, styles.css, app.js, manifest, service worker, icons)
ios/               Capacitor iOS Xcode project
scripts/           make-icons.js, screenshots.js, build-www.js
screenshots/       desktop-* and iphone-* UI captures
```

## Branding
The header wordmark uses **Dancing Script** (SIL Open Font License 1.1). It's self-hosted at `public/fonts/` so it also works offline in the installed app. The license is in `public/fonts/OFL.txt`.

## Marketplaces (used / third-party)

The **Marketplaces** tab (`#/marketplaces`) and a separate "Used & marketplace listings" section under each search are kept apart from the new-retail price comparison.

| Marketplace | Mode | Why |
|---|---|---|
| HopUp (hopupairsoft.com) | Link only | robots.txt allows crawling, but the Terms of Use forbid scraping/automated collection without written permission |
| eBay airsoft (cat. 31680) | Link only, **live with free API key** | Pages return 403 to bots and robots.txt disallows search; the official Browse API is the compliant route |
| GunBroker airsoft | Link only | Cloudflare 403 to automated requests; official API requires a developer key |
| r/airsoftmarket | Link only | robots.txt disallows all crawling; Reddit API requires OAuth/approval |
| Facebook Marketplace / groups | Link only | Login required |
| Airsoft Classifieds | Dropped | airsoftclassifieds.com is a parked domain; .org did not respond |

### Turning on live eBay listings
Create a free eBay developer account (developer.ebay.com), make a Production keyset, then set these env vars on Render:

```
EBAY_CLIENT_ID=...       # App ID
EBAY_CLIENT_SECRET=...   # Cert ID
```

The server uses the client-credentials OAuth flow and the Browse API (`item_summary/search`, category 31680), caching results for 10 minutes.

## Speed (free hosting)

Render's free plan gives the server a small slice of CPU and puts it to sleep after 15 idle minutes, so the app is built to feel fast anyway:

- **Progressive search.** The first answer (`/api/search?fast=1`) comes back after ~1.2 s with the stores that have responded; the page then fills in the rest. Each store gets at most 4 s, so one slow store can't hold up the page.
- **Result cache.** Finished searches and the deals feed are cached for 10 minutes. Older results are still shown instantly (marked "updating") while a background refresh runs. The deals feed and the home-page chips are kept warm.
- **Catalog snapshots.** Catalog-indexed stores save their last crawl to `server/snapshot/*.json.gz`, and a copy ships with each deploy, so a fresh wake starts with a full catalog. Crawls run in a worker thread, one store at a time. Each offer shows how old its catalog data is. To refresh the bundled snapshots, run the server locally until the logs show the index finished, then commit `server/snapshot/`.
- **Front end.** Hashed asset URLs with year-long caching, a service worker that serves the app shell instantly, last results kept on the device (labelled with their age), smaller store-CDN thumbnails, lazy images, and a "waking up" notice when the server is asleep.
- **Cold starts.** On the free plan, the first visit after 15 idle minutes waits about a minute for Render to wake the server. Returning visitors see the cached app and last prices during that time. The only way to remove the wait is a paid always-on instance (see Render's pricing page).

### Galaxy background
The animated space background is pure CSS: two star layers and one nebula layer, each painted once and then moved with `transform` on the GPU. It does no per-frame JavaScript or layout work, pauses while the tab is hidden, and stays still when the device has "Reduce Motion" turned on.
