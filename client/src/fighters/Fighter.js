// Base Fighter class. State machine, movement, attack execution, hitbox spawning.
// Per-character files extend this and provide a `moves` table + `domainClass`.

import { CONSTANTS } from '../../../shared/Constants.js';
import { INPUT, isPressed, isDomainInput } from '../../../shared/InputCodes.js';
import { applyGravity, resolveStageCollision, checkBlastZones, aabbOverlap } from '../engine/Physics.js';
import { regenCE, spendCE, hasCE } from '../systems/CursedEnergy.js';
import { applyHit } from '../systems/DamageSystem.js';
import { DomainMeter, DOMAIN_BY_FIGHTER } from '../systems/DomainExpansion.js';

let nextId = 1;

export class Fighter {
  constructor(opts) {
    this.id = nextId++;
    this.character = opts.character;       // 'gojo' | 'yuji' | ...
    this.displayName = opts.displayName || opts.character;
    this.playerIndex = opts.playerIndex;   // 0 or 1
    this.x = opts.x ?? 400;
    this.y = opts.y ?? 400;
    this.spawnX = this.x; this.spawnY = this.y;
    this.vx = 0; this.vy = 0;
    this.width = 44; this.height = 90;
    this.facing = opts.facing ?? 1;
    this.weight = opts.weight ?? 100;
    this.walkSpeed = opts.walkSpeed ?? 1.1;
    this.runSpeed = opts.runSpeed ?? 1.8;
    this.jumpStrength = opts.jumpHeight ?? 14;
    this.airSpeed = opts.airSpeed ?? 1.0;
    this.fallSpeed = opts.fallSpeed ?? 1.5;
    this.ceMax = opts.ceMax ?? 100;
    this.ce = this.ceMax;
    this.ceRegen = opts.ceRegen ?? 0.15;
    this.percent = 0;
    this.stocks = 3;
    this.grounded = false;
    this.fastFall = false;
    this.state = 'idle';
    this.stateTimer = 0;
    this.actionTimer = 0;
    this.currentMove = null;
    this.activeHitbox = null;
    this.hitstun = 0;
    this.hitstop = 0;
    this.tumble = false;
    this.invulnFrames = 0;
    this.shieldHP = CONSTANTS.SHIELD_HP;
    this.shielding = false;
    this.shieldBroken = false;
    this.stunTimer = 0;
    this.jumpsLeft = 2;
    this.airdodgeUsed = false;
    this.lastHitBy = null;
    this.anim = 'idle';
    this.animFrame = 0;
    this.dropThrough = false;
    this.dropThroughTimer = 0;
    this.passiveInfinity = false;       // Gojo
    this.soulCorruption = 0;            // Mahito stack on opponent
    this.soulCorruptionTimer = 0;
    this.boogieMode = false;            // Todo
    this.domainEnhanced = false;        // Mahito
    this.domainStun = 0;
    this.alreadyHit = new Set();        // hitbox-instance dedupe per swing
    this.moves = {};                    // populated by subclass
    this.ko = false;
    this.koCooldown = 0;
    this.combo = 0;                     // domain meter rage tracker
    this.consecutiveHits = 0;           // Todo passive zone
    this.consecutiveHitsTimer = 0;
    this.zoneBuff = 0;
    this.facingLocked = false;
    this.domainMeter = new DomainMeter();
    this.domainClass = null;            // assigned by subclass
    this.world = null;
    this._prevInput = 0;
  }

  // Subclasses must implement getMoves() returning a table keyed by move name.
  init(world) {
    this.world = world;
    if (!this.domainClass) this.domainClass = DOMAIN_BY_FIGHTER[this.character];
  }

  // ===== TICK =====
  tick(input, world) {
    if (this.ko) {
      this.koCooldown--;
      if (this.koCooldown <= 0 && this.stocks > 0) this.respawn();
      return;
    }
    if (this.hitstop > 0) { this.hitstop--; return; }

    // domain stun → frozen
    if (this.domainStun > 0) {
      this.domainStun--;
      this.vx *= 0.85;
      applyGravity(this);
      resolveStageCollision(this, world.stage);
      return;
    }

    // status timers
    if (this.invulnFrames > 0) this.invulnFrames--;
    if (this.stunTimer > 0) this.stunTimer--;
    if (this.hitstun > 0) this.hitstun--;
    if (this.dropThroughTimer > 0) this.dropThroughTimer--;
    if (this.consecutiveHitsTimer > 0) {
      this.consecutiveHitsTimer--;
      if (this.consecutiveHitsTimer === 0) this.consecutiveHits = 0;
    }
    if (this.soulCorruptionTimer > 0) {
      this.soulCorruptionTimer--;
      if (this.soulCorruptionTimer === 0 && this.soulCorruption > 0) {
        this.soulCorruption--;
        if (this.soulCorruption > 0) this.soulCorruptionTimer = 8 * 60;
      }
    }

    regenCE(this);
    this.domainMeter.tick();

    // Domain Expansion input takes priority
    if (this.domainMeter.ready() && isDomainInput(input) && this.state !== 'domain_cast' && this.hitstun === 0) {
      this.activateDomain(world);
      return;
    }

    // Action selection only if not in hitstun/attack
    if (this.hitstun > 0) {
      this._handleHitstunMovement();
      this._afterMove(world);
      return;
    }

    if (this.state === 'attack') {
      this._tickAttack(world);
      this._afterMove(world);
      return;
    }

    if (this.shieldBroken) {
      this._afterMove(world);
      return;
    }

    // movement & action input
    this._handleMovementInput(input);
    this._handleActionInput(input, world);
    this._afterMove(world);
  }

  _afterMove(world) {
    applyGravity(this);
    resolveStageCollision(this, world.stage);
    if (checkBlastZones(this)) this._ko();
    // facing
    if (!this.facingLocked && Math.abs(this.vx) > 0.1 && this.state !== 'attack') {
      this.facing = this.vx > 0 ? 1 : -1;
    }
    this._updateAnim();
  }

  _handleMovementInput(input) {
    const left = isPressed(input, INPUT.LEFT);
    const right = isPressed(input, INPUT.RIGHT);
    const down = isPressed(input, INPUT.DOWN);
    const jump = isPressed(input, INPUT.JUMP);
    const shield = isPressed(input, INPUT.SHIELD);

    this.shielding = shield && this.grounded;
    if (this.shielding) {
      this.vx *= 0.6;
      this.shieldHP = Math.min(CONSTANTS.SHIELD_HP, this.shieldHP + CONSTANTS.SHIELD_REGEN);
      this.state = 'shield';
      return;
    } else if (this.shieldHP < CONSTANTS.SHIELD_HP) {
      this.shieldHP = Math.min(CONSTANTS.SHIELD_HP, this.shieldHP + CONSTANTS.SHIELD_REGEN);
    }

    let move = 0;
    if (left) move -= 1;
    if (right) move += 1;

    if (this.grounded) {
      this.jumpsLeft = 2;
      this.airdodgeUsed = false;
      const speed = this.runSpeed;
      const target = move * speed * 1.6;
      this.vx += (target - this.vx) * 0.35;
      this.state = move !== 0 ? 'run' : 'idle';
      if (Math.abs(this.vx) < 0.05) this.vx = 0;
    } else {
      const target = move * this.airSpeed * 2;
      this.vx += (target - this.vx) * 0.10;
      this.state = 'airborne';
    }

    if ((input & INPUT.JUMP) && !(this._prevInput & INPUT.JUMP)) {
      if (this.grounded) {
        this.vy = -this.jumpStrength;
        this.grounded = false;
        this.jumpsLeft = 1;
      } else if (this.jumpsLeft > 0) {
        this.vy = -this.jumpStrength * 0.9;
        this.jumpsLeft--;
      }
    }
    this.fastFall = down && !this.grounded && this.vy > 0;
    if (down && this.grounded) {
      this.dropThrough = true;
      this.dropThroughTimer = 10;
    }
  }

  _handleActionInput(input, world) {
    const pressedAttack = (input & INPUT.ATTACK) && !(this._prevInput & INPUT.ATTACK);
    const pressedSpecial = (input & INPUT.SPECIAL) && !(this._prevInput & INPUT.SPECIAL);
    const pressedGrab = (input & INPUT.GRAB) && !(this._prevInput & INPUT.GRAB);
    const left = isPressed(input, INPUT.LEFT);
    const right = isPressed(input, INPUT.RIGHT);
    const up = isPressed(input, INPUT.UP);
    const down = isPressed(input, INPUT.DOWN);
    const dirH = (right ? 1 : 0) - (left ? 1 : 0);

    if (pressedAttack) {
      let moveName;
      if (!this.grounded) {
        if (up) moveName = 'uair';
        else if (down) moveName = 'dair';
        else if (dirH !== 0) moveName = (dirH === this.facing ? 'fair' : 'bair');
        else moveName = 'nair';
      } else if (down) moveName = 'dtilt';
      else if (up) moveName = 'utilt';
      else if (dirH !== 0) {
        // smash if direction matches facing held & freshly tapped feel; for simplicity: any held direction = ftilt
        moveName = 'ftilt';
        if (dirH !== 0) this.facing = dirH;
      } else moveName = 'jab';
      this.startAttack(moveName);
      return;
    }

    if (pressedSpecial) {
      let moveName;
      if (down) moveName = 'downspecial';
      else if (up) moveName = 'upspecial';
      else if (dirH !== 0) { moveName = 'sidespecial'; this.facing = dirH; }
      else moveName = 'neutralspecial';
      this.startAttack(moveName);
      return;
    }

    if (pressedGrab) this.startAttack('grab');
  }

  startAttack(name) {
    const move = this.moves[name];
    if (!move) return;
    if (move.ceCost && !hasCE(this, move.ceCost)) return;
    if (move.ceCost) spendCE(this, move.ceCost);
    this.state = 'attack';
    this.currentMove = { ...move, name };
    this.actionTimer = 0;
    this.alreadyHit.clear();
    this.activeHitbox = null;
    this.facingLocked = true;
    if (move.onStart) move.onStart(this);
  }

  _tickAttack(world) {
    const m = this.currentMove;
    if (!m) { this.state = 'idle'; this.facingLocked = false; return; }
    this.actionTimer++;

    // friction during ground attacks
    if (this.grounded) this.vx *= 0.75;
    else this.vx *= 0.98;

    // Hitbox window
    if (this.actionTimer >= m.startup && this.actionTimer < m.startup + m.active) {
      const hbDef = typeof m.hitbox === 'function' ? m.hitbox(this) : m.hitbox;
      if (hbDef) {
        const hb = {
          x: this.x + (hbDef.x ?? 0) * this.facing - hbDef.w * 0.5,
          y: this.y - this.height + (hbDef.y ?? 0),
          w: hbDef.w, h: hbDef.h,
          damage: hbDef.damage, knockback: hbDef.knockback, angle: hbDef.angle,
          ignoresInfinity: hbDef.ignoresInfinity,
        };
        this.activeHitbox = hb;
        for (const other of world.fighters) {
          if (other === this || other.ko) continue;
          if (this.alreadyHit.has(other.id)) continue;
          const ob = { x: other.x - other.width / 2, y: other.y - other.height, w: other.width, h: other.height };
          if (aabbOverlap(hb, ob)) {
            if (m.onHit) m.onHit(this, other, world, hb);
            const did = applyHit(this, other, hb);
            if (did && !other.shielding) {
              this.alreadyHit.add(other.id);
              this.domainMeter.addOnHit(m.meterKind || 'JAB');
              other.domainMeter.addOnDamageTaken(hb.damage);
              this.consecutiveHits++;
              this.consecutiveHitsTimer = 120;
              if (this.consecutiveHits >= 3 && this.character === 'todo') {
                this.zoneBuff = 180;
              }
              world.particles.hitspark(hb.x + hb.w * 0.5, hb.y + hb.h * 0.5);
              world.camera.shake(6, 6);
            }
          }
        }
      }
    } else {
      this.activeHitbox = null;
    }

    if (this.actionTimer >= m.startup + m.active + m.endlag) {
      this.state = 'idle';
      this.currentMove = null;
      this.facingLocked = false;
    }
  }

  _handleHitstunMovement() {
    this.vx *= 0.96;
  }

  _ko() {
    this.ko = true;
    this.koCooldown = 90;
    this.stocks--;
    this.world && this.world.onKO && this.world.onKO(this);
  }

  respawn() {
    this.ko = false;
    this.x = this.spawnX; this.y = this.spawnY - 200;
    this.vx = 0; this.vy = 0;
    this.percent = 0;
    this.invulnFrames = 90;
    this.hitstun = 0;
    this.tumble = false;
    this.ce = this.ceMax * 0.5;
    this.state = 'airborne';
  }

  activateDomain(world) {
    this.domainMeter.consume();
    this.state = 'domain_cast';
    this.invulnFrames = 60;
    world.startDomain(this);
  }

  _updateAnim() {
    const prevAnim = this.anim;
    if (this.ko) this.anim = 'hurt';
    else if (this.state === 'attack') {
      const m = this.currentMove;
      if (!m) this.anim = 'idle';
      else if (m.name === 'jab' || m.name === 'ftilt' || m.name === 'utilt' || m.name === 'dtilt') this.anim = 'attack1';
      else if (m.name === 'fsmash' || m.name === 'usmash' || m.name === 'dsmash') this.anim = 'smash';
      else if (m.name === 'uair') this.anim = 'uair';
      else this.anim = 'attack2';
    }
    else if (this.state === 'shield') this.anim = 'shield';
    else if (this.hitstun > 0) this.anim = 'hurt';
    else if (!this.grounded) this.anim = this.vy < 0 ? 'jump' : 'fall';
    else if (Math.abs(this.vx) > 2.5) this.anim = (this.animFrame % 12 < 6) ? 'run1' : 'run2';
    else if (Math.abs(this.vx) > 0.5) this.anim = (this.animFrame % 16 < 8) ? 'walk1' : 'walk2';
    else this.anim = (this.animFrame % 60 < 30) ? 'idle' : 'idle2';
    if (prevAnim !== this.anim) this.animFrame = 0;
    this.animFrame++;
  }

  setPrevInput(p) { this._prevInput = p; }
}
