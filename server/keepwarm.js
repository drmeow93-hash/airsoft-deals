// Keep-warm (free plan). Render spins a free web service down after 15 minutes without inbound traffic;
// the next visitor then waits for a cold start (container + boot + first data, ~20-60 s). During active
// hours (default 06:00-24:00 Chicago time) the server requests its own public URL every 13 minutes so it
// stays up. That's one tiny /api/health call: no store traffic. One free service up 18 h a day uses about
// 560 of the 750 free instance hours Render gives a workspace each month (24/7 would be ~744).
// While nobody is visiting, the background search warming pauses, so stores are only crawled because of
// real visitors; saved target-price alerts are still checked every 30 minutes (a few product lookups).
// Turn off with KEEP_WARM=0; change hours with KEEP_WARM_HOURS=7-23 (24h clock, America/Chicago).
const TZ = 'America/Chicago';
const URL = (process.env.KEEP_WARM_URL || process.env.RENDER_EXTERNAL_URL || '').replace(/\/$/, '');
const ON = process.env.KEEP_WARM !== '0' && !!URL;
const [H0, H1] = String(process.env.KEEP_WARM_HOURS || '6-24').split('-').map(Number);
let lastVisit = 0, pings = 0, lastPing = null, lastErr = null;
const hourNow = () => +new Intl.DateTimeFormat('en-US', { hour: 'numeric', hourCycle: 'h23', timeZone: TZ }).format(new Date());
const active = () => { const h = hourNow(); return H0 <= H1 ? h >= H0 && h < H1 : h >= H0 || h < H1; };
function start(onTick) {
  if (!ON) return;
  setInterval(async () => {
    if (!active()) return;
    try {
      const r = await fetch(URL + '/api/health?warm=1', { headers: { 'User-Agent': 'AirsoftDealsFinder/1.0 (keep-warm)' }, signal: AbortSignal.timeout(20000) });
      await r.arrayBuffer(); pings++; lastPing = new Date().toISOString(); lastErr = r.ok ? null : `HTTP ${r.status}`;
    } catch (e) { lastErr = e.message; }
  }, 13 * 60 * 1000);
  if (onTick) setInterval(() => { if (active()) onTick(); }, 30 * 60 * 1000);
}
module.exports = {
  start,
  visit: () => { lastVisit = Date.now(); },
  visitedWithin: (ms) => Date.now() - lastVisit < ms,
  status: () => ({ on: ON, hours: `${H0}-${H1} ${TZ}`, activeNow: ON && active(), pings, lastPing, lastErr, lastVisitAgoMin: lastVisit ? Math.round((Date.now() - lastVisit) / 60000) : null }),
};
