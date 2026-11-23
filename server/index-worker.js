// Runs one store's catalog crawl off the main thread (see indexer.js).
const { parentPort, workerData } = require('worker_threads');
const { get } = require('./http');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const { index } = require(workerData.module);
  let pages = 0;
  let parsedFrom = 0, cpuFrom = 0;
  const cpuMs = () => { const u = process.threadCpuUsage ? process.threadCpuUsage() : null; return u ? (u.user + u.system) / 1000 : null; };
  try {
    await index._crawl({
      fetchPage: async (url) => {
        // Render's free plan gives the whole process 0.1 CPU, so CPU this worker burns parsing a page throttles the
        // web thread too (seconds-long stalls for visitors). Rest ~30x this thread's CPU time per page (<=~3% of a
        // core). Wall time is a poor proxy (throttling inflates it ~10x), so it's only the fallback, capped at 20 s.
        if (pages > 0) {
          const c = cpuMs();
          const rest = c != null ? (c - cpuFrom) * 30 : Math.min((Date.now() - parsedFrom) * 2, 20000);
          await sleep(Math.max(index._delayMs, Math.min(rest, 30000)));
        }
        parentPort.postMessage({ type: 'page', pages: ++pages });
        const html = await get(url, { ttlMs: 60 * 1000, timeoutMs: 30000 });
        parsedFrom = Date.now(); cpuFrom = cpuMs() || 0;
        return html;
      },
      add: (list, { deal = false } = {}) => parentPort.postMessage({ type: 'add', list, deal }),
    });
    parentPort.postMessage({ type: 'done' });
  } catch (e) {
    parentPort.postMessage({ type: 'error', error: String(e.message || e) });
  }
})();
