// Data audit: pulls the live feeds (deals, drops, popular, every category, a few searches), then checks
// every product for price problems and every photo for loading problems.
// Usage: SITE=https://airsoft-deals.onrender.com OUT=r13-before IMG=40 node scripts/data-audit.js
// Writes /tmp/<OUT>-data.json. IMG = max photos checked per store (0 = skip the photo check).
const SITE = process.env.SITE || 'https://airsoft-deals.onrender.com';
const OUT = process.env.OUT || 'data-audit';
const IMG = +(process.env.IMG ?? 40);
const UA = 'AirsoftDealsFinder/1.0 (data audit)';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const CATS = ['rifles', 'pistols', 'snipers', 'mags', 'holsters', 'gear', 'optics', 'parts', 'batteries', 'bbs', 'gas'];
const QUERIES = ['glock', 'm4', 'hi-capa', 'tokyo marui', 'vfc', 'krytac', 'mp5', 'sniper rifle'];
async function getJson(path) {
  for (let i = 0; i < 3; i++) {
    try { const r = await fetch(SITE + path, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(90000) }); if (r.ok) return await r.json(); } catch { /* retry */ }
    await sleep(3000);
  }
  return null;
}
(async () => {
  const feeds = [['/api/deals', 'deals'], ['/api/drops', 'drops'], ['/api/popular', 'popular'], ...CATS.map((c) => ['/api/browse?cat=' + c, 'cat:' + c]), ...QUERIES.map((q) => ['/api/search?q=' + encodeURIComponent(q), 'q:' + q])];
  const groups = new Map(); const feedStats = {};
  for (const [p, name] of feeds) {
    const t0 = Date.now(); let d = await getJson(p);
    if (d && d.partial) { await sleep(8000); d = (await getJson(p)) || d; }
    feedStats[name] = d ? { ms: Date.now() - t0, groups: d.groups?.length ?? 0, failedStores: (d.status || []).filter((s) => !s.ok).map((s) => s.store || s.id) } : { error: true };
    for (const g of d?.groups || []) { const e = groups.get(g.id); if (!e) groups.set(g.id, { g, feeds: [name] }); else e.feeds.push(name); }
    await sleep(1500);
  }
  // ---- price checks ----
  const issues = []; const add = (kind, g, o, detail) => issues.push({ kind, id: g.id, title: g.title, store: o?.storeId || g.bestStore, price: o?.price ?? g.bestPrice, detail });
  for (const { g, feeds: fs } of groups.values()) {
    const isGun = ['rifles', 'pistols', 'snipers'].includes(g.cat);
    for (const o of g.offers || []) {
      if (!(o.price > 0)) add('zero/negative price', g, o, o.price);
      if (o.price > 6000) add('absurd high price', g, o, o.price);
      if (isGun && o.price > 0 && o.price < 15) add('gun under $15', g, o, o.price);
      if (o.originalPrice != null && o.originalPrice <= o.price) add('regular <= sale price', g, o, `${o.originalPrice} <= ${o.price}`);
      if (o.originalPrice && o.originalPrice > o.price * 8) add('regular price > 8x sale', g, o, `${o.originalPrice} vs ${o.price}`);
      if (o.discountPct != null && o.originalPrice) { const real = Math.round((1 - o.price / o.originalPrice) * 100); if (Math.abs(real - o.discountPct) > 2) add('% off mismatch', g, o, `${o.discountPct}% shown, ${real}% real`); }
      if (o.savings != null && o.savings < 0) add('negative savings', g, o, o.savings);
      if (o.h?.pts?.length) { const vals = o.h.pts.map((p) => p[1]); const hi = Math.max(...vals), lo = Math.min(...vals); if (lo > 0 && hi / lo > 4) add('history spike (>4x range)', g, o, `${lo} .. ${hi}`); }
      if (!/^https:\/\//.test(o.url || '')) add('bad offer link', g, o, o.url);
      if (o.price && Math.round(o.price * 100) / 100 !== o.price) add('price not in cents', g, o, o.price);
    }
    if (fs.includes('deals') && g.inStock === false) add('out-of-stock in deals', g, null, fs.join(','));
    if (g.h?.chg && g.h.prev && Math.abs(g.h.pct) > 80) add('drop/rise > 80%', g, null, `${g.h.prev} -> ${g.bestPrice} (${g.h.pct}%)`);
    if (g.offers?.length && g.bestPrice !== Math.min(...g.offers.filter((o) => o.inStock !== false).map((o) => o.price).concat(g.offers.every((o) => o.inStock === false) ? g.offers.map((o) => o.price) : []))) add('bestPrice not the lowest in-stock offer', g, null, `${g.bestPrice} vs ${g.offers.map((o) => o.price + (o.inStock === false ? 'oos' : '')).join('/')}`);
    if (g.discountPct > 90) add('discount > 90%', g, null, g.discountPct);
    if (!(g.images || []).length) add('no image', g, null, g.offers?.[0]?.storeId);
  }
  // ---- image checks ----
  const byStore = {};
  for (const { g } of groups.values()) { const s = g.offers?.[0]?.storeId || '?'; (byStore[s] ||= []).push(g); }
  const img = {};
  if (IMG) for (const [s, list] of Object.entries(byStore)) {
    const sample = list.filter((g) => g.images?.length).slice(0, IMG);
    const st = { checked: 0, direct: 0, proxy: 0, broken: 0, noImage: list.filter((g) => !g.images?.length).length, total: list.length, fails: [] };
    for (const g of sample) {
      const u = g.images[0]; st.checked++;
      const ok = async (url) => { try { const r = await fetch(url, { headers: { 'User-Agent': UA, Referer: SITE + '/', Accept: 'image/avif,image/webp,image/*,*/*' }, signal: AbortSignal.timeout(20000) }); const ct = r.headers.get('content-type') || ''; const b = await r.arrayBuffer(); return r.ok && /image\//.test(ct) && b.byteLength > 200 ? true : `${r.status} ${ct.slice(0, 20)} ${b.byteLength}b`; } catch (e) { return e.name; } };
      const d = /^https:\/\//.test(u) ? await ok(u) : 'not https';
      if (d === true) st.direct++;
      else { const p = await ok(SITE + '/img?u=' + encodeURIComponent(u)); if (p === true) st.proxy++; else { st.broken++; st.fails.push({ u: u.slice(0, 140), direct: d, proxy: p }); } }
      await sleep(250);
    }
    img[s] = st;
  }
  const kinds = {}; for (const i of issues) kinds[i.kind] = (kinds[i.kind] || 0) + 1;
  const tot = Object.values(img).reduce((a, s) => ({ checked: a.checked + s.checked, broken: a.broken + s.broken, proxy: a.proxy + s.proxy, noImage: a.noImage + s.noImage, total: a.total + s.total }), { checked: 0, broken: 0, proxy: 0, noImage: 0, total: 0 });
  const rep = { site: SITE, at: new Date().toISOString(), products: groups.size, feedStats, priceIssueCounts: kinds, priceIssues: issues, images: { total: tot, brokenPct: tot.checked ? +(100 * tot.broken / tot.checked).toFixed(1) : null, proxyOnlyPct: tot.checked ? +(100 * tot.proxy / tot.checked).toFixed(1) : null, byStore: img } };
  require('fs').writeFileSync(`/tmp/${OUT}-data.json`, JSON.stringify(rep, null, 1));
  console.log(JSON.stringify({ products: rep.products, priceIssueCounts: kinds, images: rep.images.total, brokenPct: rep.images.brokenPct, proxyOnlyPct: rep.images.proxyOnlyPct }, null, 1));
  console.log(Object.entries(img).map(([s, v]) => `${s}: ${v.broken}/${v.checked} broken, ${v.proxy} proxy-only, ${v.noImage}/${v.total} no image`).join('\n'));
})();
