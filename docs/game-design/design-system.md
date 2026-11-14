# Interface design system (Nov 13, 2026)

How the Dungeon Tactics interface is built: tokens, pieces, states, input and contrast. Read it together with `src/client/CLAUDE.md` (decisions and reasons). The layout follows FFT and Tactics Ogre; art, fonts, icons and text are ours.

**Status:** this document describes the current parchment interface. On Nov 13 Fernando decided to redesign the interface from scratch in a local design lab; this file is rewritten when that work lands.

**Reading copy:** Design System artifact at https://claude.ai/artifact/RR7xTnyBPxE7GyUd1XysSK (Fernando's choice, Nov 13). Change a token or this document: republish `project/tokens.json` and `project/README.md` there.

**Source of truth:** the `:root` of `src/client/style.css` (tokens) and the functions in `hud.ts`, `dialog.ts` and `icons.ts` (pieces). This document describes; if it disagrees with the code, the code wins and the document is fixed in the same commit.

**Rules of use**

- Colour and size only through `:root` tokens. Exceptions are listed under "Debts".
- A new screen is built from the pieces below. Something missing: first one more parameter on the piece; a new piece only if that does not fit, recorded here and in `src/client/CLAUDE.md`.
- Colour is never the only cue: always text, a drawing or a mark with it (✓, ▶, stripes).
- All text through `t('pt', 'en')`.
- Web on PC first (1280×720 and 1920×1080). The mobile media queries stay, without optimisation for now.

## 1. Tokens

### Colour

| Group | Tokens | Use |
|---|---|---|
| Parchment | `--paper` `--paper-lo` `--paper-hi` `--paper-edge` | background, foot of the gradient, highlight and frame of panels and dialogs |
| Ink | `--ink` `--ink-muted` `--focus` | text, muted text, highlight/focus/link |
| Dark scene | `--bg` `--fg` `--muted` `--overlay` | page background, text over the scene, veil behind dialogs |
| Stone | `--stone` `--stone-lo` `--edge` `--trim` `--trim-hi` `--bevel-*` `--well` | button outside the parchment (almost unused today), bar background |
| Gold | `--gold-btn` `--gold-trim` `--on-accent` `--accent` | primary button, battle highlight |
| Sides | `--hero` `--enemy` | side stripe of panels and queue rows |
| Bars | `--hp` `--mp` `--ct` `--heal` `--heal-ink` | HP, MP, CT, healing |
| Strike preview | `--strike` `--strike-dmg` | arrow band between the panels |
| Tile marks | `--mark-move` `--mark-range` `--mark-blocked` `--mark-threat` | legend; same as `MARK` in `scene.ts` |
| Star | `--star` `--star-ink` | leftover from the stars (removed on Nov 13) |

### Contrast (measured on Nov 13, WCAG 2.1 formula, script over the CSS hex values)

| Pair | On `--paper-hi` | On `--paper` | On `--paper-lo` (foot) | Bar |
|---|---|---|---|---|
| `--ink` | 15.0 | 12.6 | 10.0 | 4.5 ✓ |
| `--ink-muted` | 7.1 | 5.9 | 4.7 | 4.5 ✓ |
| `--focus` | 7.0 | 5.8 | 4.6 | 4.5 ✓ |
| `--gold-trim` (battle highlight) | 6.3 | 5.3 | 4.2 | 4.5: passes in dialogs (`paper-hi` → `paper`); do not use at the foot of `.panel` |
| `--heal-ink` (large number) | 5.0 | 4.2 | 3.4 | 3.0 (large text) ✓ |
| `--star-ink` (large text) | 4.4 | 3.7 | 2.95 | 3.0: dialogs only |

| Pair on dark | Value | Bar |
|---|---|---|
| `--fg` on `--bg` | 16.1 | ✓ |
| `--muted` on `--stone` | 8.3 | ✓ |
| `--on-accent` on gold (light / dark end) | 13.3 / 8.5 | ✓ |
| `--strike-dmg` on the band (worst case `#3e3846`) | 7.0 | ✓ |
| `--focus` alone on `--bg` | 2.5 | ✗ → hence `--focus-halo` |
| `--focus` alone on the map sea | 1.2 | ✗ → same |

### Typography

| Token | Value | Use |
|---|---|---|
| `--font` | Alegreya Sans | running text, small labels, numbers |
| `--font-px` | Cinzel (the name is left over from the old pixel font) | titles, menu rows, primary button, queue |
| `--fs-sm` / `--fs` / `--fs-lg` / `--fs-xl` | 14 / 16 / 20 / 32 px | note and help / body / menu item and name / preview damage |

Minimum text: 14 px (the key hint, 11 px, and the fps counter, 12 px, are the exceptions).

### Space, corner, shadow

| Token | Value | Use |
|---|---|---|
| `--gap` | 8 px | default gap between pieces; multiples of 4 (4, 6, 8, 12, 16, 24) |
| `--tap` | 48 px | minimum button height |
| `--r` | 3 px | corner of everything |
| `--slot-w` | 440 px | bottom unit panels |
| `--frame` / `--frame-pressed` | stone bevel | button outside the parchment |
| `--glow` | gold glow | selected stone button |
| `--focus-halo` | 3 px of `--paper-hi` | focus outside the parchment (see Focus) |
| Parchment shadow | `inset 0 0 0 2px var(--paper-hi), 0 3px 0 rgba(0,0,0,.45)` | `.panel`, `.dialog`, menu button (repeated 4 times: debt) |

Panel margin to the screen edge: 12 px.

### Motion

| What | Time | Where |
|---|---|---|
| Command menu, "Execute?", corner list | 90 ms | `menu-in` |
| Ability submenu | 110 ms | `menu-in-side` |
| Ability name banner, dialogue box | 120 ms | `banner-in`, `menu-in` |
| Conversation title | 160 ms | `banner-in` |
| Speaker portrait | 220 ms | `face-pop` |
| Fade when entering a node | 300 ms | `.fade-out` = `FADE_MS` in `world-ui.ts` |
| Step on the world map | 320 ms | `--walk-ms` = `WALK_MS` |
| Game title | 600 ms | `title-in` |
| Focus ▶ and dialogue ▼ | 0.6 s in 2 steps | `nudge` |
| Damage number | 1.5 s | `pop` = `TIMING.float` |
| Objective banner | 2.2 s | `announce` |

Battle timing (step, jump, strike) lives in `timing.ts`, never in CSS. With `prefers-reduced-motion`, nothing animates.

## 2. Pieces

States: N normal · H hover · F focus · P pressed · D disabled · S selected.

| Piece | Lives in | States | Used in |
|---|---|---|---|
| **Panel** `.panel` | `style.css` | N only (not a control) | battle HUD, place panel on the map, dialogue box, creation |
| **Menu row** `.panel .item` | `style.css` | N transparent · H and F 50% white background with pulsing ▶ (`.focus`) · P no shift · D 45% opacity | commands, abilities, Yes/No, corner list, map actions |
| **Bar** `gauge()` | `hud.ts` | value + number; `change` in stripes (loss blinks, gain does not) | HP, MP and CT in unit panels |
| **Unit panel** `unitPanel()` | `hud.ts` | hero/enemy by side stripe and side text; mirrored for the target | bottom left and right |
| **Portrait** `portrait()` | `hud.ts` | 72×96 (panel, dialogue, creation), 48×64 (party), 44×58 (map), 24×32 (queue) | everywhere with a face |
| **Place beside** `placeBeside()` | `hud.ts` (pure, tested) | right; no room, left; slides vertically | menu beside the unit |
| **Dialog** `dialog()` | `dialog.ts` | opens with focus on ✕ (or the screen's primary); `fixed` does not close; `onBack` goes back | title, Options, Status, How to play, Credits, Party, Sheet, Shop, Tavern, Town, stage end, Developer |
| **Primary button** `button.primary` | `style.css` | N gold · H lighter · F ink ring · P inverted bevel and 2 px down · D faded 50% | one per dialog: the action that continues the flow |
| **Regular button** `button.secondary` | `style.css` | N paper with outline · H lighter · F ring · P sinks · D faded 50% · S 3 px ink border and bold | secondary actions, `choice()` options |
| **Icon button** `iconButton()` | `icons.ts` | like the regular one; name in `title` and `aria-label` | dialog ✕, menu button (3 bars) |
| **Exclusive choice** `choice()` | `dialog.ts` | S through `aria-pressed`; applies at once, no Save | Options (sections, pixel, language, text), class on the Sheet |
| **Value bar** `slider()` | `dialog.ts` | native range input, steps of 5%, number beside it | volume |
| **Definition list** `.keys` | `style.css` | text | keys, sheet numbers, abilities, shop |
| **Legend** `.legend` + `.sw` | `style.css` | text + colour swatch | tile marks, tavern rumours |
| **Dialogue box** `talk()` | `talk.ts` | letter by letter; ▼ blinks when done; `dark` for the opening | conversations and narration |
| **Class card** `.create-card` | `create-ui.ts` | S ink ring and white background | protagonist creation |
| **Map node** `.world-node` | `world-ui.ts` | battle red diamond · story blue circle · done gold border · D dark grey · here: ring with halo | world map |
| **Form field** (text, select, number, checkbox, `details`) | `create-ui.ts`, `dev-menu.ts` | no focus style of its own (the browser's); `--paper-hi` or `#fff` background | protagonist name, Developer menu |
| **Key hint** `.hint` | `style.css` | PC with keyboard only (`.kbd`) | menu rows and buttons |
| **Banner** `.banner` / `.announce` | `style.css` | enters, holds, leaves | ability name, stage objective |

### Focus

- 3 px ring in `--focus`, offset 3 px, on every button and on the volume bar (`:focus-visible`).
- On parchment the ring alone exceeds 4.5:1. **Outside the parchment** (menu button over the scene, map node, title language button, dialogue box) `--focus-halo` is added: a light band hugging the inside of the ring, which guarantees 6.9:1 between the two on any background.
- Menu rows do not use a ring: focus is the ▶ and the light background (`.focus`), moved by the same cursor from keyboard, mouse and gamepad.
- A dialog that rebuilds itself after an action (Sheet) returns focus to the same button.

### Disabled

- One look on parchment: faded (50% in dialogs, 45% on menu rows), no dark grey.
- A disabled button says why in its own text or in the line above it ("20 short", "Party is full: dismiss someone on their sheet").

## 3. Input

| Action | Keyboard | Mouse | Gamepad |
|---|---|---|---|
| Move in menu / cursor | W A S D and arrows | hover | d-pad and stick |
| Confirm | Enter, Space (on press only) | click | A / × |
| Back, close dialog | Esc | right button, click outside, ✕ | B / ○ |
| Inside a dialog | Tab and Shift+Tab; Enter on the button | click | in battle and on the title: d-pad moves between visible buttons, A presses (`pollPad`); on the world map only A works (debt) |
| Volume bar | arrows | drag | left and right with the bar focused |
| World map | arrows walk, Enter enters, G party, Esc title | click on the node | d-pad, A, B |
| Creation | arrows change class, Enter starts | click on the card | same |
| Conversation | Enter next, Esc skip | click | A next |

A new key goes into `keyAction`, `keyHelp` and as a `hint()`. With a dialog open `#app` is `inert`.

## 4. Copy

- A button says what happens, with a verb: "Bring to battle", "Back to party", "Equip Iron blade".
- An empty state says the next step: "The chest is empty: buy at the map Shop…".
- A number comes with its unit: "120 gold", "3 of 4 go to battle".
- The legend names colour and pattern: "Blue, plain frame".

## 5. Fixed on Nov 13 (what was checked at each size is in section 7)

| Problem | Before → after |
|---|---|
| Long unit sheet | 927 px of content in a 644 px dialog (scrolling) → two columns, 480 px with no scrolling; after equipping or changing class, focus stays on the same button |
| Current class looked like a broken button | dark-grey disabled button with ✓ → `choice()` with the selected one marked |
| Invisible focus outside the parchment | ring at 2.5:1 on the dark background and 1.2:1 on the sea → ring + halo, 6.9:1 |
| Legend did not match the map | white swatch, "White: where the hero can move" → the scene's blue, text with colour and pattern |
| Shop and Tavern without the reason | grey Buy and Recruit with only an error sound → "N short" and a line with what is missing; buttons aligned right |
| Two disabled looks | dark grey (dialog) and faded (menu) → faded in both |

## 6. Debts (left for later)

- **Loose font sizes:** 11, 12, 24, 26, 28, 30, 38 and 64 px in the CSS, outside the `--fs-*` scale. A `--fs-xs` and two title sizes are missing.
- **Loose interface colours:** `#fff` (Developer fields, selected card), `#ffd0c4` and `#ffb199` (damage number), `#08050e` (fade), map node colours, confetti in `main.ts`. The illustrated map palette (`.world-art`) is drawing, not interface: it stays as is.
- **Parchment shadow repeated** in 4 rules: becomes a `--paper-frame` token.
- **`--font-px`** holds Cinzel: rename to `--font-title`.
- **Shop with 9 items and a full chest** still scrolls (761 px at 1280×720; fits at 1920×1080): asks for Buy / Sell tabs.
- **Party list** (`.party-card`) is an `li` with `role="button"`: make it a real button.
- **Tavern:** quests and recruiting in the same long dialog (833 px).
- **Gamepad in world map dialogs:** in `?mundo` there is no `Game`, so `pollPad` does not run; the loop in `world-ui.ts` only forwards A. Party, Sheet, Shop and Tavern cannot be navigated with the d-pad.
- **Form field focus:** the ink ring only covers `button` and the volume bar; text, select and checkbox keep the browser's focus.
- **Piece showcase** (`?vitrine`) to see every piece in every state on one screen.
- **`--stone*` and `--star*` tokens** are almost unused after "everything in parchment": check and remove.

## 7. What was and was not checked

Checked in the browser (measured on Nov 13, size confirmed through innerWidth and innerHeight):

| Screen | 1280×720 | 1920×1080 |
|---|---|---|
| Sheet (height, focus after equipping and after changing class) | height | height and focus |
| Shop (buttons, "N short") | yes | height only |
| Tavern (reason line, disabled buttons) | no | yes |
| Legend in Options | yes (in English) | no |
| Focus halo | computed style on the map node | no |

Not checked:

- The halo with a real Tab on the menu button, the title language button and the dialogue box (same rule as the map node).
- English copy of the Sheet, Shop and Tavern on screen (read in the code only); the legend's 4th line ("Red, stripes") came in after the check.
- A physical gamepad (the Gamepad API does not run under automation) and mobile.
- Vitest and the build ran on the final tree; typecheck ran on every commit.
- The artifact was published without opening the page to see whether colours and text show up.
