// Server-authoritative state validator. The full game runs client-side, but the
// server periodically receives state checksums from each client to detect
// desyncs or tampering. This is a stub that records and compares the checksums.

class AuthoritativeState {
  constructor() { this.snapshots = new Map(); /* tick -> {slot0, slot1} */ }

  record(tick, slot, checksum) {
    let s = this.snapshots.get(tick);
    if (!s) { s = {}; this.snapshots.set(tick, s); }
    s[slot] = checksum;
    if (s[0] != null && s[1] != null) {
      const ok = s[0] === s[1];
      this.snapshots.delete(tick);
      return ok;
    }
    return null;
  }

  prune(beforeTick) {
    for (const t of this.snapshots.keys()) {
      if (t < beforeTick) this.snapshots.delete(t);
    }
  }
}

module.exports = { AuthoritativeState };
