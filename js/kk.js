'use strict';
// ============================================================================
// Hero models: KayKit's CC0 character packs (Kay Lousberg, kaylousberg.com), dressed per hero —
// a body, a recoloured texture, hats and capes on or off, weapons from any of the packs, our own props,
// and a team-coloured rim — animated from one shared clip library with legs and upper body blended apart.
// ============================================================================
const KK = {
  ready: false, failed: false, T: {}, clips: {}, parts: {}, tex: {}, mats: {},
  BODIES: ['Knight', 'Barbarian', 'Mage', 'Rogue', 'Rogue_Hooded', 'Skeleton_Warrior', 'Skeleton_Mage', 'Skeleton_Rogue', 'Skeleton_Minion'],
  async load(onProgress) {
    if (!THREE.GLTFLoader || !THREE.SkeletonUtils) throw new Error('model loader missing');
    const L = new THREE.GLTFLoader(), files = ['anims', ...this.BODIES]; let done = 0;
    const get = f => new Promise((res, rej) => L.load('assets/heroes/' + f + '.glb', g => { done++; if (onProgress) onProgress(done / files.length); res(g); }, undefined, rej));
    const all = await Promise.all(files.map(get));
    for (const c of all[0].animations) this.clips[c.name] = c;
    this.BODIES.forEach((b, i) => {
      const g = all[i + 1], sc = g.scene; sc.updateMatrixWorld(true);
      const T = { scene: sc, nodes: {}, map: null, mat: null };
      sc.traverse(o => { T.nodes[o.name] = o; if (o.isMesh && o.material && o.material.map && !T.map) { T.map = o.material.map; T.mat = o.material; } });
      // how tall the bare head is, so every body can be scaled to the same height
      let top = 0; sc.traverse(o => { if (o.isSkinnedMesh && /Head|Skull/.test(o.name) && !/Hood/.test(o.name)) { o.geometry.computeBoundingBox(); top = Math.max(top, o.geometry.boundingBox.max.y); } });
      T.top = top || 2.2;
      this.T[b] = T;
    });
    this.ready = true;
  },
  has(key) { return this.ready && !!KK_LOOK[key]; },

  // ---------------------------------------------------------------- textures: swap whole colour swatches, keeping their shading
  recolor(body, key, map) {
    const ck = body + ':' + key; if (this.tex[ck]) return this.tex[ck];
    const T = this.T[body], img = T.map.image, N = 256, c = document.createElement('canvas'); c.width = c.height = N;
    const x = c.getContext('2d'); x.drawImage(img, 0, 0, N, N);
    if (map && Object.keys(map).length) {
      const D = x.getImageData(0, 0, N, N), d = D.data, cell = N / 8, tc = new THREE.Color();
      for (const k in map) {
        const cx = +k[0], cy = +k[1], col = tc.set(map[k]), x0 = cx * cell, y0 = cy * cell;
        let sum = 0, n = 0;
        for (let y = y0; y < y0 + cell; y++) for (let xx = x0; xx < x0 + cell; xx++) { const i = (y * N + xx) * 4; sum += d[i] * 0.3 + d[i + 1] * 0.59 + d[i + 2] * 0.11; n++; }
        const mean = Math.max(1, sum / n);
        for (let y = y0; y < y0 + cell; y++) for (let xx = x0; xx < x0 + cell; xx++) {
          const i = (y * N + xx) * 4, l = (d[i] * 0.3 + d[i + 1] * 0.59 + d[i + 2] * 0.11) / mean, k2 = Math.pow(l, 0.85);
          d[i] = clamp(col.r * 255 * k2, 0, 255); d[i + 1] = clamp(col.g * 255 * k2, 0, 255); d[i + 2] = clamp(col.b * 255 * k2, 0, 255);
        }
      }
      x.putImageData(D, 0, 0);
    }
    const t = new THREE.CanvasTexture(c); t.flipY = false; t.encoding = THREE.sRGBEncoding; t.anisotropy = 4; t.needsUpdate = true;
    return (this.tex[ck] = t);
  },
  // a soft rim in the team colour so friend and foe read at a glance
  rimMat(src, map, rim, k = 1) {
    const m = src.clone(); if (map) m.map = map;
    m.roughness = 0.75; m.metalness = 0; m.envMapIntensity = 0.5; m.color = m.color.clone().multiplyScalar(0.86);
    const rc = new THREE.Color(rim).multiplyScalar(0.55 * k);
    m.userData.rim = rc;
    m.onBeforeCompile = sh => {
      sh.uniforms.uRim = { value: rc };
      sh.fragmentShader = 'uniform vec3 uRim;\n' + sh.fragmentShader.replace('#include <dithering_fragment>', '{ float fr = 1.0 - clamp(dot(normalize(normal), normalize(vViewPosition)), 0.0, 1.0); gl_FragColor.rgb += uRim * pow(fr, 2.6); }\n#include <dithering_fragment>');
    };
    m.customProgramCacheKey = () => 'kkrim';
    return m;
  },
  mat(ck, make) { return this.mats[ck] || (this.mats[ck] = make()); },

  // ---------------------------------------------------------------- one hero, dressed
  build(key, teamHex) {
    const L = KK_LOOK[key], T = this.T[L.body], H = HEROES[key] || { look: { glow: 0x7affb4 } };
    const sc = THREE.SkeletonUtils.clone(T.scene), nodes = {};
    sc.traverse(o => { if (o.name && !nodes[o.name]) nodes[o.name] = o; });
    const tex = this.recolor(L.body, key, L.recolor), team = teamHex == null ? 0x2ee6ff : teamHex;
    const bodyMat = this.mat(key + ':body:' + team, () => this.rimMat(T.mat, tex, team));
    // hand items, hats and capes are off unless the look asks for them
    const keep = new Set(L.keep || []);
    for (const n in nodes) { const o = nodes[n]; if (o.isMesh && !o.isSkinnedMesh && !keep.has(n)) o.visible = false; }
    for (const n of L.hide || []) if (nodes[n]) nodes[n].visible = false;
    const meshes = [], all = [];
    sc.traverse(o => {
      if (!o.isMesh) return;
      if (o.material && o.material.map) o.material = bodyMat;
      else if (o.material) { const src = o.material; o.material = this.mat(key + ':m:' + src.uuid + ':' + team, () => { const m = this.rimMat(src, null, team, 0.6); if (L.eyes && /Glow|Eye/i.test(src.name || o.name)) { m.emissive = new THREE.Color(L.eyes); m.color = new THREE.Color(L.eyes); } return m; }); }
      o.castShadow = true; o.receiveShadow = false; o.frustumCulled = false;
      o.userData.base = o.material;
      if (o.isSkinnedMesh) meshes.push(o);
      all.push(o);
    });
    const bone = n => nodes[n] || nodes[n.replace('.', '')];
    const ctx = { key, nodes, bone, team, hero: H, glow: H.look.glow, add: (b, obj) => { const p = bone(b); if (p) p.add(obj); obj.traverse(o => { if (o.isMesh) { o.castShadow = true; o.frustumCulled = false; o.userData.base = o.material; all.push(o); } }); return obj; } };
    // weapons and items borrowed from the other packs, in the same hand slot they came from
    for (const it of L.items || []) {
      const src = this.T[it.from] && this.T[it.from].nodes[it.name]; if (!src) continue;
      const m = src.clone(true), srcT = this.T[it.from];
      m.visible = true;
      m.traverse(o => { if (o.isMesh) { const sm = o.material; o.material = this.mat(key + ':it:' + it.from + ':' + (it.tint || '') + ':' + team, () => { const mm = this.rimMat(sm, it.tint ? this.recolor(it.from, key + '-' + it.from, it.tint) : null, team, 0.6); return mm; }); } });
      if (it.pos) m.position.add(new V3(...it.pos)); if (it.rot) m.rotation.set(m.rotation.x + it.rot[0], m.rotation.y + it.rot[1], m.rotation.z + it.rot[2]); if (it.scale) m.scale.multiplyScalar(it.scale);
      ctx.add(it.slot || src.parent.name, m); if (it.muzzle) ctx.muzzleItem = m;
      void srcT;
    }
    if (L.props) L.props(ctx);
    if (L.muzzleItemName && nodes[L.muzzleItemName]) ctx.muzzleItem = nodes[L.muzzleItemName];
    // the hierarchy the game expects: root (position, yaw) > body (sink, tilt) > holder (scale, facing)
    const root = new THREE.Group(), body = new THREE.Group(), holder = new THREE.Group();
    root.add(body); body.add(holder); holder.add(sc); root.userData.hero = key;
    const s = (L.height || 1.86) / T.top; holder.scale.setScalar(s * (L.scale || 1)); holder.rotation.y = Math.PI;
    const mixer = new THREE.AnimationMixer(sc);
    const anims = []; all.forEach(o => { }); sc.traverse(o => { if (o.userData.flame) anims.push(t => { o.userData.flame.scale.set(0.8 + Math.sin(t * 17) * 0.1, 1.6 + Math.sin(t * 11) * 0.25, 0.8); }); if (o.userData.spin) anims.push(t => { o.rotation.y = t * 1.2; }); if (o.userData.hands) anims.push(t => { o.userData.hands[0].rotation.z = -t * 0.5; o.userData.hands[1].rotation.z = 2.3 - t * 4; }); });
    const M = { kk: true, anims, root, body, holder, scene: sc, nodes, meshes, allMeshes: all, H, key, L, mixer, act: {}, t: Math.random() * 10, lastT: null, shotSeen: 0, info: {}, extra: {}, hold: {}, pitchB: [bone('spine'), bone('chest'), bone('head')].filter(Boolean) };
    M.pitchRest = M.pitchB.map(b => b.quaternion.clone());
    M.extra.smoke = ctx.stack || null; M.extra.claws = ctx.claws || null;
    M.bones = { chest: bone('chest'), head: bone('head'), handR: bone('handslotr'), handL: bone('handslotl'), hips: bone('hips') };
    // lower body and upper body play different clips
    M.lower = this.layer(M, 'lower', 'Idle'); M.upper = this.layer(M, 'upper', (L.style || STYLE_KK.r2).aim);
    // the muzzle: the front tip of what the hero holds, found once in the aiming pose
    M.muzzle = new THREE.Object3D();
    this.pose(M, { spd: 0, air: 0, pitch: 0, flags: 0, t: 0.01 }, 0.01);
    root.updateMatrixWorld(true);
    const held = ctx.muzzleItem || (L.muzzleProp && ctx[L.muzzleProp]) || null, hand = M.bones.handR || M.bones.chest;
    if (held) {
      const box = new THREE.Box3().setFromObject(held), fw = new V3(0, 0, -1).applyQuaternion(root.getWorldQuaternion(new THREE.Quaternion()));
      const cands = [], c = box.getCenter(new V3());
      for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, (box.min.y + box.max.y) / 2, box.max.y]) for (const z of [box.min.z, box.max.z]) cands.push(new V3(x, y, z));
      let best = c, bd = -1e9; for (const q of cands) { const d = q.clone().sub(c).dot(fw); if (d > bd) { bd = d; best = q; } }
      const tip = new V3(c.x, (box.min.y + box.max.y) / 2 + (L.muzzleUp || 0), c.z).addScaledVector(fw, Math.max(0, best.clone().sub(c).dot(fw)));
      hand.add(M.muzzle); M.muzzle.position.copy(hand.worldToLocal(tip));
    } else { hand.add(M.muzzle); M.muzzle.position.set(0, 0, 0); }
    return M;
  },

  // ---------------------------------------------------------------- animation
  // a clip cut down to just the legs (and hips) or just the spine, arms and head
  part(name, half) {
    const k = name + ':' + half; if (this.parts[k]) return this.parts[k];
    const c = this.clips[name]; if (!c) return null;
    const up = n => /^(spine|chest|head|upperarm|lowerarm|wrist|hand|elbowIK|handIK)/.test(n);
    const tracks = c.tracks.filter(t => { const n = t.name.split('.')[0]; return half === 'full' ? true : half === 'upper' ? up(n) : !up(n); });
    return (this.parts[k] = new THREE.AnimationClip(name + '_' + half, c.duration, tracks));
  },
  layer(M, half, name) { return { half, cur: null, name: null, set: n => this.play(M, half, n) }; },
  action(M, name, half) {
    const k = name + ':' + half; if (M.act[k]) return M.act[k];
    const c = this.part(name, half); if (!c) return null;
    const a = M.mixer.clipAction(c); a.enabled = true; return (M.act[k] = a);
  },
  // crossfade a layer to a looping clip
  play(M, half, name, fade = 0.18, speed = 1) {
    const ly = half === 'lower' ? M.lower : M.upper;
    if (ly.name === name) { if (ly.cur) ly.cur.timeScale = speed; return ly.cur; }
    const a = this.action(M, name, half) || this.action(M, 'Idle', half); if (!a) return null;
    a.reset(); a.setLoop(THREE.LoopRepeat); a.clampWhenFinished = false; a.timeScale = speed; a.setEffectiveWeight(1); a.play();
    if (ly.cur && ly.cur !== a) a.crossFadeFrom(ly.cur, fade, false);
    ly.cur = a; ly.name = name; return a;
  },
  // a one-off on the upper body (a shot, a throw, a cast) that hands back to the loop
  once(M, name, speed = 1, half = 'upper') {
    const a = this.action(M, name, half); if (!a) return;
    const ly = half === 'lower' ? M.lower : M.upper;
    a.reset(); a.setLoop(THREE.LoopOnce); a.clampWhenFinished = true; a.timeScale = speed; a.setEffectiveWeight(1); a.play();
    if (ly.cur && ly.cur !== a) a.crossFadeFrom(ly.cur, 0.06, false);
    ly.cur = a; ly.name = '!' + name; ly.until = a.getClip().duration / speed * 0.85;
  },
  fire(M) { if (!M || !M.kk) return; const S = (M.beast ? M.L.beast : M.L.style) || STYLE_KK.r2; const n = Array.isArray(S.shoot) ? S.shoot[(M.shotN = (M.shotN | 0) + 1) % S.shoot.length] : S.shoot; this.once(M, n, S.shootSpeed || 1.6); },
  power(M, name) { if (!M || !M.kk) return; this.once(M, name || 'Spellcast_Shoot', 1.4); },
  die(M) {
    if (!M || !M.kk || M.dead) return; M.dead = true;
    M.mixer.stopAllAction(); M.lower.name = M.upper.name = null; M.lower.cur = M.upper.cur = null;
    const a = this.action(M, Math.random() < 0.5 ? 'Death_A' : 'Death_B', 'full'); if (!a) return;
    a.reset(); a.setLoop(THREE.LoopOnce); a.clampWhenFinished = true; a.timeScale = 1.3; a.play();
  },
  revive(M) { if (!M || !M.kk || !M.dead) return; M.dead = false; M.mixer.stopAllAction(); M.lower.name = M.upper.name = null; M.lower.cur = M.upper.cur = null; },
  // s: { spd, vf, vs (forward and sideways speed), air, pitch, flags, t, crouch }
  pose(M, s, dtIn) {
    const dt = dtIn != null ? dtIn : clamp(M.lastT == null ? 0.016 : s.t - M.lastT, 0, 0.1); M.lastT = s.t;
    // bones a clip leaves alone keep whatever they had: put the ones we bend back first
    if (M.pitchRest) M.pitchB.forEach((b, i) => b.quaternion.copy(M.pitchRest[i]));
    if (M.dead) { M.mixer.update(dt); return; }
    const f = s.flags || 0, beast = !!(f & F_BEAR) && !!M.L.beast;
    if (beast !== !!M.beast) { M.beast = beast; if (M.extra.claws) M.extra.claws.forEach(c => { c.visible = beast; }); for (const n of ['1H_Axe', '1H_Axe_Offhand']) if (M.nodes[n]) M.nodes[n].visible = !beast; M.upper.name = null; }
    const S = (beast ? M.L.beast : M.L.style) || STYLE_KK.r2, spd = s.spd || 0, vf = s.vf != null ? s.vf : spd, vs = s.vs || 0;
    // legs
    let leg = 'Idle', ls = 1;
    if (s.air > 0.5) leg = 'Jump_Idle';
    else if (f & F_CHARGE) { leg = 'Running_B'; ls = 1.3; }
    else if (beast && spd > 0.6) { leg = 'Running_B'; ls = clamp(spd / 6, 0.8, 1.6); }
    else if (spd > 0.6) {
      if (Math.abs(vs) > Math.abs(vf) * 1.2) { leg = vs > 0 ? 'Running_Strafe_Right' : 'Running_Strafe_Left'; ls = clamp(spd / 5, 0.6, 1.4); }
      else if (vf < -0.5) { leg = 'Walking_Backwards'; ls = clamp(spd / 3, 0.7, 1.6); }
      else { leg = spd > 3 ? 'Running_A' : 'Walking_A'; ls = spd > 3 ? clamp(spd / 5.2, 0.7, 1.5) : clamp(spd / 2.2, 0.6, 1.4); }
    } else if (s.crouch > 0.4) leg = 'Sit_Floor_Idle';
    this.play(M, 'lower', leg, 0.2, ls);
    // upper body: one-offs run their course, then back to the held pose for this hero (or what the power is doing)
    if (M.upper.name && M.upper.name[0] === '!') { M.upper.until -= dt; if (M.upper.until > 0) { M.mixer.update(dt); this.aim(M, s); return; } M.upper.name = null; }
    for (const fn of M.anims) fn(s.t || 0);
    let up = s.relaxed ? 'Idle' : S.aim;
    if (f & F_FLAME || f & F_BEAM) up = S.hold || S.aim;
    if (f & F_CHANNEL || f & F_BLINKCH) up = 'Spellcasting';
    if (f & F_WIND) up = 'Spellcast_Raise';
    if (f & F_PLACE) up = 'Interact';
    if (f & F_CHARGE) up = S.charge || 'Block';
    if (f & F_LANCE) up = S.hold || S.aim;
    this.play(M, 'upper', up, 0.15);
    M.mixer.update(dt);
    this.aim(M, s);
  },
  // look up and down by bending the spine, chest and head on top of whatever the clips did
  aim(M, s) {
    const p = clamp(s.pitch || 0, -0.9, 0.9) + (M.L.pitchBias || 0); if (Math.abs(p) < 1e-3) return;
    M.root.updateMatrixWorld(true);
    const ax = _kkv.set(1, 0, 0).applyQuaternion(M.root.getWorldQuaternion(_kkq)), share = [0.3, 0.5, 0.1];
    M.pitchB.forEach((b, i) => {
      const pq = b.parent.getWorldQuaternion(_kkq2).invert(), al = _kkv2.copy(ax).applyQuaternion(pq).normalize();
      b.quaternion.premultiply(_kkq3.setFromAxisAngle(al, p * share[i]));
      b.updateMatrixWorld(true);
    });
  },
};
const _kkv = new V3(), _kkv2 = new V3(), _kkq = new THREE.Quaternion(), _kkq2 = new THREE.Quaternion(), _kkq3 = new THREE.Quaternion();

// how each kind of weapon is held, fired and carried while a power runs
const STYLE_KK = {
  r2: { aim: '2H_Ranged_Aiming', shoot: '2H_Ranged_Shoot', hold: '2H_Ranged_Shooting' },
  r1: { aim: '1H_Ranged_Aiming', shoot: '1H_Ranged_Shoot', hold: '1H_Ranged_Shooting' },
  cast: { aim: 'Spellcasting', shoot: 'Spellcast_Shoot', hold: 'Spellcasting', shootSpeed: 1.8 },
  staff: { aim: '2H_Melee_Idle', shoot: 'Spellcast_Shoot', hold: 'Spellcasting', shootSpeed: 1.8 },
  throw: { aim: 'Idle_Combat', shoot: 'Throw', hold: 'Idle_Combat', shootSpeed: 2.2 },
  dual: { aim: 'Idle_Combat', shoot: ['Dualwield_Melee_Attack_Slice', 'Dualwield_Melee_Attack_Stab'], hold: 'Idle_Combat', shootSpeed: 1.8 },
  axe: { aim: 'Idle_Combat', shoot: 'Throw', hold: 'Idle_Combat', shootSpeed: 2.4 },
  claw: { aim: 'Unarmed_Idle', shoot: ['Unarmed_Melee_Attack_Punch_A', '1H_Melee_Attack_Chop'], hold: 'Unarmed_Idle', shootSpeed: 1.8 },
};

// ---------------------------------------------------------------- props, in KayKit's chunky style
function kkMat(hex, rough = 0.7, metal = 0) { return mStd(hex, rough, metal); }
function kkGlow(hex, k = 3) { return mGlow(hex, k); }
function kkMesh(geo, mat, pos, rot, scl) { const m = new THREE.Mesh(geo, mat); if (pos) m.position.set(...pos); if (rot) m.rotation.set(...rot); if (scl) typeof scl === 'number' ? m.scale.setScalar(scl) : m.scale.set(...scl); return m; }
const KP = {
  // a wide-brimmed frontier hat
  wideHat(col, band) { const g = new THREE.Group(); g.add(kkMesh(new THREE.CylinderGeometry(0.62, 0.66, 0.06, 20), kkMat(col)), kkMesh(new THREE.CylinderGeometry(0.34, 0.4, 0.42, 16), kkMat(col), [0, 0.22, 0]), kkMesh(new THREE.CylinderGeometry(0.41, 0.41, 0.08, 16), kkMat(band), [0, 0.07, 0])); return g; },
  boiler() {
    const g = new THREE.Group(), brass = kkMat(0xb8862e, 0.45, 0.6), dark = kkMat(0x2a2522, 0.6, 0.4);
    g.add(kkMesh(new THREE.CylinderGeometry(0.34, 0.34, 0.8, 16), brass));
    g.add(kkMesh(new THREE.SphereGeometry(0.34, 16, 8, 0, TAU, 0, Math.PI / 2), brass, [0, 0.4, 0]));
    for (const y of [-0.28, 0.05, 0.3]) g.add(kkMesh(new THREE.TorusGeometry(0.345, 0.03, 6, 20), dark, [0, y, 0], [Math.PI / 2, 0, 0]));
    for (const x of [-0.16, 0.16]) { g.add(kkMesh(new THREE.CylinderGeometry(0.07, 0.08, 0.5, 10), dark, [x, 0.7, 0.05])); g.add(kkMesh(new THREE.CylinderGeometry(0.1, 0.07, 0.08, 10), dark, [x, 0.96, 0.05])); }
    g.add(kkMesh(new THREE.CircleGeometry(0.12, 16), kkGlow(0xff7a2e, 3), [0, -0.05, 0.345]));
    const tip = new THREE.Object3D(); tip.position.set(0, 1.0, 0.05); g.add(tip); g.userData.tip = tip;
    return g;
  },
  nozzle() { const g = new THREE.Group(), dark = kkMat(0x2a2522, 0.5, 0.5), brass = kkMat(0xb8862e, 0.4, 0.6); g.add(kkMesh(new THREE.CylinderGeometry(0.07, 0.09, 0.7, 10), dark, [0, 0.25, 0])); g.add(kkMesh(new THREE.CylinderGeometry(0.12, 0.08, 0.22, 12), brass, [0, 0.66, 0])); g.add(kkMesh(new THREE.BoxGeometry(0.1, 0.22, 0.16), dark, [0, 0, 0.05])); g.add(kkMesh(new THREE.CylinderGeometry(0.03, 0.03, 0.12, 6), kkGlow(0xff8a3a, 4), [0, 0.8, 0])); return g; },
  crystal(glow, s = 1) { const g = new THREE.Group(); g.add(kkMesh(new THREE.OctahedronGeometry(0.16, 0), kkGlow(glow, 2.2), [0, 0.24, 0], null, [0.6 * s, 1.5 * s, 0.6 * s])); g.add(kkMesh(new THREE.OctahedronGeometry(0.08, 0), kkGlow(glow, 3), [0.1, 0.12, 0], [0, 0, 0.5], [0.6 * s, 1.4 * s, 0.6 * s])); return g; },
  candle() { const g = new THREE.Group(); g.add(kkMesh(new THREE.CylinderGeometry(0.16, 0.18, 0.5, 12), kkMat(0xf0e2c0, 0.8))); g.add(kkMesh(new THREE.CylinderGeometry(0.2, 0.18, 0.08, 12), kkMat(0xe6d2a6, 0.8), [0, -0.03, 0])); for (let i = 0; i < 4; i++) g.add(kkMesh(new THREE.CapsuleGeometry(0.035, 0.12, 2, 6), kkMat(0xf0e2c0, 0.8), [Math.cos(i * 1.7) * 0.15, 0.1 - i * 0.05, Math.sin(i * 1.7) * 0.15])); g.add(kkMesh(new THREE.CylinderGeometry(0.01, 0.01, 0.08, 4), kkMat(0x222222), [0, 0.29, 0])); const fl = kkMesh(new THREE.SphereGeometry(0.07, 10, 8), kkGlow(0xffb84a, 5), [0, 0.38, 0], null, [0.8, 1.6, 0.8]); g.add(fl); g.userData.flame = fl; return g; },
  lantern(glow) { const g = new THREE.Group(), iron = kkMat(0x2b2620, 0.6, 0.5); g.add(kkMesh(new THREE.CylinderGeometry(0.16, 0.18, 0.05, 6), iron)); g.add(kkMesh(new THREE.CylinderGeometry(0.1, 0.16, 0.08, 6), iron, [0, 0.36, 0])); for (let i = 0; i < 6; i++) g.add(kkMesh(new THREE.BoxGeometry(0.025, 0.32, 0.025), iron, [Math.cos(i / 6 * TAU) * 0.15, 0.18, Math.sin(i / 6 * TAU) * 0.15])); g.add(kkMesh(new THREE.CylinderGeometry(0.13, 0.13, 0.3, 6), kkGlow(glow, 2.4), [0, 0.18, 0])); g.add(kkMesh(new THREE.TorusGeometry(0.07, 0.015, 6, 12), iron, [0, 0.46, 0])); return g; },
  flask(glow) { const g = new THREE.Group(); g.add(kkMesh(new THREE.SphereGeometry(0.14, 12, 10), kkGlow(glow, 1.6))); g.add(kkMesh(new THREE.CylinderGeometry(0.05, 0.06, 0.12, 8), kkMat(0x6a8a6a, 0.3), [0, 0.15, 0])); g.add(kkMesh(new THREE.CylinderGeometry(0.06, 0.055, 0.05, 8), kkMat(0x7a5a3a), [0, 0.22, 0])); return g; },
  clockFace() { const g = new THREE.Group(), gold = kkMat(0xd8a838, 0.35, 0.7); g.add(kkMesh(new THREE.CylinderGeometry(0.42, 0.42, 0.1, 24), gold, null, [Math.PI / 2, 0, 0])); g.add(kkMesh(new THREE.CylinderGeometry(0.36, 0.36, 0.11, 24), kkMat(0xf2ead6, 0.6), null, [Math.PI / 2, 0, 0])); for (let i = 0; i < 12; i++) g.add(kkMesh(new THREE.BoxGeometry(0.03, 0.07, 0.02), kkMat(0x222222), [Math.sin(i / 12 * TAU) * 0.3, Math.cos(i / 12 * TAU) * 0.3, 0.06], [0, 0, -i / 12 * TAU])); const h1 = kkMesh(new THREE.BoxGeometry(0.03, 0.22, 0.02), kkMat(0x1a1a1a), [0, 0.1, 0.075]), h2 = kkMesh(new THREE.BoxGeometry(0.025, 0.3, 0.02), kkGlow(0x8ad8ff, 3), [0.07, -0.07, 0.08], [0, 0, 2.3]); g.add(h1, h2); g.add(kkMesh(new THREE.BoxGeometry(0.02, 0.5, 0.03), kkMat(0x111111), [-0.08, 0.02, 0.07], [0, 0, 0.5])); g.userData.hands = [h1, h2]; return g; },
  halo(glow) { const g = new THREE.Group(), gold = kkMat(0xd8a838, 0.35, 0.7); g.add(kkMesh(new THREE.TorusGeometry(0.55, 0.025, 6, 40), gold, null, [Math.PI / 2 - 0.25, 0, 0])); for (let i = 0; i < 3; i++) g.add(kkMesh(new THREE.SphereGeometry(0.07 - i * 0.015, 10, 8), i ? kkGlow(glow, 2.5) : kkMat(0xe07a3a), [Math.cos(i * 2.1) * 0.55, Math.sin(i * 2.1) * 0.12, Math.sin(i * 2.1) * 0.55])); g.userData.spin = true; return g; },
  starTip(glow) { const g = new THREE.Group(); g.add(kkMesh(new THREE.OctahedronGeometry(0.13, 0), kkGlow(glow, 4))); g.add(kkMesh(new THREE.TorusGeometry(0.2, 0.015, 6, 24), kkMat(0xd8a838, 0.35, 0.7), null, [0.4, 0, 0])); return g; },
  rod() { const g = new THREE.Group(), cu = kkMat(0xc0703a, 0.35, 0.8); g.add(kkMesh(new THREE.CylinderGeometry(0.03, 0.03, 1.5, 8), cu)); for (const y of [0.3, 0.5, 0.7]) g.add(kkMesh(new THREE.TorusGeometry(0.07, 0.012, 6, 12), cu, [0, y, 0], [Math.PI / 2, 0, 0])); g.add(kkMesh(new THREE.ConeGeometry(0.05, 0.16, 8), kkGlow(0x8ad8ff, 4), [0, 0.82, 0])); return g; },
  spools() { const g = new THREE.Group(), wood = kkMat(0x8a5a32), red = kkMat(0xb02a3a); for (const x of [-0.2, 0.2]) { g.add(kkMesh(new THREE.CylinderGeometry(0.11, 0.11, 0.24, 12), red, [x, 0, 0], [0, 0, Math.PI / 2])); g.add(kkMesh(new THREE.CylinderGeometry(0.14, 0.14, 0.04, 12), wood, [x - 0.13, 0, 0], [0, 0, Math.PI / 2])); g.add(kkMesh(new THREE.CylinderGeometry(0.14, 0.14, 0.04, 12), wood, [x + 0.13, 0, 0], [0, 0, Math.PI / 2])); } return g; },
  glaiveBack(glow) { const g = buildGlaive(glow, 1.6); return g; },
  claws() { const g = new THREE.Group(), b = kkMat(0xf0e6d0, 0.5); for (let i = 0; i < 3; i++) g.add(kkMesh(new THREE.ConeGeometry(0.05, 0.42, 6), b, [(i - 1) * 0.1, 0.25, 0.08], [0.5, 0, (i - 1) * 0.15])); return g; },
  bones() { const g = new THREE.Group(), b = kkMat(0xe9dcc2, 0.8); for (let i = 0; i < 3; i++) g.add(kkMesh(new THREE.CapsuleGeometry(0.035, 0.3, 2, 6), b, [i * 0.08 - 0.08, 0, 0], [0.3, 0, (i - 1) * 0.3])); return g; },
  horns() { const g = new THREE.Group(), b = kkMat(0xe9dcc2, 0.7); for (const s of [-1, 1]) g.add(kkMesh(new THREE.ConeGeometry(0.08, 0.4, 8), b, [s * 0.38, 0.25, 0], [0, 0, -s * 0.9])); return g; },
};

// ---------------------------------------------------------------- the heroes, dressed
// recolor: swatch 'col row' → colour. keep: pack items left showing. items: borrowed from another body, by slot.
const KK_LOOK = {
  marrow: {
    body: 'Barbarian', hide: ['Barbarian_Hat'], keep: ['Barbarian_Cape'], style: STYLE_KK.r2,
    recolor: { 12: '#6b5236', 13: '#4a3826', 24: '#7a6040', 25: '#4e3c28', '02': '#6e5a3a', '05': '#c8b48a', 23: '#b8a07a', 22: '#d8c8a8' },
    items: [{ from: 'Rogue', name: '2H_Crossbow', slot: 'handslotr', muzzle: true }],
    props: c => { const h = KP.wideHat(0x4a3622, 0x8a2a1a); h.position.set(0, 0.92, 0); h.rotation.x = -0.08; c.add('head', h); },
  },
  lark: {
    body: 'Rogue', keep: [], style: STYLE_KK.throw,
    recolor: { '02': '#5a3ccc', '03': '#2e1f78', 12: '#7a5cff', 13: '#3d2a99', 50: '#d8d0ff', 55: '#4a3a6a' },
    props: c => { const k = KP.crystal(c.glow); c.add('handslotr', k); c.crystal = k; const k2 = KP.crystal(c.glow, 0.7); c.add('handslotl', k2); },
    muzzleProp: 'crystal',
  },
  gauge: {
    body: 'Knight', keep: ['Knight_Helmet'], style: { aim: '2H_Ranged_Aiming', shoot: '2H_Ranged_Shoot', hold: '2H_Ranged_Shooting', charge: 'Block' },
    recolor: { 30: '#c8963a', 31: '#9a6a24', 32: '#d4a24a', 33: '#8a5a20', 70: '#d0a040', 22: '#c8963a', '02': '#e86a1a', '03': '#a8400e', 25: '#b84a12', 41: '#3a2a20', 73: '#3a2a20' },
    props: c => { const b = KP.boiler(); b.position.set(0, 0.3, -0.55); c.add('chest', b); c.stack = b.userData.tip; const n = KP.nozzle(); n.rotation.x = 0; c.add('handslotr', n); c.nozzle = n; },
    muzzleProp: 'nozzle', scale: 1.08,
  },
  veil: {
    body: 'Rogue_Hooded', keep: ['Knife', 'Knife_Offhand', 'Rogue_Cape'], style: STYLE_KK.dual, eyes: 0xc48aff,
    recolor: { '02': '#2a2238', '03': '#15111f', 12: '#3a2e52', 13: '#1e1830', 50: '#5a4a6a', 55: '#241c30', 54: '#3a2e44', '05': '#4a3e5a', 32: '#6a6478', 33: '#3a3644' },
    items: [], muzzleItemName: 'Knife',
  },
  ivra: {
    body: 'Knight', hide: ['Knight_Helmet'], keep: ['Knight_Cape'], style: STYLE_KK.staff,
    recolor: { 30: '#2a8a8a', 31: '#1a5a62', 32: '#3aa8a0', 33: '#1e6a6a', 70: '#2a9a94', 22: '#d8b048', '02': '#e8c058', '03': '#a07a20', 25: '#1a6a7a', 24: '#2a8a9a', 21: '#2a1a12', 20: '#3a2418' },
    items: [{ from: 'Mage', name: '2H_Staff', slot: 'handslotr', muzzle: true }],
    props: c => { const g = KP.glaiveBack(c.glow); g.position.set(0, 0.25, -0.45); g.rotation.set(Math.PI / 2, 0, 0.3); c.add('chest', g); },
  },
  wick: {
    body: 'Skeleton_Minion', style: STYLE_KK.cast, eyes: 0xffb84a,
    recolor: { 51: '#3a3430', 50: '#5a5048', 61: '#5a3a22' },
    props: c => { const k = KP.candle(); k.position.set(0, 0.62, 0); c.add('head', k); const l = KP.lantern(c.glow); l.position.set(0, -0.1, 0); c.add('handslotr', l); c.lantern = l; },
    muzzleProp: 'lantern',
  },
  mire: {
    body: 'Skeleton_Rogue', keep: ['Skeleton_Rogue_Hood', 'Skeleton_Rogue_Cape'], style: STYLE_KK.throw, eyes: 0x9aff5a,
    recolor: { 24: '#3e5a2a', 25: '#22341a', 12: '#c8d0a8', 13: '#9aa878', 71: '#3a3a28', 70: '#5a5a3a', 20: '#1a2414' },
    props: c => { const f = KP.flask(c.glow); c.add('handslotr', f); c.flask = f; const m = KP.flask(0x6aff5a); m.scale.setScalar(0.7); m.position.set(0.25, -0.1, 0.1); c.add('hips', m); },
    muzzleProp: 'flask',
  },
  spindle: {
    body: 'Skeleton_Warrior', hide: ['Skeleton_Warrior_Helmet'], style: STYLE_KK.throw, eyes: 0xff5a7a,
    recolor: { 24: '#a01a3a', 25: '#4a0a1c', 31: '#3a2a2e', 30: '#5a4a50', 12: '#e8dcc8', 13: '#c8b49a' },
    items: [{ from: 'Rogue', name: 'Knife', slot: 'handslotr', muzzle: true }],
    props: c => { const s = KP.spools(); s.position.set(0, 0.25, -0.35); c.add('chest', s); },
  },
  sable: {
    body: 'Skeleton_Mage', hide: ['Skeleton_Mage_Hat', 'Skeleton_Mage_Skull', 'Skeleton_Mage_Jaw', 'Skeleton_Mage_Eyes'], style: STYLE_KK.r1,
    recolor: { 24: '#1e2a5a', 25: '#121838', 54: '#d8a838', 30: '#c8a040', 70: '#2a2a3a', 71: '#1a1a26' },
    items: [{ from: 'Rogue', name: '1H_Crossbow', slot: 'handslotr', muzzle: true, tint: { 32: '#d8a838', 33: '#a07a20', 23: '#d8a838' } }],
    props: c => { const k = KP.clockFace(); k.position.set(0, 0.45, 0.12); c.add('head', k); c.clock = k; },
  },
  thane: {
    body: 'Mage', keep: ['Mage_Hat', 'Mage_Cape'], style: STYLE_KK.cast,
    recolor: { '02': '#d8a520', '03': '#8a6410', 12: '#2a3a3e', 13: '#1a2226', 14: '#2aa8c8', 15: '#1a6a8a', 22: '#2aa8c8', 23: '#1a6a8a', 50: '#c8a24a', 51: '#8a6a2a', 73: '#1a2226' },
    items: [{ from: 'Mage', name: '1H_Wand', slot: 'handslotr', muzzle: true }],
    props: c => { const r = KP.rod(); r.position.set(0.15, 0.2, -0.4); r.rotation.z = -0.25; c.add('chest', r); },
  },
  orrin: {
    body: 'Mage', hide: ['Mage_Hat'], keep: ['Mage_Cape'], style: STYLE_KK.staff,
    recolor: { '02': '#1d2a5a', '03': '#0e1430', 12: '#2a3a7a', 13: '#141c40', 14: '#d8a838', 15: '#8a6a20', 22: '#d8a838', 23: '#8a6a20', 50: '#d8a838', 10: '#e8e0f0', 73: '#0e1430' },
    items: [{ from: 'Mage', name: '2H_Staff', slot: 'handslotr', muzzle: true }],
    props: c => { const h = KP.halo(c.glow); h.position.set(0, 1.05, 0); c.add('head', h); c.halo = h; },
  },
  _minion: { body: 'Skeleton_Minion', style: STYLE_KK.claw, eyes: 0x7affb4, recolor: { 51: '#3a4a3a', 50: '#5a6a5a' } },
  bjorn: {
    body: 'Barbarian', keep: ['Barbarian_Hat', 'Barbarian_Cape', '1H_Axe', '1H_Axe_Offhand'], style: STYLE_KK.axe, beast: STYLE_KK.claw,
    props: c => { const cl = []; for (const s of ['handslotr', 'handslotl']) { const g = KP.claws(); g.visible = false; c.add(s, g); cl.push(g); } c.claws = cl; },
    recolor: { 12: '#8a2a1a', 13: '#5a180e', 24: '#9a3a22', 25: '#5a1e10', '02': '#8a2a1a', 23: '#e8dcc8' },
    muzzleItemName: '1H_Axe', scale: 1.04,
  },
  ossian: {
    body: 'Skeleton_Warrior', keep: ['Skeleton_Warrior_Helmet'], style: STYLE_KK.r1, eyes: 0x7affb4,
    recolor: { 24: '#2a4a3a', 25: '#14261c', 31: '#2a2e2a', 30: '#4a524a', 41: '#1a1e1a' },
    items: [{ from: 'Rogue', name: '1H_Crossbow', slot: 'handslotr', muzzle: true, tint: { 32: '#e9dcc2', 33: '#b8a888', 23: '#3a5a4a', 63: '#2a2a2a', 62: '#3a3a3a' } }],
    props: c => { const b = KP.bones(); b.position.set(0, 0.2, -0.38); c.add('chest', b); const h = KP.horns(); h.position.set(0, 0.6, 0); c.add('head', h); },
  },
};
