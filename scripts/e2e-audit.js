// End-to-end audit as a real user, iPhone + desktop. Usage: SITE=https://… OUT=prefix node scripts/e2e-audit.js
// Records: time to usable results and to spinner-clear for searches, page errors, failed requests,
// horizontal overflow, wishlist flows, back/forward. Screenshots to screenshots/<OUT>-*.png.
const { chromium, devices } = require('playwright');
const SITE = process.env.SITE || 'https://airsoft-deals.onrender.com';
const OUT = process.env.OUT || 'v11-before';
const QUERIES = (process.env.QUERIES || 'glock,m4,ak,vfc,tokyo marui,hpa,zqxwvplm').split(',');
const ONLY = process.env.ONLY; // 'iphone' | 'desktop'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const report = { site: SITE, at: new Date().toISOString(), runs: {} };

async function run(name, dev) {
  const R = { issues: [], searches: [], pages: {}, errors: [], failed: [] };
  report.runs[name] = R;
  const b = await chromium.launch();
  const ctx = await b.newContext({ ...dev, userAgent: (dev.userAgent || '') + ' AirsoftDealsFinder/1.0 (audit)' });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => R.errors.push(String(e.message).slice(0, 200)));
  p.on('console', (m) => { if (m.type() === 'error') R.errors.push('console: ' + m.text().slice(0, 200)); });
  p.on('requestfailed', (r) => { const u = r.url(); if (u.startsWith(SITE)) R.failed.push(u.replace(SITE, '') + ' ' + (r.failure()?.errorText || '')); });
  p.on('response', (r) => { const u = r.url(); if (u.startsWith(SITE) && r.status() >= 400) R.failed.push(`${r.status()} ${u.replace(SITE, '')}`); });
  const shot = (n) => p.screenshot({ path: `screenshots/${OUT}-${name}-${n}.png` }).catch(() => {});
  const overflow = async (where) => { const o = await p.evaluate(() => { const scrollers = (e) => { for (let x = e.parentElement; x && x !== document.body; x = x.parentElement) { const ov = getComputedStyle(x).overflowX; if (ov === 'auto' || ov === 'scroll' || ov === 'hidden' || ov === 'clip') return true; } return false; }; return { sw: document.documentElement.scrollWidth, w: innerWidth, wide: [...document.querySelectorAll('#app *, header *')].filter((e) => { const r = e.getBoundingClientRect(); return r.width && r.right > innerWidth + 2 && getComputedStyle(e).position !== 'fixed' && !scrollers(e); }).slice(0, 4).map((e) => e.tagName + '.' + (e.className?.baseVal ?? e.className)) }; }); if (o.sw > o.w + 2 || o.wide.length) R.issues.push(`overflow on ${where}: page ${o.sw}px > ${o.w}px; ${o.wide.join(', ')}`); };

  // 1. Fresh visit
  let t0 = Date.now();
  await p.goto(SITE + '/', { waitUntil: 'domcontentloaded' });
  await p.waitForSelector('#homePop, .hero, .tiles', { timeout: 60000 }).catch(() => R.issues.push('home: no content in 60 s'));
  R.pages.home = Date.now() - t0;
  await sleep(1500); await overflow('home'); await shot('home');

  // 2. Searches through the search box
  for (const q of QUERIES) {
    const s = { q };
    t0 = Date.now();
    const box = (await p.isVisible('#q')) ? '#q' : '#heroQ'; // on the v12 home page the hero search is the search box
    await p.fill(box, q); await p.press(box, 'Enter');
    try { await p.waitForFunction((q) => (document.querySelector('#rcount')?.textContent || '').includes(q) && document.querySelector('#grid .grid > *, #grid .empty'), q, { timeout: 60000, polling: 100 }); s.usableMs = Date.now() - t0; } catch { s.usableMs = null; R.issues.push(`search "${q}": no results or empty state in 60 s`); }
    try { await p.waitForFunction(() => !document.querySelector('#rcount .spin, .fresh .spin, #wake'), null, { timeout: 45000, polling: 200 }); s.spinnerClearMs = Date.now() - t0; } catch { s.spinnerClearMs = null; R.issues.push(`search "${q}": spinner still showing after 45 s: ` + (await p.textContent('#rcount').catch(() => '')).trim().slice(0, 100)); }
    s.cards = await p.$$eval('#grid .grid > *', (l) => l.length).catch(() => 0);
    s.count = (await p.textContent('#rcount').catch(() => '')).trim().slice(0, 80);
    s.domNodes = await p.evaluate(() => document.getElementsByTagName('*').length);
    R.searches.push(s);
    if (q === QUERIES[0]) { await overflow('search'); await shot('search'); }
  }
  // repeat the first query (warm)
  await p.evaluate(() => { location.hash = '#/'; }); await sleep(500);
  const box0 = (await p.isVisible('#q')) ? '#q' : '#heroQ';
  t0 = Date.now(); await p.fill(box0, QUERIES[0]); await p.press(box0, 'Enter');
  await p.waitForFunction((q) => (document.querySelector('#rcount')?.textContent || '').includes(q) && document.querySelector('#grid .grid > *'), QUERIES[0], { timeout: 30000 }).catch(() => {});
  R.searches.push({ q: QUERIES[0] + ' (again)', usableMs: Date.now() - t0 });

  // 3. Filters sheet stays usable while live updates arrive
  const fb = await p.$('#openF'); if (fb && await fb.isVisible()) { await fb.click(); await sleep(4000); if (!(await p.$('#side.open'))) R.issues.push('filters sheet closed by itself (re-render)'); await p.click('#closeF').catch(() => {}); }

  // 4. Product page, chart, score
  const card = await p.$('#grid .grid > * a, #grid .grid > *');
  if (card) {
    t0 = Date.now(); await card.click(); await p.waitForSelector('.prod2, .prod', { timeout: 15000 }).catch(() => R.issues.push('product page did not open'));
    R.pages.product = Date.now() - t0; await sleep(1200); await overflow('product'); await shot('product');
    if (!(await p.$('svg.chart, .chart svg, #chart svg, .chartp svg'))) R.issues.push('product: no chart svg');
    // reload on product page (shared link)
    const url = p.url(); await p.reload({ waitUntil: 'domcontentloaded' }); await sleep(2500);
    if (!p.url().includes('#/p/')) R.issues.push('product link does not survive reload (redirected to ' + p.url().replace(SITE, '') + ')');
    else if (!(await p.$('.prod2, .prod'))) R.issues.push('product page blank after reload');
    // watch + target
    if (!p.url().includes('#/p/')) { await p.goto(url); await sleep(2500); }
    const wbtn = await p.$('[data-watch], #watchBtn, .watch-btn, button:has-text("Track")');
    if (wbtn) { await wbtn.click(); await sleep(500); const n = await p.textContent('#watchCount').catch(() => ''); if (!+n) R.issues.push('track button did not add to watchlist (badge ' + n + ')'); }
    else R.issues.push('product: no track button found');
    const tin = await p.$('#tgt, input[name=target], .tgt input');
    if (tin) { await tin.fill('50'); const sb = await p.$('#tgtSet, button:has-text("Set")'); if (sb) await sb.click(); await sleep(500); }
  }
  // back / forward
  await p.goBack(); await sleep(1500); const backUrl = p.url(); await p.goForward(); await sleep(1500);
  R.pages.backForward = `${backUrl.replace(SITE, '')} -> ${p.url().replace(SITE, '')}`;
  if (!(await p.$('#app *'))) R.issues.push('blank app after back/forward');

  // 5. Tabs
  for (const [h, sel] of [['#/deals', '#grid .grid > *'], ['#/drops', '#app .card, #app .empty, #grid'], ['#/stores', '#app a[href^="http"]'], ['#/marketplaces', '#app a[href^="http"]'], ['#/c/rifles', '#grid .grid > *, #grid .empty'], ['#/c/pistols', '#grid .grid > *, #grid .empty'], ['#/dashboard', '#app h1, #app h2'], ['#/import', 'textarea']]) {
    t0 = Date.now(); await p.evaluate((x) => { location.hash = x; }, h);
    try { await p.waitForSelector(sel, { timeout: 30000 }); R.pages[h] = Date.now() - t0; } catch { R.pages[h] = null; R.issues.push(`${h}: "${sel}" not shown in 30 s`); }
    await sleep(800); await overflow(h); await shot(h.replace(/[#/]+/g, '-').replace(/^-/, ''));
  }
  // 6. Wishlist import: links, names, CSV
  await p.evaluate(() => { location.hash = '#/import'; }); await sleep(800);
  const ta = await p.$('textarea');
  if (ta) {
    await ta.fill('https://www.evike.com/products/12345/\nTokyo Marui Hi-Capa 5.1\nname,price\nVFC Avalon Calibur,399\nElite Force Glock 17 Gen 5');
    const btn = await p.$('#impGo, button:has-text("Find"), button:has-text("Match"), button:has-text("Import")');
    if (btn) { await btn.click(); await p.waitForSelector('#impR h2', { timeout: 20000 }).catch(() => {}); const rows = await p.$$eval('#impR input[type=checkbox]', (l) => l.length); R.pages.importRows = rows; R.pages.importHead = (await p.textContent('#impR h2').catch(() => '')).trim();
      const add = await p.$('#impAdd'); if (add) { const before = +(await p.textContent('#watchCount')) || 0; await add.click(); await sleep(800); const after = +(await p.textContent('#watchCount')) || 0; R.pages.importAdded = after - before; if (after <= before) R.issues.push('import: Track selected did not add items'); } await shot('import-result'); if (!rows) R.issues.push('import: no rows after match'); }
    else R.issues.push('import: no match button');
  }
  // 7. Dashboard email without keys
  await p.evaluate(() => { location.hash = '#/dashboard'; }); await sleep(1500);
  const em = await p.$('#em, input[type=email]');
  if (em) { await em.fill('test@example.com'); const eb = await p.$('#emGo, #emSave, button:has-text("Save")'); if (eb) { await eb.click(); await sleep(3000); R.pages.emailNote = (await p.textContent('#emNote').catch(() => '')).trim().slice(0, 160); } }
  R.pages.watchCount = await p.textContent('#watchCount').catch(() => '');
  await shot('dashboard');
  // 8. Wishlist when browser storage is full (iOS Safari caps localStorage near 5 MB): fill it with old result-cache
  // entries, then track a product from a search.
  await p.fill('#q', 'mp5'); await p.press('#q', 'Enter');
  await p.waitForFunction(() => (document.querySelector('#rcount')?.textContent || '').includes('mp5') && document.querySelector('#grid .grid > *'), null, { timeout: 30000 }).catch(() => {});
  const filled = await p.evaluate(() => { const blob = 'x'.repeat(200000); let i = 0; try { for (; i < 200; i++) localStorage.setItem('ad_c:/api/search?q=junk' + i, blob); } catch {} return i; });
  const before = +(await p.textContent('#watchCount').catch(() => '0')) || 0;
  const c2 = await p.$('#grid .grid > *'); if (c2) { await c2.click(); await p.waitForSelector('.prod2, .prod', { timeout: 10000 }).catch(() => {}); }
  const wb2 = await p.$('[data-watch], #watchBtn, .watch-btn, button:has-text("Track")'); if (wb2) { await wb2.click(); await sleep(600); }
  const after = +(await p.textContent('#watchCount').catch(() => '0')) || 0;
  R.pages.fullStorageTrack = `filled ${filled} blocks, badge ${before} -> ${after}`;
  if (after <= before) R.issues.push('wishlist: tracking fails when browser storage is full');
  R.localStorageChars = await p.evaluate(() => { let n = 0; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); n += k.length + (localStorage.getItem(k) || '').length; } return n; });
  await b.close();
}
(async () => {
  if (ONLY !== 'desktop') await run('iphone', devices['iPhone 14 Pro']);
  if (ONLY !== 'iphone') await run('desktop', { viewport: { width: 1366, height: 860 } });
  require('fs').writeFileSync(`/tmp/${OUT}.json`, JSON.stringify(report, null, 1));
  console.log(JSON.stringify(report, null, 1));
})();
