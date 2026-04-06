// Detailed procedural pixel-art sprite atlas. Each character is drawn with
// distinguishing features: face, hair, outfit, accessories, build/height.
// Sprites are 80x112 base, rendered at 2x scale (160x224) for the 128-bit
// pixel art look specified in JJK_SMASH_GAME_PLAN.md section 9.

const SPRITE_W = 80;
const SPRITE_H = 112;
const SCALE = 2;

// Helper: pixel rect with optional shade
function px(ctx, x, y, w, h, color) { ctx.fillStyle = color; ctx.fillRect(x | 0, y | 0, w | 0, h | 0); }

// =========================================================
// Pose definition: a pose drives limb offsets and FX layers.
// Every character interprets pose with their own renderer.
// =========================================================
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
  attack1: { armA: [-2, 0], armB: [10, -1], legA: -1, legB: 2, body: 0, head: 0, blink: 0,
             swing: { x: 36, y: 38, w: 18, h: 4 } },
  attack2: { armA: [-3, -2], armB: [12, -3], legA: -2, legB: 2, body: -1, head: 0, blink: 0,
             swing: { x: 38, y: 30, w: 24, h: 6 } },
  smash:   { armA: [-4, 1], armB: [14, 0], legA: -3, legB: 4, body: 0, head: 0, blink: 0,
             swing: { x: 38, y: 34, w: 30, h: 12 } },
  uair:    { armA: [-2, -6], armB: [2, -6], legA: -1, legB: 1, body: -2, head: -2, blink: 0,
             swing: { x: 30, y: -2, w: 20, h: 10 } },
  hurt:    { armA: [3, 3], armB: [-3, 3], legA: 0, legB: 0, body: 1, head: 1, blink: 1 },
  domain:  { armA: [-3, -3], armB: [3, -3], legA: 0, legB: 0, body: -2, head: -2, blink: 0,
             swing: null, glow: true },
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
function drawPoseFX(ctx, pose, character) {
  if (pose.swing) {
    const s = pose.swing;
    const accent = {
      gojo: '#5fd7ff', yuji: '#ffb84a', sukuna: '#ff3050',
      mahito: '#9aff7a', todo: '#ffe070',
    }[character] || '#ffffff';
    ctx.fillStyle = accent;
    ctx.globalAlpha = 0.85;
    ctx.fillRect(s.x, s.y, s.w, s.h);
    ctx.globalAlpha = 0.4;
    ctx.fillRect(s.x - 2, s.y - 1, s.w + 4, s.h + 2);
    ctx.globalAlpha = 1;
  }
}

// =========================================================
// SpriteSheet — builds a per-character offscreen-canvas atlas.
// =========================================================
export class SpriteSheet {
  constructor() { this.atlas = {}; }

  build() {
    for (const key of Object.keys(DRAWERS)) {
      const frames = {};
      for (const poseName in POSES) {
        const c = document.createElement('canvas');
        c.width = SPRITE_W * SCALE;
        c.height = SPRITE_H * SCALE;
        const ctx = c.getContext('2d');
        ctx.imageSmoothingEnabled = false;
        ctx.scale(SCALE, SCALE);
        DRAWERS[key](ctx, POSES[poseName]);
        drawPoseFX(ctx, POSES[poseName], key);
        frames[poseName] = c;
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
