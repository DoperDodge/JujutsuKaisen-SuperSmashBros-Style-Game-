// Shibuya — Underground Station. Three tiers, low ceiling, train hazard.

import { Stage } from './Stage.js';

export class Shibuya extends Stage {
  constructor() {
    super('Shibuya Underground Station');
    this.ground = { x: 100, y: 580, w: 1080 };
    this.platforms = [
      { x: 120, y: 460, w: 240 },
      { x: 920, y: 460, w: 240 },
    ];
    this.spawnPoints = [{ x: 350, y: 400 }, { x: 930, y: 400 }];
    this.platformColor = '#5a4438';
    this.groundColor = '#383038';
    this.hazards = [{
      timer: 0, warning: 0, train: -300,
      update(world) {
        this.timer++;
        if (this.warning === 0 && this.timer > 60 * 18) {
          this.warning = 60 * 3;
        }
        if (this.warning > 0) {
          this.warning--;
          if (this.warning === 0) {
            this.train = -200;
            this.timer = 0;
          }
        }
        if (this.train > -300) {
          this.train += 30;
          for (const f of world.fighters) {
            if (Math.abs(f.x - this.train) < 80 && f.y > 540) {
              f.percent += 20;
              f.vx += 18;
              f.vy = -8;
              f.hitstun = 30;
            }
          }
          if (this.train > 1500) this.train = -300;
        }
      },
      render(ctx) {
        if (this.warning > 0) {
          ctx.fillStyle = `rgba(255,80,80,${0.4 + Math.sin(this.warning * 0.5) * 0.3})`;
          ctx.fillRect(0, 540, 1280, 4);
        }
        if (this.train > -300) {
          ctx.fillStyle = '#202830';
          ctx.fillRect(this.train - 100, 520, 200, 60);
          ctx.fillStyle = '#ffe070';
          ctx.fillRect(this.train + 80, 540, 16, 8);
        }
      },
    }];
  }
  background(ctx, W, H) {
    ctx.fillStyle = '#0a0c14';
    ctx.fillRect(-200, -200, W + 400, H + 400);
    // tunnel arches
    ctx.fillStyle = '#202830';
    for (let i = 0; i < 6; i++) {
      const x = 80 + i * 200;
      ctx.fillRect(x, 200, 12, 380);
      ctx.fillRect(x - 60, 200, 132, 12);
    }
    // ticket gates
    ctx.fillStyle = '#3a4858';
    ctx.fillRect(120, 420, 240, 40);
    ctx.fillRect(920, 420, 240, 40);
  }
}
