// iPhone shot of the live store-status list: visits the site (which triggers the refresh cycle), opens the
// details list, saves one mid-cycle shot if the cycle is running, then waits for it to finish.
const { chromium, devices } = require('playwright');
const SITE = process.env.SITE || 'https://airsoft-deals.onrender.com';
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ ...devices['iPhone 14 Pro'], userAgent: devices['iPhone 14 Pro'].userAgent + ' AirsoftDealsFinder/1.0' });
  const p = await ctx.newPage();
  await p.goto(SITE + '/#/deals', { waitUntil: 'domcontentloaded' });
  await p.waitForSelector('#livebar', { timeout: 30000 });
  for (let i = 0; i < 40 && !(await p.$('#lbDetails')); i++) { await p.click('#livebar').catch(() => {}); await p.waitForTimeout(750); }
  const shot = async (f) => { const el = await p.$('#lbDetails'); await el.scrollIntoViewIfNeeded(); await p.evaluate(() => window.scrollBy(0, -90)); await p.screenshot({ path: f }); };
  if (await p.$('#livebar .spin')) { console.log('bar:', await p.textContent('#livebar')); await shot('screenshots/v10-iphone-store-checking.png'); }
  for (let i = 0; i < 120 && (await p.$('#livebar .spin')); i++) await p.waitForTimeout(2500);
  await p.waitForTimeout(3000);
  console.log('bar:', await p.textContent('#livebar'));
  console.log('rows:', (await p.$$eval('#lbList li', (l) => l.map((x) => x.innerText.replace(/\s+/g, ' ')))).join(' | '));
  await shot('screenshots/v10-iphone-store-status.png');
  await b.close();
})();
