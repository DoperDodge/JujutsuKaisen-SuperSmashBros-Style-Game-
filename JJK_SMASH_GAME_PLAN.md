# Jujutsu Kaisen: Domain Clash — Game Design Document
## A Smash Bros-Style Platform Fighter Built with Claude Code

---

## 1. Project Overview

**Title:** Jujutsu Kaisen: Domain Clash  
**Genre:** 2D Platform Fighter (Super Smash Bros style)  
**Art Style:** 128-bit pixel art (high detail sprites, 64x64 to 128x128 character frames)  
**Target FPS:** Locked 60fps (game logic and rendering both tick at 60fps)  
**Multiplayer:** Online via WebSocket server hosted on Railway  
**Tech Stack:** HTML5 Canvas + JavaScript client, Node.js/Express + ws WebSocket server  
**Roster at Launch:** 4 characters (Gojo, Yuji/Sukuna swap, Mahito, Todo)

---

## 2. Technical Architecture

### 2.1 Project Structure

```
jjk-domain-clash/
├── client/
│   ├── index.html
│   ├── src/
│   │   ├── main.js              # Entry point, 60fps game loop
│   │   ├── engine/
│   │   │   ├── GameLoop.js       # requestAnimationFrame locked to 60fps
│   │   │   ├── InputManager.js   # Keyboard/gamepad input buffering
│   │   │   ├── Physics.js        # Gravity, knockback, platform collision
│   │   │   ├── Camera.js         # Dynamic camera tracking both players
│   │   │   └── ParticleSystem.js # VFX for cursed energy, domain effects
│   │   ├── fighters/
│   │   │   ├── Fighter.js        # Base fighter class (shared mechanics)
│   │   │   ├── Gojo.js
│   │   │   ├── YujiSukuna.js     # Swap character (Pyra/Mythra style)
│   │   │   ├── Mahito.js
│   │   │   └── Todo.js
│   │   ├── stages/
│   │   │   ├── Stage.js          # Base stage class
│   │   │   ├── JujutsuHigh.js
│   │   │   ├── Shibuya.js
│   │   │   └── ShibuyaStation.js
│   │   ├── systems/
│   │   │   ├── DomainExpansion.js # Domain ultimate system
│   │   │   ├── CursedEnergy.js   # CE meter + management
│   │   │   ├── DamageSystem.js   # Percent-based knockback (Smash style)
│   │   │   └── BlackFlash.js     # Frame-perfect input mechanic
│   │   ├── rendering/
│   │   │   ├── SpriteSheet.js    # Sprite atlas loader
│   │   │   ├── Renderer.js       # Canvas 2D rendering pipeline
│   │   │   ├── UIRenderer.js     # HUD, meters, percentages
│   │   │   └── DomainRenderer.js # Full-screen domain expansion visuals
│   │   ├── net/
│   │   │   ├── NetClient.js      # WebSocket client + input sync
│   │   │   ├── Rollback.js       # Rollback netcode (input delay + rollback)
│   │   │   └── Lobby.js          # Room creation/joining
│   │   └── assets/
│   │       ├── sprites/          # All character spritesheets (PNG)
│   │       ├── stages/           # Stage background tilesets
│   │       ├── ui/               # HUD elements, cursed energy bars
│   │       ├── vfx/              # Particle sprites
│   │       └── audio/            # SFX + music
│   └── public/
│       └── index.html
├── server/
│   ├── index.js                  # Express + WebSocket server entry
│   ├── GameRoom.js               # Room state, player management
│   ├── AuthoritativeState.js     # Server-side game state validation
│   ├── Matchmaking.js            # Simple queue-based matchmaking
│   └── package.json
├── shared/
│   ├── Constants.js              # Frame data, hitbox sizes, gravity values
│   ├── InputCodes.js             # Shared input enum
│   └── FighterData.js            # Shared frame data for all characters
├── tools/
│   ├── sprite-packer.js          # Pack individual frames into spritesheets
│   └── hitbox-editor.html        # Visual hitbox editor tool
├── railway.json
├── Dockerfile
└── package.json
```

### 2.2 Game Loop (60fps Lock)

```
TARGET_FRAME_TIME = 1000 / 60  (16.667ms)

loop():
  currentTime = performance.now()
  delta = currentTime - lastTime

  // Fixed timestep accumulator
  accumulator += delta
  while accumulator >= TARGET_FRAME_TIME:
    processInput()
    updatePhysics()
    updateFighters()
    updateParticles()
    checkDomainState()
    accumulator -= TARGET_FRAME_TIME
    tick++

  render(interpolation = accumulator / TARGET_FRAME_TIME)
  lastTime = currentTime
  requestAnimationFrame(loop)
```

All game logic runs at exactly 60 ticks per second. Rendering interpolates between states for smoothness. Frame data for every move is defined in 60fps frames (e.g., a move with 5 frames of startup = 5/60ths of a second).

### 2.3 Core Fighting Mechanics (Smash Bros Style)

**Damage System:** Percentage-based. Higher % = further knockback. KO by ringing out of stage boundaries.

**Universal Inputs per Character:**
| Input | Action |
|---|---|
| A (ground) | Jab / Tilt attacks |
| A + direction | Forward/Up/Down tilt |
| Smash A (tap direction + A) | Smash attacks (chargeable) |
| B | Neutral Special |
| B + direction | Side/Up/Down Special |
| Shield | Block (depleting shield bar) |
| Shield + direction | Dodge / Airdodge |
| Grab | Grab + throw directions |
| Taunt | Character-specific taunt |
| Domain Input (L+R+B simultaneously) | Domain Expansion (when meter full) |

**Shared Mechanic — Cursed Energy Meter:**
Every character has a Cursed Energy (CE) meter that slowly regenerates. Special moves consume CE. Some characters use CE differently (Gojo's Infinity passively drains CE, Mahito's shapeshifts cost CE, etc.). CE meter is separate from the Domain meter.

**Shared Mechanic — Domain Expansion Meter:**
A separate bar that fills very slowly over time (roughly 2% per second passively) and fills faster when landing attacks (roughly 1% per hit landed, 3% per smash attack landed, 5% per special that connects). At 100%, the player can activate their Domain Expansion ultimate. After use, the meter resets to 0 and cannot be filled again for 15 seconds.

---

## 3. Character Designs — Pixel Art Direction

**Resolution:** 128-bit style. Characters are drawn at 64x64 pixel base with 2x upscale rendering, giving a rich pixel art look with enough detail for anime-accurate designs.

**Palette:** Each character gets a signature 16-color palette inspired by their anime appearance.

### Character Visual References

**Gojo Satoru:** Tall, lean frame. White spiky hair. Black blindfold (removes during Domain). Dark blue uniform with high collar. Signature Infinity shimmer effect (translucent pixel distortion around his body). When using techniques, Six Eyes glow bright blue beneath/around the blindfold.

**Yuji Itadori:** Average build, muscular. Pink/salmon spiky hair with undercut. Tokyo Jujutsu High uniform (dark blue jacket, hood). Cursed energy aura is golden/orange. When swapping to Sukuna, markings appear on face and body, eyes change, four arms manifest, color palette shifts to dark purple/red/black. Transition animation shows the markings spreading across the body.

**Mahito:** Lean, human-like with stitched/patchwork skin. Blue-gray hair, mismatched eyes. Casual clothing. Body morphs visually during special attacks (arms become blades, clubs, spikes). True form (Instant Spirit Body of Distorted Killing) activates during Domain, making him bulkier and monstrous with black tendrils.

**Aoi Todo:** Massive, muscular build (largest character sprite). Brown hair, scar on face. Kyoto Jujutsu High uniform (lighter color). Clapping animation is key (both hands come together with a flash). Vibraslap prosthetic on left hand shown with metallic pixel detail.

---

## 4. Character Movesets

### 4.1 GOJO SATORU — "The Strongest"

**Playstyle:** Zoning / Spacing / Pressure. Gojo excels at controlling space. His Infinity passive makes him extremely difficult to approach, but it drains CE. His kit revolves around keeping opponents at mid-range with Blue/Red and punishing approaches.

**Passive — Infinity:**  
While CE is above 25%, Gojo has a passive barrier. Any attack that would connect within melee range (close hitbox) has its damage reduced by 60% and knockback reduced by 40%. A pixel-distortion shimmer effect appears around Gojo. Infinity is automatically disabled when CE drops below 25% and reactivates when CE rises above 40%. Infinity does NOT block projectiles from Domain Expansion guaranteed hits.

**Neutral A / Jabs:**  
Standard close-range strikes. Gojo fights with refined martial arts. 3-hit jab combo ending in a palm strike that pushes opponents back slightly.

**Forward Tilt:** A swift kick with decent range.  
**Up Tilt:** Upward palm strike (anti-air).  
**Down Tilt:** Low sweeping kick.

**Forward Smash:** Charged palm thrust channeling cursed energy. High knockback.  
**Up Smash:** Upward Infinity burst (distortion wave above Gojo).  
**Down Smash:** Slams both palms down creating a shockwave of compressed space on both sides.

**Neutral Special — Cursed Technique Lapse: Blue (B):**  
Gojo generates a blue sphere of attraction at a target point (ranges about 1/3 of the stage ahead). The sphere persists for ~1 second (60 frames), pulling nearby opponents toward it. Low damage (8%), but disrupts positioning and combos into follow-ups. CE Cost: 15%.

**Side Special — Cursed Technique Reversal: Red (Side+B):**  
Gojo fires a red orb of repulsion forward. It travels in a straight line and explodes on contact with a fighter or after traveling max range. Deals 14% damage with strong knockback (kill move at high %). Slower startup than Blue (18 frames). CE Cost: 20%.

**Up Special — Blue Boost (Up+B):**  
Gojo uses Blue's attraction on himself to launch rapidly in a chosen direction (functions as recovery). Can be angled. Small hitbox at the start that pops opponents. CE Cost: 10%.

**Down Special — Infinity Amplification (Down+B):**  
Gojo expands his Infinity outward as a dome for 30 frames (0.5 seconds). Any opponent caught in the dome is slowly crushed inward and takes 5% damage with a slight stun. Acts as a counter/parry move. If timed within 5 frames of an attack connecting, reflects projectiles. CE Cost: 18%.

**Aerial Normals:**  
Neutral Air: Spinning palm strike around Gojo.  
Forward Air: Horizontal chop with cursed energy trail.  
Back Air: Reverse kick (fast and strong).  
Up Air: Upward finger point with a small Blue sphere.  
Down Air: Downward palm strike (meteor smash, spikes opponents downward).

**Grab & Throws:**  
Gojo grabs with one hand casually. Forward throw tosses with a Red burst. Back throw spins and releases. Up throw launches with a small Blue pull upward. Down throw slams down with Infinity pressure.

**Domain Expansion — Unlimited Void (L+R+B):**  
**Activation:** Gojo removes his blindfold (Six Eyes flash brilliantly). A massive barrier sphere expands from Gojo (covers roughly 40% of the stage). Cinematic zoom-in on Gojo's eyes.

**Effect:** The stage transforms into the Infinite Void: a featureless cosmic void with a bright white center and flowing streams of information/data (pixel-art streams of kanji/symbols flowing in all directions). Any opponent caught inside is bombarded with infinite information. Mechanically, opponents inside are stunned and take continuous damage (3% per second for 5 seconds = 15% total). They cannot move, attack, or shield during the stun. After the 5-second duration, the domain collapses and opponents are launched with moderate knockback. Gojo can act freely inside his domain during the stun duration.

**Visual:** Background becomes an endless cosmic void. Opponents have glowing information streams flowing into their heads. Gojo stands casually in the center.

---

### 4.2 YUJI ITADORI / RYOMEN SUKUNA — "Vessel & King"

**Playstyle:** Yuji is a rushdown brawler with incredible speed and combo potential. Sukuna is a more deliberate, devastating slash-based fighter with range and kill power. The player can swap between them mid-fight (like Pyra/Mythra in Smash Ultimate).

**Swap Mechanic (Down Special for both):**  
Pressing Down+B triggers a swap. Yuji's body flashes, Sukuna's markings either appear or fade, and the moveset changes entirely within 20 frames. Brief invincibility during the swap (frames 5-15). The swap shares a cooldown of 5 seconds. Both forms share the same damage percentage and Domain meter but have separate CE pools (Yuji: max 100 CE, Sukuna: max 120 CE). When one swaps out, their CE slowly regenerates in the background at 50% normal rate.

### YUJI MODE

**Passive — Superhuman Physique:**  
Yuji has the fastest run speed and jump height in the game. His attacks come out 2 frames faster than average. He is a combo monster.

**Neutral A / Jabs:** Rapid 5-hit combo of punches and kicks ending with a straight right. Based on his martial arts training. Fast startup (3 frames).

**Forward Tilt:** Hook punch with cursed energy.  
**Up Tilt:** Rising uppercut.  
**Down Tilt:** Low sweep.

**Forward Smash — Divergent Fist:**  
Yuji's signature. A charged straight punch that has a DELAYED second impact of cursed energy hitting 8 frames after the initial hit. The first hit does 10%, the delayed cursed energy burst does 8% more. The second hit has different knockback angle (slightly upward), making DI difficult. Total: 18% fully charged.

**Up Smash:** Rising double-fisted uppercut.  
**Down Smash:** Spinning low kick hitting both sides.

**Neutral Special — Black Flash (B):**  
Yuji charges briefly (12 frame window), then unleashes a devastating punch. If the B button is pressed again within a 3-frame window at the moment of impact (frame-perfect timing), Black Flash activates: the screen distorts with black sparks, damage is multiplied by 2.5x (base 10% becomes 25%). Without perfect timing, it's just a strong punch (10%). Missing the timing window entirely causes extra endlag (punish window). Successful Black Flash also fills 8% of the Domain meter. CE Cost: 12%.

**Side Special — Manji Kick (Side+B):**  
A rushing roundhouse kick that covers distance. Good approach tool. 11% damage. Can be used to extend combos. CE Cost: 8%.

**Up Special — Cursed Energy Leap (Up+B):**  
Yuji launches upward with a cursed-energy-propelled jump. Small hitbox at the peak. Primarily recovery. CE Cost: 5%.

**Down Special — Swap to Sukuna (Down+B):**  
Swaps to Sukuna form. See swap mechanic above.

**Aerial Normals:**  
All fast and combo-friendly. Nair is a sex kick. Fair is a forward punch. Bair is a reverse elbow. Uair is a flip kick. Dair is a downward stomp (weak spike).

**Grab & Throws:**  
Brawler-style grabs. Forward throw is a headbutt launch. Down throw is a ground slam that bounces opponent for combo follow-ups.

### SUKUNA MODE

**Passive — King of Curses:**  
Sukuna's attacks deal 15% more damage than average but he is slightly slower in movement. His slashing attacks have disjointed hitboxes (reach beyond his body like a sword character). Sukuna's idle animation shows four arms (two extra ghostly arms behind him for visual flair, used in smash attacks).

**Neutral A / Jabs:** Three-hit slash combo with invisible blades. Each hit creates a visible slash line in the air.

**Forward Tilt — Dismantle:**  
A quick invisible slash projectile that travels about 1/4 of the stage. Low damage (7%) but fast and spammable. Think of it like a quick energy blade. CE Cost: 3% per use.

**Up Tilt:** Upward cleaving slash.  
**Down Tilt:** Low sweeping slash at the ground.

**Forward Smash — Cleave:**  
Sukuna charges a powerful adaptive slash. The damage of Cleave scales with the opponent's current damage percentage: at 0% it deals 12%, at 100% it deals 20%. This mirrors the anime where Cleave adjusts its cutting power based on the target's toughness/cursed energy. Incredible kill potential at high percentages.

**Up Smash:** All four arms slash upward simultaneously (wide hitbox above).  
**Down Smash:** Slashes in a circle around him at ground level.

**Neutral Special — Dismantle Barrage (B):**  
Sukuna sends out 5 rapid invisible slashes in a fan pattern ahead of him. Each deals 4% (20% total if all connect). Wide coverage but each individual slash is narrow. CE Cost: 20%.

**Side Special — World Cutting Slash (Side+B):**  
A charged, screen-length slash. Sukuna draws back, then releases an invisible blade that crosses the entire stage horizontally. Slow startup (30 frames) but devastating (22% damage, strong knockback). Highly telegraphed but powerful. Can be shielded. CE Cost: 25%.

**Up Special — Cursed Flame Jump (Up+B):**  
Sukuna launches upward surrounded by cursed flame (based on his fire techniques). Deals 9% on hit. CE Cost: 10%.

**Down Special — Swap to Yuji (Down+B):**  
Swaps back to Yuji form.

**Aerial Normals:**  
Slower but more powerful than Yuji. Nair is a multi-slash spin. Fair is a forward Dismantle slash (disjointed). Bair is a powerful reverse slash. Uair is an upward spear of invisible blades. Dair is a plunging slash (strong spike).

**Grab & Throws:**  
Sukuna grabs with contempt. Forward throw slashes the opponent away. Up throw launches with an upward Cleave. Down throw slams and slashes along the ground.

**Domain Expansion — Malevolent Shrine (L+R+B):**  
Can be activated in EITHER Yuji or Sukuna form (but always uses Sukuna's domain). If activated as Yuji, he automatically swaps to Sukuna first (brief cinematic of Sukuna taking over).

**Activation:** Sukuna performs the shrine hand sign. A massive demonic Buddhist shrine materializes behind him, adorned with ox skulls and horns. Unlike other domains, Malevolent Shrine has NO barrier (true to the anime). The entire stage becomes the domain's area.

**Effect:** For 6 seconds, the ENTIRE stage is filled with autonomous invisible slashes (Cleave and Dismantle). All opponents take continuous slash damage: 4% per second to fighters (Cleave, adjusted to their current %) and stage platforms begin visually crumbling (Dismantle on inanimate objects). Total potential: ~24% damage. Opponents can still move and fight during the domain, but the slashes cause constant hitstun interruptions every 30 frames (flinching, disrupting combos and approaches). Sukuna can also attack normally during this time.

**Visual:** The stage background transforms into a hellish shrine landscape with a massive grotesque Buddhist temple. Red slash lines constantly appear across the screen. Ox skull decorations border the stage. The sky turns blood red.

---

### 4.3 MAHITO — "The Cursed Spirit"

**Playstyle:** Tricky / Shape-shifter / Setup. Mahito is an unorthodox fighter whose body morphs with every attack, giving his moves wildly different hitbox shapes. He is unpredictable and excels at mix-ups and reads. His Idle Transfiguration passive punishes opponents who let him touch them.

**Passive — Idle Transfiguration (Soul Touch):**  
When Mahito grabs an opponent or lands a special move that involves direct contact (marked with a hand icon in his moveset), a "Soul Corruption" stack is applied to the opponent. At 3 stacks, the opponent's movement speed is reduced by 20% for 5 seconds and their model visually distorts slightly. At 5 stacks, the opponent takes an additional 10% burst damage and is briefly stunned (30 frames). Stacks decay: 1 stack removed every 8 seconds. This incentivizes Mahito to keep touching opponents and punishes passive play against him.

**Neutral A / Jabs:**  
Mahito attacks with rapidly morphing limbs. His jab combo changes visually each time (blade hand, club fist, spiked arm), but frame data stays consistent. 4-hit combo.

**Forward Tilt — Blade Arm:**  
Mahito extends his arm into a long blade shape. Good range, 9% damage.

**Up Tilt — Spike Launch:**  
Arm becomes a spike launching upward. Anti-air.

**Down Tilt — Tendril Sweep:**  
Arm extends along the ground as a tendril. Long range low poke.

**Forward Smash — Body Slam Morph:**  
Mahito's torso expands into a massive club and slams forward. Slow but devastating. 19% damage.

**Up Smash — Spike Crown:**  
Spikes erupt from Mahito's back upward. Wide hitbox.

**Down Smash — Ground Spike Net:**  
Mahito's body expands into a spiked net along the ground on both sides. Catches rolls.

**Neutral Special — Soul Touch (B):** (Applies Soul Corruption)  
Mahito lunges forward with both hands extended. Short range but fast (8 frames startup). If it connects, it deals 6% damage and applies 1 Soul Corruption stack. Can be comboed into from jabs. CE Cost: 10%.

**Side Special — Polymorphic Soul Isomer (Side+B):**  
Mahito throws a small Transfigured Human forward as a projectile. The creature shambles forward along the ground for about 2 seconds before disappearing. It has its own hitbox (5% damage on contact). Acts as stage control. Max 2 on screen. CE Cost: 12%.

**Up Special — Wing Morph (Up+B):**  
Mahito transfigures his back into wings and launches upward diagonally. Can be angled. Decent recovery with a hitbox on the wings (8%). CE Cost: 8%.

**Down Special — Body Disfigure (Down+B):** (Applies Soul Corruption)  
A command grab. Mahito grabs the opponent and briefly transfigures their body. Deals 10% damage and applies 2 Soul Corruption stacks. Slow startup (15 frames), highly punishable if whiffed. Unblockable (it's a grab). CE Cost: 15%.

**Aerial Normals:**  
All feature morphing body parts. Nair morphs his body into a spiked ball. Fair extends arm into a drill. Bair grows a tail and whips backward. Uair extends spikes upward from back. Dair morphs legs into a heavy stone block (powerful spike but slow).

**Grab & Throws:** (Regular grab applies 1 Soul Corruption)  
Mahito grabs with both hands (soul touch). Forward throw morphs and launches. Back throw wraps body around opponent and flings. Up throw tosses with a spike growth. Down throw pins and touches the soul (applies 2 stacks, low damage but high stack generation).

**Domain Expansion — Self-Embodiment of Perfection (L+R+B):**  
**Activation:** Mahito's true form begins to emerge. A dark sphere expands from him covering about 35% of the stage.

**Effect:** The environment transforms into a dark void where massive hands form a floral net pattern (true to anime). Any opponent inside the domain instantly receives 5 Soul Corruption stacks (regardless of current count) and takes 12% initial damage. For the 4-second duration, Mahito's Idle Transfiguration is enhanced: all of his attacks apply double Soul Corruption stacks and his specials have 50% reduced CE cost. When the domain ends, all Soul Corruption stacks on opponents trigger simultaneously, dealing 3% per stack as burst damage.

**Visual:** The screen becomes a dark void with giant translucent hands woven into patterns surrounding the fighters. Mahito's body glows with cursed energy. An eerie ambient sound plays (the soul's frequency).

---

### 4.4 AOI TODO — "The Best Friend"

**Playstyle:** Grappler / Disruptor / Team-combo specialist. Todo is the heaviest and most physically powerful character. His Boogie Woogie lets him teleport-swap positions, creating confusion. He is a high-execution character that rewards reads and creative swaps. Though he has no Domain Expansion in the anime, his "ultimate" is a powered-up Boogie Woogie state inspired by his Vibraslap return.

**Passive — Battle Intellect:**  
Todo's shield recovers 25% faster than other characters. After successfully landing 3 consecutive attacks (within a 2-second window), Todo enters a "zone" state for 3 seconds where his next attack gains 1.3x knockback. This represents his tactical brilliance and ability to read opponents.

**Neutral A / Jabs:**  
Devastating brawler combo. 3-hit with punches ending in a palm strike. Each hit deals more damage than average jabs (3%, 4%, 6% = 13% total for full jab). Slow startup (5 frames, slightly below average) but rewarding on hit.

**Forward Tilt:** Heavy straight punch. Solid range and knockback.  
**Up Tilt:** Rising elbow strike.  
**Down Tilt:** Low kick sweep (trips opponents at low %).

**Forward Smash — Crushing Blow:**  
Todo winds up a massive haymaker. One of the strongest smash attacks in the game. 22% fully charged. Very slow (24 frame startup). Rewards reads and punishes.

**Up Smash — Suplex Launch:**  
Anti-air grab that transitions into a brief suplex animation launching opponents upward. Command grab properties (unblockable). 16%.

**Down Smash — Ground Pound:**  
Todo stamps both feet creating a shockwave. Hits both sides. 14%.

**Neutral Special — Boogie Woogie (B):**  
Todo claps his hands. This swaps his position with the targeted opponent (closest opponent within range, about half the stage). The swap is instant (frame 1 after the 8-frame clap animation). Deals no damage. CE Cost: 8%. Cooldown: 90 frames (1.5 seconds). The key mindgame: Todo can START the clap animation and cancel it (by shielding) without actually swapping. This creates a feint that forces opponents to react to the clap sound/animation, wasting their defensive options.

**Side Special — Playful Cloud Strike (Side+B):**  
Todo pulls out the Playful Cloud cursed tool (three-section staff) and performs a devastating three-hit combo. Hit 1: 5%, Hit 2: 6%, Hit 3: 10% with strong knockback. The full combo takes 40 frames. Only the first hit needs to connect for the combo to continue. CE Cost: 15%.

**Up Special — Boogie Woogie Recovery (Up+B):**  
Todo throws a small object imbued with cursed energy upward/diagonally, then immediately Boogie Woogies to swap with it. Functions as a tether recovery. If an opponent is between Todo and the object, Todo appears behind them. CE Cost: 10%.

**Down Special — Feint Clap (Down+B):**  
Todo performs a highly visible clap animation but does NOT swap. Instead, he immediately follows with a counter stance for 20 frames. If hit during the counter, Todo automatically Boogie Woogies behind the attacker and delivers a free hit (12% + knockback). This is the ultimate mindgame tool: opponents must decide if the clap is real (Neutral B) or a feint counter (Down B). CE Cost: 12%.

**Aerial Normals:**  
Nair: Aerial bear hug spin (large hitbox). Fair: Jumping straight punch. Bair: Reverse mule kick (strongest bair in the game, 16%). Uair: Upward headbutt. Dair: Plunging elbow drop (strong spike, but slow).

**Grab & Throws:**  
Todo has the longest grab range. Forward throw: headbutt launch. Back throw: suplex toss. Up throw: military press into sky launch. Down throw: ground slam bounce (combos into aerials at low %).

**"Domain" Ultimate — Binding Vow: Unlimited Boogie Woogie (L+R+B):**  
Todo does not have a Domain Expansion in the anime. His ultimate instead represents his peak form: a Binding Vow that temporarily unlocks unlimited, instantaneous Boogie Woogie.

**Activation:** Todo holds up his left hand showing the Vibraslap prosthetic. He strikes it, creating a massive resonating sound wave. The screen flashes.

**Effect:** For 8 seconds, Todo's Boogie Woogie has NO cooldown and NO CE cost. He can swap positions up to every 6 frames (~10 swaps per second). His clap animation is reduced to 3 frames (nearly instant). Additionally, each swap now creates a small shockwave at both the origin and destination points (4% damage each). Opponents caught in this barrage of constant teleportation and shockwaves are disoriented (input directions are randomly reversed for 0.5 seconds after being hit by a shockwave). Todo's movement speed also increases by 30%.

**Visual:** The Vibraslap emits a constant pulsing aura. Every swap creates blue lightning trails between the two swap points. The clapping sound becomes a rapid boogie-woogie beat. Todo's sprite has afterimage trails showing where he just was.

---

## 5. Stage Design

### 5.1 Tokyo Jujutsu High — Training Grounds
**Layout:** Flat main platform with two smaller floating platforms above, one on each side (standard Battlefield-style layout). Surrounded by the school building in the background.  
**Blast Zones:** Standard distance.  
**Stage Hazard (toggleable):** Occasionally a cursed spirit wanders through the background and onto the main platform, acting as a minor obstacle (5% contact damage).

### 5.2 Shibuya — Underground Station
**Layout:** Three-tiered stage. A long main platform (the station floor), with a platform on the left (ticket gates) and one on the right (stairs). The ceiling is low, making vertical KOs harder and horizontal KOs the primary kill method.  
**Blast Zones:** Horizontal zones are closer than normal; vertical zones are farther.  
**Stage Hazard (toggleable):** Trains periodically pass through the background. A warning signal plays 3 seconds before a train rushes across the lower platform dealing 20% and strong horizontal knockback.

### 5.3 Shinjuku — Battlefield
**Layout:** Wide, open arena with no platforms. A single flat ground extending edge to edge. Encourages footsies and neutral play. Based on the Shinjuku Showdown environment with destroyed buildings in the background.  
**Blast Zones:** All equidistant (balanced).  
**Stage Hazard:** None. This is the "Final Destination" equivalent.

---

## 6. Domain Expansion — Detailed System

### 6.1 Meter Mechanics

```
DOMAIN_METER_MAX = 1000 (internal units)

Passive Gain:     +2 per tick (120/second, ~8.3 seconds per 1%)
                  → Full charge from passive only: ~500 seconds (8.3 minutes)

On-Hit Gain:      Jab/Tilt:         +8 per hit
                  Smash Attack:     +25 per hit
                  Special Move:     +15 per hit
                  Aerial:           +10 per hit
                  Throw:            +20
                  Black Flash:      +80

On-Damage Taken:  +3 per 1% damage received (rage comeback mechanic)

Post-Use Lockout: 15 seconds (900 frames) where meter cannot gain
```

This tuning means an aggressive player landing lots of attacks might get Domain in 3 to 4 minutes, while a passive player might wait 6 to 8 minutes. Domains are rare and impactful, roughly once per stock in a 3-stock match.

### 6.2 Domain Interaction Rules

If both players activate Domain Expansion simultaneously (within a 30-frame window), a "Domain Clash" occurs. Both domains partially manifest and cancel each other out after 2 seconds, dealing 10% damage to both players. Neither player benefits. This mirrors the anime's domain clash mechanic between Gojo and Sukuna.

During an active domain, the affected player CAN attempt to counter with Simple Domain (universal defensive option): pressing Shield + A + B simultaneously creates a small protective field for 30 frames. If timed during the first 15 frames of the domain's effect, it reduces all domain damage by 60% and halves stun durations. This is extremely difficult to time but rewards skilled play.

---

## 7. Multiplayer & Networking

### 7.1 Architecture

```
Client (Browser)  ←→  WebSocket  ←→  Railway Server (Node.js)
      ↕                                    ↕
  Local Game                         Game Room State
  Simulation                         Input Validation
  (Predictive)                       Matchmaking Queue
```

### 7.2 Netcode Design — Input Delay + Rollback Hybrid

**Input Delay:** Baseline 3 frames of input delay for all online play. This gives the network time to receive the opponent's inputs.

**Rollback:** If the opponent's input arrives late, the game rolls back the simulation to the frame when the input should have arrived, re-simulates forward, and corrects the visual. Max rollback: 8 frames. If the connection is too poor (>8 frames of rollback needed), the game switches to delay-only mode.

**Tick Rate:** Server validates at 60 ticks/second. State snapshots are sent every 3 ticks (20 times/second) for bandwidth efficiency.

### 7.3 Server (Railway Deployment)

```javascript
// server/index.js — Simplified structure
const express = require('express');
const { WebSocketServer } = require('ws');
const http = require('http');

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

// Serve static client files
app.use(express.static('../client/public'));

// Game rooms
const rooms = new Map();

wss.on('connection', (ws) => {
  ws.on('message', (data) => {
    const msg = JSON.parse(data);
    switch(msg.type) {
      case 'create_room': /* ... */ break;
      case 'join_room':   /* ... */ break;
      case 'input':       /* ... */ break; // Forward inputs to opponent
      case 'state_sync':  /* ... */ break; // Periodic state validation
    }
  });
});

server.listen(process.env.PORT || 3000);
```

### 7.4 Railway Configuration

```json
// railway.json
{
  "build": { "builder": "DOCKERFILE" },
  "deploy": {
    "startCommand": "node server/index.js",
    "healthcheckPath": "/health",
    "restartPolicyType": "ON_FAILURE"
  }
}
```

```dockerfile
# Dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --production
COPY . .
EXPOSE 3000
CMD ["node", "server/index.js"]
```

### 7.5 Lobby System

Players can either create a room (generates a 6-character code) or join with a code. The server manages room state, validates that both players are connected, and handles disconnection/reconnection within a 10-second grace window.

---

## 8. Implementation Order for Claude Code

This is the recommended build order, broken into phases. Each phase should be a working, testable milestone.

### Phase 1 — Engine Foundation (Estimated: 2-3 sessions)
1. Set up project structure (client/server/shared folders)
2. Implement the 60fps game loop with fixed timestep
3. Build the Canvas renderer (sprite drawing, camera, basic UI)
4. Implement physics engine (gravity, ground collision, platform collision, blast zones)
5. Build the input manager (keyboard mapping, input buffering, 6-frame input buffer)
6. Create the base Fighter class (state machine: idle, walk, run, jump, attack, hitstun, knockback, shield, grab, KO)
7. Implement the Smash-style damage/knockback system (percentage-based, DI, hitstun calculation)
8. Build a test stage (flat ground, two platforms) and a test rectangle "fighter" with basic jab/movement

### Phase 2 — First Character: Yuji (Estimated: 2-3 sessions)
1. Create Yuji's sprite sheet (idle, walk, run, jump, all attacks, hitstun, KO anims — ~40 animation states)
2. Implement all of Yuji's normals (jab, tilts, smashes, aerials)
3. Implement Yuji's specials (Black Flash with frame-perfect input, Manji Kick, Cursed Energy Leap)
4. Implement the Cursed Energy meter system
5. Implement grab/throw system
6. Test and refine frame data, hitboxes, hurtboxes
7. Build the HUD (damage %, CE meter, stock icons, Domain meter)

### Phase 3 — Swap Mechanic + Sukuna (Estimated: 2 sessions)
1. Create Sukuna's sprite sheet
2. Implement all Sukuna normals and specials
3. Build the swap mechanic (shared damage %, separate CE, swap animation, cooldown, invincibility frames)
4. Implement Cleave's adaptive damage scaling
5. Test Yuji-to-Sukuna transitions in combat

### Phase 4 — Remaining Characters (Estimated: 3-4 sessions)
1. Gojo: sprites, Infinity passive, Blue/Red/Amplification specials
2. Mahito: sprites, body-morph visual system, Soul Corruption stacking, Transfigured Human projectile
3. Todo: sprites, Boogie Woogie swap targeting system, feint clap/counter, Playful Cloud

### Phase 5 — Domain Expansion System (Estimated: 2 sessions)
1. Build the Domain meter (passive gain, on-hit gain, post-use lockout)
2. Implement the Domain activation cinematic system (zoom, screen flash, background swap)
3. Implement each domain's unique effect:
   - Unlimited Void: stun + info streams + free action for Gojo
   - Malevolent Shrine: stage-wide autonomous slashes
   - Self-Embodiment of Perfection: Soul Corruption burst + enhanced Mahito
   - Unlimited Boogie Woogie: no-cooldown rapid swaps + shockwaves
4. Implement Domain Clash (simultaneous activation cancellation)
5. Implement Simple Domain counter mechanic

### Phase 6 — Stages & Polish (Estimated: 2 sessions)
1. Build all three stages with backgrounds and platform layouts
2. Implement stage hazards (toggleable)
3. Add particle effects (cursed energy auras, hit sparks, slash trails)
4. Add screen shake, hitstop (3-frame freeze on strong hits), and slow-mo on KO
5. Add character select screen, stage select screen
6. Implement stock/timer match modes

### Phase 7 — Multiplayer (Estimated: 3-4 sessions)
1. Set up the Node.js/Express/WebSocket server
2. Implement room creation and joining (lobby system with room codes)
3. Build the input-sync system (serialize inputs, send over WebSocket)
4. Implement input delay (3 frames baseline)
5. Implement rollback netcode (state snapshots, resimulation)
6. Deploy to Railway, test latency
7. Add reconnection handling and disconnect detection

### Phase 8 — Final Polish (Estimated: 1-2 sessions)
1. Main menu screen with pixel art title
2. Character select with animated portraits
3. Victory/defeat screens
4. Sound effects integration (hit sounds, special move sounds, domain ambience)
5. Music placeholder system
6. Settings menu (controls rebinding, sound volume, stage hazard toggle)
7. Performance optimization pass (ensure consistent 60fps)
8. Bug testing and balance adjustments

---

## 9. Pixel Art Sprite Specifications

### 9.1 Per-Character Sprite Requirements

Each character needs approximately 40-50 animation states. Each state has 2-12 frames of animation.

| Animation State | Frames | Notes |
|---|---|---|
| Idle | 6 | Looping breathing animation |
| Walk | 8 | Forward movement cycle |
| Run | 6 | Faster cycle |
| Jump Squat | 3 | Pre-jump crouch |
| Jump Rise | 4 | Going up |
| Jump Peak | 2 | Apex |
| Jump Fall | 4 | Coming down |
| Land | 3 | Landing lag |
| Jab 1-3 | 3 each | Jab combo |
| F-Tilt | 4 | |
| U-Tilt | 4 | |
| D-Tilt | 4 | |
| F-Smash (charge + swing) | 8 | |
| U-Smash | 6 | |
| D-Smash | 6 | |
| Neutral B | 6-10 | Varies per character |
| Side B | 6-10 | Varies per character |
| Up B | 6-8 | |
| Down B | 6-8 | |
| N-Air | 4 | |
| F-Air | 4 | |
| B-Air | 4 | |
| U-Air | 4 | |
| D-Air | 4 | |
| Grab | 3 | |
| Grab Hold | 2 | Loop |
| Throw (x4) | 4 each | Each direction |
| Shield | 2 | Hold + break |
| Dodge | 4 | |
| Hitstun | 3 | Light/medium/heavy |
| Knockback Tumble | 4 | Looping |
| KO Star | 6 | Flying off screen |
| Taunt | 8 | Character specific |
| Domain Activation | 10-12 | Cinematic |

**Estimated total:** ~180-220 frames per character at 64x64 pixels each.

### 9.2 Sprite Sheet Format

Each character's frames are packed into a single PNG atlas (e.g., 2048x2048). A JSON manifest maps animation names to frame coordinates, durations, and hitbox/hurtbox data.

```json
{
  "gojo": {
    "idle": {
      "frames": [
        { "x": 0, "y": 0, "w": 64, "h": 64, "duration": 10,
          "hurtbox": { "x": 16, "y": 8, "w": 32, "h": 52 },
          "hitbox": null }
      ]
    },
    "neutral_b_blue": {
      "frames": [
        { "x": 64, "y": 0, "w": 64, "h": 64, "duration": 4,
          "hurtbox": { "x": 16, "y": 8, "w": 32, "h": 52 },
          "hitbox": { "x": 40, "y": 20, "w": 30, "h": 30, "damage": 8, "knockback": 40, "angle": 45 } }
      ]
    }
  }
}
```

---

## 10. Constants & Frame Data Reference

All values in 60fps frames.

### 10.1 Universal Constants

```javascript
const CONSTANTS = {
  GRAVITY: 0.58,              // pixels per frame²
  MAX_FALL_SPEED: 12,         // pixels per frame
  FAST_FALL_SPEED: 16,        // pixels per frame (hold down in air)
  HITSTUN_BASE: 6,            // frames minimum hitstun
  HITSTUN_MULTIPLIER: 0.4,    // extra hitstun frames per % damage
  KNOCKBACK_BASE: 3.0,        // base knockback units
  KNOCKBACK_SCALING: 0.12,    // knockback increase per % damage
  DI_INFLUENCE: 15,           // degrees of directional influence
  SHIELD_HP: 100,             // shield durability points
  SHIELD_REGEN: 0.15,         // points per frame
  SHIELD_BREAK_STUN: 180,     // frames (3 seconds)
  LEDGE_HANG_MAX: 300,        // frames before forced drop (5 seconds)
  INPUT_BUFFER: 6,            // frames of input buffering
  CE_REGEN_RATE: 0.15,        // CE points per frame (9 per second)
  DOMAIN_PASSIVE_GAIN: 2,     // domain meter points per frame
  DOMAIN_LOCKOUT: 900,        // frames after domain use
};
```

### 10.2 Per-Character Stats

| Stat | Gojo | Yuji | Sukuna | Mahito | Todo |
|---|---|---|---|---|---|
| Weight | 95 | 88 | 100 | 85 | 115 |
| Walk Speed | 1.1 | 1.3 | 1.0 | 1.15 | 0.9 |
| Run Speed | 1.8 | 2.2 | 1.7 | 1.9 | 1.5 |
| Jump Height | 35 | 40 | 33 | 37 | 30 |
| Air Speed | 1.0 | 1.2 | 0.95 | 1.1 | 0.85 |
| Fall Speed | 1.5 | 1.6 | 1.7 | 1.4 | 1.9 |
| CE Max | 100 | 100 | 120 | 110 | 80 |
| CE Regen | 0.15 | 0.18 | 0.12 | 0.16 | 0.20 |

(Weight affects knockback resistance. Higher = harder to KO. Todo is heaviest, Mahito is lightest.)

---

## 11. Key Implementation Notes for Claude Code

1. **Start with the game loop and physics.** Get a rectangle moving, jumping, and falling with gravity before touching any character code.

2. **Use a state machine for fighter states.** Every fighter has states: IDLE, WALK, RUN, JUMPSQUAT, AIRBORNE, ATTACK, HITSTUN, TUMBLE, SHIELD, GRAB, DOMAIN. State transitions are the core of the fighting game.

3. **Hitbox/Hurtbox system is critical.** Every frame of every animation has defined hitboxes (attack zones) and hurtboxes (vulnerable zones). Collision checks happen every tick. Use AABB (axis-aligned bounding box) for simplicity.

4. **Input buffering prevents dropped inputs.** Store the last 6 frames of inputs. When checking for a move, look back through the buffer. This makes the game feel responsive.

5. **Hitstop makes hits feel powerful.** When a strong attack connects, freeze BOTH characters for 3-5 frames. This is the "impact freeze" that makes Smash attacks feel heavy.

6. **Serialize game state deterministically.** For rollback netcode, the game simulation must be 100% deterministic. Same inputs = same results. Avoid Math.random() in gameplay. Use a seeded PRNG.

7. **Domain Expansions should be modular.** Each domain is a class implementing an interface: `activate()`, `update(tick)`, `render(ctx)`, `deactivate()`. The base DomainExpansion system manages the meter, activation, and lifecycle.

8. **Pixel art rendering:** Use `ctx.imageSmoothingEnabled = false` on the Canvas context. Render at native resolution and scale up with CSS `image-rendering: pixelated`. This keeps pixel art crisp.

9. **The Yuji/Sukuna swap** is the most complex character-specific system. Internally, treat it as two separate fighter instances sharing health/domain state, with only one "active" at a time.

10. **Railway deployment** is straightforward. The server is a simple Node.js WebSocket relay with room management. Most game logic runs client-side. The server validates periodic state checksums to prevent cheating.

---

## 12. Match Settings

| Setting | Default | Options |
|---|---|---|
| Stocks | 3 | 1, 2, 3, 5 |
| Time Limit | 7 minutes | 3, 5, 7, 10, None |
| Stage Hazards | On | On, Off |
| Team Damage | On | On, Off |
| Domain Meter Speed | Normal | Slow (0.5x), Normal, Fast (2x) |

---

*This document provides Claude Code with everything needed to build the game step by step. Each phase is self-contained and testable. The character movesets are detailed enough to implement directly from this spec.*
