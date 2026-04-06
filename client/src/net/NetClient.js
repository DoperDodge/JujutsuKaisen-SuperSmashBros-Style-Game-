// WebSocket client. Sends our inputs each tick and receives opponent inputs.
// Pairs with server/index.js. Local play does not use this.

export class NetClient {
  constructor(url) {
    this.url = url;
    this.ws = null;
    this.connected = false;
    this.roomCode = null;
    this.localSlot = 0;       // 0 or 1
    this.remoteInputs = {};   // tick -> input mask
    this.onLobby = () => {};
    this.onStart = () => {};
    this.onError = () => {};
  }
  connect() {
    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(this.url);
      } catch (e) { reject(e); return; }
      this.ws.addEventListener('open', () => { this.connected = true; resolve(); });
      this.ws.addEventListener('close', () => { this.connected = false; });
      this.ws.addEventListener('error', e => { this.onError(e); });
      this.ws.addEventListener('message', e => this._onMessage(e));
    });
  }
  _send(obj) { if (this.connected) this.ws.send(JSON.stringify(obj)); }
  createRoom() { this._send({ type: 'create_room' }); }
  joinRoom(code) { this._send({ type: 'join_room', code }); }
  sendInput(tick, mask) { this._send({ type: 'input', tick, mask }); }
  _onMessage(e) {
    let msg; try { msg = JSON.parse(e.data); } catch { return; }
    switch (msg.type) {
      case 'room_created':
        this.roomCode = msg.code; this.localSlot = 0; this.onLobby(msg); break;
      case 'room_joined':
        this.roomCode = msg.code; this.localSlot = msg.slot; this.onLobby(msg); break;
      case 'start':
        this.onStart(msg); break;
      case 'input':
        this.remoteInputs[msg.tick] = msg.mask; break;
      case 'error':
        this.onError(msg); break;
    }
  }
  remoteInputAt(tick) {
    // returns mask if available, else null (caller must input-delay/predict)
    return this.remoteInputs[tick] != null ? this.remoteInputs[tick] : null;
  }
}
