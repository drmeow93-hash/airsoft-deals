// Price-history collector. Run by GitHub Actions twice a day (.github/workflows/price-history.yml)
// or by hand: `node scripts/collect-history.js`.
//
// Uses the same compliant routes as the app (robots.txt-allowed endpoints, honest User-Agent, each
// store's Crawl-delay or 2 s+ between requests, no bot-check evasion). Records each product's
// current price and appends a point to data/history/<store>.json only when the price changed.
process.env.NO_BACKGROUND = '1';
const fs = require('fs');
const path = require('path');
const { stores } = require('../server/stores');
const { get } = require('../server/http');
const { keyOf, pairs, summarize } = require('../server/history');

const DIR = path.join(__dirname, '..', 'data', 'history');
const TODAY = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Chicago' });
const NOW = new Date().toISOString();
const MAX_POINTS = 200;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// Searches used for stores that only have an HTML search page (no catalog route allowed).
const TERMS = ['Glock', 'Hi-Capa', 'M4', 'AK', 'MP5', 'Tokyo Marui', 'Elite Force', 'KWA', 'VFC', 'G&G', 'Krytac', 'Novritsch', 'sniper', 'shotgun', 'HPA', 'gas blowback', 'magazine', 'BBs', 'green gas', 'red dot', 'plate carrier', 'mask', 'hop up', 'battery'];
const only = process.argv.slice(2);

function politeFetcher(delayMs) {
  let n = 0;
  const wait = async () => { if (n++) await sleep(delayMs); };
  return {
    fetchPage: async (url) => { await wait(); return get(url, { ttlMs: 1000, timeoutMs: 30000 }); },
    fetchJson: async (url) => { await wait(); return get(url, { json: true, ttlMs: 1000, timeoutMs: 30000 }); },
  };
}

async function collect(s) {
  const t0 = Date.now();
  let items = [];
  if (s.index) {
    const f = politeFetcher(s.index._delayMs);
    await s.index._crawl({ fetchPage: f.fetchPage, add: (list) => items.push(...list) });
  } else if (s.catalog) {
    items = await s.catalog(politeFetcher(2000));
  } else {
    items.push(...await s.deals().catch(() => []));
    for (const q of TERMS) { await sleep(3000); items.push(...await s.search(q).catch(() => [])); }
  }
  const seen = new Set();
  items = items.filter((p) => p && p.url && p.price > 0 && p.price < 20000 && !seen.has(p.url) && seen.add(p.url));
  console.log(`${s.name}: ${items.length} products in ${Math.round((Date.now() - t0) / 1000)} s`);
  return items;
}

function readStore(id) {
  try { return JSON.parse(fs.readFileSync(path.join(DIR, `${id}.json`), 'utf8')); } catch { return { v: 1, store: id, since: TODAY, updated: null, items: {} }; }
}
// One product per line: git keeps each run's commit to the lines whose price changed.
function writeStore(file) {
  const lines = Object.entries(file.items).sort(([a], [b]) => (a < b ? -1 : 1)).map(([k, v]) => `${JSON.stringify(k)}:${JSON.stringify(v)}`);
  const head = JSON.stringify({ v: 1, store: file.store, since: file.since, updated: file.updated }).slice(0, -1);
  fs.writeFileSync(path.join(DIR, `${file.store}.json`), `${head},"items":{\n${lines.join(',\n')}\n}}\n`);
}

(async () => {
  fs.mkdirSync(DIR, { recursive: true });
  const targets = stores.filter((s) => !s.feed && (!only.length || only.includes(s.id)));
  let oldDrops = [];
  try { oldDrops = JSON.parse(fs.readFileSync(path.join(DIR, 'drops.json'), 'utf8')).items || []; } catch {}
  const okStores = new Set();
  const drops = [];
  let changed = 0, added = 0;
  // Different stores run in parallel; requests to the same store are sequential and spaced out.
  await Promise.all(targets.map(async (s) => {
    let items;
    try { items = await collect(s); } catch (e) { console.log(`${s.name}: FAILED ${e.message}`); return; }
    if (!items.length) return;
    okStores.add(s.id);
    const file = readStore(s.id);
    for (const p of items) {
      const k = keyOf(p.url);
      const v = file.items[k];
      const price = Math.round(p.price * 100) / 100;
      if (!v) { file.items[k] = [TODAY, price]; added++; continue; }
      const lastP = v[v.length - 1], lastD = v[v.length - 2];
      if (Math.abs(lastP - price) < 0.01) continue;
      if (lastD === TODAY) v[v.length - 1] = price; else v.push(TODAY, price);
      // Same-day flip back to the previous price: drop the no-op point.
      if (v.length >= 4 && Math.abs(v[v.length - 3] - v[v.length - 1]) < 0.01 && v[v.length - 2] === TODAY) v.splice(-2, 2);
      while (v.length > MAX_POINTS * 2) v.splice(0, 2);
      changed++;
    }
    for (const p of items) {
      const h = summarize(pairs(file.items[keyOf(p.url)] || []));
      if (h && h.chg < 0 && h.pct <= -1) drops.push({ ...p, storeId: s.id, prev: h.prev, prevAt: h.prevAt, at: h.at });
    }
    file.updated = NOW;
    writeStore(file);
  }));
  const keep = oldDrops.filter((d) => !okStores.has(d.storeId));
  const cutoff = new Date(Date.now() - 21 * 864e5).toLocaleDateString('en-CA', { timeZone: 'America/Chicago' });
  const allDrops = [...drops, ...keep].filter((d) => d.at >= cutoff)
    .sort((a, b) => (b.at > a.at ? 1 : b.at < a.at ? -1 : (a.price / a.prev) - (b.price / b.prev))).slice(0, 400);
  fs.writeFileSync(path.join(DIR, 'drops.json'), JSON.stringify({ updated: NOW, items: allDrops }) + '\n');
  const files = fs.readdirSync(DIR).filter((f) => f.endsWith('.json') && f !== 'index.json').sort();
  const tracked = files.filter((f) => f !== 'drops.json').reduce((n, f) => n + Object.keys(JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8')).items).length, 0);
  fs.writeFileSync(path.join(DIR, 'index.json'), JSON.stringify({ updated: NOW, tracked, files }, null, 1) + '\n');
  console.log(`done: ${okStores.size}/${targets.length} stores, ${tracked} tracked, ${added} new, ${changed} price changes, ${allDrops.length} recent drops`);
  process.exit(0);
})();
