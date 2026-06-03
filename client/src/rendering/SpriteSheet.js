// Detailed procedural pixel-art sprite atlas. Each character is drawn with
// distinguishing features: face, hair, outfit, accessories, build/height.
// Sprites are 80x112 base, rendered at 2x scale (160x224) for the 128-bit
// pixel art look specified in JJK_SMASH_GAME_PLAN.md section 9.
//
// Sprite coordinate system (pre-scale):
//   - 80 wide, 112 tall
//   - sprite column 40 is the character's centerline (fighter x)
//   - sprite row  108 is the character's feet (fighter y)
//   - The render scale is 2x, so one sprite-pixel == 2 world-pixels.
//
// Every attack pose exposes a `swing` rect (in sprite-pixel coords). That
// rect is rendered as the visible FX (slash/punch/orb/etc.) and is ALSO
// the source of truth for the move's active hitbox — see
// `hitboxFromPose()` below, which converts a pose's swing rect into the
// fighter-local hitbox geometry. This keeps attacks visually honest:
// what you see is what hits.

const SPRITE_W = 80;
const SPRITE_H = 112;
const SCALE = 2;
// Fighter hurtbox height used by Fighter._buildHitboxWorld. Must match the
// value in Fighter.js (this.height). Kept here because hitbox alignment
// depends on the feet-to-top mapping in sprite space.
const HURT_HEIGHT = 90;
const FEET_SPRITE_Y = 108;   // sprite row where feet sit
const CENTER_SPRITE_X = 40;  // sprite column where the character centers

// Helper: pixel rect with optional shade
function px(ctx, x, y, w, h, color) { ctx.fillStyle = color; ctx.fillRect(x | 0, y | 0, w | 0, h | 0); }

// =========================================================
// Pose definition: a pose drives limb offsets and FX layers.
// Every character interprets pose with their own renderer.
// =========================================================
// Pose entries: limb offsets + an optional `swing` rect that gets recolored
// per-character into a cursed-energy slash. `fx` is one of:
//   'slash'  - directional slash arc (default)
//   'punch'  - small impact star at hand position
//   'orb'    - cursed-energy orb (used for specials)
//   'beam'   - long horizontal energy beam
//   'shock'  - vertical shockwave under feet
//   'sweep'  - wide ground sweep
//   'flare'  - aerial burst around the body
const POSES = {
  idle:    { armA: [0, 0], armB: [0, 0], legA: 0, legB: 0, body: 0, head: 0, blink: 0 },
  idle2:   { armA: [0, -1], armB: [0, -1], legA: 0, legB: 0, body: -1, head: -1, blink: 0 },
  walk1:   { armA: [-2, 1], armB: [2, -1], legA: -2, legB: 2, body: 0, head: 0, blink: 0 },
  walk2:   { armA: [2, -1], armB: [-2, 1], legA: 2, legB: -2, body: 0, head: 0, blink: 0 },
  run1:    { armA: [-3, 2], armB: [3, -2], legA: -4, legB: 4, body: 1, head: 0, blink: 0 },
  run2:    { armA: [3, -2], armB: [-3, 2], legA: 4, legB: -4, body: 1, head: 0, blink: 0 },
  jump:    { armA: [-2, -4], armB: [2, -4], legA: -3, legB: 3, body: -2, head: -2, blink: 0 },
  fall:    { armA: [-3, 1], armB: [3, 1], legA: -1, legB: 1, body: 1, head: 0, blink: 0 },
  shield:  { armA: [-2, 0], armB: [2, 0], legA: 0, legB: 0, body: 0, head: 0, blink: 0 },
  hurt:    { armA: [3, 3], armB: [-3, 3], legA: 0, legB: 0, body: 1, head: 1, blink: 1 },
  domain:  { armA: [-3, -3], armB: [3, -3], legA: 0, legB: 0, body: -2, head: -2, blink: 0,
             swing: null, glow: true },

  // ===== Ground basics =====
  // Jab combo: three frames so a 3-hit jab cycles visibly.
  jab_wind: { armA: [-2, 1], armB: [4, 0], legA: -1, legB: 1, body: 0, head: 0, blink: 0,
              swing: { x: 40, y: 44, w: 8, h: 4 }, fx: 'punch' },
  jab_hit:  { armA: [-2, 0], armB: [16, -2], legA: -1, legB: 2, body: 0, head: 0, blink: 0,
              swing: { x: 50, y: 38, w: 20, h: 6 }, fx: 'punch' },
  jab_hit2: { armA: [-2, -1], armB: [18, -3], legA: -1, legB: 2, body: 0, head: 0, blink: 0,
              swing: { x: 52, y: 36, w: 22, h: 8 }, fx: 'punch' },

  // Forward tilt: stepping jab.
  ftilt_wind: { armA: [-3, 0], armB: [6, -1], legA: -2, legB: 3, body: 0, head: 0, blink: 0,
                swing: { x: 44, y: 40, w: 10, h: 6 }, fx: 'slash' },
  ftilt_hit:  { armA: [-3, 0], armB: [20, -2], legA: -3, legB: 4, body: 0, head: 0, blink: 0,
                swing: { x: 50, y: 34, w: 28, h: 10 }, fx: 'slash' },

  // Up tilt: rising fist / kick.
  utilt_wind: { armA: [-2, -2], armB: [2, -2], legA: -1, legB: 1, body: -1, head: -1, blink: 0,
                swing: { x: 36, y: 24, w: 12, h: 8 }, fx: 'slash' },
  utilt_hit:  { armA: [-2, -8], armB: [2, -8], legA: -1, legB: 1, body: -2, head: -2, blink: 0,
                swing: { x: 32, y: 6,  w: 18, h: 18 }, fx: 'slash' },

  // Down tilt: low poke / sweep.
  dtilt_wind: { armA: [-2, 4], armB: [6, 4], legA: -1, legB: 2, body: 1, head: 1, blink: 0,
                swing: { x: 42, y: 80, w: 14, h: 6 }, fx: 'sweep' },
  dtilt_hit:  { armA: [-2, 4], armB: [18, 4], legA: 0, legB: 4, body: 1, head: 1, blink: 0,
                swing: { x: 50, y: 84, w: 26, h: 8 }, fx: 'sweep' },

  // Smash attacks: huge windup → big release.
  fsmash_wind: { armA: [-6, 0], armB: [-2, -1], legA: -3, legB: 3, body: 1, head: 0, blink: 0,
                 swing: { x: 30, y: 38, w: 8, h: 6 }, fx: 'slash' },
  fsmash_hit:  { armA: [-6, 1], armB: [22, -2], legA: -4, legB: 5, body: 0, head: 0, blink: 0,
                 swing: { x: 50, y: 30, w: 36, h: 18 }, fx: 'slash' },
  usmash_wind: { armA: [-3, 2], armB: [3, 2], legA: -2, legB: 2, body: 1, head: 1, blink: 0,
                 swing: { x: 36, y: 46, w: 12, h: 6 }, fx: 'flare' },
  usmash_hit:  { armA: [-4, -10], armB: [4, -10], legA: -3, legB: 3, body: -3, head: -3, blink: 0,
                 swing: { x: 28, y: -8, w: 28, h: 30 }, fx: 'flare' },
  dsmash_wind: { armA: [-2, -2], armB: [2, -2], legA: -1, legB: 1, body: -1, head: -1, blink: 0,
                 swing: { x: 34, y: 70, w: 16, h: 6 }, fx: 'shock' },
  dsmash_hit:  { armA: [-6, 6], armB: [6, 6], legA: 1, legB: 1, body: 2, head: 1, blink: 0,
                 swing: { x: 8,  y: 86, w: 64, h: 14 }, fx: 'shock' },

  // ===== Aerials =====
  nair: { armA: [-6, 0], armB: [6, 0], legA: -2, legB: 2, body: 0, head: 0, blink: 0,
          swing: { x: 12, y: 36, w: 56, h: 24 }, fx: 'flare' },
  fair: { armA: [-3, -2], armB: [16, -3], legA: -2, legB: 2, body: -1, head: 0, blink: 0,
          swing: { x: 50, y: 30, w: 24, h: 14 }, fx: 'slash' },
  bair: { armA: [-16, -1], armB: [3, 1], legA: 2, legB: -2, body: -1, head: 0, blink: 0,
          swing: { x: 4,  y: 32, w: 24, h: 14 }, fx: 'slash' },
  uair: { armA: [-2, -8], armB: [2, -8], legA: -1, legB: 1, body: -3, head: -3, blink: 0,
          swing: { x: 28, y: -4, w: 24, h: 14 }, fx: 'slash' },
  dair: { armA: [-3, 6], armB: [3, 6], legA: 2, legB: -2, body: 2, head: 1, blink: 0,
          swing: { x: 28, y: 96, w: 24, h: 14 }, fx: 'shock' },

  // ===== Specials =====
  // Neutral special: charge an orb at the front hand.
  neutralspecial_wind: { armA: [-2, -1], armB: [12, -1], legA: -1, legB: 1, body: 0, head: 0, blink: 0,
                         swing: { x: 50, y: 38, w: 12, h: 12 }, fx: 'orb' },
  neutralspecial_hit:  { armA: [-2, -1], armB: [22, -2], legA: -2, legB: 2, body: 0, head: 0, blink: 0,
                         swing: { x: 60, y: 32, w: 28, h: 28 }, fx: 'orb' },
  // Side special: long horizontal beam.
  sidespecial_wind: { armA: [-4, 0], armB: [10, -1], legA: -2, legB: 2, body: 0, head: 0, blink: 0,
                      swing: { x: 48, y: 38, w: 16, h: 10 }, fx: 'orb' },
  sidespecial_hit:  { armA: [-4, 0], armB: [24, -2], legA: -3, legB: 3, body: 0, head: 0, blink: 0,
                      swing: { x: 56, y: 36, w: 60, h: 16 }, fx: 'beam' },
  // Up special: vertical burst, body goes up.
  upspecial_wind: { armA: [-2, 2], armB: [2, 2], legA: 0, legB: 0, body: 1, head: 1, blink: 0,
                    swing: { x: 32, y: 56, w: 16, h: 8 }, fx: 'flare' },
  upspecial_hit:  { armA: [-2, -10], armB: [2, -10], legA: 1, legB: -1, body: -3, head: -3, blink: 0,
                    swing: { x: 26, y: -10, w: 28, h: 36 }, fx: 'flare' },
  // Down special: counter / dome.
  downspecial_wind: { armA: [-3, 0], armB: [3, 0], legA: 0, legB: 0, body: 0, head: 0, blink: 0,
                      swing: { x: 24, y: 28, w: 32, h: 50 }, fx: 'orb' },
  downspecial_hit:  { armA: [-6, -2], armB: [6, -2], legA: -1, legB: 1, body: -1, head: -1, blink: 0,
                      swing: { x: 12, y: 16, w: 56, h: 70 }, fx: 'orb' },

  // Grab.
  grab: { armA: [-2, 0], armB: [22, 0], legA: -1, legB: 2, body: 0, head: 0, blink: 0,
          swing: { x: 56, y: 40, w: 14, h: 14 }, fx: 'punch' },

  // Defensive/recovery poses.
  land:         { armA: [-3, 2], armB: [3, 2], legA: 1, legB: -1, body: 2, head: 1, blink: 0 },
  roll:         { armA: [-4, 2], armB: [4, -2], legA: -2, legB: 4, body: 2, head: 2, blink: 1 },
  spotdodge:    { armA: [-2, 2], armB: [2, 2], legA: 0, legB: 0, body: 2, head: 1, blink: 1 },
  airdodge:     { armA: [-4, -2], armB: [4, -2], legA: -1, legB: 1, body: 0, head: 0, blink: 1 },
  // Grab hold / throws. Grab_hold = both arms extended; throws re-use swing visuals.
  grab_hold: { armA: [-2, 2], armB: [22, 0], legA: -1, legB: 2, body: 0, head: 0, blink: 0 },
  throw_f: { armA: [-2, -4], armB: [26, -4], legA: -2, legB: 2, body: -1, head: 0, blink: 0,
             swing: { x: 50, y: 36, w: 26, h: 14 }, fx: 'slash' },
  throw_b: { armA: [-26, -4], armB: [2, -4], legA: 2, legB: -2, body: -1, head: 0, blink: 0,
             swing: { x: 4, y: 36, w: 26, h: 14 }, fx: 'slash' },
  throw_u: { armA: [-2, -10], armB: [2, -10], legA: -1, legB: 1, body: -3, head: -3, blink: 0,
             swing: { x: 30, y: -4, w: 20, h: 18 }, fx: 'flare' },
  throw_d: { armA: [-3, 6], armB: [3, 6], legA: 2, legB: -2, body: 4, head: 2, blink: 0,
             swing: { x: 20, y: 86, w: 40, h: 14 }, fx: 'shock' },
  // Charged smash (max charge) — bigger swing rect = bigger hitbox.
  fsmash_max: { armA: [-6, 1], armB: [26, -3], legA: -5, legB: 6, body: 0, head: 0, blink: 0,
                swing: { x: 50, y: 26, w: 44, h: 24 }, fx: 'slash' },

  // Backwards-compat aliases used by old _updateAnim paths.
  attack1: { armA: [-2, 0], armB: [16, -2], legA: -1, legB: 2, body: 0, head: 0, blink: 0,
             swing: { x: 50, y: 38, w: 20, h: 6 }, fx: 'punch' },
  attack2: { armA: [-3, -2], armB: [22, -3], legA: -2, legB: 2, body: -1, head: 0, blink: 0,
             swing: { x: 50, y: 30, w: 26, h: 8 }, fx: 'slash' },
  smash:   { armA: [-6, 1], armB: [22, -2], legA: -4, legB: 5, body: 0, head: 0, blink: 0,
             swing: { x: 50, y: 30, w: 36, h: 18 }, fx: 'slash' },
};

// =========================================================
// Generic body parts. The character renderer composes them
// with character-specific colors and adds unique overlays.
// These are upgraded "anime-style" body parts: proper
// tapered torso, jointed limbs, and rounded heads with
// cheek/chin structure. Multi-tone shading per part.
// =========================================================
function drawShadow(ctx) {
  // Soft elliptical shadow with a darker inner core.
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  ctx.beginPath();
  ctx.ellipse(40, 108, 22, 4, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  ctx.beginPath();
  ctx.ellipse(40, 108, 14, 2.5, 0, 0, Math.PI * 2);
  ctx.fill();
}

// Tapered leg: thigh -> knee -> shin -> shoe with laces hint.
function drawLeg(ctx, x, topY, palette, build) {
  const w = build === 'big' ? 8 : 7;
  // Thigh (wider top)
  px(ctx, x, topY, w, 10, palette.pants);
  px(ctx, x, topY, w, 2, palette.pantsHi);
  px(ctx, x + w - 1, topY + 1, 1, 9, palette.pantsShade || palette.pantsHi);
  // Knee joint (slightly darker band)
  px(ctx, x, topY + 10, w, 2, palette.pantsShade || palette.pants);
  // Shin (narrower)
  const sw = w - 1;
  px(ctx, x, topY + 12, sw, 8, palette.pants);
  px(ctx, x, topY + 12, sw, 1, palette.pantsHi);
  px(ctx, x + sw - 1, topY + 13, 1, 7, palette.pantsShade || palette.pantsHi);
  // Shoe: sole + upper
  px(ctx, x - 1, topY + 20, sw + 3, 2, palette.shoe);
  px(ctx, x - 1, topY + 22, sw + 3, 2, '#000000');
  // Lace hint
  if (palette.shoeLace) {
    px(ctx, x + 1, topY + 20, 1, 1, palette.shoeLace);
    px(ctx, x + sw - 1, topY + 20, 1, 1, palette.shoeLace);
  }
}

function drawLegs(ctx, pose, palette, build) {
  // Leg positions: legA is back leg (drawn first, partially behind torso),
  // legB is front leg.
  const backX = build === 'big' ? 30 : 31;
  const frontX = build === 'big' ? 41 : 42;
  drawLeg(ctx, backX, 78 + pose.legA, palette, build);
  drawLeg(ctx, frontX, 78 + pose.legB, palette, build);
}

// Tapered torso with shoulder yoke, center seam, and belt.
function drawTorso(ctx, pose, palette, build) {
  const big = build === 'big';
  const x = big ? 24 : 27;
  const w = big ? 32 : 26;
  const top = 46 + pose.body;
  const h = 34;
  // Main jacket body (slightly tapered by drawing a narrower bottom row)
  px(ctx, x, top, w, h, palette.jacket);
  // Taper (waist)
  px(ctx, x, top + h - 6, 1, 6, palette.jacketShade || palette.jacket);
  px(ctx, x + w - 1, top + h - 6, 1, 6, palette.jacketShade || palette.jacket);
  // Highlight on left edge (anime light source top-left)
  px(ctx, x, top, 2, h, palette.jacketHi);
  px(ctx, x + 2, top + 1, 1, h - 2, palette.jacketHi);
  // Shadow on right edge
  px(ctx, x + w - 2, top + 1, 2, h - 2, palette.jacketShade || palette.jacket);
  // Shoulder yoke (upper chest band)
  px(ctx, x + 2, top, w - 4, 3, palette.jacketHi);
  // Collar (V-neck or high collar determined by palette.collar)
  px(ctx, x + 3, top, w - 6, 4, palette.collar || palette.jacketShade);
  px(ctx, x + (w / 2 | 0) - 1, top + 2, 2, 3, palette.skin); // collar gap
  // Center seam / zipper
  if (palette.jacketLine) {
    px(ctx, x + (w / 2 | 0), top + 5, 1, h - 10, palette.jacketLine);
    // Button dots
    px(ctx, x + (w / 2 | 0), top + 10, 1, 1, palette.jacketHi);
    px(ctx, x + (w / 2 | 0), top + 18, 1, 1, palette.jacketHi);
    px(ctx, x + (w / 2 | 0), top + 24, 1, 1, palette.jacketHi);
  }
  // Belt with buckle
  px(ctx, x, top + h - 4, w, 3, palette.belt || palette.jacketShade);
  px(ctx, x, top + h - 4, w, 1, '#000000');
  const bx = x + (w / 2 | 0) - 1;
  px(ctx, bx, top + h - 4, 3, 3, palette.buckle || '#ccaa44');
  px(ctx, bx + 1, top + h - 3, 1, 1, '#000000');
}

// Jointed arm: shoulder -> upper arm -> elbow -> forearm -> hand.
function drawArm(ctx, x, y, palette, len = 18) {
  const upperH = Math.round(len * 0.55);
  const lowerH = len - upperH;
  // Upper arm
  px(ctx, x, y, 5, upperH, palette.jacket);
  px(ctx, x, y, 5, 1, palette.jacketHi);
  px(ctx, x, y, 1, upperH, palette.jacketHi);
  px(ctx, x + 4, y + 1, 1, upperH - 1, palette.jacketShade || palette.jacket);
  // Elbow band (slightly darker)
  px(ctx, x, y + upperH, 5, 1, palette.jacketShade || palette.jacket);
  // Forearm (slightly narrower)
  px(ctx, x, y + upperH + 1, 4, lowerH - 1, palette.jacket);
  px(ctx, x, y + upperH + 1, 4, 1, palette.jacketHi);
  px(ctx, x + 3, y + upperH + 2, 1, lowerH - 3, palette.jacketShade || palette.jacket);
  // Cuff
  px(ctx, x, y + len - 2, 4, 2, palette.cuff || palette.jacketShade || palette.jacket);
  // Hand
  px(ctx, x, y + len, 4, 4, palette.skin);
  px(ctx, x, y + len, 4, 1, palette.skin); // highlight
  px(ctx, x + 3, y + len + 1, 1, 3, palette.skinShade);
  // Knuckle hint
  px(ctx, x, y + len + 3, 4, 1, palette.skinShade);
}

function drawArms(ctx, pose, palette, build) {
  const big = build === 'big';
  const baseY = 50 + pose.body;
  const leftX = (big ? 20 : 22) + pose.armA[0];
  const rightX = (big ? 55 : 53) + pose.armB[0];
  drawArm(ctx, leftX,  baseY + pose.armA[1], palette);
  drawArm(ctx, rightX, baseY + pose.armB[1], palette);
}

// Anime-style head: rounded oval, jaw taper, ear hint, neck.
function drawHead(ctx, pose, palette, faceFn) {
  const top = 22 + pose.head;
  // Crown row (rounded)
  px(ctx, 32, top, 16, 1, palette.skin);
  px(ctx, 30, top + 1, 20, 1, palette.skin);
  // Main head block
  px(ctx, 29, top + 2, 22, 15, palette.skin);
  // Highlight (top-left)
  px(ctx, 29, top + 2, 22, 1, '#ffffff');
  ctx.globalAlpha = 0.25;
  px(ctx, 29, top + 2, 22, 1, '#ffffff');
  ctx.globalAlpha = 1;
  px(ctx, 30, top + 2, 3, 7, lighten(palette.skin, 0.12));
  // Right-side shading
  px(ctx, 49, top + 2, 2, 14, palette.skinShade);
  px(ctx, 48, top + 12, 1, 5, palette.skinShade);
  // Jaw taper (pixel corners removed for rounded look)
  px(ctx, 29, top + 15, 1, 2, 'rgba(0,0,0,0)');
  px(ctx, 50, top + 15, 1, 2, 'rgba(0,0,0,0)');
  px(ctx, 30, top + 16, 20, 1, palette.skin);
  px(ctx, 32, top + 17, 16, 1, palette.skinShade);
  // Chin
  px(ctx, 34, top + 18, 12, 1, palette.skin);
  px(ctx, 35, top + 19, 10, 1, palette.skinShade);
  // Ears (small hint on each side)
  px(ctx, 28, top + 8, 2, 5, palette.skin);
  px(ctx, 28, top + 8, 1, 5, palette.skinShade);
  px(ctx, 50, top + 8, 2, 5, palette.skin);
  px(ctx, 51, top + 8, 1, 5, palette.skinShade);
  // Neck
  px(ctx, 35, top + 20, 10, 4, palette.skin);
  px(ctx, 35, top + 20, 10, 1, palette.skinShade);
  px(ctx, 43, top + 20, 2, 4, palette.skinShade);
  // Face features (handed off to per-character)
  faceFn && faceFn(ctx, 30, top + 2, pose);
}

// Small color math helper for highlight generation.
function lighten(hex, amt) {
  const m = hex.match(/^#([0-9a-f]{6})$/i);
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  r = Math.min(255, r + ((255 - r) * amt) | 0);
  g = Math.min(255, g + ((255 - g) * amt) | 0);
  b = Math.min(255, b + ((255 - b) * amt) | 0);
  return '#' + ((r << 16) | (g << 8) | b).toString(16).padStart(6, '0');
}

// =========================================================
// Character-specific drawers.
// =========================================================

function drawGojo(ctx, pose) {
  // Gojo Satoru — "The Strongest". Tall lean frame, white spiky hair,
  // black blindfold with Six Eyes glow, dark navy JJH uniform with high
  // collar, subtle Infinity shimmer (drawn by the pose when active).
  const palette = {
    skin: '#f5d8b6', skinShade: '#c9a577',
    jacket: '#131a3a', jacketHi: '#2a3a6e', jacketShade: '#08102a',
    jacketLine: '#0a0f26', collar: '#050818', belt: '#2a3052',
    buckle: '#98a8d8', cuff: '#080d24',
    pants: '#0a1128', pantsHi: '#1a244c', pantsShade: '#04071a',
    shoe: '#02050f', shoeLace: '#5a6888',
  };
  drawShadow(ctx);
  drawLegs(ctx, pose, palette, 'lean');
  drawTorso(ctx, pose, palette, 'lean');
  drawArms(ctx, pose, palette, 'lean');
  // High collar (Gojo's signature — wraps around lower face)
  const collarY = 44 + pose.body;
  px(ctx, 30, collarY, 20, 4, palette.jacket);
  px(ctx, 30, collarY, 20, 1, palette.jacketHi);
  px(ctx, 30, collarY + 3, 20, 1, palette.jacketShade);
  drawHead(ctx, pose, palette, (cx, x, y) => {
    // Blindfold — wraps from one temple to the other, with a subtle band shine.
    const bf = '#07070e';
    px(ctx, x - 1, y + 5, 22, 5, bf);
    px(ctx, x - 1, y + 5, 22, 1, '#1a1a26');      // top edge highlight
    px(ctx, x - 1, y + 9, 22, 1, '#030308');      // bottom shadow
    // Blindfold wrap lines (subtle bands)
    px(ctx, x + 4, y + 5, 1, 5, '#15151f');
    px(ctx, x + 15, y + 5, 1, 5, '#15151f');
    // Six Eyes — electric blue glow peeking through the blindfold's edges.
    if (!pose.blink) {
      px(ctx, x - 1, y + 7, 2, 2, '#c7f2ff');
      px(ctx, x - 1, y + 7, 1, 2, '#5fd7ff');
      px(ctx, x + 19, y + 7, 2, 2, '#c7f2ff');
      px(ctx, x + 20, y + 7, 1, 2, '#5fd7ff');
      // Faint glow beneath blindfold center
      ctx.globalAlpha = 0.35;
      px(ctx, x + 7, y + 7, 6, 2, '#5fd7ff');
      ctx.globalAlpha = 1;
    }
    // Nose hint (subtle shadow)
    px(ctx, x + 10, y + 11, 1, 2, palette.skinShade);
    // Mouth — slight smirk
    px(ctx, x + 8, y + 14, 5, 1, '#6a2820');
    px(ctx, x + 12, y + 13, 1, 1, '#6a2820');
  });
  // Hair: signature spiky white with bluish-grey shadow layer.
  const hy = 22 + pose.head;
  // Back hair layer (slightly grey/shadow)
  px(ctx, 28, hy + 4, 24, 4, '#c8cce0');
  // Main white hair mass
  px(ctx, 27, hy - 1, 26, 7, '#ffffff');
  px(ctx, 27, hy - 1, 26, 1, '#ffffff');
  // Shadow under hair mass
  px(ctx, 28, hy + 6, 24, 1, '#c8cce0');
  // Left temple bang
  px(ctx, 27, hy + 3, 2, 7, '#ffffff');
  px(ctx, 27, hy + 3, 1, 7, '#d8dce8');
  // Right temple bang
  px(ctx, 51, hy + 3, 2, 7, '#ffffff');
  px(ctx, 52, hy + 3, 1, 7, '#d8dce8');
  // Spikes — irregular peaks matching anime silhouette
  px(ctx, 29, hy - 3, 3, 3, '#ffffff');
  px(ctx, 32, hy - 2, 2, 2, '#ffffff');
  px(ctx, 34, hy - 4, 4, 4, '#ffffff');
  px(ctx, 38, hy - 2, 2, 2, '#ffffff');
  px(ctx, 40, hy - 5, 4, 5, '#ffffff');
  px(ctx, 44, hy - 3, 3, 3, '#ffffff');
  px(ctx, 47, hy - 4, 3, 4, '#ffffff');
  // Shadow inside the hair mass (depth)
  px(ctx, 30, hy + 1, 20, 1, '#d4d8e4');
  // Middle parting highlight
  px(ctx, 38, hy, 1, 5, '#e8ecf4');
  // Forelock that sweeps down between blindfold edge and forehead
  px(ctx, 36, hy + 5, 2, 3, '#ffffff');
  px(ctx, 42, hy + 5, 2, 3, '#ffffff');
  // Ear covering strands
  px(ctx, 27, hy + 10, 1, 4, '#ffffff');
  px(ctx, 52, hy + 10, 1, 4, '#ffffff');
  // Infinity shimmer — a dashed faint pattern around the body when active.
  if (pose.glow) {
    ctx.strokeStyle = 'rgba(95,215,255,0.6)';
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 3]);
    ctx.strokeRect(18, 18, 44, 82);
    ctx.setLineDash([]);
  }
}

function drawYuji(ctx, pose) {
  // Yuji Itadori — average muscular build, pink/salmon spiky hair with
  // undercut, Tokyo Jujutsu High dark-blue hooded uniform.
  const palette = {
    skin: '#f5cfa3', skinShade: '#c49275',
    jacket: '#1a2342', jacketHi: '#2d3a62', jacketShade: '#0e1428',
    jacketLine: '#060b1e', collar: '#070c22', belt: '#0a0a0e',
    buckle: '#b08038', cuff: '#0a1024',
    pants: '#0f1530', pantsHi: '#1f2848', pantsShade: '#050a1c',
    shoe: '#141418', shoeLace: '#3a3a42',
  };
  drawShadow(ctx);
  drawLegs(ctx, pose, palette, 'normal');
  drawTorso(ctx, pose, palette, 'normal');
  // Hood sitting at the back of the shoulders (Yuji's signature hoodie look).
  const hoodY = 40 + pose.body;
  // Hood wraps around the back of the neck, slightly puffed.
  px(ctx, 24, hoodY, 32, 8, palette.jacket);
  px(ctx, 24, hoodY, 32, 2, palette.jacketHi);
  px(ctx, 24, hoodY + 7, 32, 1, palette.jacketShade);
  // Inner hood shadow
  px(ctx, 28, hoodY + 2, 24, 4, palette.jacketShade);
  // Drawstrings
  px(ctx, 34, hoodY + 8, 1, 5, '#e8d070');
  px(ctx, 45, hoodY + 8, 1, 5, '#e8d070');
  px(ctx, 34, hoodY + 13, 2, 1, '#a87820');
  px(ctx, 45, hoodY + 13, 2, 1, '#a87820');
  drawArms(ctx, pose, palette, 'normal');
  drawHead(ctx, pose, palette, (cx, x, y) => {
    // Eyebrows (determined brow) — anime expressive shape.
    px(ctx, x + 3, y + 5, 5, 1, '#3a1a10');
    px(ctx, x + 13, y + 5, 5, 1, '#3a1a10');
    px(ctx, x + 3, y + 6, 1, 1, '#3a1a10');
    px(ctx, x + 17, y + 6, 1, 1, '#3a1a10');
    // Eyes — large anime style with white + iris + pupil + highlight.
    if (!pose.blink) {
      // Left eye
      px(ctx, x + 3, y + 7, 5, 4, '#ffffff');
      px(ctx, x + 4, y + 7, 3, 4, '#f8c378');   // iris (golden-brown)
      px(ctx, x + 5, y + 8, 2, 2, '#2a1408');   // pupil
      px(ctx, x + 5, y + 7, 1, 1, '#ffffff');   // highlight
      // Right eye
      px(ctx, x + 13, y + 7, 5, 4, '#ffffff');
      px(ctx, x + 14, y + 7, 3, 4, '#f8c378');
      px(ctx, x + 15, y + 8, 2, 2, '#2a1408');
      px(ctx, x + 15, y + 7, 1, 1, '#ffffff');
    } else {
      // Closed eyes (smile arcs)
      px(ctx, x + 3, y + 9, 5, 1, '#2a1408');
      px(ctx, x + 4, y + 8, 3, 1, '#2a1408');
      px(ctx, x + 13, y + 9, 5, 1, '#2a1408');
      px(ctx, x + 14, y + 8, 3, 1, '#2a1408');
    }
    // Nose hint
    px(ctx, x + 10, y + 10, 1, 2, palette.skinShade);
    // Mouth — slight open confident grin
    px(ctx, x + 8, y + 13, 5, 1, '#6a2818');
    px(ctx, x + 9, y + 14, 3, 1, '#8a3820');
  });
  // Hair: pink top with obvious undercut, messy spikes.
  const hairY = 22 + pose.head;
  // Undercut buzzed sides (darker pink-brown roots)
  px(ctx, 28, hairY + 5, 2, 6, '#5a2838');
  px(ctx, 50, hairY + 5, 2, 6, '#5a2838');
  px(ctx, 28, hairY + 5, 2, 1, '#70384a');
  px(ctx, 50, hairY + 5, 2, 1, '#70384a');
  // Main pink hair mass (top part above the undercut line)
  px(ctx, 29, hairY, 22, 7, '#e86a84');
  // Bright highlight (top-lit anime look)
  px(ctx, 29, hairY, 22, 2, '#ff9ab0');
  px(ctx, 31, hairY + 1, 18, 1, '#ffb8c8');
  // Shadow band at hairline
  px(ctx, 29, hairY + 6, 22, 1, '#c84e68');
  // Defined spikes (irregular, anime-style peaks)
  px(ctx, 30, hairY - 2, 3, 3, '#e86a84');
  px(ctx, 30, hairY - 2, 3, 1, '#ff9ab0');
  px(ctx, 34, hairY - 3, 4, 4, '#e86a84');
  px(ctx, 34, hairY - 3, 4, 1, '#ff9ab0');
  px(ctx, 39, hairY - 4, 3, 5, '#e86a84');
  px(ctx, 39, hairY - 4, 3, 1, '#ff9ab0');
  px(ctx, 43, hairY - 3, 4, 4, '#e86a84');
  px(ctx, 43, hairY - 3, 4, 1, '#ff9ab0');
  px(ctx, 47, hairY - 2, 3, 3, '#e86a84');
  px(ctx, 47, hairY - 2, 3, 1, '#ff9ab0');
  // Front bangs sweeping down to brow
  px(ctx, 33, hairY + 6, 3, 2, '#e86a84');
  px(ctx, 33, hairY + 6, 1, 2, '#c84e68');
  px(ctx, 44, hairY + 6, 3, 2, '#e86a84');
  px(ctx, 46, hairY + 6, 1, 2, '#c84e68');
}

function drawSukuna(ctx, pose) {
  // Ryomen Sukuna — King of Curses. Pink hair with dark stripe markings,
  // four red eyes (two stacked pairs), black markings across face and body,
  // ghostly extra arms behind torso, dark crimson kimono.
  const palette = {
    skin: '#e8c4a0', skinShade: '#a87050',
    jacket: '#1a0410', jacketHi: '#3a0a22', jacketShade: '#0a000a',
    jacketLine: '#800820', collar: '#000000', belt: '#3a0a18',
    buckle: '#8a0020', cuff: '#0a0008',
    pants: '#12000a', pantsHi: '#2a0414', pantsShade: '#050004',
    shoe: '#000000', shoeLace: '#3a0a18',
  };
  drawShadow(ctx);
  // Ghost arms FIRST (behind torso), low alpha — true Sukuna four-arm look.
  const ghostY = 48 + pose.body;
  ctx.globalAlpha = 0.45;
  drawArm(ctx, 19 + (pose.armA[0] >> 1), ghostY + (pose.armA[1] >> 1), palette, 17);
  drawArm(ctx, 56 + (pose.armB[0] >> 1), ghostY + (pose.armB[1] >> 1), palette, 17);
  ctx.globalAlpha = 0.7;
  // Faint dark aura behind the ghost arms
  ctx.fillStyle = 'rgba(80,0,20,0.25)';
  ctx.fillRect(16, 46 + pose.body, 48, 28);
  ctx.globalAlpha = 1;
  drawLegs(ctx, pose, palette, 'normal');
  drawTorso(ctx, pose, palette, 'normal');
  drawArms(ctx, pose, palette, 'normal');
  // Body markings across chest (through open kimono)
  const cy = 50 + pose.body;
  px(ctx, 35, cy + 4, 10, 1, '#000000');
  px(ctx, 36, cy + 8, 8, 1, '#000000');
  px(ctx, 35, cy + 12, 10, 1, '#000000');
  px(ctx, 37, cy + 16, 6, 1, '#000000');
  // Black markings on forearms (kimono sleeves are rolled up visually)
  drawHead(ctx, pose, palette, (cx, x, y) => {
    // Facial markings — Sukuna's iconic horizontal dark stripes across cheeks
    // and eye area (two pairs stacked).
    // Forehead marks
    px(ctx, x + 6, y + 1, 3, 1, '#000000');
    px(ctx, x + 11, y + 1, 3, 1, '#000000');
    // Cheek stripes (horizontal bars above & below eyes)
    px(ctx, x + 1, y + 4, 6, 1, '#000000');
    px(ctx, x + 13, y + 4, 6, 1, '#000000');
    px(ctx, x + 1, y + 11, 6, 1, '#000000');
    px(ctx, x + 13, y + 11, 6, 1, '#000000');
    // Lower jaw markings
    px(ctx, x + 2, y + 15, 5, 1, '#000000');
    px(ctx, x + 13, y + 15, 5, 1, '#000000');
    // Eyes — two stacked pairs (four eyes total), blood red with dark sclera.
    if (!pose.blink) {
      // Upper eye row
      px(ctx, x + 3, y + 6, 5, 3, '#2a0008');
      px(ctx, x + 13, y + 6, 5, 3, '#2a0008');
      px(ctx, x + 4, y + 6, 3, 2, '#ff3050');
      px(ctx, x + 14, y + 6, 3, 2, '#ff3050');
      px(ctx, x + 5, y + 7, 1, 1, '#ffffff');
      px(ctx, x + 15, y + 7, 1, 1, '#ffffff');
      // Lower eye row (second set of eyes)
      px(ctx, x + 3, y + 9, 5, 3, '#2a0008');
      px(ctx, x + 13, y + 9, 5, 3, '#2a0008');
      px(ctx, x + 4, y + 10, 3, 1, '#ff3050');
      px(ctx, x + 14, y + 10, 3, 1, '#ff3050');
    }
    // Wide demonic grin — bares teeth
    px(ctx, x + 5, y + 14, 10, 1, '#200008');
    px(ctx, x + 6, y + 15, 8, 1, '#200008');
    // Teeth
    px(ctx, x + 7, y + 14, 1, 1, '#f0d8b0');
    px(ctx, x + 9, y + 14, 1, 1, '#f0d8b0');
    px(ctx, x + 11, y + 14, 1, 1, '#f0d8b0');
    px(ctx, x + 13, y + 14, 1, 1, '#f0d8b0');
  });
  // Hair: pink with characteristic black tiger-stripe markings running through.
  const hairY = 22 + pose.head;
  // Main pink hair
  px(ctx, 28, hairY, 24, 7, '#e86a84');
  px(ctx, 28, hairY, 24, 2, '#ff9ab0');
  // Back hair fringe
  px(ctx, 28, hairY + 5, 24, 2, '#c84e68');
  // Stripes (signature markings through hair)
  px(ctx, 31, hairY - 1, 2, 8, '#000000');
  px(ctx, 36, hairY - 2, 2, 9, '#000000');
  px(ctx, 41, hairY - 2, 2, 9, '#000000');
  px(ctx, 46, hairY - 1, 2, 8, '#000000');
  // Spikes (mirrors Yuji silhouette but with angular marks)
  px(ctx, 30, hairY - 3, 2, 3, '#e86a84');
  px(ctx, 35, hairY - 4, 3, 4, '#e86a84');
  px(ctx, 40, hairY - 5, 3, 5, '#e86a84');
  px(ctx, 45, hairY - 4, 3, 4, '#e86a84');
  // Side locks
  px(ctx, 27, hairY + 4, 2, 6, '#e86a84');
  px(ctx, 27, hairY + 4, 1, 6, '#c84e68');
  px(ctx, 51, hairY + 4, 2, 6, '#e86a84');
  px(ctx, 52, hairY + 4, 1, 6, '#c84e68');
}

function drawMahito(ctx, pose) {
  // Mahito — The Cursed Spirit. Patchwork stitched skin, mismatched eyes
  // (heterochromia), stitched mouth, blue-grey center-parted hair, lean
  // casual-dressed human-like frame.
  const palette = {
    skin: '#d8c8d0', skinShade: '#9a8894',
    jacket: '#3c3848', jacketHi: '#524858', jacketShade: '#1c1826',
    jacketLine: '#14121c', collar: '#14121c', belt: '#14121c',
    buckle: '#5a5666', cuff: '#1a1822',
    pants: '#1a1a26', pantsHi: '#2c2c3e', pantsShade: '#0a0a12',
    shoe: '#0c0c14', shoeLace: '#2a2a36',
  };
  drawShadow(ctx);
  drawLegs(ctx, pose, palette, 'normal');
  drawTorso(ctx, pose, palette, 'normal');
  drawArms(ctx, pose, palette, 'normal');
  // Visible stitches across torso (sash line + patchwork seams)
  const sy = 48 + pose.body;
  // Vertical seam down the chest
  px(ctx, 40, sy + 4, 1, 20, '#1a1820');
  // X stitches across the seam
  for (let i = 0; i < 4; i++) {
    px(ctx, 39, sy + 6 + i * 4, 3, 1, '#2a2834');
    px(ctx, 40, sy + 5 + i * 4, 1, 3, '#2a2834');
  }
  // Diagonal patchwork seam (shoulder to hip)
  for (let i = 0; i < 7; i++) {
    px(ctx, 32 + i, sy + 4 + i, 1, 1, '#1a1820');
    if (i % 2 === 0) px(ctx, 31 + i, sy + 5 + i, 3, 1, 'rgba(26,24,32,0.7)');
  }
  drawHead(ctx, pose, palette, (cx, x, y) => {
    // Facial stitches — Mahito's signature patchwork skin.
    // Vertical line down left cheek
    px(ctx, x + 3, y + 3, 1, 11, '#1a1820');
    for (let i = 0; i < 4; i++) px(ctx, x + 2, y + 4 + i * 3, 3, 1, '#2c2834');
    // Horizontal forehead stitch
    px(ctx, x + 5, y + 2, 10, 1, '#1a1820');
    for (let i = 0; i < 4; i++) px(ctx, x + 5 + i * 3, y + 1, 1, 3, '#2c2834');
    // Right jaw diagonal
    px(ctx, x + 16, y + 10, 1, 6, '#1a1820');
    px(ctx, x + 15, y + 10, 3, 1, '#2c2834');
    px(ctx, x + 15, y + 13, 3, 1, '#2c2834');
    // Eyebrows (subtle, almost nonchalant)
    px(ctx, x + 3, y + 5, 4, 1, '#2a2a36');
    px(ctx, x + 13, y + 5, 4, 1, '#2a2a36');
    // Mismatched eyes — left larger teal, right smaller dark purple.
    if (!pose.blink) {
      // Left eye (bigger, teal-green)
      px(ctx, x + 2, y + 7, 6, 5, '#ffffff');
      px(ctx, x + 3, y + 8, 4, 4, '#4a8088');
      px(ctx, x + 4, y + 9, 2, 2, '#0a2024');
      px(ctx, x + 4, y + 8, 1, 1, '#c8f0f0');
      // Right eye (smaller, darker violet)
      px(ctx, x + 13, y + 8, 4, 3, '#ffffff');
      px(ctx, x + 14, y + 8, 2, 3, '#6a4080');
      px(ctx, x + 14, y + 9, 1, 1, '#1a0828');
      px(ctx, x + 14, y + 8, 1, 1, '#e0c8f0');
    } else {
      px(ctx, x + 3, y + 10, 4, 1, '#0a2024');
      px(ctx, x + 13, y + 10, 3, 1, '#1a0828');
    }
    // Nose hint
    px(ctx, x + 10, y + 10, 1, 2, palette.skinShade);
    // Stitched mouth — jagged zig-zag stitch pattern, wider than Yuji's.
    const mY = y + 14;
    px(ctx, x + 5, mY, 11, 1, '#1a1820');
    // Zig-zag stitches going above and below the lip line
    for (let i = 0; i < 6; i++) {
      px(ctx, x + 5 + i * 2, mY + (i % 2 === 0 ? -1 : 1), 1, 1, '#2c2834');
    }
    // Dark void inside mouth
    px(ctx, x + 7, mY, 7, 1, '#000000');
  });
  // Hair: center-parted wavy blue-grey, messy and a bit longer than Yuji.
  const hairY = 22 + pose.head;
  // Main blue-grey mass
  px(ctx, 27, hairY, 26, 7, '#5a6c88');
  // Bright highlight band (top-lit)
  px(ctx, 27, hairY, 26, 2, '#8ea0b8');
  px(ctx, 29, hairY + 1, 22, 1, '#a8bcd0');
  // Shadow underlayer
  px(ctx, 27, hairY + 5, 26, 2, '#3e4c66');
  // Center part (V-shape revealing skin)
  px(ctx, 39, hairY + 1, 3, 5, palette.skin);
  px(ctx, 40, hairY + 3, 1, 3, palette.skinShade);
  // Wavy bangs descending over brow (asymmetric left/right)
  px(ctx, 33, hairY + 6, 4, 3, '#5a6c88');
  px(ctx, 33, hairY + 6, 1, 3, '#3e4c66');
  px(ctx, 43, hairY + 6, 5, 4, '#5a6c88');
  px(ctx, 47, hairY + 6, 1, 4, '#3e4c66');
  // Tufts sticking up on each side (cowlicks)
  px(ctx, 29, hairY - 2, 3, 2, '#5a6c88');
  px(ctx, 48, hairY - 2, 3, 2, '#5a6c88');
  // Side locks covering ears
  px(ctx, 27, hairY + 5, 2, 6, '#5a6c88');
  px(ctx, 51, hairY + 5, 2, 6, '#5a6c88');
}

function drawTodo(ctx, pose) {
  // Aoi Todo — The Best Friend. Largest sprite, muscular heavyweight build,
  // short brown hair, vertical scar on left brow, Kyoto Jujutsu High uniform
  // (lighter blue-grey), Vibraslap prosthetic rendered on the left hand.
  const palette = {
    skin: '#d8a878', skinShade: '#a87550',
    jacket: '#3a4858', jacketHi: '#4e5c6e', jacketShade: '#1a222c',
    jacketLine: '#c49838', collar: '#0a0a10', belt: '#5a4022',
    buckle: '#d4a030', cuff: '#1c242e',
    pants: '#1c242e', pantsHi: '#2c3440', pantsShade: '#080c12',
    shoe: '#06080c', shoeLace: '#2a2a36',
  };
  drawShadow(ctx);
  drawLegs(ctx, pose, palette, 'big');
  drawTorso(ctx, pose, palette, 'big');
  // Chest muscle definition (pectorals) over the jacket — brawler look.
  const cy = 48 + pose.body;
  px(ctx, 30, cy + 4, 20, 1, palette.jacketShade);
  px(ctx, 40, cy + 5, 1, 8, palette.jacketShade);
  px(ctx, 30, cy + 12, 20, 1, palette.jacketShade);
  // Kyoto emblem on chest (gold trim)
  px(ctx, 37, cy + 16, 6, 4, palette.jacketLine);
  px(ctx, 38, cy + 17, 4, 2, '#8a6820');
  drawArms(ctx, pose, palette, 'big');
  // Larger head with square jaw (Todo's masculine silhouette).
  const top = 22 + pose.head;
  // Crown
  px(ctx, 30, top, 20, 1, palette.skin);
  px(ctx, 28, top + 1, 24, 1, palette.skin);
  // Main head
  px(ctx, 27, top + 2, 26, 17, palette.skin);
  // Top highlight
  px(ctx, 27, top + 2, 26, 1, lighten(palette.skin, 0.15));
  px(ctx, 28, top + 3, 5, 8, lighten(palette.skin, 0.08));
  // Right-side shading
  px(ctx, 51, top + 2, 2, 16, palette.skinShade);
  // Square jaw
  px(ctx, 28, top + 17, 24, 1, palette.skinShade);
  px(ctx, 30, top + 18, 20, 1, palette.skinShade);
  px(ctx, 32, top + 19, 16, 1, palette.skinShade);
  // Thick neck
  px(ctx, 32, top + 20, 16, 4, palette.skin);
  px(ctx, 32, top + 20, 16, 1, palette.skinShade);
  px(ctx, 45, top + 21, 3, 3, palette.skinShade);
  // Ears
  px(ctx, 26, top + 8, 2, 5, palette.skin);
  px(ctx, 26, top + 8, 1, 5, palette.skinShade);
  px(ctx, 52, top + 8, 2, 5, palette.skin);
  px(ctx, 53, top + 8, 1, 5, palette.skinShade);
  // Heavy brows (serious determined look)
  px(ctx, 30, top + 6, 7, 2, '#2a1810');
  px(ctx, 43, top + 6, 7, 2, '#2a1810');
  // Eyes (serious, narrow)
  if (!pose.blink) {
    // Left eye
    px(ctx, 31, top + 9, 6, 3, '#ffffff');
    px(ctx, 32, top + 9, 4, 3, '#5a3820');
    px(ctx, 33, top + 10, 2, 2, '#1a0a04');
    px(ctx, 33, top + 9, 1, 1, '#ffffff');
    // Right eye
    px(ctx, 43, top + 9, 6, 3, '#ffffff');
    px(ctx, 44, top + 9, 4, 3, '#5a3820');
    px(ctx, 45, top + 10, 2, 2, '#1a0a04');
    px(ctx, 45, top + 9, 1, 1, '#ffffff');
  } else {
    px(ctx, 31, top + 10, 6, 1, '#1a0a04');
    px(ctx, 43, top + 10, 6, 1, '#1a0a04');
  }
  // Nose (stronger, masculine)
  px(ctx, 39, top + 10, 2, 4, palette.skinShade);
  px(ctx, 39, top + 13, 2, 1, '#8a5830');
  // Scar — vertical through left brow (JJK anime accurate)
  px(ctx, 33, top + 4, 1, 10, '#c85040');
  px(ctx, 33, top + 4, 1, 2, '#ffaa90');
  px(ctx, 32, top + 6, 1, 1, '#c85040');
  px(ctx, 34, top + 11, 1, 1, '#c85040');
  // Mouth (firm set, serious)
  px(ctx, 35, top + 15, 10, 1, '#2a1008');
  px(ctx, 37, top + 16, 6, 1, '#4a2818');
  // Hair: very short dark brown — undercut with defined hairline.
  const hy = top - 2;
  // Base dark hair layer
  px(ctx, 26, hy, 28, 6, '#2a1810');
  // Highlight (top-lit)
  px(ctx, 26, hy, 28, 2, '#4a3420');
  px(ctx, 28, hy + 1, 24, 1, '#5a4228');
  // Hairline shadow
  px(ctx, 27, hy + 5, 26, 1, '#1a0c08');
  // Sides faded tight
  px(ctx, 26, hy + 6, 2, 4, '#1a0c08');
  px(ctx, 52, hy + 6, 2, 4, '#1a0c08');
  // A few subtle texture strands
  px(ctx, 30, hy + 1, 1, 3, '#1a0c08');
  px(ctx, 38, hy, 1, 4, '#1a0c08');
  px(ctx, 46, hy + 1, 1, 3, '#1a0c08');
  // Vibraslap prosthetic on the left hand — detailed metallic device.
  const armY = 50 + pose.body;
  const lhx = (20 + pose.armA[0]);
  const lhy = armY + pose.armA[1] + 18;
  // Metal base plate
  px(ctx, lhx - 2, lhy, 8, 7, '#9a9aa8');
  px(ctx, lhx - 2, lhy, 8, 1, '#c8c8d4');
  px(ctx, lhx - 2, lhy + 6, 8, 1, '#5a5a68');
  // Inner dark cavity
  px(ctx, lhx, lhy + 2, 4, 3, '#2a2a36');
  // Slap ball hanging off
  px(ctx, lhx + 4, lhy + 3, 2, 2, '#c49040');
  // Rivets
  px(ctx, lhx - 1, lhy + 1, 1, 1, '#ffffff');
  px(ctx, lhx + 4, lhy + 1, 1, 1, '#ffffff');
}

// =========================================================
// Signature attack accessories — per JJK_SMASH_GAME_PLAN.md section 4.
// =========================================================
// Each character morphs / equips a signature implement per attack so every
// move reads uniquely (Mahito's limbs become blades/clubs/spikes, Sukuna's
// disjointed blades + four-arm slashes, Todo's Playful Cloud staff + clap,
// Gojo's Blue/Red orbs + open palms, Yuji's cursed fists + Black Flash).
// Drawn into the BODY layer (right after the base character) so they pick up
// the silhouette outline. Pre-scale sprite space; forward = +x. Front-hand is
// around x = (big?55:53) + armB[0], top at y = 50 + body + armB[1] + 18.

// Horizontal tapering blade from (x,y) toward `dir` (±1), base height `h`,
// length `len`; outer ~third uses `tip` (a cursed-energy color).
function bladeH(ctx, x, y, len, h, body, tip, dir = 1) {
  for (let i = 0; i < len; i++) {
    const hh = Math.max(1, Math.round(h * (1 - i / len)));
    px(ctx, dir > 0 ? x + i : x - i, y - (hh >> 1), 1, hh, i > len * 0.65 ? tip : body);
  }
}
// Vertical tapering spike from (x,y), base width `w`, length `len`; dir -1 = up.
function bladeV(ctx, x, y, len, w, body, tip, dir = -1) {
  for (let i = 0; i < len; i++) {
    const ww = Math.max(1, Math.round(w * (1 - i / len)));
    px(ctx, x - (ww >> 1), dir < 0 ? y - i : y + i, ww, 1, i > len * 0.65 ? tip : body);
  }
}
function orbAt(ctx, cx, cy, r, core, mid, edge) {
  ctx.fillStyle = edge; ctx.beginPath(); ctx.arc(cx, cy, r + 2, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = mid;  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = core; ctx.beginPath(); ctx.arc(cx, cy, r * 0.5, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#ffffff'; px(ctx, (cx - r * 0.4) | 0, (cy - r * 0.4) | 0, 2, 2);
}

// Mahito — Idle Transfiguration: every attack reshapes his body. (Plan 4.3)
function sigMahito(ctx, name, pose) {
  const baseY = 50 + pose.body;
  const hx = 53 + pose.armB[0];
  const armTop = baseY + pose.armB[1];
  const handY = armTop + 18;
  const F = '#c8b8c2', H = '#e6d8e2', G = '#9aff7a', S = '#1a1820', STONE = '#6a6a74', STONEHI = '#8c8c96';
  if (name === 'ftilt_hit' || name === 'ftilt_wind' || name === 'fair') {
    // Blade Arm — forearm stretches into a long blade.
    const len = name === 'ftilt_wind' ? 14 : 26;
    px(ctx, hx, handY - 2, 7, 9, F); px(ctx, hx, handY - 2, 7, 3, H);
    bladeH(ctx, hx + 6, handY + 2, len, 11, F, G);
    bladeH(ctx, hx + 7, handY + 2, len - 3, 4, H, G);
    px(ctx, hx + 2, handY + 1, 1, 6, S);
  } else if (name === 'fsmash_hit' || name === 'fsmash_max' || name === 'fsmash_wind') {
    // Body Slam Morph — arm balloons into a massive club.
    const reach = name === 'fsmash_wind' ? 2 : 13;
    px(ctx, hx - 2, baseY + 2, 10, 20, F); px(ctx, hx - 2, baseY + 2, 10, 4, H);
    px(ctx, hx + reach, baseY - 3, 16, 31, F); px(ctx, hx + reach, baseY - 3, 16, 5, H);
    for (let i = 0; i < 3; i++) px(ctx, hx + reach + 3 + i * 5, baseY + 2, 1, 22, S);
    bladeH(ctx, hx + reach + 16, baseY + 4, 7, 7, F, G);
    bladeH(ctx, hx + reach + 16, baseY + 18, 7, 7, F, G);
  } else if (name === 'utilt_hit' || name === 'utilt_wind') {
    // Spike Launch — arm becomes an upward spike.
    bladeV(ctx, hx + 2, armTop + 4, name === 'utilt_wind' ? 12 : 24, 11, F, G);
  } else if (name === 'dtilt_hit' || name === 'dtilt_wind') {
    // Tendril Sweep — arm extends as a low tendril.
    const len = name === 'dtilt_wind' ? 16 : 30;
    px(ctx, 48, 82, 7, 9, F);
    bladeH(ctx, 55, 86, len, 7, F, G);
  } else if (name === 'usmash_hit' || name === 'usmash_wind') {
    // Spike Crown — spikes erupt upward from his back.
    const n = name === 'usmash_wind' ? 3 : 5;
    for (let i = 0; i < n; i++) bladeV(ctx, 26 + i * 7, 34 + pose.body, 22 - Math.abs(i - (n - 1) / 2) * 4, 7, F, G);
  } else if (name === 'dsmash_hit' || name === 'dsmash_wind') {
    // Ground Spike Net — spikes along the ground on both sides.
    for (let i = 0; i < 5; i++) {
      bladeV(ctx, 16 + i * 4, 98, 9, 5, F, G);
      bladeV(ctx, 48 + i * 4, 98, 9, 5, F, G);
    }
  } else if (name === 'uair') {
    for (let i = 0; i < 4; i++) bladeV(ctx, 28 + i * 6, 24 + pose.body, 18, 6, F, G);
  } else if (name === 'dair') {
    // Stone-block legs — heavy spike.
    px(ctx, 30, 90, 22, 18, STONE); px(ctx, 30, 90, 22, 4, STONEHI);
    for (let i = 0; i < 3; i++) px(ctx, 33 + i * 7, 94, 2, 12, '#46464e');
  } else if (name === 'bair') {
    // Tail whip backward.
    px(ctx, 24, baseY + 14, 8, 7, F);
    bladeH(ctx, 24, baseY + 17, 24, 8, F, G, -1);
  } else if (name === 'nair') {
    // Spiked ball — short spikes ringing the body.
    for (let a = 0; a < 8; a++) {
      const ang = (a / 8) * Math.PI * 2;
      px(ctx, (40 + Math.cos(ang) * 14) | 0, (baseY + 14 + Math.sin(ang) * 14) | 0, 3, 3, a % 2 ? G : F);
    }
  } else if (name === 'upspecial_hit' || name === 'upspecial_wind') {
    // Wing Morph — back sprouts wings.
    for (let i = 0; i < 5; i++) { px(ctx, 26 - i * 2, armTop + i * 4, 8 + i * 2, 3, F); px(ctx, 26 - i * 2, armTop + i * 4, 3, 3, H); }
    for (let i = 0; i < 5; i++) { px(ctx, 46 + i * 2, armTop + i * 4, 8 + i * 2, 3, F); px(ctx, 54 + i * 2, armTop + i * 4, 3, 3, H); }
  } else if (name === 'neutralspecial_hit' || name === 'neutralspecial_wind' || name === 'downspecial_hit' || name === 'downspecial_wind') {
    // Soul Touch / Body Disfigure — both hands splay with cursed glow.
    px(ctx, hx, handY - 2, 8, 10, F); px(ctx, hx, handY - 2, 8, 3, G);
    for (let i = 0; i < 3; i++) bladeH(ctx, hx + 8, handY - 1 + i * 4, 6, 3, F, G);
  }
}

// Sukuna — disjointed invisible blades + the four-arm idle. (Plan 4.2)
function sigSukuna(ctx, name, pose) {
  const baseY = 50 + pose.body;
  const hx = 53 + pose.armB[0];
  const handY = baseY + pose.armB[1] + 18;
  const R = '#ff3050', RH = '#ff96a6';
  if (name === 'usmash_hit' || name === 'usmash_wind') {
    // Four arms slash upward simultaneously.
    const n = name === 'usmash_wind' ? 3 : 4;
    for (let i = 0; i < n; i++) bladeV(ctx, 22 + i * 11, 36 + pose.body, 26 - Math.abs(i - (n - 1) / 2) * 5, 5, R, RH);
  } else if (name === 'fsmash_hit' || name === 'fsmash_max' || name === 'fsmash_wind') {
    // Cleave — one heavy descending blade reaching past his body.
    const len = name === 'fsmash_wind' ? 12 : 30;
    bladeH(ctx, hx, handY - 6, len, 20, R, RH);
    bladeH(ctx, hx + 2, handY - 4, len - 4, 8, RH, '#ffffff');
  } else if (name === 'uair') {
    for (let i = 0; i < 3; i++) bladeV(ctx, 30 + i * 8, 24 + pose.body, 22, 4, R, RH);
  } else if (name === 'dair') {
    bladeV(ctx, 40, baseY + 26, 22, 8, R, RH, 1);
  } else if (name === 'nair') {
    for (let a = 0; a < 6; a++) {
      const ang = (a / 6) * Math.PI * 2;
      bladeH(ctx, (40 + Math.cos(ang) * 8) | 0, (baseY + 14 + Math.sin(ang) * 8) | 0, 12, 4, R, RH, Math.cos(ang) >= 0 ? 1 : -1);
    }
  } else if (name === 'jab_hit' || name === 'jab_hit2' || name === 'ftilt_hit' || name === 'fair' || name === 'bair') {
    // Disjointed slash extends well past the hand.
    const dir = name === 'bair' ? -1 : 1;
    const x0 = dir > 0 ? hx + 4 : 28;
    bladeH(ctx, x0, handY, 22, 10, R, RH, dir);
  } else if (name === 'upspecial_hit' || name === 'upspecial_wind') {
    // Cursed Flame Jump — flame licks up around him.
    for (let i = 0; i < 6; i++) bladeV(ctx, 28 + i * 5, baseY + 24, 10 + (i % 3) * 6, 5, '#ff7a30', '#ffd24a');
  }
}

// Todo — Playful Cloud cursed tool, Boogie-Woogie clap, heavy fists. (Plan 4.4)
function sigTodo(ctx, name, pose) {
  const baseY = 50 + pose.body;
  const hx = 55 + pose.armB[0];
  const handY = baseY + pose.armB[1] + 18;
  if (name === 'sidespecial_hit' || name === 'sidespecial_wind') {
    // Playful Cloud — three-section iron staff.
    const y = baseY + 6, M = '#b8bcc8', MH = '#e4e8f0', D = '#5a5e68';
    const segs = name === 'sidespecial_wind' ? 2 : 3;
    for (let s = 0; s < segs; s++) {
      const sx = hx - 4 + s * 13;
      px(ctx, sx, y, 11, 6, M); px(ctx, sx, y, 11, 2, MH); px(ctx, sx, y + 5, 11, 1, D);
      if (s < segs - 1) { px(ctx, sx + 11, y + 2, 2, 1, D); px(ctx, sx + 11, y + 3, 2, 1, D); }
    }
  } else if (name === 'neutralspecial_hit' || name === 'neutralspecial_wind' ||
             name === 'downspecial_hit' || name === 'downspecial_wind') {
    // Boogie Woogie / Feint Clap — both hands meet center with a flash.
    const cx = 40, cy = baseY + 16;
    px(ctx, cx - 9, cy, 9, 9, '#d8a878'); px(ctx, cx, cy, 9, 9, '#d8a878');
    px(ctx, cx - 9, cy, 18, 3, '#e8c098');
    px(ctx, cx - 2, cy - 6, 4, 21, '#ffffff'); px(ctx, cx - 6, cy + 2, 12, 4, '#fff7c8');
  } else if (name === 'fsmash_hit' || name === 'fsmash_max' || name === 'fsmash_wind') {
    // Crushing Blow — oversized haymaker fist.
    px(ctx, hx - 3, handY - 5, 14, 16, '#d8a878'); px(ctx, hx - 3, handY - 5, 14, 4, '#e8c098');
    px(ctx, hx - 3, handY - 5, 3, 16, '#a87850');
  } else if (name === 'usmash_hit' || name === 'usmash_wind') {
    // Suplex Launch — both arms reach up to grab.
    px(ctx, 22, baseY - 4, 6, 16, '#d8a878'); px(ctx, 52, baseY - 4, 6, 16, '#d8a878');
    px(ctx, 22, baseY - 4, 6, 3, '#e8c098'); px(ctx, 52, baseY - 4, 6, 3, '#e8c098');
  }
}

// Gojo — open-palm strikes + Limitless Blue / Reversal Red. (Plan 4.1)
function sigGojo(ctx, name, pose) {
  const baseY = 50 + pose.body;
  const hx = 53 + pose.armB[0];
  const handY = baseY + pose.armB[1] + 18;
  if (name === 'neutralspecial_hit' || name === 'neutralspecial_wind' ||
      name === 'upspecial_hit' || name === 'upspecial_wind' ||
      name === 'downspecial_hit' || name === 'downspecial_wind') {
    // Cursed Technique Lapse: Blue — attraction orb cradled in the palm.
    orbAt(ctx, hx + 6, handY + 1, 7, '#e8f6ff', '#5fd7ff', '#1850b0');
  } else if (name === 'sidespecial_hit' || name === 'sidespecial_wind') {
    // Cursed Technique Reversal: Red — repulsion orb (distinct red, not Blue).
    orbAt(ctx, hx + 7, handY + 1, 7, '#ffe0e0', '#ff4050', '#7a0010');
  } else if (/^(jab|ftilt|utilt|dtilt|fsmash|usmash|dsmash)_/.test(name) || name === 'fair' || name === 'bair') {
    // Open-palm strike plate — Gojo fights with flat palms, not fists.
    px(ctx, hx, handY - 2, 6, 10, '#f5d8b6');
    px(ctx, hx + 5, handY - 1, 1, 8, '#c9a577');
    px(ctx, hx, handY - 2, 6, 2, '#ffe8cc');
  }
}

// Yuji — bare-knuckle brawler, cursed fists, Black Flash, Divergent Fist. (Plan 4.2)
function sigYuji(ctx, name, pose) {
  const baseY = 50 + pose.body;
  const hx = 53 + pose.armB[0];
  const handY = baseY + pose.armB[1] + 18;
  if (name === 'neutralspecial_hit' || name === 'neutralspecial_wind') {
    // Black Flash — fist wreathed in black/purple cursed sparks.
    px(ctx, hx - 1, handY - 3, 9, 11, '#0a0014'); px(ctx, hx - 1, handY - 3, 9, 3, '#5a0a80');
    for (let i = 0; i < 4; i++) px(ctx, hx - 3 + (i * 5 % 12), handY - 5 + (i * 7 % 16), 2, 2, '#b050ff');
  } else if (name === 'fsmash_hit' || name === 'fsmash_max' || name === 'fsmash_wind') {
    // Divergent Fist — bright cursed-energy straight.
    px(ctx, hx - 1, handY - 3, 9, 11, '#ffb84a'); px(ctx, hx - 1, handY - 3, 9, 3, '#fff3c8');
    px(ctx, hx + 8, handY, 4, 4, '#fff3c8');
  } else if (/^(jab|ftilt|utilt|dtilt|usmash|dsmash)_/.test(name) || name === 'fair' || name === 'bair' || name === 'nair' || name === 'uair' || name === 'sidespecial_hit' || name === 'sidespecial_wind') {
    // Cursed-energy knuckle glow on his strikes.
    px(ctx, hx, handY - 2, 7, 9, '#f5cfa3');
    px(ctx, hx + 1, handY - 1, 5, 3, '#ffd27a');
    px(ctx, hx + 6, handY, 2, 5, '#ffb84a');
  }
}

const SIGNATURE = {
  gojo: sigGojo,
  yuji: sigYuji,
  sukuna: sigSukuna,
  mahito: sigMahito,
  todo: sigTodo,
};

const DRAWERS = {
  gojo: drawGojo,
  yuji: drawYuji,
  sukuna: drawSukuna,
  mahito: drawMahito,
  todo: drawTodo,
};

// =========================================================
// Build pose with FX (slash trails, energy orbs, auras)
// =========================================================
const CE_COLORS = {
  gojo:   { core: '#e8f6ff', mid: '#5fd7ff', edge: '#1850b0' },
  yuji:   { core: '#fff3c8', mid: '#ffb84a', edge: '#a04000' },
  sukuna: { core: '#ffd0d0', mid: '#ff3050', edge: '#600010' },
  mahito: { core: '#e6ffd0', mid: '#9aff7a', edge: '#206020' },
  todo:   { core: '#fff8c8', mid: '#ffe070', edge: '#806020' },
};

// Per-character, per-move FX recolor where a move's energy differs from the
// character's default cursed-energy hue (plan-accurate signature techniques).
function fxColorFor(character, poseName) {
  if (character === 'gojo' && poseName.startsWith('sidespecial'))
    return { core: '#ffe0e0', mid: '#ff4050', edge: '#7a0010' };   // Reversal: Red
  if (character === 'yuji' && poseName.startsWith('neutralspecial'))
    return { core: '#e8c0ff', mid: '#9f00ff', edge: '#1a0028' };   // Black Flash
  if (character === 'sukuna' && poseName.startsWith('upspecial'))
    return { core: '#ffe08a', mid: '#ff7a30', edge: '#7a1800' };   // Cursed Flame
  return CE_COLORS[character];
}

function drawPoseFX(ctx, pose, character, colorOverride) {
  const s = pose.swing;
  if (!s) return;
  const c = colorOverride || CE_COLORS[character] || { core: '#ffffff', mid: '#cccccc', edge: '#666666' };
  const fx = pose.fx || 'slash';
  ctx.save();
  if (fx === 'slash') {
    // Cursed-energy slash — multi-stage crescent trail with speed lines
    // and bright spark leading edge. Layered wide -> narrow -> core.
    // Outer glow
    ctx.globalAlpha = 0.18;
    ctx.fillStyle = c.edge;
    ctx.fillRect(s.x - 6, s.y - 5, s.w + 12, s.h + 10);
    ctx.globalAlpha = 0.35;
    ctx.fillRect(s.x - 4, s.y - 3, s.w + 8, s.h + 6);
    // Mid glow
    ctx.globalAlpha = 0.6;
    ctx.fillStyle = c.mid;
    ctx.fillRect(s.x - 2, s.y - 1, s.w + 4, s.h + 2);
    // Core crescent (tapered to tip)
    ctx.globalAlpha = 0.95;
    ctx.fillStyle = c.core;
    for (let i = 0; i < s.h; i++) {
      const inset = Math.abs((i - s.h / 2)) | 0;
      ctx.fillRect(s.x + inset, s.y + i, s.w - inset * 2, 1);
    }
    // Bright streaking trail (speed lines behind the blade)
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = c.mid;
    const midY = s.y + (s.h >> 1);
    ctx.fillRect(s.x - 6, midY - 1, 5, 1);
    ctx.fillRect(s.x - 10, midY, 4, 1);
    ctx.fillRect(s.x - 4, midY + 1, 3, 1);
    // Leading-edge spark (bright white tip)
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(s.x + s.w - 1, midY - 1, 2, 2);
    ctx.fillRect(s.x + s.w + 1, midY, 1, 1);
    // Scattered sparkles along the slash
    ctx.fillStyle = c.core;
    ctx.fillRect(s.x + (s.w >> 2), s.y - 2, 1, 1);
    ctx.fillRect(s.x + (s.w >> 1) + 2, s.y + s.h + 1, 1, 1);
    ctx.fillRect(s.x + (s.w * 3 >> 2), s.y - 1, 1, 1);
  } else if (fx === 'punch') {
    // Big impact star with radial shockwave rings.
    const cx = s.x + (s.w >> 1), cy = s.y + (s.h >> 1);
    // Outer ring
    ctx.globalAlpha = 0.3;
    ctx.strokeStyle = c.edge;
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(cx, cy, 8, 0, Math.PI * 2); ctx.stroke();
    // 8-point star
    ctx.globalAlpha = 0.95;
    ctx.fillStyle = c.core;
    ctx.fillRect(cx - 1, cy - 6, 2, 12);
    ctx.fillRect(cx - 6, cy - 1, 12, 2);
    // Diagonals
    ctx.globalAlpha = 0.75;
    ctx.fillStyle = c.mid;
    for (let d = 1; d <= 4; d++) {
      ctx.fillRect(cx - d - 1, cy - d - 1, 2, 2);
      ctx.fillRect(cx + d, cy - d - 1, 2, 2);
      ctx.fillRect(cx - d - 1, cy + d, 2, 2);
      ctx.fillRect(cx + d, cy + d, 2, 2);
    }
    // Impact flash center
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(cx - 2, cy - 2, 4, 4);
    // Soft edge halo
    ctx.globalAlpha = 0.3;
    ctx.fillStyle = c.edge;
    ctx.fillRect(s.x - 2, s.y - 2, s.w + 4, s.h + 4);
  } else if (fx === 'orb') {
    // Concentric cursed-energy orb with orbiting motes and bright core.
    const cx = s.x + s.w / 2, cy = s.y + s.h / 2;
    const r = Math.max(s.w, s.h) / 2;
    // Outer glow halo (big soft)
    ctx.globalAlpha = 0.22;
    ctx.fillStyle = c.edge;
    ctx.beginPath(); ctx.arc(cx, cy, r + 5, 0, Math.PI * 2); ctx.fill();
    // Mid ring
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = c.edge;
    ctx.beginPath(); ctx.arc(cx, cy, r + 2, 0, Math.PI * 2); ctx.fill();
    // Main body
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = c.mid;
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
    // Bright core
    ctx.globalAlpha = 1;
    ctx.fillStyle = c.core;
    ctx.beginPath(); ctx.arc(cx, cy, r * 0.55, 0, Math.PI * 2); ctx.fill();
    // Glare highlight (top-left)
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.arc(cx - r * 0.35, cy - r * 0.35, Math.max(1, r * 0.18), 0, Math.PI * 2); ctx.fill();
    // Orbiting energy motes
    ctx.fillStyle = c.core;
    for (let i = 0; i < 4; i++) {
      const ang = (i / 4) * Math.PI * 2;
      const mx = cx + Math.cos(ang) * (r + 1);
      const my = cy + Math.sin(ang) * (r + 1);
      ctx.fillRect(mx | 0, my | 0, 1, 1);
    }
  } else if (fx === 'beam') {
    // Screen-lengths energy beam with bright core, outer glow, and tip flare.
    // Outer glow
    ctx.globalAlpha = 0.22;
    ctx.fillStyle = c.edge;
    ctx.fillRect(s.x - 3, s.y - 3, s.w + 6, s.h + 6);
    ctx.globalAlpha = 0.45;
    ctx.fillRect(s.x - 1, s.y - 2, s.w + 2, s.h + 4);
    // Mid layer
    ctx.globalAlpha = 0.75;
    ctx.fillStyle = c.mid;
    ctx.fillRect(s.x, s.y, s.w, s.h);
    // Hot core
    ctx.globalAlpha = 1;
    ctx.fillStyle = c.core;
    ctx.fillRect(s.x, s.y + (s.h >> 2), s.w, Math.max(2, s.h >> 1));
    // Brightest center line
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(s.x, s.y + (s.h >> 1) - 1, s.w, Math.max(1, s.h >> 2));
    // Tip flare (leading edge explodes outward)
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = c.core;
    ctx.fillRect(s.x + s.w, s.y - 2, 4, s.h + 4);
    ctx.fillStyle = c.mid;
    ctx.fillRect(s.x + s.w + 3, s.y - 1, 2, s.h + 2);
    ctx.fillStyle = c.edge;
    ctx.fillRect(s.x + s.w + 5, s.y, 2, s.h);
    // Trail particles behind the beam origin
    ctx.globalAlpha = 0.6;
    ctx.fillStyle = c.mid;
    ctx.fillRect(s.x - 4, s.y + (s.h >> 1), 1, 1);
    ctx.fillRect(s.x - 7, s.y + (s.h >> 1) - 1, 1, 1);
    ctx.fillRect(s.x - 10, s.y + (s.h >> 1) + 1, 1, 1);
  } else if (fx === 'shock') {
    // Ground shockwave — rising dust, radial cracks, debris particles.
    // Soft underglow
    ctx.globalAlpha = 0.25;
    ctx.fillStyle = c.edge;
    ctx.fillRect(s.x - 6, s.y - 1, s.w + 12, s.h + 4);
    // Core shockwave band
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = c.mid;
    ctx.fillRect(s.x, s.y, s.w, s.h);
    // Bright top edge
    ctx.globalAlpha = 1;
    ctx.fillStyle = c.core;
    ctx.fillRect(s.x, s.y, s.w, 1);
    // Upward dust/debris particles rising
    ctx.fillStyle = c.core;
    for (let i = 0; i < s.w; i += 5) {
      const h = 2 + ((i * 7) % 4);
      ctx.fillRect(s.x + i, s.y - h, 1, h);
    }
    // Ground cracks spreading outward
    ctx.globalAlpha = 0.75;
    ctx.fillStyle = c.edge;
    ctx.fillRect(s.x - 2, s.y + s.h, 1, 3);
    ctx.fillRect(s.x + 5, s.y + s.h, 1, 2);
    ctx.fillRect(s.x + s.w - 6, s.y + s.h, 1, 2);
    ctx.fillRect(s.x + s.w + 1, s.y + s.h, 1, 3);
    ctx.fillRect(s.x + (s.w >> 1), s.y + s.h, 1, 2);
  } else if (fx === 'flare') {
    // All-around cursed-energy aura burst with radiating spokes + sparks.
    const cx = s.x + s.w / 2, cy = s.y + s.h / 2;
    const r = Math.max(s.w, s.h) / 2;
    // Outer halo
    ctx.globalAlpha = 0.2;
    ctx.fillStyle = c.edge;
    ctx.beginPath(); ctx.arc(cx, cy, r + 5, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 0.4;
    ctx.beginPath(); ctx.arc(cx, cy, r + 2, 0, Math.PI * 2); ctx.fill();
    // Mid body
    ctx.globalAlpha = 0.65;
    ctx.fillStyle = c.mid;
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
    // Inner glow
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = c.core;
    ctx.beginPath(); ctx.arc(cx, cy, r * 0.55, 0, Math.PI * 2); ctx.fill();
    // 8 radiating spokes of energy
    ctx.globalAlpha = 1;
    ctx.fillStyle = c.core;
    for (let a = 0; a < 8; a++) {
      const ang = (a / 8) * Math.PI * 2;
      for (let t = 0; t < 3; t++) {
        const x = cx + Math.cos(ang) * (r + t * 2);
        const y = cy + Math.sin(ang) * (r + t * 2);
        ctx.fillRect((x - 1) | 0, (y - 1) | 0, 2, 2);
      }
    }
    // Scattered sparks beyond the aura
    ctx.globalAlpha = 0.75;
    ctx.fillStyle = c.mid;
    for (let a = 0; a < 6; a++) {
      const ang = (a / 6) * Math.PI * 2 + 0.4;
      const x = cx + Math.cos(ang) * (r + 6);
      const y = cy + Math.sin(ang) * (r + 6);
      ctx.fillRect(x | 0, y | 0, 1, 1);
    }
  } else if (fx === 'sweep') {
    // Wide ground sweep with motion lines trailing behind.
    // Dust cloud underglow
    ctx.globalAlpha = 0.3;
    ctx.fillStyle = c.edge;
    ctx.fillRect(s.x - 3, s.y - 2, s.w + 6, s.h + 4);
    // Core sweep band
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = c.mid;
    ctx.fillRect(s.x, s.y, s.w, s.h);
    // Bright top line (motion highlight)
    ctx.globalAlpha = 1;
    ctx.fillStyle = c.core;
    ctx.fillRect(s.x + 1, s.y, s.w - 2, Math.max(1, s.h - 2));
    // Motion lines trailing back
    ctx.globalAlpha = 0.6;
    ctx.fillStyle = c.mid;
    ctx.fillRect(s.x - 5, s.y + (s.h >> 1), 4, 1);
    ctx.fillRect(s.x - 8, s.y + (s.h >> 1) + 1, 3, 1);
    // Dust particles kicking up
    ctx.fillStyle = c.core;
    for (let i = 0; i < s.w; i += 6) {
      ctx.fillRect(s.x + i + 2, s.y - 2, 1, 1);
    }
  }
  ctx.globalAlpha = 1;
  ctx.restore();
}

// =========================================================
// Hitbox <-> pose alignment.
// =========================================================
// Returns a hitbox geometry `{ x, y, w, h }` (in fighter-local coords used by
// Fighter._buildHitboxWorld) aligned to the pose's swing rect. Caller passes
// `{ damage, knockback, angle, ... }` which are spliced in. Optional `pad`
// grows the hitbox slightly outside the visible FX so attacks feel generous
// (classic fighting-game "hitbox slightly bigger than the graphic" trick).
//
// Pose sprite coords convert to fighter-local like this:
//   center_x_local = (s.x + s.w/2 - CENTER_SPRITE_X) * SCALE
//                  = 2*s.x - 80 + s.w
//   world_left     = fighter.x + center_x_local * facing - w/2
//   world_top      = fighter.y - HURT_HEIGHT + y_local
//   y_local        = (s.y + s.h/2 - FEET_SPRITE_Y) * SCALE + HURT_HEIGHT
//                  = 2*s.y - 216 + s.h + HURT_HEIGHT  = 2*s.y + s.h - 126
//   h              = s.h * SCALE
// For `x`/`y` we store the CENTER offset so the existing `_buildHitboxWorld`
// path (which subtracts `w*0.5`) drops the hitbox at the visible FX's edges.
export function hitboxFromPose(poseName, props = {}) {
  const p = POSES[poseName];
  const pad = props.pad ?? 0;
  if (!p || !p.swing) {
    return {
      x: 32, y: 50, w: 30, h: 22,
      damage: 4, knockback: 20, angle: 40,
      ...props,
    };
  }
  const s = p.swing;
  const w = s.w * SCALE + pad * 2;
  const h = s.h * SCALE + pad * 2;
  const x = (2 * s.x - 80 + s.w);
  const y = (2 * s.y - 126 + s.h);
  const { pad: _pad, ...rest } = props;
  return { x, y, w, h, ...rest };
}

// Expose POSES read-only for tools / debugging. Mutating is unsupported.
export const SPRITE_POSES = POSES;

// =========================================================
// SpriteSheet — builds a per-character offscreen-canvas atlas.
// =========================================================
export class SpriteSheet {
  constructor() { this.atlas = {}; }

  build() {
    for (const key of Object.keys(DRAWERS)) {
      const frames = {};
      for (const poseName in POSES) {
        // Draw the raw character + FX into an offscreen, then post-process
        // with a 1-pixel black outline so the silhouette reads cleanly on
        // any background. The outline is done by copying the body layer
        // into a black silhouette 4 directions then composing the color
        // layer on top.
        const W = SPRITE_W * SCALE, H = SPRITE_H * SCALE;
        const body = document.createElement('canvas');
        body.width = W; body.height = H;
        const bctx = body.getContext('2d');
        bctx.imageSmoothingEnabled = false;
        bctx.scale(SCALE, SCALE);
        DRAWERS[key](bctx, POSES[poseName]);
        // Signature per-attack morphs / weapons (blades, club, staff, orbs,
        // spikes, wings…) drawn into the body layer so they get the outline.
        if (SIGNATURE[key]) SIGNATURE[key](bctx, poseName, POSES[poseName]);

        // Build a black silhouette of the body layer (source-in preserves
        // alpha but forces every drawn pixel to black).
        const silh = document.createElement('canvas');
        silh.width = W; silh.height = H;
        const sctx = silh.getContext('2d');
        sctx.imageSmoothingEnabled = false;
        sctx.drawImage(body, 0, 0);
        sctx.globalCompositeOperation = 'source-in';
        sctx.fillStyle = '#000000';
        sctx.fillRect(0, 0, W, H);

        // Composite: outline (silhouette shifted 4 directions) then body.
        const out = document.createElement('canvas');
        out.width = W; out.height = H;
        const octx = out.getContext('2d');
        octx.imageSmoothingEnabled = false;
        const OFF = SCALE; // 1 source-pixel outline at 2x scale
        octx.drawImage(silh,  OFF, 0);
        octx.drawImage(silh, -OFF, 0);
        octx.drawImage(silh, 0,  OFF);
        octx.drawImage(silh, 0, -OFF);
        octx.drawImage(body, 0, 0);
        // Draw FX on top so energy effects sit above the body+outline.
        octx.save();
        octx.scale(SCALE, SCALE);
        drawPoseFX(octx, POSES[poseName], key, fxColorFor(key, poseName));
        octx.restore();

        frames[poseName] = out;
      }
      this.atlas[key] = frames;
    }
  }

  draw(ctx, character, anim, x, y, facing = 1, scale = 1) {
    const sheet = this.atlas[character];
    if (!sheet) return;
    const frame = sheet[anim] || sheet.idle;
    const w = SPRITE_W * SCALE * scale;
    const h = SPRITE_H * SCALE * scale;
    ctx.save();
    ctx.translate(x, y);
    if (facing === -1) ctx.scale(-1, 1);
    // Anchor: feet at (x, y)
    ctx.drawImage(frame, -w * 0.5, -h + 8 * scale);
    ctx.restore();
  }
}
