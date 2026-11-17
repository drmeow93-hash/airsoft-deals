// "Ask Grok": a short buyer's verdict for one product.
//
// With XAI_API_KEY set, the xAI Grok API (OpenAI-compatible chat completions) writes the verdict from
// the product's title, brand, category and the prices and history we track. Answers are cached per
// product (memory + a small file next to the server), so repeat clicks are instant and free, and
// new AI calls are rate-limited per IP and capped per day.
// Without a key, a rule-based "Quick take" is returned instead and clearly labeled as such.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

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
  const offers = (Array.isArray(b.offers) ? b.offers : []).slice(0, 12).map((o) => ({ store: str(o.store, 40), price: num(o.price), was: num(o.originalPrice), inStock: o.inStock === true ? true : o.inStock === false ? false : null })).filter((o) => o.price);
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
const tierOf = (brand, title) => {
  // The listed brand decides; the title is used only when the brand is missing or unknown.
  for (const text of [brand, `${brand || ''} ${title || ''}`]) {
    const t = ` ${norm(text)} `;
    if (t.trim()) for (const [tier, names] of TIERS) if (names.some((n) => t.includes(` ${norm(n)} `))) return tier;
  }
  return 'unrated';
};
function quickTake(p) {
  const tier = tierOf(p.brand, p.title);
  let score = { premium: 8, solid: 7, budget: 5.5, avoid: 3.5, unrated: 6 }[tier];
  const pros = [], cons = [];
  if (tier === 'premium') pros.push(`${p.brand || 'This maker'} is one of the best-regarded names in airsoft`);
  if (tier === 'solid') pros.push(`${p.brand || 'This maker'} has a good reputation for the money`);
  if (tier === 'budget') cons.push(`${p.brand || 'This maker'} is a budget brand: fine to start with, more likely to need upgrades`);
  if (tier === 'avoid') cons.push(`${p.brand || 'This maker'} is generally seen as toy-grade by players`);
  if (tier === 'unrated') cons.push('We have no reputation data for this brand');
  const h = p.h;
  if (p.best && p.avg && p.stores > 1 && p.best < p.avg * 0.95) { score += 0.5; pros.push(`Best price is ${Math.round((1 - p.best / p.avg) * 100)}% below the average across ${p.stores} stores`); }
  if (h && h.lo && p.best && p.best <= h.lo + 0.01 && h.points > 1) { score += 0.5; pros.push('At the lowest price we have tracked'); }
  if (h && h.chg < 0) pros.push(`Price recently dropped from $${h.prev}`);
  if (h && h.chg > 0) { score -= 0.5; cons.push('Price went up recently; it may come back down'); }
  if (p.offers.length && p.offers.every((o) => o.inStock === false)) { score -= 1; cons.push('Out of stock everywhere we check'); }
  if (p.stores === 1) cons.push('Sold by only one store we track, so there is little price comparison');
  score = Math.max(1, Math.min(10, Math.round(score)));
  const verdict = score >= 7 ? 'Good' : score >= 5 ? 'Decent' : 'Skip';
  const who = { premium: 'Players who want reliability and good parts support', solid: 'Most players, including beginners who want something dependable', budget: 'Beginners on a tight budget', avoid: 'Casual backyard use only', unrated: 'Check reviews before buying' }[tier];
  return { verdict, score, summary: `Rule-based estimate from brand reputation (${tier}), price versus other stores, and price history.`, pros, cons, whoFor: who, confidence: tier === 'unrated' ? 'low' : 'medium', unsure: tier === 'unrated' ? 'We do not know this brand well enough to judge quality.' : null, tier };
}

// ---- AI verdict ----
const SYSTEM = `You are an honest, experienced airsoft tech and buyer's advisor. Judge one airsoft product for a buyer.
Use what you know about the maker's reputation, the platform (AEG/GBB/HPA/spring), internals, reliability, parts compatibility and common problems, plus the price data provided.
Be candid: say "Skip" if it is a poor buy. If you do not recognize the exact model or are unsure, say so in "unsure" and lower "confidence"; never invent specs.
Reply with JSON only, no prose outside it:
{"verdict":"Good"|"Decent"|"Skip","score":1-10,"summary":"one or two sentences","pros":["..."],"cons":["..."],"whoFor":"short phrase","priceTake":"one sentence on whether this price is good, using only the price data given","confidence":"high"|"medium"|"low","unsure":"what you are unsure about, or null"}
Keep pros and cons to at most 4 short items each.`;
function userPrompt(p) {
  const lines = [
    `Product: ${p.title}`, `Brand: ${p.brand || 'unknown'}`, `Category: ${p.cat || 'unknown'}${p.platform ? `, platform ${p.platform}` : ''}`,
    `Best price now: ${p.best ? '$' + p.best : 'unknown'}${p.avg && p.stores > 1 ? `; average across ${p.stores} stores $${p.avg}` : ''}`,
    `Offers: ${p.offers.map((o) => `${o.store} $${o.price}${o.was ? ` (was $${o.was})` : ''}${o.inStock === false ? ' out of stock' : ''}`).join('; ') || 'none'}`,
    p.h ? `Our price history since ${p.h.since}: low $${p.h.lo}, high $${p.h.hi}, average $${p.h.avg}${p.h.prev ? `, previous $${p.h.prev}` : ''} (${p.h.points} price points)` : 'Our price history: none yet',
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
  return { verdict, score, summary: str(j.summary, 400), pros: list(j.pros), cons: list(j.cons), whoFor: str(j.whoFor, 120), priceTake: str(j.priceTake, 300), confidence: ['high', 'medium', 'low'].includes(j.confidence) ? j.confidence : 'medium', unsure: j.unsure ? str(j.unsure, 240) : null };
}
async function askGrok(p) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 25000);
  try {
    const res = await fetch(ENDPOINT, {
      method: 'POST', signal: ctrl.signal,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${KEY()}` },
      body: JSON.stringify({ model: MODEL(), temperature: 0.3, max_tokens: 600, response_format: { type: 'json_object' }, messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: userPrompt(p) }] }),
    });
    if (!res.ok) throw new Error(`xAI HTTP ${res.status}`);
    const j = await res.json();
    return { ...parseJson(j.choices?.[0]?.message?.content), model: j.model || MODEL(), usage: j.usage ? { in: j.usage.prompt_tokens, out: j.usage.completion_tokens } : undefined };
  } finally { clearTimeout(t); }
}

const inflight = new Map();
async function verdict(body, ip) {
  const p = clean(body || {});
  if (!p.title) return { status: 400, body: { error: 'Missing product title' } };
  const quick = { kind: 'quick', label: KEY() ? 'Quick take (AI unavailable right now)' : 'Quick take (AI not connected)', ...quickTake(p) };
  if (!KEY()) return { status: 200, body: quick };
  const k = keyOf(p);
  const hit = cache.get(k);
  if (hit && Date.now() - hit.at < TTL_MS) return { status: 200, body: { ...hit.v, cached: true, answeredAt: new Date(hit.at).toISOString() } };
  if (inflight.has(k)) return { status: 200, body: await inflight.get(k) };
  const why = allow(ip);
  if (why) return { status: 200, body: { ...quick, label: why === 'ip' ? 'Quick take (AI limit reached; try again in a few minutes)' : 'Quick take (daily AI limit reached)' } };
  const run = askGrok(p).then((v) => {
    const out = { kind: 'ai', label: 'AI-generated by Grok', ...v };
    cache.set(k, { at: Date.now(), v: out }); save();
    return { ...out, answeredAt: new Date().toISOString() };
  }).catch((e) => { console.log(`[verdict] ${e.message}`); return { ...quick, error: 'AI request failed' }; })
    .finally(() => inflight.delete(k));
  inflight.set(k, run);
  return { status: 200, body: await run };
}

const info = () => ({ ai: !!KEY(), model: KEY() ? MODEL() : null, cached: cache.size, perIp: PER_IP.n, dailyCap: DAILY_CAP });
module.exports = { verdict, quickTake, clean, tierOf, parseJson, info };
