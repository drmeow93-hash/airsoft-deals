const express = require('express');
const path = require('path');
const { stores, skipped } = require('./stores');
const { enrich, groupProducts } = require('./deals');

const app = express();
app.use((req, res, next) => { res.set('Access-Control-Allow-Origin', '*'); next(); });

async function fanOut(fn) {
  const t0 = Date.now();
  const settled = await Promise.allSettled(stores.map((s) => fn(s)));
  const items = [];
  const status = settled.map((r, i) => {
    const s = stores[i];
    if (r.status === 'fulfilled') { r.value.forEach((p) => items.push(enrich(p, s))); return { store: s.name, id: s.id, ok: true, count: r.value.length }; }
    return { store: s.name, id: s.id, ok: false, error: String(r.reason?.message || r.reason) };
  });
  return { items, status, ms: Date.now() - t0, fetchedAt: new Date().toISOString() };
}

app.get('/api/stores', (req, res) => res.json({
  stores: stores.map(({ id, name, base, location, blurb, platform }) => ({ id, name, url: base, location, blurb, platform })),
  skipped,
}));

app.get('/api/search', async (req, res) => {
  const q = String(req.query.q || '').trim().slice(0, 80);
  if (q.length < 2) return res.status(400).json({ error: 'Query too short' });
  const out = await fanOut((s) => s.search(q));
  const groups = groupProducts(out.items).sort((a, b) => b.storeCount - a.storeCount || a.bestPrice - b.bestPrice);
  res.json({ query: q, groups, status: out.status, ms: out.ms, fetchedAt: out.fetchedAt, offerCount: out.items.length });
});

app.get('/api/deals', async (req, res) => {
  // Keep each store's top 60 by discount so one big catalog doesn't drown out the rest.
  const out = await fanOut(async (s) => (await s.deals())
    .map((p) => ({ ...p, _d: p.originalPrice ? (p.originalPrice - p.price) / p.originalPrice : 0 }))
    .filter((p) => p._d <= 0.8 || p.storeDeal)
    .sort((a, b) => b._d - a._d)
    // Collapse color/size variants ("Pouch - Black", "Pouch - Tan") so one product doesn't fill the feed.
    .filter(((seen) => (p) => { const k = p.title.split(/\s[-–|]\s/)[0].toLowerCase(); return seen.has(k) ? false : seen.add(k); })(new Set()))
    .slice(0, 60).map(({ _d, ...p }) => p));
  // Interleave stores (each in its own discount order) so the default feed is a fair mix.
  const byStore = {};
  for (const g of groupProducts(out.items)) (byStore[g.offers[0].storeId] ||= []).push(g);
  const lists = Object.values(byStore).map((l) => l.sort((a, b) => b.discountPct - a.discountPct));
  const mixed = [];
  for (let i = 0; lists.some((l) => l[i]); i++) lists.forEach((l) => l[i] && mixed.push(l[i]));
  return res.json({ groups: mixed, status: out.status, ms: out.ms, fetchedAt: out.fetchedAt, offerCount: out.items.length });
  const groups = groupProducts(out.items).sort((a, b) => b.discountPct - a.discountPct || a.bestPrice - b.bestPrice);
  res.json({ groups, status: out.status, ms: out.ms, fetchedAt: out.fetchedAt, offerCount: out.items.length });
});

app.use(express.static(path.join(__dirname, '..', 'public'), { extensions: ['html'] }));

const port = process.env.PORT || 8787;
app.listen(port, () => console.log(`Airsoft Deals running on http://localhost:${port}`));
