// Mahito — body-morph trickster with Soul Corruption stacking via touch moves.

import { Fighter } from './Fighter.js';
import { FIGHTER_STATS } from '../../../shared/FighterData.js';
import { SelfEmbodiment } from '../systems/DomainExpansion.js';

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

  _stacksFor() { return this.domainEnhanced ? 2 : 1; }

  _moves() {
    const self = this;
    const touchHit = (hit, stacks) => ({
      ...hit,
      onHit: (f, target) => applyStacks(target, stacks * (f.domainEnhanced ? 2 : 1)),
    });
    return {
      jab:   { startup: 4, active: 3, endlag: 10, hitbox: { x: 32, y: 50, w: 50, h: 22, damage: 4, knockback: 25, angle: 30 }, meterKind: 'JAB' },
      ftilt: { startup: 6, active: 4, endlag: 12, hitbox: { x: 50, y: 48, w: 70, h: 22, damage: 9, knockback: 45, angle: 35 }, meterKind: 'TILT' },
      utilt: { startup: 5, active: 4, endlag: 12, hitbox: { x: 0, y: 100, w: 30, h: 50, damage: 8, knockback: 60, angle: 90 }, meterKind: 'TILT' },
      dtilt: { startup: 5, active: 5, endlag: 14, hitbox: { x: 50, y: 8, w: 100, h: 16, damage: 7, knockback: 25, angle: 20 }, meterKind: 'TILT' },
      fsmash:{ startup: 16, active: 5, endlag: 26, hitbox: { x: 44, y: 50, w: 70, h: 50, damage: 19, knockback: 95, angle: 40 }, meterKind: 'SMASH' },
      usmash:{ startup: 12, active: 6, endlag: 22, hitbox: { x: 0, y: 100, w: 70, h: 60, damage: 15, knockback: 85, angle: 90 }, meterKind: 'SMASH' },
      dsmash:{ startup: 12, active: 5, endlag: 22, hitbox: { x: 0, y: 8, w: 130, h: 30, damage: 13, knockback: 70, angle: 25 }, meterKind: 'SMASH' },

      // Soul Touch — applies 1 stack
      neutralspecial: { startup: 8, active: 4, endlag: 14, ceCost: 10, meterKind: 'SPECIAL',
        hitbox: { x: 36, y: 50, w: 50, h: 30, damage: 6, knockback: 30, angle: 35 },
        onHit(f, target) { applyStacks(target, 1 * (f.domainEnhanced ? 2 : 1)); },
      },
      // Polymorphic Soul Isomer — projectile-like Transfigured Human
      sidespecial: { startup: 10, active: 8, endlag: 18, ceCost: 12, meterKind: 'SPECIAL',
        hitbox: { x: 50, y: 30, w: 50, h: 40, damage: 5, knockback: 25, angle: 30 },
      },
      // Wing Morph recovery
      upspecial: { startup: 6, active: 8, endlag: 22, ceCost: 8, meterKind: 'SPECIAL',
        hitbox: { x: 0, y: 80, w: 80, h: 50, damage: 8, knockback: 50, angle: 75 },
        onStart(f) { f.vy = -16; f.vx = f.facing * 4; f.jumpsLeft = 1; },
      },
      // Body Disfigure — command grab applying 2 stacks
      downspecial: { startup: 15, active: 4, endlag: 22, ceCost: 15, meterKind: 'SPECIAL',
        hitbox: { x: 36, y: 50, w: 40, h: 60, damage: 10, knockback: 40, angle: 60, ignoresInfinity: true },
        onHit(f, target) { applyStacks(target, 2 * (f.domainEnhanced ? 2 : 1)); },
      },
      nair: { startup: 5, active: 14, endlag: 12, hitbox: { x: 0, y: 50, w: 70, h: 60, damage: 9, knockback: 45, angle: 55 }, meterKind: 'AERIAL' },
      fair: { startup: 7, active: 4, endlag: 14, hitbox: { x: 60, y: 50, w: 70, h: 22, damage: 11, knockback: 55, angle: 40 }, meterKind: 'AERIAL' },
      bair: { startup: 7, active: 4, endlag: 14, hitbox: { x: -50, y: 50, w: 60, h: 24, damage: 12, knockback: 60, angle: 135 }, meterKind: 'AERIAL' },
      uair: { startup: 6, active: 5, endlag: 12, hitbox: { x: 0, y: 100, w: 50, h: 50, damage: 9, knockback: 55, angle: 90 }, meterKind: 'AERIAL' },
      dair: { startup: 12, active: 6, endlag: 22, hitbox: { x: 0, y: 0, w: 50, h: 40, damage: 14, knockback: 60, angle: 270 }, meterKind: 'AERIAL' },
      grab: { startup: 6, active: 3, endlag: 16, hitbox: { x: 36, y: 60, w: 36, h: 30, damage: 0, knockback: 0, angle: 0 }, meterKind: 'THROW',
              onHit(f, target) { applyStacks(target, 1); } },
    };
  }
}
