// Independent price spot-check: for a sample of in-stock offers per store (from a data-audit report), fetch the
// store's product page (robots.txt-checked, honest UA, 2.5 s between requests to one store) and read the prices
// the page itself publishes (JSON-LD offers, product meta tags, Shopify .js). Flags offers whose shown price
// isn't any price on the page. Usage: node scripts/price-spotcheck.js /tmp/r13-before-data.json [perStore]
process.env.NO_BACKGROUND = '1';
const { canFetch } = require('../server/robots');
const UA = 'AirsoftDealsFinder/1.0 (+https://airsoft-deals.onrender.com; price check)';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rep = require(process.argv[2]); const PER = +(process.argv[3] || 3);
const SITE = rep.site;
(async () => {
  // re-pull offers (the report keeps only issues): use deals + a few searches
  const groups = [];
  for (const p of ['/api/deals', '/api/search?q=glock', '/api/search?q=m4', '/api/browse?cat=parts', '/api/browse?cat=gear']) {
    const d = await (await fetch(SITE + p, { headers: { 'User-Agent': UA } })).json(); groups.push(...d.groups); await sleep(1500);
  }
  const by = {};
  for (const g of groups) for (const o of g.offers) if (o.inStock !== false && !o.fx) { const l = (by[o.storeId] ||= new Map()); if (l.size < PER && !l.has(o.url)) l.set(o.url, { o, title: g.title }); }
  const out = { checked: 0, match: 0, mismatch: [], unreadable: 0, skipped: 0, byStore: {} };
  await Promise.all(Object.entries(by).map(async ([sid, l]) => {
    const st = (out.byStore[sid] = { checked: 0, match: 0, mismatch: 0, unreadable: 0 });
    for (const { o, title } of l.values()) {
      if (!(await canFetch(o.url).catch(() => false))) { out.skipped++; continue; }
      let prices = [];
      try {
        const shop = /\/products\/[^/?#]+/.test(o.url) && !/\.(php|html?)$/.test(o.url);
        if (shop) { const r = await fetch(o.url.split('?')[0] + '.js', { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(20000) }); if (r.ok) { const j = await r.json(); prices = (j.variants || []).map((v) => v.price / 100); } }
        if (!prices.length) {
          const h = await (await fetch(o.url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(25000) })).text();
          for (const m of h.matchAll(/"(?:price|lowPrice|highPrice)"\s*:\s*"?([\d.,]+)"?/g)) prices.push(+m[1].replace(/,/g, ''));
          for (const m of h.matchAll(/(?:product:price:amount|og:price:amount|itemprop="price")[^>]*content="([\d.,]+)"/g)) prices.push(+m[1].replace(/,/g, ''));
          for (const m of h.matchAll(/content="([\d.,]+)"[^>]*(?:itemprop="price"|property="product:price:amount")/g)) prices.push(+m[1].replace(/,/g, ''));
          for (const m of h.matchAll(/class="(?:price|price-new|special-price)[^"]*"[^>]*>\s*\$([\d.,]+)/g)) prices.push(+m[1].replace(/,/g, ''));
        }
      } catch { /* unreadable */ }
      prices = prices.filter((x) => x > 0);
      out.checked++; st.checked++;
      if (!prices.length) { out.unreadable++; st.unreadable++; }
      else if (prices.some((x) => Math.abs(x - o.price) < 0.015)) { out.match++; st.match++; }
      else { st.mismatch++; out.mismatch.push({ store: sid, url: o.url, shown: o.price, page: [...new Set(prices)].slice(0, 6), title: title.slice(0, 70) }); }
      await sleep(2500);
    }
  }));
  require('fs').writeFileSync('/tmp/price-spotcheck.json', JSON.stringify(out, null, 1));
  console.log(JSON.stringify({ checked: out.checked, match: out.match, mismatch: out.mismatch.length, unreadable: out.unreadable, skipped: out.skipped }));
  for (const m of out.mismatch) console.log(m.store, m.shown, JSON.stringify(m.page), m.title, m.url);
  for (const [s, v] of Object.entries(out.byStore)) if (v.unreadable) console.log('unreadable', s, v.unreadable + '/' + v.checked);
})();
