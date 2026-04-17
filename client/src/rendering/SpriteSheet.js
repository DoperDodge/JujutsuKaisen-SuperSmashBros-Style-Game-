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
// =========================================================
function drawShadow(ctx) {
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.beginPath();
  ctx.ellipse(40, 108, 18, 3, 0, 0, Math.PI * 2);
  ctx.fill();
}

function drawLegs(ctx, pose, palette, build) {
  const w = build === 'big' ? 7 : 6;
  // Back leg
  px(ctx, 32, 78 + pose.legA, w, 22, palette.pants);
  px(ctx, 32, 78 + pose.legA, w, 3, palette.pantsHi);
  px(ctx, 32, 96, w, 4, palette.shoe);
  // Front leg
  px(ctx, 41, 78 + pose.legB, w, 22, palette.pants);
  px(ctx, 41, 78 + pose.legB, w, 3, palette.pantsHi);
  px(ctx, 41, 96, w, 4, palette.shoe);
}

function drawTorso(ctx, pose, palette, build) {
  const x = build === 'big' ? 26 : 28;
  const w = build === 'big' ? 28 : 24;
  const top = 46 + pose.body;
  // Body block
  px(ctx, x, top, w, 34, palette.jacket);
  // Lighting on left edge
  px(ctx, x, top, 3, 34, palette.jacketHi);
  // Belt / bottom trim
  px(ctx, x, top + 30, w, 4, palette.belt || palette.jacketShade);
  // Collar / chest accent
  px(ctx, x + 4, top, w - 8, 5, palette.collar || palette.jacketHi);
  // Stitch line (jacket center)
  if (palette.jacketLine) {
    px(ctx, x + (w / 2 | 0), top + 6, 1, 22, palette.jacketLine);
  }
}

function drawArm(ctx, x, y, palette, len = 18, hand = true) {
  px(ctx, x, y, 5, len, palette.jacket);
  px(ctx, x, y, 5, 2, palette.jacketHi);
  if (hand) px(ctx, x, y + len, 5, 5, palette.skin);
}

function drawArms(ctx, pose, palette, build) {
  const baseY = 50 + pose.body;
  const leftX = (build === 'big' ? 22 : 24) + pose.armA[0];
  const rightX = (build === 'big' ? 53 : 51) + pose.armB[0];
  drawArm(ctx, leftX,  baseY + pose.armA[1], palette);
  drawArm(ctx, rightX, baseY + pose.armB[1], palette);
}

// Round-ish head (16x16). Eyes vary per character.
function drawHead(ctx, pose, palette, faceFn) {
  const top = 24 + pose.head;
  // Skin block
  px(ctx, 30, top, 20, 18, palette.skin);
  // Shading on right
  px(ctx, 48, top + 2, 2, 14, palette.skinShade);
  // Bottom jaw
  px(ctx, 32, top + 17, 16, 2, palette.skinShade);
  // Neck
  px(ctx, 36, top + 18, 8, 4, palette.skin);
  // Face features (handed off)
  faceFn && faceFn(ctx, 30, top, pose);
}

// =========================================================
// Character-specific drawers.
// =========================================================

function drawGojo(ctx, pose) {
  const palette = {
    skin: '#f5d8b6', skinShade: '#d8b08a',
    jacket: '#152044', jacketHi: '#2a3a6e', jacketShade: '#0a1230',
    jacketLine: '#3a4880', collar: '#0a0d20', belt: '#3a4060',
    pants: '#0d1530', pantsHi: '#1c2848', shoe: '#070a18',
  };
  drawShadow(ctx);
  drawLegs(ctx, pose, palette, 'lean');
  drawTorso(ctx, pose, palette, 'lean');
  drawArms(ctx, pose, palette, 'lean');
  drawHead(ctx, pose, palette, (cx, x, y) => {
    // Blindfold across eyes
    px(ctx, x + 0, y + 6, 20, 4, '#0a0a14');
    // Six Eyes glow at edges (only when not blinking / hurt)
    if (!pose.blink) {
      px(ctx, x + 2, y + 7, 2, 2, '#5fd7ff');
      px(ctx, x + 16, y + 7, 2, 2, '#5fd7ff');
    }
    // Mouth
    px(ctx, x + 8, y + 14, 4, 1, '#7a4030');
  });
  // Hair: spiky white on top + sides
  const hy = 22 + pose.head;
  px(ctx, 28, hy, 24, 6, '#ffffff');
  px(ctx, 28, hy, 24, 2, '#e0e0e8');
  // Spikes
  px(ctx, 30, hy - 2, 3, 2, '#ffffff');
  px(ctx, 36, hy - 3, 3, 3, '#ffffff');
  px(ctx, 42, hy - 2, 3, 2, '#ffffff');
  px(ctx, 48, hy - 3, 3, 3, '#ffffff');
  // Side bangs
  px(ctx, 28, hy + 4, 2, 6, '#ffffff');
  px(ctx, 50, hy + 4, 2, 6, '#ffffff');
  // Infinity shimmer (subtle outline)
  if (pose.glow) {
    ctx.strokeStyle = '#5fd7ff';
    ctx.lineWidth = 1;
    ctx.strokeRect(20, 20, 40, 80);
  }
}

function drawYuji(ctx, pose) {
  const palette = {
    skin: '#f5cfa3', skinShade: '#c89870',
    jacket: '#1c2440', jacketHi: '#2c3858', jacketShade: '#10162c',
    jacketLine: '#0a0d1c', collar: '#0a0e1c', belt: '#000000',
    pants: '#10162c', pantsHi: '#202848', shoe: '#181818',
  };
  drawShadow(ctx);
  drawLegs(ctx, pose, palette, 'normal');
  drawTorso(ctx, pose, palette, 'normal');
  // Hood at back of jacket
  const hy = 42 + pose.body;
  px(ctx, 26, hy, 28, 6, palette.jacket);
  px(ctx, 26, hy, 28, 2, palette.jacketHi);
  drawArms(ctx, pose, palette, 'normal');
  drawHead(ctx, pose, palette, (cx, x, y) => {
    // Eyes (golden brown)
    if (!pose.blink) {
      px(ctx, x + 4, y + 7, 3, 3, '#ffffff');
      px(ctx, x + 13, y + 7, 3, 3, '#ffffff');
      px(ctx, x + 5, y + 8, 2, 2, '#3a2010');
      px(ctx, x + 14, y + 8, 2, 2, '#3a2010');
    } else {
      px(ctx, x + 4, y + 8, 3, 1, '#3a2010');
      px(ctx, x + 13, y + 8, 3, 1, '#3a2010');
    }
    // Mouth
    px(ctx, x + 8, y + 14, 4, 1, '#7a4030');
  });
  // Hair: pink spiky undercut
  const hairY = 22 + pose.head;
  // Undercut sides (darker)
  px(ctx, 28, hairY + 4, 2, 4, '#a85068');
  px(ctx, 50, hairY + 4, 2, 4, '#a85068');
  // Pink top
  px(ctx, 30, hairY, 20, 6, '#ff8da1');
  px(ctx, 30, hairY, 20, 2, '#ffb0c0');
  // Spikes
  px(ctx, 32, hairY - 2, 3, 2, '#ff8da1');
  px(ctx, 38, hairY - 3, 3, 3, '#ff8da1');
  px(ctx, 44, hairY - 2, 3, 2, '#ff8da1');
}

function drawSukuna(ctx, pose) {
  const palette = {
    skin: '#e8c4a0', skinShade: '#b88860',
    jacket: '#2a0a18', jacketHi: '#4a1228', jacketShade: '#10000c',
    jacketLine: '#600820', collar: '#000000', belt: '#0a0008',
    pants: '#1a000c', pantsHi: '#3a0820', shoe: '#000000',
  };
  drawShadow(ctx);
  drawLegs(ctx, pose, palette, 'normal');
  drawTorso(ctx, pose, palette, 'normal');
  drawArms(ctx, pose, palette, 'normal');
  // Two ghostly extra arms behind torso
  const ey = 50 + pose.body;
  ctx.globalAlpha = 0.55;
  drawArm(ctx, 18, ey - 2, palette, 16);
  drawArm(ctx, 57, ey - 2, palette, 16);
  ctx.globalAlpha = 1;
  drawHead(ctx, pose, palette, (cx, x, y) => {
    // Eyes (red, four-eyed effect: two stacks)
    if (!pose.blink) {
      px(ctx, x + 4, y + 6, 3, 2, '#ff3050');
      px(ctx, x + 13, y + 6, 3, 2, '#ff3050');
      px(ctx, x + 4, y + 10, 3, 2, '#ff3050');
      px(ctx, x + 13, y + 10, 3, 2, '#ff3050');
    }
    // Mouth with extra wide grin
    px(ctx, x + 6, y + 14, 8, 1, '#400010');
    // Markings on cheeks
    px(ctx, x + 2, y + 4, 4, 1, '#000000');
    px(ctx, x + 14, y + 4, 4, 1, '#000000');
    px(ctx, x + 2, y + 11, 4, 1, '#000000');
    px(ctx, x + 14, y + 11, 4, 1, '#000000');
    // Forehead stripe
    px(ctx, x + 8, y + 1, 4, 2, '#000000');
  });
  // Hair: pink with markings (stripes through hair)
  const hairY = 22 + pose.head;
  px(ctx, 30, hairY, 20, 6, '#ff8da1');
  px(ctx, 30, hairY, 20, 2, '#ffb0c0');
  px(ctx, 32, hairY + 2, 2, 4, '#000000');
  px(ctx, 38, hairY + 2, 2, 4, '#000000');
  px(ctx, 44, hairY + 2, 2, 4, '#000000');
}

function drawMahito(ctx, pose) {
  const palette = {
    skin: '#d8c8d0', skinShade: '#a89098',
    jacket: '#3c3848', jacketHi: '#544858', jacketShade: '#1c1a24',
    jacketLine: '#1a1820', collar: '#1a1820', belt: '#1a1820',
    pants: '#1a1a26', pantsHi: '#2a2a3a', shoe: '#101018',
  };
  drawShadow(ctx);
  drawLegs(ctx, pose, palette, 'normal');
  drawTorso(ctx, pose, palette, 'normal');
  drawArms(ctx, pose, palette, 'normal');
  // Stitches across torso (Mahito's patchwork skin showing on hands)
  const sy = 50 + pose.body;
  for (let i = 0; i < 3; i++) {
    px(ctx, 32 + i * 6, sy + 6, 1, 12, '#1a1820');
  }
  drawHead(ctx, pose, palette, (cx, x, y) => {
    // Mismatched eyes (one big, one small)
    if (!pose.blink) {
      px(ctx, x + 3, y + 6, 4, 4, '#ffffff');
      px(ctx, x + 4, y + 7, 2, 2, '#1a3a40');
      px(ctx, x + 13, y + 7, 3, 3, '#ffffff');
      px(ctx, x + 14, y + 8, 1, 1, '#3a1a40');
    }
    // Stitched mouth (jagged)
    for (let i = 0; i < 4; i++) px(ctx, x + 6 + i * 2, y + 14 + (i % 2), 1, 1, '#1a1820');
    // Stitches on cheek
    px(ctx, x + 2, y + 9, 1, 4, '#1a1820');
    px(ctx, x + 17, y + 9, 1, 4, '#1a1820');
    px(ctx, x + 8, y + 2, 4, 1, '#1a1820');
  });
  // Hair: blue-gray, parted
  const hairY = 22 + pose.head;
  px(ctx, 28, hairY, 24, 5, '#5a708a');
  px(ctx, 28, hairY, 24, 2, '#7a90aa');
  px(ctx, 38, hairY + 2, 4, 4, palette.skin); // part
  // Side bangs
  px(ctx, 28, hairY + 4, 2, 6, '#5a708a');
  px(ctx, 50, hairY + 4, 2, 6, '#5a708a');
}

function drawTodo(ctx, pose) {
  const palette = {
    skin: '#d8a878', skinShade: '#a87850',
    jacket: '#2a3848', jacketHi: '#3a4858', jacketShade: '#101820',
    jacketLine: '#a89048', collar: '#000000', belt: '#5a4020',
    pants: '#1a2230', pantsHi: '#2a3240', shoe: '#0a0a10',
  };
  drawShadow(ctx);
  // Larger frame
  drawLegs(ctx, pose, palette, 'big');
  drawTorso(ctx, pose, palette, 'big');
  drawArms(ctx, pose, palette, 'big');
  // Bigger head
  const top = 22 + pose.head;
  px(ctx, 28, top, 24, 20, palette.skin);
  px(ctx, 50, top + 2, 2, 16, palette.skinShade);
  px(ctx, 30, top + 19, 20, 2, palette.skinShade);
  // Neck (thick)
  px(ctx, 34, top + 20, 12, 4, palette.skin);
  // Face: scar across left eye
  if (!pose.blink) {
    px(ctx, 32, top + 8, 3, 3, '#ffffff');
    px(ctx, 44, top + 8, 3, 3, '#ffffff');
    px(ctx, 33, top + 9, 1, 1, '#1a1820');
    px(ctx, 45, top + 9, 1, 1, '#1a1820');
  }
  // Scar
  px(ctx, 30, top + 6, 1, 8, '#a85040');
  px(ctx, 31, top + 5, 1, 1, '#a85040');
  // Mouth (serious)
  px(ctx, 36, top + 15, 8, 1, '#3a1810');
  // Hair: short brown
  px(ctx, 26, top - 2, 28, 6, '#3a2418');
  px(ctx, 26, top - 2, 28, 2, '#5a4028');
  // Vibraslap prosthetic on left hand (highlight)
  const armY = 50 + pose.body;
  const leftHandX = (22 + pose.armA[0]);
  px(ctx, leftHandX - 1, armY + pose.armA[1] + 17, 7, 6, '#888898');
  px(ctx, leftHandX - 1, armY + pose.armA[1] + 17, 7, 2, '#a8a8b8');
}

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

function drawPoseFX(ctx, pose, character) {
  const s = pose.swing;
  if (!s) return;
  const c = CE_COLORS[character] || { core: '#ffffff', mid: '#cccccc', edge: '#666666' };
  const fx = pose.fx || 'slash';
  ctx.save();
  if (fx === 'slash') {
    // Layered slash trail with crescent shape.
    ctx.globalAlpha = 0.25;
    ctx.fillStyle = c.edge;
    ctx.fillRect(s.x - 4, s.y - 3, s.w + 8, s.h + 6);
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = c.mid;
    ctx.fillRect(s.x - 2, s.y - 1, s.w + 4, s.h + 2);
    // Bright crescent
    ctx.globalAlpha = 0.95;
    ctx.fillStyle = c.core;
    for (let i = 0; i < s.h; i++) {
      const inset = Math.abs((i - s.h / 2)) | 0;
      ctx.fillRect(s.x + inset, s.y + i, s.w - inset * 2, 1);
    }
    // Sparkle dots
    ctx.fillStyle = c.mid;
    ctx.fillRect(s.x + s.w - 2, s.y + (s.h >> 1) - 1, 2, 2);
    ctx.fillRect(s.x + s.w + 2, s.y + (s.h >> 1) + 2, 1, 1);
  } else if (fx === 'punch') {
    // Impact star.
    const cx = s.x + (s.w >> 1), cy = s.y + (s.h >> 1);
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = c.core;
    ctx.fillRect(cx - 1, cy - 4, 2, 8);
    ctx.fillRect(cx - 4, cy - 1, 8, 2);
    ctx.fillStyle = c.mid;
    ctx.globalAlpha = 0.7;
    ctx.fillRect(cx - 2, cy - 6, 4, 2);
    ctx.fillRect(cx - 2, cy + 4, 4, 2);
    ctx.fillRect(cx - 6, cy - 2, 2, 4);
    ctx.fillRect(cx + 4, cy - 2, 2, 4);
    ctx.globalAlpha = 0.4;
    ctx.fillStyle = c.edge;
    ctx.fillRect(s.x, s.y, s.w, s.h);
  } else if (fx === 'orb') {
    // Concentric energy orb.
    const cx = s.x + s.w / 2, cy = s.y + s.h / 2;
    const r = Math.max(s.w, s.h) / 2;
    ctx.globalAlpha = 0.3;
    ctx.fillStyle = c.edge;
    ctx.beginPath(); ctx.arc(cx, cy, r + 3, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 0.65;
    ctx.fillStyle = c.mid;
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 0.95;
    ctx.fillStyle = c.core;
    ctx.beginPath(); ctx.arc(cx, cy, r * 0.55, 0, Math.PI * 2); ctx.fill();
    // Highlight
    ctx.fillStyle = '#ffffff';
    ctx.fillRect((cx - r * 0.3) | 0, (cy - r * 0.3) | 0, 2, 2);
  } else if (fx === 'beam') {
    // Long horizontal energy beam with bright core.
    ctx.globalAlpha = 0.3;
    ctx.fillStyle = c.edge;
    ctx.fillRect(s.x - 2, s.y - 2, s.w + 4, s.h + 4);
    ctx.globalAlpha = 0.7;
    ctx.fillStyle = c.mid;
    ctx.fillRect(s.x, s.y, s.w, s.h);
    ctx.globalAlpha = 1;
    ctx.fillStyle = c.core;
    ctx.fillRect(s.x, s.y + (s.h >> 2), s.w, Math.max(2, s.h >> 1));
    // Tip flare
    ctx.fillRect(s.x + s.w, s.y - 1, 3, s.h + 2);
  } else if (fx === 'shock') {
    // Ground shockwave: triangles spreading outward.
    ctx.globalAlpha = 0.3;
    ctx.fillStyle = c.edge;
    ctx.fillRect(s.x - 4, s.y, s.w + 8, s.h);
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = c.mid;
    ctx.fillRect(s.x, s.y, s.w, s.h);
    ctx.fillStyle = c.core;
    for (let i = 0; i < s.w; i += 4) {
      ctx.fillRect(s.x + i, s.y - 2, 2, 2);
    }
    // Cracks
    ctx.fillStyle = c.edge;
    ctx.fillRect(s.x + 6, s.y + s.h, 1, 2);
    ctx.fillRect(s.x + s.w - 6, s.y + s.h, 1, 2);
  } else if (fx === 'flare') {
    // Aerial all-around aura.
    const cx = s.x + s.w / 2, cy = s.y + s.h / 2;
    const r = Math.max(s.w, s.h) / 2;
    ctx.globalAlpha = 0.25;
    ctx.fillStyle = c.edge;
    ctx.beginPath(); ctx.arc(cx, cy, r + 4, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = c.mid;
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
    // Spokes radiating
    ctx.fillStyle = c.core;
    for (let a = 0; a < 8; a++) {
      const ang = (a / 8) * Math.PI * 2;
      const x = cx + Math.cos(ang) * r;
      const y = cy + Math.sin(ang) * r;
      ctx.fillRect((x - 1) | 0, (y - 1) | 0, 2, 2);
    }
  } else if (fx === 'sweep') {
    // Wide low ground sweep.
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = c.edge;
    ctx.fillRect(s.x - 2, s.y - 1, s.w + 4, s.h + 2);
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = c.mid;
    ctx.fillRect(s.x, s.y, s.w, s.h);
    ctx.fillStyle = c.core;
    ctx.fillRect(s.x + 2, s.y + 1, s.w - 4, Math.max(1, s.h - 3));
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
        drawPoseFX(octx, POSES[poseName], key);
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
