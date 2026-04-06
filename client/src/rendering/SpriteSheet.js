// Procedural sprite atlas. Since we cannot ship pixel-art PNGs in-session,
// we generate per-character offscreen canvas "sprites" at startup using each
// character's signature palette from FighterData.js. The output is conceptually
// equivalent to a sprite atlas: a set of named animation frames that the
// renderer can draw without knowing the underlying source.
//
// Frames are 64x64 base, drawn 2x for the 128-bit pixel art look from the plan.

import { FIGHTER_STATS } from '../../../shared/FighterData.js';

const SPRITE_W = 64;
const SPRITE_H = 64;
const SCALE = 2;

function pix(ctx, x, y, c, w = 1, h = 1) {
  ctx.fillStyle = c;
  ctx.fillRect(x, y, w, h);
}

// Draw a single character pose. pose is an object describing limb offsets.
function drawPose(ctx, palette, pose, facing = 1) {
  ctx.save();
  ctx.translate(SPRITE_W * 0.5, 0);
  if (facing === -1) ctx.scale(-1, 1);
  ctx.translate(-SPRITE_W * 0.5, 0);
  // shadow
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.fillRect(20, 60, 24, 3);
  // legs
  pix(ctx, 26, 44 + pose.legY, palette.primary, 4, 16);
  pix(ctx, 34, 44 + pose.legY, palette.primary, 4, 16);
  // body
  pix(ctx, 24, 24 + pose.bodyY, palette.primary, 16, 22);
  pix(ctx, 24, 24 + pose.bodyY, palette.secondary, 16, 4);
  // arms
  pix(ctx, 18 + pose.armOffX, 26 + pose.armY, palette.primary, 6, 14);
  pix(ctx, 40 - pose.armOffX, 26 + pose.armY, palette.primary, 6, 14);
  // hands
  pix(ctx, 18 + pose.armOffX, 38 + pose.armY, palette.skin, 6, 4);
  pix(ctx, 40 - pose.armOffX, 38 + pose.armY, palette.skin, 6, 4);
  // head
  pix(ctx, 24, 8 + pose.headY, palette.skin, 16, 16);
  // hair
  pix(ctx, 22, 6 + pose.headY, palette.hair, 20, 6);
  pix(ctx, 24, 4 + pose.headY, palette.hair, 16, 4);
  // eyes / accent (blindfold or markings depending on accent color)
  pix(ctx, 26, 16 + pose.headY, palette.accent, 12, 2);
  // weapon/effect
  if (pose.fx) {
    ctx.fillStyle = palette.accent;
    ctx.globalAlpha = 0.8;
    ctx.fillRect(pose.fx.x, pose.fx.y, pose.fx.w, pose.fx.h);
    ctx.globalAlpha = 1;
  }
  ctx.restore();
}

const POSES = {
  idle:    { legY: 0, bodyY: 0, armOffX: 0, armY: 0, headY: 0 },
  idle2:   { legY: 0, bodyY: -1, armOffX: 0, armY: 0, headY: -1 },
  walk1:   { legY: -2, bodyY: 0, armOffX: 1, armY: -1, headY: 0 },
  walk2:   { legY: 1, bodyY: 0, armOffX: -1, armY: 1, headY: 0 },
  jump:    { legY: -3, bodyY: -2, armOffX: 2, armY: -3, headY: -2 },
  fall:    { legY: 1, bodyY: 0, armOffX: 2, armY: 0, headY: 0 },
  attack1: { legY: 0, bodyY: 0, armOffX: -4, armY: 0, headY: 0,
             fx: { x: 44, y: 28, w: 14, h: 6 } },
  attack2: { legY: 0, bodyY: -1, armOffX: -2, armY: -2, headY: 0,
             fx: { x: 42, y: 22, w: 18, h: 4 } },
  smash:   { legY: 0, bodyY: 0, armOffX: -6, armY: 1, headY: 0,
             fx: { x: 44, y: 26, w: 22, h: 10 } },
  uair:    { legY: 0, bodyY: -2, armOffX: 0, armY: -4, headY: -2,
             fx: { x: 26, y: -4, w: 12, h: 8 } },
  hurt:    { legY: 0, bodyY: 1, armOffX: 3, armY: 2, headY: 1 },
  shield:  { legY: 0, bodyY: 0, armOffX: -1, armY: 0, headY: 0 },
  domain:  { legY: 0, bodyY: -2, armOffX: -3, armY: -3, headY: -2,
             fx: { x: 0, y: 0, w: 64, h: 64 } },
};

export class SpriteSheet {
  constructor() {
    this.atlas = {}; // characterKey -> { animName: HTMLCanvasElement }
  }

  build() {
    for (const key in FIGHTER_STATS) {
      const palette = FIGHTER_STATS[key].palette;
      const frames = {};
      for (const poseName in POSES) {
        const c = document.createElement('canvas');
        c.width = SPRITE_W * SCALE;
        c.height = SPRITE_H * SCALE;
        const ctx = c.getContext('2d');
        ctx.imageSmoothingEnabled = false;
        ctx.scale(SCALE, SCALE);
        drawPose(ctx, palette, POSES[poseName]);
        frames[poseName] = c;
      }
      this.atlas[key] = frames;
    }
  }

  draw(ctx, character, anim, x, y, facing = 1) {
    const sheet = this.atlas[character];
    if (!sheet) return;
    const frame = sheet[anim] || sheet.idle;
    const w = SPRITE_W * SCALE, h = SPRITE_H * SCALE;
    ctx.save();
    ctx.translate(x, y);
    if (facing === -1) ctx.scale(-1, 1);
    ctx.drawImage(frame, -w * 0.5, -h);
    ctx.restore();
  }
}
