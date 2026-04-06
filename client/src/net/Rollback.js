// Rollback netcode helper. 3-frame baseline input delay, max 8 frame rollback.
// Stores periodic state snapshots and resimulates when a late input is corrected.

export class Rollback {
  constructor(opts) {
    this.delay = opts.delay ?? 3;
    this.maxRollback = opts.maxRollback ?? 8;
    this.snapshots = [];           // {tick, state}
    this.confirmed = -1;           // last tick where we have full inputs
    this.localInputs = {};
    this.remoteInputs = {};
  }
  pushSnapshot(tick, state) {
    this.snapshots.push({ tick, state });
    while (this.snapshots.length > this.maxRollback + 2) this.snapshots.shift();
  }
  setLocalInput(tick, mask) { this.localInputs[tick] = mask; }
  setRemoteInput(tick, mask) {
    this.remoteInputs[tick] = mask;
    if (tick > this.confirmed && this.localInputs[tick] != null) this.confirmed = tick;
  }
  // Predict remote input as last known
  predictedRemote(tick) {
    if (this.remoteInputs[tick] != null) return this.remoteInputs[tick];
    let t = tick;
    while (t >= 0) { if (this.remoteInputs[t] != null) return this.remoteInputs[t]; t--; }
    return 0;
  }
  // Find earliest snapshot to roll back to
  rollbackTarget(needTick) {
    for (let i = this.snapshots.length - 1; i >= 0; i--) {
      if (this.snapshots[i].tick <= needTick) return this.snapshots[i];
    }
    return this.snapshots[0];
  }
}
