// Server-side game room. Tracks two players and forwards inputs.

class GameRoom {
  constructor(code) {
    this.code = code;
    this.players = [];
    this.inputs = [{}, {}]; // tick -> mask per slot
    this.tick = 0;
  }
  addPlayer(ws) {
    ws.room = this.code;
    ws.slot = this.players.length;
    this.players.push(ws);
  }
  removePlayer(ws) {
    this.players = this.players.filter(p => p !== ws);
  }
  recordInput(slot, tick, mask) {
    if (slot < 0 || slot > 1) return;
    this.inputs[slot][tick] = mask;
  }
  broadcast(obj) {
    const msg = JSON.stringify(obj);
    for (const p of this.players) {
      if (p.readyState === 1) p.send(msg);
    }
  }
  broadcastExcept(ws, obj) {
    const msg = JSON.stringify(obj);
    for (const p of this.players) {
      if (p !== ws && p.readyState === 1) p.send(msg);
    }
  }
}

module.exports = { GameRoom };
