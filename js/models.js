'use strict';
// ============================================================================
// Models: heroes, weapons, first-person viewmodels, snares, glaives, walls. All built from primitives.
// A hero looks along -z. Their accent strips glow in the colour of their side as seen by the local player.
// ============================================================================
const MCACHE = {};
function mStd(hex, rough = 0.6, metal = 0.1, key = '') {
  const k = hex + ':' + rough + ':' + metal + key;
  if (!MCACHE[k]) MCACHE[k] = new THREE.MeshStandardMaterial({ color: hex, roughness: rough, metalness: metal });
  return MCACHE[k];
}
function mGlow(hex, k = 3) { return glowMat(hex, k); }
function roundBox(w, h, d, r = 0.04, seg = 3) {
  const g = new THREE.BoxGeometry(w, h, d, seg, seg, seg), p = g.attributes.position, v = new V3(), hw = w / 2 - r, hh = h / 2 - r, hd = d / 2 - r;
  r = Math.min(r, w / 2, h / 2, d / 2);
  for (let i = 0; i < p.count; i++) {
    v.set(p.getX(i), p.getY(i), p.getZ(i));
    const c = new V3(clamp(v.x, -hw, hw), clamp(v.y, -hh, hh), clamp(v.z, -hd, hd)), o = v.clone().sub(c);
    if (o.lengthSq() > 1e-9) { o.normalize().multiplyScalar(r); v.copy(c).add(o); }
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals(); return g;
}
function add(parent, geo, mat, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
  const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.set(rx, ry, rz); m.castShadow = true; parent.add(m); return m;
}
function grp(parent, x = 0, y = 0, z = 0) { const g = new THREE.Group(); g.position.set(x, y, z); if (parent) parent.add(g); return g; }
const cyl = (rt, rb, h, s = 12) => new THREE.CylinderGeometry(rt, rb, h, s);
const sph = (r, ws = 14, hs = 10) => new THREE.SphereGeometry(r, ws, hs);
const cap = (r, l, s = 10) => new THREE.CapsuleGeometry(r, l, 4, s);

// ---------------------------------------------------------------- weapons (grip at origin, barrel along -z)
function buildWeapon(kind, H, accent) {
  const g = new THREE.Group(), metal = mStd(0x2c2f35, 0.35, 0.85), dark = mStd(0x16181c, 0.5, 0.6), muzzle = new THREE.Object3D();
  if (kind === 'Longjaw') {
    const wood = mStd(0x6a3f22, 0.55, 0.05), brass = mStd(0xc8933a, 0.3, 0.9);
    add(g, roundBox(0.07, 0.11, 0.32, 0.02), metal, 0, 0.04, -0.12);
    add(g, cyl(0.022, 0.024, 0.78, 10), metal, 0, 0.07, -0.62, Math.PI / 2);
    add(g, cyl(0.016, 0.016, 0.62, 8), dark, 0, 0.035, -0.55, Math.PI / 2);
    add(g, roundBox(0.06, 0.07, 0.42, 0.02), wood, 0, 0.0, -0.5);
    add(g, roundBox(0.065, 0.13, 0.36, 0.03), wood, 0, -0.03, 0.2, 0.18);
    add(g, new THREE.TorusGeometry(0.045, 0.01, 6, 12, Math.PI * 1.3), brass, 0, -0.06, -0.02, 0, Math.PI / 2, 0.5);
    add(g, roundBox(0.02, 0.03, 0.06, 0.008), brass, 0, 0.11, -0.06);
    add(g, roundBox(0.075, 0.02, 0.1, 0.005), mGlow(accent, 3), 0, 0.1, -0.16);
    add(g, cyl(0.03, 0.03, 0.05, 10), brass, 0, 0.07, -1.0, Math.PI / 2);
    muzzle.position.set(0, 0.07, -1.03);
  } else if (kind === 'Twin Wasps') {
    add(g, roundBox(0.07, 0.1, 0.3, 0.02), mStd(0xd8dce4, 0.35, 0.4), 0, 0.03, -0.12);
    add(g, roundBox(0.05, 0.14, 0.05, 0.015), dark, 0, -0.06, 0.0, 0.25);
    add(g, roundBox(0.035, 0.16, 0.05, 0.01), dark, 0, -0.08, -0.13);
    add(g, cyl(0.016, 0.018, 0.14, 8), metal, 0, 0.05, -0.33, Math.PI / 2);
    add(g, roundBox(0.074, 0.015, 0.2, 0.004), mGlow(accent, 4), 0, 0.075, -0.13);
    add(g, roundBox(0.02, 0.03, 0.04, 0.005), mGlow(0xb48aff, 4), 0, 0.09, -0.02);
    muzzle.position.set(0, 0.05, -0.41);
  } else if (kind === 'Pacifier') {
    const yel = mStd(0xc89020, 0.45, 0.45);
    add(g, roundBox(0.12, 0.16, 0.38, 0.03), yel, 0, 0.05, -0.15);
    add(g, cyl(0.04, 0.04, 0.55, 12), metal, -0.03, 0.08, -0.55, Math.PI / 2); add(g, cyl(0.04, 0.04, 0.55, 12), metal, 0.03, 0.08, -0.55, Math.PI / 2);
    add(g, roundBox(0.1, 0.06, 0.3, 0.02), dark, 0, 0.0, -0.55);
    add(g, cyl(0.06, 0.06, 0.12, 12), dark, 0, -0.05, -0.18, 0, 0, Math.PI / 2);
    add(g, roundBox(0.06, 0.14, 0.06, 0.02), dark, 0, -0.08, 0.04, 0.3);
    add(g, roundBox(0.08, 0.12, 0.22, 0.03), yel, 0, 0.0, 0.22);
    for (let i = 0; i < 3; i++) add(g, roundBox(0.125, 0.012, 0.03, 0.004), mGlow(0xff7a2e, 3), 0, 0.12, -0.08 - i * 0.07);
    add(g, roundBox(0.03, 0.04, 0.12, 0.008), mGlow(accent, 3), 0.065, 0.06, -0.2);
    muzzle.position.set(0, 0.08, -0.85);
  } else if (kind === 'Whisper') {
    const body = mStd(0x2a2732, 0.3, 0.6);
    add(g, roundBox(0.07, 0.11, 0.42, 0.02), body, 0, 0.04, -0.16);
    add(g, cyl(0.032, 0.032, 0.36, 12), dark, 0, 0.055, -0.55, Math.PI / 2);
    add(g, roundBox(0.05, 0.14, 0.06, 0.015), dark, 0, -0.07, 0.0, 0.2);
    add(g, roundBox(0.04, 0.15, 0.06, 0.01), dark, 0, -0.08, -0.17, -0.1);
    add(g, roundBox(0.06, 0.09, 0.26, 0.02), body, 0, 0.0, 0.2);
    add(g, roundBox(0.072, 0.012, 0.32, 0.004), mGlow(0xc06aff, 4), 0, 0.1, -0.16);
    add(g, roundBox(0.03, 0.05, 0.1, 0.01), mGlow(accent, 3), 0, 0.12, -0.05);
    muzzle.position.set(0, 0.055, -0.74);
  } else {
    const bronze = mStd(0xb8873a, 0.3, 0.9), teal = mStd(0x2f6a66, 0.4, 0.4);
    add(g, cyl(0.075, 0.085, 0.42, 14), teal, 0, 0.06, -0.25, Math.PI / 2);
    add(g, cyl(0.09, 0.09, 0.06, 14), bronze, 0, 0.06, -0.48, Math.PI / 2);
    add(g, cyl(0.09, 0.09, 0.05, 14), bronze, 0, 0.06, -0.06, Math.PI / 2);
    add(g, sph(0.065, 14, 10), mGlow(0x5affd2, 4), 0, 0.06, -0.27);
    add(g, roundBox(0.06, 0.15, 0.06, 0.02), dark, 0, -0.07, 0.0, 0.2);
    add(g, roundBox(0.07, 0.1, 0.24, 0.03), teal, 0, 0.0, 0.18);
    add(g, roundBox(0.02, 0.05, 0.3, 0.006), mGlow(accent, 3), 0.085, 0.06, -0.26);
    muzzle.position.set(0, 0.06, -0.52);
  }
  g.add(muzzle); g.userData.muzzle = muzzle;
  return g;
}

// ---------------------------------------------------------------- power props
function buildSnare(accent) {
  const g = new THREE.Group(), m = mStd(0x6a6e74, 0.35, 0.85), teeth = mStd(0xd8d2c4, 0.4, 0.6);
  add(g, new THREE.TorusGeometry(0.42, 0.035, 6, 24), m, 0, 0.04, 0, Math.PI / 2);
  add(g, cyl(0.1, 0.12, 0.06, 10), m, 0, 0.03, 0);
  const jawA = grp(g), jawB = grp(g);
  for (const [J, s] of [[jawA, 1], [jawB, -1]]) {
    add(J, new THREE.TorusGeometry(0.4, 0.025, 5, 16, Math.PI), m, 0, 0, 0, 0, s > 0 ? 0 : Math.PI, 0);
    for (let i = 1; i < 8; i++) { const a = i / 8 * Math.PI, t = add(J, new THREE.ConeGeometry(0.03, 0.09, 4), teeth, Math.cos(a) * 0.4 * s, 0.05, Math.sin(a) * 0.4 * (s > 0 ? -1 : 1) * 0); t.position.set(Math.cos(a) * 0.4, 0.05, -Math.sin(a) * 0.4 * s); }
    J.position.y = 0.05;
  }
  jawA.rotation.x = -1.35; jawB.rotation.x = 1.35;
  const light = add(g, sph(0.04, 8, 6), mGlow(accent, 6), 0, 0.09, 0);
  g.userData = { jawA, jawB, light };
  return g;
}
function buildGlaive(accent, s = 1) {
  const g = new THREE.Group(), bronze = mStd(0xb8873a, 0.25, 0.95), steel = mStd(0xd0d6dc, 0.2, 1);
  add(g, new THREE.TorusGeometry(0.2 * s, 0.03 * s, 6, 20), bronze, 0, 0, 0, Math.PI / 2);
  for (let i = 0; i < 3; i++) {
    const a = i / 3 * TAU, bl = new THREE.Shape(); bl.moveTo(0, 0); bl.quadraticCurveTo(0.22 * s, 0.05 * s, 0.38 * s, -0.12 * s); bl.quadraticCurveTo(0.2 * s, 0.0, 0.0, -0.08 * s);
    const geo = new THREE.ExtrudeGeometry(bl, { depth: 0.01 * s, bevelEnabled: false }); geo.rotateX(Math.PI / 2);
    const m = add(g, geo, steel, Math.cos(a) * 0.18 * s, 0, Math.sin(a) * 0.18 * s, 0, -a, 0);
    void m;
  }
  add(g, cyl(0.06 * s, 0.06 * s, 0.04 * s, 10), mGlow(accent, 4), 0, 0, 0);
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
  for (const x of [-2.55, 2.55]) add(g, roundBox(0.18, 3.2, 0.3, 0.05), frame, x, 1.6, 0);
  add(g, roundBox(5.3, 0.16, 0.34, 0.05), frame, 0, 0.08, 0);
  add(g, roundBox(5.1, 0.04, 0.05, 0.01), mGlow(teamHex, 4), 0, 3.05, 0);
  g.userData = { panel, hex };
  return g;
}

// ---------------------------------------------------------------- heroes
function buildHero(key, accent) {
  const H = HEROES[key], root = new THREE.Group(), body = grp(root);
  const C = mStd(H.color, 0.55, 0.25), D = mStd(H.dark, 0.6, 0.3), CL = mStd(H.cloth, 0.85, 0.0), MT = mStd(H.metal, 0.3, 0.85), GL = mGlow(H.glow, 3.5), AC = mGlow(accent, 3);
  const hips = grp(body, 0, 0.95, 0), torso = grp(hips, 0, 0.05, 0), head = grp(torso, 0, 0.62, 0), aim = grp(torso, 0, 0.42, 0);
  const legs = [], P = { root, body, hips, torso, head, aim, legs, extra: {} };
  // legs: thigh -> knee -> shin -> boot
  for (const s of [-1, 1]) {
    const hip = grp(hips, s * 0.12, -0.02, 0), knee = grp(hip, 0, -0.44, 0);
    add(hip, cap(0.085, 0.3), key === 'gauge' ? D : CL, 0, -0.22, 0);
    add(knee, cap(0.075, 0.3), D, 0, -0.22, 0);
    add(knee, roundBox(0.13, 0.08, 0.26, 0.03), D, 0, -0.45, -0.05);
    add(knee, roundBox(0.11, 0.1, 0.06, 0.02), key === 'gauge' ? C : MT, 0, -0.02, -0.07);
    legs.push({ hip, knee, s });
  }
  // a pelvis and belt everyone has
  add(hips, roundBox(0.34, 0.16, 0.22, 0.05), D, 0, 0, 0);
  add(hips, roundBox(0.36, 0.05, 0.24, 0.02), MT, 0, 0.07, 0);
  // arms: held up into the aim pose (inside the aim pivot, so they follow pitch)
  const shoulder = (s, w = 0.09) => { const sh = grp(aim, s * 0.22, 0, 0); return sh; };
  const shR = shoulder(1), shL = shoulder(-1);
  // right arm: shoulder down/forward to the grip at (0.1, -0.08, -0.3)
  add(shR, cap(0.065, 0.24), C, 0.0, -0.1, -0.08, -0.9, 0, 0.1);
  add(shR, cap(0.058, 0.22), D, -0.06, -0.12, -0.27, -1.5, 0, 0.2);
  add(shR, roundBox(0.08, 0.08, 0.1, 0.03), D, -0.1, -0.1, -0.38);
  // left arm across to the foregrip
  add(shL, cap(0.065, 0.24), C, 0.04, -0.1, -0.1, -0.95, 0, -0.35);
  add(shL, cap(0.058, 0.24), D, 0.17, -0.1, -0.33, -1.45, 0, -0.7);
  add(shL, roundBox(0.08, 0.08, 0.1, 0.03), D, 0.26, -0.08, -0.48);
  const gun = buildWeapon(H.weapon.name, H, accent); gun.position.set(0.12, -0.09, -0.36); aim.add(gun); P.gun = gun;
  P.flat = [shR, shL, gun];
  if (H.weapon.twin) { const g2 = buildWeapon(H.weapon.name, H, accent); g2.position.set(-0.16, -0.09, -0.36); aim.add(g2); P.gun2 = g2; P.flat.push(g2); }
  gun.traverse(o => { if (o.isMesh) o.castShadow = true; });

  if (key === 'marrow') {
    add(torso, roundBox(0.4, 0.5, 0.25, 0.08), CL, 0, 0.27, 0);
    add(torso, roundBox(0.44, 0.34, 0.28, 0.08), C, 0, 0.36, 0.0);                    // leather coat chest
    const skirt = add(hips, cyl(0.24, 0.36, 0.62, 12, 1), C, 0, -0.28, 0.02); skirt.scale.z = 0.8; P.extra.skirt = skirt;
    add(torso, roundBox(0.5, 0.1, 0.3, 0.05), C, 0, 0.53, 0);
    add(torso, new THREE.TorusGeometry(0.22, 0.03, 6, 14), mStd(0x3a2a1e, 0.7, 0.1), 0, 0.3, 0, 1.2, 0, 0.6);   // bandolier
    for (let i = 0; i < 2; i++) { const s = buildSnare(accent); s.scale.setScalar(0.42); s.position.set(-0.08 + i * 0.16, 0.36, 0.17); s.rotation.x = -1.4; torso.add(s); }
    add(head, sph(0.13, 14, 10), mStd(0xb08a6a, 0.7, 0), 0, 0.02, 0);
    add(head, roundBox(0.22, 0.09, 0.2, 0.03), mStd(0x3a2a1e, 0.8, 0), 0, -0.05, -0.04);             // scarf mask
    add(head, cyl(0.42, 0.42, 0.025, 20), mStd(0x3a2a1e, 0.8, 0), 0, 0.1, 0);                     // brim
    add(head, cyl(0.15, 0.17, 0.16, 14), mStd(0x3a2a1e, 0.8, 0), 0, 0.19, 0);
    add(head, cyl(0.171, 0.171, 0.035, 14), AC, 0, 0.13, 0);
    add(head, roundBox(0.18, 0.025, 0.02, 0.008), GL, 0, 0.04, -0.13);
  } else if (key === 'lark') {
    add(torso, roundBox(0.36, 0.48, 0.22, 0.09), C, 0, 0.28, 0);
    add(torso, roundBox(0.3, 0.2, 0.24, 0.06), D, 0, 0.12, 0);
    add(torso, roundBox(0.06, 0.4, 0.02, 0.01), AC, 0, 0.3, -0.115);
    add(torso, roundBox(0.24, 0.26, 0.1, 0.04), D, 0, 0.3, 0.14);
    add(torso, sph(0.07, 10, 8), GL, 0, 0.3, 0.2);                                                // rift core on the back
    const scarf = grp(torso, 0, 0.5, 0.12); add(scarf, new THREE.PlaneGeometry(0.16, 0.7), new THREE.MeshStandardMaterial({ color: H.cloth, side: THREE.DoubleSide, roughness: 0.9 }), 0, -0.3, 0.05); P.extra.scarf = scarf;
    add(head, sph(0.15, 16, 12), C, 0, 0.03, 0);
    add(head, roundBox(0.24, 0.07, 0.12, 0.03), GL, 0, 0.04, -0.09);
    add(head, roundBox(0.03, 0.14, 0.2, 0.01), AC, 0, 0.12, 0.02);
  } else if (key === 'gauge') {
    add(torso, roundBox(0.6, 0.55, 0.42, 0.1), C, 0, 0.3, 0);
    add(torso, roundBox(0.5, 0.25, 0.44, 0.06), D, 0, 0.08, 0);
    for (const s of [-1, 1]) { add(torso, roundBox(0.28, 0.24, 0.36, 0.08), C, s * 0.38, 0.52, 0); add(torso, roundBox(0.3, 0.04, 0.38, 0.01), AC, s * 0.38, 0.65, 0); }
    for (const s of [-1, 1]) { add(torso, cyl(0.06, 0.07, 0.6, 10), MT, s * 0.14, 0.55, 0.28); add(torso, cyl(0.065, 0.065, 0.04, 10), GL, s * 0.14, 0.86, 0.28); }
    add(torso, roundBox(0.4, 0.34, 0.12, 0.04), D, 0, 0.32, 0.26);
    add(torso, roundBox(0.3, 0.06, 0.02, 0.01), GL, 0, 0.3, -0.215);
    add(head, sph(0.18, 14, 10), C, 0, 0.0, 0);
    add(head, roundBox(0.26, 0.05, 0.08, 0.02), GL, 0, 0.0, -0.15);
    add(head, roundBox(0.06, 0.12, 0.3, 0.02), D, 0, 0.15, 0);
    torso.scale.set(1.08, 1, 1.05);
  } else if (key === 'veil') {
    add(torso, roundBox(0.34, 0.5, 0.22, 0.08), C, 0, 0.28, 0);
    const cloak = add(torso, new THREE.ConeGeometry(0.4, 1.3, 14, 1, true), new THREE.MeshStandardMaterial({ color: H.cloth, roughness: 0.9, side: THREE.DoubleSide }), 0, -0.05, 0.04); cloak.scale.z = 0.7; P.extra.cloak = cloak;
    add(torso, roundBox(0.05, 0.36, 0.02, 0.01), AC, 0.1, 0.26, -0.115);
    const hood = add(head, new THREE.SphereGeometry(0.19, 14, 10, 0, TAU, 0, Math.PI * 0.62), mStd(H.cloth, 0.9, 0), 0, 0.04, 0.03);
    hood.rotation.x = -0.25;
    add(head, roundBox(0.18, 0.22, 0.06, 0.05), mStd(0xe6e0d6, 0.35, 0.1), 0, 0.0, -0.11);
    add(head, sph(0.03, 8, 6), GL, 0.04, 0.03, -0.145);
  } else if (key === 'ivra') {
    add(torso, roundBox(0.38, 0.5, 0.24, 0.08), C, 0, 0.28, 0);
    add(torso, roundBox(0.32, 0.18, 0.26, 0.06), mStd(0xb8873a, 0.3, 0.9), 0, 0.42, -0.01);
    for (const s of [-1, 1]) { const pl = add(torso, new THREE.SphereGeometry(0.17, 12, 8, 0, TAU, 0, Math.PI / 2), mStd(0xb8873a, 0.3, 0.9), s * 0.28, 0.5, 0); pl.scale.y = 0.7; }
    const skirt = add(hips, cyl(0.22, 0.3, 0.42, 8, 1), mStd(H.cloth, 0.85, 0), 0, -0.2, 0); skirt.scale.z = 0.75;
    add(torso, roundBox(0.04, 0.3, 0.02, 0.01), AC, 0, 0.26, -0.125);
    const gl = buildGlaive(H.glow, 1.4); gl.position.set(0, 0.35, 0.2); gl.rotation.x = Math.PI / 2 - 0.2; torso.add(gl); P.extra.glaive = gl;
    add(head, sph(0.14, 14, 10), mStd(0xb8873a, 0.3, 0.9), 0, 0.02, 0);
    add(head, roundBox(0.03, 0.22, 0.34, 0.01), mStd(0xb8873a, 0.3, 0.9), 0, 0.18, 0.04);
    add(head, roundBox(0.2, 0.04, 0.04, 0.01), GL, 0, 0.02, -0.13);
    root.scale.setScalar(1.04);
  }
  return compactHero(P);
}

// ---------------------------------------------------------------- compacting: one or two meshes per moving part
// Every part that moves together (a shin, the torso, the gun) is baked into a vertex-coloured mesh per surface kind,
// so a hero costs about twenty draws instead of sixty.
const HERO_MAT = {};
function heroMat(kind) {
  if (!HERO_MAT[kind]) {
    const metal = kind[0] === 'm', side = kind.endsWith('d') ? THREE.DoubleSide : THREE.FrontSide;
    HERO_MAT[kind] = kind === 'g' ? new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }) : new THREE.MeshStandardMaterial({ vertexColors: true, roughness: metal ? 0.32 : 0.68, metalness: metal ? 0.82 : 0.08, side });
  }
  return HERO_MAT[kind];
}
function compactNode(node) {
  const meshes = node.children.filter(c => c.isMesh && !c.userData.keep);
  if (meshes.length >= 2) {
    const buckets = new Map();
    for (const m of meshes) {
      const M = m.material, glow = !M.isMeshStandardMaterial;
      const special = glow && (M.transparent || M.blending !== THREE.NormalBlending);
      const key = special ? 'x' + M.uuid : glow ? 'g' : (M.metalness > 0.5 ? 'm' : 'r') + (M.side === THREE.DoubleSide ? 'd' : '');
      if (!buckets.has(key)) buckets.set(key, { glow: special, mat: special ? M : heroMat(key), list: [] });
      m.updateMatrix();
      const g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
      for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
      g.applyMatrix4(m.matrix);
      if (!special) { const n = g.attributes.position.count, c = new Float32Array(n * 3); for (let i = 0; i < n; i++) { c[i * 3] = M.color.r; c[i * 3 + 1] = M.color.g; c[i * 3 + 2] = M.color.b; } g.setAttribute('color', new THREE.BufferAttribute(c, 3)); }
      buckets.get(key).list.push(g); node.remove(m);
    }
    for (const b of buckets.values()) {
      let n = 0; for (const g of b.list) n += g.attributes.position.count;
      const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), col = b.glow ? null : new Float32Array(n * 3); let o = 0;
      for (const g of b.list) { pos.set(g.attributes.position.array, o * 3); nor.set(g.attributes.normal.array, o * 3); if (col) col.set(g.attributes.color.array, o * 3); o += g.attributes.position.count; g.dispose(); }
      const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); if (col) geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
      geo.computeBoundingSphere();
      const mesh = new THREE.Mesh(geo, b.mat); mesh.castShadow = true; node.add(mesh);
    }
  }
  for (const c of node.children) if (!c.isMesh) compactNode(c);
}
function flatten(group) {
  const parent = group.parent; if (!parent) return;
  parent.updateMatrixWorld(true);
  for (const c of [...group.children]) if (c.isMesh) parent.attach(c);
}
function compactHero(P) {
  P.root.updateMatrixWorld(true);
  for (const g of P.flat || []) flatten(g);
  compactNode(P.root);
  P.meshes = []; P.root.traverse(o => { if (o.isMesh) { o.castShadow = true; o.userData.base = o.material; P.meshes.push(o); } });
  return P;
}

// ---------------------------------------------------------------- the first-person view
function buildViewmodel(key) {
  const H = HEROES[key], vm = new THREE.Group(), glove = mStd(H.dark, 0.7, 0.1), sleeve = mStd(H.color, 0.6, 0.2);
  vm.scale.setScalar(0.7);
  const right = grp(vm, 0.26, -0.23, -0.44), left = grp(vm, -0.2, -0.25, -0.42);
  const gun = buildWeapon(H.weapon.name, H, 0x2a8aa0); right.add(gun);
  add(right, roundBox(0.055, 0.075, 0.085, 0.025), glove, 0, -0.05, 0.02);
  add(right, cap(0.042, 0.3), sleeve, 0.02, -0.11, 0.24, 1.25, 0, 0);
  const P = { vm, right, left, gun, extra: {} };
  if (H.weapon.twin) {
    const g2 = buildWeapon(H.weapon.name, H, 0x2a8aa0); left.position.set(-0.21, -0.2, -0.38); left.add(g2); P.gun2 = g2;
    add(left, roundBox(0.07, 0.09, 0.1, 0.03), glove, 0, -0.05, 0.02); add(left, cap(0.05, 0.3), sleeve, -0.02, -0.11, 0.24, 1.25, 0, 0);
  } else {
    // the support hand on the foregrip
    const fg = grp(right, -0.0, -0.02, H.weapon.name === 'Pacifier' ? -0.45 : H.weapon.name === 'Tidecaller' ? -0.3 : -0.42);
    add(fg, roundBox(0.075, 0.08, 0.1, 0.03), glove, -0.015, -0.035, 0); add(fg, cap(0.048, 0.32), sleeve, -0.13, -0.12, 0.2, 1.1, -0.5, 0);
    P.foregrip = fg;
  }
  // the power in the off hand
  const off = grp(vm, -0.28, -0.32, -0.45); off.visible = false; P.off = off;
  add(off, roundBox(0.08, 0.09, 0.11, 0.035), glove, 0, 0, 0); add(off, cap(0.05, 0.3), sleeve, 0, -0.06, 0.22, 1.2, 0, 0);
  if (key === 'marrow') { const s = buildSnare(TEAM_HEX[0]); s.scale.setScalar(0.38); s.position.set(0.02, 0.08, -0.06); s.rotation.x = 0.6; off.add(s); P.extra.snare = s; }
  if (key === 'ivra') { const g = buildGlaive(H.glow, 1.2); g.position.set(0.02, 0.1, -0.02); g.rotation.set(0.2, 0, 1.2); off.add(g); P.extra.glaive = g; }
  if (key === 'lark') { const o = add(off, sph(0.06, 14, 10), mGlow(H.glow, 6), 0.0, 0.08, -0.05); P.extra.orb = o; const r = add(off, new THREE.TorusGeometry(0.1, 0.008, 6, 24), mGlow(0xffffff, 4), 0, 0.08, -0.05); P.extra.ring = r; }
  if (P.extra.orb) P.extra.orb.userData.keep = true; if (P.extra.ring) P.extra.ring.userData.keep = true;
  compactNode(vm);
  vm.traverse(o => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; o.userData.base = o.material; o.frustumCulled = false; } });
  return P;
}
