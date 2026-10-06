# CanopyAI Launch Film

A 100-second, self-playing 3D launch film for CanopyAI, built for LinkedIn (1920×1080, 60 fps, H.264, with sound).
It's one continuous three.js camera journey with a GSAP overlay, with bold type, mono labels
and no on-screen chrome. It uses Canopy's own colours (`#00ffa3` on `#030705`),
the logo extruded into 3D, and the product's fonts (Space Grotesk, Inter, JetBrains Mono).

## Prompt

The single prompt that recreates this project. Replace the parts in `<angle brackets>`.

```text
Make a launch video for my product, <PRODUCT NAME>. I'll post it on LinkedIn.

INPUTS
- Product code: <path to repo>. Read the README, any docs, the frontend styles
  and the extension/app code. Explain what the product does, how it works, every main
  feature and the tech stack. Use my real feature names, but keep it short. Don't
  invent features.
- Screenshots: <path to screenshots folder>. Put the real UI in the video.
- Style reference: <path to a sample project/video, or links>. Match its feel. You can
  also look online for more references.
- Brand: use my exact colors, logo and fonts, taken from the code (CSS/Tailwind
  config, logo file). Turn the logo into real 3D geometry, not a flat image.

FORMAT
- One HTML page, 1920x1080. It plays by itself, with no keys or clicks to move forward
  or back.
- Make one double-click run file (run.bat). It should open the page fullscreen,
  record it, play the film once and save a finished MP4 (H.264, constant 60 fps,
  sound included). I shouldn't have to do anything while it runs.
- Length: about 90 to 100 seconds. Long enough to cover everything, but don't rush
  any slide.

VISUALS
- One continuous 3D camera journey (three.js + GSAP), with smooth, clean
  animation. Use plenty of 3D: particles that form the logo, glowing columns that
  rise from a floor, glossy floating balls, a 3D knowledge graph, a carousel of my
  screenshots, a particle globe, and moving data along lines between parts.
- Show screenshots and mock UI as 3D cards. Animate key moments: text typing out,
  hints popping up, numbers counting.
- No text or labels pinned in the screen corners, and no buttons or links on the end
  card. End on the logo, a tagline and "Built by <NAME>".

WRITING
- Plain, human language. No em dashes, no buzzwords, no "operating system for X" lines.
  Short sentences that a non-developer would understand.

AUDIO
- Download free music and sound effects that allow commercial use (for example from
  Mixkit), and check the license. List every file and its source in a credits file.
- Use energetic tech or product-demo music. Add whooshes on camera moves, clicks
  and pops on interface elements, typing under typed text, and an impact when the
  logo reveals.
- Time every sound to its exact moment in the film. Make the music dip under the
  sound effects, and set the overall loudness to suit LinkedIn (about -14 LUFS).

QUALITY CHECKS (do these before telling me it's done)
- Take still frames of every scene and look at them. Fix any text overlapping 3D
  objects, objects cut off by the frame, faint particles, and anything that renders
  flat when it should be 3D.
- Measure the final video's length, frame rate and loudness, and check that the sound
  hits line up with the picture.
- Clean up: delete test images and unused files, keep only assets the film uses,
  add a .gitignore (ignore the rendered video) and a README explaining how to run and
  edit it. Don't run any git commands.
```

## Make the video

**Double-click `run.bat`** (or run `npm start` / `node run.js`).

1. Chrome opens fullscreen.
2. It starts recording itself.
3. The film plays once (about 100 s) with no keys or clicks.
4. ffmpeg mixes the soundtrack (music plus sound effects).
5. The video is saved to **`output/canopy-launch.mp4`** and the folder opens.

| Command | What it does |
|---|---|
| `node run.js --music track.mp3` | swaps in your own music; the sound effects stay (or drag the file onto `run.bat`) |
| `node run.js --silent` | exports without a soundtrack |
| `node run.js --headless` | renders off-screen, so your display stays free |
| `node run.js --end 8` | records only the first 8 s, for a quick test |
| `node run.js --keep` | keeps the raw browser recording next to the MP4 |

Requirements: Node 22+, Chrome or Edge, and ffmpeg on `PATH` (or set `FFMPEG=C:\path\ffmpeg.exe`).
Your system already has all three.

**Without the script:** open `index.html` in Chrome and click **Start recording**. When Chrome asks
what to share, choose **this tab**. The page goes fullscreen, plays the film, and downloads
`canopy-launch.mp4` (or `.webm`) to your Downloads folder. `run.bat` gives the cleanest file,
because it re-encodes to constant 60 fps.

**Just watch it:** open `index.html?play` and click Play to watch the film with sound, without recording. `index.html?t=42` freezes
the film at 42 s.

## Sound

The soundtrack has two layers:
- **Music:** "Tech House Vibes" (about 123 BPM), timed so one of its beats lands on the logo reveal.
- **Sound effects:** about 90 cues. Whooshes play on every camera move, clicks and pops on UI
  elements, typing under the AI text, and impacts on the two logo moments.

The mix follows LinkedIn's playback level:
- The music dips briefly under each sound effect so the effects stay clear.
- The finished track sits at −14 LUFS with a peak of −2 dBTP.

All audio comes from Mixkit and is free for commercial use with no attribution needed.
See `assets/audio/CREDITS.md` for the full list.

| Task | How |
|---|---|
| Change a sound, its timing or its level | Edit the cue list in `lib/sound.js`. Each cue gives the time its main sound peaks. |
| Use different music | Drop an mp3 into `assets/audio/music/`, run `python tools/analyze_audio.py`, then set `MUSIC` in `lib/sound.js` to its file name. |
| Add new audio files | Put them in `assets/audio/` and run `python tools/analyze_audio.py`. |
| Re-mix sound onto an existing video, without re-recording | `node tools/mix.js output/canopy-launch.mp4` |

## The film (14 beats)

| # | Time | Beat | What it shows |
|---|---|---|---|
| 01 | 0:00 | The hook | "You've fixed this bug before. You just can't remember how." |
| 02 | 0:06 | The problem | Notes, fixes and components float, then dissolve: "Engineering knowledge disappears." |
| 03 | 0:13 | Introducing | Particles swarm into the 3D Canopy logo: "It remembers what you built, and why." |
| 04 | 0:21 | How it works | Extension, Cognee memory core and dashboard, with glowing balls running along the data lines |
| 05 | 0:28 | Capture | Real extension screenshots, while columns rise and glossy balls float behind them |
| 06 | 0:36 | Ambient context | Editor with a "Solved before" hint and the Context tab |
| 07 | 0:43 | AI chat | An answer that shows where each fact came from |
| 08 | 0:50 | Edit with AI + Pre-Mortem | Reviewing a change file by file, plus a warning about past bugs |
| 09 | 0:58 | Memory graph | A 3D knowledge graph that grows node by node |
| 10 | 1:06 | Dashboard | A 3D carousel of the real dashboard screenshots |
| 11 | 1:13 | It adds up | A city of columns rises, balls pop out of the tallest and float up, then arcs link them |
| 12 | 1:21 | Under the hood | Layered stack: VS Code and dashboard, FastAPI, Neon PostgreSQL, Cognee, Groq to Cerebras to Gemini |
| 13 | 1:26 | Our one rule | A particle globe rises behind "Will this help you six months from now?" |
| 14 | 1:32 | End card | 3D logo, "Never lose what you've learned.", "Built by Aarav Gupta" |

## Editing

- **Words**: all on-screen copy is in `index.html`, with one `<section>` per beat.
- **Timing**: the `SCENES` table at the top of `app.js` sets when each beat starts.
  The `TIMELINE` block sets when each element animates. Everything is a function of time,
  so `?t=` previews always match the recording.
- **Look**: colours and type live in `:root` in `styles.css`.
- **Check frames**: `node tools/snap.js 10 25 60` saves stills to `output/snaps/`.

## Files

| Path | What |
|---|---|
| `index.html`, `styles.css`, `app.js` | the film |
| `run.js`, `run.bat` | record → export pipeline (uses the Chrome DevTools protocol; no npm installs) |
| `tools/cdp.js`, `tools/snap.js` | browser helpers and the still-frame renderer |
| `output/` | where the finished video goes (not tracked by Git) |
| `lib/` | three.js r149, GSAP 3.12, the logo vectorised into 3D outlines (`logo-shape.js`) and particle targets (`logo-points.js`), and the sound cue sheet (`sound.js`) with its measurements (`sound-meta.js`) |
| `assets/audio/` | music and sound effects (Mixkit) with `CREDITS.md` |
| `tools/mix.js`, `tools/analyze_audio.py` | soundtrack mixer (ffmpeg) and audio analyser (numpy) |
| `assets/` | the Canopy logo and the product screenshots used in the film |
| `fonts/` | Space Grotesk, Inter and JetBrains Mono, stored locally so recording works offline |

## Troubleshooting

- **"no recording arrived"**: close every Chrome window and run it again, so the script
  can start its own instance. If Chrome isn't in the usual place, set `CHROME_PATH`.
- **Choppy motion**: close heavy apps while recording. The film renders live on your GPU.
  `--headless` mode is the fallback.
- **Wrong size**: the recording follows your screen size, and the export scales it to
  1920×1080. On a screen smaller than 1080p, use `--headless`, which always renders at 1920×1080.
