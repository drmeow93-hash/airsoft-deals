// Static shell: app.js / styles.css minified with esbuild, CSS inlined into the HTML, every text asset
// pre-compressed (brotli 11 + gzip 9). That work is ~half of the server's boot CPU, and Render's free
// instance has 0.1 CPU, so it's done once at install time (`npm install` runs scripts/prepack.js on
// Render's build machine) and cached in server/.pack/. At boot the cache is used when the source hash
// matches; otherwise (local dev, or a missing cache) it's built on the spot, exactly as before.
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');

const PUB = path.join(__dirname, '..', 'public');
const DIR = path.join(__dirname, '.pack');
const FORMAT = 1;
const IMMUTABLE = 'public, max-age=31536000, immutable';
const read = (f) => fs.readFileSync(path.join(PUB, f), 'utf8');
const sha = (s) => crypto.createHash('sha1').update(s).digest('hex');
const FILES = ['app.js', 'styles.css', 'config.js', 'index.html', 'sw.js', 'manifest.webmanifest', 'icons/icon.svg'];
const sourceHash = () => sha(FORMAT + FILES.map((f) => f + '\0' + read(f)).join('\0'));

function build() {
  let esbuild = null;
  try { esbuild = require('esbuild'); } catch { /* serve unminified */ }
  const minify = (code, loader) => { try { return esbuild ? esbuild.transformSync(code, { loader, minify: true, target: loader === 'js' ? 'es2020' : 'safari14' }).code : code; } catch (e) { console.log('minify failed', e.message); return code; } };
  const appJs = minify(read('app.js'), 'js');
  const css = minify(read('styles.css'), 'css').trim();
  const configJs = read('config.js');
  const version = { 'app.js': sha(appJs).slice(0, 10), 'config.js': sha(configJs).slice(0, 10), 'styles.css': sha(css).slice(0, 10) };
  const indexHtml = read('index.html')
    .replace(/<link rel="stylesheet" href="\/styles\.css" \/>/, `<style>${css}</style>`)
    .replace(/(src|href)="\/(app\.js|config\.js)"/g, (m, attr, f) => `${attr}="/${f}?v=${version[f]}"`)
    .replace(/>\s+</g, '><').replace(/\n\s*/g, '');
  const pack = (body, type, cacheControl) => { const raw = Buffer.from(body); return { type, cacheControl, raw, br: zlib.brotliCompressSync(raw, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 11 } }), gz: zlib.gzipSync(raw, { level: 9 }) }; };
  const packs = {
    '/': pack(indexHtml, 'text/html; charset=utf-8', 'no-cache'),
    '/app.js': pack(appJs, 'text/javascript; charset=utf-8', IMMUTABLE),
    '/config.js': pack(configJs, 'text/javascript; charset=utf-8', IMMUTABLE),
    '/styles.css': pack(css, 'text/css; charset=utf-8', IMMUTABLE),
    '/sw.js': pack(minify(read('sw.js').replace('__ASSET_VERSIONS__', JSON.stringify(version)), 'js'), 'text/javascript; charset=utf-8', 'no-cache'),
    '/manifest.webmanifest': pack(read('manifest.webmanifest'), 'application/manifest+json', 'public, max-age=86400'),
    '/icons/icon.svg': pack(read('icons/icon.svg'), 'image/svg+xml', 'public, max-age=2592000, immutable'),
  };
  return { packs, version };
}

function save(hash, { packs, version }) {
  fs.mkdirSync(DIR, { recursive: true });
  const manifest = { hash, version, entries: {} };
  Object.entries(packs).forEach(([route, p], i) => {
    manifest.entries[route] = { type: p.type, cacheControl: p.cacheControl, file: String(i) };
    for (const k of ['raw', 'br', 'gz']) fs.writeFileSync(path.join(DIR, `${i}.${k}`), p[k]);
  });
  fs.writeFileSync(path.join(DIR, 'manifest.json'), JSON.stringify(manifest));
}
function load(hash) {
  try {
    const m = JSON.parse(fs.readFileSync(path.join(DIR, 'manifest.json'), 'utf8'));
    if (m.hash !== hash) return null;
    const packs = {};
    for (const [route, e] of Object.entries(m.entries)) packs[route] = { type: e.type, cacheControl: e.cacheControl, raw: fs.readFileSync(path.join(DIR, `${e.file}.raw`)), br: fs.readFileSync(path.join(DIR, `${e.file}.br`)), gz: fs.readFileSync(path.join(DIR, `${e.file}.gz`)) };
    return { packs, version: m.version };
  } catch { return null; }
}

let current = null;
function get() {
  if (current) return current;
  const hash = sourceHash();
  current = load(hash);
  if (current) { current.from = 'install-time cache'; } else {
    current = build(); current.from = 'built at boot';
    try { save(hash, current); } catch { /* read-only disk is fine */ }
  }
  current.packs['/index.html'] = current.packs['/'];
  return current;
}
function prepare() { const hash = sourceHash(); if (load(hash)) return 'up to date'; save(hash, build()); return 'built'; }
function send(req, res, p) {
  const ae = String(req.headers['accept-encoding'] || '');
  const enc = /\bbr\b/.test(ae) ? 'br' : /\bgzip\b/.test(ae) ? 'gz' : null;
  res.setHeader('Content-Type', p.type); res.setHeader('Cache-Control', p.cacheControl); res.setHeader('Vary', 'Accept-Encoding');
  if (enc) res.setHeader('Content-Encoding', enc === 'br' ? 'br' : 'gzip');
  const body = enc ? p[enc] : p.raw;
  res.setHeader('Content-Length', body.length);
  res.end(req.method === 'HEAD' ? undefined : body);
}
module.exports = { get, prepare, send };
