// Entry point. Bootstraps the 60fps loop, scenes, and the local game world.
// Scenes: TITLE -> CHAR_SELECT -> STAGE_SELECT -> MATCH -> RESULT.

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
import { INPUT, isDomainInput } from '../../shared/InputCodes.js';
import { NetClient } from './net/NetClient.js';
import { bindLobby } from './net/Lobby.js';

const canvas = document.getElementById('game');
const renderer = new Renderer(canvas);
const ui = new UIRenderer(canvas);
const domainRenderer = new DomainRenderer(canvas);
const camera = new Camera(canvas.width, canvas.height);
const particles = new ParticleSystem();
const input = new InputManager();
const sprites = new SpriteSheet();
sprites.build();

const FIGHTER_CLASSES = {
  gojo: GojoFighter,
  yuji: YujiSukunaFighter,
  mahito: MahitoFighter,
  todo: TodoFighter,
};
const STAGES = [JujutsuHigh, Shibuya, Shinjuku];

// ===== Scenes =====
const SCENE = { TITLE: 0, CHAR_SELECT: 1, STAGE_SELECT: 2, MATCH: 3, RESULT: 4 };
let scene = SCENE.TITLE;
let menuTick = 0;
let charSelections = [0, 1]; // P1, P2 indexes into ROSTER
let charCursor = [0, 1];
let charLocked = [false, false];
let stageCursor = 0;
let world = null;
let resultText = '';
let domainCinematic = null; // {tick, name, color}

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
    timer: 60 * 60 * 7, // 7 minutes
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

// ===== Update / Render =====
function updateMatch() {
  world.tick++;
  if (world.timer > 0) world.timer--;

  input.tick();
  const masks = [input.current(0), input.current(1)];

  // Update fighters
  for (let i = 0; i < world.fighters.length; i++) {
    const f = world.fighters[i];
    f.tick(masks[i], world);
    f.setPrevInput(masks[i]);
  }

  // Update domain
  if (world.activeDomain) {
    world.activeDomain.update(world);
    if (!world.activeDomain.active) world.activeDomain = null;
  }
  if (world.domainCinematic) {
    world.domainCinematic.tick++;
    if (world.domainCinematic.tick > 60) world.domainCinematic = null;
  }

  // Stage hazards
  world.stage.update(world);

  // Particles
  particles.update();

  // Camera
  camera.follow(world.fighters.filter(f => !f.ko));

  // Win condition
  if (!world.finished) {
    const alive = world.fighters.filter(f => f.stocks > 0 || (!f.ko));
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

  // Stage hazards (in-world)
  world.stage.render(renderer.ctx, world);

  // Domain background pass
  if (world.activeDomain) world.activeDomain.render(renderer.ctx, world);

  // Fighters
  for (const f of world.fighters) {
    // shield bubble
    if (f.shielding) {
      renderer.ctx.strokeStyle = '#5fd7ff';
      renderer.ctx.globalAlpha = 0.5 + (f.shieldHP / 100) * 0.5;
      renderer.ctx.beginPath();
      renderer.ctx.arc(f.x, f.y - f.height / 2, 50, 0, Math.PI * 2);
      renderer.ctx.stroke();
      renderer.ctx.globalAlpha = 1;
    }
    sprites.draw(renderer.ctx, f.character, f.anim, f.x, f.y, f.facing);
    // Infinity shimmer
    if (f.passiveInfinity && f.ce > f.ceMax * 0.25) {
      renderer.ctx.strokeStyle = 'rgba(150,200,255,0.35)';
      renderer.ctx.lineWidth = 2;
      renderer.ctx.beginPath();
      renderer.ctx.arc(f.x, f.y - f.height / 2, 50, 0, Math.PI * 2);
      renderer.ctx.stroke();
    }
    // Soul Corruption marker
    if (f.soulCorruption > 0) {
      renderer.ctx.fillStyle = '#9aff7a';
      for (let s = 0; s < f.soulCorruption; s++) {
        renderer.ctx.fillRect(f.x - 16 + s * 7, f.y - f.height - 14, 5, 5);
      }
    }
    // invuln flash
    if (f.invulnFrames > 0 && f.invulnFrames % 6 < 3) {
      renderer.ctx.globalAlpha = 0.4;
      sprites.draw(renderer.ctx, f.character, f.anim, f.x, f.y, f.facing);
      renderer.ctx.globalAlpha = 1;
    }
  }

  particles.render(renderer.ctx);
  camera.restore(renderer.ctx);

  // Domain activation flash overlay (in screen space)
  if (world.domainCinematic) {
    const c = world.domainCinematic;
    domainRenderer.drawActivation(c.tick / 60, c.name, c.color);
  }

  // HUD
  ui.drawHUD(world.fighters, world);
}

// ===== Title / Menus =====
function drawTitle() {
  const ctx = renderer.ctx;
  renderer.clear('#04050a');
  // background pulse
  for (let i = 0; i < 30; i++) {
    const x = (i * 137 + menuTick) % canvas.width;
    const y = (i * 73) % canvas.height;
    ctx.fillStyle = `rgba(95,215,255,${0.05 + (i % 4) * 0.02})`;
    ctx.fillRect(x, y, 2, 2);
  }
  ctx.textAlign = 'center';
  ctx.font = 'bold 72px monospace';
  ctx.fillStyle = '#ffffff';
  ctx.shadowColor = '#5fd7ff';
  ctx.shadowBlur = 20;
  ctx.fillText('JUJUTSU KAISEN', canvas.width / 2, 220);
  ctx.fillStyle = '#ff60a0';
  ctx.shadowColor = '#ff60a0';
  ctx.fillText('DOMAIN CLASH', canvas.width / 2, 300);
  ctx.shadowBlur = 0;
  ctx.font = '20px monospace';
  ctx.fillStyle = '#a0a8c0';
  ctx.fillText('A 128-bit platform fighter', canvas.width / 2, 340);
  ctx.font = 'bold 24px monospace';
  ctx.fillStyle = (menuTick % 60 < 40) ? '#ffe070' : '#888';
  ctx.fillText('PRESS ATTACK (J / Numpad1) TO START', canvas.width / 2, 480);
  ctx.font = '14px monospace';
  ctx.fillStyle = '#5fd7ff88';
  ctx.fillText('P1: WASD move • J attack • K special • Space jump • L shield • ; grab', canvas.width / 2, 600);
  ctx.fillText('P2: Arrows move • Num1 attack • Num2 special • Num0 jump • Num3 shield', canvas.width / 2, 620);
  ctx.fillText('Domain Expansion: hold Shield + Special + Attack when meter is full', canvas.width / 2, 640);
  ctx.textAlign = 'left';
}

function drawCharSelect() {
  const ctx = renderer.ctx;
  renderer.clear('#06080f');
  ctx.textAlign = 'center';
  ctx.font = 'bold 36px monospace';
  ctx.fillStyle = '#ffffff';
  ctx.fillText('CHARACTER SELECT', canvas.width / 2, 80);

  const slotW = 220, slotH = 240;
  const startX = (canvas.width - slotW * ROSTER.length - 20 * (ROSTER.length - 1)) / 2;
  for (let i = 0; i < ROSTER.length; i++) {
    const key = ROSTER[i];
    const stats = FIGHTER_STATS[key];
    const x = startX + i * (slotW + 20);
    const y = 140;
    ctx.fillStyle = '#0e1220';
    ctx.fillRect(x, y, slotW, slotH);
    ctx.strokeStyle = '#5fd7ff44';
    ctx.strokeRect(x, y, slotW, slotH);
    // sprite preview
    sprites.draw(ctx, key, 'idle', x + slotW / 2, y + 200, 1);
    ctx.font = 'bold 20px monospace';
    ctx.fillStyle = stats.palette.accent;
    ctx.fillText(stats.name, x + slotW / 2, y + 30);
    ctx.font = '12px monospace';
    ctx.fillStyle = '#a0a8c0';
    ctx.fillText(`WT ${stats.weight}  RUN ${stats.runSpeed}`, x + slotW / 2, y + 50);
  }
  // cursors
  for (let p = 0; p < 2; p++) {
    const i = charCursor[p];
    const x = startX + i * (slotW + 20);
    const y = 140;
    ctx.strokeStyle = p === 0 ? '#ffe070' : '#ff60a0';
    ctx.lineWidth = charLocked[p] ? 6 : 3;
    ctx.strokeRect(x - 4 + p * 4, y - 4 + p * 4, slotW + 8, slotH + 8);
    ctx.font = 'bold 14px monospace';
    ctx.fillStyle = ctx.strokeStyle;
    ctx.fillText(charLocked[p] ? `P${p + 1} READY` : `P${p + 1}`, x + slotW / 2, y - 12);
  }
  ctx.font = '16px monospace';
  ctx.fillStyle = '#a0a8c0';
  ctx.fillText('Move: LEFT/RIGHT • Lock: ATTACK • Back: SHIELD', canvas.width / 2, 480);
  if (charLocked[0] && charLocked[1]) {
    ctx.fillStyle = '#ffe070';
    ctx.font = 'bold 18px monospace';
    ctx.fillText('PRESS SPECIAL TO CONTINUE', canvas.width / 2, 520);
  }
  ctx.textAlign = 'left';
}

function drawStageSelect() {
  const ctx = renderer.ctx;
  renderer.clear('#06080f');
  ctx.textAlign = 'center';
  ctx.font = 'bold 36px monospace';
  ctx.fillStyle = '#ffffff';
  ctx.fillText('STAGE SELECT', canvas.width / 2, 80);
  const names = ['Tokyo Jujutsu High', 'Shibuya Station', 'Shinjuku Showdown'];
  const slotW = 320, slotH = 200;
  const startX = (canvas.width - slotW * 3 - 40) / 2;
  for (let i = 0; i < 3; i++) {
    const x = startX + i * (slotW + 20);
    const y = 160;
    ctx.fillStyle = '#0e1220';
    ctx.fillRect(x, y, slotW, slotH);
    if (i === stageCursor) {
      ctx.strokeStyle = '#ffe070'; ctx.lineWidth = 4;
    } else { ctx.strokeStyle = '#5fd7ff44'; ctx.lineWidth = 1; }
    ctx.strokeRect(x, y, slotW, slotH);
    ctx.font = 'bold 18px monospace';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(names[i], x + slotW / 2, y + slotH - 16);
  }
  ctx.font = '16px monospace';
  ctx.fillStyle = '#a0a8c0';
  ctx.fillText('LEFT/RIGHT to choose • ATTACK to start • SHIELD to back', canvas.width / 2, 440);
  ctx.textAlign = 'left';
}

function drawResult() {
  const ctx = renderer.ctx;
  renderer.clear('#06080f');
  ctx.textAlign = 'center';
  ctx.font = 'bold 56px monospace';
  ctx.fillStyle = '#ffe070';
  ctx.shadowColor = '#ff60a0';
  ctx.shadowBlur = 30;
  ctx.fillText(resultText, canvas.width / 2, canvas.height / 2);
  ctx.shadowBlur = 0;
  ctx.font = '20px monospace';
  ctx.fillStyle = '#a0a8c0';
  ctx.fillText('PRESS ATTACK TO RETURN TO TITLE', canvas.width / 2, canvas.height / 2 + 60);
  ctx.textAlign = 'left';
}

// ===== Menu input handling =====
function handleMenuInput() {
  input.tick();
  const m0 = input.current(0), m1 = input.current(1);
  const pressed = (p, code) => input.pressed(p, code);

  if (scene === SCENE.TITLE) {
    if (pressed(0, INPUT.ATTACK) || pressed(1, INPUT.ATTACK)) {
      scene = SCENE.CHAR_SELECT;
      charLocked = [false, false];
    }
  } else if (scene === SCENE.CHAR_SELECT) {
    for (let p = 0; p < 2; p++) {
      if (charLocked[p]) {
        if (pressed(p, INPUT.SHIELD)) charLocked[p] = false;
        continue;
      }
      if (pressed(p, INPUT.LEFT)) charCursor[p] = (charCursor[p] + ROSTER.length - 1) % ROSTER.length;
      if (pressed(p, INPUT.RIGHT)) charCursor[p] = (charCursor[p] + 1) % ROSTER.length;
      if (pressed(p, INPUT.ATTACK)) { charLocked[p] = true; charSelections[p] = charCursor[p]; }
      if (pressed(p, INPUT.SHIELD)) scene = SCENE.TITLE;
    }
    if (charLocked[0] && charLocked[1] && (pressed(0, INPUT.SPECIAL) || pressed(1, INPUT.SPECIAL))) {
      scene = SCENE.STAGE_SELECT;
    }
  } else if (scene === SCENE.STAGE_SELECT) {
    if (pressed(0, INPUT.LEFT) || pressed(1, INPUT.LEFT)) stageCursor = (stageCursor + 2) % 3;
    if (pressed(0, INPUT.RIGHT) || pressed(1, INPUT.RIGHT)) stageCursor = (stageCursor + 1) % 3;
    if (pressed(0, INPUT.SHIELD) || pressed(1, INPUT.SHIELD)) scene = SCENE.CHAR_SELECT;
    if (pressed(0, INPUT.ATTACK) || pressed(1, INPUT.ATTACK)) {
      world = createWorld(stageCursor);
      scene = SCENE.MATCH;
    }
  } else if (scene === SCENE.RESULT) {
    if (pressed(0, INPUT.ATTACK) || pressed(1, INPUT.ATTACK)) {
      scene = SCENE.TITLE;
      charLocked = [false, false];
    }
  }
}

// ===== Loop =====
const loop = new GameLoop(
  (tick) => {
    menuTick++;
    if (scene === SCENE.MATCH) {
      updateMatch();
    } else {
      handleMenuInput();
    }
  },
  (interp) => {
    if (scene === SCENE.TITLE) drawTitle();
    else if (scene === SCENE.CHAR_SELECT) drawCharSelect();
    else if (scene === SCENE.STAGE_SELECT) drawStageSelect();
    else if (scene === SCENE.MATCH) renderMatch();
    else if (scene === SCENE.RESULT) drawResult();
  }
);

loop.start();

// ===== Multiplayer (optional) =====
// Toggle the lobby with the M key.
window.addEventListener('keydown', (e) => {
  if (e.code === 'KeyM') {
    const el = document.getElementById('lobby');
    el.style.display = el.style.display === 'block' ? 'none' : 'block';
  }
});

const wsProto = location.protocol === 'https:' ? 'wss:' : 'ws:';
const net = new NetClient(`${wsProto}//${location.host}`);
bindLobby(net, () => {});
// Best-effort connect; if no server (e.g. running file://), just ignore.
net.connect().catch(() => {});
