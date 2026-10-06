/* CanopyAI launch film: one continuous 3D camera journey (three.js) with a GSAP-driven overlay.
   Everything is a pure function of time t, so playback, preview (?t=SECONDS) and recording all match. */
(() => {
'use strict';
const W = 1920, H = 1080, P = new URLSearchParams(location.search);
const AUTO = P.has('auto'), UPLOAD = P.has('upload');
const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const ease = { o3: p => 1 - Math.pow(1 - p, 3), io3: p => p < .5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2,
  back: p => { const c = 1.6; return 1 + (c + 1) * Math.pow(p - 1, 3) + c * Math.pow(p - 1, 2); } };
function rng(seed) { return () => { seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
  t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

/* ------------------------------------------------------------------ scenes */
const SCENES = [
  ['hook', 'The hook', 0], ['problem', 'The problem', 6.5], ['logo', 'Introducing', 13.3],
  ['surfaces', 'How it works', 21], ['capture', 'Capture', 28.5], ['ambient', 'Ambient context', 36],
  ['chat', 'AI chat', 43], ['edit', 'Edit with AI', 50.5], ['graph', 'Memory graph', 58],
  ['dash', 'Dashboard', 66], ['compound', 'It adds up', 73.5], ['stack', 'Under the hood', 81],
  ['vision', 'Our one rule', 86.5], ['cta', 'Get started', 92]];
const FILM = 99.5, END = P.has('end') ? +P.get('end') : FILM;
const at = id => SCENES.find(s => s[0] === id)[2];
const endOf = id => { const i = SCENES.findIndex(s => s[0] === id); return i + 1 < SCENES.length ? SCENES[i + 1][2] : FILM; };

/* ------------------------------------------------------------------ renderer */
const stage = $('#stage'), canvas = $('#gl');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: false });
renderer.setClearColor(0x030705, 1);
const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x030705, 0.021);
const camera = new THREE.PerspectiveCamera(38, W / H, 0.1, 700);
const PR = { value: 1 }, TIME = { value: 0 };

function fit() {
  const s = Math.min(innerWidth / W, innerHeight / H);
  stage.style.transform = `translate(${(innerWidth - W * s) / 2}px,${(innerHeight - H * s) / 2}px) scale(${s})`;
  renderer.setPixelRatio(Math.min(2.5, s * devicePixelRatio));
  renderer.setSize(W, H, false);
  PR.value = renderer.getPixelRatio();
}
addEventListener('resize', fit); fit();

const COL = { neon: 0x00ffa3, neon2: 0x00d085, leaf: 0x5d935d, issue: 0xf97316, note: 0x38bdf8, comp: 0xa78bfa, ink: 0xe9f1eb };

scene.add(new THREE.AmbientLight(0xffffff, .5));
scene.add(new THREE.HemisphereLight(0xbfffe6, 0x05140c, .55));
const key = new THREE.DirectionalLight(0xffffff, 1.15); key.position.set(4, 6, 10); scene.add(key);

/* soft round sprite */
const DOT = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(.22, 'rgba(255,255,255,.85)'); gr.addColorStop(.5, 'rgba(255,255,255,.22)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c); })();

/* generic glowing point cloud; positions/colors/sizes are plain arrays */
function pointsMaterial(extraVert = '', extraUniforms = {}) {
  return new THREE.ShaderMaterial({
    uniforms: Object.assign({ uTex: { value: DOT }, uPR: PR, uTime: TIME, uOpacity: { value: 1 } }, extraUniforms),
    vertexShader: `
      attribute float asize; attribute vec3 acol; attribute float aseed;
      uniform float uPR; uniform float uTime; varying vec3 vC; varying float vA;
      ${extraVert ? extraVert.split('//MAIN')[0] : ''}
      void main(){
        vec3 pos = position; float grow = 1.0;
        ${extraVert ? extraVert.split('//MAIN')[1] : ''}
        vec4 mv = modelViewMatrix * vec4(pos, 1.0);
        gl_Position = projectionMatrix * mv;
        vA = 0.72 + 0.28 * sin(uTime * 1.6 + aseed * 40.0);
        vC = acol;
        gl_PointSize = asize * grow * uPR * (420.0 / -mv.z);
      }`,
    fragmentShader: `
      uniform sampler2D uTex; uniform float uOpacity; varying vec3 vC; varying float vA;
      void main(){ float a = texture2D(uTex, gl_PointCoord).a * uOpacity * vA; if(a < 0.003) discard; gl_FragColor = vec4(vC, a); }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending
  });
}
function pointsGeo(pos, col, size, seed) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('acol', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('asize', new THREE.Float32BufferAttribute(size, 1));
  g.setAttribute('aseed', new THREE.Float32BufferAttribute(seed, 1));
  return g;
}
const rgb = hex => { const c = new THREE.Color(hex); return [c.r, c.g, c.b]; };
function halo(color, scale, opacity) {
  const m = new THREE.Sprite(new THREE.SpriteMaterial({ map: DOT, color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false }));
  m.scale.set(scale, scale, 1); return m;
}
function lineMat(color, opacity) { return new THREE.LineBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false }); }

/* ------------------------------------------------------------------ world: stars */
{
  const r = rng(11), pos = [], col = [], size = [], seed = [];
  for (let i = 0; i < 5200; i++) {
    let x = (r() - .5) * 150, y = (r() - .5) * 90;
    if (Math.abs(x) < 3 && Math.abs(y) < 2.5) x += Math.sign(x || 1) * 4;
    pos.push(x, y, 30 - r() * 420);
    const k = r(); col.push(...(k < .5 ? rgb(COL.neon).map(v => v * (.35 + r() * .5)) : k < .82 ? rgb(COL.leaf) : [.8, .92, .86]));
    size.push(r() < .03 ? .45 + r() * .3 : .05 + r() * .16); seed.push(r());
  }
  const m = pointsMaterial(); m.uniforms.uOpacity.value = .6;
  scene.add(new THREE.Points(pointsGeo(pos, col, size, seed), m));
}

/* ------------------------------------------------------------------ station A: memory shards (hook + problem) */
const A = new THREE.Group(); scene.add(A);
const shardTex = (() => { const c = document.createElement('canvas'); c.width = 320; c.height = 200; const g = c.getContext('2d');
  const rr = (x, y, w, h, r) => { g.beginPath(); g.roundRect(x, y, w, h, r); };
  rr(4, 4, 312, 192, 22); g.fillStyle = 'rgba(255,255,255,.07)'; g.fill(); g.lineWidth = 3; g.strokeStyle = 'rgba(255,255,255,.75)'; g.stroke();
  rr(26, 26, 90, 22, 8); g.fillStyle = 'rgba(255,255,255,.85)'; g.fill();
  g.fillStyle = 'rgba(255,255,255,.45)'; rr(26, 72, 230, 16, 6); g.fill(); rr(26, 102, 180, 12, 5); g.fill();
  g.fillStyle = 'rgba(255,255,255,.22)'; rr(26, 140, 120, 10, 4); g.fill();
  return new THREE.CanvasTexture(c); })();
const SHARDS = [];
const shardMesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1.3, .81),
  new THREE.MeshBasicMaterial({ map: shardTex, transparent: true, opacity: .55, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }), 110);
{
  const r = rng(5), pal = [COL.note, COL.issue, COL.comp, COL.neon, COL.neon];
  for (let i = 0; i < 110; i++) {
    let x = (r() - .5) * 34, y = (r() - .5) * 16; const z = -14 + r() * 16;
    if (Math.abs(x) < 7 && Math.abs(y) < 3.2 && z > -4) z < 0 ? null : (y += Math.sign(y || 1) * 3);
    SHARDS.push({ x, y, z, rx: r() * 6, ry: r() * 6, sp: .1 + r() * .25, d: r(), s: .6 + r() * .7 });
    shardMesh.setColorAt(i, new THREE.Color(pal[i % pal.length]));
  }
  A.add(shardMesh);
}
const dummy = new THREE.Object3D();
const shardState = { dissolve: 0, opacity: .55 };

/* ------------------------------------------------------------------ logo geometry (vectorised from assets/logo.png) */
function logoGeometry() {
  const shapes = LOGO_SHAPES.map(s => {
    const sh = new THREE.Shape(s.o.map(p => new THREE.Vector2(p[0], p[1])));
    s.h.forEach(h => sh.holes.push(new THREE.Path(h.map(p => new THREE.Vector2(p[0], p[1])))));
    return sh;
  });
  const g = new THREE.ExtrudeGeometry(shapes, { depth: .16, bevelEnabled: true, bevelThickness: .03, bevelSize: .012, bevelSegments: 3, curveSegments: 6 });
  g.translate(0, 0, -.08); return g;
}
const LOGO_GEO = logoGeometry();
function makeLogo(scale) {
  const g = new THREE.Group();
  const front = new THREE.MeshStandardMaterial({ color: 0x67a867, emissive: 0x123f22, roughness: .32, metalness: .25, transparent: true, opacity: 0 });
  const side = new THREE.MeshStandardMaterial({ color: 0x1c3b25, emissive: 0x00ffa3, emissiveIntensity: .22, roughness: .4, metalness: .55, transparent: true, opacity: 0 });
  const mesh = new THREE.Mesh(LOGO_GEO, [front, side]); mesh.scale.setScalar(scale); g.add(mesh);
  const glow = halo(COL.neon, scale * 5.2, 0); glow.position.z = -1.2; g.add(glow);
  const rim = new THREE.PointLight(COL.neon, 0, 14, 1.2); rim.position.set(0, 0, -2.5); g.add(rim);
  const fillL = new THREE.PointLight(0xbfffe0, 0, 16, 1.3); fillL.position.set(-3, 2, 5); g.add(fillL);
  // converging particles sampled from the logo's pixels
  const r = rng(Math.round(scale * 1000)), N = LOGO_POINTS.length, start = [], end = [], col = [], size = [], seed = [], delay = [];
  for (let i = 0; i < N; i++) {
    const [px, py] = LOGO_POINTS[i];
    end.push(px * scale, py * scale, (r() - .5) * .14);
    const th = r() * Math.PI * 2, ph = Math.acos(2 * r() - 1), rad = 7 + r() * 11;
    start.push(rad * Math.sin(ph) * Math.cos(th), rad * Math.sin(ph) * Math.sin(th) * .6, rad * Math.cos(ph) - 2);
    col.push(...(r() < .7 ? rgb(COL.neon) : rgb(0xcfffe9))); size.push(.06 + r() * .07); seed.push(r()); delay.push(r());
  }
  const geo = pointsGeo(start, col, size, seed);
  geo.setAttribute('aEnd', new THREE.Float32BufferAttribute(end, 3));
  geo.setAttribute('aDelay', new THREE.Float32BufferAttribute(delay, 1));
  const pm = pointsMaterial(`attribute vec3 aEnd; attribute float aDelay; uniform float uP;
    //MAIN
    float p = clamp((uP - aDelay * .35) / .65, 0.0, 1.0);
    p = p < .5 ? 4.0 * p * p * p : 1.0 - pow(-2.0 * p + 2.0, 3.0) / 2.0;
    float ang = (1.0 - p) * 2.6;
    vec3 s = vec3(pos.x * cos(ang) - pos.z * sin(ang), pos.y, pos.x * sin(ang) + pos.z * cos(ang));
    pos = mix(s, aEnd, p);
    grow = 1.0 + (1.0 - p) * 1.4;`, { uP: { value: 0 } });
  pm.uniforms.uOpacity.value = 0;
  const pts = new THREE.Points(geo, pm); g.add(pts);
  return { g, mesh, front, side, glow, rim, fillL, pts, u: pm.uniforms, _o: 0, get opacity() { return this._o; },
    set opacity(v) { this._o = v; front.opacity = side.opacity = v; front.transparent = side.transparent = v < 1; mesh.visible = v > .001; } };
}

/* station B: the reveal */
const LOGO1 = makeLogo(1.5); LOGO1.g.position.set(0, 1.38, -40); scene.add(LOGO1.g);
/* station I: the end card */
const LOGO2 = makeLogo(1.35); LOGO2.g.position.set(0, 1.05, -340); scene.add(LOGO2.g);
const orbit = (() => {
  const r = rng(77), pos = [], col = [], size = [], seed = [];
  for (let i = 0; i < 700; i++) { const a = r() * Math.PI * 2, rad = 3.3 + (r() - .5) * .9;
    pos.push(Math.cos(a) * rad, (r() - .5) * .25, Math.sin(a) * rad); col.push(...rgb(r() < .8 ? COL.neon : 0xffffff)); size.push(.03 + r() * .05); seed.push(r()); }
  const m = pointsMaterial(); m.uniforms.uOpacity.value = 0;
  const p = new THREE.Points(pointsGeo(pos, col, size, seed), m); p.rotation.x = .32; LOGO2.g.add(p); return p;
})();

/* ------------------------------------------------------------------ UI textures (procedural, never tainted) */
function uiTexture(kind) {
  const c = document.createElement('canvas'); c.width = 1024; c.height = 660; const g = c.getContext('2d');
  const rr = (x, y, w, h, r, f) => { g.beginPath(); g.roundRect(x, y, w, h, r); g.fillStyle = f; g.fill(); };
  rr(0, 0, 1024, 660, 26, '#0a100e');
  g.fillStyle = '#070b09'; g.fillRect(0, 0, 1024, 44);
  ['#2a3530', '#2a3530', '#2a3530'].forEach((f, i) => { g.beginPath(); g.arc(28 + i * 22, 22, 7, 0, 7); g.fillStyle = f; g.fill(); });
  const r = rng(kind === 'editor' ? 3 : 9);
  if (kind === 'editor') {
    g.fillStyle = '#080d0b'; g.fillRect(0, 44, 56, 616);
    for (let i = 0; i < 5; i++) rr(16, 70 + i * 52, 24, 24, 6, i === 2 ? '#00ffa3' : '#1d2723');
    g.fillStyle = '#0c1411'; g.fillRect(56, 44, 250, 616);
    rr(76, 66, 120, 14, 5, '#e9f1eb55');
    [['#f97316', 3], ['#38bdf8', 2], ['#38bdf8', 1], ['#a78bfa', 1], ['#00ffa3', 2]].forEach(([f, n], i) => {
      const y = 104 + i * 104; rr(72, y, 218, 92, 12, '#111b17'); rr(86, y + 14, 90, 12, 4, f);
      for (let k = 0; k < n; k++) rr(86, y + 38 + k * 16, 190, 10, 4, f + '88');
    });
    const syn = ['#c792ea', '#82aaff', '#c3e88d', '#ffcb6b', '#89ddff', '#e9f1eb'];
    for (let i = 0; i < 18; i++) {
      const y = 70 + i * 32; if (i === 7) { g.fillStyle = 'rgba(0,255,163,.12)'; g.fillRect(306, y - 8, 718, 30); g.fillStyle = '#00ffa3'; g.fillRect(306, y - 8, 4, 30); }
      rr(326, y, 22, 12, 3, '#26332d'); let x = 370 + (i % 4 === 0 ? 0 : 28 * (1 + (i % 3)));
      if (i % 6 === 5) continue;
      const n = 2 + Math.floor(r() * 4); for (let k = 0; k < n; k++) { const w = 30 + r() * 120; rr(x, y, w, 12, 4, syn[Math.floor(r() * syn.length)]); x += w + 12; }
    }
  } else {
    g.fillStyle = '#080d0b'; g.fillRect(0, 44, 200, 616);
    for (let i = 0; i < 9; i++) rr(20, 70 + i * 48, i === 0 ? 160 : 120, 16, 6, i === 0 ? '#00ffa3' : '#1f2925');
    rr(230, 70, 300, 30, 8, '#e9f1eb');
    const sc = ['#00ffa3', '#f97316', '#38bdf8', '#a78bfa'];
    for (let i = 0; i < 4; i++) { rr(230 + i * 196, 126, 180, 104, 14, '#101a16'); rr(248 + i * 196, 146, 30, 30, 8, sc[i] + '55'); rr(248 + i * 196, 192, 70 + r() * 50, 20, 6, sc[i]); }
    rr(230, 254, 470, 380, 16, '#101a16');
    for (let i = 0; i < 7; i++) { g.beginPath(); g.arc(258, 290 + i * 48, 7, 0, 7); g.fillStyle = sc[i % 4]; g.fill(); rr(280, 283 + i * 48, 200 + r() * 180, 14, 5, '#e9f1eb44'); }
    rr(720, 254, 278, 380, 16, '#101a16');
    const nodes = []; for (let i = 0; i < 9; i++) nodes.push([760 + r() * 200, 290 + r() * 310]);
    g.strokeStyle = 'rgba(0,255,163,.35)'; g.lineWidth = 2;
    nodes.forEach((n, i) => { if (i) { g.beginPath(); g.moveTo(...nodes[0]); g.lineTo(...n); g.stroke(); } });
    nodes.forEach((n, i) => { g.beginPath(); g.arc(n[0], n[1], i ? 8 : 14, 0, 7); g.fillStyle = i ? sc[i % 4] : '#00ffa3'; g.fill(); });
  }
  const t = new THREE.CanvasTexture(c); t.anisotropy = renderer.capabilities.getMaxAnisotropy(); return t;
}

/* ------------------------------------------------------------------ glowing columns (risers), instanced
   Base sits at y = 0 and the box is 1 unit tall, so instance scale.y is the column height. Sides fade from
   dark to the column colour, the top face glows, and distance fog matches the scene. */
const COLUMN_GEO = new THREE.BoxGeometry(1, 1, 1).translate(0, .5, 0);
const columnMat = new THREE.ShaderMaterial({
  vertexShader: `varying vec3 vC; varying float vY; varying vec3 vN; varying float vD;
    void main(){ vY = position.y; vC = vec3(0., 1., .64);
      #ifdef USE_INSTANCING_COLOR
        vC = instanceColor;
      #endif
      vN = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * normal);
      vec4 mv = modelViewMatrix * instanceMatrix * vec4(position, 1.0); vD = -mv.z; gl_Position = projectionMatrix * mv; }`,
  fragmentShader: `varying vec3 vC; varying float vY; varying vec3 vN; varying float vD;
    void main(){ float top = step(.999, vY), grad = pow(clamp(vY, 0., 1.), 2.2);
      float l = .45 + .55 * max(dot(normalize(vN), normalize(vec3(.35, .9, .45))), 0.);
      vec3 c = vec3(.03, .06, .05) * l + vC * (.05 + .45 * grad) * l + vC * top * .85;
      float f = 1. - exp(-pow(.021 * vD, 2.));
      gl_FragColor = vec4(mix(c, vec3(.012, .027, .02), f), 1.); }`
});
function columns(list) {           // list: [{ color }]; uses three's built-in instanceColor
  const mesh = new THREE.InstancedMesh(COLUMN_GEO, columnMat, list.length); mesh.frustumCulled = false;
  list.forEach((c, i) => mesh.setColorAt(i, new THREE.Color(c.color)));
  return mesh;
}
const glossy = () => new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: .18, metalness: .35, emissive: 0x05140d });

/* ------------------------------------------------------------------ station C: three surfaces */
const C = new THREE.Group(); C.position.set(0, 0, -80); scene.add(C);
function screenSlab(tex, w, h) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(w + .1, h + .1, .1), new THREE.MeshStandardMaterial({ color: 0x0a1210, metalness: .5, roughness: .45 }));
  const scr = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex, transparent: true }));
  scr.position.z = .052;
  const edge = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(w + .1, h + .1, .1)), lineMat(COL.neon, .55));
  g.add(body, scr, edge); return { g, scr, edge };
}
const EXT = new THREE.Group(); EXT.position.set(-5.3, -.15, 0); EXT.rotation.y = .38; C.add(EXT);
const extSlab = screenSlab(uiTexture('editor'), 3.3, 2.12); EXT.add(extSlab.g);
const DASH = new THREE.Group(); DASH.position.set(5.3, -.15, 0); DASH.rotation.y = -.38; C.add(DASH);
const dashTex = uiTexture('dash');
for (let i = 2; i >= 0; i--) { const s = screenSlab(dashTex, 3.3, 2.12); s.g.position.set(i * .32, i * .26, -i * .45);
  s.scr.material.opacity = 1 - i * .35; s.edge.material.opacity = .55 - i * .15; DASH.add(s.g); }
const CORE = new THREE.Group(); CORE.position.set(0, .45, 0); C.add(CORE);
const coreWire = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.IcosahedronGeometry(1.3, 1)), lineMat(COL.neon, .6)); CORE.add(coreWire);
const coreIn = new THREE.Mesh(new THREE.IcosahedronGeometry(.78, 1), new THREE.MeshStandardMaterial({ color: 0x0c3d2a, emissive: 0x00ffa3, emissiveIntensity: .38, roughness: .35, metalness: .3, flatShading: true }));
CORE.add(coreIn);
{
  const v = new THREE.IcosahedronGeometry(1.3, 1).attributes.position, seen = new Set(), pos = [], col = [], size = [], seed = [];
  for (let i = 0; i < v.count; i++) { const k = [v.getX(i), v.getY(i), v.getZ(i)].map(n => n.toFixed(3)).join(); if (seen.has(k)) continue; seen.add(k);
    pos.push(v.getX(i), v.getY(i), v.getZ(i)); col.push(...rgb(COL.neon)); size.push(.16); seed.push(i / 40); }
  CORE.add(new THREE.Points(pointsGeo(pos, col, size, seed), pointsMaterial()));
  for (let i = 0; i < 2; i++) { const t = new THREE.Mesh(new THREE.TorusGeometry(1.95 + i * .35, .007, 6, 120), new THREE.MeshBasicMaterial({ color: COL.neon, transparent: true, opacity: .4, blending: THREE.AdditiveBlending }));
    t.rotation.set(1.2 + i * .5, i * .6, 0); t.name = 'ring' + i; CORE.add(t); }
  CORE.add(halo(COL.neon, 7, .28));
  const pl = new THREE.PointLight(COL.neon, 1.6, 10, 1.2); CORE.add(pl);
}
const FLOW_CURVES = [
  [[-3.6, -.1, .4], [-2.5, 1.6, .5], [-1.4, .55, 0]],
  [[1.4, .55, 0], [2.5, 1.6, .5], [3.6, -.1, .4]],
  [[3.8, -1.2, .3], [0, -2.0, .8], [-3.8, -1.2, .3]]
].map(p => new THREE.CatmullRomCurve3(p.map(q => new THREE.Vector3(...q))));
const flowTubes = FLOW_CURVES.map(c => { const m = new THREE.Mesh(new THREE.TubeGeometry(c, 60, .012, 6), new THREE.MeshBasicMaterial({ color: COL.neon, transparent: true, opacity: .32, blending: THREE.AdditiveBlending, depthWrite: false })); C.add(m); return m; });
const FLOW_N = 30, flowLUT = FLOW_CURVES.map(c => c.getSpacedPoints(240));
const flowPts = (() => {
  const r = rng(21), pos = [], col = [], size = [], seed = [];
  for (let i = 0; i < FLOW_N * 3; i++) { pos.push(0, 0, 0); col.push(...rgb(i >= FLOW_N * 2 ? 0x9fffd8 : COL.neon)); size.push(.07 + r() * .06); seed.push(r()); }
  const p = new THREE.Points(pointsGeo(pos, col, size, seed), pointsMaterial()); C.add(p); return p;
})();
const flowBalls = new THREE.InstancedMesh(new THREE.SphereGeometry(.07, 16, 12), new THREE.MeshBasicMaterial({ color: 0xc8ffe9 }), FLOW_N * 3);
flowBalls.frustumCulled = false; C.add(flowBalls);
const cState = { ext: 0, core: 0, dash: 0, flow: 0 };
const pinAnchors = { ext: new THREE.Object3D(), core: new THREE.Object3D(), dash: new THREE.Object3D() };
pinAnchors.ext.position.set(0, -1.45, 0); EXT.add(pinAnchors.ext);
pinAnchors.core.position.set(0, -2.75, 0); CORE.add(pinAnchors.core);
pinAnchors.dash.position.set(.3, -1.45, 0); DASH.add(pinAnchors.dash);

/* ------------------------------------------------------------------ floor + floating balls and risers (stations D to G) */
const floorMat = new THREE.ShaderMaterial({
  uniforms: { uCam: { value: new THREE.Vector3() }, uOpacity: { value: 0 } },
  vertexShader: `varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position,1.); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
  fragmentShader: `uniform vec3 uCam; uniform float uOpacity; varying vec3 vW;
    float grid(vec2 p, float s, float w){ vec2 q = p / s; vec2 g = abs(fract(q - .5) - .5) / (fwidth(q) * w); return 1. - min(min(g.x, g.y), 1.); }
    void main(){ float d = distance(vW.xz, uCam.xz); float f = exp(-d * .055);
      float g = grid(vW.xz, 1.5, 1.2) * .28 + grid(vW.xz, 7.5, 1.6) * .55;
      vec3 c = vec3(0., 1., .64) * g * f + vec3(0., .05, .03) * f;
      gl_FragColor = vec4(c * uOpacity, 1.); }`,
  extensions: { derivatives: true }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending
});
const floor = new THREE.Mesh(new THREE.PlaneGeometry(260, 300), floorMat); floor.rotation.x = -Math.PI / 2; floor.position.set(0, -2.6, -210); scene.add(floor);

const D = new THREE.Group(); scene.add(D);
const NODES = [];
const nodeMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(.17, 28, 18), glossy(), 48);
const nodeStems = new THREE.LineSegments(new THREE.BufferGeometry(), lineMat(COL.neon, .14));
{
  const r = rng(31), pal = [COL.neon, COL.note, COL.issue, COL.comp, COL.neon];
  const stem = []; const pos = [], col = [], size = [], seed = [];
  for (let i = 0; i < 48; i++) {
    const n = { x: (r() - .5) * 34, y: -1.4 + r() * 5, z: -104 - r() * 62, s: r(), c: pal[i % 5], k: .7 + r() * 1.6 };
    if (Math.abs(n.x) < 2.5) n.x += 5 * Math.sign(n.x || 1);
    NODES.push(n); nodeMesh.setColorAt(i, new THREE.Color(n.c).multiplyScalar(.75));
    stem.push(n.x, n.y, n.z, n.x, -2.6, n.z); pos.push(n.x, n.y, n.z); col.push(...rgb(n.c)); size.push(.55); seed.push(r());
  }
  nodeStems.geometry.setAttribute('position', new THREE.Float32BufferAttribute(stem, 3));
  D.add(nodeMesh, nodeStems);
  const glow = new THREE.Points(pointsGeo(pos, col, size, seed), pointsMaterial()); glow.material.uniforms.uOpacity.value = .5; glow.name = 'glow'; D.add(glow);
}
const RISERS = (() => {
  const r = rng(91), pal = [COL.neon, COL.neon, COL.note, COL.comp, COL.issue], data = [];
  for (let i = 0; i < 76; i++) {
    let x = (r() - .5) * 42; if (Math.abs(x) < 4.5) x += 6 * Math.sign(x || 1);
    data.push({ x, z: -100 - r() * 72, w: .35 + r() * .55, h: .5 + Math.pow(r(), 1.6) * 4.2, d: r(), s: r(), color: pal[Math.floor(r() * pal.length)] });
  }
  const mesh = columns(data); D.add(mesh);
  return { mesh, data, rise: 0 };
})();
D.add(new THREE.PointLight(COL.neon, 1.2, 30, 1.2).translateY(3).translateZ(-130));

/* ------------------------------------------------------------------ station E: memory graph */
const E = new THREE.Group(); E.position.set(0, .4, -190); scene.add(E);
const G = (() => {
  const r = rng(42), types = [COL.issue, COL.note, COL.comp];
  const nodes = [{ p: new THREE.Vector3(), c: COL.neon, r: .36 }], edges = [];
  const hubs = 7;
  for (let h = 0; h < hubs; h++) {
    const y = 1 - (h + .5) / hubs * 2, rad = Math.sqrt(1 - y * y), th = h * 2.399;
    const hp = new THREE.Vector3(Math.cos(th) * rad, y * .75, Math.sin(th) * rad).multiplyScalar(3.4);
    const hi = nodes.length; nodes.push({ p: hp, c: types[h % 3], r: .2 }); edges.push([0, hi]);
    const m = 6 + Math.floor(r() * 5), first = nodes.length;
    for (let k = 0; k < m; k++) {
      const off = new THREE.Vector3(r() - .5, r() - .5, r() - .5).normalize().multiplyScalar(.7 + r() * 1.1);
      const p = hp.clone().add(off).add(hp.clone().normalize().multiplyScalar(.5));
      const idx = nodes.length; nodes.push({ p, c: types[Math.floor(r() * 3)], r: .07 + r() * .07 }); edges.push([hi, idx]);
      if (k > 1 && r() < .35) edges.push([idx, first + Math.floor(r() * k)]);
    }
  }
  for (let i = 0; i < 14; i++) { const a = 1 + Math.floor(r() * (nodes.length - 1)), b = 1 + Math.floor(r() * (nodes.length - 1)); if (a !== b) edges.push([a, b]); }
  const maxD = Math.max(...nodes.map(n => n.p.length()));
  nodes.forEach(n => n.a = n.p.length() / maxD * .82);
  edges.forEach(e => { e.a = Math.min(nodes[e[0]].a, nodes[e[1]].a); e.b = Math.max(nodes[e[0]].a, nodes[e[1]].a); });

  const mesh = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 24, 16), new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0x111111, roughness: .35, metalness: .1 }), nodes.length);
  nodes.forEach((n, i) => mesh.setColorAt(i, new THREE.Color(n.c).multiplyScalar(.5)));
  const ePos = new Float32Array(edges.length * 6), eCol = new Float32Array(edges.length * 6);
  edges.forEach((e, i) => { const c1 = rgb(nodes[e[0]].c), c2 = rgb(nodes[e[1]].c); eCol.set([...c1, ...c2], i * 6); });
  const eg = new THREE.BufferGeometry(); eg.setAttribute('position', new THREE.BufferAttribute(ePos, 3)); eg.setAttribute('color', new THREE.BufferAttribute(eCol, 3));
  const lines = new THREE.LineSegments(eg, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: .5, blending: THREE.AdditiveBlending, depthWrite: false }));
  const gp = [], gc = [], gs = [], gd = [];
  nodes.forEach((n, i) => { gp.push(n.p.x, n.p.y, n.p.z); gc.push(...rgb(n.c)); gs.push(n.r * 6); gd.push(i / nodes.length); });
  const glow = new THREE.Points(pointsGeo(gp, gc, gs, gd), pointsMaterial()); glow.material.uniforms.uOpacity.value = .55;
  const PULSES = 70, pp = [], pc = [], ps = [], pd = [], pulse = [];
  for (let i = 0; i < PULSES; i++) { const e = Math.floor(r() * edges.length); pulse.push({ e, sp: .35 + r() * .5, o: r(), dir: r() < .5 }); pp.push(0, 0, 0); pc.push(...rgb(0xd9fff0)); ps.push(.09); pd.push(r()); }
  const pts = new THREE.Points(pointsGeo(pp, pc, ps, pd), pointsMaterial());
  E.add(mesh, lines, glow, pts, halo(COL.neon, 6, .22));
  const pl = new THREE.PointLight(COL.neon, 1.4, 12, 1.2); E.add(pl);
  return { nodes, edges, mesh, lines, glow, pts, pulse, build: 0 };
})();

/* ------------------------------------------------------------------ station G: the stack */
const S = new THREE.Group(); S.position.set(0, -.5, -280); scene.add(S);
const SLABS = [COL.neon, COL.note, 0x7ee0b0, COL.comp, COL.issue].map((c, i) => {
  const g = new THREE.Group(); const y = 2.1 - i * 1.02;
  const body = new THREE.Mesh(new THREE.BoxGeometry(4.2, .14, 2.7), new THREE.MeshStandardMaterial({ color: 0x0b1713, emissive: c, emissiveIntensity: .07, metalness: .5, roughness: .35, transparent: true, opacity: .92 }));
  const edge = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(4.2, .14, 2.7)), lineMat(c, .85));
  const gridC = document.createElement('canvas'); gridC.width = gridC.height = 256; const gg = gridC.getContext('2d');
  gg.strokeStyle = 'rgba(255,255,255,.5)'; gg.lineWidth = 1.5; for (let k = 0; k <= 256; k += 32) { gg.beginPath(); gg.moveTo(k, 0); gg.lineTo(k, 256); gg.moveTo(0, k); gg.lineTo(256, k); gg.stroke(); }
  const gt = new THREE.CanvasTexture(gridC); gt.wrapS = gt.wrapT = THREE.RepeatWrapping; gt.repeat.set(3, 2);
  const top = new THREE.Mesh(new THREE.PlaneGeometry(4.0, 2.5), new THREE.MeshBasicMaterial({ map: gt, color: c, transparent: true, opacity: .28, blending: THREE.AdditiveBlending, depthWrite: false }));
  top.rotation.x = -Math.PI / 2; top.position.y = .072;
  const anchor = new THREE.Object3D(); anchor.position.set(2.25, 0, 1.4);
  g.add(body, edge, top, anchor); g.position.y = y; g.userData = { y, body, edge, top, anchor, k: 0 }; S.add(g); return g;
});
const packets = (() => {
  const r = rng(61), pos = [], col = [], size = [], seed = [], meta = [];
  for (let i = 0; i < 46; i++) { meta.push({ x: (r() - .5) * 3.6, z: (r() - .5) * 2.2, sp: .25 + r() * .35, o: r(), up: r() < .5 }); pos.push(0, 0, 0); col.push(...rgb(COL.neon)); size.push(.09); seed.push(r()); }
  const p = new THREE.Points(pointsGeo(pos, col, size, seed), pointsMaterial()); p.userData.meta = meta; S.add(p); return p;
})();
S.add(halo(COL.neon, 9, .12));

/* ------------------------------------------------------------------ station H: "it adds up" city
   Columns rise from the floor in a wave from the centre, balls pop out of the tallest ones and float up,
   then arcs link the balls together. */
const CITY = (() => {
  const g = new THREE.Group(); g.position.set(0, -2.6, -254); scene.add(g);
  const r = rng(123), N = 11, SP = 1.05, pal = [COL.neon, COL.neon, COL.neon2, COL.note, COL.comp, COL.issue], data = [];
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
    const x = (i - (N - 1) / 2) * SP, z = (j - (N - 1) / 2) * SP, d = Math.hypot(x, z);
    data.push({ x, z, d, h: .25 + 3.8 * Math.exp(-d * d / 13) * (.5 + r() * .7) + r() * .45, s: r(), color: pal[Math.floor(r() * pal.length)] });
  }
  const mesh = columns(data); g.add(mesh);
  const tall = data.map((c, i) => i).sort((a, b) => data[b].h - data[a].h).slice(0, 18);
  const orbs = tall.map((ci, k) => ({ c: data[ci], k, sp: .6 + r() * .8, ph: r() * 6, color: pal[(k + 1) % pal.length], p: new THREE.Vector3() }));
  const orbMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(.21, 32, 20), glossy(), orbs.length); orbMesh.frustumCulled = false;
  orbs.forEach((o, i) => orbMesh.setColorAt(i, new THREE.Color(o.color)));
  const gp = [], gc = [], gs = [], gd = [];
  orbs.forEach((o, i) => { gp.push(0, 0, 0); gc.push(...rgb(o.color)); gs.push(1.1); gd.push(i / orbs.length); });
  const glow = new THREE.Points(pointsGeo(gp, gc, gs, gd), pointsMaterial()); glow.frustumCulled = false; glow.material.uniforms.uOpacity.value = .7;
  const beams = new THREE.LineSegments(new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array(orbs.length * 6), 3)), lineMat(COL.neon, .35));
  const ARCS = [[0, 3], [1, 5], [2, 7], [3, 9], [4, 11], [5, 13], [6, 15], [8, 16], [10, 17], [12, 1], [14, 2]], SEG = 24;
  const arcs = new THREE.LineSegments(new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array(ARCS.length * SEG * 6), 3)), lineMat(0xbfffe6, .55));
  [beams, arcs, glow].forEach(o => o.frustumCulled = false);
  g.add(orbMesh, glow, beams, arcs, halo(COL.neon, 14, .1));
  const pl = new THREE.PointLight(COL.neon, 2, 16, 1.2); pl.position.set(0, 6, 0); g.add(pl);
  return { g, mesh, data, orbs, orbMesh, glow, beams, arcs, ARCS, SEG, rise: 0, pop: 0, lift: 0, link: 0 };
})();

/* ------------------------------------------------------------------ station I: memory globe (behind "our one rule") */
const GLOBE = (() => {
  const g = new THREE.Group(); g.position.set(0, -13, -322); scene.add(g);
  const N = 2600, R = 5.4, pos = [], col = [], size = [], seed = [], r = rng(202);
  for (let i = 0; i < N; i++) {
    const y = 1 - (i + .5) / N * 2, rad = Math.sqrt(1 - y * y), th = i * 2.39996;
    pos.push(Math.cos(th) * rad * R, y * R, Math.sin(th) * rad * R);
    col.push(...(r() < .08 ? rgb(0xffffff) : rgb(COL.neon).map(v => v * (.45 + .55 * Math.abs(y))))); size.push(.16 + r() * .14); seed.push(r());
  }
  const pts = new THREE.Points(pointsGeo(pos, col, size, seed), pointsMaterial()); pts.material.uniforms.uOpacity.value = 0; g.add(pts);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(7.4, .012, 6, 200), new THREE.MeshBasicMaterial({ color: COL.neon, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
  ring.rotation.x = Math.PI / 2 - .25; g.add(ring);
  const balls = [COL.neon, COL.note, COL.comp, COL.issue].map((c, i) => {
    const m = new THREE.Mesh(new THREE.SphereGeometry(.32, 32, 20), glossy()); m.material.color.set(c); m.userData = { a: i * Math.PI / 2, r: 7.4 };
    const h = halo(c, 2.2, .5); m.add(h); g.add(m); return m;
  });
  const core = halo(COL.neon, 16, 0); g.add(core);
  const pl = new THREE.PointLight(COL.neon, 0, 18, 1.2); g.add(pl);
  return { g, pts, ring, balls, core, pl, rise: 0, o: 0 };
})();

/* ------------------------------------------------------------------ overlay helpers */
function splitWords(el) {
  const walk = node => [...node.childNodes].forEach(ch => {
    if (ch.nodeType === 3) {
      const frag = document.createDocumentFragment();
      ch.textContent.split(/(\s+)/).forEach(p => {
        if (!p) return; if (/^\s+$/.test(p)) { frag.appendChild(document.createTextNode(' ')); return; }
        const w = document.createElement('span'); w.className = 'w'; const i = document.createElement('span'); i.className = 'wi'; i.textContent = p; w.appendChild(i); frag.appendChild(w);
      });
      node.replaceChild(frag, ch);
    } else if (ch.nodeType === 1 && ch.tagName !== 'BR') walk(ch);
  });
  walk(el);
}
function splitChars(el) {
  const walk = node => [...node.childNodes].forEach(ch => {
    if (ch.nodeType === 3) { const frag = document.createDocumentFragment();
      [...ch.textContent].forEach(c => { const w = document.createElement('span'); w.className = 'w'; const i = document.createElement('span'); i.className = 'wi'; i.textContent = c; w.appendChild(i); frag.appendChild(w); });
      node.replaceChild(frag, ch);
    } else if (ch.nodeType === 1) walk(ch);
  });
  walk(el);
}
splitChars($('#gone')); splitChars($('#wm1')); splitChars($('#wm2'));
$$('.split').forEach(el => { if (!el.matches('.wm')) splitWords(el); });

gsap.set($$('#s-surfaces .pin-in'), { xPercent: -50 });
gsap.set($$('#s-stack .pin-in'), { yPercent: -50 });

const TL = gsap.timeline({ paused: true, defaults: { lazy: false } });
const wi = sel => $$(sel + ' .wi');
const inWords = (sel, t, st = .055, d = 1.05) => TL.fromTo(wi(sel), { yPercent: 118, rotate: 6 }, { yPercent: 0, rotate: 0, duration: d, ease: 'expo.out', stagger: st }, t);
const inFade = (targets, t, o = {}) => TL.fromTo(targets, { opacity: 0, y: o.y ?? 28, x: o.x ?? 0 }, { opacity: 1, y: 0, x: 0, duration: o.d ?? .9, ease: 'power3.out', stagger: o.st ?? .08 }, t);
function sceneWindow(id) {
  const t0 = at(id), t1 = endOf(id), el = '#s-' + id;
  TL.set(el, { autoAlpha: 1 }, t0);
  if (id === 'cta') return; // the end card stays up and the film fades to black over it
  const movers = $$(`${el} > .copy, ${el} > .center, ${el} > .p3d, ${el} > .pipe, ${el} > .legend`);
  if (movers.length) TL.to(movers, { y: -26, filter: 'blur(6px)', duration: .55, ease: 'power2.in' }, t1 - .62);
  TL.to(el, { autoAlpha: 0, duration: .55, ease: 'power2.in' }, t1 - .62);
}
SCENES.forEach(s => sceneWindow(s[0]));

/* camera */
const cam = { x: 0, y: 0, z: 17, lx: 0, ly: 0, lz: 0 };
const camTo = (t, d, p, l, e = 'sine.inOut') => TL.to(cam, { x: p[0], y: p[1], z: p[2], lx: l[0], ly: l[1], lz: l[2], duration: d, ease: e }, t);

/* deterministic per-frame effects */
const typers = [], flags = [], counters = [];
function typer(el, t0, cps) { typers.push({ el, full: el.textContent, t0, cps, last: -1 }); el.textContent = ''; }
function flag(el, t, cls) { flags.push({ el, t, cls }); }
function counter(el, t0, d, to, fmt) { counters.push({ el, t0, d, to, fmt, last: null }); }

/* ===================================================== TIMELINE ===================================================== */
TL.fromTo('#fade', { opacity: 1 }, { opacity: 0, duration: 1.2, ease: 'power2.out' }, 0);
TL.to('#fade', { opacity: 1, duration: 1.1, ease: 'power2.in' }, END - 1.15);

/* 01 hook */
camTo(0, 6.5, [0, 0, 12.5], [0, 0, 0], 'none');
TL.fromTo('#hookTag', { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: .8, ease: 'power2.out' }, .5);
inWords('#s-hook h1', .9, .07);
inWords('#s-hook .l2', 3.0, .07);

/* 02 problem */
camTo(6.5, 6.8, [1.4, .4, 9.4], [.6, 0, 0]);
TL.to(shardState, { dissolve: 1, duration: 2.6, ease: 'power1.in' }, 10.4);
TL.fromTo('#scrim', { opacity: 0 }, { opacity: 1, duration: 1 }, 6.4);
inFade('#s-problem .kicker', 6.9, { x: -20, y: 0 });
inWords('#s-problem h2', 7.0, .08);
inFade('#s-problem .sub', 8.0);
const frags = $$('#s-problem .frag');
TL.fromTo(frags, { opacity: 0, z: -500, rotationY: -38, x: 160 }, { opacity: 1, z: 0, rotationY: -14, x: 0, duration: 1.3, ease: 'expo.out', stagger: .2 }, 7.5);
frags.forEach((f, i) => TL.to(f, { y: i % 2 ? 16 : -16, duration: 3, ease: 'sine.inOut' }, 8.2));
TL.to(frags, { opacity: 0, y: '-=70', rotationX: 28, filter: 'blur(14px)', duration: 1.1, ease: 'power2.in', stagger: .22 }, 10.6);
TL.to(wi('#gone').map(e => e.parentNode), { opacity: 0, y: -18, filter: 'blur(10px)', duration: .7, ease: 'power2.in', stagger: { each: .05, from: 'random' } }, 11.7);
TL.to('#scrim', { opacity: 0, duration: .8 }, 12.6);

/* 03 logo */
camTo(13.0, 2.2, [0, .4, -27.5], [0, .5, -40], 'expo.inOut');
camTo(15.2, 5.8, [0, .3, -30.6], [0, .5, -40], 'sine.out');
TL.fromTo(LOGO1.u.uOpacity, { value: 0 }, { value: 1, duration: .8 }, 13.6);
TL.fromTo(LOGO1.u.uP, { value: 0 }, { value: 1, duration: 2.8, ease: 'none' }, 13.8);
TL.fromTo(LOGO1, { opacity: 0 }, { opacity: 1, duration: 1.1, ease: 'power2.inOut' }, 16.3);
TL.to(LOGO1.u.uOpacity, { value: 0, duration: .9 }, 16.9);
TL.fromTo(LOGO1.glow.material, { opacity: 0 }, { opacity: .42, duration: 1.6 }, 15.6);
TL.fromTo(LOGO1.rim, { intensity: 0 }, { intensity: 2.2, duration: 1.4 }, 15.8);
TL.fromTo(LOGO1.fillL, { intensity: 0 }, { intensity: .9, duration: 1.4 }, 15.8);
TL.fromTo(LOGO1.mesh.rotation, { y: -1.1, x: .25 }, { y: 0, x: 0, duration: 3.6, ease: 'expo.out' }, 15.4);
TL.to(LOGO1, { opacity: 0, duration: .5 }, 20.5);
TL.to([LOGO1.glow.material], { opacity: 0, duration: .5 }, 20.5);
inFade('#introK', 16.5, { y: 12 });
TL.fromTo(wi('#wm1'), { yPercent: 118 }, { yPercent: 0, duration: 1.1, ease: 'expo.out', stagger: .045 }, 16.7);
inFade('#s-logo .tagline', 17.5);

/* 04 surfaces */
camTo(20.6, 2.2, [-1.6, 3.4, -65.5], [0, .2, -80], 'expo.inOut');
camTo(22.8, 5.7, [1.6, 2.7, -66.8], [0, .2, -80]);
TL.fromTo(cState, { ext: 0, core: 0, dash: 0 }, { ext: 1, duration: 1, ease: 'none' }, 21.6);
TL.to(cState, { core: 1, duration: 1, ease: 'none' }, 21.85);
TL.to(cState, { dash: 1, duration: 1, ease: 'none' }, 22.1);
TL.fromTo(cState, { flow: 0 }, { flow: 1, duration: 1.2 }, 22.8);
TL.fromTo(floorMat.uniforms.uOpacity, { value: 0 }, { value: .75, duration: 2 }, 21.6);
inFade('#s-surfaces .kicker', 21.9, { x: -20, y: 0 });
inWords('#s-surfaces h2', 22.0, .07);
inFade('#pinExt .pin-in, #pinCore .pin-in, #pinDash .pin-in'.split(', ').map(s => $(s)), 23.3, { y: 14, st: .2 });
inFade('#pipe', 24.0, { y: 20 });
$$('#pipe span').forEach((s, i) => flag(s, 24.5 + i * .55, 'on'));

/* 05 capture */
camTo(28.1, 2.2, [-5, 1.5, -116], [-1, 0, -132], 'expo.inOut');
camTo(30.3, 5.7, [-3.4, 1.15, -119], [-1, 0, -133]);
TL.to('#scrim', { opacity: 1, duration: 1 }, 28.6);
TL.fromTo(RISERS, { rise: 0 }, { rise: 1.5, duration: 3.2, ease: 'power1.inOut' }, 28.5);
inFade('#s-capture .kicker', 29.0, { x: -20, y: 0 });
inWords('#s-capture h2', 29.1);
inFade('#s-capture .sub', 29.9);
inFade($$('#s-capture .chip'), 30.5, { y: 18, st: .12 });
const caps = ['#cap1', '#cap2', '#cap3'].map($);
TL.fromTo(caps, { opacity: 0, z: -900, rotationY: -46, x: 260 }, { opacity: i => [1, .95, .85][i], z: i => [0, -200, -400][i], rotationY: -18, x: 0, duration: 1.6, ease: 'expo.out', stagger: .18 }, 29.3);
TL.to(caps, { rotationY: -9, y: i => [-14, 8, 20][i], duration: 5, ease: 'sine.inOut' }, 30.9);

/* 06 ambient */
camTo(35.6, 1.8, [4.2, 2, -121], [1, 0, -135], 'power3.inOut');
camTo(37.4, 5.6, [3, 1.6, -123], [1, 0, -136]);
inFade('#s-ambient .kicker', 36.5, { x: -20, y: 0 });
inWords('#s-ambient h2', 36.6);
inFade('#s-ambient .sub', 37.4);
TL.fromTo('#editor', { opacity: 0, z: -600, rotationY: -36, x: 200 }, { opacity: 1, z: 0, rotationY: -14, x: 0, duration: 1.6, ease: 'expo.out' }, 36.7);
TL.to('#editor', { rotationY: -8, duration: 5.4, ease: 'sine.inOut' }, 38.2);
TL.fromTo('#hlLine', { backgroundColor: 'rgba(0,255,163,0)' }, { backgroundColor: 'rgba(0,255,163,.16)', duration: .5 }, 38.0);
TL.fromTo('#hint', { opacity: 0, scale: .92, y: 24, z: 0 }, { opacity: 1, scale: 1, y: 0, z: 90, duration: .9, ease: 'back.out(1.6)' }, 38.4);
TL.fromTo('#ctxCard', { opacity: 0, x: 120, z: 0, rotationY: -14 }, { opacity: 1, x: 0, z: 160, rotationY: -14, duration: 1.2, ease: 'expo.out' }, 39.3);
counter($('#healthN'), 39.5, 1.3, 86, v => Math.round(v) + '%');

/* 07 chat */
camTo(42.6, 1.8, [0, 3.6, -124], [0, 0, -141], 'power3.inOut');
camTo(44.4, 6.1, [.9, 3.1, -125.5], [0, 0, -141]);
inFade('#s-chat .kicker', 43.5, { x: -20, y: 0 });
inWords('#s-chat h2', 43.6);
inFade('#s-chat .sub', 44.4);
TL.fromTo('#chatCard', { opacity: 0, z: -600, rotationY: -30, x: 180 }, { opacity: 1, z: 0, rotationY: -12, x: 0, duration: 1.5, ease: 'expo.out' }, 43.7);
TL.to('#chatCard', { rotationY: -6, duration: 5.4, ease: 'sine.inOut' }, 45.2);
inFade('#q', 44.5, { y: 16 });
typer($('#ans'), 45.2, 58);
inFade($$('#cites .cite'), 48.2, { y: 14, st: .15 });
flag($('#sw'), 48.9, 'on');

/* 08 edit + pre-mortem */
camTo(50.1, 1.8, [-4, 1.1, -128], [0, .4, -143], 'power3.inOut');
camTo(51.9, 6.1, [-3, 1.4, -129.5], [0, .4, -143]);
inFade('#s-edit .kicker', 51.0, { x: -20, y: 0 });
inWords('#s-edit h2', 51.1);
inFade('#s-edit .sub', 51.9);
TL.fromTo('#diffCard', { opacity: 0, z: -600, rotationY: -30, x: 180 }, { opacity: 1, z: 0, rotationY: -12, x: 0, duration: 1.5, ease: 'expo.out' }, 51.2);
TL.to('#diffCard', { rotationY: -6, duration: 5.6, ease: 'sine.inOut' }, 52.7);
typer($('#prompt'), 51.9, 42);
inFade($$('#file1 .dl'), 53.3, { y: 0, x: -16, st: .11, d: .5 });
inFade('#file2', 54.0, { y: 10 });
TL.fromTo('#applyBtn', { boxShadow: '0 0 0px rgba(0,255,163,0)' }, { boxShadow: '0 0 46px rgba(0,255,163,.6)', duration: .5, yoyo: true, repeat: 1 }, 54.4);
TL.fromTo('#pmCard', { opacity: 0, z: 0, y: 60, rotationY: -12 }, { opacity: 1, z: 180, y: 0, rotationY: -12, duration: 1.1, ease: 'expo.out' }, 55.0);
inFade('#pmCard .ok', 56.1, { y: 8 });
TL.to('#scrim', { opacity: 0, duration: .8 }, 57.6);

/* 09 graph */
camTo(57.6, 2.4, [0, 1.2, -175], [-2.4, .4, -190], 'expo.inOut');
camTo(60.0, 6.2, [.4, .8, -179.2], [-1.8, .4, -190]);
TL.fromTo(G, { build: 0 }, { build: 1.12, duration: 2.6, ease: 'power1.inOut' }, 58.6);
TL.fromTo(floorMat.uniforms.uOpacity, { value: .75 }, { value: .35, duration: 1.5 }, 58);
inFade('#s-graph .kicker', 59.0, { x: -20, y: 0 });
inWords('#s-graph h2', 59.1, .05);
inFade($$('#legend .chip'), 60.6, { y: 16, st: .12 });

/* 10 dashboard */
camTo(65.6, 2.2, [0, 1.6, -214], [2.5, -.4, -236], 'expo.inOut');
camTo(67.8, 5.7, [1.6, 1.9, -221], [2.5, -.4, -238]);
TL.to(floorMat.uniforms.uOpacity, { value: .7, duration: 1.5 }, 66);
inFade('#s-dash .kicker', 66.6, { x: -20, y: 0 });
inWords('#s-dash h2', 66.7);
inFade('#s-dash .sub', 67.5);
const RING = { a: 40, o: 0 };
TL.fromTo(RING, { a: 70, o: 0 }, { a: -10, o: 1, duration: 1.8, ease: 'expo.out' }, 66.3);
TL.to(RING, { a: -112, duration: 5.4, ease: 'sine.inOut' }, 68.1);

/* 11 it adds up */
camTo(73.1, 2.2, [10, 5.2, -240.5], [-7.2, -.4, -254], 'expo.inOut');
camTo(75.3, 5.7, [7.4, 4.6, -239], [-7.2, -.4, -254]);
TL.to('#scrim', { opacity: 1, duration: .8 }, 73.6);
TL.fromTo(CITY, { rise: 0 }, { rise: 1.7, duration: 2.8, ease: 'power1.inOut' }, 73.8);
TL.fromTo(CITY, { pop: 0 }, { pop: 1, duration: 1.8, ease: 'none' }, 75.4);
TL.fromTo(CITY, { lift: 0 }, { lift: 1, duration: 5.4, ease: 'sine.inOut' }, 75.6);
TL.fromTo(CITY, { link: 0 }, { link: 1, duration: 2, ease: 'power2.out' }, 77.3);
inFade('#s-compound .kicker', 74.0, { x: -20, y: 0 });
inWords('#s-compound h2', 74.1);
inFade('#s-compound .sub', 74.9);

/* 12 stack */
camTo(80.6, 2.2, [6.6, 3.7, -268.5], [-1.3, -.45, -280], 'expo.inOut');
camTo(82.8, 3.7, [5.4, 3.2, -267.6], [-1.3, -.45, -280]);
SLABS.forEach((s, i) => TL.fromTo(s.userData, { k: 0 }, { k: 1, duration: 1.1, ease: 'expo.out' }, 81.5 + i * .14));
inFade('#s-stack .kicker', 81.5, { x: -20, y: 0 });
inWords('#s-stack h2', 81.6);
inFade('#s-stack .sub', 82.4);
inFade($$('#s-stack .pin-in'), 82.4, { x: -18, y: 0, st: .13 });
TL.to('#scrim', { opacity: 0, duration: .8 }, 85.9);

/* 13 vision */
camTo(86.2, 2.2, [0, 1.2, -296], [0, 2.6, -330], 'expo.inOut');
camTo(88.4, 3.8, [0, 1.7, -303], [0, 2.6, -330]);
TL.to(floorMat.uniforms.uOpacity, { value: 0, duration: 3 }, 88.5);
TL.fromTo(GLOBE, { rise: 0, o: 0 }, { rise: 1, o: 1, duration: 3.4, ease: 'expo.out' }, 86.5);
TL.to(GLOBE, { o: 0, duration: .7, ease: 'power2.in' }, 91.4);
inFade('#s-vision .kicker', 87.1, { y: 10 });
inWords('#s-vision h2', 87.3, .07);
inFade('#visionSub', 89.5);

/* 14 CTA */
camTo(91.6, 2.4, [0, .3, -327.5], [0, .55, -340], 'expo.inOut');
camTo(94.0, 5.5, [0, .3, -329.6], [0, .55, -340], 'sine.out');
TL.fromTo(LOGO2.u.uOpacity, { value: 0 }, { value: 1, duration: .6 }, 91.9);
TL.fromTo(LOGO2.u.uP, { value: 0 }, { value: 1, duration: 2.2, ease: 'none' }, 92.1);
TL.fromTo(LOGO2, { opacity: 0 }, { opacity: 1, duration: 1, ease: 'power2.inOut' }, 93.9);
TL.to(LOGO2.u.uOpacity, { value: 0, duration: .8 }, 94.5);
TL.fromTo(LOGO2.glow.material, { opacity: 0 }, { opacity: .42, duration: 1.4 }, 93.4);
TL.fromTo([LOGO2.rim], { intensity: 0 }, { intensity: 2.2, duration: 1.4 }, 93.5);
TL.fromTo([LOGO2.fillL], { intensity: 0 }, { intensity: .9, duration: 1.4 }, 93.5);
TL.fromTo(orbit.material.uniforms.uOpacity, { value: 0 }, { value: .8, duration: 1.5 }, 93.7);
TL.fromTo(LOGO2.mesh.rotation, { y: 1.1 }, { y: 0, duration: 3, ease: 'expo.out' }, 93.3);
TL.fromTo(wi('#wm2'), { yPercent: 118 }, { yPercent: 0, duration: 1.1, ease: 'expo.out', stagger: .045 }, 94.3);
inFade('#s-cta .tagline', 95.0);
inFade('#s-cta .by', 95.7, { y: 10 });
TL.set({}, {}, END);


/* ------------------------------------------------------------------ pins (HTML labels tracking 3D anchors) */
const pins = [
  [$('#pinExt'), pinAnchors.ext], [$('#pinCore'), pinAnchors.core], [$('#pinDash'), pinAnchors.dash],
  ...$$('#s-stack .pin').map(el => [el, SLABS[+el.dataset.slab].userData.anchor])];
const v3 = new THREE.Vector3();
function updatePins(t) {
  for (const [el, obj] of pins) {
    if (!el.closest('.scene').style.visibility || el.closest('.scene').style.visibility === 'hidden') continue;
    obj.getWorldPosition(v3).project(camera);
    el.style.transform = `translate(${((v3.x + 1) / 2 * W).toFixed(1)}px,${((1 - v3.y) / 2 * H).toFixed(1)}px)`;
  }
}

/* ------------------------------------------------------------------ per-frame */
const ringEl = $('#ring'), ringFaces = $$('#ring .shot');
ringFaces.forEach((f, i) => f.style.transform = `rotateY(${i * 45}deg) translateZ(980px)`);
const visible = (t, a, b) => t > a && t < b;
const color = new THREE.Color();

function update(t) {
  TL.time(Math.min(t, TL.duration()));
  TIME.value = t;

  const jx = Math.sin(t * .31) * .07, jy = Math.sin(t * .43 + 1) * .05;
  camera.position.set(cam.x + jx, cam.y + jy, cam.z);
  camera.lookAt(cam.lx, cam.ly, cam.lz);
  floorMat.uniforms.uCam.value.copy(camera.position);

  A.visible = visible(t, -1, 16);
  LOGO1.g.visible = visible(t, 12.8, 21.5);
  C.visible = visible(t, 20, 30);
  D.visible = visible(t, 26, 60);
  E.visible = visible(t, 56, 70);
  CITY.g.visible = visible(t, 71, 82);
  S.visible = visible(t, 78.5, 88.5);
  GLOBE.g.visible = visible(t, 85.5, 92.5);
  LOGO2.g.visible = visible(t, 89.5, 999);
  floor.visible = floorMat.uniforms.uOpacity.value > .001;

  if (A.visible) {
    SHARDS.forEach((s, i) => {
      const k = clamp((shardState.dissolve - s.d * .6) / .4), sc = s.s * (1 - ease.io3(k));
      dummy.position.set(s.x + Math.sin(t * s.sp + i) * .3, s.y + Math.cos(t * s.sp * .8 + i) * .25 + k * 3, s.z);
      dummy.rotation.set(s.rx + t * s.sp * .5 + k * 2, s.ry + t * s.sp * .4, 0);
      dummy.scale.setScalar(Math.max(sc, .0001)); dummy.updateMatrix(); shardMesh.setMatrixAt(i, dummy.matrix);
    });
    shardMesh.instanceMatrix.needsUpdate = true;
  }
  if (LOGO1.g.visible) LOGO1.g.rotation.y = Math.sin(t * .5) * .08;
  if (LOGO2.g.visible) { LOGO2.g.rotation.y = Math.sin(t * .45) * .1; orbit.rotation.y = t * .12; }

  if (C.visible) {
    const sx = ease.back(clamp(cState.ext)), sc = ease.back(clamp(cState.core)), sd = ease.back(clamp(cState.dash));
    EXT.scale.setScalar(Math.max(sx, .0001)); CORE.scale.setScalar(Math.max(sc, .0001)); DASH.scale.setScalar(Math.max(sd, .0001));
    EXT.position.y = -.15 + Math.sin(t * .8) * .06; DASH.position.y = -.15 + Math.sin(t * .8 + 2) * .06;
    coreWire.rotation.set(t * .2, t * .28, 0); coreIn.rotation.set(-t * .3, t * .2, 0);
    CORE.getObjectByName('ring0').rotation.z = t * .4; CORE.getObjectByName('ring1').rotation.z = -t * .3;
    flowTubes.forEach(m => m.material.opacity = .32 * cState.flow);
    flowPts.material.uniforms.uOpacity.value = cState.flow;
    const pa = flowPts.geometry.attributes.position;
    for (let c = 0; c < 3; c++) for (let i = 0; i < FLOW_N; i++) {
      const u = ((i / FLOW_N) + t * (c === 2 ? .16 : .22)) % 1, p = flowLUT[c][Math.floor(u * 240)];
      pa.setXYZ(c * FLOW_N + i, p.x, p.y, p.z);
    }
    pa.needsUpdate = true;
    for (let i = 0; i < FLOW_N * 3; i++) {
      dummy.position.set(pa.getX(i), pa.getY(i), pa.getZ(i)); dummy.rotation.set(0, 0, 0);
      dummy.scale.setScalar(Math.max(cState.flow * (i % 3 === 0 ? 1.4 : .8), .0001)); dummy.updateMatrix(); flowBalls.setMatrixAt(i, dummy.matrix);
    }
    flowBalls.instanceMatrix.needsUpdate = true;
  }

  if (D.visible) {
    NODES.forEach((n, i) => {
      dummy.position.set(n.x, n.y + Math.sin(t * .9 + n.s * 9) * .18, n.z);
      dummy.rotation.set(0, 0, 0); dummy.scale.setScalar(n.k); dummy.updateMatrix(); nodeMesh.setMatrixAt(i, dummy.matrix);
    });
    nodeMesh.instanceMatrix.needsUpdate = true;
    RISERS.data.forEach((c, i) => {
      const k = ease.back(clamp((RISERS.rise - c.d * .5) / .5)), h = c.h * k * (1 + .14 * Math.sin(t * 1.1 + c.s * 6));
      dummy.position.set(c.x, -2.6, c.z); dummy.rotation.set(0, 0, 0); dummy.scale.set(c.w, Math.max(h, .001), c.w); dummy.updateMatrix(); RISERS.mesh.setMatrixAt(i, dummy.matrix);
    });
    RISERS.mesh.instanceMatrix.needsUpdate = true;
  }

  if (E.visible) {
    E.rotation.y = t * .16 - 9; E.rotation.x = Math.sin(t * .2) * .08;
    const b = G.build, pos = G.lines.geometry.attributes.position.array;
    G.nodes.forEach((n, i) => {
      const k = clamp((b - n.a) / .18), s = n.r * Math.max(ease.back(k), 0);
      dummy.position.copy(n.p); dummy.rotation.set(0, 0, 0); dummy.scale.setScalar(Math.max(s, .0001)); dummy.updateMatrix(); G.mesh.setMatrixAt(i, dummy.matrix);
      G.glow.geometry.attributes.asize.array[i] = n.r * 6 * clamp(k * 1.5);
    });
    G.mesh.instanceMatrix.needsUpdate = true; G.glow.geometry.attributes.asize.needsUpdate = true;
    G.edges.forEach((e, i) => {
      const p1 = G.nodes[e[0]].p, p2 = G.nodes[e[1]].p, k = ease.o3(clamp((b - e.a) / (e.b - e.a + .2)));
      pos[i * 6] = p1.x; pos[i * 6 + 1] = p1.y; pos[i * 6 + 2] = p1.z;
      pos[i * 6 + 3] = p1.x + (p2.x - p1.x) * k; pos[i * 6 + 4] = p1.y + (p2.y - p1.y) * k; pos[i * 6 + 5] = p1.z + (p2.z - p1.z) * k;
    });
    G.lines.geometry.attributes.position.needsUpdate = true;
    const pp = G.pts.geometry.attributes.position;
    G.pulse.forEach((p, i) => {
      const e = G.edges[p.e], u0 = (p.o + t * p.sp) % 1, u = p.dir ? u0 : 1 - u0, ok = b > e.b + .15;
      const a = G.nodes[e[0]].p, c = G.nodes[e[1]].p;
      pp.setXYZ(i, ok ? a.x + (c.x - a.x) * u : 0, ok ? a.y + (c.y - a.y) * u : 0, ok ? a.z + (c.z - a.z) * u : 0);
    });
    pp.needsUpdate = true; G.pts.material.uniforms.uOpacity.value = clamp((b - .9) * 4);
  }

  if (S.visible) {
    S.rotation.y = -.55 + Math.sin(t * .25) * .06 + (t - 81) * .025;
    SLABS.forEach((s, i) => {
      const u = s.userData, k = clamp(u.k);
      s.position.y = u.y + (1 - ease.o3(k)) * 5 + Math.sin(t * .9 + i) * .04;
      u.body.material.opacity = .92 * k; u.edge.material.opacity = .85 * k; u.top.material.opacity = .28 * k;
      s.visible = k > .001;
    });
    const pa = packets.geometry.attributes.position, top = 2.1, bot = 2.1 - 4 * 1.02;
    packets.userData.meta.forEach((m, i) => { let u = (m.o + t * m.sp) % 1; if (m.up) u = 1 - u; pa.setXYZ(i, m.x, bot + (top - bot) * u, m.z); });
    pa.needsUpdate = true; packets.material.uniforms.uOpacity.value = clamp(SLABS[4].userData.k);
  }

  if (CITY.g.visible) {
    CITY.g.rotation.y = (t - 73.5) * .045;
    CITY.data.forEach((c, i) => {
      const k = ease.back(clamp((CITY.rise - c.d / 9) / .45)), h = c.h * k * (1 + .06 * Math.sin(t * 1.3 + c.s * 6));
      c.top = h; dummy.position.set(c.x, 0, c.z); dummy.rotation.set(0, 0, 0); dummy.scale.set(.8, Math.max(h, .001), .8); dummy.updateMatrix(); CITY.mesh.setMatrixAt(i, dummy.matrix);
    });
    CITY.mesh.instanceMatrix.needsUpdate = true;
    const gpos = CITY.glow.geometry.attributes.position, bpos = CITY.beams.geometry.attributes.position, n = CITY.orbs.length;
    CITY.orbs.forEach((o, i) => {
      const k = clamp((CITY.pop - i / n * .7) / .3), s = ease.back(k);
      o.p.set(o.c.x, o.c.top + .32 + k * (CITY.lift * o.sp * 1.3 + Math.sin(t * 1.4 + o.ph) * .1), o.c.z);
      dummy.position.copy(o.p); dummy.rotation.set(0, 0, 0); dummy.scale.setScalar(Math.max(s, .0001)); dummy.updateMatrix(); CITY.orbMesh.setMatrixAt(i, dummy.matrix);
      gpos.setXYZ(i, o.p.x, o.p.y, o.p.z); CITY.glow.geometry.attributes.asize.array[i] = 1.1 * k;
      bpos.setXYZ(i * 2, o.c.x, o.c.top, o.c.z); bpos.setXYZ(i * 2 + 1, o.p.x, k > 0 ? o.p.y : o.c.top, o.p.z);
    });
    CITY.orbMesh.instanceMatrix.needsUpdate = gpos.needsUpdate = bpos.needsUpdate = CITY.glow.geometry.attributes.asize.needsUpdate = true;
    const apos = CITY.arcs.geometry.attributes.position, SEG = CITY.SEG, q = new THREE.Vector3(), q2 = new THREE.Vector3();
    CITY.ARCS.forEach(([a, b], j) => {
      const A = CITY.orbs[a].p, B = CITY.orbs[b].p, mid = A.clone().add(B).multiplyScalar(.5); mid.y += 1.4 + A.distanceTo(B) * .25;
      const drawn = Math.floor(clamp((CITY.link - j * .04) / .6) * SEG);
      const at = (u, out) => out.set((1 - u) * (1 - u) * A.x + 2 * (1 - u) * u * mid.x + u * u * B.x, (1 - u) * (1 - u) * A.y + 2 * (1 - u) * u * mid.y + u * u * B.y, (1 - u) * (1 - u) * A.z + 2 * (1 - u) * u * mid.z + u * u * B.z);
      for (let k = 0; k < SEG; k++) {
        const o = (j * SEG + k) * 2;
        if (k < drawn) { at(k / SEG, q); at((k + 1) / SEG, q2); apos.setXYZ(o, q.x, q.y, q.z); apos.setXYZ(o + 1, q2.x, q2.y, q2.z); }
        else { apos.setXYZ(o, A.x, A.y, A.z); apos.setXYZ(o + 1, A.x, A.y, A.z); }
      }
    });
    apos.needsUpdate = true;
  }

  if (GLOBE.g.visible) {
    GLOBE.g.position.y = -13 + 11.2 * GLOBE.rise; GLOBE.g.rotation.y = t * .12;
    GLOBE.pts.material.uniforms.uOpacity.value = .9 * GLOBE.o; GLOBE.ring.material.opacity = .4 * GLOBE.o;
    GLOBE.core.material.opacity = .22 * GLOBE.o; GLOBE.pl.intensity = 1.5 * GLOBE.o;
    GLOBE.balls.forEach((b, i) => {
      const a = b.userData.a + t * (.5 + i * .07); b.position.set(Math.cos(a) * 7.4, 0, Math.sin(a) * 7.4).applyAxisAngle(new THREE.Vector3(1, 0, 0), -.25);
      b.scale.setScalar(Math.max(GLOBE.o, .0001));
    });
  }

  /* DOM effects */
  if (visible(t, 65.5, 74)) {
    ringEl.style.transform = `translateZ(-1180px) rotateX(-7deg) rotateY(${RING.a.toFixed(2)}deg)`;
    // fade the cards, not the ring: opacity below 1 on a preserve-3d element makes the browser flatten it
    const o = RING.o.toFixed(3); ringFaces.forEach(f => f.style.opacity = o);
  }
  for (const ty of typers) {
    const n = Math.round(clamp((t - ty.t0) * ty.cps, 0, ty.full.length));
    if (n !== ty.last) { ty.last = n; ty.el.textContent = ty.full.slice(0, n) + (n > 0 && n < ty.full.length ? '▍' : ''); }
  }
  for (const f of flags) f.el.classList.toggle(f.cls, t >= f.t);
  for (const c of counters) { const v = c.to * ease.o3(clamp((t - c.t0) / c.d)), s = c.fmt(v); if (s !== c.last) { c.last = s; c.el.textContent = s; } }

  updatePins(t);
  renderer.render(scene, camera);
}

/* ------------------------------------------------------------------ playback, recording, export */
const startEl = $('#start'), msgEl = $('#msg');
let state = 'idle', t0 = 0, recorder = null, stream = null, recStart = 0, mime = '', upChain = Promise.resolve();
const chunks = [];
let previewT = P.has('t') ? +P.get('t') : 0;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const note = (s, ms = 6000) => { msgEl.textContent = s; msgEl.style.display = 'block'; clearTimeout(note.h); if (ms) note.h = setTimeout(() => msgEl.style.display = 'none', ms); };

function pickMime(withAudio) {
  const list = withAudio
    ? ['video/mp4;codecs=avc1.640034,mp4a.40.2', 'video/mp4;codecs=avc1,mp4a.40.2', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm']
    : ['video/mp4;codecs=avc1.640034', 'video/mp4;codecs=avc1.640033', 'video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];
  return list.find(m => window.MediaRecorder && MediaRecorder.isTypeSupported(m)) || '';
}

/* ------------------------------------------------------------------ sound (lib/sound.js)
   Live playback for watching / manual recording. run.js keeps the page silent and mixes the same cue
   sheet with ffmpeg instead, which is sample-accurate. */
const AUDIO_ON = !UPLOAD && !P.has('mute') && window.SOUND;
const FX_LEVEL = .9, clamp1 = v => Math.max(0, Math.min(1, v));
let music = null, cues = [];
function prepareAudio() {
  if (!AUDIO_ON) return;
  music = new Audio(`assets/audio/music/${SOUND.music.clip}.mp3`); music.preload = 'auto';
  cues = SOUND.cues.map(c => { const el = new Audio(`assets/audio/sfx/${c.clip}.mp3`); el.preload = 'auto'; return { c, el, on: false, off: false }; });
}
function updateAudio(t) {
  if (!AUDIO_ON || state !== 'play') return;
  const m = SOUND.music, mt = m.offset + t;
  if (music.paused && t < END - .2) { music.currentTime = mt; music.play().catch(() => {}); }
  else if (Math.abs(music.currentTime - mt) > .15) music.currentTime = mt;   // keep the bed locked to the film clock
  music.volume = clamp1(m.gain * 1.6 * Math.min(1, t / m.fadeIn, (END - t) / m.fadeOut));
  for (const q of cues) {
    const { c, el } = q, end = c.at + c.len;
    if (!q.on && t >= c.at && t < end) { q.on = true; el.currentTime = c.from + (t - c.at); el.volume = clamp1(c.gain * FX_LEVEL); el.play().catch(() => {}); }
    if (q.on && !q.off && c.trim) { const left = end - t; if (left <= 0) { q.off = true; el.pause(); } else if (left < .2) el.volume = clamp1(c.gain * FX_LEVEL * left / .2); }
  }
}
function stopAudio() { if (music) music.pause(); cues.forEach(q => q.el.pause()); }
function waitClick(text) {
  return new Promise(res => {
    startEl.querySelector('.s').textContent = text; startEl.querySelector('.go').textContent = 'Begin';
    startEl.classList.remove('hidden');
    startEl.addEventListener('click', () => { document.documentElement.requestFullscreen({ navigationUI: 'hide' }).catch(() => {}); startEl.classList.add('hidden'); res(); }, { once: true });
  });
}

async function begin() {
  if (state !== 'idle') return; state = 'arming';
  startEl.classList.add('hidden');
  const wantRec = !P.has('norec') && !P.has('play') && navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia;
  // both requests start inside the same click so each gets the user gesture
  const gdm = wantRec ? navigator.mediaDevices.getDisplayMedia({
    video: { frameRate: { ideal: 60, max: 60 }, width: { ideal: 1920 }, height: { ideal: 1080 }, displaySurface: 'browser' },
    // record the tab's own sound too (not in run.js mode, which mixes audio with ffmpeg afterwards)
    audio: AUDIO_ON ? { suppressLocalAudioPlayback: false, echoCancellation: false, noiseSuppression: false, autoGainControl: false } : false,
    systemAudio: 'exclude', preferCurrentTab: true, selfBrowserSurface: 'include', surfaceSwitching: 'exclude', monitorTypeSurfaces: 'exclude'
  }) : null;
  const fs = document.fullscreenElement ? Promise.resolve() : document.documentElement.requestFullscreen({ navigationUI: 'hide' }).catch(() => {});
  try { stream = gdm ? await gdm : null; } catch (e) { stream = null; note('Recording not started (' + e.name + '). Playing without recording.'); }
  await fs;
  if (!document.fullscreenElement && !AUTO) await waitClick('Recording is armed. Click once more to go fullscreen and start the film.');
  await sleep(900); fit();
  if (stream) {
    window.__track = stream.getVideoTracks()[0];
    const track = stream.getVideoTracks()[0];
    try { if (window.CropTarget && track.cropTo) await track.cropTo(await CropTarget.fromElement(stage)); } catch (e) { console.warn('cropTo failed', e); }
    // capture the 16:9 stage at full 1080p (Chrome renders the tab at this size even on smaller screens)
    try { await track.applyConstraints({ width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 60, max: 60 } }); } catch (e) { console.warn('applyConstraints failed', e); }
    await sleep(300);
    track.addEventListener('ended', () => { if (state === 'play') note('Screen sharing stopped, so the recording ended early.'); });
    const withAudio = stream.getAudioTracks().length > 0;
    if (AUDIO_ON && !withAudio) note('Recording without sound. Tick “Also share tab audio” next time to include it.');
    mime = pickMime(withAudio);
    recorder = new MediaRecorder(stream, { mimeType: mime || undefined, videoBitsPerSecond: 28e6, audioBitsPerSecond: 192e3 });
    mime = recorder.mimeType || mime;
    recorder.ondataavailable = e => {
      if (!e.data || !e.data.size) return;
      if (UPLOAD) { const b = e.data; upChain = upChain.then(() => fetch('/chunk', { method: 'POST', body: b })); } else chunks.push(e.data);
    };
    recorder.start(1000); recStart = performance.now();
    await sleep(500);
  }
  document.body.classList.add('running');
  t0 = performance.now(); state = 'play';
}

async function finish() {
  state = 'done';
  setTimeout(stopAudio, 400);
  await sleep(450);
  const ext = /mp4/.test(mime) ? 'mp4' : 'webm';
  if (recorder && recorder.state !== 'inactive') {
    await new Promise(r => { recorder.onstop = r; recorder.stop(); });
    stream.getTracks().forEach(t => t.stop());
    const lead = ((t0 - recStart) / 1000).toFixed(3);
    if (UPLOAD) {
      await upChain;
      await fetch(`/done?ext=${ext}&lead=${lead}&dur=${END}`, { method: 'POST' });
    } else {
      const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(chunks, { type: mime })); a.download = 'canopy-launch.' + ext;
      document.body.appendChild(a); a.click();
      note(`Saved canopy-launch.${ext} to your Downloads folder.`, 0);
    }
  }
  document.body.classList.remove('running');
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  window.__finished = true;
}

function frame(now) {
  requestAnimationFrame(frame);
  let t = previewT;
  if (state === 'play') { t = (now - t0) / 1000; if (t >= END) { t = END; finish(); } }
  else if (state === 'done') t = END;
  update(t);
  updateAudio(t);
}

/* warm-up: compile shaders and upload textures for every station before the first real frame */
async function init() {
  await document.fonts.ready;
  await Promise.all($$('img').map(i => i.decode().catch(() => {})));
  for (const s of SCENES) update(s[2] + 3);
  update(previewT);
  prepareAudio();
  requestAnimationFrame(frame);
  if (P.has('t') || P.has('still')) startEl.classList.add('hidden');
  else if (P.has('play')) {   // watch mode: browsers only allow sound after a click, so wait for one
    startEl.querySelector('.s').textContent = 'Plays the film fullscreen with sound. Nothing is recorded.';
    startEl.querySelector('.go').textContent = 'Play';
  }
  else if (AUTO) { startEl.style.opacity = '0'; startEl.style.background = 'transparent'; }
  startEl.addEventListener('click', begin, { once: true });
  window.__ready = true;
}
window.__seek = t => { previewT = t; update(t); };
init();
})();
