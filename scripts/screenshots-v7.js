// v7 screenshots (iPhone): score badges on cards, the product score panel, and images that used to fail.
// node scripts/screenshots-v7.js [baseUrl]
const { chromium, devices } = require('playwright');
const base = process.argv[2] || 'http://localhost:8787';
const REVIEW = ['wgc', 'airsoftgi', 'airsoftatlanta', 'foxairsoft', 'airsoftnmore', 'ehobbyasia', 'brill', 'extremeri'];
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ ...devices['iPhone 15 Pro'], colorScheme: 'dark' });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => console.log('pageerror', e.message));
  const snap = (n) => p.screenshot({ path: `screenshots/v7-iphone-${n}.png` });

  // 1) Cards with score badges: rifles sorted by "Highest score".
  await p.goto(base + '/#/c/rifles');
  await p.waitForSelector('#grid .pcard .sbadge', { timeout: 90000 });
  await p.waitForTimeout(5000);
  await p.selectOption('#sort', 'score'); await p.waitForTimeout(2000);
  await p.evaluate(() => window.scrollTo(0, document.querySelector('#grid').getBoundingClientRect().top + scrollY - 330));
  await p.waitForTimeout(2500); await snap('cards-score-badges');

  await p.goto(base + '/#/search?q=glock');
  await p.waitForSelector('#grid .pcard .sbadge', { timeout: 90000 });
  await p.waitForTimeout(6000);

  // 2) Previously broken: Airsoft Megastore photos (relative URLs before v7), e.g. the Umarex Glock 17 Gen 4 card.
  const fixed = await p.evaluate(() => {
    const cards = [...document.querySelectorAll('#grid .pcard')];
    const c = cards.find((x) => /airsoftmegastore\.com\/image\//.test(x.querySelector('.pimg img')?.src || '') && x.querySelector('.pimg img').naturalWidth > 1);
    if (!c) return null; c.scrollIntoView({ block: 'center' }); return c.querySelector('.ptitle').textContent + ' | ' + c.querySelector('.pimg img').src;
  });
  console.log('previously broken now working:', fixed);
  await p.waitForTimeout(2000); await snap('fixed-megastore-image');

  // 3) Product score panel: pick a product sold by a store that publishes reviews.
  const id = await p.evaluate((REVIEW) => {
    const gs = [...S.groups.values()].filter((g) => g.score && g.cat === 'pistols' && g.offers.some((o) => REVIEW.includes(o.storeId)));
    gs.sort((a, b) => b.offers.filter((o) => REVIEW.includes(o.storeId)).length - a.offers.filter((o) => REVIEW.includes(o.storeId)).length);
    return gs[0]?.id;
  }, REVIEW);
  const pick = process.argv[3];
  await p.evaluate((h) => { location.hash = h; }, '#/p/' + (pick || id));
  await p.waitForSelector('#vpanel .vp-subs', { timeout: 60000 });
  await p.waitForTimeout(1500);
  await p.evaluate(() => document.getElementById('vpanel').scrollIntoView({ block: 'start' }));
  await p.evaluate(() => window.scrollBy(0, -70));
  await p.waitForTimeout(1200); await snap('product-score-panel');
  console.log('panel:', (await p.textContent('#vpanel')).replace(/\s+/g, ' ').slice(0, 600));
  await p.evaluate(() => { const r = document.querySelector('#vpanel .gs-sub:nth-of-type(2), #vpanel .vp-rev-top') || document.querySelector('#vpanel .gs-sub'); (document.querySelector('#vpanel .vp-rev-top') || r).scrollIntoView({ block: 'start' }); window.scrollBy(0, -110); });
  await p.waitForTimeout(1000); await snap('product-reviews-issues');
  await p.evaluate(() => { const el = document.querySelector('#vpanel .vp-issues') || document.querySelector('#vpanel .gs-who'); el && el.scrollIntoView({ block: 'start' }); window.scrollBy(0, -60); });
  await p.waitForTimeout(800); await snap('product-issues-alternatives');

  // 4) Branded placeholder for a product the store has no photo of.
  await p.goto(base + '/#/search?q=' + encodeURIComponent('shs bolt catch'));
  await p.waitForSelector('#grid .pcard', { timeout: 90000 }); await p.waitForTimeout(6000);
  const ph = await p.evaluate(() => { const c = [...document.querySelectorAll('#grid .pcard')].find((x) => x.querySelector('.pimg .ph')); if (!c) return null; c.scrollIntoView({ block: 'center' }); return c.querySelector('.ptitle').textContent; });
  console.log('placeholder card:', ph);
  if (ph) { await p.waitForTimeout(1500); await snap('placeholder'); }

  // 5) Home: price drops carousel (every photo there failed before v7).
  await p.goto(base + '/#/'); if (!(await p.waitForSelector('#homeDrops .pcard', { timeout: 30000 }).catch(() => null))) { console.log('no price drops on home right now'); await b.close(); return; }
  await p.evaluate(() => document.getElementById('homeDrops').scrollIntoView({ block: 'center' }));
  await p.waitForTimeout(3000); await snap('home-drops-images');
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
