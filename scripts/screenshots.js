// v3 screenshots: node scripts/screenshots.js [baseUrl]
// Home, Pistols, Rifles, Stores, Brands, a brand page and a product page, on desktop and iPhone.
const { chromium, devices } = require('playwright');
const base = process.argv[2] || 'http://localhost:8787';
(async () => {
  const b = await chromium.launch();
  const shots = async (ctxOpts, prefix) => {
    const ctx = await b.newContext({ ...ctxOpts, colorScheme: 'dark' });
    const p = await ctx.newPage();
    const snap = (n, o = {}) => p.screenshot({ path: `screenshots/v3-${prefix}-${n}.png`, ...o });
    const grid = async () => { await p.waitForSelector('#grid .pcard', { timeout: 90000 }); await p.waitForFunction(() => !document.querySelector('#rcount .spin'), null, { timeout: 30000 }).catch(() => {}); await p.waitForTimeout(1500); };
    await p.goto(base + '/#/'); await p.waitForSelector('#homeDeals .pcard', { timeout: 90000 }); await p.waitForSelector('#homeBrands a.chip', { timeout: 30000 }).catch(() => {}); await p.waitForTimeout(1500);
    await snap('home');
    await p.evaluate(() => document.querySelector('#homeBrands')?.scrollIntoView({ block: 'center' })); await p.waitForTimeout(500);
    await snap('home-brands');
    await p.goto(base + '/#/c/pistols'); await grid(); await snap('category-pistols');
    await p.goto(base + '/#/c/rifles'); await grid(); await snap('category-rifles');
    await p.goto(base + '/#/stores'); await p.waitForSelector('.scard', { timeout: 30000 }); await p.waitForTimeout(800); await snap('stores');
    await p.evaluate(() => [...document.querySelectorAll('.sec-h')].find((h) => /More stores/.test(h.textContent))?.scrollIntoView({ block: 'start' })); await p.waitForTimeout(500); await snap('stores-links');
    await p.goto(base + '/#/brands'); await p.waitForSelector('.bcard', { timeout: 30000 }); await p.waitForTimeout(800); await snap('brands');
    await p.goto(base + '/#/b/tokyo-marui'); await grid(); await snap('brand-tokyo-marui');
    await p.locator('#grid .pcard').first().click(); await p.waitForSelector('.offers .offer'); await p.waitForTimeout(1200); await snap('product');
    await ctx.close();
  };
  await shots({ viewport: { width: 1440, height: 900 } }, 'desktop');
  await shots({ ...devices['iPhone 15 Pro'] }, 'iphone');
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
