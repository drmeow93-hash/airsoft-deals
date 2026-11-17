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
