'use strict';
// ============================================================================
// Heroes: stats, weapons, powers and every add-on. An add-on is a small change to its hero's power numbers
// (and sometimes a new rule the power code checks). Two add-ons can be slotted per hero, never the same one twice.
// ============================================================================
const RARITY = [
  { name: 'Common', css: '#8c6b4a', glow: '#b8916a' },
  { name: 'Uncommon', css: '#c9a12e', glow: '#ffd75a' },
  { name: 'Rare', css: '#3d9c55', glow: '#6ff08e' },
  { name: 'Very Rare', css: '#8a46d0', glow: '#c48aff' },
  { name: 'Iridescent', css: '#d8325a', glow: '#ff7aa0' },
];

const HEROES = {
  marrow: {
    key: 'marrow', name: 'Marrow', title: 'The Snarewright', role: 'Trapper', hp: 225, speed: 6.0,
    blurb: 'A bone-dry frontier hunter who wins fights before they start. Seeds the ground with snares that root, wound and reveal.',
    color: 0x9a6a3e, dark: 0x3a2a1e, cloth: 0x4a4f42, metal: 0x8a8f96, glow: 0xffb35c,
    weapon: { name: 'Longjaw', kind: 'hitscan', dmg: 57, head: 2.0, rof: 0.78, mag: 7, reload: 2.1, spread: 0.002, spreadMove: 0.012, range: 140, auto: true, recoil: 0.034, sound: 'rifle', tracer: 0xffd29a },
    power: { name: 'Snares', key: 'snare', desc: 'Set a snare at your feet. Enemies who step in are rooted, wounded and revealed to your team. Snares recharge over time.',
      carry: 3, recharge: 8, arm: 1.0, radius: 1.1, root: 1.4, dmg: 35, reveal: 4, visDist: 12, place: 0.55, throwDist: 0, bleed: 0, chain: false, bell: 0, explode: 0, explodeR: 0, noRoot: false },
    util: { name: 'Field Dressing', key: 'heal', cd: 13, desc: 'Patch yourself up: restore 80 health over 2.5 s.' },
    ult: { name: 'Killing Field', key: 'field', desc: 'Every enemy is revealed for 7 s, your snares refill, and every snare on the map grows its jaws.' },
    addons: [
      { id: 'hinges', name: 'Oiled Hinges', r: 0, icon: 'gear', d: ['+ Snares arm 0.5 s sooner'], m: P => { P.arm = Math.max(0.2, P.arm - 0.5); } },
      { id: 'spring', name: 'Coiled Spring', r: 0, icon: 'spring', d: ['+ Snare damage +12'], m: P => { P.dmg += 12; } },
      { id: 'burlap', name: 'Burlap Wrap', r: 0, icon: 'rag', d: ['+ Enemies only see snares within 7 m (was 12 m)'], m: P => { P.visDist = Math.min(P.visDist, 7); } },
      { id: 'sparejaw', name: 'Spare Jaw', r: 1, icon: 'jaw', d: ['+ Carry one more snare'], m: P => { P.carry += 1; } },
      { id: 'serrated', name: 'Serrated Teeth', r: 1, icon: 'blade', d: ['+ Snared enemies bleed for 24 damage over 4 s'], m: P => { P.bleed += 24; } },
      { id: 'tar', name: 'Tar-Black Jaws', r: 1, icon: 'drop', d: ['+ Snares are invisible to enemies beyond 3 m', '- Snares recharge 2 s slower'], m: P => { P.visDist = Math.min(P.visDist, 3); P.recharge += 2; } },
      { id: 'lobbing', name: 'Lobbing Arm', r: 2, icon: 'hook', d: ['+ Snares are thrown where you aim, up to 14 m', '+ Setting a snare is twice as fast'], m: P => { P.throwDist = 14; P.place *= 0.5; } },
      { id: 'tension', name: 'Tension Spring', r: 2, icon: 'coil', d: ['+ Root lasts 0.8 s longer'], m: P => { P.root += 0.8; } },
      { id: 'widejaw', name: 'Wide Jaw', r: 2, icon: 'ring', d: ['+ Snares trigger from 60% further away'], m: P => { P.radius *= 1.6; } },
      { id: 'tripwire', name: 'Tripwire Chain', r: 3, icon: 'chain', d: ['+ A sprung snare pulses every other snare within 12 m', '+ Each pulse slows nearby enemies by 50% for 2 s and deals 15 damage'], m: P => { P.chain = true; } },
      { id: 'bell', name: 'Bloodhound Bell', r: 3, icon: 'bell', d: ['+ Reveal lasts 4 s longer', '+ Springing a snare also reveals every enemy within 15 m of it'], m: P => { P.reveal += 4; P.bell = 15; } },
      { id: 'iriMaw', name: 'Iridescent Maw', r: 4, icon: 'skull', d: ['+ Snares explode for 85 damage in a 4.2 m blast', '- Snares no longer root', '- Carry one fewer snare'], m: P => { P.explode = 85; P.explodeR = 4.2; P.noRoot = true; P.carry = Math.max(1, P.carry - 1); } },
    ],
  },
  lark: {
    key: 'lark', name: 'Lark', title: 'The Rift Runner', role: 'Flanker', hp: 215, speed: 6.5,
    blurb: 'A courier who learned to fold space between steps. Charges blinks that tear her through the map — then pays for it in fatigue.',
    color: 0xd9dde6, dark: 0x2a2f3c, cloth: 0x8a3fd8, metal: 0x5a606c, glow: 0xb48aff,
    weapon: { name: 'Twin Wasps', kind: 'hitscan', dmg: 12, head: 1.5, rof: 0.055, mag: 50, reload: 1.5, spread: 0.024, spreadMove: 0.01, range: 60, falloff: [16, 30, 0.55], auto: true, recoil: 0.006, sound: 'smg', tracer: 0xd0b0ff, twin: true },
    power: { name: 'Rift Step', key: 'blink', desc: 'Hold to charge, release to blink along your aim. Chain blinks together, but every chain ends in fatigue. Your first shot after a blink hits harder.',
      charges: 2, recharge: 4.5, chargeTime: 1.0, minDist: 4, maxDist: 19, fatiguePer: 0.6, window: 1.7, strike: 0.25, strikeWin: 1.6, decoy: false, arriveDmg: 0, arriveR: 0, noFatigue: false, heal: 0, lineDmg: 0 },
    util: { name: 'Slipstream', key: 'dash', cd: 5, desc: 'Dash 9 m in the direction you are moving.' },
    ult: { name: 'Unbound', key: 'unbound', desc: 'For 7 s, blinks are free, there is no fatigue, and every shot carries Rift Strike.' },
    addons: [
      { id: 'frayed', name: 'Frayed Tether', r: 0, icon: 'thread', d: ['+ Blink distance +15%'], m: P => { P.maxDist *= 1.15; } },
      { id: 'calm', name: 'Calm Pulse', r: 0, icon: 'wave', d: ['+ Fatigue is 20% shorter'], m: P => { P.fatiguePer *= 0.8; } },
      { id: 'static', name: 'Static Thread', r: 0, icon: 'bolt', d: ['+ Blinks charge 15% faster'], m: P => { P.chargeTime *= 0.85; } },
      { id: 'coil', name: 'Spare Coil', r: 1, icon: 'coil', d: ['+ One more blink per chain', '- Fatigue is 25% longer'], m: P => { P.charges += 1; P.fatiguePer *= 1.25; } },
      { id: 'echo', name: 'Echo Shard', r: 1, icon: 'shard', d: ['+ Leave a decoy of yourself behind for 3 s when you blink'], m: P => { P.decoy = true; } },
      { id: 'quickwire', name: 'Quickwire', r: 1, icon: 'clock', d: ['+ Blinks recharge 20% faster'], m: P => { P.recharge *= 0.8; } },
      { id: 'seam', name: 'Ripped Seam', r: 2, icon: 'star', d: ['+ Arriving from a blink blasts enemies within 2.8 m for 40 damage'], m: P => { P.arriveDmg += 40; P.arriveR = 2.8; } },
      { id: 'drift', name: 'Long Drift', r: 2, icon: 'feather', d: ['+ Blink distance +35%', '- Blinks take 20% longer to charge'], m: P => { P.maxDist *= 1.35; P.chargeTime *= 1.2; } },
      { id: 'afterburn', name: 'Afterburn', r: 2, icon: 'flame', d: ['+ Rift Strike bonus raised from 25% to 50%'], m: P => { P.strike += 0.25; } },
      { id: 'torn', name: 'Torn Lining', r: 3, icon: 'moon', d: ['+ No fatigue after a chain', '- Blinks recharge 50% slower'], m: P => { P.noFatigue = true; P.recharge *= 1.5; } },
      { id: 'lung', name: 'Glass Lung', r: 3, icon: 'lung', d: ['+ Restore 22 health every time you blink'], m: P => { P.heal += 22; } },
      { id: 'iriThread', name: 'Iridescent Thread', r: 4, icon: 'gem', d: ['+ Blink distance doubled', '+ Blinking through an enemy deals 55 damage to them', '- Fatigue doubled'], m: P => { P.maxDist *= 2; P.lineDmg = 55; P.fatiguePer *= 2; } },
    ],
  },
  gauge: {
    key: 'gauge', name: 'Gauge', title: 'The Ramjet', role: 'Bruiser', hp: 325, speed: 5.6,
    blurb: 'A demolition foreman in a walking boiler. Revs up, then charges in a straight line that flattens whatever it meets — walls included.',
    color: 0xd29a22, dark: 0x2c2a28, cloth: 0x5a4a3a, metal: 0x6a6e74, glow: 0xff7a2e,
    weapon: { name: 'Pacifier', kind: 'pellets', dmg: 9, pellets: 11, head: 1.5, rof: 0.82, mag: 6, reload: 2.2, spread: 0.075, spreadMove: 0.01, range: 40, falloff: [7, 16, 0.35], auto: true, recoil: 0.06, sound: 'shotgun', tracer: 0xffc070 },
    power: { name: 'Ramjet', key: 'ram', desc: 'Hold to rev, then charge forward. Ram an enemy for heavy damage and knockback. Hit a wall and you crash.',
      rev: 0.5, speed: 16, dur: 2.2, turn: 1.6, dmg: 95, knock: 9, cd: 7, crashStun: 1.0, trail: 0, multi: false, shock: 0, shockR: 0, execute: 0 },
    util: { name: 'Bulwark', key: 'wall', cd: 14, desc: 'Drop a 5 m barrier that blocks enemy fire for 6 s (450 health).' },
    ult: { name: 'Earthshaker', key: 'slam', desc: 'Slam the ground: 130 damage to every enemy within 8 m in sight, who are thrown and stunned for 1.2 s.' },
    addons: [
      { id: 'plug', name: 'Spark Plug', r: 0, icon: 'plug', d: ['+ Revs 0.15 s faster'], m: P => { P.rev = Math.max(0.15, P.rev - 0.15); } },
      { id: 'tine', name: 'Bent Tine', r: 0, icon: 'hook', d: ['+ Turn 30% sharper while charging'], m: P => { P.turn *= 1.3; } },
      { id: 'rag', name: 'Grease Rag', r: 0, icon: 'rag', d: ['+ Cooldown 1 s shorter'], m: P => { P.cd -= 1; } },
      { id: 'bumper', name: 'Thick Bumper', r: 1, icon: 'plate', d: ['+ Crashing stuns you for half as long'], m: P => { P.crashStun *= 0.5; } },
      { id: 'pistons', name: 'Bigger Pistons', r: 1, icon: 'piston', d: ['+ Charge speed +12%'], m: P => { P.speed *= 1.12; } },
      { id: 'ember', name: 'Ember Coil', r: 1, icon: 'flame', d: ['+ Leave a burning trail (14 damage per second, 3 s)'], m: P => { P.trail = 14; } },
      { id: 'pile', name: 'Pile Driver', r: 2, icon: 'bolt', d: ['+ Ram damage +30', '+ Knockback doubled'], m: P => { P.dmg += 30; P.knock *= 2; } },
      { id: 'fuse', name: 'Long Fuse', r: 2, icon: 'fuse', d: ['+ Charge lasts 1 s longer'], m: P => { P.dur += 1; } },
      { id: 'drift', name: 'Drift Kit', r: 2, icon: 'wing', d: ['+ Turn 80% sharper while charging', '- Charge speed -8%'], m: P => { P.turn *= 1.8; P.speed *= 0.92; } },
      { id: 'freight', name: 'Freight Chain', r: 3, icon: 'chain', d: ['+ Ramming no longer stops the charge: plough through several enemies', '- Ram damage -20'], m: P => { P.multi = true; P.dmg -= 20; } },
      { id: 'shock', name: 'Shockplate', r: 3, icon: 'wave', d: ['+ Crashing into a wall releases a 5 m shockwave for 55 damage', '+ No crash stun'], m: P => { P.shock = 55; P.shockR = 5; P.crashStun = 0; } },
      { id: 'iriPiston', name: 'Iridescent Piston', r: 4, icon: 'skull', d: ['+ Ramming an enemy below 45% health kills them outright', '- Cooldown 4 s longer'], m: P => { P.execute = 0.45; P.cd += 4; } },
    ],
  },
  veil: {
    key: 'veil', name: 'Veil', title: 'The Phantom', role: 'Assassin', hp: 200, speed: 6.2,
    blurb: 'Nobody has seen her face, or much of the rest of her. Fades out of sight, closes in, and opens the fight with an ambush shot.',
    color: 0x2b2733, dark: 0x141218, cloth: 0x3a2f4a, metal: 0x4a4656, glow: 0xc06aff,
    weapon: { name: 'Whisper', kind: 'burst', dmg: 22, head: 2.0, burst: 3, burstGap: 0.065, rof: 0.45, mag: 24, reload: 1.8, spread: 0.005, spreadMove: 0.01, range: 100, auto: true, recoil: 0.014, sound: 'burst', tracer: 0xd89aff },
    power: { name: 'Fade', key: 'fade', desc: 'Fade out of sight and move faster. Enemies only see a shimmer up close. Unveil to make your next shot an Ambush.',
      fadeIn: 0.6, fadeOut: 0.9, speed: 1.3, maxTime: 12, ambush: 40, ambushWin: 2.2, cd: 4, shimmer: 8, regen: 0, pierce: false, blind: 0, sense: 0, shootCloaked: false, silent: false },
    util: { name: 'Scry', key: 'scry', cd: 11, desc: 'Reveal every enemy in a 45° cone up to 35 m for 3.5 s.' },
    ult: { name: 'Nightfall', key: 'night', desc: 'For 8 s you are truly invisible — no shimmer — and can fire, with 25% more damage.' },
    addons: [
      { id: 'soot', name: 'Soot Mask', r: 0, icon: 'mask', d: ['+ Fade out 0.25 s faster'], m: P => { P.fadeIn = Math.max(0.15, P.fadeIn - 0.25); } },
      { id: 'step', name: 'Light Step', r: 0, icon: 'feather', d: ['+ Faded speed +8%'], m: P => { P.speed += 0.08; } },
      { id: 'ash', name: 'Ash Thread', r: 0, icon: 'thread', d: ['+ Stay faded 5 s longer'], m: P => { P.maxTime += 5; } },
      { id: 'hush', name: 'Hush Charm', r: 1, icon: 'moon', d: ['+ Your shimmer shows only within 4.5 m (was 8 m)', '+ Silent footsteps while faded'], m: P => { P.shimmer = Math.min(P.shimmer, 4.5); P.silent = true; } },
      { id: 'quick', name: 'Quick Unveil', r: 1, icon: 'clock', d: ['+ Unveil 0.4 s faster'], m: P => { P.fadeOut = Math.max(0.2, P.fadeOut - 0.4); } },
      { id: 'wind', name: 'Second Wind', r: 1, icon: 'lung', d: ['+ Regenerate 10 health per second while faded'], m: P => { P.regen += 10; } },
      { id: 'pierce', name: 'Piercing Veil', r: 2, icon: 'blade', d: ['+ Ambush shots pass through enemies'], m: P => { P.pierce = true; } },
      { id: 'pact', name: "Hunter's Pact", r: 2, icon: 'eye', d: ['+ Ambush bonus damage +30'], m: P => { P.ambush += 30; } },
      { id: 'bloom', name: 'Dark Bloom', r: 2, icon: 'star', d: ['+ Unveiling blinds enemies within 7 m for 1.6 s'], m: P => { P.blind = 1.6; } },
      { id: 'storm', name: 'Windstorm', r: 3, icon: 'wing', d: ['+ Faded speed +25%', '- Your shimmer shows 4 m further away'], m: P => { P.speed += 0.25; P.shimmer += 4; } },
      { id: 'lantern', name: 'Ghost Lantern', r: 3, icon: 'lantern', d: ['+ While faded, you see every enemy within 18 m through walls'], m: P => { P.sense = 18; } },
      { id: 'iriShroud', name: 'Iridescent Shroud', r: 4, icon: 'gem', d: ['+ Fire while faded: the shot unveils you instantly as an Ambush', '- Cooldown 4 s longer'], m: P => { P.shootCloaked = true; P.cd += 4; } },
    ],
  },
  ivra: {
    key: 'ivra', name: 'Ivra', title: 'The Glaivewright', role: 'Skirmisher', hp: 230, speed: 6.0,
    blurb: 'A temple warden who hunts with thrown glaives. Wind up a throw for range and power; land it and nothing walks away clean.',
    color: 0x2f6a66, dark: 0x1a2a2a, cloth: 0x8a2a2a, metal: 0xb8873a, glow: 0x5affd2,
    weapon: { name: 'Tidecaller', kind: 'proj', dmg: 56, head: 1.0, splash: 40, splashR: 2.8, projSpeed: 46, projGrav: 5, rof: 0.75, mag: 5, reload: 2.0, spread: 0.0, spreadMove: 0, range: 120, auto: true, recoil: 0.05, sound: 'launcher', tracer: 0x5affd2 },
    power: { name: 'Glaives', key: 'glaive', desc: 'Hold to wind up, release to throw a glaive in an arc. A longer wind-up throws further and hits harder. Glaives come back to you over time.',
      cap: 4, regen: 5, windMin: 0.2, windMax: 1.0, spdMin: 24, spdMax: 46, dmgMin: 50, dmgMax: 105, grav: 9, slow: 0.7, venom: 0, ricochet: 0, blast: 0, blastR: 0, twin: false, mark: 0, oneshot: false },
    util: { name: 'Updraft', key: 'leap', cd: 8, desc: 'Leap high into the air and forward.' },
    ult: { name: 'Glaive Storm', key: 'storm', desc: 'Throw seven fully wound glaives in a wide fan.' },
    addons: [
      { id: 'grip', name: 'Leather Grip', r: 0, icon: 'rag', d: ['+ Wind up 15% faster'], m: P => { P.windMax *= 0.85; } },
      { id: 'fletch', name: 'Fletched Edge', r: 0, icon: 'feather', d: ['+ Glaives fly 15% faster'], m: P => { P.spdMin *= 1.15; P.spdMax *= 1.15; } },
      { id: 'whet', name: 'Whetstone', r: 0, icon: 'stone', d: ['+ Glaive damage +10'], m: P => { P.dmgMin += 10; P.dmgMax += 10; } },
      { id: 'quiver', name: 'Extra Quiver', r: 1, icon: 'quiver', d: ['+ Carry one more glaive'], m: P => { P.cap += 1; } },
      { id: 'venom', name: 'Venom Tip', r: 1, icon: 'vial', d: ['+ Hits poison for 32 damage over 5 s'], m: P => { P.venom += 32; } },
      { id: 'haft', name: 'Light Haft', r: 1, icon: 'wing', d: ['+ Move at full speed while winding up'], m: P => { P.slow = 1; } },
      { id: 'bevel', name: 'Ricochet Bevel', r: 2, icon: 'ring', d: ['+ Glaives bounce off one wall'], m: P => { P.ricochet = 1; } },
      { id: 'flint', name: 'Flintstrike', r: 2, icon: 'flame', d: ['+ Glaives burst on impact for 30 damage within 2.6 m'], m: P => { P.blast = 30; P.blastR = 2.6; } },
      { id: 'rest', name: "Hunter's Rest", r: 2, icon: 'clock', d: ['+ Glaives come back 40% faster'], m: P => { P.regen *= 0.6; } },
      { id: 'twin', name: 'Twin Throw', r: 3, icon: 'twin', d: ['+ Throw two glaives at once in a narrow V', '- Uses two glaives'], m: P => { P.twin = true; } },
      { id: 'blood', name: 'Bloodtrail', r: 3, icon: 'drop', d: ['+ Glaive hits reveal the target for 6 s', '+ and slow them by 25% for 2 s'], m: P => { P.mark = 6; } },
      { id: 'iriGlaive', name: 'Iridescent Glaive', r: 4, icon: 'gem', d: ['+ A fully wound glaive kills outright', '- Carry only one glaive', '- Glaives take 14 s to come back'], m: P => { P.oneshot = true; P.cap = 1; P.regen = 14; } },
    ],
  },
};
const HERO_KEYS = Object.keys(HEROES);
for (const k of HERO_KEYS) HEROES[k].addons.forEach((a, i) => { a.idx = i; a.hero = k; });

// the power's numbers for a hero with these add-ons slotted
function powerFor(heroKey, addons) {
  const H = HEROES[heroKey], P = Object.assign({}, H.power);
  for (const i of addons || []) { const a = H.addons[i]; if (a) a.m(P); }
  return P;
}
function loadoutFor(heroKey) {
  const l = Settings.loadouts[heroKey];
  if (Array.isArray(l)) return l.filter(i => Number.isInteger(i) && i >= 0 && i < 12).slice(0, 2);
  return [];
}
function randomLoadout(heroKey, rng = Math.random) {
  // bots take a sensible pair: mostly lower rarities, sometimes something rare
  const A = HEROES[heroKey].addons, out = [];
  while (out.length < 2) {
    const roll = rng(), r = roll < 0.35 ? 0 : roll < 0.65 ? 1 : roll < 0.85 ? 2 : roll < 0.96 ? 3 : 4;
    const pool = A.filter(a => a.r === r && !out.includes(a.idx)); if (pool.length) out.push(pool[Math.floor(rng() * pool.length)].idx);
  }
  return out;
}

// ---------------------------------------------------------------- add-on icons (inline SVG)
const ICONS = {
  gear: '<circle cx="32" cy="32" r="9" fill="none" stroke-width="5"/><path d="M32 10v8M32 46v8M10 32h8M46 32h8M16 16l6 6M42 42l6 6M48 16l-6 6M22 42l-6 6" stroke-width="6"/>',
  spring: '<path d="M18 14h28M18 50h28M20 14l24 7-24 7 24 7-24 7 24 8" fill="none" stroke-width="4"/>',
  rag: '<path d="M14 18c8-6 14 6 22 0s12 4 14 2v24c-4 4-8-4-16 2s-14-4-20 2z" fill="currentColor" opacity=".85"/><path d="M22 28h18M22 36h14" stroke-width="3" opacity=".5"/>',
  jaw: '<path d="M10 34c0-14 44-14 44 0M10 34c0 12 44 12 44 0" fill="none" stroke-width="5"/><path d="M16 28l4 8 4-8 4 8 4-8 4 8 4-8 4 8 4-8M16 40l4-6 4 6 4-6 4 6 4-6 4 6 4-6 4 6" fill="none" stroke-width="2.5"/>',
  blade: '<path d="M12 52L46 12l6 6-34 40z" fill="currentColor"/><path d="M12 52l-2 4 8-2" stroke-width="3"/>',
  drop: '<path d="M32 8C24 24 16 32 16 40a16 16 0 0032 0c0-8-8-16-16-32z" fill="currentColor"/>',
  hook: '<path d="M38 8v28a10 10 0 11-20 0v-6" fill="none" stroke-width="6"/><path d="M14 30l4-8 4 8" fill="currentColor"/>',
  coil: '<path d="M14 32c0-10 10-10 10 0s10 10 10 0 10-10 10 0 6 8 8 0" fill="none" stroke-width="5"/><circle cx="12" cy="32" r="4" fill="currentColor"/>',
  ring: '<circle cx="32" cy="32" r="18" fill="none" stroke-width="6"/><circle cx="32" cy="32" r="6" fill="currentColor"/>',
  chain: '<rect x="8" y="24" width="22" height="14" rx="7" fill="none" stroke-width="5"/><rect x="34" y="24" width="22" height="14" rx="7" fill="none" stroke-width="5"/><path d="M24 31h16" stroke-width="5"/>',
  bell: '<path d="M18 44V30a14 14 0 0128 0v14l4 4H14z" fill="currentColor"/><circle cx="32" cy="52" r="4" fill="currentColor"/><path d="M32 10v6" stroke-width="4"/>',
  skull: '<path d="M14 30a18 18 0 0136 0v8l-6 4v8H20v-8l-6-4z" fill="currentColor"/><circle cx="25" cy="32" r="5" fill="#000"/><circle cx="39" cy="32" r="5" fill="#000"/><path d="M28 50v-6M36 50v-6" stroke="#000" stroke-width="3"/>',
  thread: '<path d="M10 50C20 10 44 54 54 14" fill="none" stroke-width="4"/><circle cx="54" cy="14" r="5" fill="currentColor"/>',
  wave: '<path d="M6 32c6-12 10-12 14 0s8 12 12 0 8-12 12 0 8 12 14 0" fill="none" stroke-width="5"/><path d="M6 44c6-8 10-8 14 0s8 8 12 0 8-8 12 0 8 8 14 0" fill="none" stroke-width="3" opacity=".6"/>',
  bolt: '<path d="M36 6L14 36h14l-4 22 24-32H34z" fill="currentColor"/>',
  shard: '<path d="M32 6l14 22-14 30-14-30z" fill="currentColor"/><path d="M32 6v52M18 28h28" stroke="#000" stroke-width="2" opacity=".4"/>',
  clock: '<circle cx="32" cy="32" r="20" fill="none" stroke-width="5"/><path d="M32 20v13l9 6" fill="none" stroke-width="5"/>',
  star: '<path d="M32 6l6 18 18 2-14 12 5 18-15-10-15 10 5-18L8 26l18-2z" fill="currentColor"/>',
  feather: '<path d="M50 10C26 14 14 32 14 52c8-4 14-8 18-14l-8 0 12-6-6-2 10-6c6-6 8-10 10-14z" fill="currentColor"/>',
  flame: '<path d="M32 6c4 12 16 18 16 32a16 16 0 01-32 0c0-8 4-12 8-16 0 6 2 10 6 10-2-10 2-18 2-26z" fill="currentColor"/>',
  moon: '<path d="M40 10a22 22 0 100 44 18 18 0 010-44z" fill="currentColor"/>',
  lung: '<path d="M30 12v18c-4 0-6-6-12-6-6 0-8 16-8 22s4 8 10 8 10-6 10-12zM34 12v18c4 0 6-6 12-6 6 0 8 16 8 22s-4 8-10 8-10-6-10-12z" fill="currentColor"/>',
  gem: '<path d="M20 12h24l12 14-24 28L8 26z" fill="currentColor"/><path d="M8 26h48M20 12l12 42 12-42" fill="none" stroke="#000" stroke-width="2" opacity=".45"/>',
  plug: '<rect x="20" y="24" width="24" height="26" rx="4" fill="currentColor"/><path d="M26 10v14M38 10v14M32 50v8" stroke-width="5"/>',
  plate: '<path d="M10 16h44v20c0 10-10 18-22 22C20 54 10 46 10 36z" fill="currentColor"/><path d="M20 26h24" stroke="#000" stroke-width="3" opacity=".4"/>',
  piston: '<rect x="22" y="8" width="20" height="26" rx="3" fill="currentColor"/><path d="M32 34v18M20 56h24" stroke-width="6"/>',
  fuse: '<rect x="10" y="30" width="26" height="22" rx="4" fill="currentColor"/><path d="M36 40c10 0 10-20 18-24" fill="none" stroke-width="3"/><circle cx="54" cy="14" r="4" fill="#ffd27a"/>',
  wing: '<path d="M8 40c10-24 32-30 50-30-6 6-10 10-16 12 6 0 10 0 14 2-6 4-12 6-18 6 4 2 8 4 10 6-12 4-26 6-40 4z" fill="currentColor"/>',
  mask: '<path d="M12 18c12-6 28-6 40 0 0 20-8 36-20 40C20 54 12 38 12 18z" fill="currentColor"/><path d="M20 30l8 2M44 30l-8 2" stroke="#000" stroke-width="4"/>',
  eye: '<path d="M6 32c14-18 38-18 52 0-14 18-38 18-52 0z" fill="none" stroke-width="5"/><circle cx="32" cy="32" r="8" fill="currentColor"/>',
  lantern: '<path d="M24 10h16M28 10v6M36 10v6" stroke-width="3"/><rect x="18" y="16" width="28" height="34" rx="6" fill="none" stroke-width="5"/><path d="M32 24c4 6 6 10 0 18-6-8-4-12 0-18z" fill="currentColor"/><path d="M22 54h20" stroke-width="5"/>',
  stone: '<path d="M10 40l10-20 24-6 12 14-6 18-28 4z" fill="currentColor"/><path d="M20 30l20 2" stroke="#000" stroke-width="2" opacity=".4"/>',
  quiver: '<path d="M22 18l10 40 10-40z" fill="currentColor"/><path d="M26 18l-6-12M32 18V4M38 18l6-12" stroke-width="4"/>',
  vial: '<path d="M26 8h12M28 8v14L16 48a6 6 0 006 8h20a6 6 0 006-8L36 22V8" fill="none" stroke-width="4"/><path d="M20 42h24l4 8H16z" fill="currentColor"/>',
  twin: '<path d="M10 54L30 10l4 4-18 40zM54 54L34 10l-4 4 18 40z" fill="currentColor"/>',
};
function iconSVG(name) { return `<svg viewBox="0 0 64 64" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" fill="none">${ICONS[name] || ICONS.gem}</svg>`; }
// the hero's power, drawn as an emblem
const POWER_ICON = { snare: 'jaw', blink: 'shard', ram: 'piston', fade: 'mask', glaive: 'twin' };
