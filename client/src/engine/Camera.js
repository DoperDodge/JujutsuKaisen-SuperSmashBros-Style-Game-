// Smash-style camera that tracks both fighters with dynamic zoom.

export class Camera {
  constructor(canvasW, canvasH) {
    this.canvasW = canvasW;
    this.canvasH = canvasH;
    this.x = canvasW * 0.5;
    this.y = canvasH * 0.5;
    this.zoom = 1.0;
    this.targetZoom = 1.0;
    this.shakeAmount = 0;
    this.shakeTimer = 0;
  }

  shake(amount, frames = 8) {
    this.shakeAmount = Math.max(this.shakeAmount, amount);
    this.shakeTimer = Math.max(this.shakeTimer, frames);
  }

  follow(fighters) {
    if (!fighters.length) return;
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const f of fighters) {
      if (f.ko) continue;
      if (f.x < minX) minX = f.x;
      if (f.x > maxX) maxX = f.x;
      if (f.y < minY) minY = f.y;
      if (f.y > maxY) maxY = f.y;
    }
    if (minX === Infinity) return;
    const cx = (minX + maxX) * 0.5;
    const cy = (minY + maxY) * 0.5 - 100;
    const spread = Math.max(maxX - minX, (maxY - minY) * 1.5, 400);
    const desiredZoom = Math.min(1.4, Math.max(0.65, (this.canvasW * 0.7) / spread));
    this.targetZoom = desiredZoom;
    this.zoom += (this.targetZoom - this.zoom) * 0.08;
    this.x += (cx - this.x) * 0.12;
    this.y += (cy - this.y) * 0.12;

    if (this.shakeTimer > 0) this.shakeTimer--;
    else this.shakeAmount = 0;
  }

  apply(ctx) {
    const sx = this.shakeTimer > 0 ? (Math.random() - 0.5) * this.shakeAmount : 0;
    const sy = this.shakeTimer > 0 ? (Math.random() - 0.5) * this.shakeAmount : 0;
    ctx.save();
    ctx.translate(this.canvasW * 0.5 + sx, this.canvasH * 0.5 + sy);
    ctx.scale(this.zoom, this.zoom);
    ctx.translate(-this.x, -this.y);
  }
  restore(ctx) { ctx.restore(); }
}
