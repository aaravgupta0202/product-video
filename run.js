#!/usr/bin/env node
/* One command: fullscreen → record → play the film → export output/canopy-launch.mp4
 *
 *   node run.js                     record the full film
 *   node run.js --music track.mp3   use your own music instead of the bundled track (sound effects stay)
 *   node run.js --silent            no soundtrack at all
 *   node run.js --end 8             record only the first 8 seconds (quick test)
 *   node run.js --keep              keep the raw browser recording next to the mp4
 *   node run.js --headless          render off-screen instead of taking over the display
 *
 * Needs: Node 22+, Chrome or Edge, ffmpeg on PATH (or FFMPEG=path\to\ffmpeg.exe).
 */
const fs = require('fs'), path = require('path');
const { spawnSync } = require('child_process');
const { launch, serve, sleep } = require('./tools/cdp');
const { buildSoundtrack } = require('./tools/mix');

const ROOT = __dirname, OUT = path.join(ROOT, 'output');
const argv = process.argv.slice(2), opt = n => { const i = argv.indexOf(n); return i >= 0 ? (argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : true) : null; };
const MUSIC = opt('--music'), END = opt('--end'), KEEP = !!opt('--keep'), HEADLESS = !!opt('--headless'), SILENT = !!opt('--silent');
const PORT = 8790, DEBUG_PORT = 9344;
const log = s => console.log(`[canopy] ${s}`);

function ffmpegPath() {
  if (process.env.FFMPEG && fs.existsSync(process.env.FFMPEG)) return process.env.FFMPEG;
  const r = spawnSync(process.platform === 'win32' ? 'where' : 'which', ['ffmpeg'], { encoding: 'utf8' });
  return r.status === 0 ? r.stdout.split(/\r?\n/)[0].trim() : null;
}

(async () => {
  const ffmpeg = ffmpegPath();
  if (!ffmpeg) log('ffmpeg not found — the raw recording will be saved but not converted to mp4.');
  if (MUSIC && !fs.existsSync(MUSIC)) { log(`music file not found: ${MUSIC}`); process.exit(1); }
  fs.mkdirSync(OUT, { recursive: true });
  const raw = path.join(OUT, 'recording.part');
  fs.writeFileSync(raw, '');

  let bytes = 0, resolveDone;
  const done = new Promise(r => resolveDone = r);
  const server = await serve(ROOT, PORT, {
    '/chunk': (req, res) => { const ws = fs.createWriteStream(raw, { flags: 'a' }); req.on('data', c => bytes += c.length); req.pipe(ws); ws.on('finish', () => { res.writeHead(204); res.end(); }); },
    '/done': (req, res, url) => { res.writeHead(204); res.end(); resolveDone(Object.fromEntries(url.searchParams)); }
  });

  const url = `http://127.0.0.1:${PORT}/index.html?auto&upload${END ? '&end=' + END : ''}`;
  log('opening the film fullscreen…');
  const b = await launch([
    // headless reserves 18x96 px of window frame, so this window gives a 1920x1080 page
    ...(HEADLESS ? ['--headless=new', '--window-size=1938,1176'] : ['--kiosk', '--start-fullscreen']),
    '--auto-accept-this-tab-capture', '--auto-select-tab-capture-source-by-title=CanopyAI',
    '--autoplay-policy=no-user-gesture-required',
    '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows',
    '--disable-features=Translate,MediaRouter', '--hide-crash-restore-bubble', '--noerrdialogs', '--disable-infobars',
    url], DEBUG_PORT);
  b.on(m => { if (m.method === 'Runtime.exceptionThrown') log('page error: ' + (m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text)); });
  await b.send('Runtime.enable');
  await b.waitFor('window.__ready === true', 90000);
  await sleep(800);

  // a real (trusted) click so fullscreen and screen capture are allowed
  const [w, h] = await b.evaluate('[innerWidth, innerHeight]');
  for (const type of ['mousePressed', 'mouseReleased'])
    await b.send('Input.dispatchMouseEvent', { type, x: Math.round(w / 2), y: Math.round(h / 2), button: 'left', clickCount: 1 });
  log(`recording at ${w}x${h} — sit back, the film plays once (~${END || 100}s).`);

  const tick = setInterval(() => process.stdout.write(`\r[canopy] captured ${(bytes / 1048576).toFixed(1)} MB   `), 1000);
  const info = await Promise.race([done, sleep(((+END || 100) + 90) * 1000).then(() => null)]);
  clearInterval(tick); process.stdout.write('\n');
  b.close(); server.close();
  if (!info || !bytes) { log(`no recording arrived (${(bytes / 1048576).toFixed(1)} MB received, finished: ${!!info}). See README.md, Troubleshooting.`); process.exit(1); }

  const rawFile = path.join(OUT, `recording.${info.ext}`);
  fs.renameSync(raw, rawFile);
  if (!ffmpeg) { log(`saved ${rawFile}`); process.exit(0); }

  const dur = +info.dur, lead = Math.max(0, +info.lead || 0), final = path.join(OUT, 'canopy-launch.mp4');
  let soundtrack = null;
  if (!SILENT) {
    log('mixing the soundtrack (music + sound effects)…');
    soundtrack = buildSoundtrack({ ffmpeg, out: path.join(OUT, 'soundtrack.wav'), dur, music: MUSIC && MUSIC !== true ? MUSIC : null });
  }
  log('encoding H.264 mp4 for LinkedIn…');
  // Chrome's recordings are variable-frame-rate with an odd timebase: re-time, then force constant 60 fps.
  // The soundtrack is offset by the same lead so that cutting the lead keeps picture and sound in sync.
  const tmp = path.join(OUT, 'canopy-launch.encoding.mp4');
  const args = ['-y', '-hide_banner', '-loglevel', 'error', '-stats', '-i', rawFile];
  if (soundtrack) args.push('-itsoffset', String(lead), '-i', soundtrack);
  args.push('-ss', String(lead), '-t', String(dur), '-vf',
    'settb=AVTB,setpts=PTS-STARTPTS,scale=1920:1080:force_original_aspect_ratio=decrease:flags=lanczos,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:color=0x030705,setsar=1,format=yuv420p',
    '-fps_mode', 'cfr', '-r', '60', '-c:v', 'libx264', '-preset', 'slow', '-crf', '17', '-profile:v', 'high', '-level', '4.2', '-movflags', '+faststart');
  if (soundtrack) args.push('-map', '0:v', '-map', '1:a', '-c:a', 'aac', '-b:a', '256k', '-ar', '48000');
  else args.push('-an');
  args.push(tmp);
  const r = spawnSync(ffmpeg, args, { stdio: 'inherit' });
  if (r.status !== 0) { log('ffmpeg failed; the raw recording is kept at ' + rawFile); process.exit(1); }
  if (!KEEP) fs.rmSync(rawFile, { force: true });
  let saved = final;
  try { fs.renameSync(tmp, final); } catch { saved = tmp; log(`${final} is open in another program, so the new film was saved as ${tmp}`); }
  log(`done → ${saved}`);
  if (process.platform === 'win32' && !END) spawnSync('explorer', ['/select,', saved]);
  setTimeout(() => process.exit(0), 300);
})().catch(e => { console.error(e); process.exit(1); });
