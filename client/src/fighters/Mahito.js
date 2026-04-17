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
        hitbox: { x: 32, y: 50, w: 46, h: 22, damage: 3, knockback: 16, angle: 35 },
        meterKind: 'JAB',
      },
      // Blade Arm — long-reach forward tilt.
      ftilt: {
        startup: 6, active: 4, endlag: 13,
        hitbox: { x: 52, y: 48, w: 74, h: 22, damage: 8, knockback: 42, angle: 35 },
        meterKind: 'TILT',
      },
      // Spike Launch — anti-air.
      utilt: {
        startup: 5, active: 4, endlag: 11,
        hitbox: { x: 0, y: 96, w: 36, h: 60, damage: 7, knockback: 46, angle: 88 },
        meterKind: 'TILT',
      },
      // Tendril Sweep — long low poke.
      dtilt: {
        startup: 5, active: 5, endlag: 14,
        hitbox: { x: 52, y: 8, w: 108, h: 16, damage: 6, knockback: 26, angle: 22 },
        meterKind: 'TILT',
      },

      // Body Slam Morph — body expands into a club.
      fsmash: {
        startup: 16, active: 5, endlag: 26,
        hitbox: { x: 46, y: 50, w: 82, h: 52, damage: 18, knockback: 94, angle: 40 },
        meterKind: 'SMASH',
      },
      // Spike Crown — wide upward spikes.
      usmash: {
        startup: 12, active: 6, endlag: 22,
        hitbox: { x: 0, y: 100, w: 84, h: 64, damage: 14, knockback: 84, angle: 90 },
        meterKind: 'SMASH',
      },
      // Ground Spike Net — catches rolls.
      dsmash: {
        startup: 11, active: 5, endlag: 22,
        hitbox: { x: 0, y: 8, w: 140, h: 32, damage: 13, knockback: 70, angle: 25 },
        meterKind: 'SMASH',
      },

      // Soul Touch — short-range lunge, 1 stack.
      neutralspecial: {
        startup: 7, active: 4, endlag: 14, ceCost: 10, meterKind: 'SPECIAL',
        hitbox: { x: 36, y: 50, w: 54, h: 32, damage: 6, knockback: 32, angle: 35 },
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
        hitbox: { x: 0, y: 80, w: 88, h: 56, damage: 7, knockback: 48, angle: 75 },
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
        hitbox: {
          x: 36, y: 52, w: 44, h: 62,
          damage: 10, knockback: 40, angle: 60, ignoresInfinity: true,
        },
        onHit(f, target) { applyStacks(target, 2 * self._stackMul()); },
      },

      // Mahito aerials — morph-themed.
      nair: {
        startup: 5, active: 12, endlag: 10,
        hitbox: { x: 0, y: 50, w: 72, h: 60, damage: 8, knockback: 42, angle: 55 },
        meterKind: 'AERIAL',
      },
      // Fair: arm becomes drill, long horizontal reach.
      fair: {
        startup: 7, active: 4, endlag: 12,
        hitbox: { x: 62, y: 52, w: 72, h: 22, damage: 10, knockback: 52, angle: 40 },
        meterKind: 'AERIAL',
      },
      // Bair: tail whip.
      bair: {
        startup: 7, active: 4, endlag: 12,
        hitbox: { x: -52, y: 52, w: 62, h: 24, damage: 11, knockback: 58, angle: 135 },
        meterKind: 'AERIAL',
      },
      // Uair: back spikes extend.
      uair: {
        startup: 5, active: 5, endlag: 11,
        hitbox: { x: 0, y: 104, w: 58, h: 52, damage: 8, knockback: 50, angle: 90 },
        meterKind: 'AERIAL',
      },
      // Dair: legs become stone block. Strong spike, slow.
      dair: {
        startup: 12, active: 6, endlag: 22,
        hitbox: { x: 0, y: 0, w: 54, h: 44, damage: 13, knockback: 64, angle: 270 },
        meterKind: 'AERIAL',
      },

      grab: {
        startup: 6, active: 3, endlag: 16,
        hitbox: { x: 36, y: 60, w: 40, h: 32, damage: 0, knockback: 0, angle: 0 },
        meterKind: 'THROW',
        onHit(f, target) { applyStacks(target, 1); },
      },
    };
  }
}
