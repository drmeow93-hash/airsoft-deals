// Price history. Real observed prices only, never back-filled.
//
// Where it lives: data/history/<storeId>.json in the GitHub repo. A scheduled GitHub Actions job
// (.github/workflows/price-history.yml -> scripts/collect-history.js) runs the same polite crawlers
// twice a day and commits a point only when a product's price changes. The server loads the copy
// bundled with each deploy at boot, then pulls the newest copy from raw.githubusercontent.com every
// few hours, so history survives Render's free-plan restarts without a disk.
//
// File format (one product per line so git stores tiny diffs):
//   { "v":1, "store":"amped", "since":"2026-11-16", "updated":"<ISO>", "items": {
//     "<key>": ["2026-11-16",129.99,"2026-11-20",119.99], ... } }
// <key> = 11-char hash of the normalized product URL. Points are [date, price] pairs (UTC dates),
// appended only when the price differs from the previous point.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DIR = path.join(__dirname, '..', 'data', 'history');
const RAW = (process.env.HISTORY_RAW_BASE || 'https://raw.githubusercontent.com/drmeow93-hash/airsoft-deals/main/data/history').replace(/\/$/, '');
const MAX_PTS = 40; // points sent to the browser per offer

// Dates are calendar days in US Central time (the owner's time zone).
const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Chicago' });

// Normalize a product URL so the same page always gets the same key (protocol, www, query, slash).
function normUrl(u) {
  try {
    const x = new URL(u);
    const host = x.hostname.replace(/^www\./, '').toLowerCase();
    const pid = x.searchParams.get('product_id'); // OpenCart non-SEO links
    if (pid) return `${host}/product_id=${pid}`;
    return host + decodeURIComponent(x.pathname).toLowerCase().replace(/\/+$/, '');
  } catch { return String(u || '').toLowerCase(); }
}
const keyOf = (url) => crypto.createHash('sha1').update(normUrl(url)).digest('base64url').slice(0, 11);

const H = new Map(); // key -> flat [d, p, d, p, ...]
let meta = { since: null, updated: null, tracked: 0, stores: {} };
let drops = []; // from data/history/drops.json (written by the collector, includes titles/images)
const liveDrops = new Map(); // drops seen live by this server since boot (memory only)

function ingest(file) {
  if (!file || !file.items) return;
  for (const [k, v] of Object.entries(file.items)) H.set(k, v);
  meta.stores[file.store] = { since: file.since, updated: file.updated, tracked: Object.keys(file.items).length };
}
function recomputeMeta() {
  const s = Object.values(meta.stores);
  meta.tracked = s.reduce((a, x) => a + x.tracked, 0);
  meta.since = s.map((x) => x.since).filter(Boolean).sort()[0] || null;
  meta.updated = s.map((x) => x.updated).filter(Boolean).sort().pop() || null;
}

function loadLocal() {
  try {
    for (const f of fs.readdirSync(DIR)) {
      if (!f.endsWith('.json') || f === 'index.json') continue;
      const j = JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8'));
      if (f === 'drops.json') drops = j.items || [];
      else ingest(j);
    }
    recomputeMeta();
    console.log(`[history] loaded ${meta.tracked} tracked products (since ${meta.since}, updated ${meta.updated})`);
  } catch (e) { console.log('[history] no local history:', e.message); }
}

// Pull the newest history committed by the GitHub Action (cheap: index.json first, files only if changed).
let remoteUpdated = null;
async function refreshRemote() {
  try {
    const idx = await (await fetch(`${RAW}/index.json`, { signal: AbortSignal.timeout(15000) })).json();
    if (!idx.updated || idx.updated === remoteUpdated || idx.updated === meta.updated) { remoteUpdated = idx.updated; return false; }
    for (const f of idx.files || []) {
      const r = await fetch(`${RAW}/${f}`, { signal: AbortSignal.timeout(30000) });
      if (!r.ok) continue;
      const j = await r.json();
      if (f === 'drops.json') drops = j.items || []; else ingest(j);
    }
    recomputeMeta();
    remoteUpdated = idx.updated;
    onUpdate.forEach((fn) => fn());
    console.log(`[history] refreshed from GitHub: ${meta.tracked} products, updated ${meta.updated}`);
    return true;
  } catch (e) { console.log('[history] remote refresh failed:', e.message); return false; }
}
const onUpdate = [];

const pairs = (flat) => { const out = []; for (let i = 0; i + 1 < flat.length; i += 2) out.push([flat[i], flat[i + 1]]); return out; };
const dayDiff = (a, b) => Math.max(0, Math.round((Date.parse(b) - Date.parse(a)) / 864e5));

// Summarize a [date, price] series: latest change, low/high, time-weighted average, all-time low.
function summarize(pts) {
  if (!pts.length) return null;
  const n = pts.length, cur = pts[n - 1];
  const s = { since: pts[0][0], pts: pts.slice(-MAX_PTS) };
  let lo = Infinity, hi = -Infinity, w = 0, sum = 0;
  const end = today();
  pts.forEach(([d, p], i) => {
    lo = Math.min(lo, p); hi = Math.max(hi, p);
    const days = Math.max(1, dayDiff(d, i + 1 < n ? pts[i + 1][0] : end));
    w += days; sum += p * days;
  });
  s.lo = lo; s.hi = hi; s.avg = +(sum / w).toFixed(2);
  if (n >= 2) {
    const prev = pts[n - 2];
    s.prev = prev[1]; s.prevAt = prev[0]; s.at = cur[0];
    s.chg = +(cur[1] - prev[1]).toFixed(2);
    s.pct = +(((cur[1] - prev[1]) / prev[1]) * 100).toFixed(1);
    s.atl = cur[1] <= lo && hi > lo;
  }
  return s;
}

// Series for one offer: recorded points plus the live price if it differs from the last recording.
function seriesFor(o) {
  const rec = H.get(keyOf(o.url));
  const pts = rec ? pairs(rec) : [];
  const t = today();
  if (o.price) {
    const last = pts[pts.length - 1];
    if (!last) pts.push([t, o.price]);
    else if (Math.abs(last[1] - o.price) >= 0.01) {
      if (last[0] === t) pts[pts.length - 1] = [t, o.price]; else pts.push([t, o.price]);
    }
  }
  return pts;
}

// Live prices seen by this server are kept in memory as history points, so a change found by a
// visit-triggered refresh shows up in every arrow until the collector commits it (twice a day).
function remember(o, pts) {
  const k = keyOf(o.url), rec = H.get(k);
  const last = pts[pts.length - 1];
  if (!last || (rec && rec.length >= 2 && rec[rec.length - 2] === last[0] && Math.abs(rec[rec.length - 1] - last[1]) < 0.01)) return;
  if (!rec && H.size > 90000) return; // memory guard
  H.set(k, pts.flat());
}

function attachOffer(o) {
  const pts = seriesFor(o);
  if (o.price) remember(o, pts);
  o.h = summarize(pts);
  if (o.h && o.h.chg < 0 && o.h.at === today()) {
    liveDrops.set(keyOf(o.url), { ...o, h: undefined, prev: o.h.prev, prevAt: o.h.prevAt, at: o.h.at });
    if (liveDrops.size > 2000) liveDrops.delete(liveDrops.keys().next().value);
  }
  return pts;
}

// Group (same product across stores): best price over time = lowest live offer at each date.
function attachGroup(g) {
  const series = g.offers.map(attachOffer);
  const dates = [...new Set(series.flat().map(([d]) => d))].sort();
  const merged = [];
  for (const d of dates) {
    let best = Infinity;
    for (const s of series) {
      let v = null;
      for (const [sd, sp] of s) { if (sd <= d) v = sp; else break; }
      if (v != null) best = Math.min(best, v);
    }
    if (best < Infinity && (!merged.length || Math.abs(merged[merged.length - 1][1] - best) >= 0.01)) merged.push([d, best]);
  }
  g.h = summarize(merged);
  return g;
}

function dropItems() {
  const seen = new Set(), out = [];
  const cutoff = new Date(Date.now() - 21 * 864e5).toLocaleDateString('en-CA', { timeZone: 'America/Chicago' });
  for (const d of [...liveDrops.values(), ...drops]) {
    const k = keyOf(d.url);
    if (seen.has(k) || !d.at || d.at < cutoff) continue;
    seen.add(k); out.push(d);
  }
  return out;
}

loadLocal();

module.exports = { keyOf, normUrl, attachOffer, attachGroup, summarize, refreshRemote, dropItems, meta: () => meta, onUpdate, today, pairs };
