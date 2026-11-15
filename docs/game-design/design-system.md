# Interface design system (Nov 13, 2026)

How the Dungeon Tactics interface is built: tokens, pieces, states, input and contrast. Read it together with `src/client/CLAUDE.md` (decisions and reasons). The layout follows FFT and Tactics Ogre; art, fonts, icons and text are ours.

**Status:** this document describes the FFT Classic theme (Nov 15), ported from the design lab kit (`dungeon-tactics-lab/design/src/fft-kit.css`): blue gradient panels, light text with a hard dark shadow, yellow focus. It is the only theme since Nov 15 (decision log in the root `CLAUDE.md`).

**Reading copy:** Design System artifact at https://claude.ai/artifact/RR7xTnyBPxE7GyUd1XysSK (Fernando's choice, Nov 13). Change a token or this document: republish `project/tokens.json` and `project/README.md` there.

**Source of truth:** the theme blocks at the top of `src/client/style.css` (tokens, see Themes) and the functions in `hud.ts`, `dialog.ts` and `icons.ts` (pieces). Every text button goes through `button(cls, label, onclick, props)` in `icons.ts`; the stylesheet is grouped by piece, one `/* ---- … ---- */` section each. This document describes; if it disagrees with the code, the code wins and the document is fixed in the same commit.

**Rules of use**

- Colour and size only through `:root` tokens. Exceptions are listed under "Debts".
- A new screen is built from the pieces below. Something missing: first one more parameter on the piece; a new piece only if that does not fit, recorded here and in `src/client/CLAUDE.md`.
- Colour is never the only cue: always text, a drawing or a mark with it (✓, ▶, stripes).
- All text through `t('pt', 'en')`.
- Web on PC first (1280×720 and 1920×1080). The mobile media queries stay, without optimisation for now.

## 1. Tokens

### Themes (Nov 15)

The interface swaps its look through themes (Fernando's request: FFT Classic as the first theme, more later). A theme is only a block of tokens; layout and pieces stay the same.

- **Where:** `:root, :root[data-theme="fft"]` at the top of `style.css` is FFT Classic, the default and the base every other theme inherits from. Another theme is a `:root[data-theme="<id>"]` block right below it that redefines only the tokens it changes. Outside these blocks, CSS and code use tokens only and never name a theme.
- **Choosing:** `src/client/theme.ts` holds `THEMES` (id, Portuguese and English name; the first is the default), `getTheme()` and `setTheme(id)`. The choice is saved in `dt:theme` and set as `data-theme` on `<html>`: an inline script in `index.html` copies the save before the first paint, and `theme.ts` replaces an unknown value with the default on load. Options → Video and effects → Theme lists `THEMES` with `choice()` (one entry today); switching applies at once, no reload.
- **Adding a theme:** one entry in `THEMES`, one `:root[data-theme="<id>"]` block in `style.css`, the contrast table below measured for its pairs. A value that is a literal inside a piece becomes a token in the base block first (with its current value), so the new theme only overrides tokens.
- **Kit names:** the kit's `--font-px` is `--font-title` here (both point to `--font`).
- **Font:** Alegreya Sans hosted in `public/fonts` (`@font-face` under the token block; SIL OFL 1.1, licence beside the files). No Google Fonts.

### Colour

| Group | Tokens | Use |
|---|---|---|
| Panel | `--paper-hi` `--paper` `--paper-lo` `--paper-edge` | top, middle and foot of the blue gradient of panels and dialogs; light frame |
| Ink | `--ink` `--ink-muted` `--ink-off` `--ink-shadow` `--focus` | text, muted text, disabled row text, the hard dark text shadow, yellow highlight/focus/link |
| Focus row | `--focus-band` `--row-hi` | menu row under focus (lighter blue band), row under hover |
| Dark scene | `--bg` `--fg` `--muted` `--overlay` | page background, text over the scene, veil behind dialogs |
| Stone | `--stone` `--stone-lo` `--edge` `--trim` `--trim-hi` `--bevel-*` `--well` | button outside the panels (almost unused today), bar background |
| Primary | `--gold-btn` `--gold-trim` `--on-accent` `--accent` | primary button (brighter blue; the names stayed from the gold one), battle highlight (yellow) |
| Sides | `--hero` `--enemy` | side stripe of panels and queue rows |
| Bars | `--hp` `--mp` `--ct` `--heal` | HP, MP, CT, healing |
| Strike preview | `--strike` `--strike-dmg` | arrow band between the panels |
| Fields | `--paper-white` | Developer fields (dark blue field) |
| Damage number | `--float-dmg` `--float-big` | floating number over the unit; the big one on a strike of 25% of life or more |
| Map nodes | `--node-battle` `--node-story` `--node-done` `--node-locked` `--node-locked-edge` | world map points |
| Fade | `--fade` | black of the fade on entering a map point |
| Tile marks | `--mark-move` `--mark-range` `--mark-blocked` `--mark-threat` `--mark-nogo` | legend; same as `MARK` in `src/client/scene/marks.ts` |

### Contrast (measured on Nov 15, WCAG 2.1 formula, script over the CSS hex values; translucent colours blended over their worst background)

| Pair | On `--paper-hi` (top) | On `--paper` | On `--paper-lo` (foot) | Bar |
|---|---|---|---|---|
| `--ink` | 7.8 | 9.3 | 15.3 | 4.5 ✓ |
| `--ink-muted` | 5.6 | 6.7 | — | 4.5 ✓ |
| `--focus` / `--accent` (titles, names, battle highlight) | 6.0 | 7.2 | — | 4.5 ✓ |
| `--ink-off` (disabled row; the kit's `#8592b4` gave 2.7, raised to `#b4bedc`) | 4.5 | — | — | 4.5 ✓ |

| Other pair | Value | Bar |
|---|---|---|
| `--ink` on `--focus-band` (top / foot) | 5.3 / 6.3 | ✓ (every text in a focused row and in the queue's current row turns `--ink`: on the band `--ink-muted` gives 3.8, `--focus` 4.1, `--ink-off` 3.1) |
| `--on-accent` on `--gold-btn` (top / foot) | 4.9 / 6.7 | ✓ |
| `--ink` on `--paper-white` (fields) | 13.0 | ✓ |
| `--fg` on `--bg` | 17.4 | ✓ |
| `--muted` on `--stone` | 9.3 | ✓ |
| `--fg` / `--strike-dmg` / `--muted` / `--accent` / `--heal` on the strike band over a white sky | 11.2 / 7.9 / 8.0 / 8.7 / 7.1 | ✓ |
| `--fg` on the place name tag over the map land | 11.9 | ✓ |
| `--focus` alone on the white sky | 1.4 | ✗ → hence `--focus-halo` (dark band: 18.8 on white, 13.5 against the ring) |

### Typography

| Token | Value | Use |
|---|---|---|
| `--font` | Alegreya Sans (hosted), weights 400, 500 (body), 700, 800, italic 400 | all text |
| `--font-title` | `var(--font)` | titles, menu rows, primary button, queue (FFT uses one plain letter; kept as its own token so a theme can change it) |
| `--fs-xs` / `--fs-sm` / `--fs` / `--fs-lg` / `--fs-xl` | 12 / 16 / 20 / 24 / 34 px | fps counter / note and help / body / menu item and name / preview damage |
| `--fs-title` / `--fs-display` | 28 / 38 px | dialog title and opening narration / game title in a window and big damage number |

Minimum text: 16 px (the key hint, 11 px, and the fps counter and the map compass letters, 12 px, are the exceptions). Panel and dialog text carries `--ink-shadow`.

### Space, corner, shadow

| Token | Value | Use |
|---|---|---|
| `--gap` | 8 px | default gap between pieces; multiples of 4 (4, 6, 8, 12, 16, 24) |
| `--tap` | 44 px | minimum button height |
| `--r` | 2 px | corner of everything |
| `--slot-w` | 440 px | bottom unit panels |
| `--frame` / `--frame-pressed` | bevel with a steel trim | button outside the panels |
| `--glow` | yellow glow | selected button outside the panels |
| `--focus-halo` | 2 px of `#0a1028` | focus outside the panels (see Focus) |
| `--paper-frame` | dark outer line, thin inner line, inner top glow, 3 px drop shadow | `.panel`, `.dialog`, menu button, title menu |

| `--inset` | 12 px | panel margin to the screen edge |

### Motion

| What | Time | Where |
|---|---|---|
| Command menu, "Execute?", corner list | 90 ms (`--t-menu`) | `menu-in` |
| Ability submenu | 110 ms | `menu-in-side` |
| Ability name banner, dialogue box | 120 ms (`--t-open`) | `banner-in`, `menu-in` |
| Conversation title | 160 ms | `banner-in` |
| Speaker portrait | 220 ms | `face-pop` |
| Fade when entering a node | 300 ms | `.fade-out` = `FADE_MS` in `world-ui.ts` |
| Step on the world map | 320 ms | `--walk-ms` = `WALK_MS` |
| Game title | 600 ms | `title-in` |
| Focus ▶ and dialogue ▼ | 0.6 s in 2 steps (`--t-nudge`) | `nudge` |
| Damage number | 1.5 s | `pop` = `TIMING.float` |
| Objective banner | 2.2 s | `announce` |

Battle timing (step, jump, strike) lives in `timing.ts`, never in CSS. With `prefers-reduced-motion`, nothing animates.

## 2. Pieces

States: N normal · H hover · F focus · P pressed · D disabled · S selected.

| Piece | Lives in | States | Used in |
|---|---|---|---|
| **Panel** `.panel` | `style.css` | N only (not a control) | battle HUD, place panel on the map, dialogue box, creation |
| **Menu row** `button('item', …)` in a `.panel` | `icons.ts`, `style.css` | N transparent · H brightness 1.18 (the corner list's H is `--row-hi`), F `--focus-band` with pulsing ▶ (`.focus`) · P no shift · D text `--ink-off` without the shadow (flat) | commands, abilities, Yes/No, corner list, map actions |
| **Bar** `gauge()` | `hud.ts` | value + number; `change` in stripes (loss blinks, gain does not) | HP, MP and CT in unit panels |
| **Unit panel** `unitPanel()` | `hud.ts` | hero/enemy by side stripe and side text; mirrored for the target | bottom left and right |
| **Portrait** `portrait()` | `hud.ts` | 72×96 (panel, dialogue, creation), 48×64 (party), 44×58 (map), 24×32 (queue) | everywhere with a face |
| **Place beside** `placeBeside()` | `hud.ts` (pure, tested) | right; no room, left; slides vertically | menu beside the unit |
| **Dialog** `dialog()` | `dialog.ts` | opens with focus on ✕ (or the screen's primary); `fixed` does not close; `onBack` goes back | title, Options, Status, How to play, Credits, Party, Sheet, Shop, Tavern, Town, stage end, Developer |
| **Primary button** `button('primary', …)` | `icons.ts`, `style.css` | N bright blue · H lighter · F yellow ring · P inverted bevel and 2 px down · D faded 50% | one per dialog: the action that continues the flow |
| **Regular button** `button('secondary', …)` | `icons.ts`, `style.css` | N panel gradient with a light outline · H lighter · F ring · P sinks · D faded 50% · S 3 px yellow border and bold | secondary actions, `choice()` options |
| **Icon button** `iconButton()` (a `button('icon', …)` named by `title` and `aria-label`) | `icons.ts` | like the regular one; name in `title` and `aria-label` | dialog ✕, menu button (3 bars) |
| **Exclusive choice** `choice()` | `dialog.ts` | S through `aria-pressed`; applies at once, no Save | Options (sections, pixel, language, text), class on the Sheet |
| **Value bar** `slider()` | `dialog.ts` | native range input, steps of 5%, number beside it | volume |
| **Definition list** `.keys` | `style.css` | text | keys, sheet numbers, abilities, shop |
| **Legend** `.legend` + `.sw` | `style.css` | text + colour swatch; `.sw.nogo` also draws the mark's cross, its red is close to the threat's | tile marks, tavern rumours |
| **Dialogue box** `talk()` | `talk.ts` | letter by letter; ▼ blinks when done; `dark` for the opening | conversations and narration |
| **Class card** `.create-card` | `create-ui.ts` | S yellow ring and `--focus-band` background | protagonist creation |
| **Map node** `.world-node` | `world-ui.ts` | battle red diamond · story blue circle · done gold border · D dark grey · here: ring with halo | world map |
| **Form field** (text, select, number, checkbox, `details`) | `create-ui.ts`, `dev-menu.ts` | F the same yellow ring as buttons (since Nov 14); `--paper-hi` or `--paper-white` background | protagonist name, Developer menu |
| **Key hint** `.hint` | `style.css` | PC with keyboard only (`.kbd`) | menu rows and buttons |
| **Banner** `.banner` / `.announce` | `style.css` | enters, holds, leaves | ability name, stage objective |

### Focus

- 3 px ring in `--focus`, offset 3 px, on every button, form field (text, number, select, checkbox, `details` summary) and the volume bar (`:focus-visible`).
- On the blue panels the yellow ring alone exceeds 6:1. **Outside the panels** (menu button over the scene, map node, title language button, dialogue box) `--focus-halo` is added: a dark band hugging the ring, so it shows on the bright sky (18.8:1) and on the grass.
- Menu rows do not use a ring: focus is the ▶ and the light background (`.focus`), moved by the same cursor from keyboard, mouse and gamepad.
- A dialog that rebuilds itself after an action (Sheet) returns focus to the same button.

### Disabled

- One look: buttons in dialogs faded to 50%; menu rows in `--ink-off` without the text shadow (4.5:1, still readable); no dark grey.
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
| Invisible focus outside the panels | ring at 2.5:1 on the dark background and 1.2:1 on the sea → ring + halo (today a dark halo, see Focus) |
| Legend did not match the map | white swatch, "White: where the hero can move" → the scene's blue, text with colour and pattern |
| Shop and Tavern without the reason | grey Buy and Recruit with only an error sound → "N short" and a line with what is missing; buttons aligned right |
| Two disabled looks | dark grey (dialog) and faded (menu) → faded in both |

## 6. Debts (left for later)

- **Loose font sizes:** one-off sizes left outside the `--fs-*` scale: 11 (key hint), 12 (compass letters, map art), 26 (damage number), 28 (creation title), 30 (objective banner) and 64 px (game title).
- **Loose interface colours:** the confetti colours in `game/end-screens.ts`. The illustrated map palette (`.world-art`, `.world-icon`, `.world-compass`) is drawing, not interface: it stays as is.
- **Shop with 9 items and a full chest** still scrolls (761 px at 1280×720; fits at 1920×1080): asks for Buy / Sell tabs.
- **Party list** (`.party-card`) is an `li` with `role="button"`: make it a real button.
- **Tavern:** quests and recruiting in the same long dialog (833 px).
- **Gamepad in world map dialogs:** in `?world` there is no `Game`, so `pollPad` does not run; the loop in `world-ui.ts` only forwards A. Party, Sheet, Shop and Tavern cannot be navigated with the d-pad.
- **Piece showcase** (`?vitrine`) to see every piece in every state on one screen.
- **`--stone*` tokens** are almost unused since every window took the panel look (Nov 13): only the base `button` (no screen shows it bare today) and the selected class card (`button[aria-pressed="true"]` adds `--frame` and `--glow`) still draw with them. The unused `--star`, `--star-ink` and `--heal-ink` were removed on Nov 14.

## 7. What was and was not checked

Nov 15 (FFT Classic): title, credits, battle commands, abilities, corner menu, Status, Options (Game, Video, Controls), aiming, dialogue box, world map, town and party windows, opening and creation, at 1920×1080 in pt and en, in headless Chrome; the strike preview strips and 1280×720 were not opened.

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
