'use strict';
// ============================================================================
// The simulation: actors, movement, weapons, the five powers, damage, statuses and events.
// Each copy of the game simulates the actors it owns (its player, and the bots if it hosts) and draws the rest
// from network snapshots. Hits are judged by the shooter's copy and applied by the target's owner.
// ============================================================================
const F_ALIVE = 1, F_GROUND = 2, F_CLOAK = 4, F_FADING = 8, F_REVEAL = 16, F_ROOT = 32, F_STUN = 64, F_CHARGE = 128, F_REV = 256, F_WIND = 512, F_BLINKCH = 1024, F_FATIGUE = 2048, F_NIGHT = 4096, F_UNBOUND = 8192, F_HEAL = 16384, F_SLOW = 32768, F_PLACE = 65536, F_PROT = 131072;
const RESPAWN_T = 5;

const Game = {
  state: 'menu', actors: [], byId: new Map(), me: null, t: 0, match: null, snares: new Map(), projs: [], fires: [], decoys: [], walls: new Map(), seq: 0,
  feed: [], localSeq: 0,
};
const BOT_NAMES = ['Vesper', 'Rook', 'Tallow', 'Quill', 'Ashby', 'Sorrel', 'Kestrel', 'Grist', 'Marlow', 'Pike', 'Wren', 'Thane', 'Juniper', 'Cobalt', 'Hollis', 'Reed', 'Sable', 'Moss', 'Dray', 'Fennick'];

function isEnemy(a, b) {
  if (!a || !b || a === b) return false;
  if (Game.match && Game.match.mode === 'ffa') return a.id !== b.id && !(a.owner && a.owner === b.id) && !(b.owner && b.owner === a.id);
  return a.team !== b.team;
}
function enemyOfTeam(a, team, ownerId) {
  if (Game.match && Game.match.mode === 'ffa') return a.id !== ownerId;
  return a.team !== team;
}
function eyePos(a, out = new V3()) { return out.set(a.pos.x, a.pos.y + PHYS.eye, a.pos.z); }
function aimDir(yaw, pitch, out = new V3()) { const c = Math.cos(pitch); return out.set(-Math.sin(yaw) * c, Math.sin(pitch), -Math.cos(yaw) * c); }
function flatFwd(yaw) { return new V3(-Math.sin(yaw), 0, -Math.cos(yaw)); }

// ---------------------------------------------------------------- actors
function addActor(o) {
  const a = {
    id: o.id, name: o.name || 'Player', team: o.team | 0, isBot: !!o.bot, remote: !!o.remote, owner: o.owner || null,
    pos: new V3(), vel: new V3(), yaw: 0, pitch: 0, grounded: true, hp: 1, alive: false, respawnT: 0.5, k: 0, d: 0, a: 0, dmg: 0,
    st: {}, pw: {}, input: { fwd: 0, side: 0, jump: false, fire: false, power: false, util: false, ult: false, reload: false }, prev: {},
    snaps: [], anim: { phase: 0, death: 0, spd: 0, air: 0 }, ult: 0, utilT: 0, ammo: 0, reloadT: 0, fireT: 0, burstLeft: 0, burstT: 0, bloom: 0, lastHit: {}, nameIdx: o.nameIdx | 0,
    addons: o.addons || [], heroKey: null, dashT: 0, stepT: 0, spawnProt: 0, hitFlash: 0, killer: null, lastDmgT: -99,
  };
  Game.actors.push(a); Game.byId.set(a.id, a);
  setHero(a, o.hero || 'marrow', o.addons || []);
  return a;
}
function removeActor(a) {
  const i = Game.actors.indexOf(a); if (i >= 0) Game.actors.splice(i, 1); Game.byId.delete(a.id);
  if (a.model) G.scene.remove(a.model.root);
  if (a.loop) { a.loop.stop(); a.loop = null; }
  if (Game.me === a) Game.me = null;
}
function setHero(a, key, addons) {
  const changed = a.heroKey !== key || a.modelTeam !== modelColorFor(a) || JSON.stringify(a.addons) !== JSON.stringify(addons);
  a.heroKey = key; a.H = HEROES[key]; a.addons = (addons || []).slice(0, 2); a.P = powerFor(key, a.addons);
  a.maxHp = a.H.hp;
  if (!a.alive) a.hp = a.maxHp;
  else a.hp = Math.min(a.hp, a.maxHp);
  resetKit(a);
  if (changed || !a.model) rebuildModel(a);
}
function modelColorFor(a) { const me = Game.me; if (!me) return TEAM_HEX[a.team] || ENEMY_HEX; if (a === me) return TEAM_HEX[0]; return isEnemy(me, a) ? ENEMY_HEX : TEAM_HEX[0]; }
function rebuildModel(a) {
  if (a.model) G.scene.remove(a.model.root);
  a.modelTeam = modelColorFor(a);
  a.model = buildHero(a.heroKey, a.modelTeam); G.scene.add(a.model.root);
  a.model.root.visible = a.alive && a !== Game.me;
  a.look = 'normal'; a.xray = null;
}
function resetKit(a) {
  const W = a.H.weapon, P = a.P;
  a.ammo = W.mag; a.reloadT = 0; a.fireT = 0; a.burstLeft = 0; a.bloom = 0; a.utilT = 0;
  a.pw = {};
  if (P.key === 'snare') a.pw = { charges: P.carry, rech: 0, placing: 0, n: 0 };
  if (P.key === 'blink') a.pw = { charges: P.charges, rech: 0, chargeT: 0, charging: false, chainT: 0, used: 0 };
  if (P.key === 'ram') a.pw = { state: 'idle', t: 0, cd: 0, hit: new Set(), trailT: 0 };
  if (P.key === 'fade') a.pw = { state: 'vis', t: 0, cd: 0, cloakT: 0 };
  if (P.key === 'glaive') a.pw = { count: P.cap, rech: 0, wind: 0, winding: false };
}
function spawnActor(a, at) {
  if (a.pendingHero) { const ph = a.pendingHero; a.pendingHero = null; a.alive = false; setHero(a, ph.h, ph.a); }
  const sp = at || pickSpawn(a);
  a.pos.copy(sp); a.pos.y = World.groundAt(sp.x, sp.z, sp.y + 1);
  a.vel.set(0, 0, 0); a.hp = a.maxHp; a.alive = true; a.grounded = true; a.st = {}; a.dashT = 0;
  // face the middle of the map
  a.yaw = Math.atan2(a.pos.x, a.pos.z); a.pitch = 0;
  resetKit(a);
  a.spawnProt = 1.5; a.anim.death = 0; a.killer = null;
  if (a.model) { a.model.root.visible = a !== Game.me; a.model.body.rotation.set(0, 0, 0); a.model.body.position.set(0, 0, 0); }
  if (a === Game.me) { HUD.respawned(); View.reset(); }
}
function pickSpawn(a) {
  const M = Game.match, list = M.mode === 'ffa' ? World.ffa.concat(World.spawns[0], World.spawns[1]) : World.spawns[a.team];
  let best = list[0], bs = -1e9;
  for (const s of list) {
    let near = 1e9; for (const o of Game.actors) if (o.alive && o !== a && isEnemy(a, o)) near = Math.min(near, o.pos.distanceTo(s));
    let ally = 0; for (const o of Game.actors) if (o.alive && o !== a && !isEnemy(a, o) && o.pos.distanceTo(s) < 1.2) ally++;
    const score = Math.min(near, 40) + Math.random() * 6 - ally * 30;
    if (score > bs) { bs = score; best = s; }
  }
  return best;
}

// ---------------------------------------------------------------- statuses
function stTick(a, dt) {
  const s = a.st;
  for (const k of ['root', 'stun', 'reveal', 'blind', 'strike', 'ambush', 'flick', 'unbound', 'night', 'nightFlash', 'senseT', 'protT']) if (s[k] > 0) s[k] = Math.max(0, s[k] - dt);
  if (s.slows) { s.slows = s.slows.filter(x => (x.t -= dt) > 0); }
  if (s.heal) { const h = s.heal; h.t -= dt; a.hp = Math.min(a.maxHp, a.hp + h.rate * dt); if (h.t <= 0) s.heal = null; }
  if (s.dots && s.dots.length) {
    for (const d of s.dots) { d.t -= dt; d.acc = (d.acc || 0) + d.dps * dt; }
    for (const d of s.dots) if (d.acc >= 4 || (d.t <= 0 && d.acc > 0)) { const n = d.acc; d.acc = 0; applyDamage(a, n, d.src, { dot: d.kind, how: d.how }); if (!a.alive) return; }
    s.dots = s.dots.filter(d => d.t > 0);
  }
}
function slowMul(a) { let m = 1; if (a.st.slows) for (const x of a.st.slows) m = Math.min(m, x.mul); return m; }
function applyFx(a, fx, srcId) {
  if (!fx) return;
  const s = a.st;
  if (fx.root && !s.unstoppable) { s.root = Math.max(s.root || 0, fx.root); }
  if (fx.stun) s.stun = Math.max(s.stun || 0, fx.stun);
  if (fx.slow) { (s.slows = s.slows || []).push({ mul: fx.slow[0], t: fx.slow[1] }); }
  if (fx.reveal) s.reveal = Math.max(s.reveal || 0, fx.reveal);
  if (fx.blind) s.blind = Math.max(s.blind || 0, fx.blind);
  if (fx.dot) (s.dots = s.dots || []).push({ dps: fx.dot[0] / fx.dot[1], t: fx.dot[1], src: srcId, kind: fx.dot[2] || 'bleed', how: fx.how });
  if (fx.knock) { a.vel.x += fx.knock[0]; a.vel.y = Math.max(a.vel.y, fx.knock[1]); a.vel.z += fx.knock[2]; a.grounded = false; a.knockT = 0.4; }
  // a fading Veil who is hit flickers into view for a moment
  if (a.P.key === 'fade' && a.pw.state !== 'vis') s.flick = 0.35;
  if (a.P.key === 'ram' && fx.stun && a.pw.state !== 'idle') { endRam(a, false); }
}

// ---------------------------------------------------------------- damage
// Called by whichever copy judged the hit. The target's owner applies it.
function hitActor(src, tgt, dmg, opts = {}) {
  if (!tgt || !tgt.alive) return;
  const sid = src ? src.id : opts.srcId;
  if (dmg > 0 && src && !src.remote) { src.ult = Math.min(100, src.ult + dmg * 0.04 * (src.st.unbound || src.st.night ? 0 : 1)); src.dmg += dmg; }
  if (src === Game.me && dmg > 0) HUD.hit(tgt, dmg, !!opts.head, opts.kill);
  if (!tgt.remote) applyDamage(tgt, dmg, sid, opts);
  else Net.push(['h', tgt.id, r2(dmg), sid, packOpts(opts)]);
}
function packOpts(o) { const p = {}; if (o.head) p.h = 1; if (o.fx) p.f = o.fx; if (o.how) p.w = o.how; if (o.exec) p.x = o.exec; if (o.oneshot) p.o = 1; if (o.srcPos) p.p = o.srcPos; return p; }
function applyDamage(a, dmg, srcId, opts = {}) {
  if (!a.alive) return;
  if (a.spawnProt > 0 && dmg > 0) dmg = 0;
  const src = Game.byId.get(srcId);
  if (opts.oneshot) dmg = Math.max(dmg, a.hp + 1);
  if (opts.exec && a.hp - dmg < a.maxHp * opts.exec) dmg = Math.max(dmg, a.hp + 1);
  applyFx(a, opts.fx, srcId);
  if (dmg <= 0) return;
  a.hp -= dmg; a.lastDmgT = Game.t; a.hitFlash = 0.15;
  if (srcId && srcId !== a.id) { a.lastHit[srcId] = Game.t; a.lastHitBy = srcId; }
  if (a === Game.me) HUD.hurt(dmg, src ? src.pos : (opts.srcPos ? new V3(opts.srcPos[0], 0, opts.srcPos[1]) : null));
  if (a.isBot) Bots.hurt(a, src);
  if (a.hp <= 0) killActor(a, srcId, opts.how || (opts.dot ? opts.dot : 'weapon'));
}
function killActor(a, srcId, how) {
  a.hp = 0; a.alive = false; a.d++; a.respawnT = RESPAWN_T; a.killer = srcId;
  const assists = Object.keys(a.lastHit).filter(id => id !== srcId && id !== a.id && Game.t - a.lastHit[id] < 8);
  a.lastHit = {};
  emit(['k', a.id, srcId || '', how || '', assists.slice(0, 3).join(',')]);
  if (a.P.key === 'ram' && a.pw.state !== 'idle') endRam(a, false);
  if (a.P.key === 'fade') a.pw.state = 'vis';
}

// ---------------------------------------------------------------- events: every copy runs them; local ones also go out
function emit(ev) { Net.push(ev); onEvent(ev, false, Net.uid); }
function onEvent(ev, remote, from) {
  const E = ev;
  switch (E[0]) {
    case 'k': {
      const v = Game.byId.get(E[1]), k = Game.byId.get(E[2]), as = (E[4] || '').split(',').filter(Boolean);
      if (v && remote) { v.alive = false; v.hp = 0; }
      if (v) deathFx(v);
      if (k && k !== v) { if (remote || k.remote) k.k++; else k.k++; }
      for (const id of as) { const x = Game.byId.get(id); if (x) x.a++; }
      HUD.feed(k, v, E[3]);
      if (k === Game.me && v !== Game.me) { Sfx.play('kill'); HUD.killBanner(v, E[3]); }
      if (v === Game.me) HUD.died(k, E[3]);
      if (Net.isHost()) Mode.onKill(k, v);
      break;
    }
    case 'h': {
      const t = Game.byId.get(E[1]); if (!t || t.remote) return;
      const o = E[4] || {}, opts = { head: !!o.h, fx: sanitizeFx(o.f), how: typeof o.w === 'string' ? o.w.slice(0, 12) : 'weapon', exec: Number.isFinite(o.x) ? clamp(o.x, 0, 0.6) : 0, oneshot: !!o.o, srcPos: Array.isArray(o.p) ? o.p : null };
      applyDamage(t, clamp(+E[2] || 0, 0, 999), E[3], opts);
      break;
    }
    case 's': {
      const a = Game.byId.get(E[1]); if (!a || !remote || !a.model) return;
      shotVisual(a, new V3(E[2], E[3], E[4]), E[5] | 0);
      break;
    }
    case 'pr': spawnProj(E[1], E[2], new V3(E[3], E[4], E[5]), new V3(E[6], E[7], E[8]), E[9] || {}, remote); break;
    case 'sn': placeSnare(E[1], E[2], new V3(E[3], E[4], E[5]), E[6] || {}, remote); break;
    case 'sp': springSnareFx(E[1], E[2]); break;
    case 'sx': { const s = Game.snares.get(E[1]); if (s) removeSnare(s); break; }
    case 'bl': { const a = Game.byId.get(E[1]); blinkFx(a, new V3(E[2], E[3], E[4]), new V3(E[5], E[6], E[7]), remote); break; }
    case 'wl': placeWall(E[1], E[2] | 0, new V3(E[3], E[4], E[5]), E[6], E[7] || ''); break;
    case 'wh': { const w = Game.walls.get(E[1]); if (w) damageWall(w, +E[2] || 0); break; }
    case 'rv': {
      // reveal every enemy of a team (Killing Field)
      for (const a of Game.actors) if (!a.remote && a.alive && enemyOfTeam(a, E[1], E[3])) applyFx(a, { reveal: E[2] });
      if (Game.me && !enemyOfTeam(Game.me, E[1], E[3])) HUD.note('Killing Field: enemies revealed');
      Sfx.play('reveal');
      break;
    }
    case 'fb': { for (const s of Game.snares.values()) if (s.owner === E[1]) s.boostT = E[2]; break; }
    case 'fi': Game.fires.push({ x: E[1], z: E[2], y: E[3], owner: E[4], team: E[5] | 0, dps: E[6], t: 3, acc: 0 }); fireFx(E[1], E[3], E[2]); break;
    case 'dc': { const a = Game.byId.get(E[1]); if (a) spawnDecoy(a, new V3(E[2], E[3], E[4]), E[5]); break; }
    case 'pk': Pickups.take(E[1] | 0, E[2]); break;
    case 'fx': namedFx(E[1], new V3(E[2], E[3], E[4]), E[5], E[6], remote); break;
    case 'zn': Mode.zoneEvent && Mode.zoneEvent(E); break;
  }
}
function sanitizeFx(f) {
  if (!f || typeof f !== 'object') return null;
  const o = {}, n = (v, a, b) => Number.isFinite(v) ? clamp(v, a, b) : 0;
  if (f.root) o.root = n(f.root, 0, 4); if (f.stun) o.stun = n(f.stun, 0, 3); if (f.reveal) o.reveal = n(f.reveal, 0, 12); if (f.blind) o.blind = n(f.blind, 0, 3);
  if (Array.isArray(f.slow)) o.slow = [n(f.slow[0], 0.2, 1), n(f.slow[1], 0, 5)];
  if (Array.isArray(f.dot)) o.dot = [n(f.dot[0], 0, 80), n(f.dot[1], 0.5, 8), typeof f.dot[2] === 'string' ? f.dot[2].slice(0, 8) : 'bleed'];
  if (Array.isArray(f.knock)) o.knock = [n(f.knock[0], -40, 40), n(f.knock[1], -5, 20), n(f.knock[2], -40, 40)];
  return o;
}

// ---------------------------------------------------------------- local simulation
function canAct(a) { return a.alive && !(a.st.stun > 0) && !(a.P.key === 'ram' && a.pw.state === 'crash'); }
function stepLocal(a, dt) {
  if (!a.alive) {
    if (Mode.respawns()) { a.respawnT -= dt; if (a.respawnT <= 0 && (a !== Game.me || HUD.readyToSpawn())) { if (a.pendingHero) { setHero(a, a.pendingHero.h, a.pendingHero.a); a.pendingHero = null; } spawnActor(a); } }
    return;
  }
  a.spawnProt = Math.max(0, a.spawnProt - dt);
  stTick(a, dt); if (!a.alive) return;
  const I = a.input, P = a.P, pw = a.pw, H = a.H;
  const pressed = k => I[k] && !a.prev[k], released = k => !I[k] && a.prev[k];
  const stunned = !canAct(a), rooted = a.st.root > 0 || stunned;
  // --- powers first: they decide what the rest of the frame may do
  let speedMul = slowMul(a), noFire = false, forced = null;
  if (P.key === 'snare') {
    if (pw.charges < P.carry) { pw.rech += dt; if (pw.rech >= P.recharge) { pw.rech = 0; pw.charges++; } }
    if (pw.placing > 0) { pw.placing -= dt; speedMul *= 0.5; noFire = true; if (pw.placing <= 0) finishSnare(a); }
    else if (pressed('power') && pw.charges > 0 && !stunned) { pw.placing = P.place; Sfx.play('snarePlace', a.pos, 0.6); }
  } else if (P.key === 'blink') {
    const unb = a.st.unbound > 0;
    if (pw.charges < P.charges) { pw.rech += dt; if (pw.rech >= P.recharge) { pw.rech = 0; pw.charges++; } }
    if (pw.chainT > 0) { pw.chainT -= dt; if (pw.chainT <= 0 && pw.used > 0) endChain(a); }
    if (a.st.fatigue > 0) { a.st.fatigue -= dt; speedMul *= 0.5; noFire = true; pw.charging = false; pw.chargeT = 0; }
    else if (I.power && (pw.charges > 0 || unb) && !rooted) {
      if (!pw.charging) { pw.charging = true; pw.chargeT = 0; Sfx.play('blinkCharge', a.pos, 0.6); }
      pw.chargeT = Math.min(P.chargeTime, pw.chargeT + dt); noFire = true; speedMul *= 0.8;
    } else if (pw.charging) { pw.charging = false; if (!rooted && (pw.charges > 0 || unb)) doBlink(a); pw.chargeT = 0; }
  } else if (P.key === 'ram') {
    if (pw.cd > 0) pw.cd -= dt;
    if (pw.state === 'idle') { if (I.power && pw.cd <= 0 && !rooted) { pw.state = 'rev'; pw.t = 0; Sfx.play('rev', a.pos); } }
    else if (pw.state === 'rev') {
      pw.t += dt; speedMul *= 0.35; noFire = true;
      if (!I.power || rooted) { pw.state = 'idle'; pw.cd = 1; }
      else if (pw.t >= P.rev) { pw.state = 'charge'; pw.t = 0; pw.hit.clear(); a.ramYaw = a.yaw; }
    } else if (pw.state === 'charge') {
      pw.t += dt; noFire = true;
      if (!I.power || pw.t >= P.dur || rooted) endRam(a, true);
      else {
        // the charge only turns so fast, whatever the mouse does
        const lim = P.turn * dt, d = angDiff(a.ramYaw, a.yaw); a.yaw = a.ramYaw + clamp(d, -lim, lim); a.ramYaw = a.yaw;
        forced = flatFwd(a.yaw).multiplyScalar(P.speed * Math.min(1, 0.4 + pw.t * 4));
        if (P.trail) { pw.trailT -= dt; if (pw.trailT <= 0) { pw.trailT = 0.22; emit(['fi', r2(a.pos.x), r2(a.pos.z), r2(a.pos.y), a.id, a.team, P.trail]); } }
        ramContacts(a);
      }
    } else if (pw.state === 'crash') { pw.t -= dt; noFire = true; if (pw.t <= 0) { pw.state = 'idle'; pw.cd = P.cd; } }
  } else if (P.key === 'fade') {
    if (pw.cd > 0) pw.cd -= dt;
    if (pw.state === 'vis') { if (pressed('power') && pw.cd <= 0 && !stunned) { pw.state = 'going'; pw.t = P.fadeIn; Sfx.play('fadeOut', a.pos, 0.7); } }
    else if (pw.state === 'going') { pw.t -= dt; noFire = true; speedMul *= 0.8; if (pw.t <= 0) { pw.state = 'cloaked'; pw.cloakT = 0; } }
    else if (pw.state === 'cloaked') {
      pw.cloakT += dt; speedMul *= P.speed; noFire = !P.shootCloaked;
      if (P.regen) a.hp = Math.min(a.maxHp, a.hp + P.regen * dt);
      if (P.sense) a.st.senseT = 0.2;
      if ((pressed('power') && !stunned) || pw.cloakT >= P.maxTime) { pw.state = 'coming'; pw.t = P.fadeOut; Sfx.play('fadeIn', a.pos, 0.7); }
    } else if (pw.state === 'coming') { pw.t -= dt; noFire = true; speedMul *= P.speed; if (pw.t <= 0) unveil(a); }
  } else if (P.key === 'glaive') {
    if (pw.count < P.cap) { pw.rech += dt; if (pw.rech >= P.regen) { pw.rech = 0; pw.count++; } }
    if (I.power && pw.count > 0 && !stunned) { if (!pw.winding) { pw.winding = true; pw.wind = 0; Sfx.play('windup', a.pos, 0.5); } pw.wind += dt; noFire = true; speedMul *= P.slow; }
    else if (pw.winding) { pw.winding = false; if (pw.wind >= P.windMin && !stunned) throwGlaive(a, clamp((pw.wind - P.windMin) / Math.max(0.05, P.windMax - P.windMin), 0, 1)); pw.wind = 0; }
  }
  if (a.st.night > 0) speedMul *= 1.1;
  // --- utility and ultimate
  if (a.utilT > 0) a.utilT -= dt;
  if (pressed('util') && a.utilT <= 0 && !stunned) useUtil(a);
  a.ult = Math.min(100, a.ult + dt * 0.6 * (a.st.unbound || a.st.night ? 0 : 1));
  if (pressed('ult') && a.ult >= 100 && !stunned) useUlt(a);
  // --- movement
  const fwd = flatFwd(a.yaw), right = new V3(-fwd.z, 0, fwd.x);
  const wish = new V3().addScaledVector(fwd, I.fwd).addScaledVector(right, I.side); if (wish.lengthSq() > 1) wish.normalize();
  const spd = H.speed * speedMul * (a.reloadT > 0 ? 0.92 : 1);
  if (a.dashT > 0) { a.dashT -= dt; }
  else if (forced) { a.vel.x = forced.x; a.vel.z = forced.z; }
  else if (rooted) { a.vel.x *= Math.exp(-20 * dt); a.vel.z *= Math.exp(-20 * dt); }
  else {
    const accel = a.grounded ? (a.knockT > 0 ? 6 : 60) : 14;
    const tx = wish.x * spd, tz = wish.z * spd;
    if (a.grounded || wish.lengthSq() > 0.01) { a.vel.x = damp(a.vel.x, tx, accel / 6, dt); a.vel.z = damp(a.vel.z, tz, accel / 6, dt); }
    if (I.jump && a.grounded && !rooted) { a.vel.y = 7.6; a.grounded = false; Sfx.play('jump', a.pos, 0.4); }
  }
  if (a.knockT > 0) a.knockT -= dt;
  a.gravMul = a.leapT > 0 ? 0.8 : 1; if (a.leapT > 0) a.leapT -= dt;
  const wasAir = !a.grounded, res = World.moveBody(a, dt);
  if (wasAir && a.grounded && res.landV > 6) { Sfx.play('land', a.pos, Math.min(1, res.landV / 14)); if (a === Game.me) View.land(res.landV); }
  if (P.key === 'ram' && pw.state === 'charge' && res.wall && res.wallSpeed > P.speed * 0.55) ramCrash(a);
  // jump pads
  for (const p of World.pads) if (a.grounded && Math.abs(a.pos.x - p.x) < 1.1 && Math.abs(a.pos.z - p.z) < 1.1 && Math.abs(a.pos.y - p.y) < 0.4) launchPad(a, p);
  Pickups.check(a);
  // footsteps
  const hs = Math.hypot(a.vel.x, a.vel.z);
  if (a.grounded && hs > 2) { a.stepT -= dt * hs / 6; if (a.stepT <= 0) { a.stepT = 0.42; if (!(P.key === 'fade' && pw.state !== 'vis' && P.silent) && !(a.st.night > 0)) Sfx.play('step', a === Game.me ? null : a.pos, a === Game.me ? 0.25 : 0.7); } }
  // --- weapon
  weaponTick(a, dt, I.fire && !noFire && !stunned && !(a.dashT > 0 && false), pressed('reload'));
  a.prev = Object.assign({}, I);
}
function launchPad(a, p) {
  const dx = p.tx - a.pos.x, dz = p.tz - a.pos.z, dy = p.ty - a.pos.y, apex = Math.max(dy, 0) + p.apex, g = PHYS.grav;
  const vy = Math.sqrt(2 * g * apex), tUp = vy / g, tDown = Math.sqrt(2 * Math.max(0.1, apex - dy) / g), T = tUp + tDown;
  a.vel.set(dx / T, vy, dz / T); a.grounded = false; a.dashT = T * 0.95;
  Sfx.play('pad', a.pos); Fx.ring(new V3(p.x, p.y, p.z), 2, 0x3acfff, 0.5, 4, 0.25);
}

// ---------------------------------------------------------------- weapons
function weaponTick(a, dt, wantFire, wantReload) {
  const W = a.H.weapon;
  a.bloom = Math.max(0, a.bloom - dt * 0.12);
  if (a.fireT > 0) a.fireT -= dt;
  if (a.reloadT > 0) { a.reloadT -= dt; if (a.reloadT <= 0) a.ammo = W.mag; return; }
  if (a.burstLeft > 0) { a.burstT -= dt; if (a.burstT <= 0 && a.ammo > 0) { fireShot(a); a.burstLeft--; a.burstT = W.burstGap; if (!a.burstLeft) a.fireT = W.rof; } else if (a.ammo <= 0) a.burstLeft = 0; return; }
  if ((wantReload && a.ammo < W.mag) || (a.ammo <= 0 && a.fireT <= 0)) { a.reloadT = W.reload; Sfx.play('reload', a === Game.me ? null : a.pos, 0.5); if (a === Game.me) View.reload(W.reload); return; }
  if (!wantFire || a.fireT > 0) return;
  // a faded Veil with the Iridescent Shroud: the shot unveils her
  if (a.P.key === 'fade' && a.pw.state === 'cloaked' && a.P.shootCloaked) unveil(a);
  if (W.kind === 'burst') { a.burstLeft = W.burst; a.burstT = 0; return weaponTick(a, 0, false, false); }
  fireShot(a); a.fireT = W.rof;
}
const _e = new V3(), _d = new V3(), _r = new V3(), _u = new V3();
function shotDir(a, spread, out) {
  aimDir(a.yaw, a.pitch, out);
  if (spread > 0) {
    _r.set(Math.cos(a.yaw), 0, -Math.sin(a.yaw)); _u.crossVectors(_r, out).normalize();
    const ang = Math.random() * TAU, m = Math.sqrt(Math.random()) * spread;
    out.addScaledVector(_r, Math.cos(ang) * m).addScaledVector(_u, Math.sin(ang) * m).normalize();
  }
  return out;
}
function dmgMods(a, base) {
  let d = base, tags = {};
  if (a.st.strike > 0 && a.P.key === 'blink') { d *= 1 + a.P.strike; tags.strike = true; }
  if (a.st.unbound > 0) { d *= 1 + a.P.strike; tags.strike = true; }
  if (a.st.night > 0) d *= 1.25;
  return { d, tags };
}
function fireShot(a) {
  const W = a.H.weapon, eye = eyePos(a, new V3()), moving = Math.hypot(a.vel.x, a.vel.z) > 1 || !a.grounded;
  a.ammo--;
  const spread = W.spread + (moving ? W.spreadMove : 0) + a.bloom;
  a.bloom = Math.min(0.03, a.bloom + (W.kind === 'burst' ? 0.0035 : W.kind === 'hitscan' && W.auto && W.rof < 0.1 ? 0.0012 : 0.002));
  if (a.st.night > 0) a.st.nightFlash = 0.25;
  const ambush = a.P.key === 'fade' && a.st.ambush > 0;
  if (ambush) { a.st.ambush = 0; Sfx.play('ambush', a.pos, 0.8); }
  if (a === Game.me) View.kick(W.recoil);
  Sfx.play(W.sound, a === Game.me ? null : a.pos, a === Game.me ? 0.55 : 1);
  if (W.kind === 'proj') {
    const dir = shotDir(a, spread, new V3()), o = muzzleStart(a, eye, dir);
    const m = dmgMods(a, W.dmg);
    emit(['pr', 'orb', a.id, r2(o.x), r2(o.y), r2(o.z), r2(dir.x * W.projSpeed), r2(dir.y * W.projSpeed), r2(dir.z * W.projSpeed), { d: r2(m.d), s: W.splash, r: W.splashR, g: W.projGrav }]);
    muzzleFx(a, 0x5affd2);
    return;
  }
  const n = W.kind === 'pellets' ? W.pellets : 1;
  let endFirst = null;
  const hitsAgg = new Map();
  for (let i = 0; i < n; i++) {
    shotDir(a, spread, _d);
    const res = traceShot(a, eye, _d, W.range, ambush && a.P.pierce);
    endFirst = endFirst || res.end;
    for (const h of res.hits) {
      const dist = h.t, fo = W.falloff ? lerp(1, W.falloff[2], smooth(W.falloff[0], W.falloff[1], dist)) : 1;
      let d = W.dmg * fo * (h.head ? W.head : 1);
      const m = dmgMods(a, d); d = m.d;
      const agg = hitsAgg.get(h.a) || { d: 0, head: false, pt: h.pt }; agg.d += d; agg.head = agg.head || h.head; hitsAgg.set(h.a, agg);
    }
    if (res.wall) emit(['wh', res.wall.id, W.dmg]);
    if (!res.hits.length && res.hit) Fx.sparks(res.end, { x: res.hit.nx, y: res.hit.ny, z: res.hit.nz }, W.tracer, W.kind === 'pellets' ? 2 : 6);
    if (W.kind === 'pellets' || i === 0) shotVisual(a, res.end, i, true);
  }
  let first = true;
  for (const [t, h] of hitsAgg) {
    let d = h.d, fx = null;
    if (ambush && first) { d += a.P.ambush; fx = { reveal: 3 }; }
    if (!a.P.pierce) first = false;
    hitActor(a, t, d, { head: h.head, fx, how: ambush ? 'ambush' : 'weapon' });
    Fx.burst(h.pt, 0xff3048, 6, 4, 0.3, 0.06, { k: 4 });
  }
  if (endFirst) Net.push(['s', a.id, r2(endFirst.x), r2(endFirst.y), r2(endFirst.z), n]);
}
function muzzleStart(a, eye, dir) {
  if (a === Game.me) { const r = new V3(Math.cos(a.yaw), 0, -Math.sin(a.yaw)); return eye.clone().addScaledVector(r, 0.18).add(new V3(0, -0.12, 0)).addScaledVector(dir, 0.5); }
  return eye.clone().addScaledVector(dir, 0.6);
}
// hitscan: the nearest world hit, plus every enemy the ray reaches before it (just the first, unless piercing)
function traceShot(a, eye, dir, range, pierce) {
  const wh = World.ray(eye.x, eye.y, eye.z, dir.x, dir.y, dir.z, range, a.team);
  const maxT = wh ? wh.t : range, hits = [];
  for (const o of Game.actors) {
    if (!o.alive || !isEnemy(a, o)) continue;
    const h = rayActor(eye, dir, o, maxT); if (h) hits.push(h);
  }
  for (const d of Game.decoys) { const h = rayPoint(eye, dir, d.pos, 0.5, maxT); if (h !== null) hits.push({ a: null, t: h, decoy: d }); }
  hits.sort((x, y) => x.t - y.t);
  let real = hits.filter(h => h.a);
  const dec = hits.find(h => h.decoy); if (dec && (!real.length || dec.t < real[0].t)) { popDecoy(dec.decoy); real = []; return { hits: [], end: eye.clone().addScaledVector(dir, dec.t), hit: null }; }
  if (!pierce) real = real.slice(0, 1);
  const endT = real.length && !pierce ? real[0].t : maxT;
  return { hits: real, end: eye.clone().addScaledVector(dir, endT), hit: real.length && !pierce ? null : wh, wall: !real.length && wh && wh.wall ? wh.wall : null };
}
function rayPoint(o, d, c, r, maxT) {
  const ox = c.x - o.x, oy = c.y + 1 - o.y, oz = c.z - o.z, t = ox * d.x + oy * d.y + oz * d.z; if (t < 0 || t > maxT) return null;
  const px = o.x + d.x * t - c.x, py = o.y + d.y * t - c.y - 1, pz = o.z + d.z * t - c.z; return px * px + py * py + pz * pz < r * r * 4 ? t : null;
}
// ray against a hero: a head sphere and a body capsule
function rayActor(o, d, a, maxT, pad = 0) {
  const p = a.renderPos || a.pos;
  const hc = new V3(p.x, p.y + 1.62, p.z), hr = 0.22 + pad;
  let best = null;
  const oc = o.clone().sub(hc), b = oc.dot(d), c = oc.lengthSq() - hr * hr, disc = b * b - c;
  if (disc >= 0) { const t = -b - Math.sqrt(disc); if (t > 0 && t < maxT) best = { a, t, head: true }; }
  // body: closest approach between the ray and the segment from hips to shoulders
  const r = (a.heroKey === 'gauge' ? 0.48 : 0.4) + pad, A = new V3(p.x, p.y + 0.35, p.z), u = new V3(0, 1.0, 0);
  const w0 = o.clone().sub(A), aa = d.dot(d), bb = d.dot(u), cc = u.dot(u), dd = d.dot(w0), ee = u.dot(w0), den = aa * cc - bb * bb;
  let sc = den > 1e-6 ? (bb * ee - cc * dd) / den : 0, tc = den > 1e-6 ? (aa * ee - bb * dd) / den : 0;
  tc = clamp(tc, 0, 1); sc = Math.max(0, (bb * tc - dd) / aa);
  const pc = o.clone().addScaledVector(d, sc), qc = A.clone().addScaledVector(u, tc), dist = pc.distanceTo(qc);
  if (dist < r && sc < maxT) { const t = sc - Math.sqrt(Math.max(0, r * r - dist * dist)); if (!best || t < best.t) best = { a, t: Math.max(0, t), head: false }; }
  if (best) best.pt = o.clone().addScaledVector(d, best.t);
  return best;
}
function shotVisual(a, end, i, local) {
  const W = a.H.weapon;
  let from;
  if (a === Game.me) from = View.muzzleWorld(i);
  else if (a.model) { const g = W.twin && (a.shotN = (a.shotN || 0) + 1) % 2 ? a.model.gun2 : a.model.gun; from = g.userData.muzzle.getWorldPosition(new V3()); }
  else from = eyePos(a);
  const n = W.kind === 'pellets' && !local ? Math.min(i, 11) : 1;
  for (let k = 0; k < n; k++) {
    const e = n > 1 ? end.clone().add(new V3(rand(-1, 1), rand(-1, 1), rand(-1, 1)).multiplyScalar(from.distanceTo(end) * 0.07)) : end;
    Fx.tracer(from, e, W.tracer, W.kind === 'pellets' ? 0.012 : 0.018, 0.07, 5);
  }
  if (!local) Sfx.play(W.sound, a.pos, 1);
  if (i === 0 || !local) muzzleFx(a, W.tracer, from);
}
function muzzleFx(a, hex, at) {
  const p = at || (a === Game.me ? View.muzzleWorld(0) : a.model ? a.model.gun.userData.muzzle.getWorldPosition(new V3()) : eyePos(a));
  Fx.burst(p, hex, 4, 2, 0.06, 0.08, { k: 6 }); muzzleLight(p, hex, a === Game.me ? 4 : 6);
  if (a === Game.me) View.flash();
}

// ---------------------------------------------------------------- projectiles (orbs and glaives)
function spawnProj(kind, ownerId, pos, vel, o, remote) {
  const owner = Game.byId.get(ownerId);
  const p = { kind, owner: ownerId, team: owner ? owner.team : -1, pos: pos.clone(), vel: vel.clone(), t: 0, o, local: !remote && owner && !owner.remote, bounces: o.rb | 0, hitSet: new Set(), mesh: null };
  if (kind === 'glaive') { p.mesh = buildGlaive(owner ? owner.H.glow : 0x5affd2, 1.3); Sfx.play('glaive', pos, 1); }
  else { p.mesh = new THREE.Mesh(sph(0.16, 12, 8), mGlow(0x5affd2, 6)); }
  p.mesh.position.copy(pos); G.scene.add(p.mesh);
  Game.projs.push(p);
}
function projTick(dt) {
  for (let i = Game.projs.length - 1; i >= 0; i--) {
    const p = Game.projs[i];
    if (p.stuck != null) { p.stuck -= dt; if (p.stuck <= 0) { G.scene.remove(p.mesh); Game.projs.splice(i, 1); } continue; }
    p.t += dt; const g = p.o.g != null ? p.o.g : 9;
    p.vel.y -= g * dt;
    const step = p.vel.clone().multiplyScalar(dt), len = step.length(), dir = step.clone().divideScalar(len || 1);
    const wh = World.ray(p.pos.x, p.pos.y, p.pos.z, dir.x, dir.y, dir.z, len, p.team);
    // heroes along the step (only the thrower's copy decides hits)
    let hitA = null, hitT = wh ? wh.t : len;
    if (p.local) {
      const owner = Game.byId.get(p.owner);
      for (const a of Game.actors) {
        if (!a.alive || !owner || !isEnemy(owner, a) || p.hitSet.has(a.id)) continue;
        const h = rayActor(p.pos, dir, a, hitT, p.kind === 'glaive' ? 0.28 : 0.16);
        if (h && h.t <= hitT) { hitT = h.t; hitA = h; }
      }
    }
    if (hitA) { p.pos.addScaledVector(dir, hitA.t); projHitActor(p, hitA); }
    else if (wh) {
      p.pos.set(wh.x, wh.y, wh.z);
      if (wh.wall && p.local) emit(['wh', wh.wall.id, p.o.d || 50]);
      if (p.kind === 'glaive' && p.bounces > 0 && !wh.floor) {
        p.bounces--; const n = new V3(wh.nx, wh.ny, wh.nz); p.vel.reflect(n).multiplyScalar(0.85); p.pos.addScaledVector(n, 0.05);
        Fx.sparks(p.pos, n, 0xffe0a0, 8); Sfx.play('glaiveHit', p.pos, 0.6);
      } else projImpact(p, wh);
    } else p.pos.add(step);
    if (p.mesh) {
      p.mesh.position.copy(p.pos);
      if (p.kind === 'glaive') { p.mesh.rotation.y += dt * 22; p.mesh.rotation.x = 0.25; Fx.spawn('add', p.pos.x, p.pos.y, p.pos.z, 0, 0, 0, 0.8, 2.4, 1.8, 0.12, 0.16); }
      else Fx.spawn('add', p.pos.x, p.pos.y, p.pos.z, rand(-0.3, 0.3), rand(-0.3, 0.3), rand(-0.3, 0.3), 0.6, 3, 2.4, 0.2, 0.25);
    }
    if (p.t > 6 || p.pos.y < -5) { G.scene.remove(p.mesh); if (Game.projs[i] === p) Game.projs.splice(i, 1); }
  }
}
function projHitActor(p, h) {
  const owner = Game.byId.get(p.owner), o = p.o;
  if (p.kind === 'glaive') {
    let d = o.d || 60; if (h.head) d *= 1.5;
    const fx = {};
    if (o.v) fx.dot = [o.v, 5, 'poison'];
    if (o.m) { fx.reveal = o.m; fx.slow = [0.75, 2]; }
    hitActor(owner, h.a, d, { head: h.head, fx, how: 'glaive', oneshot: !!o.os });
    Fx.burst(h.pt || p.pos, 0xff3048, 14, 6, 0.4, 0.08, { k: 4 }); Sfx.play('glaiveHit', p.pos, 1);
    if (o.b) splash(p, o.b, o.br, h.a);
    p.hitSet.add(h.a.id);
    Net.push(['fx', 'gstick', r2(p.pos.x), r2(p.pos.y), r2(p.pos.z), 0, 0]);
    G.scene.remove(p.mesh); Game.projs.splice(Game.projs.indexOf(p), 1);
  } else {
    hitActor(owner, h.a, o.d || 50, { head: false, how: 'weapon' });
    splash(p, o.s, o.r, h.a);
    orbBoom(p); emit(['fx', 'orb', r2(p.pos.x), r2(p.pos.y), r2(p.pos.z), 0, 0]);
  }
}
function projImpact(p, wh) {
  const o = p.o;
  if (p.kind === 'glaive') {
    Fx.sparks(p.pos, { x: wh.nx, y: wh.ny, z: wh.nz }, 0xffe0a0, 10); Sfx.play('glaiveHit', p.pos, 0.7);
    if (o.b && p.local) splash(p, o.b, o.br, null);
    if (o.b) Fx.explosion(p.pos, o.br * 0.6, 0xff8a3a);
    p.stuck = 2.5; p.mesh.rotation.x = Math.PI / 2 - 0.4;
  } else {
    if (p.local) { splash(p, o.s, o.r, null); emit(['fx', 'orb', r2(p.pos.x), r2(p.pos.y), r2(p.pos.z), 0, 0]); }
    orbBoom(p);
  }
}
function orbBoom(p) { const i = Game.projs.indexOf(p); if (i >= 0) { G.scene.remove(p.mesh); Game.projs.splice(i, 1); } }
function splash(p, dmg, r, skip) {
  const owner = Game.byId.get(p.owner); if (!owner || !dmg) return;
  for (const a of Game.actors) {
    if (!a.alive || a === skip) continue;
    const self = a === owner; if (!self && !isEnemy(owner, a)) continue;
    const c = new V3(a.pos.x, a.pos.y + 0.9, a.pos.z), d = c.distanceTo(p.pos); if (d > r + 0.4) continue;
    if (!World.clear(p.pos.x, p.pos.y + 0.1, p.pos.z, c.x, c.y, c.z)) continue;
    const f = 1 - clamp((d - 0.4) / r, 0, 1) * 0.6, dd = dmg * f * (self ? 0.3 : 1);
    const push = c.clone().sub(p.pos).setY(0).normalize().multiplyScalar(self ? 6 : 3);
    hitActor(owner, a, dd, { fx: { knock: [push.x, self ? 6.5 : 3, push.z] }, how: p.kind });
  }
}

// ---------------------------------------------------------------- Marrow: snares
function finishSnare(a) {
  const P = a.P, pw = a.pw; if (pw.charges <= 0) return;
  let pos;
  if (P.throwDist > 0) {
    const e = eyePos(a), d = aimDir(a.yaw, a.pitch), h = World.ray(e.x, e.y, e.z, d.x, d.y, d.z, P.throwDist, a.team);
    pos = h ? new V3(h.x, h.y, h.z).addScaledVector(d, -0.3) : e.clone().addScaledVector(d, P.throwDist);
  } else pos = a.pos.clone().add(flatFwd(a.yaw).multiplyScalar(1.1));
  pos.y = World.groundAt(pos.x, pos.z, pos.y + 0.6);
  pw.charges--; pw.n++;
  const id = a.id + '#' + pw.n;
  emit(['sn', id, a.id, r2(pos.x), r2(pos.y), r2(pos.z), { d: P.dmg, rt: P.noRoot ? 0 : P.root, rv: P.reveal, b: P.bleed, r: P.radius, v: P.visDist, c: P.chain ? 1 : 0, bl: P.bell, x: P.explode, xr: P.explodeR, ar: P.arm }]);
  // only so many snares out at once: the oldest goes
  const mine = [...Game.snares.values()].filter(s => s.owner === a.id).sort((x, y) => x.born - y.born);
  while (mine.length > P.carry) emit(['sx', mine.shift().id]);
}
function placeSnare(id, ownerId, pos, o, remote) {
  if (Game.snares.has(id)) return;
  const owner = Game.byId.get(ownerId), mesh = buildSnare(owner && Game.me && !isEnemy(Game.me, owner) ? TEAM_HEX[0] : ENEMY_HEX);
  mesh.position.copy(pos); mesh.rotation.y = rand(0, TAU); G.scene.add(mesh);
  const s = { id, owner: ownerId, team: owner ? owner.team : -1, pos: pos.clone(), o, born: Game.t, mesh, armT: o.ar || 1, boostT: 0 };
  Game.snares.set(id, s);
  Sfx.play('snarePlace', pos, 0.8);
  void remote;
}
function removeSnare(s) { G.scene.remove(s.mesh); Game.snares.delete(s.id); }
function snareTick(dt) {
  for (const s of Game.snares.values()) {
    if (s.sprung) continue;
    s.armT -= dt; if (s.boostT > 0) s.boostT -= dt;
    const armed = s.armT <= 0, owner = Game.byId.get(s.owner);
    const U = s.mesh.userData; U.light.visible = armed;
    // visibility: the owner's side always sees it; enemies only up close
    if (Game.me) { const enemy = owner ? isEnemy(Game.me, owner) : true; s.mesh.visible = !enemy || Game.me.pos.distanceTo(s.pos) < (s.o.v || 12); }
    if (!armed) continue;
    const r = (s.o.r || 1.1) * (s.boostT > 0 ? 1.8 : 1);
    for (const a of Game.actors) {
      if (a.remote || !a.alive || !owner || !isEnemy(owner, a)) continue;
      if (Math.abs(a.pos.y - s.pos.y) > 1.0) continue;
      if ((a.pos.x - s.pos.x) ** 2 + (a.pos.z - s.pos.z) ** 2 > r * r) continue;
      springSnare(s, a); break;
    }
  }
}
function springSnare(s, a) {
  const o = s.o, owner = Game.byId.get(s.owner);
  emit(['sp', s.id, a.id]);
  const fx = { reveal: o.rv || 4 }; if (o.rt) fx.root = o.rt; if (o.b) fx.dot = [o.b, 4, 'bleed'];
  if (o.x) {
    for (const t of Game.actors) {
      if (!t.alive || !owner || !isEnemy(owner, t)) continue;
      const d = t.pos.distanceTo(s.pos); if (d > o.xr) continue;
      hitActor(owner, t, o.x * (1 - d / o.xr * 0.4), { fx: { reveal: o.rv, knock: [0, 5, 0] }, how: 'snare', srcPos: [s.pos.x, s.pos.z] });
    }
    emit(['fx', 'boom', r2(s.pos.x), r2(s.pos.y + 0.3), r2(s.pos.z), o.xr, 0xff8a3a]);
  } else hitActor(owner, a, o.d || 35, { fx, how: 'snare', srcPos: [s.pos.x, s.pos.z] });
  if (o.c) for (const s2 of Game.snares.values()) {
    if (s2 === s || s2.owner !== s.owner || s2.pos.distanceTo(s.pos) > 12) continue;
    emit(['fx', 'pulse', r2(s2.pos.x), r2(s2.pos.y), r2(s2.pos.z), 4, 0]);
    for (const t of Game.actors) if (t.alive && owner && isEnemy(owner, t) && t.pos.distanceTo(s2.pos) < 4) hitActor(owner, t, 15, { fx: { slow: [0.5, 2] }, how: 'snare' });
  }
  if (o.bl) for (const t of Game.actors) if (t.alive && owner && isEnemy(owner, t) && t !== a && t.pos.distanceTo(s.pos) < o.bl) hitActor(owner, t, 0, { fx: { reveal: o.rv || 4 } });
}
function springSnareFx(id, vid) {
  const s = Game.snares.get(id); if (!s) return;
  if (s.sprung) return; s.sprung = true;
  const v = Game.byId.get(vid), U = s.mesh.userData;
  U.jawA.rotation.x = -0.1; U.jawB.rotation.x = 0.1;
  Sfx.play('snareSnap', s.pos, 1.2); Fx.sparks(s.pos.clone().setY(s.pos.y + 0.3), { x: 0, y: 1, z: 0 }, 0xffd090, 12);
  Fx.ring(s.pos, 2.2, 0xff8a3a, 0.4, 4);
  const owner = Game.byId.get(s.owner);
  if (owner === Game.me && v) { HUD.note(`${v.name} is caught in a snare`); }
  if (owner && !owner.remote) owner.ult = Math.min(100, owner.ult + 5);
  setTimeout(() => removeSnare(s), 900);
}

// ---------------------------------------------------------------- Lark: rift step
function doBlink(a) {
  const P = a.P, pw = a.pw, f = clamp(pw.chargeT / P.chargeTime, 0, 1), dist = lerp(P.minDist, P.maxDist, f);
  const e = eyePos(a), d = aimDir(a.yaw, clamp(a.pitch, -0.35, 0.6));
  const h = World.ray(e.x, e.y - 0.6, e.z, d.x, d.y, d.z, dist, -9);
  let to = h ? new V3(h.x, h.y, h.z).addScaledVector(d, -0.55) : e.clone().setY(e.y - 0.6).addScaledVector(d, dist);
  if (h && h.ny > 0.6) to.set(h.x, h.y, h.z);
  to.y -= PHYS.eye - 0.6;
  const g = World.groundAt(to.x, to.z, to.y + 0.6); if (to.y < g) to.y = g;
  const probe = { x: to.x, z: to.z }; World.collideXZ(probe, PHYS.r, to.y + PHYS.step, to.y + PHYS.h); to.x = probe.x; to.z = probe.z;
  const B = World.bounds; to.x = clamp(to.x, B.x0 + 0.6, B.x1 - 0.6); to.z = clamp(to.z, B.z0 + 0.6, B.z1 - 0.6); to.y = Math.max(to.y, 0);
  const from = a.pos.clone();
  if (P.decoy) emit(['dc', a.id, r2(from.x), r2(from.y), r2(from.z), r2(a.yaw)]);
  a.pos.copy(to); a.vel.multiplyScalar(0.3); a.vel.y = Math.max(0, a.vel.y);
  emit(['bl', a.id, r2(from.x), r2(from.y), r2(from.z), r2(to.x), r2(to.y), r2(to.z)]);
  if (!(a.st.unbound > 0)) pw.charges--;
  pw.used++; pw.chainT = P.window; a.st.strike = P.strikeWin;
  if (P.heal) a.hp = Math.min(a.maxHp, a.hp + P.heal);
  if (P.arriveDmg) for (const t of Game.actors) if (t.alive && isEnemy(a, t) && t.pos.distanceTo(to) < P.arriveR + 0.4) hitActor(a, t, P.arriveDmg, { fx: { knock: [0, 4, 0] }, how: 'blink' });
  if (P.arriveDmg) emit(['fx', 'seam', r2(to.x), r2(to.y + 0.8), r2(to.z), P.arriveR, 0]);
  if (P.lineDmg) {
    const seg = to.clone().sub(from), L = seg.length(); seg.normalize();
    for (const t of Game.actors) { if (!t.alive || !isEnemy(a, t)) continue; const rel = t.pos.clone().sub(from), u = clamp(rel.dot(seg), 0, L); if (from.clone().addScaledVector(seg, u).distanceTo(t.pos) < 1.4) hitActor(a, t, P.lineDmg, { how: 'blink' }); }
  }
  if (pw.charges <= 0 && !(a.st.unbound > 0)) endChain(a);
}
function endChain(a) {
  const P = a.P, pw = a.pw;
  if (!P.noFatigue && !(a.st.unbound > 0) && pw.used > 0) { a.st.fatigue = P.fatiguePer * pw.used; Sfx.play('fatigue', a === Game.me ? null : a.pos, 0.7); }
  pw.used = 0; pw.chainT = 0;
}
function blinkFx(a, from, to, remote) {
  const hex = a ? a.H.glow : 0xb48aff;
  Fx.tracer(from.clone().setY(from.y + 1), to.clone().setY(to.y + 1), hex, 0.25, 0.3, 4);
  Fx.burst(from.clone().setY(from.y + 1), hex, 24, 5, 0.5, 0.1, { k: 4 }); Fx.burst(to.clone().setY(to.y + 1), hex, 24, 5, 0.5, 0.1, { k: 4 });
  Fx.sphere(to.clone().setY(to.y + 1), 1.2, hex, 0.25, 3);
  Sfx.play('blink', a === Game.me ? null : to, 1);
  if (a && remote) { a.snaps.length = 0; a.renderPos = a.renderPos || new V3(); a.renderPos.copy(to); a.pos.copy(to); }
  if (a === Game.me) View.blink();
}
function spawnDecoy(a, pos, yaw) {
  const m = buildHero(a.heroKey, modelColorFor(a)); m.root.position.copy(pos); m.root.rotation.y = yaw; G.scene.add(m.root);
  Game.decoys.push({ pos: pos.clone(), m, t: 3, owner: a.id });
}
function popDecoy(d) { d.t = 0; Fx.burst(d.pos.clone().setY(d.pos.y + 1), 0xb48aff, 30, 5, 0.6, 0.1); }

// ---------------------------------------------------------------- Gauge: ramjet
function endRam(a, cool) { const pw = a.pw; pw.state = 'idle'; pw.cd = cool ? a.P.cd : Math.max(pw.cd, 2); a.vel.x *= 0.3; a.vel.z *= 0.3; }
function ramContacts(a) {
  const P = a.P, pw = a.pw, fwd = flatFwd(a.yaw);
  for (const t of Game.actors) {
    if (!t.alive || !isEnemy(a, t) || pw.hit.has(t.id)) continue;
    const rel = t.pos.clone().sub(a.pos); if (Math.abs(rel.y) > 1.6) continue; rel.y = 0;
    const along = rel.dot(fwd), side = Math.abs(rel.x * fwd.z - rel.z * fwd.x);
    if (along < -0.3 || along > 1.5 || side > 1.0) continue;
    pw.hit.add(t.id);
    const k = fwd.clone().multiplyScalar(P.knock);
    hitActor(a, t, P.dmg, { fx: { knock: [k.x, 4 + P.knock * 0.2, k.z], stun: 0.35 }, exec: P.execute, how: 'ram' });
    emit(['fx', 'ram', r2(t.pos.x), r2(t.pos.y + 1), r2(t.pos.z), 0, 0]);
    if (a === Game.me) View.shake(0.5);
    if (!P.multi) { endRam(a, true); return; }
  }
}
function ramCrash(a) {
  const P = a.P, pw = a.pw;
  emit(['fx', 'crash', r2(a.pos.x), r2(a.pos.y + 1), r2(a.pos.z), P.shock ? P.shockR : 0, 0]);
  if (P.shock) for (const t of Game.actors) if (t.alive && isEnemy(a, t) && t.pos.distanceTo(a.pos) < P.shockR && World.clear(a.pos.x, a.pos.y + 1, a.pos.z, t.pos.x, t.pos.y + 1, t.pos.z)) hitActor(a, t, P.shock, { fx: { knock: [0, 5, 0] }, how: 'ram' });
  if (a === Game.me) View.shake(1);
  a.vel.set(0, 0, 0);
  if (P.crashStun > 0) { pw.state = 'crash'; pw.t = P.crashStun; } else endRam(a, true);
}

// ---------------------------------------------------------------- Veil: fade
function unveil(a) {
  const P = a.P, pw = a.pw;
  pw.state = 'vis'; pw.cd = P.cd; a.st.ambush = P.ambushWin;
  if (P.blind) {
    emit(['fx', 'bloom', r2(a.pos.x), r2(a.pos.y + 1), r2(a.pos.z), 7, 0]);
    for (const t of Game.actors) if (t.alive && isEnemy(a, t) && t.pos.distanceTo(a.pos) < 7) hitActor(a, t, 0, { fx: { blind: P.blind } });
  }
}

// ---------------------------------------------------------------- Ivra: glaives
function throwGlaive(a, f, spreadDeg = 0, free = false) {
  const P = a.P, pw = a.pw;
  const speed = lerp(P.spdMin, P.spdMax, f), dmg = lerp(P.dmgMin, P.dmgMax, f), full = f >= 0.98;
  const n = P.twin && !free ? Math.min(2, pw.count) : 1;
  if (!free) pw.count -= n;
  for (let i = 0; i < n; i++) {
    const yaw = a.yaw + (n > 1 ? (i ? 1 : -1) * 0.07 : 0) + spreadDeg, d = aimDir(yaw, a.pitch);
    const e = eyePos(a), o = e.clone().add(new V3(Math.cos(a.yaw), 0, -Math.sin(a.yaw)).multiplyScalar(-0.12)).addScaledVector(d, 0.5);
    emit(['pr', 'glaive', a.id, r2(o.x), r2(o.y), r2(o.z), r2(d.x * speed), r2(d.y * speed), r2(d.z * speed), { d: r2(dmg), g: P.grav, v: P.venom, rb: P.ricochet, b: P.blast, br: P.blastR, m: P.mark, os: P.oneshot && full ? 1 : 0 }]);
  }
  if (a === Game.me) View.throwAnim();
}

// ---------------------------------------------------------------- utilities and ultimates
function useUtil(a) {
  const U = a.H.util; a.utilT = U.cd;
  if (U.key === 'heal') { a.st.heal = { rate: 32, t: 2.5 }; Sfx.play('heal', a === Game.me ? null : a.pos); emit(['fx', 'heal', r2(a.pos.x), r2(a.pos.y + 1), r2(a.pos.z), 0, 0]); }
  else if (U.key === 'dash') {
    const I = a.input, fwd = flatFwd(a.yaw), right = new V3(-fwd.z, 0, fwd.x), d = new V3().addScaledVector(fwd, I.fwd).addScaledVector(right, I.side);
    if (d.lengthSq() < 0.01) d.copy(fwd); d.normalize();
    a.vel.x = d.x * 42; a.vel.z = d.z * 42; a.vel.y = Math.max(a.vel.y, 1.5); a.dashT = 0.21;
    Sfx.play('dash', a === Game.me ? null : a.pos); emit(['fx', 'dash', r2(a.pos.x), r2(a.pos.y + 1), r2(a.pos.z), 0, 0]);
  } else if (U.key === 'wall') {
    const f = flatFwd(a.yaw), p = a.pos.clone().addScaledVector(f, 2.2); p.y = World.groundAt(p.x, p.z, a.pos.y + 0.6);
    emit(['wl', a.id + '#w' + Math.floor(Game.t * 10), a.team, r2(p.x), r2(p.y), r2(p.z), r2(a.yaw), a.id]);
  } else if (U.key === 'scry') {
    const d = flatFwd(a.yaw); let n = 0;
    for (const t of Game.actors) { if (!t.alive || !isEnemy(a, t)) continue; const rel = t.pos.clone().sub(a.pos); const dist = rel.length(); rel.y = 0; rel.normalize(); if (dist < 35 && rel.dot(d) > Math.cos(Math.PI / 8)) { hitActor(a, t, 0, { fx: { reveal: 3.5 } }); n++; } }
    Sfx.play('scry', a === Game.me ? null : a.pos); emit(['fx', 'scry', r2(a.pos.x), r2(a.pos.y + 1.4), r2(a.pos.z), r2(a.yaw), 0]);
    if (a === Game.me) HUD.note(n ? `Scry: ${n} enem${n > 1 ? 'ies' : 'y'} revealed` : 'Scry: nothing there');
  } else if (U.key === 'leap') {
    const f = flatFwd(a.yaw); a.vel.y = 11.5; a.vel.x += f.x * 5; a.vel.z += f.z * 5; a.grounded = false; a.leapT = 1.2; a.dashT = 0.0;
    Sfx.play('leap', a === Game.me ? null : a.pos); emit(['fx', 'leap', r2(a.pos.x), r2(a.pos.y), r2(a.pos.z), 0, 0]);
  }
}
function useUlt(a) {
  const K = a.H.ult.key; a.ult = 0;
  Sfx.play('ult', a === Game.me ? null : a.pos, 1);
  emit(['fx', 'ult', r2(a.pos.x), r2(a.pos.y + 1), r2(a.pos.z), K, a.id]);
  if (K === 'field') { emit(['rv', a.team, 7, a.id]); a.pw.charges = a.P.carry; emit(['fb', a.id, 7]); }
  else if (K === 'unbound') { a.st.unbound = 7; a.pw.charges = a.P.charges; a.st.fatigue = 0; }
  else if (K === 'slam') {
    for (const t of Game.actors) if (t.alive && isEnemy(a, t) && t.pos.distanceTo(a.pos) < 8 && World.clear(a.pos.x, a.pos.y + 1, a.pos.z, t.pos.x, t.pos.y + 1, t.pos.z)) {
      const k = t.pos.clone().sub(a.pos).setY(0).normalize().multiplyScalar(5); hitActor(a, t, 130, { fx: { stun: 1.2, knock: [k.x, 8, k.z] }, how: 'slam' });
    }
    emit(['fx', 'slam', r2(a.pos.x), r2(a.pos.y), r2(a.pos.z), 8, 0]);
    if (a === Game.me) View.shake(1.4);
  } else if (K === 'night') { a.st.night = 8; if (a.pw.state !== 'vis') a.pw.state = 'vis'; }
  else if (K === 'storm') { for (let i = 0; i < 7; i++) throwGlaive(a, 1, (i - 3) * 0.2, true); }
}

// ---------------------------------------------------------------- walls, fire, named effects
function placeWall(id, team, pos, yaw, ownerId) {
  if (Game.walls.has(id)) return;
  const owner = Game.byId.get(ownerId), col = Game.me && owner && isEnemy(Game.me, owner) ? ENEMY_HEX : TEAM_HEX[0];
  const mesh = buildWall(col); mesh.position.copy(pos); mesh.rotation.y = yaw; G.scene.add(mesh);
  const w = { id, team: Game.match && Game.match.mode === 'ffa' ? 100 + (Game.actors.indexOf(owner) | 0) : team, x: pos.x, y: pos.y, z: pos.z, yaw, w: 5, h: 3, hp: 450, t: 6, mesh, owner: ownerId };
  if (Game.match && Game.match.mode === 'ffa' && owner) w.team = owner.team;
  Game.walls.set(id, w); World.walls.push(w);
  Sfx.play('wall', pos); Fx.ring(pos, 3, col, 0.5, 4, 0.1);
}
function damageWall(w, d) { w.hp -= d; w.hitT = 0.15; Sfx.play('wallHit', new V3(w.x, w.y + 1.5, w.z), 0.5); if (w.hp <= 0) removeWall(w); }
function removeWall(w) { G.scene.remove(w.mesh); Game.walls.delete(w.id); const i = World.walls.indexOf(w); if (i >= 0) World.walls.splice(i, 1); Fx.burst(new V3(w.x, w.y + 1.5, w.z), 0x7ad8ff, 30, 4, 0.6, 0.1); }
function wallTick(dt) {
  for (const w of [...Game.walls.values()]) {
    w.t -= dt; if (w.t <= 0) { removeWall(w); continue; }
    const U = w.mesh.userData, f = Math.min(1, w.t * 2) * (w.hitT > 0 ? 1.8 : 1); w.hitT = Math.max(0, (w.hitT || 0) - dt);
    U.panel.material.opacity = 0.32 * f * (0.5 + 0.5 * w.hp / 450); U.hex.material.opacity = 0.5 * f; U.hex.material.map.offset.y = G.time * 0.1;
  }
}
function fireFx(x, y, z) { Fx.burst(new V3(x, y + 0.2, z), 0xff6a1a, 6, 1.5, 0.6, 0.1, { up: 2, k: 4 }); }
function fireTick(dt) {
  for (let i = Game.fires.length - 1; i >= 0; i--) {
    const f = Game.fires[i]; f.t -= dt; if (f.t <= 0) { Game.fires.splice(i, 1); continue; }
    if (Math.random() < dt * 10) Fx.spawn('add', f.x + rand(-0.6, 0.6), f.y + 0.1, f.z + rand(-0.6, 0.6), 0, rand(1, 2.5), 0, 4, 1.4, 0.3, rand(0.1, 0.2), 0.5, 0.5, -0.5);
    const owner = Game.byId.get(f.owner);
    for (const a of Game.actors) {
      if (a.remote || !a.alive || !owner || !isEnemy(owner, a)) continue;
      if ((a.pos.x - f.x) ** 2 + (a.pos.z - f.z) ** 2 < 1.4 * 1.4 && Math.abs(a.pos.y - f.y) < 1.2) { a.burnAcc = (a.burnAcc || 0) + f.dps * dt; if (a.burnAcc > 5) { applyDamage(a, a.burnAcc, f.owner, { how: 'burn' }); a.burnAcc = 0; } }
    }
  }
}
function decoyTick(dt) {
  for (let i = Game.decoys.length - 1; i >= 0; i--) {
    const d = Game.decoys[i]; d.t -= dt;
    d.m.meshes.forEach(m => { m.material = m.userData.base; });
    if (d.t <= 0) { G.scene.remove(d.m.root); Game.decoys.splice(i, 1); Fx.burst(d.pos.clone().setY(d.pos.y + 1), 0xb48aff, 16, 3, 0.5, 0.08); }
  }
}
function namedFx(name, p, a, b) {
  if (name === 'boom') { Fx.explosion(p, a || 3, b || 0xff8a3a); Sfx.play('boom', p); }
  else if (name === 'orb') { Fx.explosion(p, 1.6, 0x5affd2); Sfx.play('boom', p, 0.7); }
  else if (name === 'pulse') { Fx.ring(p, a || 4, 0xff8a3a, 0.5, 5, 0.1); Fx.burst(p.clone().setY(p.y + 0.3), 0xffa050, 12, 4, 0.4, 0.06); }
  else if (name === 'seam') { Fx.ring(p.clone().setY(p.y - 0.75), a || 3, 0xb48aff, 0.45, 5); Fx.sphere(p, a || 3, 0xb48aff, 0.25, 2); }
  else if (name === 'ram') { Fx.burst(p, 0xffc070, 24, 8, 0.4, 0.07, { grav: 12, k: 5 }); Sfx.play('ramHit', p); }
  else if (name === 'crash') { Fx.burst(p, 0xffc070, 30, 9, 0.5, 0.08, { grav: 12, k: 5 }); Fx.puff(p, 0x6a6058, 10, 0.8, 1.4); Sfx.play('crash', p); if (a) { Fx.ring(p.clone().setY(p.y - 1), a, 0xff7a2e, 0.5, 5); } }
  else if (name === 'bloom') { Fx.sphere(p, a || 7, 0x6a2aff, 0.5, 1.2); Fx.burst(p, 0x8a4aff, 40, 8, 0.6, 0.12, { k: 2 }); }
  else if (name === 'heal') { Fx.burst(p, 0x74ffb4, 16, 1.5, 1.0, 0.08, { up: 1.5, k: 3 }); }
  else if (name === 'dash') { Fx.burst(p, 0xb48aff, 14, 3, 0.4, 0.08, { k: 3 }); }
  else if (name === 'scry') { Fx.ring(p.clone().setY(p.y - 1.3), 12, 0xc06aff, 0.8, 3); }
  else if (name === 'leap') { Fx.ring(p, 2.5, 0x5affd2, 0.5, 4, 0.1); Fx.puff(p, 0x8a8a80, 8, 0.6, 1); }
  else if (name === 'slam') { Fx.ring(p, a || 8, 0xff7a2e, 0.7, 6, 0.1); Fx.ring(p, (a || 8) * 0.6, 0xffd08a, 0.5, 6, 0.15); Fx.burst(p.clone().setY(p.y + 0.3), 0xffa050, 60, 10, 0.6, 0.1, { grav: 10, k: 4 }); Fx.puff(p, 0x6a6058, 16, 1.2, 1.6); Sfx.play('slam', p); muzzleLight(p.clone().setY(p.y + 1), 0xff7a2e, 16); }
  else if (name === 'ult') { const who = Game.byId.get(b); if (who && who !== Game.me) Fx.sphere(p, 1.5, who.H.glow, 0.4, 2); if (who && Game.me && isEnemy(Game.me, who)) HUD.note(`${who.name} used ${who.H.ult.name}`, 'warn'); }
  else if (name === 'gstick') { Fx.sparks(p, { x: 0, y: 1, z: 0 }, 0xff3048, 6); }
}
function deathFx(a) {
  const p = (a.renderPos || a.pos).clone(); p.y += 1;
  Fx.burst(p, a.H.glow, 30, 4, 0.8, 0.1, { up: 1, k: 3 });
  Sfx.play('die', a === Game.me ? null : a.pos, 0.8);
  a.anim.death = 0.0001;
}

// ---------------------------------------------------------------- per-frame bookkeeping shared by every copy
function worldTick(dt) {
  projTick(dt); snareTick(dt); wallTick(dt); fireTick(dt); decoyTick(dt);
}
function actorFlags(a) {
  let f = 0; const s = a.st, pw = a.pw, P = a.P;
  if (a.alive) f |= F_ALIVE; if (a.grounded) f |= F_GROUND; if (s.reveal > 0) f |= F_REVEAL; if (s.root > 0) f |= F_ROOT; if (s.stun > 0) f |= F_STUN;
  if (P.key === 'fade') { if (pw.state === 'cloaked') f |= F_CLOAK; if (pw.state === 'going' || pw.state === 'coming') f |= F_FADING; }
  if (P.key === 'ram') { if (pw.state === 'charge') f |= F_CHARGE; if (pw.state === 'rev') f |= F_REV; }
  if (P.key === 'glaive' && pw.winding) f |= F_WIND;
  if (P.key === 'blink' && pw.charging) f |= F_BLINKCH;
  if (s.fatigue > 0) f |= F_FATIGUE; if (s.night > 0) f |= F_NIGHT; if (s.unbound > 0) f |= F_UNBOUND; if (s.heal) f |= F_HEAL; if (s.slows && s.slows.length) f |= F_SLOW;
  if (P.key === 'snare' && pw.placing > 0) f |= F_PLACE; if (a.spawnProt > 0) f |= F_PROT;
  return f;
}
function cloakLevel(a) {
  // 0 = fully seen, 1 = fully gone
  if (a.st.night > 0) return a.st.nightFlash > 0 ? 0.2 : 1;
  if (a.P.key !== 'fade') return 0;
  const pw = a.pw, P = a.P;
  if (pw.state === 'cloaked') return 1;
  if (pw.state === 'going') return 1 - pw.t / P.fadeIn;
  if (pw.state === 'coming') return pw.t / P.fadeOut;
  return 0;
}
