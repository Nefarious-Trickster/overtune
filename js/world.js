'use strict';
// ============================================================================
// World: solids, ramps, collision, raycasts, the navigation graph, and the maps
// ============================================================================
const PHYS = { r: 0.42, h: 1.8, eye: 1.62, step: 0.5, grav: 24 };

const World = {
  def: null, solids: [], ramps: [], walls: [], spawns: [[], []], ffa: [], packs: [], pads: [], zone: null, lights: [], props: [], bounds: { x0: -50, x1: 50, z0: -34, z1: 34 }, nav: null,

  load(def) {
    this.def = def; this.solids = []; this.ramps = []; this.walls = []; this.spawns = [[], []]; this.ffa = []; this.packs = []; this.pads = []; this.lights = []; this.props = []; this.zone = null;
    this.bounds = Object.assign({}, def.bounds);
    const W = this, M = {
      flip: false,
      fx(x) { return this.flip ? -x : x; }, fz(z) { return this.flip ? -z : z; },
      box(x, z, w, d, h, o = {}) {
        const y = o.y || 0, cx = this.fx(x), cz = this.fz(z);
        const s = { x0: cx - w / 2, x1: cx + w / 2, y0: y, y1: y + h, z0: cz - d / 2, z1: cz + d / 2, mat: o.mat || 'concrete', trim: o.trim || null, vis: o.vis !== false, col: o.col !== false, side: this.flip ? 1 : 0, tag: o.tag || null, shadow: o.shadow !== false, round: !!o.round };
        W.solids.push(s); return s;
      },
      ramp(x, z, w, d, ya, yb, dir, o = {}) {
        // dir: the direction the ramp climbs: 'x+', 'x-', 'z+', 'z-'
        let cx = this.fx(x), cz = this.fz(z), D = dir;
        if (this.flip) D = D[0] + (D[1] === '+' ? '-' : '+');
        const axis = D[0] === 'x' ? 0 : 1, up = D[1] === '+';
        const r = { x0: cx - w / 2, x1: cx + w / 2, z0: cz - d / 2, z1: cz + d / 2, axis, h0: up ? ya : yb, h1: up ? yb : ya, base: o.base != null ? o.base : Math.min(ya, yb), mat: o.mat || 'stairs', vis: o.vis !== false, side: this.flip ? 1 : 0, rails: o.rails !== false };
        W.ramps.push(r); return r;
      },
      spawn(team, x, z, y = 0) { (team === 'ffa' ? W.ffa : W.spawns[this.flip ? 1 - team : team]).push(new V3(this.fx(x), y, this.fz(z))); },
      pack(x, z, y = 0) { W.packs.push({ x: this.fx(x), y, z: this.fz(z) }); },
      pad(x, z, y, tx, tz, ty, apex = 3) { W.pads.push({ x: this.fx(x), y, z: this.fz(z), tx: this.fx(tx), tz: this.fz(tz), ty, apex }); },
      zone(x, z, y, r) { W.zone = { x, y, z, r }; },
      light(x, y, z, color, intensity = 1, dist = 18) { W.lights.push({ x: this.fx(x), y, z: this.fz(z), color, intensity, dist }); },
      prop(type, o) {
        const c = Object.assign({}, o, { type });
        if (this.flip) {
          for (const k of ['x', 'x2']) if (k in c) c[k] = -c[k];
          for (const k of ['z', 'z2']) if (k in c) c[k] = -c[k];
          if ('yaw' in c) c.yaw += Math.PI;
          if (c.pts) c.pts = c.pts.map(p => [-p[0], p[1], -p[2]]);
        }
        W.props.push(c); return c;
      },
      // a building: four walls with openings ([side, centre along the wall, width, bottom, top]; sides n/s/e/w = +z/-z/+x/-x), and a roof
      room(x, z, w, d, h, o = {}) {
        const t = o.t || 0.5, y = o.y || 0, mat = o.mat || 'brick', ops = o.open || [];
        const side = (k, cx, cz, len, alongX) => {
          const list = ops.filter(q => q[0] === k).map(q => ({ c: q[1], w: q[2], y0: q[3] || 0, y1: q[4] == null ? Math.min(h, 2.9) : q[4] })).sort((a, b) => a.c - b.c);
          let at = -len / 2;
          const seg = (a, b, y0, y1) => { if (b - a < 0.05 || y1 - y0 < 0.05) return; const m = (a + b) / 2; if (alongX) this.box(cx + m, cz, b - a, t, y1 - y0, { y: y + y0, mat }); else this.box(cx, cz + m, t, b - a, y1 - y0, { y: y + y0, mat }); };
          for (const q of list) { const a = q.c - q.w / 2, b = q.c + q.w / 2; seg(at, a, 0, h); seg(a, b, 0, q.y0); seg(a, b, q.y1, h); at = b; }
          seg(at, len / 2, 0, h);
        };
        side('n', x, z + d / 2 - t / 2, w, true); side('s', x, z - d / 2 + t / 2, w, true);
        side('e', x + w / 2 - t / 2, z, d - 2 * t, false); side('w', x - w / 2 + t / 2, z, d - 2 * t, false);
        if (o.floor) this.box(x, z, w, d, 0.3, { y: y - 0.3, mat: o.floor });
        if (o.roof !== false) this.box(x, z, w + 0.5, d + 0.5, o.roofT || 0.4, { y: y + h, mat: o.roofMat || 'roof', trim: o.trim });
      },
      // a raised walkway between two points (axis-aligned), its deck top at y, on posts
      walk(x0, z0, x1, z1, y, w, o = {}) {
        const alongX = Math.abs(x1 - x0) >= Math.abs(z1 - z0), len = alongX ? Math.abs(x1 - x0) : Math.abs(z1 - z0), cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
        this.box(cx, cz, alongX ? len : w, alongX ? w : len, 0.3, { y: y - 0.3, mat: o.mat || 'plank', trim: o.trim });
        if (o.posts !== false) {
          const n = Math.max(1, Math.round(len / (o.every || 5)));
          for (let i = 0; i <= n; i++) {
            const u = -len / 2 + len * i / n;
            for (const sd of [-1, 1]) { const px = alongX ? cx + u : cx + sd * (w / 2 - 0.2), pz = alongX ? cz + sd * (w / 2 - 0.2) : cz + u; this.box(px, pz, 0.34, 0.34, y - 0.3, { mat: o.post || 'darkwood', round: true }); }
          }
        }
        if (o.rails) for (const sd of o.rails) { const z_ = alongX ? cz + sd * w / 2 : cz, x_ = alongX ? cx : cx + sd * w / 2; this.prop('railing', alongX ? { x: cx - len / 2, z: z_, x2: cx + len / 2, z2: z_, y } : { x: x_, z: cz - len / 2, x2: x_, z2: cz + len / 2, y }); }
      },
      // run fn once for the near half and once mirrored through the centre (point symmetry: (x, z) -> (-x, -z))
      both(fn) { this.flip = false; fn(this); this.flip = true; fn(this); this.flip = false; },
    };
    def.build(M);
    this.buildGrid();
    this.buildNav();
  },
  // a coarse bucket grid over the level, so collision and rays only look at nearby blocks
  buildGrid() {
    const B = this.bounds, C = 6, x0 = B.x0 - 12, z0 = B.z0 - 12, nx = Math.ceil((B.x1 - B.x0 + 24) / C), nz = Math.ceil((B.z1 - B.z0 + 24) / C);
    const cells = []; for (let i = 0; i < nx * nz; i++) cells.push({ s: [], r: [] });
    const put = (o, list) => {
      const i0 = clamp(Math.floor((o.x0 - x0) / C), 0, nx - 1), i1 = clamp(Math.floor((o.x1 - x0) / C), 0, nx - 1), j0 = clamp(Math.floor((o.z0 - z0) / C), 0, nz - 1), j1 = clamp(Math.floor((o.z1 - z0) / C), 0, nz - 1);
      for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) cells[i * nz + j][list].push(o);
    };
    for (const s of this.solids) if (s.col) put(s, 's');
    for (const r of this.ramps) put(r, 'r');
    this.grid = { C, x0, z0, nx, nz, cells, st: 0, S: [], R: [] };
  },
  // the blocks and ramps whose buckets overlap a rectangle (shared arrays: use them before the next query)
  near(ax, az, bx, bz) {
    const g = this.grid; g.S.length = 0; g.R.length = 0;
    const st = ++g.st;
    const i0 = clamp(Math.floor((Math.min(ax, bx) - g.x0) / g.C), 0, g.nx - 1), i1 = clamp(Math.floor((Math.max(ax, bx) - g.x0) / g.C), 0, g.nx - 1);
    const j0 = clamp(Math.floor((Math.min(az, bz) - g.z0) / g.C), 0, g.nz - 1), j1 = clamp(Math.floor((Math.max(az, bz) - g.z0) / g.C), 0, g.nz - 1);
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
      const c = g.cells[i * g.nz + j];
      for (const s of c.s) if (s._st !== st) { s._st = st; g.S.push(s); }
      for (const r of c.r) if (r._st !== st) { r._st = st; g.R.push(r); }
    }
    return g;
  },

  rampH(r, x, z) {
    const t = r.axis === 0 ? (x - r.x0) / (r.x1 - r.x0) : (z - r.z0) / (r.z1 - r.z0);
    return lerp(r.h0, r.h1, clamp(t, 0, 1));
  },

  // the highest surface at (x, z) that is no higher than maxY
  groundAt(x, z, maxY, m = 0.2) {
    let best = 0; const g = this.near(x - m, z - m, x + m, z + m);
    for (const s of g.S) {
      if (!s.col || s.y1 > maxY || s.y1 <= best) continue;
      if (x >= s.x0 - m && x <= s.x1 + m && z >= s.z0 - m && z <= s.z1 + m) best = s.y1;
    }
    for (const r of g.R) {
      if (x < r.x0 - m || x > r.x1 + m || z < r.z0 - m || z > r.z1 + m) continue;
      const h = this.rampH(r, x, z); if (h <= maxY && h > best) best = h;
    }
    return best;
  },
  ceilAt(x, z, y0, y1, m) {
    let c = null;
    for (const s of this.near(x - m, z - m, x + m, z + m).S) {
      if (!s.col || s.y0 < y0 - 0.05 || s.y0 >= y1) continue;
      if (x >= s.x0 - m && x <= s.x1 + m && z >= s.z0 - m && z <= s.z1 + m) if (c === null || s.y0 < c) c = s.y0;
    }
    return c;
  },
  // push a vertical cylinder (feet yLo .. head yHi) out of everything it overlaps; returns the last push normal or null
  collideXZ(p, r, yLo, yHi) {
    let hit = null;
    const g = this.near(p.x - r - 1, p.z - r - 1, p.x + r + 1, p.z + r + 1), SL = g.S.slice(), RL = g.R.slice();
    for (let pass = 0; pass < 2; pass++) {
      for (const s of SL) {
        if (!s.col || s.y1 <= yLo || s.y0 >= yHi) continue;
        const cx = clamp(p.x, s.x0, s.x1), cz = clamp(p.z, s.z0, s.z1), dx = p.x - cx, dz = p.z - cz, d2 = dx * dx + dz * dz;
        if (d2 >= r * r) continue;
        let nx, nz, pen;
        if (d2 > 1e-9) { const d = Math.sqrt(d2); nx = dx / d; nz = dz / d; pen = r - d; }
        else {
          const l = p.x - s.x0, rr = s.x1 - p.x, b = p.z - s.z0, f = s.z1 - p.z, m = Math.min(l, rr, b, f);
          if (m === l) { nx = -1; nz = 0; pen = l + r; } else if (m === rr) { nx = 1; nz = 0; pen = rr + r; } else if (m === b) { nx = 0; nz = -1; pen = b + r; } else { nx = 0; nz = 1; pen = f + r; }
        }
        p.x += nx * pen; p.z += nz * pen; hit = { nx, nz, s };
      }
      for (const R of RL) {
        if (p.x < R.x0 - r || p.x > R.x1 + r || p.z < R.z0 - r || p.z > R.z1 + r) continue;
        const hs = this.rampH(R, clamp(p.x, R.x0, R.x1), clamp(p.z, R.z0, R.z1));
        if (hs <= yLo || R.base >= yHi) continue;
        const cx = clamp(p.x, R.x0, R.x1), cz = clamp(p.z, R.z0, R.z1), dx = p.x - cx, dz = p.z - cz, d2 = dx * dx + dz * dz;
        if (d2 >= r * r) continue;
        let nx, nz, pen;
        if (d2 > 1e-9) { const d = Math.sqrt(d2); nx = dx / d; nz = dz / d; pen = r - d; }
        else {
          const l = p.x - R.x0, rr = R.x1 - p.x, b = p.z - R.z0, f = R.z1 - p.z, m = Math.min(l, rr, b, f);
          if (m === l) { nx = -1; nz = 0; pen = l + r; } else if (m === rr) { nx = 1; nz = 0; pen = rr + r; } else if (m === b) { nx = 0; nz = -1; pen = b + r; } else { nx = 0; nz = 1; pen = f + r; }
        }
        p.x += nx * pen; p.z += nz * pen; hit = { nx, nz, s: R };
      }
      if (!hit) break;
    }
    return hit;
  },
  // move a body (feet position, velocity) through the world for dt seconds
  moveBody(b, dt) {
    const p = b.pos, v = b.vel, r = PHYS.r, h = PHYS.h, res = { wall: null, landV: 0 };
    const was = b.grounded;
    v.y -= PHYS.grav * (b.gravMul == null ? 1 : b.gravMul) * dt;
    let ny = p.y + v.y * dt;
    if (v.y > 0) { const c = this.ceilAt(p.x, p.z, p.y + h - 0.02, ny + h, r * 0.7); if (c !== null) { ny = c - h; v.y = 0; } }
    p.y = ny;
    const dist = Math.hypot(v.x, v.z) * dt, n = Math.max(1, Math.ceil(dist / (r * 0.6)));
    for (let i = 0; i < n; i++) {
      p.x += v.x * dt / n; p.z += v.z * dt / n;
      const c = this.collideXZ(p, r, p.y + PHYS.step, p.y + h);
      if (c) { res.wall = c; const d = v.x * c.nx + v.z * c.nz; if (d < 0) { res.wallSpeed = -d; v.x -= d * c.nx; v.z -= d * c.nz; } }
    }
    const B = this.bounds;
    if (p.x < B.x0 + r) { p.x = B.x0 + r; v.x = Math.max(0, v.x); } if (p.x > B.x1 - r) { p.x = B.x1 - r; v.x = Math.min(0, v.x); }
    if (p.z < B.z0 + r) { p.z = B.z0 + r; v.z = Math.max(0, v.z); } if (p.z > B.z1 - r) { p.z = B.z1 - r; v.z = Math.min(0, v.z); }
    const g = this.groundAt(p.x, p.z, p.y + PHYS.step, r * 0.55);
    if (p.y <= g) { if (v.y < 0) { if (!was) res.landV = -v.y; v.y = 0; } p.y = g; b.grounded = v.y <= 0.01; }
    else if (was && v.y <= 0 && p.y - g < 0.42) { p.y = g; v.y = 0; b.grounded = true; }
    else b.grounded = false;
    if (p.y < -10) { p.y = 1; v.set(0, 0, 0); }
    return res;
  },

  // ray against the level: solids, ramps, the floor and deployed walls. Returns the nearest hit or null.
  ray(ox, oy, oz, dx, dy, dz, maxD, team = -1) {
    let best = maxD, hit = null;
    const ix = 1 / (dx || 1e-12), iy = 1 / (dy || 1e-12), iz = 1 / (dz || 1e-12), md = Math.min(maxD, 400);
    const g = this.near(ox, oz, ox + dx * md, oz + dz * md);
    for (const s of g.S) {
      if (!s.col) continue;
      let t1 = (s.x0 - ox) * ix, t2 = (s.x1 - ox) * ix, tmin = Math.min(t1, t2), tmax = Math.max(t1, t2);
      t1 = (s.y0 - oy) * iy; t2 = (s.y1 - oy) * iy; tmin = Math.max(tmin, Math.min(t1, t2)); tmax = Math.min(tmax, Math.max(t1, t2));
      t1 = (s.z0 - oz) * iz; t2 = (s.z1 - oz) * iz; tmin = Math.max(tmin, Math.min(t1, t2)); tmax = Math.min(tmax, Math.max(t1, t2));
      if (tmax < Math.max(tmin, 0) || tmin >= best) continue;
      if (tmin < 0) continue;      // started inside: ignore (we never shoot from inside a wall)
      best = tmin; hit = { s };
    }
    for (const R of g.R) {
      // the slope's plane: y = a + k * u, u along the climbing axis
      const len = R.axis === 0 ? R.x1 - R.x0 : R.z1 - R.z0, k = (R.h1 - R.h0) / len, u0 = R.axis === 0 ? R.x0 : R.z0, a = R.h0 - k * u0;
      const ou = R.axis === 0 ? ox : oz, du = R.axis === 0 ? dx : dz, den = dy - k * du;
      if (Math.abs(den) < 1e-9) continue;
      const t = (a + k * ou - oy) / den; if (t < 0 || t >= best) continue;
      const x = ox + dx * t, z = oz + dz * t;
      if (x < R.x0 || x > R.x1 || z < R.z0 || z > R.z1) continue;
      best = t; hit = { s: R, ramp: true };
    }
    if (dy < 0) { const t = -oy / dy; if (t >= 0 && t < best) { best = t; hit = { floor: true }; } }
    for (const w of this.walls) {
      if (w.team === team || w.hp <= 0) continue;
      const c = Math.cos(w.yaw), sn = Math.sin(w.yaw);
      const lx = (ox - w.x) * c - (oz - w.z) * sn, lz = (ox - w.x) * sn + (oz - w.z) * c, ldx = dx * c - dz * sn, ldz = dx * sn + dz * c;
      const lix = 1 / (ldx || 1e-12), liz = 1 / (ldz || 1e-12);
      let t1 = (-w.w / 2 - lx) * lix, t2 = (w.w / 2 - lx) * lix, tmin = Math.min(t1, t2), tmax = Math.max(t1, t2);
      t1 = (w.y - oy) * iy; t2 = (w.y + w.h - oy) * iy; tmin = Math.max(tmin, Math.min(t1, t2)); tmax = Math.min(tmax, Math.max(t1, t2));
      t1 = (-0.15 - lz) * liz; t2 = (0.15 - lz) * liz; tmin = Math.max(tmin, Math.min(t1, t2)); tmax = Math.min(tmax, Math.max(t1, t2));
      if (tmax < Math.max(tmin, 0) || tmin < 0 || tmin >= best) continue;
      best = tmin; hit = { wall: w };
    }
    if (!hit) return null;
    hit.t = best; hit.x = ox + dx * best; hit.y = oy + dy * best; hit.z = oz + dz * best;
    // surface normal
    if (hit.floor) { hit.nx = 0; hit.ny = 1; hit.nz = 0; }
    else if (hit.wall) { const w = hit.wall, c = Math.cos(w.yaw), s = Math.sin(w.yaw); const side = ((ox - w.x) * Math.sin(w.yaw) + (oz - w.z) * Math.cos(w.yaw)) >= 0 ? 1 : -1; hit.nx = s * side; hit.ny = 0; hit.nz = c * side; }
    else if (hit.ramp) { const R = hit.s, len = R.axis === 0 ? R.x1 - R.x0 : R.z1 - R.z0, k = (R.h1 - R.h0) / len, n = 1 / Math.sqrt(1 + k * k); hit.nx = R.axis === 0 ? -k * n : 0; hit.nz = R.axis === 1 ? -k * n : 0; hit.ny = n; }
    else {
      const s = hit.s, e = 1e-3;
      hit.nx = Math.abs(hit.x - s.x0) < e ? -1 : Math.abs(hit.x - s.x1) < e ? 1 : 0;
      hit.ny = Math.abs(hit.y - s.y0) < e ? -1 : Math.abs(hit.y - s.y1) < e ? 1 : 0;
      hit.nz = Math.abs(hit.z - s.z0) < e ? -1 : Math.abs(hit.z - s.z1) < e ? 1 : 0;
      if (!hit.nx && !hit.ny && !hit.nz) hit.ny = 1;
    }
    return hit;
  },
  clear(ax, ay, az, bx, by, bz, team = -1) {
    const dx = bx - ax, dy = by - ay, dz = bz - az, d = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (d < 1e-4) return true;
    return !this.ray(ax, ay, az, dx / d, dy / d, dz / d, d - 0.05, team);
  },

  // ---------------------------------------------------------------- navigation graph
  // A layered grid: every 1 m cell can hold several walkable surfaces (the floor under a catwalk, the catwalk itself).
  buildNav() {
    const B = this.bounds, C = 1, nodes = [], cells = new Map();
    const nx = Math.floor((B.x1 - B.x0) / C), nz = Math.floor((B.z1 - B.z0) / C);
    const key = (i, j) => i * 4096 + j;
    for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
      const x = B.x0 + (i + 0.5) * C, z = B.z0 + (j + 0.5) * C;
      if (x < B.x0 + 0.6 || x > B.x1 - 0.6 || z < B.z0 + 0.6 || z > B.z1 - 0.6) continue;
      const ys = [0], g = this.near(x - 1, z - 1, x + 1, z + 1), SL = g.S.slice(), RL = g.R.slice();
      for (const s of SL) if (s.col && x >= s.x0 && x <= s.x1 && z >= s.z0 && z <= s.z1) ys.push(s.y1);
      const rys = new Set(); for (const r of RL) if (x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1) { const h = this.rampH(r, x, z); ys.push(h); rys.add(h); }
      ys.sort((a, b) => b - a);
      const list = [];
      for (const y of ys) {
        // the surface must be the top of whatever is here at that height (nothing solid just above it) ...
        let ok = true;
        for (const s of SL) {
          if (!s.col) continue;
          if (s.y0 < y + 1.85 && s.y1 > y + 0.05 && x >= s.x0 - 0.5 && x <= s.x1 + 0.5 && z >= s.z0 - 0.5 && z <= s.z1 + 0.5) {
            // ... and leave room for a body: nothing within half a metre between knee and head height
            const cx = clamp(x, s.x0, s.x1), cz = clamp(z, s.z0, s.z1);
            if ((x - cx) ** 2 + (z - cz) ** 2 < 0.5 * 0.5 && s.y1 > y + PHYS.step) { ok = false; break; }
          }
        }
        if (!ok) continue;
        for (const r of RL) {
          if (x < r.x0 - 0.45 || x > r.x1 + 0.45 || z < r.z0 - 0.45 || z > r.z1 + 0.45) continue;
          const hs = this.rampH(r, clamp(x, r.x0, r.x1), clamp(z, r.z0, r.z1));
          if (hs > y + PHYS.step && r.base < y + 1.8) { ok = false; break; }
        }
        if (!ok) continue;
        if (list.some(n => Math.abs(nodes[n].y - y) < 0.3)) continue;
        const id = nodes.length; nodes.push({ id, x, y, z, i, j, e: [], rp: rys.has(y) }); list.push(id);
      }
      if (list.length) cells.set(key(i, j), list);
    }
    const link = (a, b, cost) => { nodes[a].e.push(b, cost); };
    const at = (i, j, y, tol) => { const l = cells.get(key(i, j)); if (!l) return -1; let best = -1, bd = tol; for (const n of l) { const d = Math.abs(nodes[n].y - y); if (d <= bd) { bd = d; best = n; } } return best; };
    for (const n of nodes) {
      for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) {
        if (!di && !dj) continue;
        const l = cells.get(key(n.i + di, n.j + dj)); if (!l) continue;
        for (const m of l) {
          const o = nodes[m], dy = o.y - n.y;
          if (dy > ((n.rp || o.rp) ? 0.9 : 0.56)) continue;      // too high to step up (slopes are steeper per cell)
          if (dy < -0.56 && dy < -4.6) continue;                  // too far to drop
          if (di && dj) {                                          // no cutting corners
            if (at(n.i + di, n.j, n.y + dy / 2, 0.6) < 0 || at(n.i, n.j + dj, n.y + dy / 2, 0.6) < 0) continue;
          }
          if (dy < -((n.rp || o.rp) ? 0.9 : 0.56)) { if (di && dj) continue; link(n.id, m, 1.6 + -dy * 0.3); continue; }      // walk off a ledge (one way)
          link(n.id, m, di && dj ? 1.414 : 1);
        }
      }
    }
    this.nav = { nodes, cells, key, C };
    for (const p of this.pads) {
      const a = this.nearNode(p.x, p.y, p.z), b = this.nearNode(p.tx, p.ty, p.tz);
      if (a >= 0 && b >= 0) { nodes[a].e.push(b, 3); nodes[a].pad = p; }
    }
  },
  nearNode(x, y, z, maxR = 3) {
    const N = this.nav; if (!N) return -1;
    const i0 = Math.floor((x - this.bounds.x0) / N.C), j0 = Math.floor((z - this.bounds.z0) / N.C);
    let best = -1, bd = 1e9;
    for (let r = 0; r <= maxR; r++) {
      for (let di = -r; di <= r; di++) for (let dj = -r; dj <= r; dj++) {
        if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
        const l = N.cells.get(N.key(i0 + di, j0 + dj)); if (!l) continue;
        for (const id of l) { const n = N.nodes[id], dy = y - n.y; if (dy < -0.8) continue; const d = (n.x - x) ** 2 + (n.z - z) ** 2 + dy * dy * 4; if (d < bd) { bd = d; best = id; } }
      }
      if (best >= 0 && r >= 1) break;
    }
    return best;
  },
  path(a, b) {
    const N = this.nav; if (!N || a < 0 || b < 0) return null; if (a === b) return [a];
    const nodes = N.nodes, g = new Map(), from = new Map(), heap = [], goal = nodes[b];
    const h = id => { const n = nodes[id]; return Math.hypot(n.x - goal.x, n.z - goal.z) + Math.abs(n.y - goal.y) * 0.5; };
    const push = (id, f) => { heap.push([f, id]); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
    const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = i * 2 + 1, r = l + 1; let m = i; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return top; };
    g.set(a, 0); push(a, h(a)); let it = 0;
    while (heap.length && it++ < 40000) {
      const [, cur] = pop(); if (cur === b) break;
      const gc = g.get(cur), e = nodes[cur].e;
      for (let k = 0; k < e.length; k += 2) {
        const nb = e[k], ng = gc + e[k + 1];
        if (ng < (g.has(nb) ? g.get(nb) : Infinity)) { g.set(nb, ng); from.set(nb, cur); push(nb, ng + h(nb)); }
      }
    }
    if (!from.has(b)) return null;
    const out = [b]; let c = b; while (c !== a) { c = from.get(c); out.push(c); } out.reverse();
    return out;
  },
  randomNode(rng = Math.random) { const N = this.nav; return N.nodes[Math.floor(rng() * N.nodes.length)]; },
};

// ============================================================================
// Maps. Each lays out its near half (team 0, west) inside both(), which also places the point-mirrored copy for
// team 1; anything that sits on the centre line or is unique is placed outside it. Props are set dressing only.
// ============================================================================
const MAPS = {
  // ---------------------------------------------------------------- Kiln Yard: a foundry district at the end of the day
  kiln: {
    key: 'kiln', name: 'Kiln Yard', sub: 'Foundry district · dusk', bounds: { x0: -68, x1: 68, z0: -46, z1: 46 },
    theme: { sky: 'dusk', fog: [0x4a2f3c, 0.0058], sun: [0xffa860, 3.4], sunDir: [-0.55, 0.32, -0.62], hemi: [0x7a6cd8, 0x3d2416, 0.42], exposure: 0.92, amb: 'wind', floor: 'concrete' },
    show: { x: -46.5, y: 1.4, z: 2, yaw: -Math.PI / 2 },
    build(M) {
      M.box(0, 47, 140, 2, 14, { mat: 'brick', shadow: false }); M.box(0, -47, 140, 2, 14, { mat: 'brick', shadow: false });
      M.box(-69, 0, 2, 96, 14, { mat: 'brick', shadow: false }); M.box(69, 0, 2, 96, 14, { mat: 'brick', shadow: false });
      // the Crucible: a raised casting floor in the middle of the yard
      M.box(0, 0, 14, 12, 2.4, { mat: 'steel', trim: 0xff8a3a });
      M.box(0, 0, 1.8, 1.8, 1.25, { y: 2.4, mat: 'iron' });
      M.zone(0, 0, 2.4, 5.2);
      M.both(m => {
        // the spawn hall, three doors onto the loading dock
        m.room(-61, 0, 12, 28, 6.5, { mat: 'brick', open: [['e', -8, 3.6, 0, 3.4], ['e', 0, 3.6, 0, 3.4], ['e', 8, 3.6, 0, 3.4]], roofMat: 'roof', trim: m.flip ? 0xff8a3a : 0x3ad6ff });
        for (const z of [-10, -5, 0, 5, 10]) m.spawn(0, -64, z);
        for (const z of [-7, 0, 7]) m.spawn(0, -60, z);
        m.light(-61, 5.6, -7, 0xffc27a, 2.0, 13); m.light(-61, 5.6, 7, 0xffc27a, 2.0, 13);
        m.prop('sign', { x: -54.7, y: 4.6, z: -4, yaw: Math.PI / 2, w: 3.6, h: 0.9, text: 'BAY 0' + (m.flip ? '2' : '1'), color: m.flip ? 0xff8a3a : 0x3ad6ff });
        // the loading dock and two parked trailers
        m.box(-46, 0, 5, 18, 1.4, { mat: 'concrete', trim: 0xffd23a });
        m.ramp(-46, 11.5, 5, 5, 0, 1.4, 'z-', { mat: 'stairs' }); m.ramp(-46, -11.5, 5, 5, 0, 1.4, 'z+', { mat: 'stairs' });
        m.box(-39.5, -6, 2.6, 8, 2.8, { mat: 'container' }); m.box(-39.5, 8.5, 2.6, 7, 2.8, { mat: 'container3' });
        m.prop('hazard', { x: -48.2, z: 0, w: 0.6, d: 18 });
        // the yard: a furnace stack, kilns, crates
        m.box(-26, 5, 3.4, 3.4, 12, { mat: 'stack' });
        m.box(-27, -21, 9, 8, 5, { mat: 'brick', trim: 0xff7a2e });
        m.box(-27, -16.4, 3, 1.2, 1.4, { mat: 'crate' });
        m.box(-20, -8, 4, 2.5, 2.2, { mat: 'crate' }); m.box(-20.6, -8, 1.6, 1.6, 1.4, { y: 2.2, mat: 'crate' });
        m.box(-15, 11, 2, 2, 1.3, { mat: 'crate' }); m.box(-35, -6, 2.4, 2.4, 1.3, { mat: 'crate' });
        m.box(-33, 14, 5, 1.6, 2.4, { mat: 'barrier' }); m.box(-10, -17, 3, 1.4, 1.5, { mat: 'barrier' });
        m.box(-34, 4, 1.4, 5, 1.5, { mat: 'barrier' }); m.box(-37, -14, 2.2, 4, 2.6, { mat: 'crate' });
        m.box(-16, 5, 1.4, 3.5, 1.2, { mat: 'barrier' });
        // the casting hall to the north: a long brick shed with a mezzanine that opens onto an outside catwalk
        m.room(-26, 35, 30, 14, 8, { mat: 'brick', open: [['s', -9, 4, 0, 3], ['s', 7, 3.2, 0, 2.9], ['s', -1, 3, 3.95, 6.4], ['w', 1, 3.2, 0, 3], ['e', 2, 3.2, 0, 3]], roofMat: 'roof' });
        m.box(-26, 29.75, 28, 3, 0.35, { y: 3.6, mat: 'grate', trim: 0xffa040 });
        m.ramp(-37.5, 35, 3, 7, 0, 3.95, 'z-', { mat: 'grate' });
        m.box(-37.5, 39.6, 3, 2.2, 0.35, { y: 0, mat: 'iron' });
        m.box(-19, 37.5, 4, 4, 3, { mat: 'iron' }); m.box(-29, 38.5, 3, 3, 1.6, { mat: 'crate' }); m.box(-11.5, 38, 2, 4, 2.2, { mat: 'crate' });
        m.prop('molten', { x: -19, z: 34.2, w: 4, d: 0.9 });
        m.light(-26, 7, 35, 0xff9a40, 2.2, 18); m.light(-19, 3.6, 34, 0xff6a1a, 2.0, 9);
        m.pack(-26, 37);
        // the outside catwalk along the hall, stairs at the west end and a pad up from the yard
        m.box(-23, 26.5, 36, 3, 0.35, { y: 3.6, mat: 'grate', trim: 0xffa040 });
        for (const x of [-38, -28, -18, -8]) m.box(x, 25.4, 0.45, 0.45, 3.6, { mat: 'iron' });
        m.prop('railing', { x: -41, z: 25.0, x2: -5, z2: 25.0, y: 3.95 });
        m.ramp(-45, 26.5, 8, 3, 0, 3.95, 'x+', { mat: 'grate' });
        m.pad(-8, 21, 0, -6, 26.5, 3.95, 2.2);
        // the rail siding to the south: three box cars and a flatbed, and a signal box
        m.box(-56, -38, 10, 3, 3.1, { mat: 'container2' }); m.box(-42, -38, 10, 3, 3.1, { mat: 'container' }); m.box(-28, -38, 10, 3, 3.1, { mat: 'container3' });
        m.box(-14, -38, 8, 3, 1.2, { mat: 'plank' }); m.ramp(-8, -38, 4, 3, 0, 1.2, 'x-', { mat: 'plank' });
        m.box(-16, -38, 2, 2, 1.0, { y: 1.2, mat: 'crate' });
        m.prop('pipe', { pts: [[-62, 0.12, -39.8], [-6, 0.12, -39.8]], r: 0.1 }); m.prop('pipe', { pts: [[-62, 0.12, -36.2], [-6, 0.12, -36.2]], r: 0.1 });
        m.room(-46, -26, 6, 6, 3.4, { mat: 'brick', open: [['e', 0, 1.8, 0, 2.6], ['n', 1, 1.6, 1.4, 2.6]], roof: false });
        m.box(-46, -26, 6, 6, 0.3, { y: 3.4, mat: 'plank' });
        m.box(-46, -23.25, 6, 0.5, 1.1, { y: 3.7, mat: 'brick' }); m.box(-48.75, -26, 0.5, 5, 1.1, { y: 3.7, mat: 'brick' });
        for (const [x, z] of [[-48.7, -28.7], [-43.3, -28.7], [-48.7, -23.3], [-43.3, -23.3]]) m.box(x, z, 0.3, 0.3, 2.2, { y: 3.7, mat: 'iron' });
        m.box(-46, -26, 6.6, 6.6, 0.3, { y: 5.9, mat: 'roof' });
        m.ramp(-41, -28.5, 4, 1.8, 0, 3.7, 'x-', { mat: 'stairs' });
        m.light(-46, 5.4, -26, 0x9ad8ff, 1.4, 10);
        // crucible access and cover on top
        m.ramp(-10, 0, 6, 3.6, 0, 2.4, 'x+', { mat: 'stairs' });
        m.ramp(3.5, 9, 3.4, 6, 0, 2.4, 'z-', { mat: 'stairs' });
        m.box(-4.8, -4, 2.2, 0.5, 1.1, { y: 2.4, mat: 'iron' }); m.box(5.2, 3, 0.5, 2, 1.1, { y: 2.4, mat: 'iron' });
        m.pack(-30, 1); m.pack(-6, -24);
        for (const p of [[-40, 0], [-22, 16], [-14, -30], [-34, 30], [-56, 30], [-56, -24]]) m.spawn('ffa', p[0], p[1]);
        // corners: a gas holder, a scrap bunker
        m.box(-61, 34, 12, 14, 8, { mat: 'tank' }); m.box(-62, -26, 8, 8, 6.5, { mat: 'brick' });
        // set dressing
        m.prop('molten', { x: -20, z: 0.0, w: 8, d: 0.9 }); m.prop('molten', { x: -32.5, z: -24, w: 0.9, d: 6 });
        m.prop('pipe', { pts: [[-67.6, 10, -45], [-67.6, 10, 45]], r: 0.5 });
        m.prop('smoke', { x: -26, y: 12.4, z: 5 }); m.prop('smoke', { x: -61, y: 8.6, z: 34, s: 0.6 });
        m.prop('lamp', { x: -27, y: 5.2, z: -16.95, yaw: 0, color: 0xffa54d });
        m.prop('chain', { x: -19, y: 8, z: 37.5, len: 3.6 }); m.prop('chain', { x: -31, y: 8, z: 35, len: 3 });
        m.prop('barrel', { x: -31, z: -9 }); m.prop('barrel', { x: -31.8, z: -9.6 }); m.prop('barrel', { x: -14, z: 22 }); m.prop('barrel', { x: -41, z: -14 });
        m.light(-20, 1.2, 0, 0xff6a1a, 2.4, 10); m.light(-27, 6.5, -16.6, 0xffa54d, 1.6, 14); m.light(-42, 4, -38, 0xffc27a, 1.2, 14);
      });
      M.prop('cauldron', { x: 0, y: 2.4, z: 0 });
      M.prop('molten', { x: -2.5, z: 8.2, w: 8, d: 0.9 }); M.prop('molten', { x: 2.5, z: -8.2, w: 8, d: 0.9 });
      M.prop('skyline', {});
      M.light(0, 5.5, 0, 0xff7a20, 3.0, 18);
    },
  },

  // ---------------------------------------------------------------- Verdance: a jungle temple taken back by the forest
  verdance: {
    key: 'verdance', name: 'Verdance', sub: 'Overgrown temple · morning', bounds: { x0: -68, x1: 68, z0: -42, z1: 42 },
    theme: { sky: 'day', fog: [0x9ab8b0, 0.0052], sun: [0xfff0d0, 3.6], sunDir: [0.45, 0.62, 0.38], hemi: [0xa8d4ff, 0x3a4a22, 0.5], exposure: 0.8, amb: 'wind', floor: 'flagstone' },
    show: { x: -53, y: 2.4, z: 7, yaw: -Math.PI / 2 },
    build(M) {
      M.box(0, 43, 140, 2, 8, { mat: 'ruin', shadow: false }); M.box(0, -43, 140, 2, 8, { mat: 'ruin', shadow: false });
      M.box(-69, 0, 2, 88, 8, { mat: 'ruin', shadow: false }); M.box(69, 0, 2, 88, 8, { mat: 'ruin', shadow: false });
      // the shrine in the plaza
      M.box(0, 0, 11, 11, 0.45, { mat: 'flag2' }); M.box(0, 0, 7, 7, 0.45, { y: 0.45, mat: 'flag2', trim: 0x8affc8 });
      M.zone(0, 0, 0.9, 5);
      M.prop('idol', { x: 0, y: 0.9, z: 0 });
      M.both(m => {
        // the base: a stepped temple platform with a roof on pillars
        m.box(-61, 0, 12, 28, 2.4, { mat: 'temple', trim: m.flip ? 0xff9a4a : 0x4ae0ff });
        m.box(-66, 0, 2, 28, 6, { y: 2.4, mat: 'temple' });
        m.box(-63.5, 13.5, 5, 1, 3, { y: 2.4, mat: 'temple' }); m.box(-63.5, -13.5, 5, 1, 3, { y: 2.4, mat: 'temple' });
        m.box(-61, 0, 12, 28, 0.6, { y: 6.6, mat: 'roofstone' });
        for (const z of [-9, 9]) m.box(-55.6, z, 1.2, 1.2, 4.2, { y: 2.4, mat: 'pillar' });
        m.ramp(-52, 0, 6, 9, 0, 2.4, 'x-', { mat: 'stepstone' });
        m.ramp(-58, 16.5, 5, 5, 0, 2.4, 'z-', { mat: 'stepstone' }); m.ramp(-58, -16.5, 5, 5, 0, 2.4, 'z+', { mat: 'stepstone' });
        for (const z of [-8, -4, 0, 4, 8]) m.spawn(0, -62, z, 2.4);
        for (const z of [-6, 0, 6]) m.spawn(0, -58.5, z, 2.4);
        m.light(-61, 5.6, -6, 0xffd6a0, 1.8, 12); m.light(-61, 5.6, 6, 0xffd6a0, 1.8, 12);
        m.prop('brazier', { x: -55.6, y: 2.4, z: -4.5 }); m.prop('brazier', { x: -55.6, y: 2.4, z: 4.5 });
        m.light(-55.6, 3.4, -4.5, 0xff9a40, 1.5, 9); m.light(-55.6, 3.4, 4.5, 0xff9a40, 1.5, 9);
        // the north terrace along the wall, stairs at both ends and down into the plaza
        m.box(-12, 35.5, 46, 10, 3, { mat: 'temple' });
        m.box(-12, 40.1, 46, 0.8, 1.1, { y: 3, mat: 'ruin' });
        m.box(-20, 30.9, 6, 0.7, 1.0, { y: 3, mat: 'ruin' }); m.box(0, 30.9, 4, 0.7, 1.0, { y: 3, mat: 'ruin' });
        m.ramp(-38, 35.5, 6, 4, 0, 3, 'x+', { mat: 'stepstone' });
        m.ramp(14, 35.5, 6, 4, 0, 3, 'x-', { mat: 'stepstone' });
        m.ramp(-8, 27.5, 4, 6, 0, 3, 'z+', { mat: 'stepstone' });
        m.pad(-26, 26, 0, -26, 33, 3.1, 2.4);
        // a ruined hall under the terrace's west end, roof half fallen in
        m.room(-42, 18, 12, 9, 4.6, { mat: 'ruin', open: [['e', 0, 2.6, 0, 3], ['s', -2, 2.4, 0, 3], ['w', 1.5, 2.2, 1.0, 2.6], ['n', 3, 2.4, 1.0, 2.6]], roof: false });
        m.box(-45, 18, 6, 9.4, 0.5, { y: 4.6, mat: 'roofstone' });
        m.box(-39, 16, 1.4, 1.4, 0.9, { mat: 'ruin' }); m.box(-37.5, 20, 2.6, 1, 1.0, { mat: 'ruin' });
        m.pack(-44, 18);
        // colonnade around the plaza and the great pillars
        m.box(-7.5, 7.5, 1.5, 1.5, 8, { mat: 'pillar' }); m.box(-7.5, -7.5, 1.5, 1.5, 8, { mat: 'pillar' });
        m.box(-16, 11, 1.2, 1.2, 4.2, { mat: 'pillar' }); m.box(-16, -11, 1.2, 1.2, 4.2, { mat: 'pillar' });
        m.box(-13.5, 3.5, 3.6, 1.2, 1.2, { mat: 'ruin' });
        // the west gate: two walls with an arch
        m.box(-31, 9.5, 2, 9, 5, { mat: 'ruin' }); m.box(-31, -10, 2, 8, 5, { mat: 'ruin' });
        m.box(-31, 0, 2, 12, 1.4, { y: 5, mat: 'ruin' });
        m.box(-25, 0, 2.4, 2.4, 1.6, { mat: 'temple' }); m.prop('statue', { x: -25, y: 1.6, z: 0, yaw: -Math.PI / 2 });
        // the sun ziggurat in the south: three tiers and a small shrine on top
        m.box(-30, -28, 16, 12, 2, { mat: 'temple', trim: 0xffd27a });
        m.box(-30, -29, 10, 7, 2, { y: 2, mat: 'temple' });
        m.room(-30, -29.5, 5, 4, 2.8, { y: 4, mat: 'ruin', open: [['n', 0, 1.8, 0, 2.2], ['e', 0, 1.6, 0, 2.2], ['w', 0, 1.6, 0, 2.2]], roofMat: 'roofstone' });
        m.ramp(-30, -20, 4, 4, 0, 2, 'z-', { mat: 'stepstone' }); m.ramp(-30, -23.5, 3, 3, 2, 4, 'z-', { mat: 'stepstone' });
        m.ramp(-40, -28, 4, 4, 0, 2, 'x+', { mat: 'stepstone' });
        m.prop('brazier', { x: -30, y: 7.2, z: -29.5 });
        // the sunken garden (south-west): pool, hedges, waterfall
        m.box(-50, -24, 1.2, 6, 1.4, { mat: 'hedge' }); m.box(-15, -18, 4, 1.2, 1.4, { mat: 'hedge' }); m.box(-46, -37, 3.5, 1.2, 1.4, { mat: 'hedge' });
        m.box(-19, -6, 1.6, 1.6, 1.2, { mat: 'ruin' }); m.box(-44, 4, 2, 2, 1.6, { mat: 'ruin' }); m.box(-12, -30, 2, 2, 1.6, { mat: 'ruin' });
        m.prop('pool', { x: -55, z: -34, w: 7, d: 6 });
        m.prop('waterfall', { x: -55, z: -41.9, w: 4, h: 7.5 });
        m.pack(-37, 2); m.pack(-14, -14);
        for (const p of [[-44, -6], [-30, 36, 3], [-20, -34], [-20, 9], [-52, 24], [-34, -29.5, 4]]) m.spawn('ffa', p[0], p[1], p[2] || 0);
        // greenery
        for (const t of [[-52, 32], [-58, -26], [-22, -12], [-40, 10], [-4, 36.5, 3], [-28, 38, 3], [-10, -14], [-6, -36], [-42, -16]]) m.prop('tree', { x: t[0], z: t[1], y: t[2] || 0, s: rand(0.9, 1.35) });
        for (const t of [[-14, 8], [-34, -4], [-26, 14], [-22, -14], [-46, -16], [-20, 38, 3], [-8, -24], [-36, 28]]) m.prop('bush', { x: t[0], z: t[1], y: t[2] || 0 });
        m.prop('vines', { x: -31, y: 6.4, z: 0, w: 11 }); m.prop('vines', { x: -12, y: 3, z: 30.45, w: 34 }); m.prop('vines', { x: -61, y: 7.2, z: 0, w: 26, yaw: Math.PI / 2 }); m.prop('vines', { x: -42, y: 4.6, z: 13.45, w: 10 });
        m.prop('brazier', { x: -10, y: 3, z: 31.6 });
      });
    },
  },

  // ---------------------------------------------------------------- Neon Quay: a container port in the rain
  quay: {
    key: 'quay', name: 'Neon Quay', sub: 'Container port · rain at night', bounds: { x0: -66, x1: 66, z0: -42, z1: 42 },
    theme: { sky: 'night', fog: [0x0c1424, 0.0095], sun: [0x8fb4ff, 0.9], sunDir: [0.3, 0.8, -0.4], hemi: [0x3a4c8a, 0x0a0c14, 0.4], exposure: 1.1, amb: 'rain', rain: true, floor: 'asphalt' },
    show: { x: -53, y: 0, z: -2, yaw: -Math.PI / 2 },
    build(M) {
      M.box(0, 43, 136, 1, 10, { mat: 'none', vis: false }); M.box(0, -43, 136, 1, 10, { mat: 'none', vis: false });
      M.box(-67, 0, 2, 88, 10, { mat: 'shed' }); M.box(67, 0, 2, 88, 10, { mat: 'shed' });
      M.prop('water', {}); M.prop('rain', {});
      // the central warehouse
      M.box(0, 0, 22, 20, 0.5, { y: 7, mat: 'roof', trim: 0xff3ad6 });
      M.zone(0, 0, 0, 4.8);
      M.both(m => {
        m.box(-7, 9.7, 8, 0.6, 7, { mat: 'shedwall' }); m.box(7, 9.7, 8, 0.6, 7, { mat: 'shedwall' });
        m.box(0, 9.7, 6, 0.6, 3, { y: 4, mat: 'shedwall' });
        m.box(-10.7, 6.5, 0.6, 7, 7, { mat: 'shedwall' }); m.box(-10.7, -6.5, 0.6, 7, 7, { mat: 'shedwall' }); m.box(-10.7, 0, 0.6, 6, 3, { y: 4, mat: 'shedwall' });
        m.box(4, 7.2, 12.4, 4.4, 0.4, { y: 3.2, mat: 'grate', trim: 0xff3ad6 });
        m.prop('railing', { x: -2.2, z: 5.0, x2: 10.2, z2: 5.0, y: 3.6 });
        m.ramp(-6.2, 7.2, 7.6, 3.6, 0, 3.6, 'x+', { mat: 'grate' });
        m.box(-3.8, 1.8, 1.6, 1.6, 1.5, { mat: 'crate' }); m.box(5.5, -1.8, 2.6, 1.3, 1.1, { mat: 'crate' });
        m.light(-4, 6.2, 0, 0xff4ad6, 2.0, 12); m.light(4, 6.2, 3, 0x4adfff, 1.6, 12);
        m.prop('sign', { x: 0, y: 5.6, z: 10.05, yaw: 0, w: 5.2, h: 1.0, text: m.flip ? 'BERTH 9' : 'PIER 34', color: m.flip ? 0xff3a8a : 0x3affea });
        m.prop('stringLights', { x: -10.4, y: 6.5, z: -9.4, x2: 10.4, z2: 9.4 });
        m.prop('neon', { x: -11.05, z: 10.05, h: 6.6, color: 0x3affea }); m.prop('neon', { x: 11.05, z: 10.05, h: 6.6, color: 0xff3ad6 });
        // base shed with three roll-up doors
        m.room(-59, 0, 12, 34, 6, { mat: 'shedwall', open: [['e', -10, 4, 0, 4.4], ['e', 0, 4, 0, 4.4], ['e', 10, 4, 0, 4.4]], roofMat: 'roof', trim: m.flip ? 0xff7a2e : 0x2ee6ff });
        for (const z of [-10, -5, 0, 5, 10]) m.spawn(0, -62, z);
        for (const z of [-7, 0, 7]) m.spawn(0, -58, z);
        m.light(-59, 5.2, -7, 0x9ad0ff, 1.8, 13); m.light(-59, 5.2, 7, 0x9ad0ff, 1.8, 13);
        m.prop('sign', { x: -52.7, y: 5.0, z: 5, yaw: Math.PI / 2, w: 4.2, h: 0.8, text: m.flip ? 'EAST DOCK' : 'WEST DOCK', color: m.flip ? 0xff7a2e : 0x2ee6ff });
        // the container yard: stacks two high with bridges between their tops
        m.box(-28, 24, 18, 2.5, 2.6, { mat: 'container' });
        m.box(-28, 24, 6, 2.5, 2.6, { y: 2.6, mat: 'container2', trim: 0xffd23a });
        m.ramp(-40.5, 24, 7, 2.5, 0, 2.6, 'x+', { mat: 'grate' });
        m.pad(-28, 20.4, 0, -28, 24, 5.25, 2.2);
        m.box(-36, 10, 2.5, 6, 2.6, { mat: 'container2' }); m.box(-36, 10, 2.5, 6, 2.6, { y: 2.6, mat: 'container' });
        m.walk(-34.75, 10, -19.25, 10, 5.2, 1.6, { mat: 'grate', post: 'iron', posts: false });
        m.box(-18, 10, 2.5, 6, 2.6, { mat: 'container3' }); m.box(-18, 10, 2.5, 6, 2.6, { y: 2.6, mat: 'container2' });
        m.ramp(-18, 16.5, 2.5, 7, 0, 5.2, 'z-', { mat: 'grate' });
        m.box(-22, 3, 6, 2.5, 2.6, { mat: 'container3' });
        m.box(-31, -6, 6, 2.5, 2.6, { mat: 'container' });
        m.box(-19, -15, 2.5, 6, 2.6, { mat: 'container3' }); m.box(-19, -15, 2.5, 6, 2.6, { y: 2.6, mat: 'container' });
        m.box(-35, -22, 6, 2.5, 5.2, { mat: 'container2' });
        m.box(-44, -12, 2.5, 6, 2.6, { mat: 'container' });
        m.box(-13, 18, 1.4, 1.4, 1.4, { mat: 'crate' }); m.box(-42, 0, 1.4, 2.8, 1.2, { mat: 'crate' });
        m.box(-26, -30, 2.4, 1.2, 1.2, { mat: 'barrier' }); m.box(-13, -6, 1.2, 2.6, 1.2, { mat: 'barrier' });
        // crane legs (the gantry above is dressing)
        m.box(-28, 15.5, 0.8, 0.8, 14, { mat: 'crane' }); m.box(-28, -15.5, 0.8, 0.8, 14, { mat: 'crane' });
        m.prop('crane', { x: -28, z: 0 });
        // the harbour office to the north: two floors, an outside stair, and windows over the yard
        m.room(-46, 34, 12, 8, 3.4, { mat: 'shedwall', open: [['s', -3, 1.8, 0, 2.6], ['s', 2.5, 2.6, 1.0, 2.4], ['e', 1, 1.6, 0, 2.6]], roof: false });
        m.box(-46, 34, 12, 8, 0.3, { y: 3.4, mat: 'grate' });
        m.room(-46, 34, 12, 8, 3, { y: 3.7, mat: 'shedwall', open: [['s', 0, 6, 0.9, 2.4], ['e', -1.5, 1.6, 0, 2.4], ['w', 0, 3, 0.9, 2.2]], roofMat: 'roof', trim: 0x3affea });
        m.walk(-39.75, 32.5, -31, 32.5, 3.7, 2, { mat: 'grate', post: 'iron' });
        m.ramp(-32, 37, 2, 7, 0, 3.7, 'z-', { mat: 'grate' });
        m.box(-48, 35.5, 3, 1.4, 1.0, { mat: 'crate' }); m.light(-46, 6, 34, 0xa8e8ff, 1.5, 11);
        m.prop('sign', { x: -46, y: 7.2, z: 29.7, yaw: Math.PI, w: 4.6, h: 0.8, text: 'HARBOUR OFFICE', color: 0x3affea });
        m.pack(-46, 36);
        // the fish market to the south: stalls under awnings
        for (const x of [-50, -40, -30]) { m.box(x, -36, 6, 3, 0.25, { y: 3.2, mat: 'shed', trim: x === -40 ? 0xffd23a : 0xff3ad6 }); for (const dx of [-2.6, 2.6]) for (const dz of [-1.2, 1.2]) m.box(x + dx, -36 + dz, 0.2, 0.2, 3.2, { mat: 'iron' }); m.box(x, -36.8, 5, 1, 1.0, { mat: 'crate' }); }
        m.prop('stringLights', { x: -54, y: 3.6, z: -34, x2: -26, z2: -34 });
        m.pack(-12, -26);
        for (const p of [[-40, -14], [-24, 0], [-32, 31], [-10, 18], [-50, -30], [-44, 33, 3.7]]) m.spawn('ffa', p[0], p[1], p[2] || 0);
        m.prop('bollards', { x: -65, x2: 65, z: 41.6 });
        m.prop('sign', { x: -36, y: 2.0, z: 6.98, yaw: Math.PI, w: 3, h: 0.6, text: 'NO STACKING', color: 0xffd23a });
        m.prop('lamp', { x: -20, y: 5.6, z: 38.5, yaw: Math.PI, color: 0xffb46a, pole: true });
        m.prop('lamp', { x: -34, y: 5.6, z: -28.5, yaw: 0, color: 0x9ad8ff, pole: true });
        m.light(-20, 5.4, 37.5, 0xffb46a, 2.0, 14); m.light(-34, 5.4, -27.5, 0x9ad8ff, 1.6, 14);
        m.light(-28, 2.5, 20, 0xff3ad6, 1.4, 9); m.light(-40, 2.8, -36, 0xff7ad6, 1.4, 10);
        m.prop('puddle', { x: -30, z: 2, s: 3 }); m.prop('puddle', { x: -16, z: -24, s: 2.4 }); m.prop('puddle', { x: -6, z: 16, s: 2 }); m.prop('puddle', { x: -48, z: 20, s: 2.6 });
      });
      M.prop('skyline', {});
    },
  },

  // ---------------------------------------------------------------- Hollowmere: a stilt village in a drowned forest
  hollowmere: {
    key: 'hollowmere', name: 'Hollowmere', sub: 'Stilt village in the marsh · dusk', bounds: { x0: -70, x1: 70, z0: -46, z1: 46 },
    theme: { sky: 'murk', fog: [0x3a4a3a, 0.0125], sun: [0xe8e0a8, 2.2], sunDir: [0.6, 0.36, 0.5], hemi: [0x8aa088, 0x1a1e12, 0.55], exposure: 1.0, amb: 'wind', floor: 'mud' },
    show: { x: -50, y: 2.4, z: 1, yaw: -Math.PI / 2 },
    build(M) {
      M.box(0, 47, 144, 2, 6, { mat: 'none', vis: false }); M.box(0, -47, 144, 2, 6, { mat: 'none', vis: false });
      M.box(-71, 0, 2, 96, 6, { mat: 'none', vis: false }); M.box(71, 0, 2, 96, 6, { mat: 'none', vis: false });
      M.prop('bog', {});
      // the Hollow Tree: a mossy island with a giant trunk and a ring of platforms around it
      M.box(0, 0, 18, 18, 1.2, { mat: 'mossstone', trim: 0xb48aff });
      M.box(0, 0, 3.6, 3.6, 18, { y: 1.2, mat: 'darkwood', round: true });
      M.zone(0, 0, 1.2, 6.2);
      M.both(m => {
        // the ring around the trunk: two decks here, two mirrored
        m.box(-6.5, 0, 2.5, 15.5, 0.3, { y: 4.4, mat: 'plank', trim: 0xb48aff }); m.box(0, 6.5, 10.5, 2.5, 0.3, { y: 4.4, mat: 'plank', trim: 0xb48aff });
        for (const [x, z] of [[-7.5, -7.5], [-7.5, 7.5], [-7.5, 0]]) m.box(x, z, 0.4, 0.4, 3.2, { y: 1.2, mat: 'darkwood', round: true });
        m.ramp(-12.5, -6.5, 9, 2.4, 0, 4.7, 'x+', { mat: 'plank' });
        m.ramp(-11, 2, 4, 3, 0, 1.2, 'x+', { mat: 'stepstone' }); m.ramp(-3, 11, 3, 4, 0, 1.2, 'z-', { mat: 'stepstone' });
        // the ferry house: spawn, up on its stilts, three stairs down into the water
        m.box(-62, 0, 14, 26, 0.4, { y: 2, mat: 'plank', trim: m.flip ? 0xff9a4a : 0x4ae0ff });
        m.room(-63, 0, 10, 22, 4, { y: 2.4, mat: 'darkwood', open: [['e', -6, 3, 0, 3], ['e', 6, 3, 0, 3], ['e', 0, 2.4, 1, 2.6]], roofMat: 'thatch' });
        for (const [x, z] of [[-68, -12.5], [-68, 12.5], [-56, -12.5], [-56, 12.5], [-62, 0], [-56, 0]]) m.box(x, z, 0.5, 0.5, 2, { mat: 'darkwood', round: true });
        for (const z of [-8, -4, 0, 4, 8]) m.spawn(0, -65, z, 2.4);
        for (const z of [-6, 6]) m.spawn(0, -60.5, z, 2.4);
        m.ramp(-53, -9, 4, 3, 0, 2.4, 'x-', { mat: 'plank' });
        m.walk(-55, 10, -49, 10, 2.4, 2.4);
        m.ramp(-62, 15, 3, 4, 0, 2.4, 'z-', { mat: 'plank' });
        m.prop('hanglantern', { x: -55.5, y: 3.6, z: -3, x2: -56.3, z2: -3, base: 2.4, color: m.flip ? 0xffa060 : 0x8ae0ff }); m.prop('hanglantern', { x: -55.5, y: 3.6, z: 3, x2: -56.3, z2: 3, base: 2.4, color: m.flip ? 0xffa060 : 0x8ae0ff });
        m.light(-63, 5.6, -5, 0xffc27a, 1.6, 12); m.light(-63, 5.6, 5, 0xffc27a, 1.6, 12);
        // the boardwalk ring: north and south runs on stilts, huts along them
        m.walk(-55, 2, -40, 2, 2.4, 2.4, { rails: [-1] });                 // spawn -> middle hut
        m.room(-36, 2, 8, 7, 3.2, { y: 2.4, mat: 'darkwood', floor: 'plank', open: [['w', 0, 2.2, 0, 2.6], ['e', 0, 2.2, 0, 2.6], ['n', 1.5, 1.8, 1, 2.4], ['s', 0, 2, 0, 2.6]], roofMat: 'thatch' });
        for (const [x, z] of [[-39.6, -1.2], [-32.4, -1.2], [-39.6, 5.2], [-32.4, 5.2]]) m.box(x, z, 0.45, 0.45, 2.1, { mat: 'darkwood', round: true });
        m.ramp(-36, -3.5, 2, 4, 0, 2.4, 'z+', { mat: 'plank' });
        m.walk(-32, 2, -22, 2, 2.4, 2, { rails: [1] });
        m.ramp(-19.5, 2, 5, 2, 2.4, 0, 'x+', { mat: 'plank' });
        // north run
        m.walk(-50, 11.2, -50, 21, 2.4, 2.2);
        m.walk(-50, 21, -24, 21, 2.4, 2.4, { rails: [1] });
        m.room(-40, 26, 9, 7, 3.4, { y: 2.4, mat: 'darkwood', floor: 'plank', open: [['s', -2, 2.2, 0, 2.6], ['e', 0, 1.8, 0, 2.6], ['n', 1, 2.4, 1, 2.4]], roofMat: 'thatch' });
        for (const [x, z] of [[-44, 23], [-36, 23], [-44, 29], [-36, 29]]) m.box(x, z, 0.45, 0.45, 2.1, { mat: 'darkwood', round: true });
        m.walk(-24, 21, -24, 32, 2.4, 2);
        m.room(-20, 36, 10, 8, 3.4, { y: 2.4, mat: 'darkwood', floor: 'plank', open: [['w', -1, 2, 0, 2.6], ['s', -4, 2.2, 0, 2.6], ['s', 2, 2.2, 0, 2.6], ['e', 0, 2.2, 0, 2.6]], roofMat: 'thatch' });
        for (const [x, z] of [[-24.5, 32.5], [-15.5, 32.5], [-24.5, 39.5], [-15.5, 39.5]]) m.box(x, z, 0.45, 0.45, 2.1, { mat: 'darkwood', round: true });
        m.ramp(-12.5, 36, 5, 2.2, 2.4, 0, 'x+', { mat: 'plank' });
        m.pad(-30, 12, 0, -30, 21, 2.5, 2.4);
        m.pack(-40, 27, 2.4);
        // south run, lower and broken, past the sunken barge
        m.ramp(-48.5, -20, 5, 2, 0, 1.6, 'x+', { mat: 'plank' });
        m.walk(-46, -20, -26, -20, 1.6, 2, { rails: [-1] });
        m.ramp(-23.5, -20, 5, 2, 1.6, 0, 'x+', { mat: 'plank' });
        m.box(-36, -32, 16, 5, 1.6, { mat: 'darkwood' }); m.box(-41, -32, 4, 4, 2.4, { y: 1.6, mat: 'darkwood' });
        m.box(-34, -33.4, 1.6, 1.6, 1.0, { y: 1.6, mat: 'crate' });
        m.ramp(-26.5, -32, 3, 3, 0, 1.6, 'x-', { mat: 'plank' });
        m.room(-14, -24, 7, 7, 3, { mat: 'mossstone', open: [['n', 0, 2, 0, 2.4], ['e', 0, 2, 0, 2.4], ['w', 1.5, 1.4, 1.1, 2.2]], roofMat: 'thatch' });
        m.pack(-14, -24);
        // cover on the marsh floor: stumps, stones, a fallen log
        m.box(-28, 10, 6, 1.1, 1.1, { mat: 'darkwood' }); m.box(-14, 14, 2, 2, 1.4, { mat: 'mossstone' }); m.box(-44, -10, 2.4, 2, 1.2, { mat: 'mossstone' });
        m.box(-20, -8, 1.6, 1.6, 1.5, { mat: 'darkwood', round: true }); m.box(-32, -10, 3, 1.4, 1.3, { mat: 'mossstone' }); m.box(-12, -38, 4, 2, 1.4, { mat: 'mossstone' });
        m.box(-56, 30, 3, 3, 1.6, { mat: 'mossstone' }); m.box(-58, -32, 2, 4, 1.2, { mat: 'mossstone' });
        for (const p of [[-44, 12], [-24, 28, 2.4], [-18, -14], [-34, -32, 1.6], [-56, -24], [-8, 30]]) m.spawn('ffa', p[0], p[1], p[2] || 0);
        for (const t of [[-56, 38], [-30, -42], [-8, -28], [-46, 40], [-64, -40], [-4, 22], [-24, 44]]) m.prop('deadtree', { x: t[0], z: t[1], s: rand(0.9, 1.4) });
        for (const t of [[-30, 14], [-12, 8], [-44, -26], [-22, -36], [-56, 22], [-8, -16], [-34, 40], [-60, -18]]) m.prop('reeds', { x: t[0], z: t[1] });
        m.prop('hanglantern', { x: -37.4, y: 4.2, z: -2.2, x2: -38.2, z2: -2.2, base: 0, color: 0xffc070 }); m.prop('hanglantern', { x: -24.6, y: 4.3, z: 21, x2: -25.4, z2: 20.4, base: 2.4, color: 0xffc070 }); m.prop('hanglantern', { x: -38.6, y: 4.4, z: 21.4, x2: -38.6, z2: 20.4, base: 2.4, color: 0xb48aff, i: 1.0 });
        m.prop('hanglantern', { x: -45.4, y: 3.2, z: -20.1, x2: -45.4, z2: -20.8, base: 1.6, color: 0x9aff5a, i: 1.0 }); m.prop('hanglantern', { x: -12.2, y: 3.8, z: -20.0, x2: -12.2, z2: -19.2, base: 0, color: 0xffc070 });
        m.prop('hanglantern', { x: -6.5, y: 6.4, z: -5.6, x2: -6.5, z2: -6.6, base: 4.7, color: 0xb48aff, i: 1.4, d: 12 });
        for (const x of [-4.6, 4.6]) m.box(x, 6.5, 0.4, 0.4, 3.2, { y: 1.2, mat: 'darkwood', round: true });
      });
      M.prop('skyline', {});
      M.light(0, 9, 0, 0xb48aff, 2.4, 20);
    },
  },

  // ---------------------------------------------------------------- Frostwatch: an observatory on a frozen ridge
  frostwatch: {
    key: 'frostwatch', name: 'Frostwatch', sub: 'Mountain observatory · snowfall', bounds: { x0: -70, x1: 70, z0: -46, z1: 46 },
    theme: { sky: 'frost', fog: [0xc8d4e2, 0.0085], sun: [0xfff0dc, 3.0], sunDir: [-0.4, 0.5, 0.55], hemi: [0xc8dcff, 0x6a7080, 0.7], exposure: 0.78, amb: 'wind', floor: 'snow', snow: true },
    show: { x: -52, y: 0, z: 3, yaw: -Math.PI / 2 },
    build(M) {
      M.box(0, 47, 144, 2, 14, { mat: 'frostwall', shadow: false }); M.box(0, -47, 144, 2, 14, { mat: 'frostwall', shadow: false });
      M.box(-71, 0, 2, 96, 14, { mat: 'frostwall', shadow: false }); M.box(71, 0, 2, 96, 14, { mat: 'frostwall', shadow: false });
      M.prop('snow', {});
      // the observatory: a granite plateau, the drum of the dome on it, doors at every side
      M.box(0, 0, 24, 24, 3, { mat: 'granite', trim: 0x8ad8ff });
      M.zone(0, 0, 3, 4.6);
      M.prop('telescope', { x: 0, y: 3, z: 0, color: 0x8ad8ff });
      M.box(0, 0, 1.6, 1.6, 1.6, { y: 3, mat: 'iron', vis: false });
      M.room(0, 0, 14, 14, 6, { y: 3, mat: 'frostwall', open: [['w', 0, 3.2, 0, 3.2], ['e', 0, 3.2, 0, 3.2], ['s', -3, 2.4, 0, 3], ['n', 3, 2.4, 0, 3], ['s', 3.5, 1.6, 1.2, 2.6], ['n', -3.5, 1.6, 1.2, 2.6], ['w', 4.5, 1.4, 1.2, 2.6], ['e', -4.5, 1.4, 1.2, 2.6]], roof: false });
      M.both(m => {
        m.box(-3.6, 0, 7.2, 14.5, 0.5, { y: 9, mat: 'copper', vis: true });
        m.ramp(-15, 0, 6, 5, 0, 3, 'x+', { mat: 'stairs' });
        m.ramp(-9, -14.5, 5, 5, 0, 3, 'z+', { mat: 'stairs' });
        m.box(-9.5, 9.5, 2.4, 2.4, 1.2, { y: 3, mat: 'crate' }); m.box(-10.5, -6, 1.2, 3.5, 1.2, { y: 3, mat: 'granite' });
        m.light(-3.5, 7.5, -3.5, 0xbfe4ff, 1.6, 12);
        // the lodge: spawn, timber walls and a stone hearth
        m.room(-62, 0, 12, 26, 5.5, { mat: 'darkwood', open: [['e', -8, 3.4, 0, 3.2], ['e', 8, 3.4, 0, 3.2], ['e', 0, 3, 1.1, 2.8]], roofMat: 'roof', trim: m.flip ? 0xff9a4a : 0x4ae0ff });
        m.box(-67, 0, 1.6, 4, 3, { mat: 'granite' });
        for (const z of [-10, -5, 0, 5, 10]) m.spawn(0, -63, z);
        for (const z of [-7, 7]) m.spawn(0, -59, z);
        m.prop('brazier', { x: -65.6, y: 0, z: 0 }); m.light(-65.6, 1.2, 0, 0xff9a40, 1.6, 9);
        m.light(-62, 5, -7, 0xffd6a0, 1.6, 12); m.light(-62, 5, 7, 0xffd6a0, 1.6, 12);
        m.prop('sign', { x: -55.7, y: 4.6, z: 4, yaw: Math.PI / 2, w: 3.8, h: 0.8, text: m.flip ? 'EAST LODGE' : 'WEST LODGE', color: m.flip ? 0xff9a4a : 0x4ae0ff });
        // the north ridge, a stone shelf with a bridge to the plateau
        m.box(-22, 36, 34, 12, 3, { mat: 'granite' });
        m.box(-10, 30.5, 2, 1, 1, { y: 3, mat: 'frostwall' }); m.box(-30, 30.5, 6, 1, 1, { y: 3, mat: 'frostwall' });
        m.ramp(-42, 36, 6, 5, 0, 3, 'x+', { mat: 'stairs' }); m.ramp(-25, 27.5, 5, 5, 0, 3, 'z+', { mat: 'stairs' });
        m.walk(-8, 30, -8, 12, 3, 3, { mat: 'plank', post: 'iron', rails: [-1, 1] });
        // the antenna mast: a lattice tower with a sniper's platform
        m.box(-40, 22, 6, 6, 0.4, { y: 6.6, mat: 'grate', trim: 0x8ad8ff });
        for (const [x, z] of [[-42.7, 19.3], [-37.3, 19.3], [-42.7, 24.7], [-37.3, 24.7]]) m.box(x, z, 0.4, 0.4, 6.6, { mat: 'iron' });
        m.box(-40, 22, 0.3, 0.3, 9, { y: 7, mat: 'iron' });
        m.ramp(-37.5, 28.5, 3, 7, 3, 7, 'z-', { mat: 'grate' });
        m.prop('railing', { x: -43, z: 19, x2: -37, z2: 19, y: 7 });
        // the bunker: a low concrete block with slit windows, facing the middle
        m.room(-34, -16, 12, 8, 3, { mat: 'concrete', open: [['e', 0, 6, 1.2, 1.9], ['n', -3, 2, 0, 2.5], ['s', 3, 2, 0, 2.5], ['w', 0, 2, 0, 2.5]], roofMat: 'concrete' });
        m.box(-34, -16, 1, 1, 1, { mat: 'crate' });
        m.pack(-34, -16);
        // the frozen tarn to the south: slick ice and rock islands
        m.box(-30, -36, 26, 14, 0.06, { mat: 'ice' });
        m.box(-36, -34, 3, 2.4, 1.6, { y: 0.06, mat: 'granite' }); m.box(-24, -38, 2.4, 3, 2.2, { y: 0.06, mat: 'granite' }); m.box(-18, -31, 2, 2, 1.2, { y: 0.06, mat: 'granite' });
        // ridgelines that make the lanes
        m.box(-48, 14, 4, 6, 2.6, { mat: 'granite' }); m.box(-46, -10, 3, 8, 2.2, { mat: 'granite' }); m.box(-24, 6, 3, 3, 1.4, { mat: 'granite' });
        m.box(-20, -6, 5, 2, 1.6, { mat: 'granite' }); m.box(-14, 20, 2, 5, 2.0, { mat: 'granite' }); m.box(-54, -28, 6, 5, 3, { mat: 'granite' });
        m.box(-26, 16, 2, 2, 1.2, { mat: 'crate' }); m.box(-40, 4, 2.4, 1.2, 1.2, { mat: 'barrier' });
        m.pack(-26, 36, 3); m.pack(-18, -22);
        for (const p of [[-44, 0], [-28, 36, 3], [-30, -36, 0.06], [-24, -6], [-50, 30], [-40, 22, 7]]) m.spawn('ffa', p[0], p[1], p[2] || 0);
        for (const t of [[-56, 40], [-60, -40], [-48, -42], [-16, 42], [-6, -40], [-64, 26], [-30, 44], [-44, -24], [-18, 8]]) m.prop('pine', { x: t[0], z: t[1], s: rand(0.9, 1.4) });
        m.prop('lamp', { x: -36, y: 3.4, z: -11.9, yaw: Math.PI, color: 0xbfe4ff });
        m.light(-34, 2.6, -16, 0xbfe4ff, 1.2, 10); m.light(-40, 7.6, 22, 0x8ad8ff, 1.4, 10);
      });
      M.prop('skyline', {});
      M.light(0, 10, 0, 0x8ad8ff, 2.0, 22);
    },
  },
};
const MAP_KEYS = Object.keys(MAPS);
