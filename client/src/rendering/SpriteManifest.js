// Manifest-driven spritesheet loader.
//
// Loads a single PNG + JSON manifest describing per-character animations.
// The manifest schema matches the JJK_DOM_CLASH_CHARACTERS concept art:
//
// {
//   "meta": { "sheet": "characters.png" },
//   "gojo": {
//     "idle":    { "frames": [{ "x":0, "y":0, "w":64, "h":64, "duration":10 }, ...] },
//     "fsmash_hit": { "frames": [{ "x":0, "y":64, "w":64, "h":64, "duration":6, "hitbox":{...} }, ...] },
//     ...
//   },
//   "yuji": { ... }
// }
//
// Frames advance automatically based on a caller-supplied `frameTick` so the
// Fighter doesn't need to track per-animation state. Missing animations fall
// back to `idle`. Missing characters return null so the caller can fall back
// to procedural art.

export class SpriteManifest {
  constructor() {
    this.image = null;
    this.manifest = null;
    this.ready = false;
    this.error = null;
  }

  // Load a manifest + sheet. Both paths are relative to the HTML document.
  // Returns a promise that resolves to `true` on success or `false` if the
  // manifest or image could not be loaded. Never throws — the caller just
  // treats a missing sheet as "use procedural fallback".
  async load(jsonPath, pngPath) {
    try {
      const resp = await fetch(jsonPath, { cache: 'no-cache' });
      if (!resp.ok) { this.error = `manifest ${resp.status}`; return false; }
      this.manifest = await resp.json();
      this.image = await new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error('sheet load failed'));
        img.src = pngPath;
      });
      this.ready = true;
      return true;
    } catch (e) {
      this.error = String(e && e.message || e);
      this.manifest = null;
      this.image = null;
      this.ready = false;
      return false;
    }
  }

  // Does this manifest have frames for `character`? Used so the caller can
  // selectively fall back to procedural art for characters not yet drawn.
  hasCharacter(character) {
    return this.ready && this.manifest && !!this.manifest[character];
  }

  // Resolve an animation name to a frame list, falling back to idle.
  _framesFor(character, anim) {
    const c = this.manifest && this.manifest[character];
    if (!c) return null;
    const a = c[anim] || c.idle;
    return (a && a.frames && a.frames.length) ? a.frames : null;
  }

  // Given a frame list and a monotonic tick counter, pick the current frame
  // based on the summed per-frame durations. A duration of 0 is treated as 1
  // so we never divide by zero.
  _pickFrame(frames, tick) {
    let total = 0;
    for (const f of frames) total += Math.max(1, f.duration | 0);
    const t = ((tick | 0) % total + total) % total;
    let acc = 0;
    for (const f of frames) {
      acc += Math.max(1, f.duration | 0);
      if (t < acc) return f;
    }
    return frames[frames.length - 1];
  }

  // Draw a character frame at (x, y) with feet anchor. Returns true on
  // success, false if the character/frame is not available (so the caller
  // can render the procedural fallback instead).
  draw(ctx, character, anim, x, y, facing = 1, frameTick = 0, scale = 1) {
    if (!this.ready) return false;
    const frames = this._framesFor(character, anim);
    if (!frames) return false;
    const frame = this._pickFrame(frames, frameTick);
    const w = (frame.w | 0) * scale;
    const h = (frame.h | 0) * scale;
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.translate(x | 0, y | 0);
    if (facing === -1) ctx.scale(-1, 1);
    // Feet-at-(x,y) anchor: horizontally centered, vertically bottom-aligned.
    ctx.drawImage(this.image, frame.x, frame.y, frame.w, frame.h,
                  (-w * 0.5) | 0, (-h) | 0, w, h);
    ctx.restore();
    return true;
  }

  // Query the current frame's hitbox metadata for gameplay systems that
  // want to sync collision to the spritesheet. Returns null if unavailable.
  hitboxFor(character, anim, frameTick) {
    const frames = this._framesFor(character, anim);
    if (!frames) return null;
    const f = this._pickFrame(frames, frameTick);
    return f.hitbox || null;
  }
}
