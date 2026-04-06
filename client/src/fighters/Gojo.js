// Gojo Satoru — Zoning specialist with Infinity passive and Blue/Red specials.

import { Fighter } from './Fighter.js';
import { FIGHTER_STATS } from '../../../shared/FighterData.js';
import { UnlimitedVoid } from '../systems/DomainExpansion.js';

export class GojoFighter extends Fighter {
  constructor(opts) {
    super({ ...opts, ...FIGHTER_STATS.gojo, character: 'gojo', displayName: 'Gojo Satoru' });
    this.domainClass = UnlimitedVoid;
    this.passiveInfinity = true;
    this.moves = this._moves();
  }
  _moves() {
    return {
      jab:    { startup: 4, active: 3, endlag: 10, hitbox: { x: 32, y: 50, w: 40, h: 22, damage: 4, knockback: 30, angle: 25 }, meterKind: 'JAB' },
      ftilt:  { startup: 6, active: 4, endlag: 12, hitbox: { x: 40, y: 48, w: 50, h: 22, damage: 9, knockback: 50, angle: 35 }, meterKind: 'TILT' },
      utilt:  { startup: 5, active: 4, endlag: 12, hitbox: { x: 0, y: 90, w: 50, h: 30, damage: 8, knockback: 60, angle: 90 }, meterKind: 'TILT' },
      dtilt:  { startup: 4, active: 3, endlag: 10, hitbox: { x: 30, y: 10, w: 50, h: 18, damage: 7, knockback: 30, angle: 25 }, meterKind: 'TILT' },
      fsmash: { startup: 14, active: 4, endlag: 22, hitbox: { x: 44, y: 50, w: 50, h: 30, damage: 17, knockback: 95, angle: 40 }, meterKind: 'SMASH' },
      usmash: { startup: 12, active: 6, endlag: 22, hitbox: { x: 0, y: 100, w: 80, h: 60, damage: 16, knockback: 95, angle: 90 }, meterKind: 'SMASH' },
      dsmash: { startup: 12, active: 5, endlag: 22, hitbox: { x: 0, y: 8, w: 130, h: 22, damage: 14, knockback: 75, angle: 25 }, meterKind: 'SMASH' },

      // Cursed Technique Lapse: Blue — pull/disrupt
      neutralspecial: { startup: 8, active: 60, endlag: 14, ceCost: 15, meterKind: 'SPECIAL',
        hitbox: { x: 220, y: 60, w: 90, h: 90, damage: 8, knockback: 20, angle: 200 },
        onStart(f) {
          // Pull effect: target slightly drawn toward Gojo while sphere is up (handled passively via low knockback angle pointing back)
        },
      },
      // Cursed Technique Reversal: Red — explosive forward orb
      sidespecial: { startup: 18, active: 6, endlag: 20, ceCost: 20, meterKind: 'SPECIAL',
        hitbox: { x: 240, y: 50, w: 80, h: 60, damage: 14, knockback: 95, angle: 40 },
      },
      // Blue Boost recovery
      upspecial: { startup: 6, active: 6, endlag: 20, ceCost: 10, meterKind: 'SPECIAL',
        hitbox: { x: 0, y: 70, w: 50, h: 60, damage: 6, knockback: 50, angle: 85 },
        onStart(f) {
          f.vy = -18; f.vx = f.facing * 4; f.jumpsLeft = 1;
        },
      },
      // Infinity Amplification — counter dome
      downspecial: { startup: 6, active: 30, endlag: 16, ceCost: 18, meterKind: 'SPECIAL',
        hitbox: { x: 0, y: 50, w: 120, h: 100, damage: 5, knockback: 30, angle: 80 },
        onStart(f) { f.invulnFrames = Math.max(f.invulnFrames, 12); },
      },

      nair: { startup: 4, active: 12, endlag: 12, hitbox: { x: 0, y: 50, w: 70, h: 50, damage: 8, knockback: 45, angle: 50 }, meterKind: 'AERIAL' },
      fair: { startup: 7, active: 4, endlag: 14, hitbox: { x: 40, y: 50, w: 50, h: 28, damage: 10, knockback: 55, angle: 45 }, meterKind: 'AERIAL' },
      bair: { startup: 5, active: 4, endlag: 12, hitbox: { x: -40, y: 50, w: 50, h: 28, damage: 13, knockback: 70, angle: 135 }, meterKind: 'AERIAL' },
      uair: { startup: 5, active: 5, endlag: 12, hitbox: { x: 0, y: 100, w: 50, h: 40, damage: 9, knockback: 55, angle: 90 }, meterKind: 'AERIAL' },
      dair: { startup: 9, active: 5, endlag: 18, hitbox: { x: 0, y: 0, w: 40, h: 40, damage: 12, knockback: 55, angle: 270 }, meterKind: 'AERIAL' },
      grab: { startup: 6, active: 3, endlag: 16, hitbox: { x: 36, y: 60, w: 36, h: 30, damage: 0, knockback: 0, angle: 0 }, meterKind: 'THROW' },
    };
  }
}
