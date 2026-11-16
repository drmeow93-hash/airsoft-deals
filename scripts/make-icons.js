const { chromium } = require('playwright');
const fs = require('fs');
(async () => {
  const b = await chromium.launch(); const p = await b.newPage();
  const svgRound = fs.readFileSync('public/icons/icon.svg', 'utf8');
  for (const [name, size, pad] of [['icon-192.png', 192, 0], ['icon-512.png', 512, 0], ['apple-touch-icon.png', 180, 0], ['icon-512-maskable.png', 512, 0], ['icon-1024.png', 1024, 0]]) {
    const svg = name.startsWith('apple') || name.includes('maskable') || name.includes('1024') ? svgRound.replace('rx="112"', 'rx="0"') : svgRound;
    await p.setViewportSize({ width: size, height: size });
    await p.setContent(`<html><body style="margin:0;background:#0f0b1a"><div style="width:${size}px;height:${size}px;display:flex;align-items:center;justify-content:center">${svg.replace('<svg ', `<svg width="${size - 2 * pad}" height="${size - 2 * pad}" `)}</div></body></html>`);
    await p.screenshot({ path: 'public/icons/' + name, omitBackground: false });
  }
  await b.close();
})();
