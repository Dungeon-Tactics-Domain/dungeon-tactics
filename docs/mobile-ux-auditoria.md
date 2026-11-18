# Mobile UX audit (Nov 18)

Rules: [mobile-ux.md](mobile-ux.md). Captures: `docs/media/mobile-ux/` (`antes-<viewport>-<screen>.png` on master
`0bd643ee`, `depois-<viewport>-<screen>.png` on the `mobile-ux` branch).

## How it was measured

- Real Edge with WebGL, the game served by Vite from the worktree. Touch emulated through the DevTools protocol
  (`Emulation.setDeviceMetricsOverride` with `mobile: true` and device pixel ratio 2, `setTouchEmulationEnabled`,
  `setSafeAreaInsetsOverride`), taps and two-finger gestures through `Input.dispatchTouchEvent`.
- Viewports: 844×390 (phone on its side, notch insets left and right 47 px, bottom 21 px), 667×375 (small phone),
  1024×768 and 768×1024 (tablet), 1180×820 (large tablet), 390×844 (phone upright, only for the rotate note).
- Every visible `button, a, input, select, summary, [role=button], [tabindex]` measured with `getBoundingClientRect`,
  the 3D hit boxes included; `--lay-u` read from `:root`; `(pointer: coarse)` matched and `.hud` had no `kbd` class on
  every capture.
- Origin of each number: **measured** on Nov 18 unless the line says *read in code* or *deduced*.
- Limits of the harness: "covered" and "in the safe area" flags fire for list items scrolled partly out of their box
  and for a window standing over another on purpose; those were read on the capture and are not listed as problems.

## Screen by screen

"Small target" lines are measures, not failures (rule 1 of mobile-ux.md): each says the smallest size and if the tap is
workable.

| Screen | Viewport | Before (master `0bd643ee`) | After (`mobile-ux`) |
|---|---|---|---|
| Whole 3D layer | 844×390, 667×375 | scale stuck at 0.6 (`--lay-u` 0.6): pieces drawn for 1152 px on a 844 px page, covering each other (ability sheet over the submenu, unit bar over the menu) | scale 0.391 and 0.348 (follows the width); menu, submenu, sheet, turn list and bar each on its own place. Left over: the menu's left edge touches the end of the unit bar at 844×390 (the last digit of the stamina value is covered while the menu is open) |
| Whole 3D layer | 1024×768, 768×1024 | 0.6 | 0.533 and 0.4 |
| Whole 3D layer | 1180×820 | 0.615 | 0.615 (unchanged: the page is over 1152 px) |
| 3D layer and the notch | 844×390 | ignored the safe area: turn numbers at x ≈ 40, inside the 47 px notch inset | stage inset by the safe area on both sides; the menu's hit boxes start at x 339 and ☰ sits 59 px from the right edge. One `button` with a box was measured at x ≈ 2, inside the inset, and was not identified (the browser automation stopped answering before the check): it may be an unseen HTML piece under the drawing |
| Battle: command menu | 844×390 | rows 248×34, covered by the bar and the sheet | rows 206×28 (hit box = drawn row). Smallest target of the game; workable (row is 206 px wide, rows touch each other with no gap, a miss lands on a neighbour row, which only moves the focus on the first tap) |
| Battle: command menu | 667×375 | 248×34, covered | 222×30, workable |
| Battle: command menu | 1024×768, 768×1024 | 248×34 | 248×34 (kept by the touch scale while the rest of the stage shrank) |
| Battle: command menu | 1180×820 | 254×35 | 254×35 |
| Battle: abilities (submenu and sheet) | 844×390 | sheet over the submenu; page arrows 120×29 and covered | submenu rows 206×28, sheet beside it; page arrows' hit box 44 px tall on touch (*tested in `tests/ui3d.test.ts`, not tapped in the emulator*) |
| Battle: map, first tap | 844×390 | selects and shows the range | same; help line "Mover: toque de novo para confirmar." |
| Battle: map, second tap | 844×390 | confirms | same; an invalid tile answers "Não cabe aqui: precisa de chão plano." |
| Battle: camera at the start | 844×390 | whole map in 390 px of height, half tile a few px | opens closer (`SHORT_START`): half tile ≈ 38 px wide |
| Battle: two fingers | 844×390 | pinch zooms; no rotation | pinch zooms; a 40° twist turned the camera one step (captures `e-before`, `e-after-cw` kept outside the repo); the map follows the fingers (seen on the two captures: the river and the barrel went clockwise around the unit after a clockwise twist). The other direction was not tried |
| Battle: Undo | 844×390 | only inside ☰ | button 44×44 beside ☰ after a move; a tap undoes the move and the button hides |
| Battle: key hints | all touch | corner menu showed key caps (Z, ⇧R, R, F, V) | none (`kbd=false`, caps hidden by `KEYS`) |
| Battle: "Execute?" | all | controls ≥ 44 px | controls ≥ 44 px; at 844×390 the window stands beside the turn list and the help line repeats its title (not changed) |
| Battle: Status | all | window fits, Close 44 px | same |
| Battle: ☰ list | 844×390, 667×375 | items 300×44; the last ones under the fold | same: the list scrolls inside itself (last items reached by a finger drag; *not re-tested this round*) |
| Battle: Options | all | rows ≥ 44 px, scrolls inside | same |
| Battle: result | n/a | *not captured* | *not captured* (text floor now follows the scale; read in code) |
| Battle: help line | 844×390 | n/a | the line sits over the acting unit's head when the unit is near the top (not changed) |
| Title | 844×390 | HTML menu, rows 413×48, "Créditos" at y 341 (bottom edge) | same (HTML window, untouched) |
| Title | 1180×820 | 3D title, controls ≥ 44 px | same |
| Town: HUD | all | 2 controls, 44 px | same |
| Town: menu | all | rows 436×60 | same |
| Town: Shop, Tavern | up to 1024 px | HTML windows, rows ≥ 44 px, scroll inside | same |
| Town: Shop, Tavern, Party | 1180×820 | 3D windows: rows 479×41, "Recrutar" 273×36, Party rows 221×33 | same (scale unchanged at this size); workable, rows are wide |
| Town: Party tabs | 1024×768 | four tabs squeezed on one line: "Status" 38×44, "Classe" 29×44, names drawn over each other | tabs wrap (new rule under 1100 px wide): 176×44, 176×44, 109×44, 63×44, names whole. The rule also reaches 844×390 and 768×1024, whose Party captures were taken before it and were not taken again |
| Expedition map | all | places 48×48 | same |
| Rotate note | 390×844 | only over the battle HUD; absent on the title and in the town | shown on title, town, map and battle (`rot=grid` on every capture), nothing under it takes taps |
| Rotate note | 768×1024 | not shown | not shown |
| Leaving the page | n/a | sound resumed on return; the battle clock jumped | clock skips the time away, music pauses (*unit-tested in `tests/away.test.ts`; not exercised by hiding a real tab*) |

## Not verified

- A real phone or tablet: real fingers, comfort in the hand, thumb reach.
- iPadOS and iOS Safari, Android Chrome: the browser's bars, `100vh` against the visible height, sticky hover, audio
  unlock, the real notch.
- Performance and battery on a device (the emulation ran on a PC's GPU).
- A physical gamepad paired with a tablet.
- A screen reader on touch.
- The result screen, the save slots, a conversation and the developer menu were not captured this round.
- The page arrows of the ability sheet and the ☰ list's scroll were not tapped again after the change.

## Open questions

1. Battle menu on a phone: rows 28 to 30 px tall. Larger rows need the menu to leave its place beside the unit (a layout
   change Fernando asked not to make only for the number).
2. 3D text goes under 16 px on a phone (about 10 px of floor at 844×390), against the Nov 16 "16 px everywhere" rule.
   The Nov 18 "let the drawing shrink" decision is taken as the newer one.
3. The safe-area inset is symmetric: a phone with the notch on one side loses the same width on the other.
4. Undo is an icon (↶) with an accessible name, no visible word.
5. Undo (↶) and Back (↩) look alike and can show side by side; no capture shows the two together.
6. The Party tabs' wrap uses 1100 px, a width outside the bands of design-system.md section 8, rule 10.
7. The 844×390 captures, before and after, already carry the notch insets (scale 0.391 = 750 / 1920).
8. The captures weigh 186 MB (device pixel ratio 2, PNG): too heavy to commit as they are.
