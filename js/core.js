'use strict';
// ============================================================================
// Overtune — utilities, settings, synthesized audio
// ============================================================================
// hex colours are sRGB: convert them to linear like the textures (the final pass applies the display curve)
if (THREE.ColorManagement) THREE.ColorManagement.legacyMode = false;
const V3 = THREE.Vector3;
const TAU = Math.PI * 2;
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const lerp = (a, b, t) => a + (b - a) * t;
const rand = (a, b) => a + Math.random() * (b - a);
const randi = (a, b) => Math.floor(a + Math.random() * (b - a + 1));
const pick = arr => arr[Math.floor(Math.random() * arr.length)];
const now = () => performance.now() / 1000;
const r2 = v => Math.round(v * 100) / 100;
const r3 = v => Math.round(v * 1000) / 1000;
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
function angDiff(a, b) { let d = (b - a) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return d; }
function damp(cur, target, k, dt) { return lerp(cur, target, 1 - Math.exp(-k * dt)); }
function mulberry(seed) { let a = seed >>> 0; return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function esc(s) { return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

// ---------------------------------------------------------------- settings
const Settings = {
  name: 'Player' + Math.floor(Math.random() * 900 + 100), sens: 1.0, fov: 95, q: 2, vol: 0.8, music: 0.5, invertY: false,
  hero: 'marrow', loadouts: {}, tipsShown: 0, mode: 'tdm', map: 'kiln', size: 4, diff: 1, ffaSize: 6, showFps: false, xhair: 1,
  load() {
    try { const s = JSON.parse(localStorage.getItem('overtune.settings') || '{}'); for (const k in s) if (k in this && typeof this[k] !== 'function') this[k] = s[k]; } catch (e) { /* private window */ }
    if (typeof this.loadouts !== 'object' || !this.loadouts) this.loadouts = {};
  },
  save() {
    const o = {}; for (const k in this) if (typeof this[k] !== 'function') o[k] = this[k];
    try { localStorage.setItem('overtune.settings', JSON.stringify(o)); } catch (e) { /* private window */ }
  },
};
Settings.load();

// ---------------------------------------------------------------- audio (all synthesized)
const Sfx = {
  ctx: null, master: null, bus: null, verb: null, noise: null, listener: { x: 0, y: 0, z: 0, yaw: 0 }, loops: new Map(), amb: null,
  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    const c = this.ctx = new AC();
    this.master = c.createGain(); this.master.gain.value = Settings.vol;
    const comp = c.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 4; comp.attack.value = 0.003; comp.release.value = 0.15;
    this.master.connect(comp); comp.connect(c.destination);
    this.bus = c.createGain(); this.bus.connect(this.master);
    // a short synthetic room: noise impulse with an exponential tail
    const len = c.sampleRate * 1.4, ir = c.createBuffer(2, len, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) { const d = ir.getChannelData(ch); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2); }
    this.verb = c.createConvolver(); this.verb.buffer = ir; const vg = c.createGain(); vg.gain.value = 0.22; this.verb.connect(vg); vg.connect(this.master);
    const nb = c.createBuffer(1, c.sampleRate * 2, c.sampleRate), nd = nb.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
    this.noise = nb;
  },
  setVol(v) { if (this.master) this.master.gain.value = v; },
  // where a sound sits relative to the listener: gain and stereo pan
  place(pos) {
    if (!pos) return { g: 1, p: 0 };
    const L = this.listener, dx = pos.x - L.x, dy = (pos.y || 0) - L.y, dz = pos.z - L.z, d = Math.sqrt(dx * dx + dy * dy + dz * dz);
    const g = 1 / (1 + Math.max(0, d - 2) * 0.09) * (d > 70 ? Math.max(0, 1 - (d - 70) / 30) : 1);
    const ang = Math.atan2(dx, -dz) - (-L.yaw);
    return { g, p: clamp(Math.sin(-ang) * -0.85, -0.85, 0.85) * clamp(d / 4, 0, 1) };
  },
  out(gain, pan, wet) {
    const c = this.ctx, g = c.createGain(); g.gain.value = gain;
    let node = g;
    if (c.createStereoPanner) { const p = c.createStereoPanner(); p.pan.value = pan; g.connect(p); node = p; }
    node.connect(this.bus); if (wet && this.verb) node.connect(this.verb);
    return g;
  },
  nz(t0, dur, freq, q, type, gain, dest, attack = 0.002, curve = 'exp') {
    const c = this.ctx, s = c.createBufferSource(); s.buffer = this.noise; s.loop = true;
    const f = c.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, t0); g.gain.linearRampToValueAtTime(gain, t0 + attack);
    if (curve === 'exp') g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur); else g.gain.linearRampToValueAtTime(0, t0 + dur);
    s.connect(f); f.connect(g); g.connect(dest); s.start(t0, Math.random()); s.stop(t0 + dur + 0.05);
    return f;
  },
  osc(t0, dur, f0, f1, type, gain, dest, attack = 0.002) {
    const c = this.ctx, o = c.createOscillator(); o.type = type; o.frequency.setValueAtTime(f0, t0); if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t0 + dur);
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, t0); g.gain.linearRampToValueAtTime(gain, t0 + attack); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(dest); o.start(t0); o.stop(t0 + dur + 0.05);
    return o;
  },
  play(name, pos, vol = 1) {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const { g, p } = this.place(pos); if (g * vol < 0.02) return;
    const R = this.recipes[name]; if (!R) return;
    try { R.call(this, this.ctx.currentTime + 0.005, this.out(g * vol, p, !!pos), g * vol); } catch (e) { /* audio node limits */ }
  },
  recipes: {
    rifle(t, o) { this.nz(t, 0.05, 2600, 0.7, 'bandpass', 1.6, o); this.nz(t, 0.5, 700, 0.6, 'lowpass', 1.1, o); this.osc(t, 0.14, 160, 50, 'triangle', 0.9, o); this.nz(t + 0.32, 0.12, 3200, 3, 'bandpass', 0.18, o); },
    smg(t, o) { this.nz(t, 0.06, 3400, 0.9, 'bandpass', 0.9, o); this.nz(t, 0.14, 900, 0.7, 'lowpass', 0.5, o); this.osc(t, 0.05, 240, 90, 'square', 0.12, o); },
    shotgun(t, o) { this.nz(t, 0.08, 1800, 0.5, 'bandpass', 1.8, o); this.nz(t, 0.7, 380, 0.5, 'lowpass', 1.6, o); this.osc(t, 0.22, 110, 38, 'sine', 1.1, o); this.nz(t + 0.42, 0.08, 1500, 4, 'bandpass', 0.3, o); this.nz(t + 0.55, 0.08, 1100, 4, 'bandpass', 0.3, o); },
    burst(t, o) { this.nz(t, 0.05, 3000, 1.1, 'bandpass', 1.0, o); this.nz(t, 0.22, 1100, 0.7, 'lowpass', 0.6, o); this.osc(t, 0.07, 420, 150, 'sawtooth', 0.15, o); },
    launcher(t, o) { this.osc(t, 0.25, 180, 60, 'sine', 1.0, o); this.nz(t, 0.25, 600, 1.5, 'bandpass', 0.7, o); this.osc(t, 0.18, 900, 300, 'triangle', 0.15, o); },
    boom(t, o) { this.nz(t, 0.9, 300, 0.4, 'lowpass', 1.8, o); this.osc(t, 0.5, 90, 30, 'sine', 1.4, o); this.nz(t, 0.15, 2000, 0.5, 'bandpass', 0.6, o); },
    reload(t, o) { this.nz(t, 0.05, 2500, 5, 'bandpass', 0.5, o); this.nz(t + 0.25, 0.05, 1800, 6, 'bandpass', 0.6, o); this.nz(t + 0.5, 0.07, 3200, 4, 'bandpass', 0.5, o); },
    empty(t, o) { this.nz(t, 0.04, 4000, 6, 'bandpass', 0.4, o); },
    hit(t, o) { this.osc(t, 0.06, 1500, 1300, 'square', 0.12, o); this.nz(t, 0.04, 5000, 2, 'highpass', 0.25, o); },
    head(t, o) { this.osc(t, 0.22, 2200, 2100, 'sine', 0.35, o); this.osc(t, 0.22, 3300, 3250, 'sine', 0.15, o); this.nz(t, 0.05, 6000, 2, 'highpass', 0.3, o); },
    kill(t, o) { this.osc(t, 0.12, 880, 880, 'triangle', 0.35, o); this.osc(t + 0.09, 0.3, 1318, 1318, 'triangle', 0.35, o); },
    hurt(t, o) { this.nz(t, 0.18, 400, 1, 'lowpass', 0.8, o); this.osc(t, 0.14, 120, 70, 'sine', 0.6, o); },
    die(t, o) { this.osc(t, 0.9, 300, 60, 'sawtooth', 0.25, o); this.nz(t, 0.8, 500, 1, 'lowpass', 0.6, o); },
    step(t, o) { this.nz(t, 0.06, 700 + Math.random() * 300, 1.2, 'bandpass', 0.35, o); },
    land(t, o) { this.nz(t, 0.12, 400, 1, 'lowpass', 0.8, o); },
    jump(t, o) { this.nz(t, 0.1, 900, 1, 'bandpass', 0.25, o); },
    pad(t, o) { this.osc(t, 0.45, 180, 900, 'sine', 0.5, o); this.nz(t, 0.4, 1400, 1, 'bandpass', 0.5, o); },
    pickup(t, o) { this.osc(t, 0.1, 660, 660, 'sine', 0.3, o); this.osc(t + 0.08, 0.18, 990, 990, 'sine', 0.3, o); },
    ui(t, o) { this.osc(t, 0.06, 1200, 900, 'triangle', 0.18, o); },
    uiok(t, o) { this.osc(t, 0.08, 700, 700, 'triangle', 0.2, o); this.osc(t + 0.06, 0.14, 1050, 1050, 'triangle', 0.2, o); },
    equip(t, o) { this.nz(t, 0.08, 3000, 3, 'bandpass', 0.5, o); this.osc(t, 0.2, 400, 800, 'sine', 0.2, o); this.osc(t + 0.05, 0.3, 1600, 1600, 'sine', 0.12, o); },
    // powers
    snarePlace(t, o) { this.nz(t, 0.08, 2200, 4, 'bandpass', 0.6, o); this.nz(t + 0.14, 0.1, 1500, 5, 'bandpass', 0.7, o); this.osc(t + 0.14, 0.12, 260, 180, 'square', 0.1, o); },
    snareSnap(t, o) { this.nz(t, 0.05, 3000, 1, 'highpass', 1.6, o); this.osc(t, 0.25, 520, 140, 'square', 0.4, o); this.nz(t, 0.4, 900, 3, 'bandpass', 0.8, o); this.osc(t + 0.02, 0.6, 1800, 1700, 'sine', 0.2, o); },
    blinkCharge(t, o) { this.osc(t, 0.5, 200, 700, 'sine', 0.25, o); this.nz(t, 0.5, 2000, 8, 'bandpass', 0.2, o, 0.3); },
    blink(t, o) { this.nz(t, 0.35, 1200, 1, 'bandpass', 0.9, o); this.osc(t, 0.3, 1400, 120, 'sine', 0.5, o); this.osc(t, 0.4, 70, 40, 'sine', 0.8, o); },
    fatigue(t, o) { this.osc(t, 0.8, 140, 90, 'sine', 0.35, o); this.nz(t, 0.7, 300, 1, 'lowpass', 0.4, o, 0.1, 'lin'); },
    rev(t, o) { this.osc(t, 0.5, 60, 140, 'sawtooth', 0.35, o, 0.05); this.nz(t, 0.5, 300, 2, 'bandpass', 0.6, o, 0.05); },
    ramHit(t, o) { this.nz(t, 0.4, 600, 0.5, 'lowpass', 2.0, o); this.osc(t, 0.4, 120, 40, 'square', 0.6, o); this.nz(t, 0.08, 2600, 1, 'bandpass', 1.2, o); },
    crash(t, o) { this.nz(t, 0.6, 400, 0.5, 'lowpass', 2.0, o); this.nz(t, 0.25, 2200, 2, 'bandpass', 1.0, o); this.osc(t, 0.5, 90, 30, 'sine', 1.2, o); },
    fadeOut(t, o) { this.osc(t, 0.6, 900, 200, 'sine', 0.35, o); this.nz(t, 0.6, 3000, 6, 'bandpass', 0.3, o, 0.2); },
    fadeIn(t, o) { this.osc(t, 0.8, 180, 900, 'sine', 0.35, o, 0.3); this.nz(t, 0.8, 2500, 6, 'bandpass', 0.35, o, 0.5); },
    ambush(t, o) { this.osc(t, 0.4, 1600, 400, 'sawtooth', 0.25, o); this.nz(t, 0.2, 4000, 2, 'highpass', 0.5, o); },
    windup(t, o) { this.nz(t, 0.6, 1800, 3, 'bandpass', 0.35, o, 0.5, 'lin'); this.osc(t, 0.6, 300, 600, 'triangle', 0.08, o, 0.4); },
    glaive(t, o) { this.nz(t, 0.45, 1600, 2, 'bandpass', 1.0, o); this.osc(t, 0.4, 900, 300, 'triangle', 0.25, o); this.nz(t, 0.08, 3000, 1, 'highpass', 0.5, o); },
    glaiveHit(t, o) { this.nz(t, 0.08, 3500, 2, 'bandpass', 1.0, o); this.osc(t, 0.3, 1200, 900, 'square', 0.12, o); this.nz(t, 0.25, 600, 1, 'lowpass', 0.7, o); },
    heal(t, o) { this.osc(t, 0.6, 500, 760, 'sine', 0.25, o, 0.1); this.osc(t + 0.1, 0.6, 750, 1100, 'sine', 0.15, o, 0.1); },
    dash(t, o) { this.nz(t, 0.3, 1000, 1, 'bandpass', 0.9, o); this.osc(t, 0.25, 400, 120, 'sine', 0.3, o); },
    wall(t, o) { this.osc(t, 0.6, 120, 240, 'square', 0.15, o); this.nz(t, 0.5, 900, 3, 'bandpass', 0.5, o); this.osc(t, 0.8, 600, 620, 'sine', 0.15, o, 0.2); },
    wallHit(t, o) { this.osc(t, 0.12, 900, 700, 'sine', 0.2, o); this.nz(t, 0.06, 2600, 3, 'bandpass', 0.3, o); },
    scry(t, o) { this.osc(t, 1.0, 400, 1600, 'sine', 0.2, o, 0.05); this.osc(t, 1.0, 410, 1640, 'sine', 0.2, o, 0.05); },
    leap(t, o) { this.nz(t, 0.5, 700, 0.8, 'lowpass', 1.0, o); this.osc(t, 0.4, 100, 300, 'sine', 0.5, o); },
    ult(t, o) { this.osc(t, 1.2, 110, 110, 'sawtooth', 0.25, o, 0.05); this.osc(t, 1.2, 165, 165, 'sawtooth', 0.2, o, 0.05); this.nz(t, 1.2, 800, 0.7, 'lowpass', 0.8, o, 0.2); this.osc(t + 0.2, 1.0, 440, 880, 'sine', 0.25, o, 0.2); },
    ultReady(t, o) { this.osc(t, 0.2, 660, 660, 'sine', 0.25, o); this.osc(t + 0.12, 0.2, 880, 880, 'sine', 0.25, o); this.osc(t + 0.24, 0.4, 1320, 1320, 'sine', 0.25, o); },
    slam(t, o) { this.nz(t, 1.2, 200, 0.5, 'lowpass', 2.2, o); this.osc(t, 0.9, 70, 25, 'sine', 1.6, o); this.nz(t, 0.3, 1500, 1, 'bandpass', 1.0, o); },
    reveal(t, o) { this.osc(t, 0.5, 1800, 1800, 'sine', 0.15, o); this.osc(t + 0.15, 0.5, 2400, 2400, 'sine', 0.12, o); },
    zone(t, o) { this.osc(t, 0.3, 520, 520, 'triangle', 0.25, o); this.osc(t + 0.15, 0.4, 780, 780, 'triangle', 0.25, o); },
    round(t, o) { this.osc(t, 0.4, 440, 440, 'square', 0.12, o); this.osc(t + 0.4, 0.4, 440, 440, 'square', 0.12, o); this.osc(t + 0.8, 0.8, 880, 880, 'square', 0.14, o); },
    win(t, o) { [523, 659, 784, 1046].forEach((f, i) => this.osc(t + i * 0.13, 0.6, f, f, 'triangle', 0.3, o)); },
    lose(t, o) { [392, 330, 262].forEach((f, i) => this.osc(t + i * 0.2, 0.7, f, f * 0.98, 'triangle', 0.3, o)); },
  },
  // a loop that follows something (the charge engine, wind-ups); returns a handle with set(gain, pitch) and stop()
  loop(kind) {
    if (!this.ctx) return null;
    const c = this.ctx, g = c.createGain(); g.gain.value = 0; g.connect(this.bus);
    const nodes = [];
    if (kind === 'engine') {
      const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = 70; const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 700;
      const o2 = c.createOscillator(); o2.type = 'square'; o2.frequency.value = 35; const g2 = c.createGain(); g2.gain.value = 0.4;
      o.connect(f); o2.connect(g2); g2.connect(f); f.connect(g); o.start(); o2.start(); nodes.push(o, o2);
      return { g, set: (gain, p) => { g.gain.setTargetAtTime(gain, c.currentTime, 0.04); o.frequency.setTargetAtTime(60 + p * 110, c.currentTime, 0.05); o2.frequency.setTargetAtTime(30 + p * 55, c.currentTime, 0.05); }, stop: () => { g.gain.setTargetAtTime(0, c.currentTime, 0.05); setTimeout(() => nodes.forEach(n => { try { n.stop(); } catch (e) { /* stopped */ } }), 400); } };
    }
    const s = c.createBufferSource(); s.buffer = this.noise; s.loop = true; const f = c.createBiquadFilter(); f.type = kind === 'wind' ? 'lowpass' : kind === 'rain' ? 'highpass' : 'bandpass'; f.frequency.value = kind === 'wind' ? 380 : kind === 'rain' ? 2200 : 1400; f.Q.value = kind === 'charge' ? 6 : 0.5;
    s.connect(f); f.connect(g); s.start(); nodes.push(s);
    return { g, set: (gain, p) => { g.gain.setTargetAtTime(gain, c.currentTime, 0.08); if (kind === 'charge') f.frequency.setTargetAtTime(600 + p * 2600, c.currentTime, 0.05); }, stop: () => { g.gain.setTargetAtTime(0, c.currentTime, 0.1); setTimeout(() => { try { s.stop(); } catch (e) { /* stopped */ } }, 600); } };
  },
  ambience(kind) {
    if (!this.ctx) return;
    if (this.amb) { this.amb.forEach(l => l && l.stop()); this.amb = null; }
    if (!kind) return;
    const a = [this.loop('wind')]; a[0].set(0.08, 0);
    if (kind === 'rain') { const r = this.loop('rain'); r.set(0.07, 0); a.push(r); }
    this.amb = a;
  },
};
