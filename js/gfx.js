'use strict';
// ============================================================================
// Graphics: renderer, HDR bloom post chain, sky, procedural surfaces, level meshes, set dressing, effects
// ============================================================================
const G = {
  renderer: null, scene: null, camera: null, vmScene: null, vmCam: null, hdr: true, msaa: 4, pr: 1, w: 1, h: 1,
  rtScene: null, mips: [], ups: [], post: {}, fsScene: null, fsCam: null, fsMesh: null, level: null, sky: null, sun: null, hemi: null,
  mats: {}, tex: {}, time: 0, anim: [], lightSrc: [], lightPool: [], fx: { damage: 0, heal: 0, blur: 0, desat: 0, flash: 0, vig: 1, blind: 0, tint: 0 }, shake: 0, exposure: 1,
};
const QUALITY = [
  { name: 'Low', pr: 0.75, maxH: 720, msaa: 0, shadow: 1024, bloom: 3, soft: false, lights: 0 },
  { name: 'Medium', pr: 1.0, maxH: 900, msaa: 2, shadow: 2048, bloom: 4, soft: false, lights: 2 },
  { name: 'High', pr: 1.0, maxH: 1080, msaa: 4, shadow: 2048, bloom: 5, soft: true, lights: 4 },
  { name: 'Ultra', pr: 1.5, maxH: 1440, msaa: 4, shadow: 4096, bloom: 5, soft: true, lights: 6 },
];
const TEAM_HEX = [0x2ee6ff, 0xff6a2a];
const TEAM_CSS = ['#2ee6ff', '#ff6a2a'];
const TEAM_NAME = ['Azure', 'Ember'];
const ENEMY_HEX = 0xff3048;
const FS_VERT = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';
function fsMat(frag, uniforms) { return new THREE.ShaderMaterial({ vertexShader: FS_VERT, fragmentShader: frag, uniforms, depthTest: false, depthWrite: false }); }
function hdrCol(hex, k) { return new THREE.Color(hex).multiplyScalar(k); }

function initGfx(canvas) {
  const r = G.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', alpha: false, stencil: false });
  r.setClearColor(0x05060c, 1);
  r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFSoftShadowMap;
  r.toneMapping = THREE.NoToneMapping; r.outputEncoding = THREE.LinearEncoding;
  // a smooth 4-tap shadow lookup in place of the engine's 17-tap PCF (kept for the soft setting)
  try {
    const ch = THREE.ShaderChunk, src = ch.shadowmap_pars_fragment, tag = '#if defined( SHADOWMAP_TYPE_PCF )', at = src.indexOf('float getShadow('), k = at < 0 ? -1 : src.indexOf(tag, at);
    if (k >= 0) ch.shadowmap_pars_fragment = src.slice(0, k) + tag + `
      vec2 sgT = vec2( 1.0 ) / shadowMapSize; vec2 sgU = shadowCoord.xy * shadowMapSize - 0.5; vec2 sgF = fract( sgU ); vec2 sgB = ( floor( sgU ) + 0.5 ) * sgT;
      shadow = mix( mix( texture2DCompare( shadowMap, sgB, shadowCoord.z ), texture2DCompare( shadowMap, sgB + vec2( sgT.x, 0.0 ), shadowCoord.z ), sgF.x ),
                    mix( texture2DCompare( shadowMap, sgB + vec2( 0.0, sgT.y ), shadowCoord.z ), texture2DCompare( shadowMap, sgB + sgT, shadowCoord.z ), sgF.x ), sgF.y );
    #elif defined( OT_UNUSED_17_TAP )` + src.slice(k + tag.length);
  } catch (e) { /* keep the stock filter */ }
  G.hdr = r.capabilities.isWebGL2 && (r.extensions.has('EXT_color_buffer_float') || r.extensions.has('EXT_color_buffer_half_float'));
  G.scene = new THREE.Scene();
  G.camera = new THREE.PerspectiveCamera(Settings.fov, 1, 0.05, 900); G.camera.rotation.order = 'YXZ'; G.scene.add(G.camera);
  G.vmScene = new THREE.Scene(); G.vmCam = new THREE.PerspectiveCamera(58, 1, 0.01, 10);
  const vh = new THREE.HemisphereLight(0xcfd8ff, 0x302820, 1.2); G.vmScene.add(vh);
  G.vmSun = new THREE.DirectionalLight(0xffffff, 2.0); G.vmSun.position.set(0.5, 1, 0.4); G.vmScene.add(G.vmSun);
  G.vmFill = new THREE.PointLight(0xffffff, 0, 3); G.vmFill.position.set(0, 0.2, -0.4); G.vmScene.add(G.vmFill);
  G.hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 1); G.scene.add(G.hemi);
  G.sun = new THREE.DirectionalLight(0xffffff, 3); G.sun.castShadow = true; G.scene.add(G.sun); G.scene.add(G.sun.target);
  G.sun.shadow.bias = -0.0004;
  for (let i = 0; i < 6; i++) { const l = new THREE.PointLight(0xffffff, 0, 14, 2); l.visible = false; G.scene.add(l); G.lightPool.push(l); }
  G.flashLight = new THREE.PointLight(0xffc070, 0, 12, 2); G.scene.add(G.flashLight); G.flashT = 0;

  const tri = new THREE.BufferGeometry();
  tri.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
  tri.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 2, 0, 0, 2], 2));
  G.fsScene = new THREE.Scene(); G.fsCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  G.fsMesh = new THREE.Mesh(tri, null); G.fsMesh.frustumCulled = false; G.fsScene.add(G.fsMesh);
  const P = G.post;
  P.down = fsMat(`
    varying vec2 vUv; uniform sampler2D tSrc; uniform vec2 uTexel; uniform float uThr; uniform float uPre;
    vec3 pre(vec3 c){ c = min(c, vec3(50.0)); float l = max(c.r, max(c.g, c.b)); float k = max(l - uThr, 0.0) / max(l, 1e-4); return mix(c, c * k, uPre); }
    void main(){
      vec2 t = uTexel;
      vec3 a = pre(texture2D(tSrc, vUv + t*vec2(-2.,-2.)).rgb), b = pre(texture2D(tSrc, vUv + t*vec2(0.,-2.)).rgb), c = pre(texture2D(tSrc, vUv + t*vec2(2.,-2.)).rgb);
      vec3 d = pre(texture2D(tSrc, vUv + t*vec2(-2.,0.)).rgb), e = pre(texture2D(tSrc, vUv).rgb), f = pre(texture2D(tSrc, vUv + t*vec2(2.,0.)).rgb);
      vec3 g = pre(texture2D(tSrc, vUv + t*vec2(-2.,2.)).rgb), h = pre(texture2D(tSrc, vUv + t*vec2(0.,2.)).rgb), i = pre(texture2D(tSrc, vUv + t*vec2(2.,2.)).rgb);
      vec3 j = pre(texture2D(tSrc, vUv + t*vec2(-1.,-1.)).rgb), k = pre(texture2D(tSrc, vUv + t*vec2(1.,-1.)).rgb), l = pre(texture2D(tSrc, vUv + t*vec2(-1.,1.)).rgb), m = pre(texture2D(tSrc, vUv + t*vec2(1.,1.)).rgb);
      gl_FragColor = vec4(e*0.125 + (a+c+g+i)*0.03125 + (b+d+f+h)*0.0625 + (j+k+l+m)*0.125, 1.0);
    }`, { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() }, uThr: { value: 1 }, uPre: { value: 0 } });
  P.up = fsMat(`
    varying vec2 vUv; uniform sampler2D tSrc; uniform sampler2D tAdd; uniform vec2 uTexel;
    void main(){
      vec2 t = uTexel; vec3 s = texture2D(tSrc, vUv).rgb * 4.0;
      s += (texture2D(tSrc, vUv + vec2(-t.x,0.)).rgb + texture2D(tSrc, vUv + vec2(t.x,0.)).rgb + texture2D(tSrc, vUv + vec2(0.,-t.y)).rgb + texture2D(tSrc, vUv + vec2(0.,t.y)).rgb) * 2.0;
      s += texture2D(tSrc, vUv + vec2(-t.x,-t.y)).rgb + texture2D(tSrc, vUv + vec2(t.x,-t.y)).rgb + texture2D(tSrc, vUv + vec2(-t.x,t.y)).rgb + texture2D(tSrc, vUv + vec2(t.x,t.y)).rgb;
      gl_FragColor = vec4(s / 16.0 + texture2D(tAdd, vUv).rgb, 1.0);
    }`, { tSrc: { value: null }, tAdd: { value: null }, uTexel: { value: new THREE.Vector2() } });
  P.final = fsMat(`
    varying vec2 vUv; uniform sampler2D tScene; uniform sampler2D tBloom; uniform float uBloom; uniform float uTime; uniform vec2 uRes;
    uniform float uDamage; uniform float uHeal; uniform float uDesat; uniform float uFlash; uniform float uVig; uniform float uExposure; uniform float uBlind; uniform float uTint; uniform vec3 uGrade; uniform float uCA;
    vec3 aces(vec3 x){ return clamp((x*(2.51*x+0.03))/(x*(2.43*x+0.59)+0.14), 0.0, 1.0); }
    float hash(vec2 p){ p = fract(p*vec2(123.34, 456.21)); p += dot(p, p+45.32); return fract(p.x*p.y); }
    void main(){
      vec2 c = vUv - 0.5; float r2 = dot(c, c);
      float ca = uCA * r2; vec3 col;
      col.r = texture2D(tScene, vUv + c * ca).r; col.g = texture2D(tScene, vUv).g; col.b = texture2D(tScene, vUv - c * ca).b;
      col += texture2D(tBloom, vUv).rgb * uBloom;
      col *= uExposure;
      float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col *= mix(vec3(0.94, 0.98, 1.08), uGrade, smoothstep(0.0, 1.0, l));
      col = aces(col);
      col = pow(col, vec3(1.0 / 2.2));
      l = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col = mix(col, vec3(l) * vec3(0.85, 0.92, 1.1), uDesat);
      col *= mix(1.0, smoothstep(0.65, 0.05, r2), 0.55 * uVig);
      float edge = smoothstep(0.05, 0.42, r2);
      col = mix(col, vec3(0.95, 0.05, 0.1), uDamage * edge * 0.75);
      col = mix(col, vec3(0.35, 1.0, 0.65), uHeal * edge * 0.4);
      col = mix(col, vec3(0.55, 0.25, 0.95) * l, uTint * edge * 0.6);
      col = mix(col, vec3(0.02, 0.0, 0.04), uBlind * (0.55 + 0.4 * smoothstep(0.0, 0.25, r2)));
      col += uFlash;
      col += (hash(vUv * uRes + fract(uTime) * 61.0) - 0.5) * 0.02;
      gl_FragColor = vec4(col, 1.0);
    }`, { tScene: { value: null }, tBloom: { value: null }, uBloom: { value: 0.9 }, uTime: { value: 0 }, uRes: { value: new THREE.Vector2(1, 1) }, uDamage: { value: 0 }, uHeal: { value: 0 }, uDesat: { value: 0 }, uFlash: { value: 0 }, uVig: { value: 1 }, uExposure: { value: 1 }, uBlind: { value: 0 }, uTint: { value: 0 }, uGrade: { value: new THREE.Vector3(1.05, 1.0, 0.94) }, uCA: { value: 0.003 } });
  P.black = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1); P.black.needsUpdate = true;
  makeSurfaces();
  Fx.init();
  applyQuality();
  window.addEventListener('resize', () => resizeGfx());
}

function applyQuality() {
  const q = QUALITY[clamp(Settings.q | 0, 0, 3)], r = G.renderer;
  G.msaa = r.capabilities.isWebGL2 ? Math.min(q.msaa, r.capabilities.maxSamples || 4) : 0;
  G.prBase = Math.min(Math.min(window.devicePixelRatio || 1, 2) * q.pr, q.maxH / Math.max(1, r.domElement.clientHeight || 720));
  G.pr = G.prBase * (G.autoScale || 1); G.bloomLevels = q.bloom; G.lightsOn = q.lights;
  const type = q.soft ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap, relight = r.shadowMap.type !== type;
  r.shadowMap.type = type;
  if (G.sun.shadow.mapSize.x !== q.shadow) { G.sun.shadow.mapSize.set(q.shadow, q.shadow); if (G.sun.shadow.map) { G.sun.shadow.map.dispose(); G.sun.shadow.map = null; } }
  G.sun.shadow.normalBias = clamp(110 / q.shadow * 0.9, 0.03, 0.12);
  if (relight) { const seen = new Set(); G.scene.traverse(o => { const m = o.material; if (m && m.isMaterial && !seen.has(m)) { seen.add(m); m.needsUpdate = true; } }); }
  resizeGfx(true);
}
function resizeGfx(force) {
  const cv = G.renderer.domElement, cw = Math.max(2, cv.clientWidth), ch = Math.max(2, cv.clientHeight);
  G.prBase = Math.min(Math.min(window.devicePixelRatio || 1, 2) * QUALITY[clamp(Settings.q | 0, 0, 3)].pr, QUALITY[clamp(Settings.q | 0, 0, 3)].maxH / ch);
  G.pr = G.prBase * (G.autoScale || 1);
  const w = Math.max(2, Math.round(cw * G.pr)), h = Math.max(2, Math.round(ch * G.pr));
  if (!force && w === G.w && h === G.h) return;
  G.w = w; G.h = h; G.cw = cw; G.ch = ch;
  G.renderer.setPixelRatio(1); G.renderer.setSize(w, h, false);
  G.camera.aspect = cw / ch; G.camera.updateProjectionMatrix(); G.vmCam.aspect = cw / ch; G.vmCam.updateProjectionMatrix();
  const type = G.hdr ? THREE.HalfFloatType : THREE.UnsignedByteType;
  if (G.rtScene) G.rtScene.dispose();
  G.rtScene = new THREE.WebGLRenderTarget(w, h, { type, samples: G.msaa, depthBuffer: true, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, generateMipmaps: false });
  if (G.renderer.capabilities.isWebGL2) { if (G.rtDepth) G.rtDepth.dispose(); G.rtDepth = new THREE.DepthTexture(w, h); G.rtDepth.type = THREE.UnsignedIntType; G.rtScene.depthTexture = G.rtDepth; }
  for (const m of G.mips) m.dispose(); for (const m of G.ups) m.dispose();
  G.mips = []; let mw = w, mh = h;
  for (let i = 0; i < G.bloomLevels; i++) {
    mw = Math.max(2, mw >> 1); mh = Math.max(2, mh >> 1);
    G.mips.push(new THREE.WebGLRenderTarget(mw, mh, { type, depthBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, generateMipmaps: false }));
    if (mw <= 8 || mh <= 8) break;
  }
  G.ups = G.mips.slice(0, -1).map(m => new THREE.WebGLRenderTarget(m.width, m.height, { type, depthBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, generateMipmaps: false }));
  G.post.final.uniforms.uRes.value.set(w, h);
}
function blit(mat, target) { G.fsMesh.material = mat; G.renderer.setRenderTarget(target); G.renderer.render(G.fsScene, G.fsCam); }

function renderFrame(withVm) {
  const r = G.renderer, P = G.post;
  r.setRenderTarget(G.rtScene); r.autoClear = true;
  r.render(G.scene, G.camera);
  if (withVm) { r.autoClear = false; r.clearDepth(); r.render(G.vmScene, G.vmCam); r.autoClear = true; }
  let bloomTex = P.black; const n = G.mips.length;
  if (n >= 2) {
    const d = P.down.uniforms;
    d.tSrc.value = G.rtScene.texture; d.uTexel.value.set(1 / G.w, 1 / G.h); d.uPre.value = 1; d.uThr.value = G.hdr ? 1.1 : 0.8; blit(P.down, G.mips[0]); d.uPre.value = 0;
    for (let i = 1; i < n; i++) { d.tSrc.value = G.mips[i - 1].texture; d.uTexel.value.set(1 / G.mips[i - 1].width, 1 / G.mips[i - 1].height); blit(P.down, G.mips[i]); }
    const u = P.up.uniforms; let src = G.mips[n - 1];
    for (let i = n - 2; i >= 0; i--) { u.tSrc.value = src.texture; u.tAdd.value = G.mips[i].texture; u.uTexel.value.set(1 / src.width, 1 / src.height); blit(P.up, G.ups[i]); src = G.ups[i]; }
    bloomTex = src.texture;
  }
  const f = P.final.uniforms, fx = G.fx;
  f.tScene.value = G.rtScene.texture; f.tBloom.value = bloomTex; f.uBloom.value = (G.hdr ? 0.1 : 0.15) * (n >= 2 ? 1 : 0); f.uTime.value = G.time;
  f.uDamage.value = fx.damage; f.uHeal.value = fx.heal; f.uDesat.value = fx.desat; f.uFlash.value = fx.flash; f.uVig.value = fx.vig; f.uExposure.value = G.exposure; f.uBlind.value = fx.blind; f.uTint.value = fx.tint;
  blit(P.final, null);
}

// ---------------------------------------------------------------- procedural surfaces
// Every surface is drawn into a canvas: a height field first (which also becomes the normal map), then colour.
function vnoise(size, cells, seed) {
  // tileable value noise, smoothly interpolated
  const rng = mulberry(seed), g = new Float32Array(cells * cells); for (let i = 0; i < g.length; i++) g[i] = rng();
  const out = new Float32Array(size * size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const fx = x / size * cells, fy = y / size * cells, ix = Math.floor(fx), iy = Math.floor(fy), tx = fx - ix, ty = fy - iy;
    const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
    const a = g[(iy % cells) * cells + ix % cells], b = g[(iy % cells) * cells + (ix + 1) % cells], c = g[((iy + 1) % cells) * cells + ix % cells], d = g[((iy + 1) % cells) * cells + (ix + 1) % cells];
    out[y * size + x] = lerp(lerp(a, b, sx), lerp(c, d, sx), sy);
  }
  return out;
}
function fbm(size, base, oct, seed, gain = 0.5) {
  const out = new Float32Array(size * size); let amp = 1, tot = 0;
  for (let o = 0; o < oct; o++) { const n = vnoise(size, base << o, seed + o * 17); for (let i = 0; i < out.length; i++) out[i] += n[i] * amp; tot += amp; amp *= gain; }
  for (let i = 0; i < out.length; i++) out[i] /= tot;
  return out;
}
function texFrom(size, colorFn, heightArr, opts = {}) {
  const cv = document.createElement('canvas'); cv.width = cv.height = size;
  const ctx = cv.getContext('2d'), img = ctx.createImageData(size, size), d = img.data;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const i = y * size + x, c = colorFn(x, y, i); d[i * 4] = clamp(c[0] * 255, 0, 255); d[i * 4 + 1] = clamp(c[1] * 255, 0, 255); d[i * 4 + 2] = clamp(c[2] * 255, 0, 255); d[i * 4 + 3] = c[3] == null ? 255 : clamp(c[3] * 255, 0, 255);
  }
  ctx.putImageData(img, 0, 0);
  const map = new THREE.CanvasTexture(cv); map.wrapS = map.wrapT = THREE.RepeatWrapping; map.encoding = THREE.sRGBEncoding; map.anisotropy = 8;
  let normal = null;
  if (heightArr) {
    const nc = document.createElement('canvas'); nc.width = nc.height = size; const nctx = nc.getContext('2d'), nimg = nctx.createImageData(size, size), nd = nimg.data, k = opts.bump || 2.5;
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const h = (xx, yy) => heightArr[((yy + size) % size) * size + (xx + size) % size];
      const dx = (h(x + 1, y) - h(x - 1, y)) * k, dy = (h(x, y + 1) - h(x, y - 1)) * k, l = Math.sqrt(dx * dx + dy * dy + 1), i = (y * size + x) * 4;
      nd[i] = (-dx / l * 0.5 + 0.5) * 255; nd[i + 1] = (dy / l * 0.5 + 0.5) * 255; nd[i + 2] = (1 / l * 0.5 + 0.5) * 255; nd[i + 3] = 255;
    }
    nctx.putImageData(nimg, 0, 0);
    normal = new THREE.CanvasTexture(nc); normal.wrapS = normal.wrapT = THREE.RepeatWrapping; normal.anisotropy = 8;
  }
  return { map, normal };
}
const hexRGB = hex => [(hex >> 16 & 255) / 255, (hex >> 8 & 255) / 255, (hex & 255) / 255];
const mixc = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
const mulc = (a, k) => [a[0] * k, a[1] * k, a[2] * k];

const SURF = {};
function surface(key, size, scale, build, matOpts = {}) {
  const t = build(size);
  const m = new THREE.MeshStandardMaterial(Object.assign({ map: t.map, normalMap: t.normal, roughness: 0.85, metalness: 0.0 }, matOpts));
  m.envMapIntensity = (matOpts.metalness || 0) > 0.4 ? 0.8 : 0.35;
  if (t.normal) m.normalScale = new THREE.Vector2(matOpts.ns || 1, matOpts.ns || 1);
  delete m.ns;
  m.userData.scale = scale; SURF[key] = m; return m;
}
function makeSurfaces() {
  const S = 256, L = 512;
  // concrete: two scales of noise, stains, hairline cracks
  surface('concrete', L, 4, s => {
    const n = fbm(s, 4, 5, 11), st = fbm(s, 2, 3, 99), base = hexRGB(0x75716c);
    return texFrom(s, (x, y, i) => { const v = 0.78 + n[i] * 0.35 - Math.max(0, st[i] - 0.55) * 0.9; return mulc(mixc(base, [0.52, 0.48, 0.44], st[i] * 0.4), v); }, n, { bump: 1.6 });
  }, { roughness: 0.92 });
  surface('asphalt', L, 5, s => {
    const n = fbm(s, 8, 4, 21), w = fbm(s, 3, 3, 5);
    return texFrom(s, (x, y, i) => { const v = 0.16 + n[i] * 0.12; const line = (Math.abs(((x / s) * 4) % 1 - 0.5) < 0.015 && (y / s * 4) % 1 < 0.5) ? 0.5 : 0; return [v + line * 0.9, v + line * 0.75, v + line * 0.2]; }, n, { bump: 1.2 });
  }, { roughness: 0.35, metalness: 0.05 });
  surface('brick', L, 3, s => {
    const n = fbm(s, 8, 4, 31), h = new Float32Array(s * s), rows = 12, cols = 4, rng = mulberry(7), tint = [];
    for (let k = 0; k < rows * cols * 2; k++) tint.push(rng());
    for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
      const ry = y / s * rows, row = Math.floor(ry), off = row % 2 ? 0.5 : 0, rx = x / s * cols + off, col = Math.floor(rx);
      const fy = ry - row, fx = rx - col, mortar = fy < 0.1 || fx < 0.04;
      h[y * s + x] = mortar ? 0.2 : 0.75 + n[y * s + x] * 0.25;
    }
    return texFrom(s, (x, y, i) => {
      const ry = y / s * rows, row = Math.floor(ry), off = row % 2 ? 0.5 : 0, col = Math.floor(x / s * cols + off) % cols, t = tint[(row * cols + col) % tint.length];
      if (h[i] < 0.3) return mulc([0.42, 0.4, 0.38], 0.8 + n[i] * 0.3);
      return mulc(mixc([0.55, 0.22, 0.14], [0.36, 0.16, 0.12], t), 0.75 + n[i] * 0.5);
    }, h, { bump: 3 });
  }, { roughness: 0.9 });
  const panels = (key, hex, rust, metal, seam = 4, opts = {}) => surface(key, L, opts.scale || 3, s => {
    const n = fbm(s, 6, 5, key.length * 13), r = fbm(s, 3, 4, key.length * 7), h = new Float32Array(s * s), base = hexRGB(hex);
    for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
      const fx = (x / s * seam) % 1, fy = (y / s * (seam / 2)) % 1, sm = fx < 0.012 || fy < 0.012 ? 0 : 1;
      const rv = (Math.abs(fx - 0.05) < 0.012 || Math.abs(fx - 0.95) < 0.012) && ((fy * 8) % 1 < 0.14) ? 1.4 : 1;
      h[y * s + x] = sm * (0.6 + n[y * s + x] * 0.1) * rv;
    }
    return texFrom(s, (x, y, i) => { let c = mulc(base, 0.8 + n[i] * 0.4); c = mixc(c, [0.42, 0.2, 0.08], Math.max(0, r[i] - (1 - rust)) * 2.5); if (h[i] === 0) c = mulc(c, 0.45); return c; }, h, { bump: 2.4 });
  }, Object.assign({ roughness: 0.55, metalness: metal }, opts.mat || {}));
  panels('steel', 0x6f747c, 0.25, 0.75); panels('iron', 0x3c3d42, 0.35, 0.8, 2); panels('tank', 0x5e6b62, 0.45, 0.6, 3, { scale: 4 });
  panels('crane', 0xd8a01c, 0.3, 0.55, 2, { scale: 2 }); panels('shedwall', 0x4b5566, 0.2, 0.5, 5, { scale: 4 });
  // corrugated metal: containers, roofs, sheds
  const corr = (key, hex, rust, opts = {}) => surface(key, L, opts.scale || 2.6, s => {
    const n = fbm(s, 6, 4, key.length * 5 + 3), r = fbm(s, 4, 4, key.length * 3), h = new Float32Array(s * s), base = hexRGB(hex);
    for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) h[y * s + x] = 0.5 + 0.5 * Math.sin(x / s * TAU * 16) * 0.8 + n[y * s + x] * 0.1;
    return texFrom(s, (x, y, i) => { let c = mulc(base, 0.75 + h[i] * 0.25 + n[i] * 0.2); c = mixc(c, [0.38, 0.18, 0.07], Math.max(0, r[i] - (1 - rust)) * 2); const streak = fbm.cache ? 0 : 0; return mulc(c, 1 - streak); }, h, { bump: 3.2 });
  }, Object.assign({ roughness: 0.5, metalness: 0.55 }, opts.mat || {}));
  corr('container', 0xa8321e, 0.35); corr('container2', 0x1f5f8a, 0.3); corr('container3', 0x2f7a3e, 0.3); corr('roof', 0x3b3f46, 0.3, { scale: 3 }); corr('shed', 0x59606a, 0.25, { scale: 3.5 });
  // grating: see-through steel mesh
  surface('grate', S, 1.2, s => {
    const h = new Float32Array(s * s);
    for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) { const fx = (x / s * 8) % 1, fy = (y / s * 4) % 1; h[y * s + x] = (fx < 0.22 || fy < 0.12) ? 1 : 0; }
    return texFrom(s, (x, y, i) => h[i] ? [0.36, 0.37, 0.4, 1] : [0, 0, 0, 0], h, { bump: 1.5 });
  }, { roughness: 0.45, metalness: 0.85, alphaTest: 0.5, side: THREE.DoubleSide });
  surface('rail', S, 1, s => texFrom(s, () => [0.62, 0.45, 0.08]), { roughness: 0.45, metalness: 0.6 });
  surface('stack', L, 3, s => {
    const n = fbm(s, 8, 4, 41), h = new Float32Array(s * s);
    for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) { const ry = (y / s * 16) % 1, rx = (x / s * 8 + (Math.floor(y / s * 16) % 2) * 0.5) % 1; h[y * s + x] = ry < 0.1 || rx < 0.04 ? 0.2 : 0.8; }
    return texFrom(s, (x, y, i) => { const soot = Math.pow(y / s, 0.5) * 0; return mulc(h[i] < 0.3 ? [0.3, 0.28, 0.27] : [0.42, 0.19, 0.13], (0.7 + n[i] * 0.5) * (1 - soot)); }, h, { bump: 2.5 });
  }, { roughness: 0.9 });
  surface('crate', S, 1.6, s => {
    const n = fbm(s, 4, 4, 51), g = vnoise(s, 64, 3), h = new Float32Array(s * s);
    for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) { const fy = (y / s * 5) % 1, edge = x < s * 0.07 || x > s * 0.93 || y < s * 0.07 || y > s * 0.93; h[y * s + x] = edge ? 1 : fy < 0.04 ? 0.2 : 0.6 + g[y * s + x] * 0.1; }
    return texFrom(s, (x, y, i) => mulc(h[i] === 1 ? [0.45, 0.31, 0.18] : [0.62, 0.45, 0.26], 0.7 + n[i] * 0.3 + g[i] * 0.2), h, { bump: 2.5 });
  }, { roughness: 0.8 });
  surface('barrier', S, 2, s => {
    const n = fbm(s, 6, 4, 61);
    return texFrom(s, (x, y, i) => { const stripe = y > s * 0.78 && y < s * 0.9 ? (((x + y) / s * 6) % 1 < 0.5 ? [0.9, 0.7, 0.1] : [0.1, 0.1, 0.1]) : null; return stripe ? mulc(stripe, 0.8 + n[i] * 0.3) : mulc([0.7, 0.7, 0.68], 0.65 + n[i] * 0.4); }, n, { bump: 1 });
  }, { roughness: 0.85 });
  surface('stairs', S, 1, s => {
    const n = fbm(s, 6, 4, 71), h = new Float32Array(s * s);
    for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) h[y * s + x] = (x / s * 6) % 1 < 0.06 ? 0.3 : 0.7 + n[y * s + x] * 0.2;
    return texFrom(s, (x, y, i) => mulc([0.55, 0.55, 0.56], 0.7 + n[i] * 0.35), h);
  }, { roughness: 0.6, metalness: 0.4 });
  // stone: irregular flagstones with moss in the joints
  const stone = (key, hex, moss, opts = {}) => surface(key, L, opts.scale || 3.2, s => {
    const n = fbm(s, 8, 5, key.length * 19), m = fbm(s, 4, 4, key.length * 23), h = new Float32Array(s * s), rng = mulberry(key.length * 31), tint = [];
    const rows = opts.rows || 4, cols = opts.cols || 4; for (let k = 0; k < 64; k++) tint.push(rng());
    for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
      const ry = y / s * rows, row = Math.floor(ry), rx = x / s * cols + (row % 2) * 0.37, fy = ry - row, fx = rx - Math.floor(rx);
      const w = 0.035 + n[y * s + x] * 0.03, j = fy < w || fx < w * 0.8 || fy > 1 - w * 0.3;
      h[y * s + x] = j ? 0.1 : 0.7 + n[y * s + x] * 0.3;
    }
    const base = hexRGB(hex);
    return texFrom(s, (x, y, i) => {
      const ry = y / s * rows, row = Math.floor(ry), col = Math.floor(x / s * cols + (row % 2) * 0.37), t = tint[(row * 7 + col) % 64];
      let c = mulc(base, 0.72 + t * 0.25 + n[i] * 0.3);
      if (h[i] < 0.2) c = mixc([0.16, 0.16, 0.12], [0.16, 0.24, 0.09], m[i] * moss);
      else c = mixc(c, [0.24, 0.32, 0.13], Math.max(0, m[i] - 0.62) * moss * 2);
      return c;
    }, h, { bump: 2.6 });
  }, Object.assign({ roughness: 0.88 }, opts.mat || {}));
  stone('flagstone', 0x9a8f78, 0.8, { rows: 5, cols: 5 }); stone('flag2', 0xd6c9aa, 0.6, { rows: 3, cols: 3, scale: 2.5 }); stone('temple', 0xc2b08c, 0.8, { rows: 6, cols: 3 });
  stone('ruin', 0x9f9784, 1.2, { rows: 6, cols: 3 }); stone('roofstone', 0x8d806a, 1, { rows: 3, cols: 2 }); stone('stepstone', 0xb9ab8f, 0.7, { rows: 1, cols: 3, scale: 2 });
  surface('pillar', L, 2.4, s => {
    const n = fbm(s, 8, 5, 81), m = fbm(s, 4, 4, 82), h = new Float32Array(s * s);
    for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) h[y * s + x] = 0.5 + 0.5 * Math.cos(x / s * TAU * 6) * 0.6 + n[y * s + x] * 0.2;
    return texFrom(s, (x, y, i) => mixc(mulc([0.8, 0.76, 0.66], 0.7 + n[i] * 0.4), [0.3, 0.42, 0.18], Math.max(0, m[i] - 0.6) * 2), h, { bump: 3 });
  }, { roughness: 0.85 });
  surface('hedge', S, 1.5, s => {
    const n = fbm(s, 16, 4, 91), b = vnoise(s, 48, 92);
    return texFrom(s, (x, y, i) => mulc([0.16, 0.36, 0.12], 0.5 + n[i] * 0.6 + b[i] * 0.4), b, { bump: 4 });
  }, { roughness: 0.95 });
  surface('none', 4, 1, s => texFrom(s, () => [0, 0, 0]));
}
function boxGeo(s) {
  const w = s.x1 - s.x0, h = s.y1 - s.y0, d = s.z1 - s.z0, g = new THREE.BoxGeometry(w, h, d).toNonIndexed();
  g.translate((s.x0 + s.x1) / 2, (s.y0 + s.y1) / 2, (s.z0 + s.z1) / 2);
  return g;
}
// world-space box projection for UVs, so a surface keeps its scale however big the block is
function worldUV(g, scale) {
  const p = g.attributes.position, n = g.attributes.normal, uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    const nx = Math.abs(n.getX(i)), ny = Math.abs(n.getY(i)), nz = Math.abs(n.getZ(i)), x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    let u, v;
    if (ny >= nx && ny >= nz) { u = x; v = z; } else if (nx >= nz) { u = z * Math.sign(n.getX(i) || 1); v = y; } else { u = -x * Math.sign(n.getZ(i) || 1); v = y; }
    uv[i * 2] = u / scale; uv[i * 2 + 1] = v / scale;
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
}
function mergeGeos(list) {
  let n = 0; for (const g of list) n += g.attributes.position.count;
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), uv = new Float32Array(n * 2); let o = 0;
  for (const g of list) { pos.set(g.attributes.position.array, o * 3); nor.set(g.attributes.normal.array, o * 3); if (g.attributes.uv) uv.set(g.attributes.uv.array, o * 2); o += g.attributes.position.count; g.dispose(); }
  const m = new THREE.BufferGeometry(); m.setAttribute('position', new THREE.BufferAttribute(pos, 3)); m.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); m.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  m.computeBoundingSphere(); return m;
}
function toNI(g) { const n = g.index ? g.toNonIndexed() : g; if (n !== g) g.dispose(); return n; }

// ---------------------------------------------------------------- sky
const SKY_FRAG = `
  varying vec3 vDir; uniform vec3 uTop; uniform vec3 uHor; uniform vec3 uBot; uniform vec3 uSun; uniform vec3 uSunCol; uniform float uTime; uniform float uStars; uniform float uCloud; uniform vec3 uCloudCol;
  float h3(vec3 p){ p = fract(p*0.3183099+0.1); p *= 17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
  float n3(vec3 x){ vec3 i = floor(x), f = fract(x); f = f*f*(3.0-2.0*f);
    return mix(mix(mix(h3(i),h3(i+vec3(1,0,0)),f.x),mix(h3(i+vec3(0,1,0)),h3(i+vec3(1,1,0)),f.x),f.y),mix(mix(h3(i+vec3(0,0,1)),h3(i+vec3(1,0,1)),f.x),mix(h3(i+vec3(0,1,1)),h3(i+vec3(1,1,1)),f.x),f.y),f.z); }
  float fbm(vec3 p){ float a = 0.5, s = 0.0; for (int i = 0; i < 5; i++){ s += a*n3(p); p *= 2.03; a *= 0.5; } return s; }
  void main(){
    vec3 d = normalize(vDir); float y = d.y;
    vec3 col = y > 0.0 ? mix(uHor, uTop, pow(clamp(y, 0.0, 1.0), 0.55)) : mix(uHor, uBot, pow(clamp(-y*3.0, 0.0, 1.0), 0.6));
    float sd = max(dot(d, normalize(uSun)), 0.0);
    col += uSunCol * (pow(sd, 900.0) * 40.0 + pow(sd, 12.0) * 0.45 + pow(sd, 3.0) * 0.12);
    if (y > 0.0) {
      vec2 uv = d.xz / (y + 0.12);
      float c = fbm(vec3(uv * 1.3 + vec2(uTime * 0.006, 0.0), uTime * 0.01));
      float cov = smoothstep(0.42, 0.8, c) * uCloud * smoothstep(0.0, 0.25, y);
      vec3 cc = uCloudCol * (0.75 + 0.5 * fbm(vec3(uv * 2.6, 3.0))) + uSunCol * pow(sd, 6.0) * 0.6;
      col = mix(col, cc, cov);
      float st = pow(h3(floor(d * 420.0)), 60.0) * uStars * smoothstep(0.05, 0.4, y) * (1.0 - cov);
      col += vec3(st) * 3.0;
    }
    gl_FragColor = vec4(col, 1.0);
  }`;
const SKIES = {
  dusk: { top: 0x1c1f4a, hor: 0xf08a54, bot: 0x2a1a24, sunCol: 0xffa260, stars: 0.04, cloud: 0.75, cloudCol: 0x6b4462, grade: [1.08, 1.0, 0.9] },
  day: { top: 0x2f78d0, hor: 0xc8e2f0, bot: 0x7e8a6a, sunCol: 0xfff2d8, stars: 0, cloud: 0.55, cloudCol: 0xf4f6fa, grade: [1.04, 1.02, 0.95] },
  night: { top: 0x02040b, hor: 0x1c2a4a, bot: 0x05070c, sunCol: 0x6a8cff, stars: 0.7, cloud: 0.9, cloudCol: 0x1c2436, grade: [0.98, 1.0, 1.08] },
};
function makeSky(kind, sunDir) {
  const S = SKIES[kind], c = h => new THREE.Color(h);
  const mat = new THREE.ShaderMaterial({
    vertexShader: 'varying vec3 vDir; void main(){ vDir = position; vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position = p.xyww; }',
    fragmentShader: SKY_FRAG, side: THREE.BackSide, depthWrite: false,
    uniforms: { uTop: { value: c(S.top) }, uHor: { value: c(S.hor) }, uBot: { value: c(S.bot) }, uSun: { value: new V3(...sunDir).normalize() }, uSunCol: { value: c(S.sunCol) }, uTime: { value: 0 }, uStars: { value: S.stars }, uCloud: { value: S.cloud }, uCloudCol: { value: c(S.cloudCol) } },
  });
  const m = new THREE.Mesh(new THREE.SphereGeometry(500, 48, 24), mat); m.frustumCulled = false; m.renderOrder = -10;
  return m;
}

// ---------------------------------------------------------------- level meshes
const MAT_EMISSIVE = {};
function glowMat(hex, k = 3) { const key = hex + ':' + k; if (!MAT_EMISSIVE[key]) MAT_EMISSIVE[key] = new THREE.MeshBasicMaterial({ color: hdrCol(hex, k), toneMapped: false }); return MAT_EMISSIVE[key]; }
function stdMat(o) { return new THREE.MeshStandardMaterial(o); }

function buildLevel(def) {
  if (G.level) { G.scene.remove(G.level); G.level.traverse(o => { if (o.geometry) o.geometry.dispose(); }); }
  G.anim = []; G.lightSrc = []; Fx.clear();
  const L = G.level = new THREE.Group(), th = def.theme;
  G.scene.add(L);
  // sky, light, fog
  const sunDir = new V3(...th.sunDir).normalize();
  G.sky = dyn(makeSky(th.sky, th.sunDir)); L.add(G.sky);
  G.scene.fog = new THREE.FogExp2(th.fog[0], th.fog[1]);
  G.sun.color.set(th.sun[0]); G.sun.intensity = th.sun[1];
  G.sun.position.copy(sunDir).multiplyScalar(80); G.sun.target.position.set(0, 0, 0);
  const B = def.bounds, span = Math.max(B.x1 - B.x0, B.z1 - B.z0) * 0.62, sc = G.sun.shadow.camera;
  sc.left = -span; sc.right = span; sc.top = span; sc.bottom = -span; sc.near = 10; sc.far = 200; sc.updateProjectionMatrix();
  G.hemi.color.set(th.hemi[0]); G.hemi.groundColor.set(th.hemi[1]); G.hemi.intensity = th.hemi[2];
  G.exposure = th.exposure;
  const S = SKIES[th.sky]; G.post.final.uniforms.uGrade.value.set(...S.grade);
  G.vmSun.color.set(th.sun[0]); G.vmSun.intensity = 1.2 + th.sun[1] * 0.3; G.vmSun.position.copy(sunDir);
  // environment reflections from the sky
  try {
    const pm = new THREE.PMREMGenerator(G.renderer), es = new THREE.Scene(); es.add(makeSky(th.sky, th.sunDir));
    const rt = pm.fromScene(es, 0.02); G.scene.environment = rt.texture; G.vmScene.environment = rt.texture; pm.dispose();
  } catch (e) { G.scene.environment = null; }
  // the floor
  const fm = SURF[th.floor] || SURF.concrete, fw = B.x1 - B.x0 + 30, fd = B.z1 - B.z0 + 30;
  const fg = new THREE.PlaneGeometry(fw, fd, 1, 1); fg.rotateX(-Math.PI / 2);
  const fuv = fg.attributes.uv; for (let i = 0; i < fuv.count; i++) fuv.setXY(i, fuv.getX(i) * fw / fm.userData.scale, fuv.getY(i) * fd / fm.userData.scale);
  const floor = new THREE.Mesh(fg, fm); floor.receiveShadow = true; L.add(floor);
  if (th.floor === 'asphalt') floor.visible = true;
  // solids grouped by surface, with special shapes for chimneys and pillars
  const groups = {}, trims = {}, dirt = [];
  for (const s of World.solids) {
    if (!s.vis || s.mat === 'none') continue;
    const m = SURF[s.mat] || SURF.concrete;
    let g;
    if (s.mat === 'stack' || s.mat === 'pillar') {
      const rad = (s.x1 - s.x0) / 2 * (s.mat === 'stack' ? 1.08 : 0.95), seg = s.mat === 'stack' ? 12 : 16;
      g = toNI(new THREE.CylinderGeometry(rad * (s.mat === 'stack' ? 0.9 : 1), rad, s.y1 - s.y0, seg, 1, false)); g.translate((s.x0 + s.x1) / 2, (s.y0 + s.y1) / 2, (s.z0 + s.z1) / 2);
      const p = g.attributes.position, uv = new Float32Array(p.count * 2), cx = (s.x0 + s.x1) / 2, cz = (s.z0 + s.z1) / 2;
      for (let i = 0; i < p.count; i++) { uv[i * 2] = (Math.atan2(p.getZ(i) - cz, p.getX(i) - cx) / TAU + 0.5) * rad * TAU / m.userData.scale; uv[i * 2 + 1] = p.getY(i) / m.userData.scale; }
      g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
      if (s.mat === 'pillar') { const cap = toNI(new THREE.BoxGeometry(rad * 2.5, 0.4, rad * 2.5)); cap.translate(cx, s.y1 - 0.2, cz); worldUV(cap, 2); (groups.temple = groups.temple || { m: SURF.temple, list: [] }).list.push(cap); const base = toNI(new THREE.BoxGeometry(rad * 2.5, 0.5, rad * 2.5)); base.translate(cx, s.y0 + 0.25, cz); worldUV(base, 2); groups.temple.list.push(base); }
    } else g = worldUV(boxGeo(s), m.userData.scale);
    (groups[s.mat] = groups[s.mat] || { m, list: [] }).list.push(g);
    if (s.trim) {
      const t = (trims[s.trim] = trims[s.trim] || []), y = s.y1 + 0.015, e = 0.045;
      const add = (x, z, w, d) => { const b = toNI(new THREE.BoxGeometry(w, 0.03, d)); b.translate(x, y, z); t.push(b); };
      add((s.x0 + s.x1) / 2, s.z0 + e / 2, s.x1 - s.x0, e); add((s.x0 + s.x1) / 2, s.z1 - e / 2, s.x1 - s.x0, e);
      add(s.x0 + e / 2, (s.z0 + s.z1) / 2, e, s.z1 - s.z0); add(s.x1 - e / 2, (s.z0 + s.z1) / 2, e, s.z1 - s.z0);
    }
    if (s.y0 < 0.05 && s.y1 - s.y0 > 0.6 && s.mat !== 'pillar' && s.mat !== 'stack') dirt.push(s);
  }
  for (const R of World.ramps) if (R.vis) buildStairs(R, groups);
  for (const k in groups) {
    const mesh = new THREE.Mesh(mergeGeos(groups[k].list), groups[k].m);
    mesh.castShadow = true; mesh.receiveShadow = true; L.add(mesh);
  }
  for (const k in trims) { const m = new THREE.Mesh(mergeGeos(trims[k]), glowMat(+k, 2.2)); L.add(m); }
  // contact darkening at the foot of every wall: a soft dark gradient on the wall and on the floor beside it
  if (dirt.length) {
    const pos = [], uv = [];
    const quad = (a, b, c, d, ua, ub) => { pos.push(...a, ...b, ...c, ...a, ...c, ...d); uv.push(ua, 0, ub, 0, ub, 1, ua, 0, ub, 1, ua, 1); };
    for (const s of dirt) {
      const hh = 0.9, o = 0.012, fo = 0.75, X0 = s.x0 - o, X1 = s.x1 + o, Z0 = s.z0 - o, Z1 = s.z1 + o;
      quad([X0, 0, Z0], [X1, 0, Z0], [X1, hh, Z0], [X0, hh, Z0], 0, 0); quad([X1, 0, Z1], [X0, 0, Z1], [X0, hh, Z1], [X1, hh, Z1], 0, 0);
      quad([X0, 0, Z1], [X0, 0, Z0], [X0, hh, Z0], [X0, hh, Z1], 0, 0); quad([X1, 0, Z0], [X1, 0, Z1], [X1, hh, Z1], [X1, hh, Z0], 0, 0);
      const y = 0.012;
      quad([X0, y, Z0], [X1, y, Z0], [X1, y, Z0 - fo], [X0, y, Z0 - fo], 0, 0); quad([X1, y, Z1], [X0, y, Z1], [X0, y, Z1 + fo], [X1, y, Z1 + fo], 0, 0);
      quad([X0, y, Z1], [X0, y, Z0], [X0 - fo, y, Z0], [X0 - fo, y, Z1], 0, 0); quad([X1, y, Z0], [X1, y, Z1], [X1 + fo, y, Z1], [X1 + fo, y, Z0], 0, 0);
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    const cv = document.createElement('canvas'); cv.width = 4; cv.height = 64; const cx = cv.getContext('2d'), gr = cx.createLinearGradient(0, 64, 0, 0);
    gr.addColorStop(0, 'rgba(0,0,0,0.55)'); gr.addColorStop(0.35, 'rgba(0,0,0,0.22)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); cx.fillStyle = gr; cx.fillRect(0, 0, 4, 64);
    const tx = new THREE.CanvasTexture(cv);
    const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ map: tx, transparent: true, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2 }));
    m.renderOrder = 1; L.add(m);
  }
  // jump pads, health packs, the zone
  for (const p of World.pads) buildPad(p, L);
  Pickups.build(L);
  Zone.build(L);
  // lights and set dressing
  for (const l of World.lights) addLightSource(l.x, l.y, l.z, l.color, l.intensity, l.dist, L);
  for (const p of World.props) { try { Props[p.type] && Props[p.type](p, L, def); } catch (e) { console.warn('prop', p.type, e); } }
  mergeStatic(L);
  G.renderer.shadowMap.needsUpdate = true;
  Sfx.ambience(th.amb);
}
function dyn(o) { o.userData.dyn = true; return o; }
// Bake every mesh that never moves into one mesh per material (and shadow setting): hundreds of draws become a few dozen.
function mergeStatic(root) {
  root.updateMatrixWorld(true);
  const buckets = new Map(), victims = [];
  const visit = o => {
    if (o.userData.dyn) return;
    if (o.isMesh && !o.isSkinnedMesh && o.material && !Array.isArray(o.material) && o.frustumCulled !== false && o.geometry.attributes.uv) {
      const key = o.material.uuid + (o.castShadow ? 's' : '') + (o.receiveShadow ? 'r' : '') + (o.renderOrder || 0);
      let b = buckets.get(key); if (!b) { b = { m: o.material, cast: o.castShadow, recv: o.receiveShadow, ro: o.renderOrder, list: [] }; buckets.set(key, b); }
      let g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
      for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') g.deleteAttribute(k);
      if (!g.attributes.normal) g.computeVertexNormals();
      g.applyMatrix4(o.matrixWorld); b.list.push(g); victims.push(o);
    }
    for (const c of o.children) visit(c);
  };
  for (const c of root.children) visit(c);
  for (const o of victims) { o.parent && o.parent.remove(o); }
  for (const b of buckets.values()) {
    if (b.list.length < 2) { const m = new THREE.Mesh(b.list[0], b.m); m.castShadow = b.cast; m.receiveShadow = b.recv; m.renderOrder = b.ro; root.add(m); continue; }
    const m = new THREE.Mesh(mergeGeos(b.list), b.m); m.castShadow = b.cast; m.receiveShadow = b.recv; m.renderOrder = b.ro; root.add(m);
  }
}
function addLightSource(x, y, z, color, intensity, dist, L, sprite = true) {
  G.lightSrc.push({ pos: new V3(x, y, z), color: new THREE.Color(color), intensity, dist });
  if (sprite && L) { const s = new THREE.Sprite(Fx.glowMat(color)); s.position.set(x, y, z); s.scale.setScalar(1.6 + intensity * 0.4); L.add(s); }
}
function buildStairs(R, groups) {
  const lenAx = R.axis === 0 ? R.x1 - R.x0 : R.z1 - R.z0, lo = Math.min(R.h0, R.h1), hi = Math.max(R.h0, R.h1), up = R.h1 > R.h0;
  const n = Math.max(2, Math.round((hi - lo) / 0.24)), grate = R.mat === 'grate', mk = grate ? 'stairs' : R.mat, m = SURF[mk] || SURF.stairs;
  const list = (groups[mk] = groups[mk] || { m, list: [] }).list;
  for (let k = 0; k < n; k++) {
    const u0 = k / n * lenAx, u1 = (k + 1) / n * lenAx, frac = up ? (k + 0.5) / n : (n - k - 0.5) / n, top = lo + frac * (hi - lo);
    const y0 = grate ? top - 0.07 : R.base, hgt = top - y0;
    let g;
    if (R.axis === 0) { g = toNI(new THREE.BoxGeometry(u1 - u0, hgt, R.z1 - R.z0)); g.translate(R.x0 + (u0 + u1) / 2, y0 + hgt / 2, (R.z0 + R.z1) / 2); }
    else { g = toNI(new THREE.BoxGeometry(R.x1 - R.x0, hgt, u1 - u0)); g.translate((R.x0 + R.x1) / 2, y0 + hgt / 2, R.z0 + (u0 + u1) / 2); }
    list.push(worldUV(g, m.userData.scale));
  }
  if (grate) {
    // stringers and rails on both sides
    const il = (groups.iron = groups.iron || { m: SURF.iron, list: [] }).list, rl = (groups.rail = groups.rail || { m: SURF.rail, list: [] }).list;
    for (const side of [0, 1]) {
      const g = toNI(new THREE.BoxGeometry(R.axis === 0 ? lenAx * Math.hypot(1, (hi - lo) / lenAx) : 0.08, R.axis === 0 ? 0.25 : 0.25, R.axis === 0 ? 0.08 : lenAx * Math.hypot(1, (hi - lo) / lenAx)));
      const ang = Math.atan2(hi - lo, lenAx) * (up ? 1 : -1);
      if (R.axis === 0) g.rotateZ(ang); else g.rotateX(-ang);
      const cx = (R.x0 + R.x1) / 2, cz = (R.z0 + R.z1) / 2, off = side ? 1 : -1;
      const gx = g.clone(); g.translate(R.axis === 0 ? cx : (side ? R.x1 : R.x0), (lo + hi) / 2 - 0.1, R.axis === 0 ? (side ? R.z1 : R.z0) : cz); il.push(worldUV(g, 1));
      if (R.rails) { gx.scale(1, 0.3, 1); gx.translate(R.axis === 0 ? cx : (side ? R.x1 : R.x0), (lo + hi) / 2 + 0.95, R.axis === 0 ? (side ? R.z1 : R.z0) : cz); rl.push(worldUV(gx, 1)); } else gx.dispose();
      void off;
    }
  }
}
function buildPad(p, L) {
  const g = new THREE.Group(); g.position.set(p.x, p.y, p.z); L.add(g);
  const disc0 = null; void disc0;
  const base = new THREE.Mesh(new THREE.CylinderGeometry(1.15, 1.3, 0.22, 24), SURF.iron); base.position.y = 0.11; base.receiveShadow = true; base.castShadow = true; g.add(base);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.95, 0.06, 8, 32), glowMat(0x7af0ff, 5)); ring.rotation.x = Math.PI / 2; ring.position.y = 0.23; g.add(ring);
  const disc = new THREE.Mesh(new THREE.CircleGeometry(0.85, 24), new THREE.MeshBasicMaterial({ color: hdrCol(0x3acfff, 1.2), transparent: true, opacity: 0.7, depthWrite: false })); disc.rotation.x = -Math.PI / 2; disc.position.y = 0.235; g.add(disc);
  const arrows = [];
  for (let i = 0; i < 3; i++) { const a = dyn(new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.35, 4), new THREE.MeshBasicMaterial({ color: hdrCol(0x9af4ff, 3), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }))); a.position.y = 0.5 + i * 0.5; g.add(a); arrows.push(a); }
  dyn(disc);
  G.anim.push(t => { for (let i = 0; i < 3; i++) { const f = (t * 0.9 + i / 3) % 1; arrows[i].position.y = 0.3 + f * 1.8; arrows[i].material.opacity = Math.sin(f * Math.PI) * 0.8; arrows[i].rotation.y = t; } disc.material.opacity = 0.5 + Math.sin(t * 4) * 0.2; });
  addLightSource(p.x, p.y + 0.8, p.z, 0x3acfff, 1.4, 6, null);
}

// ---------------------------------------------------------------- set dressing
function canvasText(text, color, w, h) {
  const cv = document.createElement('canvas'); cv.width = 512; cv.height = Math.round(512 * h / w); const c = cv.getContext('2d');
  c.fillStyle = '#05060a'; c.fillRect(0, 0, cv.width, cv.height);
  c.font = `800 ${Math.round(cv.height * 0.62)}px "Chakra Petch", "Arial Narrow", sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle';
  const col = '#' + new THREE.Color(color).getHexString();
  c.shadowColor = col; c.shadowBlur = 18; c.fillStyle = col; c.fillText(text, cv.width / 2, cv.height / 2 + 2);
  c.shadowBlur = 0; c.fillStyle = '#ffffff'; c.globalAlpha = 0.6; c.fillText(text, cv.width / 2, cv.height / 2 + 2);
  c.globalAlpha = 1; c.strokeStyle = col; c.lineWidth = 6; c.strokeRect(6, 6, cv.width - 12, cv.height - 12);
  const t = new THREE.CanvasTexture(cv); t.encoding = THREE.sRGBEncoding; return t;
}
const LEAF = {};
function leafMat() { if (!LEAF.pal) LEAF.pal = [0.25, 0.28, 0.31].map((h, i) => new THREE.MeshStandardMaterial({ color: new THREE.Color().setHSL(h, 0.5, 0.2 + i * 0.03), roughness: 0.9, flatShading: true })); return pick(LEAF.pal); }
const Props = {
  lamp(p, L) {
    const g = new THREE.Group(); g.position.set(p.x, p.y, p.z); g.rotation.y = p.yaw || 0; L.add(g);
    if (p.pole) { const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, p.y, 8), SURF.iron); pole.position.y = -p.y / 2; pole.castShadow = true; g.add(pole); const arm = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 1.2), SURF.iron); arm.position.set(0, 0, 0.55); g.add(arm); }
    const hood = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.45, 0.3, 12, 1, true), SURF.iron); hood.position.set(0, 0, p.pole ? 1.1 : 0.35); g.add(hood);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), glowMat(p.color, 8)); bulb.position.set(0, -0.12, p.pole ? 1.1 : 0.35); g.add(bulb);
    if (p.hang) { const c = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 1.2, 4), SURF.iron); c.position.set(0, 0.6, 0.35); g.add(c); }
  },
  sign(p, L) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(p.w, p.h), new THREE.MeshBasicMaterial({ map: canvasText(p.text, p.color, p.w, p.h), color: new THREE.Color(1.8, 1.8, 1.8), toneMapped: false }));
    m.position.set(p.x, p.y, p.z); m.rotation.y = p.yaw || 0; L.add(m);
    const back = new THREE.Mesh(new THREE.BoxGeometry(p.w + 0.12, p.h + 0.12, 0.08), SURF.iron); back.position.copy(m.position); back.rotation.y = m.rotation.y; back.translateZ(-0.05); L.add(back);
    const flick = Math.random() < 0.35;
    if (flick) G.anim.push(t => { m.material.color.setScalar((Math.sin(t * 23) > 0.92 || Math.sin(t * 3.1) > 0.97) ? 0.5 : 1.8); });
    G.lightSrc.push({ pos: new V3(p.x, p.y, p.z).add(new V3(Math.sin(m.rotation.y), 0, Math.cos(m.rotation.y)).multiplyScalar(0.8)), color: new THREE.Color(p.color), intensity: 1.2, dist: 7 });
  },
  molten(p, L) {
    const cv = document.createElement('canvas'); cv.width = 64; cv.height = 256; const c = cv.getContext('2d');
    for (let i = 0; i < 400; i++) { c.fillStyle = `hsl(${rand(10, 38)},100%,${rand(40, 65)}%)`; c.fillRect(rand(0, 64), rand(0, 256), rand(4, 22), rand(4, 30)); }
    const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.encoding = THREE.sRGBEncoding;
    const long = Math.max(p.w, p.d), m = new THREE.Mesh(new THREE.PlaneGeometry(Math.min(p.w, p.d), long), new THREE.MeshBasicMaterial({ map: t, color: new THREE.Color(3.2, 1.6, 0.6), toneMapped: false }));
    m.rotation.x = -Math.PI / 2; if (p.w > p.d) m.rotation.z = Math.PI / 2; m.position.set(p.x, 0.015, p.z); L.add(m);
    t.repeat.set(1, long / 3);
    G.anim.push((tm) => { t.offset.y = tm * 0.05; });
    // grates over the channel
    const gr = new THREE.Mesh(new THREE.BoxGeometry(p.w + 0.2, 0.04, p.d + 0.2), SURF.grate); gr.position.set(p.x, 0.04, p.z); L.add(gr);
    const n = Math.round(long / 2); for (let i = 0; i < n; i++) { const u = (i + 0.5) / n - 0.5; G.lightSrc.push({ pos: new V3(p.x + (p.w > p.d ? u * p.w : 0), 0.6, p.z + (p.w > p.d ? 0 : u * p.d)), color: new THREE.Color(0xff5a10), intensity: 1.2, dist: 6 }); }
    Fx.emitters.push({ x: p.x, y: 0.1, z: p.z, w: p.w, d: p.d, kind: 'ember', rate: long * 0.8, acc: 0 });
  },
  pipe(p, L) {
    for (let i = 0; i < p.pts.length - 1; i++) {
      const a = new V3(...p.pts[i]), b = new V3(...p.pts[i + 1]), len = a.distanceTo(b);
      const m = new THREE.Mesh(new THREE.CylinderGeometry(p.r, p.r, len, 14), SURF.steel); m.position.copy(a).add(b).multiplyScalar(0.5);
      m.quaternion.setFromUnitVectors(new V3(0, 1, 0), b.clone().sub(a).normalize()); m.castShadow = true; L.add(m);
      const j = new THREE.Mesh(new THREE.SphereGeometry(p.r * 1.15, 12, 8), SURF.iron); j.position.copy(b); L.add(j);
      for (let k = 1; k < len / 3; k++) { const f = new THREE.Mesh(new THREE.CylinderGeometry(p.r * 1.2, p.r * 1.2, 0.1, 14), SURF.iron); f.position.copy(a).lerp(b, k * 3 / len); f.quaternion.copy(m.quaternion); L.add(f); }
    }
  },
  smoke(p) { Fx.emitters.push({ x: p.x, y: p.y, z: p.z, w: 1, d: 1, kind: 'smoke', rate: 6 * (p.s || 1), acc: 0, s: p.s || 1 }); },
  chain(p, L) { for (let i = 0; i < p.len * 4; i++) { const l = new THREE.Mesh(new THREE.TorusGeometry(0.08, 0.02, 4, 8), SURF.iron); l.position.set(p.x, p.y - i * 0.24, p.z); l.rotation.y = i % 2 ? Math.PI / 2 : 0; L.add(l); } const hk = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.04, 6, 12, Math.PI * 1.4), SURF.steel); hk.position.set(p.x, p.y - p.len - 0.2, p.z); L.add(hk); },
  barrel(p, L) { const m = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 1.0, 14), SURF.container); m.position.set(p.x, 0.5, p.z); m.castShadow = true; m.receiveShadow = true; L.add(m); for (const y of [0.2, 0.8]) { const r = new THREE.Mesh(new THREE.TorusGeometry(0.405, 0.025, 4, 18), SURF.iron); r.rotation.x = Math.PI / 2; r.position.set(p.x, y, p.z); L.add(r); } },
  hazard(p, L) {
    const cv = document.createElement('canvas'); cv.width = 128; cv.height = 128; const c = cv.getContext('2d'); c.fillStyle = '#111'; c.fillRect(0, 0, 128, 128); c.fillStyle = '#e8b21a';
    for (let i = -4; i < 8; i++) { c.beginPath(); c.moveTo(i * 32, 0); c.lineTo(i * 32 + 16, 0); c.lineTo(i * 32 + 16 + 128, 128); c.lineTo(i * 32 + 128, 128); c.fill(); }
    const t = new THREE.CanvasTexture(cv); t.encoding = THREE.sRGBEncoding; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(p.w, p.d);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(p.w, p.d), new THREE.MeshStandardMaterial({ map: t, roughness: 0.8, transparent: true, opacity: 0.85, depthWrite: false })); m.rotation.x = -Math.PI / 2; m.position.set(p.x, 0.012, p.z); m.receiveShadow = true; L.add(m);
  },
  cauldron(p, L) {
    const g = new THREE.Group(); g.position.set(p.x, p.y, p.z); L.add(g);
    const bowl = new THREE.Mesh(new THREE.CylinderGeometry(1.05, 0.8, 1.25, 20, 1, true), SURF.iron); bowl.position.y = 0.62; bowl.castShadow = true; g.add(bowl);
    const lip = new THREE.Mesh(new THREE.TorusGeometry(1.05, 0.09, 8, 24), SURF.steel); lip.rotation.x = Math.PI / 2; lip.position.y = 1.25; g.add(lip);
    const melt = new THREE.Mesh(new THREE.CircleGeometry(1.0, 24), glowMat(0xff7a1a, 4)); melt.rotation.x = -Math.PI / 2; melt.position.y = 1.1; g.add(melt);
    G.anim.push(t => { melt.material.color.setRGB(3.6 + Math.sin(t * 2) * 0.5, 1.4 + Math.sin(t * 3.1) * 0.2, 0.3); });
    Fx.emitters.push({ x: p.x, y: p.y + 1.3, z: p.z, w: 1.4, d: 1.4, kind: 'ember', rate: 10, acc: 0 }); Fx.emitters.push({ x: p.x, y: p.y + 1.6, z: p.z, w: 1, d: 1, kind: 'smoke', rate: 3, acc: 0, s: 0.6 });
    // the crane arm above it, carrying a ladle
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 26), SURF.crane); arm.position.set(0, 9.5, 0); arm.castShadow = true; g.add(arm);
    const lad = dyn(new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.6, 1.0, 14), SURF.iron)); lad.position.set(0, 5.6, 2.5); g.add(lad);
    const cab = dyn(new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 3.5, 4), SURF.iron)); cab.position.set(0, 7.6, 2.5); g.add(cab);
    G.anim.push(t => { const z = Math.sin(t * 0.15) * 8; lad.position.z = z; cab.position.z = z; });
  },
  skyline(p, L, def) {
    // a ring of far silhouettes: chimneys and cranes for the foundry, mountains and canopy for the temple, towers for the port
    const rng = mulberry(def.key.length * 977), key = def.key;
    const mat = new THREE.MeshStandardMaterial({ color: key === 'quay' ? 0x0b1020 : 0x2a2030, roughness: 1, metalness: 0, fog: true });
    const win = new THREE.MeshBasicMaterial({ color: hdrCol(key === 'quay' ? 0xffd08a : 0xff9a50, 2.5), toneMapped: false });
    const B = def.bounds;
    for (let i = 0; i < 70; i++) {
      const a = rng() * TAU, r = 95 + rng() * 120, x = Math.cos(a) * r * 1.2, z = Math.sin(a) * r;
      if (Math.abs(x) < B.x1 + 12 && Math.abs(z) < B.z1 + 12) continue;
      const h = key === 'quay' ? 14 + rng() * 60 : 8 + rng() * 26, w = 6 + rng() * 14;
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, w * (0.6 + rng())), mat); m.position.set(x, h / 2 - 1, z); m.rotation.y = rng() * 3; L.add(m);
      if (key === 'kiln' && rng() < 0.4) { const c = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.8, h + 18, 10), mat); c.position.set(x + 3, (h + 18) / 2, z); L.add(c); Fx.emitters.push({ x: x + 3, y: h + 18, z, w: 1, d: 1, kind: 'smoke', rate: 2, acc: 0, s: 3, far: true }); }
      if (key !== 'verdance') for (let k = 0; k < 6; k++) if (rng() < 0.6) { const wv = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.5), win); wv.position.set(x + (rng() - 0.5) * w * 0.8, rng() * h, z); wv.lookAt(0, wv.position.y, 0); wv.translateZ(w * 0.55); L.add(wv); }
    }
    if (key === 'kiln') for (let i = 0; i < 3; i++) { const c = new THREE.Mesh(new THREE.BoxGeometry(1.2, 40, 1.2), mat); c.position.set(-80 + i * 70, 20, 90 - i * 30); L.add(c); const j = new THREE.Mesh(new THREE.BoxGeometry(40, 1.4, 1.4), mat); j.position.set(c.position.x + 12, 38, c.position.z); L.add(j); }
  },
  idol(p, L) {
    const g = new THREE.Group(); g.position.set(p.x, p.y, p.z); L.add(g);
    const ring = dyn(new THREE.Mesh(new THREE.TorusGeometry(1.3, 0.14, 10, 40), new THREE.MeshStandardMaterial({ color: 0xc9a24a, metalness: 1, roughness: 0.3 }))); ring.position.y = 3.4; g.add(ring);
    const gem = dyn(new THREE.Mesh(new THREE.OctahedronGeometry(0.45, 0), glowMat(0x7affc8, 4))); gem.position.y = 3.4; g.add(gem);
    const inner = dyn(new THREE.Mesh(new THREE.TorusGeometry(0.85, 0.06, 8, 32), glowMat(0x7affc8, 2.5))); inner.position.y = 3.4; g.add(inner);
    G.anim.push(t => { ring.rotation.y = t * 0.3; inner.rotation.x = t * 0.7; inner.rotation.y = t * 0.4; gem.rotation.y = t * 1.2; gem.position.y = 3.4 + Math.sin(t * 1.5) * 0.12; });
    addLightSource(p.x, p.y + 3.4, p.z, 0x7affc8, 1.6, 10, null);
    Fx.emitters.push({ x: p.x, y: p.y + 3.4, z: p.z, w: 0.5, d: 0.5, kind: 'mote', rate: 6, acc: 0 });
  },
  statue(p, L) {
    const g = new THREE.Group(); g.position.set(p.x, p.y, p.z); g.rotation.y = p.yaw || 0; L.add(g);
    const st = SURF.ruin;
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.65, 2.0, 8), st); body.position.y = 1.0; g.add(body);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.8, 0.7), st); head.position.y = 2.4; g.add(head);
    const crest = new THREE.Mesh(new THREE.ConeGeometry(0.5, 0.8, 4), st); crest.position.y = 3.1; crest.rotation.y = Math.PI / 4; g.add(crest);
    for (const s of [-1, 1]) { const arm = new THREE.Mesh(new THREE.BoxGeometry(0.25, 1.3, 0.3), st); arm.position.set(s * 0.6, 1.2, 0.15); arm.rotation.z = s * 0.25; g.add(arm); }
    const eyes = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.08, 0.05), glowMat(0x7affc8, 5)); eyes.position.set(0, 2.5, -0.37); g.add(eyes);
    g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  },
  pool(p, L) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(p.w, p.d), new THREE.MeshStandardMaterial({ color: 0x1d4a44, roughness: 0.05, metalness: 0.2, transparent: true, opacity: 0.9 })); m.rotation.x = -Math.PI / 2; m.position.set(p.x, 0.03, p.z); m.receiveShadow = true; L.add(m);
    const rim = SURF.temple; for (const [x, z, w, d] of [[0, p.d / 2, p.w + 0.6, 0.3], [0, -p.d / 2, p.w + 0.6, 0.3], [p.w / 2, 0, 0.3, p.d], [-p.w / 2, 0, 0.3, p.d]]) { const b = new THREE.Mesh(new THREE.BoxGeometry(w, 0.25, d), rim); b.position.set(p.x + x, 0.12, p.z + z); b.receiveShadow = true; L.add(b); }
    Fx.emitters.push({ x: p.x, y: 0.05, z: p.z, w: p.w * 0.8, d: p.d * 0.8, kind: 'mote', rate: 1.5, acc: 0 });
  },
  waterfall(p, L) {
    const cv = document.createElement('canvas'); cv.width = 64; cv.height = 256; const c = cv.getContext('2d'); c.fillStyle = 'rgba(160,220,230,0.35)'; c.fillRect(0, 0, 64, 256);
    for (let i = 0; i < 160; i++) { c.fillStyle = `rgba(230,250,255,${rand(0.2, 0.7)})`; c.fillRect(rand(0, 64), rand(0, 256), rand(1, 3), rand(20, 80)); }
    const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.encoding = THREE.sRGBEncoding;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(p.w, p.h), new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false, color: new THREE.Color(1.2, 1.3, 1.35) }));
    const zf = p.z > 0 ? -1 : 1; m.position.set(p.x, p.h / 2, p.z + zf * 0.05); if (zf < 0) m.rotation.y = Math.PI; L.add(m); t.repeat.set(1, 1.5);
    G.anim.push(tm => { t.offset.y = tm * 1.4; });
    Fx.emitters.push({ x: p.x, y: 0.2, z: p.z + zf * 0.8, w: p.w, d: 0.5, kind: 'mist', rate: 10, acc: 0 });
  },
  tree(p, L) {
    const g = new THREE.Group(); g.position.set(p.x, p.y || 0, p.z); g.scale.setScalar(p.s || 1); g.rotation.y = rand(0, TAU); L.add(g);
    const bark = LEAF.bark || (LEAF.bark = new THREE.MeshStandardMaterial({ color: 0x5a4632, roughness: 1 }));
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.4, 5.5, 8), bark); trunk.position.y = 2.75; trunk.rotation.z = rand(-0.08, 0.08); trunk.castShadow = true; g.add(trunk);
    const leaf = leafMat();
    for (let i = 0; i < 6; i++) { const b = new THREE.Mesh(new THREE.IcosahedronGeometry(rand(1.0, 1.7), 0), leaf); b.position.set(rand(-1.3, 1.3), rand(4.6, 6.4), rand(-1.3, 1.3)); b.rotation.set(rand(0, 3), rand(0, 3), 0); b.castShadow = true; g.add(b); }

  },
  bush(p, L) {
    const leaf = leafMat();
    for (let i = 0; i < 4; i++) { const b = new THREE.Mesh(new THREE.IcosahedronGeometry(rand(0.4, 0.7), 0), leaf); b.position.set(p.x + rand(-0.6, 0.6), (p.y || 0) + rand(0.3, 0.6), p.z + rand(-0.6, 0.6)); b.castShadow = true; L.add(b); }
  },
  vines(p, L) {
    const mat = LEAF.vine || (LEAF.vine = new THREE.MeshStandardMaterial({ color: 0x2f5a1c, roughness: 1, side: THREE.DoubleSide }));
    const g = new THREE.Group(); g.position.set(p.x, p.y, p.z); g.rotation.y = p.yaw || 0; L.add(g);
    for (let i = 0; i < p.w * 1.6; i++) { const len = rand(0.6, 2.6), v = new THREE.Mesh(new THREE.PlaneGeometry(rand(0.12, 0.3), len), mat); v.position.set(rand(-p.w / 2, p.w / 2), -len / 2, 0); g.add(v); }
  },
  brazier(p, L) {
    const g = new THREE.Group(); g.position.set(p.x, p.y, p.z); L.add(g);
    const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.2, 0.35, 10), SURF.iron); bowl.position.y = 0.95; g.add(bowl);
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.08, 0.8, 6), SURF.iron); leg.position.y = 0.4; g.add(leg);
    const fire = dyn(new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.6, 8), new THREE.MeshBasicMaterial({ color: hdrCol(0xff8a2a, 5), transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending }))); fire.position.y = 1.35; g.add(fire);
    G.anim.push(t => { fire.scale.set(1 + Math.sin(t * 13) * 0.1, 1 + Math.sin(t * 17) * 0.25, 1); });
    Fx.emitters.push({ x: p.x, y: p.y + 1.4, z: p.z, w: 0.3, d: 0.3, kind: 'ember', rate: 6, acc: 0 });
  },
  water(p, L, def) {
    const B = def.bounds, mat = new THREE.MeshStandardMaterial({ color: 0x0a1626, roughness: 0.08, metalness: 0.6, normalMap: SURF.corrNormal || null });
    for (const s of [1, -1]) { const m = new THREE.Mesh(new THREE.PlaneGeometry(400, 160), mat); m.rotation.x = -Math.PI / 2; m.position.set(0, -1.6, s * (B.z1 + 80.5)); L.add(m); const edge = new THREE.Mesh(new THREE.BoxGeometry(B.x1 - B.x0 + 4, 1.6, 1), SURF.concrete); edge.position.set(0, -0.8, s * (B.z1 + 0.5)); L.add(edge); }
  },
  rain() { Fx.rain = true; },
  stringLights(p, L) {
    const n = 16, cols = [0xff5ab4, 0x5af0ff, 0xffd24a, 0x7aff8a];
    for (let i = 0; i <= n; i++) { const f = i / n, x = lerp(p.x, p.x2, f), z = lerp(p.z, p.z2, f), y = p.y - Math.sin(f * Math.PI) * 0.6; const b = new THREE.Mesh(new THREE.SphereGeometry(0.07, 6, 4), glowMat(cols[i % 4], 7)); b.position.set(x, y, z); L.add(b); }
  },
  crane(p, L) {
    const g = dyn(new THREE.Group()); g.position.set(p.x, 0, p.z); L.add(g);
    const beam = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.4, 29), SURF.crane); beam.position.y = 14.5; beam.castShadow = true; g.add(beam);
    const trolley = new THREE.Mesh(new THREE.BoxGeometry(2, 1.2, 2.4), SURF.iron); trolley.position.y = 13.3; g.add(trolley);
    const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 6, 4), SURF.iron); cable.position.y = 10; g.add(cable);
    const box = new THREE.Mesh(new THREE.BoxGeometry(2.5, 2.6, 6), SURF.container3); box.position.y = 5.7; box.castShadow = true; g.add(box);
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 6), glowMat(0xff3a3a, 8)); lamp.position.set(0, 15.4, 0); g.add(lamp);
    G.anim.push(t => { const z = Math.sin(t * 0.12) * 9; trolley.position.z = z; cable.position.z = z; box.position.z = z; lamp.material.color.setScalar(Math.sin(t * 3) > 0 ? 8 : 0.5).multiply(new THREE.Color(1, 0.2, 0.2)); });
  },
  railing(p, L) {
    const a = new V3(p.x, p.y, p.z), b = new V3(p.x2, p.y, p.z2), len = a.distanceTo(b), dir = b.clone().sub(a).normalize(), ang = Math.atan2(dir.x, dir.z);
    for (const h of [0.5, 1.0]) { const r = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, len), SURF.rail); r.position.copy(a).lerp(b, 0.5); r.position.y += h; r.rotation.y = ang; r.castShadow = true; L.add(r); }
    for (let d = 0; d <= len; d += 1.6) { const q = new THREE.Mesh(new THREE.BoxGeometry(0.05, 1.0, 0.05), SURF.rail); q.position.copy(a).addScaledVector(dir, d); q.position.y += 0.5; L.add(q); }
  },
  bollards(p, L) { for (let x = p.x; x <= p.x2; x += 4) for (const s of [1, -1]) { const b = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.28, 0.7, 8), SURF.iron); b.position.set(x, 0.35, s * p.z); L.add(b); } },
  puddle(p, L) { const m = new THREE.Mesh(new THREE.CircleGeometry(p.s, 20), new THREE.MeshStandardMaterial({ color: 0x05070c, roughness: 0.02, metalness: 0.9, transparent: true, opacity: 0.85, depthWrite: false })); m.rotation.x = -Math.PI / 2; m.scale.y = 0.6; m.position.set(p.x, 0.01, p.z); L.add(m); },
};

// ---------------------------------------------------------------- the light pool: a few real lights follow the nearest bright things
function updateLights(dt) {
  const cam = G.camera.position, n = G.lightsOn;
  const srcs = G.lightSrc.map(s => ({ s, d: s.pos.distanceToSquared(cam) / (s.intensity * s.intensity) })).sort((a, b) => a.d - b.d);
  for (let i = 0; i < G.lightPool.length; i++) {
    const l = G.lightPool[i], e = i < n ? srcs[i] : null;
    if (!e) { l.visible = false; continue; }
    l.visible = true; l.position.copy(e.s.pos); l.color.copy(e.s.color); l.intensity = e.s.intensity * 1.5; l.distance = e.s.dist;
  }
  if (G.flashT > 0) { G.flashT -= dt; G.flashLight.intensity = Math.max(0, G.flashT / 0.06) * G.flashI; } else G.flashLight.intensity = 0;
}
function muzzleLight(pos, color, k = 6) { G.flashLight.position.copy(pos); G.flashLight.color.set(color); G.flashT = 0.06; G.flashI = k; }

// ============================================================================
// Effects: pooled particles, tracers, rings, flashes
// ============================================================================
const Fx = {
  emitters: [], rain: false, parts: null, smoke: null, tracers: [], rings: [], meshes: [], glowCache: {},
  init() {
    this.parts = this.makePoints(4000, THREE.AdditiveBlending);
    this.smoke = this.makePoints(900, THREE.NormalBlending);
    G.scene.add(this.parts.obj); G.scene.add(this.smoke.obj);
    const tg = new THREE.CylinderGeometry(1, 1, 1, 5, 1, true); tg.rotateX(Math.PI / 2); tg.translate(0, 0, 0.5);
    for (let i = 0; i < 48; i++) { const m = new THREE.Mesh(tg, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false })); m.visible = false; m.frustumCulled = false; G.scene.add(m); this.tracers.push({ m, t: 0, life: 0 }); }
    const rg = new THREE.RingGeometry(0.85, 1, 48); rg.rotateX(-Math.PI / 2);
    for (let i = 0; i < 16; i++) { const m = new THREE.Mesh(rg, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })); m.visible = false; G.scene.add(m); this.rings.push({ m, t: 0, life: 0 }); }
    const sg = new THREE.SphereGeometry(1, 20, 14);
    for (let i = 0; i < 10; i++) { const m = new THREE.Mesh(sg, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })); m.visible = false; G.scene.add(m); this.meshes.push({ m, t: 0, life: 0 }); }
  },
  glowTex: null,
  glowMat(color) {
    if (!this.glowTex) {
      const cv = document.createElement('canvas'); cv.width = cv.height = 64; const c = cv.getContext('2d'), g = c.createRadialGradient(32, 32, 0, 32, 32, 32);
      g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.2, 'rgba(255,255,255,0.45)'); g.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = g; c.fillRect(0, 0, 64, 64);
      this.glowTex = new THREE.CanvasTexture(cv);
    }
    if (!this.glowCache[color]) this.glowCache[color] = new THREE.SpriteMaterial({ map: this.glowTex, color: hdrCol(color, 1.4), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.55 });
    return this.glowCache[color];
  },
  makePoints(N, blending) {
    const g = new THREE.BufferGeometry(), pos = new Float32Array(N * 3), col = new Float32Array(N * 4), size = new Float32Array(N);
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage)); g.setAttribute('color', new THREE.BufferAttribute(col, 4).setUsage(THREE.DynamicDrawUsage)); g.setAttribute('size', new THREE.BufferAttribute(size, 1).setUsage(THREE.DynamicDrawUsage));
    const add = blending === THREE.AdditiveBlending;
    const mat = new THREE.ShaderMaterial({
      uniforms: { uScale: { value: 600 } }, transparent: true, depthWrite: false, blending,
      vertexShader: 'attribute vec4 color; attribute float size; varying vec4 vC; uniform float uScale; void main(){ vC = color; vec4 mv = modelViewMatrix * vec4(position,1.0); gl_PointSize = size * uScale / max(0.1, -mv.z); gl_Position = projectionMatrix * mv; }',
      fragmentShader: add ? 'varying vec4 vC; void main(){ vec2 d = gl_PointCoord - 0.5; float r = dot(d,d)*4.0; float a = exp(-r*3.2) * vC.a; gl_FragColor = vec4(vC.rgb * a, a); }'
        : 'varying vec4 vC; void main(){ vec2 d = gl_PointCoord - 0.5; float r = dot(d,d)*4.0; if (r > 1.0) discard; float a = (1.0 - r) * (1.0 - r) * vC.a; gl_FragColor = vec4(vC.rgb, a); }',
    });
    const obj = new THREE.Points(g, mat); obj.frustumCulled = false; obj.renderOrder = add ? 5 : 4;
    return { obj, N, pos, col, size, g, n: 0, p: [] };
  },
  clear() { this.emitters = []; this.rain = false; this.roofs = null; if (this.parts) { this.parts.p = []; this.smoke.p = []; } },
  rainTick(dt, cam) {
    const N = 1600;
    if (!this.rainObj) {
      const g = new THREE.BufferGeometry(); this.rainPos = new Float32Array(N * 6); this.rainD = [];
      for (let i = 0; i < N; i++) this.rainD.push({ x: rand(-24, 24), y: rand(-4, 18), z: rand(-24, 24), s: rand(22, 30) });
      g.setAttribute('position', new THREE.BufferAttribute(this.rainPos, 3).setUsage(THREE.DynamicDrawUsage));
      this.rainObj = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: new THREE.Color(0.55, 0.65, 0.85), transparent: true, opacity: 0.35, depthWrite: false }));
      this.rainObj.frustumCulled = false; G.scene.add(this.rainObj);
    }
    this.rainObj.visible = true;
    const P = this.rainPos;
    if (!this.roofs) this.roofs = World.solids.filter(s => s.y0 > 2.5 && (s.x1 - s.x0) * (s.z1 - s.z0) > 30);
    const R = this.roofs;
    for (let i = 0; i < N; i++) {
      const d = this.rainD[i]; d.y -= d.s * dt; if (d.y < -4) { d.y += 22; d.x = rand(-24, 24); d.z = rand(-24, 24); }
      const x = cam.x + d.x, y = cam.y + d.y, z = cam.z + d.z, o = i * 6;
      P[o] = x; P[o + 1] = y; P[o + 2] = z; P[o + 3] = x - 0.05; P[o + 4] = y + 0.55; P[o + 5] = z - 0.02;
      let under = false; for (const r of R) if (x > r.x0 && x < r.x1 && z > r.z0 && z < r.z1 && y < r.y0) { under = true; break; }
      if (under) { P[o + 1] = P[o + 4] = -50; continue; }
      if (y < 0.05) { P[o + 1] = P[o + 4] = -50; if (Math.random() < 0.02) this.spawn('add', x, 0.05, z, rand(-0.5, 0.5), rand(0.6, 1.2), rand(-0.5, 0.5), 0.3, 0.35, 0.45, 0.03, 0.18, 0, 6); }
    }
    this.rainObj.geometry.attributes.position.needsUpdate = true;
  },
  // one particle: position, velocity, colour (HDR), size, life, drag, gravity
  spawn(sys, x, y, z, vx, vy, vz, r, g, b, size, life, drag = 0, grav = 0, grow = 0) {
    const S = sys === 'smoke' ? this.smoke : this.parts; if (S.p.length >= S.N) S.p.shift();
    S.p.push({ x, y, z, vx, vy, vz, r, g, b, size, life, t: 0, drag, grav, grow, a: 1 });
  },
  burst(pos, hex, n, speed, life, size, opts = {}) {
    const c = new THREE.Color(hex), k = opts.k || 3;
    for (let i = 0; i < n; i++) {
      const v = new V3(rand(-1, 1), rand(-1, 1), rand(-1, 1)).normalize().multiplyScalar(speed * rand(0.3, 1));
      if (opts.dir) v.add(opts.dir.clone().multiplyScalar(speed * 0.8));
      if (opts.up) v.y = Math.abs(v.y) + opts.up;
      this.spawn('add', pos.x, pos.y, pos.z, v.x, v.y, v.z, c.r * k, c.g * k, c.b * k, size * rand(0.6, 1.2), life * rand(0.6, 1.2), opts.drag || 2, opts.grav || 0);
    }
  },
  sparks(pos, nrm, hex = 0xffc070, n = 8) { const d = new V3(nrm.x, nrm.y, nrm.z); this.burst(pos, hex, n, 7, 0.35, 0.05, { dir: d, grav: 14, drag: 1.5, k: 5 }); this.spawn('smoke', pos.x, pos.y, pos.z, nrm.x * 0.6, nrm.y * 0.6 + 0.3, nrm.z * 0.6, 0.5, 0.48, 0.45, 0.4, 0.7, 1, -0.2, 1.2); },
  puff(pos, hex = 0x8a8680, n = 6, s = 0.6, life = 1.2) { const c = new THREE.Color(hex); for (let i = 0; i < n; i++) this.spawn('smoke', pos.x + rand(-0.3, 0.3), pos.y + rand(-0.2, 0.3), pos.z + rand(-0.3, 0.3), rand(-0.8, 0.8), rand(0.2, 1.2), rand(-0.8, 0.8), c.r, c.g, c.b, s * rand(0.7, 1.3), life * rand(0.7, 1.3), 1.5, -0.3, 1.0); },
  tracer(a, b, hex, w = 0.02, life = 0.09, k = 6) {
    const T = this.tracers.find(t => t.t >= t.life) || this.tracers[0];
    const d = b.clone().sub(a), len = d.length(); if (len < 0.01) return;
    T.m.position.copy(a); T.m.scale.set(w, w, len); T.m.lookAt(b); T.m.visible = true; T.m.material.color.copy(hdrCol(hex, k)); T.m.material.opacity = 1; T.t = 0; T.life = life; T.w = w;
  },
  ring(pos, radius, hex, life = 0.5, k = 4, y = 0.05) {
    const R = this.rings.find(t => t.t >= t.life) || this.rings[0];
    R.m.position.set(pos.x, pos.y + y, pos.z); R.m.scale.setScalar(0.1); R.m.visible = true; R.m.material.color.copy(hdrCol(hex, k)); R.t = 0; R.life = life; R.r = radius;
  },
  sphere(pos, radius, hex, life = 0.35, k = 3) {
    const S = this.meshes.find(t => t.t >= t.life) || this.meshes[0];
    S.m.position.copy(pos); S.m.scale.setScalar(radius * 0.2); S.m.visible = true; S.m.material.color.copy(hdrCol(hex, k)); S.t = 0; S.life = life; S.r = radius;
  },
  explosion(pos, radius, hex) {
    this.sphere(pos, radius, hex, 0.3, 4); this.ring(pos, radius * 1.3, hex, 0.45, 4, 0.1 - pos.y + World.groundAt(pos.x, pos.z, pos.y + 0.3));
    this.burst(pos, hex, 40, radius * 5, 0.6, 0.12, { drag: 3, k: 5 }); this.burst(pos, 0xffd28a, 20, radius * 7, 0.4, 0.05, { grav: 10, k: 6 });
    this.puff(pos, 0x55504a, 10, radius * 0.6, 1.6); muzzleLight(pos, hex, 14);
  },
  update(dt) {
    G.time += dt;
    for (const T of this.tracers) if (T.t < T.life) { T.t += dt; const f = 1 - T.t / T.life; T.m.material.opacity = f; T.m.scale.x = T.m.scale.y = T.w * (0.5 + f * 0.5); if (T.t >= T.life) T.m.visible = false; }
    for (const R of this.rings) if (R.t < R.life) { R.t += dt; const f = R.t / R.life; R.m.scale.setScalar(0.2 + R.r * (1 - Math.pow(1 - f, 3))); R.m.material.opacity = 1 - f; if (R.t >= R.life) R.m.visible = false; }
    for (const S of this.meshes) if (S.t < S.life) { S.t += dt; const f = S.t / S.life; S.m.scale.setScalar(S.r * (0.3 + f * 0.9)); S.m.material.opacity = (1 - f) * (1 - f); if (S.t >= S.life) S.m.visible = false; }
    // emitters
    const cam = G.camera.position;
    for (const e of this.emitters) {
      if (!e.far && (e.x - cam.x) ** 2 + (e.z - cam.z) ** 2 > 70 * 70) continue;
      e.acc += e.rate * dt;
      while (e.acc >= 1) {
        e.acc--;
        const x = e.x + rand(-e.w / 2, e.w / 2), z = e.z + rand(-e.d / 2, e.d / 2);
        if (e.kind === 'ember') this.spawn('add', x, e.y, z, rand(-0.3, 0.3), rand(0.8, 2.6), rand(-0.3, 0.3), 4, 1.6, 0.4, rand(0.03, 0.06), rand(0.8, 2.0), 0.5, -0.2);
        else if (e.kind === 'smoke') { const s = e.s || 1; this.spawn('smoke', x, e.y, z, rand(-0.3, 0.3) + 0.4 * s, rand(0.8, 1.6) * s, rand(-0.3, 0.3), 0.22, 0.2, 0.22, 0.8 * s, rand(3, 5), 0.2, -0.05, 1.2 * s); }
        else if (e.kind === 'mote') this.spawn('add', x, e.y + rand(0, 1), z, rand(-0.2, 0.2), rand(0.1, 0.4), rand(-0.2, 0.2), 0.6, 1.6, 1.0, rand(0.03, 0.05), rand(2, 4), 0.2, -0.02);
        else if (e.kind === 'mist') this.spawn('smoke', x, e.y, z, rand(-0.4, 0.4), rand(0.3, 0.9), rand(0, 0.6) * Math.sign(e.z), 0.75, 0.85, 0.88, rand(0.5, 1.0), rand(1.2, 2.2), 0.5, -0.1, 0.8);
      }
    }
    if (this.rain) this.rainTick(dt, cam);
    else if (this.rainObj) this.rainObj.visible = false;
    for (const S of [this.parts, this.smoke]) {
      const P = S.p; let w = 0;
      for (let i = 0; i < P.length; i++) {
        const p = P[i]; p.t += dt; if (p.t >= p.life) continue;
        const dr = Math.exp(-p.drag * dt); p.vx *= dr; p.vy = p.vy * dr - p.grav * dt; p.vz *= dr;
        p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
        if (p.y < 0.02 && p.vy < 0) { if (S === this.parts && p.grav > 1) { p.y = 0.02; p.vy *= -0.3; p.vx *= 0.5; p.vz *= 0.5; } }
        P[w++] = p;
      }
      P.length = w;
      const n = Math.min(P.length, S.N);
      for (let i = 0; i < n; i++) {
        const p = P[i], f = p.t / p.life, a = S === this.smoke ? Math.sin(Math.min(1, f * 1.0) * Math.PI) * 0.55 : (1 - f);
        S.pos[i * 3] = p.x; S.pos[i * 3 + 1] = p.y; S.pos[i * 3 + 2] = p.z;
        S.col[i * 4] = p.r; S.col[i * 4 + 1] = p.g; S.col[i * 4 + 2] = p.b; S.col[i * 4 + 3] = a;
        S.size[i] = p.size * (1 + p.grow * f * 3);
      }
      S.g.setDrawRange(0, n);
      S.g.attributes.position.needsUpdate = true; S.g.attributes.color.needsUpdate = true; S.g.attributes.size.needsUpdate = true;
      S.obj.material.uniforms.uScale.value = G.h / (2 * Math.tan(G.camera.fov * Math.PI / 360));
    }
    for (const f of G.anim) f(G.time);
    if (G.sky) G.sky.material.uniforms.uTime.value = G.time;
  },
};
