# Splash intro frames — how these were made

Source: the design handoff's `splash-standalone.html` (plain CSS/HTML port
of the original `.dc.html` authoring file), rendered headless via
Playwright against the system Chrome install and screenshotted at paused
points on the real page — not redrawn or approximated.

## Why baked frames at all

The mark is 15 stacked `<img>` layers inside `transform-style:preserve-3d`,
rotated on Y under a CSS `perspective`, with `filter: blur()` glow layers
and a `mask:`-clipped specular sweep. React Native has none of
`translateZ`, `preserve-3d`, `filter`, or `mask`, and the project is
constrained to no new native dependencies (reanimated + expo-image only,
no Skia/SVG/linear-gradient). None of that composites live in RN. The
rotation is pre-rendered instead; everything else (the exit
zoom-fade) is live Reanimated transform/opacity, which RN can do natively.

## How to regenerate (e.g. if the design or copy changes)

1. Serve the handoff directory: `python3 -m http.server 8917` from
   wherever `splash-standalone.html` and its five source PNGs live.
2. Use Playwright's `page.getAnimations()` / `Animation.currentTime` to
   pause every CSS animation on the page and scrub to an exact
   millisecond — `element.pause(); element.currentTime = ms` for each
   animation, NOT `animation-delay` tricks (those don't compose cleanly
   across the page's several independently-timed keyframes).
3. Screenshot the splash overlay div (`div[style*="perspective:1100px"]`)
   full-bleed, as JPEG — it's fully opaque (background, ambient glow,
   mark, and eventually the wordmark all baked into one flat image), so
   there's no alpha channel to preserve and JPEG keeps file size down.
4. Sample times densely early, sparsely late: the rotation's
   `cubic-bezier(.16,.86,.28,1)` easing does the overwhelming majority of
   its visible motion in roughly the first 500ms of a 1550ms + 220ms-delay
   animation; frames past that point look nearly identical to the eye.
5. Stop sampling BEFORE the splash's own exit fade starts (1.94s in the
   original timeline, `--sp` unscaled) — a frame captured during `arOut`
   has that fade already baked in, which fights with the live exit
   animation RN plays afterward. The last usable frame here is at 1850ms.

## What's in this set

`intro-01.jpg` through `intro-13.jpg`, captured at (ms from mount):
220, 260, 300, 350, 420, 520, 680, 950, 1400, 1550, 1650, 1770, 1850.

Total: ~460KB for all 13 — well under the ~1MB budget for what every
user downloads on every OTA update.
