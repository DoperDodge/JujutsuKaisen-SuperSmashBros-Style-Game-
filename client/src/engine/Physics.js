// Physics: gravity, ground/platform collision, AABB hitbox checks, blast zones.

import { CONSTANTS, STAGE_BOUNDS } from '../../../shared/Constants.js';

export function applyGravity(fighter) {
  if (!fighter.grounded) {
    fighter.vy += CONSTANTS.GRAVITY;
    const cap = fighter.fastFall ? CONSTANTS.FAST_FALL_SPEED : CONSTANTS.MAX_FALL_SPEED;
    if (fighter.vy > cap) fighter.vy = cap;
  }
}

// Resolve fighter against stage. stage.platforms is an array of {x,y,w,h,passthrough}.
// stage.ground is the main floor: {x,y,w}.
export function resolveStageCollision(fighter, stage) {
  fighter.x += fighter.vx;
  fighter.y += fighter.vy;
  const halfW = fighter.width * 0.5;
  const wasGrounded = fighter.grounded;
  fighter.grounded = false;

  // main ground
  const g = stage.ground;
  if (g) {
    const top = g.y;
    if (fighter.vy >= 0 && fighter.x + halfW > g.x && fighter.x - halfW < g.x + g.w) {
      // approaching from above?
      if (fighter.y >= top && fighter.y - fighter.vy <= top + 1) {
        fighter.y = top;
        fighter.vy = 0;
        fighter.grounded = true;
      } else if (fighter.y > top && fighter.y < top + 40) {
        fighter.y = top;
        fighter.vy = 0;
        fighter.grounded = true;
      }
    }
  }

  // soft platforms (passthrough): only collide when falling and previous y was above
  if (stage.platforms) {
    for (const p of stage.platforms) {
      if (fighter.vy < 0) continue;
      if (fighter.dropThrough && fighter.dropThroughTimer > 0) continue;
      if (fighter.x + halfW < p.x || fighter.x - halfW > p.x + p.w) continue;
      const top = p.y;
      const prevY = fighter.y - fighter.vy;
      if (prevY <= top + 1 && fighter.y >= top) {
        fighter.y = top;
        fighter.vy = 0;
        fighter.grounded = true;
      }
    }
  }

  if (!wasGrounded && fighter.grounded) {
    fighter.onLanding && fighter.onLanding();
  }
}

export function checkBlastZones(fighter) {
  return (
    fighter.x < STAGE_BOUNDS.LEFT ||
    fighter.x > STAGE_BOUNDS.RIGHT ||
    fighter.y < STAGE_BOUNDS.TOP ||
    fighter.y > STAGE_BOUNDS.BOTTOM
  );
}

export function aabbOverlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

// Helper: build a world-space hitbox from a fighter-relative hitbox spec
export function worldHitbox(fighter, hb) {
  const dir = fighter.facing; // 1 right, -1 left
  return {
    x: fighter.x + (hb.x - (dir === -1 ? hb.w : 0)) * dir - hb.w * (dir === -1 ? 0 : 0),
    y: fighter.y - hb.y - hb.h,
    w: hb.w, h: hb.h,
    damage: hb.damage, knockback: hb.knockback, angle: hb.angle, hitstun: hb.hitstun, type: hb.type,
  };
}
