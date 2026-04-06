// Simple FIFO queue matchmaker. Pops two waiting players and joins them into a room.

const { GameRoom } = require('./GameRoom.js');

class Matchmaking {
  constructor(rooms) {
    this.rooms = rooms;
    this.queue = [];
  }
  enqueue(ws) {
    if (this.queue.includes(ws)) return;
    this.queue.push(ws);
    this._tryMatch();
  }
  _tryMatch() {
    while (this.queue.length >= 2) {
      const a = this.queue.shift();
      const b = this.queue.shift();
      if (a.readyState !== 1 || b.readyState !== 1) continue;
      const code = 'M' + Math.random().toString(36).slice(2, 7).toUpperCase();
      const room = new GameRoom(code);
      room.addPlayer(a); room.addPlayer(b);
      this.rooms.set(code, room);
      a.send(JSON.stringify({ type: 'room_joined', code, slot: 0 }));
      b.send(JSON.stringify({ type: 'room_joined', code, slot: 1 }));
      room.broadcast({ type: 'start', tick: 0 });
    }
  }
}

module.exports = { Matchmaking };
