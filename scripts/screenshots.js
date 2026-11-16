// Usage: node scripts/screenshots.js [baseUrl]
const { chromium, devices } = require('playwright');
const base = process.argv[2] || 'http://localhost:8787';
(async () => {
  const b = await chromium.launch();
  const shots = async (ctxOpts, prefix) => {
    const ctx = await b.newContext({ ...ctxOpts, colorScheme: 'dark' });
    const p = await ctx.newPage();
    await p.goto(base + '/#/'); await p.waitForSelector('#homeDeals .pcard', { timeout: 60000 }); await p.waitForTimeout(1500);
    await p.screenshot({ path: `screenshots/${prefix}-home.png` });
    await p.goto(base + '/#/search?q=Glock'); await p.waitForSelector('#grid .pcard', { timeout: 60000 }); await p.waitForTimeout(1500);
    await p.screenshot({ path: `screenshots/${prefix}-search-glock.png` });
    await p.locator('#sort').selectOption('stores'); await p.waitForTimeout(300);
    await p.locator('#grid .pcard').first().click(); await p.waitForSelector('.offers .offer'); await p.waitForTimeout(1500);
    await p.screenshot({ path: `screenshots/${prefix}-product-compare.png`, fullPage: prefix === 'iphone' });
    await p.goto(base + '/#/deals'); await p.waitForSelector('#grid .pcard', { timeout: 60000 }); await p.waitForTimeout(1500);
    await p.screenshot({ path: `screenshots/${prefix}-deals.png` });
    await ctx.close();
  };
  await shots({ viewport: { width: 1360, height: 900 } }, 'desktop');
  await shots({ ...devices['iPhone 15 Pro'], defaultBrowserType: undefined }, 'iphone');
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
