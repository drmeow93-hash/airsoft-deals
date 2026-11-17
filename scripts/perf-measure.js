// Round 9 load-time measurements: cold vs warm, mobile vs desktop, plus galaxy animation cost.
// node scripts/perf-measure.js [baseUrl] [label]
const { chromium, devices } = require('playwright');
const base = process.argv[2] || 'https://airsoft-deals.onrender.com';
const label = process.argv[3] || 'run';
const PROFILES = {
  // Lighthouse-like mobile: 4x CPU slowdown, ~1.6 Mbps / 150 ms RTT
  mobile: { ctx: { ...devices['iPhone 15 Pro'] }, cpu: 4, net: { latency: 150, downloadThroughput: 1.6e6 / 8, uploadThroughput: 750e3 / 8 } },
  desktop: { ctx: { viewport: { width: 1440, height: 900 } }, cpu: 1, net: { latency: 40, downloadThroughput: 10e6 / 8, uploadThroughput: 5e6 / 8 } },
};
async function once(b, prof, page, warmCtx) {
  const ctx = warmCtx || await b.newContext({ ...prof.ctx, colorScheme: 'dark' });
  const p = await ctx.newPage();
  const cdp = await ctx.newCDPSession(p);
  await cdp.send('Network.enable');
  await cdp.send('Network.emulateNetworkConditions', { offline: false, ...prof.net });
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: prof.cpu });
  let bytes = 0, reqs = 0; const api = {};
  cdp.on('Network.loadingFinished', (e) => { bytes += e.encodedDataLength; reqs++; });
  const t0 = Date.now();
  await p.goto(base + page.path, { waitUntil: 'commit' });
  const sel = page.ready;
  await p.waitForSelector(sel, { timeout: 120000 });
  const tReady = Date.now() - t0;
  await p.waitForLoadState('load');
  const nav = await p.evaluate(() => { const n = performance.getEntriesByType('navigation')[0]; const fcp = performance.getEntriesByName('first-contentful-paint')[0]; return { ttfb: Math.round(n.responseStart), dcl: Math.round(n.domContentLoadedEventEnd), load: Math.round(n.loadEventEnd), fcp: Math.round(fcp?.startTime || 0) }; });
  // Long tasks proxy for TTI: wait until 2 s with no long task
  const tti = await p.evaluate(() => new Promise((res) => { let last = performance.now(); const o = new PerformanceObserver((l) => { for (const e of l.getEntries()) last = Math.max(last, e.startTime + e.duration); }); try { o.observe({ type: 'longtask', buffered: true }); } catch { /* */ } const chk = () => (performance.now() - last > 2000 ? (o.disconnect(), res(Math.round(last))) : setTimeout(chk, 250)); setTimeout(chk, 250); }));
  await p.waitForTimeout(300);
  const out = { ...nav, contentReady: tReady, tti, kb: Math.round(bytes / 1024), reqs };
  await p.close();
  return { out, ctx };
}
(async () => {
  const b = await chromium.launch();
  const pages = [{ name: 'home', path: '/#/', ready: '#homeDeals .pcard' }, { name: 'search', path: '/#/search?q=hi-capa', ready: '#grid .pcard' }];
  for (const [pn, prof] of Object.entries(PROFILES)) {
    for (const page of pages) {
      const cold = await once(b, prof, page);
      const warm = await once(b, prof, page, cold.ctx);
      console.log(label, pn.padEnd(7), page.name.padEnd(6), 'cold', JSON.stringify(cold.out), '\n', ' '.repeat(label.length), pn.padEnd(7), page.name.padEnd(6), 'warm', JSON.stringify(warm.out));
      await cold.ctx.close();
    }
  }
  // Galaxy cost: main-thread time over 5 s idle on home (desktop, no throttle), animating vs paused.
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } }); const p = await ctx.newPage(); const cdp = await ctx.newCDPSession(p);
  await p.goto(base + '/#/'); await p.waitForSelector('#homeDeals .pcard', { timeout: 120000 }); await p.waitForTimeout(3000);
  await cdp.send('Performance.enable');
  const m = async () => Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map((x) => [x.name, x.value]));
  const sample = async () => { const a = await m(); const f0 = await p.evaluate(() => new Promise((r) => { let n = 0; const s = performance.now(); const tick = () => { n++; if (performance.now() - s < 5000) requestAnimationFrame(tick); else r(n); }; requestAnimationFrame(tick); })); const z = await m(); return { taskMs: Math.round((z.TaskDuration - a.TaskDuration) * 1000), styleMs: Math.round((z.RecalcStyleDuration - a.RecalcStyleDuration) * 1000), layoutMs: Math.round((z.LayoutDuration - a.LayoutDuration) * 1000), frames: f0 }; };
  const on = await sample();
  await p.evaluate(() => document.documentElement.classList.add('paused'));
  const off = await sample();
  console.log(label, 'galaxy 5s idle: animating', JSON.stringify(on), 'paused', JSON.stringify(off));
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
