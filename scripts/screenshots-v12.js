// v12 screenshots: home hero, search results, product page, deals, dashboard (iPhone + desktop).
// Usage: SITE=… PREFIX=v12-before node scripts/screenshots-v12.js
const { chromium, devices } = require('playwright');
const SITE = process.env.SITE || 'https://airsoft-deals.onrender.com';
const PREFIX = process.env.PREFIX || 'v12-after';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const b = await chromium.launch();
  for (const [name, dev] of [['iphone', devices['iPhone 14 Pro']], ['desktop', { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 }]]) {
    const ctx = await b.newContext({ ...dev, userAgent: (dev.userAgent || 'Mozilla/5.0') + ' AirsoftDealsFinder/1.0 (screenshots)' });
    const p = await ctx.newPage();
    const shot = async (n) => { await sleep(1800); await p.screenshot({ path: `screenshots/${PREFIX}-${name}-${n}.png` }); };
    await p.goto(SITE + '/', { waitUntil: 'domcontentloaded' }); await p.waitForSelector('#app *', { timeout: 60000 }); await sleep(2500); await shot('home');
    await p.evaluate(() => { location.hash = '#/search?q=glock'; });
    await p.waitForFunction(() => document.querySelectorAll('#grid .pcard').length > 3, null, { timeout: 60000 }); await sleep(2500); await shot('search');
    await p.click('#grid .pcard'); await p.waitForSelector('.prod2, .prod', { timeout: 20000 }); await shot('product');
    const t = await p.$('[data-watch], #watchBtn, .watch-btn, button:has-text("Track")'); if (t) await t.click().catch(() => {});
    await p.evaluate(() => { location.hash = '#/deals'; }); await p.waitForSelector('#grid .pcard', { timeout: 60000 }); await sleep(1500); await shot('deals');
    await p.evaluate(() => { location.hash = '#/dashboard'; }); await sleep(1500); await shot('dashboard');
    await ctx.close();
  }
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
