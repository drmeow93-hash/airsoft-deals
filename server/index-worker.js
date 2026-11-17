// Runs one store's catalog crawl off the main thread (see indexer.js).
const { parentPort, workerData } = require('worker_threads');
const { get } = require('./http');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const { index } = require(workerData.module);
  let pages = 0;
  try {
    await index._crawl({
      fetchPage: async (url) => {
        if (pages > 0) await sleep(index._delayMs);
        parentPort.postMessage({ type: 'page', pages: ++pages });
        return get(url, { ttlMs: 60 * 1000, timeoutMs: 30000 });
      },
      add: (list, { deal = false } = {}) => parentPort.postMessage({ type: 'add', list, deal }),
    });
    parentPort.postMessage({ type: 'done' });
  } catch (e) {
    parentPort.postMessage({ type: 'error', error: String(e.message || e) });
  }
})();
