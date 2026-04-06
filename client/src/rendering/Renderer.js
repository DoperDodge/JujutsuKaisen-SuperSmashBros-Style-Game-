// Canvas 2D rendering pipeline. Pixel art crisp rendering, camera, sprites, particles.

import { STAGE_BOUNDS } from '../../../shared/Constants.js';

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.ctx.imageSmoothingEnabled = false;
    this.W = canvas.width;
    this.H = canvas.height;
  }

  clear(color = '#06060c') {
    this.ctx.fillStyle = color;
    this.ctx.fillRect(0, 0, this.W, this.H);
  }

  drawStage(stage) {
    const ctx = this.ctx;
    // backdrop
    if (stage.background) stage.background(ctx, this.W, this.H);
    // ground
    if (stage.ground) {
      const g = stage.ground;
      ctx.fillStyle = stage.groundColor || '#3a4658';
      ctx.fillRect(g.x, g.y, g.w, 32);
      ctx.fillStyle = stage.groundEdge || '#586878';
      ctx.fillRect(g.x, g.y, g.w, 4);
    }
    if (stage.platforms) {
      ctx.fillStyle = stage.platformColor || '#4a586a';
      for (const p of stage.platforms) {
        ctx.fillRect(p.x, p.y, p.w, 8);
        ctx.fillStyle = '#6a7888';
        ctx.fillRect(p.x, p.y, p.w, 2);
        ctx.fillStyle = stage.platformColor || '#4a586a';
      }
    }
  }

  drawHitboxes(fighters) {
    const ctx = this.ctx;
    ctx.lineWidth = 1;
    for (const f of fighters) {
      ctx.strokeStyle = '#00ff00';
      ctx.strokeRect(f.x - f.width / 2, f.y - f.height, f.width, f.height);
      if (f.activeHitbox) {
        const hb = f.activeHitbox;
        ctx.strokeStyle = '#ff3050';
        ctx.strokeRect(hb.x, hb.y, hb.w, hb.h);
      }
    }
  }
}
