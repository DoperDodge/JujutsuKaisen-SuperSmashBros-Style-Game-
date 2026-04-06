// Tokyo Jujutsu High — Battlefield-style layout: main platform + two upper platforms.

import { Stage } from './Stage.js';

export class JujutsuHigh extends Stage {
  constructor() {
    super('Tokyo Jujutsu High');
    this.ground = { x: 200, y: 580, w: 880 };
    this.platforms = [
      { x: 320, y: 440, w: 200 },
      { x: 760, y: 440, w: 200 },
      { x: 540, y: 320, w: 200 },
    ];
    this.spawnPoints = [{ x: 380, y: 400 }, { x: 900, y: 400 }];
    this.platformColor = '#5a7050';
    this.groundColor = '#3a4838';
    this.groundEdge = '#76906a';
    this.hazards = [{
      timer: 0,
      update(world) {
        this.timer++;
        if (this.timer > 60 * 25) { // every 25s spawn cursed spirit
          this.timer = 0;
          this.spiritX = 200;
          this.spiritActive = true;
        }
        if (this.spiritActive) {
          this.spiritX += 1.5;
          for (const f of world.fighters) {
            if (Math.abs(f.x - this.spiritX) < 30 && f.y > 540) {
              f.percent += 5;
              f.vx += 4;
              f.hitstun = 12;
              this.spiritActive = false;
            }
          }
          if (this.spiritX > 1080) this.spiritActive = false;
        }
      },
      render(ctx) {
        if (!this.spiritActive) return;
        ctx.fillStyle = '#9a30c0';
        ctx.fillRect(this.spiritX - 12, 540, 24, 36);
        ctx.fillStyle = '#ffe070';
        ctx.fillRect(this.spiritX - 6, 552, 4, 4);
        ctx.fillRect(this.spiritX + 2, 552, 4, 4);
      },
    }];
  }
  background(ctx, W, H) {
    const grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, '#1a2840');
    grad.addColorStop(1, '#162020');
    ctx.fillStyle = grad;
    ctx.fillRect(-200, -200, W + 400, H + 400);
    // distant school silhouette
    ctx.fillStyle = '#0c1418';
    ctx.fillRect(200, 380, 880, 200);
    ctx.fillRect(280, 320, 60, 60);
    ctx.fillRect(940, 320, 60, 60);
    // moon
    ctx.fillStyle = '#e8f0ff';
    ctx.beginPath(); ctx.arc(220, 130, 36, 0, Math.PI * 2); ctx.fill();
  }
}
