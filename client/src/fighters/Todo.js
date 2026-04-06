// Aoi Todo — heavy grappler with Boogie Woogie position swap and Vibraslap ult.

import { Fighter } from './Fighter.js';
import { FIGHTER_STATS } from '../../../shared/FighterData.js';
import { UnlimitedBoogieWoogie } from '../systems/DomainExpansion.js';

export class TodoFighter extends Fighter {
  constructor(opts) {
    super({ ...opts, ...FIGHTER_STATS.todo, character: 'todo', displayName: 'Aoi Todo' });
    this.domainClass = UnlimitedBoogieWoogie;
    this.boogieCooldown = 0;
    this.moves = this._moves();
  }

  tick(input, world) {
    if (this.boogieCooldown > 0) this.boogieCooldown--;
    // Zone buff timer
    if (this.zoneBuff > 0) this.zoneBuff--;
    // Faster shield regen passive
    if (this.shieldHP < 100) this.shieldHP = Math.min(100, this.shieldHP + 0.05);
    // Auto-face nearest opponent (Todo's "scout the brother" passive). Skip
    // when locked into an attack so swing direction stays consistent.
    if (!this.facingLocked && this.state !== 'attack' && this.hitstun === 0) {
      let target = null, best = Infinity;
      for (const f of world.fighters) {
        if (f === this || f.ko) continue;
        const d = Math.abs(f.x - this.x);
        if (d < best) { best = d; target = f; }
      }
      if (target) this.facing = (target.x >= this.x) ? 1 : -1;
    }
    super.tick(input, world);
    // Re-apply opponent facing after physics, since the base class flips
    // facing from velocity inside _afterMove.
    if (!this.facingLocked && this.state !== 'attack' && this.hitstun === 0) {
      let target = null, best = Infinity;
      for (const f of world.fighters) {
        if (f === this || f.ko) continue;
        const d = Math.abs(f.x - this.x);
        if (d < best) { best = d; target = f; }
      }
      if (target) this.facing = (target.x >= this.x) ? 1 : -1;
    }
  }

  // Boogie Woogie swap with closest opponent within range
  boogieSwap(world) {
    const target = world.fighters.find(f => f !== this && !f.ko);
    if (!target) return;
    const dx = target.x - this.x;
    if (Math.abs(dx) > 700 && !this.boogieMode) return;
    const tx = target.x, ty = target.y;
    target.x = this.x; target.y = this.y;
    this.x = tx; this.y = ty;
    world.particles.burst(target.x, target.y - 40, '#5fd7ff', 16, 5);
    world.particles.burst(this.x, this.y - 40, '#5fd7ff', 16, 5);
    if (this.boogieMode) {
      // shockwave damage at both points
      for (const f of [target]) {
        f.percent += 4;
        f.vx += (this.x > f.x ? -1 : 1) * 4;
        f.hitstun = Math.max(f.hitstun, 8);
      }
    }
    this.boogieCooldown = this.boogieMode ? 6 : 90;
  }

  _moves() {
    return {
      jab:    { startup: 5, active: 3, endlag: 12, hitbox: { x: 36, y: 50, w: 50, h: 26, damage: 5, knockback: 35, angle: 30 }, meterKind: 'JAB' },
      ftilt:  { startup: 7, active: 4, endlag: 14, hitbox: { x: 44, y: 50, w: 56, h: 26, damage: 11, knockback: 55, angle: 35 }, meterKind: 'TILT' },
      utilt:  { startup: 6, active: 4, endlag: 14, hitbox: { x: 0, y: 100, w: 50, h: 40, damage: 10, knockback: 65, angle: 90 }, meterKind: 'TILT' },
      dtilt:  { startup: 5, active: 4, endlag: 12, hitbox: { x: 36, y: 8, w: 60, h: 18, damage: 8, knockback: 25, angle: 20 }, meterKind: 'TILT' },
      // Crushing Blow
      fsmash: { startup: 24, active: 5, endlag: 30, hitbox: { x: 50, y: 50, w: 70, h: 40, damage: 22, knockback: 110, angle: 40 }, meterKind: 'SMASH' },
      // Suplex Launch (command grab properties)
      usmash: { startup: 14, active: 4, endlag: 24, hitbox: { x: 30, y: 80, w: 60, h: 60, damage: 16, knockback: 90, angle: 90, ignoresInfinity: true }, meterKind: 'SMASH' },
      // Ground Pound
      dsmash: { startup: 14, active: 5, endlag: 22, hitbox: { x: 0, y: 8, w: 150, h: 30, damage: 14, knockback: 75, angle: 30 }, meterKind: 'SMASH' },

      // Boogie Woogie
      neutralspecial: { startup: 8, active: 1, endlag: 6, ceCost: 8, meterKind: 'SPECIAL',
        onStart(f) { f.boogieSwap(f.world); },
      },
      // Brother's Charge — dashing palm strike. Short startup, low end lag,
      // and a forward burst of momentum so it actually combos into jab/ftilt.
      sidespecial: { startup: 6, active: 4, endlag: 8, ceCost: 8, meterKind: 'SPECIAL',
        onStart(f) { f.vx = f.facing * 9; },
        hitbox: { x: 44, y: 50, w: 60, h: 32, damage: 9, knockback: 45, angle: 50 },
      },
      // Boogie Woogie Recovery
      upspecial: { startup: 8, active: 4, endlag: 18, ceCost: 10, meterKind: 'SPECIAL',
        onStart(f) { f.vy = -14; f.vx = f.facing * 5; f.jumpsLeft = 1; },
        hitbox: { x: 30, y: 70, w: 50, h: 50, damage: 6, knockback: 40, angle: 80 },
      },
      // Feint Clap — counter stance
      downspecial: { startup: 8, active: 20, endlag: 14, ceCost: 12, meterKind: 'SPECIAL',
        onStart(f) { f.invulnFrames = Math.max(f.invulnFrames, 8); },
        hitbox: { x: 36, y: 50, w: 56, h: 50, damage: 12, knockback: 75, angle: 45 },
      },
      nair: { startup: 5, active: 16, endlag: 12, hitbox: { x: 0, y: 50, w: 90, h: 60, damage: 11, knockback: 55, angle: 50 }, meterKind: 'AERIAL' },
      fair: { startup: 8, active: 4, endlag: 16, hitbox: { x: 44, y: 50, w: 50, h: 30, damage: 13, knockback: 65, angle: 40 }, meterKind: 'AERIAL' },
      bair: { startup: 7, active: 4, endlag: 14, hitbox: { x: -44, y: 50, w: 50, h: 30, damage: 16, knockback: 80, angle: 135 }, meterKind: 'AERIAL' },
      uair: { startup: 6, active: 5, endlag: 14, hitbox: { x: 0, y: 100, w: 50, h: 50, damage: 11, knockback: 60, angle: 90 }, meterKind: 'AERIAL' },
      dair: { startup: 12, active: 6, endlag: 24, hitbox: { x: 0, y: 0, w: 50, h: 40, damage: 16, knockback: 70, angle: 270 }, meterKind: 'AERIAL' },
      grab: { startup: 7, active: 4, endlag: 18, hitbox: { x: 44, y: 60, w: 50, h: 36, damage: 0, knockback: 0, angle: 0 }, meterKind: 'THROW' },
    };
  }
}
