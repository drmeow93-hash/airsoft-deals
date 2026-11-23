// Real-browser photo audit: opens pages on iPhone + desktop, scrolls through every card, and counts photos
// that loaded, fell back to the placeholder, or are still broken.
// Usage: SITE=… OUT=r13-before node scripts/img-browser-audit.js  -> /tmp/<OUT>-img.json
const { chromium, devices } = require('playwright');
const SITE = process.env.SITE || 'https://airsoft-deals.onrender.com';
const OUT = process.env.OUT || 'img-audit';
const PAGES = ['#/', '#/deals', '#/drops', '#/search?q=glock', '#/search?q=m4', '#/search?q=sniper', '#/c/rifles', '#/c/pistols', '#/c/gear', '#/c/parts', '#/c/optics', '#/c/mags', '#/c/bbs', '#/marketplaces'];
(async () => {
  const b = await chromium.launch(); const rep = {};
  for (const [dn, dev] of [['iphone', devices['iPhone 14 Pro']], ['desktop', { viewport: { width: 1440, height: 900 } }]]) {
    const ctx = await b.newContext({ ...dev, userAgent: (dev.userAgent || 'Mozilla/5.0') + ' AirsoftDealsFinder/1.0 (img audit)' });
    const p = await ctx.newPage(); const errs = [];
    p.on('pageerror', (e) => errs.push(e.message));
    await p.goto(SITE + '/', { waitUntil: 'domcontentloaded' });
    for (const h of PAGES) {
      await p.evaluate((h) => { location.hash = h; }, h);
      await p.waitForSelector('.pcard, .empty', { timeout: 60000 }).catch(() => {});
      await p.waitForTimeout(2500);
      // scroll to trigger lazy images, then wait for them
      for (let y = 0; y < 12; y++) { await p.mouse.wheel(0, 900); await p.waitForTimeout(250); }
      await p.waitForTimeout(3500);
      const r = await p.evaluate(() => {
        const cards = [...document.querySelectorAll('.pcard')];
        let ok = 0, ph = 0, broken = 0, pending = 0, proxied = 0; const bad = [];
        for (const c of cards) {
          const img = c.querySelector('.pimg img');
          if (!img) { ph++; continue; }
          if (img.dataset.px) proxied++;
          if (!img.complete) { pending++; continue; }
          if (img.naturalWidth > 0) ok++; else { broken++; bad.push(img.currentSrc || img.src); }
        }
        return { cards: cards.length, ok, placeholder: ph, broken, pending, proxied, bad: bad.slice(0, 5) };
      });
      rep[dn + ' ' + h] = r;
      console.log(dn, h, JSON.stringify(r));
    }
    rep[dn + ' errors'] = errs;
    await ctx.close();
  }
  await b.close();
  require('fs').writeFileSync(`/tmp/${OUT}-img.json`, JSON.stringify(rep, null, 1));
})();
