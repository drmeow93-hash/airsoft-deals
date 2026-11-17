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

// ---- Ask Grok: AI answer parsing + rule-based quick take (no network) ----
{
  delete process.env.XAI_API_KEY;
  const v = require('../server/verdict');
  const fails = []; let n = 0;
  const ok = (cond, msg) => { n++; if (!cond) fails.push('  ' + msg); };
  const a = v.parseJson('Sure! {"verdict":"Good","score":8.4,"summary":"Solid.","pros":["a","b","c","d","e"],"cons":[],"whoFor":"x","confidence":"high","unsure":null}');
  ok(a.verdict === 'Good' && a.score === 8 && a.pros.length === 4, 'parses fenced JSON, rounds score, caps lists');
  let threw = false; try { v.parseJson('{"verdict":"Amazing","score":11}'); } catch { threw = true; }
  ok(threw, 'rejects an unknown verdict');
  const p = (b, extra = {}) => v.clean({ title: 'X', brand: b, bestPrice: 100, avgPrice: 100, offers: [{ store: 'A', price: 100 }], ...extra });
  ok(v.quickTake(p('Tokyo Marui')).verdict === 'Good', 'premium brand -> Good');
  ok(v.quickTake(p('Double Eagle')).verdict === 'Skip', 'toy-grade brand -> Skip');
  ok(v.quickTake(p('Nobody Knows')).confidence === 'low', 'unknown brand -> low confidence');
  ok(v.tierOf('Angel Custom', 'Angel Custom barrel for Tokyo Marui') !== 'premium', 'brand field beats a "for Tokyo Marui" title');
  ok(v.clean({ title: 'a'.repeat(500), offers: [{ store: 'A', price: -5 }, { store: 'B', price: 'x' }] }).offers.length === 0, 'drops bad prices');
  v.verdict({ title: 'Tokyo Marui Hi-Capa' }, '1.2.3.4').then((r) => {
    ok(r.body.kind === 'quick' && /AI not connected/.test(r.body.label), 'no key -> labeled quick take, never an AI answer');
    console.log(`Ask Grok: ${n - fails.length}/${n} checks pass`);
    fails.forEach((m) => console.log(m));
    if (fails.length) process.exitCode = 1;
  });
}
