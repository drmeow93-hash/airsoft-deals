// Simulates a returning visitor whose browser still has an OLD service worker installed:
// 1) visit the old build, 2) the server is replaced by the new build, 3) the same browser comes back.
// Passes if the tab ends up running the new app.js without the user doing anything.
// Usage: node scripts/sw-upgrade-test.js <old build dir> <new build dir>
const { chromium, devices } = require('playwright');
const { spawn } = require('child_process');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const PORT = 8795, BASE = `http://localhost:${PORT}/`;
const start = (dir) => { const p = spawn('node', ['server/index.js'], { cwd: dir, env: { ...process.env, PORT: String(PORT) }, stdio: ['ignore', 'ignore', 'inherit'] }); p.on('exit', (c, sig) => console.log('server', dir, 'exited', c, sig)); return p; };
const waitUp = async () => { for (let i = 0; i < 80; i++) { try { const r = await fetch(BASE); if (r.ok) return; } catch {} await sleep(500); } throw new Error('server did not start'); };
const waitDown = async () => { for (let i = 0; i < 40; i++) { try { await fetch(BASE); } catch { return; } await sleep(250); } };
(async () => {
  const [OLD, NEW] = process.argv.slice(2);
  let srv = start(OLD); await waitUp();
  const ctx = await chromium.launchPersistentContext('/tmp/sw-profile-' + Date.now(), { ...devices['iPhone 14 Pro'] });
  let p = await ctx.newPage();
  const appV = () => p.evaluate(() => [...document.scripts].map((s) => s.src).find((s) => s.includes('app.js')) || '').catch(() => '');
  await p.goto(BASE + '#/search?q=glock'); await sleep(6000);
  console.log('old build: app', await appV(), '| caches', await p.evaluate(async () => (await caches.keys()).join(',')));
  await p.goto('about:blank');
  srv.kill('SIGKILL'); await waitDown();
  srv = start(NEW); await waitUp();
  const newV = (await (await fetch(BASE + 'api/version')).json())['app.js'];
  let loads = 0; p.on('load', () => loads++); p.on('close', () => console.log('page closed')); p.on('crash', () => console.log('page crashed')); ctx.on('page', (np) => console.log('new page', np.url())); p.on('framenavigated', (f) => { if (f === p.mainFrame()) console.log('nav', f.url()); });
  const t0 = Date.now();
  await p.goto(BASE + '#/search?q=glock'); // the visitor comes back: a real new page load
  let ok = false;
  for (let i = 0; i < 40 && !ok; i++) {
    await sleep(500);
    if (p.isClosed()) { const np = ctx.pages().find((x) => x.url().startsWith(BASE)); if (np) { console.log('tab was replaced by the reload (headless quirk); following it'); p = np; } }
    ok = (await appV()).includes(newV);
  }
  console.log(ok ? `PASS: new build (${newV}) running ${Date.now() - t0} ms after the visit, ${loads - 1} automatic reload(s)` : `FAIL: still on ${await appV()}`);
  await sleep(2500);
  console.log('caches now', await p.evaluate(async () => (await caches.keys()).join(',')).catch(() => '?'), '| results:', (await p.textContent('#rcount').catch(() => '')).trim());
  if (!ok && !p.isClosed()) { await p.goto('about:blank'); const t1 = Date.now(); await p.goto(BASE + '#/search?q=glock'); await sleep(3000); console.log((await appV()).includes(newV) ? `second visit: new build running (${Date.now() - t1} ms)` : 'second visit: STILL OLD'); }
  await p.screenshot({ path: process.env.SHOT || 'screenshots/v11-sw-upgrade-iphone.png' }).catch(() => {});
  await ctx.close(); srv.kill('SIGKILL');
})();
