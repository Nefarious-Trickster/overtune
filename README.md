# Overtune

A 3D hero shooter you play in the browser. Ten heroes, each with a weapon that plays nothing like the others and one signature **power** — and every power is tuned with **add-ons**, earned by playing and used up when you deploy, Dead by Daylight style.

**Play:** https://nefarious-trickster.github.io/overtune/

## Heroes

| Hero | Weapon | Power | Utility | Ultimate |
|---|---|---|---|---|
| **Marrow**, the Snarewright | Rattlejaw — a crank crossbow of heavy, dropping bolts | **Snares** — traps that root, wound and reveal | Field Dressing | Killing Field |
| **Lark**, the Rift Runner | Shardcaster — crystal shards that ricochet and hit harder each bounce | **Rift Step** — charge and chain blinks, then pay in fatigue | Slipstream | Unbound |
| **Gauge**, the Ramjet | Boiler — a flamethrower that overheats | **Ramjet** — rev up and charge; ram enemies, crash into walls | Bulwark | Earthshaker |
| **Veil**, the Phantom | Whisper Knives — lunging cuts, Backstabs from behind | **Fade** — go invisible, close in, open with an Ambush | Scry | Nightfall |
| **Ivra**, the Glaivewright | Tidecaller — a staff that latches a draining beam | **Glaives** — wind up and throw arcing glaives | Updraft | Glaive Storm |
| **Wick**, the Lamplighter | Moth Swarm — slow homing moths | **Lanterns** — light that reveals and slows; walk between them | Wax Shell | Flare |
| **Mire**, the Bog Witch | Brewer's Flasks — lobbed acid pools | **Submerge** — sink, move unseen, erupt in a geyser | Leech | Bog Tide |
| **Spindle**, the Puppeteer | Thread Needles — bursts that Stitch enemies in place | **Marionette Line** — hook and reel enemies in | Grapple | Cat's Cradle |
| **Orrin**, the Starbinder | Star Lance — hold to charge a beam that pierces everyone in a line | **Gravity Well** — throw a star that drags enemies to its centre | Starstep | Meteor Shower |
| **Sable**, the Clockbreaker | Second Hand — clock hands fired in pairs that slow what they hit | **Rewind** — snap back 3 s to where you were, with the health you had | Overwind | Stopped Time |

## Add-ons

Every hero has 16 add-ons in five rarities. Commons are clean upgrades; the higher you go the more they change the power — Very Rare and Iridescent add-ons rewrite how it works entirely, usually at a price.

- **You earn them by playing.** Finish a match (longer than 45 s) and you open a cache for the hero you ended on: **5 draws for a win, 3 for a draw, 2 for a loss**, plus **+2 for your first win of the day** and **+1 to +3 for a win streak**. Cards are turned one at a time; rare ones hum before you flip them.
- **Pity:** a Rare or better is guaranteed at least every 10 draws, Very Rare or better every 30, Iridescent every 60 (per hero). Any draw has an 8% chance to come up double. The more matches you've played as a hero, the better that hero's odds.
- **Everyone starts with two of every Common and Uncommon** for every hero.
- **They stack.** You can own several of the same add-on.
- **Slotting one uses it up** when the match starts (respawns and later rounds of the same match are free).
- Your collection is saved in your browser.

## Modes and maps

Team Deathmatch · Control · Elimination (no respawns, first to 3 rounds) · Free-for-All — on five maps:

- **Kiln Yard** — a foundry district at dusk: a casting hall with a mezzanine, a rail siding, a raised crucible.
- **Verdance** — a jungle temple: terraces, a ruined hall, a sun ziggurat, a sunken garden.
- **Neon Quay** — a container port in the rain: two-high stacks with bridges, a harbour office, a fish market.
- **Hollowmere** — a stilt village in a drowned forest: boardwalks, huts, a sunken barge, the Hollow Tree.
- **Frostwatch** — a mountain observatory in the snow: the dome on its plateau, a ridge and bridge, an antenna perch, a frozen tarn.

## Playing with friends

Choose **Play Online → Host a match**, then send your friend the 4-letter code or the invite link. Players connect directly to each other; free public MQTT brokers are only used to find one another (and to relay for anyone who can't connect directly). Empty spots are filled with bots. No sign-in needed.

## Controls

WASD move · mouse aim · left click fire · **right click / E power** · Shift utility · Q ultimate · Space jump · R reload · Tab scoreboard · Esc pause (change hero and add-ons there).
