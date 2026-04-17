// Yuji Itadori / Ryomen Sukuna — Pyra/Mythra-style swap fighter.
// Shared damage% + Domain meter. Separate CE pools.
// Yuji: rushdown brawler, Black Flash on frame-perfect input.
// Sukuna: slash-based range fighter, adaptive Cleave, screen-length slash.

import { Fighter } from './Fighter.js';
import { FIGHTER_STATS } from '../../../shared/FighterData.js';
import { BLACK_FLASH } from '../systems/BlackFlash.js';
import { MalevolentShrine } from '../systems/DomainExpansion.js';
import { INPUT, isPressed } from '../../../shared/InputCodes.js';
import { hitboxFromPose } from '../rendering/SpriteSheet.js';

export class YujiSukunaFighter extends Fighter {
  constructor(opts) {
    super({ ...opts, ...FIGHTER_STATS.yuji, character: 'yuji', displayName: 'Yuji / Sukuna' });
    this.mode = 'yuji';
    this.swapCooldown = 0;
    this.cePools = { yuji: this.ceMax, sukuna: 120 };
    this.cePoolMax = { yuji: 100, sukuna: 120 };
    this.domainClass = MalevolentShrine;
    this._setMode('yuji');
    // Black Flash tracking
    this._blackFlashPerfect = false;
    this._blackFlashWindow = 0;  // frames remaining where a SPECIAL press = perfect
  }

  _setMode(mode) {
    this.mode = mode;
    this.character = mode;
    this.ce = this.cePools[mode];
    this.ceMax = this.cePoolMax[mode];
    const stats = FIGHTER_STATS[mode];
    this.weight = stats.weight;
    this.walkSpeed = stats.walkSpeed;
    this.runSpeed = stats.runSpeed;
    this.jumpStrength = stats.jumpHeight;
    this.airSpeed = stats.airSpeed;
    this.fallSpeed = stats.fallSpeed;
    this.ceRegen = stats.ceRegen;
    this.moves = mode === 'yuji' ? this._yujiMoves() : this._sukunaMoves();
  }

  tick(input, world) {
    if (this.swapCooldown > 0) this.swapCooldown--;
    // Black Flash: if window open and SPECIAL pressed, flag perfect for impact.
    if (this._blackFlashWindow > 0) {
      this._blackFlashWindow--;
      if ((input & INPUT.SPECIAL) && !(this._prevInput & INPUT.SPECIAL)) {
        this._blackFlashPerfect = true;
      }
    }
    super.tick(input, world);
    this.cePools[this.mode] = this.ce;
    const otherMode = this.mode === 'yuji' ? 'sukuna' : 'yuji';
    if (this.cePools[otherMode] < this.cePoolMax[otherMode]) {
      this.cePools[otherMode] = Math.min(this.cePoolMax[otherMode],
        this.cePools[otherMode] + this.ceRegen * 0.5);
    }
  }

  swap() {
    if (this.swapCooldown > 0) return;
    this.swapCooldown = 300;
    this.invulnFrames = 15;
    this._setMode(this.mode === 'yuji' ? 'sukuna' : 'yuji');
    if (this.world) this.world.particles.burst(this.x, this.y - 50, this.mode === 'sukuna' ? '#ff3050' : '#ffb84a', 24, 5);
  }

  activateDomain(world) {
    if (this.mode === 'yuji') this._setMode('sukuna');
    super.activateDomain(world);
  }

  _yujiMoves() {
    const self = this;
    return {
      // Rapid 5-ish hit jab combo. Jab 1 starts a combo.
      jab: {
        startup: 3, active: 3, endlag: 7,
        hitbox: hitboxFromPose('jab_hit', { damage: 3, knockback: 14, angle: 35, pad: 4 }),
        meterKind: 'JAB',
      },
      ftilt: {
        startup: 5, active: 4, endlag: 11,
        hitbox: hitboxFromPose('ftilt_hit', { damage: 7, knockback: 40, angle: 38, pad: 4 }),
        meterKind: 'TILT',
      },
      // Rising uppercut — juggle starter.
      utilt: {
        startup: 4, active: 4, endlag: 10,
        hitbox: hitboxFromPose('utilt_hit', { damage: 8, knockback: 42, angle: 88, pad: 6 }),
        meterKind: 'TILT',
      },
      dtilt: {
        startup: 4, active: 3, endlag: 9,
        hitbox: hitboxFromPose('dtilt_hit', { damage: 6, knockback: 24, angle: 28, pad: 4 }),
        meterKind: 'TILT',
      },

      // Divergent Fist — charged straight + delayed 2nd hit after 8 frames.
      // Smashable: holding ATTACK charges the initial punch up to 1.7x.
      fsmash: {
        startup: 12, active: 4, endlag: 24, meterKind: 'SMASH', smash: true,
        windows: [
          { from: 12, to: 16,
            hitbox: hitboxFromPose('fsmash_hit', { damage: 10, knockback: 55, angle: 40, pad: 4 }) },
          // Delayed cursed energy burst (hit 2): different angle, harder to DI
          { from: 24, to: 28,
            hitbox: hitboxFromPose('fsmash_max', { damage: 8, knockback: 75, angle: 75, pad: 4 }) },
        ],
      },
      usmash: {
        startup: 10, active: 5, endlag: 22, smash: true,
        hitbox: hitboxFromPose('usmash_hit', { damage: 14, knockback: 85, angle: 90, pad: 6 }),
        meterKind: 'SMASH',
      },
      dsmash: {
        startup: 9, active: 5, endlag: 20, smash: true,
        hitbox: hitboxFromPose('dsmash_hit', { damage: 12, knockback: 68, angle: 30, pad: 4 }),
        meterKind: 'SMASH',
      },

      // Black Flash — frame-perfect SPECIAL repress near impact (3-frame window).
      neutralspecial: {
        startup: 12, active: 4, endlag: 18, ceCost: 12, meterKind: 'SPECIAL',
        hitbox: f => hitboxFromPose('neutralspecial_hit', {
          damage: f._blackFlashPerfect ? 25 : 10,
          knockback: f._blackFlashPerfect ? 105 : 48,
          angle: 40,
          pad: 6,
        }),
        onStart(f) {
          f._blackFlashPerfect = false;
          // Open a 3-frame perfect-repress window at the start of active.
          // startup=12, active 12..16, so window fires 12..15.
        },
        onFrame(f, frame) {
          if (frame === 11) f._blackFlashWindow = 3;
        },
        onHit(f, target, world, hb) {
          if (f._blackFlashPerfect) {
            f.domainMeter.value = Math.min(f.domainMeter.max, f.domainMeter.value + 80);
            world.camera.shake(22, 18);
            world.particles.burst(target.x, target.y - 40, '#000000', 36, 8);
            world.particles.burst(target.x, target.y - 40, '#9f00ff', 26, 6);
            // White flash
            for (let i = 0; i < 20; i++) {
              world.particles.spawn({
                x: target.x + (Math.random() - 0.5) * 80,
                y: target.y - 40 + (Math.random() - 0.5) * 80,
                life: 14, size: 3 + Math.random() * 3,
                color: '#ffffff', glow: true,
              });
            }
          }
        },
      },

      // Manji Kick — rushing roundhouse, good approach + combo extender.
      sidespecial: {
        startup: 6, active: 6, endlag: 16, ceCost: 8, meterKind: 'SPECIAL',
        hitbox: hitboxFromPose('sidespecial_hit', { damage: 11, knockback: 55, angle: 38, pad: 6 }),
        onStart(f) { f.vx = f.facing * 10; f.vy = Math.min(f.vy, -2); },
      },
      // Cursed Energy Leap — recovery with small hit on ascent.
      upspecial: {
        startup: 4, active: 8, endlag: 20, ceCost: 5, meterKind: 'SPECIAL',
        hitbox: hitboxFromPose('upspecial_hit', { damage: 7, knockback: 48, angle: 82, pad: 4 }),
        onStart(f) {
          f.vy = -17;
          const im = f.world && f.world.input;
          let hx = 0;
          if (im) {
            const mask = im.current(f.playerIndex);
            if (isPressed(mask, INPUT.LEFT))  hx = -1;
            if (isPressed(mask, INPUT.RIGHT)) hx =  1;
          }
          if (hx === 0) hx = f.facing;
          f.vx = hx * 4.5;
          f.jumpsLeft = 1;
        },
      },
      // Swap to Sukuna.
      downspecial: {
        startup: 3, active: 1, endlag: 8, meterKind: 'SPECIAL',
        onStart(f) { self.swap(); },
      },

      // Yuji aerials — fast, combo-friendly, low landing lag. Short-hop combos!
      nair: {
        startup: 3, active: 14, endlag: 8, aerial: true, landingLag: 6, autocancel: 20,
        hitbox: hitboxFromPose('nair', { damage: 7, knockback: 38, angle: 50, pad: 4 }),
        meterKind: 'AERIAL',
      },
      fair: {
        startup: 6, active: 4, endlag: 12, aerial: true, landingLag: 10,
        hitbox: hitboxFromPose('fair', { damage: 9, knockback: 48, angle: 44, pad: 4 }),
        meterKind: 'AERIAL',
      },
      bair: {
        startup: 5, active: 4, endlag: 12, aerial: true, landingLag: 9,
        hitbox: hitboxFromPose('bair', { damage: 11, knockback: 60, angle: 135, pad: 4 }),
        meterKind: 'AERIAL',
      },
      uair: {
        startup: 4, active: 5, endlag: 10, aerial: true, landingLag: 7,
        hitbox: hitboxFromPose('uair', { damage: 8, knockback: 46, angle: 88, pad: 4 }),
        meterKind: 'AERIAL',
      },
      dair: {
        startup: 8, active: 4, endlag: 14, aerial: true, landingLag: 14,
        hitbox: hitboxFromPose('dair', { damage: 10, knockback: 46, angle: 260, pad: 4 }),
        meterKind: 'AERIAL',
      },

      grab: {
        startup: 5, active: 3, endlag: 14, grab: true,
        hitbox: hitboxFromPose('grab', { damage: 0, knockback: 0, angle: 0, pad: 6 }),
        meterKind: 'THROW',
      },
    };
  }

  _sukunaMoves() {
    return {
      // Invisible blade 3-hit jab: each hit has disjointed reach. Slightly
      // padded hitbox so disjointed blade "reaches beyond" his body like the
      // plan describes.
      jab: {
        startup: 4, active: 3, endlag: 9,
        hitbox: hitboxFromPose('jab_hit', { damage: 4, knockback: 18, angle: 32, pad: 10 }),
        meterKind: 'JAB',
      },
      // Dismantle: quick invisible slash projectile (~1/4 stage).
      ftilt: {
        startup: 5, active: 1, endlag: 14, ceCost: 3, meterKind: 'TILT',
        onStart(f) {
          const w = f.world; if (!w) return;
          w.projectiles.spawn({
            x: f.x + 60 * f.facing,
            y: f.y - 55,
            vx: 16 * f.facing, vy: 0, life: 26,
            owner: f,
            kind: 'slash', color: '#ff4060',
            hitbox: { w: 52, h: 16, damage: 6, knockback: 32, angle: 30 },
          });
        },
      },
      utilt: {
        startup: 5, active: 4, endlag: 12,
        hitbox: hitboxFromPose('utilt_hit', { damage: 9, knockback: 58, angle: 88, pad: 10 }),
        meterKind: 'TILT',
      },
      dtilt: {
        startup: 4, active: 4, endlag: 11,
        hitbox: hitboxFromPose('dtilt_hit', { damage: 7, knockback: 28, angle: 22, pad: 10 }),
        meterKind: 'TILT',
      },

      // Cleave — adaptive Fsmash (damage scales with target's percent).
      fsmash: {
        startup: 14, active: 4, endlag: 24, meterKind: 'SMASH', smash: true,
        hitbox: f => {
          const target = f.world && f.world.fighters.find(o => o !== f && !o.ko);
          const tp = target ? target.percent : 0;
          const dmg = 12 + Math.min(10, tp * 0.08);
          return hitboxFromPose('fsmash_hit', { damage: dmg, knockback: 88, angle: 40, pad: 10 });
        },
      },
      // Four-arm upward slash — wide KO hitbox.
      usmash: {
        startup: 10, active: 6, endlag: 22, smash: true,
        hitbox: hitboxFromPose('usmash_hit', { damage: 15, knockback: 90, angle: 90, pad: 12 }),
        meterKind: 'SMASH',
      },
      // Circular slash around Sukuna.
      dsmash: {
        startup: 10, active: 6, endlag: 22, smash: true,
        hitbox: hitboxFromPose('dsmash_hit', { damage: 14, knockback: 74, angle: 30, pad: 10 }),
        meterKind: 'SMASH',
      },

      // Dismantle Barrage — 5 fan slashes at staggered frames.
      neutralspecial: {
        startup: 8, active: 18, endlag: 16, ceCost: 20, meterKind: 'SPECIAL',
        windows: [
          { from: 8,  to: 11, hitbox: { x: 80, y: 58, w: 80, h: 14, damage: 4, knockback: 22, angle: 30 } },
          { from: 11, to: 14, hitbox: { x: 80, y: 70, w: 80, h: 14, damage: 4, knockback: 22, angle: 25 } },
          { from: 14, to: 17, hitbox: { x: 80, y: 44, w: 80, h: 14, damage: 4, knockback: 22, angle: 40 } },
          { from: 17, to: 20, hitbox: { x: 80, y: 82, w: 80, h: 14, damage: 4, knockback: 22, angle: 20 } },
          { from: 20, to: 26, hitbox: { x: 96, y: 54, w: 100, h: 20, damage: 6, knockback: 55, angle: 35 } },
        ],
      },

      // World-Cutting Slash — long telegraph, screen-length horizontal slash.
      sidespecial: {
        startup: 28, active: 1, endlag: 28, ceCost: 25, meterKind: 'SPECIAL',
        onStart(f) {
          const w = f.world; if (!w) return;
          // One long persistent slash projectile across the stage.
          w.projectiles.spawn({
            x: f.x + 80 * f.facing,
            y: f.y - 54,
            vx: 26 * f.facing, vy: 0, life: 40,
            owner: f,
            kind: 'beam', color: '#ff2040',
            hitbox: { w: 170, h: 24, damage: 22, knockback: 115, angle: 35 },
          });
        },
      },

      // Cursed Flame Jump — upward fire, hits on ascent.
      upspecial: {
        startup: 5, active: 10, endlag: 22, ceCost: 10, meterKind: 'SPECIAL',
        hitbox: hitboxFromPose('upspecial_hit', { damage: 9, knockback: 55, angle: 85, pad: 8 }),
        onStart(f) { f.vy = -16; f.jumpsLeft = 1; f.vx = f.facing * 2.5; },
      },

      downspecial: {
        startup: 3, active: 1, endlag: 8, meterKind: 'SPECIAL',
        onStart(f) { f.swap && f.swap(); },
      },

      // Sukuna aerials — slower but disjointed, bigger reach.
      nair: {
        startup: 5, active: 14, endlag: 12, aerial: true, landingLag: 10, autocancel: 22,
        hitbox: hitboxFromPose('nair', { damage: 10, knockback: 50, angle: 50, pad: 10 }),
        meterKind: 'AERIAL',
      },
      fair: {
        startup: 7, active: 5, endlag: 14, aerial: true, landingLag: 14,
        hitbox: hitboxFromPose('fair', { damage: 12, knockback: 62, angle: 44, pad: 10 }),
        meterKind: 'AERIAL',
      },
      bair: {
        startup: 7, active: 4, endlag: 14, aerial: true, landingLag: 12,
        hitbox: hitboxFromPose('bair', { damage: 14, knockback: 72, angle: 135, pad: 10 }),
        meterKind: 'AERIAL',
      },
      // Upward spear of invisible blades.
      uair: {
        startup: 6, active: 5, endlag: 12, aerial: true, landingLag: 10,
        hitbox: hitboxFromPose('uair', { damage: 11, knockback: 58, angle: 90, pad: 10 }),
        meterKind: 'AERIAL',
      },
      // Plunging slash (strong spike).
      dair: {
        startup: 10, active: 6, endlag: 20, aerial: true, landingLag: 20,
        hitbox: hitboxFromPose('dair', { damage: 14, knockback: 60, angle: 270, pad: 10 }),
        meterKind: 'AERIAL',
      },

      grab: {
        startup: 6, active: 3, endlag: 16, grab: true,
        hitbox: hitboxFromPose('grab', { damage: 0, knockback: 0, angle: 0, pad: 8 }),
        meterKind: 'THROW',
      },
    };
  }
}
