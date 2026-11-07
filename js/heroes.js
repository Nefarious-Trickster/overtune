'use strict';
// ============================================================================
// Heroes: stats, signature weapons, powers and every add-on. An add-on bends its hero's power: commons nudge the
// numbers, rares add rules, Very Rares change how you play it, and Iridescents transform it outright.
// Add-ons are earned by playing (see Inventory) and a slotted one is used up when you deploy with it.
// ============================================================================
const RARITY = [
  { name: 'Common', css: '#8c6b4a', glow: '#b8916a', drop: 0.42 },
  { name: 'Uncommon', css: '#c9a12e', glow: '#ffd75a', drop: 0.28 },
  { name: 'Rare', css: '#3d9c55', glow: '#6ff08e', drop: 0.17 },
  { name: 'Very Rare', css: '#8a46d0', glow: '#c48aff', drop: 0.09 },
  { name: 'Iridescent', css: '#d8325a', glow: '#ff7aa0', drop: 0.04 },
];

const HEROES = {
  // ------------------------------------------------------------------------------------------------ MARROW
  marrow: {
    key: 'marrow', name: 'Marrow', title: 'The Snarewright', role: 'Trapper', hp: 320, speed: 5.1,
    blurb: 'A bone-dry frontier hunter in a long coat and wide hat. Fires barbed harpoons from a crank crossbow and seeds the ground with iron snares.',
    look: { skin: 0xb98a68, main: 0x6a4428, second: 0x3a2a1e, cloth: 0x4c5040, metal: 0x8a8f96, glow: 0xffb35c },
    weapon: { name: 'Rattlejaw', kind: 'proj', proj: 'bolt', desc: 'A crank crossbow. Heavy barbed bolts that drop over distance and slow whoever they hit.', dmg: 78, head: 1.6, speed: 72, grav: 5, rof: 1.05, mag: 4, reload: 2.6, spread: 0.002, spreadMove: 0.01, slow: [0.7, 1.2], recoil: 0.05, sound: 'crossbow' },
    power: { name: 'Snares', key: 'snare', desc: 'Set an iron snare at your feet. Enemies who step in are rooted, wounded and revealed to your team.',
      carry: 2, recharge: 14, arm: 1.2, radius: 1.1, root: 2.0, dmg: 40, reveal: 6, visDist: 10, place: 0.7, throwDist: 0, bleed: 0, chain: 0, bell: 0, explode: 0, explodeR: 0, noRoot: false, vuln: 0, auto: 0 },
    util: { name: 'Field Dressing', key: 'heal', cd: 18, desc: 'Stitch yourself up: restore 110 health over 3 s.' },
    ult: { name: 'Killing Field', key: 'field', desc: 'Every enemy is revealed for 8 s, your snares refill, and every snare on the map grows its jaws.' },
    addons: [
      { id: 'hinges', name: 'Oiled Hinges', r: 0, icon: 'gear', d: ['+ Snares arm 0.6 s sooner'], m: P => { P.arm = Math.max(0.2, P.arm - 0.6); } },
      { id: 'spring', name: 'Coiled Spring', r: 0, icon: 'spring', d: ['+ Snare damage +15'], m: P => { P.dmg += 15; } },
      { id: 'burlap', name: 'Burlap Wrap', r: 0, icon: 'rag', d: ['+ Enemies only see snares within 6 m (was 10 m)'], m: P => { P.visDist = Math.min(P.visDist, 6); } },
      { id: 'grease', name: 'Bone Grease', r: 0, icon: 'drop', d: ['+ Set snares 40% faster'], m: P => { P.place *= 0.6; } },
      { id: 'tools', name: 'Fastening Tools', r: 0, icon: 'hook', d: ['+ Snares recharge 25% faster'], m: P => { P.recharge *= 0.75; } },
      { id: 'sparejaw', name: 'Spare Jaw', r: 1, icon: 'jaw', d: ['+ Carry one more snare'], m: P => { P.carry += 1; } },
      { id: 'serrated', name: 'Serrated Teeth', r: 1, icon: 'blade', d: ['+ Snared enemies bleed for 40 damage over 5 s'], m: P => { P.bleed += 40; } },
      { id: 'tar', name: 'Tar-Black Jaws', r: 1, icon: 'moon', d: ['+ Snares are invisible to enemies beyond 2.5 m', '- Snares recharge 3 s slower'], m: P => { P.visDist = Math.min(P.visDist, 2.5); P.recharge += 3; } },
      { id: 'rust', name: 'Rusted Chain', r: 1, icon: 'chain', d: ['+ Root lasts 1 s longer'], m: P => { P.root += 1; } },
      { id: 'lobbing', name: 'Lobbing Arm', r: 2, icon: 'hook', d: ['+ Throw snares up to 18 m, wherever you aim', '+ Setting is twice as fast'], m: P => { P.throwDist = 18; P.place *= 0.5; } },
      { id: 'widejaw', name: 'Wide Jaw', r: 2, icon: 'ring', d: ['+ Snares trigger from 80% further away — a whole doorway'], m: P => { P.radius *= 1.8; } },
      { id: 'bell', name: 'Bloodhound Bell', r: 2, icon: 'bell', d: ['+ Springing a snare reveals every enemy within 20 m for 8 s'], m: P => { P.bell = 20; } },
      { id: 'tripwire', name: 'Tripwire Chain', r: 3, icon: 'chain', d: ['+ A sprung snare pulses every snare of yours within 15 m', '+ Each pulse roots enemies within 4 m for 1.2 s and deals 25'], m: P => { P.chain = 15; } },
      { id: 'honing', name: 'Honing Stone', r: 3, icon: 'stone', d: ['+ Snared enemies are Exposed for 6 s: they take 50% more damage from everything'], m: P => { P.vuln = 6; } },
      { id: 'iriMaw', name: 'Iridescent Maw', r: 4, icon: 'skull', d: ['+ Snares explode for 120 damage in a 5 m blast', '- Snares no longer root', '- Carry one fewer snare'], m: P => { P.explode = 120; P.explodeR = 5; P.noRoot = true; P.carry = Math.max(1, P.carry - 1); } },
      { id: 'iriStone', name: 'Iridescent Stone', r: 4, icon: 'gem', d: ['+ Every 8 s a snare springs up by itself in an enemy\'s path, anywhere on the map (up to 10 at once)', '- You can no longer set snares by hand'], m: P => { P.auto = 8; P.carry = 10; } },
    ],
  },
  // ------------------------------------------------------------------------------------------------ LARK
  lark: {
    key: 'lark', name: 'Lark', title: 'The Rift Runner', role: 'Flanker', hp: 280, speed: 5.6,
    blurb: 'A courier who learned to fold space between steps. Throws crystal shards that ricochet off every wall, and tears through the map in charged blinks — then pays for it.',
    look: { skin: 0xe8c8b0, main: 0xd9dde6, second: 0x2a2f3c, cloth: 0x7a3fd8, metal: 0x5a606c, glow: 0xb48aff },
    weapon: { name: 'Shardcaster', kind: 'proj', proj: 'shard', desc: 'A gauntlet that grows and flings crystal shards. Each one ricochets twice, hitting harder after every bounce.', dmg: 26, head: 1.5, speed: 58, grav: 0, rof: 0.3, mag: 12, reload: 1.9, spread: 0.008, spreadMove: 0.01, bounce: 2, recoil: 0.012, sound: 'shard' },
    power: { name: 'Rift Step', key: 'blink', desc: 'Hold to charge, release to blink along your aim. Chain blinks together, but every chain ends in fatigue. Your first hits after a blink are Rift Strikes.',
      charges: 2, recharge: 7, chargeTime: 1.1, minDist: 4, maxDist: 18, fatiguePer: 1.0, window: 2, strike: 0.35, strikeWin: 2, decoy: 0, arriveDmg: 0, arriveR: 0, noFatigue: false, heal: 0, lineDmg: 0, vertical: false, rift: 0, hpCost: 0 },
    util: { name: 'Slipstream', key: 'dash', cd: 9, desc: 'Dash 9 m in the direction you are moving.' },
    ult: { name: 'Unbound', key: 'unbound', desc: 'For 8 s, blinks are free, there is no fatigue, and every hit carries Rift Strike.' },
    addons: [
      { id: 'frayed', name: 'Frayed Tether', r: 0, icon: 'thread', d: ['+ Blink distance +20%'], m: P => { P.maxDist *= 1.2; } },
      { id: 'calm', name: 'Calm Pulse', r: 0, icon: 'wave', d: ['+ Fatigue 25% shorter'], m: P => { P.fatiguePer *= 0.75; } },
      { id: 'static', name: 'Static Thread', r: 0, icon: 'bolt', d: ['+ Blinks charge 20% faster'], m: P => { P.chargeTime *= 0.8; } },
      { id: 'quickwire', name: 'Quickwire', r: 0, icon: 'clock', d: ['+ Blinks recharge 20% faster'], m: P => { P.recharge *= 0.8; } },
      { id: 'coil', name: 'Tight Coil', r: 0, icon: 'coil', d: ['+ One more second to chain your next blink'], m: P => { P.window += 1; } },
      { id: 'spare', name: 'Spare Coil', r: 1, icon: 'coil', d: ['+ One more blink per chain', '- Fatigue 25% longer'], m: P => { P.charges += 1; P.fatiguePer *= 1.25; } },
      { id: 'echo', name: 'Echo Shard', r: 1, icon: 'shard', d: ['+ Leave a decoy of yourself behind for 4 s when you blink'], m: P => { P.decoy = 4; } },
      { id: 'drift', name: 'Long Drift', r: 1, icon: 'feather', d: ['+ Blink distance +40%', '- Blinks take 20% longer to charge'], m: P => { P.maxDist *= 1.4; P.chargeTime *= 1.2; } },
      { id: 'afterburn', name: 'Afterburn', r: 1, icon: 'flame', d: ['+ Rift Strike bonus raised from 35% to 75%'], m: P => { P.strike += 0.4; } },
      { id: 'seam', name: 'Ripped Seam', r: 2, icon: 'star', d: ['+ Arriving from a blink blasts enemies within 3.5 m for 60 damage'], m: P => { P.arriveDmg += 60; P.arriveR = 3.5; } },
      { id: 'lung', name: 'Glass Lung', r: 2, icon: 'lung', d: ['+ Restore 35 health every time you blink'], m: P => { P.heal += 35; } },
      { id: 'fold', name: 'Vertical Fold', r: 2, icon: 'wing', d: ['+ Blink straight up or down at any angle — onto roofs, off ledges'], m: P => { P.vertical = true; } },
      { id: 'torn', name: 'Torn Lining', r: 3, icon: 'moon', d: ['+ No fatigue after a chain', '- Blinks recharge 60% slower'], m: P => { P.noFatigue = true; P.recharge *= 1.6; } },
      { id: 'shatter', name: 'Shatterpoint', r: 3, icon: 'shard', d: ['+ Each blink leaves a tear where you stood that bursts 1 s later for 70 damage in 3.5 m'], m: P => { P.rift = 70; } },
      { id: 'iriThread', name: 'Iridescent Thread', r: 4, icon: 'gem', d: ['+ Blink distance more than doubled', '+ Blinking through an enemy deals 90 damage to them', '- Fatigue doubled'], m: P => { P.maxDist *= 2.2; P.lineDmg = 90; P.fatiguePer *= 2; } },
      { id: 'iriHeart', name: 'Iridescent Heart', r: 4, icon: 'lung', d: ['+ Blinks no longer use charges and there is no fatigue — chain forever', '- Every blink costs 30 health'], m: P => { P.hpCost = 30; P.noFatigue = true; } },
    ],
  },
  // ------------------------------------------------------------------------------------------------ GAUGE
  gauge: {
    key: 'gauge', name: 'Gauge', title: 'The Ramjet', role: 'Bruiser', hp: 450, speed: 4.8,
    blurb: 'A demolition foreman sealed inside a walking boiler. Hoses the room with fire, then revs his pistons and charges through whatever is left.',
    look: { skin: 0x2a2624, main: 0xd29a22, second: 0x2c2a28, cloth: 0x5a4a3a, metal: 0x6a6e74, glow: 0xff7a2e },
    weapon: { name: 'Boiler', kind: 'flame', desc: 'A flamethrower fed from his own furnace. Short range, sets enemies ablaze, overheats if you never let go.', range: 7.5, cone: 0.32, dps: 75, burn: [24, 3], heatRate: 0.2, coolRate: 0.35, lockout: 2.4, recoil: 0, sound: 'flame' },
    power: { name: 'Ramjet', key: 'ram', desc: 'Hold to rev the pistons, then charge. Ram an enemy for heavy damage and knockback. Hit a wall and you crash.',
      rev: 0.7, speed: 14, dur: 2.4, turn: 1.3, dmg: 120, knock: 10, cd: 12, crashStun: 1.4, trail: 0, multi: false, shock: 0, shockR: 0, execute: 0, vent: false, bounce: false, jugg: false, furnace: false },
    util: { name: 'Bulwark', key: 'wall', cd: 18, desc: 'Drop a 5 m barrier that blocks enemy fire for 7 s (600 health).' },
    ult: { name: 'Earthshaker', key: 'slam', desc: 'Slam the ground: 150 damage to every enemy within 9 m in sight, who are thrown and stunned for 1.5 s.' },
    addons: [
      { id: 'plug', name: 'Spark Plug', r: 0, icon: 'plug', d: ['+ Revs 0.25 s faster'], m: P => { P.rev = Math.max(0.2, P.rev - 0.25); } },
      { id: 'tine', name: 'Bent Tine', r: 0, icon: 'hook', d: ['+ Turn 35% sharper while charging'], m: P => { P.turn *= 1.35; } },
      { id: 'rag', name: 'Grease Rag', r: 0, icon: 'rag', d: ['+ Cooldown 2 s shorter'], m: P => { P.cd -= 2; } },
      { id: 'pistons', name: 'Bigger Pistons', r: 0, icon: 'piston', d: ['+ Charge speed +12%'], m: P => { P.speed *= 1.12; } },
      { id: 'bumper', name: 'Thick Bumper', r: 0, icon: 'plate', d: ['+ Crashing stuns you for half as long'], m: P => { P.crashStun *= 0.5; } },
      { id: 'ember', name: 'Ember Coil', r: 1, icon: 'flame', d: ['+ Charging leaves a burning trail (20 damage per second, 3 s)'], m: P => { P.trail = 20; } },
      { id: 'pile', name: 'Pile Driver', r: 1, icon: 'bolt', d: ['+ Ram damage +40', '+ Knockback doubled'], m: P => { P.dmg += 40; P.knock *= 2; } },
      { id: 'fuse', name: 'Long Fuse', r: 1, icon: 'fuse', d: ['+ Charge lasts 1.2 s longer'], m: P => { P.dur += 1.2; } },
      { id: 'drift', name: 'Drift Kit', r: 1, icon: 'wing', d: ['+ Turn twice as sharply while charging', '- Charge speed -8%'], m: P => { P.turn *= 2; P.speed *= 0.92; } },
      { id: 'freight', name: 'Freight Chain', r: 2, icon: 'chain', d: ['+ Ramming no longer ends the charge: plough through a whole team', '- Ram damage -30'], m: P => { P.multi = true; P.dmg -= 30; } },
      { id: 'shock', name: 'Shockplate', r: 2, icon: 'wave', d: ['+ Crashing releases a 6 m shockwave for 80 damage', '+ No crash stun'], m: P => { P.shock = 80; P.shockR = 6; P.crashStun = 0; } },
      { id: 'valve', name: 'Steam Valve', r: 2, icon: 'gear', d: ['+ Ramming someone vents the Boiler completely and sets them ablaze'], m: P => { P.vent = true; } },
      { id: 'pinball', name: 'Wrecking Frame', r: 3, icon: 'ring', d: ['+ Walls no longer stop you: the charge caroms off them', '+ Each carom throws a 4 m shockwave for 40'], m: P => { P.bounce = true; P.crashStun = 0; } },
      { id: 'jugg', name: 'Juggernaut Core', r: 3, icon: 'plate', d: ['+ While revving and charging: immune to roots, stuns and knockback', '+ and take half damage'], m: P => { P.jugg = true; } },
      { id: 'iriPiston', name: 'Iridescent Piston', r: 4, icon: 'skull', d: ['+ Ramming an enemy below half health kills them outright', '- Cooldown 5 s longer'], m: P => { P.execute = 0.5; P.cd += 5; } },
      { id: 'iriFurnace', name: 'Iridescent Furnace', r: 4, icon: 'flame', d: ['+ The charge lasts for as long as you hold it', '+ and leaves a wall of fire (35 damage per second)', '- Every second of charging costs you 15 health'], m: P => { P.furnace = true; P.dur = 999; P.trail = 35; } },
    ],
  },
  // ------------------------------------------------------------------------------------------------ VEIL
  veil: {
    key: 'veil', name: 'Veil', title: 'The Phantom', role: 'Assassin', hp: 260, speed: 5.3,
    blurb: 'Nobody has seen her face, or much of the rest of her. Carries no gun at all — just two curved knives, and a way of not being there until it matters.',
    look: { skin: 0xe6e0d6, main: 0x2b2733, second: 0x141218, cloth: 0x3a2f4a, metal: 0x4a4656, glow: 0xc06aff },
    weapon: { name: 'Whisper Knives', kind: 'melee', desc: 'Two curved knives. Each slash lunges you forward. From behind, a slash is a Backstab for 2.5× damage.', dmg: 55, range: 2.9, cone: 0.95, rof: 0.62, windup: 0.12, lunge: 6, backstab: 2.5, sound: 'slash' },
    power: { name: 'Fade', key: 'fade', desc: 'Fade out of sight and move faster. Enemies only see a shimmer up close. Unveil to make your next strike an Ambush.',
      fadeIn: 0.8, fadeOut: 1.0, speed: 1.35, maxTime: 14, ambush: 70, ambushWin: 2.5, cd: 6, shimmer: 8, regen: 0, cleave: false, blind: 0, sense: 0, shootCloaked: false, silent: false, swift: 0, shadowStep: false, perma: false },
    util: { name: 'Scry', key: 'scry', cd: 14, desc: 'Reveal every enemy in a 45° cone up to 40 m for 4 s.' },
    ult: { name: 'Nightfall', key: 'night', desc: 'For 9 s you are truly invisible — no shimmer — and can strike freely, with 30% more damage.' },
    addons: [
      { id: 'soot', name: 'Soot Mask', r: 0, icon: 'mask', d: ['+ Fade out 0.3 s faster'], m: P => { P.fadeIn = Math.max(0.15, P.fadeIn - 0.3); } },
      { id: 'step', name: 'Light Step', r: 0, icon: 'feather', d: ['+ Faded speed +10%'], m: P => { P.speed += 0.1; } },
      { id: 'ash', name: 'Ash Thread', r: 0, icon: 'thread', d: ['+ Stay faded 6 s longer'], m: P => { P.maxTime += 6; } },
      { id: 'quick', name: 'Quick Unveil', r: 0, icon: 'clock', d: ['+ Unveil 0.4 s faster'], m: P => { P.fadeOut = Math.max(0.2, P.fadeOut - 0.4); } },
      { id: 'cold', name: 'Coldwind Bead', r: 0, icon: 'wave', d: ['+ Cooldown 2 s shorter'], m: P => { P.cd -= 2; } },
      { id: 'hush', name: 'Hush Charm', r: 1, icon: 'moon', d: ['+ Your shimmer shows only within 4 m (was 8 m)', '+ Silent footsteps while faded'], m: P => { P.shimmer = Math.min(P.shimmer, 4); P.silent = true; } },
      { id: 'wind', name: 'Second Wind', r: 1, icon: 'lung', d: ['+ Regenerate 15 health per second while faded'], m: P => { P.regen += 15; } },
      { id: 'pact', name: "Hunter's Pact", r: 1, icon: 'eye', d: ['+ Ambush bonus damage +50'], m: P => { P.ambush += 50; } },
      { id: 'swift', name: 'Swift Hunt', r: 1, icon: 'feather', d: ['+ After unveiling, move 40% faster for 3 s'], m: P => { P.swift = 3; } },
      { id: 'bloom', name: 'Dark Bloom', r: 2, icon: 'star', d: ['+ Unveiling blinds every enemy within 8 m for 2 s'], m: P => { P.blind = 2; } },
      { id: 'lantern', name: 'Ghost Lantern', r: 2, icon: 'lantern', d: ['+ While faded, see every enemy within 25 m through walls'], m: P => { P.sense = 25; } },
      { id: 'cleave', name: 'Cleaving Veil', r: 2, icon: 'blade', d: ['+ The Ambush strike hits everyone in a wide arc, and reaches 1.5 m further'], m: P => { P.cleave = true; } },
      { id: 'storm', name: 'Windstorm', r: 3, icon: 'wing', d: ['+ Faded speed +40%', '- Your shimmer shows 5 m further away'], m: P => { P.speed += 0.4; P.shimmer += 5; } },
      { id: 'shadow', name: 'Shadow Step', r: 3, icon: 'mask', d: ['+ Unveiling while looking at an enemy within 16 m puts you right behind them'], m: P => { P.shadowStep = true; } },
      { id: 'iriShroud', name: 'Iridescent Shroud', r: 4, icon: 'gem', d: ['+ Strike while faded: the hit unveils you instantly as an Ambush', '- Cooldown 6 s longer'], m: P => { P.shootCloaked = true; P.cd += 6; } },
      { id: 'iriCoin', name: 'Iridescent Coin', r: 4, icon: 'moon', d: ['+ You are always faded: striking shows you for 2 s, then you vanish again by yourself', '- Maximum health −40%'], m: P => { P.perma = true; } },
    ],
  },
  // ------------------------------------------------------------------------------------------------ IVRA
  ivra: {
    key: 'ivra', name: 'Ivra', title: 'The Glaivewright', role: 'Skirmisher', hp: 320, speed: 5.2,
    blurb: 'A temple warden with a tide-staff that latches a beam onto her prey and drinks them, and a quiver of throwing glaives for anything that runs.',
    look: { skin: 0x9a6a50, main: 0x2f6a66, second: 0x1a2a2a, cloth: 0x8a2a2a, metal: 0xb8873a, glow: 0x5affd2 },
    weapon: { name: 'Tidecaller', kind: 'beam', desc: 'A staff that latches a tide-beam onto the nearest enemy in your sights. The longer you hold the lock, the harder it bites.', range: 18, cone: 0.17, dpsMin: 24, dpsMax: 68, ramp: 2.5, drain: 20, regen: 32, recoil: 0, sound: 'beam' },
    power: { name: 'Glaives', key: 'glaive', desc: 'Hold to wind up, release to throw a glaive in an arc. A longer wind-up throws further and hits harder. Glaives come back to you over time.',
      cap: 3, regen: 8, windMin: 0.25, windMax: 1.2, spdMin: 26, spdMax: 48, dmgMin: 60, dmgMax: 130, grav: 9, slow: 0.6, venom: 0, ricochet: 0, blast: 0, blastR: 0, twin: false, mark: 0, oneshot: false, returning: false, pierce: false, orbit: false, quick: 0 },
    util: { name: 'Updraft', key: 'leap', cd: 11, desc: 'Leap high into the air and forward.' },
    ult: { name: 'Glaive Storm', key: 'storm', desc: 'Throw nine fully wound glaives in a wide fan.' },
    addons: [
      { id: 'grip', name: 'Leather Grip', r: 0, icon: 'rag', d: ['+ Wind up 15% faster'], m: P => { P.windMax *= 0.85; } },
      { id: 'fletch', name: 'Fletched Edge', r: 0, icon: 'feather', d: ['+ Glaives fly 15% faster'], m: P => { P.spdMin *= 1.15; P.spdMax *= 1.15; } },
      { id: 'whet', name: 'Whetstone', r: 0, icon: 'stone', d: ['+ Glaive damage +15'], m: P => { P.dmgMin += 15; P.dmgMax += 15; } },
      { id: 'rest', name: "Hunter's Rest", r: 0, icon: 'clock', d: ['+ Glaives come back 30% faster'], m: P => { P.regen *= 0.7; } },
      { id: 'balance', name: 'Balanced Haft', r: 0, icon: 'twin', d: ['+ Quick throws hit 30 harder'], m: P => { P.dmgMin += 30; } },
      { id: 'quiver', name: 'Extra Quiver', r: 1, icon: 'quiver', d: ['+ Carry one more glaive'], m: P => { P.cap += 1; } },
      { id: 'venom', name: 'Venom Tip', r: 1, icon: 'vial', d: ['+ Hits poison for 50 damage over 5 s'], m: P => { P.venom += 50; } },
      { id: 'haft', name: 'Light Haft', r: 1, icon: 'wing', d: ['+ Move at full speed while winding up'], m: P => { P.slow = 1; } },
      { id: 'bevel', name: 'Ricochet Bevel', r: 1, icon: 'ring', d: ['+ Glaives bounce off one wall'], m: P => { P.ricochet = 1; } },
      { id: 'flint', name: 'Flintstrike', r: 2, icon: 'flame', d: ['+ Glaives burst on impact for 45 damage within 3 m'], m: P => { P.blast = 45; P.blastR = 3; } },
      { id: 'twin', name: 'Twin Throw', r: 2, icon: 'twin', d: ['+ Throw two glaives at once in a narrow V', '- Uses two glaives'], m: P => { P.twin = true; } },
      { id: 'return', name: 'Returning Edge', r: 2, icon: 'hook', d: ['+ Glaives that strike a wall fly back to you, cutting through anyone on the way'], m: P => { P.returning = true; } },
      { id: 'blood', name: 'Bloodtrail', r: 3, icon: 'drop', d: ['+ Glaive hits reveal the target for 8 s', '+ and slow them by 35% for 3 s'], m: P => { P.mark = 8; } },
      { id: 'sunder', name: 'Sundering Glaive', r: 3, icon: 'blade', d: ['+ Glaives pass through every enemy in their path'], m: P => { P.pierce = true; } },
      { id: 'iriGlaive', name: 'Iridescent Glaive', r: 4, icon: 'gem', d: ['+ A fully wound glaive kills outright', '- Carry only one glaive', '- Glaives take 16 s to come back'], m: P => { P.oneshot = true; P.cap = 1; P.regen = 16; } },
      { id: 'iriRing', name: 'Iridescent Ring', r: 4, icon: 'ring', d: ['+ Your glaives orbit you as a ring of blades (40 to anyone they touch)', '+ Press the power to fling the whole ring outward at full strength', '- They no longer wind up or arc'], m: P => { P.orbit = true; } },
    ],
  },
  // ------------------------------------------------------------------------------------------------ WICK
  wick: {
    key: 'wick', name: 'Wick', title: 'The Lamplighter', role: 'Controller', hp: 300, speed: 5.2,
    blurb: 'A candle-headed keeper of lighthouses that no longer exist. Sends homing moths after anything that moves, hangs lanterns that expose the dark, and walks between them.',
    look: { skin: 0xe8d8b0, main: 0x3a3428, second: 0x1e1a16, cloth: 0x6a5a3a, metal: 0xa88a4a, glow: 0xffd27a },
    weapon: { name: 'Moth Swarm', kind: 'proj', proj: 'moth', desc: 'Lets loose three slow moths per throw. They drift toward the nearest enemy in front of you.', dmg: 22, head: 1.0, speed: 17, grav: 0, rof: 0.95, mag: 8, reload: 2.2, spread: 0.0, spreadMove: 0, volley: 3, volleySpread: 0.12, homing: 3.2, recoil: 0.01, sound: 'moth' },
    power: { name: 'Lanterns', key: 'lantern', desc: 'Tap to hang a lantern. Enemies in its light are revealed and slowed. Hold while looking at one of your lanterns to walk through the dark to it.',
      carry: 3, recharge: 10, place: 0.5, radius: 6, slow: 0.8, linger: 0, walk: 0.9, walkCd: 6, throwDist: 0, echo: 0, root: 0, burn: 0, beacon: 0, hidden: false, carried: false, turret: 0, mothBoost: 0 },
    util: { name: 'Wax Shell', key: 'shell', cd: 16, desc: 'Coat yourself in hot wax: a 100-point shield for 4 s.' },
    ult: { name: 'Flare', key: 'flare', desc: 'Every lantern bursts: 80 damage and 2.5 s of blindness to enemies in its light.' },
    addons: [
      { id: 'long', name: 'Long Wick', r: 0, icon: 'candle', d: ['+ Lantern light reaches 25% further'], m: P => { P.radius *= 1.25; } },
      { id: 'oil', name: 'Bright Oil', r: 0, icon: 'drop', d: ['+ Enemies stay revealed 3 s after leaving the light'], m: P => { P.linger = 3; } },
      { id: 'taper', name: 'Quick Taper', r: 0, icon: 'clock', d: ['+ Hang lanterns twice as fast'], m: P => { P.place *= 0.5; } },
      { id: 'snuff', name: "Snuffer's Grace", r: 0, icon: 'feather', d: ['+ Lantern walks take 0.3 s less'], m: P => { P.walk -= 0.3; } },
      { id: 'tallow', name: 'Tallow Stock', r: 0, icon: 'candle', d: ['+ Lanterns recharge 25% faster'], m: P => { P.recharge *= 0.75; } },
      { id: 'extra', name: 'Spare Lantern', r: 1, icon: 'lantern', d: ['+ One more lantern'], m: P => { P.carry += 1; } },
      { id: 'wax', name: 'Sticky Wax', r: 1, icon: 'drop', d: ['+ The light slows enemies by 40% (was 20%)'], m: P => { P.slow = 0.6; } },
      { id: 'bait', name: 'Moth Bait', r: 1, icon: 'moth', d: ['+ Your moths deal 50% more to enemies standing in your light'], m: P => { P.mothBoost = 0.5; } },
      { id: 'smolder', name: 'Smoldering Wick', r: 1, icon: 'flame', d: ['+ The light burns enemies for 12 damage per second'], m: P => { P.burn = 12; } },
      { id: 'far', name: 'Hurled Lamp', r: 2, icon: 'hook', d: ['+ Throw lanterns up to 22 m, wherever you aim'], m: P => { P.throwDist = 22; } },
      { id: 'echo', name: 'Lantern Echo', r: 2, icon: 'star', d: ['+ Arriving from a lantern walk blinds enemies within 6 m for 1.6 s'], m: P => { P.echo = 1.6; } },
      { id: 'hungry', name: 'Hungry Flame', r: 2, icon: 'flame', d: ['+ Enemies who stay in the light for 2 s are rooted for 1.2 s (once per lantern)'], m: P => { P.root = 1.2; } },
      { id: 'beacon', name: 'Beacon Network', r: 3, icon: 'web', d: ['+ Your lanterns are strung together with light', '+ Crossing a line between two lanterns deals 45 and reveals'], m: P => { P.beacon = 45; } },
      { id: 'wraith', name: 'Wraithlight', r: 3, icon: 'moon', d: ['+ Enemies cannot see your lanterns or their light, and are never told they are revealed'], m: P => { P.hidden = true; } },
      { id: 'iriLamp', name: 'Iridescent Lamp', r: 4, icon: 'gem', d: ['+ You are the lantern: a 9 m light always around you that reveals, slows and burns (18/s)', '- You can no longer hang lanterns or walk between them'], m: P => { P.carried = true; P.radius = 9; P.burn = Math.max(P.burn, 18); } },
      { id: 'iriMoth', name: 'Iridescent Moth', r: 4, icon: 'moth', d: ['+ Every lantern breeds moths and sends one at an enemy in its light every 1.2 s', '- One fewer lantern'], m: P => { P.turret = 1.2; P.carry = Math.max(1, P.carry - 1); } },
    ],
  },
  // ------------------------------------------------------------------------------------------------ MIRE
  mire: {
    key: 'mire', name: 'Mire', title: 'The Bogwitch', role: 'Ambusher', hp: 340, speed: 5.0,
    blurb: 'Something that lived at the bottom of a peat bog for a very long time. Lobs flasks of bubbling acid, then sinks into the ground and comes up under your feet.',
    look: { skin: 0x5a7a4a, main: 0x3a4a2a, second: 0x1e2416, cloth: 0x4a3a2a, metal: 0x7a6a4a, glow: 0x9aff5a },
    weapon: { name: "Brewer's Flasks", kind: 'proj', proj: 'flask', desc: 'Lobbed glass flasks. They shatter into a pool of acid that eats anyone standing in it.', dmg: 30, head: 1.0, speed: 23, grav: 14, rof: 1.0, mag: 5, reload: 2.4, spread: 0.0, spreadMove: 0, splash: 30, splashR: 2.2, zone: [25, 2.5, 4], recoil: 0.03, sound: 'flask' },
    power: { name: 'Submerge', key: 'sub', desc: 'Sink into the ground: untouchable, fast, and blind to the fight above. Press again to burst up in a geyser that hurls enemies into the air.',
      sink: 0.5, maxTime: 4, speed: 1.6, cd: 10, dmg: 60, radius: 3.5, knock: 9, rippleVis: 99, heal: 0, pool: 0, pull: false, root: 0, drown: 0, trail: 0, flaskRing: false, artillery: false, fen: false },
    util: { name: 'Leech', key: 'leech', cd: 15, desc: 'For 3 s, drain 15 health per second from every enemy within 7 m.' },
    ult: { name: 'Bog Tide', key: 'tide', desc: 'Flood the ground around you: an 8 m acid bog for 6 s that burns (35/s) and slows enemies by 40%.' },
    addons: [
      { id: 'murk', name: 'Murky Water', r: 0, icon: 'wave', d: ['+ Stay under 1.5 s longer'], m: P => { P.maxTime += 1.5; } },
      { id: 'current', name: 'Swift Current', r: 0, icon: 'feather', d: ['+ Move 15% faster underground'], m: P => { P.speed += 0.24; } },
      { id: 'peat', name: 'Peat Moss', r: 0, icon: 'leaf', d: ['+ Cooldown 2 s shorter'], m: P => { P.cd -= 2; } },
      { id: 'bubble', name: 'Bubbling Brew', r: 0, icon: 'vial', d: ['+ Geyser damage +25'], m: P => { P.dmg += 25; } },
      { id: 'silt', name: 'Silted Ripple', r: 0, icon: 'moon', d: ['+ Enemies only see your ripple within 10 m'], m: P => { P.rippleVis = 10; } },
      { id: 'deep', name: 'Deep Root', r: 1, icon: 'ring', d: ['+ Geyser radius +40%'], m: P => { P.radius *= 1.4; } },
      { id: 'slick', name: 'Mudslick', r: 1, icon: 'drop', d: ['+ Sink twice as fast'], m: P => { P.sink *= 0.5; } },
      { id: 'leechw', name: 'Leech Water', r: 1, icon: 'lung', d: ['+ Heal 14 health per second underground'], m: P => { P.heal = 14; } },
      { id: 'rot', name: 'Rot Pool', r: 1, icon: 'vial', d: ['+ The geyser leaves a pool of acid (30/s for 4 s)'], m: P => { P.pool = 30; } },
      { id: 'undertow', name: 'Undertow', r: 2, icon: 'hook', d: ['+ The geyser first drags enemies within 8 m toward you'], m: P => { P.pull = true; } },
      { id: 'sink', name: 'Sinkhole', r: 2, icon: 'jaw', d: ['+ Enemies caught by the geyser are rooted for 1.5 s when they land'], m: P => { P.root = 1.5; } },
      { id: 'drown', name: 'Drowned Lungs', r: 2, icon: 'skull', d: ['+ Enemies standing over you while you are under take 35 damage per second'], m: P => { P.drown = 35; } },
      { id: 'bore', name: 'Tidal Bore', r: 3, icon: 'wave', d: ['+ You leave a trail of acid underground (25/s)', '+ and stay under 1 s longer'], m: P => { P.trail = 25; P.maxTime += 1; } },
      { id: 'witch', name: "Witch's Water", r: 3, icon: 'flask', d: ['+ Surfacing refills your flasks and hurls six of them out in a ring'], m: P => { P.flaskRing = true; } },
      { id: 'iriAbyss', name: 'Iridescent Abyss', r: 4, icon: 'gem', d: ['+ No time limit underground', '+ Throw flasks from below: they burst up out of the ground where you aim', '- 40% slower underground'], m: P => { P.artillery = true; P.maxTime = 999; P.speed *= 0.6; } },
      { id: 'iriFen', name: 'Iridescent Fen', r: 4, icon: 'leaf', d: ['+ Your acid pools are 2.5× wider and last 3× longer', '+ Standing in your own acid heals you 20 per second'], m: P => { P.fen = true; } },
    ],
  },
  // ------------------------------------------------------------------------------------------------ SPINDLE
  spindle: {
    key: 'spindle', name: 'Spindle', title: 'The Puppeteer', role: 'Disruptor', hp: 290, speed: 5.4,
    blurb: 'A lanky marionette that cut its own strings and kept them. Stitches enemies in place with flung needles, and reels them in on a line they never see coming.',
    look: { skin: 0xd8c0a0, main: 0x7a1e2e, second: 0x221418, cloth: 0xe0d6c4, metal: 0xc0b8a8, glow: 0xff5a7a },
    weapon: { name: 'Thread Needles', kind: 'proj', proj: 'needle', desc: 'Flings needles in bursts of three. Land three on the same enemy within 1.5 s to Stitch them in place for a moment.', dmg: 17, head: 1.6, speed: 85, grav: 0, rof: 0.72, mag: 18, reload: 1.9, spread: 0.006, spreadMove: 0.01, burst: 3, burstGap: 0.08, stitch: 0.8, recoil: 0.012, sound: 'needle' },
    power: { name: 'Marionette Line', key: 'line', desc: 'Fire a line. If it catches an enemy, you reel them toward you, mark them and wound them.',
      speed: 60, range: 32, cd: 9, dmg: 25, pad: 0.35, charges: 1, stun: 0, vuln: 0, slow: 0, swap: false, choke: 0, multi: 1, gallows: false, puppet: 0, web: false, meet: false },
    util: { name: 'Grapple', key: 'grapple', cd: 10, desc: 'Hook any surface within 28 m and reel yourself to it.' },
    ult: { name: "Cat's Cradle", key: 'cradle', desc: 'Strings lash every enemy in sight within 22 m: rooted for 2.2 s, 40 damage.' },
    addons: [
      { id: 'taut', name: 'Taut Silk', r: 0, icon: 'thread', d: ['+ The line flies 30% faster'], m: P => { P.speed *= 1.3; } },
      { id: 'wax', name: 'Waxed Thread', r: 0, icon: 'drop', d: ['+ Cooldown 2 s shorter'], m: P => { P.cd -= 2; } },
      { id: 'barb', name: 'Hook Barb', r: 0, icon: 'hook', d: ['+ Line damage +20'], m: P => { P.dmg += 20; } },
      { id: 'spool', name: 'Long Spool', r: 0, icon: 'spool', d: ['+ Range +10 m'], m: P => { P.range += 10; } },
      { id: 'fine', name: 'Fine Needle', r: 0, icon: 'needle', d: ['+ The line catches enemies 60% more easily'], m: P => { P.pad *= 1.6; } },
      { id: 'reel', name: 'Reel Back', r: 1, icon: 'spool', d: ['+ Reeled-in enemies are stunned for 0.7 s when they arrive'], m: P => { P.stun = 0.7; } },
      { id: 'hitch', name: 'Double Hitch', r: 1, icon: 'twin', d: ['+ Two lines before the cooldown'], m: P => { P.charges = 2; } },
      { id: 'mark', name: 'Puppet Mark', r: 1, icon: 'eye', d: ['+ Caught enemies take 25% more damage from everyone for 5 s'], m: P => { P.vuln = 5; } },
      { id: 'tangle', name: 'Tangle', r: 1, icon: 'web', d: ['+ Caught enemies are slowed by 40% for 3 s'], m: P => { P.slow = 3; } },
      { id: 'swap', name: 'Swap Thread', r: 2, icon: 'twin', d: ['+ Instead of reeling them in, you trade places with the enemy you catch'], m: P => { P.swap = true; } },
      { id: 'choke', name: 'Choke Wire', r: 2, icon: 'chain', d: ['+ Instead of reeling them in, the line pins them where they stand for 1.8 s'], m: P => { P.choke = 1.8; } },
      { id: 'cross', name: 'Crossed Wires', r: 2, icon: 'web', d: ['+ The line passes through and catches up to three enemies'], m: P => { P.multi = 3; } },
      { id: 'gallows', name: 'Gallows Knot', r: 3, icon: 'skull', d: ['+ Caught enemies are hoisted 9 m into the air instead, then dropped'], m: P => { P.gallows = true; } },
      { id: 'puppet', name: 'Puppet Strings', r: 3, icon: 'spool', d: ['+ Caught enemies are yours for 1.8 s: they walk toward you and cannot attack'], m: P => { P.puppet = 1.8; } },
      { id: 'iriWeb', name: 'Iridescent Web', r: 4, icon: 'web', d: ['+ The line becomes a 7 m net: everyone it catches is bound in place for 2.5 s', '- Cooldown 4 s longer'], m: P => { P.web = true; P.cd += 4; } },
      { id: 'iriSpindle', name: 'Iridescent Spindle', r: 4, icon: 'gem', d: ['+ The line drags you both together: you meet in the middle with a 100-damage collision', '+ Two stitched needles are enough to Stitch'], m: P => { P.meet = true; } },
    ],
  },
};
const HERO_KEYS = Object.keys(HEROES);
for (const k of HERO_KEYS) HEROES[k].addons.forEach((a, i) => { a.idx = i; a.hero = k; });

function powerFor(heroKey, addons) {
  const H = HEROES[heroKey], P = Object.assign({}, H.power);
  for (const i of addons || []) { const a = H.addons[i]; if (a) a.m(P); }
  return P;
}
function randomLoadout(heroKey, rng = Math.random) {
  const A = HEROES[heroKey].addons, out = [];
  while (out.length < 2) {
    const roll = rng(), r = roll < 0.3 ? 0 : roll < 0.58 ? 1 : roll < 0.8 ? 2 : roll < 0.94 ? 3 : 4;
    const pool = A.filter(a => a.r === r && !out.includes(a.idx)); if (pool.length) out.push(pool[Math.floor(rng() * pool.length)].idx);
  }
  return out;
}

// ---------------------------------------------------------------- the add-ons you own: earned by playing, used up by deploying
const Inventory = {
  get(hero) { const inv = Settings.inv || (Settings.inv = {}); return inv[hero] || (inv[hero] = {}); },
  count(hero, i) { return this.get(hero)[i] | 0; },
  add(hero, i, n = 1) { const h = this.get(hero); h[i] = (h[i] | 0) + n; Settings.save(); },
  take(hero, i) { const h = this.get(hero); if ((h[i] | 0) <= 0) return false; h[i]--; if (!h[i]) delete h[i]; Settings.save(); return true; },
  // a roll on the drop table, for this hero
  roll(hero) {
    // the more you play a hero, the better the draws get (up to about double the odds of the top two rarities)
    const xp = Math.min(1, (Settings.played[hero] | 0) / 40), w = RARITY.map((R, i) => R.drop * (i >= 3 ? 1 + xp : i === 0 ? 1 - xp * 0.35 : 1)), sum = w.reduce((a, b) => a + b, 0);
    let x = Math.random() * sum, r = 0; for (; r < 4; r++) { x -= w[r]; if (x < 0) break; }
    const pool = HEROES[hero].addons.filter(a => a.r === r); return pick(pool).idx;
  },
  // first time anyone opens the game: a few commons for every hero, so the slots are never empty to start with
  starter() {
    if (Settings.invV === 2) return;
    Settings.inv = {}; Settings.loadouts = {};
    for (const k of HERO_KEYS) {
      const commons = HEROES[k].addons.filter(a => a.r === 0); for (const a of commons.sort(() => Math.random() - 0.5).slice(0, 3)) this.add(k, a.idx, 2);
      this.add(k, pick(HEROES[k].addons.filter(a => a.r === 1)).idx, 1);
    }
    Settings.invV = 2; Settings.save();
  },
  // the slotted add-ons you can actually afford right now
  loadout(hero) { const l = Settings.loadouts[hero]; if (!Array.isArray(l)) return []; return l.filter((i, n) => Number.isInteger(i) && i >= 0 && i < 16 && l.indexOf(i) === n && (this.count(hero, i) > 0 || this.paid(hero, i))).slice(0, 2); },
  paid(hero, i) { const M = typeof Game !== 'undefined' && Game.match; return !!(M && M.paid && M.paid[hero + ':' + i]); },
  total(hero) { let n = 0; const h = this.get(hero); for (const k in h) n += h[k]; return n; },
  // deploying burns the slotted add-ons, once per match (rounds and respawns don't cost more)
  consumeFor(a) {
    const M = Game.match; if (!M || !a.addons.length) return;
    M.paid = M.paid || {};
    for (const i of a.addons) { const k = a.heroKey + ':' + i; if (!M.paid[k] && this.take(a.heroKey, i)) M.paid[k] = 1; }
  },
  // the end of a match: three draws for a win, two for a draw, one for a loss, all for the hero you finished as
  award(hero, result) {
    const n = result > 0 ? 3 : result === 0 ? 2 : 1, got = [];
    for (let i = 0; i < n; i++) { const idx = this.roll(hero); this.add(hero, idx); got.push(idx); }
    Settings.played[hero] = (Settings.played[hero] | 0) + 1; Settings.save();
    return got;
  },
};
function loadoutFor(heroKey) { return Inventory.loadout(heroKey); }

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
  candle: '<rect x="24" y="26" width="16" height="30" rx="2" fill="currentColor"/><path d="M32 8c5 6 6 10 0 16-6-6-5-10 0-16z" fill="currentColor"/><path d="M32 22v4" stroke-width="2"/>',
  moth: '<path d="M32 18v32" stroke-width="4"/><path d="M30 24C20 10 6 14 8 26s14 10 22 4zM34 24c10-14 24-10 22 2s-14 10-22 4zM30 34c-8 2-16 8-12 16s12 0 12-8zM34 34c8 2 16 8 12 16s-12 0-12-8z" fill="currentColor"/>',
  flask: '<path d="M26 6h12M28 6v14C18 24 12 32 12 40a20 16 0 0040 0c0-8-6-16-16-20V6" fill="none" stroke-width="4"/><path d="M14 40h36a18 14 0 01-36 0z" fill="currentColor"/>',
  leaf: '<path d="M12 52C12 24 30 10 54 10c0 26-16 42-42 42z" fill="currentColor"/><path d="M14 50L44 20" stroke="#000" stroke-width="3" opacity=".4"/>',
  spool: '<rect x="14" y="10" width="36" height="8" rx="2" fill="currentColor"/><rect x="14" y="46" width="36" height="8" rx="2" fill="currentColor"/><path d="M20 18h24v28H20z" fill="none" stroke-width="3"/><path d="M20 24l24 4M20 32l24 4M20 40l24 4" stroke-width="2.5"/>',
  needle: '<path d="M10 54L50 14" stroke-width="5"/><ellipse cx="50" cy="14" rx="5" ry="3" transform="rotate(-45 50 14)" fill="none" stroke-width="3"/><path d="M10 54c10 4 26-6 40-2" fill="none" stroke-width="2" opacity=".7"/>',
  web: '<circle cx="32" cy="32" r="22" fill="none" stroke-width="3"/><circle cx="32" cy="32" r="12" fill="none" stroke-width="3"/><path d="M32 8v48M8 32h48M15 15l34 34M49 15L15 49" stroke-width="3"/>',
};
function iconSVG(name) { return `<svg viewBox="0 0 64 64" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" fill="none">${ICONS[name] || ICONS.gem}</svg>`; }
const POWER_ICON = { snare: 'jaw', blink: 'shard', ram: 'piston', fade: 'mask', glaive: 'twin', lantern: 'lantern', sub: 'wave', line: 'spool' };
