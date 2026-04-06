// Entry point. Bootstraps the 60fps loop, scenes, and the local game world.
// Scenes: TITLE -> MODE_SELECT -> LOBBY (online) -> CHAR_SELECT -> STAGE_SELECT
//         -> MATCH -> RESULT.

import { GameLoop } from './engine/GameLoop.js';
import { InputManager } from './engine/InputManager.js';
import { Camera } from './engine/Camera.js';
import { ParticleSystem } from './engine/ParticleSystem.js';
import { Renderer } from './rendering/Renderer.js';
import { UIRenderer } from './rendering/UIRenderer.js';
import { DomainRenderer } from './rendering/DomainRenderer.js';
import { SpriteSheet } from './rendering/SpriteSheet.js';
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

const canvas = document.getElementById('game');
const renderer = new Renderer(canvas);
const ui = new UIRenderer(canvas);
const domainRenderer = new DomainRenderer(canvas);
const camera = new Camera(canvas.width, canvas.height);
const particles = new ParticleSystem();
const input = new InputManager();
const sprites = new SpriteSheet();
sprites.build();

// ===== Explicit per-control labels (for menus & overlays) =====
// Controllers are mapped by physical button position so the same logical
// action lives on the same place regardless of vendor labels.
const KEYBINDS = {
  p1: { move: 'WASD', attack: 'J', special: 'K', jump: 'Space', shield: 'L', grab: ';', taunt: 'T' },
  p2: { move: 'Arrows', attack: 'Num1', special: 'Num2', jump: 'Num0', shield: 'Num3', grab: 'Num4', taunt: 'Num5' },
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
const SCENE = { TITLE: 0, MODE_SELECT: 1, LOBBY: 2, CHAR_SELECT: 3, STAGE_SELECT: 4, MATCH: 5, RESULT: 6 };
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
  scene = SCENE.CHAR_SELECT;
};
net.onError = (e) => { lobbyStatus = 'Error: ' + (e.message || 'connection failed'); };
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
  if (world.timer > 0) world.timer--;

  input.tick();
  const masks = [input.current(0), input.current(1)];

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

  for (const f of world.fighters) {
    if (f.shielding) {
      renderer.ctx.strokeStyle = '#5fd7ff';
      renderer.ctx.globalAlpha = 0.5 + (f.shieldHP / 100) * 0.5;
      renderer.ctx.beginPath();
      renderer.ctx.arc(f.x, f.y - f.height / 2, 56, 0, Math.PI * 2);
      renderer.ctx.stroke();
      renderer.ctx.globalAlpha = 1;
    }
    sprites.draw(renderer.ctx, f.character, f.anim, f.x, f.y, f.facing);
    if (f.passiveInfinity && f.ce > f.ceMax * 0.25) {
      renderer.ctx.strokeStyle = 'rgba(150,200,255,0.35)';
      renderer.ctx.lineWidth = 2;
      renderer.ctx.beginPath();
      renderer.ctx.arc(f.x, f.y - f.height / 2, 60, 0, Math.PI * 2);
      renderer.ctx.stroke();
    }
    if (f.soulCorruption > 0) {
      renderer.ctx.fillStyle = '#9aff7a';
      for (let s = 0; s < f.soulCorruption; s++) {
        renderer.ctx.fillRect(f.x - 16 + s * 7, f.y - f.height - 18, 5, 5);
      }
    }
    if (f.invulnFrames > 0 && f.invulnFrames % 6 < 3) {
      renderer.ctx.globalAlpha = 0.4;
      sprites.draw(renderer.ctx, f.character, f.anim, f.x, f.y, f.facing);
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
  ctx.fillText('PRESS  J   /   Num1   /   Xbox X   /   PS Square   /   Switch Y', canvas.width / 2, 490);
  ctx.font = '16px monospace';
  ctx.fillStyle = '#5fd7ff88';
  ctx.fillText('Plug in any controller — Xbox, PlayStation, or Nintendo Switch', canvas.width / 2, 520);

  // Roster preview row
  const startX = (canvas.width - ROSTER.length * 140) / 2;
  for (let i = 0; i < ROSTER.length; i++) {
    sprites.draw(ctx, ROSTER[i], (menuTick % 60 < 30) ? 'idle' : 'idle2', startX + i * 140 + 70, 640, 1);
  }
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
  ctx.fillText('UP/DOWN to choose  •  Confirm: J / Num1 / Xbox X / PS Square / Switch Y', canvas.width / 2, 670);
  ctx.fillText('Back: L / Num3 / R-shoulder', canvas.width / 2, 690);
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
    sprites.draw(ctx, key, (menuTick % 60 < 30) ? 'idle' : 'idle2', x + slotW / 2, y + slotH - 30, 1);
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
  ctx.fillText('LOCK IN:  P1 = J    P2 = Num1    Xbox = X    PlayStation = Square    Switch = Y', canvas.width / 2, 494);
  ctx.font = '15px monospace';
  ctx.fillStyle = '#a0a8c0';
  ctx.fillText('Back / unlock:  L  /  Num3  /  Right Shoulder (RB / R1 / R)', canvas.width / 2, 518);
  if (charLocked[0] && charLocked[1]) {
    ctx.fillStyle = '#ffe070';
    ctx.font = 'bold 20px monospace';
    ctx.fillText('BOTH READY — PRESS  K / Num2 / Xbox Y / PS Triangle / Switch X  TO CONTINUE', canvas.width / 2, 552);
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
  ctx.fillText('LEFT/RIGHT to choose  •  Start: J / Num1 / Xbox X / PS Square / Switch Y', canvas.width / 2, 496);
  ctx.font = '15px monospace';
  ctx.fillStyle = '#a0a8c0';
  ctx.fillText('Back: L / Num3 / R-shoulder', canvas.width / 2, 520);
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
  ctx.fillText('Press J / Num1 / Xbox X / PS Square / Switch Y to return to title', canvas.width / 2, canvas.height / 2 + 70);
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
        scene = SCENE.CHAR_SELECT;
        charLocked = [false, false];
      } else if ((modeCursor === 1 || modeCursor === 2) && netReady) {
        lobbyMode = modeCursor === 1 ? 'host' : 'join';
        lobbyJoinInput = '';
        lobbyCode = '';
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
    }
  } else if (scene === SCENE.CHAR_SELECT) {
    for (let p = 0; p < 2; p++) {
      if (charLocked[p]) {
        if (pressed(p, INPUT.SHIELD) || pressed(p, INPUT.ATTACK)) charLocked[p] = false;
        continue;
      }
      if (pressed(p, INPUT.LEFT)) charCursor[p] = (charCursor[p] + ROSTER.length - 1) % ROSTER.length;
      if (pressed(p, INPUT.RIGHT)) charCursor[p] = (charCursor[p] + 1) % ROSTER.length;
      if (pressed(p, INPUT.ATTACK)) { charLocked[p] = true; charSelections[p] = charCursor[p]; }
      if (pressed(p, INPUT.SHIELD)) scene = SCENE.MODE_SELECT;
    }
    if (charLocked[0] && charLocked[1] && eitherPressed(INPUT.SPECIAL)) {
      scene = SCENE.STAGE_SELECT;
    }
  } else if (scene === SCENE.STAGE_SELECT) {
    if (eitherPressed(INPUT.LEFT)) stageCursor = (stageCursor + 2) % 3;
    if (eitherPressed(INPUT.RIGHT)) stageCursor = (stageCursor + 1) % 3;
    if (eitherPressed(INPUT.SHIELD)) scene = SCENE.CHAR_SELECT;
    if (eitherPressed(INPUT.ATTACK)) {
      world = createWorld(stageCursor);
      scene = SCENE.MATCH;
    }
  } else if (scene === SCENE.RESULT) {
    if (eitherPressed(INPUT.ATTACK)) {
      scene = SCENE.TITLE;
      charLocked = [false, false];
    }
  }
}

// ===== Loop =====
const loop = new GameLoop(
  (tick) => {
    menuTick++;
    if (scene === SCENE.MATCH) updateMatch();
    else handleMenuInput();
  },
  (interp) => {
    if (scene === SCENE.TITLE) drawTitle();
    else if (scene === SCENE.MODE_SELECT) drawModeSelect();
    else if (scene === SCENE.LOBBY) drawLobby();
    else if (scene === SCENE.CHAR_SELECT) drawCharSelect();
    else if (scene === SCENE.STAGE_SELECT) drawStageSelect();
    else if (scene === SCENE.MATCH) renderMatch();
    else if (scene === SCENE.RESULT) drawResult();
  }
);

loop.start();
