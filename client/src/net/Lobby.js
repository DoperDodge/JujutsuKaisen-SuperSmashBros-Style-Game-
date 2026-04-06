// Lobby UI helper. Wires the #lobby HTML element to a NetClient instance.

export function bindLobby(net, onReady) {
  const el = document.getElementById('lobby');
  const status = document.getElementById('lobby-status');
  document.getElementById('btn-create').onclick = () => {
    net.createRoom();
    status.textContent = 'Creating room...';
  };
  document.getElementById('btn-join').onclick = () => {
    const code = document.getElementById('room-code').value.trim().toUpperCase();
    if (code.length === 6) { net.joinRoom(code); status.textContent = 'Joining ' + code; }
  };
  document.getElementById('btn-close').onclick = () => { el.style.display = 'none'; };
  net.onLobby = (msg) => {
    status.textContent = `Room ${msg.code} — slot ${net.localSlot + 1}. Waiting for opponent...`;
  };
  net.onStart = (msg) => {
    el.style.display = 'none';
    onReady && onReady(msg);
  };
  net.onError = (e) => { status.textContent = 'Error: ' + (e.message || 'connection failed'); };

  return {
    show() { el.style.display = 'block'; },
    hide() { el.style.display = 'none'; },
  };
}
