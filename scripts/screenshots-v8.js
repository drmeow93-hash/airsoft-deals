// v8 screenshots: "good price?" verdict, multi-store chart, home, deals filters, dashboard + alerts, import.
// node scripts/screenshots-v8.js [baseUrl] [prefix]
const { chromium, devices } = require('playwright');
const base = process.argv[2] || 'http://localhost:8787';
const pre = process.argv[3] || 'v8';
(async () => {
  const b = await chromium.launch();
  const run = async (name, ctxOpts, fn) => { const ctx = await b.newContext({ ...ctxOpts, colorScheme: 'dark' }); const p = await ctx.newPage(); p.on('pageerror', (e) => console.log('pageerror', e.message)); try { await fn(p, (n) => p.screenshot({ path: `screenshots/${pre}-${name}-${n}.png` })); } finally { await ctx.close(); } };
  const phone = devices['iPhone 15 Pro'], desk = { viewport: { width: 1440, height: 900 } };
  const pickProduct = async (p) => {
    await p.goto(base + '/#/drops'); await p.waitForSelector('#grid .pcard, #grid .empty', { timeout: 90000 }); await p.waitForTimeout(1500);
    let id = await p.evaluate(() => { const gs = [...S.groups.values()].filter((g) => g.h?.chg < 0 && g.storeCount >= 2); gs.sort((a, b) => b.storeCount - a.storeCount); return gs[0]?.id; });
    if (!id) { await p.goto(base + '/#/'); await p.waitForSelector('#homePop .pcard', { timeout: 60000 }); id = await p.evaluate(() => [...S.groups.values()].sort((a, b) => b.storeCount - a.storeCount)[0].id); }
    return id;
  };
  for (const [name, opts] of [['iphone', phone], ['desktop', desk]]) {
    await run(name, opts, async (p, snap) => {
      await p.goto(base + '/#/'); await p.waitForSelector('#homePop .pcard', { timeout: 90000 }); await p.waitForSelector('#homeDeals .pcard', { timeout: 90000 }).catch(() => {}); await p.waitForTimeout(3000); await snap('home');
      if (name === 'iphone') { await p.evaluate(() => document.getElementById('homeDeals').scrollIntoView({ block: 'start' })); await p.evaluate(() => scrollBy(0, -120)); await p.waitForTimeout(1500); await snap('home-sections'); }
      const id = await pickProduct(p);
      await p.evaluate((h) => { location.hash = h; }, '#/p/' + id);
      await p.waitForSelector('.dealbox', { timeout: 30000 }); await p.waitForTimeout(2500); await snap('product-verdict');
      console.log(name, 'verdict:', (await p.textContent('.dealbox')).replace(/\s+/g, ' ').slice(0, 300));
      if (await p.$('#chartBox svg')) {
        await p.evaluate(() => { document.getElementById('histPanel').scrollIntoView({ block: 'start' }); scrollBy(0, -150); });
        await p.waitForTimeout(800);
        const r = await (await p.$('#chartBox svg')).boundingBox();
        await p.mouse.move(r.x + r.width * 0.55, r.y + r.height * 0.5); await p.waitForTimeout(500); await snap('product-chart');
      }
      await p.fill('#tgt', '150'); await p.click('#tgtForm button[type=submit]'); await p.waitForTimeout(2000);
      await p.goto(base + '/#/deals'); await p.waitForSelector('#grid .pcard', { timeout: 90000 }); await p.waitForTimeout(3000);
      if (name === 'desktop') { await p.check('input[data-f=dq][value=good]'); await p.waitForTimeout(1500); }
      await snap('deals');
      await p.goto(base + '/#/dashboard'); await p.waitForSelector('.dash-top', { timeout: 30000 }); await p.waitForTimeout(4000); await snap('dashboard');
      await p.goto(base + '/#/import'); await p.waitForSelector('#impT');
      await p.fill('#impT', 'name,target\nTokyo Marui Hi-Capa 5.1,150\nElite Force Glock 17 Gen 5,\nKWA M9 PTP,130\nsomething that does not exist,');
      await p.click('#impGo'); await p.waitForSelector('#impR .drow', { timeout: 30000 }); await p.waitForTimeout(2500);
      if (name === 'iphone') await p.evaluate(() => { document.getElementById('impR').scrollIntoView({ block: 'start' }); scrollBy(0, -140); });
      await p.waitForTimeout(800); await snap('import');
      await p.evaluate(() => acct.post('delete', {}).catch(() => {})); // don't leave a test account on the server
    });
  }
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
