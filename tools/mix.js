// Builds the film's soundtrack from lib/sound.js with ffmpeg (sample-accurate, unlike recording tab audio).
//
//   node tools/mix.js                       → output/soundtrack.wav
//   node tools/mix.js output/canopy-launch.mp4   → also puts the soundtrack on that video (video is not re-encoded)
//   add --music path/to/track.mp3 to use your own music bed instead of the bundled one
const fs = require('fs'), path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const AUDIO = path.join(ROOT, 'assets', 'audio');
const FX_GAIN = 2.4;   // level of the effects bus against the music bed

function ffmpegPath() {
  if (process.env.FFMPEG && fs.existsSync(process.env.FFMPEG)) return process.env.FFMPEG;
  const r = spawnSync(process.platform === 'win32' ? 'where' : 'which', ['ffmpeg'], { encoding: 'utf8' });
  return r.status === 0 ? r.stdout.split(/\r?\n/)[0].trim() : null;
}

/** Render the soundtrack to `out` (wav). `dur` = film length, `music` = optional custom music file. */
function buildSoundtrack({ ffmpeg = ffmpegPath(), out, dur = 99.5, music = null, stems = false }) {
  delete require.cache[require.resolve('../lib/sound.js')];
  const SOUND = require('../lib/sound.js');
  const fmt = 'aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo';
  const inputs = [], filters = [], labels = [];

  const mus = SOUND.music;
  inputs.push('-i', music || path.join(AUDIO, 'music', mus.clip + '.mp3'));
  filters.push(`[0:a]${fmt},atrim=start=${music ? 0 : mus.offset},asetpts=PTS-STARTPTS,atrim=duration=${dur},` +
    `volume=${mus.gain},afade=t=in:d=${mus.fadeIn},afade=t=out:st=${(dur - mus.fadeOut).toFixed(3)}:d=${mus.fadeOut}[m]`);
  labels.push('[m]');

  SOUND.cues.filter(c => c.t < dur).forEach((c, i) => {
    let at = c.at, from = c.from, len = c.len;
    if (at < 0) { from -= at; len += at; at = 0; }
    const trimmed = c.trim || at !== c.at;
    const k = i + 1;
    inputs.push('-i', path.join(AUDIO, 'sfx', c.clip + '.mp3'));
    filters.push(`[${k}:a]${fmt},atrim=start=${from.toFixed(3)}:duration=${len.toFixed(3)},asetpts=PTS-STARTPTS,` +
      (trimmed ? `afade=t=in:d=0.04,afade=t=out:st=${Math.max(0, len - .2).toFixed(3)}:d=0.2,` : '') +
      `volume=${c.gain},adelay=${Math.round(at * 1000)}:all=1[c${k}]`);
    labels.push(`[c${k}]`);
  });

  // all effects on one bus; the music ducks under that bus (sidechain) so every whoosh and click reads clearly
  const pad = `atrim=duration=${dur},apad=whole_dur=${dur}`;
  filters.push(`${labels.slice(1).join('')}amix=inputs=${labels.length - 1}:normalize=0:dropout_transition=0,volume=${FX_GAIN},${pad},asplit=2[fx][fxkey]`);
  filters.push(`[m][fxkey]sidechaincompress=threshold=0.04:ratio=5:attack=4:release=280:makeup=1[md]`);
  if (stems) {
    filters.push(`[md]${pad}[mstem]`, `[fx]anull[fxstem]`);
  } else {
    filters.push(`[md][fx]amix=inputs=2:normalize=0:dropout_transition=0,${pad},` +
      `alimiter=limit=0.84:attack=3:release=60,loudnorm=I=-14:TP=-2:LRA=11,aresample=48000[out]`);
  }

  const script = path.join(path.dirname(out), 'soundtrack.filter.txt');
  fs.writeFileSync(script, filters.join(';\n'));
  const r = spawnSync(ffmpeg, ['-y', '-hide_banner', '-loglevel', 'error', ...inputs, '-/filter_complex', script,
    ...(stems ? ['-map', '[mstem]', '-c:a', 'pcm_s16le', '-ar', '48000', out.replace(/\.wav$/, '.music.wav'),
                 '-map', '[fxstem]', '-c:a', 'pcm_s16le', '-ar', '48000', out.replace(/\.wav$/, '.fx.wav')]
              : ['-map', '[out]', '-c:a', 'pcm_s16le', '-ar', '48000', out])], { stdio: 'inherit' });
  fs.rmSync(script, { force: true });
  if (r.status !== 0) throw new Error('ffmpeg failed while mixing the soundtrack');
  return out;
}

module.exports = { buildSoundtrack, ffmpegPath };

if (require.main === module) {
  const argv = process.argv.slice(2);
  const mi = argv.indexOf('--music'), music = mi >= 0 ? argv.splice(mi, 2)[1] : null;
  const video = argv[0];
  const ffmpeg = ffmpegPath();
  if (!ffmpeg) { console.error('ffmpeg not found'); process.exit(1); }
  const outDir = path.join(ROOT, 'output'); fs.mkdirSync(outDir, { recursive: true });
  let dur = 99.5;
  if (video) {
    const p = spawnSync(ffmpeg.replace(/ffmpeg(\.exe)?$/i, 'ffprobe$1'), ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', video], { encoding: 'utf8' });
    if (p.status === 0 && +p.stdout) dur = +(+p.stdout).toFixed(3);
  }
  const wav = buildSoundtrack({ ffmpeg, out: path.join(outDir, 'soundtrack.wav'), dur, music });
  console.log('soundtrack →', wav);
  if (video) {
    const tmp = video.replace(/\.mp4$/i, '') + '.with-sound.mp4';
    const r = spawnSync(ffmpeg, ['-y', '-hide_banner', '-loglevel', 'error', '-i', video, '-i', wav, '-map', '0:v', '-map', '1:a',
      '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-shortest', '-movflags', '+faststart', tmp], { stdio: 'inherit' });
    if (r.status !== 0) process.exit(1);
    try { fs.renameSync(tmp, video); console.log('video with sound →', video); }
    catch (e) { console.log(`${video} is open in another program, so the new version was saved as ${tmp}`); }
  }
}
