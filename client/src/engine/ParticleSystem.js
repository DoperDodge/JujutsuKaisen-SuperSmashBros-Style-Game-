// Lightweight particle system for VFX (cursed energy, hit sparks, slash trails, domain wisps).

export class ParticleSystem {
  constructor() { this.parts = []; }

  spawn(opts) {
    this.parts.push({
      x: opts.x, y: opts.y,
      vx: opts.vx ?? 0, vy: opts.vy ?? 0,
      gravity: opts.gravity ?? 0,
      life: opts.life ?? 30, age: 0,
      size: opts.size ?? 4,
      color: opts.color ?? '#ffffff',
      shape: opts.shape ?? 'square', // square, circle, line, kanji
      text: opts.text,
      shrink: opts.shrink ?? 0,
      glow: opts.glow ?? false,
      angle: opts.angle ?? 0,
    });
  }

  burst(x, y, color, n = 12, speed = 3) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = speed * (0.5 + Math.random());
      this.spawn({
        x, y,
        vx: Math.cos(a) * s, vy: Math.sin(a) * s,
        gravity: 0.15,
        life: 18 + (Math.random() * 12) | 0,
        size: 3 + (Math.random() * 3) | 0,
        color, shrink: 0.1, glow: true,
      });
    }
  }

  hitspark(x, y) {
    this.burst(x, y, '#ffe070', 14, 4);
    this.burst(x, y, '#fff7c8', 6, 2);
  }

  trail(x, y, color) {
    this.spawn({ x, y, life: 14, size: 6, color, shrink: 0.3, glow: true });
  }

  update() {
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const p = this.parts[i];
      p.age++;
      p.x += p.vx;
      p.y += p.vy;
      p.vy += p.gravity;
      p.size -= p.shrink;
      if (p.age >= p.life || p.size <= 0) this.parts.splice(i, 1);
    }
  }

  render(ctx) {
    for (const p of this.parts) {
      const t = 1 - p.age / p.life;
      ctx.globalAlpha = Math.max(0, t);
      if (p.glow) {
        ctx.shadowColor = p.color;
        ctx.shadowBlur = 12;
      }
      ctx.fillStyle = p.color;
      if (p.shape === 'circle') {
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill();
      } else if (p.shape === 'line') {
        ctx.strokeStyle = p.color;
        ctx.lineWidth = p.size;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x + p.vx * 4, p.y + p.vy * 4);
        ctx.stroke();
      } else if (p.shape === 'kanji' && p.text) {
        ctx.font = `${p.size * 4}px monospace`;
        ctx.fillText(p.text, p.x, p.y);
      } else {
        ctx.fillRect(p.x - p.size * 0.5, p.y - p.size * 0.5, p.size, p.size);
      }
      ctx.shadowBlur = 0;
    }
    ctx.globalAlpha = 1;
  }

  clear() { this.parts.length = 0; }
}
