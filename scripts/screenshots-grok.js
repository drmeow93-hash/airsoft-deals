// Ask Grok screenshots: node scripts/screenshots-grok.js [baseUrl]
const { chromium, devices } = require('playwright');
const base = process.argv[2] || 'http://localhost:8787';
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ ...devices['iPhone 15 Pro'], colorScheme: 'dark' });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => console.log('pageerror', e.message));
  const snap = (n) => p.screenshot({ path: `screenshots/v5-iphone-${n}.png` });
  await p.goto(base + '/#/'); await p.waitForSelector('#homeDeals .pcard .askg', { timeout: 90000 }); await p.waitForTimeout(1500);
  await p.waitForTimeout(2500); await p.evaluate(() => { const r = document.querySelector('#homeDeals').getBoundingClientRect(); window.scrollTo(0, window.scrollY + r.top - 160); }); await p.waitForTimeout(1200); console.log('scrollY', await p.evaluate(() => window.scrollY));
  await snap('home-askgrok-button');
  await p.goto(base + '/#/search?q=' + encodeURIComponent('tokyo marui hi capa'));
  await p.waitForSelector('#grid .pcard .askg', { timeout: 90000 }); await p.waitForTimeout(2000);
  await p.locator('#grid .pcard .askg').first().click();
  await p.waitForSelector('.gs-verdict', { timeout: 40000 }); await p.waitForTimeout(700);
  await snap('askgrok-sheet');
  await p.evaluate(() => { const s = document.querySelector('#gsheet'); s.scrollTop = s.scrollHeight; }); await p.waitForTimeout(400);
  await snap('askgrok-sheet-bottom');
  await p.click('#gsClose'); await p.waitForTimeout(400);
  await p.locator('#grid .pcard').first().click(); await p.waitForSelector('.btn.grok'); await p.waitForTimeout(800);
  await p.evaluate(() => document.querySelector('.btn.grok').scrollIntoView({ block: 'center' })); await p.waitForTimeout(300);
  await snap('product-askgrok');
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
