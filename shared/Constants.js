// Shared constants for client + server. Plain ES module.
// All values are in 60fps frames unless otherwise noted.

export const TARGET_FPS = 60;
export const TARGET_FRAME_TIME = 1000 / TARGET_FPS;

export const CONSTANTS = {
  GRAVITY: 0.58,
  MAX_FALL_SPEED: 12,
  FAST_FALL_SPEED: 16,
  HITSTUN_BASE: 5,
  HITSTUN_MULTIPLIER: 0.4,
  KNOCKBACK_BASE: 2.4,
  KNOCKBACK_SCALING: 0.12,
  DI_INFLUENCE: 15,
  SHIELD_HP: 100,
  SHIELD_REGEN: 0.15,
  SHIELD_BREAK_STUN: 180,
  LEDGE_HANG_MAX: 300,
  INPUT_BUFFER: 6,
  CE_REGEN_RATE: 0.15,
  DOMAIN_PASSIVE_GAIN: 2,
  DOMAIN_LOCKOUT: 900,
  DOMAIN_METER_MAX: 1000,
  HITSTOP_FRAMES: 4,
};

// Stage boundaries — used by physics for blast zones
export const STAGE_BOUNDS = {
  LEFT: -250,
  RIGHT: 1530,
  TOP: -300,
  BOTTOM: 950,
};

// Fighter states (state machine)
export const STATE = {
  IDLE: 'idle',
  WALK: 'walk',
  RUN: 'run',
  JUMPSQUAT: 'jumpsquat',
  AIRBORNE: 'airborne',
  LAND: 'land',
  ATTACK: 'attack',
  HITSTUN: 'hitstun',
  TUMBLE: 'tumble',
  SHIELD: 'shield',
  DODGE: 'dodge',
  GRAB: 'grab',
  THROWN: 'thrown',
  KO: 'ko',
  DOMAIN_CAST: 'domain_cast',
  DOMAIN_ACTIVE: 'domain_active',
  STUNNED: 'stunned',
};

// Domain meter gain values
export const DOMAIN_GAIN = {
  PASSIVE: 2,
  JAB: 8,
  TILT: 8,
  SMASH: 25,
  SPECIAL: 15,
  AERIAL: 10,
  THROW: 20,
  BLACK_FLASH: 80,
  PER_DAMAGE_TAKEN: 3,
};
