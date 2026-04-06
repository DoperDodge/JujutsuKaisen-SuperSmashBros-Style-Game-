// HUD rendering: damage %, CE meter, stocks, Domain meter, names.

export class UIRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
  }

  drawHUD(fighters, world) {
    const ctx = this.ctx;
    const W = this.canvas.width;
    const H = this.canvas.height;
    const slots = fighters.length;
    const slotW = W / slots;

    for (let i = 0; i < fighters.length; i++) {
      const f = fighters[i];
      const x = i * slotW + 20;
      const y = H - 110;
      // Background panel
      ctx.fillStyle = 'rgba(8,10,20,0.78)';
      ctx.fillRect(x - 10, y - 10, slotW - 20, 100);
      ctx.strokeStyle = '#5fd7ff66';
      ctx.strokeRect(x - 10, y - 10, slotW - 20, 100);

      // name + stocks
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 16px monospace';
      ctx.fillText(f.displayName, x, y + 10);
      ctx.fillStyle = '#ffe070';
      for (let s = 0; s < f.stocks; s++) {
        ctx.fillRect(x + 130 + s * 14, y, 10, 10);
      }

      // damage %
      const pct = Math.floor(f.percent);
      ctx.font = 'bold 38px monospace';
      const r = Math.min(255, 80 + pct * 1.5) | 0;
      const g = Math.max(50, 255 - pct * 2) | 0;
      ctx.fillStyle = `rgb(${r},${g},80)`;
      ctx.fillText(`${pct}%`, x, y + 50);

      // CE meter
      ctx.fillStyle = '#222';
      ctx.fillRect(x, y + 60, 200, 8);
      ctx.fillStyle = '#5fd7ff';
      ctx.fillRect(x, y + 60, 200 * (f.ce / f.ceMax), 8);
      ctx.strokeStyle = '#5fd7ff88';
      ctx.strokeRect(x, y + 60, 200, 8);
      ctx.font = '10px monospace';
      ctx.fillStyle = '#5fd7ff';
      ctx.fillText('CE', x + 205, y + 68);

      // Domain meter
      ctx.fillStyle = '#222';
      ctx.fillRect(x, y + 74, 200, 8);
      const dm = f.domainMeter;
      const dr = dm.ready();
      ctx.fillStyle = dr ? '#ff60a0' : (dm.lockout > 0 ? '#444' : '#a040d0');
      ctx.fillRect(x, y + 74, 200 * (dm.value / dm.max), 8);
      ctx.strokeStyle = '#a040d088';
      ctx.strokeRect(x, y + 74, 200, 8);
      ctx.fillStyle = dr ? '#ff60a0' : '#a040d0';
      ctx.fillText(dr ? 'DOMAIN READY!' : 'DOMAIN', x + 205, y + 82);
    }

    // timer
    if (world.timer != null) {
      const secs = Math.max(0, Math.ceil(world.timer / 60));
      const m = (secs / 60 | 0).toString().padStart(2, '0');
      const s = (secs % 60).toString().padStart(2, '0');
      ctx.font = 'bold 32px monospace';
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      ctx.fillText(`${m}:${s}`, W * 0.5, 40);
      ctx.textAlign = 'left';
    }
  }

  drawCenterText(text, sub) {
    const ctx = this.ctx;
    ctx.save();
    ctx.textAlign = 'center';
    ctx.font = 'bold 56px monospace';
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = '#5fd7ff';
    ctx.shadowBlur = 20;
    ctx.fillText(text, this.canvas.width * 0.5, this.canvas.height * 0.5);
    if (sub) {
      ctx.font = '18px monospace';
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#a0a8c0';
      ctx.fillText(sub, this.canvas.width * 0.5, this.canvas.height * 0.5 + 36);
    }
    ctx.restore();
  }
}
