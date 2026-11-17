// robots.txt check for per-product re-checks: our UA's group (or '*'), longest match wins, Allow wins ties.
// Each host's robots.txt is fetched once and kept for 12 hours. If it can't be read, we don't fetch.
const { UA } = require('./http');
const cache = new Map(); // origin -> { at, txt }
function allowed(txt, path, ua = 'airsoftdealsfinder') {
  if (!txt) return true;
  const lines = txt.split(/\r?\n/).map((l) => l.replace(/#.*/, '').trim()).filter(Boolean);
  const groups = []; let cur = null, lastUA = false;
  for (const l of lines) {
    const m = l.match(/^([\w-]+)\s*:\s*(.*)$/); if (!m) continue;
    const k = m[1].toLowerCase(), v = m[2].trim();
    if (k === 'user-agent') { if (!lastUA) { cur = { uas: [], rules: [] }; groups.push(cur); } cur.uas.push(v.toLowerCase()); lastUA = true; }
    else { lastUA = false; if (cur && (k === 'allow' || k === 'disallow')) cur.rules.push([k, v]); }
  }
  let g = groups.filter((x) => x.uas.some((u) => u !== '*' && ua.includes(u)));
  if (!g.length) g = groups.filter((x) => x.uas.includes('*'));
  let best = null;
  for (const [k, v] of g.flatMap((x) => x.rules)) {
    if (!v) continue;
    const re = new RegExp('^' + v.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\\\$$/, '$'));
    if (re.test(path) && (!best || v.length > best[1].length || (v.length === best[1].length && k === 'allow'))) best = [k, v];
  }
  return !best || best[0] === 'allow';
}
async function canFetch(url) {
  const u = new URL(url);
  let e = cache.get(u.origin);
  if (!e || Date.now() - e.at > 12 * 3600e3) {
    try {
      const r = await fetch(u.origin + '/robots.txt', { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(8000) });
      const txt = r.ok ? await r.text() : r.status === 404 ? '' : null;
      // A 429/5xx isn't an answer: don't fetch the product, and ask again in 30 min rather than 12 h.
      e = { at: txt === null ? Date.now() - 11.5 * 3600e3 : Date.now(), txt };
    } catch { e = { at: Date.now() - 11.5 * 3600e3, txt: null }; } // retry in 30 min
    cache.set(u.origin, e);
  }
  if (e.txt === null) return false;
  return allowed(e.txt, u.pathname + u.search);
}
module.exports = { allowed, canFetch };
