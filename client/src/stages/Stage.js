// Base Stage class. Concrete stages provide ground/platforms/background hazards.

export class Stage {
  constructor(name) {
    this.name = name;
    this.ground = { x: 100, y: 580, w: 1080 };
    this.platforms = [];
    this.hazards = [];
    this.hazardEnabled = true;
    this.spawnPoints = [{ x: 380, y: 400 }, { x: 900, y: 400 }];
    this.platformColor = '#4a586a';
    this.groundColor = '#3a4658';
    this.groundEdge = '#586878';
  }
  background(ctx, W, H) {
    const grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, '#0a1020');
    grad.addColorStop(1, '#1a2030');
    ctx.fillStyle = grad;
    ctx.fillRect(-200, -200, W + 400, H + 400);
  }
  update(world) {
    if (!this.hazardEnabled) return;
    for (const h of this.hazards) h.update && h.update(world);
  }
  render(ctx, world) {
    for (const h of this.hazards) h.render && h.render(ctx);
  }
}
