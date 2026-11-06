'use strict';
// ============================================================================
// Online play: direct browser-to-browser links (WebRTC data channels). Free public MQTT brokers are only used to
// find each other and swap connection details, and to carry a player's updates when no direct link can be made.
// ============================================================================
const P2P_NS = 'overtune-q4m8/';
const P2P_BROKERS = window.__OT_BROKERS || ['wss://broker.emqx.io:8084/mqtt', 'wss://broker.hivemq.com:8884/mqtt', 'wss://test.mosquitto.org:8081/mqtt'];
const P2P_ICE = window.__OT_ICE || [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }, { urls: 'stun:stun.cloudflare.com:3478' }];
const P2P_ENC = new TextEncoder(), P2P_DEC = new TextDecoder();
function p2pId() { return Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 6); }
function p2pGather(pc) {
  return new Promise(res => {
    if (pc.iceGatheringState === 'complete') return res();
    const t = setTimeout(res, 2500);
    pc.addEventListener('icegatheringstatechange', () => { if (pc.iceGatheringState === 'complete') { clearTimeout(t); res(); } });
  });
}

// One broker: MQTT 3.1.1 over a WebSocket, QoS 0 only, reconnects by itself.
class MqttLink {
  constructor(url, onMsg, onState) { this.url = url; this.onMsg = onMsg; this.onState = onState; this.up = false; this.subs = new Set(); this.buf = new Uint8Array(0); this.pid = 1; this.tries = 0; this.dead = false; this.ws = null; this.open(); }
  open() {
    if (this.dead) return;
    let ws; try { ws = new WebSocket(this.url, ['mqtt']); } catch (e) { this.retry(); return; }
    this.ws = ws; ws.binaryType = 'arraybuffer'; this.buf = new Uint8Array(0);
    ws.onopen = () => { if (this.ws === ws) this.send(0x10, [0, 4, 77, 81, 84, 84, 4, 2, 0, 45, ...this.str('ot' + p2pId())]); };
    ws.onmessage = e => { if (this.ws === ws && e.data instanceof ArrayBuffer) this.data(new Uint8Array(e.data)); };
    ws.onclose = ws.onerror = () => {
      if (this.ws !== ws) return;
      this.ws = null; clearInterval(this.ping); try { ws.close(); } catch (e) { /* closed */ }
      const was = this.up; this.up = false; if (was) this.onState(); this.retry();
    };
  }
  retry() { if (!this.dead) setTimeout(() => this.open(), Math.min(30000, 1500 * 2 ** Math.min(this.tries++, 5))); }
  str(s) { const b = P2P_ENC.encode(s); return [b.length >> 8, b.length & 255, ...b]; }
  send(h, body) {
    const ws = this.ws; if (!ws || ws.readyState !== 1) return;
    const len = []; let n = body.length; do { let b = n & 127; n >>= 7; if (n) b |= 128; len.push(b); } while (n);
    const out = new Uint8Array(1 + len.length + body.length); out[0] = h; out.set(len, 1); out.set(body, 1 + len.length);
    try { ws.send(out); } catch (e) { /* closing */ }
  }
  nextPid() { this.pid = this.pid % 65535 + 1; return [this.pid >> 8, this.pid & 255]; }
  sub(t) { this.subs.add(t); if (this.up) this.send(0x82, [...this.nextPid(), ...this.str(t), 0]); }
  unsub(t) { if (!this.subs.delete(t)) return; if (this.up) this.send(0xA2, [...this.nextPid(), ...this.str(t)]); }
  pub(topic, text) {
    if (!this.up) return;
    const t = P2P_ENC.encode(topic), p = P2P_ENC.encode(text), body = new Uint8Array(2 + t.length + p.length);
    body[0] = t.length >> 8; body[1] = t.length & 255; body.set(t, 2); body.set(p, 2 + t.length); this.send(0x30, body);
  }
  data(chunk) {
    const b = new Uint8Array(this.buf.length + chunk.length); b.set(this.buf); b.set(chunk, this.buf.length); let buf = b;
    for (;;) {
      if (buf.length < 2) break;
      let rem = 0, mul = 1, i = 1, done = false;
      for (; i < 5 && i < buf.length; i++) { rem += (buf[i] & 127) * mul; mul *= 128; if (!(buf[i] & 128)) { done = true; i++; break; } }
      if (!done) { if (i >= 5) { this.ws && this.ws.close(); return; } break; }
      if (buf.length < i + rem) break;
      this.packet(buf[0], buf.subarray(i, i + rem)); buf = buf.subarray(i + rem);
    }
    this.buf = buf.slice();
  }
  packet(h, p) {
    const type = h >> 4;
    if (type === 2) {      // CONNACK
      if (p[1] !== 0) { this.ws && this.ws.close(); return; }
      this.up = true; this.tries = 0;
      for (const t of this.subs) this.send(0x82, [...this.nextPid(), ...this.str(t), 0]);
      clearInterval(this.ping); this.ping = setInterval(() => this.send(0xC0, []), 20000);
      this.onState();
    } else if (type === 3) {      // PUBLISH
      const qos = (h >> 1) & 3, tl = (p[0] << 8) | p[1], off = 2 + tl + (qos ? 2 : 0);
      if (off > p.length) return;
      this.onMsg(P2P_DEC.decode(p.subarray(2, 2 + tl)), P2P_DEC.decode(p.subarray(off)));
    }
  }
  close() { this.dead = true; this.send(0xE0, []); clearInterval(this.ping); try { this.ws && this.ws.close(); } catch (e) { /* gone */ } this.ws = null; this.up = false; }
}

// A room (the lobby, or one match). The lobby only ever talks through the brokers; a match links every pair of players
// directly and falls back to the brokers for a pair that cannot link.
class P2PChan {
  constructor(name, direct) {
    this.name = name; this.base = name + '/'; this.direct = direct; this.mine = {}; this.list = new Map(); this.snap = Object.freeze([]); this.snapDirty = false; this.listeners = new Set(); this.notify = false;
    this.gone = false; this.lastRelay = -1e9; this.lastHi = -1e9; this.relayDue = false;
    P2P.chans.add(this); P2P.sub(this.base + 'p/+'); P2P.sub(this.base + 'b');
    if (direct) { P2P.sub(this.base + 'h'); P2P.sub(this.base + 's/' + P2P.me); }
    this.timer = setInterval(() => this.tick(), 500); if (direct) setTimeout(() => this.tick(), 50);
  }
  peer(uid) {
    let P = this.list.get(uid);
    if (!P) { P = { uid, pres: null, at: 0, heard: performance.now(), pc: null, dc: null, pcT: 0, sx: '', tries: 0, nextTry: 0, waitT: 0, relay: false }; this.list.set(uid, P); }
    return P;
  }
  isOpen(P) { return !!(P.dc && P.dc.readyState === 'open'); }
  setPres(P, p) { P.pres = Object.freeze(p); P.at = Date.now(); this.snapDirty = true; this.notify = true; }
  msg(t, d) {
    if (this.gone) return;
    if (t === 'b') { this.drop(d.u); return; }
    const P = this.peer(d.u); P.heard = performance.now();
    if (t.startsWith('p/')) { if (!this.isOpen(P) && d.p && typeof d.p === 'object' && !Array.isArray(d.p)) this.setPres(P, d.p); if (this.direct) this.link(P); }
    else if (t === 'h') { if (this.direct) this.link(P); }
    else if (this.direct && t.startsWith('s/')) this.signal(P, d);
  }
  link(P) {
    if (P.pc || this.isOpen(P)) return;
    if (typeof RTCPeerConnection !== 'function' || window.__OT_NORTC) { P.relay = true; return; }
    if (P2P.me < P.uid) { if (performance.now() >= P.nextTry) this.offer(P); }
    else if (!P.waitT) P.waitT = performance.now();      // the other side starts the link; wait for its offer
  }
  newPc(P) {
    this.unlink(P, false);
    const pc = new RTCPeerConnection({ iceServers: P2P_ICE }); P.pc = pc; P.pcT = performance.now();
    pc.onconnectionstatechange = () => { if ((pc.connectionState === 'failed' || pc.connectionState === 'closed') && P.pc === pc) this.unlink(P, true); };
    return pc;
  }
  async offer(P) {
    const pc = this.newPc(P), dc = pc.createDataChannel('g', { ordered: false, maxRetransmits: 0 }); this.bindDc(P, dc);
    try {
      await pc.setLocalDescription(await pc.createOffer()); await p2pGather(pc);
      if (P.pc !== pc || this.gone) return;
      P.sx = p2pId(); P2P.pub(this.base + 's/' + P.uid, { u: P2P.me, k: 'o', x: P.sx, d: pc.localDescription.sdp });
    } catch (e) { if (P.pc === pc) this.unlink(P, true); }
  }
  async signal(P, d) {
    if (typeof d.d !== 'string' || d.d.length > 14000 || typeof d.x !== 'string') return;
    if (d.k === 'o' && P2P.me > P.uid && typeof RTCPeerConnection === 'function' && !window.__OT_NORTC) {
      const pc = this.newPc(P); P.sx = d.x;
      pc.ondatachannel = e => { if (P.pc === pc) this.bindDc(P, e.channel); };
      try {
        await pc.setRemoteDescription({ type: 'offer', sdp: d.d }); await pc.setLocalDescription(await pc.createAnswer()); await p2pGather(pc);
        if (P.pc !== pc || this.gone) return;
        P2P.pub(this.base + 's/' + P.uid, { u: P2P.me, k: 'a', x: d.x, d: pc.localDescription.sdp });
      } catch (e) { if (P.pc === pc) this.unlink(P, true); }
    } else if (d.k === 'a') {
      const pc = P.pc; if (!pc || P.sx !== d.x || pc.signalingState !== 'have-local-offer') return;
      try { await pc.setRemoteDescription({ type: 'answer', sdp: d.d }); } catch (e) { if (P.pc === pc) this.unlink(P, true); }
    }
  }
  bindDc(P, dc) {
    P.dc = dc;
    dc.onopen = () => { if (P.dc !== dc) return; P.relay = false; P.tries = 0; P.waitT = 0; try { dc.send(JSON.stringify({ p: this.mine })); } catch (e) { /* closing */ } };
    dc.onmessage = e => {
      if (P.dc !== dc || typeof e.data !== 'string' || e.data.length > 16000) return;
      let d; try { d = JSON.parse(e.data); } catch (er) { return; }
      P.heard = performance.now(); if (d && d.p && typeof d.p === 'object' && !Array.isArray(d.p)) this.setPres(P, d.p);
    };
    dc.onclose = () => { if (P.dc === dc) this.unlink(P, true); };
  }
  unlink(P, failed) {
    const pc = P.pc, dc = P.dc; P.pc = null; P.dc = null;
    try { dc && dc.close(); } catch (e) { /* gone */ } try { pc && pc.close(); } catch (e) { /* gone */ }
    if (failed) { P.relay = true; P.tries++; P.nextTry = performance.now() + Math.min(20000, 3000 * P.tries); P.waitT = performance.now(); }
  }
  drop(uid) { const P = this.list.get(uid); if (!P) return; this.unlink(P, false); this.list.delete(uid); this.snapDirty = true; this.notify = true; }
  needRelay() { for (const P of this.list.values()) if (P.relay && !this.isOpen(P)) return true; return false; }
  relay() { this.lastRelay = performance.now(); this.relayDue = false; P2P.pub(this.base + 'p/' + P2P.me, { u: P2P.me, p: this.mine }); }
  tick() {
    if (this.gone) return;
    const t = performance.now();
    if (this.direct && t - this.lastHi > 2000) { this.lastHi = t; P2P.pub(this.base + 'h', { u: P2P.me }); }
    for (const P of [...this.list.values()]) {
      const open = this.isOpen(P);
      if (!open && t - P.heard > 9000) { this.drop(P.uid); continue; }
      if (!this.direct || open) continue;
      if (P.pc && t - P.pcT > 10000) this.unlink(P, true);      // took too long: the brokers carry this pair for now, try again later
      if (!P.pc && P.waitT && t - P.waitT > 10000) P.relay = true;
      if (!P.pc && P2P.me < P.uid && t >= P.nextTry) this.link(P);
    }
    const any = Object.keys(this.mine).length > 0;
    if (!this.direct) { if (any && (this.relayDue ? t - this.lastRelay > 400 : t - this.lastRelay > 2500)) this.relay(); }
    else if (this.needRelay() && t - this.lastRelay > 1000) this.relay();
    if (this.notify) { this.notify = false; const s = this.peers(); for (const f of this.listeners) try { f({ peers: s, joined: [], left: [], updated: [] }); } catch (e) { /* listener */ } }
  }
  // the room's calls
  async presence(patch) {
    if (this.gone) return;
    const n = Object.assign({}, this.mine); for (const k in patch) { if (patch[k] === null) delete n[k]; else n[k] = patch[k]; }
    this.mine = n;
    const s = JSON.stringify({ p: n });
    for (const P of this.list.values()) if (this.isOpen(P)) try { P.dc.send(s); } catch (e) { /* closing */ }
    const t = performance.now();
    if (!this.direct) { if (t - this.lastRelay > 400) this.relay(); else this.relayDue = true; }
    else if (this.needRelay() && t - this.lastRelay > 100) this.relay();
  }
  peers() {
    if (this.snapDirty) {
      this.snapDirty = false; const a = [];
      for (const P of this.list.values()) if (P.pres) a.push(Object.freeze({ peer: P.uid, by: null, isMe: false, sameTab: false, kind: 'viewer', guest: false, presence: P.pres, updatedAt: P.at }));
      this.snap = Object.freeze(a);
    }
    return this.snap;
  }
  onPeers(f) { this.listeners.add(f); setTimeout(() => { if (this.listeners.has(f)) f({ peers: this.peers(), joined: [], left: [], updated: [] }); }, 0); return () => this.listeners.delete(f); }
  onConnection(f) { P2P.connL.add(f); setTimeout(() => f(P2P.up()), 0); return () => P2P.connL.delete(f); }
  connected() { return P2P.up(); }
  async leave() {
    if (this.gone) return; this.gone = true; clearInterval(this.timer);
    P2P.pub(this.base + 'b', { u: P2P.me });
    for (const P of this.list.values()) this.unlink(P, false); this.list.clear();
    for (const t of ['p/+', 'b', 'h', 's/' + P2P.me]) P2P.unsub(this.base + t);
    P2P.chans.delete(this);
  }
  async join(name) { return new P2PChan(name, true); }
}

const P2P = {
  me: p2pId(), links: null, chans: new Set(), connL: new Set(), seen: new Map(), n: 0, lobby: null,
  ok() { return typeof WebSocket === 'function'; },
  up() { return !!this.links && this.links.some(l => l.up); },
  start() {
    if (this.links) return;
    this.links = P2P_BROKERS.map(u => new MqttLink(u, (t, m) => this.msg(t, m), () => { const ok = this.up(); for (const f of this.connL) try { f(ok); } catch (e) { /* listener */ } }));
  },
  sub(t) { for (const l of this.links) l.sub(P2P_NS + t); },
  unsub(t) { for (const l of this.links) l.unsub(P2P_NS + t); },
  pub(t, o) { o.i = this.me + '.' + (++this.n); const s = JSON.stringify(o); for (const l of this.links) l.pub(P2P_NS + t, s); },
  msg(topic, text) {
    if (!topic.startsWith(P2P_NS) || text.length > 16000) return;
    let d; try { d = JSON.parse(text); } catch (e) { return; }
    if (!d || typeof d !== 'object' || typeof d.i !== 'string' || d.i.length > 40 || typeof d.u !== 'string' || !d.u || d.u.length > 20 || d.u === this.me) return;
    if (this.seen.has(d.i)) return;      // the same message arrives once from every broker
    this.seen.set(d.i, 1); if (this.seen.size > 4000) { let k = 0; for (const key of this.seen.keys()) { this.seen.delete(key); if (++k > 2000) break; } }
    const t = topic.slice(P2P_NS.length);
    for (const c of this.chans) if (t.startsWith(c.base)) c.msg(t.slice(c.base.length), d);
  },
  // Resolves the lobby once a broker answers, or null if none does in time (the links keep trying in the background).
  async room() {
    this.start();
    if (!this.up()) {
      await new Promise(res => {
        const done = ok => { if (!ok) return; clearTimeout(tm); this.connL.delete(done); res(); };
        const tm = setTimeout(() => { this.connL.delete(done); res(); }, 9000); this.connL.add(done);
      });
    }
    if (!this.up()) return null;
    return this.lobby || (this.lobby = new P2PChan('lobby', false));
  },
};
