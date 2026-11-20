// Slow, polite background indexer for stores without a robots-allowed search endpoint.
// Crawls robots-allowed listing pages at the store's Crawl-delay, keeps the catalog in memory,
// and answers searches locally. Refreshes on an interval; nothing is fetched per user search.
//
// Speed notes (Render free = 0.1 CPU, sleeps when idle):
//  - The last good catalog is saved as a gzipped snapshot (server/snapshot/) and a copy is bundled
//    with each deploy, so a wake from sleep starts with a full catalog instead of an empty one.
//  - Crawls run in a worker thread, one store at a time, so HTML parsing never blocks API requests.
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { Worker } = require('worker_threads');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9.]+/g, ' ').trim();
const SNAP_DIR = path.join(__dirname, 'snapshot');
let queue = Promise.resolve(); // one crawl at a time across all stores

function createIndex({ name, delayMs, refreshMs, crawl, workerModule }) {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const snapFile = path.join(SNAP_DIR, `${slug}.json.gz`);
  const idx = { items: [], deals: [], status: 'pending', pages: 0, builtAt: null, error: null, building: false, source: null };

  const prep = (p) => { p._n = norm(`${p.brand || ''} ${p.title}`); p._w = ` ${p._n} `; return p; };
  const strip = ({ _n, _w, ...p }) => p;

  function loadSnapshot() {
    try {
      const snap = JSON.parse(zlib.gunzipSync(fs.readFileSync(snapFile)));
      idx.items = snap.items.map(prep);
      const byUrl = new Map(idx.items.map((p) => [p.url, p]));
      idx.deals = snap.deals.map((p) => byUrl.get(p.url) || prep(p));
      idx.builtAt = snap.builtAt;
      idx.status = 'ready';
      idx.source = 'snapshot';
      console.log(`[index] ${name}: loaded snapshot from ${snap.builtAt} (${idx.items.length} products)`);
    } catch { /* no snapshot yet */ }
  }
  // Compressed in the libuv thread pool and written asynchronously: the old synchronous level-9 gzip of
  // a whole catalog froze the server for several seconds on the free plan's 0.1 CPU.
  function saveSnapshot() {
    let json;
    try { json = JSON.stringify({ name, builtAt: idx.builtAt, items: idx.items.map(strip), deals: idx.deals.map(strip) }); } catch (e) { return; }
    zlib.gzip(json, { level: 6 }, (err, buf) => {
      if (err) return console.log(`[index] ${name}: snapshot not saved: ${err.message}`);
      fs.promises.mkdir(SNAP_DIR, { recursive: true }).then(() => fs.promises.writeFile(snapFile, buf)).catch((e) => console.log(`[index] ${name}: snapshot not saved: ${e.message}`));
    });
  }

  // Runs the crawl either in a worker thread (HTML-heavy stores) or inline (feeds).
  function runCrawl(onAdd, onPage) {
    if (!workerModule) {
      let pages = 0;
      const { get } = require('./http');
      return crawl({
        fetchPage: async (url) => { if (pages > 0) await sleep(delayMs); onPage(++pages); return get(url, { ttlMs: 60 * 1000, timeoutMs: 30000 }); },
        add: onAdd,
      });
    }
    return new Promise((resolve, reject) => {
      const w = new Worker(path.join(__dirname, 'index-worker.js'), { workerData: { module: workerModule }, resourceLimits: { maxOldGenerationSizeMb: 160 } });
      let done = false;
      w.on('message', (m) => {
        if (m.type === 'add') onAdd(m.list, { deal: m.deal });
        else if (m.type === 'page') onPage(m.pages);
        else if (m.type === 'done') { done = true; resolve(); }
        else if (m.type === 'error') { done = true; reject(new Error(m.error)); }
      });
      w.on('error', (e) => { if (!done) { done = true; reject(e); } });
      w.on('exit', (code) => { if (!done) reject(new Error(`crawler exited (${code})`)); });
    });
  }

  async function build() {
    if (idx.building) return;
    idx.building = true;
    idx.status = idx.items.length ? 'refreshing' : 'indexing';
    const items = [], deals = [];
    idx.pages = 0;
    try {
      await runCrawl((list, { deal = false } = {}) => {
        for (const p of list) { prep(p); items.push(p); if (deal) deals.push(p); }
        // With no catalog at all yet, let searches use partial results while the crawl runs.
        if (!idx.builtAt) { idx.items = items.slice(); idx.deals = deals.slice(); }
      }, (pages) => { idx.pages = pages; });
      const seen = new Set();
      idx.items = items.filter((p) => !seen.has(p.url) && seen.add(p.url));
      const seenD = new Set();
      idx.deals = deals.filter((p) => !seenD.has(p.url) && seenD.add(p.url));
      idx.builtAt = new Date().toISOString();
      idx.status = 'ready';
      idx.source = 'live crawl';
      idx.error = null;
      saveSnapshot();
      console.log(`[index] ${name}: ${idx.items.length} products, ${idx.deals.length} deals from ${idx.pages} pages`);
    } catch (e) {
      idx.error = String(e.message || e);
      idx.status = idx.items.length ? 'ready (last refresh failed)' : 'failed';
      console.log(`[index] ${name} failed after ${idx.pages} pages: ${idx.error}`);
    } finally {
      idx.building = false;
    }
  }
  const queuedBuild = () => (queue = queue.then(build, build));

  function search(q, limit = 24) {
    const terms = norm(q).split(' ').filter(Boolean);
    if (!terms.length) return [];
    const hits = [];
    for (const p of idx.items) {
      let score = 0, ok = true;
      for (const t of terms) {
        if (!p._n.includes(t)) { ok = false; break; }
        score += p._w.includes(` ${t} `) ? 2 : 1;
      }
      if (ok) hits.push([score - p._n.length / 500, p]);
    }
    return hits.sort((a, b) => b[0] - a[0]).slice(0, limit).map(([, p]) => strip(p));
  }

  let started = false;
  function start(initialDelayMs = 0) {
    if (started) return;
    started = true;
    loadSnapshot();
    const age = idx.builtAt ? Date.now() - Date.parse(idx.builtAt) : Infinity;
    // A fresh-enough snapshot waits for its normal refresh time; otherwise refresh soon after boot.
    const first = age < refreshMs ? refreshMs - age : initialDelayMs;
    setTimeout(() => { queuedBuild(); setInterval(queuedBuild, refreshMs); }, first);
  }

  return {
    idx,
    start,
    _crawl: crawl,
    _delayMs: delayMs,
    search: async (q) => {
      if (!idx.items.length) throw new Error(idx.status === 'failed' ? `Index failed: ${idx.error}` : `Building catalog index (${idx.pages} pages so far)`);
      return search(q);
    },
    deals: async () => idx.deals.map(strip),
    info: () => ({ status: idx.status, products: idx.items.length, deals: idx.deals.length, pages: idx.pages, builtAt: idx.builtAt, source: idx.source, error: idx.error }),
  };
}

module.exports = { createIndex };
