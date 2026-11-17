// v4 screenshots: node scripts/screenshots-v4.js [baseUrl]
// iPhone: Stores tab (live, link-only, fields), a multi-store search, and the product with the most stores.
const { chromium, devices } = require('playwright');
const base = process.argv[2] || 'http://localhost:8787';
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ ...devices['iPhone 15 Pro'], colorScheme: 'dark' });
  const p = await ctx.newPage();
  const snap = (n) => p.screenshot({ path: `screenshots/v4-iphone-${n}.png` });
  const to = (re) => p.evaluate((s) => [...document.querySelectorAll('.sec-h')].find((h) => new RegExp(s).test(h.textContent))?.scrollIntoView({ block: 'start' }), re);
  await p.goto(base + '/#/stores'); await p.waitForSelector('.scard', { timeout: 60000 }); await p.waitForTimeout(800); await snap('stores');
  await to('More stores'); await p.waitForTimeout(400); await snap('stores-links');
  await to('Fields'); await p.waitForTimeout(400); await snap('stores-fields');
  await p.goto(base + '/#/search?q=' + encodeURIComponent('glock 17'));
  await p.waitForSelector('#grid .pcard', { timeout: 90000 });
  await p.waitForFunction(() => !document.querySelector('#rcount .spin'), null, { timeout: 30000 }).catch(() => {});
  await p.waitForTimeout(1500); await snap('search');
  const sel = await p.$('select#sort, select[name=sort]');
  if (sel) { await sel.selectOption('stores').catch(() => {}); await p.waitForTimeout(800); await snap('search-most-stores'); }
  await p.locator('#grid .pcard').first().click(); await p.waitForSelector('.offers .offer', { timeout: 30000 }); await p.waitForTimeout(1200); await snap('product');
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
