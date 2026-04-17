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
// Shift a hex color darker (negative amount) or lighter (positive amount).
// Used to build gradient card backgrounds from the character's primary color.
function shadeHex(hex, amt) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  if (amt >= 0) {
    r = Math.min(255, r + ((255 - r) * amt) | 0);
    g = Math.min(255, g + ((255 - g) * amt) | 0);
    b = Math.min(255, b + ((255 - b) * amt) | 0);
  } else {
    r = Math.max(0, r + (r * amt) | 0);
    g = Math.max(0, g + (g * amt) | 0);
    b = Math.max(0, b + (b * amt) | 0);
  }
  return '#' + ((r << 16) | (g << 8) | b).toString(16).padStart(6, '0');
}

// Render a segmented pixel stat bar (like a retro RPG HP bar). `pct` is 0..1.
function drawPixelBar(ctx, x, y, w, h, pct, color) {
  // Frame
  ctx.fillStyle = '#0a0d18';
  ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
  ctx.fillStyle = '#2a3050';
  ctx.fillRect(x, y, w, h);
  // Fill segments (divide into chunks for a pixel look)
  const segs = 8;
  const filled = Math.round(segs * Math.max(0, Math.min(1, pct)));
  const sw = (w - (segs - 1)) / segs;
  for (let i = 0; i < filled; i++) {
    ctx.fillStyle = color;
    ctx.fillRect(x + i * (sw + 1), y, sw, h);
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.fillRect(x + i * (sw + 1), y, sw, 1);
  }
}

// Layered atmospheric background: starfield + drifting cursed-energy motes +
// distant domain ring. Used by every menu scene for visual continuity.
function drawBackground(ctx) {
  const W = canvas.width, H = canvas.height;
  // Deep radial gradient backdrop
  const grad = ctx.createRadialGradient(W / 2, H / 2, 100, W / 2, H / 2, 900);
  grad.addColorStop(0, '#0a1028');
  grad.addColorStop(0.5, '#06081a');
  grad.addColorStop(1, '#02030a');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  // Far background: distant "Unlimited Void" concentric rings (very subtle)
  ctx.save();
  ctx.globalAlpha = 0.06;
  ctx.strokeStyle = '#5fd7ff';
  ctx.lineWidth = 1;
  for (let r = 60; r < 600; r += 40) {
    ctx.beginPath();
    ctx.arc(W / 2, H / 2, r + (menuTick * 0.3) % 40, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();

  // Multi-layer starfield (parallax)
  // Tiny distant stars
  for (let i = 0; i < 120; i++) {
    const x = (i * 137 + menuTick * 0.3) % W;
    const y = (i * 73 + i * 11) % H;
    const tw = ((menuTick + i * 7) % 120) / 120;
    const a = 0.2 + Math.sin(tw * Math.PI * 2) * 0.15;
    ctx.fillStyle = `rgba(160,180,220,${a})`;
    ctx.fillRect(x, y, 1, 1);
  }
  // Medium stars
  for (let i = 0; i < 40; i++) {
    const x = (i * 191 + menuTick * 0.6) % W;
    const y = (i * 113 + i * 17) % H;
    const tw = ((menuTick + i * 13) % 90) / 90;
    const a = 0.4 + Math.sin(tw * Math.PI * 2) * 0.3;
    ctx.fillStyle = `rgba(200,220,255,${a})`;
    ctx.fillRect(x, y, 2, 2);
  }
  // Large bright stars with glow crosses
  const brightStars = [[120, 80], [1100, 160], [240, 500], [960, 560], [600, 120]];
  for (let i = 0; i < brightStars.length; i++) {
    const [x, y] = brightStars[i];
    const tw = ((menuTick + i * 40) % 180) / 180;
    const a = 0.7 + Math.sin(tw * Math.PI * 2) * 0.3;
    ctx.fillStyle = `rgba(230,240,255,${a})`;
    ctx.fillRect(x, y, 2, 2);
    ctx.fillStyle = `rgba(95,215,255,${a * 0.7})`;
    ctx.fillRect(x - 2, y, 6, 1);
    ctx.fillRect(x + 0, y - 2, 1, 6);
  }

  // Drifting cursed-energy motes (cyan + pink)
  for (let i = 0; i < 24; i++) {
    const baseX = (i * 53) % W;
    const baseY = (i * 91) % H;
    const driftX = (menuTick * (0.5 + (i % 3) * 0.3)) % W;
    const x = (baseX + driftX) % W;
    const y = (baseY + Math.sin((menuTick + i * 20) * 0.02) * 20) % H;
    const pink = i % 3 === 0;
    ctx.fillStyle = pink ? 'rgba(255,96,160,0.4)' : 'rgba(95,215,255,0.35)';
    ctx.fillRect(x, y, 2, 2);
    ctx.fillStyle = pink ? 'rgba(255,180,210,0.6)' : 'rgba(180,230,255,0.5)';
    ctx.fillRect(x, y, 1, 1);
  }

  // Bottom haze
  const hazeGrad = ctx.createLinearGradient(0, H - 120, 0, H);
  hazeGrad.addColorStop(0, 'rgba(95,20,80,0)');
  hazeGrad.addColorStop(1, 'rgba(95,20,80,0.25)');
  ctx.fillStyle = hazeGrad;
  ctx.fillRect(0, H - 120, W, 120);
}

// Chunky pixel-block text for the title. Renders a string with thick
// pixel blocks colored by `fill`, outlined by `outline`, with an optional
// `glow` halo underneath.
function drawPixelTitle(ctx, text, cx, cy, blockSize, fill, outline, glow) {
  const FONT = {
    J: ['11111', '00010', '00010', '10010', '01100'],
    U: ['10001', '10001', '10001', '10001', '01110'],
    T: ['11111', '00100', '00100', '00100', '00100'],
    S: ['01111', '10000', '01110', '00001', '11110'],
    K: ['10010', '10100', '11000', '10100', '10010'],
    A: ['01110', '10001', '11111', '10001', '10001'],
    I: ['11111', '00100', '00100', '00100', '11111'],
    E: ['11111', '10000', '11110', '10000', '11111'],
    N: ['10001', '11001', '10101', '10011', '10001'],
    D: ['11110', '10001', '10001', '10001', '11110'],
    O: ['01110', '10001', '10001', '10001', '01110'],
    M: ['10001', '11011', '10101', '10001', '10001'],
    C: ['01111', '10000', '10000', '10000', '01111'],
    L: ['10000', '10000', '10000', '10000', '11111'],
    H: ['10001', '10001', '11111', '10001', '10001'],
    R: ['11110', '10001', '11110', '10010', '10001'],
    P: ['11110', '10001', '11110', '10000', '10000'],
    W: ['10001', '10001', '10101', '10101', '01010'],
    Y: ['10001', '10001', '01010', '00100', '00100'],
    G: ['01111', '10000', '10011', '10001', '01111'],
    V: ['10001', '10001', '10001', '01010', '00100'],
    B: ['11110', '10001', '11110', '10001', '11110'],
    F: ['11111', '10000', '11110', '10000', '10000'],
    '1': ['00100', '01100', '00100', '00100', '01110'],
    '2': ['01110', '10001', '00110', '01000', '11111'],
    ' ': ['00000', '00000', '00000', '00000', '00000'],
    ':': ['00000', '00100', '00000', '00100', '00000'],
    '!': ['00100', '00100', '00100', '00000', '00100'],
  };
  const chars = text.split('');
  const charW = 5 * blockSize;
  const spacing = blockSize;
  const totalW = chars.length * charW + (chars.length - 1) * spacing;
  let x = cx - totalW / 2;
  const y = cy;
  // Glow pass
  if (glow) {
    ctx.save();
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = glow;
    for (let ci = 0; ci < chars.length; ci++) {
      const g = FONT[chars[ci]] || FONT[' '];
      for (let r = 0; r < 5; r++) {
        for (let c = 0; c < 5; c++) {
          if (g[r][c] === '1') {
            ctx.fillRect(x + ci * (charW + spacing) + c * blockSize - 2,
                         y + r * blockSize - 2,
                         blockSize + 4, blockSize + 4);
          }
        }
      }
    }
    ctx.restore();
  }
  // Outline pass
  if (outline) {
    ctx.fillStyle = outline;
    for (const dir of [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      for (let ci = 0; ci < chars.length; ci++) {
        const g = FONT[chars[ci]] || FONT[' '];
        for (let r = 0; r < 5; r++) {
          for (let c = 0; c < 5; c++) {
            if (g[r][c] === '1') {
              ctx.fillRect(x + ci * (charW + spacing) + c * blockSize + dir[0] * 2,
                           y + r * blockSize + dir[1] * 2,
                           blockSize, blockSize);
            }
          }
        }
      }
    }
  }
  // Fill pass
  ctx.fillStyle = fill;
  for (let ci = 0; ci < chars.length; ci++) {
    const g = FONT[chars[ci]] || FONT[' '];
    for (let r = 0; r < 5; r++) {
      for (let c = 0; c < 5; c++) {
        if (g[r][c] === '1') {
          ctx.fillRect(x + ci * (charW + spacing) + c * blockSize,
                       y + r * blockSize,
                       blockSize, blockSize);
        }
      }
    }
  }
  // Top-row highlight
  ctx.fillStyle = 'rgba(255,255,255,0.4)';
  for (let ci = 0; ci < chars.length; ci++) {
    const g = FONT[chars[ci]] || FONT[' '];
    for (let c = 0; c < 5; c++) {
      if (g[0][c] === '1') {
        ctx.fillRect(x + ci * (charW + spacing) + c * blockSize,
                     y, blockSize, Math.max(1, blockSize >> 2));
      }
    }
  }
}

function drawTitle() {
  const ctx = renderer.ctx;
  renderer.clear('#04050a');
  drawBackground(ctx);
  const W = canvas.width, H = canvas.height;

  // Domain-expansion backdrop ring behind title (giant)
  ctx.save();
  ctx.globalAlpha = 0.15;
  ctx.strokeStyle = '#5fd7ff';
  ctx.lineWidth = 3;
  const titleRing = 220 + Math.sin(menuTick * 0.02) * 10;
  ctx.beginPath(); ctx.arc(W / 2, 270, titleRing, 0, Math.PI * 2); ctx.stroke();
  ctx.globalAlpha = 0.08;
  ctx.beginPath(); ctx.arc(W / 2, 270, titleRing + 30, 0, Math.PI * 2); ctx.stroke();
  ctx.beginPath(); ctx.arc(W / 2, 270, titleRing + 60, 0, Math.PI * 2); ctx.stroke();
  ctx.restore();

  // Main title — pixel block text for authentic 128-bit feel
  drawPixelTitle(ctx, 'JUJUTSU KAISEN', W / 2, 150, 8, '#ffffff', '#1a4080', '#5fd7ff');
  drawPixelTitle(ctx, 'DOMAIN CLASH', W / 2, 270, 10, '#ff60a0', '#4a0838', '#ff60a0');

  // Decorative energy bars flanking the title
  ctx.save();
  ctx.globalAlpha = 0.8;
  for (let i = 0; i < 3; i++) {
    const a = 0.7 - i * 0.2;
    ctx.fillStyle = `rgba(95,215,255,${a})`;
    ctx.fillRect(80, 200 + i * 6, 260 - i * 20, 3);
    ctx.fillRect(W - 80 - (260 - i * 20), 200 + i * 6, 260 - i * 20, 3);
    ctx.fillStyle = `rgba(255,96,160,${a})`;
    ctx.fillRect(100, 340 + i * 6, 240 - i * 20, 3);
    ctx.fillRect(W - 100 - (240 - i * 20), 340 + i * 6, 240 - i * 20, 3);
  }
  ctx.restore();

  // Subtitle in monospace
  ctx.textAlign = 'center';
  ctx.font = 'bold 20px monospace';
  ctx.fillStyle = '#a8c0e0';
  ctx.fillText('A  SMASH-STYLE  PLATFORM  FIGHTER', W / 2, 400);
  ctx.font = '14px monospace';
  ctx.fillStyle = '#5fd7ff';
  ctx.fillText('•  4 FIGHTERS  •  3 STAGES  •  DOMAIN EXPANSIONS  •', W / 2, 425);

  // Press start — blinking pixel-block style
  const blink = menuTick % 60 < 40;
  if (blink) {
    // Button prompt box
    const pbw = 640, pbh = 60;
    const pbx = (W - pbw) / 2, pby = 470;
    ctx.fillStyle = 'rgba(255,224,112,0.12)';
    ctx.fillRect(pbx, pby, pbw, pbh);
    ctx.strokeStyle = '#ffe070';
    ctx.lineWidth = 2;
    ctx.strokeRect(pbx, pby, pbw, pbh);
    ctx.fillStyle = '#ffe070';
    ctx.fillRect(pbx, pby, 6, pbh);
    ctx.fillRect(pbx + pbw - 6, pby, 6, pbh);
    ctx.font = 'bold 24px monospace';
    ctx.fillStyle = '#ffe070';
    ctx.fillText('PRESS  J  /  X  /  SQUARE  /  Y  TO START', W / 2, pby + 38);
  }

  // Controller hint
  ctx.font = '14px monospace';
  ctx.fillStyle = '#5fd7ff88';
  ctx.fillText('Plug in any controller — Xbox, PlayStation, or Nintendo Switch', W / 2, 555);

  // Small cursed-energy glyphs in the corners (decorative)
  drawCornerGlyph(ctx, 60, 60, '#5fd7ff');
  drawCornerGlyph(ctx, W - 60, 60, '#ff60a0');
  drawCornerGlyph(ctx, 60, H - 140, '#ffe070');
  drawCornerGlyph(ctx, W - 60, H - 140, '#9aff7a');

  drawControllerDiagnostic(ctx);
  ctx.textAlign = 'left';
}

// Decorative corner glyph — rotating pixel cross inscribed in a ring. Used
// to frame the title screen with cursed-energy motifs.
function drawCornerGlyph(ctx, cx, cy, color) {
  ctx.save();
  ctx.globalAlpha = 0.6;
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  const r = 22;
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
  ctx.beginPath(); ctx.arc(cx, cy, r - 6, 0, Math.PI * 2); ctx.stroke();
  // Rotating cross
  ctx.translate(cx, cy);
  ctx.rotate((menuTick * 0.02) % (Math.PI * 2));
  ctx.fillStyle = color;
  ctx.fillRect(-1, -r + 2, 2, r * 2 - 4);
  ctx.fillRect(-r + 2, -1, r * 2 - 4, 2);
  // Center dot
  ctx.fillRect(-2, -2, 4, 4);
  ctx.restore();
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
  const W = canvas.width;
  renderer.clear('#04050a');
  drawBackground(ctx);
  ctx.textAlign = 'center';
  // Title banner — pixel-block title with decorative end caps
  ctx.fillStyle = 'rgba(10,14,30,0.7)';
  ctx.fillRect(W / 2 - 280, 60, 560, 64);
  ctx.strokeStyle = '#5fd7ff';
  ctx.lineWidth = 2;
  ctx.strokeRect(W / 2 - 280, 60, 560, 64);
  ctx.fillStyle = '#5fd7ff';
  ctx.fillRect(W / 2 - 280, 60, 10, 64);
  ctx.fillRect(W / 2 + 270, 60, 10, 64);
  drawPixelTitle(ctx, 'SELECT MODE', W / 2, 80, 4, '#ffffff', '#1a4080', '#5fd7ff');

  const modes = [
    { title: 'LOCAL VERSUS', sub: 'Two players on this device (keyboard / 2 controllers)', accent: '#ffe070' },
    { title: 'HOST ONLINE',  sub: netReady ? 'Create a room and share the code' : 'Server unavailable', accent: '#5fd7ff' },
    { title: 'JOIN ONLINE',  sub: netReady ? 'Type a 6-character room code' : 'Server unavailable', accent: '#ff60a0' },
  ];
  const cardW = 720, cardH = 110;
  const startY = 200;
  for (let i = 0; i < modes.length; i++) {
    const x = (W - cardW) / 2;
    const y = startY + i * (cardH + 18);
    const selected = i === modeCursor;
    const disabled = i > 0 && !netReady;
    const pulse = selected ? (0.25 + Math.sin(menuTick * 0.08) * 0.1) : 0;

    // Card background (gradient)
    const cg = ctx.createLinearGradient(x, y, x + cardW, y);
    if (disabled) { cg.addColorStop(0, '#0c0e14'); cg.addColorStop(1, '#080a10'); }
    else if (selected) { cg.addColorStop(0, shadeHex(modes[i].accent, -0.7)); cg.addColorStop(1, '#06081a'); }
    else { cg.addColorStop(0, '#0c1020'); cg.addColorStop(1, '#080a14'); }
    ctx.fillStyle = cg;
    ctx.fillRect(x, y, cardW, cardH);

    // Inner double-stroke frame
    ctx.strokeStyle = disabled ? '#2a2a30' : (selected ? modes[i].accent : '#2a3050');
    ctx.lineWidth = selected ? 3 : 1;
    ctx.strokeRect(x, y, cardW, cardH);
    if (selected) {
      ctx.strokeStyle = `rgba(255,255,255,${pulse})`;
      ctx.strokeRect(x - 4, y - 4, cardW + 8, cardH + 8);
    }

    // Left accent bar
    ctx.fillStyle = disabled ? '#2a2a30' : modes[i].accent;
    ctx.fillRect(x, y, 8, cardH);
    ctx.fillRect(x + cardW - 8, y, 8, cardH);
    // Corner pixel notches (selected only)
    if (selected) {
      ctx.fillStyle = modes[i].accent;
      ctx.fillRect(x + 10, y + 6, 14, 2); ctx.fillRect(x + 10, y + 6, 2, 14);
      ctx.fillRect(x + cardW - 24, y + 6, 14, 2); ctx.fillRect(x + cardW - 12, y + 6, 2, 14);
      ctx.fillRect(x + 10, y + cardH - 8, 14, 2); ctx.fillRect(x + 10, y + cardH - 20, 2, 14);
      ctx.fillRect(x + cardW - 24, y + cardH - 8, 14, 2); ctx.fillRect(x + cardW - 12, y + cardH - 20, 2, 14);
    }

    // Chevron cursor on left side (animated)
    if (selected) {
      const sh = Math.sin(menuTick * 0.12) * 4;
      ctx.fillStyle = modes[i].accent;
      const cx = x - 22 + sh, cy = y + cardH / 2;
      ctx.beginPath();
      ctx.moveTo(cx, cy - 10); ctx.lineTo(cx + 14, cy); ctx.lineTo(cx, cy + 10);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.fillRect(cx, cy - 10, 3, 20);
    }

    // Title + sub
    ctx.font = 'bold 28px monospace';
    ctx.fillStyle = disabled ? '#444' : (selected ? '#ffe070' : '#fff');
    ctx.shadowColor = selected ? modes[i].accent : 'transparent';
    ctx.shadowBlur = selected ? 12 : 0;
    ctx.fillText(modes[i].title, W / 2, y + 44);
    ctx.shadowBlur = 0;
    ctx.font = '15px monospace';
    ctx.fillStyle = disabled ? '#333' : '#a0a8c0';
    ctx.fillText(modes[i].sub, W / 2, y + 72);

    // Tiny mode glyph on right side
    if (!disabled) {
      const gx = x + cardW - 44, gy = y + cardH / 2;
      ctx.strokeStyle = modes[i].accent;
      ctx.lineWidth = 1.5;
      ctx.globalAlpha = selected ? 0.9 : 0.5;
      ctx.beginPath(); ctx.arc(gx, gy, 12, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.arc(gx, gy, 6, 0, Math.PI * 2); ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.fillStyle = modes[i].accent;
      ctx.fillRect(gx - 1, gy - 1, 2, 2);
    }
  }

  // Footer hint
  ctx.font = '14px monospace';
  ctx.fillStyle = '#5fd7ff88';
  ctx.fillText('UP/DOWN to choose  •  Confirm: J / Xbox X / PS Square / Switch Y', W / 2, 640);
  ctx.fillText('Back: SHIELD / L-shoulder', W / 2, 660);
  drawControllerDiagnostic(ctx);
  ctx.textAlign = 'left';
}

function drawLobby() {
  const ctx = renderer.ctx;
  const W = canvas.width;
  renderer.clear('#04050a');
  drawBackground(ctx);
  ctx.textAlign = 'center';

  // Title banner
  const titleText = lobbyMode === 'host' ? 'HOSTING ROOM' : 'JOIN ROOM';
  ctx.fillStyle = 'rgba(10,14,30,0.7)';
  ctx.fillRect(W / 2 - 300, 60, 600, 64);
  ctx.strokeStyle = '#5fd7ff';
  ctx.lineWidth = 2;
  ctx.strokeRect(W / 2 - 300, 60, 600, 64);
  ctx.fillStyle = '#5fd7ff';
  ctx.fillRect(W / 2 - 300, 60, 10, 64);
  ctx.fillRect(W / 2 + 290, 60, 10, 64);
  drawPixelTitle(ctx, titleText, W / 2, 80, 4, '#ffffff', '#1a4080', '#5fd7ff');

  // Code box — pixel-framed with chunky per-digit tiles
  const boxW = 640, boxH = 220;
  const x = (W - boxW) / 2;
  const y = 210;
  // Outer frame with inset
  ctx.fillStyle = '#0a0d18';
  ctx.fillRect(x, y, boxW, boxH);
  const frameGrad = ctx.createLinearGradient(x, y, x, y + boxH);
  frameGrad.addColorStop(0, 'rgba(95,215,255,0.15)');
  frameGrad.addColorStop(1, 'rgba(255,96,160,0.10)');
  ctx.fillStyle = frameGrad;
  ctx.fillRect(x, y, boxW, boxH);
  ctx.strokeStyle = '#5fd7ff';
  ctx.lineWidth = 3;
  ctx.strokeRect(x, y, boxW, boxH);
  // Corner brackets (L-shapes)
  ctx.fillStyle = '#ffe070';
  const cbs = 18;
  ctx.fillRect(x - 2, y - 2, cbs, 3); ctx.fillRect(x - 2, y - 2, 3, cbs);
  ctx.fillRect(x + boxW - cbs + 2, y - 2, cbs, 3); ctx.fillRect(x + boxW - 1, y - 2, 3, cbs);
  ctx.fillRect(x - 2, y + boxH - 1, cbs, 3); ctx.fillRect(x - 2, y + boxH - cbs + 2, 3, cbs);
  ctx.fillRect(x + boxW - cbs + 2, y + boxH - 1, cbs, 3); ctx.fillRect(x + boxW - 1, y + boxH - cbs + 2, 3, cbs);

  // Build raw 6-char display code
  let rawCode;
  if (lobbyMode === 'host') {
    rawCode = (lobbyCode || '------').padEnd(6, '-').slice(0, 6);
  } else {
    rawCode = (lobbyJoinInput + '______').slice(0, 6);
  }
  // Digit tiles
  const tileW = 72, tileH = 108, tileGap = 10;
  const tilesTotal = tileW * 6 + tileGap * 5;
  const tx0 = x + (boxW - tilesTotal) / 2;
  const ty = y + 40;
  for (let i = 0; i < 6; i++) {
    const tx = tx0 + i * (tileW + tileGap);
    const ch = rawCode[i];
    const filled = ch !== '_' && ch !== '-';
    const cursor = lobbyMode === 'join' && i === lobbyJoinInput.length;
    // Tile shadow
    ctx.fillStyle = '#04060c';
    ctx.fillRect(tx + 3, ty + 3, tileW, tileH);
    // Tile body
    const tg = ctx.createLinearGradient(tx, ty, tx, ty + tileH);
    tg.addColorStop(0, filled ? '#2a2030' : '#12161f');
    tg.addColorStop(1, '#05070c');
    ctx.fillStyle = tg;
    ctx.fillRect(tx, ty, tileW, tileH);
    // Inner frame
    ctx.strokeStyle = filled ? '#ffe070' : '#2a3050';
    ctx.lineWidth = 2;
    ctx.strokeRect(tx + 2, ty + 2, tileW - 4, tileH - 4);
    // Top highlight line
    ctx.fillStyle = filled ? 'rgba(255,224,112,0.25)' : 'rgba(95,215,255,0.15)';
    ctx.fillRect(tx + 2, ty + 2, tileW - 4, 3);
    // Digit
    if (filled) {
      ctx.font = 'bold 64px monospace';
      ctx.fillStyle = '#ffe070';
      ctx.shadowColor = '#ffe070'; ctx.shadowBlur = 18;
      ctx.fillText(ch, tx + tileW / 2, ty + tileH - 28);
      ctx.shadowBlur = 0;
    }
    // Blinking cursor slot (join mode)
    if (cursor && menuTick % 40 < 22) {
      ctx.fillStyle = '#5fd7ff';
      ctx.fillRect(tx + tileW / 2 - 14, ty + tileH - 22, 28, 4);
    }
  }

  // Flavor text under tiles
  ctx.font = '16px monospace';
  ctx.fillStyle = '#a0a8c0';
  if (lobbyMode === 'host') {
    ctx.fillText('Share this code with your opponent', W / 2, y + boxH - 18);
  } else {
    ctx.fillText('Type the code on your keyboard, then press ENTER', W / 2, y + boxH - 18);
  }

  // Status banner
  const sbw = 520, sbh = 46;
  const sbx = (W - sbw) / 2, sby = 490;
  ctx.fillStyle = 'rgba(10,14,30,0.8)';
  ctx.fillRect(sbx, sby, sbw, sbh);
  ctx.strokeStyle = '#5fd7ff';
  ctx.lineWidth = 1;
  ctx.strokeRect(sbx, sby, sbw, sbh);
  // Animated activity dot
  const pulseA = 0.5 + Math.sin(menuTick * 0.15) * 0.4;
  ctx.fillStyle = `rgba(95,215,255,${pulseA})`;
  ctx.fillRect(sbx + 16, sby + sbh / 2 - 3, 6, 6);
  ctx.font = '16px monospace';
  ctx.fillStyle = '#5fd7ff';
  ctx.fillText(lobbyStatus, W / 2 + 12, sby + 29);

  // Footer
  ctx.font = '14px monospace';
  ctx.fillStyle = '#5fd7ff88';
  ctx.fillText('SHIELD / BACKSPACE to return', W / 2, 670);
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
  const W = canvas.width;
  renderer.clear('#04050a');
  drawBackground(ctx);
  ctx.textAlign = 'center';

  // Title banner
  ctx.fillStyle = 'rgba(10,14,30,0.7)';
  ctx.fillRect(W / 2 - 320, 30, 640, 56);
  ctx.strokeStyle = '#5fd7ff';
  ctx.lineWidth = 2;
  ctx.strokeRect(W / 2 - 320, 30, 640, 56);
  ctx.fillStyle = '#5fd7ff';
  ctx.fillRect(W / 2 - 320, 30, 10, 56);
  ctx.fillRect(W / 2 + 310, 30, 10, 56);
  ctx.font = 'bold 32px monospace';
  ctx.fillStyle = '#ffffff';
  ctx.shadowColor = '#5fd7ff'; ctx.shadowBlur = 14;
  ctx.fillText('ASSIGN CONTROLS', W / 2, 68);
  ctx.shadowBlur = 0;

  ctx.font = '15px monospace';
  ctx.fillStyle = '#a0a8c0';
  ctx.fillText('Each device picks its player slot. They will not control the same player.', W / 2, 108);

  const cardW = 780, cardH = 104;
  const startY = 140;
  const diag = input.diagnostics();
  const padNames = { pad0: '(none connected)', pad1: '(none connected)' };
  for (const d of diag) {
    padNames['pad' + d.slot] = `${d.kind} — ${d.id.length > 38 ? d.id.slice(0, 35) + '...' : d.id}`;
  }

  for (let i = 0; i < DEVICE_KEYS.length; i++) {
    const key = DEVICE_KEYS[i];
    const x = (W - cardW) / 2;
    const y = startY + i * (cardH + 16);
    const slot = input.getAssignment(key);
    const accent = slot === 0 ? '#ffe070' : (slot === 1 ? '#ff60a0' : '#5fd7ff');
    const assigned = slot !== -1;

    // Card gradient
    const cg = ctx.createLinearGradient(x, y, x + cardW, y);
    cg.addColorStop(0, assigned ? shadeHex(accent, -0.75) : '#0a0d18');
    cg.addColorStop(1, '#05060c');
    ctx.fillStyle = cg;
    ctx.fillRect(x, y, cardW, cardH);
    // Frame
    ctx.strokeStyle = assigned ? accent : '#2a3050';
    ctx.lineWidth = assigned ? 3 : 1;
    ctx.strokeRect(x, y, cardW, cardH);
    // Left accent bar
    ctx.fillStyle = accent + (assigned ? '' : '55');
    ctx.fillRect(x, y, 6, cardH);

    // Device icon (pixel glyph for keyboard / gamepad)
    const ix = x + 30, iy = y + cardH / 2;
    ctx.fillStyle = assigned ? accent : '#5fd7ff';
    if (key === 'kb1') {
      // Pixel keyboard — grid of keys
      ctx.fillRect(ix - 20, iy - 12, 40, 24);
      ctx.fillStyle = '#0a0d18';
      for (let r = 0; r < 3; r++)
        for (let c = 0; c < 5; c++)
          ctx.fillRect(ix - 19 + c * 8, iy - 11 + r * 8, 6, 6);
    } else {
      // Pixel gamepad — squared body with two thumbsticks
      ctx.fillRect(ix - 22, iy - 8, 44, 18);
      ctx.fillRect(ix - 18, iy - 12, 36, 24);
      ctx.fillStyle = '#0a0d18';
      ctx.fillRect(ix - 14, iy - 4, 6, 6);
      ctx.fillRect(ix + 8, iy - 4, 6, 6);
      ctx.fillStyle = assigned ? '#ffffff' : '#9aff7a';
      ctx.fillRect(ix - 12, iy - 2, 2, 2);
      ctx.fillRect(ix + 10, iy - 2, 2, 2);
    }

    ctx.textAlign = 'left';
    ctx.font = 'bold 22px monospace';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(DEVICE_LABELS[key], x + 70, y + 36);
    ctx.font = '13px monospace';
    ctx.fillStyle = '#a0a8c0';
    if (key.startsWith('pad')) ctx.fillText(padNames[key], x + 70, y + 58);
    else ctx.fillText('Move WASD  Attack J  Special K  Jump Space  Shield L', x + 70, y + 58);

    // Hint strip
    ctx.font = '12px monospace';
    ctx.fillStyle = '#5fd7ff88';
    ctx.fillText('LEFT → P1    RIGHT → P2    DOWN → unassign', x + 70, y + 82);

    // Slot badge on right
    const badgeW = 160, badgeH = cardH - 20;
    const bx = x + cardW - badgeW - 12, by = y + 10;
    ctx.fillStyle = assigned ? accent : '#1a1e28';
    ctx.fillRect(bx, by, badgeW, badgeH);
    ctx.strokeStyle = assigned ? shadeHex(accent, 0.4) : '#2a3050';
    ctx.lineWidth = 2;
    ctx.strokeRect(bx, by, badgeW, badgeH);
    // Badge inner fill
    if (assigned) {
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.fillRect(bx + 6, by + 6, badgeW - 12, badgeH - 12);
    }
    ctx.textAlign = 'center';
    ctx.font = 'bold 24px monospace';
    let label;
    if (slot === 0) label = 'PLAYER 1';
    else if (slot === 1) label = 'PLAYER 2';
    else label = 'UNASSIGNED';
    ctx.fillStyle = assigned ? '#ffffff' : '#666';
    ctx.shadowColor = assigned ? accent : 'transparent';
    ctx.shadowBlur = assigned ? 12 : 0;
    ctx.fillText(label, bx + badgeW / 2, by + badgeH / 2 + 8);
    ctx.shadowBlur = 0;

    ctx.textAlign = 'left';
  }

  // Footer
  ctx.textAlign = 'center';
  const hasP1 = DEVICE_KEYS.some(k => input.getAssignment(k) === 0);
  const hasP2 = DEVICE_KEYS.some(k => input.getAssignment(k) === 1);
  if (hasP1 && hasP2) {
    const blink = menuTick % 60 < 40;
    if (blink) {
      const pbw = 620, pbh = 50;
      const pbx = (W - pbw) / 2, pby = 480;
      ctx.fillStyle = 'rgba(255,224,112,0.12)';
      ctx.fillRect(pbx, pby, pbw, pbh);
      ctx.strokeStyle = '#ffe070';
      ctx.lineWidth = 2;
      ctx.strokeRect(pbx, pby, pbw, pbh);
      ctx.fillStyle = '#ffe070';
      ctx.fillRect(pbx, pby, 5, pbh);
      ctx.fillRect(pbx + pbw - 5, pby, 5, pbh);
      ctx.font = 'bold 20px monospace';
      ctx.fillStyle = '#ffe070';
      ctx.fillText('PRESS JUMP ON ANY DEVICE TO CONTINUE', W / 2, pby + 33);
    }
  } else {
    ctx.font = 'bold 17px monospace';
    ctx.fillStyle = '#ff6060';
    ctx.fillText('At least one device must be assigned to P1 and one to P2', W / 2, 500);
  }
  ctx.font = '13px monospace';
  ctx.fillStyle = '#5fd7ff88';
  ctx.fillText('Back: SHIELD on any device', W / 2, 555);
  drawControllerDiagnostic(ctx);
  ctx.textAlign = 'left';
}

function drawCharSelect() {
  const ctx = renderer.ctx;
  const W = canvas.width;
  renderer.clear('#06080f');
  drawBackground(ctx);
  ctx.textAlign = 'center';
  // Title banner with decorative bars
  ctx.fillStyle = 'rgba(10,14,30,0.7)';
  ctx.fillRect(W / 2 - 320, 40, 640, 56);
  ctx.strokeStyle = '#5fd7ff';
  ctx.lineWidth = 2;
  ctx.strokeRect(W / 2 - 320, 40, 640, 56);
  ctx.fillStyle = '#5fd7ff';
  ctx.fillRect(W / 2 - 320, 40, 10, 56);
  ctx.fillRect(W / 2 + 310, 40, 10, 56);
  ctx.font = 'bold 36px monospace';
  ctx.fillStyle = '#ffffff';
  ctx.shadowColor = '#5fd7ff'; ctx.shadowBlur = 16;
  ctx.fillText('CHARACTER SELECT', W / 2, 80);
  ctx.shadowBlur = 0;
  if (isOnline) {
    ctx.font = '14px monospace';
    ctx.fillStyle = '#5fd7ff';
    const youLabel = `YOU = P${net.localSlot + 1}`;
    const roleLabel = net.localSlot === 0 ? '(host — picks stage)' : '(guest)';
    ctx.fillText(`ONLINE  ${lobbyCode}  •  ${youLabel} ${roleLabel}`, W / 2, 112);
  }

  const slotW = 240, slotH = 300;
  const startX = (W - slotW * ROSTER.length - 20 * (ROSTER.length - 1)) / 2;
  for (let i = 0; i < ROSTER.length; i++) {
    const key = ROSTER[i];
    const stats = FIGHTER_STATS[key];
    const x = startX + i * (slotW + 20);
    const y = 140;
    // Card backdrop — two-tone gradient keyed to character color
    const cardGrad = ctx.createLinearGradient(x, y, x, y + slotH);
    cardGrad.addColorStop(0, shadeHex(stats.palette.primary, 0.2));
    cardGrad.addColorStop(1, '#06080f');
    ctx.fillStyle = cardGrad;
    ctx.fillRect(x, y, slotW, slotH);
    // Inner border
    ctx.strokeStyle = '#2a3050';
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 4, y + 4, slotW - 8, slotH - 8);
    // Portrait panel (darker area where sprite lives)
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(x + 8, y + 60, slotW - 16, slotH - 100);
    // Portrait accent corners
    ctx.fillStyle = stats.palette.accent;
    ctx.fillRect(x + 8, y + 60, 10, 2);
    ctx.fillRect(x + 8, y + 60, 2, 10);
    ctx.fillRect(x + slotW - 18, y + 60, 10, 2);
    ctx.fillRect(x + slotW - 10, y + 60, 2, 10);
    ctx.fillRect(x + 8, y + slotH - 42, 2, 10);
    ctx.fillRect(x + 8, y + slotH - 34, 10, 2);
    ctx.fillRect(x + slotW - 10, y + slotH - 42, 2, 10);
    ctx.fillRect(x + slotW - 18, y + slotH - 34, 10, 2);
    // Cursed-energy ground circle beneath character
    ctx.save();
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = stats.palette.accent;
    ctx.beginPath();
    ctx.ellipse(x + slotW / 2, y + slotH - 50, 48, 8, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 0.7;
    ctx.beginPath();
    ctx.ellipse(x + slotW / 2, y + slotH - 50, 32, 5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    // Character sprite (idle animation)
    drawSprite(ctx, key, (menuTick % 60 < 30) ? 'idle' : 'idle2', x + slotW / 2, y + slotH - 46, 1);
    // Name banner at top of card
    ctx.fillStyle = shadeHex(stats.palette.primary, -0.3);
    ctx.fillRect(x + 8, y + 12, slotW - 16, 36);
    ctx.fillStyle = stats.palette.accent;
    ctx.fillRect(x + 8, y + 12, slotW - 16, 2);
    ctx.fillRect(x + 8, y + 46, slotW - 16, 2);
    ctx.font = 'bold 20px monospace';
    ctx.fillStyle = stats.palette.accent;
    ctx.shadowColor = stats.palette.accent; ctx.shadowBlur = 6;
    ctx.fillText(stats.name.toUpperCase(), x + slotW / 2, y + 36);
    ctx.shadowBlur = 0;
    // Stats at bottom of card (pixel bars)
    const statsY = y + slotH - 26;
    ctx.font = 'bold 10px monospace';
    ctx.textAlign = 'left';
    ctx.fillStyle = '#a0a8c0';
    ctx.fillText('WT', x + 16, statsY);
    ctx.fillText('SPD', x + 94, statsY);
    ctx.fillText('CE', x + 172, statsY);
    // Pixel bars
    drawPixelBar(ctx, x + 34, statsY - 7, 50, 6, Math.min(1, stats.weight / 120), stats.palette.accent);
    drawPixelBar(ctx, x + 122, statsY - 7, 42, 6, Math.min(1, stats.runSpeed / 2.5), stats.palette.accent);
    drawPixelBar(ctx, x + 194, statsY - 7, 38, 6, Math.min(1, stats.ceMax / 120), stats.palette.accent);
    ctx.textAlign = 'center';
  }
  // Cursors — thick animated pixel frames
  for (let p = 0; p < 2; p++) {
    const i = charCursor[p];
    const x = startX + i * (slotW + 20);
    const y = 140;
    const color = p === 0 ? '#ffe070' : '#ff60a0';
    const thick = charLocked[p] ? 6 : 4;
    const pulse = Math.sin((menuTick + p * 30) * 0.1) * 2;
    const off = -6 + p * 6 + pulse * 0;
    ctx.strokeStyle = color;
    ctx.lineWidth = thick;
    ctx.strokeRect(x + off, y + off, slotW - off * 2, slotH - off * 2);
    // Corner accents (L-shapes at each corner)
    ctx.fillStyle = color;
    const cs = 14; // corner size
    ctx.fillRect(x + off - 4, y + off - 4, cs, 4);
    ctx.fillRect(x + off - 4, y + off - 4, 4, cs);
    ctx.fillRect(x + slotW - off - cs + 4, y + off - 4, cs, 4);
    ctx.fillRect(x + slotW - off, y + off - 4, 4, cs);
    ctx.fillRect(x + off - 4, y + slotH - off, cs, 4);
    ctx.fillRect(x + off - 4, y + slotH - off - cs + 4, 4, cs);
    ctx.fillRect(x + slotW - off - cs + 4, y + slotH - off, cs, 4);
    ctx.fillRect(x + slotW - off, y + slotH - off - cs + 4, 4, cs);
    // Player label banner
    const plX = x + slotW / 2, plY = y - 24;
    ctx.fillStyle = color;
    ctx.fillRect(plX - 60, plY - 12, 120, 22);
    ctx.fillStyle = '#000';
    ctx.font = 'bold 14px monospace';
    ctx.fillText(charLocked[p] ? `P${p + 1} READY!` : `P${p + 1}`, plX, plY + 4);
    // "READY" bright flash effect
    if (charLocked[p]) {
      ctx.save();
      ctx.globalAlpha = 0.15 + (menuTick % 30) / 60;
      ctx.fillStyle = color;
      ctx.fillRect(x + off, y + off, slotW - off * 2, slotH - off * 2);
      ctx.restore();
    }
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
  const W = canvas.width;
  renderer.clear('#06080f');
  drawBackground(ctx);
  ctx.textAlign = 'center';

  // Title banner
  ctx.fillStyle = 'rgba(10,14,30,0.7)';
  ctx.fillRect(W / 2 - 280, 40, 560, 56);
  ctx.strokeStyle = '#ffe070';
  ctx.lineWidth = 2;
  ctx.strokeRect(W / 2 - 280, 40, 560, 56);
  ctx.fillStyle = '#ffe070';
  ctx.fillRect(W / 2 - 280, 40, 10, 56);
  ctx.fillRect(W / 2 + 270, 40, 10, 56);
  ctx.font = 'bold 36px monospace';
  ctx.fillStyle = '#ffffff';
  ctx.shadowColor = '#ffe070'; ctx.shadowBlur = 16;
  ctx.fillText('STAGE SELECT', W / 2, 80);
  ctx.shadowBlur = 0;

  if (isOnline) {
    ctx.font = '14px monospace';
    ctx.fillStyle = '#5fd7ff';
    const hostLine = net.localSlot === 0
      ? 'ONLINE — you are the host. Pick the stage and press ATTACK to start.'
      : 'ONLINE — waiting for host to pick the stage...';
    ctx.fillText(hostLine, W / 2, 112);
  }

  const slotW = 360, slotH = 240;
  const startX = (W - slotW * 3 - 40) / 2;
  const stageBlurb = [
    'Moonlit training grounds.',
    'Underground metro, train hazard.',
    'Destroyed skyline, no platforms.',
  ];
  for (let i = 0; i < 3; i++) {
    const x = startX + i * (slotW + 20);
    const y = 160;
    // Card backdrop
    ctx.fillStyle = '#0a0d18';
    ctx.fillRect(x, y, slotW, slotH);
    // Mini-rendered stage preview
    ctx.save();
    ctx.beginPath(); ctx.rect(x + 4, y + 4, slotW - 8, slotH - 8); ctx.clip();
    const tmpStage = new (STAGES[i])();
    ctx.translate(x + 4, y + 4);
    ctx.scale((slotW - 8) / 1280, (slotH - 8) / 720);
    tmpStage.background(ctx, 1280, 720);
    // Draw ground + platforms
    ctx.fillStyle = '#586878';
    if (tmpStage.ground) ctx.fillRect(tmpStage.ground.x, tmpStage.ground.y, tmpStage.ground.w, 16);
    ctx.fillStyle = '#789098';
    if (tmpStage.ground) ctx.fillRect(tmpStage.ground.x, tmpStage.ground.y, tmpStage.ground.w, 4);
    if (tmpStage.platforms) {
      for (const p of tmpStage.platforms) {
        ctx.fillStyle = '#4a586a';
        ctx.fillRect(p.x, p.y, p.w, 12);
        ctx.fillStyle = '#6a7888';
        ctx.fillRect(p.x, p.y, p.w, 3);
      }
    }
    ctx.restore();
    // Frame
    const selected = i === stageCursor;
    ctx.strokeStyle = selected ? '#ffe070' : '#2a3050';
    ctx.lineWidth = selected ? 5 : 2;
    ctx.strokeRect(x, y, slotW, slotH);
    if (selected) {
      // Corner markers (L-shapes)
      ctx.fillStyle = '#ffe070';
      const cs = 16;
      ctx.fillRect(x - 4, y - 4, cs, 4);
      ctx.fillRect(x - 4, y - 4, 4, cs);
      ctx.fillRect(x + slotW - cs + 4, y - 4, cs, 4);
      ctx.fillRect(x + slotW, y - 4, 4, cs);
      ctx.fillRect(x - 4, y + slotH, cs, 4);
      ctx.fillRect(x - 4, y + slotH - cs + 4, 4, cs);
      ctx.fillRect(x + slotW - cs + 4, y + slotH, cs, 4);
      ctx.fillRect(x + slotW, y + slotH - cs + 4, 4, cs);
    }
    // Stage name banner below card
    ctx.fillStyle = selected ? 'rgba(255,224,112,0.2)' : 'rgba(20,24,40,0.8)';
    ctx.fillRect(x, y + slotH + 10, slotW, 34);
    ctx.strokeStyle = selected ? '#ffe070' : '#2a3050';
    ctx.lineWidth = 1;
    ctx.strokeRect(x, y + slotH + 10, slotW, 34);
    ctx.font = 'bold 18px monospace';
    ctx.fillStyle = selected ? '#ffe070' : '#ffffff';
    ctx.fillText(STAGE_NAMES[i], x + slotW / 2, y + slotH + 32);
    // Blurb
    ctx.font = '12px monospace';
    ctx.fillStyle = '#a0a8c0';
    ctx.fillText(stageBlurb[i], x + slotW / 2, y + slotH + 54);
  }
  ctx.font = 'bold 18px monospace';
  ctx.fillStyle = '#ffe070';
  ctx.fillText('LEFT / RIGHT to choose  •  Start: J / Xbox X / PS Square / Switch Y', W / 2, 520);
  ctx.font = '14px monospace';
  ctx.fillStyle = '#a0a8c0';
  ctx.fillText('Back: L / R-shoulder', W / 2, 544);
  ctx.textAlign = 'left';
}

function drawResult() {
  const ctx = renderer.ctx;
  const W = canvas.width, H = canvas.height;
  renderer.clear('#06080f');
  drawBackground(ctx);
  ctx.textAlign = 'center';

  const cx = W / 2, cy = H / 2 - 40;

  // Radial victory sunburst rays rotating behind winner
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(menuTick * 0.005);
  ctx.globalAlpha = 0.25;
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    const r1 = 80, r2 = 520;
    const col = i % 2 === 0 ? '#ffe070' : '#ff60a0';
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * r1, Math.sin(a) * r1);
    ctx.lineTo(Math.cos(a + 0.04) * r2, Math.sin(a + 0.04) * r2);
    ctx.lineTo(Math.cos(a - 0.04) * r2, Math.sin(a - 0.04) * r2);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();

  // Expanding concentric rings
  ctx.save();
  for (let r = 0; r < 4; r++) {
    const radius = 60 + r * 40 + (menuTick * 0.8) % 40;
    const a = 0.4 - r * 0.09;
    ctx.globalAlpha = Math.max(0, a);
    ctx.strokeStyle = '#ffe070';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(cx, cy, radius, 0, Math.PI * 2); ctx.stroke();
  }
  ctx.restore();

  // Confetti / cursed-energy particles falling
  for (let i = 0; i < 36; i++) {
    const px = (i * 71 + (menuTick * 1.2)) % W;
    const py = ((i * 37 + menuTick * (1 + (i % 3) * 0.4)) % (H + 40)) - 20;
    const drift = Math.sin((menuTick + i * 30) * 0.04) * 8;
    const color = (i % 3 === 0) ? '#ffe070' : (i % 3 === 1) ? '#ff60a0' : '#5fd7ff';
    ctx.fillStyle = color;
    ctx.fillRect(px + drift, py, 3, 3);
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.fillRect(px + drift, py, 1, 1);
  }

  // Winner banner — pixel title
  // Parse resultText (e.g. "P1 WINS", "PLAYER 1 WINS", "DRAW").
  const winText = (resultText || 'DRAW').toUpperCase();
  // Upper "WINNER!" flourish
  drawPixelTitle(ctx, 'WINNER!', cx, cy - 130, 6, '#ffe070', '#5a3810', '#ffe070');

  // Framed main banner
  const bw = 640, bh = 100;
  const bx = cx - bw / 2, by = cy - 30;
  ctx.fillStyle = 'rgba(10,14,30,0.85)';
  ctx.fillRect(bx, by, bw, bh);
  ctx.strokeStyle = '#ffe070';
  ctx.lineWidth = 3;
  ctx.strokeRect(bx, by, bw, bh);
  // Double frame
  ctx.strokeStyle = '#ff60a0';
  ctx.lineWidth = 1;
  ctx.strokeRect(bx + 6, by + 6, bw - 12, bh - 12);
  // Corner pixel bolts
  ctx.fillStyle = '#ff60a0';
  for (const [ox, oy] of [[bx - 3, by - 3], [bx + bw - 9, by - 3], [bx - 3, by + bh - 9], [bx + bw - 9, by + bh - 9]]) {
    ctx.fillRect(ox, oy, 12, 12);
    ctx.fillStyle = '#ffe070';
    ctx.fillRect(ox + 3, oy + 3, 6, 6);
    ctx.fillStyle = '#ff60a0';
  }

  // Main winner text — try pixel font, fallback to monospace if chars unsupported
  ctx.font = 'bold 52px monospace';
  ctx.fillStyle = '#ffffff';
  ctx.shadowColor = '#ff60a0'; ctx.shadowBlur = 20;
  ctx.fillText(winText, cx, by + 66);
  ctx.shadowBlur = 0;

  // Press-to-continue prompt (blinking)
  const blink = menuTick % 60 < 40;
  if (blink) {
    const pbw = 680, pbh = 52;
    const pbx = cx - pbw / 2, pby = cy + 130;
    ctx.fillStyle = 'rgba(95,215,255,0.10)';
    ctx.fillRect(pbx, pby, pbw, pbh);
    ctx.strokeStyle = '#5fd7ff';
    ctx.lineWidth = 2;
    ctx.strokeRect(pbx, pby, pbw, pbh);
    ctx.fillStyle = '#5fd7ff';
    ctx.fillRect(pbx, pby, 5, pbh);
    ctx.fillRect(pbx + pbw - 5, pby, 5, pbh);
    ctx.font = 'bold 20px monospace';
    ctx.fillStyle = '#5fd7ff';
    ctx.fillText('PRESS J / X / SQUARE / Y TO RETURN TO TITLE', cx, pby + 34);
  }

  // Corner cursed-energy glyphs
  drawCornerGlyph(ctx, 60, 60, '#ffe070');
  drawCornerGlyph(ctx, W - 60, 60, '#ffe070');
  drawCornerGlyph(ctx, 60, H - 60, '#ff60a0');
  drawCornerGlyph(ctx, W - 60, H - 60, '#ff60a0');

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
