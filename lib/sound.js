/* The film's sound design. Shared by the page (live playback) and run.js / tools/mix.js (ffmpeg mix).
 *
 * Each cue: [clip, t, gain, opts]
 *   clip  file name in assets/audio/sfx (no extension)
 *   t     film time (s) at which the clip's transient should land; lib/sound-meta.js knows where the
 *         transient sits inside each file, so a cue starts that much earlier
 *   gain  0..1 relative level (clips are loudness-normalised first)
 *   opts  { len: seconds to play (trimmed clips fade out), from: seconds into the file to start (e.g. typing) }
 *
 * Camera flights are expo.inOut, so their whooshes land at the middle of the flight (fastest point).
 * All sounds are from Mixkit (https://mixkit.co/license/#sfxFree): free for commercial use, no attribution needed.
 */
(function (root) {
const META = typeof module !== 'undefined' ? require('./sound-meta.js') : root.SOUND_META;
const MUSIC = 'tech-house-vibes';        // file name in assets/audio/music (no extension)
const BEAT_ON = 16.3;                     // put a beat exactly on the logo locking into place
const m = META.music[MUSIC];
const flight = (start, dur) => start + dur / 2;
const stagger = (clip, t0, n, step, gain, opts) => Array.from({ length: n }, (_, i) => [clip, t0 + i * step, gain, opts]);

const CUES = [
  // 01 hook
  ['click-tone', .55, .52],
  ['swish-short', 1.0, .32],
  ['swish-wind', 3.1, .30],
  // 02 problem
  ['whoosh-cinematic', 6.6, .34],
  ['swish-short', 7.1, .28],
  ...stagger('pop-light', 7.55, 4, .2, .45),
  ['woosh-tunnel', 10.6, .32, { len: 3.0 }],
  ['whoosh-ghost', 11.9, .20],
  // 03 logo reveal
  ['whoosh-fast', flight(13.0, 2.2), .33],
  ['sparkle', 13.9, .18],
  ['energy-flow', 15.0, .18, { len: 2.4 }],
  ['impact-intro', 16.3, .56, { len: 3.6 }],
  ['tech-select', 16.75, .2],
  // 04 how it works
  ['swoosh-fast', flight(20.6, 2.2), .39],
  ...stagger('pop-hard', 21.75, 3, .25, .32),
  ['swish-short', 22.05, .25],
  ...stagger('click-soft', 23.35, 3, .2, .26),
  ...stagger('click-select', 24.5, 5, .55, .38),
  // 05 capture
  ['sweep-small', flight(28.1, 2.2), .28],
  ['swish-wind', 29.2, .28],
  ['sweep-air', 29.45, .34],
  ['power-up', 29.6, .12],
  ...stagger('pop-hard', 30.55, 4, .12, .22),
  // 06 ambient context
  ['whoosh-cinematic', flight(35.6, 1.8), .33],
  ['sweep-air', 36.85, .34],
  ['click-tone', 38.0, .51],
  ['hint', 38.45, .34],
  ['swish-wind', 39.4, .26],
  // 07 AI chat
  ['swoosh-fast', flight(42.6, 1.8), .35],
  ['sweep-air', 43.85, .32],
  ['pop-long', 44.55, .65],
  ['typing-soft', 45.2, .66, { from: 1.0, len: 2.95 }],
  ...stagger('click-check', 48.25, 2, .15, .30),
  ['click-select', 48.9, .46],
  // 08 edit with AI + pre-mortem
  ['whoosh-fast', flight(50.1, 1.8), .28],
  ['sweep-air', 51.35, .32],
  ['typing-soft', 51.9, .62, { from: 6.0, len: 1.3 }],
  ...stagger('pop-light', 53.35, 4, .11, .28),
  ['click-tone', 54.45, .63],
  ['swish-wind', 55.1, .26],
  ['hint', 55.2, .24],
  ['confirm', 56.15, .36],
  // 09 memory graph
  ['whoosh-cinematic', flight(57.6, 2.4), .37],
  ['power-up', 58.9, .16],
  ['energy-flow', 59.4, .17, { len: 3.0 }],
  ...stagger('pop-hard', 60.65, 4, .12, .20),
  // 10 dashboard
  ['sweep-small', flight(65.6, 2.2), .28],
  ['swoosh-fast', 66.6, .27],
  ['swish-wind', 68.4, .22],
  // 11 it adds up: columns rise, balls pop out and float, arcs link them
  ['whoosh-cinematic', flight(73.1, 2.2), .37],
  ['swish-short', 74.15, .28],
  ['power-up', 74.6, .2],
  ...stagger('pop-light', 75.45, 9, .2, .3),
  ['sparkle', 77.4, .14],
  ['energy-flow', 77.6, .15, { len: 2.4 }],
  // 12 under the hood
  ['whoosh-fast', flight(80.6, 2.2), .30],
  ...stagger('click-check', 81.75, 5, .14, .28),
  ...stagger('click-soft', 82.45, 5, .13, .20),
  // 13 vision
  ['woosh-tunnel', flight(86.2, 2.2) - .4, .30],
  ['energy-flow', 87.4, .16, { len: 3.0 }],
  ['swish-short', 87.5, .28],
  ['tech-select', 89.55, .15],
  // 14 CTA
  ['whoosh-fast', flight(91.6, 2.4), .30],
  ['sparkle', 92.5, .17],
  ['impact-logo', 94, .34],
  ['tech-select', 94.45, .17],
  ['click-soft', 95.75, .22],
];

const SOUND = {
  music: {
    clip: MUSIC,
    // seek into the track so one of its beats lands on BEAT_ON
    offset: +(((m.phase - BEAT_ON) % m.beat + m.beat) % m.beat).toFixed(4),
    gain: .34, fadeIn: 2.2, fadeOut: 3.2
  },
  cues: CUES.map(([clip, t, gain, opts = {}]) => {
    const s = META.sfx[clip];
    if (!s) throw new Error('unknown sound clip: ' + clip);
    const from = opts.from || 0, hit = opts.from != null ? 0 : s.hit;
    return { clip, t, at: +(t - hit).toFixed(3), from, len: opts.len || +(s.dur - from).toFixed(3), gain: +(gain * s.norm).toFixed(3), trim: !!(opts.len || opts.from) };
  })
};

if (typeof module !== 'undefined') module.exports = SOUND; else root.SOUND = SOUND;
})(this);
