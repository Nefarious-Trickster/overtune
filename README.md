# Overtune

A 3D hero shooter you play in the browser. Thirteen heroes, each with a weapon that plays nothing like the others and one signature **power** — and every power is tuned with **add-ons**, earned by playing and used up when you deploy, Dead by Daylight style.

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
| **Thane**, the Stormcaller | Arc Caster — lightning that jumps to a second enemy | **Thunderhead** — a storm cloud that strikes enemies beneath it | Bolt Step | Tempest |
| **Orrin**, the Starbinder | Star Lance — hold to charge a beam that pierces everyone in a line | **Gravity Well** — throw a star that drags enemies to its centre | Starstep | Meteor Shower |
| **Bjorn**, the Skinchanger | Hand Axes — spinning axes thrown in an arc | **Bearform** — become a bear: bigger, faster, armored, clawing | War Cry | Stampede |
| **Ossian**, the Gravecaller | Sinew Crossbow — bone bolts two at a time | **Raise Dead** — skeletons that hunt and claw your enemies | Bone Ward | Army of the Grave |
| **Sable**, the Clockbreaker | Second Hand — clock hands fired in pairs that slow what they hit | **Rewind** — snap back 3 s to where you were, with the health you had | Overwind | Stopped Time |

## Models

The heroes are built from [KayKit](https://kaylousberg.com)'s free (CC0) Adventurers and Skeletons character packs by Kay Lousberg, with KayKit's animation set. Each hero gets its own body, recoloured texture, hat or helmet, weapons from the packs and props of its own, and a team-coloured rim so friend and foe read at a glance. If the models can't load, the game falls back to its older hand-built heroes.

The maps have a bright, toy-box look to match: candy-coloured surfaces with soft rounded edges, puffy clouds, floating islands on the horizon and bunting over the walls. Trees, rocks, clouds, hills and the little towns around the arenas come from KayKit's CC0 Medieval Hexagon, Halloween Bits, City Builder Bits and Prototype Bits packs. Effects are cartoon too: explosions are popping puff-balls, hits flash little stars, and knockouts burst into confetti.

## Add-ons

Every hero has 20 add-ons (260 in all) in five rarities. Commons are clean upgrades; the higher you go the more they change the power. The two **Iridescent** add-ons per hero aren't bigger numbers — each one rewrites how the power works and comes with a real price: Marrow's snares become mines, Gauge carries enemies on his charge and crushes them into walls, Ivra's glaives become sawblades, Thane's cloud stores lightning to drop all at once, Orrin becomes the gravity well himself, Sable stops time instead of rewinding, and so on.

- **You earn them by playing.** Finish a match (longer than 45 s) and you crack open a cache for the hero you ended on. A win is worth 4 draws, a draw 3, a loss 2 — plus more for harder enemies (up to +5 on Overtuned), for how hard you won (up to +4 for a flawless win), +1 for topping the scoreboard, +1 for a close loss, +2 for your first win of the day and up to +3 for a win streak. Harder enemies also make rare draws more likely.
- **The cache:** strike the prism three times — hit it as the ring closes for a Perfect (+3 shards each, and an extra Overtune token for three in a row); from the second crack its glow gives away the best thing inside. The cards fly out of the broken prism; turn them one by one (or press Space) — rare ones hum and leak their colour before they flip, and big pulls get a banner. Then spend Overtune tokens to gamble a card up a rarity: it flickers between the two like a slowing wheel, then climbs or shatters into shards.
- **Prism shards:** every add-on you draw is also worth shards; spend them in the loadout to craft exactly the add-on you want.
- **Pity:** a Rare or better is guaranteed at least every 6 draws, Very Rare or better every 18, Iridescent every 35 (per hero). Any draw has a 10% chance to come up double.
- **Everyone starts with two of every Common and Uncommon** for every hero.
- **They stack.** You can own several of the same add-on.
- **Slotting one uses it up** when the match starts (respawns and later rounds of the same match are free).
- Your collection is saved in your browser.

## Modes and maps

Team Deathmatch · Control · Elimination (no respawns, first to 3 rounds) · Free-for-All — against bots at four difficulties — Recruit, Veteran, Elite and Overtuned. Harder bots react faster, aim better (and for the head), lead moving targets, hit harder, charge their ultimates faster, dodge when you line up a shot and hunt human players; Elite and Overtuned bots also have extra health, and Overtuned bots see all the way around them; on **Overtuned**, every bot also brings both of its hero's Iridescent add-ons — on five maps:

- **Kiln Yard** — a foundry district at dusk: a casting hall with a mezzanine, a rail siding, a raised crucible.
- **Verdance** — a jungle temple: terraces, a ruined hall, a sun ziggurat, a sunken garden.
- **Neon Quay** — a container port in the rain: two-high stacks with bridges, a harbour office, a fish market.
- **Hollowmere** — a stilt village in a drowned forest: boardwalks, huts, a sunken barge, the Hollow Tree.
- **Frostwatch** — a mountain observatory in the snow: the dome on its plateau, a ridge and bridge, an antenna perch, a frozen tarn.

## Playing with friends

Choose **Play Online → Host a match**, then send your friend the 4-letter code or the invite link. Players connect directly to each other; free public MQTT brokers are only used to find one another (and to relay for anyone who can't connect directly). Empty spots are filled with bots. No sign-in needed.

## Controls

WASD move · mouse aim · left click fire · **right click / E power** · Shift utility · Q ultimate · Space jump · R reload · Tab scoreboard · Esc pause (change hero and add-ons there).
