'use strict';
// ============================================================================
// Set dressing from KayKit's CC0 packs (Medieval Hexagon, Halloween Bits, City Builder Bits, Prototype Bits):
// trees, rocks, clouds, hills, buildings and odds and ends, loaded once and cloned where the maps ask for them.
// ============================================================================
const Env = {
  ready: false, T: {}, mats: {},
  async load() {
    if (!THREE.GLTFLoader) return;
    const g = await new Promise((res, rej) => new THREE.GLTFLoader().load('assets/env.glb', res, undefined, rej));
    for (const n of g.scene.children) {
      n.updateMatrixWorld(true);
      n.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; const m = o.material; if (m && !this.mats[m.uuid]) { m.roughness = 0.7; m.metalness = 0; m.envMapIntensity = 0.4; this.mats[m.uuid] = m; } } });
      const box = new THREE.Box3().setFromObject(n); n.userData.box = box;
      this.T[n.name] = n;
    }
    this.ready = true;
  },
  has(name) { return this.ready && !!this.T[name]; },
  // a copy standing on its base at (x, y, z), scaled so its height is h (or by s)
  place(name, x, y, z, o = {}) {
    const T = this.T[name]; if (!T) return null;
    const m = T.clone(true), b = T.userData.box, H = b.max.y - b.min.y;
    const s = o.h ? o.h / Math.max(0.01, H) : o.s || 1;
    m.scale.setScalar(s); m.position.set(x, y - b.min.y * s, z); m.rotation.y = o.yaw != null ? o.yaw : 0;
    if (o.tint) m.traverse(k => { if (k.isMesh) { k.material = k.material.clone(); k.material.color.multiply(new THREE.Color(o.tint)); } });
    if (o.noShadow) m.traverse(k => { if (k.isMesh) k.castShadow = false; });
    return m;
  },
  // footprint of a model at a given height, for keeping things out of the way
  size(name, h) { const b = this.T[name] && this.T[name].userData.box; if (!b) return [1, 1]; const s = h / (b.max.y - b.min.y); return [(b.max.x - b.min.x) * s, (b.max.z - b.min.z) * s]; },
};
