// Yuji Itadori / Ryomen Sukuna swap fighter (Pyra/Mythra style).
// Internally a single Fighter instance with two move tables; downspecial swaps.

import { Fighter } from './Fighter.js';
import { FIGHTER_STATS } from '../../../shared/FighterData.js';
import { BLACK_FLASH } from '../systems/BlackFlash.js';
import { MalevolentShrine } from '../systems/DomainExpansion.js';
import { spendCE, hasCE } from '../systems/CursedEnergy.js';

export class YujiSukunaFighter extends Fighter {
  constructor(opts) {
    super({ ...opts, ...FIGHTER_STATS.yuji, character: 'yuji', displayName: 'Yuji / Sukuna' });
    this.mode = 'yuji';
    this.swapCooldown = 0;
    // Separate CE pools per mode (shared damage % + domain meter)
    this.cePools = { yuji: this.ceMax, sukuna: 120 };
    this.cePoolMax = { yuji: 100, sukuna: 120 };
    this.domainClass = MalevolentShrine;
    this._setMode('yuji');
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

  // Override tick so background pool can regen at half rate
  tick(input, world) {
    if (this.swapCooldown > 0) this.swapCooldown--;
    super.tick(input, world);
    // Save active CE back into pool
    this.cePools[this.mode] = this.ce;
    // Background pool regen at 50%
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
  }

  // Domain forces swap to Sukuna first
  activateDomain(world) {
    if (this.mode === 'yuji') this._setMode('sukuna');
    super.activateDomain(world);
  }

  _yujiMoves() {
    const self = this;
    return {
      jab:           { startup: 3, active: 3, endlag: 8,  hitbox: { x: 28, y: 50, w: 36, h: 22, damage: 3, knockback: 25, angle: 30 }, meterKind: 'JAB' },
      ftilt:         { startup: 6, active: 4, endlag: 12, hitbox: { x: 36, y: 48, w: 44, h: 24, damage: 8, knockback: 45, angle: 35 }, meterKind: 'TILT' },
      utilt:         { startup: 5, active: 4, endlag: 12, hitbox: { x: 0, y: 80, w: 60, h: 30, damage: 9, knockback: 60, angle: 85 }, meterKind: 'TILT' },
      dtilt:         { startup: 4, active: 3, endlag: 10, hitbox: { x: 30, y: 12, w: 50, h: 18, damage: 6, knockback: 30, angle: 25 }, meterKind: 'TILT' },
      fsmash:        { startup: 14, active: 4, endlag: 24, hitbox: { x: 40, y: 50, w: 50, h: 30, damage: 18, knockback: 90, angle: 40 }, meterKind: 'SMASH',
        // Divergent Fist: spawns delayed second hitbox
        onStart(f) { f.world && setTimeout(() => {}, 0); /* delayed handled below */ },
      },
      usmash:        { startup: 12, active: 5, endlag: 22, hitbox: { x: 0, y: 90, w: 70, h: 40, damage: 15, knockback: 85, angle: 90 }, meterKind: 'SMASH' },
      dsmash:        { startup: 10, active: 5, endlag: 20, hitbox: { x: 0, y: 8, w: 110, h: 24, damage: 13, knockback: 70, angle: 30 }, meterKind: 'SMASH' },

      neutralspecial: { startup: BLACK_FLASH.CHARGE_FRAMES, active: 4, endlag: BLACK_FLASH.ENDLAG_NORMAL, ceCost: 12, meterKind: 'SPECIAL',
        hitbox: f => ({ x: 38, y: 50, w: 46, h: 30, damage: f._blackFlashPerfect ? 25 : 10, knockback: f._blackFlashPerfect ? 95 : 50, angle: 40 }),
        onStart(f) { f._blackFlashPerfect = false; },
        onHit(f, target, world, hb) {
          // Check if SPECIAL pressed in 3-frame perfect window around impact
          const im = world.input;
          if (im && im.pressed(f.playerIndex, 32 /* INPUT.SPECIAL */)) {
            f._blackFlashPerfect = true;
            hb.damage = 25; hb.knockback = 95;
            f.domainMeter.value = Math.min(f.domainMeter.max, f.domainMeter.value + BLACK_FLASH.DOMAIN_GAIN);
            world.camera.shake(20, 16);
            world.particles.burst(target.x, target.y - 40, '#000000', 30, 7);
            world.particles.burst(target.x, target.y - 40, '#9f00ff', 22, 5);
          }
        },
      },
      sidespecial:   { startup: 8, active: 6, endlag: 18, ceCost: 8, meterKind: 'SPECIAL',
        hitbox: { x: 40, y: 40, w: 60, h: 36, damage: 11, knockback: 60, angle: 35 },
        onStart(f) { f.vx = f.facing * 8; },
      },
      upspecial:     { startup: 5, active: 8, endlag: 22, ceCost: 5, meterKind: 'SPECIAL',
        hitbox: { x: 0, y: 90, w: 50, h: 40, damage: 7, knockback: 50, angle: 80 },
        onStart(f) { f.vy = -16; f.jumpsLeft = 1; },
      },
      downspecial:   { startup: 4, active: 1, endlag: 10, meterKind: 'SPECIAL',
        onStart(f) { self.swap(); },
      },
      // aerials
      nair: { startup: 4, active: 12, endlag: 10, hitbox: { x: 0, y: 50, w: 60, h: 50, damage: 8, knockback: 45, angle: 50 }, meterKind: 'AERIAL' },
      fair: { startup: 7, active: 4, endlag: 14, hitbox: { x: 36, y: 50, w: 44, h: 30, damage: 10, knockback: 55, angle: 45 }, meterKind: 'AERIAL' },
      bair: { startup: 6, active: 4, endlag: 14, hitbox: f => ({ x: -36, y: 50, w: 44, h: 26, damage: 12, knockback: 65, angle: 135 }), meterKind: 'AERIAL' },
      uair: { startup: 5, active: 5, endlag: 12, hitbox: { x: 0, y: 90, w: 50, h: 36, damage: 9, knockback: 55, angle: 90 }, meterKind: 'AERIAL' },
      dair: { startup: 9, active: 5, endlag: 18, hitbox: { x: 0, y: 0, w: 50, h: 30, damage: 11, knockback: 50, angle: 270 }, meterKind: 'AERIAL' },
      grab: { startup: 6, active: 3, endlag: 16, hitbox: { x: 36, y: 60, w: 36, h: 30, damage: 0, knockback: 0, angle: 0 }, meterKind: 'THROW' },
    };
  }

  _sukunaMoves() {
    return {
      jab:    { startup: 4, active: 3, endlag: 10, hitbox: { x: 38, y: 50, w: 56, h: 24, damage: 4, knockback: 30, angle: 30 }, meterKind: 'JAB' },
      // Dismantle quick projectile-like slash (modeled as a long disjointed hitbox)
      ftilt:  { startup: 5, active: 4, endlag: 12, ceCost: 3, meterKind: 'TILT',
                hitbox: { x: 80, y: 50, w: 120, h: 18, damage: 7, knockback: 35, angle: 30 } },
      utilt:  { startup: 6, active: 4, endlag: 14, hitbox: { x: 0, y: 90, w: 80, h: 30, damage: 10, knockback: 65, angle: 90 }, meterKind: 'TILT' },
      dtilt:  { startup: 5, active: 4, endlag: 12, hitbox: { x: 36, y: 8, w: 90, h: 18, damage: 8, knockback: 30, angle: 25 }, meterKind: 'TILT' },
      // Cleave: damage scales with target percent
      fsmash: { startup: 16, active: 4, endlag: 26, meterKind: 'SMASH',
                hitbox: f => {
                  const target = f.world && f.world.fighters.find(o => o !== f && !o.ko);
                  const tp = target ? target.percent : 0;
                  const dmg = 12 + Math.min(8, tp * 0.08);
                  return { x: 50, y: 50, w: 80, h: 36, damage: dmg, knockback: 85, angle: 40 };
                } },
      usmash: { startup: 12, active: 6, endlag: 22, hitbox: { x: 0, y: 100, w: 100, h: 50, damage: 16, knockback: 90, angle: 90 }, meterKind: 'SMASH' },
      dsmash: { startup: 12, active: 5, endlag: 22, hitbox: { x: 0, y: 12, w: 140, h: 28, damage: 14, knockback: 75, angle: 30 }, meterKind: 'SMASH' },
      // Dismantle Barrage: 5 rapid fan slashes
      neutralspecial: { startup: 10, active: 18, endlag: 18, ceCost: 20, meterKind: 'SPECIAL',
                       hitbox: { x: 70, y: 50, w: 130, h: 80, damage: 4, knockback: 25, angle: 35 } },
      // World Cutting Slash
      sidespecial: { startup: 30, active: 6, endlag: 28, ceCost: 25, meterKind: 'SPECIAL',
                     hitbox: { x: 200, y: 50, w: 600, h: 24, damage: 22, knockback: 110, angle: 35 } },
      // Cursed Flame Jump
      upspecial: { startup: 6, active: 8, endlag: 24, ceCost: 10, meterKind: 'SPECIAL',
                   hitbox: { x: 0, y: 90, w: 60, h: 60, damage: 9, knockback: 55, angle: 85 },
                   onStart(f) { f.vy = -15; } },
      downspecial: { startup: 4, active: 1, endlag: 10, meterKind: 'SPECIAL',
                     onStart(f) { f.swap && f.swap(); } },
      nair: { startup: 5, active: 14, endlag: 12, hitbox: { x: 0, y: 50, w: 80, h: 60, damage: 10, knockback: 50, angle: 50 }, meterKind: 'AERIAL' },
      fair: { startup: 7, active: 5, endlag: 14, hitbox: { x: 50, y: 50, w: 70, h: 30, damage: 12, knockback: 60, angle: 45 }, meterKind: 'AERIAL' },
      bair: { startup: 7, active: 4, endlag: 16, hitbox: { x: -50, y: 50, w: 70, h: 28, damage: 14, knockback: 70, angle: 135 }, meterKind: 'AERIAL' },
      uair: { startup: 6, active: 5, endlag: 14, hitbox: { x: 0, y: 100, w: 60, h: 50, damage: 11, knockback: 60, angle: 90 }, meterKind: 'AERIAL' },
      dair: { startup: 10, active: 6, endlag: 20, hitbox: { x: 0, y: 0, w: 60, h: 40, damage: 13, knockback: 55, angle: 270 }, meterKind: 'AERIAL' },
      grab: { startup: 6, active: 3, endlag: 16, hitbox: { x: 36, y: 60, w: 36, h: 30, damage: 0, knockback: 0, angle: 0 }, meterKind: 'THROW' },
    };
  }
}
