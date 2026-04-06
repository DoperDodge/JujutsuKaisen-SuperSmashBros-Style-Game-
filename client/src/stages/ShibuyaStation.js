// Shinjuku Showdown — wide flat "Final Destination" style stage. (File named per
// the spec's project structure entry; the in-game stage is Shinjuku.)

import { Stage } from './Stage.js';

export class Shinjuku extends Stage {
  constructor() {
    super('Shinjuku Showdown');
    this.ground = { x: 60, y: 580, w: 1160 };
    this.platforms = [];
    this.spawnPoints = [{ x: 360, y: 400 }, { x: 920, y: 400 }];
    this.platformColor = '#5a5860';
    this.groundColor = '#2a2c34';
    this.hazards = [];
  }
  background(ctx, W, H) {
    const grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, '#1c0f1a');
    grad.addColorStop(1, '#3a1810');
    ctx.fillStyle = grad;
    ctx.fillRect(-200, -200, W + 400, H + 400);
    // destroyed buildings
    ctx.fillStyle = '#0c0810';
    ctx.fillRect(60, 220, 220, 360);
    ctx.fillRect(320, 280, 180, 300);
    ctx.fillRect(800, 240, 200, 340);
    ctx.fillRect(1040, 300, 180, 280);
    // window glow
    ctx.fillStyle = '#ffaa30';
    for (let i = 0; i < 18; i++) {
      const x = 70 + (i * 67) % 1140;
      const y = 240 + ((i * 53) % 280);
      ctx.fillRect(x, y, 6, 8);
    }
  }
}

export { Shinjuku as ShibuyaStation };
