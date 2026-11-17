/* Felony's Airsoft Emporium: hash router, search + filters, product compare, price history, deals, drops. */
const API = (window.API_BASE || '').replace(/\/$/, '');
const app = document.getElementById('app');
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = (n) => '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const ic = (id, cls = 'ic') => `<svg class="${cls}" aria-hidden="true"><use href="#${id}"/></svg>`;
function priceHtml(n) {
  const [d, c] = Number(n).toFixed(2).split('.');
  return `<span class="price" aria-label="${money(n)}"><span class="cur">$</span>${Number(d).toLocaleString('en-US')}<sup>${c}</sup></span>`;
}
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const fmtDate = (d) => { const [, m, day] = String(d).split('-').map(Number); return `${MON[m - 1]} ${day}`; };
const todayStr = () => new Date().toLocaleDateString('en-CA');
const CATS = { rifles: 'Rifles / AEG', pistols: 'Pistols / GBB', snipers: 'Snipers', gear: 'Gear', optics: 'Optics', parts: 'Parts', bbs: 'BBs / Gas', other: 'Other' };
const STORE_INFO = {
  airsoftatlanta: ['Airsoft Atlanta', 'Georgia'], airsoftnmore: ['Airsoft N More', 'Los Angeles'], speedqb: ['SpeedQB', 'Utah'],
  foxairsoft: ['Fox Airsoft', 'USA'], ballahack: ['Ballahack Airsoft', 'Virginia'], airsoftstation: ['Airsoft Station', 'Kentucky'],
  megastore: ['Airsoft Megastore', 'California'], wolverine: ['Wolverine Airsoft', 'HPA direct'], ehobbyasia: ['eHobbyAsia', 'Hong Kong'],
  airsoftextreme: ['Airsoft Extreme', 'Bay Area'], amped: ['Amped Airsoft', 'Pennsylvania'], airsoftgi: ['Airsoft GI', 'SoCal'],
  evike: ['Evike.com', 'California'], sniperas: ['Sniper Airsoft', 'Germany'], replicaairguns: ['ReplicaAirguns', 'Reviews'],
  hopup: ['HopUp', 'Buy/sell app'], ebay: ['eBay Airsoft', 'Auctions & BIN'], gunbroker: ['GunBroker', 'Auctions'], reddit: ['r/airsoftmarket', 'Reddit'], fbmarket: ['FB Marketplace', 'Local'], fbgroups: ['FB Groups', 'Buy/sell/trade'],
};
const wordmark = (id, name) => `<div class="wm wm-${esc(id)}">${esc(STORE_INFO[id]?.[0] || name)}<small>${esc(STORE_INFO[id]?.[1] || '')}</small></div>`;

// ---- state & storage ----
const S = { groups: new Map(), lastList: '#/', fstate: {} };
const remember = (gs, at) => gs.forEach((g) => { if (at && !g.checkedAt) g.checkedAt = at; S.groups.set(g.id, g); });
const keyOf = (g) => g.offers[0].url;
const watch = {
  all: () => { try { return JSON.parse(localStorage.getItem('ad_watch') || '[]'); } catch { return []; } },
  has: (g) => watch.all().some((w) => w.key === keyOf(g)),
  toggle(g) {
    let l = watch.all();
    l = watch.has(g) ? l.filter((w) => w.key !== keyOf(g)) : [{ key: keyOf(g), savedAt: Date.now(), savedPrice: g.bestPrice, group: g }, ...l];
    localStorage.setItem('ad_watch', JSON.stringify(l.slice(0, 100)));
    badgeCount();
  },
};
function badgeCount() { const n = watch.all().length; const el = $('#watchCount'); el.textContent = n; el.classList.toggle('hidden', !n); }

let slowReqs = 0;
function wakeBanner(on) {
  slowReqs += on ? 1 : -1;
  let b = $('#wake');
  if (slowReqs > 0 && !b) { b = document.createElement('div'); b.id = 'wake'; b.className = 'wake'; b.setAttribute('role', 'status'); b.innerHTML = '<span class="spin"></span>Waking up the price server. The first load after a quiet spell takes up to a minute.'; document.body.appendChild(b); }
  if (slowReqs <= 0 && b) b.remove();
}
async function api(path) {
  let flagged = false;
  const t = setTimeout(() => { flagged = true; wakeBanner(true); }, 3500);
  try {
    const r = await fetch(API + path);
    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `Server error ${r.status}`);
    return await r.json();
  } finally { clearTimeout(t); if (flagged) wakeBanner(false); }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const cache = {
  get(k) { try { const v = JSON.parse(localStorage.getItem('ad_c:' + k)); return v && Date.now() - v.t < 24 * 3600e3 ? v.d : null; } catch { return null; } },
  set(k, d) {
    try {
      const idx = JSON.parse(localStorage.getItem('ad_c_idx') || '[]').filter((x) => x !== k);
      idx.unshift(k);
      while (idx.length > 10) localStorage.removeItem('ad_c:' + idx.pop());
      localStorage.setItem('ad_c_idx', JSON.stringify(idx));
      localStorage.setItem('ad_c:' + k, JSON.stringify({ t: Date.now(), d }));
    } catch { localStorage.removeItem('ad_c_idx'); }
  },
};
let navToken = 0;
// Cached data paints at once, then live data (a fast partial answer first for new searches).
async function loadLive(path, render, { fast = false } = {}) {
  const tok = ++navToken, alive = () => tok === navToken;
  const c = cache.get(path);
  let last = null;
  const show = (d) => { if (!alive() || (last && last.fetchedAt === d.fetchedAt && last.partial === d.partial)) return; last = d; render(d); };
  if (c) show({ ...c, fromDevice: true });
  let d = await api(fast && !c ? path + (path.includes('?') ? '&' : '?') + 'fast=1' : path);
  show(d);
  for (let i = 0; i < 4 && alive() && (d.partial || d.refreshing); i++) { await sleep(i ? 2000 : 300); d = await api(path); show(d); }
  if (!d.partial) cache.set(path, { ...d, refreshing: undefined });
  return d;
}
const ago = (iso) => { const m = Math.round((Date.now() - Date.parse(iso)) / 60000); return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`; };
const freshness = (d) => d.partial ? '<span class="fresh"><span class="spin"></span>more stores loading</span>'
  : d.refreshing || d.fromDevice ? `<span class="fresh"><span class="spin"></span>updating from ${ago(d.fetchedAt)}</span>` : '';

// ---- price history pieces ----
function trendHtml(h, { long = false } = {}) {
  if (!h) return '';
  if (h.chg) {
    const dn = h.chg < 0;
    return `<span class="arrow ${dn ? 'dn' : 'up'}" title="${dn ? 'Dropped' : 'Rose'} from ${money(h.prev)} on ${fmtDate(h.at)}">${dn ? '▼' : '▲'} ${money(Math.abs(h.chg))} · ${Math.abs(h.pct).toFixed(1)}%</span>${long ? `<span class="flat">vs ${money(h.prev)} before ${fmtDate(h.at)}</span>` : ''}`;
  }
  return `<span class="flat">Tracking since ${fmtDate(h.since)}</span>`;
}
function seriesToXY(pts, w, h, pad = [0, 0, 0, 0]) {
  const [pt, pr, pb, pl] = pad;
  const t = todayStr();
  const ser = pts.slice();
  if (ser[ser.length - 1][0] < t) ser.push([t, ser[ser.length - 1][1]]);
  if (ser.length === 1) ser.push([new Date(Date.parse(ser[0][0]) + 864e5).toISOString().slice(0, 10), ser[0][1]]);
  const x0 = Date.parse(ser[0][0]), x1 = Math.max(Date.parse(ser[ser.length - 1][0]), x0 + 864e5);
  let lo = Math.min(...ser.map((p) => p[1])), hi = Math.max(...ser.map((p) => p[1]));
  if (hi - lo < 0.01) { lo -= 1; hi += 1; }
  const X = (d) => pl + ((Date.parse(d) - x0) / (x1 - x0)) * (w - pl - pr);
  const Y = (v) => pt + (1 - (v - lo) / (hi - lo)) * (h - pt - pb);
  let d = '';
  ser.forEach(([dt, v], i) => { const x = X(dt).toFixed(1), y = Y(v).toFixed(1); d += i ? `H${x}V${y}` : `M${x} ${y}`; });
  return { d, X, Y, ser, lo, hi, x0, x1 };
}
function sparkline(h, w = 64, ht = 20) {
  if (!h || !h.pts || h.pts.length < 2) return '';
  const { d } = seriesToXY(h.pts, w, ht, [2, 2, 2, 2]);
  return `<svg class="spark" width="${w}" height="${ht}" viewBox="0 0 ${w} ${ht}" aria-hidden="true"><path d="${d}" fill="none" stroke="${h.chg < 0 ? 'var(--green)' : 'var(--red)'}" stroke-width="1.6" stroke-linejoin="round"/></svg>`;
}
function chartHtml(h) {
  const W = 640, H = 210, pad = [14, 14, 28, 58];
  const { d, X, Y, ser, lo, hi } = seriesToXY(h.pts, W, H, pad);
  const last = ser[ser.length - 1];
  const area = `${d}V${H - pad[2]}H${pad[3]}Z`;
  const color = h.chg < 0 ? '#3ee0a1' : h.chg > 0 ? '#ff7a8a' : '#b69cff';
  const ys = [hi, (hi + lo) / 2, lo];
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Price history from ${fmtDate(ser[0][0])} to today, low ${money(h.lo)}, high ${money(h.hi)}">
    <defs><linearGradient id="ag" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${color}" stop-opacity=".28"/><stop offset="1" stop-color="${color}" stop-opacity="0"/></linearGradient></defs>
    ${ys.map((v) => `<line class="grid-l" x1="${pad[3]}" x2="${W - pad[1]}" y1="${Y(v).toFixed(1)}" y2="${Y(v).toFixed(1)}"/><text class="lbl" x="${pad[3] - 8}" y="${(Y(v) + 4).toFixed(1)}" text-anchor="end">${money(v)}</text>`).join('')}
    ${h.pts.length > 1 ? `<line class="avg" x1="${pad[3]}" x2="${W - pad[1]}" y1="${Y(h.avg).toFixed(1)}" y2="${Y(h.avg).toFixed(1)}"/>` : ''}
    <path d="${area}" fill="url(#ag)"/>
    <path d="${d}" fill="none" stroke="${color}" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round"/>
    ${h.pts.map(([dt, v]) => `<circle cx="${X(dt).toFixed(1)}" cy="${Y(v).toFixed(1)}" r="4" fill="#0b0816" stroke="${color}" stroke-width="2"><title>${fmtDate(dt)}: ${money(v)}</title></circle>`).join('')}
    <circle cx="${X(last[0]).toFixed(1)}" cy="${Y(last[1]).toFixed(1)}" r="5" fill="${color}"/>
    <text class="lbl" x="${pad[3]}" y="${H - 8}">${fmtDate(ser[0][0])}</text><text class="lbl" x="${W - pad[1]}" y="${H - 8}" text-anchor="end">Today</text>
  </svg>`;
}

// ---- cards ----
function tagHtml(b) {
  const cls = b === 'ALL-TIME LOW' ? 'atl' : b.startsWith('LOWEST') ? 'low' : b === 'HOT DEAL' ? 'hot' : /OFF$/.test(b) ? 'off' : '';
  return `<span class="tag ${cls}">${esc(b)}</span>`;
}
function card(g, i = 99) {
  const tags = g.badges.filter((b) => b !== 'HOT DEAL').slice(0, 2);
  const stock = g.inStock === true ? '<span class="instock">In stock</span>' : g.inStock === false ? '<span class="oos">Out of stock</span>' : '';
  // The first few images are the page's largest paint, so they load eagerly; the rest lazily.
  const load = i < 4 ? `loading="eager"${i < 2 ? ' fetchpriority="high"' : ''}` : 'loading="lazy"';
  return `<div class="pcard" data-id="${g.id}" tabindex="0" role="link" aria-label="${esc(g.title)}, ${money(g.bestPrice)}">
    <div class="pimg">${g.images[0] ? `<img ${load} decoding="async" width="300" height="300" src="${esc(g.images[0])}" alt="" onerror="this.remove()">` : ''}<div class="tags">${tags.map(tagHtml).join('')}</div></div>
    <div class="pbody">
      ${g.brand ? `<div class="brandline">${esc(g.brand)}</div>` : ''}
      <div class="ptitle">${esc(g.title)}</div>
      <div class="pprice">${priceHtml(g.bestPrice)}${g.listPrice ? `<s>${money(g.listPrice)}</s><span class="pct">-${g.discountPct}%</span>` : ''}</div>
      <div class="trend">${trendHtml(g.h)}${sparkline(g.h)}</div>
      <div class="pmeta"><span>${g.storeCount > 1 ? `from ${g.storeCount} stores` : esc(g.bestStore)}</span>${stock}</div>
    </div></div>`;
}
function bindCards(root, from) {
  $$('.pcard[data-id]', root).forEach((el) => {
    const go = () => { S.lastList = from || location.hash || '#/'; location.hash = '#/p/' + el.dataset.id; };
    el.addEventListener('click', go);
    el.addEventListener('keydown', (e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), go()));
  });
}
const skCards = (n = 10) => `<div class="grid">${'<div class="sk card"></div>'.repeat(n)}</div>`;
const crumbs = (parts) => `<nav class="crumbs" aria-label="Breadcrumb">${parts.map(([l, h], i) => (h ? `<a href="${h}">${esc(l)}</a>` : `<span aria-current="page">${esc(l)}</span>`) + (i < parts.length - 1 ? '<span class="sep" aria-hidden="true">›</span>' : '')).join('')}</nav>`;
function view(html) { app.innerHTML = `<div class="view">${html}</div>`; }

function carousel(id, gs, start = 0) {
  return `<div class="car" id="${id}"><button class="car-btn l" aria-label="Scroll left" disabled>${ic('i-left')}</button><div class="car-track">${gs.map((g, i) => card(g, i + start)).join('')}</div><button class="car-btn r" aria-label="Scroll right">${ic('i-right')}</button></div>`;
}
function bindCarousel(el, from) {
  if (!el) return;
  const tr = $('.car-track', el), l = $('.car-btn.l', el), r = $('.car-btn.r', el);
  const upd = () => { l.disabled = tr.scrollLeft < 8; r.disabled = tr.scrollLeft + tr.clientWidth > tr.scrollWidth - 8; };
  l.onclick = () => tr.scrollBy({ left: -tr.clientWidth * 0.9, behavior: 'smooth' });
  r.onclick = () => tr.scrollBy({ left: tr.clientWidth * 0.9, behavior: 'smooth' });
  tr.addEventListener('scroll', upd, { passive: true }); upd();
  bindCards(el, from);
}

// ---- list view: filters sidebar (sheet on mobile) + sort + grid ----
const SORTS = [['featured', 'Featured'], ['price', 'Price: low to high'], ['price-desc', 'Price: high to low'], ['drop', 'Biggest price drop'], ['discount', 'Biggest discount'], ['stores', 'Most stores']];
const sorters = {
  price: (a, b) => a.bestPrice - b.bestPrice,
  'price-desc': (a, b) => b.bestPrice - a.bestPrice,
  drop: (a, b) => (a.h?.chg < 0 ? a.h.pct : 0) - (b.h?.chg < 0 ? b.h.pct : 0) || b.maxDiscountPct - a.maxDiscountPct,
  discount: (a, b) => (b.maxDiscountPct || 0) - (a.maxDiscountPct || 0) || b.belowAvgPct - a.belowAvgPct,
  stores: (a, b) => b.storeCount - a.storeCount || a.bestPrice - b.bestPrice,
};
const newF = (preset = {}) => ({ sort: 'featured', cats: new Set(), stores: new Set(), brands: new Set(), min: '', max: '', disc: 0, instock: false, free: false, drops: false, ...preset });
function applyF(gs, F, skip) {
  return gs.filter((g) => (skip === 'cats' || !F.cats.size || F.cats.has(g.cat))
    && (skip === 'stores' || !F.stores.size || g.offers.some((o) => F.stores.has(o.storeId)))
    && (skip === 'brands' || !F.brands.size || F.brands.has(g.brand || ''))
    && (F.min === '' || g.bestPrice >= +F.min) && (F.max === '' || g.bestPrice <= +F.max)
    && (!F.disc || (g.maxDiscountPct || 0) >= F.disc)
    && (!F.instock || g.inStock !== false) && (!F.free || g.freeShip) && (!F.drops || g.h?.chg < 0));
}
function counts(gs, fn) { const m = new Map(); for (const g of gs) for (const k of new Set([].concat(fn(g)))) m.set(k, (m.get(k) || 0) + 1); return [...m.entries()].sort((a, b) => b[1] - a[1]); }

function listView(data, { title, crumb, target = app, preset, sortDefault = 'featured', empty }) {
  remember(data.groups, data.fetchedAt);
  const key = location.hash;
  const F = S.fstate[key] || (S.fstate[key] = newF({ sort: sortDefault, ...(preset || {}) }));
  const storeName = Object.fromEntries(data.groups.flatMap((g) => g.offers.map((o) => [o.storeId, o.store])));
  target.innerHTML = `<div class="view">${crumbs(crumb)}
    <div class="lv">
      <aside class="side" id="side" aria-label="Filters"><div class="sheet-h"><h2>Filters</h2><button type="button" id="closeF" aria-label="Close filters">${ic('i-x')}</button></div><div id="facets"></div>
        <div class="sheet-f"><button type="button" class="btn secondary" id="clearF">Clear</button><button type="button" class="btn primary" id="applyF">Show results</button></div></aside>
      <section aria-label="Results">
        <div class="rhead"><div class="rcount" id="rcount" role="status"></div>
          <div class="rtools"><button type="button" class="btn secondary sm fbtn" id="openF">${ic('i-filter')}Filters<span id="fN"></span></button>
          <label class="sr" for="sort">Sort by</label><select class="sel" id="sort">${SORTS.map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}</select></div></div>
        <div class="active-f" id="activeF"></div>
        ${data.status?.some((s) => !s.ok) ? `<div class="status">${data.status.filter((s) => !s.ok).map((s) => `<span class="pill ${s.ok ? '' : s.indexing || s.slow ? 'wait' : 'err'}" title="${esc(s.error || '')}">${esc(s.store)} · ${s.ok ? s.count : s.indexing ? 'indexing' : s.slow ? 'loading' : 'unavailable'}</span>`).join('')}</div>` : ''}
        <div id="grid"></div>
        <div id="after"></div>
      </section>
    </div><div class="scrim" id="scrim"></div></div>`;
  const sort = $('#sort', target); sort.value = F.sort;
  const facetHtml = () => {
    const opt = (name, val, label, n, on) => `<label class="fopt"><input type="checkbox" data-f="${name}" value="${esc(val)}" ${on ? 'checked' : ''}><span>${esc(label)}</span><span class="n">${n}</span></label>`;
    const catC = counts(applyF(data.groups, F, 'cats'), (g) => g.cat);
    const stC = counts(applyF(data.groups, F, 'stores'), (g) => g.offers.map((o) => o.storeId));
    const brC = counts(applyF(data.groups, F, 'brands'), (g) => g.brand || '').filter(([b]) => b);
    const showAllBrands = target.dataset.allBrands === '1';
    return `
      <div class="fgroup"><h3>Availability</h3>
        <label class="fopt"><input type="checkbox" data-f="instock" ${F.instock ? 'checked' : ''}><span>In stock only</span></label>
        <label class="fopt"><input type="checkbox" data-f="free" ${F.free ? 'checked' : ''}><span>Free shipping</span></label>
        <label class="fopt"><input type="checkbox" data-f="drops" ${F.drops ? 'checked' : ''}><span>Price dropped</span></label></div>
      ${catC.length > 1 || F.cats.size ? `<div class="fgroup"><h3>Category</h3>${catC.map(([c, n]) => opt('cats', c, CATS[c] || c, n, F.cats.has(c))).join('')}</div>` : ''}
      <div class="fgroup"><h3>Price</h3><div class="frange"><label class="sr" for="fmin">Minimum price</label><input id="fmin" inputmode="decimal" placeholder="$ Min" value="${esc(F.min)}"><span aria-hidden="true">–</span><label class="sr" for="fmax">Maximum price</label><input id="fmax" inputmode="decimal" placeholder="$ Max" value="${esc(F.max)}"></div>
        <div class="chips" style="margin-top:10px">${[[0, 50], [50, 150], [150, 300], [300, '']].map(([a, b]) => `<button type="button" class="chip pr ${String(F.min) === String(a || '') && String(F.max) === String(b) ? 'on' : ''}" data-min="${a || ''}" data-max="${b}">${b === '' ? `$${a}+` : a ? `$${a}–${b}` : `Under $${b}`}</button>`).join('')}</div></div>
      <div class="fgroup"><h3>Discount</h3>${[[0, 'Any'], [10, '10% off or more'], [25, '25% off or more'], [40, '40% off or more']].map(([v, l]) => `<label class="fopt"><input type="radio" name="disc" data-f="disc" value="${v}" ${F.disc === v ? 'checked' : ''}><span>${l}</span></label>`).join('')}</div>
      <div class="fgroup"><h3>Store</h3>${stC.map(([s, n]) => opt('stores', s, storeName[s] || s, n, F.stores.has(s))).join('')}</div>
      ${brC.length ? `<div class="fgroup"><h3>Brand</h3>${(showAllBrands ? brC : brC.slice(0, 8)).map(([b, n]) => opt('brands', b, b, n, F.brands.has(b))).join('')}${brC.length > 8 ? `<button type="button" class="more-btn" id="moreBrands">${showAllBrands ? 'Show fewer' : `Show all ${brC.length}`}</button>` : ''}</div>` : ''}`;
  };
  const activeHtml = () => {
    const chips = [];
    F.cats.forEach((c) => chips.push(['cats', c, CATS[c] || c]));
    F.stores.forEach((s) => chips.push(['stores', s, storeName[s] || s]));
    F.brands.forEach((b) => chips.push(['brands', b, b]));
    if (F.min !== '' || F.max !== '') chips.push(['price', '', `${F.min !== '' ? '$' + F.min : '$0'} – ${F.max !== '' ? '$' + F.max : 'any'}`]);
    if (F.disc) chips.push(['disc', '', `${F.disc}%+ off`]);
    if (F.instock) chips.push(['instock', '', 'In stock']);
    if (F.free) chips.push(['free', '', 'Free shipping']);
    if (F.drops) chips.push(['drops', '', 'Price dropped']);
    $('#fN', target).textContent = chips.length ? ` (${chips.length})` : '';
    return chips.map(([f, v, l]) => `<button type="button" class="chip on" data-rm="${f}" data-v="${esc(v)}" aria-label="Remove filter ${esc(l)}">${esc(l)}${ic('i-x')}</button>`).join('');
  };
  const render = () => {
    let gs = applyF(data.groups, F);
    if (sorters[F.sort]) gs = [...gs].sort(sorters[F.sort]);
    $('#rcount', target).innerHTML = title(gs.length);
    $('#applyF', target).textContent = `Show ${gs.length} result${gs.length === 1 ? '' : 's'}`;
    $('#facets', target).innerHTML = facetHtml();
    $('#activeF', target).innerHTML = activeHtml();
    $('.rtools', target).classList.toggle('hidden', !data.groups.length);
    $('#grid', target).innerHTML = gs.length ? `<div class="grid">${gs.map((g, i) => card(g, i)).join('')}</div>` : (empty && !data.groups.length ? empty : `<div class="empty">${ic('i-search')}<h2>No matches</h2><p>Try fewer filters or a broader search.</p></div>`);
    bindCards($('#grid', target));
  };
  const side = $('#side', target), scrim = $('#scrim', target);
  const sheet = (on) => { side.classList.toggle('open', on); scrim.classList.toggle('on', on); document.body.style.overflow = on ? 'hidden' : ''; if (on) $('#closeF', target).focus(); };
  $('#openF', target).onclick = () => sheet(true);
  $('#closeF', target).onclick = $('#applyF', target).onclick = scrim.onclick = () => sheet(false);
  $('#clearF', target).onclick = () => { Object.assign(F, newF({ sort: F.sort })); render(); };
  sort.onchange = () => { F.sort = sort.value; render(); };
  side.addEventListener('change', (e) => {
    const el = e.target, f = el.dataset.f;
    if (!f) { if (el.id === 'fmin') F.min = el.value.replace(/[^0-9.]/g, ''); if (el.id === 'fmax') F.max = el.value.replace(/[^0-9.]/g, ''); render(); return; }
    if (F[f] instanceof Set) (el.checked ? F[f].add(el.value) : F[f].delete(el.value));
    else if (f === 'disc') F.disc = +el.value;
    else F[f] = el.checked;
    render();
  });
  side.addEventListener('click', (e) => {
    const pr = e.target.closest('.chip.pr');
    if (pr) { F.min = pr.dataset.min; F.max = pr.dataset.max; render(); }
    if (e.target.id === 'moreBrands') { target.dataset.allBrands = target.dataset.allBrands === '1' ? '' : '1'; render(); }
  });
  $('#activeF', target).addEventListener('click', (e) => {
    const b = e.target.closest('[data-rm]'); if (!b) return;
    const f = b.dataset.rm;
    if (F[f] instanceof Set) F[f].delete(b.dataset.v); else if (f === 'price') { F.min = ''; F.max = ''; } else if (f === 'disc') F.disc = 0; else F[f] = false;
    render();
  });
  render();
}

// ---- pages ----
function setQ(q = '', cat = '') { $('#q').value = q; $('#cat').value = cat; }

async function searchPage(q, cat) {
  setQ(q, cat);
  view(`${crumbs([['Home', '#/'], [`“${q}”`]])}${skCards()}`);
  const cr = [['Home', '#/'], ...(cat ? [[CATS[cat], '#/c/' + cat]] : []), [`“${q}”`]];
  try {
    await loadLive('/api/search?q=' + encodeURIComponent(q), (d) => {
      listView(d, { crumb: cr, preset: cat ? { cats: new Set([cat]) } : null, title: (n) => `<b>${n}</b> result${n === 1 ? '' : 's'} for <b>“${esc(q)}”</b> ${freshness(d)}` });
      const after = $('#after'); if (after && !after.dataset.q) { after.dataset.q = q; loadMarketplaceSection(q, after); }
    }, { fast: true });
  } catch (e) { if (!$('#grid')) errorView(e); }
}

async function browsePage(cat) {
  setQ('', cat);
  view(`${crumbs([['Home', '#/'], [CATS[cat] || cat]])}${skCards()}`);
  try {
    await loadLive('/api/browse?cat=' + encodeURIComponent(cat), (d) => listView(d, { crumb: [['Home', '#/'], [CATS[cat] || cat]], title: (n) => `<b>${n}</b> in <b>${esc(CATS[cat] || cat)}</b> ${freshness(d)}` }));
  } catch (e) { if (!$('#grid')) errorView(e); }
}

async function dealsPage() {
  setQ();
  view(`${crumbs([['Home', '#/'], ['Deals']])}${skCards()}`);
  try {
    await loadLive('/api/deals', (d) => { S.deals = d; listView(d, { crumb: [['Home', '#/'], ["Today's deals"]], sortDefault: 'featured', title: (n) => `<b>${n}</b> deals from ${d.status.filter((s) => s.ok).length} stores ${freshness(d)}` }); });
  } catch (e) { if (!$('#grid')) errorView(e); }
}

const dropsEmpty = (hm) => `<div class="empty panel">${ic('i-down')}<h2>No price drops yet</h2><p>Tracking ${hm?.tracked ? `<b>${hm.tracked.toLocaleString()}</b> products` : 'prices'}${hm?.since ? ` since <b>${fmtDate(hm.since)}</b>` : ''}. Prices are re-checked twice a day, and drops show up here as soon as a price falls.</p></div>`;
async function dropsPage() {
  setQ();
  view(`${crumbs([['Home', '#/'], ['Price drops']])}${skCards()}`);
  try {
    await loadLive('/api/drops', (d) => listView(d, { crumb: [['Home', '#/'], ['Price drops']], sortDefault: 'drop', empty: dropsEmpty(d.history), title: (n) => `<b>${n}</b> price drops in the last 3 weeks${d.history?.updated ? ` <span class="fresh">· checked ${ago(d.history.updated)}</span>` : ''}` }));
  } catch (e) { if (!$('#grid')) errorView(e); }
}

function productPage(id) {
  const g = S.groups.get(id) || watch.all().map((w) => w.group).find((x) => x.id === id);
  if (!g) { location.hash = '#/'; return; }
  setQ();
  const L = S.lastList;
  const back = L.startsWith('#/search') ? [`“${decodeURIComponent((L.split('q=')[1] || '').split('&')[0])}”`, L] : L.startsWith('#/deals') ? ['Deals', L] : L.startsWith('#/drops') ? ['Price drops', L] : L.startsWith('#/c/') ? [CATS[L.slice(4)] || 'Category', L] : L.startsWith('#/watchlist') ? ['Watchlist', L] : null;
  const best = g.offers[0], multi = g.offers.length > 1, h = g.h;
  const spec = [CATS[g.cat] && g.cat !== 'other' ? CATS[g.cat] : null, g.platform, `${g.storeCount} store${g.storeCount > 1 ? 's' : ''}`, g.inStock === true ? 'In stock' : g.inStock === false ? 'Out of stock' : null].filter(Boolean);
  const spread = multi ? g.offers[g.offers.length - 1].price - g.offers[0].price : 0;
  const offerRow = (o, i) => {
    let badge = '';
    if (multi) badge = Math.abs(o.vsAvg) < 0.5 ? '<span class="badge n">AVG</span>' : o.vsAvg < 0 ? `<span class="badge g">${o.vsAvgPct}%</span>` : `<span class="badge r">+${o.vsAvgPct}%</span>`;
    else if (o.discountPct) badge = `<span class="badge g">-${o.discountPct}%</span>`;
    const stock = o.inStock === true ? '<span class="instock">In stock</span>' : o.inStock === false ? '<span class="oos">Out of stock</span>' : '<span>Check stock</span>';
    const ship = o.ship ? `<span>${o.ship.free ? '<span class="instock">Free shipping</span>' : esc(o.ship.note)}</span>` : '';
    return `<a class="offer ${i === 0 ? 'best' : ''}" href="${esc(o.url)}" target="_blank" rel="noopener" aria-label="${esc(o.store)} ${money(o.price)}, opens store site">
      ${wordmark(o.storeId, o.store)}
      <div class="o-mid">${stock}${ship}${o.originalPrice ? `<span>was ${money(o.originalPrice)}</span>` : ''}</div>
      <div class="o-right"><div class="o-price">${badge}${money(o.price)}</div><div class="o-sub">${o.h?.chg ? trendHtml(o.h) : `View ${ic('i-ext', 'ic')}`.replace('class="ic"', 'class="ic" style="width:13px;height:13px"')}</div></div></a>`;
  };
  const histPanel = h ? `<section class="panel hist" aria-label="Price history">
      <div class="hist-top"><div class="trend">${trendHtml(h, { long: true })}</div><span class="fresh">Since ${fmtDate(h.since)}</span></div>
      ${chartHtml(h)}
      <div class="hstats"><div class="kv"><small>Now</small><b>${money(g.bestPrice)}</b></div><div class="kv"><small>Lowest</small><b class="dn">${money(h.lo)}</b></div><div class="kv"><small>Highest</small><b class="up">${money(h.hi)}</b></div><div class="kv"><small>Average</small><b>${money(h.avg)}</b></div></div>
      ${h.pts.length < 2 ? `<p class="hist-note">One price recorded so far. The chart fills in as the price changes; prices are re-checked twice a day.</p>` : ''}
    </section>` : '';
  view(`${crumbs([['Home', '#/'], ...(back ? [back] : []), [g.brand || 'Product']])}
  <div class="prod">
    <div class="gallery">
      <div class="main-img">${g.images[0] ? `<img id="mainImg" src="${esc(g.images[0])}" alt="${esc(g.title)}" width="600" height="600" decoding="async">` : ''}</div>
      ${g.images.length > 1 ? `<div class="thumbs">${g.images.map((src, i) => `<button class="thumb ${i ? '' : 'on'}" data-src="${esc(src)}" aria-label="Image ${i + 1}"><img src="${esc(src)}" alt="" loading="lazy"></button>`).join('')}</div>` : ''}
    </div>
    <div class="info">
      ${g.brand ? `<a class="p-brand" href="#/search?q=${encodeURIComponent(g.brand)}">${esc(g.brand)}</a>` : ''}
      <h1 class="p-title">${esc(g.title)}</h1>
      <div class="p-spec">${spec.map((s) => `<span>${esc(s)}</span>`).join('')}</div>
      <div class="p-hl">
        ${multi ? `<div class="kv"><small>Store average</small><b>${money(g.avgPrice)}</b></div><div class="kv"><small>You save vs. highest</small><b class="dn">${money(spread)}</b></div>` : ''}
        ${h ? `<div class="kv"><small>Lowest tracked</small><b>${money(h.lo)}</b></div><div class="kv"><small>Tracking since</small><b>${fmtDate(h.since)}</b></div>` : ''}
      </div>
    </div>
    <aside class="panel buy" aria-label="Best price">
      <div class="lbl">BEST PRICE</div>
      ${priceHtml(g.bestPrice)}
      ${best.originalPrice ? `<div class="was"><s>${money(best.originalPrice)}</s><span class="dn">Save ${money(best.savings)} (${best.discountPct}%)</span></div>` : ''}
      <div class="trend">${trendHtml(h, { long: true })}</div>
      <div class="at">at <b>${esc(best.store)}</b>${multi && g.belowAvgPct > 0 ? ` · <span class="dn">${g.belowAvgPct}% below average</span>` : ''}</div>
      <div class="line">${best.inStock === true ? '<span class="instock">● In stock</span>' : best.inStock === false ? '<span class="oos">● Out of stock</span>' : '<span>● Check stock at store</span>'}</div>
      ${best.ship ? `<div class="line">${best.ship.free ? '<span class="instock">Free shipping on this item</span>' : esc(best.ship.note)}</div>` : ''}
      <a class="btn primary block" href="${esc(best.url)}" target="_blank" rel="noopener">View at ${esc(best.store)} ${ic('i-ext')}</a>
      <button class="btn secondary block ${watch.has(g) ? 'on' : ''}" id="watchBtn" aria-pressed="${watch.has(g)}">${ic('i-heart')}<span>${watch.has(g) ? 'Watching' : 'Add to watchlist'}</span></button>
      <p class="note">Checked ${g.checkedAt ? ago(g.checkedAt) : 'live'}. Tax extra; confirm the variant at the store.</p>
    </aside>
  </div>
  <div class="below"><div><div class="sec-h"><h2>Compare ${g.storeCount} store${g.storeCount > 1 ? 's' : ''}</h2></div>
  <div class="offers">${g.offers.map(offerRow).join('')}</div></div>
  ${histPanel ? `<div><div class="sec-h"><h2>Price history</h2>${h.atl ? '<span class="atl">★ ALL-TIME LOW</span>' : ''}</div>${histPanel}</div>` : ''}</div>`);
  $$('.thumb').forEach((t) => t.addEventListener('click', () => { $('#mainImg').src = t.dataset.src; $$('.thumb').forEach((x) => x.classList.toggle('on', x === t)); }));
  $('#watchBtn').addEventListener('click', (e) => { watch.toggle(g); const on = watch.has(g), b = e.currentTarget; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); b.querySelector('span').textContent = on ? 'Watching' : 'Add to watchlist'; });
  window.scrollTo(0, 0);
}

const POPULAR = ['Tokyo Marui', 'Glock', 'Hi-Capa', 'M4 AEG', 'Gas blowback', 'HPA', 'Sniper rifle', 'Plate carrier', '0.28g BBs'];
async function homePage() {
  setQ();
  view(`<section class="hero"><h1>The <em>best price</em> on airsoft gear, every time.</h1>
      <p>Live prices from 12 trusted stores, matched side by side, with price history.</p>
      <div class="stats" id="stats"><span class="stat"><span class="dot"></span><b>12</b> stores live</span></div></section>
    <nav class="tiles" aria-label="Categories">${['rifles', 'pistols', 'snipers', 'gear', 'optics', 'parts', 'bbs'].map((c) => `<a class="tile" href="#/c/${c}">${ic('c-' + c)}<span>${CATS[c]}</span></a>`).join('')}</nav>
    <div class="sec-h"><h2>Today's deals</h2><a href="#/deals">See all ${ic('i-right')}</a></div><div id="homeDeals"><div class="car"><div class="car-track">${'<div class="sk card"></div>'.repeat(5)}</div></div></div>
    <div class="sec-h"><h2>Price drops</h2><a href="#/drops">See all ${ic('i-right')}</a></div><div id="homeDrops"><div class="car"><div class="car-track">${'<div class="sk card"></div>'.repeat(5)}</div></div></div>
    <div class="sec-h"><h2>Popular searches</h2></div><div class="chips">${POPULAR.map((c) => `<a class="chip" href="#/search?q=${encodeURIComponent(c)}">${esc(c)}</a>`).join('')}</div>`);
  const tok = ++navToken;
  const deals = (d) => {
    if (tok !== navToken || !$('#homeDeals')) return;
    S.deals = d; remember(d.groups, d.fetchedAt);
    const per = {}, pick = [];
    for (const g of d.groups) { const s = g.offers[0].storeId; if ((per[s] = (per[s] || 0) + 1) <= 2) pick.push(g); }
    $('#homeDeals').innerHTML = carousel('dealsCar', pick.slice(0, 16));
    bindCarousel($('#dealsCar'), '#/deals');
  };
  const drops = (d) => {
    if (tok !== navToken || !$('#homeDrops')) return;
    remember(d.groups, d.fetchedAt);
    const hm = d.history || {};
    if (hm.tracked) $('#stats').innerHTML = `<span class="stat"><span class="dot"></span><b>12</b> stores live</span><span class="stat"><b>${hm.tracked.toLocaleString()}</b> prices tracked</span>${hm.updated ? `<span class="stat opt">History updated ${ago(hm.updated)}</span>` : ''}`;
    $('#homeDrops').innerHTML = d.groups.length ? carousel('dropsCar', [...d.groups].sort(sorters.drop).slice(0, 16), 10) : dropsEmpty(hm).replace('class="empty panel"', 'class="empty panel sm"');
    bindCarousel($('#dropsCar'), '#/drops');
  };
  const c1 = cache.get('/api/deals'), c2 = cache.get('/api/drops');
  if (c1) deals(c1); if (c2) drops(c2);
  api('/api/deals').then((d) => { deals(d); if (!d.partial) cache.set('/api/deals', d); }).catch((e) => { if (!c1 && $('#homeDeals')) $('#homeDeals').innerHTML = `<div class="empty sm"><p>${esc(e.message)}</p></div>`; });
  api('/api/drops').then((d) => { drops(d); cache.set('/api/drops', d); }).catch(() => {});
}

function watchlistPage() {
  setQ();
  const l = watch.all();
  l.forEach((w) => S.groups.set(w.group.id, w.group));
  view(crumbs([['Home', '#/'], ['Watchlist']]) + (l.length
    ? `<div class="rhead"><div class="rcount"><b>${l.length}</b> saved · prices as of when you saved them</div></div><div class="grid" id="wl">${l.map((w) => card(w.group)).join('')}</div>`
    : `<div class="empty panel">${ic('i-heart')}<h2>Your watchlist is empty</h2><p>Open any product and tap “Add to watchlist”.</p></div>`));
  if (l.length) bindCards($('#wl'), '#/watchlist');
}

async function storesPage() {
  setQ();
  view(crumbs([['Home', '#/'], ['Stores']]) + `<div class="stores">${'<div class="sk" style="height:110px"></div>'.repeat(6)}</div>`);
  try {
    const d = await api('/api/stores');
    const ext = (s, extra = '') => `<a class="scard ${extra}" href="${esc(s.url)}" target="_blank" rel="noopener noreferrer"><div class="scard-top">${wordmark(s.id, s.name)}${ic('i-ext')}</div><p>${esc(s.url.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, ''))}</p></a>`;
    view(crumbs([['Home', '#/'], ['Stores']]) + `
      <div class="sec-h" style="margin-top:0"><h2>Price-checked stores <span class="live-pill">${d.stores.length} LIVE</span></h2></div>
      <div class="stores">${d.stores.map((s) => `<a class="scard" href="${esc(s.url)}" target="_blank" rel="noopener noreferrer"><div class="scard-top">${wordmark(s.id, s.name)}${ic('i-ext')}</div>
        ${s.shipping ? `<p class="ship">${esc(s.shipping.note)}</p>` : ''}${s.index ? `<p>${s.index.products ? `${s.index.products.toLocaleString()} products indexed` : 'Indexing…'}</p>` : ''}</a>`).join('')}</div>
      <div class="sec-h"><h2>More stores</h2></div><div class="stores">${d.skipped.map((s) => ext(s)).join('')}</div>
      ${d.reviews?.length ? `<div class="sec-h"><h2>Reviews</h2></div><div class="stores">${d.reviews.map((s) => ext(s)).join('')}</div>` : ''}`);
  } catch (e) { errorView(e); }
}

async function marketplacesPage() {
  setQ();
  view(crumbs([['Home', '#/'], ['Marketplaces']]) + `<div class="stores">${'<div class="sk" style="height:96px"></div>'.repeat(6)}</div>`);
  try {
    const d = await api('/api/marketplaces');
    view(crumbs([['Home', '#/'], ['Marketplaces']]) + `<div class="sec-h" style="margin-top:0"><h2>Used &amp; marketplaces</h2></div>
      <div class="stores">${d.marketplaces.map((m) => `<a class="scard" href="${esc(m.url)}" target="_blank" rel="noopener noreferrer"><div class="scard-top">${wordmark(m.id, m.name)}${ic('i-ext')}</div>
        <p>${esc(m.url.replace(/^https?:\/\/(www\.)?/, '').replace(/\/.*$/, ''))}${m.live ? ' <span class="live-pill">LIVE PRICES</span>' : ''}</p></a>`).join('')}</div>`);
  } catch (e) { errorView(e); }
}

async function loadMarketplaceSection(q, el) {
  try {
    const m = await api('/api/marketplace-search?q=' + encodeURIComponent(q));
    if (!el.isConnected) return;
    const listings = m.listings.length ? `<div class="grid">${m.listings.map((l) => `<a class="pcard" href="${esc(l.url)}" target="_blank" rel="noopener noreferrer">
        <div class="pimg">${l.image ? `<img loading="lazy" src="${esc(l.image)}" alt="">` : ''}<div class="tags">${l.condition ? `<span class="tag">${esc(l.condition.toUpperCase())}</span>` : ''}</div></div>
        <div class="pbody"><div class="brandline">${esc(l.marketplace)} · ${esc(l.format)}</div><div class="ptitle">${esc(l.title)}</div><div class="pprice">${priceHtml(l.price)}</div></div></a>`).join('')}</div>` : '';
    el.innerHTML = `<section class="mkt-section"><div class="sec-h"><h2>Used &amp; marketplace</h2><a href="#/marketplaces">All marketplaces ${ic('i-right')}</a></div>${listings}<div class="mkt-links"><span>Search used:</span>${m.links.map((l) => `<a class="btn secondary sm" href="${esc(l.url)}" target="_blank" rel="noopener noreferrer">${esc(l.name)}</a>`).join('')}</div></section>`;
  } catch { /* optional section */ }
}

function errorView(e) { view(`<div class="empty panel"><h2>Couldn’t reach the price server</h2><p>${esc(e.message)}</p><button class="btn primary" onclick="route()">Try again</button></div>`); }

// ---- search box: category + autocomplete ----
const qEl = $('#q'), sugg = $('#sugg');
const recent = { all: () => { try { return JSON.parse(localStorage.getItem('ad_recent') || '[]'); } catch { return []; } }, add(q) { localStorage.setItem('ad_recent', JSON.stringify([q, ...recent.all().filter((x) => x.toLowerCase() !== q.toLowerCase())].slice(0, 6))); } };
const sCache = new Map();
let sIdx = -1, sItems = [], sTimer = 0;
function showSugg(items, typed) {
  sItems = items; sIdx = -1;
  if (!items.length) return hideSugg();
  const hl = (s) => { const i = s.toLowerCase().indexOf(typed.toLowerCase()); return typed && i >= 0 ? `${esc(s.slice(0, i))}<b>${esc(s.slice(i, i + typed.length))}</b>${esc(s.slice(i + typed.length))}` : esc(s); };
  sugg.innerHTML = items.map(([s, kind], i) => `<li role="option" id="sg${i}" aria-selected="false" data-i="${i}">${ic(kind === 'recent' ? 'i-clock' : 'i-search')}<span>${hl(s)}</span></li>`).join('');
  sugg.hidden = false; qEl.setAttribute('aria-expanded', 'true');
}
function hideSugg() { sugg.hidden = true; qEl.setAttribute('aria-expanded', 'false'); qEl.removeAttribute('aria-activedescendant'); }
async function updateSugg() {
  const q = qEl.value.trim();
  if (!q) return showSugg(recent.all().map((s) => [s, 'recent']), '');
  const rec = recent.all().filter((s) => s.toLowerCase().startsWith(q.toLowerCase())).slice(0, 3).map((s) => [s, 'recent']);
  showSugg(rec, q);
  try {
    const k = q.toLowerCase();
    const list = sCache.get(k) || (await api('/api/suggest?q=' + encodeURIComponent(q))).suggestions;
    sCache.set(k, list);
    if (qEl.value.trim() !== q || document.activeElement !== qEl) return;
    const seen = new Set(rec.map(([s]) => s.toLowerCase()));
    showSugg([...rec, ...list.filter((s) => !seen.has(s.toLowerCase())).map((s) => [s, 'sugg'])].slice(0, 8), q);
  } catch { /* suggestions are optional */ }
}
function go(q) {
  q = q.trim(); if (q.length < 2) return;
  hideSugg(); qEl.blur(); recent.add(q);
  const cat = $('#cat').value;
  location.hash = '#/search?q=' + encodeURIComponent(q) + (cat ? '&cat=' + cat : '');
}
qEl.addEventListener('input', () => { clearTimeout(sTimer); sTimer = setTimeout(updateSugg, 120); });
qEl.addEventListener('focus', updateSugg);
qEl.addEventListener('blur', () => setTimeout(hideSugg, 120));
qEl.addEventListener('keydown', (e) => {
  if (sugg.hidden || !sItems.length) return;
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault();
    sIdx = (sIdx + (e.key === 'ArrowDown' ? 1 : -1) + sItems.length + 1) % (sItems.length + 1) - (0);
    if (sIdx === sItems.length) sIdx = -1;
    $$('li', sugg).forEach((li, i) => li.setAttribute('aria-selected', i === sIdx));
    if (sIdx >= 0) qEl.setAttribute('aria-activedescendant', 'sg' + sIdx); else qEl.removeAttribute('aria-activedescendant');
  } else if (e.key === 'Enter' && sIdx >= 0) { e.preventDefault(); qEl.value = sItems[sIdx][0]; go(qEl.value); }
  else if (e.key === 'Escape') hideSugg();
});
sugg.addEventListener('pointerdown', (e) => { const li = e.target.closest('li'); if (!li) return; e.preventDefault(); qEl.value = sItems[+li.dataset.i][0]; go(qEl.value); });
$('#searchForm').addEventListener('submit', (e) => { e.preventDefault(); go(qEl.value); });
$('#cat').addEventListener('change', () => { const q = qEl.value.trim(); const c = $('#cat').value; if (q.length > 1) go(q); else if (c) location.hash = '#/c/' + c; });

// ---- router + tabs ----
function setTabs(tab, cat) {
  $$('[data-tab]').forEach((a) => { const on = a.dataset.tab === tab; a.classList.toggle('on', on); if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
  $$('.cat').forEach((a) => a.classList.toggle('on', a.dataset.cat === cat));
  $('.hicon').classList.toggle('on', tab === 'watch');
}
function route() {
  navToken++;
  document.body.style.overflow = '';
  const h = location.hash || '#/';
  const params = new URLSearchParams(h.split('?')[1] || '');
  const lastTab = (S.lastList.match(/^#\/(deals|drops|c\/)/) || [])[1];
  if (h.startsWith('#/search')) { setTabs('home', params.get('cat')); return searchPage(params.get('q') || '', params.get('cat') || ''); }
  if (h.startsWith('#/c/')) { const c = h.slice(4).split('?')[0]; setTabs('home', c); return browsePage(c); }
  if (h.startsWith('#/p/')) { setTabs(lastTab === 'deals' ? 'deals' : lastTab === 'drops' ? 'drops' : 'home'); return productPage(h.slice(4)); }
  if (h === '#/deals') { setTabs('deals'); return dealsPage(); }
  if (h === '#/drops') { setTabs('drops'); return dropsPage(); }
  if (h === '#/watchlist') { setTabs('watch'); return watchlistPage(); }
  if (h === '#/stores' || h === '#/more') { setTabs('stores'); return storesPage(); }
  if (h === '#/marketplaces') { setTabs('markets'); return marketplacesPage(); }
  setTabs('home'); return homePage();
}
window.route = route;
window.addEventListener('hashchange', () => { route(); if (!location.hash.startsWith('#/p/')) window.scrollTo(0, 0); });
// Header height drives sticky offsets (sidebar, buy box, mobile results bar).
const hdr = $('#hdr');
const setH = () => document.documentElement.style.setProperty('--hdr-h', hdr.offsetHeight + 'px');
if ('ResizeObserver' in window) new ResizeObserver(setH).observe(hdr); else setH();
badgeCount(); route();
document.addEventListener('visibilitychange', () => document.documentElement.classList.toggle('paused', document.hidden));
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
if (window.Capacitor?.isNativePlatform?.()) window.Capacitor.Plugins?.StatusBar?.setStyle?.({ style: 'DARK' }).catch?.(() => {});
