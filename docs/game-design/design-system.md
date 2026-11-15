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
| Focus row | `--focus-band` `--row-hi` `--row-off` | menu row under focus (lighter blue band), row under hover, disabled row (sunken dark band, focused or not) |
| Dark scene | `--bg` `--fg` `--muted` `--overlay` `--shade` | page background, text over the scene, veil behind dialogs; `--shade` is the dark navy the other veils mix with `color-mix()` at their own alpha: debug readout 55%, ability banner 88%, dialogue veil 35% |
| Stone | `--stone` `--stone-lo` `--edge` `--trim` `--trim-hi` `--bevel-*` `--well` | button outside the panels (almost unused today), bar background |
| Primary | `--gold-btn` `--gold-trim` `--on-accent` `--accent` | primary button (brighter blue; the names stayed from the gold one), battle highlight (yellow) |
| Sides | `--hero` `--enemy` | side stripe of panels and queue rows |
| Bars | `--hp` `--mp` `--ct` `--heal` | HP, MP, CT, healing |
| Strike preview | `--strike-dmg` `--enemy-paper` `--enemy-hi` `--strike` | damage number; the wine gradient of an enemy target's half and its ◆; `--strike` is now only the translucent band of the "+N targets" line |
| Fields | `--paper-white` | Developer fields (dark blue field) |
| Damage number | `--float-dmg` `--float-big` | floating number over the unit; the big one on a strike of 25% of life or more |
| Tile marks | `--mark-move` `--mark-range` `--mark-blocked` `--mark-threat` `--mark-nogo` | legend; same as `MARK` in `src/client/scene/marks.ts` |
| Command orbs | `--orb-blue` `--orb-gold` `--orb-off` | glass orb (`.orb` with `act`/`blue` or `status`/`gold`) before Act and Status in the command menu and before each row of the result window; `--orb-off` on a disabled row |
| Theme art | `--ability-atlas` | the whole `url(...)` of the theme's 32 px ability icon atlas (`public/ui/fft/atlas-32.png`); CSS cannot join a path to a file name, so a theme with its own art redefines the full value |

### Contrast (measured on Nov 15, WCAG 2.1 formula, script over the CSS hex values; translucent colours blended over their worst background)

| Pair | On `--paper-hi` (top) | On `--paper` | On `--paper-lo` (foot) | Bar |
|---|---|---|---|---|
| `--ink` | 7.8 | 9.3 | 15.3 | 4.5 ✓ |
| `--ink-muted` | 5.6 | 6.7 | — | 4.5 ✓ |
| `--focus` / `--accent` (titles, names, battle highlight) | 6.0 | 7.2 | — | 4.5 ✓ |
| `--ink-off` (disabled row; the kit's `#8592b4` gave 2.7, raised to `#b4bedc`) on its `--row-off` band | 6.8 (4.5 without the band) | 7.6 | 9.7 | 4.5 ✓ |

| Other pair | Value | Bar |
|---|---|---|
| `--ink` on `--focus-band` (top / foot) | 5.3 / 6.3 | ✓ (every text in a focused row turns `--ink`; the queue's current row has no band since Nov 15, its NOW is `--focus` on the panel: on the band `--ink-muted` gives 3.8, `--focus` 4.1, `--ink-off` 3.1, so a focused disabled row keeps its `--row-off` band and `--ink-off` text and shows only the ▶) |
| `--on-accent` on `--gold-btn` (top / foot) | 4.9 / 6.7 | ✓ |
| `--ink` on `--paper-white` (fields) | 13.0 | ✓ |
| `--fg` on `--bg` | 17.4 | ✓ |
| `--muted` on `--stone` | 9.3 | ✓ |
| `--fg` on the "+N targets" band over a white sky | 11.2 | ✓ |
| Strike preview, action half on `--paper-hi` (top): `--ink` / `--strike-dmg` / `--heal` | 7.8 / 5.5 / 4.9 | ✓ (Nov 15) |
| Strike preview, enemy half on `--enemy-paper` (top `#7a2436`): `--ink` / `--ink-muted` | 9.1 / 6.6 | ✓ (Nov 15) |
| Strike preview, hero half on `--paper`: `--ink-muted` / `--accent` (ALLY!) | 6.7 / 7.2 | ✓ (Nov 15) |
| Menu head band (6% `--ink` over `--paper-hi`) / picked row (45% `--shade` over `--paper-hi`): `--ink` | 6.7 / 12.4 | ✓ (Nov 15) |
| ◆ on `--enemy-paper` (not text, the word beside it carries the side): `--enemy-hi` / `--enemy` | 4.9 / 2.6 | hence `--enemy-hi` |
| `--fg` on the place name tag over the map land | 11.9 | ✓ |
| Window head band (6% `--ink` over `--paper-hi`): `--ink` / `--focus` (victory title) | 6.7 / 5.2 | ✓ (Nov 15) |
| Regular button: `--ink` on `--stone` / `--stone-lo` | 13.0 / 15.3 | ✓ (Nov 15) |
| Result highlight band (25% `--shade` over `--paper-hi`): `--ink-muted` | 7.3 | ✓ (Nov 15; the same band under the Sheet head and the Tavern quests) |
| Hover band `--row-hi` over `--paper-hi`: `--ink` / `--ink-muted` | 6.0 / 4.3 | ✓ / ✗ → the party row's muted lines turn `--ink` on hover and focus (Nov 15) |
| Marks on `--focus-band`: the chosen option's ✓ in `--ink` / the ▶ and ▸ focus marks in `--focus` | 5.3 / 4.1 | ✓ (Nov 15, review: the ✓ was `--focus` at 4.1; the ▶ and ▸ are non-text marks, bar 3:1; a scan of the title, Quick battle, Options, world map and Party found no `--ink-muted` text on the band) |
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
| `--slot-w` | `min(672px, 35vw)` | bottom unit panels (the lab kit's 35% of 1920; 448 px at 1280) |
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
| Speaker mouth (painted face) | 180 ms per frame while the text types: talk1 from the first instant, then talk2, talk1, neutral…; neutral when the sentence is out | `mouthFrame` in `talk.ts` (JS: it follows the typing, not a CSS loop) |
| Game title | 600 ms | `title-in` |
| Focus ▶ and dialogue ▼ | 0.6 s in 2 steps (`--t-nudge`) | `nudge` |
| Damage number | 1.5 s | `pop` = `TIMING.float` |
| Objective banner | 2.2 s | `announce` |

Battle timing (step, jump, strike) lives in `timing.ts`, never in CSS. With `prefers-reduced-motion`, nothing animates.

## 2. Pieces

States: N normal · H hover · F focus · P pressed · D disabled · S selected.

| Piece | Lives in | States | Used in |
|---|---|---|---|
| **Panel** `.panel` | `style.css` | N only (not a control) | battle HUD, dialogue box |
| **Menu row** `button('item', …)` in a `.panel` | `icons.ts`, `style.css` | N transparent · H brightness 1.18 (the corner list's H is `--row-hi`), F `--focus-band` with pulsing ▶ (`.focus`) · P no shift · D text `--ink-off` without the shadow (flat) on the sunken `--row-off` band, also when focused (▶ but no `--focus-band`) | commands, abilities, Yes/No, corner list, map actions; in the command menu and submenu the row is 60 px tall with a 32 px marker (atlas icon, or an orb for Act and Status) before the name, and Act shows S (`.picked`: sunken band, yellow edge and ▸) while the submenu is open |
| **Bar** `gauge()` | `hud.ts` | uppercase label, 10 px bar with a dark edge and a light gloss over the fill (`--bar`), number at `--fs`; `change` in stripes (loss blinks, gain does not) | HP, MP and CT in unit panels |
| **Unit panel** `unitPanel()` | `hud.ts` | `--slot-w` wide, 6 px side stripe, the 64×64 battle face (units without a sheet: the 96×128 portrait, 72×96 below 1600 px), name with the side in uppercase after ● (hero) or ◆ (enemy), a class line for units with their own name, bars; mirrored for the target | bottom left and right |
| **Menu head** `.panel-head` | `style.css`, `hud.ts` (`menuHead`) | N only: the menu name over a faint band and a line; `aria-hidden`, the menu's `aria-label` says it | command menu (Commands, 422 px), submenu (Abilities, 460 px), "Execute?" (title with the ability icon, 460 px) |
| **Ability icon** `abilityIcon(id)` | `icons.ts`, `style.css` | 32×32 at 1:1 (`image-rendering: pixelated`), the atlas cell of the ability (`atlasCell`, pure and tested against the atlas .json) over the game-icons `on-target` symbol: no cell (FFT study abilities, a new ability) or an image that fails shows the symbol; faded 50% in a disabled row | abilities submenu, Move and Wait rows of the command menu, "Execute?" title |
| **Portrait** `portrait()` | `hud.ts` | 96×128 (unit panel; 72×96 below 1600 px), 99×132 in the dialogue box (the face's height), 48×64 (party), 36×36 (queue, cropped from the top; units without a battle face); sizes set by the container, `portrait()` itself unchanged | everywhere with a face |
| **Turn list** `.queue` (`renderQueue`) | `hud.ts`, `style.css` | a 196 px column, every unit of the battle (Nov 15, Fernando's decision: it showed the next 4): title with the PgUp PgDn hint, then one compact row per turn from NOW until every unit and every queued charge has shown once (`queueRows`, `roundLength` in `turn-list.ts`): the 36 px battle face (or the portrait) framed in its side colour (yellow with a glow for NOW) beside two one-line texts, the number (NOW in `--focus`, ◎ target in `--focus`) and the name after ● or ◆, ending in … when long; a charge row has the caster's face, the 32 px ability icon, "resolves in N" (ticks) and the ability's name, in muted italics; the charge being confirmed on "Execute?" with a yellow outline, kept in view (`keepInView`). The column ends a gap above the acting unit's panel (`hud.ts` sets its height from that panel's) and scrolls (wheel, PgUp/PgDn, right stick); a new turn scrolls back to NOW, a redraw keeps the scroll | top left, under the tile line |
| **Place beside** `placeBeside()` | `hud.ts` (pure, tested) | right; no room, left; slides vertically | menu beside the unit |
| **Dialog** `dialog()` | `dialog.ts` | opens with focus on ✕ (or the screen's primary); `fixed` does not close; `onBack` goes back. Since Nov 15 (theme screens) the title sits on the battle menus' head band (6% `--ink` over the panel, a light line under it) and the ✕ is a bare glyph on the band (H `--row-hi`) | town, expedition map, title, Options, Status, How to play, Credits, Party, Sheet, Shop, Tavern, battle end, room end, Developer |
| **Primary button** `button('primary', …)` | `icons.ts`, `style.css` | N bright blue, bold at `--fs` in windows · H lighter · F yellow ring · P inverted bevel and 2 px down · D faded 50% | one per dialog: the action that continues the flow |
| **Regular button** `button('secondary', …)` | `icons.ts`, `style.css` | N the lab kit's dark blue (`--stone` → `--stone-lo`) with the steel trim (`--trim`) and a drop shadow, `--fs` weight 500 (Nov 15) · H lighter · F ring · P sinks · D faded 50% · S `--focus-band`, yellow border, bold and a ✓ before the label | secondary actions, `choice()` options |
| **Icon button** `iconButton()` (a `button('icon', …)` named by `title` and `aria-label`) | `icons.ts` | like the regular one; name in `title` and `aria-label` | dialog ✕, menu button (3 bars) |
| **Exclusive choice** `choice()` | `dialog.ts` | S through `aria-pressed` (the regular button's S: band, yellow border, ✓); applies at once, no Save; a button is never narrower than its label, so a long row wraps. Options' section column is a vertical `choice()` drawn as command menu rows (Nov 15): the open section like Act with its submenu open (sunken 45% `--shade` band, yellow left edge, ▸), the focused one on `--focus-band` with the ▶ | Options (sections, pixel, language, text), class on the Sheet |
| **Value bar** `slider()` | `dialog.ts` | native range input, steps of 5%, number beside it | volume |
| **Definition list** `.keys` | `style.css` | text; in the Shop each row is split by a faint `--paper-edge` line, like the kit's list (Nov 15) | keys, sheet numbers, abilities, shop |
| **Legend** `.legend` + `.sw` | `style.css` | text + colour swatch; `.sw.nogo` also draws the mark's cross, its red is close to the threat's | tile marks, tavern rumours |
| **Painted face** `faceSheet()` | `talk.ts`, `.face-sheet` in `style.css` | one frame of the speaker's sheet (`public/chars/px/<model>.webp`, described in `src/content/faces.json`, bundled so the box never waits on the network) at 128×128, the nearest whole ratio of the frame: the painted 128 px sheets as they are, scaled smooth; the 64 px skeletons at 2× with `image-rendering: pixelated` (`.enlarged`); neutral at rest; the mouth opens from the line's first instant and cycles `mouthFrames`; `[]` stays still; Instant text speed and reduced motion: no animation; sheets preloaded when the conversation opens, and the portrait stands in until a sheet is decoded; no sheet or a failed image: `portrait()` at 99×132, the same height | dialogue box |
| **Battle face** `faceSheet(def, face, 'battle-face portrait')` | `hud.ts` (`face`, `showFaces`), `battle-face.ts`, `.battle-face` in `style.css` | the same sheet as a `.portrait` (frame, side colour, NOW glow) at 64×64 in the unit panels and on the victory card, 36×36 in the turn list, always `image-rendering: pixelated` (128 → 64 is a whole ratio; 36 is not and drops rows unevenly); the sheet by class (`battleFace`: the Warrior with the barbarian, the rest by the model on the map); expression by the events played (`faceCues`): shout 700 ms on an attack or a charge, angry 2200 ms on a counter-attack, hurt 900 ms on damage (then angry 2200 ms after a hit of 25% of life or more), smile 2200 ms for whoever downs a unit, wounded under 30% of life, else neutral; on a victory the highlight hero smiles on the result card; the small skeletons stay neutral (no expression frames); timed on the battle clock and moved per frame without a redraw | unit panels, turn list, victory card |
| **Still face** `stillFace(def, expr, big)` | `hud.ts`, `.still-face` in `style.css` | the battle face's sheet (`battleFace`) held on one expression outside the battle: 64×64, `big` 128×128, whole ratios of the 128 px paint, `image-rendering: pixelated`; not a `.portrait`, whose party sizes (48×64, 96×128) would crop it; a class without a sheet keeps `portrait()` | result hero cards; neutral in the Party rows (64), the Sheet head (128) and on the Tavern's recruit buttons (64, `.recruits`, face beside the text) |
| **Dialogue box** `talk()` | `talk.ts` | letter by letter; ▼ blinks when done; `dark` for the opening | conversations and narration |
| **Window list** `.camp-list` (a `.menu-actions` of buttons) | `dialog.ts`, `style.css` | up and down arrows (and the d-pad) move the focus through the list, wrapping; the menu row inside a window (Nov 15): bare rows at `--fs-lg`, H `--row-hi`, F (the real focus, so keyboard, mouse and gamepad share it) `--focus-band` with a yellow line and the pulsing ▶; the primary looks like the others, the focus starting on it marks it; on the title the list sits on the panel gradient down to `--paper-lo`, and Continue's where-to line is `--ink-muted`, `--ink` when focused | title menu, Quick battle, Town |
| **Party row** `.party-list .party-card` | `town-ui.ts`, `style.css` | like a menu row: H `--row-hi`, F `--focus-band`, yellow line and ▶; its muted lines (class, numbers, abilities) turn `--ink` on both (muted gives 4.3:1 on `--row-hi` and 3.8 on `--focus-band`) | Party window |
| **Sheet head** `.sheet .party-card` | `style.css` | the unit panel's look: `--hero` side stripe on a 25% `--shade` band, the 128 px still face (96×128 `portrait()` for a class without a sheet), class at `--fs-lg` | unit Sheet |
| **Gold counter** `.gold` | `town-ui.ts`, `style.css` | the lab kit's counter: uppercase `--ink-muted` label, the number at `--fs-lg` after a coin drawn from `--ct` and `--orb-gold` | Shop |
| **Expedition room** `button(…)` in `.crawl-row` | `game/crawl.ts`, `style.css` | a primary or regular button stacked in two lines: the group's name (with "Boss:" and, when closed, why: cleared, path not taken, opens after the one before) over its enemies in `.continue-where`; open rooms primary, the rest D; one `.crawl-row` panel per row of the floor, the party's life on a `.legend` panel above | expedition map (Nov 15) |
| **Form field** (text, select, number, checkbox, `details`) | `dev-menu.ts` | F the same yellow ring as buttons (since Nov 14); `--paper-hi` or `--paper-white` background | Developer menu |
| **Key hint** `.hint` | `style.css` | PC with keyboard only (`.kbd`) | menu rows and buttons |
| **Strike preview** `strikes()` | `hud.ts`, `style.css` | one two-colour strip per target, up to 3, then "+N targets": the action half on the panel blue (ability icon, name, the big −dmg or +heal PTS in `--strike-dmg` or `--heal`, ⊕ hit chance) and the target half on its side's colour (`--enemy-paper` for an enemy, the panel blue for a hero): name and side, the life bar with the stripes (`gauge` `change`) and the `strikeInfo` line (direction, push, life after, ALLY! in `--accent`). While aiming it takes the target panel's place, beside the acting panel, up to 760 px wide | bottom, while aiming and on "Execute?" |
| **Result window** `dialog('result', …)` with `won` or `lost` on the window | `game/end-screens.ts`, `style.css` | the `result-overlay` hides the battle HUD behind it; the title at `--fs-display` on the head band (`--focus` on a victory); the hero cards; the highlight as `mvpCard()` (a small unit panel: `portrait()`, MVP label, name, damage and takedowns, `--hero` side stripe on a 25% `--shade` band); what was won as `.result-gains` rows after a gold orb (the Until Dawn record); the flavour line; the actions (Nov 15, composed from the HUD pieces, no lab mockup) | standalone battle end, expedition room, Until Dawn record, defeat |
| **Hero card** `heroCards()` | `game/end-screens.ts`, `.result-heroes` in `style.css` | one card per hero who fought, the fallen included (Nov 15, the lab's result mock-up): a still face by how the battle left them (`endExpression`: fallen hurt and greyed, under 30% of life wounded, else smile on a victory, neutral on a defeat), name, the class or Fallen in `.result-label`, the life gauge with its label and number over a full-width bar; `--hero` top stripe on a 25% `--shade` band; each card is a size container, so the face is 128 px in a card wide enough and 64 in the 560 px window | room end, standalone battle end |
| **Banner** `.banner` / `.announce` | `style.css` | enters, holds, leaves | ability name, stage objective |

### Focus

- 3 px ring in `--focus`, offset 3 px, on every button, form field (text, number, select, checkbox, `details` summary) and the volume bar (`:focus-visible`).
- On the blue panels the yellow ring alone exceeds 6:1. **Outside the panels** (menu button over the scene, map node, title language button, dialogue box) `--focus-halo` is added: a dark band hugging the ring, so it shows on the bright sky (18.8:1) and on the grass.
- Menu rows do not use a ring: focus is the ▶ and the light background (`.focus`), moved by the same cursor from keyboard, mouse and gamepad.
- A dialog that rebuilds itself after an action (Sheet) returns focus to the same button.

### Disabled

- One look: buttons in dialogs faded to 50%; menu rows in `--ink-off` without the text shadow on a sunken `--row-off` band (6.8:1, still readable; the band also tells a focused disabled row from a focused active one); no dark grey.
- A disabled button says why in its own text or in the line above it ("20 short", "Party is full: dismiss someone on their sheet").

## 3. Input

| Action | Keyboard | Mouse | Gamepad |
|---|---|---|---|
| Move in menu / cursor | W A S D and arrows | hover | d-pad and stick |
| Confirm | Enter, Space (on press only) | click | A / × |
| Back, close dialog | Esc | right button, click outside, ✕ | B / ○ |
| Inside a dialog | Tab and Shift+Tab; Enter on the button | click | in battle and on the title: d-pad moves between visible buttons, A presses (`pollPad`) |
| Volume bar | arrows | drag | left and right with the bar focused |
| Turn list | PgUp, PgDn (a page less one row) | wheel over the list | right stick up and down (the bumpers and triggers already turn and zoom the camera) |
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

- **Loose font sizes:** one-off sizes left outside the `--fs-*` scale: 11 (key hint), 26 (damage number), 30 (objective banner) and 64 px (game title).
- **Loose interface colours:** the confetti colours in `game/end-screens.ts` (the title's old gold glow became `--focus` on Nov 15). The illustrated map palette (`.world-art`, `.world-icon`, `.world-compass`) is drawing, not interface: it stays as is.
- **Shop with 9 items and a full chest** still scrolls (761 px at 1280×720; fits at 1920×1080): asks for Buy / Sell tabs.
- **Party list** (`.party-card`) is an `li` with `role="button"`: make it a real button.
- **Tavern:** quests and recruiting in the same long dialog (833 px).
- **Piece showcase** (`?vitrine`) to see every piece in every state on one screen.
- **`--stone*` tokens** are almost unused since every window took the panel look (Nov 13): only the base `button` (no screen shows it bare today) and the selected class card (`button[aria-pressed="true"]` adds `--frame` and `--glow`) still draw with them. The unused `--star`, `--star-ink` and `--heal-ink` were removed on Nov 14.

## 7. What was and was not checked

Nov 15 (turn list with every unit), in the repo's headless Chrome through the sandbox (muted), in `_notas/agentes/turn-list-*.png`: Ash Wood with its 8 units and with 14 (6 added); with 14 units the abilities submenu, aiming with three strike strips, "Execute?" with three strips (en) and with one (pt), and a queued Blast on the next unit's turn; Until Dawn's title (pt), at 1280×720 and 1920×1080; the list ends 11 px above the acting panel at 1280×720 and covers no menu, strip or panel. On a live sandbox page: PgDn scrolls to the end, a redraw keeps the scroll, PgUp goes back, a new turn scrolls to NOW. Not checked: a physical gamepad (right stick), the mouse wheel by hand, mobile widths.

Nov 15 (block 2, battle HUD in the lab kit's layout and the 32 px ability icons), in the repo's headless Chrome through the sandbox (`npm run sandbox`, muted), before and after the change, in `_notas/agentes/bloco2-evidencia/`: command menu with the abilities submenu (warrior and mage), aiming (one target, three targets with an ally; a heal and the game-icons fallback with a broken atlas path only after), "Execute?" (one target and a charged area spell, with the queue preview), at 1920×1080 in pt and en and at 1280×720 in en. Not checked: a 1280×720 shot in pt, the mobile widths, a disabled ability row with its icon on screen, the full turn list (L) at 1280×720.

Nov 15 (theme screens, block C: end of battle), in the repo's headless Chrome through a script that opens each window over a battle (`dialog`/`end-screens.ts` called on the page, muted; pw-edge and pw-chrome refused the connection), before and after, in `_notas/agentes/tema-telas-evidencia/`: victory, quest reward, Until Dawn record, defeat, stage cleared, campaign complete and stage defeat, at 1920×1080 in pt and en and at 1280×720 in pt and en. Not checked: a real battle played to its end (the windows were opened by script with a fixed highlight), the confetti over the new window.

Nov 15 (theme screens, block A: world map and towns), same script and folder: the map at the start (Vauclair, a town: Town row shown) and mid-campaign (done, open and locked nodes, the walked road), Town, Shop, Tavern, Party, Sheet with the class choice, at 1920×1080 in pt and en and at 1280×720 in pt and en. Not checked: the gamepad in these windows (still only A, see Debts), equipping and changing class after the restyle (the flow did not change), a full chest scrolling the Shop at 1280.

Nov 15 (theme screens, block B: title and options), same script and folder: title, Quick battle, How to play, Credits, Options (Game, Sound, Video and effects, Controls, Language), and the two windows the shared window change also restyled (Status, Developer), at 1920×1080 in pt and en and at 1280×720 in pt and en. Not checked: a physical gamepad, reduced motion on screen (the new ▶ joined the reduced-motion list), mobile widths.

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
