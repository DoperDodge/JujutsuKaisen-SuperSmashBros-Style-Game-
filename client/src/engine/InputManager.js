// Keyboard + Gamepad input manager with per-frame snapshot + 6-frame buffer.
// Two local players supported via separate keymaps and gamepad slots 0/1.
//
// Supported controllers:
//   - Xbox One / Series (XInput, "standard" mapping)
//   - PlayStation DualShock 4 / DualSense ("standard" mapping)
//   - Nintendo Switch Pro Controller (USB or BT) — detected by id, both
//     "standard" and Firefox's non-standard layout are handled.
//   - Single Joy-Con (L or R) — detected by id, sideways layout where
//     SL/SR act as shoulders and the stick is the only d-pad.
//   - Any other XInput / generic gamepad falls back to standard mapping.
//
// Logical mapping (game action -> physical button position, regardless of label):
//   Jump   = bottom face button   (Xbox A, PS Cross, Switch B)
//   Attack = left face button     (Xbox X, PS Square, Switch Y)
//   Special= top face button      (Xbox Y, PS Triangle, Switch X)
//   Grab   = right face button    (Xbox B, PS Circle, Switch A)
//   Shield = right shoulder       (RB / R1 / R)
//   Domain Expansion = Shield + Special + Attack (L+R+B per spec)

import { INPUT, DEFAULT_KEYMAP_P1 } from '../../../shared/InputCodes.js';
import { CONSTANTS } from '../../../shared/Constants.js';

// Detect controller family from gamepad.id string.
// Returns one of: 'xbox' | 'playstation' | 'switch-pro' | 'joycon-l' | 'joycon-r' | 'generic'.
function detectControllerKind(id = '') {
  const s = id.toLowerCase();
  // Nintendo USB vendor ID is 057e
  if (s.includes('057e')) {
    if (s.includes('2006') || s.includes('joy-con (l)') || s.includes('joycon (l)')) return 'joycon-l';
    if (s.includes('2007') || s.includes('joy-con (r)') || s.includes('joycon (r)')) return 'joycon-r';
    return 'switch-pro'; // 2009 = Pro Controller, also fallback for 200e charging grip
  }
  if (s.includes('pro controller') || s.includes('switch')) return 'switch-pro';
  if (s.includes('joy-con') || s.includes('joycon')) {
    return s.includes('(r)') ? 'joycon-r' : 'joycon-l';
  }
  if (s.includes('xinput') || s.includes('xbox') || s.includes('045e')) return 'xbox';
  if (s.includes('dualshock') || s.includes('dualsense') || s.includes('054c') || s.includes('playstation')) return 'playstation';
  return 'generic';
}

export class InputManager {
  constructor() {
    this.held = new Set();
    // Single keyboard map. The keyboard is treated as one device that can
    // be assigned to either player slot — there is no separate P2 keymap.
    this.maps = [DEFAULT_KEYMAP_P1];
    this.buffers = [[], []];
    this.lastFrame = [0, 0];
    this.gamepadMasks = [0, 0];
    this.gamepadConnected = [false, false];
    this.gamepadKinds = ['generic', 'generic'];
    // Per-slot per-axis "is this axis a real analog stick?" calibration.
    // An axis is marked live the first time it's observed sitting near zero.
    // Non-stick channels (IMU, gyro, parked unused axes) on some controllers
    // sit at constant extreme values like -1.0 forever and would otherwise
    // get treated as a held direction. Until an axis goes near 0 we ignore it.
    this.padAxisLive = [{}, {}];
    // Per-device -> player assignment. Each input device can be bound to
    // player 0, player 1, or -1 (unassigned). The keyboard is a single
    // P1 device by default; gamepads default to P1 / P2 so the game still
    // works out of the box. The assignment scene lets the user reshuffle.
    this.assignments = { kb1: 0, pad0: 0, pad1: 1 };
    // Per-device mask snapshots used by the assignment scene to detect
    // which physical device is pressing what.
    this._deviceCur = { kb1: 0, pad0: 0, pad1: 0 };
    this._devicePrev = { kb1: 0, pad0: 0, pad1: 0 };
    // Per-pad analog stick state. We track left/right stick raw values plus
    // the previous-frame left value so we can detect SSB-Ultimate-style
    // "stick flicks" (large per-frame deltas) which trigger smash attacks.
    // Right stick stays a held direction and is used for tilt attacks.
    this._padSticks = [
      { lx: 0, ly: 0, rx: 0, ry: 0, plx: 0, ply: 0, flickX: 0, flickY: 0, flickFrames: 0 },
      { lx: 0, ly: 0, rx: 0, ry: 0, plx: 0, ply: 0, flickX: 0, flickY: 0, flickFrames: 0 },
    ];
    // Keyboard smash buffer: holding shift while pressing direction+attack
    // forces a smash, so keyboard players can still throw smash attacks.
    this._kbSmashHeld = false;
    window.addEventListener('keydown', e => {
      this.held.add(e.code);
      if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') this._kbSmashHeld = true;
      if (e.code.startsWith('Arrow') || e.code === 'Space') e.preventDefault();
    });
    window.addEventListener('keyup', e => {
      this.held.delete(e.code);
      if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') this._kbSmashHeld = false;
    });
    window.addEventListener('blur', () => this.held.clear());
    window.addEventListener('gamepadconnected', e => {
      const idx = e.gamepad.index;
      if (idx < 2) {
        this.gamepadConnected[idx] = true;
        this.gamepadKinds[idx] = detectControllerKind(e.gamepad.id);
      }
      console.log('[input] gamepad connected slot', idx, '-', e.gamepad.id, '->', detectControllerKind(e.gamepad.id));
    });
    window.addEventListener('gamepaddisconnected', e => {
      const idx = e.gamepad.index;
      if (idx < 2) {
        this.gamepadConnected[idx] = false;
        this.gamepadKinds[idx] = 'generic';
        this.padAxisLive[idx] = {};
      }
    });
  }

  // Translate a gamepad's raw buttons into our INPUT bitmask. The mapping
  // depends on the controller kind so that physical button positions stay
  // consistent across vendors (e.g. Switch's "B" stays mapped to Jump because
  // it sits in the bottom face position).
  _maskFromPad(pad, kind, slotIdx = 0) {
    let mask = 0;
    // Switch Pro / Joy-Con sticks tend to report weak raw values and often
    // have noticeable drift, so they get a much smaller deadzone than the
    // other controller families.
    const isSwitch = kind === 'switch-pro' || kind === 'joycon-l' || kind === 'joycon-r';
    const DEAD = isSwitch ? 0.10 : 0.28;
    const LIVE_TOL = isSwitch ? 0.40 : 0.15;
    const ax = pad.axes[0] || 0, ay = pad.axes[1] || 0;
    const btn = (n) => pad.buttons[n] && pad.buttons[n].pressed;
    const standard = pad.mapping === 'standard';
    // Calibration: an axis is only treated as a directional stick after it
    // has been observed visiting near its rest range. Real sticks visit zero
    // (or close to it) the moment you let go; parked IMU / gyro / unused
    // channels sit at constant extremes forever and stay rejected. Switch
    // sticks get a wider tolerance so drifty rest positions still calibrate.
    const liveSet = this.padAxisLive[slotIdx] || (this.padAxisLive[slotIdx] = {});
    for (let i = 0; i < pad.axes.length; i++) {
      const v = pad.axes[i];
      if (typeof v === 'number' && Math.abs(v) < LIVE_TOL) liveSet[i] = true;
    }
    const isStickAxis = (i) => liveSet[i] === true;

    // Some non-standard layouts (notably Firefox + Switch Pro Controller)
    // expose the d-pad as a single "hat" axis rather than 4 buttons. The hat
    // value typically lives at axes[9] and ranges over 8 discrete positions.
    // We map any close enough value to the corresponding direction.
    const hat = (typeof pad.axes[9] === 'number') ? pad.axes[9] : null;
    const hatNear = (target) => hat !== null && Math.abs(hat - target) < 0.15;
    // Standard hat values used by Firefox: -1=up, -0.71=up-right, -0.43=right,
    // -0.14=down-right, 0.14=down, 0.43=down-left, 0.71=left, 1.0=up-left.
    if (hat !== null && hat >= -1.1 && hat <= 1.1 && Math.abs(hat) > 0.05) {
      if (hatNear(-1) || hatNear(-0.71) || hatNear(1)) mask |= INPUT.UP;
      if (hatNear(-0.43) || hatNear(-0.71) || hatNear(-0.14)) mask |= INPUT.RIGHT;
      if (hatNear(0.14) || hatNear(-0.14) || hatNear(0.43)) mask |= INPUT.DOWN;
      if (hatNear(0.71) || hatNear(0.43) || hatNear(1)) mask |= INPUT.LEFT;
    }

    if (kind === 'joycon-l' || kind === 'joycon-r') {
      // A single Joy-Con held sideways. Stick is the only directional input,
      // and only the four face buttons + SL/SR are usable. Both Joy-Cons
      // expose the same shape; we just remap which side is "forward".
      const sideX = pad.axes[0] || 0;
      const sideY = pad.axes[1] || 0;
      // When held sideways the original Y axis becomes horizontal
      if (sideY < -0.10) mask |= (kind === 'joycon-l' ? INPUT.LEFT : INPUT.RIGHT);
      if (sideY >  0.10) mask |= (kind === 'joycon-l' ? INPUT.RIGHT : INPUT.LEFT);
      if (sideX < -0.10) mask |= (kind === 'joycon-l' ? INPUT.DOWN : INPUT.UP);
      if (sideX >  0.10) mask |= (kind === 'joycon-l' ? INPUT.UP : INPUT.DOWN);
      // Face buttons in sideways layout: 4 buttons in a row.
      // L Joy-Con sideways: arrow buttons; R Joy-Con sideways: A/B/X/Y.
      if (btn(0)) mask |= INPUT.JUMP;
      if (btn(1)) mask |= INPUT.ATTACK;
      if (btn(2)) mask |= INPUT.SPECIAL;
      if (btn(3)) mask |= INPUT.GRAB;
      // SL / SR shoulders
      if (btn(4) || btn(5)) mask |= INPUT.SHIELD;
      if (btn(8) || btn(9)) mask |= INPUT.TAUNT;
      return mask;
    }

    // D-pad as buttons (standard mapping)
    if (btn(12)) mask |= INPUT.UP;
    if (btn(13)) mask |= INPUT.DOWN;
    if (btn(14)) mask |= INPUT.LEFT;
    if (btn(15)) mask |= INPUT.RIGHT;
    // Analog sticks. Different controllers / browsers report sticks at
    // different axis indices: most are 0/1 (left) and 2/3 (right), but some
    // Switch Pro builds expose IMU/gyro on the lower indices and the actual
    // sticks at 4/5 or 6/7. We scan every adjacent (X,Y) pair, but only use
    // axes that calibration has marked "live" (have visited near zero), so
    // we don't pick up parked non-stick channels.
    for (let aIdx = 0; aIdx + 1 < pad.axes.length && aIdx < 10; aIdx += 2) {
      if (aIdx === 8) continue; // axes[8]/[9] is the d-pad hat on some layouts
      if (!isStickAxis(aIdx) || !isStickAxis(aIdx + 1)) continue;
      const x = pad.axes[aIdx] || 0;
      const y = pad.axes[aIdx + 1] || 0;
      if (x < -DEAD) mask |= INPUT.LEFT;
      if (x >  DEAD) mask |= INPUT.RIGHT;
      if (y < -DEAD) mask |= INPUT.UP;
      if (y >  DEAD) mask |= INPUT.DOWN;
    }

    if (kind === 'switch-pro' && !standard) {
      // Firefox / non-standard layout for Switch Pro Controller.
      // Reported order observed: 0=B, 1=A, 2=Y, 3=X, 4=L, 5=R, 6=ZL, 7=ZR,
      // 8=Minus, 9=Plus, 10=LStick, 11=RStick, 12=Home, 13=Capture
      if (btn(0)) mask |= INPUT.JUMP;     // Switch B (bottom)
      if (btn(2)) mask |= INPUT.ATTACK;   // Switch Y (left)
      if (btn(3)) mask |= INPUT.SPECIAL;  // Switch X (top)
      if (btn(1)) mask |= INPUT.GRAB;     // Switch A (right)
      if (btn(5) || btn(7)) mask |= INPUT.SHIELD; // R or ZR
      if (btn(4) || btn(6)) mask |= INPUT.SHIELD; // L or ZL also = shield (frees Domain combo)
      if (btn(8)) mask |= INPUT.TAUNT;    // Minus
      return mask;
    }

    // Capture left + right stick raw values. For non-Switch controllers we
    // trust the standard layout: axes[0,1] = left stick, axes[2,3] = right
    // stick. Switch Pro / Joy-Cons sometimes expose IMU/gyro on those axes
    // so they fall back to the live-pair scanner.
    {
      const ss = this._padSticks[slotIdx] || (this._padSticks[slotIdx] = { lx: 0, ly: 0, rx: 0, ry: 0, plx: 0, ply: 0, lxRest: 0, lyRest: 0, lxRestFrames: 0, lyRestFrames: 0, flickX: 0, flickY: 0, flickFrames: 0 });
      ss.plx = ss.lx; ss.ply = ss.ly;
      if (isSwitch) {
        // Live-pair scanner (handles IMU/gyro on lower axis indices).
        let foundLeft = false, foundRight = false;
        for (let aIdx = 0; aIdx + 1 < pad.axes.length && aIdx < 10; aIdx += 2) {
          if (aIdx === 8) continue;
          if (!isStickAxis(aIdx) || !isStickAxis(aIdx + 1)) continue;
          const x = pad.axes[aIdx] || 0;
          const y = pad.axes[aIdx + 1] || 0;
          if (!foundLeft) { ss.lx = x; ss.ly = y; foundLeft = true; }
          else if (!foundRight) { ss.rx = x; ss.ry = y; foundRight = true; break; }
        }
        if (!foundLeft) { ss.lx = 0; ss.ly = 0; }
        if (!foundRight) { ss.rx = 0; ss.ry = 0; }
      } else {
        // Standard layout — direct indices, no calibration needed so the
        // right stick on Xbox/PS works the moment a controller connects.
        ss.lx = pad.axes[0] || 0;
        ss.ly = pad.axes[1] || 0;
        ss.rx = pad.axes[2] || 0;
        ss.ry = pad.axes[3] || 0;
      }
      // Smash flick: detect a rising edge where the left stick crosses from
      // near-rest to a strong direction within a short window. Triggers in
      // both axes / both signs equally.
      const FLICK_HI = 0.65;
      const FLICK_LO = 0.30;
      if (Math.abs(ss.lx) < FLICK_LO) ss.lxRestFrames = 4;
      else if (ss.lxRestFrames > 0) ss.lxRestFrames--;
      if (Math.abs(ss.ly) < FLICK_LO) ss.lyRestFrames = 4;
      else if (ss.lyRestFrames > 0) ss.lyRestFrames--;
      // Rising edge: stick was at rest within the last 4 frames AND is now
      // past the high threshold AND moved by a meaningful per-frame delta.
      const dx = ss.lx - ss.plx, dy = ss.ly - ss.ply;
      if (Math.abs(ss.lx) > FLICK_HI && ss.lxRestFrames > 0 && Math.abs(dx) > 0.25) {
        ss.flickX = ss.lx > 0 ? 1 : -1;
        ss.flickFrames = 8;
        ss.lxRestFrames = 0;
      }
      if (Math.abs(ss.ly) > FLICK_HI && ss.lyRestFrames > 0 && Math.abs(dy) > 0.25) {
        ss.flickY = ss.ly > 0 ? 1 : -1;
        ss.flickFrames = 8;
        ss.lyRestFrames = 0;
      }
      if (ss.flickFrames > 0) ss.flickFrames--;
      else { ss.flickX = 0; ss.flickY = 0; }
    }

    // Standard mapping for Xbox / PS / Switch Pro (Chrome) / generic.
    // Position-based: button 0 is always the bottom face button regardless
    // of label (A on Xbox, Cross on PS, B on Switch).
    if (btn(0)) mask |= INPUT.JUMP;     // bottom face
    if (btn(2)) mask |= INPUT.ATTACK;   // left face
    if (btn(3)) mask |= INPUT.SPECIAL;  // top face
    if (btn(1)) mask |= INPUT.GRAB;     // right face
    if (btn(5) || btn(7)) mask |= INPUT.SHIELD; // RB / R1 / R / RT / R2 / ZR
    if (btn(4) || btn(6)) mask |= INPUT.SHIELD; // LB / LT also fires shield
    if (btn(8) || btn(9)) mask |= INPUT.TAUNT;
    return mask;
  }

  pollGamepads() {
    if (!navigator.getGamepads) return;
    const pads = navigator.getGamepads();
    let slot = 0;
    for (let i = 0; i < pads.length && slot < 2; i++) {
      const pad = pads[i];
      if (!pad) continue;
      // Lazily detect kind in case the connect event was missed.
      if (this.gamepadKinds[slot] === 'generic') {
        this.gamepadKinds[slot] = detectControllerKind(pad.id);
      }
      this.gamepadMasks[slot] = this._maskFromPad(pad, this.gamepadKinds[slot], slot);
      this.gamepadConnected[slot] = true;
      slot++;
    }
    for (; slot < 2; slot++) {
      this.gamepadMasks[slot] = 0;
      this.gamepadConnected[slot] = false;
    }
  }

  // Compute the raw mask for a single physical device, ignoring assignment.
  _maskForDevice(key) {
    if (key === 'kb1') {
      const map = this.maps[0];
      let m = 0;
      for (const code in map) if (this.held.has(code)) m |= map[code];
      return m;
    }
    if (key === 'pad0') return this.gamepadMasks[0] || 0;
    if (key === 'pad1') return this.gamepadMasks[1] || 0;
    return 0;
  }

  // Build a bitmask of inputs for the given player by OR'ing every device
  // currently assigned to that player. Devices with assignment === -1 are
  // ignored entirely.
  snapshot(playerIndex) {
    let mask = 0;
    if (this.assignments.kb1 === playerIndex) mask |= this._maskForDevice('kb1');
    if (this.assignments.pad0 === playerIndex) mask |= this._maskForDevice('pad0');
    if (this.assignments.pad1 === playerIndex) mask |= this._maskForDevice('pad1');
    return mask;
  }

  // Per-device assignment helpers consumed by the player-assignment scene.
  setAssignment(deviceKey, playerIndex) {
    if (deviceKey in this.assignments) this.assignments[deviceKey] = playerIndex;
  }
  getAssignment(deviceKey) { return this.assignments[deviceKey]; }
  // True the frame `code` is freshly pressed on `deviceKey` (edge-triggered).
  devicePressed(deviceKey, code) {
    const cur = this._deviceCur[deviceKey] || 0;
    const prev = this._devicePrev[deviceKey] || 0;
    return (cur & code) !== 0 && (prev & code) === 0;
  }
  deviceMask(deviceKey) { return this._deviceCur[deviceKey] || 0; }

  tick() {
    this.pollGamepads();
    // Snapshot per-device masks for edge detection in the assignment scene.
    this._devicePrev = { ...this._deviceCur };
    this._deviceCur.kb1 = this._maskForDevice('kb1');
    this._deviceCur.pad0 = this._maskForDevice('pad0');
    this._deviceCur.pad1 = this._maskForDevice('pad1');
    for (let i = 0; i < 2; i++) {
      const mask = this.snapshot(i);
      this.buffers[i].push(mask);
      if (this.buffers[i].length > CONSTANTS.INPUT_BUFFER) this.buffers[i].shift();
      this.lastFrame[i] = mask;
    }
  }

  // Snapshot of every connected gamepad for the on-screen diagnostic overlay.
  // Returns one entry per slot with id/kind/axes/pressed buttons/mask.
  diagnostics() {
    const out = [];
    if (!navigator.getGamepads) return out;
    const pads = navigator.getGamepads();
    let slot = 0;
    for (let i = 0; i < pads.length && slot < 2; i++) {
      const pad = pads[i];
      if (!pad) continue;
      const pressed = [];
      for (let b = 0; b < pad.buttons.length; b++) {
        if (pad.buttons[b] && pad.buttons[b].pressed) pressed.push(b);
      }
      const liveSet = this.padAxisLive[slot] || {};
      const liveAxes = Object.keys(liveSet).map(k => +k).sort((a, b) => a - b);
      out.push({
        slot,
        id: pad.id,
        kind: this.gamepadKinds[slot],
        mapping: pad.mapping || 'non-standard',
        axes: Array.from(pad.axes).map(v => Math.round(v * 100) / 100),
        liveAxes,
        pressed,
        mask: this.gamepadMasks[slot] || 0,
      });
      slot++;
    }
    return out;
  }

  // Right-stick tilt direction for player p, or 0 if not engaged.
  // Returned as { x: -1|0|1, y: -1|0|1 }. Used by Fighter for tilt attacks.
  tiltDir(p) {
    let x = 0, y = 0;
    const TH = 0.45;
    for (let slot = 0; slot < 2; slot++) {
      if (this.assignments['pad' + slot] !== p) continue;
      const ss = this._padSticks[slot]; if (!ss) continue;
      if (ss.rx < -TH) x = -1; else if (ss.rx > TH) x = 1;
      if (ss.ry < -TH) y = -1; else if (ss.ry > TH) y = 1;
      if (x || y) break;
    }
    return { x, y };
  }
  // Smash direction triggered by a stick-flick on the left stick this frame.
  // Returns { x, y } direction with the latched flick, or 0/0 if none. The
  // flick has a short window (set in _maskFromPad) so the player can press
  // attack right after the flick to throw a smash.
  smashFlick(p) {
    let x = 0, y = 0;
    for (let slot = 0; slot < 2; slot++) {
      if (this.assignments['pad' + slot] !== p) continue;
      const ss = this._padSticks[slot]; if (!ss) continue;
      if (ss.flickFrames > 0) {
        if (ss.flickX) x = ss.flickX;
        if (ss.flickY) y = ss.flickY;
        if (x || y) break;
      }
    }
    // Keyboard players hold Shift for "smash modifier"
    if (!x && !y && this.assignments.kb1 === p && this._kbSmashHeld) {
      const m = this._maskForDevice('kb1');
      if (m & INPUT.LEFT) x = -1;
      else if (m & INPUT.RIGHT) x = 1;
      if (m & INPUT.UP) y = -1;
      else if (m & INPUT.DOWN) y = 1;
    }
    return { x, y };
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
