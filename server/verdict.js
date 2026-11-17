// Score /10 and the verdict panel ("Ask Grok") for one product.
//
// Two kinds of answer, always labeled:
//  - "estimate": deterministic heuristics only (brand reputation tier, platform, price versus other
//    stores and our price history, and real customer ratings scraped from vetted store pages). Used for
//    the score badges on cards and whenever XAI_API_KEY isn't set. Never presented as AI.
//  - "ai": with XAI_API_KEY set, the xAI Grok API (OpenAI-compatible chat completions) writes the same
//    structured fields as JSON, grounded in the real reviews and prices we pass it. Cached per product for
//    14 days (memory + a small file), rate-limited per IP and capped per day. Only spent when a visitor
//    asks for it; product pages show a cached AI answer if one exists, otherwise the estimate.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const reviews = require('./reviews');

const KEY = () => process.env.XAI_API_KEY || '';
const MODEL = () => process.env.XAI_MODEL || 'grok-4.20-0309-non-reasoning';
const ENDPOINT = 'https://api.x.ai/v1/chat/completions';
const DAILY_CAP = +process.env.XAI_DAILY_CAP || 400; // AI answers per day across all users (cost guard)
const PER_IP = { n: +process.env.XAI_PER_IP || 8, windowMs: 10 * 60 * 1000 }; // new AI answers per IP per 10 min
const TTL_MS = 14 * 864e5; // an AI verdict is reused for 14 days
const CACHE_FILE = path.join(__dirname, 'snapshot', 'verdicts.json');

// ---- cache ----
const cache = new Map(); // key -> { at, v }
try { for (const [k, e] of Object.entries(JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8')))) cache.set(k, e); } catch { /* none yet */ }
let saveT = null;
const save = () => { clearTimeout(saveT); saveT = setTimeout(() => { try { fs.writeFileSync(CACHE_FILE, JSON.stringify(Object.fromEntries([...cache].slice(-3000)))); } catch { /* read-only disk is fine */ } }, 2000); };
const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9.]+/g, ' ').trim();
const keyOf = (p) => crypto.createHash('sha1').update(`${norm(p.brand)}|${norm(p.title)}`).digest('base64url').slice(0, 16);

// ---- limits ----
const hits = new Map(); // ip -> [timestamps]
let day = '', dayCount = 0;
function allow(ip) {
  const now = Date.now();
  const today = new Date().toISOString().slice(0, 10);
  if (today !== day) { day = today; dayCount = 0; }
  if (dayCount >= DAILY_CAP) return 'daily';
  const list = (hits.get(ip) || []).filter((t) => now - t < PER_IP.windowMs);
  if (list.length >= PER_IP.n) { hits.set(ip, list); return 'ip'; }
  list.push(now); hits.set(ip, list); dayCount++;
  if (hits.size > 5000) hits.delete(hits.keys().next().value);
  return null;
}

// ---- input from the app (sanitized; prices are ours, sent back by the client) ----
const num = (v) => (Number.isFinite(+v) && +v > 0 && +v < 20000 ? Math.round(+v * 100) / 100 : null);
const str = (v, n) => String(v || '').replace(/[\u0000-\u001f]/g, ' ').slice(0, n).trim();
function clean(b) {
  const offers = (Array.isArray(b.offers) ? b.offers : []).slice(0, 12).map((o) => ({ store: str(o.store, 40), storeId: str(o.storeId, 30), url: /^https:\/\//.test(String(o.url || '')) ? str(o.url, 400) : null, price: num(o.price), was: num(o.originalPrice), inStock: o.inStock === true ? true : o.inStock === false ? false : null })).filter((o) => o.price);
  const h = b.h && typeof b.h === 'object' ? { lo: num(b.h.lo), hi: num(b.h.hi), avg: num(b.h.avg), since: str(b.h.since, 10), prev: num(b.h.prev), chg: Number.isFinite(+b.h.chg) ? +b.h.chg : 0, points: Array.isArray(b.h.pts) ? b.h.pts.length : 0 } : null;
  return { title: str(b.title, 160), brand: str(b.brand, 50), cat: str(b.cat, 20), platform: str(b.platform, 20), best: num(b.bestPrice), avg: num(b.avgPrice), stores: offers.length, offers, h };
}

// ---- rule-based quick take (no AI) ----
// Rough community reputation tiers for common airsoft makers. Unknown brands are "unrated".
const TIERS = [
  ['premium', ['tokyo marui', 'marui', 'vfc', 'ghk', 'krytac', 'systema', 'ptw', 'silverback', 'novritsch', 'action army', 'polarstar', 'wolverine', 'maple leaf', 'prometheus', 'laylax', 'gate', 'titan', 'lonex', 'pts', 'magpul', 'kwa', 'ksc', 'kj works', 'e&l', 'lct', 'tanaka', 'maxx', 'cowcow', 'tti', 'taran tactical', 'army armament', 'ssx', 'mancraft', 'unicorn', 'amped', 'nine ball', 'retro arms', 'perun', 'emersongear', 'crye']],
  ['solid', ['g&g', 'elite force', 'umarex', 'king arms', 'ics', 'ares', 'arcturus', 'classic army', 'specna arms', 'cyma platinum', 'we', 'we-tech', 'aps', 'asg', 'evike', 'ehobbyasia', 'echo1', 'jag', 'lancer tactical', 'apfg', 'src', 'sig air', 'vorsk', 'angel custom', 'raven', 'speed airsoft', 'modify', 'guarder', 'shs', 'sat', 'tmc', 'fma', 'element', 'valken', 'g&p', 'dytac', 'emerson', 'airtech studios', 'tru spec', 'condor', 'idogear', 'ktech']],
  ['budget', ['cyma', 'jg', 'jg works', 'golden eagle', 'double bell', 'aGM', 'srs', 'lancer', 'bbtac', 'galaxy', 'kwc', 'cybergun', 'crosman', 'tsd', 'a&k', 'agm', 'snow wolf', 'a & k']],
  ['avoid', ['double eagle', 'well', 'ukarms', 'uk arms', 'airsoft elite', 'game face', 'soft air usa']],
];
const TIER_N = TIERS.map(([tier, names]) => [tier, names.map((n) => ` ${norm(n)} `)]);
const tierOf = (brand, title) => {
  // The listed brand decides; when it's missing or unknown, only the start of the title (where makers
  // put their name) is used, so "barrel for Tokyo Marui" or "works well" can't set the tier.
  const b = ` ${norm(brand)} `;
  if (b.trim()) for (const [tier, names] of TIER_N) if (names.some((n) => b.includes(n))) return tier;
  const lead = ` ${norm(title).split(' ').slice(0, 4).join(' ')} `;
  for (const [tier, names] of TIER_N) if (names.some((n) => lead.startsWith(n))) return tier;
  return 'unrated';
};
// ---- estimate (no AI): sub-scores, issues, review summary ----
const GUN = new Set(['rifles', 'pistols', 'snipers']);
const clamp = (x) => Math.max(1, Math.min(10, x));
const r1 = (x) => Math.round(x);
// Platforms with large aftermarket parts support (general community knowledge).
const UPGRADE_FAMILIES = [
  [/\b(m4|m16|ar ?15|hk ?416|mk18|urg ?i|sr ?16|m4a1|ar15|mws|mtw)\b/i, 9, 'M4/AR platform: the widest parts support in airsoft'],
  [/\b(ak ?(47|74|105|12|102)?|akm|aks)\b/i, 8, 'AK platform: wide parts support'],
  [/\b(vsr|vsr ?10|l96|ssg ?10|ssg ?24|m40a5|aps ?2)\b/i, 9, 'VSR/L96-style sniper: huge aftermarket support'],
  [/\b(aap ?01|hi ?capa|hicapa|g17|g19|glock|1911|m9|p226)\b/i, 9, 'Popular pistol platform with lots of upgrade parts'],
  [/\b(mp5|mp7|g36|scar|p90|ump)\b/i, 7, 'Common platform with decent parts support'],
];
const ISSUES = {
  AEG: [
    ['Gearbox wear or lock-ups (stripped piston teeth, sector gear, overspun motor)', 'Keep a sensible spring, add a MOSFET, have shimming and AOE checked; reinforce the piston before raising FPS.'],
    ['Hop-up inconsistency (curving or dropping shots)', 'Fit a quality bucking and nub, clean the inner barrel, and set hop with the BB weight you use.'],
    ['Magazine feeding (misfeeds with some mid/hi-caps)', 'Use magazines known to fit the model, check the mag catch, and make sure the mag seats fully.'],
    ['Battery and wiring (low rate of fire, warm wires on stock plugs)', 'Use the battery voltage the gun is rated for (LiPo 11.1 V only with a MOSFET); swap to Deans plugs.'],
  ],
  GBB: [
    ['Gas leaks from magazines (fill/output valves, base gasket)', 'Silicone-oil gaskets, snug valves with a valve key, replace worn o-rings.'],
    ['Weak blowback or low FPS in cold weather', 'Keep mags warm between strings; use a stronger gas only if the gun and mags are rated for it.'],
    ['Loading nozzle or blowback unit wear', 'Carry a spare nozzle; don\'t run gas stronger than recommended.'],
    ['Hop-up bucking hardening over time', 'Replace the bucking; most popular GBBs have drop-in options.'],
  ],
  CO2: [
    ['CO2 seal wear and slow leaks', 'Put a drop of silicone oil on each new cartridge; don\'t leave a cartridge in for days.'],
    ['Power fades on fast strings as the gas cools', 'Pause between strings; keep a spare loaded mag.'],
  ],
  HPA: [
    ['Air leaks at lines and fittings', 'Check o-rings, re-seat lines and fittings, and soapy-water test for bubbles.'],
    ['Regulator drift (FPS creep)', 'Use a quality regulator, lock its setting, and chrono regularly.'],
    ['Engine nozzle/poppet o-ring wear', 'Keep a spare o-ring kit and lubricate per the maker\'s guide.'],
  ],
  Spring: [
    ['Hop-up inconsistency at range', 'Upgrade bucking/nub and use heavier quality BBs.'],
    ['Trigger sear wear with stronger springs', 'Fit a steel trigger set before installing a heavier spring.'],
    ['Cylinder/piston seal wear', 'Lubricate the cylinder lightly and replace the piston head o-ring when compression drops.'],
  ],
  mags: [['Misfeeds or weak follower spring over time', 'Store mags unwound/unloaded and buy from the gun\'s maker or a known-compatible brand.']],
  optics: [['Zero shift or loose mount', 'Use thread locker on mount screws and re-zero after transport.']],
  batteries: [['Puffing or over-discharge damage (LiPo)', 'Use a balance charger, store at storage voltage, and stop when power drops.']],
  bbs: [['Cheap BBs with seams or bad roundness jam hop-ups', 'Stick to quality seamless BBs of a consistent weight.']],
};
// Words in real reviews that point at a problem (we count them; we never paraphrase them as quotes).
const PROBLEM_WORDS = [[/\bleak/i, 'gas or air leaks'], [/\b(jam|misfeed|feed(ing)? issue|double feed)/i, 'feeding/jams'], [/\b(broke|broken|crack|snapped|came off|fell off|wobbly|loose)\b/i, 'parts breaking or coming loose'], [/\b(hop ?up|curv|inaccura)/i, 'hop-up/accuracy'], [/\b(doa|dead on arrival|stopped working|doesn'?t work|defect)/i, 'defects or failures']];

function platformKey(p) {
  if (p.platform && ISSUES[p.platform]) return p.platform;
  if (p.cat === 'snipers') return 'Spring';
  return null;
}
function upgradeOf(p) {
  if (!GUN.has(p.cat)) return null;
  for (const [re, v, why] of UPGRADE_FAMILIES) if (re.test(p.title)) return { v, why };
  return { v: { AEG: 7, HPA: 8, GBB: 6, Spring: 6, CO2: 4 }[platformKey(p)] || 5, why: null };
}

// A product's estimate. `rv` is the reviews summary ({avg, count, sources}) or null.
function quickTake(p, rv = null) {
  const tier = tierOf(p.brand, p.title);
  const known = tier !== 'unrated';
  const gun = GUN.has(p.cat);
  const plat = platformKey(p);
  const pros = [], cons = [];
  const T = { premium: 8.5, solid: 7, budget: 5.5, avoid: 3.5 }[tier];
  const real = rv && rv.count > 0 ? rv : null;
  const ratingAs10 = real ? real.avg * 2 : null;
  const w = real ? Math.min(0.6, real.count / 10) : 0; // how much real ratings pull a sub-score (up to 60% at 6+ reviews)
  const blend = (x) => (x == null ? (real ? ratingAs10 : null) : real ? x * (1 - w) + ratingAs10 * w : x);

  // Build quality / performance / reliability: brand tier (+ material and platform hints), pulled toward real ratings.
  let build = known ? T + (/\b(full metal|steel|cnc|aluminum|aluminium)\b/i.test(p.title) ? 0.5 : 0) : null;
  let perf = gun && known ? T - 0.5 + (plat === 'HPA' ? 1 : 0) : null;
  let rel = known ? T + (plat === 'HPA' ? 0.5 : plat === 'GBB' || plat === 'CO2' ? -0.5 : 0) : null;
  build = blend(build); perf = gun ? blend(perf) : null; rel = blend(rel);

  // Value: price versus other stores, our history and the store's own sale.
  let value = 6;
  const below = p.best && p.avg && p.stores > 1 ? (1 - p.best / p.avg) * 100 : 0;
  if (below >= 3) { value += Math.min(2, below / 5); pros.push(`Best price is ${Math.round(below)}% below the average across ${p.stores} stores`); }
  const h = p.h;
  if (h && h.lo && p.best && p.best <= h.lo + 0.01 && h.points > 1) { value += 1; pros.push('At the lowest price we have tracked'); }
  if (h && h.chg < 0) pros.push(`Price recently dropped from $${h.prev}`);
  if (h && h.chg > 0) { value -= 1; cons.push('Price went up recently; it may come back down'); }
  const disc = Math.max(0, ...p.offers.map((o) => (o.was && o.price ? (1 - o.price / o.was) * 100 : 0)));
  if (disc >= 20) { value += 1; pros.push(`${Math.round(disc)}% off the store's list price`); }
  if (tier === 'avoid') value -= 1.5;
  if (p.offers.length && p.offers.every((o) => o.inStock === false)) { value -= 1; cons.push('Out of stock everywhere we check'); }
  if (p.stores === 1) cons.push('Sold by only one store we track, so there is little price comparison');

  const up = upgradeOf(p);
  if (tier === 'premium') pros.unshift(`${p.brand || 'This maker'} is one of the best-regarded names in airsoft`);
  if (tier === 'solid') pros.unshift(`${p.brand || 'This maker'} has a good reputation for the money`);
  if (tier === 'budget') cons.unshift(`${p.brand || 'This maker'} is a budget brand: fine to start with, more likely to need upgrades`);
  if (tier === 'avoid') cons.unshift(`${p.brand || 'This maker'} is generally seen as toy-grade by players`);
  if (!known) cons.push('We have no reputation data for this brand');
  if (up?.why && up.v >= 8) pros.push(up.why);
  if (real && real.avg >= 4.5 && real.count >= 2) pros.push(`Customers rate it ${real.avg}/5 (${real.count} review${real.count === 1 ? '' : 's'})`);
  if (real && real.avg < 3.5) cons.push(`Customers rate it only ${real.avg}/5 (${real.count} review${real.count === 1 ? '' : 's'})`);

  const sub = { build, performance: perf, value, reliability: rel, upgradeability: up ? up.v : null };
  const W = { build: 0.2, performance: 0.2, value: 0.25, reliability: 0.25, upgradeability: 0.1 };
  let sw = 0, ss = 0;
  for (const [k, v] of Object.entries(sub)) if (v != null) { ss += clamp(v) * W[k]; sw += W[k]; }
  // Without a known brand or real ratings, value alone isn't a quality score.
  const enough = known || real;
  const score = enough ? clamp(r1(ss / sw)) : null;
  for (const k of Object.keys(sub)) sub[k] = sub[k] == null ? null : clamp(r1(sub[k]));
  const verdict = score == null ? 'Unrated' : score >= 7 ? 'Good' : score >= 5 ? 'Decent' : 'Skip';
  const who = { premium: 'Players who want reliability and good parts support', solid: 'Most players, including beginners who want something dependable', budget: 'Beginners on a tight budget', avoid: 'Casual backyard use only', unrated: 'Check reviews before buying' }[tier];
  const issues = (ISSUES[plat] || ISSUES[p.cat] || []).map(([issue, fix]) => ({ issue, fix }));
  return {
    verdict, score, sub, pros: pros.slice(0, 5), cons: cons.slice(0, 5), whoFor: who, issues, issuesScope: issues.length ? `Common for ${plat ? plat + ' ' : ''}${CAT_WORD[p.cat] || 'items'} in general, not reports about this exact model` : null,
    summary: score == null ? 'Not enough data to score this one: we don\'t know the brand and found no customer ratings.' : `Estimate from brand reputation (${tier})${real ? `, ${real.count} real customer rating${real.count === 1 ? '' : 's'}` : ''}, price versus other stores, and our price history.`,
    confidence: real && real.count >= 5 && known ? 'medium' : known ? 'medium' : real ? 'low' : 'low', unsure: known ? null : 'We do not know this brand well enough to judge quality.', tier,
  };
}
const CAT_WORD = { rifles: 'rifles', pistols: 'pistols', snipers: 'sniper rifles', mags: 'magazines', optics: 'optics', batteries: 'batteries', bbs: 'BBs' };

// Real reviews -> a plain summary: rating, count, sources, problem mentions. Quotes are the reviewers' own words.
function reviewSummary(rv) {
  if (!rv || !rv.count) return { count: 0, text: rv && rv.checked?.length ? `No customer reviews on the ${rv.checked.length} store page${rv.checked.length === 1 ? '' : 's'} we checked.` : 'None of the stores selling this publish reviews we can read.', quotes: [], sources: [], checked: rv?.checked || [] };
  const all = rv.sources.flatMap((s) => s.reviews.map((r) => ({ ...r, store: s.store, url: s.url })));
  const probs = new Map();
  for (const r of all) for (const [re, label] of PROBLEM_WORDS) if (re.test(`${r.title} ${r.text}`)) probs.set(label, (probs.get(label) || 0) + 1);
  const pos = all.filter((r) => r.rating >= 4).length, neg = all.filter((r) => r.rating && r.rating <= 2).length;
  const parts = [`${rv.avg}/5 average from ${rv.count} customer review${rv.count === 1 ? '' : 's'} at ${rv.sources.map((s) => s.store).join(', ')}.`];
  if (all.length) parts.push(`Of the ${all.length} we can show, ${pos} ${pos === 1 ? 'is' : 'are'} 4-5 stars${neg ? ` and ${neg} ${neg === 1 ? 'is' : 'are'} 1-2 stars` : ''}.`);
  if (probs.size) parts.push(`Mentioned: ${[...probs].map(([l, n]) => `${l} (${n})`).join(', ')}.`);
  return { count: rv.count, avg: rv.avg, text: parts.join(' '), quotes: all.slice(0, 4), sources: rv.sources.map((s) => ({ store: s.store, url: s.url, avg: s.avg, count: s.count, via: s.via })), checked: rv.checked, problems: [...probs].map(([label, n]) => ({ label, n })) };
}

// Score badge for a card: a cached AI score if we have one, else the estimate (null when we can't judge).
function scoreFor(g) {
  const hit = cache.get(keyOf({ brand: g.brand, title: g.title }));
  if (hit && Date.now() - hit.at < TTL_MS && hit.v.score) return { s: hit.v.score, k: 'ai' };
  const offers = g.offers.map((o) => ({ store: o.store, price: o.price, was: o.originalPrice || null, inStock: o.inStock }));
  const p = { title: g.title, brand: g.brand || '', cat: g.cat, platform: g.platform, best: g.bestPrice, avg: g.avgPrice, stores: offers.length, offers, h: g.h ? { lo: g.h.lo, chg: g.h.chg, prev: g.h.prev, points: (g.h.pts || []).length } : null };
  const q = quickTake(p, reviews.cachedFor(g.offers));
  return q.score == null ? null : { s: q.score, k: 'est' };
}

// ---- AI verdict ----
const SYSTEM = `You are an honest, experienced airsoft tech and buyer's advisor. Judge one airsoft product for a buyer.
Use what you know about the maker's reputation, the platform (AEG/GBB/HPA/spring/CO2), internals, reliability, parts compatibility and common problems, plus the price data and the customer reviews provided.
Rules: never invent reviews, quotes, ratings or specs. "reviewSummary" must only summarize the customer reviews given to you; if none are given, say "No customer reviews were available." If you do not recognize the exact model, say so in "unsure" and lower "confidence".
Reply with JSON only:
{"verdict":"Good"|"Decent"|"Skip","score":1-10,"summary":"one or two sentences",
"subscores":{"build":1-10,"performance":1-10 or null,"value":1-10,"reliability":1-10,"upgradeability":1-10 or null},
"pros":["..."],"cons":["..."],
"issues":[{"issue":"common problem for this model or platform","fix":"how players fix it"}],
"reviewSummary":"2-3 sentences grounded only in the reviews provided",
"whoFor":"short phrase","priceTake":"one sentence using only the price data given","confidence":"high"|"medium"|"low","unsure":"what you are unsure about, or null"}
At most 4 pros, 4 cons, 4 issues. Use null for performance/upgradeability on non-guns.`;
function userPrompt(p, rv) {
  const quotes = rv && rv.count ? rv.sources.flatMap((s) => s.reviews.map((r) => `- ${r.rating ? r.rating + '/5' : ''} (${s.store}${r.date ? ', ' + r.date : ''}): ${r.title ? r.title + ' — ' : ''}${r.text}`)).slice(0, 10) : [];
  const lines = [
    `Product: ${p.title}`, `Brand: ${p.brand || 'unknown'}`, `Category: ${p.cat || 'unknown'}${p.platform ? `, platform ${p.platform}` : ''}`,
    `Best price now: ${p.best ? '$' + p.best : 'unknown'}${p.avg && p.stores > 1 ? `; average across ${p.stores} stores $${p.avg}` : ''}`,
    `Offers: ${p.offers.map((o) => `${o.store} $${o.price}${o.was ? ` (was $${o.was})` : ''}${o.inStock === false ? ' out of stock' : ''}`).join('; ') || 'none'}`,
    p.h ? `Our price history since ${p.h.since}: low $${p.h.lo}, high $${p.h.hi}, average $${p.h.avg}${p.h.prev ? `, previous $${p.h.prev}` : ''} (${p.h.points} price points)` : 'Our price history: none yet',
    rv && rv.count ? `Customer reviews (scraped from the stores' own pages): ${rv.avg}/5 average from ${rv.count} reviews.\n${quotes.join('\n')}` : 'Customer reviews: none available.',
  ];
  return lines.join('\n');
}
function parseJson(text) {
  const m = String(text || '').match(/\{[\s\S]*\}/);
  if (!m) throw new Error('no JSON in answer');
  const j = JSON.parse(m[0]);
  const list = (a) => (Array.isArray(a) ? a.map((x) => str(x, 160)).filter(Boolean).slice(0, 4) : []);
  const verdict = ['Good', 'Decent', 'Skip'].includes(j.verdict) ? j.verdict : null;
  const score = Math.max(1, Math.min(10, Math.round(+j.score || 0)));
  if (!verdict || !score) throw new Error('answer missing verdict/score');
  const sc = (v) => (v == null || !Number.isFinite(+v) || +v <= 0 ? null : clamp(Math.round(+v)));
  const s0 = j.subscores && typeof j.subscores === 'object' ? j.subscores : {};
  const issues = (Array.isArray(j.issues) ? j.issues : []).map((x) => ({ issue: str(x?.issue, 140), fix: str(x?.fix, 200) })).filter((x) => x.issue).slice(0, 4);
  return { verdict, score, summary: str(j.summary, 400), sub: { build: sc(s0.build), performance: sc(s0.performance), value: sc(s0.value), reliability: sc(s0.reliability), upgradeability: sc(s0.upgradeability) }, pros: list(j.pros), cons: list(j.cons), issues, aiReviewSummary: str(j.reviewSummary, 500), whoFor: str(j.whoFor, 120), priceTake: str(j.priceTake, 300), confidence: ['high', 'medium', 'low'].includes(j.confidence) ? j.confidence : 'medium', unsure: j.unsure ? str(j.unsure, 240) : null };
}
async function askGrok(p, rv) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 25000);
  try {
    const res = await fetch(ENDPOINT, {
      method: 'POST', signal: ctrl.signal,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${KEY()}` },
      body: JSON.stringify({ model: MODEL(), temperature: 0.3, max_tokens: 900, response_format: { type: 'json_object' }, messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: userPrompt(p, rv) }] }),
    });
    if (!res.ok) throw new Error(`xAI HTTP ${res.status}`);
    const j = await res.json();
    return { ...parseJson(j.choices?.[0]?.message?.content), model: j.model || MODEL(), usage: j.usage ? { in: j.usage.prompt_tokens, out: j.usage.completion_tokens } : undefined };
  } finally { clearTimeout(t); }
}

const inflight = new Map();
// body.ai: true only when the visitor pressed "Ask Grok for a full analysis". Otherwise we return a cached
// AI answer if there is one, or the estimate (no AI spend).
async function verdict(body, ip) {
  const p = clean(body || {});
  if (!p.title) return { status: 400, body: { error: 'Missing product title' } };
  const rv = await reviews.forOffers(p.offers).catch(() => null);
  const rs = reviewSummary(rv);
  const est = { kind: 'estimate', label: KEY() ? 'Estimate (not AI)' : 'Estimate · AI analysis not connected', ...quickTake(p, rv), reviews: rs, aiAvailable: !!KEY() };
  if (!KEY()) return { status: 200, body: est };
  const k = keyOf(p);
  const hit = cache.get(k);
  if (hit && Date.now() - hit.at < TTL_MS) return { status: 200, body: { ...hit.v, reviews: rs, cached: true, answeredAt: new Date(hit.at).toISOString(), aiAvailable: true } };
  if (!body.ai) return { status: 200, body: est };
  if (inflight.has(k)) return { status: 200, body: await inflight.get(k) };
  const why = allow(ip);
  if (why) return { status: 200, body: { ...est, label: why === 'ip' ? 'Estimate (AI limit reached; try again in a few minutes)' : 'Estimate (daily AI limit reached)' } };
  const run = askGrok(p, rv).then((v) => {
    const out = { kind: 'ai', label: 'AI-generated by Grok', ...v, issuesScope: v.issues.length ? 'From Grok\'s knowledge of this model and platform' : null };
    cache.set(k, { at: Date.now(), v: out }); save();
    return { ...out, reviews: rs, answeredAt: new Date().toISOString(), aiAvailable: true };
  }).catch((e) => { console.log(`[verdict] ${e.message}`); return { ...est, label: 'Estimate (AI request failed)', error: 'AI request failed' }; })
    .finally(() => inflight.delete(k));
  inflight.set(k, run);
  return { status: 200, body: await run };
}

const info = () => ({ ai: !!KEY(), model: KEY() ? MODEL() : null, cached: cache.size, perIp: PER_IP.n, dailyCap: DAILY_CAP, reviewStores: [...reviews.REVIEW_STORES] });
module.exports = { verdict, quickTake, clean, tierOf, parseJson, info, scoreFor, reviewSummary };
