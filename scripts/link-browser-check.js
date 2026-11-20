// Opens links in a real (headless) browser to tell bot-checks for curl apart from sites that are really down.
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15 AirsoftDealsFinder/1.0' });
  for (const u of process.argv.slice(2)) {
    try { const r = await p.goto(u, { waitUntil: 'domcontentloaded', timeout: 25000 }); await p.waitForTimeout(2500); console.log(u, r && r.status(), p.url(), JSON.stringify((await p.title()).slice(0, 70))); }
    catch (e) { console.log(u, 'ERR', e.message.split('\n')[0]); }
  }
  await b.close();
})();
