// Mahito — body-morph trickster.
//   Passive: Idle Transfiguration — Soul Corruption stacks on touch.
//   Neutral Special: Soul Touch (1 stack)
//   Side Special: Polymorphic Soul Isomer — Transfigured Human projectile
//   Up Special: Wing Morph recovery
//   Down Special: Body Disfigure (command grab, 2 stacks)

import { Fighter } from './Fighter.js';
import { FIGHTER_STATS } from '../../../shared/FighterData.js';
import { SelfEmbodiment } from '../systems/DomainExpansion.js';
import { INPUT, isPressed } from '../../../shared/InputCodes.js';
import { hitboxFromPose } from '../rendering/SpriteSheet.js';

function applyStacks(target, n) {
  target.soulCorruption = Math.min(5, (target.soulCorruption || 0) + n);
  target.soulCorruptionTimer = 8 * 60;
  if (target.soulCorruption >= 3) {
    target.runSpeed *= 0.8;
    target.walkSpeed *= 0.8;
  }
  if (target.soulCorruption >= 5) {
    target.percent += 10;
    target.hitstun = Math.max(target.hitstun, 30);
  }
}

export class MahitoFighter extends Fighter {
  constructor(opts) {
    super({ ...opts, ...FIGHTER_STATS.mahito, character: 'mahito', displayName: 'Mahito' });
    this.domainClass = SelfEmbodiment;
    this.moves = this._moves();
  }

  _stackMul() { return this.domainEnhanced ? 2 : 1; }

  _moves() {
    const self = this;
    return {
      // Morphing-limb jab: visually different frame-to-frame, stats consistent.
      jab: {
        startup: 4, active: 3, endlag: 9,
        hitbox: hitboxFromPose('jab_hit', { damage: 3, knockback: 16, angle: 35, pad: 4 }),
        meterKind: 'JAB',
      },
      // Blade Arm — long-reach forward tilt.
      ftilt: {
        startup: 6, active: 4, endlag: 13,
        hitbox: hitboxFromPose('ftilt_hit', { damage: 8, knockback: 42, angle: 35, pad: 6 }),
        meterKind: 'TILT',
      },
      // Spike Launch — anti-air.
      utilt: {
        startup: 5, active: 4, endlag: 11,
        hitbox: hitboxFromPose('utilt_hit', { damage: 7, knockback: 46, angle: 88, pad: 6 }),
        meterKind: 'TILT',
      },
      // Tendril Sweep — long low poke.
      dtilt: {
        startup: 5, active: 5, endlag: 14,
        hitbox: hitboxFromPose('dtilt_hit', { damage: 6, knockback: 26, angle: 22, pad: 6 }),
        meterKind: 'TILT',
      },

      // Body Slam Morph — body expands into a club.
      fsmash: {
        startup: 16, active: 5, endlag: 26, smash: true,
        hitbox: hitboxFromPose('fsmash_hit', { damage: 18, knockback: 94, angle: 40, pad: 8 }),
        meterKind: 'SMASH',
      },
      // Spike Crown — wide upward spikes.
      usmash: {
        startup: 12, active: 6, endlag: 22, smash: true,
        hitbox: hitboxFromPose('usmash_hit', { damage: 14, knockback: 84, angle: 90, pad: 8 }),
        meterKind: 'SMASH',
      },
      // Ground Spike Net — catches rolls.
      dsmash: {
        startup: 11, active: 5, endlag: 22, smash: true,
        hitbox: hitboxFromPose('dsmash_hit', { damage: 13, knockback: 70, angle: 25, pad: 8 }),
        meterKind: 'SMASH',
      },

      // Soul Touch — short-range lunge, 1 stack.
      neutralspecial: {
        startup: 7, active: 4, endlag: 14, ceCost: 10, meterKind: 'SPECIAL',
        hitbox: hitboxFromPose('neutralspecial_hit', { damage: 6, knockback: 32, angle: 35, pad: 6 }),
        onStart(f) { f.vx = f.facing * 5; },
        onHit(f, target) { applyStacks(target, 1 * self._stackMul()); },
      },

      // Polymorphic Soul Isomer — persistent Transfigured Human projectile.
      sidespecial: {
        startup: 10, active: 4, endlag: 18, ceCost: 12, meterKind: 'SPECIAL',
        onStart(f) {
          const w = f.world; if (!w) return;
          // Count existing creatures to cap at 2.
          const existing = w.projectiles.list.filter(p => p.owner === f && p.kind === 'creature').length;
          if (existing >= 2) return;
          w.projectiles.spawn({
            x: f.x + 30 * f.facing,
            y: f.y,
            vx: 2.5 * f.facing, vy: 0, life: 120,
            owner: f,
            kind: 'creature', color: '#9aff7a',
            multiHit: true, coolTicks: 24,
            hitbox: { w: 38, h: 30, damage: 5, knockback: 26, angle: 30 },
            gravity: 0.3,
            onHitExtra(proj, target) { applyStacks(target, 1 * self._stackMul()); },
          });
        },
      },

      // Wing Morph — recovery with wing hitbox.
      upspecial: {
        startup: 5, active: 10, endlag: 22, ceCost: 8, meterKind: 'SPECIAL',
        hitbox: hitboxFromPose('upspecial_hit', { damage: 7, knockback: 48, angle: 75, pad: 8 }),
        onStart(f) {
          const im = f.world && f.world.input;
          let hx = 0;
          if (im) {
            const mask = im.current(f.playerIndex);
            if (isPressed(mask, INPUT.LEFT))  hx = -1;
            if (isPressed(mask, INPUT.RIGHT)) hx =  1;
          }
          if (hx === 0) hx = f.facing;
          f.vy = -17; f.vx = hx * 5.5;
          f.facing = hx;
          f.jumpsLeft = 1;
        },
      },

      // Body Disfigure — command grab (ignores shield), 2 stacks.
      downspecial: {
        startup: 14, active: 4, endlag: 22, ceCost: 15, meterKind: 'SPECIAL',
        hitbox: hitboxFromPose('downspecial_hit', {
          damage: 10, knockback: 40, angle: 60, ignoresInfinity: true, pad: 8,
        }),
        onHit(f, target) { applyStacks(target, 2 * self._stackMul()); },
      },

      // Mahito aerials — morph-themed.
      nair: {
        startup: 5, active: 12, endlag: 10, aerial: true, landingLag: 8, autocancel: 20,
        hitbox: hitboxFromPose('nair', { damage: 8, knockback: 42, angle: 55, pad: 6 }),
        meterKind: 'AERIAL',
      },
      // Fair: arm becomes drill, long horizontal reach.
      fair: {
        startup: 7, active: 4, endlag: 12, aerial: true, landingLag: 12,
        hitbox: hitboxFromPose('fair', { damage: 10, knockback: 52, angle: 40, pad: 6 }),
        meterKind: 'AERIAL',
      },
      // Bair: tail whip.
      bair: {
        startup: 7, active: 4, endlag: 12, aerial: true, landingLag: 11,
        hitbox: hitboxFromPose('bair', { damage: 11, knockback: 58, angle: 135, pad: 6 }),
        meterKind: 'AERIAL',
      },
      // Uair: back spikes extend.
      uair: {
        startup: 5, active: 5, endlag: 11, aerial: true, landingLag: 9,
        hitbox: hitboxFromPose('uair', { damage: 8, knockback: 50, angle: 90, pad: 6 }),
        meterKind: 'AERIAL',
      },
      // Dair: legs become stone block. Strong spike, slow.
      dair: {
        startup: 12, active: 6, endlag: 22, aerial: true, landingLag: 22,
        hitbox: hitboxFromPose('dair', { damage: 13, knockback: 64, angle: 270, pad: 6 }),
        meterKind: 'AERIAL',
      },

      grab: {
        startup: 6, active: 3, endlag: 16, grab: true,
        hitbox: hitboxFromPose('grab', { damage: 0, knockback: 0, angle: 0, pad: 6 }),
        meterKind: 'THROW',
        onHit(f, target) { applyStacks(target, 1); },
      },
    };
  }
}
