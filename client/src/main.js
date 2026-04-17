// Entry point. Bootstraps the 60fps loop, scenes, and the local game world.
// Scenes: TITLE -> MODE_SELECT -> [PLAYER_SELECT for local | LOBBY for online]
//         -> CHAR_SELECT -> STAGE_SELECT -> MATCH -> RESULT.

import { GameLoop } from './engine/GameLoop.js';
import { InputManager } from './engine/InputManager.js';
import { Camera } from './engine/Camera.js';
import { ParticleSystem } from './engine/ParticleSystem.js';
import { Renderer } from './rendering/Renderer.js';
import { UIRenderer } from './rendering/UIRenderer.js';
import { DomainRenderer } from './rendering/DomainRenderer.js';
import { SpriteSheet } from './rendering/SpriteSheet.js';
import { SpriteManifest } from './rendering/SpriteManifest.js';
import { GojoFighter } from './fighters/Gojo.js';
import { YujiSukunaFighter } from './fighters/YujiSukuna.js';
import { MahitoFighter } from './fighters/Mahito.js';
import { TodoFighter } from './fighters/Todo.js';
import { JujutsuHigh } from './stages/JujutsuHigh.js';
import { Shibuya } from './stages/Shibuya.js';
import { Shinjuku } from './stages/ShibuyaStation.js';
import { ROSTER, FIGHTER_STATS } from '../../shared/FighterData.js';
import { INPUT } from '../../shared/InputCodes.js';
import { NetClient } from './net/NetClient.js';
import { ProjectileSystem } from './engine/ProjectileSystem.js';

const canvas = document.getElementById('game');
const renderer = new Renderer(canvas);
const ui = new UIRenderer(canvas);
const domainRenderer = new DomainRenderer(canvas);
const camera = new Camera(canvas.width, canvas.height);
const particles = new ParticleSystem();
const input = new InputManager();
const sprites = new SpriteSheet();
sprites.build();
// Optional external spritesheet. If /assets/characters.png + characters.json
// exist, frames from the manifest override the procedural art per-character.
// Any missing animation or character silently falls back to procedural.
const spriteManifest = new SpriteManifest();
spriteManifest.load('assets/characters.json', 'assets/characters.png')
  .then(ok => {
    if (ok) console.log('[sprites] manifest loaded');
    else console.log('[sprites] manifest not found, using procedural art');
  });
// Monotonic frame tick used by the manifest renderer to advance animations.
let spriteFrameTick = 0;
// Wrapper: try the manifest first, fall back to the procedural atlas. Called
// everywhere the old `sprites.draw(...)` was called.
function drawSprite(ctx, character, anim, x, y, facing = 1, scale = 1) {
  if (spriteManifest.ready && spriteManifest.hasCharacter(character)) {
    if (spriteManifest.draw(ctx, character, anim, x, y, facing, spriteFrameTick, scale)) return;
  }
  sprites.draw(ctx, character, anim, x, y, facing, scale);
}

// ===== Explicit per-control labels (for menus & overlays) =====
// Controllers are mapped by physical button position so the same logical
// action lives on the same place regardless of vendor labels.
const KEYBINDS = {
  kb: { move: 'WASD', attack: 'J', special: 'K', jump: 'Space', shield: 'L', grab: ';', taunt: 'T' },
  pad: {
    move: 'L-stick / D-pad',
    attack: 'Xbox X  /  PS Square  /  Switch Y',
    special: 'Xbox Y  /  PS Triangle  /  Switch X',
    jump: 'Xbox A  /  PS Cross  /  Switch B',
    grab: 'Xbox B  /  PS Circle  /  Switch A',
    shield: 'R Shoulder (RB / R1 / R)',
    domain: 'L + R + Special + Attack',
  },
};

const FIGHTER_CLASSES = {
  gojo: GojoFighter,
  yuji: YujiSukunaFighter,
  mahito: MahitoFighter,
  todo: TodoFighter,
};
const STAGES = [JujutsuHigh, Shibuya, Shinjuku];
const STAGE_NAMES = ['Tokyo Jujutsu High', 'Shibuya Underground Station', 'Shinjuku Showdown'];

// ===== Scenes =====
const SCENE = { TITLE: 0, MODE_SELECT: 1, LOBBY: 2, PLAYER_SELECT: 3, CHAR_SELECT: 4, STAGE_SELECT: 5, MATCH: 6, RESULT: 7 };
let scene = SCENE.TITLE;
let menuTick = 0;
let charSelections = [0, 1];
let charCursor = [0, 1];
let charLocked = [false, false];
let stageCursor = 0;
let modeCursor = 0;        // 0 = local, 1 = host online, 2 = join online
let lobbyMode = 'idle';    // 'idle' | 'host' | 'join'
let lobbyCode = '';
let lobbyJoinInput = '';
let lobbyStatus = 'Local versus mode — no server needed.';
let world = null;
let resultText = '';
// True once the player commits to host/join. Gates all the online
// handshake logic in char/stage select and routes match inputs through
// the WebSocket relay.
let isOnline = false;

// ===== Online =====
const wsProto = location.protocol === 'https:' ? 'wss:' : 'ws:';
const net = new NetClient(`${wsProto}//${location.host}`);
let netReady = false;
net.onLobby = (msg) => {
  lobbyCode = msg.code;
  lobbyStatus = `Room ${msg.code} ready. Slot ${net.localSlot + 1}. Waiting for opponent...`;
};
net.onStart = () => {
  lobbyStatus = `Match starting!`;
  // Reset char-select state so both sides enter from a clean slate.
  charCursor = [0, 1];
  charSelections = [0, 1];
  charLocked = [false, false];
  stageCursor = 0;
  scene = SCENE.CHAR_SELECT;
};
net.onError = (e) => { lobbyStatus = 'Error: ' + (e.message || 'connection failed'); };

// Remote peer moved their character cursor — mirror it locally so both
// clients show the same selection state.
net.onCharCursor = (msg) => {
  const slot = msg.slot;
  if (slot === net.localSlot) return;
  if (!charLocked[slot]) charCursor[slot] = msg.index;
};
net.onCharLock = (msg) => {
  const slot = msg.slot;
  if (slot === net.localSlot) return;
  charLocked[slot] = !!msg.locked;
  if (msg.locked) {
    charSelections[slot] = msg.selection;
    charCursor[slot] = msg.selection;
  }
};
net.onStageCursor = (msg) => {
  if (msg.slot === net.localSlot) return;
  stageCursor = msg.index;
};
net.onProceedToStage = () => {
  if (scene === SCENE.CHAR_SELECT) scene = SCENE.STAGE_SELECT;
};
net.onStartMatch = (msg) => {
  if (Array.isArray(msg.selections) && msg.selections.length === 2) {
    charSelections = [msg.selections[0], msg.selections[1]];
  }
  stageCursor = msg.stage | 0;
  world = createWorld(stageCursor);
  scene = SCENE.MATCH;
};
net.onOpponentLeft = () => {
  lobbyStatus = 'Opponent disconnected.';
  isOnline = false;
  scene = SCENE.TITLE;
};
net.connect().then(() => { netReady = true; }).catch(() => { netReady = false; });

// ===== World factory =====
function createWorld(stageIndex) {
  const stage = new (STAGES[stageIndex])();
  const fighters = [];
  for (let i = 0; i < 2; i++) {
    const Cls = FIGHTER_CLASSES[ROSTER[charSelections[i]]];
    const sp = stage.spawnPoints[i];
    const f = new Cls({
      playerIndex: i, x: sp.x, y: sp.y,
      facing: i === 0 ? 1 : -1,
    });
    fighters.push(f);
  }
  const w = {
    stage, fighters, particles, camera, input,
    projectiles: new ProjectileSystem(),
    tick: 0,
    timer: 60 * 60 * 7,
    activeDomain: null,
    domainCinematic: null,
    finished: false,
    onKO(f) {},
    startDomain(owner) {
      const Cls = owner.domainClass;
      if (!Cls) return;
      const dom = new Cls(owner);
      this.activeDomain = dom;
      this.domainCinematic = { tick: 0, name: dom.name, color: FIGHTER_STATS[owner.character].palette.accent };
      dom.onActivate(this);
    },
  };
  for (const f of fighters) f.init(w);
  return w;
}

// ===== Update / Render Match =====
function updateMatch() {
  world.tick++;
  spriteFrameTick++;
  if (world.timer > 0) world.timer--;

  input.tick();
  let masks;
  if (isOnline) {
    // In online mode the local user drives whichever slot the server
    // assigned them, regardless of which player index their keyboard /
    // gamepad happens to be bound to. We collapse every local device
    // into one mask and pull the opponent's slot from the relay.
    const localMask =
      input.deviceMask('kb1') | input.deviceMask('pad0') | input.deviceMask('pad1');
    net.sendInput(world.tick, localMask);
    const remoteMask = net.lastRemoteMask || 0;
    masks = net.localSlot === 0 ? [localMask, remoteMask] : [remoteMask, localMask];
  } else {
    masks = [input.current(0), input.current(1)];
  }

  for (let i = 0; i < world.fighters.length; i++) {
    const f = world.fighters[i];
    f.tick(masks[i], world);
    f.setPrevInput(masks[i]);
  }

  if (world.activeDomain) {
    world.activeDomain.update(world);
    if (!world.activeDomain.active) world.activeDomain = null;
  }
  if (world.domainCinematic) {
    world.domainCinematic.tick++;
    if (world.domainCinematic.tick > 60) world.domainCinematic = null;
  }

  world.projectiles.update(world);
  world.stage.update(world);
  particles.update();
  camera.follow(world.fighters.filter(f => !f.ko));

  if (!world.finished) {
    const lost = world.fighters.filter(f => f.stocks <= 0 && f.ko);
    if (lost.length >= 1) {
      const winner = world.fighters.find(f => f.stocks > 0);
      if (winner && lost.length === world.fighters.length - 1) {
        world.finished = true;
        resultText = `${winner.displayName} WINS`;
        setTimeout(() => { scene = SCENE.RESULT; }, 1500);
      }
    }
    if (world.timer <= 0) {
      world.finished = true;
      const sorted = [...world.fighters].sort((a, b) => b.stocks - a.stocks || a.percent - b.percent);
      resultText = `${sorted[0].displayName} WINS (Time)`;
      setTimeout(() => { scene = SCENE.RESULT; }, 1500);
    }
  }
}

function renderMatch() {
  renderer.clear();
  camera.apply(renderer.ctx);
  renderer.drawStage(world.stage);
  world.stage.render(renderer.ctx, world);
  if (world.activeDomain) world.activeDomain.render(renderer.ctx, world);
  world.projectiles.render(renderer.ctx);

  for (const f of world.fighters) {
    if (f.shielding) {
      renderer.ctx.strokeStyle = '#5fd7ff';
      renderer.ctx.globalAlpha = 0.5 + (f.shieldHP / 100) * 0.5;
      renderer.ctx.beginPath();
      renderer.ctx.arc(f.x, f.y - f.height / 2, 56, 0, Math.PI * 2);
      renderer.ctx.stroke();
      renderer.ctx.globalAlpha = 1;
    }
    drawSprite(renderer.ctx, f.character, f.anim, f.x, f.y, f.facing);
    if (f.passiveInfinity && f.ce > f.ceMax * 0.25) {
      // Render Infinity field as a layered, shimmering sphere sized to the
      // character. Two animated rings + a translucent fill so it actually
      // reads on screen instead of looking like a tiny outline.
      const ctx = renderer.ctx;
      const cx = f.x, cy = f.y - f.height / 2;
      // Sphere radius hugs the full character bounding box plus some buffer.
      const baseR = Math.max(f.width, f.height) * 0.95;
      const t = ((world.tick || 0) % 120) / 120;
      const pulse = 1 + Math.sin((world.tick || 0) * 0.12) * 0.05;
      const r = baseR * pulse;
      // Soft fill
      const grad = ctx.createRadialGradient(cx, cy, r * 0.2, cx, cy, r);
      grad.addColorStop(0, 'rgba(180,220,255,0.05)');
      grad.addColorStop(0.7, 'rgba(95,215,255,0.15)');
      grad.addColorStop(1, 'rgba(24,80,176,0.0)');
      ctx.fillStyle = grad;
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
      // Bright outer ring
      ctx.strokeStyle = 'rgba(95,215,255,0.55)';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
      // Spinning inner ring (dashed)
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(t * Math.PI * 2);
      ctx.strokeStyle = 'rgba(232,246,255,0.7)';
      ctx.lineWidth = 1;
      ctx.setLineDash([6, 8]);
      ctx.beginPath(); ctx.arc(0, 0, r * 0.78, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
      // Counter-spinning ring
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(-t * Math.PI * 2 * 1.5);
      ctx.strokeStyle = 'rgba(140,180,255,0.4)';
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 10]);
      ctx.beginPath(); ctx.arc(0, 0, r * 0.6, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
    }
    if (f.soulCorruption > 0) {
      renderer.ctx.fillStyle = '#9aff7a';
      for (let s = 0; s < f.soulCorruption; s++) {
        renderer.ctx.fillRect(f.x - 16 + s * 7, f.y - f.height - 18, 5, 5);
      }
    }
    if (f.invulnFrames > 0 && f.invulnFrames % 6 < 3) {
      renderer.ctx.globalAlpha = 0.4;
      drawSprite(renderer.ctx, f.character, f.anim, f.x, f.y, f.facing);
      renderer.ctx.globalAlpha = 1;
    }
  }

  particles.render(renderer.ctx);
  camera.restore(renderer.ctx);

  if (world.domainCinematic) {
    const c = world.domainCinematic;
    domainRenderer.drawActivation(c.tick / 60, c.name, c.color);
  }

  ui.drawHUD(world.fighters, world);
}

// ===== Menu drawing helpers =====
function drawBackground(ctx) {
  // moving starfield
  for (let i = 0; i < 60; i++) {
    const x = (i * 137 + menuTick * (1 + (i % 3) * 0.5)) % canvas.width;
    const y = (i * 73 + i * 11) % canvas.height;
    ctx.fillStyle = `rgba(95,215,255,${0.04 + (i % 5) * 0.02})`;
    ctx.fillRect(x, y, 2, 2);
  }
}

function drawTitle() {
  const ctx = renderer.ctx;
  renderer.clear('#04050a');
  drawBackground(ctx);
  ctx.textAlign = 'center';
  ctx.font = 'bold 96px monospace';
  ctx.fillStyle = '#ffffff';
  ctx.shadowColor = '#5fd7ff';
  ctx.shadowBlur = 30;
  ctx.fillText('JUJUTSU KAISEN', canvas.width / 2, 220);
  ctx.fillStyle = '#ff60a0';
  ctx.shadowColor = '#ff60a0';
  ctx.fillText('DOMAIN CLASH', canvas.width / 2, 320);
  ctx.shadowBlur = 0;
  ctx.font = '22px monospace';
  ctx.fillStyle = '#a0a8c0';
  ctx.fillText('A Smash-style platform fighter', canvas.width / 2, 360);
  ctx.font = 'bold 26px monospace';
  ctx.fillStyle = (menuTick % 60 < 40) ? '#ffe070' : '#666';
  ctx.fillText('PRESS  J  /  Xbox X  /  PS Square  /  Switch Y', canvas.width / 2, 490);
  ctx.font = '16px monospace';
  ctx.fillStyle = '#5fd7ff88';
  ctx.fillText('Plug in any controller — Xbox, PlayStation, or Nintendo Switch', canvas.width / 2, 520);
  drawControllerDiagnostic(ctx);
  ctx.textAlign = 'left';
}

// Live read-out of every connected gamepad. Lets the player verify their
// pad is being seen and which slot (P1/P2) it is bound to. Shown on every
// menu scene so controller issues are easy to debug.
function drawControllerDiagnostic(ctx) {
  const diag = input.diagnostics();
  ctx.textAlign = 'left';
  ctx.font = '12px monospace';
  const baseY = canvas.height - 80;
  ctx.fillStyle = '#5fd7ff';
  ctx.fillText('CONTROLLERS', 16, baseY);
  if (diag.length === 0) {
    ctx.fillStyle = '#888';
    ctx.fillText('(none detected — keyboard only)', 16, baseY + 16);
    return;
  }
  for (let i = 0; i < diag.length; i++) {
    const d = diag[i];
    const y = baseY + 16 + i * 28;
    const live = d.mask !== 0;
    ctx.fillStyle = live ? '#ffe070' : '#a0a8c0';
    const shortId = d.id.length > 56 ? d.id.slice(0, 53) + '...' : d.id;
    ctx.fillText(`P${d.slot + 1} [${d.kind}/${d.mapping}] ${shortId}`, 16, y);
    ctx.fillStyle = live ? '#9aff7a' : '#666';
    const dirs = [];
    if (d.mask & INPUT.LEFT) dirs.push('L');
    if (d.mask & INPUT.RIGHT) dirs.push('R');
    if (d.mask & INPUT.UP) dirs.push('U');
    if (d.mask & INPUT.DOWN) dirs.push('D');
    if (d.mask & INPUT.ATTACK) dirs.push('ATK');
    if (d.mask & INPUT.SPECIAL) dirs.push('SPC');
    if (d.mask & INPUT.JUMP) dirs.push('JMP');
    if (d.mask & INPUT.SHIELD) dirs.push('SHD');
    if (d.mask & INPUT.GRAB) dirs.push('GRB');
    const ax = `axes[${d.axes.join(',')}]`;
    const liveStr = d.liveAxes && d.liveAxes.length ? ` live{${d.liveAxes.join(',')}}` : ' live{none yet}';
    const btns = d.pressed.length ? ` btn[${d.pressed.join(',')}]` : '';
    ctx.fillText(`   ${ax}${liveStr}${btns} -> ${dirs.join(' ') || '(idle)'}`, 16, y + 12);
  }
}

function drawModeSelect() {
  const ctx = renderer.ctx;
  renderer.clear('#04050a');
  drawBackground(ctx);
  ctx.textAlign = 'center';
  ctx.font = 'bold 48px monospace';
  ctx.fillStyle = '#ffffff';
  ctx.shadowColor = '#5fd7ff'; ctx.shadowBlur = 20;
  ctx.fillText('SELECT MODE', canvas.width / 2, 130);
  ctx.shadowBlur = 0;

  const modes = [
    { title: 'LOCAL VERSUS', sub: 'Two players on this device (keyboard / 2 controllers)' },
    { title: 'HOST ONLINE',  sub: netReady ? 'Create a room and share the code' : 'Server unavailable' },
    { title: 'JOIN ONLINE',  sub: netReady ? 'Type a 6-character room code' : 'Server unavailable' },
  ];
  const cardW = 720, cardH = 100;
  const startY = 220;
  for (let i = 0; i < modes.length; i++) {
    const x = (canvas.width - cardW) / 2;
    const y = startY + i * (cardH + 20);
    const selected = i === modeCursor;
    const disabled = i > 0 && !netReady;
    ctx.fillStyle = selected ? '#162040' : '#0a0d18';
    ctx.fillRect(x, y, cardW, cardH);
    ctx.strokeStyle = disabled ? '#333' : (selected ? '#ffe070' : '#5fd7ff44');
    ctx.lineWidth = selected ? 4 : 1;
    ctx.strokeRect(x, y, cardW, cardH);
    ctx.font = 'bold 28px monospace';
    ctx.fillStyle = disabled ? '#444' : (selected ? '#ffe070' : '#fff');
    ctx.fillText(modes[i].title, canvas.width / 2, y + 40);
    ctx.font = '16px monospace';
    ctx.fillStyle = disabled ? '#333' : '#a0a8c0';
    ctx.fillText(modes[i].sub, canvas.width / 2, y + 70);
  }
  ctx.font = '15px monospace';
  ctx.fillStyle = '#5fd7ff88';
  ctx.fillText('UP/DOWN to choose  •  Confirm: J / Xbox X / PS Square / Switch Y', canvas.width / 2, 670);
  ctx.fillText('Back: L / R-shoulder', canvas.width / 2, 690);
  drawControllerDiagnostic(ctx);
  ctx.textAlign = 'left';
}

function drawLobby() {
  const ctx = renderer.ctx;
  renderer.clear('#04050a');
  drawBackground(ctx);
  ctx.textAlign = 'center';
  ctx.font = 'bold 48px monospace';
  ctx.fillStyle = '#ffffff';
  ctx.shadowColor = '#5fd7ff'; ctx.shadowBlur = 20;
  ctx.fillText(lobbyMode === 'host' ? 'HOSTING ROOM' : 'JOIN ROOM', canvas.width / 2, 130);
  ctx.shadowBlur = 0;

  // Big code box
  const boxW = 560, boxH = 180;
  const x = (canvas.width - boxW) / 2;
  const y = 220;
  ctx.fillStyle = '#0a0d18';
  ctx.fillRect(x, y, boxW, boxH);
  ctx.strokeStyle = '#5fd7ff';
  ctx.lineWidth = 3;
  ctx.strokeRect(x, y, boxW, boxH);

  ctx.font = 'bold 80px monospace';
  ctx.fillStyle = '#ffe070';
  ctx.shadowColor = '#ffe070'; ctx.shadowBlur = 20;
  let displayCode;
  if (lobbyMode === 'host') {
    displayCode = lobbyCode || '------';
  } else {
    displayCode = (lobbyJoinInput + '______').slice(0, 6).split('').join(' ');
  }
  ctx.fillText(displayCode, canvas.width / 2, y + 110);
  ctx.shadowBlur = 0;

  ctx.font = '18px monospace';
  ctx.fillStyle = '#a0a8c0';
  if (lobbyMode === 'host') {
    ctx.fillText('Share this code with your opponent', canvas.width / 2, y + 150);
  } else {
    ctx.fillText('Type the code on your keyboard, then press ENTER', canvas.width / 2, y + 150);
  }

  ctx.font = '18px monospace';
  ctx.fillStyle = '#5fd7ff';
  ctx.fillText(lobbyStatus, canvas.width / 2, 460);

  ctx.font = '16px monospace';
  ctx.fillStyle = '#5fd7ff88';
  ctx.fillText('SHIELD / BACKSPACE to return', canvas.width / 2, 680);
  ctx.textAlign = 'left';
}

// ===== Player / device assignment scene =====
// Lets each physical input device explicitly bind to P1 or P2 so the
// keyboard and gamepads stop fighting over the same player slot.
const DEVICE_KEYS = ['kb1', 'pad0', 'pad1'];
const DEVICE_LABELS = {
  kb1: 'KEYBOARD',
  pad0: 'GAMEPAD SLOT 1',
  pad1: 'GAMEPAD SLOT 2',
};

function drawPlayerSelect() {
  const ctx = renderer.ctx;
  renderer.clear('#04050a');
  drawBackground(ctx);
  ctx.textAlign = 'center';
  ctx.font = 'bold 44px monospace';
  ctx.fillStyle = '#ffffff';
  ctx.shadowColor = '#5fd7ff'; ctx.shadowBlur = 16;
  ctx.fillText('ASSIGN CONTROLS', canvas.width / 2, 90);
  ctx.shadowBlur = 0;
  ctx.font = '18px monospace';
  ctx.fillStyle = '#a0a8c0';
  ctx.fillText('Each device picks its player slot. They will not control the same player.', canvas.width / 2, 124);

  const cardW = 760, cardH = 96;
  const startY = 170;
  const diag = input.diagnostics();
  const padNames = { pad0: '(none connected)', pad1: '(none connected)' };
  for (const d of diag) {
    padNames['pad' + d.slot] = `${d.kind} — ${d.id.length > 38 ? d.id.slice(0, 35) + '...' : d.id}`;
  }

  for (let i = 0; i < DEVICE_KEYS.length; i++) {
    const key = DEVICE_KEYS[i];
    const x = (canvas.width - cardW) / 2;
    const y = startY + i * (cardH + 14);
    const slot = input.getAssignment(key);
    ctx.fillStyle = '#0a0d18';
    ctx.fillRect(x, y, cardW, cardH);
    ctx.strokeStyle = slot === 0 ? '#ffe070' : (slot === 1 ? '#ff60a0' : '#5fd7ff44');
    ctx.lineWidth = slot === -1 ? 1 : 4;
    ctx.strokeRect(x, y, cardW, cardH);

    ctx.textAlign = 'left';
    ctx.font = 'bold 20px monospace';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(DEVICE_LABELS[key], x + 20, y + 32);
    ctx.font = '13px monospace';
    ctx.fillStyle = '#a0a8c0';
    if (key.startsWith('pad')) ctx.fillText(padNames[key], x + 20, y + 52);
    else ctx.fillText('Move WASD  Attack J  Special K  Jump Space  Shield L', x + 20, y + 52);

    // Slot indicator
    ctx.textAlign = 'right';
    ctx.font = 'bold 26px monospace';
    let label, color;
    if (slot === 0) { label = 'PLAYER 1'; color = '#ffe070'; }
    else if (slot === 1) { label = 'PLAYER 2'; color = '#ff60a0'; }
    else { label = 'UNASSIGNED'; color = '#666'; }
    ctx.fillStyle = color;
    ctx.fillText(label, x + cardW - 20, y + 38);

    // Hint
    ctx.font = '13px monospace';
    ctx.fillStyle = '#5fd7ff88';
    ctx.fillText('LEFT = P1   RIGHT = P2   DOWN = unassign', x + cardW - 20, y + 78);

    ctx.textAlign = 'left';
  }

  // Footer
  ctx.textAlign = 'center';
  ctx.font = 'bold 18px monospace';
  const ready = DEVICE_KEYS.some(k => input.getAssignment(k) === 0);
  const readyP2 = DEVICE_KEYS.some(k => input.getAssignment(k) === 1);
  if (ready && readyP2) {
    ctx.fillStyle = (menuTick % 60 < 40) ? '#ffe070' : '#888';
    ctx.fillText('PRESS  JUMP  ON ANY DEVICE TO CONTINUE', canvas.width / 2, 660);
  } else {
    ctx.fillStyle = '#ff6060';
    ctx.fillText('At least one device must be assigned to P1 and one to P2', canvas.width / 2, 660);
  }
  ctx.font = '14px monospace';
  ctx.fillStyle = '#5fd7ff88';
  ctx.fillText('Back: SHIELD on any device', canvas.width / 2, 686);
  drawControllerDiagnostic(ctx);
  ctx.textAlign = 'left';
}

function drawCharSelect() {
  const ctx = renderer.ctx;
  renderer.clear('#06080f');
  drawBackground(ctx);
  ctx.textAlign = 'center';
  ctx.font = 'bold 44px monospace';
  ctx.fillStyle = '#ffffff';
  ctx.shadowColor = '#5fd7ff'; ctx.shadowBlur = 16;
  ctx.fillText('CHARACTER SELECT', canvas.width / 2, 80);
  ctx.shadowBlur = 0;
  if (isOnline) {
    ctx.font = '16px monospace';
    ctx.fillStyle = '#5fd7ff';
    const youLabel = `YOU = P${net.localSlot + 1}`;
    const roleLabel = net.localSlot === 0 ? '(host — picks stage)' : '(guest)';
    ctx.fillText(`ONLINE  ${lobbyCode}  •  ${youLabel} ${roleLabel}`, canvas.width / 2, 108);
  }

  const slotW = 240, slotH = 280;
  const startX = (canvas.width - slotW * ROSTER.length - 20 * (ROSTER.length - 1)) / 2;
  for (let i = 0; i < ROSTER.length; i++) {
    const key = ROSTER[i];
    const stats = FIGHTER_STATS[key];
    const x = startX + i * (slotW + 20);
    const y = 140;
    ctx.fillStyle = '#0e1220';
    ctx.fillRect(x, y, slotW, slotH);
    ctx.strokeStyle = '#5fd7ff44';
    ctx.lineWidth = 1;
    ctx.strokeRect(x, y, slotW, slotH);
    drawSprite(ctx, key, (menuTick % 60 < 30) ? 'idle' : 'idle2', x + slotW / 2, y + slotH - 30, 1);
    ctx.font = 'bold 22px monospace';
    ctx.fillStyle = stats.palette.accent;
    ctx.fillText(stats.name, x + slotW / 2, y + 32);
    ctx.font = '13px monospace';
    ctx.fillStyle = '#a0a8c0';
    ctx.fillText(`Weight ${stats.weight}  Run ${stats.runSpeed}`, x + slotW / 2, y + 52);
  }
  // Cursors
  for (let p = 0; p < 2; p++) {
    const i = charCursor[p];
    const x = startX + i * (slotW + 20);
    const y = 140;
    ctx.strokeStyle = p === 0 ? '#ffe070' : '#ff60a0';
    ctx.lineWidth = charLocked[p] ? 7 : 4;
    ctx.strokeRect(x - 4 + p * 4, y - 4 + p * 4, slotW + 8, slotH + 8);
    ctx.font = 'bold 16px monospace';
    ctx.fillStyle = ctx.strokeStyle;
    ctx.fillText(charLocked[p] ? `P${p + 1} READY` : `P${p + 1}`, x + slotW / 2, y - 12);
  }

  // Explicit binds
  ctx.font = 'bold 18px monospace';
  ctx.fillStyle = '#ffe070';
  ctx.fillText('LEFT/RIGHT to choose', canvas.width / 2, 470);
  ctx.fillText('LOCK IN:  J  /  Xbox X  /  PlayStation Square  /  Switch Y', canvas.width / 2, 494);
  ctx.font = '15px monospace';
  ctx.fillStyle = '#a0a8c0';
  ctx.fillText('Back / unlock:  L  /  Right Shoulder (RB / R1 / R)', canvas.width / 2, 518);
  if (charLocked[0] && charLocked[1]) {
    ctx.fillStyle = '#ffe070';
    ctx.font = 'bold 20px monospace';
    ctx.fillText('BOTH READY — PRESS  K / Xbox Y / PS Triangle / Switch X  TO CONTINUE', canvas.width / 2, 552);
  }
  drawControllerDiagnostic(ctx);
  ctx.textAlign = 'left';
}

function drawStageSelect() {
  const ctx = renderer.ctx;
  renderer.clear('#06080f');
  drawBackground(ctx);
  ctx.textAlign = 'center';
  ctx.font = 'bold 44px monospace';
  ctx.fillStyle = '#ffffff';
  ctx.shadowColor = '#5fd7ff'; ctx.shadowBlur = 16;
  ctx.fillText('STAGE SELECT', canvas.width / 2, 80);
  ctx.shadowBlur = 0;
  if (isOnline) {
    ctx.font = '16px monospace';
    ctx.fillStyle = '#5fd7ff';
    const hostLine = net.localSlot === 0
      ? 'ONLINE — you are the host. Pick the stage and press ATTACK to start.'
      : 'ONLINE — waiting for host to pick the stage...';
    ctx.fillText(hostLine, canvas.width / 2, 108);
  }

  const slotW = 360, slotH = 240;
  const startX = (canvas.width - slotW * 3 - 40) / 2;
  for (let i = 0; i < 3; i++) {
    const x = startX + i * (slotW + 20);
    const y = 160;
    // Stage preview thumbnails
    ctx.fillStyle = '#0e1220';
    ctx.fillRect(x, y, slotW, slotH);
    // Mini-rendered stage backdrop
    ctx.save();
    ctx.beginPath(); ctx.rect(x, y, slotW, slotH); ctx.clip();
    const tmpStage = new (STAGES[i])();
    ctx.translate(x, y);
    ctx.scale(slotW / 1280, slotH / 720);
    tmpStage.background(ctx, 1280, 720);
    // ground line
    ctx.fillStyle = '#586878';
    if (tmpStage.ground) ctx.fillRect(tmpStage.ground.x, tmpStage.ground.y, tmpStage.ground.w, 6);
    if (tmpStage.platforms) for (const p of tmpStage.platforms) ctx.fillRect(p.x, p.y, p.w, 6);
    ctx.restore();

    if (i === stageCursor) {
      ctx.strokeStyle = '#ffe070'; ctx.lineWidth = 5;
    } else { ctx.strokeStyle = '#5fd7ff44'; ctx.lineWidth = 1; }
    ctx.strokeRect(x, y, slotW, slotH);
    ctx.font = 'bold 20px monospace';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(STAGE_NAMES[i], x + slotW / 2, y + slotH + 26);
  }
  ctx.font = 'bold 18px monospace';
  ctx.fillStyle = '#ffe070';
  ctx.fillText('LEFT/RIGHT to choose  •  Start: J / Xbox X / PS Square / Switch Y', canvas.width / 2, 496);
  ctx.font = '15px monospace';
  ctx.fillStyle = '#a0a8c0';
  ctx.fillText('Back: L / R-shoulder', canvas.width / 2, 520);
  ctx.textAlign = 'left';
}

function drawResult() {
  const ctx = renderer.ctx;
  renderer.clear('#06080f');
  drawBackground(ctx);
  ctx.textAlign = 'center';
  ctx.font = 'bold 64px monospace';
  ctx.fillStyle = '#ffe070';
  ctx.shadowColor = '#ff60a0'; ctx.shadowBlur = 30;
  ctx.fillText(resultText, canvas.width / 2, canvas.height / 2);
  ctx.shadowBlur = 0;
  ctx.font = '22px monospace';
  ctx.fillStyle = '#a0a8c0';
  ctx.fillText('Press J / Xbox X / PS Square / Switch Y to return to title', canvas.width / 2, canvas.height / 2 + 70);
  ctx.textAlign = 'left';
}

// ===== Lobby raw key handler (typing room codes) =====
const VALID_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
window.addEventListener('keydown', (e) => {
  if (scene !== SCENE.LOBBY || lobbyMode !== 'join') return;
  if (e.code === 'Backspace') {
    lobbyJoinInput = lobbyJoinInput.slice(0, -1);
    e.preventDefault();
    return;
  }
  if (e.code === 'Enter' && lobbyJoinInput.length === 6) {
    net.joinRoom(lobbyJoinInput);
    lobbyStatus = 'Joining ' + lobbyJoinInput + '...';
    e.preventDefault();
    return;
  }
  // Map letter/digit keys
  if (e.code.startsWith('Key')) {
    const ch = e.code.slice(3);
    if (VALID_CODE_CHARS.includes(ch) && lobbyJoinInput.length < 6) lobbyJoinInput += ch;
  } else if (e.code.startsWith('Digit')) {
    const ch = e.code.slice(5);
    if (VALID_CODE_CHARS.includes(ch) && lobbyJoinInput.length < 6) lobbyJoinInput += ch;
  }
});

// ===== Menu input handling =====
function handleMenuInput() {
  input.tick();
  const pressed = (p, code) => input.pressed(p, code);
  const eitherPressed = (code) => pressed(0, code) || pressed(1, code);
  // Device-level edge-trigger. Works regardless of which player index a
  // device is currently assigned to — the local user can drive the UI
  // with any controller they have plugged in. Essential in online mode
  // where the remote slot has no local device at all.
  const anyLocalPressed = (code) =>
    input.devicePressed('kb1', code) ||
    input.devicePressed('pad0', code) ||
    input.devicePressed('pad1', code);

  // On the title screen accept ANY face button so unknown controller layouts
  // can still get into the game while the diagnostic helps the user identify
  // the issue.
  if (scene === SCENE.TITLE) {
    if (eitherPressed(INPUT.ATTACK) || eitherPressed(INPUT.SPECIAL) ||
        eitherPressed(INPUT.JUMP) || eitherPressed(INPUT.GRAB)) {
      scene = SCENE.MODE_SELECT;
    }
  } else if (scene === SCENE.MODE_SELECT) {
    if (eitherPressed(INPUT.UP))   modeCursor = (modeCursor + 2) % 3;
    if (eitherPressed(INPUT.DOWN)) modeCursor = (modeCursor + 1) % 3;
    if (eitherPressed(INPUT.SHIELD)) scene = SCENE.TITLE;
    if (eitherPressed(INPUT.ATTACK)) {
      if (modeCursor === 0) {
        scene = SCENE.PLAYER_SELECT;
        isOnline = false;
        charLocked = [false, false];
      } else if ((modeCursor === 1 || modeCursor === 2) && netReady) {
        lobbyMode = modeCursor === 1 ? 'host' : 'join';
        lobbyJoinInput = '';
        lobbyCode = '';
        isOnline = true;
        lobbyStatus = lobbyMode === 'host'
          ? 'Creating room...'
          : 'Type your friend\'s 6-character room code, then press ENTER.';
        scene = SCENE.LOBBY;
        if (lobbyMode === 'host') net.createRoom();
      }
    }
  } else if (scene === SCENE.LOBBY) {
    if (eitherPressed(INPUT.SHIELD)) {
      scene = SCENE.MODE_SELECT;
      lobbyMode = 'idle';
      isOnline = false;
    }
  } else if (scene === SCENE.PLAYER_SELECT) {
    // Each device sets its own assignment by pressing on itself.
    for (const key of DEVICE_KEYS) {
      if (input.devicePressed(key, INPUT.LEFT))  input.setAssignment(key, 0);
      if (input.devicePressed(key, INPUT.RIGHT)) input.setAssignment(key, 1);
      if (input.devicePressed(key, INPUT.DOWN))  input.setAssignment(key, -1);
    }
    // Need at least one device on each player to start.
    const hasP1 = DEVICE_KEYS.some(k => input.getAssignment(k) === 0);
    const hasP2 = DEVICE_KEYS.some(k => input.getAssignment(k) === 1);
    if (hasP1 && hasP2) {
      // Any device pressing JUMP advances.
      for (const key of DEVICE_KEYS) {
        if (input.devicePressed(key, INPUT.JUMP)) { scene = SCENE.CHAR_SELECT; break; }
      }
    }
    // Any device pressing SHIELD goes back.
    for (const key of DEVICE_KEYS) {
      if (input.devicePressed(key, INPUT.SHIELD)) { scene = SCENE.MODE_SELECT; break; }
    }
  } else if (scene === SCENE.CHAR_SELECT) {
    if (isOnline) {
      // Online: the local user only drives their own slot. Every cursor
      // move and lock change is relayed to the peer so both screens stay
      // in sync. The opponent's slot is updated exclusively via the
      // net.onCharCursor / net.onCharLock callbacks.
      const slot = net.localSlot;
      if (charLocked[slot]) {
        if (anyLocalPressed(INPUT.SHIELD) || anyLocalPressed(INPUT.ATTACK)) {
          charLocked[slot] = false;
          net.sendCharLock(false, charSelections[slot]);
        }
      } else {
        if (anyLocalPressed(INPUT.LEFT)) {
          charCursor[slot] = (charCursor[slot] + ROSTER.length - 1) % ROSTER.length;
          net.sendCharCursor(charCursor[slot]);
        }
        if (anyLocalPressed(INPUT.RIGHT)) {
          charCursor[slot] = (charCursor[slot] + 1) % ROSTER.length;
          net.sendCharCursor(charCursor[slot]);
        }
        if (anyLocalPressed(INPUT.ATTACK)) {
          charLocked[slot] = true;
          charSelections[slot] = charCursor[slot];
          net.sendCharLock(true, charSelections[slot]);
        }
      }
      // Either player may confirm once both are locked. Relay the scene
      // change so the opponent follows along.
      if (charLocked[0] && charLocked[1] && anyLocalPressed(INPUT.SPECIAL)) {
        net.sendProceedToStage();
        scene = SCENE.STAGE_SELECT;
      }
    } else {
      for (let p = 0; p < 2; p++) {
        if (charLocked[p]) {
          if (pressed(p, INPUT.SHIELD) || pressed(p, INPUT.ATTACK)) charLocked[p] = false;
          continue;
        }
        if (pressed(p, INPUT.LEFT)) charCursor[p] = (charCursor[p] + ROSTER.length - 1) % ROSTER.length;
        if (pressed(p, INPUT.RIGHT)) charCursor[p] = (charCursor[p] + 1) % ROSTER.length;
        if (pressed(p, INPUT.ATTACK)) { charLocked[p] = true; charSelections[p] = charCursor[p]; }
        if (pressed(p, INPUT.SHIELD)) scene = SCENE.PLAYER_SELECT;
      }
      if (charLocked[0] && charLocked[1] && eitherPressed(INPUT.SPECIAL)) {
        scene = SCENE.STAGE_SELECT;
      }
    }
  } else if (scene === SCENE.STAGE_SELECT) {
    if (isOnline) {
      // Only the host picks the stage to avoid both clients racing. The
      // host broadcasts cursor moves so the guest sees the highlight,
      // then fires start_match with the authoritative selections + stage
      // so both clients build identical worlds.
      if (net.localSlot === 0) {
        if (anyLocalPressed(INPUT.LEFT)) {
          stageCursor = (stageCursor + 2) % 3;
          net.sendStageCursor(stageCursor);
        }
        if (anyLocalPressed(INPUT.RIGHT)) {
          stageCursor = (stageCursor + 1) % 3;
          net.sendStageCursor(stageCursor);
        }
        if (anyLocalPressed(INPUT.ATTACK)) {
          net.sendStartMatch(stageCursor, [charSelections[0], charSelections[1]]);
          world = createWorld(stageCursor);
          scene = SCENE.MATCH;
        }
      }
    } else {
      if (eitherPressed(INPUT.LEFT)) stageCursor = (stageCursor + 2) % 3;
      if (eitherPressed(INPUT.RIGHT)) stageCursor = (stageCursor + 1) % 3;
      if (eitherPressed(INPUT.SHIELD)) scene = SCENE.CHAR_SELECT;
      if (eitherPressed(INPUT.ATTACK)) {
        world = createWorld(stageCursor);
        scene = SCENE.MATCH;
      }
    }
  } else if (scene === SCENE.RESULT) {
    if (eitherPressed(INPUT.ATTACK)) {
      scene = SCENE.TITLE;
      charLocked = [false, false];
      isOnline = false;
    }
  }
}

// ===== Loop =====
const loop = new GameLoop(
  (tick) => {
    menuTick++;
    spriteFrameTick++;
    if (scene === SCENE.MATCH) updateMatch();
    else handleMenuInput();
  },
  (interp) => {
    if (scene === SCENE.TITLE) drawTitle();
    else if (scene === SCENE.MODE_SELECT) drawModeSelect();
    else if (scene === SCENE.LOBBY) drawLobby();
    else if (scene === SCENE.PLAYER_SELECT) drawPlayerSelect();
    else if (scene === SCENE.CHAR_SELECT) drawCharSelect();
    else if (scene === SCENE.STAGE_SELECT) drawStageSelect();
    else if (scene === SCENE.MATCH) renderMatch();
    else if (scene === SCENE.RESULT) drawResult();
  }
);

loop.start();
