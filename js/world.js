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
        const s = { x0: cx - w / 2, x1: cx + w / 2, y0: y, y1: y + h, z0: cz - d / 2, z1: cz + d / 2, mat: o.mat || 'concrete', trim: o.trim || null, vis: o.vis !== false, col: o.col !== false, side: this.flip ? 1 : 0, tag: o.tag || null, shadow: o.shadow !== false };
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
      // run fn once for the near half and once mirrored through the centre (point symmetry: (x, z) -> (-x, -z))
      both(fn) { this.flip = false; fn(this); this.flip = true; fn(this); this.flip = false; },
    };
    def.build(M);
    this.buildNav();
  },

  rampH(r, x, z) {
    const t = r.axis === 0 ? (x - r.x0) / (r.x1 - r.x0) : (z - r.z0) / (r.z1 - r.z0);
    return lerp(r.h0, r.h1, clamp(t, 0, 1));
  },

  // the highest surface at (x, z) that is no higher than maxY
  groundAt(x, z, maxY, m = 0.2) {
    let best = 0;
    for (const s of this.solids) {
      if (!s.col || s.y1 > maxY || s.y1 <= best) continue;
      if (x >= s.x0 - m && x <= s.x1 + m && z >= s.z0 - m && z <= s.z1 + m) best = s.y1;
    }
    for (const r of this.ramps) {
      if (x < r.x0 - m || x > r.x1 + m || z < r.z0 - m || z > r.z1 + m) continue;
      const h = this.rampH(r, x, z); if (h <= maxY && h > best) best = h;
    }
    return best;
  },
  ceilAt(x, z, y0, y1, m) {
    let c = null;
    for (const s of this.solids) {
      if (!s.col || s.y0 < y0 - 0.05 || s.y0 >= y1) continue;
      if (x >= s.x0 - m && x <= s.x1 + m && z >= s.z0 - m && z <= s.z1 + m) if (c === null || s.y0 < c) c = s.y0;
    }
    return c;
  },
  // push a vertical cylinder (feet yLo .. head yHi) out of everything it overlaps; returns the last push normal or null
  collideXZ(p, r, yLo, yHi) {
    let hit = null;
    for (let pass = 0; pass < 2; pass++) {
      for (const s of this.solids) {
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
      for (const R of this.ramps) {
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
    const ix = 1 / (dx || 1e-12), iy = 1 / (dy || 1e-12), iz = 1 / (dz || 1e-12);
    for (const s of this.solids) {
      if (!s.col) continue;
      let t1 = (s.x0 - ox) * ix, t2 = (s.x1 - ox) * ix, tmin = Math.min(t1, t2), tmax = Math.max(t1, t2);
      t1 = (s.y0 - oy) * iy; t2 = (s.y1 - oy) * iy; tmin = Math.max(tmin, Math.min(t1, t2)); tmax = Math.min(tmax, Math.max(t1, t2));
      t1 = (s.z0 - oz) * iz; t2 = (s.z1 - oz) * iz; tmin = Math.max(tmin, Math.min(t1, t2)); tmax = Math.min(tmax, Math.max(t1, t2));
      if (tmax < Math.max(tmin, 0) || tmin >= best) continue;
      if (tmin < 0) continue;      // started inside: ignore (we never shoot from inside a wall)
      best = tmin; hit = { s };
    }
    for (const R of this.ramps) {
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
      const ys = [0];
      for (const s of this.solids) if (s.col && x >= s.x0 && x <= s.x1 && z >= s.z0 && z <= s.z1) ys.push(s.y1);
      for (const r of this.ramps) if (x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1) ys.push(this.rampH(r, x, z));
      const list = [];
      for (const y of ys) {
        // the surface must be the top of whatever is here at that height (nothing solid just above it) ...
        let ok = true;
        for (const s of this.solids) {
          if (!s.col) continue;
          if (s.y0 < y + 1.85 && s.y1 > y + 0.05 && x >= s.x0 - 0.5 && x <= s.x1 + 0.5 && z >= s.z0 - 0.5 && z <= s.z1 + 0.5) {
            // ... and leave room for a body: nothing within half a metre between knee and head height
            const cx = clamp(x, s.x0, s.x1), cz = clamp(z, s.z0, s.z1);
            if ((x - cx) ** 2 + (z - cz) ** 2 < 0.5 * 0.5 && s.y1 > y + PHYS.step) { ok = false; break; }
          }
        }
        if (!ok) continue;
        for (const r of this.ramps) {
          if (x < r.x0 - 0.45 || x > r.x1 + 0.45 || z < r.z0 - 0.45 || z > r.z1 + 0.45) continue;
          const hs = this.rampH(r, clamp(x, r.x0, r.x1), clamp(z, r.z0, r.z1));
          if (hs > y + PHYS.step && r.base < y + 1.8) { ok = false; break; }
        }
        if (!ok) continue;
        if (list.some(n => Math.abs(nodes[n].y - y) < 0.3)) continue;
        const id = nodes.length; nodes.push({ id, x, y, z, i, j, e: [] }); list.push(id);
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
          if (dy > 0.56) continue;                               // too high to step up
          if (dy < -0.56 && dy < -4.6) continue;                  // too far to drop
          if (di && dj) {                                          // no cutting corners
            if (at(n.i + di, n.j, n.y + dy / 2, 0.6) < 0 || at(n.i, n.j + dj, n.y + dy / 2, 0.6) < 0) continue;
          }
          if (dy < -0.56) { if (di && dj) continue; link(n.id, m, 1.6 + -dy * 0.3); continue; }      // walk off a ledge (one way)
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
    while (heap.length && it++ < 9000) {
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
  // ---------------------------------------------------------------- Kiln Yard: a foundry yard at the end of the day
  kiln: {
    key: 'kiln', name: 'Kiln Yard', sub: 'Foundry district · dusk', bounds: { x0: -50, x1: 50, z0: -33, z1: 33 },
    theme: { sky: 'dusk', fog: [0x4a2f3c, 0.0065], sun: [0xffa860, 3.4], sunDir: [-0.55, 0.32, -0.62], hemi: [0x7a6cd8, 0x3d2416, 0.42], exposure: 0.92, amb: 'wind', floor: 'concrete' },
    build(M) {
      // perimeter
      M.box(0, 34, 104, 2, 12, { mat: 'brick', shadow: false }); M.box(0, -34, 104, 2, 12, { mat: 'brick', shadow: false });
      M.box(-51, 0, 2, 70, 12, { mat: 'brick', shadow: false }); M.box(51, 0, 2, 70, 12, { mat: 'brick', shadow: false });
      // the Crucible: a raised casting floor in the middle
      M.box(0, 0, 12, 10, 2.4, { mat: 'steel', trim: 0xff8a3a });
      M.box(0, 0, 1.8, 1.8, 1.25, { y: 2.4, mat: 'iron' });
      M.zone(0, 0, 2.4, 4.6);
      M.both(m => {
        // spawn garage
        m.box(-40, -15.5, 1, 9, 5.5, { mat: 'brick' }); m.box(-40, -4.5, 1, 3, 5.5, { mat: 'brick' });
        m.box(-40, 4.5, 1, 3, 5.5, { mat: 'brick' }); m.box(-40, 15.5, 1, 9, 5.5, { mat: 'brick' });
        m.box(-45, 20.5, 10, 1, 5.5, { mat: 'brick' }); m.box(-45, -20.5, 10, 1, 5.5, { mat: 'brick' });
        m.box(-45.5, 0, 11, 42, 0.6, { y: 5.5, mat: 'roof', shadow: true });
        for (const z of [-8, -4, 0, 4, 8]) m.spawn(0, -46.5, z);
        for (const z of [-6, -2, 2, 6]) m.spawn(0, -44, z);
        m.light(-45, 4.6, -10, 0xffc27a, 2.2, 14); m.light(-45, 4.6, 10, 0xffc27a, 2.2, 14);
        m.prop('lamp', { x: -40.9, y: 4.6, z: 0, yaw: Math.PI / 2, color: 0xffb35c });
        m.prop('sign', { x: -40.45, y: 4.2, z: -8.5, yaw: -Math.PI / 2, w: 3.6, h: 0.9, text: 'BAY 0' + (m.flip ? '2' : '1'), color: m.flip ? 0xff8a3a : 0x3ad6ff });
        // corners behind the garage: a gas holder and a scrap bunker
        m.box(-45, 27, 10, 12, 8, { mat: 'tank' }); m.box(-45, -27, 10, 12, 6.5, { mat: 'brick' });
        // the north catwalk, with its stair at the west end and the pad that throws you up from the yard
        m.box(-13, 23.5, 38, 3, 0.35, { y: 3.6, mat: 'grate', trim: 0xffa040 });
        for (const x of [-28, -18, -8, 2]) m.box(x, 23.5, 0.45, 0.45, 3.6, { mat: 'iron' });
        m.prop('railing', { x: -32, z: 25.0, x2: 6, z2: 25.0, y: 3.95 });
        m.ramp(-36, 23.5, 8, 3, 0, 3.95, 'x+', { mat: 'grate' });
        m.pad(-6, 19.5, 0, -4, 23.5, 3.95, 2.2);
        // furnace stacks and the yard
        m.box(-24, 4, 3.2, 3.2, 10, { mat: 'stack' });
        m.box(-22, -22, 8, 8, 5, { mat: 'brick', trim: 0xff7a2e });
        m.box(-22, -17.4, 3, 1.2, 1.4, { mat: 'crate' });
        m.box(-18, -7, 4, 2.5, 2.2, { mat: 'crate' }); m.box(-18.6, -7, 1.6, 1.6, 1.4, { y: 2.2, mat: 'crate' });
        m.box(-13.5, 10, 2, 2, 1.3, { mat: 'crate' });
        m.box(-30.5, -6, 2.4, 2.4, 1.3, { mat: 'crate' });
        m.box(-28, 13, 5, 1.6, 2.4, { mat: 'barrier' });
        m.box(-9, -15.5, 3, 1.4, 1.5, { mat: 'barrier' });
        m.box(-11, 17.5, 1.5, 4, 1.8, { mat: 'crate' });
        m.box(-33, 6, 1.4, 5, 1.5, { mat: 'barrier' });
        m.box(-31, -14, 2.2, 4, 2.6, { mat: 'crate' });
        // crucible access and cover on top
        m.ramp(-9, 0, 6, 3.6, 0, 2.4, 'x+', { mat: 'stairs' });
        m.ramp(3, 8, 3.4, 6, 0, 2.4, 'z-', { mat: 'stairs' });
        m.box(-4.3, -3.6, 2.2, 0.5, 1.1, { y: 2.4, mat: 'iron' });
        m.box(4.6, 2.6, 0.5, 2, 1.1, { y: 2.4, mat: 'iron' });
        m.pack(-20, 0); m.pack(-5, -21);
        for (const p of [[-34, 0], [-20, 14], [-12, -26], [-28, 26]]) m.spawn('ffa', p[0], p[1]);
        // set dressing
        m.prop('molten', { x: -18, z: 0.0, w: 8, d: 0.9 }); m.prop('molten', { x: -30, z: -24.5, w: 0.9, d: 9 });
        m.prop('pipe', { pts: [[-49.6, 9, -32], [-49.6, 9, 32]], r: 0.5 });
        m.prop('pipe', { pts: [[-24, 9.5, 4], [-24, 9.5, 18], [-10, 9.5, 18], [-10, 9.5, 33]], r: 0.35 });
        m.prop('pipe', { pts: [[-30, 6.8, -33], [-30, 6.8, -22], [-26, 6.8, -22]], r: 0.4 });
        m.prop('smoke', { x: -24, y: 10.4, z: 4 }); m.prop('smoke', { x: -45, y: 8.6, z: 27, s: 0.6 });
        m.prop('lamp', { x: -22, y: 5.2, z: -17.95, yaw: 0, color: 0xffa54d });
        m.prop('lamp', { x: -13, y: 3.3, z: 21.8, yaw: Math.PI, color: 0xffa54d, hang: true });
        m.prop('chain', { x: -16, y: 9, z: 12, len: 6 }); m.prop('chain', { x: -8, y: 9, z: -9, len: 5 });
        m.prop('barrel', { x: -26, z: -9 }); m.prop('barrel', { x: -26.8, z: -9.6 }); m.prop('barrel', { x: -14, z: 21 }); m.prop('barrel', { x: -36, z: -12 });
        m.prop('hazard', { x: -40.5, z: 0, w: 1.5, d: 6 });
        m.light(-18, 1.2, 0, 0xff6a1a, 2.4, 10); m.light(-22, 6.5, -17.6, 0xffa54d, 1.6, 14);
      });
      m_kilnCentre(M);
    },
  },

  // ---------------------------------------------------------------- Verdance: a jungle temple taken back by the forest
  verdance: {
    key: 'verdance', name: 'Verdance', sub: 'Overgrown temple · morning', bounds: { x0: -50, x1: 50, z0: -26, z1: 26 },
    theme: { sky: 'day', fog: [0x9ab8b0, 0.0055], sun: [0xfff0d0, 3.6], sunDir: [0.45, 0.62, 0.38], hemi: [0xa8d4ff, 0x3a4a22, 0.5], exposure: 0.8, amb: 'wind', floor: 'flagstone' },
    build(M) {
      M.box(0, 27, 104, 2, 8, { mat: 'ruin', shadow: false }); M.box(0, -27, 104, 2, 8, { mat: 'ruin', shadow: false });
      M.box(-51, 0, 2, 56, 8, { mat: 'ruin', shadow: false }); M.box(51, 0, 2, 56, 8, { mat: 'ruin', shadow: false });
      // the shrine in the plaza
      M.box(0, 0, 9, 9, 0.45, { mat: 'flag2' }); M.box(0, 0, 6, 6, 0.45, { y: 0.45, mat: 'flag2', trim: 0x8affc8 });
      M.zone(0, 0, 0.9, 4.4);
      M.prop('idol', { x: 0, y: 0.9, z: 0 });
      M.both(m => {
        // the base: a stepped temple platform
        m.box(-45, 0, 10, 24, 2.4, { mat: 'temple', trim: m.flip ? 0xff9a4a : 0x4ae0ff });
        m.box(-49, 0, 2, 24, 6, { y: 2.4, mat: 'temple' });
        m.box(-47.5, 11.5, 5, 1, 3, { y: 2.4, mat: 'temple' }); m.box(-47.5, -11.5, 5, 1, 3, { y: 2.4, mat: 'temple' });
        m.box(-45, 0, 10, 24, 0.6, { y: 6.6, mat: 'roofstone' });
        m.ramp(-37.5, 0, 5, 8, 0, 2.4, 'x-', { mat: 'stepstone' });
        m.ramp(-42.5, 14.5, 4, 5, 0, 2.4, 'z-', { mat: 'stepstone' }); m.ramp(-42.5, -14.5, 4, 5, 0, 2.4, 'z+', { mat: 'stepstone' });
        for (const z of [-7, -3.5, 0, 3.5, 7]) m.spawn(0, -46, z, 2.4);
        for (const z of [-5, 0, 5]) m.spawn(0, -43, z, 2.4);
        m.light(-45, 5.6, -5, 0xffd6a0, 1.8, 12); m.light(-45, 5.6, 5, 0xffd6a0, 1.8, 12);
        // the north terrace along the wall, with stairs at both ends and down into the plaza
        m.box(-10, 21.5, 40, 9, 3, { mat: 'temple' });
        m.box(-10, 25.6, 40, 0.8, 1.1, { y: 3, mat: 'ruin' });
        m.box(-16, 17.4, 6, 0.7, 1.0, { y: 3, mat: 'ruin' }); m.box(2, 17.4, 4, 0.7, 1.0, { y: 3, mat: 'ruin' });
        m.ramp(-33, 21.5, 6, 4, 0, 3, 'x+', { mat: 'stepstone' });
        m.ramp(13, 21.5, 6, 4, 0, 3, 'x-', { mat: 'stepstone' });
        m.ramp(-6, 14, 4, 6, 0, 3, 'z+', { mat: 'stepstone' });
        m.pad(-21, 14, 0, -21, 20, 3.1, 2.4);
        // colonnade around the plaza and the great pillars
        m.box(-6.5, 6.5, 1.5, 1.5, 8, { mat: 'pillar' }); m.box(-6.5, -6.5, 1.5, 1.5, 8, { mat: 'pillar' });
        m.box(-14, 9.5, 1.2, 1.2, 4.2, { mat: 'pillar' }); m.box(-14, -9.5, 1.2, 1.2, 4.2, { mat: 'pillar' });
        m.box(-12, 3, 3.6, 1.2, 1.2, { mat: 'ruin' });      // fallen column
        // the west gate: two walls with an arch
        m.box(-28, 8, 2, 7, 5, { mat: 'ruin' }); m.box(-28, -8.5, 2, 6, 5, { mat: 'ruin' });
        m.box(-28, 0, 2, 10, 1.4, { y: 5, mat: 'ruin', col: true });
        m.box(-22, 0, 2.4, 2.4, 1.6, { mat: 'temple' }); m.prop('statue', { x: -22, y: 1.6, z: 0, yaw: -Math.PI / 2 });
        // the sunken garden (team 0 south): pool, hedges, a broken hut
        m.box(-24, -18.5, 6, 5, 3.2, { mat: 'ruin' });
        m.box(-33, -10.5, 1.2, 5, 1.4, { mat: 'hedge' }); m.box(-15, -16, 4, 1.2, 1.4, { mat: 'hedge' }); m.box(-27, -23, 3.5, 1.2, 1.4, { mat: 'hedge' });
        m.box(-17, -5, 1.6, 1.6, 1.2, { mat: 'ruin' });
        m.box(-35, 13, 2, 2, 1.6, { mat: 'ruin' });
        m.prop('pool', { x: -34, z: -23, w: 6, d: 5 });
        m.prop('waterfall', { x: -34, z: -25.9, w: 4, h: 7.5 });
        m.pack(-31, 1); m.pack(-14, -12);
        for (const p of [[-36, -4], [-24, 22, 3], [-18, -23], [-18, 8]]) m.spawn('ffa', p[0], p[1], p[2] || 0);
        // greenery
        for (const t of [[-38, 22], [-41, -22], [-20, -10.5], [-35, 9], [-3, 22.5, 3], [-26, 24, 3], [-9, -12.5]]) m.prop('tree', { x: t[0], z: t[1], y: t[2] || 0, s: rand(0.85, 1.25) });
        for (const t of [[-12, 7], [-30, -4], [-24, 12], [-20, -13], [-38, -14], [-18, 24, 3]]) m.prop('bush', { x: t[0], z: t[1], y: t[2] || 0 });
        m.prop('vines', { x: -28, y: 6.4, z: 0, w: 9 }); m.prop('vines', { x: -10, y: 3, z: 16.95, w: 30 }); m.prop('vines', { x: -45, y: 7.2, z: 0, w: 22, yaw: Math.PI / 2 });
        m.prop('brazier', { x: -40.4, y: 2.4, z: -3.6 }); m.prop('brazier', { x: -40.4, y: 2.4, z: 3.6 });
        m.prop('brazier', { x: -8, y: 3, z: 17.8 });
        m.light(-40.4, 3.4, -3.6, 0xff9a40, 1.5, 9); m.light(-40.4, 3.4, 3.6, 0xff9a40, 1.5, 9);
      });
    },
  },

  // ---------------------------------------------------------------- Neon Quay: a container port in the rain
  quay: {
    key: 'quay', name: 'Neon Quay', sub: 'Container port · rain at night', bounds: { x0: -48, x1: 48, z0: -30, z1: 30 },
    theme: { sky: 'night', fog: [0x0c1424, 0.011], sun: [0x8fb4ff, 0.9], sunDir: [0.3, 0.8, -0.4], hemi: [0x3a4c8a, 0x0a0c14, 0.4], exposure: 1.1, amb: 'rain', rain: true, floor: 'asphalt' },
    build(M) {
      // the quay edges (water beyond) and the sheds at either end
      M.box(0, 31, 100, 1, 10, { mat: 'none', vis: false }); M.box(0, -31, 100, 1, 10, { mat: 'none', vis: false });
      M.box(-49, 0, 2, 64, 10, { mat: 'shed' }); M.box(49, 0, 2, 64, 10, { mat: 'shed' });
      M.prop('water', {}); M.prop('rain', {});
      // the central warehouse
      M.box(0, 0, 20, 18, 0.5, { y: 7, mat: 'roof' });
      M.zone(0, 0, 0, 4.4);
      M.both(m => {
        m.box(-6.5, 8.7, 7, 0.6, 7, { mat: 'shedwall' }); m.box(6.5, 8.7, 7, 0.6, 7, { mat: 'shedwall' });
        m.box(0, 8.7, 6, 0.6, 3, { y: 4, mat: 'shedwall' });
        m.box(-9.7, 6, 0.6, 6, 7, { mat: 'shedwall' }); m.box(-9.7, -6, 0.6, 6, 7, { mat: 'shedwall' }); m.box(-9.7, 0, 0.6, 6, 3, { y: 4, mat: 'shedwall' });
        // mezzanine and its stair
        m.box(3.7, 6.5, 11.4, 4, 0.4, { y: 3.2, mat: 'grate', trim: 0xff3ad6 });
        m.prop('railing', { x: -2, z: 4.62, x2: 9.4, z2: 4.62, y: 3.6 });
        m.ramp(-5.7, 6.5, 7.4, 3.6, 0, 3.6, 'x+', { mat: 'grate' });
        m.box(-3.6, 1.6, 1.6, 1.6, 1.5, { mat: 'crate' });
        m.box(5, -1.6, 2.6, 1.3, 1.1, { mat: 'crate' });
        m.light(-4, 6.2, 0, 0xff4ad6, 2.0, 12); m.light(4, 6.2, 3, 0x4adfff, 1.6, 12);
        m.prop('sign', { x: 0, y: 5.6, z: 9.05, yaw: 0, w: 5.2, h: 1.0, text: m.flip ? 'BERTH 9' : 'PIER 34', color: m.flip ? 0xff3a8a : 0x3affea });
        m.prop('stringLights', { x: -9.4, y: 6.5, z: -8.4, x2: 9.4, z2: 8.4 });
        // base shed with three roll-up doors
        m.box(-38, -14, 1, 4, 6, { mat: 'shedwall' }); m.box(-38, -5, 1, 4, 6, { mat: 'shedwall' });
        m.box(-38, 5, 1, 4, 6, { mat: 'shedwall' }); m.box(-38, 14, 1, 4, 6, { mat: 'shedwall' });
        m.box(-38, 0, 1, 32, 1.6, { y: 4.4, mat: 'shedwall' });
        m.box(-43, 16.5, 10, 1, 6, { mat: 'shedwall' }); m.box(-43, -16.5, 10, 1, 6, { mat: 'shedwall' });
        m.box(-43, 0, 11, 34, 0.5, { y: 6, mat: 'roof' });
        for (const z of [-9, -4.5, 0, 4.5, 9]) m.spawn(0, -45, z);
        for (const z of [-6, 0, 6]) m.spawn(0, -41.5, z);
        m.light(-43, 5.2, -6, 0x9ad0ff, 1.8, 13); m.light(-43, 5.2, 6, 0x9ad0ff, 1.8, 13);
        m.prop('sign', { x: -37.45, y: 5.2, z: 9.5, yaw: -Math.PI / 2, w: 4.2, h: 0.8, text: m.flip ? 'EAST DOCK' : 'WEST DOCK', color: m.flip ? 0xff7a2e : 0x2ee6ff });
        // the container stacks
        m.box(-22, 21, 18, 2.5, 2.6, { mat: 'container' });
        m.box(-22, 21, 6, 2.5, 2.6, { y: 2.6, mat: 'container2' });
        m.ramp(-34.5, 21, 7, 2.5, 0, 2.6, 'x+', { mat: 'grate' });
        m.pad(-22, 17.4, 0, -22, 21, 5.25, 2.2);
        m.box(-30, 8, 2.5, 6, 2.6, { mat: 'container2' });
        m.box(-18, 4, 6, 2.5, 2.6, { mat: 'container3' });
        m.box(-26, -6, 6, 2.5, 2.6, { mat: 'container' });
        m.box(-16, -14, 2.5, 6, 2.6, { mat: 'container3' });
        m.box(-30, -19, 6, 2.5, 5.2, { mat: 'container2' });
        m.box(-12.5, 13, 1.4, 1.4, 1.4, { mat: 'crate' }); m.box(-34, 0, 1.4, 2.8, 1.2, { mat: 'crate' });
        m.box(-22, -24.5, 2.4, 1.2, 1.2, { mat: 'barrier' }); m.box(-12, -6, 1.2, 2.6, 1.2, { mat: 'barrier' });
        // crane legs (the gantry above is dressing)
        m.box(-24, 13.5, 0.8, 0.8, 14, { mat: 'crane' }); m.box(-24, -13.5, 0.8, 0.8, 14, { mat: 'crane' });
        m.prop('crane', { x: -24, z: 0 });
        m.pack(-30, 0.5); m.pack(-12, -22);
        for (const p of [[-34, -10], [-20, 0], [-26, 25], [-8, 15]]) m.spawn('ffa', p[0], p[1]);
        m.prop('bollards', { x: -47, x2: 47, z: 29.6 });
        m.prop('sign', { x: -30, y: 2.0, z: 6.68, yaw: Math.PI / 2, w: 3, h: 0.6, text: 'NO STACKING', color: 0xffd23a });
        m.prop('lamp', { x: -18, y: 5.6, z: 26.5, yaw: Math.PI, color: 0xffb46a, pole: true });
        m.prop('lamp', { x: -30, y: 5.6, z: -26.5, yaw: 0, color: 0x9ad8ff, pole: true });
        m.light(-18, 5.4, 25.5, 0xffb46a, 2.0, 14); m.light(-30, 5.4, -25.5, 0x9ad8ff, 1.6, 14);
        m.light(-22, 2.5, 17, 0xff3ad6, 1.4, 9);
        m.prop('puddle', { x: -26, z: 2, s: 3 }); m.prop('puddle', { x: -14, z: -20, s: 2.4 }); m.prop('puddle', { x: -6, z: 14, s: 2 });
      });
      M.prop('skyline', {});
    },
  },
};
// the crucible's set dressing sits on the centre line
function m_kilnCentre(M) {
  M.prop('cauldron', { x: 0, y: 2.4, z: 0 });
  M.prop('molten', { x: 0, z: 7.2, w: 10, d: 0.9 }); M.prop('molten', { x: 0, z: -7.2, w: 10, d: 0.9 });
  M.prop('skyline', {});
  M.light(0, 5.5, 0, 0xff7a20, 3.0, 16);
}
const MAP_KEYS = Object.keys(MAPS);
