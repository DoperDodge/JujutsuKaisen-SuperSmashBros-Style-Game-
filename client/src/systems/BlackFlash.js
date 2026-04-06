// Black Flash frame-perfect input mechanic for Yuji's Neutral Special.
// Window: charge 12 frames, then a 3-frame perfect press window at impact.

export const BLACK_FLASH = {
  CHARGE_FRAMES: 12,
  PERFECT_WINDOW: 3,
  DAMAGE_BASE: 10,
  DAMAGE_MULT: 2.5,
  ENDLAG_NORMAL: 18,
  ENDLAG_MISS: 32,
  DOMAIN_GAIN: 80,
};

// Returns { damage, perfect } based on the input timing relative to impact frame.
export function resolveBlackFlash(framesFromImpact, pressedAtThisFrame) {
  const within = Math.abs(framesFromImpact) <= Math.floor(BLACK_FLASH.PERFECT_WINDOW / 2);
  if (within && pressedAtThisFrame) {
    return { damage: BLACK_FLASH.DAMAGE_BASE * BLACK_FLASH.DAMAGE_MULT, perfect: true };
  }
  return { damage: BLACK_FLASH.DAMAGE_BASE, perfect: false };
}
