# AirsoftDeals

Live airsoft price comparison across trusted US retailers. Search once, and AirsoftDeals checks every supported store in parallel, matches the same product across stores, and flags real deals. Ships as an installable iPhone web app (PWA) and as a native iOS shell (Capacitor).

## Stores

| Store | How it's read | Search | Deals feed |
|---|---|---|---|
| Airsoft Atlanta (GA) | Shopify public JSON | `/search/suggest.json` | `/products.json` items with compare-at > price |
| Airsoft N More (Los Angeles) | Shopify public JSON | `/search/suggest.json` | `/products.json` items with compare-at > price |
| SpeedQB (gear and HPA) | Shopify public JSON | `/search/suggest.json` | `/products.json` items with compare-at > price |
| Airsoft Station (KY) | BigCommerce HTML | `/search.php` | `/deals/` page |
| Airsoft Megastore (CA) | OpenCart HTML | `route=product/search` | `/Mega-Deals` page |

Every path above is allowed by that store's robots.txt. Requests use an honest User-Agent (`AirsoftDealsFinder/1.0`) and are cached in memory (10 min for searches, 30 min for deal feeds), so the stores see very little traffic.

**Reviewed and skipped on purpose:** we don't evade blocks.
- Evike.com: HTTP 403 bot wall, even on robots.txt
- Airsoft GI: robots.txt disallows search and sets a 5 s crawl delay
- Amped Airsoft: robots.txt disallows `/search.php`
- ReplicaAirguns: robots.txt disallows `/search` and JSON
- Airsoft Extreme: robots.txt disallows `/search/` and `/collections/`
- eHobbyAsia: robots.txt disallows `/products.json` and `/search.json`
- Wolverine, Elite Tactical Supply, Sniper Airsoft: Cloudflare challenge or 403

To add a Shopify store, add one line in `server/stores/index.js` with `makeShopifyStore({...})`, after checking its robots.txt.

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
