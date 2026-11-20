const { isVetted } = require('./vetting');
// Deal detection, categories, and cross-store grouping ("the same product at different stores").
const { thumb } = require('./http');
const history = require('./history');
const { classify, isAirsoft } = require('./classify');
const brands = require('./brands');

const STOP = new Set(['airsoft', 'the', 'and', 'for', 'with', 'w', 'by', 'a', 'of', 'new', 'version', 'ver', 'edition', 'in', 'gun', 'replica', 'full', 'metal', 'licensed', 'official', 'officially', 'trademarked', 'series', 'model', 'style', 'type', 'package', 'pistol', 'rifle', 'airgun', 'bb', 'electric', 'gas', 'blowback', 'blow', 'back', 'gbb', 'gbbr', 'aeg', 'co2', 'powered', 'semi', 'auto', 'automatic', 'only', 'sale', 'deal', 'clearance', 'free', 'shipping', 'us', 'usa', 'kit', 'set', 'w/', 'x1', 'from', 'on', 'to']);
const COLORS = new Set(['black', 'blk', 'bk', 'tan', 'fde', 'de', 'od', 'green', 'grey', 'gray', 'coyote', 'brown', 'ranger', 'multicam', 'silver', 'white', 'red', 'blue', 'pink', 'sand', 'desert', 'foliage', 'olive', 'bronze', 'cerakote', 'tone', 'two', 'dark', 'earth', 'flat', 'wolf']);
const TYPE_WORDS = { magazine: 'mag', mag: 'mag', mags: 'mag', magazines: 'mag', bbs: 'bb', holster: 'holster', battery: 'battery', charger: 'charger', barrel: 'barrel', hopup: 'hopup', gearbox: 'gearbox', motor: 'motor', sling: 'sling', scope: 'optic', sight: 'optic', dot: 'optic', grip: 'grip', handguard: 'handguard', rail: 'handguard', vest: 'vest', carrier: 'vest', pouch: 'pouch', patch: 'patch', mask: 'mask', goggles: 'goggles', spring: 'spring', piston: 'piston', trigger: 'trigger', stock: 'stock', silencer: 'muzzle', suppressor: 'muzzle', tracer: 'muzzle', propane: 'gasfill', speedloader: 'loader', loader: 'loader', parts: 'parts', bucking: 'bucking', nozzle: 'nozzle', tank: 'tank', regulator: 'reg', case: 'case', bag: 'case', helmet: 'helmet', gloves: 'gloves', light: 'light', flashlight: 'light', laser: 'laser', cartridges: 'co2cart', cartridge: 'co2cart', shell: 'shell', shells: 'shell' };
// Brand spellings that mean the same maker.
const ALIASES = [[/\btokyo\s*marui\b|\btm\b/g, 'tokyomarui'], [/\bg\s*&\s*g\b|\bg and g\b|\bgng\b/g, 'gandg'], [/\belite\s*force\b|\bumarex\b/g, 'eliteforce'], [/\bwe[\s-]*tech\b/g, 'we'], [/\bhi[\s-]*capa\b/g, 'hicapa'], [/\bm4\s*a1\b/g, 'm4a1'], [/\bmk\s*(\d+)/g, 'mk$1'], [/\bgen\s*\.?\s*(\d)\b/g, 'gen$1'], [/\b(v|ver|version)\s*(\d)\b/g, 'v$2'], [/\bmod\s*(\d)/g, 'mod$1'], [/\b(\d+)\s*x\b/g, '$1x'], [/\bblow[\s-]*back\b/g, 'blowback'], [/\bhop[\s-]*up\b/g, 'hopup'], [/\bplate\s+carrier\b/g, 'carrier'], [/\bred\s+dot\b/g, 'dot'], [/\bgreen\s+gas\b/g, 'greengas']];
// Words that name a distinct model variant: if only one title has one, they're different products.
const VARIANT = new Set(['match', 'custom', 'dor', 'd.o.r', 'compact', 'carbine', 'crb', 'spr', 'sbr', 'pdw', 'cqb', 'cqbr', 'long', 'short', 'kurz', 'sd', 'mws', 'ngrs', 'recoil', 'hpa', 'xtreme', 'extreme', 'elite', 'competition', 'race', 'sport', 'lite', 'pro', 'tactical', 'dmr', 'mini', 'micro', 'stubby', 'carry', 'combat', 'mod', 'socom', 'shorty', 'nightstorm', 'xr', 'xs', 'mosfet', 'etu', 'gate', 'aster', 'titan', 'polymer', 'steel', 'aluminum', 'cnc', 'upgraded', 'tuned', 'hop', 'chamber', 'kit', 'conversion', 'slide', 'frame', 'barrel', 'grip', 'sight', 'ver', 'gold', 'limited', 'deluxe', 'commander', 'government', 'officer', 'capa', 'mk1', 'mk2', 'mk3', 'mos']);
const GEN = /^(gen\d|mk\d+|v\d|mod\d)$/;
const NOISE_NUM = /^(20\d\d|\d+(fps|j|joule|joules|pcs|pc|pk|pack|ct|count))$/;

const words = (s) => {
  let t = String(s).toLowerCase().replace(/["'’]/g, '').replace(/[^a-z0-9.&]+/g, ' ');
  for (const [re, to] of ALIASES) t = t.replace(re, to);
  return t.replace(/&/g, ' ').trim().split(/\s+/).filter(Boolean).map((w) => w.replace(/\.$/, ''));
};

function platformOf(title) {
  const w = new Set(words(title));
  if (w.has('co2')) return 'CO2';
  if (w.has('hpa')) return 'HPA';
  if (w.has('gbb') || w.has('gbbr') || w.has('blowback') || w.has('greengas') || w.has('gas')) return 'GBB';
  if (w.has('aeg') || w.has('aep') || w.has('electric')) return 'AEG';
  if (w.has('spring')) return 'Spring';
  return null;
}

// Category for the category nav and filters (see classify.js). Accepts a title or a listing.
function categoryOf(p) { return classify(typeof p === 'string' ? { title: p } : p).cat; }

// ---- airsoft-only filter + live brand registry ----
// Every listing from every store passes through prep(): non-airsoft items are dropped (and
// counted per store and reason), the rest get a category and a brand.
const filtered = new Map(); // url -> { storeId, reason, title }
const keptUrls = new Map(); // url -> storeId
const liveBrands = new Map(); // brandId -> { id, name, urls: Map(url -> cat) }
function noteBrand(b, url, cat) {
  let e = liveBrands.get(b.id);
  if (!e) liveBrands.set(b.id, (e = { id: b.id, name: b.name, urls: new Map() }));
  e.urls.set(url, cat);
  if (e.urls.size > 3000) e.urls.delete(e.urls.keys().next().value);
}
function judge(p, store) {
  if (p._cat !== undefined) return p._cat ? { ok: true, cat: p._cat } : { ok: false, reason: p._why };
  const c = classify(p);
  const a = isAirsoft(p, c, store);
  return a.ok ? { ok: true, cat: c.cat } : { ok: false, reason: a.reason };
}
// Image URLs as stores publish them: relative ("image/cache/..." on OpenCart pages with <base href>),
// protocol-less ("//cdn..."), or plain http. Make them absolute https so they load on our https page.
function fixImage(src, base) {
  if (!src || typeof src !== 'string' || /^data:/i.test(src)) return null;
  let s = src.trim();
  if (s.startsWith('//')) s = 'https:' + s;
  try { const u = new URL(s, (base || 'https://invalid.example') + '/'); if (u.hostname === 'invalid.example') return null; if (u.protocol === 'http:') u.protocol = 'https:'; return u.protocol === 'https:' ? u.toString() : null; } catch { return null; }
}
function prep(p, store) {
  // Outbound links must point at a vetted domain, and absurd prices (joke listings like $69,420) are dropped.
  if (p.url && !/^https?:/i.test(p.url) && store.base) { try { p.url = new URL(p.url, store.base + '/').toString(); } catch { /* left as is */ } }
  if (!isVetted(p.url) || !(p.price > 0 && p.price < 15000)) return null;
  p.image = fixImage(p.image, store.base);
  const j = judge(p, store);
  const url = p.url || p.title;
  if (!j.ok) {
    if (filtered.size > 30000) filtered.delete(filtered.keys().next().value);
    filtered.set(url, { storeId: store.id, reason: j.reason, title: p.title });
    return null;
  }
  let b = brands.detect(p);
  // A licensed firearm name (Glock, SIG, H&K…) is a brand only for the airsoft guns/mags made under
  // that licence; a "Glock holster" from another maker doesn't belong on the Glock page.
  if (b && b.licensed && !['rifles', 'pistols', 'snipers', 'mags'].includes(j.cat)) b = null;
  if (keptUrls.size > 60000) keptUrls.delete(keptUrls.keys().next().value);
  keptUrls.set(url, store.id);
  if (b) noteBrand(b, url, j.cat);
  const { ptype, tags, cats, _cat, _why, ...rest } = p;
  return enrich({ ...rest, cat: j.cat, brand: b ? b.name : null, brandId: b ? b.id : null, licensed: b?.licensed || undefined }, store);
}
// Memoize the verdict on long-lived catalog items (index stores) so they're classified once.
function judgeCached(p) { if (p._cat === undefined) { const j = judge(p); p._cat = j.ok ? j.cat : null; p._why = j.reason; } return p._cat; }
function filterStats() {
  const byStore = {}, byReason = {};
  for (const { storeId, reason } of filtered.values()) {
    (byStore[storeId] ||= { dropped: 0, kept: 0 }).dropped++;
    byReason[reason] = (byReason[reason] || 0) + 1;
  }
  for (const id of keptUrls.values()) (byStore[id] ||= { dropped: 0, kept: 0 }).kept++;
  return { dropped: filtered.size, kept: keptUrls.size, byReason, byStore, examples: [...filtered.values()].slice(-12).map((f) => ({ store: f.storeId, reason: f.reason, title: f.title })) };
}
function brandList() {
  return [...liveBrands.values()].map((e) => ({ id: e.id, name: e.name, count: e.urls.size })).filter((b) => b.count > 0).sort((a, b) => b.count - a.count);
}

function features(p) {
  const w = words(`${p.brand || ''} ${p.title}`);
  const toks = new Set(w.filter((t) => t.length > 1 && !STOP.has(t) && !COLORS.has(t) && !/^\d+$/.test(t)));
  const types = new Set(w.map((t) => TYPE_WORDS[t]).filter(Boolean));
  const nums = new Set(w.filter((t) => /\d/.test(t) && t !== 'co2' && !NOISE_NUM.test(t)));
  const gens = new Set([...nums].filter((t) => GEN.test(t)));
  const colors = new Set(w.filter((t) => COLORS.has(t) && !['two', 'tone', 'dark', 'flat', 'earth'].includes(t)));
  return { toks, types, nums, gens, colors, platform: platformOf(p.title) };
}
const jaccard = (a, b) => { let i = 0; for (const t of a) if (b.has(t)) i++; return i / (a.size + b.size - i || 1); };
const overlap = (a, b) => { let i = 0; for (const t of a) if (b.has(t)) i++; return i; };
const sameSet = (a, b) => a.size === b.size && [...a].every((x) => b.has(x));
const subset = (a, b) => [...a].every((x) => b.has(x));

// Two listings are the same product only if: the accessory type words agree (a magazine never
// matches a pistol), the generation/mark/version tokens agree exactly (Gen 4 never matches Gen 5),
// model numbers agree, the platform agrees (CO2 vs gas), explicit colors don't conflict,
// prices are within 1.6x, and the remaining title words overlap strongly.
function isMatch(a, fa, b, fb) {
  if (a.storeId === b.storeId) return false;
  if (a.cat && b.cat && a.cat !== b.cat) return false;
  if (a.brandId && b.brandId && a.brandId !== b.brandId && !a.licensed && !b.licensed) return false;
  if (!sameSet(fa.types, fb.types)) return false;
  if (!sameSet(fa.gens, fb.gens)) return false;
  if (fa.platform && fb.platform && fa.platform !== fb.platform) return false;
  if (fa.colors.size && fb.colors.size && !overlap(fa.colors, fb.colors)) return false;
  if (fa.nums.size || fb.nums.size) {
    if (!fa.nums.size || !fb.nums.size) return false;
    const [s, l] = fa.nums.size <= fb.nums.size ? [fa.nums, fb.nums] : [fb.nums, fa.nums];
    if (!subset(s, l) || l.size - s.size > 1) return false;
  }
  const hi = Math.max(a.price, b.price), lo = Math.min(a.price, b.price);
  if (hi / lo > 1.6) return false;
  for (const t of fa.toks) if (VARIANT.has(t) && !fb.toks.has(t)) return false;
  for (const t of fb.toks) if (VARIANT.has(t) && !fa.toks.has(t)) return false;
  const j = jaccard(fa.toks, fb.toks);
  const onlyA = [...fa.toks].some((t) => !fb.toks.has(t)), onlyB = [...fb.toks].some((t) => !fa.toks.has(t));
  // Both titles carry words the other lacks (CRB vs SPR, Match vs Custom): demand a closer match.
  if (onlyA && onlyB) return j >= 0.7;
  if (j >= 0.55) return true;
  // One title is a fuller version of the other ("Glock 17 Gen 5" vs "Elite Force Glock 17 Gen 5 GBB Pistol").
  const m = Math.min(fa.toks.size, fb.toks.size);
  return m >= 3 && overlap(fa.toks, fb.toks) / m >= 0.85 && hi / lo <= 1.35;
}

function enrich(p, store) {
  if (p.image) p = { ...p, image: thumb(p.image) };
  // A "was" price more than 80% above the sale price is almost always a placeholder/MSRP typo; ignore it.
  if (p.originalPrice && p.price && (p.originalPrice - p.price) / p.originalPrice > 0.8) p = { ...p, originalPrice: null };
  const discountPct = p.originalPrice && p.price ? Math.round(((p.originalPrice - p.price) / p.originalPrice) * 100) : 0;
  const savings = p.originalPrice && p.price ? +(p.originalPrice - p.price).toFixed(2) : 0;
  const ship = store.shipping;
  return {
    ...p, store: store.name, storeId: store.id, indexedAt: store.index?.idx.builtAt || undefined, discountPct, savings, onSale: discountPct > 0 || !!p.storeDeal,
    ship: ship ? { freeOver: ship.freeOver, note: ship.note, free: ship.freeOver != null && p.price >= ship.freeOver } : undefined,
  };
}

// Stable group ids (a hash of the offer URLs), so a product link or a device-cached list still points at
// the same product after the server restarts (a running counter reused ids for different products).
const gidOf = (offers) => { let h = 0x811c9dc5; for (const ch of offers.map((o) => o.url).sort().join('|')) { h ^= ch.charCodeAt(0); h = Math.imul(h, 0x01000193) >>> 0; } return 'g' + h.toString(36); };
function groupProducts(items) {
  const ids = new Set();
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
    // In-stock offers first by price, then out-of-stock ones.
    const offers = members.map((m) => items[m]).sort((a, b) => (a.inStock === false) - (b.inStock === false) || a.price - b.price);
    const best = offers[0];
    const avg = offers.reduce((s, o) => s + o.price, 0) / offers.length;
    for (const o of offers) {
      o.vsAvg = +(o.price - avg).toFixed(2);
      o.vsAvgPct = Math.round(((o.price - avg) / avg) * 100);
    }
    const maxDisc = offers.reduce((m, o) => Math.max(m, o.discountPct), 0);
    const g = {
      id: ((id) => { let k = id, n = 1; while (ids.has(k)) k = id + '-' + n++; ids.add(k); return k; })(gidOf(offers)),
      title: best.title,
      brand: offers.find((o) => o.brand && !o.licensed)?.brand || offers.find((o) => o.brand)?.brand || null,
      brandId: offers.find((o) => o.brand && !o.licensed)?.brandId || offers.find((o) => o.brandId)?.brandId || null,
      platform: platformOf(best.title),
      cat: best.cat || categoryOf(best),
      images: [...new Set(offers.map((o) => o.image).filter(Boolean))],
      offers,
      storeCount: offers.length,
      bestPrice: best.price,
      bestStore: best.store,
      avgPrice: +avg.toFixed(2),
      belowAvgPct: offers.length > 1 ? Math.round(((avg - best.price) / avg) * 100) : 0,
      listPrice: best.originalPrice || null,
      discountPct: best.discountPct,
      maxDiscountPct: maxDisc,
      savings: best.savings,
      inStock: offers.some((o) => o.inStock === true) ? true : offers.every((o) => o.inStock === false) ? false : null,
      onSale: best.onSale || (offers.length > 1 && offers[1].price > best.price),
      freeShip: !!best.ship?.free,
    };
    history.attachGroup(g);
    const badges = [];
    if (g.h?.atl) badges.push('ALL-TIME LOW');
    if (offers.length > 1 && offers[1].price > best.price) badges.push(`LOWEST OF ${offers.length}`);
    if (best.discountPct >= 30) badges.push('HOT DEAL');
    if (best.discountPct > 0) badges.push(`${best.discountPct}% OFF`);
    else if (best.storeDeal) badges.push('STORE DEAL');
    g.badges = badges;
    groups.push(g);
  }
  return groups;
}

module.exports = { fixImage, enrich, prep, judgeCached, groupProducts, categoryOf, platformOf, isMatch, features, filterStats, brandList, noteBrand, brands };
