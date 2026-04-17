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
    // Shinjuku Showdown — destroyed Tokyo cityscape at dusk/night, the Gojo
    // vs Sukuna battlefield. Burning ruins, smoke plumes, blood-red sky,
    // rubble in the foreground. Rendered with layered depth.

    // Apocalyptic sky gradient
    const grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, '#1c0818');
    grad.addColorStop(0.35, '#3a0a1a');
    grad.addColorStop(0.65, '#5a1410');
    grad.addColorStop(1, '#2a0808');
    ctx.fillStyle = grad;
    ctx.fillRect(-200, -200, W + 400, H + 400);

    // Distant glow on horizon (fires reflecting in atmosphere)
    const hgrad = ctx.createLinearGradient(0, 380, 0, 540);
    hgrad.addColorStop(0, 'rgba(255,120,40,0.22)');
    hgrad.addColorStop(1, 'rgba(255,120,40,0)');
    ctx.fillStyle = hgrad;
    ctx.fillRect(0, 380, W, 160);

    // Smoke plumes rising (dark clouds)
    ctx.globalAlpha = 0.45;
    ctx.fillStyle = '#1a0a0a';
    // Plume 1 (center-left)
    ctx.beginPath(); ctx.arc(260, 140, 60, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(300, 110, 50, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(240, 80, 45, 0, Math.PI * 2); ctx.fill();
    // Plume 2 (right)
    ctx.beginPath(); ctx.arc(920, 160, 70, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(980, 130, 60, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(890, 90, 55, 0, Math.PI * 2); ctx.fill();
    // Plume 3 (far right)
    ctx.beginPath(); ctx.arc(1140, 180, 55, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(1180, 140, 45, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;

    // Blood moon
    const mx = 980, my = 150;
    ctx.fillStyle = '#4a1010';
    ctx.beginPath(); ctx.arc(mx, my, 48, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#8a1820';
    ctx.beginPath(); ctx.arc(mx, my, 38, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#c02030';
    ctx.beginPath(); ctx.arc(mx - 4, my - 3, 32, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#e04850';
    ctx.beginPath(); ctx.arc(mx - 8, my - 6, 22, 0, Math.PI * 2); ctx.fill();
    // Craters
    ctx.fillStyle = '#6a1418';
    ctx.fillRect(mx - 6, my - 10, 4, 3);
    ctx.fillRect(mx + 6, my + 4, 3, 3);
    ctx.fillRect(mx - 10, my + 8, 3, 2);

    // Far-distance skyline silhouette (destroyed city)
    ctx.fillStyle = '#0a0408';
    const farBuildings = [
      [0, 320, 80, 260], [80, 280, 60, 300], [140, 340, 40, 240],
      [180, 290, 70, 290], [250, 360, 50, 220], [300, 310, 90, 270],
      [390, 340, 50, 240], [440, 280, 80, 300], [520, 330, 60, 250],
      [580, 300, 50, 280], [630, 350, 70, 230], [700, 290, 60, 290],
      [760, 340, 40, 240], [800, 310, 80, 270], [880, 350, 50, 230],
      [930, 290, 70, 290], [1000, 340, 50, 240], [1050, 300, 80, 280],
      [1130, 330, 60, 250], [1190, 290, 90, 290],
    ];
    for (const b of farBuildings) {
      ctx.fillRect(b[0], b[1], b[2], b[3]);
    }
    // Window glints on far buildings (very small)
    ctx.fillStyle = '#ff8040';
    const glints = [
      [30, 380], [50, 410], [100, 340], [150, 420], [200, 360],
      [260, 420], [320, 370], [370, 400], [430, 340], [490, 390],
      [560, 350], [600, 420], [660, 380], [720, 350], [790, 410],
      [850, 360], [910, 340], [970, 410], [1040, 370], [1100, 350],
      [1170, 420], [1230, 340],
    ];
    for (const g of glints) {
      ctx.fillRect(g[0], g[1], 2, 3);
    }

    // Mid-distance large destroyed building on left
    ctx.fillStyle = '#150a10';
    // Broken tower with jagged top
    ctx.beginPath();
    ctx.moveTo(80, 580);
    ctx.lineTo(80, 250);
    ctx.lineTo(120, 220);    // jagged edge
    ctx.lineTo(140, 240);
    ctx.lineTo(170, 200);
    ctx.lineTo(190, 230);
    ctx.lineTo(220, 210);
    ctx.lineTo(240, 260);
    ctx.lineTo(260, 240);
    ctx.lineTo(270, 280);
    ctx.lineTo(270, 580);
    ctx.closePath();
    ctx.fill();
    // Window grid on building
    ctx.fillStyle = '#ffaa30';
    for (let row = 0; row < 10; row++) {
      for (let col = 0; col < 4; col++) {
        if ((row + col * 3) % 4 === 0) continue; // some dark
        ctx.fillRect(100 + col * 40, 280 + row * 28, 18, 14);
      }
    }
    // Broken windows (darker/red)
    ctx.fillStyle = '#a03020';
    ctx.fillRect(100, 280, 18, 14);
    ctx.fillRect(180, 336, 18, 14);
    ctx.fillRect(220, 420, 18, 14);
    ctx.fillStyle = '#2a1008';
    ctx.fillRect(140, 308, 18, 14);
    ctx.fillRect(220, 364, 18, 14);
    ctx.fillRect(100, 448, 18, 14);
    // Building edge highlight (rim light from moon)
    ctx.fillStyle = '#3a1a1a';
    ctx.fillRect(80, 250, 2, 330);

    // Mid-distance large destroyed building on right
    ctx.fillStyle = '#120810';
    ctx.beginPath();
    ctx.moveTo(1020, 580);
    ctx.lineTo(1020, 280);
    ctx.lineTo(1040, 250);
    ctx.lineTo(1060, 270);
    ctx.lineTo(1080, 210);
    ctx.lineTo(1110, 240);
    ctx.lineTo(1140, 190);
    ctx.lineTo(1170, 260);
    ctx.lineTo(1200, 230);
    ctx.lineTo(1220, 280);
    ctx.lineTo(1220, 580);
    ctx.closePath();
    ctx.fill();
    // Windows
    ctx.fillStyle = '#ffaa30';
    for (let row = 0; row < 10; row++) {
      for (let col = 0; col < 4; col++) {
        if ((row + col * 2) % 5 === 0) continue;
        ctx.fillRect(1035 + col * 40, 300 + row * 28, 18, 14);
      }
    }
    ctx.fillStyle = '#a03020';
    ctx.fillRect(1035, 356, 18, 14);
    ctx.fillRect(1115, 400, 18, 14);
    ctx.fillStyle = '#2a1008';
    ctx.fillRect(1075, 328, 18, 14);
    ctx.fillRect(1195, 440, 18, 14);
    // Rim highlight
    ctx.fillStyle = '#3a1a1a';
    ctx.fillRect(1218, 280, 2, 300);

    // Center crater / blast zone — open air, shattered ground
    // Toppled building in middle foreground
    ctx.fillStyle = '#0a0408';
    ctx.beginPath();
    ctx.moveTo(480, 580);
    ctx.lineTo(460, 480);
    ctx.lineTo(430, 460);  // broken top
    ctx.lineTo(440, 440);
    ctx.lineTo(420, 420);
    ctx.lineTo(440, 400);
    ctx.lineTo(460, 420);
    ctx.lineTo(500, 380);
    ctx.lineTo(520, 460);
    ctx.lineTo(540, 470);
    ctx.lineTo(560, 480);
    ctx.lineTo(580, 580);
    ctx.closePath();
    ctx.fill();
    // Windows (dimmer, some broken)
    ctx.fillStyle = '#ffaa30';
    for (let row = 0; row < 5; row++) {
      for (let col = 0; col < 3; col++) {
        if ((row + col * 2) % 3 === 0) continue;
        ctx.fillRect(476 + col * 28, 498 + row * 20, 14, 10);
      }
    }

    // Large rubble / debris in foreground (scattered chunks)
    ctx.fillStyle = '#0a0408';
    ctx.fillRect(320, 540, 80, 40);
    ctx.fillRect(340, 520, 50, 20);
    ctx.fillStyle = '#1a1010';
    ctx.fillRect(322, 540, 80, 2);
    ctx.fillRect(342, 520, 50, 2);
    // Rebar sticking out
    ctx.fillStyle = '#4a3020';
    ctx.fillRect(346, 504, 2, 20);
    ctx.fillRect(358, 500, 2, 24);
    ctx.fillRect(380, 510, 2, 14);

    ctx.fillStyle = '#0a0408';
    ctx.fillRect(720, 550, 100, 30);
    ctx.fillRect(740, 530, 60, 20);
    ctx.fillStyle = '#1a1010';
    ctx.fillRect(722, 550, 100, 2);
    ctx.fillRect(742, 530, 60, 2);
    ctx.fillStyle = '#4a3020';
    ctx.fillRect(746, 514, 2, 18);
    ctx.fillRect(770, 510, 2, 22);
    ctx.fillRect(790, 516, 2, 16);

    // Small debris chunks
    ctx.fillStyle = '#0a0408';
    const debris = [[200, 560], [300, 570], [620, 560], [640, 565], [860, 562], [1060, 560]];
    for (const d of debris) {
      ctx.fillRect(d[0], d[1], 18, 14);
      ctx.fillRect(d[0] + 4, d[1] - 4, 10, 4);
    }

    // Fire glow at base (small flickering flames)
    ctx.fillStyle = '#ff8040';
    ctx.globalAlpha = 0.8;
    ctx.beginPath();
    ctx.arc(360, 560, 12, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffc060';
    ctx.beginPath(); ctx.arc(358, 558, 6, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ff8040';
    ctx.beginPath(); ctx.arc(780, 562, 10, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ffc060';
    ctx.beginPath(); ctx.arc(778, 560, 5, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;

    // Floating embers drifting upward
    ctx.fillStyle = '#ff8040';
    const embers = [[180, 320], [380, 280], [540, 240], [720, 300], [880, 340], [1060, 280], [290, 200], [620, 180], [820, 220]];
    for (const e of embers) {
      ctx.fillRect(e[0], e[1], 1, 1);
      ctx.fillRect(e[0] + 1, e[1] + 1, 1, 1);
    }
    // Brighter embers
    ctx.fillStyle = '#ffe080';
    const brightEmbers = [[260, 280], [480, 260], [680, 310], [920, 300], [1100, 240]];
    for (const e of brightEmbers) {
      ctx.fillRect(e[0], e[1], 2, 2);
    }

    // Atmospheric haze (bottom fog)
    ctx.globalAlpha = 0.3;
    const fogGrad = ctx.createLinearGradient(0, 480, 0, 580);
    fogGrad.addColorStop(0, 'rgba(60,20,20,0)');
    fogGrad.addColorStop(1, 'rgba(80,20,20,0.6)');
    ctx.fillStyle = fogGrad;
    ctx.fillRect(0, 480, W, 100);
    ctx.globalAlpha = 1;
  }
}

export { Shinjuku as ShibuyaStation };
