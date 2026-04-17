// Smash-style percent-based damage and knockback resolution.
// Tuned for Smash Ultimate-style combo feel:
//   - low-damage attacks produce short hitstun and shallow launch angles that
//     favor follow-ups
//   - mid/high-damage attacks scale aggressively with percent for KO power
//   - light DI is applied at the moment of launch (stick direction held by
//     the defender nudges the launch vector by DI_INFLUENCE degrees)
//   - hitlag/hitstop scales with damage so meaty hits *feel* meaty

import { CONSTANTS } from '../../../shared/Constants.js';
import { INPUT, isPressed } from '../../../shared/InputCodes.js';

// Turn a launch vector (vx, vy) by `deg` degrees toward `stickX, stickY`.
function applyDI(vx, vy, stickX, stickY) {
  const mag = Math.hypot(vx, vy);
  if (mag < 0.1) return { vx, vy };
  const sMag = Math.hypot(stickX, stickY);
  if (sMag < 0.1) return { vx, vy };
  // Angle between launch and stick. Small signed component lets us rotate
  // the launch vector a few degrees either way.
  const cross = vx * stickY - vy * stickX;
  const dir = Math.sign(cross) || 1;
  const maxDeg = CONSTANTS.DI_INFLUENCE || 15;
  const rot = (dir * maxDeg) * Math.PI / 180;
  const cos = Math.cos(rot), sin = Math.sin(rot);
  return { vx: vx * cos - vy * sin, vy: vx * sin + vy * cos };
}

export function applyHit(attacker, defender, hit) {
  if (defender.invulnFrames > 0) return false;
  if (defender.ko) return false;

  // Gojo's Infinity passive: 60% damage / 40% knockback reduction at melee range
  // when CE > 25%. Projectiles and Domain hits mark `ignoresInfinity`.
  let dmgMul = 1, kbMul = 1;
  if (defender.passiveInfinity && defender.ce > defender.ceMax * 0.25 && !hit.ignoresInfinity) {
    dmgMul = 0.4; kbMul = 0.6;
  }

  // Shield absorbs damage with no knockback, but pushes defender back slightly.
  if (defender.shielding) {
    defender.shieldHP -= hit.damage * 1.0;
    defender.vx += (defender.x >= (attacker.x || defender.x) ? 1 : -1) * 1.5;
    if (defender.shieldHP <= 0) {
      defender.shieldHP = 0;
      defender.shieldBroken = true;
      defender.stunTimer = CONSTANTS.SHIELD_BREAK_STUN;
    }
    // Attacker still gets hitlag feedback on shield hits for satisfying feel.
    attacker.hitstop = Math.max(attacker.hitstop || 0, 3);
    return true;
  }

  const dmg = hit.damage * dmgMul;
  defender.percent += dmg;
  const weight = defender.weight || 100;

  // Smash-ultimate style knockback: baseKB + growth * percent, scaled by the
  // defender's weight. Bigger `knockback` values = more launch. We scale the
  // angle so jab-tier hits (<= 25 kb) pop up only slightly at low %, but
  // smashes start ramping hard above ~80%.
  const kbBase = (hit.knockback || 30) * 0.05;
  const kbGrowth = (hit.knockback || 30) * 0.012;
  const rawKB = (CONSTANTS.KNOCKBACK_BASE + kbBase + defender.percent * kbGrowth) * (100 / weight) * kbMul;
  // Clamp low-tier hits so they don't accidentally launch in combo starters.
  const kb = rawKB;
  const ang = (hit.angle ?? 45) * Math.PI / 180;
  const dir = (attacker.x ?? defender.x) <= defender.x ? 1 : -1;

  let vx = Math.cos(ang) * kb * dir;
  let vy = -Math.sin(ang) * kb;

  // DI — read the defender's current held stick direction (if they have input
  // state attached via `_prevInput`). Rotates the launch vector by up to
  // DI_INFLUENCE degrees toward the stick.
  const im = defender.world && defender.world.input;
  if (im && typeof defender.playerIndex === 'number') {
    const mask = im.current(defender.playerIndex);
    let sx = 0, sy = 0;
    if (isPressed(mask, INPUT.LEFT))  sx -= 1;
    if (isPressed(mask, INPUT.RIGHT)) sx += 1;
    if (isPressed(mask, INPUT.UP))    sy -= 1;
    if (isPressed(mask, INPUT.DOWN))  sy += 1;
    if (sx !== 0 || sy !== 0) {
      const r = applyDI(vx, vy, sx, sy);
      vx = r.vx; vy = r.vy;
    }
  }

  defender.vx = vx;
  defender.vy = vy;
  // Hitstun: base + scaling with damage + launch magnitude. SSB Ultimate-style
  // tuning uses roughly 0.4 * knockback for hitstun frames, giving strong
  // combo windows off tilts and aerials while locking high-% launches for KO.
  defender.hitstun = Math.floor(CONSTANTS.HITSTUN_BASE + dmg * CONSTANTS.HITSTUN_MULTIPLIER + kb * 0.55);
  defender.tumble = kb > 6.5;
  defender.lastHitBy = attacker.id;
  // Hitstop: scale with damage (capped) so every hit has weight, but jabs
  // don't grind the game to a halt.
  const lag = Math.min(8, CONSTANTS.HITSTOP_FRAMES + Math.floor(dmg * 0.35));
  attacker.hitstop = Math.max(attacker.hitstop || 0, lag);
  defender.hitstop = Math.max(defender.hitstop || 0, lag);
  return true;
}
