// Live price-check status line: node scripts/screenshots-live.js [baseUrl]
const { chromium, devices } = require('playwright');
const base = process.argv[2] || 'http://localhost:8787';
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ ...devices['iPhone 15 Pro'], colorScheme: 'dark' });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => console.log('pageerror', e.message));
  const snap = (n) => p.screenshot({ path: `screenshots/v6-iphone-${n}.png` });
  await p.goto(base + '/#/search?q=' + encodeURIComponent(process.argv[3] || 'glock'));
  await p.waitForSelector('#grid .pcard', { timeout: 90000 });
  // Catch the bar while a check is running, if one is.
  const running = await p.waitForFunction(() => /Checking/.test(document.querySelector('#livebar').textContent), null, { timeout: 6000 }).then(() => true).catch(() => false);
  if (running) { await p.waitForTimeout(1200); await snap('livebar-checking'); }
  await p.waitForFunction(() => /Checked /.test(document.querySelector('#livebar').textContent), null, { timeout: 120000 });
  await p.waitForTimeout(1500); await snap('livebar-checked');
  console.log('bar:', await p.textContent('#livebar'));
  await p.click('#livebar'); await p.waitForTimeout(500); await snap('livebar-details');
  await p.locator('#grid .pcard').first().click(); await p.waitForSelector('.offers .offer');
  await p.waitForFunction(() => !/Re-checking/.test(document.querySelector('#livebar').textContent), null, { timeout: 30000 }).catch(() => {});
  await p.waitForTimeout(800); await snap('product-recheck');
  console.log('product bar:', await p.textContent('#livebar'));
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
