// Yuji Itadori / Ryomen Sukuna — Pyra/Mythra-style swap fighter.
// Shared damage% + Domain meter. Separate CE pools.
// Yuji: rushdown brawler, Black Flash on frame-perfect input.
// Sukuna: slash-based range fighter, adaptive Cleave, screen-length slash.

import { Fighter } from './Fighter.js';
import { FIGHTER_STATS } from '../../../shared/FighterData.js';
import { BLACK_FLASH } from '../systems/BlackFlash.js';
import { MalevolentShrine } from '../systems/DomainExpansion.js';
import { INPUT, isPressed } from '../../../shared/InputCodes.js';

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
        hitbox: { x: 28, y: 52, w: 34, h: 20, damage: 3, knockback: 14, angle: 35 },
        meterKind: 'JAB',
      },
      ftilt: {
        startup: 5, active: 4, endlag: 11,
        hitbox: { x: 38, y: 50, w: 46, h: 22, damage: 7, knockback: 40, angle: 38 },
        meterKind: 'TILT',
      },
      // Rising uppercut — juggle starter.
      utilt: {
        startup: 4, active: 4, endlag: 10,
        hitbox: { x: 6, y: 80, w: 52, h: 44, damage: 8, knockback: 42, angle: 88 },
        meterKind: 'TILT',
      },
      dtilt: {
        startup: 4, active: 3, endlag: 9,
        hitbox: { x: 32, y: 12, w: 52, h: 16, damage: 6, knockback: 24, angle: 28 },
        meterKind: 'TILT',
      },

      // Divergent Fist — charged straight + delayed 2nd hit after 8 frames.
      fsmash: {
        startup: 12, active: 4, endlag: 24, meterKind: 'SMASH',
        windows: [
          // Hit 1
          { from: 12, to: 16,
            hitbox: { x: 42, y: 50, w: 50, h: 30, damage: 10, knockback: 55, angle: 40 } },
          // Delayed cursed energy burst (hit 2): different angle, harder to DI
          { from: 24, to: 28,
            hitbox: { x: 44, y: 46, w: 60, h: 36, damage: 8, knockback: 75, angle: 75 } },
        ],
      },
      usmash: {
        startup: 10, active: 5, endlag: 22,
        hitbox: { x: 0, y: 90, w: 70, h: 50, damage: 14, knockback: 85, angle: 90 },
        meterKind: 'SMASH',
      },
      dsmash: {
        startup: 9, active: 5, endlag: 20,
        hitbox: { x: 0, y: 8, w: 120, h: 26, damage: 12, knockback: 68, angle: 30 },
        meterKind: 'SMASH',
      },

      // Black Flash — frame-perfect SPECIAL repress near impact (3-frame window).
      neutralspecial: {
        startup: 12, active: 4, endlag: 18, ceCost: 12, meterKind: 'SPECIAL',
        hitbox: f => ({
          x: 40, y: 50, w: 46, h: 30,
          damage: f._blackFlashPerfect ? 25 : 10,
          knockback: f._blackFlashPerfect ? 105 : 48,
          angle: 40,
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
        hitbox: { x: 44, y: 42, w: 58, h: 36, damage: 11, knockback: 55, angle: 38 },
        onStart(f) { f.vx = f.facing * 10; f.vy = Math.min(f.vy, -2); },
      },
      // Cursed Energy Leap — recovery with small hit on ascent.
      upspecial: {
        startup: 4, active: 8, endlag: 20, ceCost: 5, meterKind: 'SPECIAL',
        hitbox: { x: 0, y: 86, w: 50, h: 50, damage: 7, knockback: 48, angle: 82 },
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

      // Yuji aerials — fast and combo-friendly.
      nair: {
        startup: 3, active: 14, endlag: 8,
        hitbox: { x: 0, y: 50, w: 60, h: 52, damage: 7, knockback: 38, angle: 50 },
        meterKind: 'AERIAL',
      },
      fair: {
        startup: 6, active: 4, endlag: 12,
        hitbox: { x: 38, y: 52, w: 46, h: 30, damage: 9, knockback: 48, angle: 44 },
        meterKind: 'AERIAL',
      },
      bair: {
        startup: 5, active: 4, endlag: 12,
        hitbox: { x: -38, y: 52, w: 46, h: 28, damage: 11, knockback: 60, angle: 135 },
        meterKind: 'AERIAL',
      },
      uair: {
        startup: 4, active: 5, endlag: 10,
        hitbox: { x: 0, y: 96, w: 52, h: 42, damage: 8, knockback: 46, angle: 88 },
        meterKind: 'AERIAL',
      },
      dair: {
        startup: 8, active: 4, endlag: 14,
        hitbox: { x: 0, y: 0, w: 48, h: 32, damage: 10, knockback: 46, angle: 260 },
        meterKind: 'AERIAL',
      },

      grab: {
        startup: 5, active: 3, endlag: 14,
        hitbox: { x: 36, y: 60, w: 38, h: 32, damage: 0, knockback: 0, angle: 0 },
        meterKind: 'THROW',
      },
    };
  }

  _sukunaMoves() {
    return {
      // Invisible blade 3-hit jab: each hit has disjointed reach.
      jab: {
        startup: 4, active: 3, endlag: 9,
        hitbox: { x: 42, y: 52, w: 58, h: 22, damage: 4, knockback: 18, angle: 32 },
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
        hitbox: { x: 0, y: 96, w: 78, h: 40, damage: 9, knockback: 58, angle: 88 },
        meterKind: 'TILT',
      },
      dtilt: {
        startup: 4, active: 4, endlag: 11,
        hitbox: { x: 40, y: 8, w: 92, h: 16, damage: 7, knockback: 28, angle: 22 },
        meterKind: 'TILT',
      },

      // Cleave — adaptive Fsmash.
      fsmash: {
        startup: 14, active: 4, endlag: 24, meterKind: 'SMASH',
        hitbox: f => {
          const target = f.world && f.world.fighters.find(o => o !== f && !o.ko);
          const tp = target ? target.percent : 0;
          const dmg = 12 + Math.min(10, tp * 0.08);
          return { x: 56, y: 50, w: 88, h: 40, damage: dmg, knockback: 88, angle: 40 };
        },
      },
      // Four-arm upward slash — wide KO hitbox.
      usmash: {
        startup: 10, active: 6, endlag: 22,
        hitbox: { x: 0, y: 98, w: 104, h: 58, damage: 15, knockback: 90, angle: 90 },
        meterKind: 'SMASH',
      },
      // Circular slash around Sukuna.
      dsmash: {
        startup: 10, active: 6, endlag: 22,
        hitbox: { x: 0, y: 12, w: 150, h: 32, damage: 14, knockback: 74, angle: 30 },
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
        hitbox: { x: 0, y: 90, w: 62, h: 70, damage: 9, knockback: 55, angle: 85 },
        onStart(f) { f.vy = -16; f.jumpsLeft = 1; f.vx = f.facing * 2.5; },
      },

      downspecial: {
        startup: 3, active: 1, endlag: 8, meterKind: 'SPECIAL',
        onStart(f) { f.swap && f.swap(); },
      },

      // Sukuna aerials — slower but disjointed, bigger reach.
      nair: {
        startup: 5, active: 14, endlag: 12,
        hitbox: { x: 0, y: 50, w: 84, h: 62, damage: 10, knockback: 50, angle: 50 },
        meterKind: 'AERIAL',
      },
      fair: {
        startup: 7, active: 5, endlag: 14,
        hitbox: { x: 54, y: 52, w: 74, h: 30, damage: 12, knockback: 62, angle: 44 },
        meterKind: 'AERIAL',
      },
      bair: {
        startup: 7, active: 4, endlag: 14,
        hitbox: { x: -54, y: 52, w: 74, h: 28, damage: 14, knockback: 72, angle: 135 },
        meterKind: 'AERIAL',
      },
      // Upward spear of invisible blades.
      uair: {
        startup: 6, active: 5, endlag: 12,
        hitbox: { x: 0, y: 104, w: 58, h: 56, damage: 11, knockback: 58, angle: 90 },
        meterKind: 'AERIAL',
      },
      // Plunging slash (strong spike).
      dair: {
        startup: 10, active: 6, endlag: 20,
        hitbox: { x: 0, y: 0, w: 62, h: 42, damage: 14, knockback: 60, angle: 270 },
        meterKind: 'AERIAL',
      },

      grab: {
        startup: 6, active: 3, endlag: 16,
        hitbox: { x: 40, y: 60, w: 42, h: 32, damage: 0, knockback: 0, angle: 0 },
        meterKind: 'THROW',
      },
    };
  }
}
