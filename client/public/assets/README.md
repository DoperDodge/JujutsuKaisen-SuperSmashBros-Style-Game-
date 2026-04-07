# Character spritesheet

Drop your spritesheet PNG here as `characters.png`.

The engine will try to load `/assets/characters.png` + `/assets/characters.json`
at startup. If either file is missing or unreachable, it silently falls back
to the procedural pixel-art renderer (so the game never breaks).

## Layout

The JSON manifest is keyed by character (`gojo`, `yuji`, `sukuna`, `mahito`,
`todo`), then by animation name. Each animation has a `frames` array, where
every frame is a source rectangle on the sheet plus a duration in 60fps
frames:

```json
"gojo": {
  "idle": {
    "frames": [
      { "x": 0, "y": 0, "w": 64, "h": 64, "duration": 10 },
      { "x": 64, "y": 0, "w": 64, "h": 64, "duration": 10 }
    ]
  }
}
```

Frames can also carry a per-frame `hitbox` (gameplay-relative coordinates)
and a marker like `"effect": "cursed_energy_burst"` that the VFX layer can
pick up.

## Animation names used by the engine

Core states:

```
idle  idle2  walk1  walk2  run1  run2  jump  fall  shield  hurt  domain
```

Attacks (each has `_wind` and `_hit` except aerials/grab which are single-frame):

```
jab_wind jab_hit jab_hit2
ftilt_wind ftilt_hit
utilt_wind utilt_hit
dtilt_wind dtilt_hit
fsmash_wind fsmash_hit
usmash_wind usmash_hit
dsmash_wind dsmash_hit
nair fair bair uair dair
neutralspecial_wind neutralspecial_hit
sidespecial_wind sidespecial_hit
upspecial_wind upspecial_hit
downspecial_wind downspecial_hit
grab
```

Any animation you don't define in the manifest will be drawn with the
procedural art for that character. So you can ship a partial sheet and
the rest of the game still renders.

## Anchor

Frames are drawn with the character's **feet** at `(fighter.x, fighter.y)`,
horizontally centered. Make sure each frame's sprite is anchored the same
way inside its source rectangle or attacks will look like they float.

## Sheet size

The concept reference uses 64×64 cells (some attack frames are 96×64 when
a weapon extends past the body). Any frame size works — each frame has its
own `w`/`h` so different attacks can use different cell sizes on the same
sheet.
