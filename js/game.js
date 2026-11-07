'use strict';
// ============================================================================
// Game modes, pickups, the control zone, match flow, drawing heroes, and the main loop
// ============================================================================
const MODES = {
  tdm: { key: 'tdm', name: 'Team Deathmatch', short: 'TDM', desc: 'Two teams. First to the kill target wins.', teams: true, time: 600 },
  koth: { key: 'koth', name: 'Control', short: 'CTRL', desc: 'Capture the zone and hold it. First team to 100% wins.', teams: true, time: 720 },
  elim: { key: 'elim', name: 'Elimination', short: 'ELIM', desc: 'No respawns. Wipe the other team to win the round. First to 3 rounds.', teams: true, time: 0 },
  ffa: { key: 'ffa', name: 'Free-for-All', short: 'FFA', desc: 'Everyone for themselves. First to 12 eliminations.', teams: false, time: 600 },
};
const MODE_KEYS = Object.keys(MODES);

const Mode = {
  create(o) {
    const sz = clamp(o.sz | 0, 1, 8);
    return {
      mode: o.mode, map: o.map, sz, df: clamp(o.df | 0, 0, 2), st: 'play', t: 0, tl: MODES[o.mode].time, sc: [0, 0],
      target: o.mode === 'tdm' ? (sz <= 2 ? 12 : sz <= 3 ? 20 : 28) : o.mode === 'ffa' ? 12 : o.mode === 'koth' ? 100 : 3,
      zone: { own: -1, cap: 0, capTeam: -1, contest: false }, rd: { n: 1, w: [0, 0], ph: 'pre', t: 4 }, win: null, winName: '', endT: 0, seed: (Math.random() * 1e9) | 0,
    };
  },
  respawns() { return Game.match && Game.match.mode !== 'elim'; },
  frozen() { const M = Game.match; return M && ((M.mode === 'elim' && M.rd.ph === 'pre') || M.st === 'end'); },
  pack() {
    const M = Game.match; if (!M) return { st: 'lobby', mode: Lobby.cfg.mode, map: Lobby.cfg.map, sz: Lobby.cfg.sz, df: Lobby.cfg.df };
    return { st: M.st, mode: M.mode, map: M.map, sz: M.sz, df: M.df, t: Math.round(M.t), tl: Math.round(M.tl), sc: [Math.round(M.sc[0] * 10) / 10, Math.round(M.sc[1] * 10) / 10], tg: M.target, z: [M.zone.own, r2(M.zone.cap), M.zone.capTeam, M.zone.contest ? 1 : 0], rd: [M.rd.n, M.rd.w[0], M.rd.w[1], M.rd.ph, r2(M.rd.t)], win: M.win, wn: M.winName, seed: M.seed };
  },
  // a client copies the host's view of the match
  apply(m) {
    const M = Game.match; if (!M) return;
    const prevRound = M.rd.n, prevPh = M.rd.ph, prevSt = M.st, prevOwn = M.zone.own;
    M.t = m.t; M.tl = m.tl; if (Array.isArray(m.sc)) M.sc = [+m.sc[0] || 0, +m.sc[1] || 0]; M.target = m.tg;
    if (Array.isArray(m.z)) { M.zone.own = m.z[0]; M.zone.cap = m.z[1]; M.zone.capTeam = m.z[2]; M.zone.contest = !!m.z[3]; }
    if (Array.isArray(m.rd)) { M.rd.n = m.rd[0]; M.rd.w = [m.rd[1], m.rd[2]]; M.rd.ph = m.rd[3]; M.rd.t = m.rd[4]; }
    M.win = m.win; M.winName = m.wn || '';
    if (m.st === 'end' && prevSt !== 'end') { M.st = 'end'; Flow.ended(); }
    if (M.mode === 'elim' && M.rd.n !== prevRound) this.newRound();
    if (M.mode === 'elim' && prevPh === 'pre' && M.rd.ph === 'fight') { Sfx.play('round'); HUD.note('FIGHT', 'big'); }
    if (M.mode === 'koth' && prevOwn !== M.zone.own && M.zone.own >= 0) this.zoneTaken(M.zone.own);
  },
  newRound() {
    const M = Game.match;
    for (const a of Game.actors) if (!a.remote) { a.respawnT = 0; spawnActor(a); }
    for (const s of [...Game.snares.values()]) removeSnare(s);
    HUD.note(`ROUND ${M.rd.n}`, 'big'); Sfx.play('zone');
  },
  zoneTaken(team) { const mine = Game.me && team === Game.me.team; HUD.note(mine ? 'Zone captured' : 'The enemy took the zone', mine ? 'good' : 'warn'); Sfx.play('zone'); },
  onKill(k, v) {
    const M = Game.match; if (!M || M.st !== 'play' || !v) return;
    if (M.mode === 'tdm' && k && k !== v && isEnemy(k, v)) M.sc[k.team]++;
    if (M.mode === 'tdm' && (!k || k === v)) M.sc[1 - v.team] += 0;
  },
  tick(dt) {
    const M = Game.match; if (!M) return;
    if (M.st === 'end') { M.endT += dt; return; }
    M.t += dt;
    if (M.tl > 0 && M.mode !== 'elim') { M.tl = Math.max(0, M.tl - dt); }
    if (M.mode === 'tdm') {
      if (M.sc[0] >= M.target || M.sc[1] >= M.target) return this.finish(M.sc[0] > M.sc[1] ? 0 : 1);
      if (M.tl <= 0) return this.finish(M.sc[0] === M.sc[1] ? -1 : M.sc[0] > M.sc[1] ? 0 : 1);
    } else if (M.mode === 'ffa') {
      let best = null; for (const a of Game.actors) if (!best || a.k > best.k) best = a;
      if (best && best.k >= M.target) return this.finish(best.id);
      if (M.tl <= 0) return this.finish(best ? best.id : -1);
    } else if (M.mode === 'koth') {
      const z = World.zone, Z = M.zone, inside = [0, 0];
      for (const a of Game.actors) if (a.alive && Math.hypot(a.pos.x - z.x, a.pos.z - z.z) < z.r && a.pos.y > z.y - 1 && a.pos.y < z.y + 3.5) inside[a.team]++;
      Z.contest = inside[0] > 0 && inside[1] > 0;
      const solo = !Z.contest && (inside[0] || inside[1]) ? (inside[0] ? 0 : 1) : -1;
      if (solo >= 0 && solo !== Z.own) {
        if (Z.capTeam !== solo) { Z.cap = Math.max(0, Z.cap - dt * 0.6); if (Z.cap <= 0) Z.capTeam = solo; }
        else { Z.cap = Math.min(1, Z.cap + dt / 7 * (1 + Math.min(2, inside[solo] - 1) * 0.25)); if (Z.cap >= 1) { Z.own = solo; Z.cap = 0; Z.capTeam = -1; this.zoneTaken(solo); } }
      } else if (solo < 0 && !Z.contest) Z.cap = Math.max(0, Z.cap - dt * 0.15);
      if (Z.own >= 0 && !Z.contest) M.sc[Z.own] = Math.min(100, M.sc[Z.own] + dt * (100 / 120));
      if (M.sc[0] >= 100 || M.sc[1] >= 100) return this.finish(M.sc[0] >= 100 ? 0 : 1);
      if (M.tl <= 0) return this.finish(M.sc[0] === M.sc[1] ? -1 : M.sc[0] > M.sc[1] ? 0 : 1);
    } else if (M.mode === 'elim') {
      const R = M.rd; R.t -= dt;
      if (R.ph === 'pre') { if (R.t <= 0) { R.ph = 'fight'; R.t = 120; Sfx.play('round'); HUD.note('FIGHT', 'big'); } }
      else if (R.ph === 'fight') {
        const alive = [0, 0]; let hp = [0, 0];
        for (const a of Game.actors) if (a.alive) { alive[a.team]++; hp[a.team] += a.hp / a.maxHp; }
        let w = -2;
        if (!alive[0] || !alive[1]) w = alive[0] ? 0 : alive[1] ? 1 : -1;
        else if (R.t <= 0) w = alive[0] !== alive[1] ? (alive[0] > alive[1] ? 0 : 1) : hp[0] === hp[1] ? -1 : hp[0] > hp[1] ? 0 : 1;
        if (w !== -2) {
          if (w >= 0) R.w[w]++; R.ph = 'post'; R.t = 4; R.last = w;
          const mine = Game.me && w === Game.me.team;
          HUD.note(w < 0 ? 'Round drawn' : mine ? 'Round won' : 'Round lost', w < 0 ? '' : mine ? 'good' : 'warn');
          if (R.w[0] >= M.target || R.w[1] >= M.target) return this.finish(R.w[0] > R.w[1] ? 0 : 1);
        }
      } else if (R.ph === 'post') { if (R.t <= 0) { R.n++; R.ph = 'pre'; R.t = 4; this.newRound(); } }
    }
  },
  finish(w) {
    const M = Game.match; if (M.st === 'end') return;
    M.st = 'end'; M.win = w; M.endT = 0;
    if (M.mode === 'ffa') { const a = Game.byId.get(w); M.winName = a ? a.name : ''; }
    else M.winName = w < 0 ? 'Draw' : TEAM_NAME[w];
    Flow.ended();
  },
};

// ---------------------------------------------------------------- health packs
const Pickups = {
  list: [],
  build(L) {
    this.list = World.packs.map((p, i) => {
      const g = new THREE.Group(); g.position.set(p.x, p.y, p.z); L.add(g);
      const base = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.65, 0.12, 20), SURF.iron); base.position.y = 0.06; base.receiveShadow = true; g.add(base);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.03, 6, 24), glowMat(0x74ffb4, 4)); ring.rotation.x = Math.PI / 2; ring.position.y = 0.13; g.add(ring);
      const cross = dyn(new THREE.Group()); cross.position.y = 0.75; g.add(cross);
      cross.add(new THREE.Mesh(roundBox(0.42, 0.14, 0.14, 0.04), glowMat(0x74ffb4, 3))); cross.add(new THREE.Mesh(roundBox(0.14, 0.42, 0.14, 0.04), glowMat(0x74ffb4, 3)));
      G.anim.push(t => { cross.rotation.y = t * 1.5 + i; cross.position.y = 0.75 + Math.sin(t * 2 + i) * 0.08; });
      addLightSource(p.x, p.y + 0.8, p.z, 0x74ffb4, 0.8, 5, null);
      return { i, pos: new V3(p.x, p.y, p.z), t: 0, cross, g };
    });
  },
  check(a) {
    if (a.hp >= a.maxHp) return;
    for (const p of this.list) if (p.t <= 0 && Math.abs(a.pos.x - p.pos.x) < 0.9 && Math.abs(a.pos.z - p.pos.z) < 0.9 && Math.abs(a.pos.y - p.pos.y) < 1.2) { a.hp = Math.min(a.maxHp, a.hp + 100); emit(['pk', p.i, a.id]); if (a === Game.me) { Sfx.play('pickup'); G.fx.heal = 0.6; } }
  },
  take(i, who) { const p = this.list[i]; if (!p) return; p.t = 20; Fx.burst(p.pos.clone().setY(p.pos.y + 0.7), 0x74ffb4, 16, 2, 0.6, 0.08, { up: 1 }); void who; },
  tick(dt) { for (const p of this.list) { if (p.t > 0) p.t -= dt; p.cross.visible = p.t <= 0; } },
  nearest(pos) { let best = null; for (const p of this.list) if (p.t <= 0) { const d = p.pos.distanceTo(pos); if (!best || d < best.dist) best = { pos: p.pos, dist: d }; } return best; },
};

// ---------------------------------------------------------------- the control zone
const Zone = {
  g: null,
  build(L) {
    this.g = null; const z = World.zone; if (!z) return;
    const g = this.g = dyn(new THREE.Group()); g.position.set(z.x, z.y + 0.03, z.z); L.add(g);
    const ringGeo = new THREE.RingGeometry(z.r - 0.18, z.r, 72); ringGeo.rotateX(-Math.PI / 2);
    this.ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, depthWrite: false, toneMapped: false })); g.add(this.ring);
    const fill = new THREE.CircleGeometry(z.r, 72); fill.rotateX(-Math.PI / 2);
    this.fill = new THREE.Mesh(fill, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.08, depthWrite: false, blending: THREE.AdditiveBlending })); g.add(this.fill);
    const wall = new THREE.CylinderGeometry(z.r, z.r, 2.6, 72, 1, true);
    const cv = document.createElement('canvas'); cv.width = 4; cv.height = 64; const c = cv.getContext('2d'), gr = c.createLinearGradient(0, 64, 0, 0); gr.addColorStop(0, 'rgba(255,255,255,0.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = gr; c.fillRect(0, 0, 4, 64);
    this.wall = new THREE.Mesh(wall, new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(cv), color: 0xffffff, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending })); this.wall.position.y = 1.3; g.add(this.wall);
    const prog = new THREE.RingGeometry(z.r + 0.08, z.r + 0.42, 72, 1, 0, TAU); prog.rotateX(-Math.PI / 2);
    this.prog = new THREE.Mesh(prog, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, depthWrite: false, toneMapped: false })); g.add(this.prog);
    g.visible = false;
  },
  update() {
    if (!this.g) return; const M = Game.match; this.g.visible = !!M && M.mode === 'koth';
    if (!this.g.visible) return;
    const Z = M.zone, me = Game.me, col = t => t < 0 ? new THREE.Color(0xe8e8f0) : (me && t === me.team ? new THREE.Color(TEAM_HEX[0]) : new THREE.Color(ENEMY_HEX));
    const c = Z.contest ? new THREE.Color(0xffd23a) : col(Z.own), pulse = 1 + Math.sin(G.time * 4) * 0.3 * (Z.contest ? 1 : 0.2);
    this.ring.material.color.copy(c).multiplyScalar(2.5 * pulse); this.fill.material.color.copy(c); this.wall.material.color.copy(c).multiplyScalar(0.5);
    const cp = Z.cap > 0 && Z.capTeam >= 0;
    this.prog.visible = cp; if (cp) { this.prog.material.color.copy(col(Z.capTeam)).multiplyScalar(3); this.prog.scale.set(1, 1, 1); const geo = this.prog.geometry, z = World.zone; geo.dispose(); const g2 = new THREE.RingGeometry(z.r + 0.08, z.r + 0.42, 72, 1, Math.PI / 2, -TAU * Z.cap); g2.rotateX(-Math.PI / 2); this.prog.geometry = g2; }
  },
};

// ---------------------------------------------------------------- drawing heroes
const SHIMMER_MAT = new THREE.MeshStandardMaterial({ color: 0x101018, metalness: 1, roughness: 0.04, transparent: true, opacity: 0.22, envMapIntensity: 2.5, depthWrite: false });
const XRAY_MAT = { enemy: new THREE.MeshBasicMaterial({ color: hdrCol(0xff2040, 1.6), transparent: true, opacity: 0.4, depthTest: false, depthWrite: false }), ally: new THREE.MeshBasicMaterial({ color: hdrCol(0x2ee6ff, 1.2), transparent: true, opacity: 0.25, depthTest: false, depthWrite: false }) };
function setLook(a, look) {
  if (a.look === look) return; a.look = look;
  for (const m of a.model.meshes) m.material = look === 'shimmer' ? SHIMMER_MAT : m.userData.base;
  a.model.root.visible = look !== 'hidden' && a.alive !== false;
}
function setXray(a, kind) {
  if ((a.xrayKind || null) === kind) return; a.xrayKind = kind;
  if (!a.xray) { a.xray = []; for (const m of a.model.meshes) { const x = new THREE.SkinnedMesh(m.geometry, XRAY_MAT.enemy); x.bind(m.skeleton, m.bindMatrix); x.renderOrder = 20; x.frustumCulled = false; x.castShadow = false; m.parent.add(x); a.xray.push(x); } }
  for (const x of a.xray) { x.visible = !!kind; if (kind) x.material = XRAY_MAT[kind]; }
}
// remote heroes are drawn 110 ms in the past, between the two snapshots around that moment
function interp(a, t) {
  const S = a.snaps; if (!S.length) return;
  const rt = t - 0.11; let i = S.length - 1;
  while (i > 0 && S[i - 1].t > rt) i--;
  const b = S[i], p = i > 0 ? S[i - 1] : b;
  a.renderPos = a.renderPos || new V3();
  if (b.t <= rt || p === b) {
    const ex = clamp(rt - b.t, 0, 0.12);
    a.renderPos.set(b.x + b.vx * ex, b.y, b.z + b.vz * ex); a.yaw = b.yaw; a.pitch = b.pitch;
  } else {
    const f = clamp((rt - p.t) / Math.max(1e-3, b.t - p.t), 0, 1);
    a.renderPos.set(lerp(p.x, b.x, f), lerp(p.y, b.y, f), lerp(p.z, b.z, f)); a.yaw = p.yaw + angDiff(p.yaw, b.yaw) * f; a.pitch = lerp(p.pitch, b.pitch, f);
  }
  a.pos.copy(a.renderPos); a.vel.set(b.vx, b.vy || 0, b.vz);
}
const BEAM_MAT = new THREE.MeshBasicMaterial({ color: hdrCol(0x5affd2, 3), transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
const BEAM_CORE = new THREE.MeshBasicMaterial({ color: hdrCol(0xe8fff8, 5), toneMapped: false });
const SHIELD_MAT = new THREE.MeshBasicMaterial({ color: hdrCol(0xffd27a, 0.7), transparent: true, opacity: 0.25, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
function drawExtras(a, f, p, dt) {
  const M = a.model, X = a.fx || (a.fx = {});
  // Sable sees a faint echo of herself where Rewind would take her
  if (a === Game.me && a.P.key === 'rewind' && a.pw.charges > 0) { const to = rewindPoint(a); if (to && Math.random() < dt * 30) Fx.spawn('add', to.x + rand(-0.3, 0.3), to.y + rand(0.1, 1.8), to.z + rand(-0.3, 0.3), 0, 0.4, 0, 0.6, 1.4, 2, 0.06, 0.5); }
  const muzzle = () => a === Game.me ? View.muzzleWorld(0) : M.muzzle.getWorldPosition(new V3());
  // Tidecaller's beam: a twisting rope of water from the staff into the target's chest
  const bt = a.remote ? a.beamTo : a.beamT, beamOn = !!(f & F_BEAM) && bt && bt.alive;
  if (beamOn) {
    if (!X.beam) { X.beam = new THREE.Group(); const g = new THREE.CylinderGeometry(1, 1, 1, 8, 1, true); g.translate(0, 0.5, 0); g.rotateX(Math.PI / 2); X.beam.add(new THREE.Mesh(g, BEAM_MAT)); const c = new THREE.Mesh(g, BEAM_CORE); c.scale.set(0.3, 0.3, 1); X.beam.add(c); X.beam.children.forEach(m => { m.frustumCulled = false; }); G.scene.add(X.beam); }
    const o = muzzle(), tp = chest(bt), len = o.distanceTo(tp), w = 0.05 + Math.sin(G.time * 30) * 0.012 + (a.lockT || 0) * 0.02;
    X.beam.visible = true; X.beam.position.copy(o); X.beam.lookAt(tp); X.beam.children[0].scale.set(w, w, -len); X.beam.children[1].scale.set(w * 0.3, w * 0.3, -len);
    if (Math.random() < dt * 30) { const k = Math.random(); Fx.spawn('add', lerp(o.x, tp.x, k), lerp(o.y, tp.y, k), lerp(o.z, tp.z, k), rand(-0.5, 0.5), rand(-0.5, 0.5), rand(-0.5, 0.5), 0.6, 3, 2.4, 0.06, 0.35); }
    if ((X.bT = (X.bT || 0) - dt) <= 0) { X.bT = 0.3; Sfx.play('beam', a === Game.me ? null : p, 0.5); }
    if (Math.random() < dt * 14) Fx.spawn('add', tp.x, tp.y, tp.z, (o.x - tp.x) * 0.8, (o.y - tp.y) * 0.8, (o.z - tp.z) * 0.8, 3, 0.6, 0.8, 0.08, 0.6);
  } else if (X.beam) X.beam.visible = false;
  // Boiler: a roaring tongue of flame with smoke curling off it
  if (f & F_FLAME) {
    const o = muzzle(), d = aimDir(a.yaw, a.pitch), W = a.H.weapon, n = Math.ceil(dt * 90);
    for (let i = 0; i < n; i++) {
      const sp = rand(9, 13), s = W.cone * 0.8, dd = d.clone().add(new V3(rand(-s, s), rand(-s, s) * 0.7, rand(-s, s))).normalize();
      Fx.spawn('add', o.x, o.y, o.z, dd.x * sp + a.vel.x, dd.y * sp + 0.6, dd.z * sp + a.vel.z, 4, rand(1.2, 2.2), 0.35, rand(0.12, 0.22), W.range / sp, 2.6, -2);
    }
    if (Math.random() < dt * 14) { const q = o.clone().addScaledVector(d, rand(3, 6)); Fx.spawn('smoke', q.x, q.y + 0.4, q.z, d.x, 1.4, d.z, 0.16, 0.14, 0.13, 0.4, 1.3, 0.8, -0.4, 1.4); }
    if (a !== Game.me && Math.random() < dt * 10) muzzleLight(o.clone().addScaledVector(d, 2), 0xff7a2e, 6);
    if (a !== Game.me && (X.sT = (X.sT || 0) - dt) <= 0) { X.sT = 0.22; Sfx.play('flame', p, 0.7); }
  }
  // Ivra's orbiting glaives
  const orb = (f & F_ORBIT) ? (a.remote ? a.orbitN : a.pw.count) | 0 : 0;
  if (orb > 0) {
    if (!X.orbit) { X.orbit = new THREE.Group(); for (let i = 0; i < 6; i++) X.orbit.add(buildGlaive(a.H.look.glow, 0.9)); G.scene.add(X.orbit); }
    X.orbit.visible = true; X.orbit.position.set(p.x, p.y + 1.0, p.z);
    X.orbit.children.forEach((g, i) => { g.visible = i < orb; const ang = G.time * 4 + i / orb * TAU; g.position.set(Math.cos(ang) * 1.8, Math.sin(G.time * 3 + i) * 0.15, Math.sin(ang) * 1.8); g.rotation.y = G.time * 20; });
  } else if (X.orbit) X.orbit.visible = false;
  // Lantern shell
  if (f & F_SHIELD) { if (!X.shield) { X.shield = new THREE.Mesh(new THREE.IcosahedronGeometry(1.15, 2), SHIELD_MAT); G.scene.add(X.shield); } X.shield.visible = true; X.shield.position.set(p.x, p.y + 1.0, p.z); X.shield.rotation.y = G.time; }
  else if (X.shield) X.shield.visible = false;
}
function clearExtras(a) { if (!a.fx) return; for (const k in a.fx) { const o = a.fx[k]; if (o && o.isObject3D && o.parent) o.parent.remove(o); } a.fx = null; }
function drawActor(a, dt) {
  const M = a.model; if (!M) return;
  const me = Game.me, local = !a.remote;
  if (!local) interp(a, now());
  const p = local ? a.pos : (a.renderPos || a.pos);
  M.root.position.copy(p);
  M.root.rotation.y = a.yaw;
  const f = local ? actorFlags(a) : (a.flags || 0), An = a.anim;
  M.t += dt;
  // death: the legs go, the body folds and topples, then sinks away
  if (!a.alive) {
    if (a.fx) for (const k in a.fx) if (a.fx[k] && a.fx[k].isObject3D) a.fx[k].visible = false;
    if (An.death > 0) {
      An.death += dt; const k = Math.min(1, An.death / 0.6), e = k * k;
      poseHero(M, { spd: 0, phase: 0, air: 0, pitch: -0.6 * e, flags: 0, t: M.t, crouch: e * 0.9 });
      M.body.rotation.x = -e * 1.45; M.body.position.y = -Math.max(0, An.death - 1.8) * 0.6 + e * 0.15; M.body.position.z = e * 0.4;
      M.root.visible = a !== me && An.death < 3.4; setXray(a, null);
    } else M.root.visible = false;
    return;
  }
  M.body.rotation.x = 0; M.body.position.z = 0;
  // walking
  const hs = Math.hypot(a.vel.x, a.vel.z); An.spd = damp(An.spd, hs, 10, dt);
  const fwd = flatFwd(a.yaw), along = (a.vel.x * fwd.x + a.vel.z * fwd.z) >= -0.5 ? 1 : -1;
  An.phase += dt * An.spd * 1.45 * along;
  const air = !(f & F_GROUND); An.air = damp(An.air, air ? 1 : 0, 8, dt);
  if (An.swing > 0) { An.swing += dt; if (An.swing > 0.45) An.swing = 0; }
  An.crouch = damp(An.crouch || 0, f & F_PLACE ? 0.8 : 0, 10, dt);
  An.sub = damp(An.sub || 0, f & F_SUB ? 1 : 0, 6, dt);
  poseHero(M, { spd: An.spd, phase: An.phase, air: An.air, pitch: a.pitch, flags: f, swing: An.swing, swingSide: a.swingSide || 1, t: M.t, crouch: An.crouch });
  // Submerge: Mire sinks into the ground, leaving a ripple
  M.body.position.y = -An.sub * 2.1;
  if (An.sub > 0.3 && Math.random() < dt * 10) Fx.spawn('add', p.x + rand(-0.5, 0.5), p.y + 0.05, p.z + rand(-0.5, 0.5), 0, 0.6, 0, 0.6, 1.4, 0.4, 0.1, 0.5);
  if (a.hitFlash > 0) a.hitFlash -= dt;
  // ram trail, boiler smoke, blink glow, heal motes
  if (f & F_CHARGE && Math.random() < dt * 40) Fx.spawn('add', p.x + rand(-0.3, 0.3), p.y + rand(0.3, 1.6), p.z + rand(-0.3, 0.3), -fwd.x * 6, rand(0, 1), -fwd.z * 6, 4, 1.6, 0.4, 0.12, 0.3, 2);
  if ((f & F_REV || a.heroKey === 'gauge') && Math.random() < dt * (f & F_REV ? 24 : 3)) { const q = M.bones.chest.localToWorld(new V3(rand(-0.13, 0.13), 0.78, 0.3)); Fx.spawn('smoke', q.x, q.y, q.z, 0, 1.5, 0, 0.25, 0.22, 0.2, 0.25, 1.0, 1, -0.3, 1); }
  if (f & F_BLINKCH && Math.random() < dt * 30) Fx.spawn('add', p.x + rand(-0.5, 0.5), p.y + rand(0.2, 1.8), p.z + rand(-0.5, 0.5), 0, 0.5, 0, 1.4, 1.0, 3, 0.07, 0.4);
  if (f & F_UNBOUND && Math.random() < dt * 20) Fx.spawn('add', p.x + rand(-0.4, 0.4), p.y + rand(0.2, 1.8), p.z + rand(-0.4, 0.4), 0, 1, 0, 2.4, 1.6, 4, 0.08, 0.5);
  if (f & F_HEAL && Math.random() < dt * 12) Fx.spawn('add', p.x + rand(-0.4, 0.4), p.y + rand(0.2, 1.4), p.z + rand(-0.4, 0.4), 0, 1.2, 0, 0.6, 3, 1.4, 0.06, 0.7);
  if (f & F_ROOT && Math.random() < dt * 8) Fx.spawn('add', p.x + rand(-0.3, 0.3), p.y + 0.1, p.z + rand(-0.3, 0.3), 0, 0.4, 0, 3, 1.2, 0.4, 0.06, 0.4);
  if (f & F_CHANNEL && Math.random() < dt * 16) Fx.spawn('add', p.x + rand(-0.5, 0.5), p.y + rand(0.4, 1.6), p.z + rand(-0.5, 0.5), 0, 0.8, 0, 3, 2.2, 0.8, 0.06, 0.6);
  drawExtras(a, f, p, dt);
  M.root.visible = true;
  if (f & F_PROT) M.root.visible = Math.sin(G.time * 30) > -0.3 || a === me;
  // visibility: fading Veils, true invisibility, reveal
  if (a === me) { M.root.visible = false; return; }
  const enemy = me ? isEnemy(me, a) : true;
  const cl = local ? cloakLevel(a) : (a.cl || 0), revealed = !!(f & F_REVEAL);
  let look = 'normal';
  if (cl > 0.01) {
    const P = a.P, d = me ? me.pos.distanceTo(p) : 0, flick = a.st.flick > 0 && local;
    if (!enemy) look = cl > 0.5 ? 'shimmer' : 'normal';
    else if (f & F_NIGHT && !(cl < 0.5)) look = 'hidden';
    else if (cl >= 0.99) look = d < (P.shimmer || 8) || flick ? 'shimmer' : 'hidden';
    else look = Math.random() < cl ? (d < (P.shimmer || 8) ? 'shimmer' : 'hidden') : 'normal';
  }
  a.look = null; setLook(a, look);
  if (f & F_PROT && Math.sin(G.time * 30) <= -0.3) M.root.visible = false;
  const sense = me && me.st && me.st.senseT > 0 && me.P.sense && me.pos.distanceTo(p) < me.P.sense;
  setXray(a, enemy && (revealed || sense) ? 'enemy' : (!enemy && me && me.alive === false && Game.match && Game.match.mode === 'elim') ? 'ally' : null);
  if (enemy && (revealed || sense) && look === 'hidden') { M.root.visible = true; for (const m of M.meshes) m.material = SHIMMER_MAT; a.look = 'shimmer'; }
}

// ---------------------------------------------------------------- match flow
const Flow = {
  // a match on this machine only, against bots
  startOffline(o) {
    Net.leave();
    this.begin(o, true);
  },
  begin(o, host) {
    this.clear(); Showcase.hide(); Showcase.map = null;
    Game.match = Mode.create(o);
    World.load(MAPS[o.map]); buildLevel(MAPS[o.map]);
    const team = MODES[o.mode].teams ? clamp(Net.team | 0, 0, 1) : 0;
    const me = addActor({ id: Net.uid, name: Settings.name, team, hero: Settings.hero, addons: loadoutFor(Settings.hero) });
    Game.me = me; rebuildModel(me);
    if (MODES[o.mode].mode === 'ffa' || o.mode === 'ffa') me.team = 0;
    if (host) this.fillBots();
    if (o.mode === 'ffa') this.ffaTeams();
    for (const a of Game.actors) { if (a !== me) rebuildModel(a); if (!a.remote) spawnActor(a); }
    Game.state = 'play'; Game.t = 0;
    View.setHero(me.heroKey); HUD.start(); UI.show(null); Input.lock();
    if (o.mode === 'elim') HUD.note('ROUND 1', 'big');
    else HUD.note(MODES[o.mode].name.toUpperCase(), 'big');
    Sfx.play('round');
  },
  clear() {
    for (const a of [...Game.actors]) removeActor(a);
    for (const s of [...Game.snares.values()]) removeSnare(s);
    for (const p of Game.projs) G.scene.remove(p.mesh); Game.projs = [];
    for (const w of [...Game.walls.values()]) removeWall(w);
    for (const d of Game.decoys) G.scene.remove(d.m.root); Game.decoys = []; Game.fires = [];
    Bots.B.clear(); Game.me = null; Game.match = null;
  },
  // the host keeps every side at strength with bots
  fillBots() {
    const M = Game.match; if (!M || !Net.isHost()) return;
    const humans = Game.actors.filter(a => !a.isBot);
    if (M.mode === 'ffa') {
      const want = Math.max(0, M.sz - humans.length), bots = Game.actors.filter(a => a.isBot);
      while (bots.length < want) bots.push(this.addBot(0));
      while (bots.length > want) removeActor(bots.pop());
      return;
    }
    for (const t of [0, 1]) {
      const h = humans.filter(a => a.team === t).length, bots = Game.actors.filter(a => a.isBot && a.team === t);
      const want = Math.max(0, M.sz - h);
      while (bots.length < want) bots.push(this.addBot(t));
      while (bots.length > want) { const b = bots.pop(); Bots.forget(b); removeActor(b); }
    }
  },
  addBot(team) {
    const usedNames = new Set(Game.actors.map(a => a.name)), taken = new Set(Game.actors.filter(a => a.team === team).map(a => a.heroKey));
    const freeNames = BOT_NAMES.map((nm, i) => i).filter(i => !usedNames.has(BOT_NAMES[i])), n = freeNames.length ? pick(freeNames) : Math.floor(Math.random() * BOT_NAMES.length);
    const free = HERO_KEYS.filter(k => !taken.has(k)), hero = pick(free.length ? free : HERO_KEYS);
    const id = 'b' + (++Game.seq + Math.floor(Math.random() * 1000) * 100);
    const a = addActor({ id, name: BOT_NAMES[n % BOT_NAMES.length], team, hero, addons: randomLoadout(hero), bot: true, nameIdx: n % BOT_NAMES.length });
    if (Game.state === 'play' && Game.match && Game.match.mode !== 'elim') spawnActor(a);
    return a;
  },
  ffaTeams() { Game.actors.forEach((a, i) => { if (!a.remote) a.team = i % 16; }); },
  ended() {
    const M = Game.match, me = Game.me;
    const won = M.mode === 'ffa' ? M.win === (me && me.id) : me && M.win === me.team;
    Sfx.play(M.win === -1 ? 'zone' : won ? 'win' : 'lose');
    // add-on drops for the hero you finished the match as (only once you've played a real stretch of it)
    let drops = null;
    if (me && M.t > 45 && !M.awarded) { M.awarded = true; drops = { hero: me.heroKey, got: Inventory.award(me.heroKey, M.win === -1 ? 0 : won ? 1 : -1) }; }
    HUD.end(won, drops);
    Input.unlock();
  },
  leave() {
    Net.leave(); this.clear(); Game.state = 'menu'; Input.unlock(); HUD.stop(); UI.show('main'); Showcase.enter();
  },
  hostChanged(prev, h) {
    if (Game.state !== 'play') { UI.lobbyDirty = true; return; }
    if (h === Net.uid && prev && prev !== Net.uid) { HUD.note('You are now hosting the match'); this.fillBots(); }
  },
  // a client follows the host: into the match when it starts, out when it goes back to the lobby
  hostMeta(m) {
    if (!m || typeof m !== 'object') return;
    if (Game.state !== 'play' && (m.st === 'play') && MODES[m.mode] && MAPS[m.map] && Lobby.active) {
      Lobby.active = false;
      this.begin({ mode: m.mode, map: m.map, sz: m.sz, df: m.df }, false);
      // late joiners pick up the clock and the score
    }
    if (Game.state === 'play') {
      if (m.st === 'lobby') { this.backToLobby(); return; }
      Mode.apply(m);
    } else if (Lobby.active) Lobby.fromHost(m);
  },
  backToLobby() {
    const code = Net.code; this.clear(); Game.state = 'menu'; HUD.stop(); Input.unlock();
    Lobby.open(code, Net.isHost()); Showcase.enter();
  },
};

// ---------------------------------------------------------------- main loop
let lastT = performance.now(), fpsAcc = 0, fpsN = 0, fps = 60;
const GUARD_SEEN = new Set();
function guard(tag, fn) { try { fn(); } catch (e) { const k = tag + e.message; if (!GUARD_SEEN.has(k)) { GUARD_SEEN.add(k); console.error('[overtune] ' + tag, e); } } }
function frame() {
  requestAnimationFrame(frame);
  const tNow = performance.now(); let dt = (tNow - lastT) / 1000; lastT = tNow; dt = Math.min(dt, 0.05);
  fpsAcc += dt; fpsN++; if (fpsAcc > 0.5) { fps = fpsN / fpsAcc; fpsAcc = 0; fpsN = 0; autoScale(); }
  const t = now();
  Net.poll(t);
  if (Game.state === 'play' && Game.match) {
    Game.t += dt;
    const me = Game.me, frozen = Mode.frozen(), paused = !Net.online() && !!UI.cur && Game.match.st !== 'end';
    if (me) Input.apply(me, dt, frozen);
    if (paused) { for (const a of Game.actors) guard('draw', () => drawActor(a, 0)); guard('view', () => View.update(dt)); Fx.update(0); updateLights(dt); renderFrame(false); return; }
    for (const a of Game.actors) if (a.isBot && !a.remote) { guard('bot', () => Bots.think(a, dt)); if (frozen) a.input = { fwd: 0, side: 0, jump: false, fire: false, power: false, util: false, ult: false, reload: false }; }
    // fixed sub-steps keep movement steady when the frame rate dips
    const n = Math.ceil(dt / (1 / 60)), sdt = dt / n;
    for (let i = 0; i < n; i++) for (const a of Game.actors) if (!a.remote) { if (frozen && Game.match.st !== 'end') { a.vel.x = a.vel.z = 0; } guard('step', () => stepLocal(a, sdt)); }
    guard('world', () => worldTick(dt)); guard('pickups', () => Pickups.tick(dt));
    if (Net.isHost()) { Mode.tick(dt); Game.fillT = (Game.fillT || 0) - dt; if (Game.fillT <= 0) { Game.fillT = 1; Flow.fillBots(); } }
    // drawing is kept apart from the simulation: a fault in one actor's visuals must never freeze the screen
    for (const a of Game.actors) guard('draw', () => drawActor(a, dt));
    guard('zone', () => Zone.update());
    guard('view', () => View.update(dt));
    guard('hud', () => HUD.update(dt));
    Net.send(t);
    if (Game.match.st === 'end' && Net.isHost() && Game.match.endT > 14 && Net.online()) { Flow.backToLobby(); }
  } else {
    Showcase.update(dt);
    if (Net.chan) Net.send(t);
  }
  guard('fx', () => Fx.update(dt));
  guard('lights', () => updateLights(dt));
  Sfx.listener.x = G.camera.position.x; Sfx.listener.y = G.camera.position.y; Sfx.listener.z = G.camera.position.z; Sfx.listener.yaw = G.camera.rotation.y;
  renderFrame(Game.state === 'play' && Game.me && Game.me.alive && !View.deathCam);
  if (Settings.showFps) $('#fps').textContent = Math.round(fps) + ' fps';
}
// drop the render scale a little when the frame rate sags, and recover it when there is headroom
function autoScale() {
  if (Game.state !== 'play') return;
  const s = G.autoScale || 1;
  if (fps < 48 && s > 0.6) { G.autoScale = s - 0.08; resizeGfx(true); }
  else if (fps > 58 && s < 1) { G.autoScale = Math.min(1, s + 0.04); resizeGfx(true); }
}
