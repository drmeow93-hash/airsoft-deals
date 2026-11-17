// v2 screenshots: node scripts/screenshots.js [baseUrl]
const { chromium, devices } = require('playwright');
const base = process.argv[2] || 'http://localhost:8787';
(async () => {
  const b = await chromium.launch();
  const shots = async (ctxOpts, prefix) => {
    const ctx = await b.newContext({ ...ctxOpts, colorScheme: 'dark' });
    const p = await ctx.newPage();
    const snap = (n, o = {}) => p.screenshot({ path: `screenshots/v2-${prefix}-${n}.png`, ...o });
    await p.goto(base + '/#/'); await p.waitForSelector('#homeDeals .pcard', { timeout: 90000 }); await p.waitForTimeout(1500);
    await snap('home-tabbar');
    await p.goto(base + '/#/search?q=Glock'); await p.waitForSelector('#grid .pcard', { timeout: 60000 });
    await p.waitForFunction(() => !document.querySelector('#rcount .spin'), null, { timeout: 30000 }).catch(() => {}); await p.waitForTimeout(1500);
    await snap('search-results');
    if (prefix === 'iphone') { await p.click('#openF'); await p.waitForTimeout(600); await snap('filters-sheet'); await p.click('#closeF'); await p.waitForTimeout(400); }
    await p.selectOption('#sort', 'stores'); await p.waitForTimeout(300);
    await p.locator('#grid .pcard').first().click(); await p.waitForSelector('.offers .offer'); await p.waitForTimeout(1200);
    await snap('product');
    await p.evaluate(() => document.querySelector('.hist').scrollIntoView({ block: 'center' })); await p.waitForTimeout(500);
    await snap('product-history-chart');
    await p.goto(base + '/#/drops'); await p.waitForTimeout(3000);
    await snap('price-drops');
    await p.goto(base + '/#/deals'); await p.waitForSelector('#grid .pcard', { timeout: 60000 }); await p.waitForTimeout(1500);
    await snap('deals');
    await p.goto(base + '/#/c/pistols'); await p.waitForSelector('#grid .pcard', { timeout: 60000 }); await p.waitForTimeout(1500);
    await snap('category-pistols');
    await p.goto(base + '/#/'); await p.waitForSelector('#homeDeals .pcard'); await p.fill('#q', 'kry'); await p.focus('#q'); await p.waitForTimeout(1200);
    await snap('autocomplete');
    await ctx.close();
  };
  await shots({ viewport: { width: 1440, height: 900 } }, 'desktop');
  await shots({ ...devices['iPhone 15 Pro'] }, 'iphone');
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
