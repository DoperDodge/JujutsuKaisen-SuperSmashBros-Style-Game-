// Aoi Todo — heavy grappler with Boogie Woogie position swap and Vibraslap ult.

import { Fighter } from './Fighter.js';
import { FIGHTER_STATS } from '../../../shared/FighterData.js';
import { UnlimitedBoogieWoogie } from '../systems/DomainExpansion.js';
import { hitboxFromPose } from '../rendering/SpriteSheet.js';

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
      // Jab — heavy hook, long reach.
      jab: {
        startup: 5, active: 3, endlag: 12,
        hitbox: hitboxFromPose('jab_hit', { damage: 5, knockback: 35, angle: 30, pad: 6 }),
        meterKind: 'JAB',
      },
      // Forward tilt — stepping elbow with buff.
      ftilt: {
        startup: 7, active: 4, endlag: 14,
        hitbox: hitboxFromPose('ftilt_hit', { damage: 11, knockback: 55, angle: 35, pad: 6 }),
        meterKind: 'TILT',
      },
      // Uppercut — juggle.
      utilt: {
        startup: 6, active: 4, endlag: 14,
        hitbox: hitboxFromPose('utilt_hit', { damage: 10, knockback: 65, angle: 90, pad: 6 }),
        meterKind: 'TILT',
      },
      // Low stomp.
      dtilt: {
        startup: 5, active: 4, endlag: 12,
        hitbox: hitboxFromPose('dtilt_hit', { damage: 8, knockback: 25, angle: 20, pad: 6 }),
        meterKind: 'TILT',
      },

      // Crushing Blow — Playful Cloud-style 3-hit smash cascade.
      fsmash: {
        startup: 18, active: 22, endlag: 26, smash: true, meterKind: 'SMASH',
        windows: [
          { from: 18, to: 22,
            hitbox: hitboxFromPose('fsmash_hit', { damage: 7, knockback: 28, angle: 80, pad: 6 }) },
          { from: 26, to: 30,
            hitbox: hitboxFromPose('fsmash_hit', { damage: 7, knockback: 28, angle: 90, pad: 6 }) },
          { from: 34, to: 40,
            hitbox: hitboxFromPose('fsmash_max', { damage: 14, knockback: 98, angle: 40, pad: 8 }) },
        ],
      },
      // Suplex Launch (command-grab feel, ignores Infinity).
      usmash: {
        startup: 14, active: 4, endlag: 24, smash: true,
        hitbox: hitboxFromPose('usmash_hit', {
          damage: 16, knockback: 90, angle: 90, ignoresInfinity: true, pad: 8,
        }),
        meterKind: 'SMASH',
      },
      // Ground Pound.
      dsmash: {
        startup: 14, active: 5, endlag: 22, smash: true,
        hitbox: hitboxFromPose('dsmash_hit', { damage: 14, knockback: 75, angle: 30, pad: 10 }),
        meterKind: 'SMASH',
      },

      // Boogie Woogie — clap & swap.
      neutralspecial: {
        startup: 8, active: 1, endlag: 6, ceCost: 8, meterKind: 'SPECIAL',
        onStart(f) { f.boogieSwap(f.world); },
      },
      // Brother's Charge — dashing palm strike.
      sidespecial: {
        startup: 6, active: 4, endlag: 8, ceCost: 8, meterKind: 'SPECIAL',
        hitbox: hitboxFromPose('sidespecial_hit', { damage: 9, knockback: 45, angle: 50, pad: 6 }),
        onStart(f) { f.vx = f.facing * 9; },
      },
      // Boogie Woogie Recovery — clap burst launch.
      upspecial: {
        startup: 8, active: 4, endlag: 18, ceCost: 10, meterKind: 'SPECIAL',
        hitbox: hitboxFromPose('upspecial_hit', { damage: 6, knockback: 40, angle: 80, pad: 6 }),
        onStart(f) { f.vy = -14; f.vx = f.facing * 5; f.jumpsLeft = 1; },
      },
      // Feint Clap — counter stance. On-hit: riposte window.
      downspecial: {
        startup: 8, active: 20, endlag: 14, ceCost: 12, meterKind: 'SPECIAL',
        hitbox: hitboxFromPose('downspecial_hit', { damage: 12, knockback: 75, angle: 45, pad: 8 }),
        onStart(f) { f.invulnFrames = Math.max(f.invulnFrames, 8); },
      },

      // Aerials — heavy, committed, big damage.
      nair: {
        startup: 5, active: 16, endlag: 12, aerial: true, landingLag: 10, autocancel: 22,
        hitbox: hitboxFromPose('nair', { damage: 11, knockback: 55, angle: 50, pad: 8 }),
        meterKind: 'AERIAL',
      },
      fair: {
        startup: 8, active: 4, endlag: 16, aerial: true, landingLag: 14,
        hitbox: hitboxFromPose('fair', { damage: 13, knockback: 65, angle: 40, pad: 8 }),
        meterKind: 'AERIAL',
      },
      bair: {
        startup: 7, active: 4, endlag: 14, aerial: true, landingLag: 12,
        hitbox: hitboxFromPose('bair', { damage: 16, knockback: 80, angle: 135, pad: 8 }),
        meterKind: 'AERIAL',
      },
      uair: {
        startup: 6, active: 5, endlag: 14, aerial: true, landingLag: 11,
        hitbox: hitboxFromPose('uair', { damage: 11, knockback: 60, angle: 90, pad: 8 }),
        meterKind: 'AERIAL',
      },
      dair: {
        startup: 12, active: 6, endlag: 24, aerial: true, landingLag: 22,
        hitbox: hitboxFromPose('dair', { damage: 16, knockback: 70, angle: 270, pad: 8 }),
        meterKind: 'AERIAL',
      },
      grab: {
        startup: 7, active: 4, endlag: 18, grab: true,
        hitbox: hitboxFromPose('grab', { damage: 0, knockback: 0, angle: 0, pad: 8 }),
        meterKind: 'THROW',
      },
    };
  }
}
