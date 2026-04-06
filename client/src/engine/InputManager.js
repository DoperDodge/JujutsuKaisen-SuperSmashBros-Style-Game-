// Keyboard + Gamepad input manager with per-frame snapshot + 6-frame buffer.
// Two local players supported via separate keymaps and gamepad slots 0/1.
//
// Gamepad layout (Xbox / PlayStation / generic 16-button):
//   Left stick / D-pad : movement
//   A / Cross          : Jump
//   X / Square         : Attack
//   Y / Triangle       : Special
//   B / Circle         : Grab
//   RB / R1            : Shield
//   LT/RT (axes 6/7)   : combine to trigger Domain (held with Special+Attack)
//   Back / Share       : Taunt

import { INPUT, DEFAULT_KEYMAP_P1, DEFAULT_KEYMAP_P2 } from '../../../shared/InputCodes.js';
import { CONSTANTS } from '../../../shared/Constants.js';

export class InputManager {
  constructor() {
    this.held = new Set();
    this.maps = [DEFAULT_KEYMAP_P1, DEFAULT_KEYMAP_P2];
    this.buffers = [[], []];
    this.lastFrame = [0, 0];
    this.gamepadMasks = [0, 0];
    this.gamepadConnected = [false, false];
    window.addEventListener('keydown', e => {
      this.held.add(e.code);
      if (e.code.startsWith('Arrow') || e.code === 'Space') e.preventDefault();
    });
    window.addEventListener('keyup', e => this.held.delete(e.code));
    window.addEventListener('blur', () => this.held.clear());
    window.addEventListener('gamepadconnected', e => {
      const idx = e.gamepad.index;
      if (idx < 2) this.gamepadConnected[idx] = true;
      console.log('[input] gamepad connected slot', idx, e.gamepad.id);
    });
    window.addEventListener('gamepaddisconnected', e => {
      const idx = e.gamepad.index;
      if (idx < 2) this.gamepadConnected[idx] = false;
    });
  }

  pollGamepads() {
    if (!navigator.getGamepads) return;
    const pads = navigator.getGamepads();
    for (let i = 0; i < 2; i++) {
      const pad = pads[i];
      if (!pad) { this.gamepadMasks[i] = 0; continue; }
      let mask = 0;
      const ax = pad.axes[0] || 0, ay = pad.axes[1] || 0;
      if (ax < -0.4) mask |= INPUT.LEFT;
      if (ax >  0.4) mask |= INPUT.RIGHT;
      if (ay < -0.4) mask |= INPUT.UP;
      if (ay >  0.4) mask |= INPUT.DOWN;
      // Standard mapping buttons
      const btn = (n) => pad.buttons[n] && pad.buttons[n].pressed;
      if (btn(12)) mask |= INPUT.UP;
      if (btn(13)) mask |= INPUT.DOWN;
      if (btn(14)) mask |= INPUT.LEFT;
      if (btn(15)) mask |= INPUT.RIGHT;
      if (btn(0))  mask |= INPUT.JUMP;     // A / Cross
      if (btn(2))  mask |= INPUT.ATTACK;   // X / Square
      if (btn(3))  mask |= INPUT.SPECIAL;  // Y / Triangle
      if (btn(1))  mask |= INPUT.GRAB;     // B / Circle
      if (btn(5) || btn(7)) mask |= INPUT.SHIELD; // RB or RT
      if (btn(4) || btn(6)) {
        // L-trigger held with attack+special triggers Domain Expansion (L+R+B)
        mask |= INPUT.SHIELD;
      }
      if (btn(8)) mask |= INPUT.TAUNT;
      this.gamepadMasks[i] = mask;
    }
  }

  // Build a bitmask of inputs for the given player using their keymap + gamepad
  snapshot(playerIndex) {
    const map = this.maps[playerIndex];
    let mask = this.gamepadMasks[playerIndex] || 0;
    for (const code in map) {
      if (this.held.has(code)) mask |= map[code];
    }
    return mask;
  }

  tick() {
    this.pollGamepads();
    for (let i = 0; i < 2; i++) {
      const mask = this.snapshot(i);
      this.buffers[i].push(mask);
      if (this.buffers[i].length > CONSTANTS.INPUT_BUFFER) this.buffers[i].shift();
      this.lastFrame[i] = mask;
    }
  }

  current(p) { return this.buffers[p][this.buffers[p].length - 1] || 0; }
  prev(p)    { return this.buffers[p][this.buffers[p].length - 2] || 0; }

  pressed(p, code) {
    return (this.current(p) & code) !== 0 && (this.prev(p) & code) === 0;
  }
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
        for (let j = i; j < buf.length; j++) buf[j] &= ~code;
        return true;
      }
    }
    return false;
  }
}
