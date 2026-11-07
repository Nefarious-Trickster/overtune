'use strict';
// ============================================================================
// Models. Heroes are skinned: every part is sculpted in the space of one bone of a 24-bone skeleton and baked
// into two meshes (lit and glowing), so a whole hero costs two draws. Each vertex carries its own colour,
// roughness and metalness. Arms are solved every frame so the hands really hold the weapon.
// A hero looks along -z. Weapons are built in their own space: grip at the origin, muzzle along -z.
// ============================================================================
const MCACHE = {};
function mStd(hex, rough = 0.6, metal = 0.1) { const k = hex + ':' + rough + ':' + metal; if (!MCACHE[k]) MCACHE[k] = new THREE.MeshStandardMaterial({ color: hex, roughness: rough, metalness: metal }); return MCACHE[k]; }
function mGlow(hex, k = 3) { return glowMat(hex, k); }
const sph = (r, ws = 14, hs = 10) => new THREE.SphereGeometry(r, ws, hs);
function roundBox(w, h, d, r = 0.04, seg = 3) {
  r = Math.min(r, w / 2, h / 2, d / 2);
  const g = new THREE.BoxGeometry(w, h, d, seg, seg, seg), p = g.attributes.position, v = new V3(), hw = w / 2 - r, hh = h / 2 - r, hd = d / 2 - r, c = new V3(), o = new V3();
  for (let i = 0; i < p.count; i++) {
    v.set(p.getX(i), p.getY(i), p.getZ(i)); c.set(clamp(v.x, -hw, hw), clamp(v.y, -hh, hh), clamp(v.z, -hd, hd)); o.copy(v).sub(c);
    if (o.lengthSq() > 1e-9) { o.normalize().multiplyScalar(r); v.copy(c).add(o); }
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals(); return g;
}
// a lofted solid: rings of superellipse cross-sections stacked along y. p = 2 is an ellipse, larger is squarer.
// `open` = [a0, a1] leaves it as an open sheet over that angle range (coats, hoods, cloaks).
function loft(rings, seg = 18, open = null) {
  const pos = [], idx = [], cols = open ? seg + 1 : seg, a0 = open ? open[0] : 0, a1 = open ? open[1] : TAU;
  for (const R of rings) for (let j = 0; j < cols; j++) {
    const t = a0 + (a1 - a0) * j / seg, c = Math.cos(t), s = Math.sin(t), pw = 2 / (R.p || 2);
    pos.push(Math.sign(c) * Math.pow(Math.abs(c), pw) * R.w / 2 + (R.x || 0), R.y, Math.sign(s) * Math.pow(Math.abs(s), pw) * R.d / 2 + (R.z || 0));
  }
  for (let i = 0; i < rings.length - 1; i++) for (let j = 0; j < seg; j++) {
    const a = i * cols + j, b = i * cols + (open ? j + 1 : (j + 1) % cols), c = a + cols, d = b + cols;
    idx.push(a, c, b, b, c, d);
  }
  if (!open) for (const [ri, up] of [[0, false], [rings.length - 1, true]]) {
    const R = rings[ri]; if (R.w < 0.002) continue;
    const base = pos.length / 3; pos.push(R.x || 0, R.y, R.z || 0);
    for (let j = 0; j < cols; j++) { const k = ri * cols + j; pos.push(pos[k * 3], pos[k * 3 + 1], pos[k * 3 + 2]); }
    for (let j = 0; j < seg; j++) { const a = base + 1 + j, b = base + 1 + (j + 1) % cols; if (up) idx.push(base, b, a); else idx.push(base, a, b); }
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals(); return g;
}
// shorthand ring: [y, w, d, p?, x?, z?]
const RG = a => a.map(r => ({ y: r[0], w: r[1], d: r[2], p: r[3] || 2, x: r[4] || 0, z: r[5] || 0 }));
function tubeG(pts, r, seg = 8, n = 16) { return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map(p => new V3(...p))), n, r, seg, false); }
function extG(pts, depth, bevel = 0.004) { const s = new THREE.Shape(); s.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) s.lineTo(pts[i][0], pts[i][1]); s.closePath(); const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 1, curveSegments: 4 }); g.translate(0, 0, -depth / 2); return g; }

// ---------------------------------------------------------------- paints and the part builder
const P_ = (hex, r = 0.6, m = 0.1) => ({ c: new THREE.Color(hex), r, m });
const GL_ = (hex, k = 3) => ({ glow: true, c: new THREE.Color(hex).multiplyScalar(k) });
const _m4 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new V3(1, 1, 1), _p = new V3(), _n3 = new THREE.Matrix3();
class PartBuilder {
  constructor() { this.lit = []; this.glow = []; }
  // geo in part space, placed by pos/rot/scale, then by `base` (a bone's bind matrix, or nothing); bone index for skinning
  add(geo, paint, pos, rot, scl = null, base = null, bone = 0) {
    pos = pos || [0, 0, 0]; rot = rot || [0, 0, 0];
    _m4.compose(_p.set(...pos), _q.setFromEuler(_e.set(rot[0], rot[1], rot[2])), scl ? _s.set(...(Array.isArray(scl) ? scl : [scl, scl, scl])) : _s.set(1, 1, 1));
    if (base) _m4.premultiply(base);
    const g = geo.index ? geo : geo.clone().setIndex([...Array(geo.attributes.position.count).keys()]);
    (paint.glow ? this.glow : this.lit).push({ g, m: _m4.clone(), paint, bone });
    return this;
  }
  bake(skinned) {
    const out = {};
    for (const [k, list] of [['lit', this.lit], ['glow', this.glow]]) {
      if (!list.length) continue;
      let nv = 0, ni = 0; for (const p of list) { nv += p.g.attributes.position.count; ni += p.g.index.count; }
      const pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3), col = new Float32Array(nv * 3), rm = k === 'lit' ? new Float32Array(nv * 2) : null, si = skinned ? new Uint16Array(nv * 4) : null, sw = skinned ? new Float32Array(nv * 4) : null, idx = new Uint32Array(ni);
      let vo = 0, io = 0; const v = new V3(), n = new V3();
      for (const p of list) {
        const P = p.g.attributes.position, N = p.g.attributes.normal; _n3.getNormalMatrix(p.m);
        for (let i = 0; i < P.count; i++) {
          v.set(P.getX(i), P.getY(i), P.getZ(i)).applyMatrix4(p.m); pos.set([v.x, v.y, v.z], (vo + i) * 3);
          if (N) { n.set(N.getX(i), N.getY(i), N.getZ(i)).applyMatrix3(_n3).normalize(); nor.set([n.x, n.y, n.z], (vo + i) * 3); }
          col.set([p.paint.c.r, p.paint.c.g, p.paint.c.b], (vo + i) * 3);
          if (rm) rm.set([p.paint.r, p.paint.m], (vo + i) * 2);
          if (si) { si[(vo + i) * 4] = p.bone; sw[(vo + i) * 4] = 1; }
        }
        const I = p.g.index; for (let i = 0; i < I.count; i++) idx[io + i] = I.getX(i) + vo;
        vo += P.count; io += I.count;
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      if (rm) g.setAttribute('rm', new THREE.BufferAttribute(rm, 2));
      if (si) { g.setAttribute('skinIndex', new THREE.BufferAttribute(si, 4)); g.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4)); }
      g.setIndex(new THREE.BufferAttribute(idx, 1)); g.computeBoundingSphere(); g.boundingSphere.radius += 0.6;
      out[k] = g;
    }
    return out;
  }
}
// one lit material for everything sculpted: colour, roughness and metalness come from the vertices
const HMAT = {};
function heroMat(kind) {
  if (HMAT[kind]) return HMAT[kind];
  let m;
  if (kind === 'glow') m = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
  else {
    m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 1, side: THREE.DoubleSide, envMapIntensity: 0.9 });
    m.onBeforeCompile = sh => {
      sh.vertexShader = 'attribute vec2 rm;\nvarying vec2 vRM;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vRM = rm;');
      sh.fragmentShader = 'varying vec2 vRM;\n' + sh.fragmentShader.replace('#include <roughnessmap_fragment>', 'float roughnessFactor = vRM.x;').replace('#include <metalnessmap_fragment>', 'float metalnessFactor = vRM.y;');
    };
    m.customProgramCacheKey = () => 'ot-hero-rm';
  }
  return (HMAT[kind] = m);
}

// ---------------------------------------------------------------- the skeleton
const BONES = [
  ['root', null, 0, 0, 0], ['hips', 'root', 0, 0.98, 0], ['spine', 'hips', 0, 0.1, 0], ['chest', 'spine', 0, 0.16, 0], ['neck', 'chest', 0, 0.3, 0], ['head', 'neck', 0, 0.06, 0],
  ['clavR', 'chest', 0.17, 0.27, 0], ['upperR', 'clavR', 0.03, 0, 0], ['foreR', 'upperR', 0, -0.28, 0], ['handR', 'foreR', 0, -0.25, 0],
  ['clavL', 'chest', -0.17, 0.27, 0], ['upperL', 'clavL', -0.03, 0, 0], ['foreL', 'upperL', 0, -0.28, 0], ['handL', 'foreL', 0, -0.25, 0],
  ['thighR', 'hips', 0.11, -0.04, 0], ['shinR', 'thighR', 0, -0.45, 0], ['footR', 'shinR', 0, -0.43, 0],
  ['thighL', 'hips', -0.11, -0.04, 0], ['shinL', 'thighL', 0, -0.45, 0], ['footL', 'shinL', 0, -0.43, 0],
  ['aim', 'chest', 0, 0.2, 0], ['weapon', 'aim', 0.13, -0.12, -0.3], ['tail', 'hips', 0, 0.02, 0.1], ['cape', 'chest', 0, 0.28, 0.12], ['acc', 'head', 0, 0.2, 0],
];
const BI = {}; BONES.forEach((b, i) => { BI[b[0]] = i; });
// per-hero tweaks to the skeleton: shoulder width
const RIG_OPT = { gauge: { sh: 0.31 }, mire: { sh: 0.2 }, ivra: { sh: 0.19 }, marrow: { sh: 0.19 }, veil: { sh: 0.16 }, spindle: { sh: 0.17 }, wick: { sh: 0.17 }, lark: { sh: 0.17 }, sable: { sh: 0.18 }, orrin: { sh: 0.17 } };
function makeRig(opt = {}) {
  const bones = BONES.map(b => { const B = new THREE.Bone(); B.name = b[0]; B.position.set(b[2], b[3], b[4]); if (opt.sh && b[0].startsWith('clav')) B.position.x = Math.sign(b[2]) * opt.sh; return B; });
  BONES.forEach((b, i) => { if (b[1]) bones[BI[b[1]]].add(bones[i]); });
  bones[0].updateMatrixWorld(true);
  return bones;
}

// ---------------------------------------------------------------- hero sculpting helpers
class HeroKit {
  constructor(rig, accent, look) { this.rig = rig; this.pb = new PartBuilder(); this.ac = GL_(accent, 3); this.L = look; }
  on(bone, geo, paint, pos, rot, scl) { const i = BI[bone]; this.pb.add(geo, paint, pos, rot, scl, this.rig[i].matrixWorld, i); return this; }
  loft(bone, rings, paint, pos, rot, scl, seg, open) { return this.on(bone, loft(RG(rings), seg || 18, open), paint, pos, rot, scl); }
  box(bone, w, h, d, r, paint, pos, rot) { return this.on(bone, roundBox(w, h, d, r), paint, pos, rot); }
  ball(bone, r, paint, pos, scl, seg = 14) { return this.on(bone, new THREE.SphereGeometry(r, seg, Math.max(6, seg * 0.7 | 0)), paint, pos, [0, 0, 0], scl); }
  cyl(bone, rt, rb, h, paint, pos, rot, seg = 14, open = false) { return this.on(bone, new THREE.CylinderGeometry(rt, rb, h, seg, 1, open), paint, pos, rot); }
  lathe(bone, prof, paint, pos, rot, seg = 18) { return this.on(bone, new THREE.LatheGeometry(prof.map(p => new THREE.Vector2(p[0], p[1])), seg), paint, pos, rot); }
  tube(bone, pts, r, paint, seg = 6) { return this.on(bone, tubeG(pts, r, seg), paint); }
  tor(bone, R, r, paint, pos, rot, arc = TAU, seg = 20) { return this.on(bone, new THREE.TorusGeometry(R, r, 6, seg, arc), paint, pos, rot); }
  ext(bone, pts, depth, paint, pos, rot, scl) { return this.on(bone, extG(pts, depth), paint, pos, rot, scl); }
  // the human underneath: proportions and paints the costume layers sit over
  body(o = {}) {
    const S = o.suit || P_(0x1c1e24, 0.8, 0.05), SK = o.skin || P_(this.L.skin, 0.55, 0), GV = o.glove || P_(0x22201e, 0.7, 0.05), BT = o.boot || P_(0x1a1816, 0.6, 0.1), b0 = o.bulk || 1, th = o.thin || 1, lb = b0 * (o.limb || 1.12);
    this.loft('hips', [[-0.13, 0.27 * b0, 0.19 * b0], [-0.06, 0.33 * b0, 0.22 * b0], [0.04, 0.33 * b0, 0.21 * b0], [0.12, 0.29 * b0, 0.19 * b0]], S);
    this.loft('spine', [[-0.02, 0.29 * b0, 0.19 * b0], [0.08, 0.28 * b0 * th, 0.18 * b0], [0.17, 0.31 * b0, 0.2 * b0]], S);
    this.loft('chest', [[-0.02, 0.3 * b0, 0.2 * b0], [0.1, 0.36 * b0, 0.23 * b0], [0.2, 0.4 * b0, 0.24 * b0], [0.27, 0.42 * b0, 0.22 * b0], [0.32, 0.3 * b0, 0.17 * b0], [0.35, 0.14, 0.12]], S);
    this.loft('neck', [[-0.02, 0.11, 0.11], [0.1, 0.1, 0.1]], o.neck || SK);
    if (!o.noHead) this.loft('head', [[0.0, 0.09, 0.1], [0.04, 0.15, 0.17], [0.12, 0.19, 0.21], [0.2, 0.2, 0.21], [0.26, 0.17, 0.18], [0.3, 0.09, 0.1], [0.315, 0.01, 0.01]], SK, [0, 0, 0.01]);
    for (const s of ['R', 'L']) {
      const sx = s === 'R' ? 1 : -1;
      this.ball('upper' + s, 0.07 * lb, S, [0, -0.01, 0]);
      this.loft('upper' + s, [[-0.27, 0.075 * lb, 0.075 * lb], [-0.15, 0.09 * lb, 0.09 * lb], [-0.02, 0.1 * lb, 0.1 * lb]], S);
      this.ball('fore' + s, 0.052 * lb, S, [0, 0, 0]);
      this.loft('fore' + s, [[-0.24, 0.06 * lb, 0.055 * lb], [-0.12, 0.075 * lb, 0.07 * lb], [-0.02, 0.07 * lb, 0.068 * lb]], S);
      this.box('hand' + s, 0.075, 0.1, 0.045, 0.02, GV, [0, -0.06, 0]);
      this.box('hand' + s, 0.022, 0.06, 0.025, 0.01, GV, [sx * -0.04, -0.04, -0.015], [0, 0, sx * 0.4]);
      this.ball('thigh' + s, 0.09 * lb, S, [0, -0.02, 0]);
      this.loft('thigh' + s, [[-0.44, 0.1 * lb, 0.1 * lb], [-0.3, 0.13 * lb, 0.13 * lb], [-0.1, 0.15 * lb, 0.16 * lb], [0.02, 0.14 * lb, 0.15 * lb]], S);
      this.ball('shin' + s, 0.065 * lb, S, [0, 0, -0.01]);
      this.loft('shin' + s, [[-0.42, 0.07 * lb, 0.07 * lb], [-0.25, 0.09 * lb, 0.1 * lb], [-0.1, 0.1 * lb, 0.11 * lb], [0.0, 0.09 * lb, 0.09 * lb]], S);
      this.loft('foot' + s, [[-0.06, 0.1, 0.26, 4, 0, -0.05], [0.0, 0.1, 0.24, 3, 0, -0.04], [0.07, 0.08, 0.12, 2, 0, 0]], BT);
    }
  }
}

// ---------------------------------------------------------------- weapons, in their own space
// Every weapon is drawn through `w(geo, paint, pos, rot, scl)`; it returns where the hands and muzzle go.
function weaponParts(key, w, look, ac) {
  const DK = P_(0x16181c, 0.45, 0.7), MT = P_(0x4a4f58, 0.3, 0.9), BR = P_(0xb8873a, 0.3, 0.95), WD = P_(0x5a3a22, 0.6, 0.05), LT = P_(0x3a2a1e, 0.75, 0.05), G = GL_(look.glow, 4);
  const box = (W, H, D, r, p, pos, rot) => w(roundBox(W, H, D, r), p, pos, rot);
  const cyl = (rt, rb, h, p, pos, rot, seg = 12) => w(new THREE.CylinderGeometry(rt, rb, h, seg), p, pos, rot);
  if (key === 'marrow') {
    // Rattlejaw: a crank crossbow with bone limbs and a barbed bolt laid in the track
    box(0.06, 0.07, 0.62, 0.02, WD, [0, 0.02, -0.18]); box(0.065, 0.12, 0.26, 0.03, WD, [0, -0.02, 0.2], [0.15, 0, 0]);
    box(0.04, 0.12, 0.05, 0.015, LT, [0, -0.07, 0.02], [0.25, 0, 0]);
    for (const s of [-1, 1]) { w(tubeG([[0, 0.05, -0.44], [s * 0.18, 0.06, -0.4], [s * 0.34, 0.04, -0.3]], 0.016, 6, 10), P_(0xd8cfb8, 0.5, 0.05)); w(tubeG([[s * 0.34, 0.04, -0.3], [0, 0.055, -0.1]], 0.003, 4, 4), P_(0x9a9080, 0.6, 0)); }
    box(0.1, 0.05, 0.06, 0.015, MT, [0, 0.05, -0.44]); cyl(0.035, 0.035, 0.06, MT, [0.06, 0.0, 0.05], [0, 0, Math.PI / 2]); box(0.012, 0.012, 0.08, 0.004, BR, [0.11, -0.02, 0.05]);
    w(new THREE.CylinderGeometry(0.008, 0.008, 0.5, 6), P_(0x6a5a44, 0.5, 0.2), [0, 0.07, -0.25], [Math.PI / 2, 0, 0]);
    w(new THREE.ConeGeometry(0.022, 0.07, 4), MT, [0, 0.07, -0.53], [-Math.PI / 2, 0, 0]);
    box(0.066, 0.012, 0.16, 0.004, ac, [0, 0.06, 0.04]);
    return { gripL: [0, -0.03, -0.2], muzzle: [0, 0.07, -0.58], hold: [0.1, -0.12, -0.22] };
  }
  if (key === 'lark') {
    // Shardcaster: a gauntlet with a crystal cluster growing from the knuckles
    box(0.1, 0.1, 0.24, 0.04, P_(0xd9dde6, 0.35, 0.3), [0, 0.0, 0.08]); box(0.11, 0.04, 0.2, 0.015, DK, [0, 0.06, 0.08]);
    for (let i = 0; i < 6; i++) { const a = i / 6 * TAU, l = 0.12 + (i % 3) * 0.04; w(new THREE.OctahedronGeometry(1, 0), G, [Math.cos(a) * 0.035, Math.sin(a) * 0.035 + 0.01, -0.06 - l * 0.4], [a, 0.3, 0], [0.018, l * 0.5, 0.018]); }
    w(new THREE.OctahedronGeometry(1, 0), G, [0, 0.01, -0.14], [Math.PI / 2, 0, 0], [0.03, 0.12, 0.03]);
    for (const s of [-1, 1]) box(0.012, 0.012, 0.2, 0.004, ac, [s * 0.055, 0.0, 0.08]);
    return { gripL: null, muzzle: [0, 0.01, -0.26], hold: [0.18, -0.14, -0.34] };
  }
  if (key === 'gauge') {
    // Boiler: a fat nozzle on a hose, with a pilot light and heat fins
    w(new THREE.LatheGeometry([[0.05, 0], [0.06, 0.05], [0.055, 0.4], [0.075, 0.45], [0.085, 0.55], [0.06, 0.56]].map(p => new THREE.Vector2(p[0], p[1])), 16), MT, [0, 0.03, 0.05], [-Math.PI / 2, 0, 0]);
    for (let i = 0; i < 6; i++) cyl(0.08, 0.08, 0.012, DK, [0, 0.03, -0.08 - i * 0.04], [Math.PI / 2, 0, 0], 16);
    box(0.08, 0.16, 0.08, 0.02, DK, [0, -0.08, 0.04], [0.2, 0, 0]); box(0.07, 0.06, 0.24, 0.02, P_(0xd29a22, 0.45, 0.4), [0, 0.1, -0.05]);
    w(sph(0.02, 8, 6), GL_(0x4aa0ff, 5), [0, 0.0, -0.52]); cyl(0.04, 0.05, 0.12, DK, [0, -0.05, -0.32], [0, 0, 0]);
    w(tubeG([[0, -0.1, 0.1], [0, -0.3, 0.2], [-0.1, -0.4, 0.4]], 0.03, 8, 10), P_(0x2a2622, 0.8, 0.1));
    box(0.08, 0.012, 0.12, 0.004, ac, [0, 0.135, -0.05]);
    return { gripL: [0, 0.02, -0.22], muzzle: [0, 0.03, -0.56], hold: [0.12, -0.22, -0.16] };
  }
  if (key === 'veil') {
    // Whisper Knives: a curved blade, tang and grip (the left one is held in the other hand)
    w(extG([[0, 0], [0.03, 0.06], [0.05, 0.18], [0.02, 0.3], [-0.01, 0.17], [-0.02, 0.06]], 0.006), P_(0xd8dde4, 0.18, 1), [0, 0.0, -0.04], [-Math.PI / 2, 0, 0]);
    w(extG([[0, 0.03], [0.02, 0.12], [0.01, 0.25], [0, 0.13]], 0.007, 0.002), G, [0, 0.004, -0.04], [-Math.PI / 2, 0, 0]);
    cyl(0.016, 0.016, 0.12, LT, [0, 0, 0.04], [Math.PI / 2, 0, 0], 8); box(0.07, 0.014, 0.02, 0.005, MT, [0, 0, -0.03]);
    return { gripL: null, muzzle: [0, 0.0, -0.3], hold: [0.2, -0.22, -0.28], dual: true };
  }
  if (key === 'ivra') {
    // Tidecaller: a bronze-shod staff with a caged tide-orb at its head
    cyl(0.018, 0.02, 1.3, WD, [0, 0, -0.2], [Math.PI / 2, 0, 0], 10);
    for (const z of [-0.84, -0.6, 0.2, 0.44]) cyl(0.026, 0.026, 0.04, BR, [0, 0, z], [Math.PI / 2, 0, 0], 10);
    w(sph(0.065, 16, 12), G, [0, 0, -0.98]);
    for (let i = 0; i < 4; i++) { const a = i / 4 * TAU; w(tubeG([[0, 0, -0.88], [Math.cos(a) * 0.08, Math.sin(a) * 0.08, -0.96], [Math.cos(a) * 0.05, Math.sin(a) * 0.05, -1.06], [0, 0, -1.09]], 0.008, 5, 10), BR); }
    w(new THREE.TorusGeometry(0.11, 0.008, 6, 20, Math.PI * 1.4), BR, [0, 0, -0.86], [Math.PI / 2, 0, 0.6]);
    box(0.012, 0.03, 0.2, 0.004, ac, [0.022, 0, -0.5]);
    return { gripL: [0, 0, -0.24], muzzle: [0, 0, -0.98], hold: [0.08, -0.16, -0.18] };
  }
  if (key === 'wick') {
    // Moth Swarm: a hanging birdcage of moths swung from the hand
    w(new THREE.TorusGeometry(0.035, 0.008, 6, 12), BR, [0, 0.0, 0], [0, Math.PI / 2, 0]);
    w(tubeG([[0, -0.03, 0], [0, -0.06, -0.06]], 0.006, 4, 4), BR);
    const c = [0, -0.18, -0.12];
    w(new THREE.CylinderGeometry(0.11, 0.11, 0.02, 16), BR, [c[0], c[1] + 0.12, c[2]]); w(new THREE.CylinderGeometry(0.12, 0.12, 0.02, 16), BR, [c[0], c[1] - 0.12, c[2]]);
    w(new THREE.SphereGeometry(0.11, 16, 8, 0, TAU, 0, Math.PI / 2), BR, [c[0], c[1] + 0.12, c[2]], [0, 0, 0], [1, 0.6, 1]);
    for (let i = 0; i < 10; i++) { const a = i / 10 * TAU; w(new THREE.CylinderGeometry(0.004, 0.004, 0.24, 4), BR, [c[0] + Math.cos(a) * 0.11, c[1], c[2] + Math.sin(a) * 0.11]); }
    w(sph(0.05, 12, 8), GL_(0xffd27a, 5), c);
    for (let i = 0; i < 5; i++) { const a = i * 1.3; w(new THREE.PlaneGeometry(0.05, 0.03), GL_(0xffe8b0, 3), [c[0] + Math.cos(a) * 0.06, c[1] + Math.sin(i) * 0.06, c[2] + Math.sin(a) * 0.06], [0, a, 0.3]); }
    return { gripL: null, muzzle: [c[0], c[1], c[2] - 0.12], hold: [0.2, -0.04, -0.3] };
  }
  if (key === 'mire') {
    // Brewer's Flasks: a round-bellied flask of glowing brew, corked and wired
    w(new THREE.LatheGeometry([[0, 0], [0.06, 0.01], [0.08, 0.06], [0.07, 0.12], [0.025, 0.16], [0.022, 0.21], [0.026, 0.22], [0, 0.22]].map(p => new THREE.Vector2(p[0], p[1])), 16), GL_(0x4a9a2a, 1.1), [0, -0.05, -0.06]);
    w(new THREE.TorusGeometry(0.075, 0.006, 4, 16), P_(0x1a2a1a, 0.1, 0.3), [0, 0.06, -0.06], [Math.PI / 2, 0, 0]);
    w(sph(0.068, 12, 10), GL_(0x9aff5a, 3), [0, 0.0, -0.06], [0, 0, 0], [1, 0.75, 1]);
    cyl(0.024, 0.02, 0.04, P_(0x7a5a3a, 0.8, 0), [0, 0.18, -0.06]); w(new THREE.TorusGeometry(0.075, 0.004, 4, 16), MT, [0, 0.02, -0.06], [Math.PI / 2, 0, 0]);
    return { gripL: null, muzzle: [0, 0.05, -0.12], hold: [0.22, -0.1, -0.28] };
  }
  if (key === 'orrin') {
    // Star Lance: a long brass astrolabe rod with turning rings and a crystal star at its tip
    cyl(0.018, 0.022, 1.0, BR, [0, 0, -0.25], [Math.PI / 2, 0, 0], 10);
    box(0.045, 0.13, 0.05, 0.015, WD, [0, -0.07, 0.05], [0.2, 0, 0]);
    for (const [z, r] of [[-0.55, 0.09], [-0.42, 0.07], [0.1, 0.05]]) w(new THREE.TorusGeometry(r, 0.008, 6, 24), BR, [0, 0, z], [0, 0.5 + z, 0.3]);
    w(new THREE.OctahedronGeometry(1, 0), G, [0, 0, -0.8], [Math.PI / 2, 0, 0], [0.045, 0.11, 0.045]);
    for (let i = 0; i < 4; i++) { const g = i / 4 * TAU; w(new THREE.ConeGeometry(0.012, 0.09, 4), BR, [Math.cos(g) * 0.05, Math.sin(g) * 0.05, -0.72], [-Math.PI / 2, 0, 0]); }
    box(0.012, 0.03, 0.3, 0.004, ac, [0.02, 0, -0.2]);
    return { gripL: [0, 0, -0.24], muzzle: [0, 0, -0.86], hold: [0.1, -0.15, -0.2] };
  }
  if (key === 'sable') {
    // Second Hand: a brass clock-pistol; the dial is the cylinder, the barrel is a long minute hand
    box(0.04, 0.12, 0.05, 0.015, DK, [0, -0.06, 0.04], [0.25, 0, 0]);
    cyl(0.075, 0.075, 0.05, BR, [0, 0.03, -0.02], [0, 0, Math.PI / 2], 22); cyl(0.062, 0.062, 0.052, P_(0xe8e0cc, 0.25, 0), [0, 0.03, -0.02], [0, 0, Math.PI / 2], 22);
    w(new THREE.TorusGeometry(0.062, 0.006, 6, 22), ac, [0.027, 0.03, -0.02], [0, Math.PI / 2, 0]);
    w(extG([[0, 0], [0.012, 0.03], [0.006, 0.3], [0, 0.34], [-0.006, 0.3], [-0.012, 0.03]], 0.012), BR, [0, 0.03, -0.06], [-Math.PI / 2, 0, 0]);
    w(extG([[0, 0.04], [0.005, 0.25], [0, 0.3], [-0.005, 0.25]], 0.014, 0.002), G, [0, 0.032, -0.06], [-Math.PI / 2, 0, 0]);
    for (let i = 0; i < 8; i++) { const g = i / 8 * TAU; box(0.02, 0.016, 0.016, 0.004, BR, [-0.03, 0.03 + Math.cos(g) * 0.045, 0.06 + Math.sin(g) * 0.045], [g, 0, 0]); }
    cyl(0.035, 0.035, 0.02, BR, [-0.03, 0.03, 0.06], [0, 0, Math.PI / 2], 14);
    return { gripL: null, muzzle: [0, 0.03, -0.42], hold: [0.18, -0.13, -0.32] };
  }
  // spindle — Thread Needles: a spool-wheel launcher with a fan of needles, threads trailing
  cyl(0.07, 0.07, 0.05, P_(0x7a1e2e, 0.5, 0.2), [0, 0.03, -0.06], [0, 0, Math.PI / 2], 18); cyl(0.04, 0.04, 0.055, P_(0xe0d6c4, 0.8, 0), [0, 0.03, -0.06], [0, 0, Math.PI / 2], 14);
  for (const s of [-1, 1]) w(new THREE.TorusGeometry(0.07, 0.006, 6, 20), BR, [s * 0.028, 0.03, -0.06], [0, Math.PI / 2, 0]);
  box(0.04, 0.12, 0.05, 0.015, DK, [0, -0.05, 0.02], [0.25, 0, 0]); box(0.05, 0.04, 0.26, 0.012, DK, [0, 0.03, -0.18]);
  for (let i = -1; i <= 1; i++) w(new THREE.CylinderGeometry(0.003, 0.001, 0.22, 4), P_(0xe8e8f0, 0.2, 1), [i * 0.014, 0.06, -0.3], [Math.PI / 2, 0, 0]);
  box(0.052, 0.01, 0.16, 0.003, ac, [0, 0.052, -0.16]);
  return { gripL: null, muzzle: [0, 0.06, -0.42], hold: [0.19, -0.13, -0.32] };
}

// ---------------------------------------------------------------- the eight costumes
function costume(K, key) {
  const L = K.L, M = P_(L.main, 0.55, 0.2), S2 = P_(L.second, 0.6, 0.25), CL = P_(L.cloth, 0.85, 0), MT = P_(L.metal, 0.3, 0.85), GW = GL_(L.glow, 3.5), AC = K.ac;
  const DK = P_(0x141518, 0.5, 0.5), LT = P_(0x3a2618, 0.7, 0.05), BR = P_(0xb8873a, 0.28, 0.95);
  if (key === 'marrow') {
    K.body({ suit: P_(0x2e2c26, 0.8, 0), skin: P_(L.skin, 0.6, 0), boot: P_(0x2a1c12, 0.55, 0.05) });
    // the long coat: chest, shoulders, a split skirt that swings from the hips
    K.loft('chest', [[-0.04, 0.33, 0.23, 2.4], [0.1, 0.39, 0.26, 2.4], [0.2, 0.43, 0.27, 2.4], [0.28, 0.45, 0.25, 2.4], [0.33, 0.36, 0.21], [0.37, 0.18, 0.16]], M);
    K.loft('spine', [[-0.02, 0.32, 0.22, 2.4], [0.17, 0.34, 0.23, 2.4]], M);
    K.loft('tail', [[-0.82, 0.62, 0.5, 2.2], [-0.5, 0.5, 0.4], [-0.15, 0.38, 0.3], [0.05, 0.35, 0.26]], M, [0, 0, -0.1], null, null, 20, [-1.25, 4.4]);
    K.loft('tail', [[-0.83, 0.625, 0.505, 2.2], [-0.78, 0.6, 0.48]], P_(0x2a1a10, 0.7, 0), [0, 0, -0.1], null, null, 20, [-1.25, 4.4]);
    K.loft('hips', [[-0.03, 0.36, 0.25, 2.4], [0.05, 0.36, 0.25, 2.4]], LT);
    K.box('hips', 0.05, 0.06, 0.02, 0.01, BR, [0, 0.01, -0.13]);
    for (const s of ['R', 'L']) { K.loft('upper' + s, [[-0.26, 0.105, 0.105], [-0.02, 0.125, 0.125]], M); K.loft('fore' + s, [[-0.21, 0.1, 0.1], [-0.12, 0.11, 0.11], [-0.02, 0.09, 0.09]], M); K.ball('clav' + s, 0.1, M, [0, 0, 0], [1.2, 0.8, 1]); }
    K.loft('chest', [[0.3, 0.32, 0.26], [0.36, 0.3, 0.24], [0.4, 0.16, 0.18]], P_(0x4a3020, 0.8, 0), [0, 0, 0.02]);          // collar
    // bandolier with spare snare jaws on the back
    K.tor('chest', 0.24, 0.022, LT, [0, 0.16, 0], [1.25, 0, 0.55], TAU, 24);
    for (const x of [-0.09, 0.09]) { K.tor('chest', 0.07, 0.012, MT, [x, 0.18, 0.15], [0.2, 0, 0]); for (let i = 0; i < 6; i++) K.on('chest', new THREE.ConeGeometry(0.008, 0.025, 4), P_(0xd8d0c0, 0.4, 0.5), [x + Math.cos(i) * 0.06, 0.18 + Math.sin(i) * 0.06, 0.16], [0, 0, i]); }
    // head: scarf over the jaw, eyes in the hat's shadow, the wide hat
    K.loft('head', [[0.0, 0.17, 0.19], [0.09, 0.2, 0.22], [0.14, 0.19, 0.21]], P_(0x5a4a3a, 0.9, 0), [0, 0.0, 0.0]);
    for (const x of [-0.045, 0.045]) K.ball('head', 0.014, GW, [x, 0.175, -0.095]);
    K.lathe('head', [[0, 0], [0.42, 0], [0.43, 0.012], [0.4, 0.03], [0.16, 0.035], [0.15, 0.13], [0.12, 0.17], [0, 0.18]], P_(0x2a1a10, 0.75, 0), [0, 0.22, 0.01], [0.06, 0, 0], 26);
    K.cyl('head', 0.155, 0.16, 0.035, AC, [0, 0.27, 0.01], [0.06, 0, 0], 22, true);
    K.on('head', new THREE.ConeGeometry(0.02, 0.1, 5), P_(0xd8cfb8, 0.5, 0), [0.15, 0.31, 0.03], [0, 0, -0.9]);
    for (const s of ['R', 'L']) K.loft('hand' + s, [[-0.02, 0.09, 0.07], [0.08, 0.1, 0.085]], LT);
    return { scale: 1.02 };
  }
  if (key === 'lark') {
    K.body({ suit: P_(0x23262e, 0.55, 0.2), skin: P_(L.skin, 0.5, 0), boot: P_(0xd9dde6, 0.3, 0.3), thin: 0.9 });
    // white panelled runner's suit over the dark one
    K.loft('chest', [[0.04, 0.34, 0.22], [0.16, 0.4, 0.245], [0.26, 0.41, 0.225], [0.31, 0.3, 0.18]], M, [0, 0, -0.008], null, null, 18, [3.6, 5.85]);
    K.loft('chest', [[0.0, 0.3, 0.21], [0.12, 0.35, 0.24]], S2, [0, 0, 0.01], null, null, 18, [0.5, 2.6]);
    K.box('chest', 0.06, 0.24, 0.02, 0.01, AC, [0, 0.14, -0.125]);
    K.lathe('chest', [[0, -0.06], [0.07, -0.05], [0.09, 0.0], [0.06, 0.05], [0, 0.06]], P_(0x2a2f3c, 0.4, 0.6), [0, 0.15, 0.13], [Math.PI / 2, 0, 0]);
    K.ball('chest', 0.04, GW, [0, 0.15, 0.17]);
    for (let i = 0; i < 5; i++) K.on('clavR', new THREE.OctahedronGeometry(1, 0), GW, [0.06 + i * 0.01, 0.06 + (i % 2) * 0.03, -0.04 + i * 0.02], [i, i * 0.7, 0.3], [0.02, 0.07 + i * 0.01, 0.02]);
    K.ball('clavR', 0.085, M, [0.03, 0.01, 0], [1.2, 0.8, 1.1]);
    for (const s of ['R', 'L']) { K.loft('thigh' + s, [[-0.42, 0.12, 0.12], [-0.12, 0.175, 0.185]], M, [0, 0, -0.005], null, null, 14, [3.3, 6.1]); K.loft('shin' + s, [[-0.38, 0.095, 0.095], [-0.05, 0.115, 0.12]], M, [0, 0, -0.005], null, null, 14, [3.3, 6.1]); K.box('foot' + s, 0.02, 0.05, 0.12, 0.01, AC, [0, 0.03, 0.02]); }
    // the visor helmet
    K.loft('head', [[-0.01, 0.15, 0.17], [0.06, 0.2, 0.23], [0.16, 0.215, 0.24], [0.25, 0.19, 0.21], [0.31, 0.11, 0.13], [0.33, 0.02, 0.02]], M, [0, 0, 0.005]);
    K.loft('head', [[0.11, 0.2, 0.22], [0.17, 0.205, 0.225]], GW, [0, 0, -0.012], null, null, 18, [3.7, 5.7]);
    K.box('head', 0.02, 0.16, 0.26, 0.01, AC, [0, 0.27, 0.02]);
    // a long scarf from the collar
    K.loft('cape', [[-0.62, 0.12, 0.02], [-0.3, 0.15, 0.025], [0, 0.2, 0.03]], CL, [0, -0.04, 0.04], [0.2, 0, 0], null, 6);
    K.tor('chest', 0.12, 0.04, CL, [0, 0.32, 0], [Math.PI / 2, 0, 0]);
    return { scale: 0.99 };
  }
  if (key === 'gauge') {
    K.body({ suit: P_(0x2a2622, 0.8, 0.1), skin: P_(0x2a2624, 0.6, 0.2), boot: P_(0x3a3632, 0.4, 0.7), bulk: 1.3, glove: P_(0x3a3632, 0.45, 0.7) });
    // a walking boiler: riveted tank torso with a furnace grate in the belly
    K.lathe('chest', [[0, -0.12], [0.26, -0.1], [0.3, 0.0], [0.31, 0.2], [0.27, 0.36], [0.12, 0.42], [0, 0.42]], M, [0, 0, 0], [0, 0, 0], 22);
    for (const y of [0.02, 0.2, 0.33]) K.tor('chest', 0.3 - (y > 0.3 ? 0.04 : 0), 0.014, MT, [0, y, 0], [Math.PI / 2, 0, 0], TAU, 28);
    K.box('chest', 0.24, 0.16, 0.06, 0.03, DK, [0, 0.08, -0.27]);
    for (let i = 0; i < 4; i++) K.box('chest', 0.18, 0.016, 0.02, 0.005, GL_(0xff7a2e, 5), [0, 0.03 + i * 0.035, -0.295]);
    K.loft('spine', [[-0.04, 0.46, 0.4], [0.14, 0.5, 0.42]], DK); K.loft('hips', [[-0.12, 0.44, 0.36, 3], [0.1, 0.48, 0.4, 3]], S2);
    // shoulder pots and huge gauntlets
    for (const s of ['R', 'L']) { K.lathe('clav' + s, [[0, -0.1], [0.14, -0.09], [0.16, 0], [0.12, 0.09], [0, 0.11]], M, [0, 0.02, 0]); K.tor('clav' + s, 0.15, 0.012, AC, [0, -0.02, 0], [Math.PI / 2, 0, 0]);
      K.loft('fore' + s, [[-0.26, 0.17, 0.16, 3], [-0.12, 0.19, 0.18, 3], [-0.02, 0.15, 0.14]], MT); K.box('hand' + s, 0.13, 0.13, 0.1, 0.035, P_(0x3a3632, 0.4, 0.7), [0, -0.07, 0]);
      K.loft('shin' + s, [[-0.42, 0.17, 0.2, 3], [-0.2, 0.18, 0.2, 3], [-0.05, 0.16, 0.18]], MT); K.loft('foot' + s, [[-0.07, 0.17, 0.32, 4, 0, -0.06], [0.04, 0.16, 0.26, 3, 0, -0.03]], P_(0x3a3632, 0.4, 0.7)); }
    // the diving-helmet head with a glowing porthole, two smokestacks behind
    K.lathe('head', [[0, -0.06], [0.16, -0.05], [0.21, 0.06], [0.21, 0.18], [0.17, 0.28], [0.08, 0.32], [0, 0.32]], P_(0xb8873a, 0.3, 0.9), [0, 0, 0], [0, 0, 0], 20);
    K.cyl('head', 0.09, 0.09, 0.05, P_(0x6a5a3a, 0.3, 0.9), [0, 0.13, -0.2], [Math.PI / 2, 0, 0], 18); K.cyl('head', 0.07, 0.07, 0.052, GL_(0xff9a3a, 4), [0, 0.13, -0.2], [Math.PI / 2, 0, 0], 18);
    for (const x of [-0.13, 0.13]) { K.cyl('chest', 0.06, 0.07, 0.6, DK, [x, 0.42, 0.3]); K.cyl('chest', 0.075, 0.06, 0.06, MT, [x, 0.74, 0.3]); K.cyl('chest', 0.05, 0.05, 0.02, GL_(0xff7a2e, 4), [x, 0.77, 0.3]); }
    K.lathe('chest', [[0, -0.2], [0.17, -0.18], [0.19, 0.16], [0.15, 0.22], [0, 0.22]], S2, [0, 0.2, 0.32], [0, 0, 0], 16);
    K.tube('chest', [[0.1, 0.1, 0.35], [0.32, 0.2, 0.15], [0.36, 0.16, -0.05]], 0.03, P_(0x2a2622, 0.8, 0.1));
    return { scale: 1.12 };
  }
  if (key === 'veil') {
    K.body({ suit: P_(0x17151c, 0.7, 0.1), skin: P_(0xe6e0d6, 0.35, 0.1), boot: P_(0x141218, 0.6, 0.1), thin: 0.85, noHead: true });
    // the hooded cloak, open at the front, falling to the shins
    K.loft('cape', [[-1.18, 0.62, 0.5], [-0.8, 0.55, 0.44], [-0.4, 0.5, 0.4], [-0.1, 0.48, 0.34], [0.03, 0.4, 0.28]], CL, [0, 0, -0.12], null, null, 22, [-1.0, 4.15]);
    K.loft('chest', [[0.24, 0.46, 0.3], [0.32, 0.4, 0.28], [0.38, 0.24, 0.22]], CL, [0, 0, 0.01]);
    // the porcelain mask under a deep hood
    K.loft('head', [[0.02, 0.13, 0.15], [0.1, 0.17, 0.2], [0.2, 0.17, 0.2], [0.27, 0.13, 0.15], [0.31, 0.03, 0.04]], P_(0xe6e0d6, 0.3, 0.1), [0, 0, -0.005]);
    K.box('head', 0.06, 0.012, 0.02, 0.004, GL_(L.glow, 5), [0.04, 0.18, -0.1]); K.box('head', 0.05, 0.004, 0.01, 0.002, P_(0x0a0a0c, 0.5, 0), [-0.04, 0.18, -0.1]);
    K.loft('head', [[-0.04, 0.25, 0.27], [0.1, 0.28, 0.31], [0.24, 0.27, 0.29], [0.34, 0.18, 0.22], [0.4, 0.04, 0.08]], CL, [0, 0, 0.03], null, null, 22, [-1.1, 4.25]);
    // wrapped arms and a sash
    for (const s of ['R', 'L']) for (let i = 0; i < 5; i++) K.tor('fore' + s, 0.04, 0.01, P_(0x3a3440, 0.9, 0), [0, -0.04 - i * 0.045, 0], [Math.PI / 2 + 0.2, 0, 0]);
    K.tor('hips', 0.18, 0.022, AC, [0, 0.03, 0], [Math.PI / 2, 0, 0], TAU, 24);
    K.loft('hips', [[-0.5, 0.06, 0.01], [0, 0.08, 0.012]], P_(0x5a2a6a, 0.85, 0), [0.1, 0.02, -0.18], [0, 0.3, 0.1], null, 4);
    // the left-hand knife
    weaponParts('veil', (g, p, pos, rot, scl) => K.on('handL', g, p, [pos[0], pos[1] - 0.09, pos[2]], rot, scl), L, K.ac);
    return { scale: 0.98 };
  }
  if (key === 'ivra') {
    K.body({ suit: P_(0x203030, 0.75, 0.1), skin: P_(L.skin, 0.55, 0), boot: BR });
    // bronze cuirass, pauldrons, a crimson tabard and a crested helm
    K.loft('chest', [[0.02, 0.35, 0.23, 2.2], [0.14, 0.42, 0.27, 2.2], [0.24, 0.44, 0.26, 2.2], [0.3, 0.34, 0.2]], BR);
    K.box('chest', 0.04, 0.22, 0.02, 0.01, AC, [0, 0.13, -0.135]);
    for (const s of ['R', 'L']) { const sx = s === 'R' ? 1 : -1; K.on('clav' + s, new THREE.SphereGeometry(0.14, 16, 10, 0, TAU, 0, Math.PI / 2), BR, [sx * 0.03, 0.0, 0], [0, 0, -sx * 0.4], [1, 0.75, 1.05]); K.on('clav' + s, new THREE.SphereGeometry(0.15, 16, 6, 0, TAU, 1.0, 0.3), M, [sx * 0.03, -0.01, 0], [0, 0, -sx * 0.4], [1, 0.75, 1.05]);
      K.loft('fore' + s, [[-0.22, 0.08, 0.08], [-0.05, 0.095, 0.095]], BR); K.loft('shin' + s, [[-0.36, 0.1, 0.11], [-0.04, 0.12, 0.13]], BR, [0, 0, -0.01], null, null, 14, [3.2, 6.2]); }
    K.loft('hips', [[-0.55, 0.2, 0.04], [-0.1, 0.24, 0.05], [0.05, 0.26, 0.05]], CL, [0, 0, -0.12], null, null, 6);
    K.loft('hips', [[-0.5, 0.2, 0.04], [-0.1, 0.24, 0.05], [0.05, 0.26, 0.05]], CL, [0, 0, 0.12], null, null, 6);
    K.loft('hips', [[-0.08, 0.36, 0.26, 2.4], [0.06, 0.34, 0.25, 2.4]], M);
    K.loft('head', [[0.0, 0.18, 0.2], [0.12, 0.215, 0.24], [0.22, 0.22, 0.24], [0.3, 0.15, 0.17], [0.34, 0.02, 0.03]], BR, [0, 0, 0.005]);
    K.box('head', 0.15, 0.04, 0.02, 0.01, P_(0x0a0a0a, 0.5, 0), [0, 0.15, -0.115]); K.box('head', 0.12, 0.014, 0.01, 0.004, GW, [0, 0.152, -0.122]);
    K.ext('head', [[0, 0], [0.24, 0.02], [0.3, 0.16], [0.12, 0.12], [-0.04, 0.06]], 0.02, M, [0, 0.27, 0.04], [0, Math.PI / 2, 0]);
    // the glaive on her back
    K.on('chest', new THREE.TorusGeometry(0.2, 0.03, 6, 22), BR, [0, 0.16, 0.17], [0, 0, 0]);
    for (let i = 0; i < 3; i++) K.ext('chest', [[0, 0], [0.16, 0.04], [0.26, -0.08], [0.12, -0.04]], 0.01, P_(0xd0d6dc, 0.2, 1), [Math.cos(i * 2.09) * 0.2, 0.16 + Math.sin(i * 2.09) * 0.2, 0.17], [0, 0, i * 2.09]);
    return { scale: 1.05 };
  }
  if (key === 'wick') {
    K.body({ suit: P_(0x2a2620, 0.85, 0), skin: P_(0xe8d8b0, 0.4, 0), boot: P_(0x1e1a16, 0.6, 0.1), thin: 0.85, noHead: true });
    // a long waxed coat with a cape-collar
    K.loft('tail', [[-0.78, 0.52, 0.42], [-0.4, 0.44, 0.36], [0, 0.36, 0.28]], M, [0, 0, -0.1], null, null, 20, [-1.15, 4.3]);
    K.loft('chest', [[-0.02, 0.33, 0.23], [0.14, 0.37, 0.25], [0.26, 0.4, 0.24], [0.33, 0.3, 0.2]], M);
    K.loft('chest', [[0.12, 0.6, 0.42], [0.26, 0.5, 0.36], [0.34, 0.3, 0.26]], P_(0x4a3e2a, 0.9, 0), [0, 0, 0.02]);
    for (let i = 0; i < 4; i++) K.box('chest', 0.03, 0.03, 0.02, 0.01, BR, [0.06, 0.04 + i * 0.07, -0.13]);
    // the candle head: a stub of wax with drips, and the flame
    K.cyl('head', 0.12, 0.13, 0.3, P_(0xeee0c0, 0.35, 0), [0, 0.15, 0], [0, 0, 0], 18);
    for (let i = 0; i < 7; i++) { const a = i * 0.9; K.on('head', new THREE.CapsuleGeometry(0.018, 0.06 + (i % 3) * 0.04, 3, 6), P_(0xf4ead0, 0.3, 0), [Math.cos(a) * 0.12, 0.24 - (i % 3) * 0.04, Math.sin(a) * 0.12]); }
    K.cyl('head', 0.12, 0.12, 0.012, P_(0xd8c8a0, 0.5, 0), [0, 0.3, 0], [0, 0, 0], 18);
    K.cyl('head', 0.006, 0.006, 0.05, P_(0x1a1410, 0.8, 0), [0, 0.32, 0]);
    K.on('acc', new THREE.ConeGeometry(0.045, 0.16, 10), GL_(0xffb84a, 3.2), [0, 0.17, 0]); K.ball('acc', 0.03, GL_(0xfff0c0, 4), [0, 0.13, 0]);
    for (const x of [-0.05, 0.05]) K.ball('head', 0.016, P_(0x1a1410, 0.5, 0), [x, 0.18, -0.12]);
    // a lantern at the hip
    K.on('hips', new THREE.CylinderGeometry(0.06, 0.07, 0.14, 8), BR, [0.22, -0.12, 0.05]); K.ball('hips', 0.04, GL_(0xffd27a, 5), [0.22, -0.12, 0.05]);
    for (const s of ['R', 'L']) K.loft('fore' + s, [[-0.06, 0.1, 0.1], [0.0, 0.12, 0.12]], M);
    return { scale: 1.06 };
  }
  if (key === 'mire') {
    K.body({ suit: P_(0x2a3020, 0.9, 0), skin: P_(L.skin, 0.65, 0), boot: P_(0x3a3020, 0.8, 0), bulk: 1.08, noHead: true, glove: P_(L.skin, 0.65, 0) });
    // a hunched shawl of moss and rags, roots for hair, a bark-skull face
    K.loft('chest', [[-0.04, 0.4, 0.3], [0.12, 0.5, 0.36], [0.26, 0.52, 0.36], [0.34, 0.36, 0.28], [0.4, 0.14, 0.14]], P_(0x3a4a26, 0.95, 0), [0, 0, 0.02], [0.1, 0, 0]);
    K.loft('tail', [[-0.75, 0.6, 0.5], [-0.35, 0.5, 0.44], [0.05, 0.42, 0.34]], P_(0x2e3a1e, 0.95, 0), [0, 0, -0.06], null, null, 20, [-1.3, 4.45]);
    for (let i = 0; i < 9; i++) { const a = -0.6 + i * 0.4, x = Math.sin(a) * 0.2; K.tube('chest', [[x, 0.32, 0.1], [x * 1.3, 0.1, 0.22], [x * 1.4, -0.2, 0.22]], 0.012, P_(0x2a3a1a, 0.95, 0)); }
    K.loft('head', [[0.0, 0.14, 0.16], [0.1, 0.19, 0.22], [0.2, 0.19, 0.22], [0.28, 0.12, 0.15], [0.31, 0.02, 0.03]], P_(0x5a4a34, 0.9, 0), [0, 0, 0.01]);
    for (const x of [-0.05, 0.05]) { K.ball('head', 0.03, P_(0x0a0a06, 0.8, 0), [x, 0.16, -0.095]); K.ball('head', 0.014, GW, [x, 0.16, -0.11]); }
    for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI; K.tube('head', [[Math.cos(a) * 0.1, 0.24, 0.02], [Math.cos(a) * 0.2, 0.36, 0.06], [Math.cos(a) * 0.26, 0.3 + (i % 2) * 0.1, 0.1]], 0.012, P_(0x4a3a24, 0.9, 0)); }
    K.loft('head', [[0.06, 0.32, 0.34], [0.2, 0.3, 0.34], [0.32, 0.18, 0.22], [0.36, 0.04, 0.06]], P_(0x2e3a1e, 0.95, 0), [0, 0, 0.04], null, null, 20, [-1.2, 4.35]);
    // flasks on a belt
    K.tor('hips', 0.2, 0.02, LT, [0, 0.0, 0], [Math.PI / 2, 0, 0], TAU, 24);
    for (let i = 0; i < 4; i++) { const a = 2.4 + i * 0.5; K.on('hips', new THREE.CylinderGeometry(0.03, 0.04, 0.1, 10), P_(0x2a4a2a, 0.1, 0.2), [Math.cos(a) * 0.22, -0.05, Math.sin(a) * 0.22]); K.ball('hips', 0.028, GL_(0x9aff5a, 3), [Math.cos(a) * 0.22, -0.06, Math.sin(a) * 0.22]); }
    return { scale: 1.0, hunch: 0.3 };
  }
  if (key === 'orrin') {
    // a robed astronomer: a hood full of night sky, planets circling the head, a star-chart cape
    K.body({ suit: P_(0x1a1630, 0.8, 0.05), skin: P_(L.skin, 0.6, 0), boot: P_(0x1a1424, 0.6, 0.2), thin: 0.9, noHead: true });
    K.loft('chest', [[-0.02, 0.34, 0.23], [0.14, 0.39, 0.26], [0.26, 0.42, 0.25], [0.33, 0.3, 0.21]], M);
    K.loft('tail', [[-0.88, 0.6, 0.5], [-0.5, 0.48, 0.4], [-0.15, 0.4, 0.32], [0.05, 0.36, 0.28]], M, [0, 0, -0.04], null, null, 22, [-1.35, 4.5]);
    K.loft('tail', [[-0.9, 0.61, 0.51], [-0.84, 0.59, 0.49]], GL_(L.glow, 1.6), [0, 0, -0.04], null, null, 22, [-1.35, 4.5]);
    K.loft('cape', [[-1.08, 0.66, 0.06], [-0.6, 0.6, 0.06], [-0.1, 0.52, 0.05], [0.04, 0.44, 0.05]], S2, [0, -0.05, 0.03], [0.12, 0, 0], null, 8);
    for (let i = 0; i < 18; i++) K.ball('cape', 0.008 + (i % 3) * 0.004, GL_(0xfff4d0, 4), [Math.sin(i * 2.3) * 0.26, -0.15 - (i * 0.37 % 0.85), 0.06], null, 6);
    K.tor('hips', 0.2, 0.025, CL, [0, 0.0, 0], [Math.PI / 2, 0, 0], TAU, 24); K.on('hips', new THREE.OctahedronGeometry(0.04, 0), MT, [0, 0.0, -0.21]);
    for (const sd of ['R', 'L']) { K.loft('fore' + sd, [[-0.2, 0.13, 0.13], [-0.08, 0.11, 0.11], [0.0, 0.1, 0.1]], M); K.tor('fore' + sd, 0.065, 0.01, MT, [0, -0.2, 0], [Math.PI / 2, 0, 0]); K.ball('clav' + sd, 0.1, M, [0, 0, 0], [1.2, 0.8, 1.1]); }
    // the hood, open over a face of stars
    K.loft('head', [[-0.02, 0.26, 0.28], [0.1, 0.29, 0.32], [0.24, 0.28, 0.3], [0.34, 0.19, 0.24], [0.42, 0.04, 0.12, 2, 0, 0.06]], M, [0, 0, 0.03], null, null, 22, [-1.0, 4.15]);
    K.loft('head', [[0.0, 0.15, 0.17], [0.1, 0.19, 0.21], [0.22, 0.19, 0.21], [0.3, 0.12, 0.15], [0.33, 0.02, 0.02]], P_(0x05040c, 0.9, 0), [0, 0, 0.02]);
    for (let i = 0; i < 9; i++) { const g = i * 2.4; K.ball('head', 0.006 + (i % 3) * 0.004, GL_(i % 4 ? 0xfff4d0 : L.glow, 6), [Math.cos(g) * 0.06 * (1 + i % 3 * 0.4), 0.15 + Math.sin(g * 1.3) * 0.07, -0.095], null, 6); }
    K.ball('head', 0.022, GL_(L.glow, 5), [0.03, 0.17, -0.1], null, 8);
    // little planets in orbit
    K.tor('acc', 0.3, 0.004, MT, [0, -0.02, 0], [Math.PI / 2 - 0.3, 0, 0.2], TAU, 40);
    K.ball('acc', 0.04, P_(0xd87a4a, 0.6, 0.1), [0.29, 0.05, 0.05]); K.ball('acc', 0.028, P_(0x6ab0d8, 0.5, 0.1), [-0.2, -0.08, -0.2]); K.ball('acc', 0.02, GL_(0xfff0a0, 4), [-0.05, 0.08, 0.29]);
    return { scale: 1.04 };
  }
  if (key === 'sable') {
    // a tall thief in a navy tailcoat with brass fittings, a cracked clock face for a head and a pendulum at the back
    K.body({ suit: P_(0x1a1c26, 0.7, 0.05), skin: P_(0x2a2a30, 0.5, 0.2), boot: P_(0x16141a, 0.35, 0.4), thin: 0.9, noHead: true, glove: P_(0x2a2a30, 0.5, 0.3) });
    K.loft('chest', [[-0.02, 0.33, 0.22], [0.14, 0.38, 0.25], [0.26, 0.42, 0.24], [0.33, 0.3, 0.2]], M);
    K.loft('tail', [[-0.82, 0.3, 0.2], [-0.5, 0.36, 0.26], [-0.15, 0.36, 0.28], [0.05, 0.34, 0.26]], M, [0, 0, -0.08], null, null, 18, [-0.15, 3.3]);
    K.loft('chest', [[0.24, 0.34, 0.27], [0.34, 0.36, 0.3], [0.42, 0.3, 0.28]], S2, [0, 0, 0.02], null, null, 18, [-0.9, 4.05]);
    K.box('chest', 0.14, 0.2, 0.02, 0.01, P_(0xd8d0c0, 0.7, 0), [0, 0.2, -0.125]);
    for (let i = 0; i < 3; i++) K.ball('chest', 0.016, MT, [0.075, 0.06 + i * 0.07, -0.13]);
    K.tube('chest', [[-0.08, 0.1, -0.13], [0, 0.06, -0.14], [0.08, 0.1, -0.13]], 0.005, MT, 4);
    // brass gear pauldrons
    for (const sd of ['R', 'L']) { K.cyl('clav' + sd, 0.12, 0.12, 0.04, MT, [0, 0.05, 0], [0, 0, 0], 20); for (let i = 0; i < 10; i++) { const g = i / 10 * TAU; K.box('clav' + sd, 0.04, 0.035, 0.03, 0.005, MT, [Math.cos(g) * 0.13, 0.05, Math.sin(g) * 0.13], [0, -g, 0]); } K.ball('clav' + sd, 0.03, GW, [0, 0.08, 0]); K.loft('fore' + sd, [[-0.1, 0.1, 0.1], [0.0, 0.11, 0.11]], M); K.tor('fore' + sd, 0.055, 0.01, MT, [0, -0.14, 0], [Math.PI / 2, 0, 0]); }
    // the clock-face head: a brass rim, a cracked glowing dial, two hands, and a top hat
    K.cyl('head', 0.19, 0.19, 0.08, MT, [0, 0.17, 0], [Math.PI / 2, 0, 0], 28);
    K.cyl('head', 0.165, 0.165, 0.082, P_(0xe8e0cc, 0.25, 0), [0, 0.17, 0], [Math.PI / 2, 0, 0], 28);
    K.tor('head', 0.165, 0.012, GW, [0, 0.17, -0.042], [0, 0, 0], TAU, 28);
    for (let i = 0; i < 12; i++) { const g = i / 12 * TAU; K.box('head', 0.008, i % 3 ? 0.02 : 0.04, 0.004, 0.002, P_(0x1a1a20, 0.5, 0), [Math.sin(g) * 0.14, 0.17 + Math.cos(g) * 0.14, -0.043], [0, 0, -g]); }
    K.box('head', 0.012, 0.12, 0.006, 0.003, GL_(L.glow, 5), [0.025, 0.21, -0.048], [0, 0, -0.5]); K.box('head', 0.014, 0.08, 0.006, 0.003, GL_(L.glow, 5), [-0.03, 0.19, -0.05], [0, 0, 1.1]);
    K.ball('head', 0.015, MT, [0, 0.17, -0.05]);
    K.tube('head', [[-0.12, 0.27, -0.043], [-0.06, 0.2, -0.044], [-0.09, 0.12, -0.044], [-0.02, 0.06, -0.044]], 0.004, GL_(L.glow, 2.5), 3);
    K.cyl('head', 0.1, 0.11, 0.2, P_(0x16141a, 0.5, 0.1), [0, 0.42, 0.03], [-0.1, 0, 0], 18); K.cyl('head', 0.18, 0.18, 0.015, P_(0x16141a, 0.5, 0.1), [0, 0.32, 0.02], [-0.1, 0, 0], 22); K.cyl('head', 0.112, 0.112, 0.035, AC, [0, 0.345, 0.025], [-0.1, 0, 0], 18, true);
    // the pendulum swinging behind
    K.box('tail', 0.012, 0.5, 0.012, 0.004, MT, [0, -0.3, 0.2]); K.cyl('tail', 0.07, 0.07, 0.02, MT, [0, -0.56, 0.2], [Math.PI / 2, 0, 0], 18); K.cyl('tail', 0.05, 0.05, 0.022, GW, [0, -0.56, 0.2], [Math.PI / 2, 0, 0], 18);
    return { scale: 1.04 };
  }
  // spindle: a lanky marionette in a crimson frock coat, wooden joints showing
  const WD = P_(0xb08a5a, 0.5, 0.05), RED = M;
  K.body({ suit: P_(0x2a1418, 0.7, 0.05), skin: WD, boot: P_(0x1a1012, 0.4, 0.3), thin: 0.8, noHead: true, glove: P_(0xe0d6c4, 0.8, 0) });
  for (const b of ['foreR', 'foreL', 'shinR', 'shinL', 'upperR', 'upperL']) K.ball(b, 0.06, WD, [0, 0, 0]);
  K.loft('chest', [[-0.02, 0.32, 0.22], [0.14, 0.36, 0.24], [0.26, 0.42, 0.24], [0.33, 0.3, 0.2]], RED);
  K.loft('chest', [[0.28, 0.3, 0.24], [0.42, 0.34, 0.3], [0.5, 0.36, 0.34]], RED, [0, 0, 0.04], null, null, 18, [-0.7, 3.85]);        // high collar
  K.loft('tail', [[-0.7, 0.44, 0.36], [-0.3, 0.38, 0.3], [0.04, 0.34, 0.26]], RED, [0, 0, -0.09], null, null, 18, [-1.0, 4.15]);
  for (let i = 0; i < 4; i++) K.ball('chest', 0.016, BR, [0.07, 0.04 + i * 0.07, -0.12]);
  K.box('chest', 0.16, 0.12, 0.04, 0.01, P_(0xe0d6c4, 0.8, 0), [0, 0.28, -0.11]);
  // the head: a smooth wooden egg with button eyes and a stitched mouth
  K.loft('head', [[0.0, 0.13, 0.15], [0.1, 0.18, 0.2], [0.22, 0.18, 0.2], [0.3, 0.12, 0.14], [0.34, 0.02, 0.02]], WD);
  for (const x of [-0.05, 0.05]) { K.cyl('head', 0.025, 0.025, 0.012, P_(0x1a1012, 0.4, 0.3), [x, 0.18, -0.095], [Math.PI / 2, 0, 0], 12); K.ball('head', 0.009, GL_(L.glow, 5), [x, 0.18, -0.103]); }
  for (let i = 0; i < 5; i++) K.box('head', 0.004, 0.025, 0.006, 0.002, P_(0x1a1012, 0.6, 0), [-0.04 + i * 0.02, 0.09, -0.1]);
  K.lathe('head', [[0, 0], [0.13, 0], [0.11, 0.08], [0.06, 0.2], [0, 0.22]], P_(0x1a1012, 0.6, 0.1), [0, 0.28, 0.02], [-0.25, 0, 0], 16);
  // the control bar on his back, strings trailing up from his wrists
  K.box('chest', 0.5, 0.03, 0.03, 0.01, WD, [0, 0.6, 0.14]); K.box('chest', 0.03, 0.03, 0.3, 0.01, WD, [0, 0.6, 0.14]);
  K.cyl('chest', 0.012, 0.012, 0.5, WD, [0, 0.36, 0.14]);
  return { scale: 1.08 };
}

// ---------------------------------------------------------------- putting a hero together
function buildHero(key, accent) {
  const H = HEROES[key], rig = makeRig(RIG_OPT[key]), K = new HeroKit(rig, accent, H.look);
  const info = costume(K, key);
  // the weapon, in the weapon bone's space; its hold is where that bone sits under the aim pivot
  let wp = null;
  const wb = BI.weapon;
  wp = weaponParts(key, (g, p, pos, rot, scl) => K.pb.add(g, p, pos, rot, scl, rig[wb].matrixWorld, wb), H.look, K.ac);
  rig[wb].position.set(...wp.hold); rig[0].updateMatrixWorld(true);
  // rebuild with the weapon bone in its real place (parts were placed relative to the bind; re-bake below uses it)
  K.pb.lit = K.pb.lit.filter(p => p.bone !== wb); K.pb.glow = K.pb.glow.filter(p => p.bone !== wb);
  weaponParts(key, (g, p, pos, rot, scl) => K.pb.add(g, p, pos, rot, scl, rig[wb].matrixWorld, wb), H.look, K.ac);
  const geos = K.pb.bake(true);
  const root = new THREE.Group(), body = new THREE.Group(); root.add(body); root.userData.hero = key;
  const holder = new THREE.Group(); holder.scale.setScalar(info.scale || 1); body.add(holder);
  holder.add(rig[0]);
  const skel = new THREE.Skeleton(rig), meshes = [];
  for (const k of ['lit', 'glow']) {
    if (!geos[k]) continue;
    const m = new THREE.SkinnedMesh(geos[k], heroMat(k === 'lit' ? 'lit' : 'glow'));
    m.castShadow = k === 'lit'; m.receiveShadow = false; m.frustumCulled = false;
    holder.add(m); m.bind(skel, new THREE.Matrix4()); m.userData.base = m.material; meshes.push(m);
  }
  const muzzle = new THREE.Object3D(); muzzle.position.set(...wp.muzzle); rig[wb].add(muzzle);
  const bones = {}; for (const b of rig) bones[b.name] = b;
  const M = { root, body, holder, bones, rig, skel, meshes, muzzle, H, key, hold: wp, info, extra: {}, t: Math.random() * 10 };
  // remember the bind rotation of the weapon bone's parent chain for the IK
  M.restQ = rig.map(b => b.quaternion.clone());
  return M;
}

// ---------------------------------------------------------------- posing: legs, spine, and arms solved onto the weapon
const _v1 = new V3(), _v2 = new V3(), _v3 = new V3(), _v4 = new V3(), _v5 = new V3(), _qa = new THREE.Quaternion(), _qb = new THREE.Quaternion(), _qc = new THREE.Quaternion(), DOWN = new V3(0, -1, 0);
function solveArm(M, side, target, pole) {
  // everything in chest space; the clavicle never turns, so its space is chest space shifted
  const B = M.bones, clav = B['clav' + side], up = B['upper' + side], fo = B['fore' + side], hand = B['hand' + side];
  const S = _v1.copy(clav.position).add(up.position), d = _v2.copy(target).sub(S), len = d.length(), a = -fo.position.y, b = -hand.position.y;
  const L = clamp(len, 0.06, a + b - 0.002); d.normalize();
  const cosA = clamp((a * a + L * L - b * b) / (2 * a * L), -1, 1), sinA = Math.sqrt(1 - cosA * cosA);
  const pp = _v3.copy(pole).addScaledVector(d, -pole.dot(d)).normalize();
  const E = _v4.copy(S).addScaledVector(d, a * cosA).addScaledVector(pp, a * sinA);
  up.quaternion.setFromUnitVectors(DOWN, _v3.copy(E).sub(S).normalize());
  const T = _v5.copy(S).addScaledVector(d, L);
  const fdir = _v3.copy(T).sub(E).normalize().applyQuaternion(_qa.copy(up.quaternion).invert());
  fo.quaternion.setFromUnitVectors(DOWN, fdir);
  return _qb.copy(up.quaternion).multiply(fo.quaternion);
}
const POLE_R = new V3(0.7, -0.6, 0.5).normalize(), POLE_L = new V3(-0.7, -0.6, 0.5).normalize();
const HAND_REST = new THREE.Quaternion().setFromEuler(new THREE.Euler(1.25, 0, 0));
// s: { spd, phase, air, pitch, flags, swing, swingSide, t, crouch, look }
function poseHero(M, s) {
  const B = M.bones, f = s.flags || 0, hunch = M.info.hunch || 0;
  for (const k in B) if (k !== 'weapon' && k !== 'root') B[k].quaternion.identity();
  // legs: a walk cycle with plant and lift; tucked in the air
  const run = Math.min(1, s.spd / 5), sw = Math.sin(s.phase) * run * 0.7;
  for (const [side, sg] of [['R', 1], ['L', -1]]) {
    const ph = sg * sw, lift = Math.max(0, Math.sin(s.phase + (sg > 0 ? Math.PI / 2 : -Math.PI / 2))) * run;
    const th = lerp(ph + (f & F_CHARGE ? -0.3 : 0), 0.55, s.air), kn = lerp(-(lift * 1.0 + 0.08 + Math.max(0, -ph) * 0.4), -1.0, s.air) - (s.crouch || 0) * 1.4;
    B['thigh' + side].rotation.set(th + (s.crouch || 0) * 0.7, 0, sg * 0.04); B['shin' + side].rotation.set(kn, 0, 0); B['foot' + side].rotation.set(-th - kn * 0.8, 0, 0);
  }
  B.hips.position.y = 0.98 + Math.abs(Math.cos(s.phase)) * run * 0.05 - s.air * 0.04 - (s.crouch || 0) * 0.15;
  B.hips.rotation.set(0, Math.sin(s.phase) * run * 0.12, 0);
  const lean = (f & F_CHARGE ? 0.45 : 0) + (f & F_PLACE ? 0.5 : 0) + hunch + (f & F_FATIGUE ? 0.25 : 0);
  B.spine.rotation.set(-lean * 0.5 + Math.sin(s.t * 1.6) * 0.012, -Math.sin(s.phase) * run * 0.1, 0);
  const p = clamp(s.pitch, -1.2, 1.2);
  B.chest.rotation.set(-lean * 0.5 + p * 0.25, 0, 0);
  B.neck.rotation.set(lean * 0.7 + p * 0.25, 0, 0); B.head.rotation.set(p * 0.25, 0, 0);
  B.aim.rotation.set(p * 0.75 + lean, 0, 0);
  // cloth: coats and capes trail with speed
  B.tail.rotation.set(-run * 0.35 - s.air * 0.3 + Math.sin(s.t * 3) * 0.02, 0, 0);
  B.cape.rotation.set(-0.15 - run * 0.5 - s.air * 0.4 + Math.sin(s.t * 4.5) * 0.05, 0, 0);
  if (B.acc) B.acc.rotation.set(Math.sin(s.t * 9) * 0.08 - run * 0.3, 0, Math.sin(s.t * 13) * 0.08);
  // arms: the hands go to the weapon's grips, through the aim pivot
  const W = B.weapon, hold = M.hold, aimQ = B.aim.quaternion;
  W.position.set(...hold.hold);
  let wq = _qc.identity();
  if (s.swing > 0 && s.swing < 0.45) { const k = s.swing / 0.45, sd = s.swingSide || 1, arc = Math.sin(k * Math.PI); W.position.x += sd * (0.3 - k * 0.6) * 0.8; W.position.z -= arc * 0.25; W.position.y += arc * 0.08; wq.setFromEuler(new THREE.Euler(0, sd * (0.9 - k * 1.8), sd * -0.5)); }
  if (f & F_WIND) { W.position.z += 0.08; }
  W.quaternion.copy(wq);
  const toChest = (v, out) => out.copy(v).applyQuaternion(wq).add(W.position).applyQuaternion(aimQ).add(B.aim.position);
  const tR = toChest(_v1.set(0, 0, 0), new V3());
  const qR = solveArm(M, 'R', tR, POLE_R);
  B.handR.quaternion.copy(qR).invert().multiply(_qa.copy(aimQ).multiply(wq)).multiply(HAND_REST);
  let tL;
  if (hold.gripL) tL = toChest(_v1.set(...hold.gripL), new V3());
  else if (hold.dual) { tL = new V3(-0.2, -0.24, -0.26); if (s.swing > 0 && s.swing < 0.45) { const k = s.swing / 0.45, sd = -(s.swingSide || 1); tL.x += sd * Math.sin(k * Math.PI) * 0.2; tL.z -= Math.sin(k * Math.PI) * 0.12; } tL.applyQuaternion(aimQ).add(B.aim.position); }
  else { tL = new V3(-0.24, -0.34 + Math.sin(s.t * 1.3) * 0.01, -0.1); if (f & (F_WIND | F_PLACE | F_BLINKCH | F_CHANNEL)) tL.set(-0.3, 0.05, -0.28); tL.applyQuaternion(aimQ).add(B.aim.position); }
  const qL = solveArm(M, 'L', tL, POLE_L);
  B.handL.quaternion.copy(qL).invert().multiply(_qa.copy(aimQ)).multiply(HAND_REST);
}
function poseIdle(M, t) { poseHero(M, { spd: 0, phase: 0, air: 0, pitch: -0.05, flags: 0, t }); }

// ---------------------------------------------------------------- the first-person view: forearms, hands and the weapon
function buildViewmodel(key) {
  const H = HEROES[key], L = H.look, vm = new THREE.Group(), ac = P_(0x2a8aa0, 0.4, 0.6);
  const VP = { marrow: [0.2, -0.25, -0.52, 0.8], lark: [0.2, -0.2, -0.42, 0.9], gauge: [0.23, -0.29, -0.52, 0.78], veil: [0.2, -0.22, -0.4, 1], ivra: [0.2, -0.23, -0.46, 0.85], wick: [0.25, -0.14, -0.56, 0.75], mire: [0.22, -0.24, -0.5, 0.75], spindle: [0.2, -0.23, -0.46, 0.9], sable: [0.2, -0.22, -0.44, 0.95], orrin: [0.19, -0.22, -0.46, 0.85] }[key] || [0.2, -0.2, -0.4, 1];
  const sleeve = key === 'gauge' ? P_(L.metal, 0.35, 0.85) : key === 'ivra' ? P_(0xb8873a, 0.3, 0.95) : key === 'spindle' ? P_(L.main, 0.55, 0.2) : P_(L.main, 0.6, 0.15);
  const glove = key === 'gauge' ? P_(0x3a3632, 0.45, 0.7) : key === 'spindle' ? P_(0xe0d6c4, 0.8, 0) : key === 'mire' ? P_(L.skin, 0.65, 0) : key === 'wick' ? P_(0xe8d8b0, 0.4, 0) : P_(0x2a2420, 0.7, 0.05);
  const groups = {};
  const mk = (name, x, y, z) => { const g = new THREE.Group(); g.position.set(x, y, z); vm.add(g); groups[name] = { g, pb: new PartBuilder() }; return groups[name]; };
  const R = mk('right', VP[0], VP[1], VP[2]), Lh = mk('left', -0.2, -0.22, -0.4), O = mk('off', -0.24, -0.28, -0.4);
  R.g.scale.setScalar(VP[3]);
  const arm = (G, side) => {
    const big = key === 'gauge' ? 1.5 : 1;
    G.pb.add(roundBox(0.075 * big, 0.085 * big, 0.11 * big, 0.03), glove, [0, -0.03, 0.02]);
    for (let i = 0; i < 4; i++) G.pb.add(roundBox(0.016 * big, 0.022, 0.05, 0.007), glove, [(-0.027 + i * 0.018) * big, 0.005, -0.04], [0.5, 0, 0]);
    G.pb.add(loft(RG([[0, 0.085 * big, 0.08 * big], [0.36, 0.1 * big, 0.095 * big]]), 14), sleeve, [side * 0.02, -0.07, 0.04], [Math.PI / 2 - 0.25, 0, side * -0.1]);
  };
  arm(R, 1);
  const hold = weaponParts(key, (g, p, pos, rot, scl) => R.pb.add(g, p, pos, rot, scl), L, ac);
  if (hold.gripL) { Lh.g.position.set(R.g.position.x + hold.gripL[0] * VP[3], R.g.position.y + (hold.gripL[1] - 0.02) * VP[3], R.g.position.z + hold.gripL[2] * VP[3]); Lh.g.scale.setScalar(VP[3]); arm(Lh, -1); }
  else if (hold.dual) { Lh.g.position.set(-0.2, -0.22, -0.4); arm(Lh, -1); weaponParts(key, (g, p, pos, rot, scl) => Lh.pb.add(g, p, pos, rot, scl), L, ac); }
  else Lh.g.visible = false;
  arm(O, -1);
  const extra = {};
  // the power in the off hand
  if (key === 'marrow') { const s = buildSnare(TEAM_HEX[0]); s.scale.setScalar(0.38); s.position.set(0.02, 0.06, -0.06); s.rotation.x = 0.6; O.g.add(s); extra.prop = s; }
  if (key === 'ivra') { const g = buildGlaive(L.glow, 1.2); g.position.set(0.02, 0.1, -0.02); g.rotation.set(0.2, 0, 1.2); O.g.add(g); extra.prop = g; }
  if (key === 'lark' || key === 'spindle' || key === 'mire' || key === 'sable' || key === 'orrin') { const o = new THREE.Mesh(sph(0.05, 14, 10), mGlow(L.glow, 6)); o.position.set(0, 0.07, -0.05); O.g.add(o); extra.orb = o; const r = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.006, 6, 24), mGlow(0xffffff, 4)); r.position.copy(o.position); O.g.add(r); extra.ring = r; }
  if (key === 'wick') { const l = buildLantern(L.glow); l.scale.setScalar(0.35); l.position.set(0.0, -0.05, -0.05); O.g.add(l); extra.prop = l; }
  for (const k in groups) { const geos = groups[k].pb.bake(false); for (const t of ['lit', 'glow']) if (geos[t]) { const m = new THREE.Mesh(geos[t], heroMat(t === 'lit' ? 'lit' : 'glow')); m.frustumCulled = false; m.userData.base = m.material; groups[k].g.add(m); } }
  const muzzle = new THREE.Object3D(); muzzle.position.set(...hold.muzzle); R.g.add(muzzle);
  O.g.visible = false;
  return { vm, right: R.g, left: Lh.g, off: O.g, gun: R.g, muzzle, hold, extra, key, kind: H.weapon.kind };
}

// ---------------------------------------------------------------- props: snares, glaives, walls, projectiles, lanterns, zones
function buildSnare(accent) {
  const g = new THREE.Group(), m = mStd(0x6a6e74, 0.35, 0.85), teeth = mStd(0xd8d2c4, 0.4, 0.6);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.035, 6, 24), m); ring.rotation.x = Math.PI / 2; ring.position.y = 0.04; g.add(ring);
  const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.06, 10), m); plate.position.y = 0.03; g.add(plate);
  const jawA = new THREE.Group(), jawB = new THREE.Group(); g.add(jawA); g.add(jawB);
  for (const [J, s] of [[jawA, 1], [jawB, -1]]) {
    const arc = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.025, 5, 16, Math.PI), m); arc.rotation.y = s > 0 ? 0 : Math.PI; J.add(arc);
    for (let i = 1; i < 8; i++) { const a = i / 8 * Math.PI, t = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.09, 4), teeth); t.position.set(Math.cos(a) * 0.4, 0.05, -Math.sin(a) * 0.4 * s); J.add(t); }
    J.position.y = 0.05;
  }
  jawA.rotation.x = -1.35; jawB.rotation.x = 1.35;
  const light = new THREE.Mesh(sph(0.04, 8, 6), mGlow(accent, 6)); light.position.y = 0.09; g.add(light);
  g.userData = { jawA, jawB, light };
  return g;
}
function buildGlaive(glow, s = 1) {
  const g = new THREE.Group(), bronze = mStd(0xb8873a, 0.25, 0.95), steel = mStd(0xd0d6dc, 0.2, 1);
  const r = new THREE.Mesh(new THREE.TorusGeometry(0.2 * s, 0.03 * s, 6, 20), bronze); r.rotation.x = Math.PI / 2; g.add(r);
  for (let i = 0; i < 3; i++) { const a = i / 3 * TAU, b = new THREE.Mesh(extG([[0, 0], [0.22 * s, 0.05 * s], [0.38 * s, -0.12 * s], [0.2 * s, 0], [0, -0.08 * s]], 0.01 * s), steel); b.rotation.set(Math.PI / 2, 0, 0); const h = new THREE.Group(); h.add(b); h.position.set(Math.cos(a) * 0.18 * s, 0, Math.sin(a) * 0.18 * s); h.rotation.y = -a; g.add(h); }
  const c = new THREE.Mesh(new THREE.CylinderGeometry(0.06 * s, 0.06 * s, 0.04 * s, 10), mGlow(glow, 4)); g.add(c);
  return g;
}
function buildWall(teamHex) {
  const g = new THREE.Group(), frame = mStd(0x3a3c42, 0.4, 0.8);
  const panel = new THREE.Mesh(new THREE.PlaneGeometry(5, 3), new THREE.MeshBasicMaterial({ color: hdrCol(teamHex, 0.9), transparent: true, opacity: 0.32, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }));
  panel.position.y = 1.5; g.add(panel);
  const cv = document.createElement('canvas'); cv.width = 128; cv.height = 64; const c = cv.getContext('2d'); c.strokeStyle = 'rgba(255,255,255,0.7)'; c.lineWidth = 2;
  for (let x = 0; x < 9; x++) for (let y = 0; y < 5; y++) { const px = x * 16 + (y % 2) * 8, py = y * 14; c.beginPath(); for (let k = 0; k < 6; k++) { const a = k / 6 * TAU; c.lineTo(px + Math.cos(a) * 7, py + Math.sin(a) * 7); } c.closePath(); c.stroke(); }
  const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(2, 2);
  const hex = new THREE.Mesh(new THREE.PlaneGeometry(5, 3), new THREE.MeshBasicMaterial({ map: t, color: hdrCol(teamHex, 2), transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }));
  hex.position.y = 1.5; g.add(hex);
  for (const x of [-2.55, 2.55]) { const p = new THREE.Mesh(roundBox(0.18, 3.2, 0.3, 0.05), frame); p.position.set(x, 1.6, 0); g.add(p); }
  const base = new THREE.Mesh(roundBox(5.3, 0.16, 0.34, 0.05), frame); base.position.y = 0.08; g.add(base);
  const top = new THREE.Mesh(roundBox(5.1, 0.04, 0.05, 0.01), mGlow(teamHex, 4)); top.position.y = 3.05; g.add(top);
  g.userData = { panel, hex };
  return g;
}
function buildBolt() { const g = new THREE.Group(); const s = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.6, 6), mStd(0x6a5a44, 0.5, 0.2)); s.rotation.x = Math.PI / 2; g.add(s); const h = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.1, 4), mStd(0x8a8f96, 0.3, 0.9)); h.rotation.x = -Math.PI / 2; h.position.z = -0.34; g.add(h); for (const r of [0, Math.PI / 2]) { const f = new THREE.Mesh(new THREE.PlaneGeometry(0.06, 0.1), mStd(0xd8cfb8, 0.8, 0)); f.position.z = 0.26; f.rotation.set(Math.PI / 2, r, 0); g.add(f); } return g; }
function buildShard(glow) { const g = new THREE.Group(); const c = new THREE.Mesh(new THREE.OctahedronGeometry(1, 0), mGlow(glow, 5)); c.scale.set(0.05, 0.05, 0.22); g.add(c); return g; }
function buildMoth(glow) { const g = new THREE.Group(); const b = new THREE.Mesh(new THREE.CapsuleGeometry(0.03, 0.08, 3, 6), mGlow(glow, 1.4)); b.rotation.x = Math.PI / 2; g.add(b); const wm = new THREE.MeshBasicMaterial({ color: hdrCol(0xffe8b0, 1.3), side: THREE.DoubleSide, transparent: true, opacity: 0.85 }); const wings = []; for (const s of [-1, 1]) { const piv = new THREE.Group(); const w = new THREE.Mesh(new THREE.CircleGeometry(0.11, 8), wm); w.position.x = s * 0.1; w.scale.set(1, 0.7, 1); w.rotation.x = Math.PI / 2; piv.add(w); g.add(piv); wings.push(piv); } g.userData.wings = wings; return g; }
function buildFlask(glow) { const g = new THREE.Group(); const b = new THREE.Mesh(sph(0.08, 10, 8), new THREE.MeshStandardMaterial({ color: 0x2a4a2a, roughness: 0.05, metalness: 0.2, transparent: true, opacity: 0.7 })); g.add(b); const in_ = new THREE.Mesh(sph(0.06, 8, 6), mGlow(glow, 3)); g.add(in_); const n = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.025, 0.08, 8), mStd(0x7a5a3a, 0.8, 0)); n.position.y = 0.09; g.add(n); return g; }
function buildHand(glow) { const g = new THREE.Group(); const b = new THREE.Mesh(extG([[0, 0], [0.02, 0.05], [0.01, 0.34], [0, 0.4], [-0.01, 0.34], [-0.02, 0.05]], 0.01), mStd(0xc89a4a, 0.3, 0.9)); b.rotation.x = -Math.PI / 2; b.position.z = 0.2; g.add(b); const c = new THREE.Mesh(extG([[0, 0.05], [0.008, 0.3], [0, 0.36], [-0.008, 0.3]], 0.014, 0.002), mGlow(glow, 4)); c.rotation.x = -Math.PI / 2; c.position.z = 0.2; g.add(c); return g; }
function buildStar(glow) { const g = new THREE.Group(); const c = new THREE.Mesh(new THREE.OctahedronGeometry(0.14, 0), mGlow(glow, 3)); g.add(c); const h = new THREE.Mesh(sph(0.22, 10, 8), new THREE.MeshBasicMaterial({ color: hdrCol(glow, 0.8), transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false })); g.add(h); return g; }
// a gravity well: a dark core, a lensing shell and a ring that shrinks inward (or grows outward when it repels)
function buildWell(r, glow, push) {
  const g = new THREE.Group();
  const core = new THREE.Group(); core.position.y = 1.1; g.add(core);
  core.add(new THREE.Mesh(sph(0.35, 16, 12), new THREE.MeshBasicMaterial({ color: 0x000000 })));
  core.add(new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.05, 8, 32), mGlow(glow, 2.6)));
  const shell = new THREE.Mesh(sph(0.9, 16, 12), new THREE.MeshBasicMaterial({ color: hdrCol(glow, 0.5), transparent: true, opacity: 0.18, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.BackSide })); core.add(shell);
  const disc = new THREE.Mesh(new THREE.RingGeometry(r - 0.12, r, 48), new THREE.MeshBasicMaterial({ color: hdrCol(glow, 1.2), transparent: true, opacity: 0.5, depthWrite: false, side: THREE.DoubleSide, toneMapped: false })); disc.rotation.x = -Math.PI / 2; disc.position.y = 0.06; g.add(disc);
  const ring = new THREE.Mesh(new THREE.RingGeometry(r * 0.9, r, 48), new THREE.MeshBasicMaterial({ color: hdrCol(glow, 0.8), transparent: true, opacity: 0.35, depthWrite: false, side: THREE.DoubleSide, toneMapped: false })); ring.rotation.x = -Math.PI / 2; ring.position.y = 0.07; g.add(ring);
  g.userData = { core, ring };
  return g;
}
function buildNeedle(glow) { const g = new THREE.Group(); const n = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.002, 0.3, 4), mStd(0xe8e8f0, 0.2, 1)); n.rotation.x = Math.PI / 2; g.add(n); const t = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.002, 0.25, 4), new THREE.MeshBasicMaterial({ color: hdrCol(glow, 3), transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false })); t.rotation.x = Math.PI / 2; t.position.z = 0.25; g.add(t); return g; }
function buildLineHead(glow, web) {
  const g = new THREE.Group();
  if (web) { const w = new THREE.Mesh(new THREE.RingGeometry(0.4, 3.5, 24, 3), new THREE.MeshBasicMaterial({ color: hdrCol(glow, 1.5), wireframe: true, transparent: true, opacity: 0.8 })); g.add(w); return g; }
  const h = new THREE.Mesh(new THREE.TorusGeometry(0.08, 0.012, 6, 14, Math.PI * 1.5), mStd(0xc0b8a8, 0.3, 0.9)); g.add(h); const c = new THREE.Mesh(sph(0.04, 8, 6), mGlow(glow, 5)); g.add(c); return g;
}
function makeThread(glow) {
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0, 0, 0], 3));
  const obj = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: hdrCol(glow, 3) })); obj.frustumCulled = false; G.scene.add(obj);
  return { obj, set(a, b) { const p = geo.attributes.position; p.setXYZ(0, a.x, a.y, a.z); p.setXYZ(1, b.x, b.y, b.z); p.needsUpdate = true; } };
}
function buildLantern(glow) {
  const g = new THREE.Group(), br = mStd(0xa88a4a, 0.3, 0.9), dk = mStd(0x2a2420, 0.6, 0.4);
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.05, 1.6, 8), dk); pole.position.y = 0.8; g.add(pole);
  const arm = new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.02, 6, 12, Math.PI), dk); arm.position.set(0.18, 1.6, 0); g.add(arm);
  const cage = new THREE.Group(); cage.position.set(0.36, 1.36, 0); g.add(cage);
  const top = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.12, 6), br); top.position.y = 0.2; cage.add(top);
  const bot = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.04, 6), br); bot.position.y = -0.16; cage.add(bot);
  for (let i = 0; i < 6; i++) { const a = i / 6 * TAU, b = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.34, 4), br); b.position.set(Math.cos(a) * 0.1, 0, Math.sin(a) * 0.1); cage.add(b); }
  const glass = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.3, 6), new THREE.MeshBasicMaterial({ color: hdrCol(glow, 0.6), transparent: true, opacity: 0.35, depthWrite: false })); cage.add(glass);
  const flame = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.14, 8), mGlow(glow, 2.6)); cage.add(flame);
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.25, 0.06, 10), dk); base.position.y = 0.03; g.add(base);
  g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  g.userData = { flame };
  return g;
}
function buildLightPool(r) {
  // a soft warm wash with a clear rim: normal blending, so overlapping pools don't add up into a white-out
  const cv = document.createElement('canvas'); cv.width = cv.height = 128; const c = cv.getContext('2d'), gr = c.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, 'rgba(255,214,140,0.16)'); gr.addColorStop(0.8, 'rgba(255,200,120,0.08)'); gr.addColorStop(0.93, 'rgba(255,205,130,0.38)'); gr.addColorStop(0.97, 'rgba(255,205,130,0.12)'); gr.addColorStop(1, 'rgba(255,200,120,0)'); c.fillStyle = gr; c.fillRect(0, 0, 128, 128);
  const m = new THREE.Mesh(new THREE.CircleGeometry(r, 40), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(cv), color: 0xffffff, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, toneMapped: false }));
  m.rotation.x = -Math.PI / 2; m.renderOrder = 2; const g = new THREE.Group(); m.position.y = 0.05; g.add(m); return g;
}
function buildZoneDisk(kind, r) {
  const cv = document.createElement('canvas'); cv.width = cv.height = 128; const c = cv.getContext('2d');
  const col = kind === 'fire' ? [255, 120, 30] : kind === 'bog' ? [80, 140, 40] : [150, 255, 90];
  const gr = c.createRadialGradient(64, 64, 0, 64, 64, 64); gr.addColorStop(0, `rgba(${col},0.9)`); gr.addColorStop(0.8, `rgba(${col},0.55)`); gr.addColorStop(1, `rgba(${col},0)`);
  c.fillStyle = gr; c.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 40; i++) { c.fillStyle = `rgba(${col.map(v => Math.min(255, v + 60))},${rand(0.2, 0.6)})`; c.beginPath(); c.arc(rand(20, 108), rand(20, 108), rand(2, 8), 0, TAU); c.fill(); }
  const k = kind === 'fire' ? 2.2 : 1.4;
  const m = new THREE.Mesh(new THREE.CircleGeometry(r, 32), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(cv), color: new THREE.Color(k, k, k), transparent: true, opacity: 0.6, depthWrite: false, blending: kind === 'fire' ? THREE.AdditiveBlending : THREE.NormalBlending, polygonOffset: true, polygonOffsetFactor: -3 }));
  m.rotation.x = -Math.PI / 2; return m;
}

// remove every hero model in the scene that no longer belongs to anything (showcase leftovers, stale decoys)
function scrubHeroes(keep = []) {
  for (const o of [...G.scene.children]) if (o.userData && o.userData.hero && !keep.includes(o)) G.scene.remove(o);
}
