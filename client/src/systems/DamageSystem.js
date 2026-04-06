// Smash-style percent-based damage and knockback resolution.

import { CONSTANTS } from '../../../shared/Constants.js';

export function applyHit(attacker, defender, hit) {
  if (defender.invulnFrames > 0) return false;
  if (defender.ko) return false;
  // Gojo's Infinity passive: 60% damage / 40% knockback reduction at melee range when CE > 25%
  let dmgMul = 1, kbMul = 1;
  if (defender.passiveInfinity && defender.ce > defender.ceMax * 0.25 && !hit.ignoresInfinity) {
    dmgMul = 0.4; kbMul = 0.6;
  }
  // Shield absorbs damage with no knockback
  if (defender.shielding) {
    defender.shieldHP -= hit.damage * 1.0;
    if (defender.shieldHP <= 0) {
      defender.shieldHP = 0;
      defender.shieldBroken = true;
      defender.stunTimer = CONSTANTS.SHIELD_BREAK_STUN;
    }
    return true;
  }
  const dmg = hit.damage * dmgMul;
  defender.percent += dmg;
  // Sukuna's Cleave: damage scales with target percent (handled before by hit.damage if scaled)
  const weight = defender.weight || 100;
  const baseKB = CONSTANTS.KNOCKBACK_BASE + (hit.knockback || 30) * 0.05;
  const kb = (baseKB + defender.percent * CONSTANTS.KNOCKBACK_SCALING) * (100 / weight) * kbMul;
  const ang = (hit.angle ?? 45) * Math.PI / 180;
  const dir = attacker.x <= defender.x ? 1 : -1;
  defender.vx = Math.cos(ang) * kb * dir;
  defender.vy = -Math.sin(ang) * kb;
  defender.hitstun = Math.floor(CONSTANTS.HITSTUN_BASE + dmg * CONSTANTS.HITSTUN_MULTIPLIER + kb * 0.6);
  defender.tumble = kb > 6;
  defender.lastHitBy = attacker.id;
  attacker.hitstop = CONSTANTS.HITSTOP_FRAMES + Math.min(4, dmg | 0);
  defender.hitstop = attacker.hitstop;
  return true;
}
