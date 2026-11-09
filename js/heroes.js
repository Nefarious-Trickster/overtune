'use strict';
// ============================================================================
// Heroes: stats, signature weapons, powers and every add-on. An add-on bends its hero's power: commons nudge the
// numbers, rares add rules, Very Rares change how you play it, and Iridescents transform it outright.
// Add-ons are earned by playing (see Inventory) and a slotted one is used up when you deploy with it.
// ============================================================================
const RARITY = [
  { name: 'Common', css: '#8c6b4a', glow: '#b8916a', drop: 0.36 },
  { name: 'Uncommon', css: '#c9a12e', glow: '#ffd75a', drop: 0.28 },
  { name: 'Rare', css: '#3d9c55', glow: '#6ff08e', drop: 0.2 },
  { name: 'Very Rare', css: '#8a46d0', glow: '#c48aff', drop: 0.11 },
  { name: 'Iridescent', css: '#d8325a', glow: '#ff7aa0', drop: 0.05 },
];

const HEROES = {
  // ------------------------------------------------------------------------------------------------ MARROW
  marrow: {
    key: 'marrow', name: 'Marrow', title: 'The Snarewright', role: 'Trapper', hp: 320, speed: 5.1,
    blurb: 'A bone-dry frontier hunter in a long coat and wide hat. Fires barbed harpoons from a crank crossbow and seeds the ground with iron snares.',
    look: { skin: 0xb98a68, main: 0x6a4428, second: 0x3a2a1e, cloth: 0x4c5040, metal: 0x8a8f96, glow: 0xffb35c },
    weapon: { name: 'Rattlejaw', kind: 'proj', proj: 'bolt', desc: "Crossbow. Fires one heavy bolt per shot. Bolts drop over long distances and slow the enemy they hit.", dmg: 78, head: 1.6, speed: 72, grav: 5, rof: 1.05, mag: 4, reload: 2.6, spread: 0.002, spreadMove: 0.01, slow: [0.7, 1.2], recoil: 0.05, sound: 'crossbow' },
    power: { name: 'Snares', key: 'snare', desc: "Press to place a trap at your feet. An enemy who steps on it is stuck in place, takes damage, and is shown to your team.",
      carry: 2, recharge: 14, arm: 1.2, radius: 1.1, root: 2.0, dmg: 40, reveal: 6, visDist: 10, place: 0.7, throwDist: 0, bleed: 0, chain: 0, bell: 0, explode: 0, explodeR: 0, noRoot: false, vuln: 0, auto: 0 },
    util: { name: 'Field Dressing', key: 'heal', cd: 18, desc: "Heal 110 health over 3 seconds." },
    ult: { name: 'Killing Field', key: 'field', desc: "Show every enemy to your team for 8 seconds, refill your traps, and make all your traps bigger." },
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
      { id: 'spring', name: 'Hair Trigger', r: 1, icon: 'spring', d: ['+ Snares arm 40% faster', '+ Trigger radius 0.3 m wider'], m: P => { P.arm *= 0.6; P.radius += 0.3; } },
      { id: 'wire', name: 'Barbed Wire', r: 2, icon: 'chain', d: ['+ Caught enemies bleed for 30 more', '+ Root lasts 0.5 s longer'], m: P => { P.bleed += 30; P.root += 0.5; } },
      { id: 'hunt', name: 'Hunter\'s Mark', r: 3, icon: 'eye', d: ['+ A caught enemy is Vulnerable (+25% damage taken) for 4 s', '+ and revealed for 4 s longer'], m: P => { P.vuln = Math.max(P.vuln, 4); P.reveal += 4; } },
      { id: 'longarm', name: 'Long Arm', r: 3, icon: 'hook', d: ['+ Throw snares up to 22 m away', '+ Carry one more snare'], m: P => { P.throwDist = 22; P.carry += 1; } },
      { id: 'iriMaw', name: 'Iridescent Maw', r: 4, icon: 'skull', d: ['+ Snares explode for 160 damage in a 6 m blast', '+ and still root anyone who survives'], m: P => { P.explode = 160; P.explodeR = 6; } },
      { id: 'iriStone', name: 'Iridescent Stone', r: 4, icon: 'gem', d: ['+ Every 5 s a snare springs up by itself in an enemy\'s path, anywhere on the map (up to 12)', '+ They arm instantly'], m: P => { P.auto = 5; P.carry = 12; P.arm = 0.05; } },
    ],
  },
  // ------------------------------------------------------------------------------------------------ LARK
  lark: {
    key: 'lark', name: 'Lark', title: 'The Rift Runner', role: 'Flanker', hp: 280, speed: 5.6,
    blurb: 'A courier who learned to fold space between steps. Throws crystal shards that ricochet off every wall, and tears through the map in charged blinks — then pays for it.',
    look: { skin: 0xe8c8b0, main: 0xd9dde6, second: 0x2a2f3c, cloth: 0x7a3fd8, metal: 0x5a606c, glow: 0xb48aff },
    weapon: { name: 'Shardcaster', kind: 'proj', proj: 'shard', desc: "Fires crystal shards that bounce off walls twice. Each bounce makes the shard hit harder.", dmg: 26, head: 1.5, speed: 58, grav: 0, rof: 0.3, mag: 12, reload: 1.9, spread: 0.008, spreadMove: 0.01, bounce: 2, recoil: 0.012, sound: 'shard' },
    power: { name: 'Rift Step', key: 'blink', desc: "Hold to aim, release to teleport forward. You can teleport several times in a row, but then you're tired (slowed) for a moment. Your first hits after teleporting deal bonus damage (Rift Strikes).",
      charges: 2, recharge: 7, chargeTime: 1.1, minDist: 4, maxDist: 18, fatiguePer: 1.0, window: 2, strike: 0.35, strikeWin: 2, decoy: 0, arriveDmg: 0, arriveR: 0, noFatigue: false, heal: 0, lineDmg: 0, vertical: false, rift: 0, hpCost: 0 },
    util: { name: 'Slipstream', key: 'dash', cd: 9, desc: "Dash a short distance in the direction you're moving." },
    ult: { name: 'Unbound', key: 'unbound', desc: "For 8 seconds: unlimited teleports, no tiredness, and every hit deals bonus damage." },
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
      { id: 'quartz', name: 'Quartz Lens', r: 1, icon: 'eye', d: ['+ Blinks charge 30% faster'], m: P => { P.chargeTime *= 0.7; } },
      { id: 'after', name: 'Afterimage', r: 2, icon: 'mask', d: ['+ Leave a decoy where you blinked from', '+ Rift Strike window 1 s longer'], m: P => { P.decoy = Math.max(P.decoy, 3); P.strikeWin += 1; } },
      { id: 'shatter', name: 'Shatterpoint', r: 3, icon: 'shard', d: ['+ Arriving shatters the air: 70 damage within 4 m'], m: P => { P.arriveDmg += 70; P.arriveR = Math.max(P.arriveR || 0, 4); } },
      { id: 'mend', name: 'Mending Rift', r: 3, icon: 'lung', d: ['+ Each blink heals 20', '+ One extra blink per chain'], m: P => { P.heal += 20; P.charges += 1; } },
      { id: 'iriThread', name: 'Iridescent Thread', r: 4, icon: 'gem', d: ['+ Blink 2.5× as far', '+ Blinking through an enemy deals 140 damage to them'], m: P => { P.maxDist *= 2.5; P.lineDmg = 140; } },
      { id: 'iriHeart', name: 'Iridescent Heart', r: 4, icon: 'lung', d: ['+ Blinks no longer use charges and there is no fatigue — chain forever', '+ Rift Strikes deal 50% more', '- Every blink costs 15 health'], m: P => { P.hpCost = 15; P.noFatigue = true; P.strike *= 1.5; } },
    ],
  },
  // ------------------------------------------------------------------------------------------------ GAUGE
  gauge: {
    key: 'gauge', name: 'Gauge', title: 'The Ramjet', role: 'Bruiser', hp: 450, speed: 4.8,
    blurb: 'A demolition foreman sealed inside a walking boiler. Hoses the room with fire, then revs his pistons and charges through whatever is left.',
    look: { skin: 0x2a2624, main: 0xd29a22, second: 0x2c2a28, cloth: 0x5a4a3a, metal: 0x6a6e74, glow: 0xff7a2e },
    weapon: { name: 'Boiler', kind: 'flame', desc: "Flamethrower. Short range, sets enemies on fire. Overheats and stops for a moment if you hold it too long.", range: 7.5, cone: 0.32, dps: 75, burn: [24, 3], heatRate: 0.2, coolRate: 0.35, lockout: 2.4, recoil: 0, sound: 'flame' },
    power: { name: 'Ramjet', key: 'ram', desc: "Hold to rev up, then charge forward. Hit an enemy for big damage and knock them back. Hit a wall and you're stunned.",
      rev: 0.7, speed: 14, dur: 2.4, turn: 1.3, dmg: 120, knock: 10, cd: 12, crashStun: 1.4, trail: 0, multi: false, shock: 0, shockR: 0, execute: 0, vent: false, bounce: false, jugg: false, furnace: false },
    util: { name: 'Bulwark', key: 'wall', cd: 18, desc: "Place a wall in front of you that blocks enemy shots for 7 seconds." },
    ult: { name: 'Earthshaker', key: 'slam', desc: "Smash the ground: 150 damage to enemies within 9 m, knocking them into the air and stunning them for 1.5 seconds." },
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
      { id: 'grease', name: 'Greased Pistons', r: 1, icon: 'piston', d: ['+ Rev up 40% faster'], m: P => { P.rev *= 0.6; } },
      { id: 'plate', name: 'Battering Plate', r: 2, icon: 'plate', d: ['+ Rams deal 30 more and knock 60% further'], m: P => { P.dmg += 30; P.knock *= 1.6; } },
      { id: 'pinball', name: 'Pinball', r: 3, icon: 'ring', d: ['+ Bounce off walls instead of crashing', '+ Turn 50% sharper while charging'], m: P => { P.bounce = true; P.turn *= 1.5; } },
      { id: 'unstop', name: 'Unstoppable Engine', r: 3, icon: 'gear', d: ['+ Nothing can stop or slow you while charging', '+ Plough through every enemy in your way'], m: P => { P.jugg = true; P.multi = true; } },
      { id: 'iriPiston', name: 'Iridescent Piston', r: 4, icon: 'skull', d: ['+ Ramming an enemy below 60% health kills them outright', '+ Crashing into walls no longer stuns you'], m: P => { P.execute = 0.6; P.crashStun = 0; } },
      { id: 'iriFurnace', name: 'Iridescent Furnace', r: 4, icon: 'flame', d: ['+ The charge lasts for as long as you hold it, 20% faster', '+ and leaves a wall of fire (60 damage per second)', '- Every second of charging costs you 15 health'], m: P => { P.furnace = true; P.dur = 999; P.trail = 60; P.speed *= 1.2; } },
    ],
  },
  // ------------------------------------------------------------------------------------------------ VEIL
  veil: {
    key: 'veil', name: 'Veil', title: 'The Phantom', role: 'Assassin', hp: 260, speed: 5.3,
    blurb: 'Nobody has seen her face, or much of the rest of her. Carries no gun at all — just two curved knives, and a way of not being there until it matters.',
    look: { skin: 0xe6e0d6, main: 0x2b2733, second: 0x141218, cloth: 0x3a2f4a, metal: 0x4a4656, glow: 0xc06aff },
    weapon: { name: 'Whisper Knives', kind: 'melee', desc: "Two knives. Each swing lunges you forward a little. Hitting someone from behind deals 2.5x damage (a Backstab).", dmg: 55, range: 2.9, cone: 0.95, rof: 0.62, windup: 0.12, lunge: 6, backstab: 2.5, sound: 'slash' },
    power: { name: 'Fade', key: 'fade', desc: "Press to turn invisible and move faster. Enemies only see a faint shimmer up close. Press again to appear; your first hit right after deals bonus damage (an Ambush).",
      fadeIn: 0.8, fadeOut: 1.0, speed: 1.35, maxTime: 14, ambush: 70, ambushWin: 2.5, cd: 6, shimmer: 8, regen: 0, cleave: false, blind: 0, sense: 0, shootCloaked: false, silent: false, swift: 0, shadowStep: false, perma: false },
    util: { name: 'Scry', key: 'scry', cd: 14, desc: "Show every enemy in front of you (up to 40 m) to your team for 4 seconds." },
    ult: { name: 'Nightfall', key: 'night', desc: "For 9 seconds: fully invisible, you can attack without appearing, and you deal 30% more damage." },
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
      { id: 'soles', name: 'Soft Soles', r: 1, icon: 'feather', d: ['+ Silent footsteps', '+ 10% faster while faded'], m: P => { P.silent = true; P.speed += 0.1; } },
      { id: 'smoke', name: 'Smoke Vial', r: 2, icon: 'vial', d: ['+ Unveiling blinds enemies near you for 1.5 s'], m: P => { P.blind = Math.max(P.blind || 0, 1.5); } },
      { id: 'stepper', name: 'Shadow Stepper', r: 3, icon: 'mask', d: ['+ Unveiling puts you right behind the nearest enemy', '+ 15 health per second while faded'], m: P => { P.shadowStep = true; P.regen += 15; } },
      { id: 'hound', name: 'Bloodhound', r: 3, icon: 'eye', d: ['+ While faded you sense enemies within 25 m through walls', '+ Ambush window 1 s longer'], m: P => { P.sense = Math.max(P.sense || 0, 25); P.ambushWin += 1; } },
      { id: 'iriShroud', name: 'Iridescent Shroud', r: 4, icon: 'gem', d: ['+ Strike while faded: the hit unveils you instantly as an Ambush', '+ Ambushes deal 50% more'], m: P => { P.shootCloaked = true; P.ambush *= 1.5; } },
      { id: 'iriCoin', name: 'Iridescent Coin', r: 4, icon: 'moon', d: ['+ You are always faded: striking shows you for 2 s, then you vanish again by yourself', '+ 15% faster while faded', '- Maximum health −20%'], m: P => { P.perma = true; P.speed *= 1.15; } },
    ],
  },
  // ------------------------------------------------------------------------------------------------ IVRA
  ivra: {
    key: 'ivra', name: 'Ivra', title: 'The Glaivewright', role: 'Skirmisher', hp: 320, speed: 5.2,
    blurb: 'A temple warden with a tide-staff that latches a beam onto her prey and drinks them, and a quiver of throwing glaives for anything that runs.',
    look: { skin: 0x9a6a50, main: 0x2f6a66, second: 0x1a2a2a, cloth: 0x8a2a2a, metal: 0xb8873a, glow: 0x5affd2 },
    weapon: { name: 'Tidecaller', kind: 'beam', desc: "Hold to fire a beam that locks onto the enemy you aim at. The longer you hold it, the more damage it does. Uses tide, which refills when you let go.", range: 18, cone: 0.17, dpsMin: 24, dpsMax: 68, ramp: 2.5, drain: 20, regen: 32, recoil: 0, sound: 'beam' },
    power: { name: 'Glaives', key: 'glaive', desc: "Hold to wind up, release to throw a spinning blade. The longer the wind-up, the further and harder it goes. Thrown blades come back to you over time.",
      cap: 3, regen: 8, windMin: 0.25, windMax: 1.2, spdMin: 26, spdMax: 48, dmgMin: 60, dmgMax: 130, grav: 9, slow: 0.6, venom: 0, ricochet: 0, blast: 0, blastR: 0, twin: false, mark: 0, oneshot: false, returning: false, pierce: false, orbit: false, quick: 0 },
    util: { name: 'Updraft', key: 'leap', cd: 11, desc: "Jump high into the air and forward." },
    ult: { name: 'Glaive Storm', key: 'storm', desc: "Throw nine fully charged blades in a wide fan." },
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
      { id: 'grip', name: 'Light Grip', r: 1, icon: 'feather', d: ['+ Full wind-up 30% sooner'], m: P => { P.windMax *= 0.7; } },
      { id: 'barb', name: 'Barbed Edge', r: 2, icon: 'blade', d: ['+ Glaives poison for 40', '+ and mark the target for 3 s'], m: P => { P.venom += 40; P.mark = Math.max(P.mark || 0, 3); } },
      { id: 'rico', name: 'Ricochet Ring', r: 3, icon: 'ring', d: ['+ Glaives pass through enemies and ricochet 3 times'], m: P => { P.pierce = true; P.ricochet += 3; } },
      { id: 'boomer', name: 'Boomerang', r: 3, icon: 'twin', d: ['+ Glaives fly back to you after hitting', '+ Carry one more'], m: P => { P.returning = true; P.cap += 1; } },
      { id: 'iriGlaive', name: 'Iridescent Glaive', r: 4, icon: 'gem', d: ['+ A fully wound glaive kills outright', '- Carry two glaives; they take 8 s to come back'], m: P => { P.oneshot = true; P.cap = 2; P.regen = 8; } },
      { id: 'iriRing', name: 'Iridescent Ring', r: 4, icon: 'ring', d: ['+ Your glaives orbit you as a ring of blades that cut anyone they touch', '+ Two extra glaives in the ring', '+ Press the power to fling the whole ring outward, 50% harder'], m: P => { P.orbit = true; P.cap += 2; P.dmgMax *= 1.5; P.dmgMin *= 1.5; } },
    ],
  },
  // ------------------------------------------------------------------------------------------------ WICK
  wick: {
    key: 'wick', name: 'Wick', title: 'The Lamplighter', role: 'Controller', hp: 300, speed: 5.2,
    blurb: 'A candle-headed keeper of lighthouses that no longer exist. Sends homing moths after anything that moves, hangs lanterns that expose the dark, and walks between them.',
    look: { skin: 0xe8d8b0, main: 0x3a3428, second: 0x1e1a16, cloth: 0x6a5a3a, metal: 0xa88a4a, glow: 0xffd27a },
    weapon: { name: 'Moth Swarm', kind: 'proj', proj: 'moth', desc: "Throws three slow moths at a time. They fly toward the nearest enemy in front of you.", dmg: 22, head: 1.0, speed: 17, grav: 0, rof: 0.95, mag: 8, reload: 2.2, spread: 0.0, spreadMove: 0, volley: 3, volleySpread: 0.12, homing: 3.2, recoil: 0.01, sound: 'moth' },
    power: { name: 'Lanterns', key: 'lantern', desc: "Tap to place a lantern. Enemies in its light are slowed and shown to your team. Hold while looking at one of your lanterns to teleport to it.",
      carry: 3, recharge: 10, place: 0.5, radius: 6, slow: 0.8, linger: 0, walk: 0.9, walkCd: 6, throwDist: 0, echo: 0, root: 0, burn: 0, beacon: 0, hidden: false, carried: false, turret: 0, mothBoost: 0 },
    util: { name: 'Wax Shell', key: 'shell', cd: 16, desc: "Gain a 100-point shield for 4 seconds." },
    ult: { name: 'Flare', key: 'flare', desc: "All your lanterns explode: 80 damage and 2.5 seconds of blindness to enemies in their light." },
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
      { id: 'wickl', name: 'Long Wick', r: 1, icon: 'candle', d: ['+ Light lingers on enemies for 3 s after they leave it', '+ Lanterns 1 m wider'], m: P => { P.linger = Math.max(P.linger || 0, 3); P.radius += 1; } },
      { id: 'hidden', name: 'Shuttered Flame', r: 2, icon: 'lantern', d: ['+ Enemies can\'t see your lanterns', '+ Anyone who enters the light is revealed for 2 s'], m: P => { P.hidden = true; P.echo = Math.max(P.echo || 0, 2); } },
      { id: 'beacons', name: 'Beacon Chain', r: 3, icon: 'bolt', d: ['+ Your lanterns link with beams of light that burn enemies crossing them (35 per second)'], m: P => { P.beacon = Math.max(P.beacon || 0, 35); } },
      { id: 'snarel', name: 'Snaring Light', r: 3, icon: 'web', d: ['+ The light roots enemies for 1.2 s when they first step in', '+ and burns them (15 per second)'], m: P => { P.root = 1.2; P.burn += 15; } },
      { id: 'iriLamp', name: 'Iridescent Lamp', r: 4, icon: 'gem', d: ['+ You are the lantern: an 11 m light always around you that reveals, slows and burns (30/s)', '- You can no longer hang lanterns or walk between them'], m: P => { P.carried = true; P.radius = 11; P.burn = Math.max(P.burn, 30); } },
      { id: 'iriMoth', name: 'Iridescent Moth', r: 4, icon: 'moth', d: ['+ Every lantern breeds moths and sends one at an enemy in its light every 0.6 s', '+ Moths hit 50% harder'], m: P => { P.turret = 0.6; P.mothBoost = Math.max(P.mothBoost || 0, 1.5); } },
    ],
  },
  // ------------------------------------------------------------------------------------------------ MIRE
  mire: {
    key: 'mire', name: 'Mire', title: 'The Bogwitch', role: 'Ambusher', hp: 340, speed: 5.0,
    blurb: 'Something that lived at the bottom of a peat bog for a very long time. Lobs flasks of bubbling acid, then sinks into the ground and comes up under your feet.',
    look: { skin: 0x5a7a4a, main: 0x3a4a2a, second: 0x1e2416, cloth: 0x4a3a2a, metal: 0x7a6a4a, glow: 0x9aff5a },
    weapon: { name: "Brewer's Flasks", kind: 'proj', proj: 'flask', desc: "Throws flasks in an arc. They break into a pool of acid that damages anyone standing in it.", dmg: 30, head: 1.0, speed: 23, grav: 14, rof: 1.0, mag: 5, reload: 2.4, spread: 0.0, spreadMove: 0, splash: 30, splashR: 2.2, zone: [25, 2.5, 4], recoil: 0.03, sound: 'flask' },
    power: { name: 'Submerge', key: 'sub', desc: "Press to sink into the ground: you can't be hurt and you move fast, but you can't attack. Press again to burst out, launching nearby enemies into the air.",
      sink: 0.5, maxTime: 4, speed: 1.6, cd: 10, dmg: 60, radius: 3.5, knock: 9, rippleVis: 99, heal: 0, pool: 0, pull: false, root: 0, drown: 0, trail: 0, flaskRing: false, artillery: false, fen: false },
    util: { name: 'Leech', key: 'leech', cd: 15, desc: "For 3 seconds, steal 15 health per second from every enemy within 7 m." },
    ult: { name: 'Bog Tide', key: 'tide', desc: "Flood the ground around you with acid for 6 seconds. It burns and slows enemies standing in it." },
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
      { id: 'silt', name: 'Quick Silt', r: 1, icon: 'drop', d: ['+ Sink twice as fast', '+ Cooldown 2 s shorter'], m: P => { P.sink *= 0.5; P.cd -= 2; } },
      { id: 'under', name: 'Undertow', r: 2, icon: 'wave', d: ['+ The geyser pulls enemies in before it throws them', '+ Geyser 1 m wider'], m: P => { P.pull = true; P.radius += 1; } },
      { id: 'drownp', name: 'Drowning Pool', r: 3, icon: 'flask', d: ['+ Enemies standing over you drown (30 per second)', '+ The geyser leaves an acid pool (25 per second)'], m: P => { P.drown = Math.max(P.drown || 0, 30); P.pool = Math.max(P.pool || 0, 25); } },
      { id: 'mire', name: 'Sucking Mud', r: 3, icon: 'leaf', d: ['+ The geyser roots everyone it hits for 1.5 s', '+ and rings you with flasks'], m: P => { P.root = Math.max(P.root || 0, 1.5); P.flaskRing = true; } },
      { id: 'iriAbyss', name: 'Iridescent Abyss', r: 4, icon: 'gem', d: ['+ No time limit underground, and you heal 25 per second down there', '+ Throw flasks from below: they burst up out of the ground where you aim'], m: P => { P.artillery = true; P.maxTime = 999; P.heal = Math.max(P.heal, 25); } },
      { id: 'iriFen', name: 'Iridescent Fen', r: 4, icon: 'leaf', d: ['+ Your acid pools are 2.5× wider and last 3× longer', '+ Standing in your own acid heals you 20 per second', '+ Your geyser hits 50% harder'], m: P => { P.fen = true; P.dmg *= 1.5; } },
    ],
  },
  // ------------------------------------------------------------------------------------------------ SPINDLE
  spindle: {
    key: 'spindle', name: 'Spindle', title: 'The Puppeteer', role: 'Disruptor', hp: 290, speed: 5.4,
    blurb: 'A lanky marionette that cut its own strings and kept them. Stitches enemies in place with flung needles, and reels them in on a line they never see coming.',
    look: { skin: 0xd8c0a0, main: 0x7a1e2e, second: 0x221418, cloth: 0xe0d6c4, metal: 0xc0b8a8, glow: 0xff5a7a },
    weapon: { name: 'Thread Needles', kind: 'proj', proj: 'needle', desc: "Fires three needles at a time. Hit the same enemy with all three to freeze them in place for a moment (a Stitch).", dmg: 17, head: 1.6, speed: 85, grav: 0, rof: 0.72, mag: 18, reload: 1.9, spread: 0.006, spreadMove: 0.01, burst: 3, burstGap: 0.08, stitch: 0.8, recoil: 0.012, sound: 'needle' },
    power: { name: 'Marionette Line', key: 'line', desc: "Fire a string. If it hits an enemy, it pulls them to you and damages them.",
      speed: 60, range: 32, cd: 9, dmg: 25, pad: 0.35, charges: 1, stun: 0, vuln: 0, slow: 0, swap: false, choke: 0, multi: 1, gallows: false, puppet: 0, web: false, meet: false },
    util: { name: 'Grapple', key: 'grapple', cd: 10, desc: "Shoot a hook at any surface up to 28 m away and pull yourself to it." },
    ult: { name: "Cat's Cradle", key: 'cradle', desc: "Every enemy you can see within 22 m is tied down: stuck in place for 2.2 seconds and takes 40 damage." },
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
      { id: 'wax', name: 'Waxed Thread', r: 1, icon: 'thread', d: ['+ The line flies 40% faster and 6 m further'], m: P => { P.speed *= 1.4; P.range += 6; } },
      { id: 'noose', name: 'Hangman\'s Knot', r: 2, icon: 'chain', d: ['+ Caught enemies are hurled into the air', '+ and take 20 more damage'], m: P => { P.gallows = true; P.dmg += 20; } },
      { id: 'paw', name: 'Cat\'s Paw', r: 3, icon: 'spool', d: ['+ The line catches up to 3 enemies in a row', '+ Caught enemies are slowed for 2 s'], m: P => { P.multi = 3; P.slow = Math.max(P.slow || 0, 2); } },
      { id: 'strings', name: 'Puppet Strings', r: 3, icon: 'needle', d: ['+ A caught enemy becomes your puppet for 2.5 s: they walk where you look'], m: P => { P.puppet = 2.5; } },
      { id: 'iriWeb', name: 'Iridescent Web', r: 4, icon: 'web', d: ['+ The line becomes a 7 m net: everyone it catches is bound in place for 2.5 s', '+ One extra line'], m: P => { P.web = true; P.charges += 1; } },
      { id: 'iriSpindle', name: 'Iridescent Spindle', r: 4, icon: 'gem', d: ['+ The line drags you both together: you meet in the middle with a 100-damage collision', '+ Two stitched needles are enough to Stitch', '+ One extra line'], m: P => { P.meet = true; P.charges += 1; } },
    ],
  },
  sable: {
    key: 'sable', name: 'Sable', title: 'The Clockbreaker', role: 'Skirmisher', hp: 300, speed: 5.3,
    blurb: 'A thief of seconds with a cracked clock where a face should be. Dives into a fight, takes what it wants, and is three seconds ago before you can turn around.',
    look: { skin: 0xd8c8b0, main: 0x1e2a4a, second: 0x2a2a30, cloth: 0x3a2a1e, metal: 0xc89a4a, glow: 0xa8e8ff },
    weapon: { name: 'Second Hand', kind: 'proj', proj: 'hand', desc: "Fires two clock hands per shot. Each hit slows the enemy a little for a second.", dmg: 26, head: 1.7, speed: 75, grav: 0, rof: 0.6, mag: 12, reload: 1.9, spread: 0.004, spreadMove: 0.012, burst: 2, burstGap: 0.09, slow: [0.8, 1.0], recoil: 0.015, sound: 'hand' },
    power: { name: 'Rewind', key: 'rewind', desc: "Press to jump back to where you were 3 seconds ago. If you had more health then, you get it back.",
      back: 3, cd: 11, charges: 1, heal: true, bonus: 0, reload: false, silent: false, cleanse: false, decoy: 0, depart: 0, departR: 4, arrive: 0, arriveR: 3.5, sand: 0, paradox: false, retro: false, freeze: 0, freezeR: 6, anchor: 0 },
    util: { name: 'Overwind', key: 'haste', cd: 12, desc: "Move 40% faster for 3 seconds and instantly reload." },
    ult: { name: 'Stopped Time', key: 'stop', desc: "Freeze every enemy you can see within 20 m for 2.5 seconds. They also take 25% more damage for 4 seconds." },
    addons: [
      { id: 'oil', name: 'Oiled Gears', r: 0, icon: 'gear', d: ['+ Cooldown 1.5 s shorter'], m: P => { P.cd -= 1.5; } },
      { id: 'mainspring', name: 'Spare Mainspring', r: 0, icon: 'spring', d: ['+ Rewind reaches 1 s further back'], m: P => { P.back += 1; } },
      { id: 'locket', name: 'Tarnished Locket', r: 0, icon: 'ring', d: ['+ Rewinding reloads your weapon'], m: P => { P.reload = true; } },
      { id: 'crystal', name: 'Polished Crystal', r: 0, icon: 'gem', d: ['+ Rewinding also heals 30'], m: P => { P.bonus += 30; } },
      { id: 'chime', name: 'Silent Chime', r: 0, icon: 'bell', d: ['+ Rewinding makes no sound and leaves no trail for enemies to see'], m: P => { P.silent = true; } },
      { id: 'sundial', name: 'Pocket Sundial', r: 1, icon: 'star', d: ['+ Cooldown 3 s shorter', '- Rewind reaches 0.5 s less far back'], m: P => { P.cd -= 3; P.back -= 0.5; } },
      { id: 'escapement', name: 'Twin Escapement', r: 1, icon: 'twin', d: ['+ Two rewinds before the cooldown', '- Cooldown 2 s longer'], m: P => { P.charges = 2; P.cd += 2; } },
      { id: 'ash', name: 'Ash of the Hour', r: 1, icon: 'drop', d: ['+ Rewinding shakes off roots, slows, burns, bleeds, poison and blindness'], m: P => { P.cleanse = true; } },
      { id: 'echo', name: 'Brass Echo', r: 1, icon: 'mask', d: ['+ An echo of you stays behind where you left for 3 s'], m: P => { P.decoy = 3; } },
      { id: 'shatter', name: 'Shattered Crystal', r: 2, icon: 'shard', d: ['+ The moment you leave, the spot you left explodes: 70 damage within 4 m'], m: P => { P.depart = 70; } },
      { id: 'weight', name: 'Ticking Weight', r: 2, icon: 'fuse', d: ['+ You arrive with a blast: 50 damage within 3.5 m'], m: P => { P.arrive = 50; } },
      { id: 'sand', name: 'Hourglass Sand', r: 2, icon: 'vial', d: ['+ Enemies near the spot you left (5 m) are slowed by 50% for 3 s'], m: P => { P.sand = 3; } },
      { id: 'paradox', name: 'Paradox Engine', r: 3, icon: 'skull', d: ['+ While Rewind is ready, a killing blow rewinds you instead of killing you', '- Rewind reaches 1 s less far back'], m: P => { P.paradox = true; P.back -= 1; } },
      { id: 'retro', name: 'Retrograde', r: 3, icon: 'chain', d: ['+ The last enemy you hurt is rewound too: dragged back to where they stood when you were there'], m: P => { P.retro = true; } },
      { id: 'cog', name: 'Spare Cog', r: 1, icon: 'gear', d: ['+ Cooldown 2 s shorter', '+ Rewinding reloads your weapon'], m: P => { P.cd -= 2; P.reload = true; } },
      { id: 'echoch', name: 'Echo Chamber', r: 2, icon: 'mask', d: ['+ An echo of you stays behind for 4 s', '+ and bursts for 40 damage when you leave'], m: P => { P.decoy = 4; P.depart = Math.max(P.depart, 40); } },
      { id: 'shieldt', name: 'Temporal Shield', r: 3, icon: 'plate', d: ['+ Rewinding heals an extra 60', '+ and shakes off every bad status'], m: P => { P.bonus += 60; P.cleanse = true; } },
      { id: 'gear2', name: 'Grandfather Gear', r: 3, icon: 'clock', d: ['+ One extra rewind before the cooldown', '+ You arrive with a 60-damage blast'], m: P => { P.charges += 1; P.arrive = Math.max(P.arrive, 60); } },
      { id: 'iriAnchor', name: 'Ouroboros Anchor', r: 4, icon: 'coil', d: ['+ Press to drop an anchor. Press again within 25 s to return to it with the health and ammo you had then, plus 100 health'], m: P => { P.anchor = 25; P.bonus += 100; } },
      { id: 'iriStop', name: 'The Stopped Clock', r: 4, icon: 'clock', d: ['+ Arriving stops time around you: enemies within 10 m are frozen for 3 s'], m: P => { P.freeze = 3; P.freezeR = 10; } },
    ],
  },
  thane: {
    key: 'thane', name: 'Thane', title: 'The Stormcaller', role: 'Controller', hp: 300, speed: 5.2,
    blurb: 'A weather-witch in a salt-stiff oilskin, a lightning rod strapped to her back and a storm on a leash. Where she points, the sky answers.',
    look: { skin: 0xc8a888, main: 0x2a3a3e, second: 0x1a2226, cloth: 0xc8a24a, metal: 0x8a9aa8, glow: 0x8ad8ff },
    weapon: { name: 'Arc Caster', kind: 'arc', desc: 'Shoots a bolt of lightning that jumps from the enemy you hit to up to two more enemies close to them.', dmg: 32, head: 1.3, rof: 0.5, mag: 8, reload: 2.0, range: 32, jumps: 2, jumpR: 7, jumpMul: 0.7, spread: 0.004, spreadMove: 0.01, recoil: 0.02, sound: 'zap' },
    power: { name: 'Thunderhead', key: 'cloud', desc: 'Put a storm cloud where you aim. For 6 seconds it strikes the closest enemy under it with lightning every second.',
      charges: 1, cd: 13, dur: 6, every: 1.0, dmg: 45, radius: 6, chains: 0, multi: 1, stun: 0, slow: 0, reveal: 0, vuln: 0, follow: 0, rain: 0, refund: false, ride: false, perm: false, smite: 0 },
    util: { name: 'Bolt Step', key: 'boltstep', cd: 9, desc: 'Turn into lightning and dart 9 m forward, shocking enemies you pass through (30 damage).' },
    ult: { name: 'Tempest', key: 'tempest', desc: 'For 6 seconds, lightning strikes every enemy you can see within 18 m, again and again (35 damage each strike).' },
    addons: [
      { id: 'rod', name: 'Copper Rod', r: 0, icon: 'bolt', d: ['+ The cloud strikes from 1.5 m further out'], m: P => { P.radius += 1.5; } },
      { id: 'static', name: 'Static Charge', r: 0, icon: 'spring', d: ['+ Strikes come 20% more often'], m: P => { P.every *= 0.8; } },
      { id: 'squall', name: 'Long Squall', r: 0, icon: 'moon', d: ['+ The cloud lasts 2 s longer'], m: P => { P.dur += 2; } },
      { id: 'ozone', name: 'Ozone', r: 0, icon: 'drop', d: ['+ Cooldown 2 s shorter'], m: P => { P.cd -= 2; } },
      { id: 'clap', name: 'Thunderclap', r: 0, icon: 'bell', d: ['+ Anyone struck is shown to your team for 2 s'], m: P => { P.reveal = 2; } },
      { id: 'fork', name: 'Forked Bolt', r: 1, icon: 'twin', d: ['+ Every strike jumps to one more enemy nearby'], m: P => { P.chains += 1; } },
      { id: 'twincloud', name: 'Twin Clouds', r: 1, icon: 'twin', d: ['+ Two clouds before the cooldown', '- Cooldown 3 s longer'], m: P => { P.charges = 2; P.cd += 3; } },
      { id: 'rain', name: 'Driving Rain', r: 1, icon: 'wave', d: ['+ Enemies under the cloud are slowed by 30%'], m: P => { P.rain = 0.7; } },
      { id: 'heavy', name: 'Heavy Charge', r: 1, icon: 'plate', d: ['+ Strikes deal 20 more'], m: P => { P.dmg += 20; } },
      { id: 'wander', name: 'Wandering Storm', r: 1, icon: 'feather', d: ['+ The cloud drifts after the nearest enemy'], m: P => { P.follow = 3.5; } },
      { id: 'stunb', name: 'Stunning Bolt', r: 2, icon: 'star', d: ['+ Strikes stun for 0.5 s'], m: P => { P.stun = Math.max(P.stun, 0.5); } },
      { id: 'ball', name: 'Ball Lightning', r: 2, icon: 'ring', d: ['+ Each strike hits the two closest enemies'], m: P => { P.multi = Math.max(P.multi, 2); } },
      { id: 'cumulo', name: 'Cumulonimbus', r: 2, icon: 'moon', d: ['+ The cloud is 3 m wider and strikes 10 harder', '- Strikes come 20% less often'], m: P => { P.radius += 3; P.dmg += 10; P.every *= 1.2; } },
      { id: 'lrod', name: 'Lightning Rod', r: 2, icon: 'bolt', d: ['+ Every strike puts 2 rounds back in your Arc Caster'], m: P => { P.refund = true; } },
      { id: 'super', name: 'Supercharged', r: 3, icon: 'fuse', d: ['+ Strikes deal 60% more and come 20% more often'], m: P => { P.dmg *= 1.6; P.every *= 0.8; } },
      { id: 'chainst', name: 'Chain Storm', r: 3, icon: 'chain', d: ['+ Every strike jumps to two more enemies nearby'], m: P => { P.chains += 2; } },
      { id: 'electro', name: 'Electrocution', r: 3, icon: 'skull', d: ['+ Strikes stun for 1 s and leave the target Vulnerable (+25% damage taken) for 3 s'], m: P => { P.stun = Math.max(P.stun, 1); P.vuln = 3; } },
      { id: 'overcast', name: 'Overcast', r: 3, icon: 'moon', d: ['+ The cloud lasts 12 s', '+ and drifts after the nearest enemy'], m: P => { P.dur = Math.max(P.dur, 12); P.follow = Math.max(P.follow, 3); } },
      { id: 'iriSupercell', name: 'Iridescent Supercell', r: 4, icon: 'gem', d: ['+ The cloud is twice as wide and strikes three enemies every half second', '+ Every strike jumps to two more'], m: P => { P.radius *= 2; P.multi = 3; P.every = Math.min(P.every, 0.5); P.chains += 2; } },
      { id: 'iriEye', name: 'Iridescent Eye', r: 4, icon: 'eye', d: ['+ A storm rides above you forever, striking enemies within 9 m every 0.8 s for 50', '+ The power instead calls one huge bolt where you aim: 150 damage in 3 m (6 s cooldown)'], m: P => { P.perm = true; P.smite = 150; P.cd = 6; } },
    ],
  },
  orrin: {
    key: 'orrin', name: 'Orrin', title: 'The Starbinder', role: 'Controller', hp: 290, speed: 5.1,
    blurb: 'An astronomer who stared at the sky until it stared back. Fires charged lances of starlight and drops wells of gravity that drag whole teams together.',
    look: { skin: 0x8a6a5a, main: 0x2a1e4a, second: 0x14122a, cloth: 0xd8c890, metal: 0xd8b860, glow: 0xffa8f0 },
    weapon: { name: 'Star Lance', kind: 'lance', desc: 'Hold to charge, release to fire a beam of starlight that goes through every enemy in a line. A full charge (1.2 seconds) deals far more damage. You move slower while charging.', dmgMin: 30, dmgMax: 125, charge: 1.2, rof: 0.35, range: 90, head: 1.5, sound: 'lance' },
    power: { name: 'Gravity Well', key: 'well', desc: 'Throw a small star. Where it lands, it pulls nearby enemies toward the middle for 3 seconds.',
      charges: 1, cd: 12, radius: 7, pull: 6, dur: 3, speed: 24, dps: 0, slow: 0, reveal: 0, implode: 0, lift: false, push: false, horizon: 0, twin: false, exec: 0 },
    util: { name: 'Starstep', key: 'float', cd: 11, desc: 'Jump up and float slowly back down for 2.5 seconds.' },
    ult: { name: 'Meteor Shower', key: 'meteor', desc: 'Call down 12 meteors around the spot you aim at (up to 40 m away) over 3 seconds. Each deals 55 damage in a small blast.' },
    addons: [
      { id: 'lens', name: 'Polished Lens', r: 0, icon: 'eye', d: ['+ The well pulls from 1.5 m further out'], m: P => { P.radius += 1.5; } },
      { id: 'core', name: 'Heavy Core', r: 0, icon: 'stone', d: ['+ The well pulls 30% harder'], m: P => { P.pull *= 1.3; } },
      { id: 'night', name: 'Long Night', r: 0, icon: 'moon', d: ['+ The well lasts 1 s longer'], m: P => { P.dur += 1; } },
      { id: 'orbit', name: 'Quick Orbit', r: 0, icon: 'ring', d: ['+ Cooldown 2 s shorter'], m: P => { P.cd -= 2; } },
      { id: 'chart', name: 'Star Chart', r: 0, icon: 'star', d: ['+ Enemies caught in the well are shown to your team'], m: P => { P.reveal = 2; } },
      { id: 'crush', name: 'Crushing Weight', r: 1, icon: 'plate', d: ['+ The well deals 15 damage per second to enemies inside'], m: P => { P.dps += 15; } },
      { id: 'moons', name: 'Twin Moons', r: 1, icon: 'twin', d: ['+ Two wells before the cooldown', '- Cooldown 3 s longer'], m: P => { P.charges = 2; P.cd += 3; } },
      { id: 'vacuum', name: 'Cold Vacuum', r: 1, icon: 'drop', d: ['+ Enemies inside the well are slowed by 40%'], m: P => { P.slow = 0.6; } },
      { id: 'comet', name: 'Comet Tail', r: 1, icon: 'feather', d: ['+ You throw the star 60% further'], m: P => { P.speed *= 1.6; } },
      { id: 'collapse', name: 'Collapse', r: 2, icon: 'fuse', d: ['+ When the well ends it implodes: 80 damage to everyone near the middle'], m: P => { P.implode = 80; } },
      { id: 'weightless', name: 'Weightless', r: 2, icon: 'wing', d: ['+ Enemies inside the well float helplessly up off the ground'], m: P => { P.lift = true; } },
      { id: 'repulsor', name: 'Repulsor', r: 2, icon: 'wave', d: ['+ The well pushes enemies out instead of pulling them in', '+ It lasts 2 s longer'], m: P => { P.push = true; P.dur += 2; } },
      { id: 'horizon', name: 'Event Horizon', r: 3, icon: 'skull', d: ['+ Enemies dragged to the very middle take 60 damage per second'], m: P => { P.horizon = 60; } },
      { id: 'supermassive', name: 'Supermassive', r: 3, icon: 'gem', d: ['+ The well is 60% bigger and pulls 60% harder', '- Cooldown 4 s longer'], m: P => { P.radius *= 1.6; P.pull *= 1.6; P.cd += 4; } },
      { id: 'dust', name: 'Bright Dust', r: 1, icon: 'star', d: ['+ Enemies in the well are shown to your team for 3 s', '+ Throw 20% further'], m: P => { P.reveal = 3; P.speed *= 1.2; } },
      { id: 'glens', name: 'Gravity Lens', r: 2, icon: 'eye', d: ['+ The well is 2 m wider', '+ and slows enemies inside by 30%'], m: P => { P.radius += 2; P.slow = P.slow ? Math.min(P.slow, 0.7) : 0.7; } },
      { id: 'stellar', name: 'Stellar Collapse', r: 3, icon: 'fuse', d: ['+ When the well ends it implodes for 140', '+ and deals 10 per second while it lasts'], m: P => { P.implode = Math.max(P.implode, 140); P.dps += 10; } },
      { id: 'twinorb', name: 'Twin Orbits', r: 3, icon: 'twin', d: ['+ Two wells before the cooldown', '+ Each lasts 1 s longer'], m: P => { P.charges = Math.max(P.charges, 2); P.dur += 1; } },
      { id: 'iriBinary', name: 'Binary Star', r: 4, icon: 'twin', d: ['+ Every throw splits into two wells, side by side, 20% bigger', '+ A beam between them burns enemies who cross it (40 per second)', '+ The wells deal 20 damage per second'], m: P => { P.twin = true; P.radius *= 1.2; P.dps += 20; } },
      { id: 'iriHole', name: 'Black Hole', r: 4, icon: 'coil', d: ['+ The well lasts 6 s and pulls twice as hard', '+ Enemies who reach the middle below 40% health are destroyed', '- Cooldown 3 s longer'], m: P => { P.dur = 6; P.pull *= 2; P.exec = 0.4; P.cd += 3; } },
    ],
  },

};
const HERO_KEYS = Object.keys(HEROES);
for (const k of HERO_KEYS) { HEROES[k].glow = HEROES[k].look.glow; HEROES[k].addons.forEach((a, i) => { a.idx = i; a.hero = k; }); }

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
  // a roll on the drop table, for this hero; `min` forces at least that rarity (the pity guarantee)
  roll(hero, min = 0, luck = 1) {
    // the more you play a hero, the better the draws get (up to about double the odds of the top two rarities); harder enemies add luck
    const xp = Math.min(1, (Settings.played[hero] | 0) / 30), w = RARITY.map((R, i) => i < min ? 0 : R.drop * (i >= 3 ? (1 + xp) * luck : i === 2 ? Math.sqrt(luck) : i === 0 ? 1 - xp * 0.35 : 1)), sum = w.reduce((a, b) => a + b, 0);
    let x = Math.random() * sum, r = 0; for (; r < 4; r++) { x -= w[r]; if (x < 0) break; }
    const pool = HEROES[hero].addons.filter(a => a.r === r); return pick(pool).idx;
  },
  // every player has two of every Common and Uncommon for every hero (topped up once per hero)
  starter() {
    if (Settings.invV !== 2) { Settings.inv = {}; Settings.loadouts = {}; Settings.given = {}; Settings.invV = 2; }
    let changed = false;
    for (const k of HERO_KEYS) {
      if ((Settings.given[k] | 0) >= 3) continue; Settings.given[k] = 3; changed = true;
      const h = this.get(k);
      for (const a of HEROES[k].addons) if (a.r <= 1) h[a.idx] = Math.max(h[a.idx] | 0, 2);
    }
    if (changed) Settings.save();
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
  // pity counters: draws since the last Rare-or-better, Very-Rare-or-better and Iridescent, per hero
  PITY: [0, 0, 6, 18, 35],
  SHARD: [1, 2, 4, 8, 16],                 // prism shards each draw is also worth
  CRAFT: [6, 12, 25, 60, 140],             // and what it costs to craft one outright
  pity(hero) { const P = Settings.pity || (Settings.pity = {}); return P[hero] || (P[hero] = [0, 0, 0, 0, 0]); },
  // the end of a match. ctx: { result: 1 win / 0 draw / -1 loss, df: bot difficulty 0-3, margin: -1..1 how hard you won or lost, mvp }
  // more draws for harder enemies and for bigger wins; bonus draws for the day's first win and for streaks; any draw can come up double
  award(hero, ctx) {
    const { result, df = 1, margin = 0, mvp = false } = ctx, bonuses = [], today = new Date().toDateString();
    let n = result > 0 ? 4 : result === 0 ? 3 : 2;
    const dfB = (result > 0 ? [0, 1, 3, 5] : [0, 1, 2, 3])[clamp(df | 0, 0, 3)];
    if (dfB) { n += dfB; bonuses.push(`${BOT_DIFF[clamp(df | 0, 0, 3)].name} enemies +${dfB}`); }
    if (result > 0) {
      const m = Math.round(clamp(margin, 0, 1) * 4);
      if (m > 0) { n += m; bonuses.push(`${['', 'Clear', 'Decisive', 'Crushing', 'Flawless'][m]} win +${m}`); }
      Settings.streak = (Settings.streak | 0) + 1;
      if (Settings.firstWin !== today) { Settings.firstWin = today; n += 2; bonuses.push('First win of the day +2'); }
      if (Settings.streak >= 3) { const b = Math.min(3, Settings.streak - 2); n += b; bonuses.push(`${Settings.streak}-win streak +${b}`); }
    } else {
      Settings.streak = 0;
      if (margin > -0.15) { n += 1; bonuses.push('Close fight +1'); }
    }
    if (mvp) { n += 1; bonuses.push('Top of the board +1'); }
    const luck = [1, 1.15, 1.5, 2][clamp(df | 0, 0, 3)];
    const pity = this.pity(hero), draws = [];
    let shards = 0;
    for (let i = 0; i < n; i++) {
      for (let r = 2; r <= 4; r++) pity[r]++;
      let min = 0; for (let r = 4; r >= 2; r--) if (pity[r] >= this.PITY[r]) { min = r; break; }
      const idx = this.roll(hero, min, luck), r = HEROES[hero].addons[idx].r, dbl = Math.random() < 0.1;
      for (let q = 2; q <= r; q++) pity[q] = 0;
      this.add(hero, idx, dbl ? 2 : 1); shards += this.SHARD[r];
      draws.push({ idx, r, dbl, forced: min > 0 && r >= min });
    }
    Settings.shards = (Settings.shards | 0) + shards;
    Settings.played[hero] = (Settings.played[hero] | 0) + 1; Settings.save();
    const tokens = 1 + (result > 0 && margin >= 0.5 ? 1 : 0) + (df >= 3 ? 1 : 0);
    return { draws, bonuses, pity: pity.slice(), shards, tokens };
  },
  // spend prism shards to make one copy of any add-on
  craft(hero, idx) { const a = HEROES[hero].addons[idx], c = this.CRAFT[a.r]; if ((Settings.shards | 0) < c) return false; Settings.shards -= c; this.add(hero, idx, 1); return true; },
  // Overtune: gamble one copy of an add-on for a chance at a random add-on one rarity higher; failure shatters it into shards
  OVERTUNE: [0.7, 0.55, 0.4, 0.25],
  overtune(hero, idx) {
    const a = HEROES[hero].addons[idx]; if (a.r >= 4 || !this.take(hero, idx)) return null;
    if (Math.random() < this.OVERTUNE[a.r]) { const pool = HEROES[hero].addons.filter(x => x.r === a.r + 1), got = pick(pool).idx; this.add(hero, got, 1); return { ok: true, idx: got }; }
    const sh = this.SHARD[a.r] * 3; Settings.shards = (Settings.shards | 0) + sh; Settings.save(); return { ok: false, shards: sh };
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
const POWER_ICON = { snare: 'jaw', blink: 'shard', ram: 'piston', fade: 'mask', glaive: 'twin', lantern: 'lantern', sub: 'wave', line: 'spool', rewind: 'clock', well: 'gem', cloud: 'bolt' };
