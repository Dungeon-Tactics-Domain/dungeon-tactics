# Mobile UX rules (phone and tablet)

Written on Nov 18 for the `mobile-ux` branch. Fernando's decisions (Nov 18): a phone plays **on its side only** (upright
shows a "turn your phone" note); a tablet plays in both orientations; the look does not change (the blue pieces stay).
These rules add to [design-system.md, section 8](game-design/design-system.md#8-touch-and-mobile-rules-nov-16); where
the two differ, this file is the newer decision. What was measured, before and after, is in
[mobile-ux-auditoria.md](mobile-ux-auditoria.md).

Sources: Apple Human Interface Guidelines (Layout: safe areas; Accessibility: 44 pt hit targets; Gestures) and the
layout of Fortnite on phones (controls outside the play area, few active controls, nothing in the far corners). No
ready-made mobile skill was used; these are the project's own rules.

## 1. The interface scales with the viewport; 44 px is a goal for the hit area, not for the drawing

Fernando, Nov 18: *the pieces may get smaller with the screen on phone and tablet. Do not force the drawing to 44 px and
do not rearrange the layout only to reach that number.*

- **One factor per viewport, pure and tested.** `stage()` in `src/client/ui3d/layout.ts` gives the scale of the 1920×1080
  reference: the page's fit, never under `MIN_SCALE` (0.6) while the page is at least 1152 px wide; under that the pieces
  shrink with the **width** down to `NARROW_SCALE` (1/3), so they stop covering each other on a phone. CSS mirrors it in
  `--lay-u`. Tests: `tests/layout.test.ts`.
- **Text shrinks with its piece.** The 16 px floor holds down to scale 0.6 and then shrinks in proportion
  (`textPx`, `--fs-3d-min`): about 10 px of floor at 844×390. Text that is HTML (windows, town) keeps 16 px.
- **The hit area is as generous as the room allows, without covering a neighbour.** The battle menu's rows use
  `touchScale()` (`menu3d/menu-layout.ts`): on touch they are drawn larger than the rest of the stage when the page is
  tall enough. The ability sheet's page arrows get a hit box 44 px tall on touch. HTML controls keep `--tap` (44 px).
- **A small target is a measure, not an automatic failure.** The audit reports the smallest size per screen and says if
  the tap is still workable. Under about 28 px of height, or closer than 8 px to another target, it needs a decision.

## 2. Orientation

- A phone upright (`(pointer: coarse) and (max-width: 600px) and (orientation: portrait)`) shows `.rotate-note` over
  everything, title and town included (`src/client/rotate-note.ts`, called from `entry.ts`). Nothing under it takes taps.
- A tablet is never asked to rotate. Nothing locks the orientation.

## 3. Safe area

- `index.html` keeps `viewport-fit=cover`. HTML pieces use the `--inset-*` tokens.
- The 3D layer sits inside the safe area: `stage(w, h, mode, safeArea())` (`ui3d/safe-area.ts` reads
  `env(safe-area-inset-*)` through `--safe-x`, `--safe-y`). The inset is symmetric (the larger of the two sides), so the
  stage stays centred whichever way the phone lies. The `frame` layout is already centred and ignores it.

## 4. Where controls go

- Controls stay out of the play area and away from the far corners (a thumb reaches the lower sides best; the corners
  hold the notch and the system gestures).
- About five or six active controls at a time: the command menu's rows, Back, Undo, ☰.
- **Undo is always a button on screen** (`.tools .undo`, beside Back and ☰; Fernando, Nov 18): live whenever the battle
  has a step to undo (`undoShown`, `hud-menus.ts`), faded to 45% (`OFF_ALPHA`, `tool-rows.ts`) and dead with none, so it
  never comes and goes under the finger. The ☰ list's Undo row follows it (`aria-disabled`, drawn in `--ui3d-ink-off`).
- **Undo and Back say their word**: "↶ Desfazer" and "↩ Voltar" (`window3d/tools3d.ts` `WORD`), so the two arrows are
  never told apart by their shape alone. Undo is "Desfazer" on the button and on its ☰ row; the command menu's
  "Desfazer movimento" is the Move row itself turned around, not this control.
- **The corner buttons and the Height** share the top right: the Height corner drops under the row of buttons where the
  page has no room for both (`heightBox`, `hints3d/hints-view.ts`; `toolsFoot`, `window3d/tools-layout.ts`). Under the
  Height, the tile line leaves out the height the corner already shows.
- **The ☰ list says when it scrolls**: while rows wait under it, its foot reads "▼ Mais abaixo" in the room the layout
  keeps for it (`below`, `cue`, `tools-layout.ts`). The Pixel size row shows the size in use ("2 px", "desligado").
- **No pointing glove for a finger**: the command menu's and the ☰ list's glove hide while a finger plays (the layer's
  `finger`, `ui3d/layer.ts`, the same switch that hides the key hints); a key or a pad brings it back.
- **The turn list starts under the top margin** and its title never covers a card: a list longer than its box drops its
  top to the first whole row (`queueLayout`, `turn3d/queue-layout.ts`).
- **The command menu never covers the acting unit's sheet** (at 844×390 it hid the end of the stamina, "50/5"); where the
  menu, the submenu and the ability sheet do not all fit beside it, the submenu's cascade over the menu shortens
  (`menuLayout`, `menu3d/menu-layout.ts`). The menu is as tall as its rows, with no blank fifth row.
- No key or pad hint shows on touch: touch is not a gamepad (`KEYS` test; the 3D corner menu's caps included).
- Nothing lives only in hover.

## 5. Gestures on the map

| Gesture | What it does | Where |
|---|---|---|
| Tap a tile | selects it and shows the range, path or target | `interaction.ts` |
| Tap the same tile again | confirms | `interaction.ts` |
| One finger dragging | moves the camera (past the 8 px slop) | `touch-input.ts` |
| Two fingers pinching | zooms | `touch-input.ts` |
| Two fingers twisting | turns the camera one of its eight angles per 30° (`TWIST_STEP`), the map following the fingers | `gesture.ts` (pure, `tests/gesture.test.ts`) |

A gesture is never the only way: the keyboard, the pad and the ☰ menu reach the same actions. `body` has
`touch-action: none` and `user-select: none`; scrolling boxes have `pan-y`; buttons `manipulation` (no double-tap zoom).

## 6. Leaving and coming back

When the page is hidden (`visibilitychange`), the battle clock skips the time away instead of jumping
(`src/client/away.ts`, used by `scene/timeline.ts`; `tests/away.test.ts`) and the music pauses (`sound.ts`), resuming
when the page shows again.

## 7. Camera on a short screen

A phone on its side (page under 500 px tall) opens the battle closer (`SHORT_START`, `scene/camera.ts`), so a half tile
is about 38 px wide instead of a speck.

## 8. How to check a change

Emulate a touch device (not only a size) in a real browser with WebGL, at 844×390 with the notch insets, 667×375,
1024×768, 768×1024, 1180×820 and 390×844 (for the rotate note). Measure every visible control's box and the 3D hit
boxes, and drive the turn with taps. Emulation is not a device: a change is done only after one pass on a real phone and
tablet (see "Not verified" in the audit).
