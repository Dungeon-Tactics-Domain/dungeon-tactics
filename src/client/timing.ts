// Turn-flow timings, in ms, all together to adjust the pace in one place (Fernando's request, Nov 12: flow and
// timings similar to Final Fantasy Tactics). There's no source for FFT's animation timings: the new ones are estimates.
// Previous values are kept beside each number.
// Nov 13, Fernando's request ("slow walking… very realistic jump animations… slower game feel, I don't want fast
// animations"): the whole pace got ~40% slower than Nov 12's (previous value alongside), walking is at a walk and every step is a
// jump in 3 parts. Holding Enter still speeds things up 3 times.
export const TIMING = {
  enemyStart: 650, // 450: camera arrives and the player sees whose turn it is
  enemyDestination: 650, // 500: cursor and path at the enemy's destination before it moves
  step: 600, // 200: one tile walked at a walk (Walking_A), not running
  jumpCrouch: 300, // new: crouches and takes a run-up (Jump_Start) before leaving the ground
  jumpAir: 450, // new: arcing flight on a 1-level step (Jump_Idle)...
  jumpPerLevel: 90, // new: ...plus this per extra level of height
  jumpLand: 300, // new: lands and recovers (Jump_Land) before the next step
  banner: 900, // 700: banner with the ability name and the marked area before the hit
  windup: 520, // 380: from the gesture to the impact
  projectile: 420, // 280: arrow, knife and fireball flight to the target (arcing rock and flask take 1.4x)
  lunge: 380, // 260: the Charge's advance and return
  hit: 480, // 320: a hit that landed, until the next event
  hpDrain: 450, // 300: health bar draining; fits inside `hit` so the end sync doesn't cut the drain
  crash: 320, // 220: crash and fall
  push: 260, // 140: one tile pushed
  die: 1000, // 700: fall of whoever dies
  float: 1500, // 1200: damage number pops, holds to be read and fades (the same value is in the CSS, .float's pop animation)
  enemyAfter: 450, // 250: breather between one enemy and the next
  // weight of a blow (Fernando's grill of Nov 15, the Mechanics lab's peso.json; distances in hit-weight.ts)
  hitStop: 70, // 110: everything stops at the impact, the target flashes white; this is what gives the hit weight
  hitStopBig: 140, // new: the pause doubled on a strong strike (25% of life or more), which also shakes the camera
  shake: 260, // 280: the target trembles after the pause and the trembling fades
  quake: 280, // new: the camera shake of a strong strike...
  quakeLand: 200, // new: ...and of a fall landing or a body meeting a wall
  recoil: 110, // new: the struck body steps back half a tile...
  recoilBack: 260, // new: ...and comes back
  bounce: 240, // new: the short bounce where a fall lands
  wallSlide: 70, // new: a pushed body slides to the wall and stops dead...
  wallBack: 160, // new: ...then comes back a hand's width to its tile
  slowmo: 800, // new: battle ms of the death slow motion (2.7 s at WEIGHT.slow 0.3): the impact and most of the fall
  closeUp: 180, // new: the camera closes in on whoever dies...
  closeUpBack: 450, // new: ...and goes back after the fall
  pop: 320, // 240: little hop of whoever starts their turn
  blink: 110, // 80: each on/off of whoever dies (3 blinks)
};

// Duration of a path step: walking on the flat, jump (crouch, flight, landing) when the height changes or it flies a gap.
// `dh` in levels, `tiles` whole tiles between the two ends (2 across the gap; a cell of the split map is 0.5, and walks in half the time,
// so a whole tile takes the same on both maps). The scene animates with this and the game times the footstep sound
// with this, so the two don't drift apart.
export const isJump = (dh: number, tiles = 1) => dh !== 0 || tiles > 1;
export const stepMs = (dh: number, tiles = 1) =>
  isJump(dh, tiles)
    ? TIMING.jumpCrouch + jumpAirMs(Math.max(Math.abs(dh), tiles)) + TIMING.jumpLand
    : TIMING.step * tiles;
export const jumpAirMs = (dh: number) => TIMING.jumpAir + TIMING.jumpPerLevel * (Math.abs(dh) - 1);

// Holding Enter, Space or A (gamepad) speeds up everything in battle (steps, hits, waits) 3 times; releasing goes back to the FFT
// pace. Fernando's request (Nov 12): a more responsive battle without losing the reading pace for those in no hurry.
// On mobile (no key to hold) the ⏩ button toggles it (`toggle`, Fernando's choice on Nov 12).
export const pace = { key: false, pad: false, toggle: false };
export const FAST = 3;
// the sandbox bench's slow motion and pause (dev/sandbox.ts); the game never changes them
export const bench = { scale: 1, paused: false };
export const speed = () => (pace.key || pace.pad || pace.toggle ? FAST : 1) * (bench.paused ? 0 : bench.scale);
