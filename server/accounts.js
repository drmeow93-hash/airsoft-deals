// Lightweight free accounts: watchlist, target prices and email alerts.
//
// No passwords. The browser creates a random account key (kept in localStorage) and is the source of
// truth for the watchlist; every visit syncs it here so the server can check targets while you're away.
// Adding an email sends a confirmation link (double opt-in). That link is also the magic link that
// signs another device into the same account. Alerts go only to confirmed emails.
//
// Storage (free plan):
//   - DATABASE_URL set (any Postgres, e.g. a Neon free-tier database, which doesn't expire): one table
//     "accounts" (id text primary key, data jsonb, updated_at). Survives restarts and redeploys.
//   - otherwise: server/snapshot/accounts.json on the instance disk. Render's free disk is wiped on every
//     restart/redeploy, so the watchlist is re-synced from the browser on the next visit; alerts can't be
//     checked while the account is missing. The dashboard says which mode is active.
// Email: Resend's HTTP API with RESEND_API_KEY (and ALERTS_FROM, a sender on a domain verified in Resend).
// Without it, alerts still appear in the dashboard and on the product page, just not by email.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const FILE = path.join(__dirname, 'snapshot', 'accounts.json');
const SITE = (process.env.SITE_URL || 'https://airsoft-deals.onrender.com').replace(/\/$/, '');
const FROM = process.env.ALERTS_FROM || "Felony's Airsoft Emporium <onboarding@resend.dev>";
const EMAIL_DAILY_CAP = +process.env.EMAIL_DAILY_CAP || 100;
const MAX_ITEMS = 100;
const CHECK_EVERY_MS = 3 * 3600e3; // each target re-checked at most every 3 h
const PER_CYCLE = 8; // targets re-checked per refresh cycle (keeps store load tiny)
const sha = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');
const rand = () => crypto.randomBytes(18).toString('base64url');
const emailOk = (e) => /^[^\s@<>"']{1,64}@[a-z0-9.-]{1,180}\.[a-z]{2,24}$/i.test(e || '');
const num = (v) => (Number.isFinite(+v) && +v > 0 && +v < 20000 ? Math.round(+v * 100) / 100 : null);
const str = (v, n) => String(v || '').replace(/[\u0000-\u001f<>]/g, ' ').slice(0, n).trim();

// ---- storage ----
let pg = null;
const mem = new Map(); // id -> data (file mode, and a cache in db mode)
function mode() { return process.env.DATABASE_URL ? 'postgres' : 'instance-disk'; }
async function db() {
  if (!process.env.DATABASE_URL) return null;
  if (!pg) {
    const { Pool } = require('pg');
    pg = new Pool({ connectionString: process.env.DATABASE_URL, max: 2, ssl: /localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL) ? false : { rejectUnauthorized: false } });
    await pg.query('create table if not exists accounts (id text primary key, data jsonb not null, updated_at timestamptz not null default now())');
  }
  return pg;
}
try { if (!process.env.DATABASE_URL) for (const [k, v] of Object.entries(JSON.parse(fs.readFileSync(FILE, 'utf8')))) mem.set(k, v); } catch { /* none yet */ }
let saveT = null;
const saveFile = () => { clearTimeout(saveT); saveT = setTimeout(() => { try { fs.writeFileSync(FILE, JSON.stringify(Object.fromEntries(mem))); } catch { /* read-only disk */ } }, 1000); };
async function load(id) {
  const d = await db();
  if (!d) return mem.get(id) || null;
  const r = await d.query('select data from accounts where id = $1', [id]);
  return r.rows[0]?.data || null;
}
async function save(id, data) {
  data.updatedAt = new Date().toISOString();
  const d = await db();
  if (!d) { mem.set(id, data); if (mem.size > 20000) mem.delete(mem.keys().next().value); saveFile(); return; }
  await d.query('insert into accounts (id, data, updated_at) values ($1, $2, now()) on conflict (id) do update set data = excluded.data, updated_at = now()', [id, data]);
}
async function remove(id) { const d = await db(); if (!d) { mem.delete(id); saveFile(); return; } await d.query('delete from accounts where id = $1', [id]); }
async function* all() {
  const d = await db();
  if (!d) { for (const [id, data] of mem) yield [id, data]; return; }
  const r = await d.query("select id, data from accounts where data->>'confirmed' = 'true' or jsonb_array_length(coalesce(data->'items','[]'::jsonb)) > 0 order by updated_at desc limit 5000");
  for (const row of r.rows) yield [row.id, row.data];
}

// ---- email (Resend) ----
let day = '', sent = 0;
async function sendEmail(to, subject, html) {
  if (!process.env.RESEND_API_KEY) return { ok: false, why: 'email not connected' };
  const t = new Date().toISOString().slice(0, 10);
  if (t !== day) { day = t; sent = 0; }
  if (sent >= EMAIL_DAILY_CAP) return { ok: false, why: 'daily email cap reached' };
  sent++;
  try {
    const r = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ from: FROM, to: [to], subject, html }), signal: AbortSignal.timeout(15000) });
    if (!r.ok) { console.log('[accounts] email failed', r.status, (await r.text()).slice(0, 200)); return { ok: false, why: `email provider HTTP ${r.status}` }; }
    return { ok: true };
  } catch (e) { return { ok: false, why: e.message }; }
}
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const shell = (body) => `<div style="font-family:system-ui,sans-serif;background:#0b0716;color:#f5f3fb;padding:24px;border-radius:16px;max-width:520px"><div style="font-size:20px;font-weight:700;color:#b69cff;margin-bottom:12px">Felony's Airsoft Emporium</div>${body}<p style="color:#9d96b6;font-size:12px;margin-top:24px">You get this because you asked for price alerts on ${esc(SITE.replace(/^https?:\/\//, ''))}.</p></div>`;

// ---- items from the browser ----
function cleanItem(x) {
  const urls = (Array.isArray(x.urls) ? x.urls : []).map((u) => String(u || '')).filter((u) => /^https:\/\//.test(u)).slice(0, 8);
  if (!urls.length) return null;
  return {
    key: str(x.key || urls[0], 400), title: str(x.title, 160), brand: str(x.brand, 50),
    offers: (Array.isArray(x.offers) ? x.offers : []).slice(0, 8).map((o) => ({ url: String(o.url || ''), storeId: str(o.storeId, 30), store: str(o.store, 40) })).filter((o) => /^https:\/\//.test(o.url)),
    urls, target: num(x.target), addedAt: str(x.addedAt, 30) || new Date().toISOString(), lastPrice: num(x.lastPrice),
  };
}
const publicView = (a) => ({ email: a.email || null, confirmed: !!a.confirmed, items: a.items || [], events: (a.events || []).slice(-50), storage: mode(), emailConnected: !!process.env.RESEND_API_KEY });

// ---- limits ----
const hits = new Map();
function limited(ip, n = 40) { const now = Date.now(); const l = (hits.get(ip) || []).filter((t) => now - t < 10 * 60e3); if (l.length >= n) return true; l.push(now); hits.set(ip, l); if (hits.size > 5000) hits.delete(hits.keys().next().value); return false; }

// POST /api/account/sync { key, email?, items[] }  -> account view
async function sync(body, ip) {
  if (limited(ip)) return { status: 429, body: { error: 'Too many requests, try again in a few minutes' } };
  const key = String(body.key || '');
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(key)) return { status: 400, body: { error: 'Bad account key' } };
  const id = sha(key);
  const a = (await load(id)) || { createdAt: new Date().toISOString(), items: [], events: [] };
  if (Array.isArray(body.items)) {
    const prev = new Map((a.items || []).map((x) => [x.key, x]));
    a.items = body.items.slice(0, MAX_ITEMS).map(cleanItem).filter(Boolean).map((x) => ({ ...x, checkedAt: prev.get(x.key)?.checkedAt || null, curPrice: prev.get(x.key)?.curPrice || null, notifiedPrice: x.target === prev.get(x.key)?.target ? prev.get(x.key)?.notifiedPrice || null : null }));
  }
  let note = null;
  if (body.email !== undefined) {
    const email = String(body.email || '').trim().toLowerCase();
    if (!email) { a.email = null; a.confirmed = false; }
    else if (!emailOk(email)) return { status: 400, body: { error: 'That email address does not look right' } };
    else if (email !== a.email) {
      a.email = email; a.confirmed = false;
      const c = rand(); a.confirmHash = sha(c); a.confirmSent = (a.confirmSent || []).filter((t) => Date.now() - Date.parse(t) < 864e5);
      if (a.confirmSent.length >= 3) note = 'Confirmation emails are limited to 3 a day';
      else {
        const link = `${SITE}/#/login?k=${encodeURIComponent(key)}&c=${encodeURIComponent(c)}`;
        const r = await sendEmail(email, 'Confirm your price alerts', shell(`<p>Tap to confirm this email for price alerts. The same link signs you in on another device.</p><p><a href="${link}" style="display:inline-block;background:#8b5cf6;color:#fff;padding:12px 18px;border-radius:10px;text-decoration:none;font-weight:600">Confirm and sign in</a></p><p style="color:#9d96b6;font-size:12px">If you didn't ask for this, ignore it.</p>`));
        a.confirmSent.push(new Date().toISOString());
        note = r.ok ? `Confirmation link sent to ${email}` : `Saved, but no email was sent (${r.why})`;
      }
    }
  }
  await save(id, a);
  return { status: 200, body: { ...publicView(a), note } };
}
// POST /api/account/confirm { key, c }
async function confirm(body, ip) {
  if (limited(ip, 20)) return { status: 429, body: { error: 'Too many requests' } };
  const id = sha(String(body.key || '')); const a = await load(id);
  if (!a) return { status: 404, body: { error: 'Account not found (it may have been cleared on a server restart; open the site on the device you used and add the email again)' } };
  if (a.confirmHash && sha(String(body.c || '')) === a.confirmHash) { a.confirmed = true; a.confirmHash = null; await save(id, a); }
  return { status: 200, body: publicView(a) };
}
async function get(body, ip) {
  if (limited(ip)) return { status: 429, body: { error: 'Too many requests' } };
  const a = await load(sha(String(body.key || '')));
  return a ? { status: 200, body: publicView(a) } : { status: 404, body: { error: 'No account yet', storage: mode(), emailConnected: !!process.env.RESEND_API_KEY } };
}
async function del(body, ip) { if (limited(ip)) return { status: 429, body: {} }; await remove(sha(String(body.key || ''))); return { status: 200, body: { ok: true } }; }

// ---- alert checks (called after each refresh cycle) ----
let recheckFn = null, latestFn = null;
function init({ recheck, latest }) { recheckFn = recheck; latestFn = latest; }
async function checkAlerts() {
  const due = [];
  for await (const [id, a] of all()) {
    for (const it of a.items || []) if (it.target && (!it.checkedAt || Date.now() - Date.parse(it.checkedAt) > CHECK_EVERY_MS)) due.push([id, it.key]);
    if (due.length >= PER_CYCLE) break;
  }
  for (const [id, key] of due) {
    const a = await load(id); const it = a?.items.find((x) => x.key === key); if (!it) continue;
    let best = null, at = null;
    try {
      const offers = it.offers.length ? it.offers : it.urls.map((url) => ({ url }));
      const res = recheckFn ? await recheckFn(offers, it.title) : [];
      for (const r of res) if (r.state === 'ok' && r.price && (best == null || r.price < best.price)) best = { price: r.price, store: r.storeId, url: r.url };
    } catch { /* fall back to recorded history */ }
    if (!best && latestFn) { const l = latestFn(it.urls); if (l) best = l; }
    it.checkedAt = new Date().toISOString();
    if (best) { it.curPrice = best.price; at = best; }
    if (at && at.price <= it.target && (it.notifiedPrice == null || at.price < it.notifiedPrice - 0.009)) {
      it.notifiedPrice = at.price;
      const ev = { at: it.checkedAt, key: it.key, title: it.title, price: at.price, target: it.target, url: at.url, emailed: false };
      if (a.email && a.confirmed) {
        const unsub = `${SITE}/#/dashboard`;
        const r = await sendEmail(a.email, `Price alert: ${it.title} is $${at.price.toFixed(2)}`, shell(`<p><b>${esc(it.title)}</b> dropped to <b style="color:#3ee0a1">$${at.price.toFixed(2)}</b>, at or below your target of $${it.target.toFixed(2)}.</p><p><a href="${esc(at.url)}" style="display:inline-block;background:#8b5cf6;color:#fff;padding:12px 18px;border-radius:10px;text-decoration:none;font-weight:600">View at the store</a></p><p style="font-size:12px;color:#9d96b6">Prices change fast; confirm at the store. Manage or stop alerts: <a href="${unsub}" style="color:#b69cff">your dashboard</a>.</p>`));
        ev.emailed = r.ok; if (!r.ok) ev.note = r.why;
      }
      a.events = [...(a.events || []), ev].slice(-100);
    }
    await save(id, a);
  }
  return due.length;
}

const info = () => ({ storage: mode(), emailConnected: !!process.env.RESEND_API_KEY, from: process.env.RESEND_API_KEY ? FROM : null, accounts: process.env.DATABASE_URL ? undefined : mem.size });
module.exports = { sync, confirm, get, del, init, checkAlerts, info, cleanItem, emailOk };
