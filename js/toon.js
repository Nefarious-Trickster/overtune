'use strict';
// ============================================================================
// The toy-box look: candy-coloured surfaces with soft rounded edges, a bright sky full of puffy clouds,
// KayKit trees, rocks and buildings, floating islands on the horizon, and cartoon effects — puffs, stars, confetti.
// ============================================================================
const TOON = {
  // surface → base colour, second colour, pattern, pattern count, roughness
  concrete: [0xdcd4f4, 0xc8bfec, 'tiles', 2], asphalt: [0x6268b8, 0xfff07a, 'road', 1], brick: [0xff9a8e, 0xffe6d8, 'bricks', 6],
  steel: [0x94ccff, 0x74b0f4, 'panels', 2], iron: [0x7468d4, 0x5e52bc, 'panels', 2], tank: [0x74e4c0, 0x52cca6, 'bands', 3],
  crane: [0xffd23a, 0x6a5ed8, 'hazard', 4], shedwall: [0xa4aeff, 0x8a96f4, 'panels', 3],
  container: [0xff6a84, 0xe8506c, 'ridges', 10], container2: [0x4ab0ff, 0x3494ec, 'ridges', 10], container3: [0x56d890, 0x3cc078, 'ridges', 10],
  roof: [0x9474ee, 0x7e5ee0, 'ridges', 6], shed: [0x56cede, 0x40b8c8, 'ridges', 8], rail: [0xffd23a, 0xffd23a, 'plain', 1],
  stack: [0xff7e62, 0xfff4ec, 'hstripes', 3], crate: [0xffb862, 0xe68e40, 'crate', 1], barrier: [0xfff8f4, 0xff6a98, 'diag', 4],
  stairs: [0xfff2dc, 0xff9cc4, 'stairs', 6], flagstone: [0xffe0a8, 0xf4cc90, 'tiles', 3], flag2: [0xfff2cc, 0xf6e0b0, 'tiles', 2],
  temple: [0xffdc96, 0xf6c478, 'blocks', 4], ruin: [0xf0d4a4, 0xe0bc8c, 'blocks', 4], roofstone: [0xffa070, 0xec8458, 'tiles', 3],
  stepstone: [0xffe6ac, 0xf2d090, 'blocks', 2], pillar: [0xfff6e4, 0xf0dcc0, 'flutes', 6], hedge: [0x62dc72, 0x44c25c, 'dots', 5],
  plank: [0xffb878, 0xe89458, 'planks', 5], darkwood: [0xc47c52, 0xa6643e, 'planks', 3], thatch: [0xffd468, 0xf0bc48, 'hstripes', 6],
  mud: [0x84d29c, 0x6ec088, 'dots', 4], snow: [0xf6faff, 0xe2eeff, 'dots', 3], ice: [0xaaeaff, 0x88daff, 'plain', 1],
  granite: [0xb6bcec, 0x9ea6de, 'blocks', 3], frostwall: [0xd6e4ff, 0xbccff8, 'blocks', 4], mossstone: [0x92d47e, 0x74bc64, 'blocks', 4],
  copper: [0x62dccc, 0x46c4b4, 'panels', 3],
};
function makeToonSurfaces() {
  const S = 256;
  for (const key in TOON) {
    if (!SURF[key]) continue;
    const [c1, c2, pat, n] = TOON[key], A = hexRGB(c1), B = hexRGB(c2), old = SURF[key];
    const h = new Float32Array(S * S), mix = new Float32Array(S * S);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const u = x / S, v = y / S, i = y * S + x; let hh = 1, m = 0;
      // soft rounded grooves: 1 in the middle of a cell, falling to 0 in the joint
      const groove = (f, w) => smoothstep(0, w, Math.min(f, 1 - f));
      if (pat === 'tiles') { const fu = (u * n) % 1, fv = (v * n) % 1; hh = Math.min(groove(fu, 0.06), groove(fv, 0.06)); m = ((Math.floor(u * n) + Math.floor(v * n)) % 2) * 0.55; }
      else if (pat === 'bricks') { const row = Math.floor(v * n), fu = (u * n / 2 + (row % 2) * 0.5) % 1, fv = (v * n) % 1; hh = Math.min(groove(fu, 0.05), groove(fv, 0.09)); m = hh < 0.5 ? 1 : 0; }
      else if (pat === 'blocks') { const row = Math.floor(v * n), fu = (u * n / 1.6 + (row % 2) * 0.37) % 1, fv = (v * n) % 1; hh = Math.min(groove(fu, 0.05), groove(fv, 0.07)); m = ((row * 7 + Math.floor(u * n / 1.6 + (row % 2) * 0.37)) % 3 === 0) ? 0.5 : 0; }
      else if (pat === 'panels') { const fu = (u * n) % 1, fv = (v * n / 2) % 1; hh = Math.min(groove(fu, 0.03), groove(fv, 0.03)); const r = (Math.abs(fu - 0.08) < 0.025 || Math.abs(fu - 0.92) < 0.025) && Math.abs(((v * n * 2) % 1) - 0.5) < 0.05; if (r) hh = 1.2; m = (Math.floor(u * n) % 2) * 0.4; }
      else if (pat === 'ridges') { const f = (u * n) % 1; hh = 0.5 + 0.5 * Math.cos(f * TAU); m = f > 0.5 ? 0.6 : 0; }
      else if (pat === 'hstripes') { const f = (v * n) % 1; m = f < 0.5 ? 1 : 0; hh = groove(f, 0.03) * 0.3 + 0.7; }
      else if (pat === 'bands') { const f = (v * n) % 1; m = f < 0.15 ? 1 : 0; hh = f < 0.15 ? 1.1 : 1; }
      else if (pat === 'hazard') { const f = ((u + v) * n) % 1; m = f < 0.5 && (v < 0.18 || v > 0.82) ? 1 : 0; hh = 1; }
      else if (pat === 'diag') { const f = ((u + v) * n) % 1; m = v > 0.6 && v < 0.9 && f < 0.5 ? 1 : 0; hh = 1; }
      else if (pat === 'stairs') { const f = (u * n) % 1; m = f < 0.12 ? 1 : 0; hh = groove(f, 0.04); }
      else if (pat === 'planks') { const row = Math.floor(v * n), fv = (v * n) % 1, fu = (u * 1.5 + row * 0.37) % 1; hh = Math.min(groove(fv, 0.06), groove(fu, 0.015)); m = row % 2 ? 0.45 : 0; }
      else if (pat === 'crate') { const e = Math.min(u, 1 - u, v, 1 - v); m = e < 0.1 ? 1 : 0; hh = e < 0.1 ? 1.15 : 0.9 + groove((v * 4) % 1, 0.05) * 0.1; if (Math.abs(u - v) < 0.06 || Math.abs(u + v - 1) < 0.06) { m = 1; hh = 1.1; } }
      else if (pat === 'flutes') { const f = (u * n) % 1; hh = 0.6 + 0.4 * Math.sin(f * Math.PI); m = 0; }
      else if (pat === 'dots') { const cu = (u * n) % 1 - 0.5, cv = ((v * n + (Math.floor(u * n) % 2) * 0.5) % 1) - 0.5, r = Math.sqrt(cu * cu + cv * cv); m = r < 0.22 ? 1 : 0; hh = r < 0.22 ? 1.08 : 1; }
      else if (pat === 'road') { const f = (u * 2) % 1; m = Math.abs(f - 0.5) < 0.02 && (v * 3) % 1 < 0.55 ? 1 : 0; hh = 1; }
      h[i] = hh; mix[i] = m;
    }
    const t = texFrom(S, (x, y, i) => { const c = mixc(A, B, mix[i]); return mulc(c, 0.84 + h[i] * 0.16); }, h, { bump: 2.2 });
    const m = new THREE.MeshStandardMaterial({ map: t.map, normalMap: t.normal, roughness: key === 'ice' ? 0.2 : 0.62, metalness: 0, envMapIntensity: 0.25 });
    m.normalScale = new THREE.Vector2(0.8, 0.8);
    if (old.alphaTest) { m.alphaTest = old.alphaTest; m.side = old.side; }
    m.userData.scale = (old.userData.scale || 2) * (pat === 'ridges' ? 1 : 1.25);
    SURF[key] = m;
  }
  // the see-through grating keeps its holes, in sunny yellow
  if (SURF.grate) { const g = SURF.grate; g.color = new THREE.Color(0xffc24a); g.metalness = 0; g.roughness = 0.6; g.envMapIntensity = 0.2; }
}
function smoothstep(a, b, x) { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); }

// ---------------------------------------------------------------- rounded blocks: every box gets a soft bevel, like a toy
function roundBoxGeo(s) {
  const w = s.x1 - s.x0, h = s.y1 - s.y0, d = s.z1 - s.z0, r = Math.min(0.24, Math.min(w, h, d) * 0.22);
  if (r < 0.03) return boxGeo(s);
  const g = new THREE.BoxGeometry(1, 1, 1, 3, 3, 3), p = g.attributes.position, n = g.attributes.normal, hx = w / 2, hy = h / 2, hz = d / 2;
  const map = (u, H) => { const k = Math.round((u + 0.5) * 3); return k <= 0 ? -H : k === 1 ? -H + r : k === 2 ? H - r : H; };
  for (let i = 0; i < p.count; i++) {
    const x = map(p.getX(i), hx), y = map(p.getY(i), hy), z = map(p.getZ(i), hz);
    const ix = clamp(x, -hx + r, hx - r), iy = clamp(y, -hy + r, hy - r), iz = clamp(z, -hz + r, hz - r);
    let dx = x - ix, dy = y - iy, dz = z - iz; const L = Math.hypot(dx, dy, dz);
    if (L > 1e-6) { dx /= L; dy /= L; dz /= L; p.setXYZ(i, ix + dx * r, iy + dy * r, iz + dz * r); n.setXYZ(i, dx, dy, dz); }
    else p.setXYZ(i, x, y, z);
  }
  const ni = g.toNonIndexed(); g.dispose();
  ni.translate((s.x0 + s.x1) / 2, (s.y0 + s.y1) / 2, (s.z0 + s.z1) / 2);
  return ni;
}
function roundInset(s) { return Math.min(0.24, Math.min(s.x1 - s.x0, s.y1 - s.y0, s.z1 - s.z0) * 0.22); }

// ---------------------------------------------------------------- the sky and the light, map by map
const TOON_SKIES = {
  candy: { top: 0x6a7cff, hor: 0xffb4c8, bot: 0xffd6c0, sunCol: 0xffe2b0, stars: 0, cloud: 0.9, cloudCol: 0xfff4fa, grade: [1.04, 1.0, 1.0] },
  bright: { top: 0x3c9cff, hor: 0xbfeaff, bot: 0x9ad87a, sunCol: 0xfff6dc, stars: 0, cloud: 0.85, cloudCol: 0xffffff, grade: [1.02, 1.02, 1.0] },
  party: { top: 0x3a2a9a, hor: 0xff7ad0, bot: 0x5a3aa8, sunCol: 0xffc0f0, stars: 0.35, cloud: 0.7, cloudCol: 0xd0a8ff, grade: [1.02, 0.98, 1.06] },
  lagoon: { top: 0x4a8cf0, hor: 0xb8f4e0, bot: 0x6ac8a8, sunCol: 0xfff0c0, stars: 0, cloud: 0.85, cloudCol: 0xfffaf0, grade: [1.0, 1.03, 1.0] },
  icy: { top: 0x4aa8ff, hor: 0xe6f6ff, bot: 0xd8eaff, sunCol: 0xfff8e8, stars: 0, cloud: 0.8, cloudCol: 0xffffff, grade: [1.0, 1.0, 1.04] },
};
Object.assign(SKIES, TOON_SKIES);
const TOON_THEME = {
  kiln: { sky: 'candy', fog: [0xf4c4d4, 0.0018], sun: [0xffe6c0, 2.0], sunDir: [-0.5, 0.6, -0.55], hemi: [0xb0a8ff, 0xff9a80, 0.6], exposure: 0.8 },
  verdance: { sky: 'bright', fog: [0xb4e0ff, 0.0016], sun: [0xfff4dc, 2.1], sunDir: [0.45, 0.68, 0.38], hemi: [0x9ccaff, 0x80c060, 0.55], exposure: 0.72 },
  quay: { sky: 'party', fog: [0x7a4ac8, 0.0035], sun: [0xe8c8ff, 1.5], sunDir: [0.3, 0.75, -0.4], hemi: [0x9a80ff, 0x5a2a8a, 0.75], exposure: 0.95, rain: false },
  hollowmere: { sky: 'lagoon', fog: [0xa8e8d4, 0.0026], sun: [0xfff0c8, 2.0], sunDir: [0.6, 0.58, 0.5], hemi: [0xa0e4ff, 0x6ab080, 0.6], exposure: 0.8 },
  frostwatch: { sky: 'icy', fog: [0xd0e6ff, 0.0022], sun: [0xfffaf0, 1.9], sunDir: [-0.4, 0.62, 0.55], hemi: [0xc4dcff, 0xa0b4e0, 0.6], exposure: 0.74 },
};
for (const k in TOON_THEME) if (MAPS[k]) { Object.assign(MAPS[k].theme, TOON_THEME[k]); if (TOON_THEME[k].rain === false) MAPS[k].theme.rain = false; }
// puffy, hard-edged cartoon clouds in place of wispy ones
{
  window.SKY_FRAG_T = SKY_FRAG.replace('float cov = smoothstep(0.42, 0.8, c) * uCloud * smoothstep(0.0, 0.25, y);', 'float cov = smoothstep(0.5, 0.53, c) * uCloud * smoothstep(0.02, 0.2, y);')
    .replace('vec3 cc = uCloudCol * (0.75 + 0.5 * fbm(vec3(uv * 2.6, 3.0))) + uSunCol * pow(sd, 6.0) * 0.6;', 'float sh = smoothstep(0.5, 0.75, fbm(vec3(uv * 1.3 + vec2(uTime * 0.006, 0.0) + vec2(0.06, 0.06), uTime * 0.01))); vec3 cc = uCloudCol * mix(1.05, 0.82, sh) + uSunCol * pow(sd, 6.0) * 0.3;');
}

// ---------------------------------------------------------------- set dressing from the packs
const _origProps = Object.assign({}, Props);
const TP = {
  // a KayKit model standing on the ground (or a fallback)
  put(L, name, x, y, z, o = {}) { const m = Env.place(name, x, y, z, Object.assign({ yaw: rand(0, TAU) }, o)); if (m) L.add(m); return m; },
};
Object.assign(Props, {
  tree(p, L, def) { if (!Env.ready) return _origProps.tree(p, L, def); TP.put(L, pick(['tree_single_A', 'tree_single_B', 'trees_A_medium']), p.x, p.y || 0, p.z, { h: 7.5 * (p.s || 1) }); },
  bush(p, L, def) { if (!Env.ready) return _origProps.bush(p, L, def); TP.put(L, 'bush', p.x, p.y || 0, p.z, { h: 1.1 }); },
  pine(p, L, def) { if (!Env.ready) return _origProps.pine(p, L, def); TP.put(L, pick(['trees_B_medium', 'trees_B_large']), p.x, p.y || 0, p.z, { h: 7.5 * (p.s || 1) }); },
  deadtree(p, L, def) { if (!Env.ready) return _origProps.deadtree(p, L, def); TP.put(L, pick(['tree_dead_large', 'tree_pine_orange_medium', 'tree_pine_yellow_medium', 'tree_pine_orange_large']), p.x, p.y || 0, p.z, { h: 7 * (p.s || 1) }); },
  reeds(p, L, def) { if (!Env.ready) return _origProps.reeds(p, L, def); for (let i = 0; i < 4; i++) TP.put(L, pick(['waterplant_A', 'waterplant_B']), p.x + rand(-1.3, 1.3), 0, p.z + rand(-1.3, 1.3), { h: rand(0.8, 1.4) }); for (let i = 0; i < 2; i++) TP.put(L, pick(['waterlily_A', 'waterlily_B']), p.x + rand(-2, 2), 0.05, p.z + rand(-2, 2), { s: 0.9 }); },
  barrel(p, L, def) { if (!Env.ready) return _origProps.barrel(p, L, def); TP.put(L, 'Barrel_A', p.x, 0, p.z, { h: 1.0 }); },
  skyline(p, L, def) { /* replaced by the horizon below */ },
  rain() { /* party lights instead of rain */ },
  puddle(p, L) { const m = new THREE.Mesh(new THREE.CircleGeometry(p.s, 24), new THREE.MeshStandardMaterial({ color: 0x8ad8ff, roughness: 0.1, metalness: 0, transparent: true, opacity: 0.75, depthWrite: false })); m.rotation.x = -Math.PI / 2; m.scale.y = 0.6; m.position.set(p.x, 0.012, p.z); L.add(m); },
  water(p, L, def) {
    const B = def.bounds, mat = new THREE.MeshStandardMaterial({ color: 0x38c8f0, roughness: 0.15, metalness: 0, envMapIntensity: 0.6 });
    for (const s of [1, -1]) { const m = new THREE.Mesh(new THREE.PlaneGeometry(400, 160), mat); m.rotation.x = -Math.PI / 2; m.position.set(0, -1.6, s * (B.z1 + 80.5)); L.add(m); const edge = new THREE.Mesh(roundBoxGeo({ x0: B.x0 - 2, x1: B.x1 + 2, y0: -1.6, y1: 0, z0: s * (B.z1 + 0.5) - 0.5, z1: s * (B.z1 + 0.5) + 0.5 }), SURF.concrete); worldUV(edge.geometry, SURF.concrete.userData.scale); L.add(edge); }
    toonWaves(L, B);
  },
  bog(p, L, def) {
    const B = def.bounds, cv = document.createElement('canvas'); cv.width = cv.height = 256; const c = cv.getContext('2d');
    c.fillStyle = '#4ad0c0'; c.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 70; i++) { c.fillStyle = `rgba(255,255,255,${rand(0.15, 0.4)})`; c.beginPath(); c.ellipse(rand(0, 256), rand(0, 256), rand(6, 22), rand(2, 5), rand(0, 3), 0, TAU); c.fill(); }
    const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set((B.x1 - B.x0) / 12, (B.z1 - B.z0) / 12); t.encoding = THREE.sRGBEncoding;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(B.x1 - B.x0 + 40, B.z1 - B.z0 + 40), new THREE.MeshStandardMaterial({ map: t, roughness: 0.15, metalness: 0, transparent: true, opacity: 0.86, depthWrite: false }));
    m.rotation.x = -Math.PI / 2; m.position.y = 0.04; m.receiveShadow = true; m.renderOrder = -1; L.add(dyn(m));
    G.anim.push(tm => { t.offset.set(tm * 0.01, tm * 0.006); });
    if (Env.ready) for (let i = 0; i < 40; i++) { const x = rand(B.x0 + 4, B.x1 - 4), z = rand(B.z0 + 4, B.z1 - 4); if (World.groundAt(x, z, 5) > 0.1 || nearSolid(x, z, 1.5)) continue; TP.put(L, pick(['waterlily_A', 'waterlily_B']), x, 0.05, z, { s: rand(0.7, 1.2), noShadow: true }); }
  },
});
function nearSolid(x, z, r) { for (const s of World.solids) if (x > s.x0 - r && x < s.x1 + r && z > s.z0 - r && z < s.z1 + r && s.y0 < 3) return true; return false; }
function toonWaves(L, B) {
  // white foam lines rolling toward the quay
  const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.7, depthWrite: false });
  for (const s of [1, -1]) for (let i = 0; i < 4; i++) { const w = dyn(new THREE.Mesh(new THREE.PlaneGeometry(B.x1 - B.x0, 0.35), mat)); w.rotation.x = -Math.PI / 2; L.add(w); G.anim.push(t => { const f = (t * 0.08 + i / 4) % 1; w.position.set(0, -1.58, s * (B.z1 + 2 + (1 - f) * 30)); w.material.opacity = 0.7; }); }
}

// ---------------------------------------------------------------- the horizon: floating islands, cloud banks, a little town, bunting
function toonDress(def, L) {
  const B = def.bounds, rng = mulberry(def.key.length * 131 + 7), key = def.key, cx = (B.x0 + B.x1) / 2, cz = (B.z0 + B.z1) / 2, R0 = Math.max(B.x1 - B.x0, B.z1 - B.z0) * 0.62;
  // big puffy clouds drifting round the arena
  if (Env.ready) {
    const clouds = [];
    for (let i = 0; i < 26; i++) {
      const a = rng() * TAU, r = R0 + 40 + rng() * 120, y = 28 + rng() * 40;
      const m = Env.place(rng() < 0.6 ? 'cloud_big' : 'cloud_small', cx + Math.cos(a) * r, y, cz + Math.sin(a) * r, { s: 6 + rng() * 9, yaw: rng() * TAU, noShadow: true });
      m.traverse(o => { if (o.isMesh) { o.material = toonCloudMat(key); o.castShadow = false; o.receiveShadow = false; } });
      dyn(m); L.add(m); clouds.push({ m, a, r, y, sp: 0.004 + rng() * 0.006 });
    }
    G.anim.push(t => { for (const c of clouds) { const a = c.a + t * c.sp; c.m.position.x = cx + Math.cos(a) * c.r; c.m.position.z = cz + Math.sin(a) * c.r; c.m.position.y = c.y + Math.sin(t * 0.2 + c.a) * 1.5; } });
    // floating islands and hills beyond the walls
    const isl = key === 'frostwatch' ? ['mountain_A', 'mountain_B_grass_trees', 'mountain_C_grass_trees'] : key === 'hollowmere' ? ['hills_A_trees', 'hills_B_trees', 'hills_C_trees'] : ['hills_A_trees', 'hills_B_trees', 'hills_C_trees', 'mountain_A_grass_trees', 'mountain_B_grass_trees'];
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * TAU + rng() * 0.3, r = R0 + 70 + rng() * 90, x = cx + Math.cos(a) * r * 1.15, z = cz + Math.sin(a) * r;
      const s = 7 + rng() * 9, y = -6 + rng() * 22;
      const m = Env.place(pick(isl), x, y, z, { s, yaw: rng() * TAU, noShadow: true });
      if (key === 'frostwatch') m.traverse(o => { if (o.isMesh) { o.material = o.material.clone(); o.material.color.set(0xeef4ff); } });
      L.add(m);
      // the underside of a floating island: a rocky cone
      if (y > 2) { const b = m.userData; void b; const cone = new THREE.Mesh(new THREE.ConeGeometry(s * 0.85, s * 1.6, 7), new THREE.MeshStandardMaterial({ color: key === 'frostwatch' ? 0xa8b8e0 : 0xb08a6a, roughness: 0.9, flatShading: true })); cone.rotation.x = Math.PI; cone.position.set(x, y - s * 0.8, z); L.add(cone); }
    }
    // a little town for the foundry and the port
    if (key === 'kiln' || key === 'quay') {
      const bld = ['building_A', 'building_B', 'building_C', 'building_D', 'building_E', 'building_F', 'building_G', 'building_H'];
      for (let i = 0; i < 30; i++) {
        const a = rng() * TAU, r = R0 + 22 + rng() * 40, x = cx + Math.cos(a) * r * 1.2, z = cz + Math.sin(a) * r;
        if (x > B.x0 - 8 && x < B.x1 + 8 && z > B.z0 - 8 && z < B.z1 + 8) continue;
        TP.put(L, pick(bld), x, key === 'quay' ? -1.6 : 0, z, { h: 14 + rng() * 22, yaw: Math.atan2(cx - x, cz - z) + Math.round(rng() * 4) * Math.PI / 2, noShadow: true });
      }
      if (key === 'kiln') { TP.put(L, 'watertower', B.x0 - 18, 0, B.z1 + 14, { h: 22, noShadow: true }); TP.put(L, 'building_windmill_red', B.x1 + 24, 0, B.z0 - 10, { h: 26, noShadow: true }); }
    }
    if (key === 'verdance') { for (let i = 0; i < 40; i++) { const a = rng() * TAU, r = R0 + 6 + rng() * 30, x = cx + Math.cos(a) * r * 1.2, z = cz + Math.sin(a) * r; if (x > B.x0 - 3 && x < B.x1 + 3 && z > B.z0 - 3 && z < B.z1 + 3) continue; TP.put(L, pick(['trees_A_medium', 'tree_single_A', 'tree_single_B', 'trees_A_small']), x, 0, z, { h: 9 + rng() * 8, noShadow: true }); } TP.put(L, 'building_castle_red', B.x1 + 40, 0, cz + 30, { h: 30, noShadow: true }); }
    if (key === 'hollowmere') { for (let i = 0; i < 40; i++) { const a = rng() * TAU, r = R0 + 6 + rng() * 30, x = cx + Math.cos(a) * r * 1.2, z = cz + Math.sin(a) * r; if (x > B.x0 - 3 && x < B.x1 + 3 && z > B.z0 - 3 && z < B.z1 + 3) continue; TP.put(L, pick(['tree_dead_large', 'tree_pine_orange_large', 'tree_pine_yellow_large', 'trees_B_medium']), x, 0, z, { h: 9 + rng() * 8, noShadow: true }); } TP.put(L, 'building_watermill_blue', B.x0 - 26, 0, cz - 20, { h: 18, noShadow: true }); }
    if (key === 'frostwatch') { for (let i = 0; i < 46; i++) { const a = rng() * TAU, r = R0 + 6 + rng() * 34, x = cx + Math.cos(a) * r * 1.2, z = cz + Math.sin(a) * r; if (x > B.x0 - 3 && x < B.x1 + 3 && z > B.z0 - 3 && z < B.z1 + 3) continue; TP.put(L, pick(['trees_B_large', 'trees_B_medium']), x, 0, z, { h: 9 + rng() * 9, noShadow: true }); } }
  }
  // bunting: strings of bright pennants over the walls of the arena
  toonBunting(def, L, rng);
}
const _cloudMats = {};
function toonCloudMat(key) { const c = key === 'quay' ? 0xd8b8ff : key === 'kiln' ? 0xfff0f4 : 0xffffff; return _cloudMats[c] || (_cloudMats[c] = new THREE.MeshStandardMaterial({ color: c, emissive: new THREE.Color(c).multiplyScalar(0.35), roughness: 1, flatShading: false, fog: false })); }
function toonBunting(def, L, rng) {
  const cols = [0xff5a8a, 0xffd23a, 0x4ab0ff, 0x6ae07a, 0xb07aff, 0xff9a3a], pos = [], col = [];
  const tall = World.solids.filter(s => s.y1 - s.y0 > 5 && s.vis && (s.x1 - s.x0 > 20 || s.z1 - s.z0 > 20));
  const line = (a, b, sag) => {
    const len = a.distanceTo(b), n = Math.floor(len / 0.9);
    for (let i = 0; i < n; i++) {
      const f0 = i / n, f1 = (i + 0.6) / n, p0 = a.clone().lerp(b, f0), p1 = a.clone().lerp(b, f1); p0.y -= Math.sin(f0 * Math.PI) * sag; p1.y -= Math.sin(f1 * Math.PI) * sag;
      const mid = p0.clone().lerp(p1, 0.5); mid.y -= 0.55; const c = new THREE.Color(cols[i % cols.length]);
      pos.push(p0.x, p0.y, p0.z, p1.x, p1.y, p1.z, mid.x, mid.y, mid.z); for (let k = 0; k < 3; k++) col.push(c.r, c.g, c.b);
    }
  };
  for (const s of tall.slice(0, 12)) {
    const y = s.y1 + 0.05, alongX = s.x1 - s.x0 > s.z1 - s.z0, L0 = alongX ? s.x1 - s.x0 : s.z1 - s.z0, n = Math.max(1, Math.floor(L0 / 14));
    for (let k = 0; k < n; k++) {
      const u0 = k / n, u1 = (k + 1) / n;
      const a = alongX ? new V3(lerp(s.x0, s.x1, u0), y, (s.z0 + s.z1) / 2) : new V3((s.x0 + s.x1) / 2, y, lerp(s.z0, s.z1, u0));
      const b = alongX ? new V3(lerp(s.x0, s.x1, u1), y, (s.z0 + s.z1) / 2) : new V3((s.x0 + s.x1) / 2, y, lerp(s.z0, s.z1, u1));
      line(a, b, 1.4);
      // a little pole at each end so the string has something to hang from
      for (const q of [a, b]) { const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.2, 6), SURF.rail); pole.position.set(q.x, q.y + 0.6 - 0.05, q.z); L.add(pole); }
    }
  }
  if (!pos.length) return;
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.computeVertexNormals();
  const uv = new Float32Array(pos.length / 3 * 2); g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  const m = dyn(new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.8 }))); m.castShadow = true; L.add(m);
  // the string itself
  const sp = []; for (let i = 0; i < pos.length; i += 9) sp.push(pos[i], pos[i + 1], pos[i + 2], pos[i + 3], pos[i + 4], pos[i + 5]);
  const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3)); L.add(dyn(new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: 0xffffff }))));
}

// ---------------------------------------------------------------- cartoon effects
const ToonFx = {
  balls: [], stars: [], conf: null,
  init() {
    const grad = new THREE.DataTexture(new Uint8Array([90, 90, 90, 255, 180, 180, 180, 255, 255, 255, 255, 255]), 3, 1); grad.minFilter = grad.magFilter = THREE.NearestFilter; grad.needsUpdate = true;
    const geo = new THREE.IcosahedronGeometry(1, 2);
    for (let i = 0; i < 40; i++) { const m = new THREE.Mesh(geo, new THREE.MeshToonMaterial({ color: 0xffffff, gradientMap: grad, transparent: true })); m.visible = false; m.frustumCulled = false; G.scene.add(m); this.balls.push({ m, t: 1, life: 0 }); }
    const sg = new THREE.ShapeGeometry((() => { const s = new THREE.Shape(); for (let i = 0; i < 10; i++) { const a = i / 10 * TAU - Math.PI / 2, r = i % 2 ? 0.42 : 1; i ? s.lineTo(Math.cos(a) * r, Math.sin(a) * r) : s.moveTo(Math.cos(a) * r, Math.sin(a) * r); } return s; })());
    for (let i = 0; i < 24; i++) { const m = new THREE.Mesh(sg, new THREE.MeshBasicMaterial({ color: 0xffe14a, transparent: true, depthWrite: false, side: THREE.DoubleSide, toneMapped: false })); m.visible = false; m.frustumCulled = false; m.renderOrder = 6; G.scene.add(m); this.stars.push({ m, t: 1, life: 0 }); }
    // confetti: little squares that tumble and flutter down
    const N = 900, g = new THREE.BufferGeometry(), pos = new Float32Array(N * 3), col = new Float32Array(N * 3), rot = new Float32Array(N);
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage)); g.setAttribute('color', new THREE.BufferAttribute(col, 3).setUsage(THREE.DynamicDrawUsage)); g.setAttribute('rot', new THREE.BufferAttribute(rot, 1).setUsage(THREE.DynamicDrawUsage));
    const mat = new THREE.ShaderMaterial({ uniforms: { uScale: { value: 600 } }, transparent: false,
      vertexShader: 'attribute vec3 color; attribute float rot; varying vec3 vC; varying float vR; uniform float uScale; void main(){ vC = color; vR = rot; vec4 mv = modelViewMatrix * vec4(position,1.0); gl_PointSize = 0.13 * uScale / max(0.1, -mv.z); gl_Position = projectionMatrix * mv; }',
      fragmentShader: 'varying vec3 vC; varying float vR; void main(){ vec2 d = gl_PointCoord - 0.5; float c = cos(vR), s = sin(vR); vec2 q = vec2(c*d.x - s*d.y, s*d.x + c*d.y); if (abs(q.x) > 0.42 || abs(q.y) > 0.42 * abs(cos(vR*1.7)) + 0.06) discard; gl_FragColor = vec4(vC, 1.0); }' });
    const obj = new THREE.Points(g, mat); obj.frustumCulled = false; G.scene.add(obj);
    this.conf = { obj, g, pos, col, rot, N, p: [] };
  },
  // a cartoon cloud of round puffs that swell and then pop away
  pop(pos, r, hex = 0xffffff, n = 6, life = 0.5) {
    const c = new THREE.Color(hex);
    for (let i = 0; i < n; i++) {
      const B = this.balls.find(b => b.t >= b.life) || this.balls[0];
      const o = new V3(rand(-1, 1), rand(-0.4, 1), rand(-1, 1)).normalize().multiplyScalar(r * rand(0.2, 0.7));
      B.m.position.copy(pos).add(o); B.v = o.clone().multiplyScalar(rand(1.5, 3)); B.v.y += r * 0.8;
      B.m.material.color.copy(c).lerp(new THREE.Color(0xffffff), rand(0, 0.3)); B.m.material.opacity = 1; B.m.visible = true; B.t = 0; B.life = life * rand(0.8, 1.3); B.r = r * rand(0.35, 0.65);
    }
  },
  star(pos, size, hex = 0xffe14a, life = 0.28) {
    const S = this.stars.find(b => b.t >= b.life) || this.stars[0];
    S.m.position.copy(pos); S.m.material.color.set(hex); S.m.visible = true; S.t = 0; S.life = life; S.s = size; S.spin = rand(-4, 4);
  },
  confetti(pos, n = 70, spread = 4) {
    const cols = [0xff5a8a, 0xffd23a, 0x4ab0ff, 0x6ae07a, 0xb07aff, 0xff9a3a, 0xffffff].map(h => new THREE.Color(h));
    for (let i = 0; i < n; i++) { const C = this.conf; if (C.p.length >= C.N) C.p.shift(); const a = rand(0, TAU), v = rand(1, spread); C.p.push({ x: pos.x, y: pos.y, z: pos.z, vx: Math.cos(a) * v, vy: rand(3, 8), vz: Math.sin(a) * v, c: pick(cols), r: rand(0, TAU), w: rand(-8, 8), t: 0, life: rand(2, 3.5) }); }
  },
  update(dt) {
    const cam = G.camera;
    for (const B of this.balls) if (B.t < B.life) { B.t += dt; const f = B.t / B.life, s = B.r * (f < 0.3 ? 0.4 + f / 0.3 * 0.6 : 1 - Math.pow((f - 0.3) / 0.7, 2) * 0.95); B.m.scale.setScalar(Math.max(0.01, s)); B.m.position.addScaledVector(B.v, dt); B.v.multiplyScalar(Math.exp(-3 * dt)); if (B.t >= B.life) B.m.visible = false; }
    for (const S of this.stars) if (S.t < S.life) { S.t += dt; const f = S.t / S.life, k = S.s * (f < 0.25 ? f / 0.25 : 1 - (f - 0.25) / 0.75 * 0.6); S.m.scale.setScalar(Math.max(0.01, k)); S.m.quaternion.copy(cam.quaternion); S.m.rotateZ(S.spin * S.t); S.m.material.opacity = f < 0.6 ? 1 : 1 - (f - 0.6) / 0.4; if (S.t >= S.life) S.m.visible = false; }
    const C = this.conf; if (!C) return; let w = 0;
    for (const p of C.p) { p.t += dt; if (p.t >= p.life) continue; p.vx *= Math.exp(-1.6 * dt); p.vz *= Math.exp(-1.6 * dt); p.vy = Math.max(p.vy - 9 * dt, -1.6); p.x += (p.vx + Math.sin(p.t * 5 + p.r) * 0.6) * dt; p.y += p.vy * dt; p.z += p.vz * dt; p.r += p.w * dt; if (p.y < 0.03) { p.y = 0.03; p.vy = 0; p.vx = p.vz = 0; p.w = 0; } C.p[w++] = p; }
    C.p.length = w;
    for (let i = 0; i < w; i++) { const p = C.p[i]; C.pos[i * 3] = p.x; C.pos[i * 3 + 1] = p.y; C.pos[i * 3 + 2] = p.z; C.col[i * 3] = p.c.r; C.col[i * 3 + 1] = p.c.g; C.col[i * 3 + 2] = p.c.b; C.rot[i] = p.r; }
    C.g.setDrawRange(0, w); C.g.attributes.position.needsUpdate = true; C.g.attributes.color.needsUpdate = true; C.g.attributes.rot.needsUpdate = true;
    C.obj.material.uniforms.uScale.value = G.h / (2 * Math.tan(G.camera.fov * Math.PI / 360));
  },
};
// the existing effects, made chunkier and brighter
(function patchFx() {
  const init = Fx.init.bind(Fx), update = Fx.update.bind(Fx), clear = Fx.clear.bind(Fx);
  Fx.init = function () {
    init();
    // sparks and embers become solid little sweets rather than glows; smoke becomes round cartoon puffs
    this.parts.obj.material.blending = THREE.NormalBlending;
    this.parts.obj.material.fragmentShader = 'varying vec4 vC; void main(){ vec2 d = gl_PointCoord - 0.5; float r = dot(d,d)*4.0; if (r > 1.0 || vC.a < 0.03) discard; vec3 c = vC.rgb / max(1.0, max(vC.r, max(vC.g, vC.b))); c = mix(c, vec3(1.0), smoothstep(0.35, 0.0, r) * 0.55); gl_FragColor = vec4(c * 1.25, smoothstep(0.0, 0.25, vC.a)); }';
    this.parts.obj.material.needsUpdate = true;
    this.smoke.obj.material.fragmentShader = 'varying vec4 vC; void main(){ vec2 d = gl_PointCoord - 0.5; float r = dot(d,d)*4.0; if (r > 1.0) discard; float lit = 0.84 + 0.22 * clamp(-(d.x + d.y) * 1.6 + 0.4, 0.0, 1.0); float edge = smoothstep(1.0, 0.82, r); gl_FragColor = vec4(mix(vC.rgb, vec3(1.0), 0.45) * lit, edge * min(1.0, vC.a * 1.3)); }';
    this.smoke.obj.material.needsUpdate = true;
    for (const R of this.rings) { R.m.geometry = new THREE.RingGeometry(0.72, 1, 48).rotateX(-Math.PI / 2); R.m.material.blending = THREE.NormalBlending; }
    for (const S of this.meshes) S.m.material.blending = THREE.NormalBlending;
    for (const T of this.tracers) T.m.material.blending = THREE.NormalBlending;
    ToonFx.init();
  };
  Fx.update = function (dt) { update(dt); ToonFx.update(dt); };
  Fx.clear = function () { clear(); if (ToonFx.conf) ToonFx.conf.p = []; };
  const tracer = Fx.tracer.bind(Fx); Fx.tracer = (a, b, hex, w = 0.02, life = 0.09, k = 6) => tracer(a, b, hex, w * 1.7, life * 1.3, Math.min(k, 3));
  const sparks = Fx.sparks.bind(Fx); Fx.sparks = (pos, nrm, hex = 0xffc070, n = 8) => { sparks(pos, nrm, hex, Math.ceil(n * 0.6)); ToonFx.star(new V3(pos.x + nrm.x * 0.05, pos.y + nrm.y * 0.05, pos.z + nrm.z * 0.05), 0.3, 0xfff1a0, 0.22); };
  Fx.explosion = function (pos, radius, hex) {
    ToonFx.pop(pos, radius * 1.1, 0xfff0a0, 5, 0.35); ToonFx.pop(pos, radius * 1.3, hex, 4, 0.5); ToonFx.pop(pos.clone().setY(pos.y + radius * 0.3), radius * 1.2, 0xffffff, 6, 0.75);
    ToonFx.star(pos, radius * 0.9, 0xffffff, 0.22);
    this.ring(pos, radius * 1.3, hex, 0.45, 2, 0.1 - pos.y + World.groundAt(pos.x, pos.z, pos.y + 0.3));
    this.burst(pos, hex, 24, radius * 5, 0.6, 0.12, { drag: 3, k: 2, grav: 8 });
    muzzleLight(pos, hex, 10);
  };
  const puff = Fx.puff.bind(Fx); Fx.puff = (pos, hex = 0xf4f0ff, n = 6, s = 0.6, life = 1.2) => { const c = new THREE.Color(hex), l = c.getHSL({}).l; if (l < 0.6) c.lerp(new THREE.Color(0xffffff), 0.65); puff(pos, c.getHex(), n, s, life * 0.8); };
})();
