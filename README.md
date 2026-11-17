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
