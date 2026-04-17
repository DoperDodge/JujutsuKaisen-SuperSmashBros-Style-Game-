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
    // Shibuya Underground Station — Halloween-night chaos setting. Tiled
    // walls, overhead pipes, flickering neon signs, dark tunnels, gate
    // turnstiles, all rendered in chunky pixel detail.

    // Deep dark tunnel base
    const skyGrad = ctx.createLinearGradient(0, 0, 0, H);
    skyGrad.addColorStop(0, '#06080f');
    skyGrad.addColorStop(0.6, '#0a0e18');
    skyGrad.addColorStop(1, '#141018');
    ctx.fillStyle = skyGrad;
    ctx.fillRect(-200, -200, W + 400, H + 400);

    // Back wall — white subway tile pattern with dirt/weathering
    ctx.fillStyle = '#2a3038';
    ctx.fillRect(0, 80, W, 420);
    // Tile grid (4x4 tile size)
    ctx.fillStyle = '#b8c0c8';
    for (let y = 80; y < 480; y += 24) {
      for (let x = 0; x < W; x += 32) {
        const offset = ((y / 24) | 0) % 2 === 0 ? 0 : 16;
        ctx.fillRect(x + offset, y, 28, 22);
      }
    }
    // Tile grout lines (darker)
    ctx.fillStyle = '#1a1e24';
    for (let y = 80; y < 480; y += 24) {
      ctx.fillRect(0, y + 22, W, 2);
    }
    // Dirt/grime on tiles (splatters)
    ctx.fillStyle = 'rgba(40,20,30,0.5)';
    const grime = [[120, 180], [280, 220], [450, 160], [620, 240], [780, 190], [950, 220], [1100, 170]];
    for (const g of grime) {
      ctx.fillRect(g[0], g[1], 18, 14);
      ctx.fillRect(g[0] + 12, g[1] + 10, 10, 8);
    }
    // Blood splatters (curse-attack residue — JJK Shibuya arc)
    ctx.fillStyle = 'rgba(120,10,20,0.45)';
    ctx.fillRect(180, 140, 22, 16);
    ctx.fillRect(195, 150, 12, 22);
    ctx.fillRect(870, 200, 28, 18);
    ctx.fillRect(885, 215, 16, 24);

    // Overhead horizontal trim band
    ctx.fillStyle = '#0a0e14';
    ctx.fillRect(0, 80, W, 12);
    ctx.fillStyle = '#2a2e38';
    ctx.fillRect(0, 80, W, 2);

    // Ceiling pipes (detailed metal conduits)
    ctx.fillStyle = '#4a4e58';
    ctx.fillRect(0, 20, W, 12);
    ctx.fillStyle = '#6a6e78';
    ctx.fillRect(0, 20, W, 3);
    ctx.fillStyle = '#2a2e38';
    ctx.fillRect(0, 30, W, 2);
    // Second pipe row
    ctx.fillStyle = '#38404a';
    ctx.fillRect(0, 40, W, 8);
    ctx.fillStyle = '#585c68';
    ctx.fillRect(0, 40, W, 2);
    // Pipe fittings / brackets
    ctx.fillStyle = '#2a2e38';
    for (let x = 60; x < W; x += 160) {
      ctx.fillRect(x, 18, 6, 16);
      ctx.fillRect(x, 16, 6, 2);
    }

    // Flickering fluorescent ceiling lights (evenly spaced)
    for (let x = 100; x < W; x += 200) {
      // Fixture housing
      ctx.fillStyle = '#1a1e24';
      ctx.fillRect(x - 36, 54, 72, 14);
      ctx.fillStyle = '#3a3e48';
      ctx.fillRect(x - 36, 54, 72, 2);
      // Tube light (warm fluorescent)
      ctx.fillStyle = '#f8f0d0';
      ctx.fillRect(x - 32, 58, 64, 6);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(x - 28, 59, 56, 2);
      // Cast light glow cone (subtle)
      ctx.globalAlpha = 0.12;
      ctx.fillStyle = '#f8f0d0';
      ctx.beginPath();
      ctx.moveTo(x - 32, 68);
      ctx.lineTo(x - 90, 200);
      ctx.lineTo(x + 90, 200);
      ctx.lineTo(x + 32, 68);
      ctx.closePath();
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    // Neon station sign (center-back, "SHIBUYA" kanji-inspired)
    const signX = 500, signY = 120;
    // Sign backing
    ctx.fillStyle = '#0a0a0e';
    ctx.fillRect(signX, signY, 280, 64);
    ctx.fillStyle = '#2a2a38';
    ctx.fillRect(signX, signY, 280, 2);
    ctx.fillRect(signX, signY + 62, 280, 2);
    // Neon tubes forming station name (abstract kanji-like strokes)
    ctx.fillStyle = '#ff3050';
    ctx.fillRect(signX + 20, signY + 16, 30, 4);   // horizontal
    ctx.fillRect(signX + 34, signY + 16, 4, 32);   // vertical
    ctx.fillRect(signX + 20, signY + 44, 30, 4);   // horizontal
    // Second character
    ctx.fillStyle = '#5fd7ff';
    ctx.fillRect(signX + 70, signY + 12, 4, 40);
    ctx.fillRect(signX + 70, signY + 24, 30, 4);
    ctx.fillRect(signX + 96, signY + 12, 4, 40);
    // Third character (渋)
    ctx.fillStyle = '#ff60a0';
    ctx.fillRect(signX + 120, signY + 12, 4, 40);
    ctx.fillRect(signX + 120, signY + 12, 30, 4);
    ctx.fillRect(signX + 120, signY + 28, 30, 4);
    ctx.fillRect(signX + 146, signY + 12, 4, 40);
    // Fourth character (谷)
    ctx.fillStyle = '#ffe070';
    ctx.fillRect(signX + 170, signY + 12, 30, 4);
    ctx.fillRect(signX + 182, signY + 12, 4, 40);
    ctx.fillRect(signX + 170, signY + 30, 30, 4);
    // Glow halos around neon
    ctx.globalAlpha = 0.3;
    ctx.fillStyle = '#ff3050';
    ctx.fillRect(signX + 16, signY + 12, 38, 40);
    ctx.fillStyle = '#5fd7ff';
    ctx.fillRect(signX + 66, signY + 8, 38, 48);
    ctx.fillStyle = '#ff60a0';
    ctx.fillRect(signX + 116, signY + 8, 38, 48);
    ctx.fillStyle = '#ffe070';
    ctx.fillRect(signX + 166, signY + 8, 38, 48);
    ctx.globalAlpha = 1;

    // Tunnel openings on each side (far left/right)
    // Left tunnel arch
    ctx.fillStyle = '#04050a';
    ctx.fillRect(0, 200, 100, 280);
    ctx.beginPath();
    ctx.moveTo(0, 200);
    ctx.quadraticCurveTo(50, 160, 100, 200);
    ctx.lineTo(100, 280);
    ctx.lineTo(0, 280);
    ctx.closePath();
    ctx.fill();
    // Arch frame
    ctx.fillStyle = '#2a2e38';
    ctx.beginPath();
    ctx.moveTo(0, 200);
    ctx.quadraticCurveTo(50, 160, 100, 200);
    ctx.lineTo(96, 204);
    ctx.quadraticCurveTo(50, 168, 0, 204);
    ctx.closePath();
    ctx.fill();

    // Right tunnel arch
    ctx.fillStyle = '#04050a';
    ctx.beginPath();
    ctx.moveTo(1180, 200);
    ctx.quadraticCurveTo(1230, 160, 1280, 200);
    ctx.lineTo(1280, 480);
    ctx.lineTo(1180, 480);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#2a2e38';
    ctx.beginPath();
    ctx.moveTo(1180, 200);
    ctx.quadraticCurveTo(1230, 160, 1280, 200);
    ctx.lineTo(1280, 204);
    ctx.quadraticCurveTo(1230, 168, 1184, 204);
    ctx.closePath();
    ctx.fill();

    // Station platform tile strip (bottom yellow warning line)
    ctx.fillStyle = '#1a1620';
    ctx.fillRect(0, 540, W, 8);
    ctx.fillStyle = '#d4a020';
    for (let x = 0; x < W; x += 12) {
      ctx.fillRect(x, 540, 6, 4);
    }
    ctx.fillStyle = '#1a1620';
    ctx.fillRect(0, 548, W, 2);

    // Ticket gate turnstiles (upper platforms area)
    for (const side of [{ x: 120 }, { x: 920 }]) {
      // Gate body
      ctx.fillStyle = '#2a3038';
      ctx.fillRect(side.x, 410, 240, 50);
      // Gate top (brushed steel)
      ctx.fillStyle = '#5a6068';
      ctx.fillRect(side.x, 410, 240, 6);
      ctx.fillStyle = '#8a9098';
      ctx.fillRect(side.x, 410, 240, 2);
      // Gate bottom shadow
      ctx.fillStyle = '#14181e';
      ctx.fillRect(side.x, 454, 240, 6);
      // Turnstile bars (3 gates)
      for (let g = 0; g < 3; g++) {
        const gx = side.x + 30 + g * 70;
        ctx.fillStyle = '#14181e';
        ctx.fillRect(gx, 420, 4, 40);
        ctx.fillStyle = '#4a5058';
        ctx.fillRect(gx - 10, 430, 24, 4); // cross bar
        // Card reader (green LED)
        ctx.fillStyle = '#1a2a20';
        ctx.fillRect(gx - 4, 436, 12, 10);
        ctx.fillStyle = '#40d060';
        ctx.fillRect(gx - 2, 438, 3, 3);
      }
    }

    // Vending machine (left side)
    ctx.fillStyle = '#8a2020';
    ctx.fillRect(30, 340, 60, 120);
    ctx.fillStyle = '#c03030';
    ctx.fillRect(30, 340, 60, 4);
    ctx.fillStyle = '#4a0a10';
    ctx.fillRect(30, 456, 60, 4);
    // Window
    ctx.fillStyle = '#f0c870';
    ctx.fillRect(36, 352, 48, 44);
    ctx.fillStyle = '#1a1218';
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) {
        ctx.fillRect(38 + c * 16, 354 + r * 14, 12, 10);
        ctx.fillStyle = `rgb(${200 + (r + c) * 10},${100 + (r + c) * 15},${50 + (r + c) * 20})`;
        ctx.fillRect(40 + c * 16, 356 + r * 14, 8, 6);
        ctx.fillStyle = '#1a1218';
      }
    }
    // Coin slot
    ctx.fillStyle = '#1a1218';
    ctx.fillRect(40, 408, 40, 16);
    ctx.fillStyle = '#888';
    ctx.fillRect(50, 414, 20, 3);

    // Distant pedestrian silhouettes (far back, atmospheric)
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = '#000000';
    const peeps = [[360, 490], [440, 492], [480, 488], [760, 490], [820, 492]];
    for (const p of peeps) {
      ctx.fillRect(p[0], p[1] - 30, 8, 30);
      ctx.fillRect(p[0] - 1, p[1] - 36, 10, 8);
    }
    ctx.globalAlpha = 1;
  }
}
