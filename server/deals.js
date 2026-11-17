// Deal detection + fuzzy cross-store grouping ("same product at different stores").
const STOP = new Set(['airsoft', 'the', 'and', 'for', 'with', 'w', 'by', 'a', 'of', 'new', 'version', 'ver', 'edition', 'in', 'gun', 'replica', 'full', 'metal']);
const TYPE_WORDS = { magazine: 'mag', mag: 'mag', mags: 'mag', magazines: 'mag', bb: 'bb', bbs: 'bb', holster: 'holster', battery: 'battery', charger: 'charger', barrel: 'barrel', hopup: 'hopup', 'hop-up': 'hopup', gearbox: 'gearbox', motor: 'motor', sling: 'sling', scope: 'optic', sight: 'optic', grip: 'grip', handguard: 'handguard', rail: 'handguard', vest: 'vest', carrier: 'vest', pouch: 'pouch', patch: 'patch', mask: 'mask', goggles: 'goggles', spring: 'spring', piston: 'piston', trigger: 'trigger', stock: 'stock', silencer: 'muzzle', suppressor: 'muzzle', tracer: 'muzzle', gas: 'gas', propane: 'gas', co2: 'co2', cartridge: 'co2', speedloader: 'loader', loader: 'loader', kit: 'kit', parts: 'parts', set: 'kit' };
const PLATFORMS = { aeg: 'aeg', gbb: 'gbb', gbbr: 'gbb', blowback: 'gbb', hpa: 'hpa', spring: 'spring', aep: 'aep', co2: 'co2' };

const words = (s) => String(s).toLowerCase().replace(/["'’]/g, '').replace(/[^a-z0-9.]+/g, ' ').trim().split(/\s+/).filter(Boolean);
function features(p) {
  const w = words(`${p.brand || ''} ${p.title}`.replace(/\b(gen|mk|mod|ver|v)\s+(\d+)/gi, '$1$2'));
  const toks = new Set(w.filter((t) => t.length > 1 && !STOP.has(t)));
  const types = new Set(w.map((t) => TYPE_WORDS[t]).filter(Boolean));
  const nums = new Set(w.filter((t) => /\d/.test(t) && t !== 'co2'));
  return { toks, types, nums };
}
const jaccard = (a, b) => { let i = 0; for (const t of a) if (b.has(t)) i++; return i / (a.size + b.size - i || 1); };
const sameSet = (a, b) => a.size === b.size && [...a].every((x) => b.has(x));

// Two listings are "the same product" only if titles overlap strongly, the accessory type
// words agree (a magazine never matches a pistol), model numbers agree, and prices are close.
function isMatch(a, fa, b, fb) {
  if (a.storeId === b.storeId) return false;
  if (!sameSet(fa.types, fb.types)) return false;
  if (fa.nums.size && fb.nums.size && jaccard(fa.nums, fb.nums) < 0.5) return false;
  const hi = Math.max(a.price, b.price), lo = Math.min(a.price, b.price);
  if (hi / lo > 1.6) return false;
  return jaccard(fa.toks, fb.toks) >= 0.55;
}

function platformOf(title) {
  for (const t of words(title)) if (PLATFORMS[t]) return PLATFORMS[t].toUpperCase();
  return null;
}

function enrich(p, store) {
  // A "was" price more than 80% above the sale price is almost always a placeholder/MSRP typo; ignore it.
  if (p.originalPrice && p.price && (p.originalPrice - p.price) / p.originalPrice > 0.8) p = { ...p, originalPrice: null };
  const discountPct = p.originalPrice && p.price ? Math.round(((p.originalPrice - p.price) / p.originalPrice) * 100) : 0;
  const savings = p.originalPrice && p.price ? +(p.originalPrice - p.price).toFixed(2) : 0;
  return { ...p, store: store.name, storeId: store.id, discountPct, savings, onSale: discountPct > 0 || !!p.storeDeal };
}

let gid = 0;
function groupProducts(items) {
  const f = items.map(features);
  const used = new Array(items.length).fill(false);
  const groups = [];
  for (let i = 0; i < items.length; i++) {
    if (used[i]) continue;
    used[i] = true;
    const members = [i];
    for (let j = i + 1; j < items.length; j++) {
      if (used[j] || members.some((m) => items[m].storeId === items[j].storeId)) continue;
      if (members.every((m) => isMatch(items[m], f[m], items[j], f[j]))) { members.push(j); used[j] = true; }
    }
    const offers = members.map((m) => items[m]).sort((a, b) => a.price - b.price);
    const best = offers[0];
    const avg = offers.reduce((s, o) => s + o.price, 0) / offers.length;
    for (const o of offers) {
      o.vsAvg = +(o.price - avg).toFixed(2);
      o.vsAvgPct = Math.round(((o.price - avg) / avg) * 100);
    }
    const badges = [];
    if (offers.length > 1 && offers[1].price > best.price) badges.push(`LOWEST OF ${offers.length}`);
    if (best.discountPct >= 30) badges.push('HOT DEAL');
    if (best.discountPct > 0) badges.push(`${best.discountPct}% OFF`);
    else if (best.storeDeal) badges.push('STORE DEAL');
    groups.push({
      id: 'g' + (++gid).toString(36),
      title: best.title,
      brand: offers.find((o) => o.brand)?.brand || null,
      platform: platformOf(best.title),
      images: [...new Set(offers.map((o) => o.image).filter(Boolean))],
      offers,
      storeCount: offers.length,
      bestPrice: best.price,
      bestStore: best.store,
      avgPrice: +avg.toFixed(2),
      belowAvgPct: offers.length > 1 ? Math.round(((avg - best.price) / avg) * 100) : 0,
      listPrice: best.originalPrice || null,
      discountPct: best.discountPct,
      savings: best.savings,
      inStock: offers.some((o) => o.inStock === true) ? true : offers.every((o) => o.inStock === false) ? false : null,
      onSale: best.onSale || (offers.length > 1 && offers[1].price > best.price),
      badges,
    });
  }
  return groups;
}

module.exports = { enrich, groupProducts };
