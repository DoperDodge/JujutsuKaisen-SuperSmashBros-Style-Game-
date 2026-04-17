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
    // Tokyo Jujutsu High — twilight sky, mountain silhouette, moonlit temple
    // training grounds. Rendered in layered pixel bands for depth.

    // Sky gradient (deep twilight blue)
    const grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, '#0e1838');
    grad.addColorStop(0.5, '#1a2852');
    grad.addColorStop(1, '#2a2036');
    ctx.fillStyle = grad;
    ctx.fillRect(-200, -200, W + 400, H + 400);

    // Stars (pixel dots in the sky)
    ctx.fillStyle = '#e8f0ff';
    const starSeed = [137, 239, 41, 313, 547, 89, 191, 61, 277, 419, 151, 389, 53, 233, 499, 109, 367, 73];
    for (let i = 0; i < starSeed.length; i++) {
      const x = (starSeed[i] * 7) % W;
      const y = (starSeed[i] * 3) % 220;
      const bright = (i % 3 === 0) ? '#ffffff' : '#a8b0d0';
      ctx.fillStyle = bright;
      ctx.fillRect(x, y, 1, 1);
      if (i % 4 === 0) ctx.fillRect(x + 1, y, 1, 1);
    }
    // A few larger stars with glow cross
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(380, 80, 2, 2);
    ctx.fillRect(379, 81, 4, 1);
    ctx.fillRect(381, 79, 1, 4);
    ctx.fillRect(860, 140, 2, 2);
    ctx.fillRect(859, 141, 4, 1);

    // Full moon with craters
    const mx = 220, my = 130;
    ctx.fillStyle = '#2a3458';
    ctx.beginPath(); ctx.arc(mx, my, 40, 0, Math.PI * 2); ctx.fill(); // glow
    ctx.globalAlpha = 0.4;
    ctx.fillStyle = '#e8f0ff';
    ctx.beginPath(); ctx.arc(mx, my, 44, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#f0f4ff';
    ctx.beginPath(); ctx.arc(mx, my, 36, 0, Math.PI * 2); ctx.fill();
    // Moon shadow (crescent shading)
    ctx.fillStyle = '#c8d0e8';
    ctx.beginPath(); ctx.arc(mx + 6, my + 4, 34, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#f0f4ff';
    ctx.beginPath(); ctx.arc(mx - 4, my - 2, 30, 0, Math.PI * 2); ctx.fill();
    // Craters
    ctx.fillStyle = '#c8d0e8';
    ctx.fillRect(mx - 10, my - 8, 4, 3);
    ctx.fillRect(mx + 4, my + 2, 3, 3);
    ctx.fillRect(mx - 6, my + 10, 3, 2);
    ctx.fillRect(mx + 12, my - 6, 2, 2);

    // Far mountain range silhouette
    ctx.fillStyle = '#1a1e30';
    ctx.beginPath();
    ctx.moveTo(0, 380);
    const peaks = [0, 60, 140, 240, 320, 440, 560, 660, 780, 900, 1020, 1160, 1280];
    const heights = [380, 340, 360, 310, 350, 300, 340, 320, 350, 310, 360, 330, 380];
    for (let i = 0; i < peaks.length; i++) ctx.lineTo(peaks[i], heights[i]);
    ctx.lineTo(W, H); ctx.lineTo(0, H); ctx.closePath(); ctx.fill();

    // Mid mountain range (darker)
    ctx.fillStyle = '#141828';
    ctx.beginPath();
    ctx.moveTo(0, 420);
    const peaks2 = [0, 80, 180, 260, 380, 480, 600, 720, 840, 960, 1080, 1200, 1280];
    const heights2 = [420, 400, 420, 380, 410, 390, 420, 400, 430, 390, 420, 410, 420];
    for (let i = 0; i < peaks2.length; i++) ctx.lineTo(peaks2[i], heights2[i]);
    ctx.lineTo(W, H); ctx.lineTo(0, H); ctx.closePath(); ctx.fill();

    // Cherry blossom silhouettes (left and right of frame)
    ctx.fillStyle = '#0a0c18';
    // Left tree
    ctx.fillRect(90, 430, 3, 120);
    for (let r = 0; r < 5; r++) {
      ctx.fillRect(75 + r * 4, 440 - r * 2, 30 - r * 4, 8);
    }
    ctx.fillStyle = '#5a3048';
    for (let i = 0; i < 8; i++) {
      const px = 70 + (i * 5) % 30;
      const py = 420 + (i * 7) % 30;
      ctx.fillRect(px, py, 2, 2);
    }
    ctx.fillStyle = '#ffa8c8';
    for (let i = 0; i < 6; i++) {
      const px = 72 + (i * 6) % 30;
      const py = 418 + (i * 5) % 20;
      ctx.fillRect(px, py, 1, 1);
    }

    // Right tree
    ctx.fillStyle = '#0a0c18';
    ctx.fillRect(1190, 430, 3, 120);
    for (let r = 0; r < 5; r++) {
      ctx.fillRect(1175 - r * 2 + r * 4, 440 - r * 2, 30 - r * 4, 8);
    }
    ctx.fillStyle = '#5a3048';
    for (let i = 0; i < 8; i++) {
      const px = 1175 + (i * 5) % 30;
      const py = 420 + (i * 7) % 30;
      ctx.fillRect(px, py, 2, 2);
    }
    ctx.fillStyle = '#ffa8c8';
    for (let i = 0; i < 6; i++) {
      const px = 1177 + (i * 6) % 30;
      const py = 418 + (i * 5) % 20;
      ctx.fillRect(px, py, 1, 1);
    }

    // Main school building — traditional Japanese temple silhouette (background)
    ctx.fillStyle = '#0c1218';
    // Main building body
    ctx.fillRect(240, 400, 800, 180);
    ctx.fillStyle = '#181e26';
    ctx.fillRect(240, 400, 800, 4); // roof line
    // Pagoda roof tiers (2 levels)
    ctx.fillStyle = '#0a0e14';
    ctx.beginPath();
    ctx.moveTo(200, 400);
    ctx.lineTo(310, 360);
    ctx.lineTo(1040, 360);
    ctx.lineTo(1080, 400);
    ctx.closePath();
    ctx.fill();
    // Upper roof
    ctx.fillStyle = '#080c12';
    ctx.fillRect(440, 340, 400, 22);
    ctx.beginPath();
    ctx.moveTo(420, 340);
    ctx.lineTo(490, 300);
    ctx.lineTo(790, 300);
    ctx.lineTo(860, 340);
    ctx.closePath();
    ctx.fill();
    // Roof tile rows (pixel detail)
    ctx.fillStyle = '#161c26';
    for (let x = 220; x < 1060; x += 8) {
      ctx.fillRect(x, 368, 6, 2);
      ctx.fillRect(x + 2, 374, 6, 2);
    }
    // Upper roof ornament (shachihoko / fish ornament)
    ctx.fillStyle = '#4a3020';
    ctx.fillRect(635, 288, 3, 14);
    ctx.fillStyle = '#d4a030';
    ctx.fillRect(633, 286, 7, 3);
    ctx.fillRect(632, 290, 2, 4);
    ctx.fillRect(640, 290, 2, 4);

    // Windows with warm glow
    ctx.fillStyle = '#1a1218';
    const windows = [[280, 460, 40, 50], [360, 460, 40, 50], [440, 460, 40, 50],
                     [800, 460, 40, 50], [880, 460, 40, 50], [960, 460, 40, 50]];
    for (const w of windows) {
      ctx.fillStyle = '#1a1218';
      ctx.fillRect(w[0], w[1], w[2], w[3]);
      // Warm orange glow
      ctx.fillStyle = '#f0a848';
      ctx.fillRect(w[0] + 3, w[1] + 3, w[2] - 6, w[3] - 6);
      // Window panes (cross pattern)
      ctx.fillStyle = '#1a1218';
      ctx.fillRect(w[0] + (w[2] >> 1) - 1, w[1] + 3, 2, w[3] - 6);
      ctx.fillRect(w[0] + 3, w[1] + (w[3] >> 1) - 1, w[2] - 6, 2);
      // Soft light bleed
      ctx.globalAlpha = 0.15;
      ctx.fillStyle = '#f0a848';
      ctx.fillRect(w[0] - 6, w[1] - 6, w[2] + 12, w[3] + 12);
      ctx.globalAlpha = 1;
    }

    // Torii gate in foreground (center distant)
    ctx.fillStyle = '#8a1818';
    ctx.fillRect(600, 480, 6, 80);
    ctx.fillRect(674, 480, 6, 80);
    // Top beam
    ctx.fillStyle = '#6a1212';
    ctx.fillRect(588, 470, 104, 6);
    ctx.fillStyle = '#8a1818';
    ctx.fillRect(592, 476, 96, 4);
    // Shadow
    ctx.fillStyle = '#4a0808';
    ctx.fillRect(602, 480, 2, 80);
    ctx.fillRect(676, 480, 2, 80);

    // Foreground training ground (stone pattern suggestion, very subtle)
    ctx.globalAlpha = 0.4;
    ctx.fillStyle = '#1a1e2a';
    ctx.fillRect(0, 580, W, 4);
    ctx.globalAlpha = 1;

    // Falling cherry blossom petals drifting
    ctx.fillStyle = '#ffb8d0';
    const petals = [[150, 180], [340, 260], [520, 320], [780, 220], [960, 290], [1100, 200], [450, 150], [900, 180]];
    for (const p of petals) {
      ctx.fillRect(p[0], p[1], 2, 1);
      ctx.fillRect(p[0] + 1, p[1] + 1, 1, 1);
    }
  }
}
