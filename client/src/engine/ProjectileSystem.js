// Projectile / hazard zone system. A projectile is a lightweight entity that
// lives in the world, travels on its own velocity, and can hit opponents. It
// is used for Gojo's Red orb, Gojo's Blue pull sphere, Mahito's Transfigured
// Human, Sukuna's Dismantle slashes, and stage hazards.
//
// A projectile carries its own hitbox so it does NOT need the owner to be in
// an attack state to deal damage. Each projectile tracks the fighters it has
// already hit so a single projectile hits each opponent at most once unless
// `multiHit` is enabled.

import { aabbOverlap } from './Physics.js';
import { applyHit } from '../systems/DamageSystem.js';

export class ProjectileSystem {
  constructor() { this.list = []; }
  clear() { this.list.length = 0; }

  spawn(opts) {
    // opts:
    //   x, y, vx, vy, life
    //   hitbox: { w, h, damage, knockback, angle, ignoresInfinity }
    //   owner: Fighter spawning the projectile (skipped for collisions)
    //   kind: 'orb' | 'beam' | 'slash' | 'creature' | 'pull' (for render)
    //   color: primary render color
    //   multiHit: false by default, if true can re-hit same target after coolTicks
    //   coolTicks: frames before re-hitting same target (default 18)
    //   pull: for Blue — pulls opponents toward x (optional number = strength)
    //   follow: for Blue — if true stays at spawn point (no velocity)
    //   onTick: function(proj, world) custom per-frame behavior
    //   onHitExtra: function(proj, target, world) called after applyHit
    const proj = {
      x: opts.x, y: opts.y,
      vx: opts.vx || 0, vy: opts.vy || 0,
      life: opts.life || 60, age: 0,
      hitbox: opts.hitbox,
      owner: opts.owner,
      ownerId: opts.owner ? opts.owner.id : null,
      kind: opts.kind || 'orb',
      color: opts.color || '#ffffff',
      multiHit: !!opts.multiHit,
      coolTicks: opts.coolTicks || 18,
      pull: opts.pull || 0,
      follow: !!opts.follow,
      onTick: opts.onTick || null,
      onHitExtra: opts.onHitExtra || null,
      alreadyHit: new Map(),  // fighterId -> framesSinceHit
      gravity: opts.gravity || 0,
      facing: opts.facing ?? 1,
      dead: false,
      maxLife: opts.life || 60,
    };
    this.list.push(proj);
    return proj;
  }

  update(world) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const p = this.list[i];
      if (p.dead) { this.list.splice(i, 1); continue; }
      p.age++;
      if (!p.follow) {
        p.x += p.vx;
        p.y += p.vy;
        p.vy += p.gravity;
      }
      if (p.onTick) p.onTick(p, world);

      // Pull: drag non-owner fighters toward this projectile's center.
      if (p.pull) {
        for (const f of world.fighters) {
          if (f === p.owner || f.ko) continue;
          if (f.hitstun > 10) continue; // don't drag in heavy hitstun
          const dx = p.x - f.x;
          const dy = (p.y) - (f.y - f.height / 2);
          const d = Math.hypot(dx, dy) + 1;
          if (d < 260) {
            const s = p.pull * (1 - d / 260);
            f.vx += (dx / d) * s;
            f.vy += (dy / d) * s * 0.6;
          }
        }
      }

      // Tick already-hit cooldowns
      for (const [id, ticks] of p.alreadyHit) {
        p.alreadyHit.set(id, ticks + 1);
      }

      // Check collisions
      if (p.hitbox) {
        const hb = {
          x: p.x - p.hitbox.w * 0.5,
          y: p.y - p.hitbox.h * 0.5,
          w: p.hitbox.w, h: p.hitbox.h,
          damage: p.hitbox.damage,
          knockback: p.hitbox.knockback,
          angle: p.hitbox.angle,
          ignoresInfinity: p.hitbox.ignoresInfinity,
        };
        for (const f of world.fighters) {
          if (f === p.owner || f.ko) continue;
          const last = p.alreadyHit.get(f.id);
          if (last != null && (!p.multiHit || last < p.coolTicks)) continue;
          const ob = { x: f.x - f.width / 2, y: f.y - f.height, w: f.width, h: f.height };
          if (aabbOverlap(hb, ob)) {
            // Use the projectile's owner as the attacker for KB direction.
            const attacker = p.owner || { x: p.x, id: -1, hitstop: 0 };
            const did = applyHit(attacker, f, hb);
            if (did && !f.shielding) {
              p.alreadyHit.set(f.id, 0);
              if (p.owner && p.owner.domainMeter && !p.dontFillMeter) {
                p.owner.domainMeter.addOnHit('SPECIAL');
                f.domainMeter.addOnDamageTaken(hb.damage);
              }
              world.particles.hitspark(p.x, p.y);
              world.camera.shake(5, 5);
              if (p.onHitExtra) p.onHitExtra(p, f, world);
              if (!p.multiHit) { p.dead = true; break; }
            }
          }
        }
      }

      if (p.age >= p.life) p.dead = true;
    }
  }

  render(ctx) {
    for (const p of this.list) {
      const t = 1 - p.age / p.maxLife;
      ctx.save();
      ctx.globalAlpha = Math.max(0.35, t);
      const c = p.color;
      if (p.kind === 'orb' || p.kind === 'pull') {
        const r = Math.max(p.hitbox ? p.hitbox.w * 0.5 : 24, 14);
        // glow halo
        ctx.shadowColor = c; ctx.shadowBlur = 22;
        ctx.fillStyle = c;
        ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2); ctx.fill();
        ctx.shadowBlur = 0;
        ctx.fillStyle = '#ffffff';
        ctx.beginPath(); ctx.arc(p.x - r * 0.2, p.y - r * 0.2, r * 0.35, 0, Math.PI * 2); ctx.fill();
        if (p.kind === 'pull') {
          // swirling ring
          ctx.strokeStyle = c; ctx.lineWidth = 2;
          ctx.setLineDash([6, 6]);
          ctx.beginPath(); ctx.arc(p.x, p.y, r + 8 + Math.sin(p.age * 0.2) * 3, 0, Math.PI * 2); ctx.stroke();
          ctx.setLineDash([]);
        }
      } else if (p.kind === 'beam' || p.kind === 'slash') {
        const w = p.hitbox ? p.hitbox.w : 80;
        const h = p.hitbox ? p.hitbox.h : 12;
        ctx.shadowColor = c; ctx.shadowBlur = 18;
        ctx.fillStyle = c;
        ctx.fillRect(p.x - w / 2, p.y - h / 2, w, h);
        ctx.shadowBlur = 0;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(p.x - w / 2, p.y - h / 4, w, h / 2);
      } else if (p.kind === 'creature') {
        // Mahito's Transfigured Human. Lurching little horror.
        const wobble = Math.sin(p.age * 0.4) * 2;
        ctx.fillStyle = '#6a4a5a';
        ctx.fillRect(p.x - 14, p.y - 26 + wobble, 28, 24);
        ctx.fillStyle = '#3a2a34';
        ctx.fillRect(p.x - 14, p.y - 26 + wobble, 28, 4);
        // mismatched eyes
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(p.x - 8, p.y - 18 + wobble, 4, 4);
        ctx.fillRect(p.x + 4, p.y - 18 + wobble, 3, 3);
        ctx.fillStyle = '#9a4040';
        ctx.fillRect(p.x - 7, p.y - 17 + wobble, 2, 2);
        ctx.fillRect(p.x + 5, p.y - 17 + wobble, 2, 2);
        // dragging legs
        ctx.fillStyle = '#3a2a34';
        ctx.fillRect(p.x - 12, p.y - 4, 6, 4);
        ctx.fillRect(p.x + 6, p.y - 4, 6, 4);
        // stitches
        ctx.fillStyle = '#1a1018';
        for (let i = 0; i < 4; i++) ctx.fillRect(p.x - 10 + i * 6, p.y - 12 + wobble, 1, 6);
      }
      ctx.restore();
    }
  }
}
