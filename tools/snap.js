// Render stills at given times:  node tools/snap.js 3 10 18 ...   → output/snaps/t-<sec>.png
const fs = require('fs'), path = require('path');
const { launch, serve } = require('./cdp');
const ROOT = path.resolve(__dirname, '..');
(async () => {
  const times = process.argv.slice(2).map(Number);
  const out = path.join(ROOT, 'output', 'snaps'); fs.mkdirSync(out, { recursive: true });
  const server = await serve(ROOT, 8791);
  const b = await launch(['--headless=new', '--window-size=1920,1080', '--force-device-scale-factor=1', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--hide-scrollbars', 'about:blank'], 9341);
  const errors = [];
  b.on(m => {
    if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
    if (m.method === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(m.params.type)) errors.push(m.params.args.map(a => a.value ?? a.description).join(' '));
  });
  await b.send('Runtime.enable'); await b.send('Page.enable');
  await b.send('Emulation.setDeviceMetricsOverride', { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false });
  await b.send('Page.navigate', { url: `http://127.0.0.1:8791/index.html?still&t=0` });
  await b.waitFor('window.__ready === true');
  for (const t of times) {
    await b.evaluate(`window.__seek(${t})`);
    await b.evaluate('new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))');
    const { data } = await b.send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(out, `t-${t.toFixed(1).padStart(5, '0')}.png`), Buffer.from(data, 'base64'));
  }
  if (errors.length) console.log('PAGE ERRORS:\n' + [...new Set(errors)].join('\n'));
  console.log('saved', times.length, 'stills to', out);
  b.close(); server.close(); setTimeout(() => process.exit(0), 2000);
})().catch(e => { console.error(e); process.exit(1); });
