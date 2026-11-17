// Slow, polite background indexer for stores without a robots-allowed search endpoint.
// Crawls robots-allowed listing pages at the store's Crawl-delay, keeps the catalog in memory,
// and answers searches locally. Refreshes on an interval; nothing is fetched per user search.
const { get } = require('./http');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9.]+/g, ' ').trim();

function createIndex({ name, delayMs, refreshMs, crawl }) {
  const idx = { items: [], deals: [], status: 'pending', pages: 0, builtAt: null, error: null, building: false };

  async function build() {
    if (idx.building) return;
    idx.building = true;
    idx.status = idx.items.length ? 'refreshing' : 'indexing';
    const items = [], deals = [];
    let pages = 0;
    const fetchPage = async (url) => {
      if (pages > 0) await sleep(delayMs);
      pages++;
      idx.pages = pages;
      return get(url, { ttlMs: 60 * 1000, timeoutMs: 30000 });
    };
    try {
      await crawl({
        fetchPage,
        add: (list, { deal = false } = {}) => {
          for (const p of list) {
            p._n = norm(`${p.brand || ''} ${p.title}`);
            items.push(p);
            if (deal) deals.push(p);
          }
          // Let searches use partial results while the first crawl is still running.
          if (!idx.builtAt) { idx.items = items.slice(); idx.deals = deals.slice(); }
        },
      });
      const seen = new Set();
      idx.items = items.filter((p) => !seen.has(p.url) && seen.add(p.url));
      const seenD = new Set();
      idx.deals = deals.filter((p) => !seenD.has(p.url) && seenD.add(p.url));
      idx.builtAt = new Date().toISOString();
      idx.status = 'ready';
      idx.error = null;
      console.log(`[index] ${name}: ${idx.items.length} products, ${deals.length} deals from ${pages} pages`);
    } catch (e) {
      idx.error = String(e.message || e);
      idx.status = idx.items.length ? 'ready (last refresh failed)' : 'failed';
      console.log(`[index] ${name} failed after ${pages} pages: ${idx.error}`);
    } finally {
      idx.building = false;
    }
  }

  function search(q, limit = 24) {
    const terms = norm(q).split(' ').filter(Boolean);
    if (!terms.length) return [];
    const hits = [];
    for (const p of idx.items) {
      if (terms.every((t) => p._n.includes(t))) {
        const score = terms.reduce((s, t) => s + (new RegExp(`\\b${t.replace(/[.]/g, '\\.')}\\b`).test(p._n) ? 2 : 1), 0) - p._n.length / 500;
        hits.push([score, p]);
      }
    }
    return hits.sort((a, b) => b[0] - a[0]).slice(0, limit).map(([, { _n, ...p }]) => p);
  }

  let timer = null;
  function start(initialDelayMs = 0) {
    if (timer) return;
    setTimeout(build, initialDelayMs);
    timer = setInterval(build, refreshMs);
  }

  return {
    idx,
    start,
    search: async (q) => {
      if (!idx.items.length) throw new Error(idx.status === 'failed' ? `Index failed: ${idx.error}` : `Building catalog index (${idx.pages} pages so far)`);
      return search(q);
    },
    deals: async () => idx.deals.map(({ _n, ...p }) => p),
    info: () => ({ status: idx.status, products: idx.items.length, deals: idx.deals.length, pages: idx.pages, builtAt: idx.builtAt, error: idx.error }),
  };
}

module.exports = { createIndex };
