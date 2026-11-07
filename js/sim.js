'use strict';
// ============================================================================
// The simulation: actors, movement, the eight weapons, the eight powers, damage, statuses, zones and events.
// Each copy simulates the actors it owns (its player, and the bots if it hosts) and draws the rest from
// snapshots. Hits are judged by the attacker's copy and applied by the target's owner.
// ============================================================================
const F_ALIVE = 1, F_GROUND = 2, F_CLOAK = 4, F_FADING = 8, F_REVEAL = 16, F_ROOT = 32, F_STUN = 64, F_CHARGE = 128, F_REV = 256, F_WIND = 512, F_BLINKCH = 1024, F_FATIGUE = 2048, F_NIGHT = 4096, F_UNBOUND = 8192, F_HEAL = 16384, F_SLOW = 32768, F_PLACE = 65536, F_PROT = 131072, F_SUB = 262144, F_FLAME = 524288, F_BEAM = 1048576, F_CHANNEL = 2097152, F_ORBIT = 4194304, F_SHIELD = 8388608, F_SLASH = 16777216;
const RESPAWN_T = 7;

const Game = { state: 'menu', actors: [], byId: new Map(), me: null, t: 0, match: null, snares: new Map(), lanterns: new Map(), projs: [], zones: [], decoys: [], walls: new Map(), timers: [], seq: 0 };
const BOT_NAMES = ['Vesper', 'Rook', 'Tallow', 'Quill', 'Ashby', 'Sorrel', 'Kestrel', 'Grist', 'Marlow', 'Pike', 'Wren', 'Thane', 'Juniper', 'Cobalt', 'Hollis', 'Reed', 'Sable', 'Moss', 'Dray', 'Fennick', 'Ottoline', 'Bram', 'Cinder', 'Lowe'];

function isEnemy(a, b) { if (!a || !b || a === b) return false; if (Game.match && Game.match.mode === 'ffa') return a.id !== b.id; return a.team !== b.team; }
function enemyOfTeam(a, team, ownerId) { if (Game.match && Game.match.mode === 'ffa') return a.id !== ownerId; return a.team !== team; }
function eyePos(a, out = new V3()) { return out.set(a.pos.x, a.pos.y + PHYS.eye, a.pos.z); }
function aimDir(yaw, pitch, out = new V3()) { const c = Math.cos(pitch); return out.set(-Math.sin(yaw) * c, Math.sin(pitch), -Math.cos(yaw) * c); }
function flatFwd(yaw) { return new V3(-Math.sin(yaw), 0, -Math.cos(yaw)); }
function chest(a) { const p = a.renderPos || a.pos; return new V3(p.x, p.y + 1.15, p.z); }
function isSub(a) { return a.remote ? !!((a.flags || 0) & F_SUB) : a.P.key === 'sub' && a.pw.state !== 'up'; }
function later(t, fn) { Game.timers.push({ t, fn }); }

// ---------------------------------------------------------------- actors
function addActor(o) {
  const a = {
    id: o.id, name: o.name || 'Player', team: o.team | 0, isBot: !!o.bot, remote: !!o.remote, owner: o.owner || null,
    pos: new V3(), vel: new V3(), yaw: 0, pitch: 0, grounded: true, hp: 1, alive: false, respawnT: 0.5, k: 0, d: 0, a: 0, dmg: 0,
    st: {}, pw: {}, input: { fwd: 0, side: 0, jump: false, fire: false, power: false, util: false, ult: false, reload: false }, prev: {},
    snaps: [], anim: { phase: 0, death: 0, spd: 0, air: 0, swing: 0 }, ult: 0, utilT: 0, ammo: 0, reloadT: 0, fireT: 0, burstLeft: 0, burstT: 0, bloom: 0, lastHit: {}, nameIdx: o.nameIdx | 0,
    addons: o.addons || [], heroKey: null, dashT: 0, stepT: 0, spawnProt: 0, hitFlash: 0, killer: null, lastDmgT: -99, heat: 0, tide: 100, lockT: 0, beamT: null, stitch: {}, flags: 0,
  };
  Game.actors.push(a); Game.byId.set(a.id, a);
  setHero(a, o.hero || 'marrow', o.addons || []);
  return a;
}
function removeActor(a) {
  const i = Game.actors.indexOf(a); if (i >= 0) Game.actors.splice(i, 1); Game.byId.delete(a.id);
  if (a.model) G.scene.remove(a.model.root); clearExtras(a);
  if (a.flameLoop) { a.flameLoop.stop(); a.flameLoop = null; }
  if (Game.me === a) Game.me = null;
}
function setHero(a, key, addons) {
  const changed = a.heroKey !== key || a.modelTeam !== modelColorFor(a) || JSON.stringify(a.addons) !== JSON.stringify(addons);
  a.heroKey = key; a.H = HEROES[key]; a.addons = (addons || []).slice(0, 2); a.P = powerFor(key, a.addons);
  a.maxHp = Math.round(a.H.hp * (a.P.perma ? 0.6 : 1));
  if (!a.alive) a.hp = a.maxHp; else a.hp = Math.min(a.hp, a.maxHp);
  resetKit(a);
  if (changed || !a.model) rebuildModel(a);
}
function modelColorFor(a) { const me = Game.me; if (!me) return TEAM_HEX[a.team] || ENEMY_HEX; if (a === me) return TEAM_HEX[0]; return isEnemy(me, a) ? ENEMY_HEX : TEAM_HEX[0]; }
function rebuildModel(a) {
  if (a.model) G.scene.remove(a.model.root);
  a.modelTeam = modelColorFor(a);
  a.model = buildHero(a.heroKey, a.modelTeam); G.scene.add(a.model.root);
  a.model.root.visible = a.alive && a !== Game.me;
  a.look = 'normal'; a.xrayKind = null; a.xray = null; clearExtras(a);
}
function resetKit(a) {
  const W = a.H.weapon, P = a.P;
  a.ammo = W.mag || 0; a.reloadT = 0; a.fireT = 0; a.burstLeft = 0; a.bloom = 0; a.utilT = 0; a.heat = 0; a.tide = 100; a.lockT = 0; a.beamT = null; a.stitch = {}; a.overheat = 0; a.swingT = 0;
  a.pw = {};
  if (P.key === 'snare') a.pw = { charges: P.auto ? 0 : P.carry, rech: 0, placing: 0, n: 0, autoT: P.auto || 0 };
  if (P.key === 'blink') a.pw = { charges: P.charges, rech: 0, chargeT: 0, charging: false, chainT: 0, used: 0 };
  if (P.key === 'ram') a.pw = { state: 'idle', t: 0, cd: 0, hit: new Set(), trailT: 0, bleedAcc: 0 };
  if (P.key === 'fade') a.pw = { state: P.perma ? 'cloaked' : 'vis', t: 0, cd: 0, cloakT: 0 };
  if (P.key === 'glaive') a.pw = { count: P.cap, rech: 0, wind: 0, winding: false, touch: {} };
  if (P.key === 'lantern') a.pw = { charges: P.carry, rech: 0, placing: 0, hold: 0, chan: 0, chanTo: null, walkCd: 0, n: 0 };
  if (P.key === 'sub') a.pw = { state: 'up', t: 0, cd: 0, trailT: 0, drownAcc: {} };
  if (P.key === 'line') a.pw = { charges: P.charges, rech: 0 };
  if (P.key === 'rewind') a.pw = { charges: P.charges, rech: 0, hist: [], ehist: [], histT: 0, anchor: null };
}
function spawnActor(a, at) {
  if (a.pendingHero) { const ph = a.pendingHero; a.pendingHero = null; a.alive = false; setHero(a, ph.h, ph.a); }
  const sp = at || pickSpawn(a);
  a.pos.copy(sp); a.pos.y = World.groundAt(sp.x, sp.z, sp.y + 1);
  a.vel.set(0, 0, 0); a.hp = a.maxHp; a.alive = true; a.grounded = true; a.st = {}; a.dashT = 0; a.grapple = null;
  a.yaw = Math.atan2(a.pos.x, a.pos.z); a.pitch = 0;
  resetKit(a);
  if (a.P.carried && !a.remote) emit(['ln', a.id + '#carry', a.id, 0, 0, 0, { r: a.P.radius, f: 1 }]);
  a.spawnProt = 2; a.anim.death = 0; a.killer = null;
  if (a.model) { a.model.root.visible = a !== Game.me; a.model.body.rotation.set(0, 0, 0); a.model.body.position.set(0, 0, 0); }
  if (a === Game.me) { Inventory.consumeFor(a); HUD.respawned(); View.reset(); }
}
function pickSpawn(a) {
  const M = Game.match, list = M.mode === 'ffa' ? World.ffa.concat(World.spawns[0], World.spawns[1]) : World.spawns[a.team];
  let best = list[0], bs = -1e9;
  for (const s of list) {
    let near = 1e9; for (const o of Game.actors) if (o.alive && o !== a && isEnemy(a, o)) near = Math.min(near, o.pos.distanceTo(s));
    let ally = 0; for (const o of Game.actors) if (o.alive && o !== a && !isEnemy(a, o) && o.pos.distanceTo(s) < 1.2) ally++;
    const score = Math.min(near, 45) + Math.random() * 6 - ally * 30;
    if (score > bs) { bs = score; best = s; }
  }
  return best;
}

// ---------------------------------------------------------------- statuses
const TIMED = ['root', 'stun', 'reveal', 'blind', 'strike', 'ambush', 'flick', 'unbound', 'night', 'nightFlash', 'senseT', 'swift', 'fatigue', 'vulnT', 'lightT', 'hiddenRev'];
function stTick(a, dt) {
  const s = a.st;
  for (const k of TIMED) if (s[k] > 0) s[k] = Math.max(0, s[k] - dt);
  if (s.slows) s.slows = s.slows.filter(x => (x.t -= dt) > 0);
  if (s.shield) { s.shield.t -= dt; if (s.shield.t <= 0 || s.shield.hp <= 0) s.shield = null; }
  if (s.charm) { s.charm.t -= dt; if (s.charm.t <= 0) s.charm = null; }
  if (s.heal) { const h = s.heal; h.t -= dt; a.hp = Math.min(a.maxHp, a.hp + h.rate * dt); if (h.t <= 0) s.heal = null; }
  if (s.dots && s.dots.length) {
    for (const d of s.dots) { d.t -= dt; d.acc = (d.acc || 0) + d.dps * dt; }
    for (const d of s.dots) if (d.acc >= 5 || (d.t <= 0 && d.acc > 0)) { const n = d.acc; d.acc = 0; applyDamage(a, n, d.src, { dot: d.kind, how: d.how || d.kind }); if (!a.alive) return; }
    s.dots = s.dots.filter(d => d.t > 0);
  }
}
function slowMul(a) { let m = 1; if (a.st.slows) for (const x of a.st.slows) m = Math.min(m, x.mul); return m; }
function unstoppable(a) { return a.P.key === 'ram' && a.P.jugg && (a.pw.state === 'rev' || a.pw.state === 'charge'); }
function applyFx(a, fx, srcId) {
  if (!fx) return;
  const s = a.st, U = unstoppable(a);
  if (fx.root && !U) s.root = Math.max(s.root || 0, fx.root);
  if (fx.stun && !U) s.stun = Math.max(s.stun || 0, fx.stun);
  if (fx.slow && !U) (s.slows = s.slows || []).push({ mul: fx.slow[0], t: fx.slow[1] });
  if (fx.reveal) s.reveal = Math.max(s.reveal || 0, fx.reveal);
  if (fx.hrev) s.hiddenRev = Math.max(s.hiddenRev || 0, fx.hrev);
  if (fx.blind) s.blind = Math.max(s.blind || 0, fx.blind);
  if (fx.vuln) { s.vulnMul = Math.max(s.vulnT > 0 ? s.vulnMul || 1 : 1, fx.vuln[0]); s.vulnT = Math.max(s.vulnT || 0, fx.vuln[1]); }
  if (fx.dot) {
    s.dots = s.dots || [];
    const same = s.dots.find(d => d.src === srcId && d.kind === fx.dot[2]);
    if (same && fx.dot[2] !== 'bleed') { same.t = fx.dot[1]; same.dps = fx.dot[0] / fx.dot[1]; }
    else s.dots.push({ dps: fx.dot[0] / fx.dot[1], t: fx.dot[1], src: srcId, kind: fx.dot[2] || 'bleed', how: fx.dot[2] });
  }
  if (fx.charm && !U) s.charm = { t: fx.charm, src: srcId };
  if (fx.tp) { a.pos.set(fx.tp[0], fx.tp[1], fx.tp[2]); a.vel.set(0, 0, 0); }
  if (fx.knock && !U) { a.vel.x += fx.knock[0]; a.vel.y = Math.max(a.vel.y, fx.knock[1]); a.vel.z += fx.knock[2]; a.grounded = false; a.knockT = 0.5; a.dashT = 0; a.grapple = null; }
  if (a.P.key === 'fade' && a.pw.state !== 'vis') s.flick = 0.35;
  if (a.P.key === 'ram' && fx.stun && !U && a.pw.state !== 'idle') endRam(a, false);
  if (a.P.key === 'lantern' && (fx.stun || fx.knock) && a.pw.chan > 0) { a.pw.chan = 0; a.pw.chanTo = null; }
}

// ---------------------------------------------------------------- damage
function hitActor(src, tgt, dmg, opts = {}) {
  if (!tgt || !tgt.alive || (isSub(tgt) && !opts.subOk)) return;
  const sid = src ? src.id : opts.srcId;
  if (dmg > 0 && src && !src.remote) { src.ult = Math.min(100, src.ult + dmg * 0.03 * (src.st.unbound || src.st.night ? 0 : 1)); src.dmg += dmg; }
  if (src === Game.me && dmg > 0) HUD.hit(tgt, dmg, !!opts.head);
  if (src && dmg > 0 && src !== tgt) { src.lastDealt = tgt.id; src.lastDealtT = Game.t; }
  if (!tgt.remote) applyDamage(tgt, dmg, sid, opts);
  else Net.push(['h', tgt.id, r2(dmg), sid, packOpts(opts)]);
}
function packOpts(o) { const p = {}; if (o.head) p.h = 1; if (o.fx) p.f = o.fx; if (o.how) p.w = o.how; if (o.exec) p.x = o.exec; if (o.oneshot) p.o = 1; if (o.srcPos) p.p = o.srcPos; return p; }
function applyDamage(a, dmg, srcId, opts = {}) {
  if (!a.alive) return;
  if (isSub(a) && !opts.dot) { applyFx(a, opts.fx && opts.fx.reveal ? { reveal: opts.fx.reveal } : null, srcId); return; }
  if (a.spawnProt > 0 && dmg > 0) dmg = 0;
  const src = Game.byId.get(srcId);
  if (a.st.vulnT > 0 && dmg > 0) dmg *= a.st.vulnMul || 1.5;
  if (unstoppable(a)) dmg *= 0.5;
  if (opts.oneshot) dmg = Math.max(dmg, a.hp + 1);
  if (opts.exec && a.hp - dmg < a.maxHp * opts.exec) dmg = Math.max(dmg, a.hp + 1);
  applyFx(a, opts.fx, srcId);
  if (dmg <= 0) return;
  if (a.st.shield && !opts.oneshot) { const s = a.st.shield, take = Math.min(s.hp, dmg); s.hp -= take; dmg -= take; if (dmg <= 0) { a.hitFlash = 0.1; return; } }
  a.hp -= dmg; a.lastDmgT = Game.t; a.hitFlash = 0.15;
  if (srcId && srcId !== a.id) { a.lastHit[srcId] = Game.t; a.lastHitBy = srcId; }
  if (a === Game.me) HUD.hurt(dmg, src ? src.pos : (opts.srcPos ? new V3(opts.srcPos[0], 0, opts.srcPos[1]) : null));
  if (a.isBot) Bots.hurt(a, src);
  if (a.hp <= 0 && a.P.key === 'rewind' && a.P.paradox && a.pw.charges > 0 && !opts.oneshot) { const to = rewindPoint(a); if (to) { a.hp = 1; doRewind(a, to, true); return; } }
  if (a.hp <= 0) killActor(a, srcId, opts.how || 'weapon');
}
function killActor(a, srcId, how) {
  a.hp = 0; a.alive = false; a.d++; a.respawnT = RESPAWN_T; a.killer = srcId;
  const assists = Object.keys(a.lastHit).filter(id => id !== srcId && id !== a.id && Game.t - a.lastHit[id] < 10);
  a.lastHit = {};
  emit(['k', a.id, srcId || '', how || '', assists.slice(0, 3).join(',')]);
  if (a.P.key === 'ram' && a.pw.state !== 'idle') endRam(a, false);
  if (a.P.key === 'fade') a.pw.state = 'vis';
  if (a.P.key === 'sub') a.pw.state = 'up';
  if (a.flameLoop) a.flameLoop.set(0, 0);
  for (const l of [...Game.lanterns.values()]) if (l.follow && l.owner === a.id) emit(['lx', l.id]);
}

// ---------------------------------------------------------------- events: every copy runs them; local ones also go out
function emit(ev) { Net.push(ev); onEvent(ev, false); }
function onEvent(E, remote) {
  switch (E[0]) {
    case 'k': {
      const v = Game.byId.get(E[1]), k = Game.byId.get(E[2]), as = (E[4] || '').split(',').filter(Boolean);
      if (v && remote) { v.alive = false; v.hp = 0; }
      if (v) deathFx(v);
      if (k && k !== v) k.k++;
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
    case 's': { const a = Game.byId.get(E[1]); if (!a || !remote || !a.model) return; shotVisual(a, new V3(E[2], E[3], E[4]), E[5]); break; }
    case 'pr': spawnProj(E[1], E[2], new V3(E[3], E[4], E[5]), new V3(E[6], E[7], E[8]), E[9] || {}, remote); break;
    case 'sn': placeSnare(E[1], E[2], new V3(E[3], E[4], E[5]), E[6] || {}); break;
    case 'sp': springSnareFx(E[1], E[2]); break;
    case 'sx': { const s = Game.snares.get(E[1]); if (s) removeSnare(s); break; }
    case 'ln': placeLantern(E[1], E[2], new V3(E[3], E[4], E[5]), E[6] || {}); break;
    case 'lx': { const l = Game.lanterns.get(E[1]); if (l) removeLantern(l); break; }
    case 'bl': { const a = Game.byId.get(E[1]); blinkFx(a, new V3(E[2], E[3], E[4]), new V3(E[5], E[6], E[7]), remote, E[8]); break; }
    case 'wl': placeWall(E[1], E[2] | 0, new V3(E[3], E[4], E[5]), E[6], E[7] || ''); break;
    case 'wh': { const w = Game.walls.get(E[1]); if (w) damageWall(w, +E[2] || 0); break; }
    case 'rv': {
      for (const a of Game.actors) if (!a.remote && a.alive && enemyOfTeam(a, E[1], E[3])) applyFx(a, { reveal: E[2] });
      if (Game.me && !enemyOfTeam(Game.me, E[1], E[3])) HUD.note('Killing Field: every enemy revealed');
      Sfx.play('reveal'); break;
    }
    case 'fb': { for (const s of Game.snares.values()) if (s.owner === E[1]) s.boostT = E[2]; break; }
    case 'zn': addZone(E[1], new V3(E[2], E[3], E[4]), E[5], E[6], E[7], E[8], E[9] || 1); break;
    case 'dc': { const a = Game.byId.get(E[1]); if (a) spawnDecoy(a, new V3(E[2], E[3], E[4]), E[5], E[6] || 3); break; }
    case 'pk': Pickups.take(E[1] | 0, E[2]); break;
    case 'fx': namedFx(E[1], new V3(E[2], E[3], E[4]), E[5], E[6], remote); break;
    case 'bm': { const a = Game.byId.get(E[1]); if (a && remote) a.beamTo = E[2] ? Game.byId.get(E[2]) : null; break; }
  }
}
function sanitizeFx(f) {
  if (!f || typeof f !== 'object') return null;
  const o = {}, n = (v, a, b) => Number.isFinite(v) ? clamp(v, a, b) : 0;
  if (f.root) o.root = n(f.root, 0, 4); if (f.stun) o.stun = n(f.stun, 0, 3); if (f.reveal) o.reveal = n(f.reveal, 0, 12); if (f.hrev) o.hrev = n(f.hrev, 0, 12); if (f.blind) o.blind = n(f.blind, 0, 3);
  if (f.charm) o.charm = n(f.charm, 0, 3);
  if (Array.isArray(f.slow)) o.slow = [n(f.slow[0], 0.2, 1), n(f.slow[1], 0, 6)];
  if (Array.isArray(f.vuln)) o.vuln = [n(f.vuln[0], 1, 2), n(f.vuln[1], 0, 8)];
  if (Array.isArray(f.dot)) o.dot = [n(f.dot[0], 0, 120), n(f.dot[1], 0.5, 8), typeof f.dot[2] === 'string' ? f.dot[2].slice(0, 8) : 'bleed'];
  if (Array.isArray(f.knock)) o.knock = [n(f.knock[0], -45, 45), n(f.knock[1], -5, 22), n(f.knock[2], -45, 45)];
  if (Array.isArray(f.tp)) { const B = World.bounds; o.tp = [n(f.tp[0], B.x0, B.x1), n(f.tp[1], -1, 40), n(f.tp[2], B.z0, B.z1)]; }
  return o;
}

// ---------------------------------------------------------------- local simulation
function canAct(a) { return a.alive && !(a.st.stun > 0) && !(a.P.key === 'ram' && a.pw.state === 'crash'); }
function stepLocal(a, dt) {
  if (!a.alive) {
    if (Mode.respawns()) { a.respawnT -= dt; if (a.respawnT <= 0) spawnActor(a); }
    return;
  }
  a.spawnProt = Math.max(0, a.spawnProt - dt);
  stTick(a, dt); if (!a.alive) return;
  const I = a.input, P = a.P, pw = a.pw, H = a.H;
  // a puppet walks where its puppeteer says and does nothing else
  if (a.st.charm) {
    const src = Game.byId.get(a.st.charm.src);
    if (src) { const d = (src.renderPos || src.pos).clone().sub(a.pos).setY(0); a.yaw = Math.atan2(-d.x, -d.z); }
    Object.assign(I, { fwd: 1, side: 0, jump: false, fire: false, power: false, util: false, ult: false, reload: false });
  }
  const pressed = k => I[k] && !a.prev[k];
  const stunned = !canAct(a), rooted = a.st.root > 0 || stunned;
  let speedMul = slowMul(a), noFire = false, forced = null;
  if (a.st.swift > 0) speedMul *= 1.4;
  if (a.st.night > 0) speedMul *= 1.1;
  // ---------------------------------------------------- the power
  if (P.key === 'snare') {
    if (P.auto) { pw.autoT -= dt; if (pw.autoT <= 0) { pw.autoT = P.auto; autoSnare(a); } }
    else {
      if (pw.charges < P.carry) { pw.rech += dt; if (pw.rech >= P.recharge) { pw.rech = 0; pw.charges++; } }
      if (pw.placing > 0) { pw.placing -= dt; speedMul *= 0.4; noFire = true; if (pw.placing <= 0) finishSnare(a); }
      else if (pressed('power') && pw.charges > 0 && !stunned) { pw.placing = P.place; Sfx.play('snarePlace', a.pos, 0.6); }
    }
  } else if (P.key === 'blink') {
    const free = a.st.unbound > 0 || P.hpCost > 0;
    if (pw.charges < P.charges) { pw.rech += dt; if (pw.rech >= P.recharge) { pw.rech = 0; pw.charges++; } }
    if (pw.chainT > 0) { pw.chainT -= dt; if (pw.chainT <= 0 && pw.used > 0) endChain(a); }
    if (a.st.fatigue > 0) { speedMul *= 0.45; noFire = true; pw.charging = false; pw.chargeT = 0; }
    else if (I.power && (pw.charges > 0 || free) && !rooted && !(P.hpCost && a.hp <= P.hpCost)) {
      if (!pw.charging) { pw.charging = true; pw.chargeT = 0; Sfx.play('blinkCharge', a.pos, 0.6); }
      pw.chargeT = Math.min(P.chargeTime, pw.chargeT + dt); noFire = true; speedMul *= 0.75;
    } else if (pw.charging) { pw.charging = false; if (!rooted) doBlink(a); pw.chargeT = 0; }
  } else if (P.key === 'ram') {
    if (pw.cd > 0) pw.cd -= dt;
    if (pw.state === 'idle') { if (I.power && pw.cd <= 0 && !rooted) { pw.state = 'rev'; pw.t = 0; Sfx.play('rev', a.pos); } }
    else if (pw.state === 'rev') {
      pw.t += dt; speedMul *= 0.3; noFire = true;
      if (!I.power || rooted) { pw.state = 'idle'; pw.cd = 1.5; }
      else if (pw.t >= P.rev) { pw.state = 'charge'; pw.t = 0; pw.hit.clear(); a.ramYaw = a.yaw; }
    } else if (pw.state === 'charge') {
      pw.t += dt; noFire = true;
      if (!I.power || pw.t >= P.dur || (rooted && !P.jugg)) endRam(a, true);
      else {
        const lim = P.turn * dt, d = angDiff(a.ramYaw, a.yaw); a.yaw = a.ramYaw + clamp(d, -lim, lim); a.ramYaw = a.yaw;
        forced = flatFwd(a.yaw).multiplyScalar(P.speed * Math.min(1, 0.4 + pw.t * 4));
        if (P.trail) { pw.trailT -= dt; if (pw.trailT <= 0) { pw.trailT = 0.25; emit(['zn', 'fire', r2(a.pos.x), r2(a.pos.y), r2(a.pos.z), 1.5, P.trail, 3, a.id, 1]); } }
        if (P.furnace) { pw.bleedAcc += 15 * dt; if (pw.bleedAcc >= 5) { applyDamage(a, pw.bleedAcc, a.id, { how: 'furnace' }); pw.bleedAcc = 0; if (!a.alive) return; } }
        ramContacts(a);
      }
    } else if (pw.state === 'crash') { pw.t -= dt; noFire = true; if (pw.t <= 0) { pw.state = 'idle'; pw.cd = P.cd; } }
  } else if (P.key === 'fade') {
    if (pw.cd > 0) pw.cd -= dt;
    if (P.perma) {
      if (pw.state === 'vis') { pw.t -= dt; if (pw.t <= 0) { pw.state = 'cloaked'; Sfx.play('fadeOut', a.pos, 0.5); } }
      else { pw.state = 'cloaked'; speedMul *= P.speed; if (P.sense) a.st.senseT = 0.2; if (P.regen) a.hp = Math.min(a.maxHp, a.hp + P.regen * dt); }
    } else if (pw.state === 'vis') { if (pressed('power') && pw.cd <= 0 && !stunned) { pw.state = 'going'; pw.t = P.fadeIn; Sfx.play('fadeOut', a.pos, 0.7); } }
    else if (pw.state === 'going') { pw.t -= dt; noFire = true; speedMul *= 0.8; if (pw.t <= 0) { pw.state = 'cloaked'; pw.cloakT = 0; } }
    else if (pw.state === 'cloaked') {
      pw.cloakT += dt; speedMul *= P.speed; noFire = !P.shootCloaked;
      if (P.regen) a.hp = Math.min(a.maxHp, a.hp + P.regen * dt);
      if (P.sense) a.st.senseT = 0.2;
      if ((pressed('power') && !stunned) || pw.cloakT >= P.maxTime) { pw.state = 'coming'; pw.t = P.fadeOut; Sfx.play('fadeIn', a.pos, 0.7); }
    } else if (pw.state === 'coming') { pw.t -= dt; noFire = true; speedMul *= P.speed; if (pw.t <= 0) unveil(a); }
  } else if (P.key === 'glaive') {
    if (pw.count < P.cap) { pw.rech += dt; if (pw.rech >= P.regen) { pw.rech = 0; pw.count++; } }
    if (P.orbit) {
      orbitTick(a, dt);
      if (pressed('power') && pw.count > 0 && !stunned) { const n = pw.count; pw.count = 0; for (let i = 0; i < n; i++) throwGlaive(a, 1, i / n * TAU, true, true); }
    } else if (I.power && pw.count > 0 && !stunned) { if (!pw.winding) { pw.winding = true; pw.wind = 0; Sfx.play('windup', a.pos, 0.5); } pw.wind += dt; noFire = true; speedMul *= P.slow; }
    else if (pw.winding) { pw.winding = false; if (pw.wind >= P.windMin && !stunned) throwGlaive(a, clamp((pw.wind - P.windMin) / Math.max(0.05, P.windMax - P.windMin), 0, 1)); pw.wind = 0; }
  } else if (P.key === 'lantern') {
    if (pw.walkCd > 0) pw.walkCd -= dt;
    if (!P.carried) {
      if (pw.charges < P.carry) { pw.rech += dt; if (pw.rech >= P.recharge) { pw.rech = 0; pw.charges++; } }
      if (pw.chan > 0) {
        pw.chan -= dt; noFire = true; forced = new V3();
        const L = Game.lanterns.get(pw.chanTo);
        if (!L) { pw.chan = 0; pw.chanTo = null; }
        else if (pw.chan <= 0) lanternWalk(a, L);
      } else if (pw.placing > 0) { pw.placing -= dt; speedMul *= 0.5; noFire = true; if (pw.placing <= 0) finishLantern(a); }
      else if (I.power && !stunned) {
        if (pw.hold >= 0) pw.hold += dt;
        if (pw.hold >= 0.3 && pw.walkCd <= 0 && !rooted) { const L = lanternInSights(a); if (L) { pw.chan = P.walk; pw.chanTo = L.id; pw.hold = -1; Sfx.play('blinkCharge', a.pos, 0.6); } }
      } else {
        if (pw.hold > 0 && pw.hold < 0.3 && pw.charges > 0 && !stunned) { pw.placing = P.place; Sfx.play('snarePlace', a.pos, 0.5); }
        pw.hold = 0;
      }
    }
  } else if (P.key === 'sub') {
    if (pw.cd > 0) pw.cd -= dt;
    if (pw.state === 'up') { if (pressed('power') && pw.cd <= 0 && !stunned && a.grounded) { pw.state = 'sinking'; pw.t = P.sink; Sfx.play('sink', a.pos); emit(['fx', 'sink', r2(a.pos.x), r2(a.pos.y), r2(a.pos.z), 0, 0]); } }
    else if (pw.state === 'sinking') { pw.t -= dt; speedMul *= 0.3; noFire = true; if (pw.t <= 0) { pw.state = 'under'; pw.t = 0; } }
    else if (pw.state === 'under') {
      pw.t += dt; speedMul *= P.speed; noFire = !P.artillery; a.vel.y = Math.min(a.vel.y, 0);
      if (P.heal) a.hp = Math.min(a.maxHp, a.hp + P.heal * dt);
      if (P.trail) { pw.trailT -= dt; if (pw.trailT <= 0) { pw.trailT = 0.35; emit(['zn', 'acid', r2(a.pos.x), r2(a.pos.y), r2(a.pos.z), r2(1.6 * (P.fen ? 2.5 : 1)), P.trail, 3 * (P.fen ? 3 : 1), a.id, 1]); } }
      if (P.drown) for (const t of Game.actors) if (t.alive && isEnemy(a, t) && Math.hypot(t.pos.x - a.pos.x, t.pos.z - a.pos.z) < 2.2) { const k = t.id; pw.drownAcc[k] = (pw.drownAcc[k] || 0) + P.drown * dt; if (pw.drownAcc[k] >= 7) { hitActor(a, t, pw.drownAcc[k], { how: 'drown' }); pw.drownAcc[k] = 0; } }
      if ((pressed('power') && !stunned) || pw.t >= P.maxTime) emerge(a);
    }
  } else if (P.key === 'line') {
    if (pw.charges < P.charges) { pw.rech += dt; if (pw.rech >= P.cd) { pw.rech = 0; pw.charges++; } }
    if (pressed('power') && pw.charges > 0 && !stunned) { pw.charges--; fireLine(a); }
  } else if (P.key === 'rewind') {
    // the past, kept ten times a second: where you were, how hurt you were, how loaded; and where your enemies stood
    pw.histT -= dt;
    if (pw.histT <= 0) {
      pw.histT = 0.1;
      pw.hist.push({ x: a.pos.x, y: a.pos.y, z: a.pos.z, hp: a.hp, ammo: a.ammo, t: Game.t });
      while (pw.hist.length && Game.t - pw.hist[0].t > P.back + 0.3) pw.hist.shift();
      if (P.retro) { const snap = { t: Game.t, p: {} }; for (const o of Game.actors) if (o.alive && isEnemy(a, o)) { const q = o.renderPos || o.pos; snap.p[o.id] = [q.x, q.y, q.z]; } pw.ehist.push(snap); while (pw.ehist.length && Game.t - pw.ehist[0].t > P.back + 0.3) pw.ehist.shift(); }
    }
    if (pw.anchor && Game.t - pw.anchor.t > P.anchor) { pw.anchor = null; pw.charges = Math.max(0, pw.charges - 1); if (a === Game.me) HUD.note('Anchor faded'); }
    if (pw.charges < P.charges && !pw.anchor) { pw.rech += dt; if (pw.rech >= P.cd) { pw.rech = 0; pw.charges++; } }
    if (pressed('power') && pw.charges > 0 && !stunned) {
      if (P.anchor && !pw.anchor) { pw.anchor = { x: a.pos.x, y: a.pos.y, z: a.pos.z, hp: a.hp, ammo: a.ammo, t: Game.t }; emit(['fx', 'anchor', r2(a.pos.x), r2(a.pos.y + 0.1), r2(a.pos.z), 0, 0]); Sfx.play('tick', a === Game.me ? null : a.pos, 0.8); }
      else { const to = rewindPoint(a); if (to) doRewind(a, to, false); }
    }
  }
  // ---------------------------------------------------- utility and ultimate
  if (a.utilT > 0) a.utilT -= dt;
  if (pressed('util') && a.utilT <= 0 && !stunned && !isSub(a)) useUtil(a);
  if (a.st.leech) leechTick(a, dt);
  a.ult = Math.min(100, a.ult + dt * 0.4 * (a.st.unbound || a.st.night ? 0 : 1));
  if (pressed('ult') && a.ult >= 100 && !stunned && !isSub(a)) useUlt(a);
  // ---------------------------------------------------- movement
  const fwd = flatFwd(a.yaw), right = new V3(-fwd.z, 0, fwd.x);
  const wish = new V3().addScaledVector(fwd, I.fwd).addScaledVector(right, I.side); if (wish.lengthSq() > 1) wish.normalize();
  const spd = H.speed * speedMul * (a.reloadT > 0 ? 0.9 : 1) * (H.weapon.kind === 'flame' && a.fireOn ? 0.85 : 1);
  if (a.grapple) {
    const g = a.grapple, d = g.p.clone().sub(a.pos); g.t -= dt; d.y += 0.5;
    if (d.length() < 1.6 || g.t <= 0) a.grapple = null; else { a.vel.copy(d.normalize().multiplyScalar(24)); a.grounded = false; }
  } else if (a.dashT > 0) { a.dashT -= dt; }
  else if (forced) { a.vel.x = forced.x; a.vel.z = forced.z; }
  else if (rooted) { a.vel.x *= Math.exp(-20 * dt); a.vel.z *= Math.exp(-20 * dt); }
  else {
    const accel = a.grounded ? (a.knockT > 0 ? 5 : 48) : 10;
    const tx = wish.x * spd, tz = wish.z * spd;
    if (a.grounded || wish.lengthSq() > 0.01) { a.vel.x = damp(a.vel.x, tx, accel / 6, dt); a.vel.z = damp(a.vel.z, tz, accel / 6, dt); }
    if (I.jump && a.grounded && !rooted && !isSub(a)) { a.vel.y = 7.2; a.grounded = false; Sfx.play('jump', a.pos, 0.4); }
  }
  if (a.knockT > 0) a.knockT -= dt;
  a.gravMul = a.grapple ? 0 : a.leapT > 0 ? 0.8 : 1; if (a.leapT > 0) a.leapT -= dt;
  const wasAir = !a.grounded, res = World.moveBody(a, dt);
  if (wasAir && a.grounded && res.landV > 6) { Sfx.play('land', a.pos, Math.min(1, res.landV / 14)); if (a === Game.me) View.land(res.landV); }
  if (P.key === 'ram' && pw.state === 'charge' && res.wall && res.wallSpeed > P.speed * 0.5) ramCrash(a, res.wall);
  if (a.grapple && res.wall) a.grapple = null;
  for (const p of World.pads) if (a.grounded && !isSub(a) && Math.abs(a.pos.x - p.x) < 1.1 && Math.abs(a.pos.z - p.z) < 1.1 && Math.abs(a.pos.y - p.y) < 0.4) launchPad(a, p);
  if (!isSub(a)) Pickups.check(a);
  const hs = Math.hypot(a.vel.x, a.vel.z);
  if (a.grounded && hs > 2 && !isSub(a)) { a.stepT -= dt * hs / 5.5; if (a.stepT <= 0) { a.stepT = 0.45; if (!(P.key === 'fade' && pw.state !== 'vis' && P.silent) && !(a.st.night > 0)) Sfx.play('step', a === Game.me ? null : a.pos, a === Game.me ? 0.25 : 0.7); } }
  // ---------------------------------------------------- the weapon
  weaponTick(a, dt, I.fire && !noFire && !stunned, pressed('reload'));
  a.prev = Object.assign({}, I);
}
function launchPad(a, p) {
  const dx = p.tx - a.pos.x, dz = p.tz - a.pos.z, dy = p.ty - a.pos.y, apex = Math.max(dy, 0) + p.apex, g = PHYS.grav;
  const vy = Math.sqrt(2 * g * apex), tUp = vy / g, tDown = Math.sqrt(2 * Math.max(0.1, apex - dy) / g), T = tUp + tDown;
  a.vel.set(dx / T, vy, dz / T); a.grounded = false; a.dashT = T * 0.95;
  Sfx.play('pad', a.pos); Fx.ring(new V3(p.x, p.y, p.z), 2, 0x3acfff, 0.5, 4, 0.25);
}

// ---------------------------------------------------------------- weapons
function weaponTick(a, dt, want, wantReload) {
  const W = a.H.weapon;
  a.bloom = Math.max(0, a.bloom - dt * 0.1);
  if (a.fireT > 0) a.fireT -= dt;
  a.fireOn = false;
  if (W.kind === 'flame') return flameTick(a, dt, want);
  if (W.kind === 'beam') return beamTick(a, dt, want);
  if (W.kind === 'melee') return meleeTick(a, dt, want);
  if (a.reloadT > 0) { a.reloadT -= dt; if (a.reloadT <= 0) a.ammo = W.mag; return; }
  if (a.burstLeft > 0) { a.burstT -= dt; if (a.burstT <= 0 && a.ammo > 0) { fireProj(a); a.burstLeft--; a.burstT = W.burstGap; if (!a.burstLeft) a.fireT = W.rof; } else if (a.ammo <= 0) a.burstLeft = 0; return; }
  if ((wantReload && a.ammo < W.mag) || (a.ammo <= 0 && a.fireT <= 0)) { a.reloadT = W.reload; Sfx.play('reload', a === Game.me ? null : a.pos, 0.5); if (a === Game.me) View.reload(W.reload); return; }
  if (!want || a.fireT > 0) return;
  if (a.P.key === 'sub' && a.pw.state === 'under') { if (a.P.artillery) { artilleryFlask(a); a.ammo--; a.fireT = W.rof * 1.2; } return; }
  if (W.burst) { a.burstLeft = W.burst; a.burstT = 0; return weaponTick(a, 0, false, false); }
  fireProj(a); a.fireT = W.rof;
}
const _r = new V3(), _u = new V3();
function shotDir(a, spread, out, yawOff = 0) {
  aimDir(a.yaw + yawOff, a.pitch, out);
  if (spread > 0) {
    _r.set(Math.cos(a.yaw), 0, -Math.sin(a.yaw)); _u.crossVectors(_r, out).normalize();
    const ang = Math.random() * TAU, m = Math.sqrt(Math.random()) * spread;
    out.addScaledVector(_r, Math.cos(ang) * m).addScaledVector(_u, Math.sin(ang) * m).normalize();
  }
  return out;
}
function dmgMul(a) { let d = 1; if ((a.st.strike > 0 && a.P.key === 'blink') || a.st.unbound > 0) d *= 1 + a.P.strike; if (a.st.night > 0) d *= 1.3; return d; }
function muzzleStart(a, eye, dir) {
  if (a === Game.me) { const r = new V3(Math.cos(a.yaw), 0, -Math.sin(a.yaw)); return eye.clone().addScaledVector(r, 0.16).add(new V3(0, -0.12, 0)).addScaledVector(dir, 0.5); }
  return eye.clone().addScaledVector(dir, 0.6);
}
function fireProj(a) {
  const W = a.H.weapon, eye = eyePos(a), moving = Math.hypot(a.vel.x, a.vel.z) > 1 || !a.grounded;
  a.ammo--;
  const spread = W.spread + (moving ? W.spreadMove : 0) + a.bloom; a.bloom = Math.min(0.02, a.bloom + 0.002);
  if (a.st.night > 0) a.st.nightFlash = 0.25;
  if (a === Game.me) View.kick(W.recoil);
  Sfx.play(W.sound, a === Game.me ? null : a.pos, a === Game.me ? 0.6 : 1);
  const n = W.volley || 1, mul = dmgMul(a);
  for (let i = 0; i < n; i++) {
    const off = n > 1 ? (i - (n - 1) / 2) * W.volleySpread : 0, dir = shotDir(a, spread, new V3(), off), o = muzzleStart(a, eye, dir);
    if (n > 1) dir.y += (Math.random() - 0.5) * 0.05;
    const p = { d: r2(W.dmg * mul), hd: W.head, g: W.grav || 0 };
    if (W.bounce) p.b = W.bounce; if (W.homing) p.hm = W.homing; if (W.splash) { p.s = W.splash; p.sr = W.splashR; } if (W.zone) p.z = W.zone; if (W.slow) p.sl = W.slow; if (W.stitch) p.st = 1;
    if (a.P.fen) p.fen = 1;
    if (a.P.mothBoost) p.mb = a.P.mothBoost;
    emit(['pr', W.proj, a.id, r2(o.x), r2(o.y), r2(o.z), r2(dir.x * W.speed), r2(dir.y * W.speed), r2(dir.z * W.speed), p]);
  }
  muzzleFx(a, a.H.look.glow);
}
// Boiler: a cone of fire in front, judged ten times a second
function flameTick(a, dt, want) {
  const W = a.H.weapon;
  if (a.overheat > 0) { a.overheat -= dt; a.heat = Math.max(0, a.heat - dt * W.coolRate * 1.5); if (a.flameLoop) a.flameLoop.set(0, 0); return; }
  if (!want) { a.heat = Math.max(0, a.heat - dt * W.coolRate); if (a.flameLoop) a.flameLoop.set(0, 0); return; }
  a.fireOn = true; a.heat += dt * W.heatRate;
  if (a.heat >= 1) { a.heat = 1; a.overheat = W.lockout; Sfx.play('overheat', a === Game.me ? null : a.pos); return; }
  if (a === Game.me) { if (!a.flameLoop) a.flameLoop = Sfx.loop('flame'); if (a.flameLoop) a.flameLoop.set(0.45, 0.5); }
  a.flameAcc = (a.flameAcc || 0) + dt;
  if (a.flameAcc < 0.1) return; const tick = a.flameAcc; a.flameAcc = 0;
  const eye = eyePos(a), dir = aimDir(a.yaw, a.pitch), mul = dmgMul(a);
  for (const t of Game.actors) {
    if (!t.alive || !isEnemy(a, t) || isSub(t)) continue;
    const c = chest(t), rel = c.clone().sub(eye), d = rel.length(); if (d > W.range + 0.5) continue;
    if (rel.normalize().dot(dir) < Math.cos(W.cone) && d > 1.2) continue;
    if (!World.clear(eye.x, eye.y, eye.z, c.x, c.y, c.z, a.team)) continue;
    const fo = d > W.range * 0.6 ? 0.6 : 1, burnFresh = !t._burnT || Game.t - t._burnT > 0.9;
    if (burnFresh) t._burnT = Game.t;
    hitActor(a, t, W.dps * tick * fo * mul, { fx: burnFresh ? { dot: [W.burn[0], W.burn[1], 'burn'] } : null, how: 'flame' });
  }
}
// Tidecaller: lock onto whoever is nearest the crosshair and drink them; the bite grows the longer you hold on
function beamTarget(a, W) {
  const eye = eyePos(a), dir = aimDir(a.yaw, a.pitch); let best = null, bs = Math.cos(W.cone);
  for (const t of Game.actors) {
    if (!t.alive || !isEnemy(a, t) || isSub(t)) continue;
    const c = chest(t), rel = c.clone().sub(eye), d = rel.length(); if (d > W.range) continue;
    const dot = rel.normalize().dot(dir); if (dot < bs) continue;
    if (!World.clear(eye.x, eye.y, eye.z, c.x, c.y, c.z, a.team)) continue;
    bs = dot; best = t;
  }
  return best;
}
function beamTick(a, dt, want) {
  const W = a.H.weapon;
  if (a.overheat > 0) { a.overheat -= dt; a.tide = Math.min(100, a.tide + W.regen * dt); setBeam(a, null); return; }
  if (!want || a.tide <= 0) { a.tide = Math.min(100, a.tide + W.regen * dt); setBeam(a, null); if (a.tide <= 0) a.overheat = 1.5; return; }
  a.fireOn = true; a.tide -= W.drain * dt;
  let t = a.beamT;
  if (t) {
    const eye = eyePos(a), c = chest(t), rel = c.clone().sub(eye), d = rel.length();
    const keep = t.alive && !isSub(t) && d < W.range + 2 && rel.normalize().dot(aimDir(a.yaw, a.pitch)) > Math.cos(W.cone * 2.2) && World.clear(eye.x, eye.y, eye.z, c.x, c.y, c.z, a.team);
    if (!keep) t = null;
  }
  if (!t) t = beamTarget(a, W);
  if (t !== a.beamT) { a.lockT = 0; setBeam(a, t); }
  if (!t) return;
  a.lockT += dt; a.beamAcc = (a.beamAcc || 0) + dt;
  if (a.beamAcc >= 0.2) { const dps = lerp(W.dpsMin, W.dpsMax, clamp(a.lockT / W.ramp, 0, 1)); hitActor(a, t, dps * a.beamAcc * dmgMul(a), { how: 'beam' }); a.beamAcc = 0; }
}
function setBeam(a, t) { if (a.beamT === t) return; a.beamT = t; Net.push(['bm', a.id, t ? t.id : '']); }
// Whisper Knives: a short wind-up, a lunge, and a cut. From behind it is a Backstab.
function meleeTick(a, dt, want) {
  const W = a.H.weapon;
  if (a.swingT > 0) { a.swingT -= dt; if (a.swingT <= 0) slash(a); return; }
  if (!want || a.fireT > 0) return;
  if (a.P.key === 'fade' && a.pw.state === 'cloaked' && (a.P.shootCloaked || a.P.perma)) { if (a.P.perma) { a.pw.state = 'vis'; a.pw.t = 2; a.st.ambush = 0.6; } else unveil(a); }
  a.swingT = W.windup; a.fireT = W.rof; a.anim.swing = 0.0001; a.swingSide = -(a.swingSide || 1);
  Sfx.play('swish', a === Game.me ? null : a.pos, 0.8);
  if (a === Game.me) View.slash(a.swingSide);
}
function slash(a) {
  const W = a.H.weapon, P = a.P, fwd = flatFwd(a.yaw), ambush = P.key === 'fade' && a.st.ambush > 0;
  const range = W.range + (ambush && P.cleave ? 1.5 : 0), cone = ambush && P.cleave ? 1.25 : W.cone;
  a.vel.x += fwd.x * W.lunge; a.vel.z += fwd.z * W.lunge;
  const eye = eyePos(a), dir = aimDir(a.yaw, a.pitch), hits = [];
  for (const t of Game.actors) {
    if (!t.alive || !isEnemy(a, t) || isSub(t)) continue;
    const c = chest(t), rel = c.clone().sub(eye), d = rel.length(); if (d > range + 0.4) continue;
    if (d > 1 && rel.clone().normalize().dot(dir) < Math.cos(cone)) continue;
    if (!World.clear(eye.x, eye.y, eye.z, c.x, c.y, c.z, a.team)) continue;
    hits.push({ t, d });
  }
  hits.sort((x, y) => x.d - y.d);
  const list = ambush && P.cleave ? hits : hits.slice(0, 1);
  if (ambush) { a.st.ambush = 0; if (list.length) Sfx.play('ambush', a.pos, 0.9); }
  for (const { t } of list) {
    const tf = flatFwd(t.yaw), from = a.pos.clone().sub(t.renderPos || t.pos).setY(0).normalize(), back = tf.dot(from) < -0.35;
    let d = W.dmg * (back ? W.backstab : 1) * dmgMul(a); if (ambush) d += P.ambush;
    hitActor(a, t, d, { head: back, fx: ambush ? { reveal: 4 } : null, how: back ? 'backstab' : ambush ? 'ambush' : 'knives' });
    Fx.burst(chest(t), 0xff3048, 10, 4, 0.35, 0.07, { k: 4 });
  }
  Net.push(['s', a.id, r2(a.pos.x + fwd.x * 2), r2(a.pos.y + 1.3), r2(a.pos.z + fwd.z * 2), 'm' + (a.swingSide > 0 ? 1 : 0)]);
  slashFx(a);
}
function slashFx(a) {
  const p = (a.renderPos || a.pos).clone(), f = flatFwd(a.yaw), side = a.swingSide || 1;
  for (let i = 0; i < 14; i++) { const ang = (i / 13 - 0.5) * 1.6 * side, d = new V3(f.x * Math.cos(ang) - f.z * Math.sin(ang), 0, f.z * Math.cos(ang) + f.x * Math.sin(ang)); Fx.spawn('add', p.x + d.x * 1.6, p.y + 1.3 + (i / 13 - 0.5) * 0.4 * side, p.z + d.z * 1.6, d.x * 2, 0, d.z * 2, 2.2, 1.2, 3.2, 0.09, 0.18); }
  if (a.anim) a.anim.swing = 0.0001;
}
function shotVisual(a, end, kind) {
  const W = a.H.weapon;
  if (typeof kind === 'string' && kind[0] === 'm') { a.swingSide = kind[1] === '1' ? 1 : -1; slashFx(a); Sfx.play('swish', a.pos, 0.8); return; }
  Sfx.play(W.sound, a.pos, 1);
}
function muzzleFx(a, hex) {
  const p = a === Game.me ? View.muzzleWorld(0) : a.model ? a.model.muzzle.getWorldPosition(new V3()) : eyePos(a);
  Fx.burst(p, hex, 5, 2, 0.08, 0.08, { k: 5 }); muzzleLight(p, hex, a === Game.me ? 3 : 5);
  if (a === Game.me) View.flash();
}

// ---------------------------------------------------------------- hitting heroes with rays and moving things
function rayActor(o, d, a, maxT, pad = 0) {
  if (isSub(a)) return null;
  const p = a.renderPos || a.pos, big = a.heroKey === 'gauge' ? 0.5 : 0.4;
  const hc = new V3(p.x, p.y + 1.62, p.z), hr = 0.22 + pad;
  let best = null;
  const oc = o.clone().sub(hc), b = oc.dot(d), c = oc.lengthSq() - hr * hr, disc = b * b - c;
  if (disc >= 0) { const t = -b - Math.sqrt(disc); if (t > 0 && t < maxT) best = { a, t, head: true }; }
  const r = big + pad, A = new V3(p.x, p.y + 0.35, p.z), u = new V3(0, 1.0, 0);
  const w0 = o.clone().sub(A), aa = d.dot(d), bb = d.dot(u), dd = d.dot(w0), ee = u.dot(w0), den = aa - bb * bb;
  let tc = den > 1e-6 ? (aa * ee - bb * dd) / den : 0; tc = clamp(tc, 0, 1); const sc = Math.max(0, (bb * tc - dd) / aa);
  const pc = o.clone().addScaledVector(d, sc), qc = A.clone().addScaledVector(u, tc), dist = pc.distanceTo(qc);
  if (dist < r && sc < maxT) { const t = sc - Math.sqrt(Math.max(0, r * r - dist * dist)); if (!best || t < best.t) best = { a, t: Math.max(0, t), head: false }; }
  if (best) best.pt = o.clone().addScaledVector(d, best.t);
  return best;
}

// ---------------------------------------------------------------- projectiles: bolts, shards, moths, flasks, needles, glaives, lines
const PROJ = { bolt: { pad: 0.08, life: 4 }, shard: { pad: 0.1, life: 3 }, moth: { pad: 0.3, life: 5 }, flask: { pad: 0.15, life: 5 }, needle: { pad: 0.06, life: 2 }, hand: { pad: 0.08, life: 2.5 }, glaive: { pad: 0.28, life: 6 }, line: { pad: 0.35, life: 1.5 } };
function projMesh(kind, owner, o) {
  const glow = owner ? owner.H.look.glow : 0xffffff;
  if (kind === 'glaive') return buildGlaive(glow, 1.3);
  if (kind === 'bolt') return buildBolt();
  if (kind === 'shard') return buildShard(glow);
  if (kind === 'moth') return buildMoth(glow);
  if (kind === 'flask') return buildFlask(glow);
  if (kind === 'needle') return buildNeedle(glow);
  if (kind === 'hand') return buildHand(glow);
  if (kind === 'line') return buildLineHead(glow, o.web);
  return new THREE.Mesh(sph(0.12, 8, 6), mGlow(glow, 5));
}
function spawnProj(kind, ownerId, pos, vel, o, remote) {
  const owner = Game.byId.get(ownerId);
  const p = { kind, owner: ownerId, team: owner ? owner.team : -1, pos: pos.clone(), vel: vel.clone(), t: 0, o, local: !remote && !!owner && !owner.remote, bounces: o.b | 0, hitSet: new Set(), hits: 0, mesh: projMesh(kind, owner, o) };
  p.mesh.position.copy(pos); G.scene.add(p.mesh);
  if (kind === 'glaive') Sfx.play('glaive', pos, 1);
  if (kind === 'line') p.line = makeThread(owner ? owner.H.look.glow : 0xff5a7a);
  Game.projs.push(p);
}
function killProj(p) { const i = Game.projs.indexOf(p); if (i >= 0) Game.projs.splice(i, 1); G.scene.remove(p.mesh); if (p.line) G.scene.remove(p.line.obj); }
function projTick(dt) {
  for (let i = Game.projs.length - 1; i >= 0; i--) {
    const p = Game.projs[i]; if (!p) continue;
    if (p.stuck != null) { p.stuck -= dt; if (p.stuck <= 0) killProj(p); continue; }
    p.t += dt; const o = p.o, owner = Game.byId.get(p.owner);
    if (o.hm && owner) {
      let best = null, bd = 1e9; const v = p.vel.clone().normalize();
      for (const a of Game.actors) { if (!a.alive || !isEnemy(owner, a) || isSub(a)) continue; const rel = chest(a).sub(p.pos), d = rel.length(); if (d > 26) continue; if (rel.normalize().dot(v) < 0.5) continue; if (d < bd) { bd = d; best = a; } }
      if (best) { const want = chest(best).sub(p.pos).normalize().multiplyScalar(p.vel.length()); p.vel.lerp(want, Math.min(1, o.hm * dt)); }
    }
    if (p.back && owner) { const want = chest(owner).sub(p.pos); if (want.length() < 1.2) { killProj(p); continue; } p.vel.copy(want.normalize().multiplyScalar(40)); }
    else p.vel.y -= (o.g || 0) * dt;
    const step = p.vel.clone().multiplyScalar(dt), len = step.length(), dir = step.clone().divideScalar(len || 1);
    const wh = p.back ? null : World.ray(p.pos.x, p.pos.y, p.pos.z, dir.x, dir.y, dir.z, len, p.team);
    let hitA = null, hitT = wh ? wh.t : len;
    if (p.local && owner) {
      const pad = p.kind === 'line' ? (o.pad || 0.35) : PROJ[p.kind] ? PROJ[p.kind].pad : 0.1;
      for (const a of Game.actors) {
        if (!a.alive || !isEnemy(owner, a) || p.hitSet.has(a.id)) continue;
        const h = rayActor(p.pos, dir, a, hitT, pad);
        if (h && h.t <= hitT) { hitT = h.t; hitA = h; }
      }
      let popped = false;
      for (const d of Game.decoys) if (d.owner !== p.owner && d.t > 0 && d.pos.clone().setY(d.pos.y + 1).distanceTo(p.pos) < 1.0) { popDecoy(d); popped = true; break; }
      if (popped) { killProj(p); continue; }
    }
    if (hitA) { p.pos.addScaledVector(dir, hitA.t); if (projHitActor(p, hitA, owner)) continue; }
    else if (wh) {
      p.pos.set(wh.x, wh.y, wh.z);
      if (wh.wall && p.local) emit(['wh', wh.wall.id, o.d || 40]);
      const n = new V3(wh.nx, wh.ny, wh.nz);
      if (p.bounces > 0 && p.kind !== 'flask') { p.bounces--; p.hits++; p.vel.reflect(n).multiplyScalar(0.92); p.pos.addScaledVector(n, 0.05); Fx.sparks(p.pos, n, owner ? owner.H.look.glow : 0xffe0a0, 6); Sfx.play('ricochet', p.pos, 0.5); }
      else if (p.kind === 'glaive' && o.ret) { p.back = true; p.hitSet.clear(); Fx.sparks(p.pos, n, 0xffe0a0, 8); Sfx.play('glaiveHit', p.pos, 0.6); }
      else { projImpact(p, wh, owner); continue; }
    } else p.pos.add(step);
    p.mesh.position.copy(p.pos);
    if (p.kind === 'glaive') { p.mesh.rotation.y += dt * 22; Fx.spawn('add', p.pos.x, p.pos.y, p.pos.z, 0, 0, 0, 0.8, 2.4, 1.8, 0.12, 0.16); }
    else p.mesh.lookAt(p.pos.clone().add(p.vel));
    if (p.kind === 'moth') { const w = p.mesh.userData.wings; if (w) { w[0].rotation.z = Math.sin(p.t * 40) * 0.8; w[1].rotation.z = -Math.sin(p.t * 40) * 0.8; } if (Math.random() < 0.4) Fx.spawn('add', p.pos.x, p.pos.y, p.pos.z, 0, 0.2, 0, 2.5, 2, 0.8, 0.05, 0.4); }
    if (p.kind === 'shard') Fx.spawn('add', p.pos.x, p.pos.y, p.pos.z, 0, 0, 0, 1.4, 1.0, 3, 0.06, 0.12);
    if (p.kind === 'flask' && Math.random() < 0.5) Fx.spawn('add', p.pos.x, p.pos.y, p.pos.z, 0, 0.3, 0, 1.2, 3, 0.6, 0.05, 0.3);
    if (p.line && owner) p.line.set(owner === Game.me ? View.muzzleWorld(0) : chest(owner), p.pos);
    const life = p.kind === 'line' ? (o.rg || 32) / Math.max(1, p.vel.length()) : (PROJ[p.kind] || {}).life || 5;
    if (p.t > life || p.pos.y < -5) killProj(p);
  }
}
// returns true when the projectile is finished with
function projHitActor(p, h, owner) {
  const o = p.o, t = h.a; p.hitSet.add(t.id);
  if (p.kind === 'line') { lineCatch(owner, t); if (++p.hits >= (o.mu || 1)) { killProj(p); return true; } return false; }
  if (p.kind === 'glaive') {
    let d = o.d || 60; if (h.head) d *= 1.5;
    const fx = {}; if (o.v) fx.dot = [o.v, 5, 'poison']; if (o.m) { fx.reveal = o.m; fx.slow = [0.65, 3]; }
    hitActor(owner, t, d, { head: h.head, fx, how: 'glaive', oneshot: !!o.os });
    Fx.burst(h.pt || p.pos, 0xff3048, 14, 6, 0.4, 0.08, { k: 4 }); Sfx.play('glaiveHit', p.pos, 1);
    if (o.bl) splash(p, o.bl, o.br, t);
    if (o.pi || p.back) return false;
    killProj(p); return true;
  }
  let d = (o.d || 20) * (h.head ? o.hd || 1 : 1) * (1 + 0.15 * p.hits);
  if (p.kind === 'moth' && o.mb && owner && inOwnerLight(owner, t)) d *= 1 + o.mb;
  hitActor(owner, t, d, { head: h.head, fx: o.sl ? { slow: o.sl } : null, how: p.kind });
  Fx.burst(h.pt || p.pos, 0xff3048, 8, 4, 0.3, 0.06, { k: 4 });
  if (o.st && owner) stitchHit(owner, t);
  if (p.kind === 'flask') { projImpact(p, { nx: 0, ny: 1, nz: 0, floor: true }, owner); return true; }
  killProj(p); return true;
}
function projImpact(p, wh, owner) {
  const o = p.o;
  if (p.kind === 'glaive') {
    Fx.sparks(p.pos, { x: wh.nx, y: wh.ny, z: wh.nz }, 0xffe0a0, 10); Sfx.play('glaiveHit', p.pos, 0.7);
    if (o.bl) { if (p.local) splash(p, o.bl, o.br, null); Fx.explosion(p.pos, o.br * 0.6, 0xff8a3a); }
    p.stuck = 2.5; p.mesh.rotation.x = Math.PI / 2 - 0.4; return;
  }
  if (p.kind === 'flask') {
    Sfx.play('glass', p.pos, 1); Fx.burst(p.pos, 0x9aff5a, 26, 5, 0.5, 0.08, { up: 2, grav: 8, k: 3 });
    if (p.local) {
      splash(p, o.s || 30, o.sr || 2.2, null);
      const fen = o.fen ? 1 : 0, z = o.z || [25, 2.5, 4], gy = World.groundAt(p.pos.x, p.pos.z, p.pos.y + 0.3);
      emit(['zn', 'acid', r2(p.pos.x), r2(gy), r2(p.pos.z), r2(z[1] * (fen ? 2.5 : 1)), z[0], z[2] * (fen ? 3 : 1), p.owner, 1]);
    }
    killProj(p); return;
  }
  Fx.sparks(p.pos, { x: wh.nx, y: wh.ny, z: wh.nz }, owner ? owner.H.look.glow : 0xffc070, p.kind === 'bolt' ? 10 : 5);
  if (p.kind === 'bolt') { p.stuck = 3; return; }
  killProj(p);
}
function splash(p, dmg, r, skip) {
  const owner = Game.byId.get(p.owner); if (!owner || !dmg) return;
  for (const a of Game.actors) {
    if (!a.alive || a === skip || a === owner || isSub(a) || !isEnemy(owner, a)) continue;
    const c = chest(a), d = c.distanceTo(p.pos); if (d > r + 0.4) continue;
    if (!World.clear(p.pos.x, p.pos.y + 0.2, p.pos.z, c.x, c.y, c.z)) continue;
    hitActor(owner, a, dmg * (1 - clamp((d - 0.4) / r, 0, 1) * 0.6), { how: p.kind });
  }
}
function stitchHit(owner, t) {
  const s = owner.stitch[t.id] || (owner.stitch[t.id] = { n: 0, t: 0 });
  if (Game.t - s.t > 1.5) s.n = 0; s.n++; s.t = Game.t;
  if (s.n >= (owner.P.meet ? 2 : 3)) { s.n = 0; hitActor(owner, t, 0, { fx: { root: owner.H.weapon.stitch } }); emit(['fx', 'stitch', r2(t.pos.x), r2(t.pos.y + 1), r2(t.pos.z), 0, 0]); }
}

// ---------------------------------------------------------------- Marrow: snares
function finishSnare(a) {
  const P = a.P, pw = a.pw; if (pw.charges <= 0) return;
  let pos;
  if (P.throwDist > 0) { const e = eyePos(a), d = aimDir(a.yaw, a.pitch), h = World.ray(e.x, e.y, e.z, d.x, d.y, d.z, P.throwDist, a.team); pos = h ? new V3(h.x, h.y, h.z).addScaledVector(d, -0.3) : e.clone().addScaledVector(d, P.throwDist); }
  else pos = a.pos.clone().add(flatFwd(a.yaw).multiplyScalar(1.1));
  pos.y = World.groundAt(pos.x, pos.z, pos.y + 0.6);
  pw.charges--; layOwnSnare(a, pos);
}
function snarePack(P) { return { d: P.dmg, rt: P.noRoot ? 0 : P.root, rv: P.reveal, b: P.bleed, r: P.radius, v: P.visDist, c: P.chain, bl: P.bell, x: P.explode, xr: P.explodeR, ar: P.arm, vu: P.vuln }; }
function layOwnSnare(a, pos) {
  const pw = a.pw; pw.n = (pw.n | 0) + 1;
  emit(['sn', a.id + '#' + pw.n, a.id, r2(pos.x), r2(pos.y), r2(pos.z), snarePack(a.P)]);
  const mine = [...Game.snares.values()].filter(s => s.owner === a.id && !s.sprung).sort((x, y) => x.born - y.born);
  while (mine.length > a.P.carry) emit(['sx', mine.shift().id]);
}
function autoSnare(a) {
  const foes = Game.actors.filter(t => t.alive && isEnemy(a, t)); if (!foes.length) return;
  const f = pick(foes), ahead = f.pos.clone().addScaledVector(new V3(f.vel.x, 0, f.vel.z), 1.8 + Math.random());
  const n = World.nearNode(ahead.x, ahead.y, ahead.z, 4); if (n < 0) return;
  const N = World.nav.nodes[n]; layOwnSnare(a, new V3(N.x + rand(-0.3, 0.3), N.y, N.z + rand(-0.3, 0.3)));
}
function placeSnare(id, ownerId, pos, o) {
  if (Game.snares.has(id)) return;
  const owner = Game.byId.get(ownerId), mesh = buildSnare(owner && Game.me && !isEnemy(Game.me, owner) ? TEAM_HEX[0] : ENEMY_HEX);
  mesh.position.copy(pos); mesh.rotation.y = rand(0, TAU); G.scene.add(mesh);
  Game.snares.set(id, { id, owner: ownerId, team: owner ? owner.team : -1, pos: pos.clone(), o, born: Game.t, mesh, armT: o.ar || 1, boostT: 0 });
  Sfx.play('snarePlace', pos, 0.8);
}
function removeSnare(s) { G.scene.remove(s.mesh); Game.snares.delete(s.id); }
function snareTick(dt) {
  for (const s of Game.snares.values()) {
    if (s.sprung) continue;
    s.armT -= dt; if (s.boostT > 0) s.boostT -= dt;
    const armed = s.armT <= 0, owner = Game.byId.get(s.owner);
    s.mesh.userData.light.visible = armed;
    if (Game.me) { const enemy = owner ? isEnemy(Game.me, owner) : true; s.mesh.visible = !enemy || Game.me.pos.distanceTo(s.pos) < (s.o.v || 10); }
    if (!armed || !owner) continue;
    const r = (s.o.r || 1.1) * (s.boostT > 0 ? 1.8 : 1);
    for (const a of Game.actors) {
      if (a.remote || !a.alive || !isEnemy(owner, a) || isSub(a)) continue;
      if (Math.abs(a.pos.y - s.pos.y) > 1.0) continue;
      if ((a.pos.x - s.pos.x) ** 2 + (a.pos.z - s.pos.z) ** 2 > r * r) continue;
      springSnare(s, a); break;
    }
  }
}
function springSnare(s, a) {
  const o = s.o, owner = Game.byId.get(s.owner);
  emit(['sp', s.id, a.id]);
  const fx = { reveal: o.rv || 6 }; if (o.rt) fx.root = o.rt; if (o.b) fx.dot = [o.b, 5, 'bleed']; if (o.vu) fx.vuln = [1.5, o.vu];
  if (o.x) {
    for (const t of Game.actors) { if (!t.alive || !isEnemy(owner, t)) continue; const d = t.pos.distanceTo(s.pos); if (d > o.xr) continue; hitActor(owner, t, o.x * (1 - d / o.xr * 0.4), { fx: { reveal: o.rv, knock: [0, 6, 0] }, how: 'snare', srcPos: [s.pos.x, s.pos.z] }); }
    emit(['fx', 'boom', r2(s.pos.x), r2(s.pos.y + 0.3), r2(s.pos.z), o.xr, 0xff8a3a]);
  } else hitActor(owner, a, o.d || 40, { fx, how: 'snare', srcPos: [s.pos.x, s.pos.z] });
  if (o.c) for (const s2 of Game.snares.values()) {
    if (s2 === s || s2.owner !== s.owner || s2.sprung || s2.pos.distanceTo(s.pos) > o.c) continue;
    emit(['fx', 'pulse', r2(s2.pos.x), r2(s2.pos.y), r2(s2.pos.z), 4, 0]);
    for (const t of Game.actors) if (t.alive && isEnemy(owner, t) && t.pos.distanceTo(s2.pos) < 4) hitActor(owner, t, 25, { fx: { root: 1.2 }, how: 'snare' });
  }
  if (o.bl) for (const t of Game.actors) if (t.alive && isEnemy(owner, t) && t !== a && t.pos.distanceTo(s.pos) < o.bl) hitActor(owner, t, 0, { fx: { reveal: 8 }, subOk: true });
}
function springSnareFx(id, vid) {
  const s = Game.snares.get(id); if (!s || s.sprung) return; s.sprung = true;
  const v = Game.byId.get(vid), U = s.mesh.userData;
  U.jawA.rotation.x = -0.1; U.jawB.rotation.x = 0.1;
  Sfx.play('snareSnap', s.pos, 1.2); Fx.sparks(s.pos.clone().setY(s.pos.y + 0.3), { x: 0, y: 1, z: 0 }, 0xffd090, 12); Fx.ring(s.pos, 2.2, 0xff8a3a, 0.4, 4);
  const owner = Game.byId.get(s.owner);
  if (owner === Game.me && v) HUD.note(`${v.name} is caught in a snare`);
  if (owner && !owner.remote) owner.ult = Math.min(100, owner.ult + 5);
  setTimeout(() => removeSnare(s), 900);
}

// ---------------------------------------------------------------- Lark: rift step
function doBlink(a) {
  const P = a.P, pw = a.pw, f = clamp(pw.chargeT / P.chargeTime, 0, 1), dist = lerp(P.minDist, P.maxDist, f);
  const e = eyePos(a), d = aimDir(a.yaw, P.vertical ? a.pitch : clamp(a.pitch, -0.35, 0.55));
  const h = World.ray(e.x, e.y - 0.6, e.z, d.x, d.y, d.z, dist, -9);
  let to = h ? new V3(h.x, h.y, h.z).addScaledVector(d, -0.55) : e.clone().setY(e.y - 0.6).addScaledVector(d, dist);
  if (h && h.ny > 0.6) to.set(h.x, h.y, h.z);
  to.y -= PHYS.eye - 0.6;
  const g = World.groundAt(to.x, to.z, to.y + 0.6); if (to.y < g) to.y = g;
  const probe = { x: to.x, z: to.z }; World.collideXZ(probe, PHYS.r, to.y + PHYS.step, to.y + PHYS.h); to.x = probe.x; to.z = probe.z;
  const B = World.bounds; to.x = clamp(to.x, B.x0 + 0.6, B.x1 - 0.6); to.z = clamp(to.z, B.z0 + 0.6, B.z1 - 0.6); to.y = Math.max(to.y, 0);
  const from = a.pos.clone();
  if (P.decoy) emit(['dc', a.id, r2(from.x), r2(from.y), r2(from.z), r2(a.yaw), P.decoy]);
  a.pos.copy(to); a.vel.multiplyScalar(0.3); a.vel.y = Math.max(0, a.vel.y);
  emit(['bl', a.id, r2(from.x), r2(from.y), r2(from.z), r2(to.x), r2(to.y), r2(to.z), 0]);
  if (P.hpCost) applyDamage(a, P.hpCost, a.id, { how: 'heart' });
  else if (!(a.st.unbound > 0)) pw.charges--;
  pw.used++; pw.chainT = P.window; a.st.strike = P.strikeWin;
  if (P.heal) a.hp = Math.min(a.maxHp, a.hp + P.heal);
  if (P.arriveDmg) { for (const t of Game.actors) if (t.alive && isEnemy(a, t) && t.pos.distanceTo(to) < P.arriveR + 0.4) hitActor(a, t, P.arriveDmg, { fx: { knock: [0, 5, 0] }, how: 'blink' }); emit(['fx', 'seam', r2(to.x), r2(to.y + 0.8), r2(to.z), P.arriveR, 0]); }
  if (P.lineDmg) {
    const seg = to.clone().sub(from), L = seg.length(); seg.normalize();
    for (const t of Game.actors) { if (!t.alive || !isEnemy(a, t)) continue; const u = clamp(t.pos.clone().sub(from).dot(seg), 0, L); if (from.clone().addScaledVector(seg, u).distanceTo(t.pos) < 1.4) hitActor(a, t, P.lineDmg, { how: 'blink' }); }
  }
  if (P.rift) { emit(['fx', 'rift', r2(from.x), r2(from.y + 1), r2(from.z), 3.5, 0]); later(1, () => { emit(['fx', 'riftpop', r2(from.x), r2(from.y + 1), r2(from.z), 3.5, 0]); for (const t of Game.actors) if (t.alive && isEnemy(a, t) && t.pos.distanceTo(from) < 3.5) hitActor(a, t, P.rift, { how: 'blink' }); }); }
  if (pw.charges <= 0 && !(a.st.unbound > 0) && !P.hpCost) endChain(a);
}
function endChain(a) {
  const P = a.P, pw = a.pw;
  if (!P.noFatigue && !(a.st.unbound > 0) && pw.used > 0) { a.st.fatigue = P.fatiguePer * pw.used; Sfx.play('fatigue', a === Game.me ? null : a.pos, 0.7); }
  pw.used = 0; pw.chainT = 0;
}
function blinkFx(a, from, to, remote, kind) {
  const hex = a ? a.H.look.glow : 0xb48aff;
  Fx.tracer(from.clone().setY(from.y + 1), to.clone().setY(to.y + 1), hex, 0.25, 0.3, 4);
  Fx.burst(from.clone().setY(from.y + 1), hex, 24, 5, 0.5, 0.1, { k: 4 }); Fx.burst(to.clone().setY(to.y + 1), hex, 24, 5, 0.5, 0.1, { k: 4 });
  Fx.sphere(to.clone().setY(to.y + 1), 1.2, hex, 0.25, 3);
  Sfx.play(kind ? 'lanternWalk' : 'blink', a === Game.me ? null : to, 1);
  if (a && remote) { a.snaps.length = 0; a.renderPos = a.renderPos || new V3(); a.renderPos.copy(to); a.pos.copy(to); }
  if (a === Game.me) View.blink();
}
function spawnDecoy(a, pos, yaw, t) {
  const m = buildHero(a.heroKey, modelColorFor(a)); m.root.position.copy(pos); m.root.rotation.y = yaw; G.scene.add(m.root); poseIdle(m, 0);
  Game.decoys.push({ pos: pos.clone(), m, t, owner: a.id });
}
function popDecoy(d) { d.t = 0; Fx.burst(d.pos.clone().setY(d.pos.y + 1), 0xb48aff, 30, 5, 0.6, 0.1); }

// ---------------------------------------------------------------- Gauge: ramjet
function endRam(a, cool) { const pw = a.pw; pw.state = 'idle'; pw.cd = cool ? a.P.cd : Math.max(pw.cd, 3); a.vel.x *= 0.3; a.vel.z *= 0.3; }
function ramContacts(a) {
  const P = a.P, pw = a.pw, fwd = flatFwd(a.yaw);
  for (const t of Game.actors) {
    if (!t.alive || !isEnemy(a, t) || pw.hit.has(t.id) || isSub(t)) continue;
    const rel = (t.renderPos || t.pos).clone().sub(a.pos); if (Math.abs(rel.y) > 1.6) continue; rel.y = 0;
    const along = rel.dot(fwd), side = Math.abs(rel.x * fwd.z - rel.z * fwd.x);
    if (along < -0.3 || along > 1.6 || side > 1.1) continue;
    pw.hit.add(t.id);
    const k = fwd.clone().multiplyScalar(P.knock), fx = { knock: [k.x, 4 + P.knock * 0.2, k.z], stun: 0.5 };
    if (P.vent) { fx.dot = [40, 3, 'burn']; a.heat = 0; a.overheat = 0; }
    hitActor(a, t, P.dmg, { fx, exec: P.execute, how: 'ram' });
    emit(['fx', 'ram', r2(t.pos.x), r2(t.pos.y + 1), r2(t.pos.z), 0, 0]);
    if (a === Game.me) View.shake(0.6);
    if (!P.multi) { endRam(a, true); return; }
  }
}
function ramCrash(a, w) {
  const P = a.P, pw = a.pw;
  if (P.bounce && w) {
    const f = flatFwd(a.yaw), n = new V3(w.nx, 0, w.nz), r = f.sub(n.multiplyScalar(2 * f.dot(n)));
    a.yaw = Math.atan2(-r.x, -r.z); a.ramYaw = a.yaw; pw.hit.clear();
    emit(['fx', 'crash', r2(a.pos.x), r2(a.pos.y + 1), r2(a.pos.z), 4, 0]);
    for (const t of Game.actors) if (t.alive && isEnemy(a, t) && t.pos.distanceTo(a.pos) < 4) hitActor(a, t, 40, { fx: { knock: [0, 5, 0] }, how: 'ram' });
    if (a === Game.me) View.shake(0.7); return;
  }
  emit(['fx', 'crash', r2(a.pos.x), r2(a.pos.y + 1), r2(a.pos.z), P.shock ? P.shockR : 0, 0]);
  if (P.shock) for (const t of Game.actors) if (t.alive && isEnemy(a, t) && t.pos.distanceTo(a.pos) < P.shockR && World.clear(a.pos.x, a.pos.y + 1, a.pos.z, t.pos.x, t.pos.y + 1, t.pos.z)) hitActor(a, t, P.shock, { fx: { knock: [0, 6, 0] }, how: 'ram' });
  if (a === Game.me) View.shake(1);
  a.vel.set(0, 0, 0);
  if (P.crashStun > 0) { pw.state = 'crash'; pw.t = P.crashStun; } else endRam(a, true);
}

// ---------------------------------------------------------------- Veil: fade
function unveil(a) {
  const P = a.P, pw = a.pw;
  pw.state = 'vis'; pw.cd = P.cd; a.st.ambush = P.ambushWin; if (P.swift) a.st.swift = P.swift;
  if (P.shadowStep) {
    const e = eyePos(a), d = aimDir(a.yaw, a.pitch); let best = null, bs = 0.94;
    for (const t of Game.actors) { if (!t.alive || !isEnemy(a, t) || isSub(t)) continue; const rel = chest(t).sub(e), dist = rel.length(); if (dist > 16) continue; const dot = rel.normalize().dot(d); if (dot > bs) { bs = dot; best = t; } }
    if (best) {
      const p = (best.renderPos || best.pos), to = p.clone().add(flatFwd(best.yaw).multiplyScalar(-1.3));
      to.y = World.groundAt(to.x, to.z, p.y + 0.6); const probe = { x: to.x, z: to.z }; World.collideXZ(probe, PHYS.r, to.y + PHYS.step, to.y + PHYS.h); to.x = probe.x; to.z = probe.z;
      const from = a.pos.clone(); a.pos.copy(to); a.vel.set(0, 0, 0); const dd = p.clone().sub(to); a.yaw = Math.atan2(-dd.x, -dd.z);
      emit(['bl', a.id, r2(from.x), r2(from.y), r2(from.z), r2(to.x), r2(to.y), r2(to.z), 1]);
    }
  }
  if (P.blind) { emit(['fx', 'bloom', r2(a.pos.x), r2(a.pos.y + 1), r2(a.pos.z), 8, 0]); for (const t of Game.actors) if (t.alive && isEnemy(a, t) && t.pos.distanceTo(a.pos) < 8) hitActor(a, t, 0, { fx: { blind: P.blind } }); }
}

// ---------------------------------------------------------------- Ivra: glaives
function throwGlaive(a, f, yawOff = 0, free = false, ring = false) {
  const P = a.P, pw = a.pw;
  const speed = lerp(P.spdMin, P.spdMax, f), dmg = lerp(P.dmgMin, P.dmgMax, f), full = f >= 0.98;
  const n = P.twin && !free ? Math.min(2, pw.count) : 1;
  if (!free) pw.count -= n;
  for (let i = 0; i < n; i++) {
    const yaw = a.yaw + (n > 1 ? (i ? 1 : -1) * 0.07 : 0) + yawOff, d = aimDir(yaw, ring ? 0.02 : a.pitch);
    const e = eyePos(a), o = ring ? e.clone().setY(e.y - 0.5).addScaledVector(d, 1.6) : e.clone().add(new V3(Math.cos(a.yaw), 0, -Math.sin(a.yaw)).multiplyScalar(-0.12)).addScaledVector(d, 0.5);
    emit(['pr', 'glaive', a.id, r2(o.x), r2(o.y), r2(o.z), r2(d.x * speed), r2(d.y * speed), r2(d.z * speed), { d: r2(dmg), g: ring ? 2 : P.grav, v: P.venom, b: P.ricochet, bl: P.blast, br: P.blastR, m: P.mark, os: P.oneshot && full ? 1 : 0, ret: P.returning ? 1 : 0, pi: P.pierce ? 1 : 0 }]);
  }
  if (a === Game.me) View.throwAnim();
}
function orbitTick(a) {
  const pw = a.pw; if (!pw.count) return;
  for (const t of Game.actors) {
    if (!t.alive || !isEnemy(a, t) || isSub(t)) continue;
    const p = t.renderPos || t.pos, d = Math.hypot(p.x - a.pos.x, p.z - a.pos.z); if (d > 2.4 || Math.abs(p.y - a.pos.y) > 1.6) continue;
    const last = pw.touch[t.id] || -9; if (Game.t - last < 0.5) continue; pw.touch[t.id] = Game.t;
    hitActor(a, t, 40, { how: 'glaive' }); Sfx.play('glaiveHit', p, 0.6);
  }
}

// ---------------------------------------------------------------- Wick: lanterns
function finishLantern(a) {
  const P = a.P, pw = a.pw; if (pw.charges <= 0) return;
  let pos;
  if (P.throwDist > 0) { const e = eyePos(a), d = aimDir(a.yaw, a.pitch), h = World.ray(e.x, e.y, e.z, d.x, d.y, d.z, P.throwDist, a.team); pos = h ? new V3(h.x, h.y, h.z).addScaledVector(d, -0.4) : e.clone().addScaledVector(d, P.throwDist); }
  else pos = a.pos.clone().add(flatFwd(a.yaw).multiplyScalar(1.0));
  pos.y = World.groundAt(pos.x, pos.z, pos.y + 0.6);
  pw.charges--; pw.n++;
  emit(['ln', a.id + '#L' + pw.n, a.id, r2(pos.x), r2(pos.y), r2(pos.z), { r: r2(P.radius) }]);
  const mine = [...Game.lanterns.values()].filter(l => l.owner === a.id && !l.follow).sort((x, y) => x.born - y.born);
  while (mine.length > P.carry) emit(['lx', mine.shift().id]);
}
function placeLantern(id, ownerId, pos, o) {
  if (Game.lanterns.has(id)) return;
  const owner = Game.byId.get(ownerId), P = owner ? owner.P : powerFor('wick', []);
  const mesh = o.f ? null : buildLantern(owner ? owner.H.look.glow : 0xffd27a); if (mesh) { mesh.position.copy(pos); G.scene.add(mesh); }
  const light = buildLightPool(o.r || P.radius); light.position.copy(pos); G.scene.add(light);
  Game.lanterns.set(id, { id, owner: ownerId, team: owner ? owner.team : -1, pos: pos.clone(), r: o.r || P.radius, P, born: Game.t, mesh, light, follow: !!o.f, rooted: new Set(), inT: {}, turretT: P.turret || 0, beamHit: {} });
  if (mesh) Sfx.play('lantern', pos, 0.8);
}
function removeLantern(l) { if (l.mesh) G.scene.remove(l.mesh); G.scene.remove(l.light); Game.lanterns.delete(l.id); if (l.mesh) Fx.burst(l.pos.clone().setY(l.pos.y + 1), 0xffd27a, 14, 2, 0.6, 0.08); }
function lanternInSights(a) {
  const e = eyePos(a), d = aimDir(a.yaw, a.pitch); let best = null, bs = Math.cos(0.3);
  for (const l of Game.lanterns.values()) { if (l.owner !== a.id || l.follow) continue; const rel = l.pos.clone().setY(l.pos.y + 1).sub(e); if (rel.length() < 3) continue; const dot = rel.normalize().dot(d); if (dot > bs) { bs = dot; best = l; } }
  return best;
}
function lanternWalk(a, L) {
  const P = a.P, pw = a.pw, from = a.pos.clone(), to = L.pos.clone();
  a.pos.copy(to); a.vel.set(0, 0, 0); pw.walkCd = P.walkCd; pw.chanTo = null;
  emit(['bl', a.id, r2(from.x), r2(from.y), r2(from.z), r2(to.x), r2(to.y), r2(to.z), 1]);
  if (P.echo) { emit(['fx', 'bloom', r2(to.x), r2(to.y + 1), r2(to.z), 6, 0]); for (const t of Game.actors) if (t.alive && isEnemy(a, t) && t.pos.distanceTo(to) < 6) hitActor(a, t, 0, { fx: { blind: P.echo } }); }
}
function inOwnerLight(owner, t) { for (const l of Game.lanterns.values()) if (l.owner === owner.id && (t.renderPos || t.pos).distanceTo(l.pos) < l.r) return true; return false; }
function lanternTick(dt) {
  const segs = new Map();
  for (const l of Game.lanterns.values()) {
    const owner = Game.byId.get(l.owner);
    if (l.follow) { if (!owner || !owner.alive) continue; l.pos.copy(owner.renderPos || owner.pos); }
    l.light.position.copy(l.pos);
    const P = l.P, enemyView = Game.me && owner && isEnemy(Game.me, owner);
    l.light.visible = !(enemyView && P.hidden); if (l.mesh) { l.mesh.visible = !(enemyView && P.hidden); l.mesh.userData.flame.scale.setScalar(1 + Math.sin(G.time * 14 + l.born) * 0.12); }
    if (!owner) continue;
    if (P.beacon && !l.follow) { if (!segs.has(l.owner)) segs.set(l.owner, []); segs.get(l.owner).push(l); }
    for (const a of Game.actors) {
      if (a.remote || !a.alive || !isEnemy(owner, a) || isSub(a)) continue;
      const c = chest(a); if (c.distanceTo(l.pos.clone().setY(l.pos.y + 1.2)) > l.r) { l.inT[a.id] = 0; continue; }
      if (!World.clear(l.pos.x, l.pos.y + 1.2, l.pos.z, c.x, c.y, c.z)) continue;
      const fx = P.hidden ? { hrev: 0.3 + P.linger } : { reveal: 0.3 + P.linger }; fx.slow = [P.slow, 0.3];
      applyFx(a, fx, owner.id); a.st.lightT = 0.3;
      l.inT[a.id] = (l.inT[a.id] || 0) + dt;
      if (P.burn) { a._lb = (a._lb || 0) + P.burn * dt; if (a._lb >= 6) { applyDamage(a, a._lb, owner.id, { how: 'lantern' }); a._lb = 0; } }
      if (P.root && l.inT[a.id] >= 2 && !l.rooted.has(a.id)) { l.rooted.add(a.id); applyFx(a, { root: P.root }, owner.id); Fx.ring(a.pos, 1.5, 0xffd27a, 0.4, 4, 0.05); }
    }
    if (P.turret && !owner.remote) {
      l.turretT -= dt;
      if (l.turretT <= 0) {
        l.turretT = P.turret;
        const t = Game.actors.find(x => x.alive && isEnemy(owner, x) && !isSub(x) && chest(x).distanceTo(l.pos) < l.r + 2);
        if (t) { const o = l.pos.clone().setY(l.pos.y + 1.5), d = chest(t).sub(o).normalize().multiplyScalar(17); emit(['pr', 'moth', owner.id, r2(o.x), r2(o.y), r2(o.z), r2(d.x), r2(d.y), r2(d.z), { d: 20, hm: 4, g: 0 }]); }
      }
    }
  }
  for (const [oid, list] of segs) {
    const owner = Game.byId.get(oid);
    for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
      const A = list[i].pos.clone().setY(list[i].pos.y + 1.2), B = list[j].pos.clone().setY(list[j].pos.y + 1.2), seg = B.clone().sub(A), L = seg.length(); if (L > 30) continue; seg.normalize();
      if (Math.random() < dt * 10) { const q = A.clone().addScaledVector(seg, Math.random() * L); Fx.spawn('add', q.x, q.y, q.z, 0, 0, 0, 3, 2, 0.6, 0.08, 0.3); }
      for (const a of Game.actors) {
        if (a.remote || !a.alive || !isEnemy(owner, a)) continue;
        const c = chest(a), u = clamp(c.clone().sub(A).dot(seg), 0, L); if (A.clone().addScaledVector(seg, u).distanceTo(c) > 0.8) continue;
        const key = a.id + list[i].id + list[j].id, last = list[i].beamHit[key] || -9; if (Game.t - last < 2) continue; list[i].beamHit[key] = Game.t;
        applyDamage(a, owner.P.beacon, oid, { fx: { reveal: 4 }, how: 'beacon' }); Fx.burst(c, 0xffd27a, 12, 3, 0.4, 0.07);
      }
    }
  }
}

// ---------------------------------------------------------------- Mire: submerge
function emerge(a) {
  const P = a.P, pw = a.pw;
  pw.state = 'up'; pw.cd = P.cd;
  const p = a.pos.clone();
  emit(['fx', 'geyser', r2(p.x), r2(p.y), r2(p.z), r2(P.radius), 0]);
  if (P.pull) for (const t of Game.actors) if (t.alive && isEnemy(a, t) && !isSub(t) && t.pos.distanceTo(p) < 8 && t.pos.distanceTo(p) > P.radius) { const d = p.clone().sub(t.pos).setY(0).normalize().multiplyScalar(9); hitActor(a, t, 0, { fx: { knock: [d.x, 3, d.z] } }); }
  for (const t of Game.actors) {
    if (!t.alive || !isEnemy(a, t) || isSub(t)) continue;
    if ((t.renderPos || t.pos).distanceTo(p) > P.radius * (P.pull ? 1.6 : 1)) continue;
    const fx = { knock: [0, P.knock, 0] }; if (P.root) fx.root = P.root + 0.8;
    hitActor(a, t, P.dmg, { fx, how: 'geyser' });
  }
  if (P.pool) emit(['zn', 'acid', r2(p.x), r2(p.y), r2(p.z), r2(3 * (P.fen ? 2.5 : 1)), P.pool, 4 * (P.fen ? 3 : 1), a.id, 1]);
  if (P.flaskRing) { a.ammo = a.H.weapon.mag; for (let i = 0; i < 6; i++) { const ang = i / 6 * TAU, d = new V3(Math.cos(ang), 0.9, Math.sin(ang)).normalize().multiplyScalar(14); emit(['pr', 'flask', a.id, r2(p.x), r2(p.y + 1.2), r2(p.z), r2(d.x), r2(d.y), r2(d.z), { d: 30, g: 14, s: 30, sr: 2.2, z: a.H.weapon.zone, fen: P.fen ? 1 : 0 }]); } }
  a.vel.y = 6; a.grounded = false;
  if (a === Game.me) View.shake(0.6);
}
function artilleryFlask(a) {
  const e = eyePos(a), d = aimDir(a.yaw, a.pitch), h = World.ray(e.x, e.y, e.z, d.x, d.y, d.z, 34, a.team);
  const q = h ? new V3(h.x, h.y, h.z) : e.clone().addScaledVector(d, 34); q.y = World.groundAt(q.x, q.z, q.y + 0.5);
  emit(['pr', 'flask', a.id, r2(q.x), r2(q.y + 0.2), r2(q.z), 0, 9, 0, { d: 30, g: 14, s: 30, sr: 2.2, z: a.H.weapon.zone, fen: a.P.fen ? 1 : 0 }]);
  Sfx.play('flask', a.pos, 0.6);
}

// ---------------------------------------------------------------- Spindle: the marionette line
function fireLine(a) {
  const P = a.P, e = eyePos(a), d = aimDir(a.yaw, a.pitch), o = muzzleStart(a, e, d), v = d.clone().multiplyScalar(P.speed);
  emit(['pr', 'line', a.id, r2(o.x), r2(o.y), r2(o.z), r2(v.x), r2(v.y), r2(v.z), { pad: P.web ? 3.5 : P.pad, rg: P.range, mu: P.web ? 99 : P.multi, web: P.web ? 1 : 0 }]);
  Sfx.play('line', a === Game.me ? null : a.pos, 0.9);
  if (a === Game.me) View.throwAnim();
}
function lineCatch(a, t) {
  if (!a) return;
  const P = a.P, tp = (t.renderPos || t.pos).clone(), my = a.pos.clone(), to = my.clone().sub(tp).setY(0), dist = to.length(); to.normalize();
  const fx = { reveal: 3 };
  if (P.vuln) fx.vuln = [1.25, P.vuln]; if (P.slow) fx.slow = [0.6, P.slow];
  if (P.web) fx.root = 2.5;
  else if (P.choke) fx.root = P.choke;
  else if (P.gallows) fx.knock = [0, 14, 0];
  else if (P.swap) { fx.tp = [r2(my.x), r2(my.y), r2(my.z)]; a.pos.copy(tp); a.vel.set(0, 0, 0); emit(['bl', a.id, r2(my.x), r2(my.y), r2(my.z), r2(tp.x), r2(tp.y), r2(tp.z), 0]); }
  else if (P.meet) { const s = Math.min(22, dist * 1.4) * 0.5; fx.knock = [to.x * s, 5, to.z * s]; a.vel.set(-to.x * s, 5, -to.z * s); a.grounded = false; a.knockT = 0.5; later(0.35, () => { if (t.alive && a.alive && a.pos.distanceTo(t.renderPos || t.pos) < 4.5) { hitActor(a, t, 100, { how: 'line' }); emit(['fx', 'ram', r2(t.pos.x), r2(t.pos.y + 1), r2(t.pos.z), 0, 0]); } }); }
  else { const s = Math.min(24, dist * 1.5); fx.knock = [to.x * s, 4.5, to.z * s]; }
  if (P.stun && !P.web && !P.choke) fx.stun = 0.45 + P.stun;
  if (P.puppet) fx.charm = P.puppet;
  hitActor(a, t, P.dmg, { fx, how: 'line' });
  emit(['fx', 'catch', r2(tp.x), r2(tp.y + 1.1), r2(tp.z), 0, 0]);
}

// ---------------------------------------------------------------- utilities and ultimates
function useUtil(a) {
  const U = a.H.util; a.utilT = U.cd;
  const at = a === Game.me ? null : a.pos, here = [r2(a.pos.x), r2(a.pos.y + 1), r2(a.pos.z)];
  if (U.key === 'heal') { a.st.heal = { rate: 110 / 3, t: 3 }; Sfx.play('heal', at); emit(['fx', 'heal', ...here, 0, 0]); }
  else if (U.key === 'dash') {
    const I = a.input, fwd = flatFwd(a.yaw), right = new V3(-fwd.z, 0, fwd.x), d = new V3().addScaledVector(fwd, I.fwd).addScaledVector(right, I.side);
    if (d.lengthSq() < 0.01) d.copy(fwd); d.normalize();
    a.vel.x = d.x * 40; a.vel.z = d.z * 40; a.vel.y = Math.max(a.vel.y, 1.5); a.dashT = 0.22;
    Sfx.play('dash', at); emit(['fx', 'dash', ...here, 0, 0]);
  } else if (U.key === 'wall') {
    const f = flatFwd(a.yaw), p = a.pos.clone().addScaledVector(f, 2.2); p.y = World.groundAt(p.x, p.z, a.pos.y + 0.6);
    emit(['wl', a.id + '#w' + Math.floor(Game.t * 10), a.team, r2(p.x), r2(p.y), r2(p.z), r2(a.yaw), a.id]);
  } else if (U.key === 'scry') {
    const d = flatFwd(a.yaw); let n = 0;
    for (const t of Game.actors) { if (!t.alive || !isEnemy(a, t)) continue; const rel = t.pos.clone().sub(a.pos), dist = rel.length(); rel.y = 0; rel.normalize(); if (dist < 40 && rel.dot(d) > Math.cos(Math.PI / 8)) { hitActor(a, t, 0, { fx: { reveal: 4 }, subOk: true }); n++; } }
    Sfx.play('scry', at); emit(['fx', 'scry', ...here, r2(a.yaw), 0]);
    if (a === Game.me) HUD.note(n ? `Scry: ${n} enem${n > 1 ? 'ies' : 'y'} revealed` : 'Scry: nothing there');
  } else if (U.key === 'leap') {
    const f = flatFwd(a.yaw); a.vel.y = 11.5; a.vel.x += f.x * 5; a.vel.z += f.z * 5; a.grounded = false; a.leapT = 1.2;
    Sfx.play('leap', at); emit(['fx', 'leap', r2(a.pos.x), r2(a.pos.y), r2(a.pos.z), 0, 0]);
  } else if (U.key === 'shell') { a.st.shield = { hp: 100, t: 4 }; Sfx.play('wall', at); emit(['fx', 'shell', ...here, 0, 0]); }
  else if (U.key === 'haste') { a.st.swift = 3; if (a.H.weapon.mag) { a.ammo = a.H.weapon.mag; a.reloadT = 0; } Sfx.play('dash', at); emit(['fx', 'dash', ...here, 0, 0]); }
  else if (U.key === 'leech') { a.st.leech = { t: 3, acc: 0 }; Sfx.play('leech', at); emit(['fx', 'leech', ...here, 7, 0]); }
  else if (U.key === 'grapple') {
    const e = eyePos(a), d = aimDir(a.yaw, a.pitch), h = World.ray(e.x, e.y, e.z, d.x, d.y, d.z, 28, -9);
    if (!h) { a.utilT = 0.5; if (a === Game.me) HUD.note('Nothing to hook onto'); return; }
    a.grapple = { p: new V3(h.x, h.y, h.z).addScaledVector(new V3(h.nx, h.ny, h.nz), 0.6), t: 1.6 }; a.dashT = 0;
    Sfx.play('line', at); emit(['fx', 'grapple', r2(e.x), r2(e.y), r2(e.z), r2(h.x), r2(h.z)]);
  }
}
function leechTick(a, dt) {
  const L = a.st.leech; L.t -= dt; L.acc += dt;
  if (L.acc >= 0.25) {
    for (const t of Game.actors) if (t.alive && isEnemy(a, t) && !isSub(t) && t.pos.distanceTo(a.pos) < 7 && World.clear(a.pos.x, a.pos.y + 1.2, a.pos.z, t.pos.x, t.pos.y + 1.2, t.pos.z)) { hitActor(a, t, 15 * L.acc, { how: 'leech' }); a.hp = Math.min(a.maxHp, a.hp + 15 * L.acc); if (Math.random() < 0.5) Fx.tracer(chest(t), chest(a), 0x9aff5a, 0.04, 0.2, 3); }
    L.acc = 0;
  }
  if (L.t <= 0) a.st.leech = null;
}
// ---------------------------------------------------------------- Rewind
function rewindPoint(a) {
  const pw = a.pw, P = a.P;
  if (P.anchor) return pw.anchor;
  if (!pw.hist.length) return null;
  const want = Game.t - P.back; let best = pw.hist[0];
  for (const h of pw.hist) { if (h.t <= want) best = h; else break; }
  return best;
}
function doRewind(a, to, saved) {
  const P = a.P, pw = a.pw, from = a.pos.clone(), at = a === Game.me ? null : a.pos;
  pw.charges--; pw.anchor = null;
  a.pos.set(to.x, to.y, to.z); a.vel.set(0, 0, 0); a.grapple = null; a.dashT = 0; a.knockT = 0;
  if (P.heal) a.hp = Math.max(a.hp, Math.min(a.maxHp, to.hp));
  if (P.bonus) a.hp = Math.min(a.maxHp, a.hp + P.bonus);
  if (P.anchor) a.ammo = Math.max(a.ammo, to.ammo | 0);
  if (P.reload && a.H.weapon.mag) { a.ammo = a.H.weapon.mag; a.reloadT = 0; }
  if (P.cleanse) { const st = a.st; st.root = 0; st.slows = []; st.dots = []; st.blind = 0; st.vulnT = 0; }
  if (saved) a.spawnProt = Math.max(a.spawnProt, 0.6);
  if (P.decoy) spawnDecoy(a, from, a.yaw, P.decoy);
  const fp = [r2(from.x), r2(from.y), r2(from.z)];
  if (P.depart) later(0.35, () => { emit(['fx', 'boom', fp[0], fp[1] + 1, fp[2], P.departR, 0xa8e8ff]); for (const t of Game.actors) if (t.alive && isEnemy(a, t) && t.pos.distanceTo(from) < P.departR) hitActor(a, t, P.depart, { how: 'rewind', fx: { knock: [0, 5, 0] } }); });
  if (P.sand) for (const t of Game.actors) if (t.alive && isEnemy(a, t) && t.pos.distanceTo(from) < 5) hitActor(a, t, 0, { fx: { slow: [0.5, P.sand] }, how: 'rewind' });
  if (P.arrive) { for (const t of Game.actors) if (t.alive && isEnemy(a, t) && t.pos.distanceTo(a.pos) < P.arriveR) hitActor(a, t, P.arrive, { how: 'rewind' }); emit(['fx', 'pulse', r2(a.pos.x), r2(a.pos.y), r2(a.pos.z), P.arriveR, 0]); }
  if (P.freeze) { for (const t of Game.actors) if (t.alive && isEnemy(a, t) && !isSub(t) && t.pos.distanceTo(a.pos) < P.freezeR && World.clear(a.pos.x, a.pos.y + 1.2, a.pos.z, t.pos.x, t.pos.y + 1.2, t.pos.z)) hitActor(a, t, 0, { fx: { stun: P.freeze }, how: 'stop' }); emit(['fx', 'stop', r2(a.pos.x), r2(a.pos.y + 1), r2(a.pos.z), P.freezeR, 0]); }
  if (P.retro && a.lastDealt && Game.t - (a.lastDealtT || 0) < P.back + 1) {
    const t = Game.byId.get(a.lastDealt), snap = pw.ehist.find(e => e.t >= to.t - 0.05);
    if (t && t.alive && snap && snap.p[t.id]) { const q = snap.p[t.id], tp = t.renderPos || t.pos; emit(['fx', 'rewind', r2(tp.x), r2(tp.y + 1), r2(tp.z), r2(q[0]), r2(q[2])]); hitActor(a, t, 0, { fx: { tp: [q[0], q[1], q[2]], slow: [0.7, 1] }, how: 'rewind' }); }
  }
  if (!P.silent || a === Game.me) Sfx.play('rewind', at, 1);
  if (!P.silent) emit(['fx', 'rewind', fp[0], fp[1] + 1, fp[2], r2(a.pos.x), r2(a.pos.z)]);
  if (a === Game.me) { View.blink(); View.throwAnim(); if (saved) HUD.note('Paradox — not yet', 'big'); }
}
function useUlt(a) {
  const K = a.H.ult.key; a.ult = 0;
  Sfx.play('ult', a === Game.me ? null : a.pos, 1);
  emit(['fx', 'ult', r2(a.pos.x), r2(a.pos.y + 1), r2(a.pos.z), K, a.id]);
  if (K === 'field') { emit(['rv', a.team, 8, a.id]); if (!a.P.auto) a.pw.charges = a.P.carry; emit(['fb', a.id, 8]); }
  else if (K === 'unbound') { a.st.unbound = 8; a.pw.charges = a.P.charges; a.st.fatigue = 0; }
  else if (K === 'slam') {
    for (const t of Game.actors) if (t.alive && isEnemy(a, t) && !isSub(t) && t.pos.distanceTo(a.pos) < 9 && World.clear(a.pos.x, a.pos.y + 1, a.pos.z, t.pos.x, t.pos.y + 1, t.pos.z)) { const k = t.pos.clone().sub(a.pos).setY(0).normalize().multiplyScalar(5); hitActor(a, t, 150, { fx: { stun: 1.5, knock: [k.x, 8, k.z] }, how: 'slam' }); }
    emit(['fx', 'slam', r2(a.pos.x), r2(a.pos.y), r2(a.pos.z), 9, 0]); if (a === Game.me) View.shake(1.4);
  } else if (K === 'night') { a.st.night = 9; if (a.pw.state !== 'vis' && !a.P.perma) a.pw.state = 'vis'; }
  else if (K === 'storm') { for (let i = 0; i < 9; i++) throwGlaive(a, 1, (i - 4) * 0.16, true); }
  else if (K === 'flare') {
    for (const l of Game.lanterns.values()) if (l.owner === a.id) {
      emit(['fx', 'flare', r2(l.pos.x), r2(l.pos.y + 1.2), r2(l.pos.z), r2(l.r), 0]);
      for (const t of Game.actors) if (t.alive && isEnemy(a, t) && !isSub(t) && chest(t).distanceTo(l.pos) < l.r + 0.5 && World.clear(l.pos.x, l.pos.y + 1.2, l.pos.z, t.pos.x, t.pos.y + 1.2, t.pos.z)) hitActor(a, t, 80, { fx: { blind: 2.5 }, how: 'flare' });
    }
  } else if (K === 'tide') emit(['zn', 'bog', r2(a.pos.x), r2(a.pos.y), r2(a.pos.z), 8, 35, 6, a.id, 0.6]);
  else if (K === 'stop') {
    for (const t of Game.actors) if (t.alive && isEnemy(a, t) && !isSub(t) && t.pos.distanceTo(a.pos) < 20 && World.clear(a.pos.x, a.pos.y + 1.4, a.pos.z, t.pos.x, t.pos.y + 1.2, t.pos.z)) hitActor(a, t, 0, { fx: { stun: 2.5, vuln: [1.25, 4] }, how: 'stop' });
    emit(['fx', 'stop', r2(a.pos.x), r2(a.pos.y + 1), r2(a.pos.z), 20, 0]);
  }
  else if (K === 'cradle') {
    for (const t of Game.actors) if (t.alive && isEnemy(a, t) && !isSub(t) && t.pos.distanceTo(a.pos) < 22 && World.clear(a.pos.x, a.pos.y + 1.4, a.pos.z, t.pos.x, t.pos.y + 1.2, t.pos.z)) { hitActor(a, t, 40, { fx: { root: 2.2 }, how: 'cradle' }); emit(['fx', 'thread', r2(a.pos.x), r2(a.pos.y + 1.4), r2(a.pos.z), r2(t.pos.x), r2(t.pos.z)]); }
  }
}

// ---------------------------------------------------------------- zones: fire trails, acid pools, the bog
function addZone(kind, p, r, dps, t, ownerId, slow) {
  const owner = Game.byId.get(ownerId);
  const z = { kind, pos: p.clone(), r: +r || 2, dps: +dps || 0, t: +t || 3, life: +t || 3, owner: ownerId, team: owner ? owner.team : -1, slow: slow || 1, acc: {}, mesh: buildZoneDisk(kind, +r || 2) };
  z.mesh.position.set(p.x, p.y + 0.03, p.z); G.scene.add(z.mesh); Game.zones.push(z);
  if (kind === 'bog') Sfx.play('bog', p);
}
function zoneTick(dt) {
  for (let i = Game.zones.length - 1; i >= 0; i--) {
    const z = Game.zones[i]; z.t -= dt;
    if (z.t <= 0) { G.scene.remove(z.mesh); Game.zones.splice(i, 1); continue; }
    const fade = Math.min(1, z.t / 0.6, (z.life - z.t) / 0.25 + 0.2); z.mesh.material.opacity = (z.kind === 'fire' ? 0.5 : 0.62) * fade;
    const col = z.kind === 'fire' ? [4, 1.4, 0.3] : [0.9, 3, 0.5];
    if (Math.random() < dt * z.r * (z.kind === 'fire' ? 8 : 3)) { const an = Math.random() * TAU, rr = Math.sqrt(Math.random()) * z.r; Fx.spawn('add', z.pos.x + Math.cos(an) * rr, z.pos.y + 0.1, z.pos.z + Math.sin(an) * rr, 0, z.kind === 'fire' ? rand(1, 2.5) : rand(0.2, 0.8), 0, col[0], col[1], col[2], z.kind === 'fire' ? rand(0.1, 0.2) : rand(0.05, 0.12), 0.6, 0.5, -0.3); }
    const owner = Game.byId.get(z.owner);
    for (const a of Game.actors) {
      if (a.remote || !a.alive || isSub(a)) continue;
      if ((a.pos.x - z.pos.x) ** 2 + (a.pos.z - z.pos.z) ** 2 >= z.r * z.r || Math.abs(a.pos.y - z.pos.y) >= 1.2) continue;
      if (owner && a === owner && owner.P.fen && z.kind !== 'fire') { a.hp = Math.min(a.maxHp, a.hp + 20 * dt); continue; }
      if (!owner || !isEnemy(owner, a)) continue;
      if (z.slow < 1) applyFx(a, { slow: [z.slow, 0.3] });
      z.acc[a.id] = (z.acc[a.id] || 0) + z.dps * dt;
      if (z.acc[a.id] >= 6) { applyDamage(a, z.acc[a.id], z.owner, { how: z.kind === 'fire' ? 'burn' : 'acid' }); z.acc[a.id] = 0; }
    }
  }
}

// ---------------------------------------------------------------- walls, named effects, deaths
function placeWall(id, team, pos, yaw, ownerId) {
  if (Game.walls.has(id)) return;
  const owner = Game.byId.get(ownerId), col = Game.me && owner && isEnemy(Game.me, owner) ? ENEMY_HEX : TEAM_HEX[0];
  const mesh = buildWall(col); mesh.position.copy(pos); mesh.rotation.y = yaw; G.scene.add(mesh);
  const w = { id, team: owner ? owner.team : team, x: pos.x, y: pos.y, z: pos.z, yaw, w: 5, h: 3, hp: 600, t: 7, mesh, owner: ownerId };
  Game.walls.set(id, w); World.walls.push(w);
  Sfx.play('wall', pos); Fx.ring(pos, 3, col, 0.5, 4, 0.1);
}
function damageWall(w, d) { w.hp -= d; w.hitT = 0.15; Sfx.play('wallHit', new V3(w.x, w.y + 1.5, w.z), 0.5); if (w.hp <= 0) removeWall(w); }
function removeWall(w) { G.scene.remove(w.mesh); Game.walls.delete(w.id); const i = World.walls.indexOf(w); if (i >= 0) World.walls.splice(i, 1); Fx.burst(new V3(w.x, w.y + 1.5, w.z), 0x7ad8ff, 30, 4, 0.6, 0.1); }
function wallTick(dt) {
  for (const w of [...Game.walls.values()]) {
    w.t -= dt; if (w.t <= 0) { removeWall(w); continue; }
    const U = w.mesh.userData, f = Math.min(1, w.t * 2) * (w.hitT > 0 ? 1.8 : 1); w.hitT = Math.max(0, (w.hitT || 0) - dt);
    U.panel.material.opacity = 0.32 * f * (0.5 + 0.5 * w.hp / 600); U.hex.material.opacity = 0.5 * f; U.hex.material.map.offset.y = G.time * 0.1;
  }
}
function decoyTick(dt) {
  for (let i = Game.decoys.length - 1; i >= 0; i--) {
    const d = Game.decoys[i]; d.t -= dt;
    if (d.t <= 0) { G.scene.remove(d.m.root); Game.decoys.splice(i, 1); Fx.burst(d.pos.clone().setY(d.pos.y + 1), 0xb48aff, 16, 3, 0.5, 0.08); }
  }
}
function timerTick(dt) { for (let i = Game.timers.length - 1; i >= 0; i--) { const t = Game.timers[i]; t.t -= dt; if (t.t <= 0) { Game.timers.splice(i, 1); try { t.fn(); } catch (e) { /* skip */ } } } }
function namedFx(name, p, a, b) {
  if (name === 'boom') { Fx.explosion(p, a || 3, b || 0xff8a3a); Sfx.play('boom', p); }
  else if (name === 'pulse') { Fx.ring(p, a || 4, 0xff8a3a, 0.5, 5, 0.1); Fx.burst(p.clone().setY(p.y + 0.3), 0xffa050, 12, 4, 0.4, 0.06); }
  else if (name === 'seam') { Fx.ring(p.clone().setY(p.y - 0.75), a || 3, 0xb48aff, 0.45, 5); Fx.sphere(p, a || 3, 0xb48aff, 0.25, 2); }
  else if (name === 'rift') { Fx.sphere(p, 0.8, 0xb48aff, 1.0, 3); Fx.burst(p, 0xb48aff, 20, 1, 1, 0.08, { k: 3 }); }
  else if (name === 'riftpop') { Fx.explosion(p, a || 3.5, 0xb48aff); Sfx.play('blink', p, 0.8); }
  else if (name === 'ram') { Fx.burst(p, 0xffc070, 24, 8, 0.4, 0.07, { grav: 12, k: 5 }); Sfx.play('ramHit', p); }
  else if (name === 'crash') { Fx.burst(p, 0xffc070, 30, 9, 0.5, 0.08, { grav: 12, k: 5 }); Fx.puff(p, 0x6a6058, 10, 0.8, 1.4); Sfx.play('crash', p); if (a) Fx.ring(p.clone().setY(p.y - 1), a, 0xff7a2e, 0.5, 5); }
  else if (name === 'bloom') { Fx.sphere(p, a || 7, 0x6a2aff, 0.5, 1.2); Fx.burst(p, 0x8a4aff, 40, 8, 0.6, 0.12, { k: 2 }); }
  else if (name === 'heal') Fx.burst(p, 0x74ffb4, 16, 1.5, 1.0, 0.08, { up: 1.5, k: 3 });
  else if (name === 'dash') Fx.burst(p, 0xb48aff, 14, 3, 0.4, 0.08, { k: 3 });
  else if (name === 'scry') Fx.ring(p.clone().setY(p.y - 1.3), 14, 0xc06aff, 0.8, 3);
  else if (name === 'leap') { Fx.ring(p, 2.5, 0x5affd2, 0.5, 4, 0.1); Fx.puff(p, 0x8a8a80, 8, 0.6, 1); }
  else if (name === 'slam') { Fx.ring(p, a || 9, 0xff7a2e, 0.7, 6, 0.1); Fx.ring(p, (a || 9) * 0.6, 0xffd08a, 0.5, 6, 0.15); Fx.burst(p.clone().setY(p.y + 0.3), 0xffa050, 60, 10, 0.6, 0.1, { grav: 10, k: 4 }); Fx.puff(p, 0x6a6058, 16, 1.2, 1.6); Sfx.play('slam', p); muzzleLight(p.clone().setY(p.y + 1), 0xff7a2e, 16); }
  else if (name === 'ult') { const who = Game.byId.get(b); if (who && who !== Game.me) Fx.sphere(p, 1.5, who.H.look.glow, 0.4, 2); if (who && Game.me && isEnemy(Game.me, who)) HUD.note(`${who.name} used ${who.H.ult.name}`, 'warn'); }
  else if (name === 'sink') { Fx.ring(p, 2, 0x9aff5a, 0.6, 3, 0.05); Fx.burst(p.clone().setY(p.y + 0.2), 0x6a8a4a, 20, 3, 0.6, 0.12, { up: 2, grav: 8, k: 1.5 }); }
  else if (name === 'geyser') { Fx.ring(p, a || 3.5, 0x9aff5a, 0.6, 5, 0.05); for (let i = 0; i < 60; i++) Fx.spawn('add', p.x + rand(-1, 1), p.y + 0.2, p.z + rand(-1, 1), rand(-2, 2), rand(6, 14), rand(-2, 2), 0.8, 2.6, 0.6, rand(0.08, 0.18), rand(0.6, 1.1), 0.5, 14); Fx.puff(p, 0x4a5a3a, 12, 1, 1.4); Sfx.play('geyser', p); }
  else if (name === 'stitch') { Fx.ring(p.clone().setY(p.y - 1), 1.2, 0xff5a7a, 0.4, 5); Sfx.play('snareSnap', p, 0.6); }
  else if (name === 'catch') { Fx.burst(p, 0xff5a7a, 18, 4, 0.4, 0.07, { k: 4 }); Sfx.play('catch', p); }
  else if (name === 'shell') Fx.sphere(p, 1.3, 0xffd27a, 0.6, 1.5);
  else if (name === 'leech') Fx.ring(p.clone().setY(p.y - 1), a || 7, 0x9aff5a, 0.8, 3);
  else if (name === 'flare') { Fx.sphere(p, a || 6, 0xffe0a0, 0.5, 4); Fx.burst(p, 0xffd27a, 50, 8, 0.6, 0.1, { k: 4 }); Sfx.play('boom', p, 0.7); muzzleLight(p, 0xffd27a, 18); }
  else if (name === 'grapple') Fx.tracer(p, new V3(a, World.groundAt(a, b, p.y + 30), b).setY(Math.max(p.y, World.groundAt(a, b, p.y + 30))), 0xff5a7a, 0.02, 0.5, 3);
  else if (name === 'rewind') { const to = new V3(a, World.groundAt(a, b, p.y + 2) + 1, b); for (let i = 0; i <= 16; i++) { const q = p.clone().lerp(to, i / 16); Fx.spawn('add', q.x + rand(-0.2, 0.2), q.y + rand(-0.5, 0.5), q.z + rand(-0.2, 0.2), 0, 0.3, 0, 1.2, 2.4, 3, 0.09, 0.5 + i * 0.03); } Fx.ring(p.clone().setY(p.y - 0.9), 1.4, 0xa8e8ff, 0.4, 4); Fx.ring(to.clone().setY(to.y - 0.9), 1.4, 0xa8e8ff, 0.4, 4); }
  else if (name === 'stop') { Fx.sphere(p, a || 8, 0xa8e8ff, 0.6, 1.2); Fx.ring(p.clone().setY(p.y - 0.9), a || 8, 0xa8e8ff, 0.9, 3); Sfx.play('stop', p); muzzleLight(p, 0xa8e8ff, 14); }
  else if (name === 'anchor') { Fx.ring(p, 1.6, 0xa8e8ff, 0.8, 2); Fx.burst(p.clone().setY(p.y + 0.5), 0xa8e8ff, 16, 2, 0.6, 0.07); }
  else if (name === 'thread') Fx.tracer(p, new V3(a, World.groundAt(a, b, 99) + 1.2, b), 0xff5a7a, 0.02, 0.6, 3);
}
function deathFx(a) {
  const p = (a.renderPos || a.pos).clone(); p.y += 1;
  Fx.burst(p, a.H.look.glow, 30, 4, 0.8, 0.1, { up: 1, k: 3 });
  Sfx.play('die', a === Game.me ? null : a.pos, 0.8);
  a.anim.death = 0.0001;
}

// ---------------------------------------------------------------- per-frame bookkeeping shared by every copy
function worldTick(dt) { projTick(dt); snareTick(dt); lanternTick(dt); wallTick(dt); zoneTick(dt); decoyTick(dt); timerTick(dt); }
function actorFlags(a) {
  let f = 0; const s = a.st, pw = a.pw, P = a.P;
  if (a.alive) f |= F_ALIVE; if (a.grounded) f |= F_GROUND; if (s.reveal > 0) f |= F_REVEAL; if (s.root > 0) f |= F_ROOT; if (s.stun > 0) f |= F_STUN;
  if (P.key === 'fade') { if (pw.state === 'cloaked') f |= F_CLOAK; if (pw.state === 'going' || pw.state === 'coming') f |= F_FADING; }
  if (P.key === 'ram') { if (pw.state === 'charge') f |= F_CHARGE; if (pw.state === 'rev') f |= F_REV; }
  if (P.key === 'glaive' && pw.winding) f |= F_WIND; if (P.key === 'glaive' && P.orbit && pw.count) f |= F_ORBIT;
  if (P.key === 'blink' && pw.charging) f |= F_BLINKCH;
  if (P.key === 'sub' && pw.state !== 'up') f |= F_SUB;
  if (P.key === 'lantern' && pw.chan > 0) f |= F_CHANNEL;
  if ((P.key === 'snare' || P.key === 'lantern') && pw.placing > 0) f |= F_PLACE;
  if (s.fatigue > 0) f |= F_FATIGUE; if (s.night > 0) f |= F_NIGHT; if (s.unbound > 0) f |= F_UNBOUND; if (s.heal || s.leech) f |= F_HEAL; if (s.slows && s.slows.length) f |= F_SLOW;
  if (a.spawnProt > 0) f |= F_PROT; if (s.shield) f |= F_SHIELD;
  if (a.fireOn && a.H.weapon.kind === 'flame') f |= F_FLAME; if (a.fireOn && a.H.weapon.kind === 'beam' && a.beamT) f |= F_BEAM;
  if (a.swingT > 0) f |= F_SLASH;
  return f;
}
function cloakLevel(a) {
  if (a.st.night > 0) return a.st.nightFlash > 0 ? 0.2 : 1;
  if (a.P.key !== 'fade') return 0;
  const pw = a.pw, P = a.P;
  if (pw.state === 'cloaked') return 1;
  if (pw.state === 'going') return 1 - pw.t / P.fadeIn;
  if (pw.state === 'coming') return pw.t / P.fadeOut;
  if (P.perma && pw.state === 'vis') return pw.t < 0.4 ? 1 - pw.t / 0.4 : 0;
  return 0;
}
