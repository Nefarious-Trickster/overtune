'use strict';
// ============================================================================
// Bjorn (Bearform, War Cry, Stampede) and Ossian (Raise Dead, the skeletons, Bone Ward, Army of the Grave)
// ============================================================================
const F_BEAR = 67108864;

// ---------------------------------------------------------------- Bjorn: the bear
function bearTick(a, dt, pressed, stunned, rooted) {
  const P = a.P, pw = a.pw, out = { speed: 1, noFire: false };
  if (pw.cd > 0) pw.cd -= dt;
  if (P.perm) {
    pw.state = 'bear'; out.speed = P.speed;
    if (pressed('power') && pw.cd <= 0 && !stunned && !rooted) { pounce(a, P.pounce); pw.cd = P.cd; Sfx.play('roar', a === Game.me ? null : a.pos, 0.7); }
  } else if (pw.state === 'man') {
    if (pressed('power') && pw.cd <= 0 && !stunned) becomeBear(a);
  } else {
    pw.t -= dt; out.speed = P.speed;
    if (P.drain) { pw.drain = (pw.drain || 0) + P.drain * dt; if (pw.drain >= 5) { if (a.hp > pw.drain + 10) applyDamage(a, pw.drain, a.id, { how: 'wolf' }); pw.drain = 0; } }
    if ((pressed('power') && !stunned) || pw.t <= 0 || (P.drain && a.hp <= 15)) revertBear(a);
  }
  if (pw.state === 'bear') {
    if (P.sense) a.st.senseT = 0.2;
    // Thunder Paws: a heavy landing shakes the ground
    if (P.slam) { if (!a.grounded) pw.fall = Math.max(pw.fall || 0, -a.vel.y); else { if ((pw.fall || 0) > 7) { emit(['fx', 'crash', r2(a.pos.x), r2(a.pos.y + 0.2), r2(a.pos.z), 4, 0]); for (const t of Game.actors) if (t.alive && isEnemy(a, t) && t.pos.distanceTo(a.pos) < 4) hitActor(a, t, P.slam, { fx: { knock: [0, 6, 0] }, how: 'claw' }); for (const m of minionsNear(a.pos, 4, a)) hurtMinion(m, P.slam, a.id); if (a === Game.me) View.shake(0.8); } pw.fall = 0; } }
  }
  return out;
}
function becomeBear(a) {
  const P = a.P, pw = a.pw;
  pw.state = 'bear'; pw.t = P.dur; pw.swipes = 0;
  if (P.armor > 0) a.st.shield = { hp: P.armor, t: P.dur };
  a.reloadT = 0; a.fireT = 0.15;
  emit(['fx', 'roar', r2(a.pos.x), r2(a.pos.y + 1.2), r2(a.pos.z), P.roar ? 8 : 3, 0]);
  if (P.roar) for (const t of Game.actors) if (t.alive && isEnemy(a, t) && t.pos.distanceTo(a.pos) < 8) hitActor(a, t, 0, { fx: { slow: [0.6, P.roar] }, how: 'roar' });
  if (P.pounce) pounce(a, P.pounce);
  if (a === Game.me) View.shake(0.5);
}
function revertBear(a) {
  const P = a.P, pw = a.pw;
  pw.state = 'man'; pw.cd = P.cd; pw.t = 0;
  if (a.st.shield) a.st.shield = null;
  if (P.revert) a.hp = Math.min(a.maxHp, a.hp + P.revert);
  a.swingT = 0;
  emit(['fx', 'poof', r2(a.pos.x), r2(a.pos.y + 1), r2(a.pos.z), 0, 0]);
}
function pounce(a, v) { const f = flatFwd(a.yaw); a.vel.x = f.x * v; a.vel.z = f.z * v; a.vel.y = 6.5; a.grounded = false; a.dashT = 0.4; }
function isBear(a) { return a.P && a.P.key === 'bear' && a.pw.state === 'bear'; }
// claws: a short wind-up, then everything in front (or all round) takes the swipe
function clawTick(a, dt, want) {
  const P = a.P;
  if (a.swingT > 0) { a.swingT -= dt; if (a.swingT <= 0) clawHit(a); return; }
  if (!want || a.fireT > 0) return;
  a.swingT = 0.14; a.fireT = P.rate; a.anim.swing = 0.0001; a.swingSide = -(a.swingSide || 1); a.shotT = G.time;
  Sfx.play('swish', a === Game.me ? null : a.pos, 0.9);
  if (a === Game.me) View.slash(a.swingSide);
}
function clawHit(a) {
  const P = a.P, pw = a.pw, fwd = flatFwd(a.yaw), reach = P.reach * Math.max(0.85, P.size / 1.35);
  pw.swipes = (pw.swipes | 0) + 1;
  const ber = P.berserk ? 1 + P.berserk * (1 - a.hp / a.maxHp) : 1, dmg = P.claw * dmgMul(a) * ber;
  for (const t of Game.actors) {
    if (!t.alive || !isEnemy(a, t) || isSub(t)) continue;
    const rel = (t.renderPos || t.pos).clone().sub(a.pos); if (Math.abs(rel.y) > 2) continue; rel.y = 0;
    const d = rel.length(); if (d > reach + 0.45) continue;
    if (!P.circle && d > 0.6 && rel.normalize().dot(fwd) < 0.3) continue;
    const fx = { knock: [fwd.x * 4, 2.5, fwd.z * 4] }; if (P.bleed) fx.dot = [P.bleed, 4, 'bleed']; if (P.maul && pw.swipes % 3 === 0) fx.stun = P.maul;
    hitActor(a, t, dmg, { fx, how: 'claw' });
    if (P.lifesteal) a.hp = Math.min(a.maxHp, a.hp + dmg * P.lifesteal);
  }
  for (const m of minionsNear(a.pos, reach + 0.4, a)) hurtMinion(m, dmg, a.id);
  emit(['fx', 'claw', r2(a.pos.x + fwd.x * 1.2), r2(a.pos.y + 1.1), r2(a.pos.z + fwd.z * 1.2), P.circle ? 1 : 0, r2(a.yaw)]);
}
// Stampede: a spirit-bear charge nothing can stop
function stampedeTick(a, dt) {
  const fwd = flatFwd(a.yaw), hit = a.stampHit || (a.stampHit = new Set());
  for (const t of Game.actors) {
    if (!t.alive || !isEnemy(a, t) || hit.has(t.id) || isSub(t)) continue;
    const rel = (t.renderPos || t.pos).clone().sub(a.pos); if (Math.abs(rel.y) > 1.8) continue; rel.y = 0;
    if (rel.length() > 2.2) continue;
    hit.add(t.id); const side = new V3(-fwd.z, 0, fwd.x).multiplyScalar(Math.sign(rel.dot(new V3(-fwd.z, 0, fwd.x))) || 1);
    hitActor(a, t, 90, { fx: { knock: [fwd.x * 8 + side.x * 9, 7, fwd.z * 8 + side.z * 9], stun: 0.5 }, how: 'stampede' });
    emit(['fx', 'ram', r2(t.pos.x), r2(t.pos.y + 1), r2(t.pos.z), 0, 0]);
  }
  for (const m of minionsNear(a.pos, 2.2, a)) hurtMinion(m, 200, a.id);
  return fwd.multiplyScalar(13);
}

// ---------------------------------------------------------------- Ossian: the dead
const Minions = { list: [], n: 0 };
function raiseTick(a, dt, pressed, stunned) {
  const P = a.P, pw = a.pw;
  if (pw.charges < P.charges) { pw.rech += dt; if (pw.rech >= P.cd) { pw.rech = 0; pw.charges++; } }
  if (pressed('power') && pw.charges > 0 && !stunned) {
    pw.charges--;
    const e = eyePos(a), d = aimDir(a.yaw, a.pitch);
    if (P.bomb) { const q = raiseSpot(a, 32), T = clamp(q.distanceTo(e) / 22, 0.35, 1.3), v = q.clone().sub(e).divideScalar(T); v.y += 0.5 * 14 * T; emit(['pr', 'skull', a.id, r2(e.x), r2(e.y - 0.2), r2(e.z), r2(v.x), r2(v.y), r2(v.z), { g: 14 }]); Sfx.play('bones', a === Game.me ? null : a.pos, 0.8); if (a === Game.me) View.throwAnim(); return; }
    const q = raiseSpot(a, P.range);
    raiseAt(a, q, P.pair ? 2 : 1, false);
    if (a === Game.me) View.throwAnim();
  }
}
// where the dead come up: the ground under the crosshair, or at the feet of the enemy it's on
function raiseSpot(a, range) {
  const e = eyePos(a), d = aimDir(a.yaw, a.pitch), h = World.ray(e.x, e.y, e.z, d.x, d.y, d.z, range, a.team), maxT = h ? h.t : range;
  let best = null; for (const t of Game.actors) { if (!t.alive || !isEnemy(a, t)) continue; const r = rayActor(e, d, t, maxT, 0.4); if (r && (!best || r.t < best.t)) best = r; }
  let q;
  if (best) { const tp = best.a.renderPos || best.a.pos; q = tp.clone().add(a.pos.clone().sub(tp).setY(0).normalize().multiplyScalar(1.2)); }
  else q = h ? new V3(h.x, h.y, h.z).addScaledVector(d, -0.6) : e.clone().addScaledVector(d, range);
  q.y = World.groundAt(q.x, q.z, q.y + 0.8); return q;
}
function minionPack(P, big) { return { hp: Math.round(big ? 130 : P.hp), dm: P.dmg, rt: P.rate, sp: P.speed, lf: big ? 15 : P.life, sz: P.size || 1, sl: P.slow, rv: P.reveal ? 1 : 0, ex: P.explode, ar: P.archer ? 1 : 0, hl: P.heal, gd: P.guard ? 1 : 0, pk: P.pack, ag: P.again ? 1 : 0, ps: P.poison, gt: P.giant ? 1 : 0 }; }
function raiseAt(a, q, n, big) {
  const P = a.P, o = minionPack(P, big);
  for (let i = 0; i < n; i++) {
    const p = q.clone().add(new V3(n > 1 ? (i ? 0.8 : -0.8) : 0, 0, 0)); p.y = World.groundAt(p.x, p.z, p.y + 0.8);
    emit(['mn', a.id + '#m' + (++Minions.n), a.id, r2(p.x), r2(p.y), r2(p.z), Object.assign({ big: big ? 1 : 0 }, o)]);
  }
  // too many: the oldest crumble (the army doesn't count)
  const mine = Minions.list.filter(m => m.owner === a.id && !m.dead && !m.o.big).sort((x, y) => x.born - y.born);
  while (mine.length > P.max) { const m = mine.shift(); emit(['mx', m.id, 0]); }
  Sfx.play('bones', q, 1);
}
function placeMinion(id, ownerId, pos, o) {
  if (Minions.list.some(m => m.id === id)) return;
  const owner = Game.byId.get(ownerId); if (!owner) return;
  const team = owner.team, me = Game.me, hex = me && me !== owner && isEnemy(me, owner) ? ENEMY_HEX : TEAM_HEX[0];
  const M = buildMinion(hex, +o.sz || 1, !!o.ar);
  M.root.position.copy(pos); M.root.rotation.y = owner.yaw; G.scene.add(M.root);
  const m = { id, owner: ownerId, team, o, pos: pos.clone(), vel: new V3(), grounded: true, yaw: owner.yaw, hp: +o.hp || 90, maxHp: +o.hp || 90, t: +o.lf || 16, born: Game.t, M, atkT: 0.6, path: null, repath: 0, target: null, syncT: 0, goal: null, again: !!o.ag, spawnT: 0.9, isMinion: true, isBot: true, alive: true, st: {} };
  Minions.list.push(m);
  Fx.burst(pos.clone().setY(pos.y + 0.3), 0x7affb4, 20, 3, 0.6, 0.08, { up: 2 });
  if (M.kk) KK.once(M, 'Spawn_Ground', 1.6, 'full');
}
function removeMinion(m) { G.scene.remove(m.M.root); const i = Minions.list.indexOf(m); if (i >= 0) Minions.list.splice(i, 1); }
function killMinion(id, revive) {
  const m = Minions.list.find(x => x.id === id); if (!m || m.dead) return;
  const owner = Game.byId.get(m.owner);
  if (revive) { m.hp = Math.round(m.maxHp / 2); m.again = false; if (m.M.kk) KK.once(m.M, 'Spawn_Ground', 2, 'full'); Fx.burst(m.pos.clone().setY(m.pos.y + 0.5), 0x7affb4, 16, 3, 0.5, 0.08); Sfx.play('bones', m.pos, 0.9); return; }
  m.dead = true; m.alive = false; m.deadT = 1.2;
  if (m.M.kk) KK.die(m.M);
  Sfx.play('bones', m.pos, 1); Fx.burst(m.pos.clone().setY(m.pos.y + 0.6), 0xe9dcc2, 18, 3, 0.6, 0.08, { up: 1.5, grav: 8 });
  if (m.o.ex && owner && !owner.remote) { emit(['fx', 'boom', r2(m.pos.x), r2(m.pos.y + 0.6), r2(m.pos.z), 3, 0x7affb4]); for (const t of Game.actors) if (t.alive && isEnemy(owner, t) && t.pos.distanceTo(m.pos) < 3) hitActor(owner, t, m.o.ex, { how: 'minion' }); }
}
// anything that hurts a skeleton calls this; the owner decides when it falls
function hurtMinion(m, dmg, srcId) { if (!m || m.dead || dmg <= 0) return; emit(['mh', m.id, r2(dmg), srcId || '']); }
function minionHurt(id, dmg) {
  const m = Minions.list.find(x => x.id === id); if (!m || m.dead) return;
  m.hp -= dmg; m.hitT = 0.15; if (m.M.kk && Math.random() < 0.3) KK.once(m.M, 'Hit_A', 2);
  const owner = Game.byId.get(m.owner);
  if (m.hp <= 0 && owner && !owner.remote) emit(['mx', m.id, m.again ? 1 : 0]);
}
function minionFoe(m, t) { if (!t || !t.alive || t.id === m.owner) return false; const o = Game.byId.get(m.owner); return o ? isEnemy(o, t) : false; }
function minionEnemyOf(a, m) { if (m.dead || m.owner === a.id) return false; const o = Game.byId.get(m.owner); return o ? isEnemy(a, o) : true; }
function minionsNear(p, r, attacker) { return Minions.list.filter(m => !m.dead && (!attacker || minionEnemyOf(attacker, m)) && Math.hypot(m.pos.x - p.x, m.pos.z - p.z) < r + 0.4 * (m.o.sz || 1) && Math.abs(m.pos.y - p.y) < 2.5); }
// a ray against the skeletons: one sphere each, about chest height
function minionRay(o, d, maxT, attacker, pad = 0) {
  let best = null;
  for (const m of Minions.list) {
    if (m.dead || (attacker && !minionEnemyOf(attacker, m))) continue;
    const s = m.o.sz || 1, c = new V3(m.pos.x, m.pos.y + 0.75 * s, m.pos.z), r = 0.5 * s + pad, oc = o.clone().sub(c), b = oc.dot(d), cc = oc.lengthSq() - r * r, disc = b * b - cc;
    if (disc < 0) continue; const t = -b - Math.sqrt(disc); if (t > 0 && t < maxT && (!best || t < best.t)) best = { m, t };
  }
  return best;
}
function minionTick(dt) {
  for (let i = Minions.list.length - 1; i >= 0; i--) {
    const m = Minions.list[i], owner = Game.byId.get(m.owner), M = m.M;
    if (m.dead) { m.deadT -= dt; KK.pose(M, { t: Game.t }, dt); M.root.position.y = m.pos.y - Math.max(0, 0.6 - m.deadT) * 1.2; if (m.deadT <= 0) removeMinion(m); continue; }
    if (!owner || (!owner.alive && !m.o.big && Game.match && Game.match.mode === 'elim')) { if (!owner) { removeMinion(m); continue; } }
    m.t -= dt; if (m.spawnT > 0) m.spawnT -= dt; if (m.hitT > 0) m.hitT -= dt;
    let spd = 0, attacking = false;
    if (!owner.remote) {
      if (m.t <= 0) { emit(['mx', m.id, 0]); continue; }
      // pick a target: the nearest enemy it can reach; a guard stays by its master unless someone comes close
      m.retT = (m.retT || 0) - dt;
      if (m.retT <= 0) {
        m.retT = 0.3; let best = null, bd = m.o.gd ? 9 : 26;
        const from = m.o.gd ? (owner.renderPos || owner.pos) : m.pos;
        for (const t of Game.actors) { if (!minionFoe(m, t) || isSub(t) || (t.P && t.P.key === 'fade' && cloakLevel(t) > 0.6 && !(t.st.reveal > 0))) continue; const d = (t.renderPos || t.pos).distanceTo(from); if (d < bd && (d < 6 || World.clear(m.pos.x, m.pos.y + 1, m.pos.z, t.pos.x, t.pos.y + 1, t.pos.z))) { bd = d; best = t; } }
        m.target = best;
      }
      const T = m.target, s = m.o.sz || 1, reach = m.o.ar ? 16 : 1.3 * s + 0.3;
      let goal = null;
      if (T && T.alive) { const tp = T.renderPos || T.pos, d = tp.distanceTo(m.pos); if (d > reach * 0.85) goal = tp; m.yaw = Math.atan2(-(tp.x - m.pos.x), -(tp.z - m.pos.z));
        if (d < reach && Math.abs(tp.y - m.pos.y) < 2.2 && m.spawnT <= 0) { m.atkT -= dt; attacking = true; if (m.atkT <= 0) { m.atkT = +m.o.rt || 0.8; minionStrike(m, T, owner); } } }
      else if (m.o.gd || !T) { const op = owner.renderPos || owner.pos; if (op.distanceTo(m.pos) > 3.5) goal = op; }
      if (goal && m.spawnT <= 0) {
        // straight at it when the way is clear, otherwise along the nav graph
        let dir = goal.clone().sub(m.pos).setY(0);
        if (!World.clear(m.pos.x, m.pos.y + 0.5, m.pos.z, goal.x, goal.y + 0.5, goal.z)) {
          m.repath -= dt;
          if (!m.path || m.repath <= 0) { const a0 = World.nearNode(m.pos.x, m.pos.y, m.pos.z), b0 = World.nearNode(goal.x, goal.y, goal.z, 6); m.path = World.path(a0, b0); m.pi = 0; m.repath = 1; }
          if (m.path) { const N = World.nav.nodes; while (m.pi < m.path.length) { const n = N[m.path[m.pi]]; if ((n.x - m.pos.x) ** 2 + (n.z - m.pos.z) ** 2 < 0.6) m.pi++; else break; } const n = N[m.path[Math.min(m.pi, m.path.length - 1)]]; if (n) dir.set(n.x - m.pos.x, 0, n.z - m.pos.z); }
        }
        if (dir.lengthSq() > 0.01) { dir.normalize(); spd = +m.o.sp || 5.4; m.vel.x = dir.x * spd; m.vel.z = dir.z * spd; if (!T) m.yaw = Math.atan2(-dir.x, -dir.z); }
      } else { m.vel.x *= 0.5; m.vel.z *= 0.5; }
      // hop over small steps it walks into
      const res = World.moveBody(m, dt); if (res.wall && m.grounded && spd > 0) { m.vel.y = 6.5; m.grounded = false; }
      m.syncT -= dt; if (m.syncT <= 0) { m.syncT = 0.15; Net.push(['mm', m.id, r2(m.pos.x), r2(m.pos.y), r2(m.pos.z), r2(m.yaw), attacking ? 1 : 0]); }
      if (m.o.rv) for (const t of Game.actors) if (minionFoe(m, t) && t.pos.distanceTo(m.pos) < 7) applyFx(t, { reveal: 0.4 }, m.owner);
    } else if (m.goal) {
      // someone else's: glide toward the last position they sent
      const d = m.goal.clone().sub(m.pos); spd = d.length() / 0.15; m.pos.lerp(m.goal, Math.min(1, dt * 8)); m.yaw += angDiff(m.yaw, m.goalYaw || m.yaw) * Math.min(1, dt * 10); attacking = !!m.goalAtk;
    }
    M.root.position.copy(m.pos); M.root.rotation.y = m.yaw;
    if (m.hitT > 0) M.root.position.x += Math.sin(Game.t * 80) * 0.03;
    KK.pose(M, { spd: Math.min(spd, 7), air: m.grounded ? 0 : 1, pitch: 0, flags: 0, t: Game.t }, dt);
  }
}
function minionStrike(m, T, owner) {
  const o = m.o;
  if (o.ar) { const e = new V3(m.pos.x, m.pos.y + 1.1, m.pos.z), c = chest(T), d = c.clone().sub(e), L = d.length(); d.normalize(); d.y += L * 0.004; d.normalize(); emit(['pr', 'bolt', m.owner, r2(e.x), r2(e.y), r2(e.z), r2(d.x * 60), r2(d.y * 60), r2(d.z * 60), { d: 20, g: 2, mn: 1 }]); if (m.M.kk) KK.fire(m.M); return; }
  const near = Minions.list.filter(x => x !== m && !x.dead && x.owner === m.owner && x.pos.distanceTo(T.pos) < 3).length;
  const dmg = (+o.dm || 16) * (1 + (o.pk || 0) * near);
  const fx = {}; if (o.sl) fx.slow = [0.7, o.sl]; if (o.ps) fx.dot = [o.ps, 5, 'poison'];
  const targets = o.gt ? Game.actors.filter(t => minionFoe(m, t) && t.pos.distanceTo(m.pos) < 1.3 * (o.sz || 1) + 0.6) : [T];
  for (const t of targets) { hitActor(owner, t, dmg, { fx, how: 'minion' }); if (o.hl) owner.hp = Math.min(owner.maxHp, owner.hp + o.hl); }
  if (m.M.kk) KK.fire(m.M);
  Sfx.play('swish', m.pos, 0.5);
}
function buildMinion(teamHex, size, archer) {
  const M = KK.ready ? KK.build('_minion', teamHex) : null;
  if (!M) { const g = new THREE.Group(); g.add(new THREE.Mesh(new THREE.CapsuleGeometry(0.25, 0.7, 4, 8), mStd(0xe9dcc2))); g.children[0].position.y = 0.6; return { root: g, body: g, kk: false }; }
  M.holder.scale.multiplyScalar(0.78 * size);
  if (archer && M.L) { /* archers hold their bows the same way */ }
  return M;
}
// Bonestorm: a thrown skeleton bursts and leaves a pile of bones
function skullLand(p, owner) {
  emit(['fx', 'boom', r2(p.x), r2(p.y + 0.4), r2(p.z), 3.5, 0xe9dcc2]);
  for (const t of Game.actors) if (t.alive && isEnemy(owner, t) && !isSub(t) && (t.renderPos || t.pos).distanceTo(p) < 3.5) hitActor(owner, t, 70 * (1 - Math.min(1, (t.pos.distanceTo(p)) / 3.5) * 0.4), { fx: { knock: [0, 5, 0] }, how: 'minion' });
  for (const m of minionsNear(p, 3.5, owner)) hurtMinion(m, 70, owner.id);
  const gy = World.groundAt(p.x, p.z, p.y + 0.5);
  emit(['zn', 'bone', r2(p.x), r2(gy), r2(p.z), 2.6, 0, 4, owner.id, 0.25]);
}

// ---------------------------------------------------------------- utilities and ultimates
function warCry(a) { a.st.rage = 4; a.st.root = 0; a.st.slows = []; emit(['fx', 'roar', r2(a.pos.x), r2(a.pos.y + 1.2), r2(a.pos.z), 4, 0]); }
function boneWard(a) { a.st.shield = { hp: 120, t: 4 }; for (const m of Minions.list) if (m.owner === a.id && !m.dead) emit(['mw', m.id]); emit(['fx', 'heal', r2(a.pos.x), r2(a.pos.y + 1), r2(a.pos.z), 0, 0]); Sfx.play('bones', a === Game.me ? null : a.pos, 0.8); }
function armyOfTheGrave(a) { for (let i = 0; i < 5; i++) { const ang = i / 5 * TAU, q = a.pos.clone().add(new V3(Math.cos(ang) * 2.4, 0, Math.sin(ang) * 2.4)); q.y = World.groundAt(q.x, q.z, q.y + 1); raiseAt(a, q, 1, true); } emit(['fx', 'stop', r2(a.pos.x), r2(a.pos.y + 1), r2(a.pos.z), 6, 0]); }

// ---------------------------------------------------------------- events for the dead
function minionEvent(E) {
  switch (E[0]) {
    case 'mn': placeMinion(E[1], E[2], new V3(E[3], E[4], E[5]), E[6] || {}); return true;
    case 'mm': { const m = Minions.list.find(x => x.id === E[1]); if (m) { m.goal = new V3(E[2], E[3], E[4]); m.goalYaw = E[5]; m.goalAtk = E[6]; } return true; }
    case 'mh': minionHurt(E[1], +E[2] || 0); return true;
    case 'mx': killMinion(E[1], !!E[2]); return true;
    case 'mw': { const m = Minions.list.find(x => x.id === E[1]); if (m) m.hp = m.maxHp; return true; }
  }
  return false;
}
function clearMinions() { for (const m of Minions.list) G.scene.remove(m.M.root); Minions.list = []; }
