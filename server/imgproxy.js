// Same-origin image fallback: /img?u=<image url>. The app loads store images directly; only when one fails
// (hotlink/referrer checks, a flaky host) does it retry through here. Restricted to vetted store domains
// and the e-commerce CDNs those stores use; images only, 2 MB max, a few at a time, with a small
// byte-budgeted memory cache (free plan: 512 MB container) and long browser caching.
const { hostOk } = require('./vetting');
const { UA } = require('./http');
const CDNS = ['cdn.shopify.com', 'cdn11.bigcommerce.com', 'cdn.shoplightspeed.com'];
const MAX_BYTES = 2 * 1024 * 1024, BUDGET = 12 * 1024 * 1024, TTL = 6 * 3600e3;
const cache = new Map(); let bytes = 0; // url -> { at, type, buf }
let active = 0; const MAX_ACTIVE = 4;
const refused = new Map(); // host -> until (ms)
const allowedUrl = (s) => { try { const u = new URL(s); return u.protocol === 'https:' && (CDNS.includes(u.hostname) || hostOk(u.hostname)) ? u : null; } catch { return null; } };

async function handler(req, res) {
  const u = allowedUrl(String(req.query.u || ''));
  if (!u) return res.status(400).end();
  const key = u.toString();
  const hit = cache.get(key);
  const send = (e) => res.set({ 'Content-Type': e.type, 'Cache-Control': 'public, max-age=604800, immutable', 'X-Content-Type-Options': 'nosniff' }).send(e.buf);
  if (hit && Date.now() - hit.at < TTL) { cache.delete(key); cache.set(key, hit); return send(hit); }
  // A host that refused us (bot wall, 403/429) is left alone for 30 min: answer at once instead of re-asking.
  const blockedUntil = refused.get(u.hostname) || 0;
  if (blockedUntil > Date.now()) return res.status(404).set('Cache-Control', 'public, max-age=1800').end();
  // A few at a time: wait briefly for a free slot rather than failing the image.
  for (let i = 0; active >= MAX_ACTIVE && i < 30; i++) await new Promise((r) => setTimeout(r, 100));
  if (active >= MAX_ACTIVE) return res.status(503).set('Retry-After', '2').end();
  active++;
  try {
    const r = await fetch(key, { headers: { 'User-Agent': UA, Accept: 'image/avif,image/webp,image/*' }, redirect: 'follow', signal: AbortSignal.timeout(8000) });
    if ([401, 403, 429, 503].includes(r.status)) { refused.set(u.hostname, Date.now() + 30 * 60 * 1000); return res.status(404).set('Cache-Control', 'public, max-age=1800').end(); }
    const type = (r.headers.get('content-type') || '').split(';')[0];
    if (!r.ok || !/^image\/(jpeg|png|webp|gif|avif)$/.test(type) || +(r.headers.get('content-length') || 0) > MAX_BYTES) return res.status(502).end();
    if (!allowedUrl(r.url)) return res.status(502).end(); // a redirect off the allowlist
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length > MAX_BYTES) return res.status(502).end();
    const e = { at: Date.now(), type, buf };
    cache.set(key, e); bytes += buf.length;
    for (const [k, v] of cache) { if (bytes <= BUDGET) break; cache.delete(k); bytes -= v.buf.length; }
    send(e);
  } catch { res.status(504).end(); } finally { active--; }
}
module.exports = { handler, allowedUrl, stats: () => ({ entries: cache.size, mb: +(bytes / 1048576).toFixed(1) }) };
