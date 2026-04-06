// Domain Expansion meter, activation, lifecycle, and per-character domain effects.
// Each domain implements: activate(), update(tick), render(ctx), deactivate().

import { CONSTANTS, DOMAIN_GAIN, STAGE_BOUNDS } from '../../../shared/Constants.js';

export class DomainMeter {
  constructor() {
    this.value = 0;
    this.max = CONSTANTS.DOMAIN_METER_MAX;
    this.lockout = 0;
  }
  tick() {
    if (this.lockout > 0) { this.lockout--; return; }
    this.value = Math.min(this.max, this.value + DOMAIN_GAIN.PASSIVE);
  }
  addOnHit(kind) {
    if (this.lockout > 0) return;
    const amt = DOMAIN_GAIN[kind] || 0;
    this.value = Math.min(this.max, this.value + amt);
  }
  addOnDamageTaken(dmg) {
    if (this.lockout > 0) return;
    this.value = Math.min(this.max, this.value + DOMAIN_GAIN.PER_DAMAGE_TAKEN * dmg);
  }
  ready() { return this.value >= this.max && this.lockout === 0; }
  consume() {
    this.value = 0;
    this.lockout = CONSTANTS.DOMAIN_LOCKOUT;
  }
}

// Base class
class Domain {
  constructor(owner) {
    this.owner = owner;
    this.tick = 0;
    this.duration = 300; // 5s default
    this.active = true;
    this.barrierRadius = 600;
    this.name = 'Domain';
  }
  update(world) { this.tick++; if (this.tick >= this.duration) this.active = false; }
  render(ctx, world) {}
  onActivate(world) {}
}

// --- Unlimited Void (Gojo) ---
export class UnlimitedVoid extends Domain {
  constructor(owner) {
    super(owner);
    this.name = 'Unlimited Void';
    this.duration = 300; // 5 seconds
    this.barrierRadius = 700;
    this.kanjiParticles = [];
  }
  onActivate(world) {
    for (const f of world.fighters) {
      if (f === this.owner) continue;
      const dx = f.x - this.owner.x;
      if (Math.abs(dx) < this.barrierRadius) {
        f.domainStun = this.duration;
        f.domainStunSource = 'void';
      }
    }
  }
  update(world) {
    super.update(world);
    if (this.tick % 60 === 0) {
      for (const f of world.fighters) {
        if (f === this.owner) continue;
        if (f.domainStun > 0) f.percent += 3;
      }
    }
    // emit info-stream particles
    for (let i = 0; i < 4; i++) {
      world.particles.spawn({
        x: this.owner.x + (Math.random() - 0.5) * 1400,
        y: STAGE_BOUNDS.TOP + Math.random() * (STAGE_BOUNDS.BOTTOM - STAGE_BOUNDS.TOP),
        vx: 0, vy: 4 + Math.random() * 6,
        life: 60, size: 2 + Math.random() * 2,
        color: '#9fefff', glow: true, shape: 'circle',
      });
    }
    if (!this.active) {
      // launch on collapse
      for (const f of world.fighters) {
        if (f === this.owner || f.domainStun <= 0) continue;
        f.domainStun = 0;
        f.vx = (f.x > this.owner.x ? 1 : -1) * 8;
        f.vy = -6;
        f.hitstun = 30;
      }
    }
  }
  render(ctx, world) {
    const ox = this.owner.x, oy = this.owner.y - 100;
    // cosmic gradient circle
    const r = this.barrierRadius;
    const grad = ctx.createRadialGradient(ox, oy, 20, ox, oy, r);
    grad.addColorStop(0, 'rgba(255,255,255,0.95)');
    grad.addColorStop(0.4, 'rgba(180,220,255,0.7)');
    grad.addColorStop(1, 'rgba(0,0,30,0.85)');
    ctx.fillStyle = grad;
    ctx.beginPath(); ctx.arc(ox, oy, r, 0, Math.PI * 2); ctx.fill();
  }
}

// --- Malevolent Shrine (Sukuna) ---
export class MalevolentShrine extends Domain {
  constructor(owner) {
    super(owner);
    this.name = 'Malevolent Shrine';
    this.duration = 360; // 6 seconds
  }
  update(world) {
    super.update(world);
    // continuous slashes every 30 frames
    if (this.tick % 30 === 0) {
      for (const f of world.fighters) {
        if (f === this.owner || f.ko) continue;
        const cleavedDmg = 2 + (f.percent * 0.02);
        f.percent += cleavedDmg;
        f.hitstun = Math.max(f.hitstun, 8);
        // visual slash
        for (let i = 0; i < 3; i++) {
          world.particles.spawn({
            x: f.x + (Math.random() - 0.5) * 80,
            y: f.y - 40 + (Math.random() - 0.5) * 80,
            vx: 8, vy: 0,
            life: 14, size: 3, color: '#ff3050', glow: true, shape: 'line',
          });
        }
      }
    }
    // Ambient slash particles across the screen
    if (this.tick % 6 === 0) {
      world.particles.spawn({
        x: -200 + Math.random() * 1700,
        y: -100 + Math.random() * 900,
        vx: 14, vy: 0, life: 18, size: 2,
        color: '#ff5060', glow: true, shape: 'line',
      });
    }
  }
  render(ctx, world) {
    // blood-red sky, no barrier
    ctx.fillStyle = 'rgba(40,0,8,0.5)';
    ctx.fillRect(STAGE_BOUNDS.LEFT - 200, STAGE_BOUNDS.TOP - 200,
                 (STAGE_BOUNDS.RIGHT - STAGE_BOUNDS.LEFT) + 400,
                 (STAGE_BOUNDS.BOTTOM - STAGE_BOUNDS.TOP) + 400);
    // shrine silhouette
    ctx.fillStyle = '#1a0008';
    ctx.fillRect(this.owner.x - 220, this.owner.y - 380, 440, 200);
    ctx.fillStyle = '#3a0010';
    ctx.fillRect(this.owner.x - 200, this.owner.y - 350, 400, 30);
    // ox skulls
    ctx.fillStyle = '#e8d0a0';
    for (let i = 0; i < 5; i++) {
      const x = this.owner.x - 200 + i * 100;
      ctx.fillRect(x, this.owner.y - 330, 24, 24);
    }
  }
}

// --- Self-Embodiment of Perfection (Mahito) ---
export class SelfEmbodiment extends Domain {
  constructor(owner) {
    super(owner);
    this.name = 'Self-Embodiment of Perfection';
    this.duration = 240; // 4s
    this.barrierRadius = 500;
  }
  onActivate(world) {
    for (const f of world.fighters) {
      if (f === this.owner || f.ko) continue;
      const dx = f.x - this.owner.x;
      if (Math.abs(dx) < this.barrierRadius) {
        f.soulCorruption = 5;
        f.percent += 12;
        f.hitstun = 18;
      }
    }
    // Mahito gets reduced CE costs and double-stack handled in fighter via flag
    this.owner.domainEnhanced = true;
  }
  update(world) {
    super.update(world);
    if (!this.active) {
      this.owner.domainEnhanced = false;
      // burst all stacks
      for (const f of world.fighters) {
        if (f === this.owner || f.ko) continue;
        const stacks = f.soulCorruption || 0;
        if (stacks > 0) {
          f.percent += stacks * 3;
          f.hitstun = Math.max(f.hitstun, 14);
          f.soulCorruption = 0;
        }
      }
    }
  }
  render(ctx, world) {
    const ox = this.owner.x, oy = this.owner.y - 100;
    ctx.fillStyle = 'rgba(20,8,30,0.85)';
    ctx.beginPath(); ctx.arc(ox, oy, this.barrierRadius, 0, Math.PI * 2); ctx.fill();
    // floral hand pattern (simplified)
    ctx.strokeStyle = 'rgba(180,160,200,0.6)';
    ctx.lineWidth = 3;
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + this.tick * 0.005;
      ctx.beginPath();
      ctx.arc(ox + Math.cos(a) * 200, oy + Math.sin(a) * 200, 60, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
}

// --- Unlimited Boogie Woogie (Todo) — not a true Domain ---
export class UnlimitedBoogieWoogie extends Domain {
  constructor(owner) {
    super(owner);
    this.name = 'Unlimited Boogie Woogie';
    this.duration = 480; // 8s
  }
  onActivate(world) { this.owner.boogieMode = true; }
  update(world) {
    super.update(world);
    if (!this.active) this.owner.boogieMode = false;
  }
  render(ctx, world) {
    // pulsing aura around Todo
    const ox = this.owner.x, oy = this.owner.y - 60;
    const r = 80 + Math.sin(this.tick * 0.3) * 20;
    ctx.strokeStyle = 'rgba(120,200,255,0.7)';
    ctx.lineWidth = 4;
    ctx.beginPath(); ctx.arc(ox, oy, r, 0, Math.PI * 2); ctx.stroke();
  }
}

export const DOMAIN_BY_FIGHTER = {
  gojo: UnlimitedVoid,
  yuji: MalevolentShrine,    // forces swap to sukuna
  sukuna: MalevolentShrine,
  mahito: SelfEmbodiment,
  todo: UnlimitedBoogieWoogie,
};
