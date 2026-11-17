/* Felony's Airsoft Emporium: hash router, search + filters, product compare, price history, deals, drops. */
const API = (window.API_BASE || '').replace(/\/$/, '');
const app = document.getElementById('app');
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = (n) => '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const ic = (id, cls = 'ic') => `<svg class="${cls}" aria-hidden="true"><use href="#${id}"/></svg>`;
// ---- images: each store's photo in turn, then our same-origin fallback (/img), then a branded placeholder ----
const PH_CATS = new Set(['rifles', 'pistols', 'snipers', 'gear', 'optics', 'parts', 'bbs', 'mags', 'holsters', 'batteries', 'gas']);
const phHtml = (cat, failed) => `<div class="ph${failed ? ' failed' : ''}" role="img" aria-label="No photo available">${ic(PH_CATS.has(cat) ? 'c-' + cat : 'i-spark', 'ph-ic')}<span>No photo</span></div>`;
function imgHtml(srcs, cat, attrs = '', sizes = '') {
  const list = (srcs || []).filter((u) => /^https:\/\//.test(u || '')).map((u) => u.replace(/ /g, '%20'));
  if (!list.length) return phHtml(cat);
  // Shopify's CDN resizes for free: small screens / 1x displays get a 240px file instead of 400px.
  const set = sizes && /^https:\/\/cdn\.shopify\.com\/.*[?&]width=400\b/.test(list[0]) ? ` srcset="${esc(list[0].replace(/([?&])width=400\b/, '$1width=240'))} 240w, ${esc(list[0])} 400w" sizes="${sizes}"` : '';
  return `<img ${attrs} src="${esc(list[0])}"${set} data-srcs="${esc(list.join(' '))}" data-cat="${esc(cat || '')}" onerror="imgFail(this)">`;
}
window.imgFail = (el) => {
  el.removeAttribute('srcset');
  const list = (el.dataset.srcs || '').split(' ').filter(Boolean);
  const i = +(el.dataset.i || 0) + 1;
  if (i < list.length) { el.dataset.i = i; el.src = list[i]; return; }
  if (!el.dataset.px && list[0]) { el.dataset.px = '1'; el.src = API + '/img?u=' + encodeURIComponent(list[0]); return; }
  el.onerror = null; el.outerHTML = phHtml(el.dataset.cat, true);
};
// ---- score /10 ----
const scoreCls = (s) => (s >= 7 ? 'good' : s >= 5 ? 'ok' : 'skip');
const scoreBadge = (g) => (g.score ? `<span class="sbadge ${scoreCls(g.score.s)}" title="${g.score.k === 'ai' ? 'Score by Grok AI' : 'Estimated score (not AI): brand reputation, price and real customer ratings'}"><b>${g.score.s}</b><small>/10</small><i>${g.score.k === 'ai' ? 'AI' : 'est.'}</i></span>` : '');
function priceHtml(n) {
  const [d, c] = Number(n).toFixed(2).split('.');
  return `<span class="price" aria-label="${money(n)}"><span class="cur">$</span>${Number(d).toLocaleString('en-US')}<sup>${c}</sup></span>`;
}
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const fmtDate = (d) => { const [, m, day] = String(d).split('-').map(Number); return `${MON[m - 1]} ${day}`; };
const todayStr = (() => { let at = 0, v = ''; return () => { const n = Date.now(); if (n - at > 60000) { at = n; v = new Date(n).toLocaleDateString('en-CA'); } return v; }; })(); // memoized: called per card
const CATS = { rifles: 'Rifles / AEG', pistols: 'Pistols / GBB', snipers: 'Snipers', mags: 'Magazines', holsters: 'Holsters', gear: 'Gear', optics: 'Optics', parts: 'Parts', batteries: 'Batteries', bbs: 'BBs', gas: 'Gas & CO2', other: 'Other' };
const CAT_ORDER = ['rifles', 'pistols', 'snipers', 'mags', 'holsters', 'gear', 'optics', 'parts', 'batteries', 'bbs', 'gas'];
const STORE_INFO = {
  airsoftatlanta: ['Airsoft Atlanta', 'Georgia'], airsoftnmore: ['Airsoft N More', 'Los Angeles'], speedqb: ['SpeedQB', 'Utah'],
  foxairsoft: ['Fox Airsoft', 'USA'], ballahack: ['Ballahack Airsoft', 'Virginia'], airsoftstation: ['Airsoft Station', 'Kentucky'],
  megastore: ['Airsoft Megastore', 'California'], wolverine: ['Wolverine Airsoft', 'HPA direct'], ehobbyasia: ['eHobbyAsia', 'Hong Kong'],
  airsoftextreme: ['Airsoft Extreme', 'Bay Area'], amped: ['Amped Airsoft', 'Pennsylvania'], airsoftgi: ['Airsoft GI', 'SoCal'],
  brill: ['Brill Armory', 'Parts'], echo1: ['Echo1 USA', 'California'], wgc: ['WGC Shop', 'Hong Kong'], redwolf: ['RedWolf', 'Hong Kong'],
  ssairsoft: ['SS Airsoft', 'Atlanta'], extremeri: ['Extreme Airsoft', 'Rhode Island'], vipairsoft: ['VIP Airsoft', 'Arizona'], blackopsnc: ['Black Ops', 'N. Carolina'], polarstar: ['PolarStar', 'HPA direct'], primary: ['Primary Airsoft', 'HPA adapters'], taccity: ['Tac City', 'Fullerton CA'], umarex: ['Umarex USA', 'Elite Force'],
  mirtactical: ['MiR Tactical', 'Midwest'], airsoftjunkiez: ['Airsoft Junkiez', 'Custom HPA'], usairsoft: ['US Airsoft', 'California'], novritsch: ['Novritsch', 'US store'], taiwangun: ['Taiwangun', 'Poland'], jkarmy: ['JK Army', 'Hong Kong'], eastcoastairsoft: ['East Coast Airsoft', 'Maryland'], nashvilleairsoft: ['Nashville Airsoft', 'Tennessee'],
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
  save(l) { localStorage.setItem('ad_watch', JSON.stringify(l.slice(0, 100))); badgeCount(); acct.soon(); },
  get: (g) => watch.all().find((w) => w.key === keyOf(g)),
  has: (g) => !!watch.get(g),
  add(g, extra = {}) { const l = watch.all().filter((w) => w.key !== keyOf(g)); watch.save([{ key: keyOf(g), savedAt: Date.now(), savedPrice: g.bestPrice, group: g, ...extra }, ...l]); },
  toggle(g) { if (watch.has(g)) watch.remove(keyOf(g)); else watch.add(g); },
  remove(key) { watch.save(watch.all().filter((w) => w.key !== key)); },
  update(key, patch) { watch.save(watch.all().map((w) => (w.key === key ? { ...w, ...patch } : w))); },
  setTarget(g, v) { if (!watch.has(g)) watch.add(g); watch.update(keyOf(g), { target: v > 0 ? +(+v).toFixed(2) : null }); },
};
// Lightweight free account: a random key kept in this browser (no password). The watchlist lives here in
// localStorage; it's copied to the server only when you set a target price or add an email, so alerts can run.
const acct = {
  key() {
    let k = localStorage.getItem('ad_acct');
    if (!k) { const a = crypto.getRandomValues(new Uint8Array(18)); k = btoa(String.fromCharCode(...a)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); localStorage.setItem('ad_acct', k); }
    return k;
  },
  email: () => localStorage.getItem('ad_email') || '',
  state: (() => { try { return JSON.parse(localStorage.getItem('ad_acct_state') || 'null'); } catch { return null; } })(),
  needed: () => !!acct.email() || watch.all().some((w) => w.target),
  items: () => watch.all().map((w) => ({ key: w.key, urls: w.group.offers.slice(0, 8).map((o) => o.url), title: w.group.title, brand: w.group.brand || '', offers: w.group.offers.slice(0, 12).map((o) => ({ url: o.url, storeId: o.storeId, store: o.store })), target: w.target || null, addedAt: new Date(w.savedAt).toISOString(), lastPrice: w.cur ?? w.group.bestPrice })),
  async post(path, body) {
    const r = await fetch(API + '/api/account/' + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: acct.key(), ...body }) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.error || `Server error ${r.status}`);
    return d;
  },
  keep(d) { if (d && Array.isArray(d.items)) { acct.state = d; localStorage.setItem('ad_acct_state', JSON.stringify(d)); } return d; },
  async sync(extra = {}) { if (!acct.needed() && !extra.email) return acct.state; return acct.keep(await acct.post('sync', { email: acct.email(), items: acct.items(), ...extra })); },
  soon() { clearTimeout(acct._t); acct._t = setTimeout(() => acct.sync().catch(() => {}), 1500); },
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
  // Only the page's first requests can mean Render is waking the server; later slow calls just show skeletons.
  const t = setTimeout(() => { if (performance.now() < 20000) { flagged = true; wakeBanner(true); } }, 3500);
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

// ---- "Is this a good price? Buy now or wait?" ----
// Built only from prices we actually recorded (g.h, the best price across stores per day) plus today's
// prices at the other stores. With short or flat history it says so ("tracking since <date>").
const DAY = 864e5;
function dealInfo(g) {
  const h = g.h, p = g.bestPrice, why = [];
  const days = h?.since ? Math.max(0, Math.round((Date.now() - Date.parse(h.since)) / DAY)) : 0;
  const varied = h && h.pts && h.pts.length > 1 && h.hi - h.lo >= 0.01;
  const vsStores = g.storeCount > 1 && g.belowAvgPct >= 5 ? `${g.belowAvgPct}% below the ${g.storeCount}-store average of ${money(g.avgPrice)}` : null;
  const sale = (g.offers[0]?.discountPct || 0) >= 10 ? `${g.offers[0].discountPct}% off ${esc(g.offers[0].store)}'s regular price` : null;
  let level, label;
  if (varied) {
    const pos = (p - h.lo) / (h.hi - h.lo);
    if (p <= h.lo + 0.009) { level = 'low'; label = 'Historical low'; why.push(`The lowest price we've recorded since ${fmtDate(h.since)}`); }
    else if (p >= h.avg * 1.04 || pos >= 0.75) { level = 'high'; label = 'Higher than usual'; why.push(`${Math.max(1, Math.round((p / h.avg - 1) * 100))}% above its ${money(h.avg)} average; it has been as low as ${money(h.lo)}`); }
    else { level = 'avg'; label = 'Near average'; why.push(`Close to its ${money(h.avg)} average (range ${money(h.lo)} – ${money(h.hi)})`); }
  } else {
    level = 'new'; label = h?.since ? `Tracking since ${fmtDate(h.since)}` : 'New to tracking';
    why.push(h?.since ? `Same price since we started tracking on ${fmtDate(h.since)}, so it's too early to call a low` : 'No price history yet');
  }
  if (h?.chg < 0) why.push(`Dropped ${money(-h.chg)} (${Math.abs(h.pct)}%) on ${fmtDate(h.at)}`);
  else if (h?.chg > 0) why.push(`Went up ${money(h.chg)} on ${fmtDate(h.at)}`);
  if (vsStores) why.push(vsStores);
  if (sale) why.push(sale);
  let rec = level === 'low' ? 'buy' : level === 'high' ? 'wait' : vsStores || sale || h?.chg < 0 ? 'buy' : 'fair';
  if (h?.chg > 0 && level !== 'low') rec = 'wait';
  if (g.inStock === false) { rec = 'oos'; why.unshift('Out of stock at every store we check; track it to hear when the price is right'); }
  const recLabel = { buy: 'Buy now', wait: 'Wait', fair: 'Fair price', oos: 'Out of stock' }[rec];
  const recSub = { buy: level === 'low' ? 'Lowest we have seen' : 'Good price right now', wait: 'Likely to come down', fair: 'Buy if you need it now', oos: 'Set a target and track it' }[rec];
  return { level, label, rec, recLabel, recSub, why, days, since: h?.since };
}
const dealQ = (g, want) => { const d = dealInfo(g); return want === 'low' ? d.level === 'low' : d.rec === 'buy'; };
const indPill = (d) => `<span class="ind ind-${d.level}">${d.level === 'low' ? '★ ' : ''}${esc(d.label)}</span>`;
function meterHtml(g) {
  const h = g.h; if (!h || !(h.hi - h.lo >= 0.01)) return '';
  const P = (v) => Math.max(0, Math.min(100, ((v - h.lo) / (h.hi - h.lo)) * 100)).toFixed(1);
  return `<div class="meter" aria-label="Today ${money(g.bestPrice)} within the recorded range ${money(h.lo)} to ${money(h.hi)}"><div class="m-bar"><i class="m-avg" style="left:${P(h.avg)}%" title="Average ${money(h.avg)}"></i><b class="m-now" style="left:${P(g.bestPrice)}%"></b></div><div class="m-l"><span>Low ${money(h.lo)}</span><span>Avg ${money(h.avg)}</span><span>High ${money(h.hi)}</span></div></div>`;
}

// ---- multi-store price chart (custom SVG, no chart library) ----
const PALETTE = ['#b69cff', '#3ee0a1', '#ffd166', '#5ac8fa', '#ff7a8a', '#f79bd3', '#9ae66e', '#ffa65c', '#7aa2ff', '#e8e3ff'];
const RANGES = [['1M', 30], ['3M', 90], ['1Y', 365], ['All', 0]];
const seriesOf = (g) => g.offers.filter((o) => o.h?.pts?.length).slice(0, 10).map((o, i) => ({ id: o.url, store: o.store, sid: o.storeId, tag: o.storeId === 'umarex' ? 'Official store' : (STORE_INFO[o.storeId]?.[1] || ''), now: o.price, pts: o.h.pts, color: PALETTE[i % PALETTE.length] }));
function chartModel(series, range, W = 680) {
  const t = todayStr(), first = series.map((s) => s.pts[0][0]).sort()[0] || t;
  let start = range ? new Date(Date.now() - range * DAY).toLocaleDateString('en-CA') : first;
  if (start < first) start = first; // never draw before tracking began
  const lines = series.map((s) => {
    const out = []; let before = null;
    for (const p of s.pts) { if (p[0] < start) before = p; else out.push(p); }
    if (before && (!out.length || out[0][0] > start)) out.unshift([start, before[1]]);
    if (out.length && out[out.length - 1][0] < t) out.push([t, s.now ?? out[out.length - 1][1]]);
    return { ...s, c: out };
  }).filter((s) => s.c.length);
  const H = Math.round(Math.max(200, Math.min(270, W * 0.34))), pad = [14, 14, 28, 60];
  let x0 = Date.parse(start), x1 = Date.parse(t); if (x1 - x0 < DAY) x0 = x1 - DAY;
  const vals = lines.flatMap((s) => s.c.map((p) => p[1]));
  let lo = Math.min(...vals), hi = Math.max(...vals);
  if (hi - lo < 0.01) { lo -= Math.max(1, lo * 0.02); hi += Math.max(1, hi * 0.02); } else { const m = (hi - lo) * 0.08; lo -= m; hi += m; }
  const X = (d) => pad[3] + ((Date.parse(d) - x0) / (x1 - x0)) * (W - pad[3] - pad[1]);
  const Y = (v) => pad[0] + (1 - (v - lo) / (hi - lo)) * (H - pad[0] - pad[2]);
  return { lines, W, H, pad, x0, x1, lo, hi, X, Y, start };
}
function chartSvg(m, avg) {
  const { W, H, pad, X, Y, lo, hi, lines } = m;
  if (!lines.length) return '<p class="hist-note">Pick at least one store to draw.</p>';
  const ys = [0, 1, 2, 3].map((i) => lo + ((hi - lo) * (i + 0.5)) / 4);
  const mid = new Date((m.x0 + m.x1) / 2).toISOString().slice(0, 10);
  const step = (c) => c.map(([d, v], i) => (i ? `H${X(d).toFixed(1)}V${Y(v).toFixed(1)}` : `M${X(d).toFixed(1)} ${Y(v).toFixed(1)}`)).join('');
  return `<svg class="chart mchart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Price by store from ${fmtDate(m.start)} to today">
    ${ys.map((v) => `<line class="grid-l" x1="${pad[3]}" x2="${W - pad[1]}" y1="${Y(v).toFixed(1)}" y2="${Y(v).toFixed(1)}"/><text class="lbl" x="${pad[3] - 8}" y="${(Y(v) + 4).toFixed(1)}" text-anchor="end">${money(v)}</text>`).join('')}
    ${avg > lo && avg < hi ? `<line class="avg" x1="${pad[3]}" x2="${W - pad[1]}" y1="${Y(avg).toFixed(1)}" y2="${Y(avg).toFixed(1)}"/><text class="lbl avg-l" x="${W - pad[1]}" y="${(Y(avg) - 5).toFixed(1)}" text-anchor="end">avg best ${money(avg)}</text>` : ''}
    ${lines.map((s) => `<path d="${step(s.c)}" fill="none" stroke="${s.color}" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round" opacity=".95"/>${s.c.filter((p, i) => i < s.c.length - 1 && s.pts.some((q) => q[0] === p[0])).map(([d, v]) => `<circle cx="${X(d).toFixed(1)}" cy="${Y(v).toFixed(1)}" r="2.6" fill="${s.color}"/>`).join('')}`).join('')}
    <line class="xh" id="xh" x1="0" x2="0" y1="${pad[0]}" y2="${H - pad[2]}" visibility="hidden"/>
    <text class="lbl" x="${pad[3]}" y="${H - 8}">${fmtDate(m.start)}</text>${m.x1 - m.x0 >= 6 * DAY ? `<text class="lbl" x="${X(mid).toFixed(1)}" y="${H - 8}" text-anchor="middle">${fmtDate(mid)}</text>` : ''}<text class="lbl" x="${W - pad[1]}" y="${H - 8}" text-anchor="end">Today</text>
    <rect class="hit" x="${pad[3]}" y="0" width="${W - pad[3] - pad[1]}" height="${H}" fill="transparent"/>
  </svg>`;
}
function chartPanel(g) {
  const series = seriesOf(g), h = g.h;
  if (!series.length || !h) return '';
  return `<section class="panel hist" aria-label="Price history" id="histPanel">
    <div class="hist-top"><div class="ranges" role="tablist" aria-label="Range">${RANGES.map(([l, d]) => `<button type="button" role="tab" class="rg ${d === 90 ? 'on' : ''}" data-d="${d}" aria-selected="${d === 90}">${l}</button>`).join('')}</div>
      <span class="fresh">Tracking since ${fmtDate(h.since)}${h.since ? ` · ${Math.max(1, Math.round((Date.now() - Date.parse(h.since)) / DAY))} day${Math.round((Date.now() - Date.parse(h.since)) / DAY) === 1 ? '' : 's'}` : ''}</span></div>
    <div class="chartbox" id="chartBox"></div>
    <div class="legend" id="legend">${series.map((s) => `<button type="button" class="lg on" data-id="${esc(s.id)}" aria-pressed="true"><i style="background:${s.color}"></i><span>${esc(s.store)}${s.tag ? ` <small>${esc(s.tag)}</small>` : ''}</span><b>${money(s.now)}</b></button>`).join('')}</div>
    <div class="hstats"><div class="kv"><small>Now</small><b>${money(g.bestPrice)}</b></div><div class="kv"><small>Lowest</small><b class="dn">${money(h.lo)}</b></div><div class="kv"><small>Highest</small><b class="up">${money(h.hi)}</b></div><div class="kv"><small>Average</small><b>${money(h.avg)}</b></div></div>
    <p class="hist-note">Best price across stores, recorded daily since ${fmtDate(h.since)}. ${h.pts.length < 3 ? 'Longer ranges fill in as history builds; we never back-fill prices we did not see.' : 'Tap or hover the chart for prices on a day.'} New prices only; used and marketplace listings have no history.</p>
  </section>`;
}
function bindChart(g) {
  const box = $('#chartBox'); if (!box) return;
  const series = seriesOf(g), hidden = new Set();
  let range = 90, m;
  const draw = () => {
    m = chartModel(series.filter((s) => !hidden.has(s.id)), range, Math.max(300, Math.round(box.clientWidth || 680)));
    box.innerHTML = chartSvg(m, g.h.avg) + '<div class="tip" id="tip" hidden></div>';
    const svg = $('svg', box), tip = $('#tip'), xh = $('#xh');
    if (!svg) return;
    const at = (e) => {
      const r = svg.getBoundingClientRect(), sx = ((e.clientX - r.left) / r.width) * m.W;
      const ts = m.x0 + ((sx - m.pad[3]) / (m.W - m.pad[3] - m.pad[1])) * (m.x1 - m.x0);
      const d = new Date(Math.max(m.x0, Math.min(m.x1, ts))).toISOString().slice(0, 10);
      const rows = m.lines.map((s) => { let v = null; for (const p of s.c) if (p[0] <= d) v = p[1]; return [s, v]; }).filter(([, v]) => v != null).sort((a, b) => a[1] - b[1]);
      if (!rows.length) return;
      const x = m.X(d); xh.setAttribute('x1', x); xh.setAttribute('x2', x); xh.setAttribute('visibility', 'visible');
      tip.innerHTML = `<b>${fmtDate(d)}</b>${rows.slice(0, 4).map(([s, v]) => `<div><i style="background:${s.color}"></i><em>${esc(s.store)}</em><span>${money(v)}</span></div>`).join('')}${rows.length > 4 ? `<div class="more">+${rows.length - 4} more</div>` : ''}`;
      tip.hidden = false;
      const px = (x / m.W) * r.width; tip.style.left = (px > r.width / 2 ? Math.max(0, px - tip.offsetWidth - 12) : Math.min(px + 12, r.width - tip.offsetWidth)) + 'px';
    };
    svg.addEventListener('pointermove', at); svg.addEventListener('pointerdown', at);
    svg.addEventListener('pointerleave', () => { tip.hidden = true; xh.setAttribute('visibility', 'hidden'); });
  };
  $$('#histPanel .rg').forEach((b) => b.addEventListener('click', () => { range = +b.dataset.d; $$('#histPanel .rg').forEach((x) => { x.classList.toggle('on', x === b); x.setAttribute('aria-selected', x === b); }); draw(); }));
  $$('#legend .lg').forEach((b) => b.addEventListener('click', () => { const id = b.dataset.id; hidden.has(id) ? hidden.delete(id) : hidden.add(id); b.classList.toggle('on', !hidden.has(id)); b.setAttribute('aria-pressed', !hidden.has(id)); draw(); }));
  draw();
}

// ---- cards ----
const PAGE = 36;
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
    <div class="pimg">${imgHtml(g.images, g.cat, `${load} decoding="async" width="300" height="300" alt=""`, '(max-width: 760px) 46vw, 240px')}<div class="tags">${tags.map(tagHtml).join('')}</div><button type="button" class="askg" data-ask="${g.id}" aria-label="Ask Grok if ${esc(g.title)} is a good buy">${ic('i-spark')}<span>Ask Grok</span></button></div>
    <div class="pbody">
      ${g.brand || g.score ? `<div class="prow1">${g.brand ? `<div class="brandline">${esc(g.brand)}</div>` : '<span></span>'}${scoreBadge(g)}</div>` : ''}
      <div class="ptitle">${esc(g.title)}</div>
      <div class="pprice">${priceHtml(g.bestPrice)}${g.listPrice ? `<s>${money(g.listPrice)}</s><span class="pct">-${g.discountPct}%</span>` : ''}</div>
      <div class="trend">${trendHtml(g.h)}${sparkline(g.h)}</div>
      <div class="pmeta"><span>${g.storeCount > 1 ? `from ${g.storeCount} stores` : esc(g.bestStore)}</span>${stock}</div>
    </div></div>`;
}
function bindCards(root, from) {
  $$('.pcard[data-id]', root).forEach((el) => {
    if (el._b) return; el._b = 1;
    const go = () => { S.lastList = from || location.hash || '#/'; location.hash = '#/p/' + el.dataset.id; };
    el.addEventListener('click', (e) => { if (!e.target.closest('[data-ask]')) go(); });
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
const SORTS = [['featured', 'Featured'], ['score', 'Highest score'], ['price', 'Price: low to high'], ['price-desc', 'Price: high to low'], ['drop', 'Biggest price drop'], ['discount', 'Biggest discount'], ['stores', 'Most stores']];
const sorters = {
  price: (a, b) => a.bestPrice - b.bestPrice,
  'price-desc': (a, b) => b.bestPrice - a.bestPrice,
  drop: (a, b) => (a.h?.chg < 0 ? a.h.pct : 0) - (b.h?.chg < 0 ? b.h.pct : 0) || b.maxDiscountPct - a.maxDiscountPct,
  discount: (a, b) => (b.maxDiscountPct || 0) - (a.maxDiscountPct || 0) || b.belowAvgPct - a.belowAvgPct,
  stores: (a, b) => b.storeCount - a.storeCount || a.bestPrice - b.bestPrice,
  score: (a, b) => (b.score?.s || 0) - (a.score?.s || 0) || (b.score?.k === 'ai') - (a.score?.k === 'ai') || a.bestPrice - b.bestPrice,
};
const newF = (preset = {}) => ({ sort: 'featured', cats: new Set(), stores: new Set(), brands: new Set(), min: '', max: '', disc: 0, score: 0, dq: '', instock: false, free: false, drops: false, ...preset });
function applyF(gs, F, skip) {
  return gs.filter((g) => (skip === 'cats' || !F.cats.size || F.cats.has(g.cat))
    && (skip === 'stores' || !F.stores.size || g.offers.some((o) => F.stores.has(o.storeId)))
    && (skip === 'brands' || !F.brands.size || F.brands.has(g.brand || ''))
    && (F.min === '' || g.bestPrice >= +F.min) && (F.max === '' || g.bestPrice <= +F.max)
    && (!F.disc || (g.maxDiscountPct || 0) >= F.disc) && (!F.score || (g.score?.s || 0) >= F.score)
    && (!F.dq || dealQ(g, F.dq))
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
      <div class="fgroup"><h3>Score</h3>${[[0, 'Any'], [6, '6/10 or better'], [7, '7/10 or better'], [8, '8/10 or better']].map(([v, l]) => `<label class="fopt"><input type="radio" name="score" data-f="score" value="${v}" ${F.score === v ? 'checked' : ''}><span>${l}</span></label>`).join('')}<p class="fnote">Scores are estimates unless marked AI.</p></div>
      <div class="fgroup"><h3>Deal quality</h3>${[['', 'Any'], ['good', 'Good deals (buy now)'], ['low', 'Historical lows only']].map(([v, l]) => `<label class="fopt"><input type="radio" name="dq" data-f="dq" value="${v}" ${F.dq === v ? 'checked' : ''}><span>${l}</span></label>`).join('')}<p class="fnote">From our price history and the other stores' prices.</p></div>
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
    if (F.score) chips.push(['score', '', `Score ${F.score}+`]);
    if (F.dq) chips.push(['dq', '', F.dq === 'low' ? 'Historical lows' : 'Good deals']);
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
    // Long lists render in pages of 36 cards; the next page is added as you scroll near the end.
    const grid = $('#grid', target);
    if (grid._io) grid._io.disconnect();
    grid.innerHTML = gs.length ? `<div class="grid">${gs.slice(0, PAGE).map((g, i) => card(g, i)).join('')}</div>` : (empty && !data.groups.length ? empty : `<div class="empty">${ic('i-search')}<h2>No matches</h2><p>Try fewer filters or a broader search.</p></div>`);
    bindCards(grid);
    let shown = Math.min(PAGE, gs.length);
    if (shown < gs.length && 'IntersectionObserver' in window) {
      const sent = document.createElement('div'); sent.className = 'grid-sentinel'; grid.appendChild(sent);
      grid._io = new IntersectionObserver((ents) => {
        if (!ents.some((e) => e.isIntersecting)) return;
        const tmp = document.createElement('div');
        tmp.innerHTML = gs.slice(shown, shown + PAGE).map((g, i) => card(g, shown + i)).join('');
        bindCards(tmp);
        $('.grid', grid).append(...tmp.children);
        shown += PAGE;
        if (shown >= gs.length) { grid._io.disconnect(); sent.remove(); }
      }, { rootMargin: '900px 0px' });
      grid._io.observe(sent);
    } else if (shown < gs.length) { grid.querySelector('.grid').insertAdjacentHTML('beforeend', gs.slice(shown).map((g, i) => card(g, shown + i)).join('')); bindCards(grid); }
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
    else if (f === 'score') F.score = +el.value;
    else if (f === 'dq') F.dq = el.value;
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
    if (F[f] instanceof Set) F[f].delete(b.dataset.v); else if (f === 'price') { F.min = ''; F.max = ''; } else if (f === 'disc') F.disc = 0; else if (f === 'score') F.score = 0; else if (f === 'dq') F.dq = ''; else F[f] = false;
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
    liveStart('q=' + encodeURIComponent(q), '/api/search?q=' + encodeURIComponent(q));
  } catch (e) { if (!$('#grid')) errorView(e); }
}

async function browsePage(cat) {
  setQ('', cat);
  view(`${crumbs([['Home', '#/'], [CATS[cat] || cat]])}${skCards()}`);
  try {
    await loadLive('/api/browse?cat=' + encodeURIComponent(cat), (d) => listView(d, { crumb: [['Home', '#/'], [CATS[cat] || cat]], title: (n) => `<b>${n}</b> in <b>${esc(CATS[cat] || cat)}</b> ${freshness(d)}` }));
    liveStart('cat=' + encodeURIComponent(cat), '/api/browse?cat=' + encodeURIComponent(cat));
  } catch (e) { if (!$('#grid')) errorView(e); }
}

async function dealsPage() {
  setQ();
  view(`${crumbs([['Home', '#/'], ['Deals']])}${skCards()}`);
  try {
    let drops = cache.get('/api/drops');
    const strip = () => {
      if (!drops?.groups?.length || !$('#grid') || $('#dealDrops')) return;
      const top = [...drops.groups].filter((g) => g.h?.chg < 0).sort(sorters.drop).slice(0, 14);
      if (top.length) $('#grid').insertAdjacentHTML('beforebegin', `<div id="dealDrops"><div class="sec-h"><h2>Biggest recent drops</h2><a href="#/drops">All drops ${ic('i-right')}</a></div>${carousel('ddCar', top, 0)}</div>`);
      remember(top, drops.fetchedAt); bindCarousel($('#ddCar'), '#/deals');
    };
    api('/api/drops').then((d) => { drops = d; cache.set('/api/drops', d); strip(); }).catch(() => {});
    await loadLive('/api/deals', (d) => { S.deals = d; listView(d, { crumb: [['Home', '#/'], ["Today's deals"]], sortDefault: 'featured', title: (n) => `<b>${n}</b> deals from ${d.status.filter((s) => s.ok).length} stores ${freshness(d)}` }); strip(); });
    liveStart('', '/api/deals');
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

function productPage(id, { keepScroll = false } = {}) {
  const g = S.groups.get(id) || watch.all().map((w) => w.group).find((x) => x.id === id);
  if (!g) { location.hash = '#/'; return; }
  setQ();
  const L = S.lastList;
  const back = L.startsWith('#/search') ? [`“${decodeURIComponent((L.split('q=')[1] || '').split('&')[0])}”`, L] : L.startsWith('#/deals') ? ['Deals', L] : L.startsWith('#/drops') ? ['Price drops', L] : L.startsWith('#/c/') ? [CATS[L.slice(4)] || 'Category', L] : L.startsWith('#/watchlist') || L.startsWith('#/dashboard') ? ['Dashboard', L] : L.startsWith('#/b/') ? ['Brand', L] : null;
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
      <div class="o-mid">${stock}${ship}${o.originalPrice ? `<span>was ${money(o.originalPrice)}</span>` : ''}${o.fx ? `<span class="fx">≈ USD from ${esc(o.fx.cur)} ${Number(o.fx.price).toLocaleString('en-US')}</span>` : ''}</div>
      <div class="o-right"><div class="o-price">${badge}${money(o.price)}</div><div class="o-sub">${o.h?.chg ? trendHtml(o.h) : `View ${ic('i-ext', 'ic')}`.replace('class="ic"', 'class="ic" style="width:13px;height:13px"')}</div></div></a>`;
  };
  const d = dealInfo(g), w = watch.get(g);
  const sugg = h && h.hi - h.lo >= 0.01 && h.lo < g.bestPrice ? h.lo : Math.floor(g.bestPrice * 0.9);
  const tgtNote = (wt) => wt?.target ? `Alert set at <b>${money(wt.target)}</b>. ${acct.state?.email && acct.state?.confirmed ? `We'll email ${esc(acct.state.email)}.` : `<a href="#/dashboard">Add your email</a> to get it by email; otherwise it shows in your dashboard.`}` : 'Checked automatically a few times a day.';
  view(`${crumbs([['Home', '#/'], ...(back ? [back] : []), [g.brand || 'Product']])}
  <div class="prod2">
    <div class="p-head">
      ${g.brand ? `<a class="p-brand" href="${g.brandId ? '#/b/' + esc(g.brandId) : '#/search?q=' + encodeURIComponent(g.brand)}">${esc(g.brand)}</a>` : ''}
      <h1 class="p-title">${esc(g.title)}</h1>
      <div class="p-spec">${spec.map((s) => `<span>${esc(s)}</span>`).join('')}${g.score ? `<a class="p-score ${scoreCls(g.score.s)}" href="#vpanel" onclick="event.preventDefault();document.getElementById('vpanel').scrollIntoView({behavior:'smooth'})"><b>${g.score.s}</b>/10 <span>${g.score.k === 'ai' ? 'Grok AI score' : 'estimated score'}</span></a>` : ''}</div>
    </div>
    <section class="panel dealbox lvl-${d.level}" aria-label="Is this a good price?">
      <div class="db-top">
        <div class="db-price"><div class="lbl">BEST PRICE NOW</div>${priceHtml(g.bestPrice)}
          ${best.originalPrice ? `<div class="was"><s>${money(best.originalPrice)}</s><span class="dn">Save ${money(best.savings)} (${best.discountPct}%)</span></div>` : ''}
          <div class="at">at <b>${esc(best.store)}</b> · ${best.inStock === true ? '<span class="instock">In stock</span>' : best.inStock === false ? '<span class="oos">Out of stock</span>' : 'check stock'}${best.ship?.free ? ' · <span class="instock">Free shipping</span>' : ''}</div></div>
        <div class="rec rec-${d.rec}" role="status"><b>${d.recLabel}</b><small>${d.recSub}</small></div>
      </div>
      <div class="db-ind">${indPill(d)}${h?.chg ? trendHtml(h) : ''}</div>
      ${meterHtml(g)}
      <ul class="db-why">${d.why.map((x) => `<li>${x}</li>`).join('')}</ul>
      <div class="db-cta"><a class="btn primary" href="${esc(best.url)}" target="_blank" rel="noopener">View at ${esc(best.store)} ${ic('i-ext')}</a>
        <button class="btn secondary ${w ? 'on' : ''}" id="watchBtn" aria-pressed="${!!w}">${ic('i-heart')}<span>${w ? 'Tracking' : 'Track price'}</span></button></div>
      <form class="db-target" id="tgtForm"><label for="tgt">Alert me when it drops to</label>
        <div class="tg-row"><span aria-hidden="true">$</span><input id="tgt" inputmode="decimal" autocomplete="off" placeholder="${Number(sugg).toFixed(2)}" value="${w?.target ?? ''}"><button class="btn secondary sm" type="submit">${w?.target ? 'Update' : 'Set alert'}</button>${w?.target ? '<button class="btn secondary sm" type="button" id="tgtClear">Clear</button>' : ''}</div>
        <small id="tgtNote">${tgtNote(w)}</small></form>
      <button type="button" class="btn grok block" data-ask="${g.id}">${ic('i-spark')}<span>Ask Grok: good buy or skip?</span></button>
      <p class="note">Checked ${g.checkedAt ? ago(g.checkedAt) : 'live'}. Tax extra; confirm the variant at the store.</p>
    </section>
    <div class="gallery">
      <div class="main-img" id="mainBox">${imgHtml(g.images, g.cat, `id="mainImg" alt="${esc(g.title)}" width="600" height="600" decoding="async"`)}</div>
      ${g.images.length > 1 ? `<div class="thumbs">${g.images.map((src, i) => `<button class="thumb ${i ? '' : 'on'}" data-i="${i}" aria-label="Image ${i + 1}">${imgHtml([src], g.cat, 'alt="" loading="lazy"')}</button>`).join('')}</div>` : ''}
    </div>
    <div class="p-chart">${chartPanel(g) ? `<div class="sec-h"><h2>Price history</h2>${h.atl ? '<span class="atl">★ ALL-TIME LOW</span>' : ''}</div>${chartPanel(g)}` : ''}</div>
  </div>
  <div class="below"><div><div class="sec-h"><h2>Compare ${g.storeCount} store${g.storeCount > 1 ? 's' : ''}</h2>${multi ? `<span class="fresh">avg ${money(g.avgPrice)} · save ${money(spread)} vs highest</span>` : ''}</div>
  <div class="offers">${g.offers.map(offerRow).join('')}</div></div>
  <section class="panel vpanel" id="vpanel" aria-label="Score and reviews">${verdictSkeleton(g)}</section></div>`);
  $$('.thumb').forEach((t) => t.addEventListener('click', () => { const i = +t.dataset.i; $('#mainBox').innerHTML = imgHtml([g.images[i], ...g.images.filter((_, j) => j !== i)], g.cat, `id="mainImg" alt="${esc(g.title)}" width="600" height="600" decoding="async"`); $$('.thumb').forEach((x) => x.classList.toggle('on', x === t)); }));
  bindChart(g);
  verdictLoad(g);
  const paintW = () => { const wt = watch.get(g), b = $('#watchBtn'); b.classList.toggle('on', !!wt); b.setAttribute('aria-pressed', !!wt); b.querySelector('span').textContent = wt ? 'Tracking' : 'Track price'; $('#tgtNote').innerHTML = tgtNote(wt); };
  $('#watchBtn').addEventListener('click', () => { watch.toggle(g); if (!watch.has(g)) $('#tgt').value = ''; paintW(); });
  $('#tgtForm').addEventListener('submit', (e) => { e.preventDefault(); const v = parseFloat($('#tgt').value.replace(/[^0-9.]/g, '')); if (!(v > 0)) { $('#tgtNote').textContent = 'Enter a price, like ' + money(sugg); return; } watch.setTarget(g, v); paintW(); if (v >= g.bestPrice) $('#tgtNote').insertAdjacentHTML('beforeend', ' <span class="dn">It is already at or below that price.</span>'); });
  $('#tgtClear')?.addEventListener('click', () => { watch.setTarget(g, 0); $('#tgt').value = ''; paintW(); });
  if (!keepScroll) { window.scrollTo(0, 0); liveProduct(g); }
}

// ---- live price check on every visit ----
// The page renders saved prices first. Then /api/refresh asks the server to re-check any store not
// checked in ~15 min (one shared background cycle for everyone). While it runs we poll its status;
// when this page's results are recomputed we fetch them and update changed cards in place.
const agoS = (iso) => { if (!iso) return 'never'; const s = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 1000)); return s < 10 ? 'just now' : s < 60 ? `${s}s ago` : s < 3600 ? `${Math.round(s / 60)} min ago` : s < 86400 ? `${Math.round(s / 3600)} h ago` : `${Math.round(s / 86400)} d ago`; };
const clock = (iso) => new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
const live = { st: null, ver: 0, key: null, path: null, tok: 0, timer: null, polls: 0, changed: 0, custom: null };
const quiet = async (path, opts) => { const r = await fetch(API + path, opts); if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); };
const gKey = (g) => (String(g.brand || '') + '|' + g.title).toLowerCase().replace(/[^a-z0-9|]+/g, ' ').trim();

function liveBar() {
  const el = $('#livebar'); if (!el) return;
  if (live.custom) { el.innerHTML = live.custom; return; }
  const st = live.st;
  if (!st) { el.innerHTML = `<span class="lb-dot"></span>Showing saved prices`; return; }
  const c = st.counts, lives = st.stores.filter((x) => x.kind === 'live');
  const rl = lives.filter((x) => x.state === 'rate-limited');
  const rlTxt = rl.length ? ` · <span class="lb-warn">${rl.length} limited${(() => { const t = rl.map((x) => x.checkedAt || x.snapshotAt).filter(Boolean).sort().pop(); return t ? ` (${clock(t)})` : ''; })()}</span>` : '';
  if (st.running) {
    const checking = lives.filter((x) => x.state === 'checking').length;
    const upd = lives.length - checking;
    el.innerHTML = `<span class="spin"></span><b>${upd}</b> of ${lives.length} updated${checking ? `, checking ${checking}…` : ', finishing…'}${rlTxt}`;
  } else {
    el.innerHTML = `<span class="lb-dot ok"></span>Checked <b>${agoS(st.newest)}</b> · ${c.fresh}/${c.live} stores${live.changed ? ` · <b>${live.changed}</b> changed` : ''}${rlTxt}`;
  }
}
function detailsHtml(st) {
  const name = { ok: 'Checked', checking: 'Checking…', 'rate-limited': 'Rate-limited', error: 'No answer', pending: 'Waiting', catalog: 'Catalog' };
  // While a store is being re-checked its old time is shown greyed as "last …", never as a green "Checked".
  const when = (x) => (x.state === 'checking' ? (x.checkedAt ? `last ${agoS(x.checkedAt)}` : '') : x.checkedAt ? agoS(x.checkedAt) : x.snapshotAt ? 'saved ' + clock(x.snapshotAt) : '—');
  return `<ul>${st.stores.map((x) => `<li><span>${esc(x.name)}</span><span class="lb-s ${x.state}">${x.state === 'checking' ? '<span class="spin"></span>' : ''}${name[x.state] || esc(x.state)}</span><span class="lb-t${x.state === 'checking' ? ' old' : ''}" title="${esc(x.note || '')}">${when(x)}</span></li>`).join('')}</ul>`;
}
function liveDetails() {
  const st = live.st; if (!st) return;
  let d = $('#lbDetails');
  if (d) { d.remove(); return; }
  $('#livebar').insertAdjacentHTML('afterend', `<div class="lb-details" id="lbDetails"><div id="lbList">${detailsHtml(st)}</div><p>Stores are re-checked when you visit, at most every ${st.minIntervalMin} min each. Catalog stores (search not allowed) follow their own slower crawl schedule.</p></div>`);
}

function applyLive(d) {
  const byK = new Map(d.groups.map((g) => [gKey(g), g]));
  let changed = 0;
  $$('.pcard[data-id]').forEach((el) => {
    const old = S.groups.get(el.dataset.id); if (!old) return;
    const n = byK.get(gKey(old)); if (!n) return;
    const dir = n.bestPrice < old.bestPrice - 0.004 ? 'dn' : n.bestPrice > old.bestPrice + 0.004 ? 'up' : '';
    const same = !dir && n.inStock === old.inStock && (n.h?.chg || 0) === (old.h?.chg || 0) && n.storeCount === old.storeCount;
    old.checkedAt = d.fetchedAt;
    if (same) return;
    const id = old.id; Object.assign(old, n, { id, checkedAt: d.fetchedAt });
    const tmp = document.createElement('div'); tmp.innerHTML = card(old, 99);
    bindCards(tmp);
    const nc = tmp.firstElementChild; nc.classList.add('flash'); if (dir) nc.classList.add('flash-' + dir);
    el.replaceWith(nc);
    if (dir) changed++;
  });
  return changed;
}

async function livePoll(tok) {
  clearTimeout(live.timer);
  if (tok !== live.tok) return;
  try {
    const st = await quiet('/api/refresh/status?key=' + encodeURIComponent(live.key || ''));
    if (tok !== live.tok) return;
    live.st = st;
    if (st.version > live.ver && live.path) {
      live.ver = st.version;
      const d = await quiet(live.path);
      if (tok !== live.tok) return;
      live.changed += applyLive(d);
      if (!d.partial) cache.set(live.path, d);
    }
    liveBar();
    if ($('#lbList')) $('#lbList').innerHTML = detailsHtml(st);
    // Keep polling until the server says the cycle is really over (up to ~5 min).
    if (st.running && ++live.polls < 120) live.timer = setTimeout(() => livePoll(tok), document.hidden ? 8000 : 2500);
  } catch { if (++live.polls < 120) live.timer = setTimeout(() => livePoll(tok), 5000); }
}
// params: 'q=…' | 'cat=…' | 'brand=…' | '' (deals). path: the endpoint whose results are on screen.
async function liveStart(params, path) {
  const tok = ++live.tok; clearTimeout(live.timer);
  Object.assign(live, { path, polls: 0, changed: 0, custom: null });
  $('#lbDetails')?.remove();
  try {
    const st = await quiet('/api/refresh' + (params ? '?' + params : ''));
    if (tok !== live.tok) return;
    Object.assign(live, { st, key: st.key, ver: st.version });
    liveBar();
    if (st.running) live.timer = setTimeout(() => livePoll(tok), 2000);
  } catch { liveBar(); }
}

// Product page: re-check this product's offers directly when they're older than ~5 minutes.
async function liveProduct(g) {
  const tok = ++live.tok; clearTimeout(live.timer);
  live.path = null; $('#lbDetails')?.remove();
  const age = g.checkedAt ? Date.now() - Date.parse(g.checkedAt) : Infinity;
  if (age < 5 * 60 * 1000) { live.custom = `<span class="lb-dot ok"></span>Checked <b>${agoS(g.checkedAt)}</b> · ${g.offers.length} offer${g.offers.length === 1 ? '' : 's'}`; liveBar(); return; }
  live.custom = `<span class="spin"></span>Re-checking ${g.offers.length} offer${g.offers.length === 1 ? '' : 's'} at the stores…`; liveBar();
  let r;
  try { r = await quiet('/api/recheck', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: g.title, offers: g.offers.map((o) => ({ storeId: o.storeId, url: o.url, price: o.price })) }) }); } catch { live.custom = null; liveBar(); return; }
  if (tok !== live.tok) return;
  const changedUrls = new Set();
  let ok = 0, rl = [], cat = 0;
  for (const x of r.offers) {
    const o = g.offers.find((y) => y.url === x.url); if (!o) continue;
    if (x.state === 'ok') {
      ok++;
      if (Math.abs(x.price - o.price) >= 0.01) {
        const t = todayStr(), prev = o.price;
        o.h = { ...(o.h || { since: t, pts: [] }), prev, prevAt: o.h?.at || t, at: t, chg: +(x.price - prev).toFixed(2), pct: +(((x.price - prev) / prev) * 100).toFixed(1) };
        o.price = x.price; changedUrls.add(o.url);
      }
      o.originalPrice = x.originalPrice; if (x.inStock != null) o.inStock = x.inStock; o.checkedAt = x.checkedAt;
    } else if (x.state === 'rate-limited') rl.push(x); else if (x.state === 'catalog') cat++;
  }
  if (changedUrls.size) {
    const oldBest = g.bestPrice;
    g.offers.sort((a, b) => a.price - b.price);
    const avg = g.offers.reduce((a, o) => a + o.price, 0) / g.offers.length;
    g.offers.forEach((o) => { o.vsAvg = +(o.price - avg).toFixed(2); o.vsAvgPct = Math.round(((o.price - avg) / avg) * 100); o.discountPct = o.originalPrice > o.price ? Math.round(((o.originalPrice - o.price) / o.originalPrice) * 100) : 0; o.savings = o.originalPrice > o.price ? +(o.originalPrice - o.price).toFixed(2) : 0; });
    Object.assign(g, { bestPrice: g.offers[0].price, bestStore: g.offers[0].store, avgPrice: +avg.toFixed(2), belowAvgPct: Math.max(0, Math.round((1 - g.offers[0].price / avg) * 100)), inStock: g.offers.some((o) => o.inStock === true) ? true : g.offers.every((o) => o.inStock === false) ? false : null });
    if (Math.abs(g.bestPrice - oldBest) >= 0.01) { const t = todayStr(); g.h = { ...(g.h || { since: t, pts: [] }), prev: oldBest, prevAt: g.h?.at || t, at: t, chg: +(g.bestPrice - oldBest).toFixed(2), pct: +(((g.bestPrice - oldBest) / oldBest) * 100).toFixed(1) }; }
    const y = window.scrollY; productPage(g.id, { keepScroll: true }); window.scrollTo(0, y);
    changedUrls.forEach((u) => $$('a.offer').forEach((a) => a.getAttribute('href') === u && a.classList.add('flash')));
  }
  g.checkedAt = new Date().toISOString();
  const rlT = rl.map((x) => x.checkedAt).filter(Boolean).sort().pop();
  live.custom = `<span class="lb-dot ok"></span>${ok ? `Re-checked <b>${ok}</b> offer${ok === 1 ? '' : 's'} just now` : 'Showing saved prices'}${changedUrls.size ? ` · <b>${changedUrls.size}</b> changed` : ok ? ' · no changes' : ''}${rl.length ? ` · <span class="lb-warn">${rl.length} limited${rlT ? ` (${clock(rlT)})` : ''}</span>` : ''}${cat ? ` · ${cat} from catalog` : ''}`;
  liveBar();
}
setInterval(() => { if (!document.hidden && !live.custom) liveBar(); }, 5000);

// ---- Score /10: verdict panel (product page) + Ask Grok sheet ----
// One request per product: POST /api/verdict returns the score, sub-scores, pros/cons, common issues,
// real customer reviews (with sources) and who it's for. Without an AI key it's a labeled estimate.
const verdictCache = new Map();
function verdictBody(g, ai) {
  const h = g.h;
  return JSON.stringify({ ai: !!ai, title: g.title, brand: g.brand, cat: g.cat, platform: g.platform, bestPrice: g.bestPrice, avgPrice: g.avgPrice, offers: g.offers.map((o) => ({ store: o.store, storeId: o.storeId, url: o.url, price: o.price, originalPrice: o.originalPrice, inStock: o.inStock })), h: h ? { lo: h.lo, hi: h.hi, avg: h.avg, since: h.since, prev: h.prev, chg: h.chg, pts: h.pts } : null });
}
function fetchVerdict(g, ai = false) {
  const key = g.title + '|' + (g.brand || '') + (ai ? '|ai' : '');
  if (verdictCache.has(key)) return verdictCache.get(key);
  const req = fetch(API + '/api/verdict', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: verdictBody(g, ai) })
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error('Server error ' + r.status))));
  req.catch(() => verdictCache.delete(key));
  verdictCache.set(key, req);
  return req;
}
const SUBS = [['build', 'Build quality'], ['performance', 'Performance'], ['value', 'Value'], ['reliability', 'Reliability'], ['upgradeability', 'Upgradeability']];
const stars = (n) => `<span class="stars" aria-label="${n} out of 5 stars">${'★'.repeat(Math.round(n))}<span>${'★'.repeat(5 - Math.round(n))}</span></span>`;
// Better-rated listings at a similar price, from what this visitor has already loaded (real listings only).
function alternatives(g, v) {
  const mine = v?.score ?? g.score?.s ?? 0;
  const lo = g.bestPrice * 0.75, hi = g.bestPrice * 1.3;
  const seen = new Set([g.title.toLowerCase()]);
  return [...S.groups.values()].filter((x) => x.id !== g.id && x.cat === g.cat && x.score && x.score.s > mine && x.bestPrice >= lo && x.bestPrice <= hi && x.inStock !== false && (!g.platform || !x.platform || x.platform === g.platform))
    .sort((a, b) => b.score.s - a.score.s || a.bestPrice - b.bestPrice)
    .filter((x) => { const k = x.title.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; }).slice(0, 3);
}
function verdictSkeleton(g) {
  return `<div class="vp-head"><div class="vp-ring ${g.score ? scoreCls(g.score.s) : ''}" style="--p:${(g.score?.s || 0) * 10}"><b>${g.score ? g.score.s : '–'}</b><small>/10</small></div><div><h2 class="vp-title">Score &amp; reviews</h2><div class="gs-load"><span class="spin"></span>Checking store reviews…</div></div></div>`;
}
function verdictHtml(g, v, { compact = false } = {}) {
  const li = (a) => a.map((x) => `<li>${esc(x)}</li>`).join('');
  const sc = v.score;
  const cls = sc == null ? 'none' : scoreCls(sc);
  const R = v.reviews || { count: 0, quotes: [], sources: [], checked: [] };
  const isAI = v.kind === 'ai';
  const subs = v.sub ? SUBS.filter(([k]) => v.sub[k] != null) : [];
  const alts = compact ? [] : alternatives(g, v);
  return `<div class="vp-head"><div class="vp-ring ${cls}" style="--p:${(sc || 0) * 10}"><b>${sc ?? '–'}</b><small>/10</small></div>
      <div><div class="vp-verdict ${cls}">${esc(v.verdict)}</div><div class="gs-lbl ${isAI ? 'ai' : 'quick'}">${isAI ? ic('i-spark') : ''}${esc(v.label)}${v.cached ? ' · saved answer' : ''}</div></div></div>
    ${v.summary ? `<p class="gs-sum">${esc(v.summary)}</p>` : ''}
    ${subs.length ? `<div class="vp-subs">${subs.map(([k, l]) => `<div class="vp-sub"><span>${l}</span><div class="bar"><i class="${scoreCls(v.sub[k])}" style="width:${v.sub[k] * 10}%"></i></div><b>${v.sub[k]}</b></div>`).join('')}</div>` : ''}
    <div class="gs-pc">${v.pros?.length ? `<div><h3 class="dn">Pros</h3><ul class="pros">${li(v.pros)}</ul></div>` : ''}${v.cons?.length ? `<div><h3 class="up">Cons</h3><ul class="cons">${li(v.cons)}</ul></div>` : ''}</div>
    <h3 class="gs-sub">Customer reviews</h3>
    ${R.count ? `<div class="vp-rev-top"><span class="vp-rate">${stars(R.avg)}<b>${R.avg}/5</b></span><span class="vp-from">${R.count} review${R.count === 1 ? '' : 's'} from ${R.sources.map((s) => `<a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.store)} (${s.count})${ic('i-ext')}</a>`).join(', ')}</span></div>
      <p class="gs-sum">${esc(isAI && v.aiReviewSummary ? v.aiReviewSummary : R.text)}</p>
      ${(compact ? R.quotes.slice(0, 2) : R.quotes).map((q) => `<blockquote class="vp-q"><div>${q.rating ? stars(q.rating) : ''}${q.title ? `<b>${esc(q.title)}</b>` : ''}</div><p>“${esc(q.text)}”</p><cite>${esc(q.author || 'Customer')}${q.verified ? ' · verified buyer' : ''}${q.date ? ' · ' + fmtDate(q.date) + ' ' + q.date.slice(0, 4) : ''} · <a href="${esc(q.url)}" target="_blank" rel="noopener">${esc(q.store)}</a></cite></blockquote>`).join('')}`
    : `<p class="gs-sum muted">${esc(R.text || 'No customer reviews found.')}</p>`}
    ${R.checked?.length ? `<p class="vp-src">Checked: ${R.checked.map((c) => `${esc(c.store)} (${c.state === 'reviews' ? 'reviews' : c.state === 'none' ? 'no reviews yet' : esc(c.note || 'unavailable')})`).join(' · ')}. Reviews are the customers' own words from the store's page.</p>` : ''}
    ${v.issues?.length ? `<h3 class="gs-sub">Common issues &amp; fixes</h3><ul class="vp-issues">${v.issues.map((x) => `<li><b>${esc(x.issue)}</b><span>${esc(x.fix)}</span></li>`).join('')}</ul>${v.issuesScope ? `<p class="vp-src">${esc(v.issuesScope)}.</p>` : ''}` : ''}
    ${v.whoFor ? `<div class="gs-who"><small>Who it's for</small>${esc(v.whoFor)}</div>` : ''}
    ${v.priceTake ? `<p class="gs-sum">${esc(v.priceTake)}</p>` : ''}
    ${alts.length ? `<h3 class="gs-sub">Better-rated at a similar price</h3><div class="vp-alts">${alts.map((x) => `<a class="vp-alt" href="#/p/${x.id}"><div class="vp-alt-img">${imgHtml(x.images, x.cat, 'loading="lazy" alt="" width="56" height="56"')}</div><div><div class="ptitle">${esc(x.title)}</div><div class="vp-alt-m"><span class="sbadge ${scoreCls(x.score.s)} inline"><b>${x.score.s}</b><small>/10</small><i>${x.score.k === 'ai' ? 'AI' : 'est.'}</i></span>${money(x.bestPrice)} · ${esc(x.bestStore)}</div></div></a>`).join('')}</div>` : ''}
    ${v.aiAvailable && !isAI && !compact ? `<button type="button" class="btn grok block" data-full="${g.id}">${ic('i-spark')}<span>Get Grok's full AI analysis</span></button>` : ''}
    ${v.unsure ? `<p class="gs-unsure">Not sure about: ${esc(v.unsure)}</p>` : ''}
    <p class="gs-foot">${isAI ? `AI-generated by Grok (${esc(v.model || '')}) from the reviews and prices shown here. It can be wrong.${v.confidence ? ` Confidence: ${esc(v.confidence)}.` : ''}` : `Estimate, not AI: built from brand reputation tiers, the platform, price versus other stores and our history, and real store ratings.${v.aiAvailable ? '' : ' Full AI analysis isn\'t connected yet.'}`}</p>`;
}
function verdictLoad(g, ai = false) {
  const el = $('#vpanel'); if (!el) return;
  fetchVerdict(g, ai).then((v) => {
    if (!el.isConnected) return;
    el.innerHTML = verdictHtml(g, v);
    bindCards(el);
  }).catch((e) => { if (el.isConnected) el.innerHTML = `<div class="empty sm">Couldn't load the score right now (${esc(e.message)}).</div>`; });
}
document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-full]'); if (!b) return;
  const g = S.groups.get(b.dataset.full); if (!g) return;
  b.disabled = true; b.querySelector('span').textContent = 'Grok is analyzing…';
  if (b.closest('#vpanel')) verdictLoad(g, true); else askSheet(g, true);
});

function askSheet(g, ai = true) {
  let sh = $('#gsheet');
  if (!sh) {
    document.body.insertAdjacentHTML('beforeend', `<div class="gscrim" id="gscrim"></div><section class="gsheet" id="gsheet" role="dialog" aria-modal="true" aria-labelledby="gsTitle"><div class="gs-h"><h2 id="gsTitle">${ic('i-spark')}Ask Grok · score /10</h2><button type="button" id="gsClose" aria-label="Close">${ic('i-x')}</button></div><div class="gs-b" id="gsBody"></div></section>`);
    sh = $('#gsheet');
    const close = () => { sh.classList.remove('open'); $('#gscrim').classList.remove('on'); document.body.style.overflow = ''; };
    $('#gsClose').onclick = $('#gscrim').onclick = close;
    document.addEventListener('keydown', (e) => e.key === 'Escape' && sh.classList.contains('open') && close());
    window.addEventListener('hashchange', close);
  }
  const body = $('#gsBody');
  const h = g.h;
  const priceBox = `<h3 class="gs-sub">Price check</h3><div class="gs-price">
      <div class="kv"><small>Best now</small><b>${money(g.bestPrice)}</b><span>${esc(g.bestStore)}</span></div>
      ${g.storeCount > 1 ? `<div class="kv"><small>Store average</small><b>${money(g.avgPrice)}</b><span>${g.storeCount} stores</span></div>` : ''}
      ${h ? `<div class="kv"><small>Lowest tracked</small><b class="dn">${money(h.lo)}</b><span>since ${fmtDate(h.since)}</span></div><div class="kv"><small>Trend</small><b>${h.chg ? (h.chg < 0 ? '<span class="dn">▼ ' : '<span class="up">▲ ') + money(Math.abs(h.chg)) + '</span>' : 'Flat'}</b><span>${h.pts.length} price point${h.pts.length === 1 ? '' : 's'}</span></div>` : ''}
    </div>`;
  const head = `<div class="gs-prod">${imgHtml(g.images, g.cat, 'alt="" width="64" height="64"')}<div><div class="brandline">${esc(g.brand || '')}</div><div class="gs-t">${esc(g.title)}</div></div></div>`;
  body.innerHTML = head + `<div class="gs-load"><span class="spin"></span>Grok is sizing this up…</div>` + priceBox;
  sh.classList.add('open'); $('#gscrim').classList.add('on'); document.body.style.overflow = 'hidden'; $('#gsClose').focus();
  fetchVerdict(g, ai).then((v) => {
    if (!sh.classList.contains('open')) return;
    body.innerHTML = head + verdictHtml(g, v, { compact: true }) + priceBox + `<a class="btn secondary block" href="#/p/${g.id}">Full breakdown on the product page</a>`;
  }).catch((e) => { if (sh.classList.contains('open')) body.innerHTML = head + `<div class="empty sm">Couldn't get a verdict right now (${esc(e.message)}). Try again in a moment.</div>` + priceBox; });
}
document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-ask]'); if (!b) return;
  e.preventDefault(); e.stopPropagation();
  const g = S.groups.get(b.dataset.ask) || watch.all().map((w) => w.group).find((x) => x.id === b.dataset.ask);
  if (g) askSheet(g);
}, true);

const STORE_N = 24;
const POPULAR = ['Tokyo Marui', 'Glock', 'Hi-Capa', 'M4 AEG', 'Gas blowback', 'HPA', 'Sniper rifle', 'Plate carrier', '0.28g BBs'];
async function homePage() {
  setQ();
  view(`<section class="hero"><h1>Is it a <em>good price?</em> Know before you buy.</h1>
      <p>Live airsoft prices from ${STORE_N} trusted stores, price history, and a clear buy-now-or-wait call.</p>
      <form class="hsearch" id="heroForm" role="search"><label class="sr" for="heroQ">Search airsoft gear</label><input id="heroQ" type="search" enterkeyhint="search" autocomplete="off" placeholder="Search a gun, brand or part"><button class="btn primary" type="submit">${ic('i-search')}<span>Check price</span></button></form>
      <div class="hlinks"><a href="#/import">${ic('i-upload')}Import a wishlist</a><a href="#/dashboard">${ic('i-heart')}Your tracked items & alerts</a></div>
      <div class="stats" id="stats"><span class="stat"><span class="dot"></span><b>${STORE_N}</b> stores live</span></div></section>
    <div class="sec-h"><h2>Top price drops</h2><a href="#/drops">See all ${ic('i-right')}</a></div><div id="homeDrops"><div class="car"><div class="car-track">${'<div class="sk card"></div>'.repeat(5)}</div></div></div>
    <div class="sec-h"><h2>Highlighted deals</h2><a href="#/deals">See all ${ic('i-right')}</a></div><div id="homeDeals"><div class="car"><div class="car-track">${'<div class="sk card"></div>'.repeat(5)}</div></div></div>
    <div class="sec-h"><h2>Popular products</h2><span class="fresh">compared across the most stores</span></div><div id="homePop"><div class="car"><div class="car-track">${'<div class="sk card"></div>'.repeat(5)}</div></div></div>
    <nav class="tiles" aria-label="Categories">${CAT_ORDER.map((c) => `<a class="tile" href="#/c/${c}">${ic('c-' + c)}<span>${CATS[c]}</span></a>`).join('')}</nav>
    <div class="sec-h"><h2>Shop by brand</h2><a href="#/brands">All brands ${ic('i-right')}</a></div><div class="chips brandchips" id="homeBrands">${'<span class="chip sk" style="width:96px"></span>'.repeat(8)}</div>
    <div class="sec-h"><h2>Popular searches</h2></div><div class="chips">${POPULAR.map((c) => `<a class="chip" href="#/search?q=${encodeURIComponent(c)}">${esc(c)}</a>`).join('')}</div>`);
  const tok = ++navToken;
  const deals = (d) => {
    if (tok !== navToken || !$('#homeDeals')) return;
    S.deals = d; remember(d.groups, d.fetchedAt);
    const per = {}, pick = [];
    for (const g of d.groups) { const s = g.offers[0].storeId; if ((per[s] = (per[s] || 0) + 1) <= 2) pick.push(g); }
    $('#homeDeals').innerHTML = carousel('dealsCar', pick.slice(0, 16), 10);
    bindCarousel($('#dealsCar'), '#/deals');
  };
  const drops = (d) => {
    if (tok !== navToken || !$('#homeDrops')) return;
    remember(d.groups, d.fetchedAt);
    const hm = d.history || {};
    if (hm.tracked) $('#stats').innerHTML = `<span class="stat"><span class="dot"></span><b>${STORE_N}</b> stores live</span><span class="stat"><b>${hm.tracked.toLocaleString()}</b> prices tracked</span>${hm.updated ? `<span class="stat opt">History updated ${ago(hm.updated)}</span>` : ''}`;
    $('#homeDrops').innerHTML = d.groups.length ? carousel('dropsCar', [...d.groups].sort(sorters.drop).slice(0, 16), 0) : dropsEmpty(hm).replace('class="empty panel"', 'class="empty panel sm"');
    bindCarousel($('#dropsCar'), '#/drops');
  };
  $('#heroForm').addEventListener('submit', (e) => { e.preventDefault(); const q = $('#heroQ').value; qEl.value = q; go(q); });
  const pop = (d) => { if (tok !== navToken || !$('#homePop')) return; remember(d.groups, d.fetchedAt); $('#homePop').innerHTML = d.groups.length ? carousel('popCar', d.groups.slice(0, 16), 20) : '<div class="empty sm"><p>Popular products appear once stores load.</p></div>'; bindCarousel($('#popCar'), '#/'); };
  const c4 = cache.get('/api/popular'); if (c4) pop(c4);
  api('/api/popular').then((d) => { pop(d); cache.set('/api/popular', d); }).catch(() => {});
  const c1 = cache.get('/api/deals?top=1'), c2 = cache.get('/api/drops');
  if (c1) deals(c1); if (c2) drops(c2);
  liveStart('', '/api/deals?top=1');
  api('/api/deals?top=1').then((d) => { deals(d); if (!d.partial) cache.set('/api/deals?top=1', d); }).catch((e) => { if (!c1 && $('#homeDeals')) $('#homeDeals').innerHTML = `<div class="empty sm"><p>${esc(e.message)}</p></div>`; });
  api('/api/drops').then((d) => { drops(d); cache.set('/api/drops', d); }).catch(() => {});
  const brandsHome = (d) => { if (tok !== navToken || !$('#homeBrands')) return; $('#homeBrands').innerHTML = d.brands.slice(0, 18).map((b) => `<a class="chip" href="#/b/${esc(b.id)}">${esc(b.name)}</a>`).join('') || '<span class="fresh">Brands appear as stores load.</span>'; };
  const c3 = cache.get('/api/brands'); if (c3) brandsHome(c3);
  api('/api/brands').then((d) => { brandsHome(d); cache.set('/api/brands', d); }).catch(() => {});
}

// ---- brands ----
async function brandsPage() {
  setQ();
  view(crumbs([['Home', '#/'], ['Brands']]) + `<div class="brandgrid">${'<div class="sk" style="height:56px"></div>'.repeat(18)}</div>`);
  try {
    const d = await api('/api/brands');
    cache.set('/api/brands', d);
    const groups = {};
    for (const b of [...d.brands].sort((a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }))) (groups[/[a-z]/i.test(b.name[0]) ? b.name[0].toUpperCase() : '#'] ||= []).push(b);
    view(crumbs([['Home', '#/'], ['Brands']]) + `<div class="rhead"><div class="rcount"><b>${d.brands.length}</b> brands with live airsoft listings</div></div>
      ${Object.entries(groups).map(([k, l]) => `<section class="bsec"><h2 class="bletter">${esc(k)}</h2><div class="brandgrid">${l.map((b) => `<a class="bcard" href="#/b/${esc(b.id)}"><b>${esc(b.name)}</b><small>${b.count.toLocaleString()} listing${b.count === 1 ? '' : 's'}</small></a>`).join('')}</div></section>`).join('')}`);
  } catch (e) { errorView(e); }
}
async function brandPage(id) {
  setQ();
  const known = (cache.get('/api/brands')?.brands || []).find((b) => b.id === id);
  const label = known?.name || 'Brand';
  view(`${crumbs([['Home', '#/'], ['Brands', '#/brands'], [label]])}${skCards()}`);
  try {
    await loadLive('/api/brand?id=' + encodeURIComponent(id), (d) => listView(d, { crumb: [['Home', '#/'], ['Brands', '#/brands'], [d.brand.name]], title: (n) => `<b>${n}</b> from <b>${esc(d.brand.name)}</b> ${freshness(d)}` }));
    liveStart('brand=' + encodeURIComponent(id), '/api/brand?id=' + encodeURIComponent(id));
  } catch (e) { if (!$('#grid')) errorView(e); }
}

// ---- dashboard: tracked items, target prices, alerts, email ----
const rowPrice = (w) => w.cur ?? w.group.bestPrice;
function dashboardPage() {
  setQ();
  const l = watch.all();
  l.forEach((w) => S.groups.set(w.group.id, w.group));
  const st = acct.state, email = acct.email();
  const srv = new Map((st?.items || []).map((x) => [x.key, x]));
  const events = [...(st?.events || [])].reverse();
  const hit = l.filter((w) => w.target && rowPrice(w) <= w.target).length;
  const emailStatus = !email ? 'Add an email to get target-price alerts by email. No password; we send one confirmation link.'
    : st?.email === email && st.confirmed ? `<span class="instock">● Confirmed</span> · alerts go to <b>${esc(email)}</b>`
    : `<span class="wait-t">● Waiting for confirmation</span> · open the link we sent to <b>${esc(email)}</b>`;
  const server = st ? `${st.storage === 'postgres' ? 'Saved in the database' : 'Saved on the price server (it can reset on restarts; your list here is the backup and re-syncs on each visit)'}${st.emailConnected === false ? ' · email sending isn’t connected yet, so alerts show here only' : ''}` : 'Saved in this browser only';
  view(crumbs([['Home', '#/'], ['Dashboard']]) + `
    <div class="dash-top">
      <div class="kv"><small>Tracked</small><b>${l.length}</b></div><div class="kv"><small>With target</small><b>${l.filter((w) => w.target).length}</b></div><div class="kv"><small>Target reached</small><b class="${hit ? 'dn' : ''}">${hit}</b></div><div class="kv"><small>Alerts sent</small><b>${events.length}</b></div>
    </div>
    <section class="panel dash-email"><h2>Email alerts</h2>
      <form id="emailForm" class="tg-row"><label class="sr" for="em">Email</label><input id="em" type="email" autocomplete="email" placeholder="you@example.com" value="${esc(email)}"><button class="btn primary sm" type="submit">${email ? 'Update' : 'Save'}</button>${email ? '<button class="btn secondary sm" type="button" id="emOff">Remove</button>' : ''}</form>
      <p class="fnote" id="emNote">${emailStatus}</p><p class="fnote">${server}.</p></section>
    <div class="sec-h"><h2>Tracked items</h2><div class="dash-act"><a class="btn secondary sm" href="#/import">${ic('i-upload')}Import wishlist</a>${l.length ? `<button class="btn secondary sm" id="dashCheck">${ic('i-refresh')}Check prices now</button>` : ''}</div></div>
    ${l.length ? `<div class="dash-list" id="dl">${l.map((w) => {
      const g = w.group, cur = rowPrice(w), sv = srv.get(w.key), d = cur - w.savedPrice;
      const reached = w.target && cur <= w.target;
      return `<div class="drow" data-k="${esc(w.key)}">
        <a class="d-img" href="#/p/${esc(g.id)}">${imgHtml(g.images || [], g.cat, 'alt="" loading="lazy" width="64" height="64"')}</a>
        <div class="d-main"><a class="d-title" href="#/p/${esc(g.id)}">${esc(g.title)}</a>
          <div class="d-meta">${indPill(dealInfo(g))}<span>Saved ${fmtDate(new Date(w.savedAt).toLocaleDateString('en-CA'))} at ${money(w.savedPrice)}</span>${w.curAt || sv?.checkedAt ? `<span>checked ${ago(w.curAt || sv.checkedAt)}</span>` : ''}</div></div>
        <div class="d-price"><b>${money(cur)}</b>${Math.abs(d) >= 0.01 ? `<span class="arrow ${d < 0 ? 'dn' : 'up'}">${d < 0 ? '▼' : '▲'} ${money(Math.abs(d))}</span>` : '<span class="flat">no change</span>'}</div>
        <form class="d-tgt"><label class="sr" for="t-${esc(g.id)}">Target price</label><span>$</span><input id="t-${esc(g.id)}" inputmode="decimal" placeholder="target" value="${w.target ?? ''}"><button class="btn secondary sm" type="submit">Set</button></form>
        <div class="d-st">${reached ? '<span class="ind ind-low">Target reached</span>' : w.target ? `<span class="fresh">${money(cur - w.target)} to go</span>` : '<span class="fresh">No target</span>'}</div>
        <button class="d-rm" type="button" aria-label="Stop tracking ${esc(g.title)}">${ic('i-x')}</button></div>`;
    }).join('')}</div>` : `<div class="empty panel">${ic('i-heart')}<h2>Nothing tracked yet</h2><p>Open any product and tap “Track price”, or <a href="#/import">import a wishlist</a>.</p></div>`}
    <div class="sec-h"><h2>Alert history</h2></div>
    ${events.length ? `<div class="panel ev">${events.slice(0, 30).map((e) => `<div class="ev-r"><span class="ind ind-low">${money(e.price)}</span><a href="${esc(e.url)}" target="_blank" rel="noopener">${esc(e.title)}</a><span class="fresh">target ${money(e.target)} · ${ago(e.at)} · ${e.emailed ? 'emailed' : esc(e.note || 'shown here')}</span></div>`).join('')}</div>`
      : `<div class="empty panel sm"><p>No alerts yet. Targets are checked against the stores a few times a day while the site is in use${hit ? '; reached targets are recorded on the next check' : ''}.</p></div>`}
    <p class="fnote dash-foot">Your list lives in this browser. <button class="linkbtn" id="acctDel">Delete my server copy and email</button></p>`);
  $('#emailForm').addEventListener('submit', async (e) => {
    e.preventDefault(); const v = $('#em').value.trim();
    localStorage.setItem('ad_email', v); $('#emNote').innerHTML = '<span class="spin"></span>Saving…';
    try { const r = await acct.sync({ email: v }); $('#emNote').textContent = r?.note || 'Saved'; setTimeout(dashboardPage, 1800); } catch (err) { $('#emNote').textContent = err.message; }
  });
  $('#emOff')?.addEventListener('click', async () => { localStorage.removeItem('ad_email'); try { await acct.sync({ email: '' }); } catch { /* offline */ } dashboardPage(); });
  $('#acctDel').addEventListener('click', async () => { if (!confirm('Delete the server copy of your tracked items and your email? Your list stays in this browser.')) return; try { await acct.post('delete', {}); } catch { /* ignore */ } localStorage.removeItem('ad_email'); localStorage.removeItem('ad_acct_state'); acct.state = null; dashboardPage(); });
  const dl = $('#dl');
  if (dl) {
    dl.addEventListener('submit', (e) => { e.preventDefault(); const row = e.target.closest('.drow'), v = parseFloat(e.target.querySelector('input').value.replace(/[^0-9.]/g, '')); watch.update(row.dataset.k, { target: v > 0 ? +v.toFixed(2) : null }); dashboardPage(); });
    dl.addEventListener('click', (e) => { const b = e.target.closest('.d-rm'); if (!b) return; watch.remove(b.closest('.drow').dataset.k); dashboardPage(); });
  }
  $('#dashCheck')?.addEventListener('click', () => dashCheck(true));
  if (acct.needed()) acct.sync().then((s) => { if (location.hash === '#/dashboard' && s && JSON.stringify(s.events) !== JSON.stringify(st?.events)) dashboardPage(); }).catch(() => {});
  dashCheck(false);
}
let dashBusy = false;
async function dashCheck(all) {
  if (dashBusy) return; dashBusy = true;
  const due = watch.all().filter((w) => all || !w.curAt || Date.now() - w.curAt > 3600e3).slice(0, all ? 20 : 8);
  const btn = $('#dashCheck'); if (btn && due.length) btn.innerHTML = '<span class="spin"></span>Checking…';
  let changed = false;
  for (const w of due) {
    try {
      const r = await fetch(API + '/api/recheck', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: w.group.title, offers: w.group.offers.slice(0, 12).map((o) => ({ storeId: o.storeId, url: o.url, price: o.price })) }) }).then((x) => x.json());
      const ok = (r.offers || []).filter((x) => x.state === 'ok' && x.price > 0);
      const cur = ok.length ? Math.min(...ok.map((x) => x.price)) : null;
      watch.update(w.key, { curAt: Date.now(), ...(cur ? { cur } : {}) }); changed = changed || (cur && Math.abs(cur - rowPrice(w)) >= 0.01);
    } catch { break; }
  }
  dashBusy = false;
  if (location.hash === '#/dashboard' && (all || changed)) dashboardPage();
}

// ---- wishlist import: paste links/names or upload a CSV, matched against the catalog ----
function parseWishlist(text) {
  const rows = String(text || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (!rows.length) return [];
  const cells = (l) => { const out = []; let cur = '', q = false; for (const ch of l) { if (ch === '"') q = !q; else if ((ch === ',' || ch === '\t') && !q) { out.push(cur.trim()); cur = ''; } else cur += ch; } out.push(cur.trim()); return out; };
  const head = cells(rows[0]).map((x) => x.toLowerCase());
  const col = (re) => head.findIndex((x) => re.test(x));
  const isCsv = rows.length > 1 && head.length > 1 && (col(/url|link/) >= 0 || col(/name|title|product|item/) >= 0);
  if (!isCsv) return rows.slice(0, 25).map((line) => ({ line: line.slice(0, 300), target: null }));
  const u = col(/url|link/), n = col(/name|title|product|item/), t = col(/target|max|alert/);
  return rows.slice(1, 26).map((r) => { const c = cells(r); return { line: ((u >= 0 && /^https?:/.test(c[u] || '') ? c[u] : '') || (n >= 0 ? c[n] : '') || c.find(Boolean) || '').slice(0, 300), target: t >= 0 ? parseFloat(String(c[t]).replace(/[^0-9.]/g, '')) || null : null }; }).filter((x) => x.line);
}
function importPage() {
  setQ();
  view(crumbs([['Home', '#/'], ['Dashboard', '#/dashboard'], ['Import wishlist']]) + `
    <section class="panel imp"><h1 class="p-title">Import a wishlist</h1>
      <p class="fnote">Paste product links (from any store we compare) or product names, one per line, or upload a CSV with a <b>url</b> or <b>name</b> column (optional <b>target</b> column for an alert price). Up to 25 at a time. Matching uses our own catalog of ${STORE_N} vetted stores; nothing is fetched from other sites.</p>
      <label class="sr" for="impT">Wishlist</label><textarea id="impT" rows="7" placeholder="https://www.evike.com/products/…&#10;Tokyo Marui Hi-Capa 5.1&#10;Elite Force Glock 17 Gen 5"></textarea>
      <div class="imp-act"><label class="btn secondary sm file">${ic('i-upload')}Upload CSV<input type="file" id="impF" accept=".csv,.txt,text/csv,text/plain" hidden></label><button class="btn primary" id="impGo">Find matches</button></div>
    </section><div id="impR"></div>`);
  $('#impF').addEventListener('change', async (e) => { const f = e.target.files[0]; if (!f) return; if (f.size > 200e3) { alert('That file is over 200 KB'); return; } $('#impT').value = await f.text(); });
  $('#impGo').addEventListener('click', async () => {
    const items = parseWishlist($('#impT').value);
    if (!items.length) { $('#impR').innerHTML = '<div class="empty sm"><p>Paste at least one link or product name.</p></div>'; return; }
    $('#impR').innerHTML = `<div class="panel"><span class="spin"></span> Matching ${items.length} item${items.length === 1 ? '' : 's'}…</div>`;
    let d;
    try { const r = await fetch(API + '/api/match', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ lines: items.map((x) => x.line) }) }); d = await r.json(); if (!r.ok) throw new Error(d.error || 'Match failed'); } catch (err) { $('#impR').innerHTML = `<div class="empty sm"><p>${esc(err.message)}</p></div>`; return; }
    const res = d.results.map((r, i) => ({ ...r, target: items[i]?.target }));
    res.forEach((r) => r.match && S.groups.set(r.match.id, r.match));
    $('#impR').innerHTML = `<div class="sec-h"><h2>${res.filter((r) => r.match).length} of ${res.length} matched</h2><button class="btn primary sm" id="impAdd">Track selected</button></div>
      <div class="dash-list">${res.map((r, i) => r.match ? `<label class="drow imp-r"><input type="checkbox" data-i="${i}" ${r.confidence !== 'weak' ? 'checked' : ''}>
        <span class="d-img">${imgHtml(r.match.images || [], r.match.cat, 'alt="" loading="lazy" width="64" height="64"')}</span>
        <span class="d-main"><a class="d-title" href="#/p/${esc(r.match.id)}">${esc(r.match.title)}</a><span class="d-meta"><span class="conf c-${r.confidence}">${r.confidence} match</span><span>${esc(r.why || '')}</span><span class="q">from “${esc(r.line.slice(0, 70))}”</span></span></span>
        <span class="d-price"><b>${money(r.match.bestPrice)}</b><span class="fresh">${r.match.storeCount} store${r.match.storeCount > 1 ? 's' : ''}</span>${r.target ? `<span class="fresh">target ${money(r.target)}</span>` : ''}</span></label>`
      : `<div class="drow imp-r miss"><span class="d-main"><b>No match</b><span class="d-meta"><span class="q">“${esc(r.line.slice(0, 90))}”</span><span>${esc(r.why || '')}</span></span></span><a class="btn secondary sm" href="#/search?q=${encodeURIComponent(r.query || r.line.slice(0, 60))}">Search</a></div>`).join('')}</div>`;
    $('#impAdd')?.addEventListener('click', () => {
      const pick = $$('#impR input[type=checkbox]:checked').map((c) => res[+c.dataset.i]);
      for (const r of pick.reverse()) watch.add(r.match, r.target ? { target: r.target } : {});
      location.hash = '#/dashboard';
    });
  });
}

// ---- magic link: #/login?k=<account key>&c=<confirm code> ----
async function loginPage(params) {
  setQ();
  view(crumbs([['Home', '#/'], ['Sign in']]) + '<div class="empty panel"><span class="spin"></span><h2>Signing you in…</h2></div>');
  const k = params.get('k') || '', c = params.get('c') || '';
  try {
    if (!/^[A-Za-z0-9_-]{20,64}$/.test(k)) throw new Error('This sign-in link is incomplete.');
    localStorage.setItem('ad_acct', k);
    const d = acct.keep(await acct.post('confirm', { c }));
    if (d.email) localStorage.setItem('ad_email', d.email);
    // Merge the server's list into this browser (items from another device have no full product data yet).
    const have = new Set(watch.all().map((w) => w.key)), add = [];
    for (const it of d.items || []) if (!have.has(it.key)) add.push({ key: it.key, savedAt: Date.parse(it.addedAt) || Date.now(), savedPrice: it.lastPrice || it.curPrice || 0, target: it.target, cur: it.curPrice || undefined, group: { id: 'w' + Math.abs([...it.key].reduce((a, ch) => (a * 31 + ch.charCodeAt(0)) | 0, 7)).toString(36), title: it.title, brand: it.brand, images: [], cat: 'other', bestPrice: it.curPrice || it.lastPrice || 0, storeCount: it.offers.length || 1, offers: (it.offers.length ? it.offers : it.urls.map((url) => ({ url, store: new URL(url).hostname.replace(/^www\./, '') }))).map((o) => ({ ...o, price: it.curPrice || it.lastPrice || 0 })) } });
    if (add.length) watch.save([...watch.all(), ...add]);
    history.replaceState(null, '', '#/dashboard'); dashboardPage();
  } catch (e) { view(crumbs([['Home', '#/'], ['Sign in']]) + `<div class="empty panel"><h2>Couldn’t sign in</h2><p>${esc(e.message)}</p><a class="btn primary" href="#/dashboard">Open dashboard</a></div>`); }
}

async function storesPage() {
  setQ();
  view(crumbs([['Home', '#/'], ['Stores']]) + `<div class="stores">${'<div class="sk" style="height:110px"></div>'.repeat(6)}</div>`);
  try {
    const d = await api('/api/stores');
    const host = (u) => u.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '');
    const ext = (s, extra = '') => `<a class="scard ${extra}" href="${esc(s.url)}" target="_blank" rel="noopener noreferrer"><div class="scard-top">${wordmark(s.id, s.name)}${ic('i-ext')}</div><p>${esc(s.note || host(s.url))}</p>${s.reason ? `<p class="why">${esc(s.reason)}</p>` : ''}</a>`;
    const v = d.vetting;
    view(crumbs([['Home', '#/'], ['Stores']]) + `
      <div class="sec-h" style="margin-top:0"><h2>Price-checked stores <span class="live-pill">${d.stores.length} LIVE</span></h2></div>
      ${v ? `<p class="vetnote">${ic('i-check')}Every store, field and marketplace here passed a legitimacy check (official domain, valid HTTPS, domain age, contact details, policies, pricing, reputation, scam lists). <a href="/api/vetting" target="_blank" rel="noopener">See the record</a>.</p>` : ''}
      <div class="stores">${d.stores.map((s) => `<a class="scard" href="${esc(s.url)}" target="_blank" rel="noopener noreferrer"><div class="scard-top">${wordmark(s.id, s.name)}${ic('i-ext')}</div>
        ${s.shipping ? `<p class="ship">${esc(s.shipping.note)}</p>` : `<p>${esc(s.location || host(s.url))}</p>`}${s.index ? `<p>${s.index.products ? `${s.index.products.toLocaleString()} products indexed` : 'Indexing…'}</p>` : ''}</a>`).join('')}</div>
      <div class="sec-h"><h2>More stores <small class="muted">${d.skipped.length} · links only</small></h2></div><div class="stores">${d.skipped.map((s) => ext(s)).join('')}</div>
      ${d.fields?.length ? `<div class="sec-h"><h2>Fields &amp; pro shops <small class="muted">${d.fields.length}</small></h2></div><div class="stores fields">${d.fields.map((s) => ext(s, 'sm')).join('')}</div>` : ''}
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
        <div class="pimg">${imgHtml([l.image], '', 'loading="lazy" alt=""')}<div class="tags">${l.condition ? `<span class="tag">${esc(l.condition.toUpperCase())}</span>` : ''}</div></div>
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
  if (/^#\/(drops|watchlist|dashboard|import|stores|more|marketplaces|brands)$/.test(h)) liveStart('', null);
  if (h === '#/drops') { setTabs('drops'); return dropsPage(); }
  if (h === '#/watchlist' || h === '#/dashboard') { setTabs('watch'); return dashboardPage(); }
  if (h === '#/import') { setTabs('watch'); return importPage(); }
  if (h.startsWith('#/login')) { setTabs('watch'); return loginPage(params); }
  if (h === '#/stores' || h === '#/more') { setTabs('stores'); return storesPage(); }
  if (h === '#/marketplaces') { setTabs('markets'); return marketplacesPage(); }
  if (h === '#/brands') { setTabs('home', 'brands'); return brandsPage(); }
  if (h.startsWith('#/b/')) { setTabs('home', 'brands'); return brandPage(decodeURIComponent(h.slice(4).split('?')[0])); }
  setTabs('home'); return homePage();
}
window.route = route;
window.addEventListener('hashchange', () => { route(); if (!location.hash.startsWith('#/p/')) window.scrollTo(0, 0); });
// Header height drives sticky offsets (sidebar, buy box, mobile results bar).
const hdr = $('#hdr');
const setH = () => document.documentElement.style.setProperty('--hdr-h', hdr.offsetHeight + 'px');
if ('ResizeObserver' in window) new ResizeObserver(setH).observe(hdr); else setH();
$('#livebar')?.addEventListener('click', liveDetails);
badgeCount(); route();
if (acct.needed()) setTimeout(() => acct.sync().catch(() => {}), 4000); // keep the server copy fresh for alerts
document.addEventListener('visibilitychange', () => document.documentElement.classList.toggle('paused', document.hidden));
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
if (window.Capacitor?.isNativePlatform?.()) window.Capacitor.Plugins?.StatusBar?.setStyle?.({ style: 'DARK' }).catch?.(() => {});
