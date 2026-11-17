/* Felony's Airsoft Emporium front-end: hash router, search, product comparison, deals, watchlist. */
const API = (window.API_BASE || '').replace(/\/$/, '');
const app = document.getElementById('app');
const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = (n) => '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const STORE_INFO = {
  airsoftatlanta: { name: 'Airsoft Atlanta', sub: 'Georgia' },
  airsoftnmore: { name: 'Airsoft N More', sub: 'Los Angeles' },
  speedqb: { name: 'SpeedQB', sub: 'Gear & HPA' },
  airsoftstation: { name: 'Airsoft Station', sub: 'Kentucky' },
  megastore: { name: 'Airsoft Megastore', sub: 'California' },
  wolverine: { name: 'Wolverine Airsoft', sub: 'HPA direct' },
  ehobbyasia: { name: 'eHobbyAsia', sub: 'Hong Kong · ships US' },
  airsoftextreme: { name: 'Airsoft Extreme', sub: 'Bay Area' },
  amped: { name: 'Amped Airsoft', sub: 'Pennsylvania' },
  airsoftgi: { name: 'Airsoft GI', sub: 'SoCal' },
  evike: { name: 'Evike.com', sub: 'California' },
  sniperas: { name: 'Sniper Airsoft', sub: 'Germany' },
  replicaairguns: { name: 'ReplicaAirguns', sub: 'Reviews' },
  hopup: { name: 'HopUp', sub: 'Buy/sell app' },
  ebay: { name: 'eBay Airsoft', sub: 'Auctions & BIN' },
  gunbroker: { name: 'GunBroker', sub: 'Auctions' },
  reddit: { name: 'r/airsoftmarket', sub: 'Reddit' },
  fbmarket: { name: 'FB Marketplace', sub: 'Local' },
  fbgroups: { name: 'FB Groups', sub: 'Buy/sell/trade' },
};
const wordmark = (id, name) => `<div class="wm wm-${esc(id)}">${esc(STORE_INFO[id]?.name || name)}<small>${esc(STORE_INFO[id]?.sub || '')}</small></div>`;

// ---- state & storage ----
const S = { search: null, deals: null, groups: new Map(), lastList: '#/' };
const remember = (gs) => gs.forEach((g) => S.groups.set(g.id, g));
const watch = {
  all: () => JSON.parse(localStorage.getItem('ad_watch') || '[]'),
  has: (g) => watch.all().some((w) => w.key === keyOf(g)),
  toggle(g) {
    let l = watch.all();
    l = watch.has(g) ? l.filter((w) => w.key !== keyOf(g)) : [{ key: keyOf(g), savedAt: Date.now(), savedPrice: g.bestPrice, group: g }, ...l];
    localStorage.setItem('ad_watch', JSON.stringify(l.slice(0, 100)));
    badgeCount();
  },
};
const keyOf = (g) => g.offers[0].url;
function badgeCount() { const n = watch.all().length; const el = $('#watchCount'); el.textContent = n; el.classList.toggle('hidden', !n); }

async function api(path) {
  const r = await fetch(API + path);
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `Server error ${r.status}`);
  return r.json();
}

// ---- shared pieces ----
const crumbs = (parts) => `<nav class="crumbs">${parts.map(([l, h]) => (h ? `<a href="${h}">${esc(l)}</a>` : `<span>${esc(l)}</span>`)).join('<span class="sep">›</span>')}</nav>`;
const skeletons = (n = 8) => `<div class="grid">${'<div class="sk"></div>'.repeat(n)}</div>`;
function tagHtml(b) {
  const cls = b.startsWith('LOWEST') ? 'low' : b === 'HOT DEAL' ? 'hot' : /OFF$/.test(b) ? 'off' : '';
  return `<span class="tag ${cls}">${esc(b)}</span>`;
}
function stockText(v) { return v === true ? '<span class="green">In stock</span>' : v === false ? 'Out of stock' : 'Stock: check store'; }
function card(g) {
  return `<article class="pcard" data-id="${g.id}" tabindex="0">
    <div class="pimg">${g.images[0] ? `<img loading="lazy" src="${esc(g.images[0])}" alt="">` : ''}<div class="tags">${g.badges.slice(0, 2).map(tagHtml).join('')}</div></div>
    <div class="pbody">
      ${g.brand ? `<div class="brandline">${esc(g.brand)}</div>` : ''}
      <div class="ptitle">${esc(g.title)}</div>
      <div class="pprice"><b>${money(g.bestPrice)}</b>${g.listPrice ? `<s>${money(g.listPrice)}</s>` : ''}</div>
      <div class="pmeta"><span>${g.storeCount > 1 ? `${g.storeCount} stores` : esc(g.bestStore)}</span><span>${stockText(g.inStock)}</span></div>
    </div></article>`;
}
function bindCards(root) {
  root.querySelectorAll('.pcard').forEach((el) => {
    const go = () => { S.lastList = location.hash || '#/'; location.hash = '#/p/' + el.dataset.id; };
    el.addEventListener('click', go);
    el.addEventListener('keydown', (e) => e.key === 'Enter' && go());
  });
}
function statusPills(st) { return `<div class="status">${st.map((s) => `<span class="pill ${s.ok ? '' : s.indexing ? 'wait' : 'err'}" title="${esc(s.error || '')}">${esc(s.store)} · ${s.ok ? s.count : s.indexing ? 'indexing…' : 'unavailable'}</span>`).join('')}</div>`; }

// ---- list view (search + deals share it) ----
function listView(data, { title, crumb, defaultSort }) {
  remember(data.groups);
  app.innerHTML = `${crumbs(crumb)}
    <div class="toolbar">
      <div class="summary">${title}</div>
      <div class="controls">
        <select id="sort" aria-label="Sort">
          <option value="relevance">${defaultSort === 'relevance' && !location.hash.includes('search') ? 'Featured mix' : 'Best match'}</option><option value="price">Price: low to high</option>
          <option value="price-desc">Price: high to low</option><option value="discount">Biggest discount</option>
          <option value="stores">Most stores</option></select>
        <select id="store" aria-label="Store"><option value="">All stores</option>${data.status.map((s) => `<option value="${s.id}">${esc(s.store)}</option>`).join('')}</select>
        <label class="toggle"><input type="checkbox" id="instock"> In stock</label>
        <label class="toggle"><input type="checkbox" id="dealsonly"> Deals only</label>
      </div>
    </div>
    ${statusPills(data.status)}
    <div id="grid"></div>`;
  $('#sort').value = defaultSort;
  const render = () => {
    const sort = $('#sort').value, store = $('#store').value, inStock = $('#instock').checked, dealsOnly = $('#dealsonly').checked;
    let gs = data.groups.filter((g) => (!store || g.offers.some((o) => o.storeId === store)) && (!inStock || g.inStock !== false) && (!dealsOnly || g.onSale));
    const by = { price: (a, b) => a.bestPrice - b.bestPrice, 'price-desc': (a, b) => b.bestPrice - a.bestPrice, discount: (a, b) => b.discountPct - a.discountPct || b.belowAvgPct - a.belowAvgPct, stores: (a, b) => b.storeCount - a.storeCount || a.bestPrice - b.bestPrice };
    if (by[sort]) gs = [...gs].sort(by[sort]);
    $('#grid').innerHTML = gs.length ? `<div class="grid">${gs.map(card).join('')}</div>` : `<div class="empty"><h2>No matches</h2><p>Try a broader search or clear the filters.</p></div>`;
    bindCards($('#grid'));
  };
  ['#sort', '#store', '#instock', '#dealsonly'].forEach((s) => $(s).addEventListener('change', render));
  render();
}

async function searchPage(q) {
  $('#q').value = q;
  app.innerHTML = crumbs([['Home', '#/'], [`Search “${q}”`]]) + skeletons();
  try {
    if (!S.search || S.search.query !== q) S.search = await api('/api/search?q=' + encodeURIComponent(q));
    const d = S.search, multi = d.groups.filter((g) => g.storeCount > 1).length, deals = d.groups.filter((g) => g.onSale).length;
    listView(d, { title: `<b>${d.groups.length}</b> products for <b>“${esc(q)}”</b> · ${multi} compared across stores · ${deals} deals`, crumb: [['Home', '#/'], [`Search “${q}”`]], defaultSort: 'relevance' });
    app.insertAdjacentHTML('beforeend', `<section class="mkt-section" id="mkt"><div class="section-h"><h2>Used &amp; marketplace listings</h2><a href="#/marketplaces">About marketplaces →</a></div><p class="more-note">Kept separate from the new-retail comparison above. Prices from players and sellers vary by condition.</p><div id="mktBody"><div class="sk" style="height:90px"></div></div></section>`);
    loadMarketplaceSection(q);
  } catch (e) { errorView(e); }
}

async function dealsPage() {
  $('#q').value = '';
  app.innerHTML = crumbs([['Home', '#/'], ['Deals']]) + skeletons();
  try {
    if (!S.deals) S.deals = await api('/api/deals');
    listView(S.deals, { title: `<b>${S.deals.groups.length}</b> live sale items from ${S.deals.status.filter((s) => s.ok).length} stores`, crumb: [['Home', '#/'], ['Deals']], defaultSort: 'relevance' });
  } catch (e) { errorView(e); }
}

// ---- product comparison page ----
function productPage(id) {
  const g = S.groups.get(id) || watch.all().map((w) => w.group).find((x) => x.id === id);
  if (!g) { location.hash = '#/'; return; }
  const back = S.lastList.startsWith('#/search') ? [`Search “${decodeURIComponent(S.lastList.split('q=')[1] || '')}”`, S.lastList] : S.lastList.startsWith('#/deals') ? ['Deals', '#/deals'] : ['Watchlist', '#/watchlist'];
  const best = g.offers[0], multi = g.offers.length > 1;
  const spec = [g.platform, g.offers.some((o) => o.storeDeal || o.originalPrice) ? 'On sale' : null, `${g.storeCount} ${g.storeCount > 1 ? 'stores' : 'store'}`, g.inStock === true ? 'In stock' : g.inStock === false ? 'Out of stock' : null].filter(Boolean);
  let belowLine = '';
  if (multi && g.belowAvgPct > 0) belowLine = `<div class="below">↓ ${g.belowAvgPct}% below the average of ${g.storeCount} stores (${money(g.avgPrice)})</div>`;
  else if (multi) belowLine = `<div class="below neutral">Same price at ${g.storeCount} stores</div>`;
  else if (best.originalPrice) belowLine = `<div class="below">↓ ${best.discountPct}% below the store's regular price of ${money(best.originalPrice)}</div>`;
  else belowLine = `<div class="below neutral">Only found at ${esc(best.store)} for this search</div>`;

  const offerRow = (o, i) => {
    let badge = '', delta = '';
    if (multi) {
      const d = Math.round(Math.abs(o.vsAvg));
      if (Math.abs(o.vsAvg) < 0.5) { badge = '<span class="badge n">SAME PRICE</span>'; delta = 'At the average'; }
      else if (o.vsAvg < 0) { badge = `<span class="badge g">${o.vsAvgPct}%</span>`; delta = `<span class="arrow-g">↓</span> $${d} below avg`; }
      else { badge = `<span class="badge r">+${o.vsAvgPct}%</span>`; delta = `<span class="arrow-r">↑</span> $${d} above avg`; }
    } else if (o.discountPct) { badge = `<span class="badge g">-${o.discountPct}%</span>`; delta = `<span class="arrow-g">↓</span> ${money(o.savings)} off regular price`; }
    const stock = o.inStock === true ? '<span class="stock-in">In stock</span>' : o.inStock === false ? '<span class="stock-out">Out of stock</span>' : 'Check stock on site';
    return `<a class="offer ${i === 0 && multi ? 'best-offer' : ''}" href="${esc(o.url)}" target="_blank" rel="noopener">
      ${wordmark(o.storeId, o.store)}
      <div class="o-mid">${stock}${o.originalPrice ? ` · was ${money(o.originalPrice)}` : ''}</div>
      <div class="o-right"><div class="o-price">${badge}${money(o.price)}</div><div class="o-delta">${delta || 'View at store →'}</div></div></a>`;
  };

  app.innerHTML = `${crumbs([['Home', '#/'], back, [g.brand || 'Product']])}
  <div class="product">
    <div>
      ${g.brand ? `<a class="p-brand" href="#/search?q=${encodeURIComponent(g.brand)}">${esc(g.brand)}</a>` : ''}
      <h1 class="p-title">${esc(g.title)}</h1>
      <div class="p-spec">${spec.map((s) => `<span>${esc(s)}</span>`).join('')}</div>
      <div class="best">
        <div class="best-label">BEST PRICE</div>
        <div class="best-row"><span class="best-price">${money(g.bestPrice)}</span><span class="best-at">at ${esc(best.store)}</span></div>
      </div>
      ${belowLine}
      <div class="offers">${g.offers.map(offerRow).join('')}</div>
      <div class="p-actions">
        <a class="btn primary" href="${esc(best.url)}" target="_blank" rel="noopener">Go to ${esc(best.store)} →</a>
        <button class="btn ghost ${watch.has(g) ? 'on' : ''}" id="watchBtn">${watch.has(g) ? '♥ Watching' : '♡ Add to watchlist'}</button>
      </div>
      <p class="note">Prices checked live ${new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}. Shipping and tax are calculated by each store. Listings are matched across stores by brand and model name, so double-check the variant (color, version) before buying.</p>
    </div>
    <div class="gallery">
      <div class="main-img">${g.images[0] ? `<img id="mainImg" src="${esc(g.images[0])}" alt="">` : ''}</div>
      ${g.images.length > 1 ? `<div class="thumbs">${g.images.map((src, i) => `<button class="thumb ${i ? '' : 'on'}" data-src="${esc(src)}"><img src="${esc(src)}" alt=""></button>`).join('')}</div>` : ''}
    </div>
  </div>`;
  app.querySelectorAll('.thumb').forEach((t) => t.addEventListener('click', () => { $('#mainImg').src = t.dataset.src; app.querySelectorAll('.thumb').forEach((x) => x.classList.toggle('on', x === t)); }));
  $('#watchBtn').addEventListener('click', (e) => { watch.toggle(g); e.currentTarget.classList.toggle('on', watch.has(g)); e.currentTarget.textContent = watch.has(g) ? '♥ Watching' : '♡ Add to watchlist'; });
  window.scrollTo(0, 0);
}

// ---- home / watchlist / stores ----
async function homePage() {
  $('#q').value = '';
  const chips = ['Tokyo Marui', 'Gas blowback', 'M4 AEG', 'Glock', 'Hi-Capa', 'Sniper rifle', 'Plate carrier', 'HPA', '0.28g BBs'];
  app.innerHTML = `<section class="hero"><h1>Find the <em>best price</em> on airsoft gear.</h1>
    <p>Felony&#39;s Airsoft Emporium checks 10 trusted airsoft retailers, matches the same product across stores, and flags real sales so you never overpay.</p>
    <p class="hero-more"><a href="#/marketplaces">Used gear marketplaces →</a> <span class="sep">·</span> <a href="#/more">More stores we can't price-check →</a></p>
    <div class="chips">${chips.map((c) => `<button class="chip" data-q="${esc(c)}">${esc(c)}</button>`).join('')}</div></section>
    <div class="section-h"><h2>Top deals right now</h2><a href="#/deals">See all deals →</a></div><div id="homeDeals">${skeletons(8)}</div>`;
  app.querySelectorAll('.chip').forEach((c) => c.addEventListener('click', () => (location.hash = '#/search?q=' + encodeURIComponent(c.dataset.q))));
  try {
    if (!S.deals) S.deals = await api('/api/deals');
    remember(S.deals.groups);
    // A balanced preview: the two best discounts from each store.
    const per = {}; const pick = [];
    for (const g of S.deals.groups) { const s = g.offers[0].storeId; if ((per[s] = (per[s] || 0) + 1) <= 2) pick.push(g); }
    $('#homeDeals').innerHTML = `<div class="grid">${pick.slice(0, 10).map(card).join('')}</div>`;
    S.lastList = '#/deals'; bindCards($('#homeDeals'));
  } catch (e) { $('#homeDeals').innerHTML = `<div class="empty"><p>${esc(e.message)}</p></div>`; }
}

function watchlistPage() {
  $('#q').value = '';
  const l = watch.all();
  l.forEach((w) => S.groups.set(w.group.id, w.group));
  app.innerHTML = crumbs([['Home', '#/'], ['Watchlist']]) + (l.length
    ? `<div class="toolbar"><div class="summary"><b>${l.length}</b> saved products · prices shown as of when you saved them</div></div><div class="grid" id="wl">${l.map((w) => card(w.group)).join('')}</div>`
    : `<div class="empty"><h2>Your watchlist is empty</h2><p>Open any product and tap “Add to watchlist”.</p></div>`);
  S.lastList = '#/watchlist';
  if (l.length) bindCards($('#wl'));
}

async function storesPage() {
  $('#q').value = '';
  app.innerHTML = crumbs([['Home', '#/'], ['Stores']]) + skeletons(5);
  try {
    const d = await api('/api/stores');
    app.innerHTML = crumbs([['Home', '#/'], ['Stores']]) +
      `<div class="section-h" style="margin-top:0"><h2>Checked live</h2></div><div class="stores">${d.stores.map((s) => `<div class="scard">${wordmark(s.id, s.name)}<p>${esc(s.location)} · ${esc(s.platform)}</p><p>${esc(s.blurb)}</p>${s.index ? `<p class="idx">${s.index.products ? `${s.index.products.toLocaleString()} products indexed${s.index.builtAt ? ` · updated ${new Date(s.index.builtAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}` : ' so far'}` : `Building index (${s.index.pages} pages read)…`}</p>` : ''}<p><a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.url.replace(/^https?:\/\//, ''))} →</a></p></div>`).join('')}</div>
       <div class="section-h"><h2>Can't compare these</h2><a href="#/more">More Stores →</a></div><p class="more-note">${d.skipped.map((s) => esc(s.name)).join(', ')}. These are listed as direct links on the More Stores tab.</p>`;
  } catch (e) { errorView(e); }
}

async function loadMarketplaceSection(q) {
  try {
    const m = await api('/api/marketplace-search?q=' + encodeURIComponent(q));
    if (!$('#mktBody')) return;
    const listings = m.listings.length ? `<div class="grid mkt-grid">${m.listings.map((l) => `<a class="pcard" href="${esc(l.url)}" target="_blank" rel="noopener noreferrer">
        <div class="pimg">${l.image ? `<img loading="lazy" src="${esc(l.image)}" alt="">` : ''}<div class="tags">${l.condition ? `<span class="tag">${esc(l.condition.toUpperCase())}</span>` : ''}</div></div>
        <div class="pbody"><div class="brandline">${esc(l.marketplace)} · ${esc(l.format)}</div><div class="ptitle">${esc(l.title)}</div>
        <div class="pprice"><b>${money(l.price)}</b></div></div></a>`).join('')}</div>` : '';
    $('#mktBody').innerHTML = listings + `<div class="mkt-links"><span>Search “${esc(q)}” on</span>${m.links.map((l) => `<a class="mkt-chip" href="${esc(l.url)}" target="_blank" rel="noopener noreferrer">${esc(l.name)} ↗</a>`).join('')}</div>`;
  } catch (e) { if ($('#mktBody')) $('#mktBody').innerHTML = `<p class="more-note">${esc(e.message)}</p>`; }
}

async function marketplacesPage() {
  $('#q').value = '';
  app.innerHTML = crumbs([['Home', '#/'], ['Marketplaces']]) + skeletons(3);
  try {
    const d = await api('/api/marketplaces');
    app.innerHTML = crumbs([['Home', '#/'], ['Marketplaces']]) + `
      <div class="section-h" style="margin-top:0"><h2>Marketplaces</h2></div>
      <p class="more-note">Used and third-party listings with sellers' own prices. They're kept out of the new-retail comparison. When you search, these show up in their own section with direct search links.</p>
      <div class="stores">${d.marketplaces.map((m) => `<a class="scard more" href="${esc(m.url)}" target="_blank" rel="noopener noreferrer">
        <div class="more-top">${wordmark(m.id, m.name)}<span class="ext" aria-hidden="true">↗</span></div>
        <p class="domain">${esc(m.url.replace(/^https?:\/\/(www\.)?/, '').replace(/\/.*$/, ''))}${m.live ? ' <span class="live-pill">LIVE PRICES</span>' : ''}</p>
        <p>${esc(m.note)}</p><p class="why">${esc(m.why)}</p></a>`).join('')}</div>
      <p class="more-note" style="margin-top:18px">Buying used: check seller feedback, ask for a video of the gun firing, and pay with a protected method (PayPal Goods &amp; Services). Never pay with Friends &amp; Family.</p>`;
  } catch (e) { errorView(e); }
}

async function moreStoresPage() {
  $('#q').value = '';
  app.innerHTML = crumbs([['Home', '#/'], ['More Stores']]) + skeletons(3);
  try {
    const d = await api('/api/stores');
    const link = (s, extra = '') => `<a class="scard more ${extra}" href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">
        <div class="more-top">${wordmark(s.id, s.name)}<span class="ext" aria-hidden="true">↗</span></div>
        <p class="domain">${esc(s.url.replace(/^https?:\/\/(www\.)?/, ''))}</p>
        <p>${esc(s.note || '')}</p>${s.reason ? `<p class="why">${esc(s.reason)}</p>` : ''}</a>`;
    app.innerHTML = crumbs([['Home', '#/'], ['More Stores']]) + `
      <div class="section-h" style="margin-top:0"><h2>More Stores</h2></div>
      <p class="more-note">We can't compare prices for these stores, so check them directly. Links open in a new tab.</p>
      <div class="stores">${d.skipped.map((s) => link(s)).join('')}</div>
      ${d.reviews?.length ? `<div class="section-h"><h2>Reviews</h2></div><p class="more-note">Not a store. Useful for reading reviews before you buy.</p><div class="stores">${d.reviews.map((s) => link(s, 'review')).join('')}</div>` : ''}`;
  } catch (e) { errorView(e); }
}

function errorView(e) { app.innerHTML = `<div class="empty"><h2>Couldn’t reach the price server</h2><p>${esc(e.message)}</p></div>`; }

// ---- router ----
function route() {
  const h = location.hash || '#/';
  document.querySelectorAll('.action').forEach((a) => a.classList.toggle('on', h.startsWith(a.getAttribute('href'))));
  if (h.startsWith('#/search')) return searchPage(new URLSearchParams(h.split('?')[1]).get('q') || '');
  if (h.startsWith('#/p/')) return productPage(h.slice(4));
  if (h === '#/deals') return dealsPage();
  if (h === '#/watchlist') return watchlistPage();
  if (h === '#/stores') return storesPage();
  if (h === '#/more') return moreStoresPage();
  if (h === '#/marketplaces') return marketplacesPage();
  return homePage();
}
$('#searchForm').addEventListener('submit', (e) => { e.preventDefault(); const q = $('#q').value.trim(); if (q.length > 1) { $('#q').blur(); location.hash = '#/search?q=' + encodeURIComponent(q); } });
window.addEventListener('hashchange', route);
badgeCount(); route();
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('/sw.js').catch(() => {});

// Native iOS shell (Capacitor): light status-bar text over the dark header.
if (window.Capacitor?.isNativePlatform?.()) {
  window.Capacitor.Plugins?.StatusBar?.setStyle?.({ style: 'DARK' }).catch?.(() => {});
}
