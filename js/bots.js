'use strict';
// ============================================================================
// Bots: perception, pathing over the nav graph, an aim model, and a plan for each hero's power
// ============================================================================
const BOT_DIFF = [
  { name: 'Recruit', react: 0.6, err: 0.11, track: 4.5, tol: 0.09, see: 0.8, power: 0.5 },
  { name: 'Veteran', react: 0.34, err: 0.055, track: 8, tol: 0.05, see: 1.0, power: 0.85 },
  { name: 'Elite', react: 0.18, err: 0.025, track: 13, tol: 0.03, see: 1.15, power: 1.0 },
];
const PREF_RANGE = { marrow: 22, lark: 9, gauge: 6, veil: 13, ivra: 16 };

const Bots = {
  B: new Map(),
  brain(a) {
    let b = this.B.get(a.id);
    if (!b) { b = { target: null, seenT: -99, lastSeen: null, path: null, pi: 0, repath: 0, goal: null, goalT: 0, strafe: 1, strafeT: 0, percT: Math.random() * 0.2, react: 0, err: new V3(), errT: 0, lastPos: new V3(), stuckT: 0, stuckN: 0, act: {}, snareT: 5, threat: null, threatT: -99, holdT: 0 }; this.B.set(a.id, b); }
    return b;
  },
  forget(a) { this.B.delete(a.id); },
  hurt(a, src) { const b = this.brain(a); if (src) { b.threat = src; b.threatT = Game.t; } },
  diff() { return BOT_DIFF[clamp(Game.match ? Game.match.df : Settings.diff, 0, 2)]; },

  // can this bot make out that enemy right now?
  sees(a, o) {
    if (!o.alive) return false;
    const cl = o.remote ? (o.cl || 0) : cloakLevel(o), d = a.pos.distanceTo(o.renderPos || o.pos);
    if (cl > 0.6 && !(o.st && o.st.reveal > 0) && !(o.flags & F_REVEAL)) {
      const shimmer = o.P ? o.P.shimmer || 8 : 8;
      if (o.st.night > 0 || (o.flags & F_NIGHT) || d > shimmer * 0.8) return false;
    }
    const p = o.renderPos || o.pos;
    const fwd = flatFwd(a.yaw), rel = new V3(p.x - a.pos.x, 0, p.z - a.pos.z).normalize();
    const recent = this.brain(a).threat === o && Game.t - this.brain(a).threatT < 2;
    if (rel.dot(fwd) < -0.2 && !recent && d > 4) return false;
    if (d > 70 * this.diff().see) return false;
    return World.clear(a.pos.x, a.pos.y + PHYS.eye, a.pos.z, p.x, p.y + 1.2, p.z);
  },
  known(o) { return o.alive && ((o.st && o.st.reveal > 0) || (o.flags & F_REVEAL)); },

  think(a, dt) {
    const b = this.brain(a), D = this.diff(), I = a.input, me = a.H.key;
    I.fwd = 0; I.side = 0; I.jump = false; I.fire = false; I.reload = false; I.util = false; I.ult = false;
    if (!a.alive) { I.power = false; b.path = null; b.target = null; return; }
    // perception
    b.percT -= dt;
    if (b.percT <= 0) {
      b.percT = 0.18 + Math.random() * 0.08;
      let best = null, bs = 1e9;
      for (const o of Game.actors) {
        if (!isEnemy(a, o) || !o.alive) continue;
        const vis = this.sees(a, o), kn = vis || (this.known(o) && a.pos.distanceTo(o.pos) < 40);
        if (!kn) continue;
        const d = a.pos.distanceTo(o.renderPos || o.pos), s = d + o.hp * 0.04 - (o === b.target ? 8 : 0) - (o === b.threat && Game.t - b.threatT < 3 ? 6 : 0) + (vis ? 0 : 20);
        if (s < bs) { bs = s; best = o; best._vis = vis; }
      }
      const vis = best ? best._vis : false;
      if (best && best !== b.target) { b.react = D.react * (vis ? 1 : 0.5) + Math.random() * 0.1; b.err.set(rand(-1, 1), rand(-0.5, 0.5), rand(-1, 1)).multiplyScalar(D.err * 6); }
      b.target = best; b.vis = vis;
      if (best) { b.seenT = Game.t; b.lastSeen = (best.renderPos || best.pos).clone(); }
    }
    if (b.target && !b.target.alive) { b.target = null; b.vis = false; }
    const T = b.target, tp = T ? (T.renderPos || T.pos) : null, dist = T ? a.pos.distanceTo(tp) : 99;
    b.react -= dt;

    // --- where to go
    let moveDir = null; const pref = PREF_RANGE[me];
    if (T && b.vis) {
      // fight: hold a preferred range and strafe
      b.strafeT -= dt; if (b.strafeT <= 0) { b.strafeT = rand(0.5, 1.6); b.strafe = Math.random() < 0.5 ? -1 : 1; if (Math.random() < 0.15) I.jump = true; }
      const to = tp.clone().sub(a.pos).setY(0); const dn = to.length(); to.normalize();
      const side = new V3(-to.z, 0, to.x).multiplyScalar(b.strafe);
      const want = dn > pref + 3 ? 1 : dn < pref - 3 ? -0.8 : 0;
      moveDir = to.clone().multiplyScalar(want).add(side.multiplyScalar(0.85));
      if (a.hp < a.maxHp * 0.3 && me !== 'gauge') moveDir = to.clone().multiplyScalar(-1).add(side);
      // don't strafe into walls or off into a corner: probe ahead
      const probe = a.pos.clone().addScaledVector(moveDir.clone().normalize(), 1.2);
      if (!World.clear(a.pos.x, a.pos.y + 0.8, a.pos.z, probe.x, probe.y + 0.8, probe.z)) { b.strafe *= -1; moveDir = to.clone().multiplyScalar(want); }
      if (moveDir.lengthSq() < 0.01 || (dn > pref + 6 && !World.clear(a.pos.x, a.pos.y + 0.5, a.pos.z, tp.x, tp.y + 0.5, tp.z))) moveDir = this.follow(a, b, tp, dt);
      else b.path = null;
      // Control: fight your way onto the point rather than away from it
      const Z = World.zone, M = Game.match;
      if (M.mode === 'koth' && Z && a.hp > a.maxHp * 0.25) {
        const zd = Math.hypot(a.pos.x - Z.x, a.pos.z - Z.z), need = M.zone.own !== a.team || M.zone.contest || M.zone.cap > 0;
        if (zd > Z.r * (need ? 0.6 : 1.4)) { const zp = this.follow(a, b, new V3(Z.x, Z.y, Z.z), dt).normalize(); moveDir = zp.multiplyScalar(1.3).add(side.clone().normalize().multiplyScalar(0.4)); }
      }
    } else {
      b.goalT -= dt;
      let goal = b.goal;
      if (T && !b.vis) goal = tp.clone();
      else if (b.lastSeen && Game.t - b.seenT < 4) goal = b.lastSeen;
      else if (!goal || b.goalT <= 0 || a.pos.distanceTo(goal) < 2) { goal = this.pickGoal(a); b.goalT = rand(6, 12); }
      if (Game.match.mode === 'koth' && World.zone && (!T || b.vis === false)) { const Z = World.zone; if (Math.hypot(a.pos.x - Z.x, a.pos.z - Z.z) > Z.r * 0.7 && (!goal || Math.hypot(goal.x - Z.x, goal.z - Z.z) > Z.r)) { goal = this.pickGoal(a); b.goalT = rand(4, 8); } }
      if (a.hp < a.maxHp * 0.4) { const pk = Pickups.nearest(a.pos); if (pk && pk.dist < 30) goal = pk.pos; }
      b.goal = goal;
      moveDir = this.follow(a, b, goal, dt);
    }
    if (moveDir && moveDir.lengthSq() > 0.001) {
      moveDir.normalize();
      const f = flatFwd(a.yaw), r = new V3(-f.z, 0, f.x);
      I.fwd = clamp(moveDir.dot(f) * 1.4, -1, 1); I.side = clamp(moveDir.dot(r) * 1.4, -1, 1);
    }
    // stuck?
    b.stuckT += dt;
    if (b.stuckT > 0.8) {
      const moved = a.pos.distanceTo(b.lastPos); b.lastPos.copy(a.pos); b.stuckT = 0;
      if ((Math.abs(I.fwd) + Math.abs(I.side)) > 0.5 && moved < 0.5 && !(a.st.root > 0) && a.dashT <= 0) { b.stuckN++; I.jump = true; b.path = null; if (b.stuckN > 2) { b.goal = this.pickGoal(a); b.stuckN = 0; } }
      else b.stuckN = 0;
    }

    // --- aim
    let aimYaw = a.yaw, aimPitch = 0;
    if (T && (b.vis || dist < 30)) {
      const aimAt = this.aimPoint(a, T, b);
      const d = aimAt.clone().sub(eyePos(a));
      aimYaw = Math.atan2(-d.x, -d.z); aimPitch = Math.atan2(d.y, Math.hypot(d.x, d.z));
    } else if (moveDir && moveDir.lengthSq() > 0.001) { aimYaw = Math.atan2(-moveDir.x, -moveDir.z); aimPitch = 0; }
    b.errT -= dt; if (b.errT <= 0) { b.errT = 0.35; b.err.multiplyScalar(0.55).add(new V3(rand(-1, 1), rand(-0.5, 0.5), 0).multiplyScalar(D.err * (b.vis ? 1 : 2))); }
    aimYaw += b.err.x; aimPitch += b.err.y;
    const k = Math.min(1, (b.vis ? D.track : 5) * dt);
    a.yaw += angDiff(a.yaw, aimYaw) * k; a.pitch = clamp(lerp(a.pitch, aimPitch, k), -1.4, 1.4);
    const aimErr = Math.abs(angDiff(a.yaw, aimYaw - b.err.x)) + Math.abs(a.pitch - (aimPitch - b.err.y));
    // --- shoot
    const W = a.H.weapon;
    const inRange = W.kind === 'pellets' ? dist < 16 : W.kind === 'hitscan' && W.falloff ? dist < 32 : dist < 70;
    if (T && b.vis && b.react <= 0 && inRange && aimErr < D.tol + (W.kind === 'pellets' ? 0.08 : 0) + 0.6 / Math.max(2, dist)) I.fire = true;
    if (!T && a.ammo < W.mag * 0.5 && a.reloadT <= 0) I.reload = true;
    // --- the power, the utility, the ultimate
    this.powers(a, b, T, dist, D, dt);
  },
  pickGoal(a) {
    const M = Game.match;
    if (M && M.mode === 'koth' && World.zone) {
      const z = World.zone, ang = Math.random() * TAU, r = Math.random() * z.r * 0.8;
      return new V3(z.x + Math.cos(ang) * r, z.y, z.z + Math.sin(ang) * r);
    }
    // hunt: head for an enemy's rough whereabouts, or somewhere central
    const foes = Game.actors.filter(o => o.alive && isEnemy(a, o));
    if (foes.length && Math.random() < 0.65) { const f = pick(foes), p = f.renderPos || f.pos; return new V3(p.x + rand(-8, 8), p.y, p.z + rand(-8, 8)); }
    const n = World.randomNode(); return new V3(n.x * 0.7, n.y, n.z * 0.7);
  },
  follow(a, b, goal, dt) {
    b.repath -= dt;
    if (!b.path || b.repath <= 0 || !b.pathGoal || b.pathGoal.distanceTo(goal) > 3) {
      const s = World.nearNode(a.pos.x, a.pos.y, a.pos.z), e = World.nearNode(goal.x, goal.y, goal.z, 6);
      b.path = World.path(s, e); b.pi = 0; b.repath = 1.2 + Math.random(); b.pathGoal = goal.clone();
      if (!b.path) return goal.clone().sub(a.pos).setY(0);
    }
    const N = World.nav.nodes;
    while (b.pi < b.path.length) {
      const n = N[b.path[b.pi]], dx = n.x - a.pos.x, dz = n.z - a.pos.z;
      if (dx * dx + dz * dz < 0.5 && Math.abs(n.y - a.pos.y) < 1.2) b.pi++; else break;
    }
    // look ahead: skip to the furthest node in a straight walkable line
    let k = b.pi;
    for (let j = Math.min(b.path.length - 1, b.pi + 5); j > b.pi; j--) { const n = N[b.path[j]]; if (Math.abs(n.y - a.pos.y) < 0.6 && World.clear(a.pos.x, a.pos.y + 0.4, a.pos.z, n.x, n.y + 0.4, n.z)) { k = j; break; } }
    const n = k < b.path.length ? N[b.path[k]] : null;
    if (!n) return goal.clone().sub(a.pos).setY(0);
    return new V3(n.x - a.pos.x, 0, n.z - a.pos.z);
  },
  aimPoint(a, T, b) {
    const p = (T.renderPos || T.pos).clone(), v = T.vel ? T.vel.clone() : new V3(), W = a.H.weapon;
    p.y += a.H.key === 'marrow' && Math.random() < 0.3 ? 1.55 : 1.1;
    const eye = eyePos(a);
    // projectiles: lead the target and lob over the drop
    const lob = (speed, g) => {
      let q = p.clone();
      for (let i = 0; i < 3; i++) { const t = eye.distanceTo(q) / speed; q = p.clone().addScaledVector(v, t * 0.8); }
      const d = Math.hypot(q.x - eye.x, q.z - eye.z), h = q.y - eye.y, v2 = speed * speed, disc = v2 * v2 - g * (g * d * d + 2 * h * v2);
      const pitch = disc > 0 ? Math.atan((v2 - Math.sqrt(disc)) / (g * d)) : Math.PI / 4;
      return eye.clone().add(new V3(q.x - eye.x, Math.tan(pitch) * d, q.z - eye.z));
    };
    if (a.pw.winding) { const P = a.P, f = clamp((b.holdT || 0) / Math.max(0.1, P.windMax), 0, 1); return lob(lerp(P.spdMin, P.spdMax, f), P.grav); }
    if (W.kind === 'proj') return lob(W.projSpeed, W.projGrav);
    return p;
  },
  powers(a, b, T, dist, D, dt) {
    const I = a.input, P = a.P, pw = a.pw, key = a.H.key, vis = T && b.vis, act = b.act;
    const hold = (on) => { I.power = on; };
    const cool = (k, t) => { act[k] = (act[k] || 0) - dt; if (act[k] > 0) return false; act[k] = t; return true; };
    if (Math.random() > D.power && !I.power) { hold(false); }
    // utilities
    if (a.utilT <= 0) {
      const U = a.H.util.key;
      if (U === 'heal' && a.hp < a.maxHp * (vis ? 0.4 : 0.65)) I.util = true;
      if (U === 'dash' && vis && dist < 16 && cool('dash', rand(2, 5))) I.util = true;
      if (U === 'wall' && vis && a.hp < a.maxHp * 0.6 && dist > 6) I.util = true;
      if (U === 'scry' && !vis && cool('scry', rand(6, 12))) I.util = true;
      if (U === 'leap' && ((vis && a.hp < a.maxHp * 0.4) || (!vis && cool('leap', rand(10, 20)) && Math.random() < 0.3))) I.util = true;
    }
    // ultimates
    if (a.ult >= 100) {
      const K = a.H.ult.key, near = Game.actors.filter(o => o.alive && isEnemy(a, o) && o.pos.distanceTo(a.pos) < 7).length;
      if ((K === 'field' && (!vis || Game.t - b.seenT > 3)) || (K === 'unbound' && vis && a.hp > a.maxHp * 0.4) || (K === 'slam' && near >= 1 && dist < 6) || (K === 'night' && vis && dist < 25) || (K === 'storm' && vis && dist < 24)) I.ult = true;
    }
    if (key === 'marrow') {
      b.snareT -= dt;
      const mine = [...Game.snares.values()].filter(s => s.owner === a.id);
      const far = mine.every(s => s.pos.distanceTo(a.pos) > 8);
      const want = pw.charges > 0 && pw.placing <= 0 && far && ((vis && dist < 9) || (!vis && b.snareT <= 0) || (Game.match.mode === 'koth' && World.zone && Math.hypot(a.pos.x - World.zone.x, a.pos.z - World.zone.z) < World.zone.r + 3 && b.snareT <= 2));
      if (want && !I.power) { hold(true); b.snareT = rand(6, 12); } else hold(false);
    } else if (key === 'lark') {
      const canBlink = (pw.charges > 0 || a.st.unbound > 0) && !(a.st.fatigue > 0);
      if (pw.charging) {
        b.holdT += dt;
        const need = b.blinkAway ? P.chargeTime : P.chargeTime * clamp((dist - 5 - P.minDist) / (P.maxDist - P.minDist), 0, 1);
        if (b.holdT >= need) hold(false); else hold(true);
        if (b.blinkAway && T) { const d = a.pos.clone().sub(T.pos); a.yaw = Math.atan2(-d.x, -d.z); a.pitch = 0.05; }
      } else if (canBlink && vis && ((dist > 13 && a.hp > a.maxHp * 0.45) || (a.hp < a.maxHp * 0.3 && dist < 14)) && cool('blink', 0.6)) { b.holdT = 0; b.blinkAway = a.hp < a.maxHp * 0.3; hold(true); }
      else hold(false);
    } else if (key === 'gauge') {
      if (pw.state === 'rev' || pw.state === 'charge') {
        hold(!!T && (pw.state === 'rev' || (T && b.vis && dist > 1)));
      } else if (pw.state === 'idle' && pw.cd <= 0 && vis && dist > 5 && dist < 18 && Math.abs(T.pos.y - a.pos.y) < 1.2 && World.clear(a.pos.x, a.pos.y + 0.6, a.pos.z, T.pos.x, T.pos.y + 0.6, T.pos.z) && cool('ram', 1)) hold(true);
      else hold(false);
    } else if (key === 'veil') {
      if (pw.state === 'vis') { const go = pw.cd <= 0 && ((!vis && Game.t - b.seenT > 2 && cool('fade', rand(1, 4))) || (vis && a.hp < a.maxHp * 0.3)); I.power = go && !a.prev.power; }
      else if (pw.state === 'cloaked') { const pop = vis && dist < 13 && a.hp > a.maxHp * 0.3; I.power = pop && !a.prev.power; if (pop && P.shootCloaked) I.fire = true; }
      else I.power = false;
      if (pw.state === 'cloaked' && !(P.shootCloaked)) I.fire = false;
    } else if (key === 'ivra') {
      if (pw.winding) {
        b.holdT += dt;
        const need = P.windMin + (P.windMax - P.windMin) * (P.oneshot ? 1 : clamp(dist / 28, 0.2, 1));
        hold(b.holdT < need);
      } else if (pw.count > 0 && vis && dist > 5 && dist < 40 && cool('glaive', rand(0.5, 1.5))) { b.holdT = 0; hold(true); }
      else hold(false);
    }
  },
};
