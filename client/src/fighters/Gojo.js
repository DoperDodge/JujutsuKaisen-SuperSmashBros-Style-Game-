// Gojo Satoru — Zoning specialist.
//   Passive: Infinity (melee damage/KB reduction while CE > 25%)
//   N.Special: Cursed Technique Lapse Blue — pull zone
//   Side Special: Cursed Technique Reversal Red — explosive projectile
//   Up Special: Blue Boost — angled launch recovery
//   Down Special: Infinity Amplification — counter/parry dome
//   Domain: Unlimited Void

import { Fighter } from './Fighter.js';
import { FIGHTER_STATS } from '../../../shared/FighterData.js';
import { UnlimitedVoid } from '../systems/DomainExpansion.js';
import { INPUT, isPressed } from '../../../shared/InputCodes.js';
import { hitboxFromPose } from '../rendering/SpriteSheet.js';

export class GojoFighter extends Fighter {
  constructor(opts) {
    super({ ...opts, ...FIGHTER_STATS.gojo, character: 'gojo', displayName: 'Gojo Satoru' });
    this.domainClass = UnlimitedVoid;
    this.passiveInfinity = true;
    this.moves = this._moves();
    // Infinity Amplification active counter window (frames left in counter).
    this._counterActive = 0;
  }

  tick(input, world) {
    // Ongoing counter — if hit this frame, redirect damage & hit attacker.
    if (this._counterActive > 0) this._counterActive--;
    super.tick(input, world);
  }

  _moves() {
    return {
      // Refined martial-arts jab. Low knockback + shallow angle = combo starter
      // into ftilt, usmash, or aerials. Hitbox aligns to the visible swing.
      jab: {
        startup: 3, active: 3, endlag: 8,
        hitbox: hitboxFromPose('jab_hit', { damage: 3, knockback: 16, angle: 35, pad: 4 }),
        meterKind: 'JAB',
      },

      // Forward tilt — stepping side kick with CE trail.
      ftilt: {
        startup: 6, active: 4, endlag: 12,
        hitbox: hitboxFromPose('ftilt_hit', { damage: 8, knockback: 42, angle: 40, pad: 4 }),
        meterKind: 'TILT',
      },
      // Up tilt — rising palm. Launch angle of 85° for juggle routes.
      utilt: {
        startup: 5, active: 4, endlag: 11,
        hitbox: hitboxFromPose('utilt_hit', { damage: 7, knockback: 38, angle: 85, pad: 4 }),
        meterKind: 'TILT',
      },
      // Down tilt — low sweep to trip, combos into fair.
      dtilt: {
        startup: 4, active: 3, endlag: 10,
        hitbox: hitboxFromPose('dtilt_hit', { damage: 5, knockback: 22, angle: 28, pad: 4 }),
        meterKind: 'TILT',
      },

      // Forward Smash: charged palm thrust, one of Gojo's KO options.
      fsmash: {
        startup: 14, active: 4, endlag: 24, smash: true,
        hitbox: hitboxFromPose('fsmash_hit', { damage: 16, knockback: 92, angle: 42, pad: 6 }),
        meterKind: 'SMASH',
      },
      // Up Smash: Infinity burst above. Huge vertical box for anti-air KOs.
      usmash: {
        startup: 10, active: 6, endlag: 22, smash: true,
        hitbox: hitboxFromPose('usmash_hit', { damage: 15, knockback: 88, angle: 88, pad: 6 }),
        meterKind: 'SMASH',
      },
      // Down Smash: dual palms slam creating a horizontal shockwave.
      dsmash: {
        startup: 12, active: 5, endlag: 22, smash: true,
        hitbox: hitboxFromPose('dsmash_hit', { damage: 13, knockback: 72, angle: 28, pad: 4 }),
        meterKind: 'SMASH',
      },

      // N.Special — Cursed Technique Lapse: Blue.
      // Projectile that flies forward, then stops and pulls enemies in for ~1s.
      neutralspecial: {
        startup: 8, active: 4, endlag: 22, ceCost: 15, meterKind: 'SPECIAL',
        onStart(f) {
          const w = f.world;
          if (!w || !w.projectiles) return;
          w.projectiles.spawn({
            x: f.x + 60 * f.facing,
            y: f.y - 60,
            vx: 9 * f.facing, vy: 0,
            life: 90,
            owner: f,
            kind: 'pull',
            color: '#5fd7ff',
            multiHit: true, coolTicks: 30,
            hitbox: { w: 70, h: 70, damage: 3, knockback: 18, angle: 180 },
            pull: 0.55,
            onTick(proj) {
              if (proj.age > 18) { proj.vx *= 0.82; proj.vy *= 0.82; }
            },
          });
        },
      },

      // Side Special — Cursed Technique Reversal: Red.
      // Slow startup, but an explosive projectile that KOs above ~100%.
      sidespecial: {
        startup: 18, active: 4, endlag: 22, ceCost: 20, meterKind: 'SPECIAL',
        onStart(f) {
          const w = f.world;
          if (!w || !w.projectiles) return;
          w.projectiles.spawn({
            x: f.x + 50 * f.facing,
            y: f.y - 55,
            vx: 14 * f.facing, vy: 0,
            life: 80,
            owner: f,
            kind: 'orb',
            color: '#ff4050',
            hitbox: { w: 70, h: 70, damage: 14, knockback: 88, angle: 40 },
            onHitExtra(proj, target, world) {
              world.particles.burst(target.x, target.y - 40, '#ff4050', 20, 6);
              world.particles.burst(target.x, target.y - 40, '#ffb0a0', 14, 3);
            },
          });
        },
      },

      // Up Special — Blue Boost. Launches Gojo at an angle, retains momentum.
      upspecial: {
        startup: 5, active: 8, endlag: 20, ceCost: 10, meterKind: 'SPECIAL',
        hitbox: hitboxFromPose('upspecial_hit', { damage: 6, knockback: 48, angle: 85, pad: 4 }),
        onStart(f) {
          // Angle launch: up + small horizontal from held direction.
          const im = f.world && f.world.input;
          let hx = 0;
          if (im) {
            const mask = im.current(f.playerIndex);
            if (isPressed(mask, INPUT.LEFT))  hx = -1;
            if (isPressed(mask, INPUT.RIGHT)) hx =  1;
          }
          if (hx === 0) hx = f.facing;
          f.vy = -17; f.vx = hx * 5.5;
          f.jumpsLeft = 1;
          f.facing = hx;
        },
      },

      // Down Special — Infinity Amplification. Short counter window + small
      // crush field. Successful counter reflects projectiles and pushes.
      downspecial: {
        startup: 4, active: 22, endlag: 14, ceCost: 18, meterKind: 'SPECIAL',
        hitbox: hitboxFromPose('downspecial_hit', {
          damage: 5, knockback: 28, angle: 80, ignoresInfinity: true, pad: 8,
        }),
        onStart(f) {
          f._counterActive = 20;
          f.invulnFrames = Math.max(f.invulnFrames, 10);
          // Reflect any enemy projectiles currently near Gojo.
          const w = f.world;
          if (!w || !w.projectiles) return;
          for (const p of w.projectiles.list) {
            if (p.owner === f) continue;
            if (Math.abs(p.x - f.x) < 120 && Math.abs(p.y - (f.y - f.height / 2)) < 120) {
              p.vx = -p.vx; p.owner = f;
            }
          }
        },
      },

      // Aerials — snappy, disjointed, combo-oriented. Autocancel after active
      // lets Gojo land, short-hop combo into smash or grab.
      nair: {
        startup: 4, active: 10, endlag: 10, aerial: true, landingLag: 8, autocancel: 16,
        hitbox: hitboxFromPose('nair', { damage: 7, knockback: 38, angle: 50, pad: 4 }),
        meterKind: 'AERIAL',
      },
      fair: {
        startup: 7, active: 4, endlag: 12, aerial: true, landingLag: 12,
        hitbox: hitboxFromPose('fair', { damage: 10, knockback: 52, angle: 44, pad: 4 }),
        meterKind: 'AERIAL',
      },
      bair: {
        startup: 5, active: 4, endlag: 10, aerial: true, landingLag: 10,
        hitbox: hitboxFromPose('bair', { damage: 13, knockback: 68, angle: 135, pad: 4 }),
        meterKind: 'AERIAL',
      },
      // Upward finger-point Blue pulse — combos into itself at low %.
      uair: {
        startup: 4, active: 5, endlag: 10, aerial: true, landingLag: 8,
        hitbox: hitboxFromPose('uair', { damage: 8, knockback: 44, angle: 88, pad: 4 }),
        meterKind: 'AERIAL',
      },
      // Down-air meteor spike — Gojo's KO confirm offstage.
      dair: {
        startup: 10, active: 5, endlag: 18, aerial: true, landingLag: 18,
        hitbox: hitboxFromPose('dair', { damage: 12, knockback: 62, angle: 270, pad: 4 }),
        meterKind: 'AERIAL',
      },

      grab: {
        startup: 6, active: 3, endlag: 16, grab: true,
        hitbox: hitboxFromPose('grab', { damage: 0, knockback: 0, angle: 0, pad: 6 }),
        meterKind: 'THROW',
      },
    };
  }
}
