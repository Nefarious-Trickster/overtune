'use strict';
// ============================================================================
// Boot
// ============================================================================
(async function boot() {
  const msg = t => { const m = $('#boot-msg'); if (m) m.textContent = t; };
  const bar = f => { const b = $('#boot .boot-bar i'); if (b) b.style.transform = `scaleX(${f})`; };
  const tick = () => new Promise(r => setTimeout(r, 16));
  try {
    if (!window.THREE) throw new Error('The 3D engine could not be loaded. Check your connection and reload.');
    bar(0.1); await tick();
    Inventory.starter();
    const cv = $('#cv');
    initGfx(cv); bar(0.55); msg('Laying out the arena…'); await tick();
    View.init(); HUD.init(); Input.init(cv); UI.init();
    Showcase.enter(); bar(0.9); msg('Tuning powers…'); await tick();
    UI.show('main');
    requestAnimationFrame(frame);
    bar(1);
    setTimeout(() => { $('#boot').classList.add('done'); setTimeout(() => $('#boot').remove(), 700); }, 150);
    document.addEventListener('pointerdown', () => Sfx.init(), { once: true });
    window.__overtune = { Game, World, G, Flow, Settings, HEROES, MAPS, Inventory };
  } catch (e) {
    console.error(e); msg(e.message || 'Something went wrong while starting.');
  }
})();
