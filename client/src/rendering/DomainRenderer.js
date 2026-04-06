// Full-screen Domain Expansion cinematic and overlay renderer.

export class DomainRenderer {
  constructor(canvas) { this.canvas = canvas; this.ctx = canvas.getContext('2d'); }

  // Cinematic flash phase: t in [0,1]
  drawActivation(t, name, color = '#5fd7ff') {
    const ctx = this.ctx;
    const W = this.canvas.width, H = this.canvas.height;
    ctx.save();
    // bright white flash that fades into name banner
    const a = Math.max(0, 1 - t);
    ctx.fillStyle = `rgba(255,255,255,${a * 0.85})`;
    ctx.fillRect(0, 0, W, H);
    // name banner sliding in
    const slide = Math.min(1, t * 2);
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(0, H * 0.35, W, 120);
    ctx.textAlign = 'center';
    ctx.font = 'bold 64px monospace';
    ctx.fillStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = 30;
    ctx.fillText(name, W * 0.5, H * 0.45 + (1 - slide) * 40);
    ctx.font = '20px monospace';
    ctx.fillStyle = '#ffffff';
    ctx.fillText('DOMAIN EXPANSION', W * 0.5, H * 0.5 + 30);
    ctx.restore();
  }
}
