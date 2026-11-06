'use strict';
// ============================================================================
// The match protocol on top of the room. Every copy publishes one presence object: who it is, its hero and
// add-ons, its hero's state, and a rolling log of events. The host (earliest to join) also publishes the bots
// and the match itself (mode, map, scores, clock, zone, rounds).
// ============================================================================
const NET_V = 3;
const Net = {
  room: null, chan: null, code: null, uid: 'p' + Math.random().toString(36).slice(2, 8), jt: null, joinT: 0, status: 'idle', open: [],
  seq: 0, ring: [], lastSend: 0, peers: new Map(), hostUid: null, lastAdv: null, team: 0, ready: false, _seen: new Set(), _conn: null,
  online() { return !!this.chan; },
  isHost() { return !this.chan || this.hostUid === this.uid; },
  push(ev) {
    if (!this.chan) return;
    const e = [++this.seq].concat(ev); this.ring.push(e);
    if (this.ring.length > 48) this.ring.shift();
  },
  async connect() {
    if (this.status === 'on') return true;
    if (this._conn) return this._conn;
    if (!P2P.ok()) { this.status = 'off'; return false; }
    this.status = 'checking'; UI.netState();
    return this._conn = (async () => {
      const room = await P2P.room().catch(() => null);
      if (room) {
        this.room = room; this.status = 'on';
        room.onConnection(ok => { this.connected = ok; UI.netState(); });
        room.onPeers(ch => this.browse(ch.peers));
      } else { this.status = 'idle'; UI.toast('Could not reach the matchmaking servers. Check your connection and try again — vs Bots always works.'); }
      this._conn = null; UI.netState();
      return this.status === 'on';
    })();
  },
  browse(peers) {
    const by = new Map();
    for (const p of peers) { const l = p.presence && p.presence.lob; if (l && typeof l.c === 'string' && /^[A-Z]{4}$/.test(l.c)) by.set(l.c, { c: l.c, n: cleanName(l.n), k: clamp(l.k | 0, 1, 16), st: l.st === 'play' ? 'play' : 'lobby', mo: MODES[l.mo] ? l.mo : 'tdm', mp: MAPS[l.mp] ? l.mp : 'kiln' }); }
    this.open = [...by.values()]; UI.openList();
  },
  async join(code, create) {
    if (!this.room) return false;
    this.code = code; this.jt = create ? Date.now() : null; this.joinT = now(); this.peers.clear(); this.ring = []; this.hostUid = create ? this.uid : null; this.lastAdv = null;
    let chan;
    try { chan = await Promise.race([this.room.join('m-' + code.toLowerCase()), new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 7000))]); }
    catch (e) { return false; }
    if (this.code !== code) { chan.leave(); return false; }
    this.chan = chan; this.lastSend = 0;
    return true;
  },
  leave() {
    const ch = this.chan; this.chan = null;
    try { if (ch) ch.leave(); if (this.room && this.lastAdv) this.room.presence({ lob: null }); } catch (e) { /* gone */ }
    this.code = null; this.peers.clear(); this.hostUid = null; this.ring = []; this.lastAdv = null; this.jt = null;
  },
  send(t) {
    if (!this.chan || t - this.lastSend < 0.05) return; this.lastSend = t;
    const me = Game.me, live = Game.state === 'play';
    const heroKey = me ? (me.pendingHero ? me.pendingHero.h : me.heroKey) : Settings.hero, ad = me ? (me.pendingHero ? me.pendingHero.a : me.addons) : loadoutFor(Settings.hero);
    const o = { c: this.code, u: this.uid, v: NET_V, n: Settings.name, jt: this.jt, t: this.team, h: HERO_KEYS.indexOf(heroKey), ad, e: this.ring.slice(), s: null, b: null, m: null };
    if (me && live) o.s = packState(me);
    if (this.isHost()) {
      o.m = Mode.pack();
      if (live) { o.b = []; for (const a of Game.actors) if (a.isBot && !a.remote) o.b.push([+a.id.slice(1), a.team, a.nameIdx | 0].concat(packState(a))); }
    }
    let s = JSON.stringify(o);
    while (s.length > 14000 && o.e.length > 8) { o.e = o.e.slice(4); s = JSON.stringify(o); }
    this.chan.presence(o);
    if (this.room) {
      if (this.isHost()) {
        const M = Game.match || Lobby.cfg, adv = [this.code, Settings.name, this.count(), M.st, M.mode].join('|');
        if (adv !== this.lastAdv) { this.lastAdv = adv; this.room.presence({ lob: { c: this.code, n: Settings.name, k: this.count(), st: Game.state === 'play' ? 'play' : 'lobby', mo: M.mode, mp: M.map } }); }
      } else if (this.lastAdv) { this.lastAdv = null; this.room.presence({ lob: null }); }
    }
  },
  count() { return this.peers.size + 1; },
  poll(t) {
    if (!this.chan) return;
    let peers; try { peers = this.chan.peers(); } catch (e) { return; }
    const seen = this._seen; seen.clear();
    for (const p of peers) {
      const pr = p.presence;
      if (!pr || pr.c !== this.code || typeof pr.u !== 'string' || pr.u === this.uid || pr.u.length > 12) continue;
      seen.add(pr.u);
      let st = this.peers.get(pr.u);
      if (!st) { st = { uid: pr.u, last: null, lastSeq: -1, first: true, actor: null, name: 'Player', team: 0, hero: 'marrow', ad: [], jt: null, m: null, v: 0 }; this.peers.set(pr.u, st); UI.lobbyDirty = true; }
      if (st.last !== pr) { st.last = pr; try { this.ingest(st, pr, t); } catch (e) { console.warn('ingest', e); } }
    }
    for (const [uid, st] of this.peers) if (!seen.has(uid)) {
      if (st.actor) { removeActor(st.actor); st.actor = null; }
      this.peers.delete(uid); UI.lobbyDirty = true; if (Game.state === 'play') HUD.note(st.name + ' left');
    }
    // joiners wait a moment to learn who is already here, then take a join stamp after everyone else's
    if (this.jt === null && t - this.joinT > (this.peers.size ? 2.4 : 9)) { let mx = 0; for (const st of this.peers.values()) if (typeof st.jt === 'number') mx = Math.max(mx, st.jt); this.jt = Math.max(Date.now(), mx + 1); }
    let h = null, hj = Infinity;
    if (this.jt !== null) { h = this.uid; hj = this.jt; }
    for (const st of this.peers.values()) if (typeof st.jt === 'number' && (st.jt < hj || (st.jt === hj && st.uid < h))) { h = st.uid; hj = st.jt; }
    if (h !== this.hostUid) { const prev = this.hostUid; this.hostUid = h; Flow.hostChanged(prev, h); }
    if (!this.isHost()) for (let i = Game.actors.length - 1; i >= 0; i--) { const a = Game.actors[i]; if (a.isBot && a.remote && a.owner !== this.hostUid && t - (a.ownT || 0) > 1.5) removeActor(a); }
    if (!this.isHost()) { const hm = this.hostM(); if (hm) Flow.hostMeta(hm); }
  },
  hostM() { const st = this.peers.get(this.hostUid); return st ? st.m : null; },
  ingest(st, pr, t) {
    const name = cleanName(pr.n), team = clamp(pr.t | 0, 0, 15), hero = HERO_KEYS[pr.h] || 'marrow', ad = cleanAddons(pr.ad);
    if (name !== st.name || team !== st.team || hero !== st.hero || JSON.stringify(ad) !== JSON.stringify(st.ad)) UI.lobbyDirty = true;
    st.name = name; st.team = team; st.hero = hero; st.ad = ad; st.jt = Number.isFinite(pr.jt) ? pr.jt : null; st.v = pr.v | 0;
    st.m = pr.m && typeof pr.m === 'object' ? pr.m : null;
    const live = Game.state === 'play', s = pr.s;
    if (live && Array.isArray(s) && s.length >= 16) {
      const hk = HERO_KEYS[s[11]] || hero, sad = cleanAddons([s[14], s[15]].filter(x => x >= 0));
      let a = st.actor;
      if (!a) { a = st.actor = addActor({ id: st.uid, name, team, hero: hk, addons: sad, remote: true }); a.owner = st.uid; if (Game.match && Game.match.st === 'play') HUD.note(name + ' joined'); }
      if (a.heroKey !== hk || a.team !== team || JSON.stringify(a.addons) !== JSON.stringify(sad)) { a.team = team; setHero(a, hk, sad); }
      a.name = name; unpackState(a, s, 0, t);
    } else if (st.actor && !Array.isArray(s)) { removeActor(st.actor); st.actor = null; }
    if (live && Array.isArray(pr.b) && st.uid === this.hostUid && !this.isHost()) {
      const ids = new Set();
      for (const b of pr.b) {
        if (!Array.isArray(b) || b.length < 19) continue;
        const id = 'b' + (b[0] | 0), tm = clamp(b[1] | 0, 0, 15), hk = HERO_KEYS[b[3 + 11]] || 'marrow', sad = cleanAddons([b[3 + 14], b[3 + 15]].filter(x => x >= 0)); ids.add(id);
        let a = Game.byId.get(id);
        if (a && !a.remote) { removeActor(a); a = null; }
        if (!a) a = addActor({ id, name: BOT_NAMES[(b[2] | 0) % BOT_NAMES.length], team: tm, hero: hk, addons: sad, bot: true, remote: true, nameIdx: b[2] | 0 });
        if (a.heroKey !== hk || a.team !== tm || JSON.stringify(a.addons) !== JSON.stringify(sad)) { a.team = tm; setHero(a, hk, sad); }
        a.owner = st.uid; a.ownT = t; unpackState(a, b, 3, t);
      }
      for (let i = Game.actors.length - 1; i >= 0; i--) { const a = Game.actors[i]; if (a.isBot && a.remote && !ids.has(a.id)) removeActor(a); }
    }
    // events newer than what we've handled from this sender
    const evs = [];
    if (Array.isArray(pr.e)) for (const ev of pr.e) if (Array.isArray(ev) && typeof ev[0] === 'number' && typeof ev[1] === 'string' && ev[0] > st.lastSeq && ev.length <= 14) evs.push(ev);
    if (st.first) { st.first = false; for (const ev of evs) st.lastSeq = Math.max(st.lastSeq, ev[0]); return; }
    evs.sort((a, b) => a[0] - b[0]);
    for (const ev of evs) {
      st.lastSeq = ev[0];
      if (!live) continue;
      const body = ev.slice(1);
      if (!body.every(v => typeof v === 'number' ? Number.isFinite(v) : typeof v === 'string' ? v.length < 48 : typeof v === 'object')) continue;
      try { onEvent(body, true, st.uid); } catch (e) { /* skip a bad event */ }
    }
  },
};
function cleanName(n) { n = (typeof n === 'string' ? n : '').replace(/[^\p{L}\p{N} _\-.]/gu, '').trim().slice(0, 14); return n || 'Player'; }
function cleanAddons(a) { if (!Array.isArray(a)) return []; const o = []; for (const x of a) if (Number.isInteger(x) && x >= 0 && x < 12 && !o.includes(x)) o.push(x); return o.slice(0, 2); }
function packState(a) {
  return [r2(a.pos.x), r2(a.pos.y), r2(a.pos.z), r3(a.yaw), r3(a.pitch), Math.round(a.hp), actorFlags(a), a.k, a.d, r2(a.vel.x), r2(a.vel.z), HERO_KEYS.indexOf(a.heroKey), Math.round(cloakLevel(a) * 100), Math.floor(a.ult), a.addons[0] != null ? a.addons[0] : -1, a.addons[1] != null ? a.addons[1] : -1, a.a, r2(a.vel.y), a.team];
}
function unpackState(a, r, o, t) {
  for (let i = 0; i < 11; i++) if (!Number.isFinite(r[o + i])) return;
  const B = World.bounds;
  a.snaps.push({ t, x: clamp(r[o], B.x0 - 5, B.x1 + 5), y: clamp(r[o + 1], -10, 60), z: clamp(r[o + 2], B.z0 - 5, B.z1 + 5), yaw: r[o + 3], pitch: clamp(r[o + 4], -1.6, 1.6), vx: clamp(r[o + 9], -60, 60), vz: clamp(r[o + 10], -60, 60), vy: clamp(r[o + 17] || 0, -60, 60) });
  if (a.snaps.length > 16) a.snaps.shift();
  const f = r[o + 6] | 0, wasAlive = a.alive;
  a.flags = f; a.hp = clamp(r[o + 5], 0, a.maxHp); a.alive = !!(f & F_ALIVE); a.grounded = !!(f & F_GROUND);
  a.k = clamp(r[o + 7] | 0, 0, 999); a.d = clamp(r[o + 8] | 0, 0, 999); a.cl = clamp((r[o + 12] | 0) / 100, 0, 1); a.ult = clamp(r[o + 13] | 0, 0, 100); a.a = clamp(r[o + 16] | 0, 0, 999);
  // statuses as the owner reports them, so bots and visuals can read them
  a.st.reveal = f & F_REVEAL ? 1 : 0; a.st.night = f & F_NIGHT ? 1 : 0; a.st.root = f & F_ROOT ? 1 : 0; a.st.stun = f & F_STUN ? 1 : 0;
  if (!wasAlive && a.alive) { a.snaps.length = 0; a.snaps.push({ t, x: r[o], y: r[o + 1], z: r[o + 2], yaw: r[o + 3], pitch: r[o + 4], vx: 0, vz: 0, vy: 0 }); a.anim.death = 0; if (a.model) { a.model.body.rotation.set(0, 0, 0); a.model.body.position.set(0, 0, 0); } }
}
