// 60fps fixed-timestep game loop with interpolation, exactly matching the
// pseudocode in JJK_SMASH_GAME_PLAN.md section 2.2.

import { TARGET_FRAME_TIME } from '../../../shared/Constants.js';

export class GameLoop {
  constructor(update, render) {
    this.update = update;       // (tick) => void
    this.render = render;       // (interpolation) => void
    this.tick = 0;
    this.lastTime = 0;
    this.accumulator = 0;
    this.running = false;
    this._loop = this._loop.bind(this);
    this.maxAccumulator = TARGET_FRAME_TIME * 5; // anti-spiral-of-death cap
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.lastTime = performance.now();
    requestAnimationFrame(this._loop);
  }

  stop() { this.running = false; }

  _loop(now) {
    if (!this.running) return;
    const delta = now - this.lastTime;
    this.lastTime = now;
    this.accumulator += delta;
    if (this.accumulator > this.maxAccumulator) this.accumulator = this.maxAccumulator;

    while (this.accumulator >= TARGET_FRAME_TIME) {
      this.update(this.tick);
      this.accumulator -= TARGET_FRAME_TIME;
      this.tick++;
    }

    const interpolation = this.accumulator / TARGET_FRAME_TIME;
    this.render(interpolation);
    requestAnimationFrame(this._loop);
  }
}
