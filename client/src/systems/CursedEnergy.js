// Cursed Energy meter — passive regen and consumption helper.

export function regenCE(fighter) {
  if (fighter.ce < fighter.ceMax) {
    fighter.ce = Math.min(fighter.ceMax, fighter.ce + fighter.ceRegen);
  }
}

export function spendCE(fighter, amount) {
  if (fighter.ce < amount) return false;
  fighter.ce -= amount;
  return true;
}

export function hasCE(fighter, amount) { return fighter.ce >= amount; }
