// Express + WebSocket relay server for JJK: Domain Clash multiplayer.
// Hosts the static client and forwards inputs between two players in a room.

const express = require('express');
const http = require('http');
const path = require('path');
const { WebSocketServer } = require('ws');
const { GameRoom } = require('./GameRoom.js');
const { Matchmaking } = require('./Matchmaking.js');

const app = express();
const server = http.createServer(app);

// Static client
app.use('/src', express.static(path.join(__dirname, '..', 'client', 'src')));
app.use('/shared', express.static(path.join(__dirname, '..', 'shared')));
app.use(express.static(path.join(__dirname, '..', 'client', 'public')));
app.get('/health', (req, res) => res.json({ ok: true, rooms: rooms.size }));

const wss = new WebSocketServer({ server });
const rooms = new Map();
const matchmaker = new Matchmaking(rooms);

function newRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  do {
    code = '';
    for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  } while (rooms.has(code));
  return code;
}

wss.on('connection', (ws) => {
  ws.id = Math.random().toString(36).slice(2, 10);
  ws.room = null;
  ws.slot = -1;

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw.toString()); } catch { return; }
    switch (msg.type) {
      case 'create_room': {
        const code = newRoomCode();
        const room = new GameRoom(code);
        room.addPlayer(ws);
        rooms.set(code, room);
        ws.send(JSON.stringify({ type: 'room_created', code, slot: 0 }));
        break;
      }
      case 'join_room': {
        const room = rooms.get((msg.code || '').toUpperCase());
        if (!room) {
          ws.send(JSON.stringify({ type: 'error', message: 'Room not found' }));
          return;
        }
        if (room.players.length >= 2) {
          ws.send(JSON.stringify({ type: 'error', message: 'Room full' }));
          return;
        }
        room.addPlayer(ws);
        ws.send(JSON.stringify({ type: 'room_joined', code: room.code, slot: 1 }));
        // Tell both players to start
        room.broadcast({ type: 'start', tick: 0 });
        break;
      }
      case 'input': {
        if (!ws.room) return;
        const room = rooms.get(ws.room);
        if (!room) return;
        room.recordInput(ws.slot, msg.tick, msg.mask);
        room.broadcastExcept(ws, { type: 'input', slot: ws.slot, tick: msg.tick, mask: msg.mask });
        break;
      }
      case 'state_sync': {
        // Reserved for periodic checksum validation (anti-cheat)
        break;
      }
      case 'queue': {
        matchmaker.enqueue(ws);
        break;
      }
    }
  });

  ws.on('close', () => {
    if (ws.room) {
      const room = rooms.get(ws.room);
      if (room) {
        room.removePlayer(ws);
        room.broadcast({ type: 'opponent_left' });
        // 10s grace before deleting
        setTimeout(() => {
          if (room.players.length === 0) rooms.delete(room.code);
        }, 10000);
      }
    }
  });
});

const port = process.env.PORT || 3000;
server.listen(port, () => {
  console.log(`JJK Domain Clash server running on :${port}`);
});
