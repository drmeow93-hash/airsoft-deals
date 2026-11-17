# Felony's Airsoft Emporium

Live airsoft price comparison across trusted US retailers. Search once, and Felony's Airsoft Emporium checks every supported store in parallel, matches the same product across stores, and flags real deals. Ships as an installable iPhone web app (PWA) and as a native iOS shell (Capacitor).

## Stores

Every store, link, field and marketplace below passed the legitimacy check in [Legitimacy vetting](#legitimacy-vetting). The server refuses to fetch from, or link to, any domain that isn't on that allowlist.

**Searched live on every query (21)**

| Store | Route (all allowed by the store's robots.txt) |
|---|---|
| Airsoft Atlanta (GA) | Shopify `/search/suggest.json`; deals from `/products.json` items priced below compare-at |
| Airsoft N More (LA) | Same as above |
| Fox Airsoft | Same as above |
| Ballahack Airsoft (VA) | Same as above |
| SpeedQB (UT) | Same as above |
| Brill Armory | Same as above |
| Echo1 USA (CA) | Same as above |
| SS Airsoft (store.ssairsoft.com) | Same as above (new in v4) |
| Extreme Airsoft RI | Same as above (new in v4) |
| VIP Airsoft | Same as above (new in v4) |
| Black Ops Paintball & Airsoft (NC) | Same as above (new in v4); paintball items are removed by the airsoft filter |
| PolarStar (HPA engines) | Same as above, with the strict airsoft-only filter (new in v4) |
| Primary Airsoft | Same as above, with the strict airsoft-only filter (new in v4) |
| Tac City Airsoft | Same as above (new in v4) |
| WGC Shop (HK) | Same as above. Prices exist only in HKD, so they're converted to USD at 7.8 HKD/USD and the original HKD price is shown next to the offer. |
| Umarex USA (Elite Force) | nopCommerce `/search?q=` HTML (allowed). Manufacturer direct shop (new in v4). |
| RedWolf Airsoft (HK) | Magento `/catalogsearch/result/` HTML (allowed; storefront currency is USD) |
| Airsoft Station (KY) | BigCommerce `/search.php`; deals from `/deals/` |
| Airsoft Megastore (CA) | OpenCart `route=product/search`; deals from `/Mega-Deals` |
| Wolverine Airsoft (PA) | WooCommerce Store API `/wp-json/wc/store/v1/products` (public, not disallowed). Its HTML pages show a bot check to scripts, so we don't touch those. |
| eHobbyAsia (HK, ships US) | HTML `/search` page only. robots.txt disallows `/products.json` and `/search.json`, so we use no JSON endpoint. |

**Background catalog index (3)**, for stores whose search is disallowed. These are crawled slowly in the background at or above each store's Crawl-delay, kept in memory, and searched locally. Nothing is fetched per user search.

| Store | What's indexed | Pace / refresh |
|---|---|---|
| Airsoft Extreme (CA) | 4 main categories + Clearance Deals, using Lightspeed's `?format=json` on category pages (`/search/` and `/collections/` are disallowed) | 2.5 s per request (Crawl-delay 2) / every 6 h |
| Amped Airsoft (PA) | 7 main BigCommerce categories at 100 per page (`/search.php` is disallowed) | 2.5 s per request / every 6 h |
| Airsoft GI (CA) | `/specials.php` + `/Airsoft-Guns/` listing pages (its search pages are disallowed) | 5.5 s per request (Crawl-delay 5) / every 12 h |

On Render's free plan the instance sleeps after about 15 minutes idle. Indexes rebuild when it wakes: Airsoft Extreme and Amped take about 1–3 minutes, Airsoft GI about 6–8 minutes. While a store is indexing, the app labels it "indexing…" instead of hiding it. Each live store gets at most 4 s per search; `/api/search?fast=1` returns whatever answered in about 1.2 s and the app fills in the rest.

Requests use an honest User-Agent (`AirsoftDealsFinder/1.0`), never a browser disguise, and responses are cached.

**More stores: link only (20).** These are listed as direct links on the in-app **Stores** tab, each with the reason it isn't price-checked:
- **Evike.com** (www.evike.com): Cloudflare bot check on every page
- **MiR Tactical** (mirtactical.com): robots.txt disallows its search (search.php)
- **Airsoft Junkiez** (www.airsoftjunkiez.com): robots.txt disallows its search (search.php)
- **Novritsch (US)** (us.novritsch.com): bot-verification page; robots.txt disallows its API and search
- **Taiwangun** (www.taiwangun.com): captcha on search pages; prices in EUR/PLN
- **JK Army** (www.jkarmy.com): Cloudflare bot check on every page
- **East Coast Airsoft** (eastcoastairsoft.com): products load by JavaScript from a disallowed /api
- **Nashville Airsoft** (nashvilleairsoft.com): JavaScript store widget, no product feed
- **Sniper Airsoft (DE)** (www.sniper-as.de): EU store priced in EUR
- **Survival Mode Tactical** (thesurvivalmode.com): robots.txt disallows its search (search.php)
- **Stampede Tactical (Holy Cowz Airsoft)** (stampedetactical.com): robots.txt disallows its search (search.php)
- **KWA USA** (store.kwausa.com): Cloudflare bot check
- **G&G Armament (101 Tech USA)** (101techusa.com): robots.txt disallows its search
- **Elite Force Airsoft** (www.eliteforceairsoft.com): no search results page; its items are price-checked through Umarex USA (same company)
- **PTS Syndicate** (www.ptssyndicate.com): brand site with no product feed
- **ANSgear** (ansgear.com): robots.txt disallows its search (search.php)
- **Pyramyd AIR** (www.pyramydair.com): no plain search page or public feed; mostly pellet airguns
- **Airgun Depot** (www.airgundepot.com): robots.txt disallows its search
- **SKD Tactical** (skdtac.com): robots.txt disallows its search (search.php)
- **OpticsPlanet** (www.opticsplanet.com): bot check ("Before we continue")

**Fields & pro shops (23).** Fields and arenas with no online shop are listed in their own group on the Stores tab: StrikeForce Sports (www.strikeforcesports.net), Ricochet Tactical (ricochettactical.com), Battalion Airsoft Arena (www.battalionairsoftarena.com), Gamepod Combat Zone (combatzonecqc.com), West Coast Adventure Park (westcoastadventurepark.com), Miami Airsoft (miamiairsoft.com), Raptor Airsoft (raptorairsoft.com), High Ground Airsoft (highgroundairsoft.com), Motor City Airsoft (www.motorcityairsoft.com), Gunny's Warfare Center (www.gunnyswarfarecenter.com), Futureball (www.futureball.com), Xtreme Kombat (Xtreme Adventure Park) (xtremeparkadventures.com), 878 Airsoft (878airsoft.com), ForestFire Airsoft (forestfireairsoft.com), Power Ops Airsoft (www.poweropsairsoft.com), D14 Airsoft (d14airsoft.com), UBG Airsoft (ubgllc.com), Texas Paintball & Airsoft (www.txpb.com), Replay Airsoft (www.replayairsoft.com), Black Ops Airsoft (www.blackops-airsoft.com), Paintball & Airsoft Station (WA) (www.paintballstation.com), Tactical Airsoft Supply / Airsoft Arena (801airsoft.com), Modern Airsoft (modernairsoft.com).

**Excluded by vetting (not shown or linked anywhere):**
- **Clandestine Airsoft:** No business address or phone on the site (contact form/email only) and none found in business listings; previously a live store, now removed.
- **Krytac:** No return or shipping policy found for direct online orders (only a warranty page that routes RMAs to Evike).
- **US Airsoft:** Site is a JavaScript app; return/shipping/privacy policies could not be confirmed.
- **Airsoft Master:** No privacy policy page found (terms cover shipping/returns only).
- **Lancer Tactical:** No privacy policy page found on its Wix store (returns are only described in its FAQ).
- **ActionSportGames (ASG):** Brand distributor site with no address/phone we could confirm and no direct sales.
- **Thunder Kiss NW:** Contact page and home page show no address or phone we could confirm.
- **OPSGEAR:** Reputation: Trustpilot 2.9 (1,076) with shipping/no-tracking complaints, Yelp lists it closed (1.3), a forum "scam" thread; no address/phone on the site.
- **Monk Customs (US):** Reputation: Reddit reports of wrong/undelivered orders and unresponsive support; no address or phone on the site.
- **Tapp Airsoft:** No business address or phone anywhere on the site or its policies (email only).
- **The Real Deal Airsoft:** No refund, shipping or privacy policy pages.
- **Umbrella Armory:** umbrellaarmory.com now redirects to an unrelated German .eu site; the official domain could not be confirmed.
- **Valken Sports:** HTTPS handshake fails (from our box and an outside fetcher), so a valid certificate could not be confirmed.
- **LA Capa Customs:** HTTPS handshake fails (from our box and an outside fetcher).
- **Code Red Airsoft Park:** No working HTTPS (site is served over plain http only).
- **Ohio Valley Airsoft:** TLS certificate does not match the domain.
- **CartCon1 Airsoft:** cartcon1 domains redirect to a different name (Battle Ridge) behind a bot check; could not confirm it is the same business.
- **Frontier Fortress:** Domain shows a blank page and is not the site listed for the field (only directory/Facebook listings); official site not confirmed.
- **Camp R&R:** Site returns a server error (HTTP 500) to every request; could not be checked.
- **US Patriot Tactical:** Not an airsoft store (military uniforms and boots); its product JSON is closed.

**Skipped (dead, parked, closed or no website):**
- Full Auto Airsoft: faairsoft.com shows "This store is unavailable" (Shopify store closed)
- Airsoft Gateway: airsoftgateway.com Shopify store is "Unavailable Shop"
- Sector 7 Airsoft: sector7airsoft.com is a parked domain; no other site found
- Stampede Airsoft: stampedeairsoft.com is parked; the business is Stampede Tactical (linked)
- UBG Airsoft (ubgairsoft.com): ubgairsoft.com is parked; the business uses ubgllc.com (linked)
- Dreadnought Airsoft: permanently closed
- Stryker Airsoft: permanently closed June 2024 (site is now StrikeForce NJ)
- Cincinnati Airsoft: no website found (only a 2009 LLC registration)
- Palmetto Edge Airsoft: no website found
- Wild West Airsoft: no website found (Reddit mentions only)
- Allstar Airsoft: no website found (directory listings only)
- Ambush Airsoft: no US website found (ambushairsoft.com does not exist; a UK field uses .co.uk)
- Zulu 24 Airsoft: Facebook/Instagram only
- Poco Loco Airsoft: Facebook only
- Holy Cowz Airsoft: Facebook only; its shop is Stampede Tactical (linked)
- Bloomies Airsoft: no own website (sells through HopUp)
- Sherlock Tech: no airsoft business found under this name
- AEX Portland: no such store; AEX (Airsoft Extreme) is California-only and already live
- American Airsoft: no matching business; americanairsoftfactory.com does not resolve
- Survival Mode Airsoft (survivalmodeairsoft.com): domain does not exist; the business is thesurvivalmode.com (linked)

Earlier rounds also dropped Just Airsoft Guns, Xtreme Airsoft Superstore, Liberty Tactical, GI Tactical, Airsoft Tactical and Elite Tactical Supply (parked or non-resolving domains).

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
API: `GET /api/search?q=glock`, `GET /api/deals`, `GET /api/drops`, `GET /api/browse?cat=pistols`, `GET /api/suggest?q=glo`, `GET /api/stores`.

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
The header wordmark uses **Dancing Script** (SIL Open Font License 1.1), subset to just the wordmark's letters (6 KB). It's self-hosted at `public/fonts/` so it also works offline in the installed app. The license is in `public/fonts/OFL.txt`.

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

## Price history (free, survives restarts)

Render's free plan has no disk, so price history lives in the repo:

- **Collector.** `deploy/price-history.yml` (move it to `.github/workflows/` to enable; pushing workflow files needs a token with the `workflow` scope) runs `scripts/collect-history.js` on GitHub Actions at 5:17 AM and 5:17 PM US Central (free for public repos). It uses the same compliant routes as the app: robots.txt-allowed endpoints, an honest User-Agent, each store's Crawl-delay or at least 2 s between requests, and no bot-check evasion. Shopify stores and Wolverine are read from their public catalog JSON; catalog-indexed stores are crawled as before; HTML-search-only stores are sampled with a fixed list of searches.
- **Storage.** `data/history/<store>.json`, one product per line: `"<key>":["2026-11-16",129.99,"2026-11-20",119.99]`. The key is a hash of the normalized product URL. A point is added only when the price changes, so files stay small (about 600 KB for 16,000 products) and each commit only touches changed lines. `drops.json` lists recent drops with titles and images; `index.json` has the run time.
- **Server.** Loads the bundled copy at boot, then pulls the latest from `raw.githubusercontent.com` 45 s after boot and every 3 hours (`HISTORY_RAW_BASE` overrides the URL). A live price that differs from the last recorded one counts as a new point.
- **Honesty.** Nothing is back-filled. With one recorded price the app says "Tracking since <date>"; arrows (▼ green = cheaper, ▲ red = pricier, vs. the previous recorded price) appear only after a real change.
- Run it by hand: `node scripts/collect-history.js [storeId ...]`. `scripts/history-loop.sh` runs the collector twice a day on any always-on machine and pushes the data (used on the build box until the Actions workflow is enabled).

## Categories, brands and airsoft-only (`server/classify.js`, `server/brands.js`)
- **Categories:** Rifles/AEG, Pistols/GBB, Snipers, Magazines, Holsters, Gear, Optics, Parts, Batteries, BBs, Gas & CO2, Other. The classifier uses the store's own product type/categories, title keywords with negative rules (a magazine "for M4" is a magazine; M4/AK/AEG/rifle/carbine/SMG/shotgun is never a pistol; accessory words after the gun word win, "w/ 2 mags" bundles stay guns), known model names (Glock, Hi-Capa, 1911, M9, USP, P226, MK23 → pistols; VSR-10, SSG, L96, SRS, TAC-41 → snipers) and price sanity. Low confidence goes to "Other". `npm test` runs 184 labelled titles (99.5%) plus 115 titles labelled blind before tuning (first-pass accuracy 86.6% and then 93.8%; 100% now) and 176 airsoft keep/drop cases.
- **Brands:** the user's 226-brand list (`data/brand-list-from-user.txt`) with slash-names as aliases ("Elite Force / Umarex", "UTG / Leapers"…). Title first, then the store's vendor field; text after "for/fits/compatible" is ignored; ordinary-word brands (BOLT, MAG, STAR, WELL, Matrix…) match only at the start of a title. Licensed firearm names (Glock, SIG, H&K, FN, Colt…) count only on airsoft guns/mags and lose to the airsoft maker ("Glock 17 by Umarex" is Elite Force/Umarex). A brand chip/page appears only once a live listing matches it.
- **Airsoft only:** every listing from every store (search, deals, categories, brands, price drops, history collector) passes `isAirsoft()`. It drops fishing, real-firearm items, knives/tools, food/drink, toys/collectibles, paintball/gel/foam blasters, .177/.22 pellet and steel-BB airguns, general apparel, gift cards, events/rentals/insurance/mystery boxes, and anything uncategorised without an airsoft signal. Drop counts per store and reason are in `/api/stores` → `airsoftFilter`.

## Matching
Listings are grouped as one product only when accessory type words agree, generation/mark/version tokens match exactly (Gen 4 ≠ Gen 5), model numbers agree, platform agrees (CO2 ≠ gas), explicit colors don't conflict, distinct-variant words (Match, Custom, CRB, SPR, MOS, …) don't differ, prices are within 1.6×, and titles overlap strongly. Brand spellings are normalized (TM = Tokyo Marui, Umarex = Elite Force, G&G).

## Front end
Amazon-style layout in the galaxy theme: full-width search with category dropdown and autocomplete, category row, filter sidebar (sheet on phones), product cards with price-change arrows and sparklines, buy box, store comparison table and price-history chart. The server minifies JS/CSS with esbuild at boot, inlines the CSS, and serves brotli/gzip pre-compressed assets and JSON.

## Legitimacy vetting

`node scripts/vet.js [ids...]` checks every entry in `data/vetting-input.json` and writes `data/vetting.json`. Each entry records the domain, every check with its result, the verdict, and the date. The checks:

- **Official domain:** confirmed by cross-reference (brand pages, dealer lists, business listings), plus an automatic lookalike test (edit distance ≤ 1 against every other vetted domain, punycode rejected).
- **DNS and HTTPS:** real DNS over HTTPS, a valid certificate, and no 5xx errors.
- **Domain age** from RDAP. Anything under 1 year old is flagged.
- **Contact:** a contact page plus a real address or phone, from the site's own pages (or recorded manual evidence with a source).
- **Policies:** return, shipping and privacy pages.
- **Pricing:** fails if 25% or more of items are priced at 40% or less of their compare-at price.
- **Reputation:** Trustpilot, BBB, Reddit and Yelp, recorded per entry.
- **Scam lists:** HaGeZi fake/TIF, BlocklistProject scam/fraud/phishing, Phishing.Database, OpenPhish.

Anything failing or doubtful is excluded entirely, not linked. `server/vetting.js` builds the allowlist from passing entries. `server/http.js` refuses to fetch anything else, `server/deals.js` drops any offer whose link isn't vetted, and marketplaces, fields and link-only stores are all built from the allowlist. You can see the full record at `/api/vetting`. To re-check, run `node scripts/vet.js`, or `node scripts/vet.js <id> ...` for specific entries.

## Ask Grok (buyer's verdict)

Every product card and product page has an **Ask Grok** button. It opens a sheet with a verdict (Good / Decent / Skip), a 1–10 score, pros and cons, who it's for, and a price check against the best price, store average and the price history we track.

- **With `XAI_API_KEY` set on Render:** `POST /api/verdict` asks the xAI Grok API (`https://api.x.ai/v1/chat/completions`, OpenAI-compatible) server-side. The default model is `grok-4.20-0309-non-reasoning`; set `XAI_MODEL` to change it. The prompt includes the title, brand, category, current offers and our history, and tells the model to be honest and to say when it's unsure. Answers are labeled "AI-generated by Grok".
- **Cost controls:** answers are cached per product for 14 days, so repeat clicks are instant and free. New AI answers are limited to `XAI_PER_IP` per IP per 10 minutes (default 8) and `XAI_DAILY_CAP` per day (default 400). Past a limit, the user gets the quick take instead.
- **Without a key:** the app shows a rule-based **"Quick take (AI not connected)"** built from brand reputation tiers (`server/verdict.js`), price versus other stores, and price history. It is never presented as an AI answer.
- `GET /api/verdict/info` shows whether AI is connected, the model, and how many answers are cached.

## Shopify rate limits (HTTP 429)

Shopify sometimes rate-limits the server's IP across all Shopify storefronts at once. `server/http.js` honors 429s: it backs off each host for its `Retry-After` (60 s by default, doubling up to 15 min), serves the last good copy it has, and runs Shopify requests four at a time. While a Shopify store's live search is unavailable, its results come from a bundled catalog snapshot (`server/snapshot/shopify-<id>.json.gz`). The price-history collector writes that snapshot from the same public `/products.json` route, and the search status says which date the prices are from.

## Live price check on every visit

Every page view shows saved prices first. It then calls `GET /api/refresh`, and the server re-checks every store that hasn't been checked in the last `REFRESH_MIN_MS` (default 15 minutes) in one shared background cycle (`server/refresh.js`). Visitors who arrive during a cycle join it instead of starting another one, and cycles are at least `REFRESH_GAP_MS` apart (default 60 s).

- **What a cycle re-checks:** the deals feed, plus the searches, categories and brand pages people viewed in the last 30 minutes. It uses the normal polite routes: robots.txt-allowed endpoints, an honest User-Agent, the Shopify 4-at-a-time pool and Retry-After/429 backoff. A rate-limited store keeps its last-checked time and is retried when its backoff ends. A store counts as "checked" only when its site actually answered, not when a cached copy was reused.
- **Catalog stores** (Airsoft Extreme, Amped, Airsoft GI) follow their own crawl schedule, with their Crawl-delay, and are never re-crawled per visit.
- **The page** polls `GET /api/refresh/status` every 2.5 s while a cycle runs. When its own results are recomputed, changed cards update in place with a short green (price down) or red (price up) flash. The status line under the header reads, for example, "Checking 24 stores… 18 updated · 12s ago" or "Checked 2 min ago · 21/21 stores · 15 rate-limited, last 12:16 AM". Tap it for each store's state.
- **Product pages** re-check that product's offers directly when they're older than `PRODUCT_RECHECK_MS` (default 5 minutes) via `POST /api/recheck`. Shopify stores use `/products/<handle>.js`, after a robots.txt check that is cached for 12 h; other live stores are re-searched by title.
- **History:** prices seen live are added to the in-memory price history right away, so arrows reflect them. The collector still commits history to the repo twice a day.
- **Cold start:** when Render wakes the server, a full cycle starts within a second.
