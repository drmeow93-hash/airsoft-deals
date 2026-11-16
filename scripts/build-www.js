// Copies public/ -> www/ for the native iOS build and bakes in the backend URL.
// Usage: API_BASE=https://your-backend.example.com node scripts/build-www.js
const fs = require('fs');
const path = require('path');
const api = process.env.API_BASE || '';
if (!api) console.warn('WARNING: API_BASE not set. The iOS app needs a deployed backend URL (stores block cross-origin browser calls).');
fs.rmSync('www', { recursive: true, force: true });
fs.cpSync('public', 'www', { recursive: true });
fs.writeFileSync(path.join('www', 'config.js'), `window.API_BASE = ${JSON.stringify(api.replace(/\/$/, ''))};\n`);
fs.rmSync(path.join('www', 'sw.js')); // service worker isn't used inside the native shell
console.log('Built www/ with API_BASE =', api || '(empty)');
