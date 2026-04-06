// Shared input codes used by both client and server.
// Inputs are stored as a bitmask each frame for compact serialization.

export const INPUT = {
  LEFT:    1 << 0,
  RIGHT:   1 << 1,
  UP:      1 << 2,
  DOWN:    1 << 3,
  ATTACK:  1 << 4, // A
  SPECIAL: 1 << 5, // B
  JUMP:    1 << 6,
  SHIELD:  1 << 7,
  GRAB:    1 << 8,
  TAUNT:   1 << 9,
  // Domain Expansion uses Shield + Special + Attack simultaneously (L+R+B in spec)
};

export const DEFAULT_KEYMAP_P1 = {
  KeyA: INPUT.LEFT,
  KeyD: INPUT.RIGHT,
  KeyW: INPUT.UP,
  KeyS: INPUT.DOWN,
  KeyJ: INPUT.ATTACK,
  KeyK: INPUT.SPECIAL,
  Space: INPUT.JUMP,
  KeyL: INPUT.SHIELD,
  Semicolon: INPUT.GRAB,
  KeyT: INPUT.TAUNT,
};

export const DEFAULT_KEYMAP_P2 = {
  ArrowLeft: INPUT.LEFT,
  ArrowRight: INPUT.RIGHT,
  ArrowUp: INPUT.UP,
  ArrowDown: INPUT.DOWN,
  Numpad1: INPUT.ATTACK,
  Numpad2: INPUT.SPECIAL,
  Numpad0: INPUT.JUMP,
  Numpad3: INPUT.SHIELD,
  Numpad4: INPUT.GRAB,
  Numpad5: INPUT.TAUNT,
};

export function isPressed(state, code) { return (state & code) !== 0; }
export function isDomainInput(state) {
  return isPressed(state, INPUT.SHIELD) && isPressed(state, INPUT.SPECIAL) && isPressed(state, INPUT.ATTACK);
}
