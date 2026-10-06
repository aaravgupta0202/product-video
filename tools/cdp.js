// Minimal Chrome DevTools Protocol helpers (no dependencies; needs Node 22+ for the global WebSocket).
const fs = require('fs'), path = require('path'), os = require('os'), http = require('http');
const { spawn } = require('child_process');

function findBrowser() {
  const c = [
    process.env.CHROME_PATH,
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    path.join(os.homedir(), 'AppData/Local/Google/Chrome/Application/chrome.exe'),
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'
  ].filter(Boolean);
  const hit = c.find(p => fs.existsSync(p));
  if (!hit) throw new Error('Chrome or Edge not found. Set CHROME_PATH to your browser executable.');
  return hit;
}

const getJSON = url => new Promise((res, rej) => http.get(url, r => { let d = ''; r.on('data', c => d += c); r.on('end', () => { try { res(JSON.parse(d)); } catch (e) { rej(e); } }); }).on('error', rej));
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function launch(args, port) {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'canopy-film-'));
  const proc = spawn(findBrowser(), [`--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check', ...args], { stdio: 'ignore' });
  let targets;
  for (let i = 0; i < 100; i++) { try { targets = await getJSON(`http://127.0.0.1:${port}/json/list`); if (targets.some(t => t.type === 'page')) break; } catch { } await sleep(150); }
  const page = targets.find(t => t.type === 'page');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let id = 0; const pending = new Map(), listeners = [];
  ws.onmessage = ev => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.rej(new Error(m.error.message)) : p.res(m.result); }
    else if (m.method) listeners.forEach(l => l(m));
  };
  const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); });
  const evaluate = async expr => (await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })).result.value;
  const waitFor = async (expr, timeout = 60000) => { const t = Date.now(); while (Date.now() - t < timeout) { if (await evaluate(expr).catch(() => false)) return true; await sleep(150); } throw new Error('timeout waiting for ' + expr); };
  const close = () => { try { send('Browser.close').catch(() => {}); } catch { } setTimeout(() => { try { proc.kill(); } catch { } try { fs.rmSync(profile, { recursive: true, force: true }); } catch { } }, 1500); };
  return { proc, send, evaluate, waitFor, on: f => listeners.push(f), close };
}

function serve(root, port, handlers = {}) {
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.json': 'application/json', '.mp4': 'video/mp4' };
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    if (handlers[url.pathname]) return handlers[url.pathname](req, res, url);
    const file = path.join(root, decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname));
    if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise(r => server.listen(port, '127.0.0.1', () => r(server)));
}

module.exports = { launch, serve, sleep };
