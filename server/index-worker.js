// Runs one store's catalog crawl off the main thread (see indexer.js).
const { parentPort, workerData } = require('worker_threads');
const { get } = require('./http');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const { index } = require(workerData.module);
  let pages = 0;
  let parsedFrom = 0;
  try {
    await index._crawl({
      fetchPage: async (url) => {
        // Render's free plan gives the whole process 0.1 CPU, so CPU this worker burns parsing a page throttles the
        // web thread too (seconds-long stalls for visitors). Rest ~9x the parse time between pages: <=10% duty cycle.
        const busy = parsedFrom ? Date.now() - parsedFrom : 0;
        if (pages > 0) await sleep(Math.max(index._delayMs, busy * 9));
        parentPort.postMessage({ type: 'page', pages: ++pages });
        const html = await get(url, { ttlMs: 60 * 1000, timeoutMs: 30000 });
        parsedFrom = Date.now();
        return html;
      },
      add: (list, { deal = false } = {}) => parentPort.postMessage({ type: 'add', list, deal }),
    });
    parentPort.postMessage({ type: 'done' });
  } catch (e) {
    parentPort.postMessage({ type: 'error', error: String(e.message || e) });
  }
})();
