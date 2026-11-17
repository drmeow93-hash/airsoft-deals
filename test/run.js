// node test/run.js — category accuracy + airsoft filter checks.
const { classify, isAirsoft } = require('../server/classify');
const cases = require('./cases');
const real = require('./real-sample.json');
let ok = 0, n = 0; const misses = [];
const cat = (title, ptype, price, want, src) => {
  n++; const got = classify({ title, ptype, price }).cat;
  if (got === want) ok++; else misses.push(`  [${src}] want ${want}, got ${got}: ${title}${ptype ? ` (type: ${ptype})` : ''}`);
};
for (const [t, want, price] of cases.categories) cat(t, '', price, want, 'edge');
for (const r of real) if (r.cat) cat(r.title, r.ptype, r.price, r.cat, r.store);
console.log(`Category accuracy: ${ok}/${n} = ${(100 * ok / n).toFixed(1)}%`);
misses.forEach((m) => console.log(m));
let aok = 0, an = 0; const amiss = [];
const air = (title, ptype, want) => { an++; const r = isAirsoft({ title, ptype }); if (r.ok === want) aok++; else amiss.push(`  want ${want ? 'keep' : 'drop'}, got ${r.ok ? 'keep' : 'drop (' + r.reason + ')'}: ${title}`); };
for (const [t, ty, want] of cases.airsoft) air(t, ty, want);
for (const r of real) air(r.title, r.ptype, r.airsoft !== false);
console.log(`Airsoft filter: ${aok}/${an} = ${(100 * aok / an).toFixed(1)}%`);
amiss.forEach((m) => console.log(m));
process.exitCode = ok / n >= 0.9 && aok / an >= 0.95 ? 0 : 1;
// Samples 2 and 3, each labelled blind before any tuning on it (first blind passes: 58/67 = 86.6%, then 45/48 = 93.8%).
const held = require('./heldout-sample.json');
let hok = 0;
for (const r of held) { const p = { title: r.title, ptype: r.ptype, price: r.price }; const a = isAirsoft(p); const good = r.airsoft === false ? !a.ok : a.ok && classify(p).cat === r.cat; if (good) hok++; else console.log(`  [held-out] want ${r.cat || 'drop'}, got ${classify(p).cat}${a.ok ? '' : ' (dropped: ' + a.reason + ')'}: ${r.title}`); }
console.log(`Held-out sample: ${hok}/${held.length} = ${(100 * hok / held.length).toFixed(1)}%`);

// Vetting allowlist: every store, link, field and marketplace the app uses passed vetting, and
// anything else (excluded entries, lookalikes, random domains) is refused for scraping and links.
{
  const { isVetted, doc } = require('../server/vetting');
  const { stores, skipped, fields, reviews } = require('../server/stores');
  const mk = require('../server/marketplaces').list();
  const vfail = []; let nv = 0;
  const must = (url, want, why) => { nv++; if (isVetted(url) !== want) vfail.push(`  ${want ? 'should allow' : 'should block'} ${url} (${why})`); };
  for (const s of stores) must(s.base, true, 'live store');
  for (const s of [...skipped, ...fields, ...reviews]) must(s.url, true, 'link');
  for (const m of mk) must(m.url, true, 'marketplace');
  for (const e of doc.entries.filter((x) => x.kind === 'excluded')) must(e.url, false, 'excluded: ' + e.failed[0].slice(0, 60));
  for (const u of ['https://evike-airsoft-sale.shop', 'https://www.evlke.com', 'https://airsoftgi.com.deals.xyz', 'https://foxairsoft.myshopify.com', 'https://example.com', 'ftp://www.evike.com']) must(u, false, 'not vetted');
  must('https://store.ssairsoft.com/products/x', true, 'subdomain of vetted root');
  must('https://vipairsoft.myshopify.com/products/x', true, 'exact shared-platform host');
  console.log(`Vetting allowlist: ${nv - vfail.length}/${nv} checks pass`);
  vfail.forEach((m) => console.log(m));
  if (vfail.length) process.exitCode = 1;
}

// ---- Score /10: AI answer parsing + labeled estimate (no network) ----
{
  delete process.env.XAI_API_KEY;
  const v = require('../server/verdict');
  const fails = []; let n = 0;
  const ok = (cond, msg) => { n++; if (!cond) fails.push('  ' + msg); };
  const a = v.parseJson('Sure! {"verdict":"Good","score":8.4,"summary":"Solid.","subscores":{"build":9,"performance":null,"value":"7","reliability":12},"pros":["a","b","c","d","e"],"cons":[],"issues":[{"issue":"Mag leaks","fix":"Oil gaskets"},{"fix":"no issue text"}],"reviewSummary":"x","whoFor":"x","confidence":"high","unsure":null}');
  ok(a.verdict === 'Good' && a.score === 8 && a.pros.length === 4, 'parses fenced JSON, rounds score, caps lists');
  ok(a.sub.build === 9 && a.sub.performance === null && a.sub.value === 7 && a.sub.reliability === 10, 'sub-scores: clamps to 1-10, keeps null');
  ok(a.issues.length === 1, 'drops issues without text');
  let threw = false; try { v.parseJson('{"verdict":"Amazing","score":11}'); } catch { threw = true; }
  ok(threw, 'rejects an unknown verdict');
  const p = (b, extra = {}) => v.clean({ title: 'X', brand: b, bestPrice: 100, avgPrice: 100, offers: [{ store: 'A', price: 100 }], ...extra });
  ok(v.quickTake(p('Tokyo Marui')).verdict === 'Good', 'premium brand -> Good');
  ok(v.quickTake(p('Double Eagle')).verdict === 'Skip', 'toy-grade brand -> Skip');
  ok(v.quickTake(p('Nobody Knows')).score === null, 'unknown brand, no reviews -> no score (never a made-up number)');
  ok(v.quickTake(p('Nobody Knows'), { avg: 4.6, count: 8, sources: [] }).score >= 7, 'unknown brand with real 4.6/5 ratings -> scored from them');
  ok(v.quickTake(p('Tokyo Marui'), { avg: 2, count: 10, sources: [] }).score < v.quickTake(p('Tokyo Marui')).score, 'bad real ratings pull the score down');
  ok(v.tierOf('Angel Custom', 'Angel Custom barrel for Tokyo Marui') !== 'premium', 'brand field beats a "for Tokyo Marui" title');
  ok(v.tierOf('', 'Gun works well') === 'unrated', 'a maker name must lead the title ("works well" is not WELL)');
  const gbb = v.quickTake(v.clean({ title: 'VFC Glock 17 GBB', brand: 'VFC', cat: 'pistols', platform: 'GBB', bestPrice: 150, offers: [{ store: 'A', price: 150 }] }));
  ok(gbb.issues.some((x) => /leak/i.test(x.issue)) && /in general/.test(gbb.issuesScope), 'GBB -> gas-leak issues, labeled as general guidance');
  ok(gbb.sub.upgradeability === 9, 'Glock platform -> high upgradeability');
  ok(v.clean({ title: 'a'.repeat(500), offers: [{ store: 'A', price: -5 }, { store: 'B', price: 'x' }] }).offers.length === 0, 'drops bad prices');
  ok(v.reviewSummary(null).count === 0 && /reviews/.test(v.reviewSummary(null).text), 'no reviews -> says so, no quotes');
  v.verdict({ title: 'Tokyo Marui Hi-Capa', brand: 'Tokyo Marui' }, '1.2.3.4').then((r) => {
    ok(r.body.kind === 'estimate' && /AI analysis not connected/.test(r.body.label) && r.body.aiAvailable === false, 'no key -> labeled estimate, never an AI answer');
    console.log(`Score/Ask Grok: ${n - fails.length}/${n} checks pass`);
    fails.forEach((m) => console.log(m));
    if (fails.length) process.exitCode = 1;
  });
}

// ---- Real reviews: Judge.me + JSON-LD parsers (fixtures shaped like the stores' pages) ----
{
  const R = require('../server/reviews');
  const fails = []; let n = 0;
  const ok = (cond, msg) => { n++; if (!cond) fails.push('  ' + msg); };
  const jdgm = `<style>.jdgm-prev-badge[data-average-rating='0.00']{display:none}</style><div class='jdgm-rev-widg' data-average-rating='4.80' data-number-of-reviews='5'>
    <div class='jdgm-rev jdgm-divider-top' data-verified-buyer='true' data-product-url='/products/trigger'> <span class='jdgm-rev__rating' data-score='5'></span><time class='jdgm-rev__timestamp' datetime='2025-10-11T00:00:00Z'></time><span class='jdgm-rev__author'>U.C.</span><b class='jdgm-rev__title'>Good quality</b><div class='jdgm-rev__body'><p>Good quality &amp; good functionality.</p></div></div>
    <div class='jdgm-rev jdgm-divider-top' data-verified-buyer='false' data-product-url='/products/other-item'> <span class='jdgm-rev__rating' data-score='1'></span><div class='jdgm-rev__body'><p>Store-wide review of another item</p></div></div></div>`;
  const j = R.parse(jdgm, 'https://wgcshop.com/products/trigger');
  ok(j && j.avg === 4.8 && j.count === 5, 'Judge.me summary from the widget, not the CSS rule');
  ok(j.reviews.length === 1 && j.reviews[0].text === 'Good quality & good functionality.' && j.reviews[0].verified, 'keeps only this product\'s reviews, decodes text');
  const ld = `<script type="application/ld+json">{"@type":"Product","aggregateRating":{"@type":"AggregateRating","ratingValue":"9","reviewCount":"4","bestRating":"10"},"review":[{"@type":"Review","author":{"@type":"Person","name":"G"},"datePublished":"2021-01-27","description":"Product Information:\\r\\nGreat gun. Pros: Cons:","reviewRating":{"ratingValue":"5"}}]}</script>`;
  const l = R.parse(ld, 'https://www.airsoftgi.com/product/x/');
  ok(l && l.avg === 4.5 && l.count === 4 && l.reviews[0].text === 'Great gun.', 'JSON-LD rating normalized to /5, boilerplate stripped');
  ok(R.parse('<html>no reviews</html>', 'https://x.com/p') === null, 'no review data -> null (nothing invented)');
  ok(R.parse('<script type="application/ld+json">{"@type":"Review","reviewBody":"orphan"}</script>', 'https://x.com/p') === null, 'loose reviews without a store rating summary are not shown');
  console.log(`Review parsers: ${n - fails.length}/${n} checks pass`);
  fails.forEach((m) => console.log(m)); if (fails.length) process.exitCode = 1;
}

// ---- Images: URL repair + image proxy allowlist ----
{
  const { fixImage } = require('../server/deals');
  const { allowedUrl } = require('../server/imgproxy');
  const cases = [
    [fixImage('image/cache.search/catalog/A-480x480.jpg', 'https://www.airsoftmegastore.com'), 'https://www.airsoftmegastore.com/image/cache.search/catalog/A-480x480.jpg'],
    [fixImage('//cdn.shopify.com/s/x.jpg', 'https://a.com'), 'https://cdn.shopify.com/s/x.jpg'],
    [fixImage('http://www.redwolfairsoft.com/x.jpg', 'https://www.redwolfairsoft.com'), 'https://www.redwolfairsoft.com/x.jpg'],
    [fixImage('data:image/gif;base64,R0l', 'https://a.com'), null],
    [!!allowedUrl('https://cdn.shopify.com/s/files/1/x.jpg'), true],
    [!!allowedUrl('https://www.airsoftmegastore.com/image/x.jpg'), true],
    [!!allowedUrl('https://evil.example.com/x.jpg'), false],
    [!!allowedUrl('http://cdn.shopify.com/x.jpg'), false],
  ];
  const bad = cases.filter(([got, want]) => got !== want);
  console.log(`Images: ${cases.length - bad.length}/${cases.length} checks pass`);
  bad.forEach((c) => console.log('  wrong:', c)); if (bad.length) process.exitCode = 1;
}

// ---- Live refresh: robots matcher for per-product re-checks ----
{
  const { allowed } = require('../server/robots');
  const R = 'User-agent: *\nDisallow: /products/*?pr_prod_strat=*\nDisallow: /cart\nAllow: /products/account\n\nUser-agent: airsoftdealsfinder\nDisallow: /private';
  const cases = [['/products/glock.js', true], ['/products/glock?pr_prod_strat=x', true], ['/cart', true], ['/private/x', false], ['/products/x.js', true]];
  // our UA has its own group, so only "/private" applies to us
  const bad = cases.filter(([p, want]) => allowed(R, p) !== want);
  const bad2 = [['/cart', false], ['/products/glock.js', true], ['/products/a?pr_prod_strat=1', false]].filter(([p, want]) => allowed(R.split('\n\n')[0], p) !== want);
  console.log(`Robots matcher: ${8 - bad.length - bad2.length}/8 checks pass`);
  [...bad, ...bad2].forEach((c) => console.log('  wrong:', c));
  if (bad.length || bad2.length) process.exitCode = 1;
}
