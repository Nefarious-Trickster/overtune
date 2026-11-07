'use strict';
// ============================================================================
// Input, the first-person view, the HUD, menus, the add-on loadout screen, the online lobby, and the menu showcase
// ============================================================================
const Input = {
  keys: {}, mb: [false, false, false], mdx: 0, mdy: 0, locked: false,
  init(cv) {
    this.cv = cv;
    addEventListener('keydown', e => {
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT')) return;
      this.keys[e.code] = true;
      if (Game.state === 'play') {
        if (['Tab', 'Space', 'KeyQ', 'KeyE', 'ShiftLeft', 'ShiftRight'].includes(e.code)) e.preventDefault();
        if (e.code === 'Tab') HUD.board(true);
        if (e.code === 'Escape' && !this.locked && UI.cur === 'pause') UI.resume();
        if (e.code === 'KeyL' && Game.me && !Game.me.alive && !UI.cur) { UI.action('pauseLoadout'); this.unlock(); }
      }
    });
    addEventListener('keyup', e => { this.keys[e.code] = false; if (e.code === 'Tab') HUD.board(false); });
    addEventListener('blur', () => { this.keys = {}; this.mb = [false, false, false]; });
    addEventListener('mousemove', e => { if (this.locked) { this.mdx += e.movementX || 0; this.mdy += e.movementY || 0; } });
    cv.addEventListener('mousedown', e => {
      Sfx.init();
      if (Game.state === 'play' && !this.locked && !UI.cur) { this.lock(); return; }
      if (Game.state === 'play' && Game.me && !Game.me.alive && e.button === 0) View.specI++;
      this.mb[e.button] = true;
    });
    addEventListener('mouseup', e => { this.mb[e.button] = false; });
    cv.addEventListener('contextmenu', e => e.preventDefault());
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === cv;
      if (!this.locked) { this.mb = [false, false, false]; if (Game.state === 'play' && Game.match && Game.match.st !== 'end' && !UI.cur) UI.pause(); }
    });
  },
  lock() { try { const p = this.cv.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch (e) { /* not allowed yet */ } },
  unlock() { if (document.pointerLockElement) document.exitPointerLock(); },
  apply(me, dt, frozen) {
    const K = this.keys, I = me.input, active = this.locked && !UI.cur;
    const s = 0.0022 * Settings.sens;
    if (active && me.alive) {
      me.yaw -= this.mdx * s; me.pitch = clamp(me.pitch - this.mdy * s * (Settings.invertY ? -1 : 1), -1.5, 1.5);
      View.sway(this.mdx, this.mdy);
    }
    this.mdx = 0; this.mdy = 0;
    const on = active && !frozen;
    I.fwd = on ? (K.KeyW || K.ArrowUp ? 1 : 0) - (K.KeyS || K.ArrowDown ? 1 : 0) : 0;
    I.side = on ? (K.KeyD || K.ArrowRight ? 1 : 0) - (K.KeyA || K.ArrowLeft ? 1 : 0) : 0;
    I.jump = on && !!K.Space; I.fire = on && this.mb[0]; I.power = on && (this.mb[2] || !!K.KeyE); I.util = on && !!(K.ShiftLeft || K.ShiftRight);
    I.ult = on && !!K.KeyQ; I.reload = on && !!K.KeyR;
  },
};

// ---------------------------------------------------------------- the first-person view
const View = {
  vm: null, hero: null, kickP: 0, kickZ: 0, kickV: 0, swayX: 0, swayY: 0, bob: 0, shakeK: 0, landK: 0, reloadT: 0, reloadD: 1, throwT: 0, flashT: 0, blinkT: 0, slashT: 0, slashSide: 1, eyeY: 0, deathCam: false, deathT: 0, specI: 0, fov: 95,
  init() {
    const cv = document.createElement('canvas'); cv.width = cv.height = 64; const c = cv.getContext('2d'), g = c.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(255,240,200,1)'); g.addColorStop(0.3, 'rgba(255,180,90,0.6)'); g.addColorStop(1, 'rgba(255,120,40,0)'); c.fillStyle = g; c.fillRect(0, 0, 64, 64);
    this.flashMat = new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(cv), color: new THREE.Color(4, 3, 2), transparent: true, blending: THREE.AdditiveBlending, depthTest: false });
  },
  setHero(key) {
    if (this.vm) G.vmScene.remove(this.vm.vm);
    this.hero = key; this.vm = buildViewmodel(key); G.vmScene.add(this.vm.vm);
    const V = this.vm, s = new THREE.Sprite(this.flashMat.clone()); s.material.color = hdrCol(HEROES[key].look.glow, 2.5); s.scale.setScalar(0.2); s.visible = false; V.muzzle.add(s); this.flashes = V.kind === 'proj' || V.kind === undefined ? [s] : [];
    this.vmMats = []; V.vm.traverse(o => { if (o.isMesh) this.vmMats.push(o); });
    this.fadeLook = null;
    V.rightRest = V.right.position.clone(); V.leftRest = V.left.position.clone();
  },
  reset() { this.kickP = 0; this.kickZ = 0; this.reloadT = 0; this.deathCam = false; const me = Game.me; if (me && me.heroKey !== this.hero) this.setHero(me.heroKey); if (me) this.eyeY = me.pos.y + PHYS.eye; },
  sway(dx, dy) { this.swayX = clamp(this.swayX + dx * 0.0004, -0.06, 0.06); this.swayY = clamp(this.swayY + dy * 0.0004, -0.06, 0.06); },
  kick(r) { this.kickP += r; this.kickZ = 0.06 + r; this.kickV = 1; },
  shake(k) { this.shakeK = Math.max(this.shakeK, k); },
  land(v) { this.landK = Math.min(0.25, v * 0.012); },
  reload(d) { this.reloadT = d; this.reloadD = d; },
  flash() { this.flashT = 0.05; this.shot = (this.shot || 0) + 1; },
  blink() { this.blinkT = 0.35; },
  throwAnim() { this.throwT = 0.35; },
  slash(side) { this.slashT = 0.4; this.slashSide = side || 1; },
  // where the viewmodel's muzzle is, in the world (scaled from the narrow viewmodel lens to the main one)
  muzzleWorld() {
    if (!this.vm) return eyePos(Game.me);
    this.vm.vm.updateMatrixWorld(true);
    const p = this.vm.muzzle.getWorldPosition(new V3());
    const k = Math.tan(G.camera.fov * Math.PI / 360) / Math.tan(G.vmCam.fov * Math.PI / 360);
    p.x *= k; p.y *= k;
    return p.applyMatrix4(G.camera.matrixWorld);
  },
  update(dt) {
    const me = Game.me, cam = G.camera; if (!me) return;
    // horizontal field of view setting → the camera's vertical one
    const hf = Settings.fov * Math.PI / 180, aspect = G.cw / Math.max(1, G.ch);
    let vfov = 2 * Math.atan(Math.tan(hf / 2) / aspect) * 180 / Math.PI;
    const f = actorFlags(me);
    if (f & F_CHARGE) vfov *= 1.12; if (f & F_BLINKCH) vfov *= 1 - 0.08 * clamp(me.pw.chargeT / me.P.chargeTime, 0, 1); if (me.st.unbound > 0) vfov *= 1.05;
    this.fov = damp(this.fov, vfov, 10, dt); if (Math.abs(cam.fov - this.fov) > 0.01) { cam.fov = this.fov; cam.updateProjectionMatrix(); }
    if (!me.alive) { this.deathView(dt); this.vm && (this.vm.vm.visible = false); return; }
    this.deathCam = false; this.deathT = 0;
    // camera: Mire under the ground looks out from just above the surface
    this.subK = damp(this.subK || 0, f & F_SUB ? 1 : 0, 6, dt);
    const eye = me.pos.y + PHYS.eye - (f & F_PLACE ? 0.35 : 0) - this.subK * 1.3;
    this.eyeY = me.grounded ? damp(this.eyeY, eye, 18, dt) : eye; if (Math.abs(this.eyeY - eye) > 1.5) this.eyeY = eye;
    const hs = Math.hypot(me.vel.x, me.vel.z), moving = me.grounded && hs > 1;
    this.bob += dt * hs * 1.5 * (moving ? 1 : 0);
    const bobY = moving ? Math.abs(Math.sin(this.bob)) * 0.035 * Math.min(1, hs / 6) : 0;
    this.landK = damp(this.landK, 0, 8, dt); this.shakeK = Math.max(0, this.shakeK - dt * 2.2);
    if (f & F_CHARGE) this.shakeK = Math.max(this.shakeK, 0.25); if (f & F_REV) this.shakeK = Math.max(this.shakeK, 0.12); if (f & F_FLAME) this.shakeK = Math.max(this.shakeK, 0.06);
    const sh = this.shakeK * this.shakeK * 0.08;
    cam.position.set(me.pos.x + rand(-sh, sh), this.eyeY + bobY - this.landK + rand(-sh, sh), me.pos.z + rand(-sh, sh));
    this.kickP = damp(this.kickP, 0, 9, dt);
    const side = me.input.side * (moving ? 1 : 0);
    this.roll = damp(this.roll || 0, -side * 0.012, 8, dt);
    cam.rotation.set(me.pitch + this.kickP, me.yaw, this.roll);
    cam.updateMatrixWorld();
    // viewmodel
    const V = this.vm; if (!V) return; V.vm.visible = this.subK < 0.5;
    this.swayX = damp(this.swayX, 0, 7, dt); this.swayY = damp(this.swayY, 0, 7, dt); this.kickZ = damp(this.kickZ, 0, 14, dt);
    const bx = Math.sin(this.bob * 0.5) * 0.012 * Math.min(1, hs / 6), by = -Math.abs(Math.cos(this.bob * 0.5)) * 0.01 * Math.min(1, hs / 6), idle = Math.sin(G.time * 1.4) * 0.004;
    V.vm.position.set(-this.swayX + bx, this.swayY + by + idle - this.landK * 0.3 - (me.grounded ? 0 : 0.015), this.kickZ);
    V.vm.rotation.set(this.kickZ * 1.2 - this.swayY * 0.5, -this.swayX * 0.8, -this.swayX * 0.6);
    const R = V.right, L = V.left; R.position.copy(V.rightRest); R.rotation.set(0, 0, 0); L.position.copy(V.leftRest); L.rotation.set(0, 0, 0);
    // reload: dip and turn the weapon (the off hand follows a two-handed grip)
    if (this.reloadT > 0) { this.reloadT -= dt; const k = Math.sin(clamp(1 - this.reloadT / this.reloadD, 0, 1) * Math.PI); R.rotation.set(-0.5 * k, 0.3 * k, 0.6 * k); R.position.y -= 0.12 * k; if (V.hold.gripL) { L.position.y -= 0.2 * k; L.position.x -= 0.05 * k; } }
    // knives: a wide cut from one side to the other, alternating hands
    if (this.slashT > 0) {
      this.slashT -= dt; const k = 1 - this.slashT / 0.4, e = Math.sin(clamp(k, 0, 1) * Math.PI), sd = this.slashSide, H = sd > 0 ? R : L, sx = sd > 0 ? 1 : -1;
      H.position.x += sx * (0.12 - k * 0.32); H.position.y += e * 0.08; H.position.z -= e * 0.2;
      H.rotation.set(-0.3 * e, sx * (0.8 - k * 1.6), sx * (-0.9 + k * 0.6));
    }
    // flame: the nozzle bucks and glows; beam: the staff lifts and the orb pulses
    if (f & F_FLAME) { R.position.x += rand(-0.004, 0.004); R.position.y += rand(-0.004, 0.004); R.rotation.x += 0.04; }
    if (me.heat > 0 || me.overheat > 0) { const h = me.overheat > 0 ? 1 : me.heat; R.rotation.z += h * 0.06 * Math.sin(G.time * 40); }
    if (V.kind === 'beam') { const on = !!(f & F_BEAM); this.beamK = damp(this.beamK || 0, on ? 1 : 0, 10, dt); R.position.y += this.beamK * 0.05; R.rotation.x += this.beamK * 0.12 + Math.sin(G.time * 22) * 0.01 * this.beamK; }
    if (V.key === 'wick') { R.rotation.z = Math.sin(G.time * 2.2) * 0.08 + this.swayX * 2; R.rotation.x = Math.sin(G.time * 1.7) * 0.05; }
    if (this.throwT > 0 && V.kind === 'proj' && (V.key === 'mire' || V.key === 'spindle')) { /* handled below as the off hand */ }
    // the power in the off hand
    const P = me.P, pw = me.pw, off = V.off; let offOn = false;
    if (P.key === 'snare' && pw.placing > 0) { offOn = true; const k = 1 - pw.placing / P.place; off.position.set(-0.22, -0.3 - k * 0.15, -0.5 + k * 0.05); off.rotation.set(-0.6 - k * 0.6, 0, 0); }
    if (P.key === 'glaive' && (pw.winding || this.throwT > 0)) { offOn = true; const w = pw.winding ? clamp(pw.wind / P.windMax, 0, 1) : 0; if (this.throwT > 0) { this.throwT -= dt; const k = 1 - this.throwT / 0.35; off.position.set(-0.1 + k * 0.1, -0.15 - k * 0.25, -0.6 - k * 0.3); off.rotation.set(-0.3 - k, 0, 0.6); } else { off.position.set(-0.3 - w * 0.1, -0.12 + w * 0.08, -0.32 + w * 0.12); off.rotation.set(0.2 + w * 0.5, 0, 0.4 + w * 0.3); } if (V.extra.prop) V.extra.prop.rotation.y = G.time * (pw.winding ? 14 * w : 0); }
    if (P.key === 'blink' && (pw.charging || this.blinkT > 0)) { offOn = true; const k = pw.charging ? clamp(pw.chargeT / P.chargeTime, 0, 1) : 1; off.position.set(-0.24, -0.24 + k * 0.04, -0.46); off.rotation.set(-0.2, 0, 0); V.extra.orb.scale.setScalar(0.5 + k * 1.2 + Math.sin(G.time * 30) * 0.08); V.extra.ring.rotation.set(G.time * 3, G.time * 5, 0); V.extra.ring.scale.setScalar(0.6 + k); }
    if (P.key === 'lantern' && (pw.placing > 0 || pw.chan > 0 || pw.hold > 0.1)) { offOn = true; const k = pw.placing > 0 ? 1 - pw.placing / P.place : pw.chan > 0 ? 1 - pw.chan / P.walk : 0.3; off.position.set(-0.2, -0.32 + k * 0.1, -0.42 - k * 0.1); off.rotation.set(-0.2 - k * 0.3, 0, 0); if (V.extra.prop) V.extra.prop.userData.flame.scale.setScalar(1 + (pw.chan > 0 ? k * 2 : 0) + Math.sin(G.time * 25) * 0.1); }
    if ((P.key === 'line' || P.key === 'sub' || P.key === 'rewind') && this.throwT > 0 && V.extra.orb) { offOn = true; this.throwT -= dt; const k = 1 - this.throwT / 0.35; off.position.set(-0.22 + k * 0.08, -0.22 + k * 0.05, -0.42 - k * 0.25); off.rotation.set(-0.4 * k, 0, 0); V.extra.orb.scale.setScalar(1.4 - k); V.extra.ring.rotation.set(G.time * 6, G.time * 4, 0); V.extra.ring.scale.setScalar(0.5 + k * 1.5); }
    else if (this.throwT > 0 && P.key !== 'glaive') this.throwT -= dt;
    if (this.blinkT > 0) this.blinkT -= dt;
    off.visible = offOn;
    if (P.key === 'ram') { const r = pw.state === 'rev' || pw.state === 'charge'; R.position.x += r ? 0.06 : 0; R.rotation.z += r ? -0.25 : 0; R.position.y += r ? -0.06 : 0; }
    // a faded Veil sees her own hands faded too
    const cl = cloakLevel(me), fadeLook = cl > 0.5 || me.st.night > 0;
    if (fadeLook !== this.fadeLook) { this.fadeLook = fadeLook; for (const m of this.vmMats) m.material = fadeLook ? SHIMMER_MAT : (m.userData.base || m.material); }
    if (me.st.fatigue > 0) { V.vm.position.y -= 0.08; V.vm.rotation.x -= 0.25; }
    // muzzle flash
    this.flashT -= dt; if (this.flashes) this.flashes.forEach(s => { s.visible = this.flashT > 0; s.material.rotation = Math.random() * TAU; });
    G.vmFill.intensity = this.flashT > 0 ? 3 : (f & F_FLAME ? 2 + Math.random() : 0);
  },
  deathView(dt) {
    const me = Game.me, cam = G.camera; this.deathCam = true; this.deathT += dt;
    let focus = me.renderPos || me.pos;
    const M = Game.match;
    // elimination: watch a teammate who is still standing
    if (M && M.mode === 'elim' && this.deathT > 2.5) { const al = Game.actors.filter(a => a.alive && !isEnemy(me, a)); if (al.length) focus = (al[this.specI % al.length].renderPos || al[this.specI % al.length].pos); }
    else { const k = Game.byId.get(me.killer); if (k && k.alive && this.deathT > 1) focus = k.renderPos || k.pos; }
    const ang = this.deathT * 0.25 + me.yaw, d = 5.5;
    const tgt = new V3(focus.x, focus.y + 1.2, focus.z), want = new V3(focus.x + Math.sin(ang) * d, focus.y + 3.2, focus.z + Math.cos(ang) * d);
    const h = World.ray(tgt.x, tgt.y, tgt.z, want.x - tgt.x, want.y - tgt.y, want.z - tgt.z, 1, -9);
    if (h) want.lerpVectors(tgt, want, Math.max(0.15, h.t - 0.08));
    cam.position.lerp(want, 1 - Math.exp(-4 * dt)); cam.lookAt(tgt); cam.updateMatrixWorld();
  },
};

// ---------------------------------------------------------------- HUD
const HUD = {
  feedList: [], nums: [], arcs: [], tags: new Map(), boardOn: false, lastHit: 0,
  init() {
    this.el = $('#hud');
    for (let i = 0; i < 24; i++) { const d = document.createElement('div'); d.className = 'dmgnum'; $('#nums').appendChild(d); this.nums.push({ d, t: 0 }); }
    for (let i = 0; i < 6; i++) { const d = document.createElement('div'); d.className = 'arc'; $('#arcs').appendChild(d); this.arcs.push({ d, t: 0, pos: null }); }
  },
  start() {
    this.el.hidden = false; $('#endscreen').hidden = true; $('#deathpanel').hidden = true; $('#board').hidden = true; this.feedList = []; $('#feed').innerHTML = '';
    this.buildKit();
    const n = (Settings.tipsShown | 0); if (n < 3) { Settings.tipsShown = n + 1; Settings.save(); $('#tips').hidden = false; $('#tips').style.opacity = 1; clearTimeout(this.tipT); this.tipT = setTimeout(() => { $('#tips').style.opacity = 0; setTimeout(() => $('#tips').hidden = true, 700); }, 9000); }
  },
  stop() { this.el.hidden = true; $('#endscreen').hidden = true; $('#deathpanel').hidden = true; for (const t of this.tags.values()) t.remove(); this.tags.clear(); },
  buildKit() {
    const me = Game.me; if (!me) return; const H = me.H;
    $('#kit-hero').textContent = H.name; $('#kit-title').textContent = H.title;
    $('#kit-power-icon').innerHTML = iconSVG(POWER_ICON[me.P.key]); $('#kit-power-name').textContent = H.power.name;
    $('#kit-addons').innerHTML = me.addons.map(i => { const a = H.addons[i]; return `<div class="mini r${a.r}" title="${esc(a.name)}">${iconSVG(a.icon)}</div>`; }).join('') || '<div class="mini empty"></div><div class="mini empty"></div>';
    $('#kit-util-name').textContent = H.util.name; $('#kit-ult-name').textContent = H.ult.name;
    $('#weapon-name').textContent = H.weapon.name;
    document.documentElement.style.setProperty('--hero', '#' + new THREE.Color(H.glow).getHexString());
  },
  respawned() { $('#deathpanel').hidden = true; this.buildKit(); },
  readyToSpawn() { return true; },
  died(k, how) {
    const me = Game.me; $('#deathpanel').hidden = false;
    const killer = k && k !== me ? `<b style="color:${'#ff5a6a'}">${esc(k.name)}</b> <span class="dim">· ${esc(k.H.name)}</span>` : '<b>yourself</b>';
    $('#death-by').innerHTML = `Eliminated by ${killer}${how && how !== 'weapon' ? ` <span class="how">${esc(howName(k, how))}</span>` : ''}`;
    if (k && k !== me) $('#death-kit').innerHTML = k.addons.map(i => { const a = k.H.addons[i]; return `<span class="chip r${a.r}">${iconSVG(a.icon)}${esc(a.name)}</span>`; }).join('');
    else $('#death-kit').innerHTML = '';
  },
  hit(t, d, head, kill) {
    const hm = $('#hitmark'); hm.className = 'show' + (head ? ' head' : ''); void hm.offsetWidth; hm.className = 'show anim' + (head ? ' head' : '');
    if (Game.t - this.lastHit > 0.045) { Sfx.play(head ? 'head' : 'hit', null, 0.8); this.lastHit = Game.t; }
    const p = (t.renderPos || t.pos).clone(); p.y += head ? 1.9 : 1.4;
    const n = this.nums.find(x => x.t <= 0) || this.nums[0];
    // stack numbers on the same target into one
    const same = this.nums.find(x => x.t > 0.5 && x.tid === t.id);
    if (same) { same.v += d; same.d.textContent = Math.round(same.v); same.t = 0.9; same.head = same.head || head; same.d.className = 'dmgnum on' + (same.head ? ' head' : ''); return; }
    n.v = d; n.tid = t.id; n.pos = p; n.t = 0.9; n.head = head; n.d.textContent = Math.round(d); n.d.className = 'dmgnum on' + (head ? ' head' : '');
    n.ox = rand(-20, 20);
  },
  hurt(d, from) {
    G.fx.damage = Math.min(1, G.fx.damage + d / 80); Sfx.play('hurt', null, 0.6); View.shake(Math.min(0.6, d / 80));
    if (from) { const a = this.arcs.find(x => x.t <= 0) || this.arcs[0]; a.t = 1.2; a.pos = from.clone(); }
  },
  feed(k, v, how) {
    if (!v) return;
    const me = Game.me, cls = a => !a ? '' : a === me ? 'me' : me && isEnemy(me, a) ? 'foe' : 'ally';
    const icon = how && how !== 'weapon' ? `<span class="how">${esc(howName(k, how))}</span>` : `<span class="how">${esc(k ? k.H.weapon.name : '')}</span>`;
    const html = k && k !== v ? `<span class="${cls(k)}">${esc(k.name)}</span>${icon}<span class="${cls(v)}">${esc(v.name)}</span>` : `<span class="${cls(v)}">${esc(v.name)}</span><span class="how">fell</span>`;
    const d = document.createElement('div'); d.className = 'fe' + (k === me || v === me ? ' mine' : ''); d.innerHTML = html; $('#feed').prepend(d);
    this.feedList.unshift({ d, t: 6 }); while (this.feedList.length > 6) this.feedList.pop().d.remove();
  },
  killBanner(v, how) { const b = $('#killbanner'); b.innerHTML = `<small>ELIMINATED</small>${esc(v ? v.name : '')}`; b.className = 'on'; clearTimeout(this.kbT); this.kbT = setTimeout(() => b.className = '', 1600); },
  note(text, kind = '') {
    const n = document.createElement('div'); n.className = 'note ' + kind; n.textContent = text; $('#notes').appendChild(n);
    setTimeout(() => n.classList.add('out'), kind === 'big' ? 1800 : 2600); setTimeout(() => n.remove(), kind === 'big' ? 2400 : 3200);
    while ($('#notes').children.length > 4) $('#notes').firstChild.remove();
  },
  board(on) { this.boardOn = on && Game.state === 'play'; $('#board').hidden = !this.boardOn; if (this.boardOn) this.renderBoard($('#board')); },
  renderBoard(el, final) {
    const M = Game.match; if (!M) return;
    const row = a => `<tr class="${a === Game.me ? 'me' : ''}${a.alive ? '' : ' dead'}"><td class="nm"><span class="hdot" style="background:#${new THREE.Color(a.H.glow).getHexString()}"></span>${esc(a.name)}${a.isBot ? ' <i>BOT</i>' : ''}</td><td>${a.H.name}</td><td class="ads">${a.addons.map(i => { const x = a.H.addons[i]; return `<span class="mini r${x.r}" title="${esc(x.name)}">${iconSVG(x.icon)}</span>`; }).join('')}</td><td>${a.k}</td><td>${a.a || 0}</td><td>${a.d}</td></tr>`;
    const head = '<tr><th>Player</th><th>Hero</th><th>Add-ons</th><th>E</th><th>A</th><th>D</th></tr>';
    if (M.mode === 'ffa') { const all = [...Game.actors].sort((x, y) => y.k - x.k); el.innerHTML = `<table>${head}${all.map(row).join('')}</table>`; return; }
    const me = Game.me, mine = me ? me.team : 0;
    const side = t => { const l = Game.actors.filter(a => a.team === t).sort((x, y) => y.k - x.k); return `<div class="side ${t === mine ? 'ally' : 'foe'}"><h4>${TEAM_NAME[t]} <b>${scoreText(t)}</b></h4><table>${head}${l.map(row).join('')}</table></div>`; };
    el.innerHTML = side(mine) + side(1 - mine);
    void final;
  },
  end(won, drops) {
    const M = Game.match, el = $('#endscreen'); el.hidden = false; $('#deathpanel').hidden = true;
    const D = $('#end-drops');
    if (drops && drops.got.length) {
      const H = HEROES[drops.hero];
      D.innerHTML = `<small>${drops.got.length === 3 ? 'VICTORY CACHE' : drops.got.length === 2 ? 'DRAW CACHE' : 'CONSOLATION'} · ${esc(H.name)}</small><div class="drops">${drops.got.map((i, n) => { const a = H.addons[i]; return `<div class="drop r${a.r}" style="--d:${0.5 + n * 0.55}s"><i>${iconSVG(a.icon)}</i><b>${esc(a.name)}</b><span>${RARITY[a.r].name}</span><em>×${Inventory.count(drops.hero, i)} owned</em></div>`; }).join('')}</div>`;
      drops.got.forEach((i, n) => setTimeout(() => Sfx.play(H.addons[i].r >= 3 ? 'ultReady' : 'pickup', null, 0.6 + H.addons[i].r * 0.1), 500 + n * 550));
    } else D.innerHTML = M.t <= 45 ? '<small class="dim">No add-ons — the match was too short</small>' : '';
    const title = M.win === -1 ? 'DRAW' : won ? 'VICTORY' : 'DEFEAT';
    $('#end-title').textContent = title; $('#end-title').className = M.win === -1 ? '' : won ? 'win' : 'lose';
    $('#end-sub').textContent = M.mode === 'ffa' ? (M.winName ? `${M.winName} wins` : '') : `${MODES[M.mode].name} · ${MAPS[M.map].name} · ${scoreText(0)} – ${scoreText(1)}`;
    this.renderBoard($('#end-board'), true);
    // the stand-out player
    const mvp = [...Game.actors].sort((a, b) => (b.k * 2 + (b.a || 0) - b.d) - (a.k * 2 + (a.a || 0) - a.d))[0];
    $('#end-mvp').innerHTML = mvp ? `<small>STANDOUT</small><b>${esc(mvp.name)}</b> <span>${mvp.H.name} · ${mvp.k} / ${mvp.a || 0} / ${mvp.d}</span>` : '';
    $('#end-actions').innerHTML = Net.online() ? `<span class="dim">${Net.isHost() ? 'Back to the lobby in a moment…' : 'Waiting for the host…'}</span><button class="btn ghost" data-act="leave">Leave</button>` : `<button class="btn primary" data-act="again">Play again</button><button class="btn ghost" data-act="leave">Main menu</button>`;
  },
  update(dt) {
    const me = Game.me, M = Game.match; if (!me || !M) return;
    G.fx.damage = Math.max(0, G.fx.damage - dt * 1.2); G.fx.heal = Math.max(0, G.fx.heal - dt * 1.5);
    G.fx.blind = damp(G.fx.blind, me.st.blind > 0 ? 1 : 0, 6, dt);
    G.fx.desat = damp(G.fx.desat, me.alive ? (me.hp < me.maxHp * 0.3 ? 0.3 : 0) : 0.6, 4, dt);
    G.fx.tint = damp(G.fx.tint, cloakLevel(me) > 0.5 || me.st.night > 0 ? 1 : me.st.fatigue > 0 ? 0.5 : 0, 6, dt);
    // vitals
    const hpf = clamp(me.hp / me.maxHp, 0, 1);
    $('#hp-num').textContent = Math.max(0, Math.ceil(me.hp)); $('#hp-max').textContent = '/' + me.maxHp;
    $('#hp-fill').style.transform = `scaleX(${hpf})`; $('#hp').classList.toggle('low', hpf < 0.3);
    const W = me.H.weapon;
    if (W.kind === 'flame') { const oh = me.overheat > 0; $('#ammo-num').textContent = oh ? 'VENT' : Math.round(me.heat * 100) + '%'; $('#ammo-max').textContent = ' heat'; $('#ammo').classList.toggle('reload', oh); $('#reload-fill').style.transform = `scaleX(${oh ? 1 - me.overheat / W.lockout : me.heat})`; }
    else if (W.kind === 'beam') { $('#ammo-num').textContent = Math.round(me.tide); $('#ammo-max').textContent = ' tide'; $('#ammo').classList.toggle('reload', me.tide < 10); $('#reload-fill').style.transform = `scaleX(${me.tide / 100})`; }
    else if (W.kind === 'melee') { $('#ammo-num').textContent = '∞'; $('#ammo-max').textContent = ''; $('#ammo').classList.remove('reload'); $('#reload-fill').style.transform = 'scaleX(0)'; }
    else { $('#ammo-num').textContent = me.reloadT > 0 ? '—' : me.ammo; $('#ammo-max').textContent = '/' + W.mag; $('#ammo').classList.toggle('reload', me.reloadT > 0); $('#reload-fill').style.transform = `scaleX(${me.reloadT > 0 ? 1 - me.reloadT / W.reload : 0})`; }
    this.powerWidget(me);
    const uf = me.utilT > 0 ? me.utilT / me.H.util.cd : 0;
    $('#kit-util').classList.toggle('cool', uf > 0); $('#kit-util-cd').textContent = uf > 0 ? Math.ceil(me.utilT) : ''; $('#kit-util').style.setProperty('--cd', uf);
    const ready = me.ult >= 100; $('#kit-ult').classList.toggle('ready', ready); $('#kit-ult-pct').textContent = ready ? 'Q' : Math.floor(me.ult) + '%'; $('#kit-ult').style.setProperty('--u', me.ult / 100);
    if (ready && !this.ultWas) Sfx.play('ultReady'); this.ultWas = ready;
    // statuses
    const st = me.st, chips = [];
    if (st.root > 0) chips.push(['ROOTED', 'bad']); if (st.stun > 0) chips.push(['STUNNED', 'bad']); if (st.slows && st.slows.length) chips.push(['SLOWED', 'bad']);
    if (st.charm) chips.push(['PUPPETED', 'bad']); if (st.vulnT > 0) chips.push(['VULNERABLE', 'bad']); if (st.blind > 0) chips.push(['BLINDED', 'bad']); if (st.shield) chips.push(['SHELL', 'good']); if (st.swift > 0) chips.push(['SWIFT', 'good']);
    if (st.fatigue > 0) chips.push(['FATIGUED', 'bad']); if (st.reveal > 0) chips.push(['REVEALED', 'bad']); if (st.dots && st.dots.length) chips.push([{ poison: 'POISONED', burn: 'BURNING', acid: 'MELTING' }[st.dots[0].kind] || 'BLEEDING', 'bad']);
    if (st.strike > 0 && me.P.key === 'blink') chips.push(['RIFT STRIKE', 'good']); if (st.ambush > 0) chips.push(['AMBUSH READY', 'good']); if (st.unbound > 0) chips.push(['UNBOUND ' + Math.ceil(st.unbound), 'good']); if (st.night > 0) chips.push(['NIGHTFALL ' + Math.ceil(st.night), 'good']);
    if (me.spawnProt > 0) chips.push(['PROTECTED', 'good']);
    const ch = chips.map(c => `<span class="${c[1]}">${c[0]}</span>`).join(''); if (ch !== this.chipsWas) { $('#status').innerHTML = ch; this.chipsWas = ch; }
    this.header(M, me);
    // feed ageing
    for (const f of this.feedList) { f.t -= dt; f.d.style.opacity = clamp(f.t, 0, 1); }
    // floating numbers
    const cam = G.camera, w = G.cw, h = G.ch;
    for (const n of this.nums) {
      if (n.t <= 0) { if (n.d.className !== 'dmgnum') n.d.className = 'dmgnum'; continue; }
      n.t -= dt; const v = n.pos.clone(); v.y += (0.9 - n.t) * 0.8; v.project(cam);
      if (v.z > 1) { n.d.style.opacity = 0; continue; }
      n.d.style.transform = `translate(${(v.x * 0.5 + 0.5) * w + n.ox}px, ${(-v.y * 0.5 + 0.5) * h}px)`; n.d.style.opacity = clamp(n.t * 2.5, 0, 1);
    }
    // damage direction arcs
    for (const a of this.arcs) {
      if (a.t <= 0) { a.d.style.opacity = 0; continue; } a.t -= dt;
      const ang = Math.atan2(a.pos.x - me.pos.x, a.pos.z - me.pos.z) - Math.atan2(-Math.sin(me.yaw), -Math.cos(me.yaw));
      a.d.style.transform = `rotate(${-ang}rad)`; a.d.style.opacity = clamp(a.t, 0, 1);
    }
    this.nameTags(me, cam, w, h);
    $('#clickhint').hidden = Input.locked || !!UI.cur || M.st === 'end';
    $('#xhair').className = 'x' + (Settings.xhair | 0) + (me.alive && (cloakLevel(me) < 0.5 || me.P.shootCloaked || me.P.perma) && !(me.st.fatigue > 0) && me.reloadT <= 0 && !isSub(me) ? '' : ' off') + (me.H.weapon.kind === 'beam' && me.beamT ? ' lock' : '');
    // death panel countdown
    if (!me.alive) {
      const t = M.mode === 'elim' ? null : Math.max(0, Math.ceil(me.respawnT));
      $('#death-timer').textContent = M.mode === 'elim' ? (M.rd.ph === 'fight' ? 'Spectating — you are back next round' : '') : t > 0 ? `Back in ${t}` : 'Deploying…';
    }
    if (this.boardOn && (this.bT = (this.bT || 0) - dt) <= 0) { this.bT = 0.5; this.renderBoard($('#board')); }
  },
  powerWidget(me) {
    const P = me.P, pw = me.pw, el = $('#kit-power'); let pips = '', bar = 0, label = '', cd = 0, state = '';
    if (P.key === 'snare') { pips = pipHTML(pw.charges, P.carry); if (pw.charges < P.carry) bar = pw.rech / P.recharge; label = pw.placing > 0 ? 'SETTING' : ''; }
    else if (P.key === 'blink') { const unb = me.st.unbound > 0; pips = unb ? '<i class="inf">∞</i>' : pipHTML(pw.charges, P.charges); if (pw.charging) { bar = pw.chargeT / P.chargeTime; label = Math.round(lerp(P.minDist, P.maxDist, bar)) + ' m'; state = 'charging'; } else if (me.st.fatigue > 0) { label = 'FATIGUE'; state = 'bad'; } else if (pw.charges < P.charges) bar = pw.rech / P.recharge; }
    else if (P.key === 'ram') { if (pw.state === 'rev') { bar = pw.t / P.rev; label = 'REVVING'; state = 'charging'; } else if (pw.state === 'charge') { bar = 1 - pw.t / P.dur; label = 'CHARGE'; state = 'active'; } else if (pw.state === 'crash') { label = 'CRASHED'; state = 'bad'; } else if (pw.cd > 0) cd = pw.cd; }
    else if (P.key === 'fade') { if (pw.state === 'cloaked') { bar = 1 - pw.cloakT / P.maxTime; label = 'FADED'; state = 'active'; } else if (pw.state === 'going') { label = 'FADING'; state = 'charging'; } else if (pw.state === 'coming') { label = 'UNVEILING'; state = 'charging'; } else if (pw.cd > 0) cd = pw.cd; }
    else if (P.key === 'lantern') { if (P.carried) label = 'CARRIED'; else { pips = pipHTML(pw.charges, P.carry); if (pw.chan > 0) { bar = 1 - pw.chan / P.walk; label = 'WALKING'; state = 'charging'; } else if (pw.placing > 0) label = 'LIGHTING'; else if (pw.walkCd > 0) cd = pw.walkCd; else if (pw.charges < P.carry) bar = pw.rech / P.recharge; } }
    else if (P.key === 'sub') { if (pw.state === 'under') { bar = 1 - pw.t / P.maxTime; label = 'SUBMERGED'; state = 'active'; } else if (pw.state === 'sinking') { label = 'SINKING'; state = 'charging'; } else if (pw.cd > 0) cd = pw.cd; }
    else if (P.key === 'line') { pips = pipHTML(pw.charges, P.charges); if (pw.charges < P.charges) bar = pw.rech / P.cd; }
    else if (P.key === 'rewind') { pips = pipHTML(pw.charges, P.charges); if (pw.anchor) { bar = 1 - (Game.t - pw.anchor.t) / P.anchor; label = 'ANCHORED'; state = 'active'; } else if (pw.charges < P.charges) bar = pw.rech / P.cd; }
    else if (P.key === 'glaive') { pips = pipHTML(pw.count, P.cap); if (P.orbit && pw.count) label = 'ORBITING'; if (pw.winding) { bar = clamp((pw.wind - P.windMin) / (P.windMax - P.windMin), 0, 1); label = bar >= 1 ? 'FULL' : 'WIND'; state = 'charging'; } else if (pw.count < P.cap) bar = pw.rech / P.regen; }
    const key = pips + '|' + label + '|' + state + '|' + Math.ceil(cd);
    if (key !== this.pwKey) { this.pwKey = key; $('#kit-pips').innerHTML = pips; $('#kit-power-state').textContent = label || (cd > 0 ? Math.ceil(cd) + 's' : ''); el.className = 'kit power ' + state + (cd > 0 ? ' cool' : ''); }
    $('#kit-power-bar').style.transform = `scaleX(${clamp(bar, 0, 1)})`;
    // a wind-up or charge meter under the crosshair
    const meter = $('#meter'), show = state === 'charging' && (P.key === 'blink' || P.key === 'glaive' || P.key === 'ram');
    meter.hidden = !show; if (show) $('#meter-fill').style.transform = `scaleX(${clamp(bar, 0, 1)})`;
  },
  header(M, me) {
    let html = '';
    const clock = M.tl > 0 ? fmtTime(M.tl) : '';
    if (M.mode === 'ffa') {
      const sorted = [...Game.actors].sort((a, b) => b.k - a.k), lead = sorted[0], mine = me.k;
      html = `<div class="hd ffa"><div class="sc me">${mine}<small>YOU</small></div><div class="mid"><b>${clock}</b><small>FIRST TO ${M.target}</small></div><div class="sc foe">${lead && lead !== me ? lead.k : (sorted[1] ? sorted[1].k : 0)}<small>${esc(lead && lead !== me ? lead.name : sorted[1] ? sorted[1].name : '')}</small></div></div>`;
    } else {
      const t = me.team, o = 1 - t;
      let mid = `<b>${clock}</b><small>${M.mode === 'tdm' ? 'FIRST TO ' + M.target : M.mode === 'koth' ? 'CONTROL' : 'ROUND ' + M.rd.n}</small>`;
      if (M.mode === 'elim') { const alive = tm => Game.actors.filter(a => a.team === tm && a.alive).length; mid = `<b>${M.rd.ph === 'pre' ? Math.ceil(M.rd.t) : fmtTime(Math.max(0, M.rd.t))}</b><small>ROUND ${M.rd.n} · ${alive(t)}v${alive(o)}</small>`; }
      if (M.mode === 'koth') { const Z = M.zone, zs = Z.contest ? 'CONTESTED' : Z.own < 0 ? (Z.cap > 0 ? 'CAPTURING' : 'NEUTRAL') : Z.own === t ? 'HELD' : 'ENEMY HELD'; mid = `<b>${clock}</b><small class="${Z.contest ? 'warn' : Z.own === t ? 'good' : Z.own >= 0 ? 'bad' : ''}">${zs}${Z.cap > 0 ? ' ' + Math.round(Z.cap * 100) + '%' : ''}</small>`; }
      html = `<div class="hd"><div class="sc ally">${scoreText(t)}<small>${TEAM_NAME[t]}</small></div><div class="mid">${mid}</div><div class="sc foe">${scoreText(o)}<small>${TEAM_NAME[o]}</small></div></div>`;
      if (M.mode === 'koth') html += `<div class="bars"><i class="ally" style="width:${M.sc[t]}%"></i><i class="foe" style="width:${M.sc[o]}%"></i></div>`;
      if (M.mode === 'elim') html += `<div class="pips">${pipRow(M.rd.w[t], M.target, 'ally')}<span></span>${pipRow(M.rd.w[o], M.target, 'foe')}</div>`;
    }
    if (html !== this.hdWas) { $('#header').innerHTML = html; this.hdWas = html; }
  },
  nameTags(me, cam, w, h) {
    const seen = new Set();
    for (const a of Game.actors) {
      if (a === me || !a.alive || !a.model || !a.model.root.visible) continue;
      const enemy = isEnemy(me, a), p = (a.renderPos || a.pos).clone(); p.y += 2.25;
      const dist = cam.position.distanceTo(p);
      const show = !enemy ? dist < 60 : (Game.t - a.lastDmgT < 3 || (a.flags || actorFlags(a)) & F_REVEAL) && dist < 60;
      if (!show) continue;
      const v = p.clone().project(cam); if (v.z > 1 || Math.abs(v.x) > 1.1 || Math.abs(v.y) > 1.1) continue;
      if (!enemy && !World.clear(cam.position.x, cam.position.y, cam.position.z, p.x, p.y - 0.4, p.z) && dist > 25) continue;
      seen.add(a.id);
      let el = this.tags.get(a.id);
      if (!el) { el = document.createElement('div'); el.className = 'tag'; el.innerHTML = '<span class="n"></span><i><b></b></i>'; $('#tags').appendChild(el); this.tags.set(a.id, el); }
      el.className = 'tag ' + (enemy ? 'foe' : 'ally'); el.firstChild.textContent = enemy ? '' : a.name;
      el.lastChild.firstChild.style.transform = `scaleX(${clamp(a.hp / a.maxHp, 0, 1)})`;
      el.style.transform = `translate(${(v.x * 0.5 + 0.5) * w}px, ${(-v.y * 0.5 + 0.5) * h}px) scale(${clamp(14 / dist, 0.6, 1)})`;
    }
    for (const [id, el] of this.tags) if (!seen.has(id)) { el.remove(); this.tags.delete(id); }
  },
};
function pipHTML(n, max) { let s = ''; for (let i = 0; i < max; i++) s += `<i class="${i < n ? 'on' : ''}"></i>`; return s; }
function pipRow(n, max, cls) { let s = `<span class="${cls}">`; for (let i = 0; i < max; i++) s += `<i class="${i < n ? 'on' : ''}"></i>`; return s + '</span>'; }
function fmtTime(t) { t = Math.max(0, Math.ceil(t)); return Math.floor(t / 60) + ':' + String(t % 60).padStart(2, '0'); }
function scoreText(t) { const M = Game.match; if (!M) return 0; if (M.mode === 'koth') return Math.floor(M.sc[t]) + '%'; if (M.mode === 'elim') return M.rd.w[t]; return Math.floor(M.sc[t]); }
function howName(k, how) {
  if (!k) return how;
  const map = { snare: k.H.power.name, blink: 'Rift Step', ram: 'Ramjet', glaive: 'Glaive', ambush: 'Ambush', backstab: 'Backstab', knives: 'Whisper Knives', slam: k.H.ult.name, burn: 'Burning', bleed: 'Bleed', poison: 'Venom', acid: 'Acid', flame: 'Boiler', beam: 'Tidecaller', furnace: 'Furnace', lantern: 'Lantern', beacon: 'Beacon', flare: k.H.ult.name, geyser: 'Geyser', drown: 'Drowned', line: 'Marionette Line', leech: k.H.util.name, cradle: k.H.ult.name, heart: k.H.ult.name, bolt: 'Rattlejaw', shard: 'Shardcaster', moth: 'Moth Swarm', flask: "Brewer's Flasks", needle: 'Thread Needles', hand: 'Second Hand', rewind: 'Rewind', stop: k.H.ult.name };
  return map[how] || how;
}

// ---------------------------------------------------------------- the power, as numbers: what the add-ons changed
function powerStats(heroKey, addons) {
  const B = powerFor(heroKey, []), P = powerFor(heroKey, addons), out = [];
  const row = (label, k, fmt = v => v, better = 1) => { const a = B[k], b = P[k]; const ch = a !== b; out.push({ label, val: fmt(b), ch, good: ch ? (typeof b === 'boolean' ? b : (b - a) * better > 0) : null }); };
  const opt = (label, k, fmt, better) => { if (P[k]) row(label, k, fmt, better); };
  const s = v => (Math.round(v * 100) / 100) + ' s', m = v => (Math.round(v * 10) / 10) + ' m', n = v => Math.round(v), pct = v => Math.round(v * 100) + '%', yes = v => v ? 'Yes' : '—', ps = v => Math.round(v) + '/s';
  if (P.key === 'snare') { if (P.auto) row('Snares grow every', 'auto', s, -1); else { row('Snares carried', 'carry', n); row('Recharge', 'recharge', s, -1); } row('Arming time', 'arm', s, -1); row('Damage', 'dmg', n); if (!P.noRoot) row('Root', 'root', s); else row('Never roots', 'noRoot', yes, -1); row('Trigger radius', 'radius', m); row('Enemies see it within', 'visDist', m, -1); row('Throw range', 'throwDist', v => v ? m(v) : 'At your feet'); opt('Bleed', 'bleed', n); opt('Explosion', 'explode', n); opt('Tripwire pulses', 'chain', yes); opt('Bell reveal radius', 'bell', m); opt('Vulnerable for', 'vuln', s); row('Reveal', 'reveal', s); }
  if (P.key === 'blink') { row('Blinks per chain', 'charges', n); row('Recharge each', 'recharge', s, -1); row('Charge time', 'chargeTime', s, -1); row('Max distance', 'maxDist', m); if (!P.noFatigue) row('Fatigue per blink', 'fatiguePer', s, -1); row('Rift Strike bonus', 'strike', pct); opt('Arrival blast', 'arriveDmg', n); opt('Pass-through damage', 'lineDmg', n); opt('Heal per blink', 'heal', n); opt('Decoy', 'decoy', yes); opt('No fatigue', 'noFatigue', yes); opt('Blinks go any direction', 'vertical', yes); opt('Rift detonates after', 'rift', s); opt('Health per blink', 'hpCost', n, -1); }
  if (P.key === 'ram') { row('Rev time', 'rev', s, -1); row('Charge speed', 'speed', v => Math.round(v * 10) / 10 + ' m/s'); row('Charge length', 'dur', s); row('Turning', 'turn', v => Math.round(v * 57) + '°/s'); row('Ram damage', 'dmg', n); row('Knockback', 'knock', n); row('Cooldown', 'cd', s, -1); row('Crash stun', 'crashStun', s, -1); opt('Burning trail', 'trail', ps); opt('Plough through', 'multi', yes); opt('Crash shockwave', 'shock', n); opt('Execute below', 'execute', pct); opt('Vent on contact', 'vent', yes); opt('Bounce off walls', 'bounce', yes); opt('Unstoppable', 'jugg', yes); opt('Burns your own health', 'furnace', yes, -1); }
  if (P.key === 'fade') { if (P.perma) row('Always faded', 'perma', yes); else { row('Fade time', 'fadeIn', s, -1); row('Unveil time', 'fadeOut', s, -1); row('Max time faded', 'maxTime', s); row('Cooldown', 'cd', s, -1); } row('Faded speed', 'speed', pct); row('Ambush bonus', 'ambush', n); row('Shimmer seen within', 'shimmer', m, -1); opt('Regen while faded', 'regen', ps); opt('Ambush cleaves', 'cleave', yes); opt('Blind on unveil', 'blind', s); opt('Sense enemies within', 'sense', m); opt('Strike while faded', 'shootCloaked', yes); opt('Silent footsteps', 'silent', yes); opt('Swift on unveil', 'swift', s); opt('Unveil behind target', 'shadowStep', yes); }
  if (P.key === 'glaive') { row('Glaives carried', 'cap', n); row('Return time', 'regen', s, -1); if (P.orbit) row('Glaives orbit you', 'orbit', yes); else { row('Full wind-up', 'windMax', s, -1); row('Damage', 'dmgMax', v => `${Math.round(P.dmgMin)}–${Math.round(v)}`); row('Throw speed', 'spdMax', v => Math.round(v) + ' m/s'); row('Move while winding', 'slow', pct); } opt('Venom', 'venom', n); opt('Ricochets', 'ricochet', n); opt('Burst damage', 'blast', n); opt('Twin throw', 'twin', yes); opt('Bloodtrail reveal', 'mark', s); opt('Full wind-up kills', 'oneshot', yes); opt('Glaives return', 'returning', yes); opt('Pierce', 'pierce', yes); }
  if (P.key === 'lantern') { if (P.carried) row('Lantern carried with you', 'carried', yes); else { row('Lanterns hung', 'carry', n); row('Recharge', 'recharge', s, -1); row('Lantern walk', 'walk', s, -1); row('Walk cooldown', 'walkCd', s, -1); } row('Light radius', 'radius', m); row('Slow in light', 'slow', v => Math.round((1 - v) * 100) + '%', -1); opt('Light lingers', 'linger', s); opt('Throw range', 'throwDist', m); opt('Echo reveal', 'echo', s); opt('Roots on first touch', 'root', s); opt('Burn', 'burn', ps); opt('Beams between lanterns', 'beacon', n); opt('Hidden from enemies', 'hidden', yes); opt('Turret moths every', 'turret', s, -1); opt('Moth damage', 'mothBoost', pct); }
  if (P.key === 'sub') { row('Sink time', 'sink', s, -1); row('Max time under', 'maxTime', s); row('Speed under', 'speed', pct); row('Cooldown', 'cd', s, -1); row('Geyser damage', 'dmg', n); row('Geyser radius', 'radius', m); row('Launch', 'knock', n); opt('Heal under', 'heal', ps); opt('Acid pool', 'pool', ps); opt('Pulls enemies in', 'pull', yes); opt('Roots', 'root', s); opt('Drown above you', 'drown', ps); opt('Acid trail', 'trail', ps); opt('Flask ring', 'flaskRing', yes); opt('Throw from below', 'artillery', yes); opt('Fen: everything bigger', 'fen', yes); }
  if (P.key === 'rewind') { if (P.anchor) row('Anchor lasts', 'anchor', s); else row('Reaches back', 'back', s); row('Rewinds', 'charges', n); row('Cooldown', 'cd', s, -1); row('Restores health', 'heal', yes); opt('Bonus heal', 'bonus', n); opt('Reloads', 'reload', yes); opt('Silent', 'silent', yes); opt('Cleanses', 'cleanse', yes); opt('Echo lasts', 'decoy', s); opt('Departure blast', 'depart', n); opt('Arrival blast', 'arrive', n); opt('Sand slow', 'sand', s); opt('Cheats death', 'paradox', yes); opt('Drags a victim back', 'retro', yes); opt('Freezes nearby for', 'freeze', s); }
  if (P.key === 'line') { row('Lines', 'charges', n); row('Recharge', 'cd', s, -1); row('Range', 'range', m); row('Line speed', 'speed', v => Math.round(v) + ' m/s'); row('Damage', 'dmg', n); opt('Stun', 'stun', s); opt('Vulnerable', 'vuln', s); opt('Slow', 'slow', s); opt('Swap places', 'swap', yes); opt('Choke (root)', 'choke', s); if (P.multi > 1) row('Catches up to', 'multi', n); opt('Gallows: hurl up', 'gallows', yes); opt('Puppet for', 'puppet', s); opt('Web', 'web', yes); opt('Meet them halfway', 'meet', yes); }
  return out;
}

// ---------------------------------------------------------------- menus
const UI = {
  cur: 'main', lobbyDirty: false, loadoutHero: null, back: 'main',
  init() {
    $('#name').value = Settings.name;
    $('#name').addEventListener('input', e => { Settings.name = cleanName(e.target.value); Settings.save(); });
    document.addEventListener('click', e => {
      const b = e.target.closest('[data-act]'); if (!b) return; Sfx.init(); Sfx.play('ui');
      const act = b.dataset.act, arg = b.dataset.arg;
      this.action(act, arg, b);
    });
    this.buildPlay(); this.buildSettings();
    // a shared link straight into a match
    const q = new URLSearchParams(location.search).get('join');
    if (q && /^[A-Za-z]{4}$/.test(q)) setTimeout(() => Lobby.join(q.toUpperCase()), 300);
  },
  show(name) {
    this.cur = name; $$('.screen').forEach(s => { s.hidden = s.dataset.screen !== name; });
    $('#menus').hidden = !name; document.body.classList.toggle('in-menu', !!name);
    if (name === 'loadout') this.renderLoadout();
    if (name === 'play') this.renderPlay();
    if (name === 'online') { Net.connect(); this.openList(); }
    if (name && Game.state !== 'play') Showcase.focus(name === 'loadout' ? this.loadoutHero || Settings.hero : Settings.hero);
  },
  action(act, arg, el) {
    switch (act) {
      case 'go': this.show(arg); break;
      case 'mode': Settings.mode = arg; Settings.save(); this.renderPlay(); break;
      case 'map': Settings.map = arg; Settings.save(); this.renderPlay(); Showcase.enter(); break;
      case 'size': Settings.size = +arg; Settings.save(); this.renderPlay(); break;
      case 'diff': Settings.diff = +arg; Settings.save(); this.renderPlay(); break;
      case 'hero': Settings.hero = arg; Settings.save(); this.renderPlay(); Showcase.focus(arg); break;
      case 'start': Sfx.init(); Flow.startOffline({ mode: Settings.mode, map: Settings.map, sz: Settings.mode === 'ffa' ? Settings.ffaSize : Settings.size, df: Settings.diff }); break;
      case 'editLoadout': this.loadoutHero = arg || Settings.hero; this.back = this.cur; this.show('loadout'); break;
      case 'lhero': this.loadoutHero = arg; this.renderLoadout(); Showcase.focus(arg); break;
      case 'equip': this.equip(+arg); break;
      case 'unslot': this.unslot(+arg); break;
      case 'useHero': this.useHero(); break;
      case 'loadoutBack': if (Game.state === 'play') { this.show('pause'); } else this.show(this.back === 'loadout' ? 'main' : this.back); break;
      case 'resume': this.resume(); break;
      case 'pauseLoadout': this.loadoutHero = Game.me ? (Game.me.pendingHero ? Game.me.pendingHero.h : Game.me.heroKey) : Settings.hero; this.back = 'pause'; this.show('loadout'); break;
      case 'pauseSettings': this.back = 'pause'; this.show('settings'); break;
      case 'settingsBack': this.show(Game.state === 'play' ? 'pause' : 'main'); break;
      case 'leave': Flow.leave(); break;
      case 'again': { const M = Game.match; Flow.startOffline({ mode: M.mode, map: M.map, sz: M.sz, df: M.df }); break; }
      case 'host': Lobby.host(); break;
      case 'join': { const c = ($('#joincode').value || '').trim().toUpperCase(); if (/^[A-Z]{4}$/.test(c)) Lobby.join(c); else this.toast('Enter the 4-letter code your friend sent you.'); break; }
      case 'joinOpen': Lobby.join(arg); break;
      case 'lobbyTeam': Net.team = +arg; UI.lobbyDirty = true; break;
      case 'lobbyCfg': { const [k, v] = arg.split(':'); Lobby.cfg[k] = k === 'mode' || k === 'map' ? v : +v; Lobby.render(); break; }
      case 'lobbyStart': Lobby.start(); break;
      case 'lobbyLeave': Lobby.leave(); break;
      case 'copyLink': { const url = location.origin + location.pathname + '?join=' + Net.code; navigator.clipboard && navigator.clipboard.writeText(url).then(() => this.toast('Invite link copied'), () => this.toast(url)); break; }
      case 'deathLoadout': this.action('pauseLoadout'); Input.unlock(); break;
      case 'spec': View.specI++; break;
    }
  },
  pause() { this.show('pause'); $('#pause-sub').textContent = Net.online() ? `Online · code ${Net.code}` : 'vs Bots'; },
  resume() { this.show(null); Input.lock(); },
  toast(t) { const d = $('#toast'); d.textContent = t; d.className = 'on'; clearTimeout(this.tT); this.tT = setTimeout(() => d.className = '', 3200); },
  netState() { const s = Net.status, el = $('#netstate'); if (el) el.textContent = s === 'on' ? (Net.connected === false ? 'Reconnecting…' : 'Online') : s === 'checking' ? 'Connecting…' : s === 'off' ? 'Online play is not available in this browser' : 'Offline'; },
  openList() {
    const el = $('#openlist'); if (!el) return;
    if (!Net.open.length) { el.innerHTML = `<div class="empty">${Net.status === 'on' ? 'No open matches right now. Host one and send the code to a friend.' : 'Looking for matches…'}</div>`; return; }
    el.innerHTML = Net.open.map(o => `<button class="openrow" data-act="joinOpen" data-arg="${o.c}"><b>${esc(o.n)}</b><span>${MODES[o.mo].name} · ${MAPS[o.mp].name}</span><span>${o.k} player${o.k > 1 ? 's' : ''}</span><em>${o.st === 'play' ? 'In match' : 'Lobby'}</em><code>${o.c}</code></button>`).join('');
  },
  buildPlay() {},
  renderPlay() {
    const mode = Settings.mode, map = Settings.map;
    $('#play-modes').innerHTML = MODE_KEYS.map(k => `<button class="card mode ${k === mode ? 'sel' : ''}" data-act="mode" data-arg="${k}"><b>${MODES[k].name}</b><span>${MODES[k].desc}</span></button>`).join('');
    $('#play-maps').innerHTML = MAP_KEYS.map(k => `<button class="card map map-${k} ${k === map ? 'sel' : ''}" data-act="map" data-arg="${k}"><b>${MAPS[k].name}</b><span>${MAPS[k].sub}</span></button>`).join('');
    const sizes = mode === 'ffa' ? [4, 5, 6, 8] : [1, 2, 3, 4, 5], cur = mode === 'ffa' ? Settings.ffaSize : Settings.size;
    if (!sizes.includes(cur)) { if (mode === 'ffa') Settings.ffaSize = 6; else Settings.size = 4; }
    $('#play-size').innerHTML = sizes.map(n => `<button class="seg ${n === (mode === 'ffa' ? Settings.ffaSize : Settings.size) ? 'sel' : ''}" data-act="${mode === 'ffa' ? 'ffasize' : 'size'}" data-arg="${n}">${mode === 'ffa' ? n + ' players' : n + 'v' + n}</button>`).join('');
    $$('#play-size [data-act=ffasize]').forEach(b => b.addEventListener('click', () => { Settings.ffaSize = +b.dataset.arg; Settings.save(); this.renderPlay(); }));
    $('#play-diff').innerHTML = BOT_DIFF.map((d, i) => `<button class="seg ${i === Settings.diff ? 'sel' : ''}" data-act="diff" data-arg="${i}">${d.name}</button>`).join('');
    $('#play-heroes').innerHTML = heroCards(Settings.hero, 'hero');
    $('#play-kit').innerHTML = kitSummary(Settings.hero, loadoutFor(Settings.hero));
  },
  buildSettings() {
    const S = Settings, el = $('#settings-form');
    el.innerHTML = `
      <label>Mouse sensitivity <output id="o-sens">${S.sens.toFixed(2)}</output><input type="range" id="s-sens" min="0.2" max="3" step="0.05" value="${S.sens}"></label>
      <label>Field of view <output id="o-fov">${S.fov}°</output><input type="range" id="s-fov" min="75" max="110" step="1" value="${S.fov}"></label>
      <label>Graphics quality<select id="s-q">${QUALITY.map((q, i) => `<option value="${i}" ${i === S.q ? 'selected' : ''}>${q.name}</option>`).join('')}</select></label>
      <label>Volume <output id="o-vol">${Math.round(S.vol * 100)}%</output><input type="range" id="s-vol" min="0" max="1" step="0.05" value="${S.vol}"></label>
      <label>Crosshair<select id="s-xh"><option value="0" ${S.xhair == 0 ? 'selected' : ''}>Dot</option><option value="1" ${S.xhair == 1 ? 'selected' : ''}>Cross</option><option value="2" ${S.xhair == 2 ? 'selected' : ''}>Circle</option></select></label>
      <label class="check"><input type="checkbox" id="s-inv" ${S.invertY ? 'checked' : ''}> Invert mouse Y</label>
      <label class="check"><input type="checkbox" id="s-fps" ${S.showFps ? 'checked' : ''}> Show frame rate</label>`;
    $('#s-sens').oninput = e => { S.sens = +e.target.value; $('#o-sens').textContent = S.sens.toFixed(2); S.save(); };
    $('#s-fov').oninput = e => { S.fov = +e.target.value; $('#o-fov').textContent = S.fov + '°'; S.save(); };
    $('#s-q').onchange = e => { S.q = +e.target.value; S.save(); applyQuality(); };
    $('#s-vol').oninput = e => { S.vol = +e.target.value; $('#o-vol').textContent = Math.round(S.vol * 100) + '%'; Sfx.setVol(S.vol); S.save(); };
    $('#s-xh').onchange = e => { S.xhair = +e.target.value; S.save(); };
    $('#s-inv').onchange = e => { S.invertY = e.target.checked; S.save(); };
    $('#s-fps').onchange = e => { S.showFps = e.target.checked; $('#fps').hidden = !S.showFps; S.save(); };
    $('#fps').hidden = !S.showFps;
  },
  // ------------------------------------------------ the add-on loadout screen
  renderLoadout() {
    const key = this.loadoutHero || Settings.hero, H = HEROES[key], cur = this.pendingLoadout(key);
    $('.lo-panel').style.setProperty('--hero', '#' + new THREE.Color(H.glow).getHexString());
    $('#lo-heroes').innerHTML = heroCards(key, 'lhero');
    $('#lo-name').textContent = H.name; $('#lo-title').textContent = H.title; $('#lo-role').textContent = H.role; $('#lo-blurb').textContent = H.blurb;
    $('#lo-stats').innerHTML = `<span><b>${H.hp}</b> health</span><span><b>${H.speed.toFixed(1)}</b> m/s</span><span><b>${H.weapon.name}</b> ${weaponLine(H.weapon)}</span>`;
    $('#lo-power').innerHTML = `<div class="pw-icon">${iconSVG(POWER_ICON[H.power.key])}</div><div><small>POWER · RIGHT MOUSE / E</small><b>${H.power.name}</b><p>${H.power.desc}</p></div>`;
    $('#lo-slots').innerHTML = [0, 1].map(i => { const a = cur[i] != null ? H.addons[cur[i]] : null; return a ? `<button class="slot r${a.r}" data-act="unslot" data-arg="${i}" title="Remove">${iconSVG(a.icon)}<span>${esc(a.name)}</span><em>×</em></button>` : `<div class="slot empty"><span>Empty slot</span></div>`; }).join('');
    $('#lo-kit').innerHTML = `<div><small>UTILITY · SHIFT</small><b>${H.util.name}</b><p>${H.util.desc}</p></div><div><small>ULTIMATE · Q</small><b>${H.ult.name}</b><p>${H.ult.desc}</p></div>`;
    const sorted = [...H.addons].sort((a, b) => a.r - b.r || a.idx - b.idx);
    $('#lo-gridhead').innerHTML = `ADD-ONS · <b>${Inventory.total(key)}</b> owned — slotting one uses it up when the match starts. Win a match to earn 3, lose to earn 1.`;
    $('#lo-grid').innerHTML = sorted.map(a => { const n = Inventory.count(key, a.idx); return `<button class="addon r${a.r} ${cur.includes(a.idx) ? 'on' : ''} ${n ? '' : 'locked'}" data-act="equip" data-arg="${a.idx}" data-tip="${a.idx}">${iconSVG(a.icon)}<span>${esc(a.name)}</span>${n ? `<em>×${n}</em>` : '<em class="no">0</em>'}</button>`; }).join('');
    $$('#lo-grid .addon').forEach(b => { b.addEventListener('mouseenter', () => this.tip(key, +b.dataset.tip)); b.addEventListener('focus', () => this.tip(key, +b.dataset.tip)); });
    this.tip(key, cur.length ? cur[cur.length - 1] : sorted[0].idx);
    $('#lo-numbers').innerHTML = powerStats(key, cur).map(r => `<div class="${r.ch ? (r.good ? 'up' : 'down') : ''}"><span>${r.label}</span><b>${r.val}</b></div>`).join('');
    const playing = Game.state === 'play', isCur = playing ? (Game.me && (Game.me.pendingHero ? Game.me.pendingHero.h : Game.me.heroKey) === key) : Settings.hero === key;
    $('#lo-use').textContent = playing ? (isCur ? 'Selected — applies on respawn' : 'Play as ' + H.name + ' on respawn') : isCur ? 'Selected' : 'Play as ' + H.name;
    $('#lo-use').disabled = isCur && !playing;
    if (playing && isCur) $('#lo-use').disabled = false;
  },
  pendingLoadout(key) { return loadoutFor(key); },
  tip(key, idx) {
    const a = HEROES[key].addons[idx]; if (!a) return;
    const n = Inventory.count(key, idx), odds = Math.round(RARITY[a.r].drop * 100 / HEROES[key].addons.filter(x => x.r === a.r).length * 10) / 10;
    $('#lo-tip').innerHTML = `<div class="tip-head r${a.r}">${iconSVG(a.icon)}<div><b>${esc(a.name)}</b><small>${RARITY[a.r].name} add-on · ${n ? 'you own ' + n : 'not owned yet'}</small></div></div>${a.d.map(l => `<p class="${l[0] === '-' ? 'minus' : 'plus'}">${esc(l.slice(2))}</p>`).join('')}<p class="odds">About ${odds}% per draw</p>`;
  },
  equip(idx) {
    const key = this.loadoutHero || Settings.hero, cur = loadoutFor(key).slice();
    const i = cur.indexOf(idx);
    if (i < 0 && Inventory.count(key, idx) <= 0 && !Inventory.paid(key, idx)) { this.tip(key, idx); this.toast(`You don't own ${HEROES[key].addons[idx].name} yet — win matches as ${HEROES[key].name} to earn add-ons.`); return; }
    if (i >= 0) cur.splice(i, 1); else { if (cur.length >= 2) cur.shift(); cur.push(idx); Sfx.play('equip'); }
    Settings.loadouts[key] = cur; Settings.save(); this.renderLoadout(); this.applyIfPlaying(key);
  },
  unslot(i) { const key = this.loadoutHero || Settings.hero, cur = loadoutFor(key).slice(); cur.splice(i, 1); Settings.loadouts[key] = cur; Settings.save(); this.renderLoadout(); this.applyIfPlaying(key); },
  useHero() {
    const key = this.loadoutHero || Settings.hero; Settings.hero = key; Settings.save();
    if (Game.state === 'play' && Game.me) { Game.me.pendingHero = { h: key, a: loadoutFor(key) }; this.toast(`${HEROES[key].name} — you'll deploy with this kit next time you spawn`); this.show('pause'); }
    else { UI.lobbyDirty = true; this.renderLoadout(); if (Lobby.active) this.show('lobby'); }
  },
  applyIfPlaying(key) { if (Game.state === 'play' && Game.me && (Game.me.pendingHero ? Game.me.pendingHero.h : Game.me.heroKey) === key) Game.me.pendingHero = { h: key, a: loadoutFor(key) }; UI.lobbyDirty = true; },
};
function heroCards(sel, act) {
  return HERO_KEYS.map(k => { const H = HEROES[k], c = '#' + new THREE.Color(H.look.glow).getHexString(); return `<button class="herocard ${k === sel ? 'sel' : ''}" data-act="${act}" data-arg="${k}" style="--hc:${c}"><i>${iconSVG(POWER_ICON[H.power.key])}</i><b>${H.name}</b><span>${H.role}</span></button>`; }).join('');
}
function kitSummary(key, ad) {
  const H = HEROES[key];
  return `<div class="ks-head"><b>${H.name}</b><span>${H.title}</span></div><div class="ks-power">${iconSVG(POWER_ICON[H.power.key])}<span>${H.power.name}</span></div><div class="ks-ads">${[0, 1].map(i => { const a = ad[i] != null ? H.addons[ad[i]] : null; return a ? `<span class="chip r${a.r}">${iconSVG(a.icon)}${esc(a.name)}</span>` : '<span class="chip empty">Empty slot</span>'; }).join('')}</div><div class="ks-own">${Inventory.total(key)} add-ons owned</div><button class="btn small" data-act="editLoadout" data-arg="${key}">Tune add-ons</button>`;
}
function weaponLine(W) {
  if (W.kind === 'pellets') return `${W.pellets}×${W.dmg} · ${W.mag} shells`;
  if (W.kind === 'burst') return `${W.burst}-round burst · ${W.dmg} each`;
  if (W.kind === 'flame') return `${W.dps} dmg/s · ${W.range} m · overheats`;
  if (W.kind === 'beam') return `${W.dpsMin}–${W.dpsMax} dmg/s · ${W.range} m`;
  if (W.kind === 'melee') return `${W.dmg} per cut · ×${W.backstab} from behind`;
  if (W.kind === 'proj') return `${W.burst ? W.burst + '×' : W.volley ? W.volley + '×' : ''}${W.dmg} dmg${W.splash ? ' + ' + W.splash + ' splash' : ''} · ${W.mag} shots`;
  return `${W.dmg} dmg · ${W.mag} rounds`;
}

// ---------------------------------------------------------------- the online lobby
const Lobby = {
  active: false, cfg: { mode: 'tdm', map: 'kiln', sz: 4, df: 1, st: 'lobby' },
  async host() {
    if (!(await Net.connect())) return;
    const code = Array.from({ length: 4 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ'[Math.floor(Math.random() * 24)]).join('');
    if (!(await Net.join(code, true))) { UI.toast('Could not open a match room. Try again.'); return; }
    this.cfg = { mode: Settings.mode, map: Settings.map, sz: Settings.size, df: Settings.diff, st: 'lobby' };
    this.open(code, true);
  },
  async join(code) {
    UI.show('online');
    if (!(await Net.connect())) return;
    UI.toast('Joining ' + code + '…');
    if (!(await Net.join(code, false))) { UI.toast('Could not join ' + code + '.'); return; }
    this.open(code, false);
  },
  open(code, host) { this.active = true; Net.team = Net.team | 0; UI.show('lobby'); this.render(); this.watch(); history.replaceState(null, '', '?join=' + code); },
  leave() { this.active = false; Net.leave(); history.replaceState(null, '', location.pathname); UI.show('online'); },
  watch() { clearInterval(this.wT); this.wT = setInterval(() => { if (!this.active) return clearInterval(this.wT); if (UI.lobbyDirty || UI.cur === 'lobby') { UI.lobbyDirty = false; if (UI.cur === 'lobby') this.render(); } }, 400); },
  fromHost(m) { if (!m) return; const c = this.cfg, n = { mode: MODES[m.mode] ? m.mode : c.mode, map: MAPS[m.map] ? m.map : c.map, sz: m.sz | 0 || c.sz, df: m.df | 0 }; if (JSON.stringify(n) !== JSON.stringify({ mode: c.mode, map: c.map, sz: c.sz, df: c.df })) { Object.assign(c, n); UI.lobbyDirty = true; } },
  render() {
    const host = Net.isHost(), C = this.cfg, teams = MODES[C.mode].teams;
    $('#lb-code').textContent = Net.code || '····';
    $('#lb-role').textContent = host ? 'You are hosting — send the code or link to your friends' : Net.hostUid ? 'Waiting for the host to start' : 'Connecting to the host…';
    const players = [{ uid: Net.uid, name: Settings.name, team: Net.team, hero: Settings.hero, ad: loadoutFor(Settings.hero), me: true }].concat([...Net.peers.values()].map(p => ({ uid: p.uid, name: p.name, team: p.team, hero: p.hero, ad: p.ad, host: p.uid === Net.hostUid, old: p.v !== NET_V })));
    const card = p => { const H = HEROES[p.hero] || HEROES.marrow; return `<div class="lp ${p.me ? 'me' : ''}"><span class="hdot" style="background:#${new THREE.Color(H.glow).getHexString()}"></span><b>${esc(p.name)}</b>${p.host || (p.me && host) ? '<em>HOST</em>' : ''}${p.old ? '<em class="warn">OLD VERSION — reload</em>' : ''}<span class="dim">${H.name}</span><span class="ads">${(p.ad || []).map(i => { const a = H.addons[i]; return a ? `<span class="mini r${a.r}" title="${esc(a.name)}">${iconSVG(a.icon)}</span>` : ''; }).join('')}</span></div>`; };
    if (teams) $('#lb-players').innerHTML = [0, 1].map(t => `<div class="lteam t${t}"><h4>${TEAM_NAME[t]}<button class="btn small ghost" data-act="lobbyTeam" data-arg="${t}" ${Net.team === t ? 'disabled' : ''}>${Net.team === t ? 'Your team' : 'Join'}</button></h4>${players.filter(p => p.team === t).map(card).join('') || '<div class="dim pad">Bots will fill empty spots</div>'}</div>`).join('');
    else $('#lb-players').innerHTML = `<div class="lteam ffa"><h4>Free-for-All</h4>${players.map(card).join('')}</div>`;
    const seg = (k, opts, fmt) => opts.map(v => `<button class="seg ${C[k] === v ? 'sel' : ''}" ${host ? `data-act="lobbyCfg" data-arg="${k}:${v}"` : 'disabled'}>${fmt(v)}</button>`).join('');
    $('#lb-cfg').innerHTML = `
      <div class="row"><small>MODE</small><div class="segs">${seg('mode', MODE_KEYS, k => MODES[k].name)}</div></div>
      <div class="row"><small>MAP</small><div class="segs">${seg('map', MAP_KEYS, k => MAPS[k].name)}</div></div>
      <div class="row"><small>${teams ? 'TEAM SIZE' : 'PLAYERS'}</small><div class="segs">${seg('sz', teams ? [1, 2, 3, 4, 5] : [4, 6, 8], n => teams ? n + 'v' + n : n)}</div></div>
      <div class="row"><small>BOTS</small><div class="segs">${seg('df', [0, 1, 2], i => BOT_DIFF[i].name)}</div></div>`;
    $('#lb-start').hidden = !host; $('#lb-wait').hidden = host;
    $('#lb-kit').innerHTML = kitSummary(Settings.hero, loadoutFor(Settings.hero)) + `<div class="lb-heroes">${heroCards(Settings.hero, 'lbHero')}</div>`;
    $$('#lb-kit [data-act=lbHero]').forEach(b => b.onclick = () => { Settings.hero = b.dataset.arg; Settings.save(); this.render(); Showcase.focus(Settings.hero); });
  },
  start() {
    if (!Net.isHost()) return;
    Flow.begin({ mode: this.cfg.mode, map: this.cfg.map, sz: this.cfg.sz, df: this.cfg.df }, true);
    this.active = false;
    for (const st of Net.peers.values()) st.first = true;
  },
};

// ---------------------------------------------------------------- the menu backdrop: a hero on display in the current map
const Showcase = {
  hero: null, model: null, t: 0, map: null,
  get SPOTS() { const o = {}; for (const k of MAP_KEYS) o[k] = MAPS[k].show; return o; },
  enter() {
    const key = MAPS[Settings.map] ? Settings.map : 'kiln';
    if (this.map !== key || !G.level) { World.load(MAPS[key]); buildLevel(MAPS[key]); this.map = key; this.model = null; }
    if (!this.key) { this.key = new THREE.SpotLight(0xffffff, 0, 14, 0.5, 0.6, 1.5); this.rim = new THREE.PointLight(0xffffff, 0, 8); G.scene.add(this.key); G.scene.add(this.key.target); G.scene.add(this.rim); }
    this.focus(Settings.hero, true);
  },
  focus(key, force) {
    if (Game.state === 'play') return;
    if (this.hero === key && this.model && !force) return;
    if (this.model) G.scene.remove(this.model.root);
    this.hero = key; this.model = buildHero(key, TEAM_HEX[0]); G.scene.add(this.model.root);
    const S = this.SPOTS[this.map]; this.model.root.position.set(S.x, S.y, S.z); this.model.root.rotation.y = S.yaw;
    this.pop = 0;
  },
  update(dt) {
    if (!this.model) return;
    this.t += dt; this.pop = Math.min(1, (this.pop || 0) + dt * 2.5);
    const S = this.SPOTS[this.map], M = this.model, cam = G.camera, inLoadout = UI.cur === 'loadout';
    M.root.rotation.y = S.yaw + Math.sin(this.t * 0.3) * 0.25;
    // a hero at ease: weapon lowered, weight shifting, cloth stirring
    poseHero(M, { spd: 0, phase: 0, air: 0, pitch: -0.42 + Math.sin(this.t * 0.8) * 0.03, flags: 0, t: this.t });
    M.bones.thighR.rotation.x += 0.08; M.bones.thighL.rotation.x -= 0.06; M.bones.thighL.rotation.z -= 0.05; M.bones.shinL.rotation.x -= 0.12;
    M.bones.hips.rotation.z = Math.sin(this.t * 0.7) * 0.02; M.bones.head.rotation.y = Math.sin(this.t * 0.37) * 0.25;
    M.bones.cape.rotation.x += Math.sin(this.t * 2.1) * 0.06; M.bones.tail.rotation.x += Math.sin(this.t * 1.7) * 0.03;
    const fwd = new V3(-Math.sin(S.yaw), 0, -Math.cos(S.yaw)), right = new V3(-fwd.z, 0, fwd.x);
    const off = inLoadout ? -1.25 : 0.85, dist = (inLoadout ? 3.4 : 4.2) - this.pop * 0.3;
    const look = new V3(S.x, S.y + 1.15, S.z).addScaledVector(right, off * (inLoadout ? 1.25 : 0.6));
    const want = new V3(S.x, S.y + 1.45, S.z).addScaledVector(fwd, dist).addScaledVector(right, off + Math.sin(this.t * 0.15) * 0.3);
    if (cam.position.distanceTo(want) > 10) cam.position.copy(want); else cam.position.lerp(want, 1 - Math.exp(-3 * dt));
    cam.lookAt(look); cam.updateMatrixWorld();
    const hf = 60 * Math.PI / 180; cam.fov = 2 * Math.atan(Math.tan(hf / 2)) * 180 / Math.PI; cam.updateProjectionMatrix();
    this.key.position.copy(new V3(S.x, S.y + 4, S.z).addScaledVector(fwd, 3).addScaledVector(right, 1.5)); this.key.target.position.set(S.x, S.y + 1, S.z); this.key.intensity = 0.9; this.key.color.set(0xfff0e0);
    this.rim.position.copy(new V3(S.x, S.y + 2, S.z).addScaledVector(fwd, -1.5).addScaledVector(right, -1)); this.rim.intensity = 1.4; this.rim.color.set(HEROES[this.hero].look.glow);
    this.key.visible = this.rim.visible = true;
  },
  hide() { if (this.model) { G.scene.remove(this.model.root); this.model = null; } if (this.key) { this.key.visible = false; this.rim.visible = false; } },
};
