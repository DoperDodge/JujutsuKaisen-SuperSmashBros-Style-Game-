// Keyboard input manager with per-frame snapshot + 6-frame buffer.
// Two local players supported via separate keymaps.

import { INPUT, DEFAULT_KEYMAP_P1, DEFAULT_KEYMAP_P2 } from '../../../shared/InputCodes.js';
import { CONSTANTS } from '../../../shared/Constants.js';

export class InputManager {
  constructor() {
    this.held = new Set();
    this.maps = [DEFAULT_KEYMAP_P1, DEFAULT_KEYMAP_P2];
    this.buffers = [[], []];      // last N frames per player
    this.lastFrame = [0, 0];      // previous frame state for edge detection
    window.addEventListener('keydown', e => {
      this.held.add(e.code);
      // Prevent arrow scroll
      if (e.code.startsWith('Arrow') || e.code === 'Space') e.preventDefault();
    });
    window.addEventListener('keyup', e => this.held.delete(e.code));
    window.addEventListener('blur', () => this.held.clear());
  }

  // Build a bitmask of inputs for the given player using their keymap
  snapshot(playerIndex) {
    const map = this.maps[playerIndex];
    let mask = 0;
    for (const code in map) {
      if (this.held.has(code)) mask |= map[code];
    }
    return mask;
  }

  // Should be called once per game tick. Stores buffered inputs.
  tick() {
    for (let i = 0; i < 2; i++) {
      const mask = this.snapshot(i);
      this.buffers[i].push(mask);
      if (this.buffers[i].length > CONSTANTS.INPUT_BUFFER) this.buffers[i].shift();
      this.lastFrame[i] = mask;
    }
  }

  current(p) { return this.buffers[p][this.buffers[p].length - 1] || 0; }
  prev(p)    { return this.buffers[p][this.buffers[p].length - 2] || 0; }

  // Edge: was just pressed this tick
  pressed(p, code) {
    return (this.current(p) & code) !== 0 && (this.prev(p) & code) === 0;
  }
  // Was pressed within the last bufferFrames ticks (input buffering)
  bufferedPressed(p, code, bufferFrames = CONSTANTS.INPUT_BUFFER) {
    const buf = this.buffers[p];
    const start = Math.max(0, buf.length - bufferFrames);
    for (let i = start; i < buf.length; i++) {
      const cur = buf[i];
      const prev = i > 0 ? buf[i - 1] : 0;
      if ((cur & code) !== 0 && (prev & code) === 0) return true;
    }
    return false;
  }
  consumeBuffered(p, code, bufferFrames = CONSTANTS.INPUT_BUFFER) {
    const buf = this.buffers[p];
    const start = Math.max(0, buf.length - bufferFrames);
    for (let i = start; i < buf.length; i++) {
      const cur = buf[i];
      const prev = i > 0 ? buf[i - 1] : 0;
      if ((cur & code) !== 0 && (prev & code) === 0) {
        // wipe so we don't double-trigger
        for (let j = i; j < buf.length; j++) buf[j] &= ~code;
        return true;
      }
    }
    return false;
  }
}
