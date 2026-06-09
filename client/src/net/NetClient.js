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
    this.lastRemoteMask = 0;  // most recent opponent input we have seen
    this.onLobby = () => {};
    this.onStart = () => {};
    this.onError = () => {};
    // Character / stage / match handshake callbacks. Default to no-ops so
    // the client can install only the ones it cares about.
    this.onCharCursor = () => {};
    this.onCharLock = () => {};
    this.onStageCursor = () => {};
    this.onProceedToStage = () => {};
    this.onStartMatch = () => {};
    this.onOpponentLeft = () => {};
    this.onStateSync = () => {};
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
  sendCharCursor(index) { this._send({ type: 'char_cursor', index }); }
  sendCharLock(locked, selection) { this._send({ type: 'char_lock', locked, selection }); }
  sendStageCursor(index) { this._send({ type: 'stage_cursor', index }); }
  sendProceedToStage() { this._send({ type: 'proceed_to_stage' }); }
  sendStartMatch(stage, selections) { this._send({ type: 'start_match', stage, selections }); }
  sendStateSync(tick, state) { this._send({ type: 'state_sync', tick, state }); }
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
        this.remoteInputs[msg.tick] = msg.mask;
        this.lastRemoteMask = msg.mask;
        break;
      case 'char_cursor':  this.onCharCursor(msg); break;
      case 'char_lock':    this.onCharLock(msg); break;
      case 'stage_cursor': this.onStageCursor(msg); break;
      case 'proceed_to_stage': this.onProceedToStage(msg); break;
      case 'start_match':  this.onStartMatch(msg); break;
      case 'opponent_left': this.onOpponentLeft(msg); break;
      case 'state_sync': this.onStateSync(msg); break;
      case 'error':
        this.onError(msg); break;
    }
  }
  remoteInputAt(tick) {
    // returns mask if available, else null (caller must input-delay/predict)
    return this.remoteInputs[tick] != null ? this.remoteInputs[tick] : null;
  }
}
