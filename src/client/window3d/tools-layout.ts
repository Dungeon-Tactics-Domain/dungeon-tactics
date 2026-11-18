// Where the corner buttons sit (tools3d.ts), with no DOM: the gear on the page's top right corner with Back and Undo to
// its left, and the two camera buttons (↺ ↻) on the top left, right after the turn list's column, where nothing else
// lives at that height on any page (Fernando, Nov 18 night: the ☰ list gave way to these). The town has no list: its
// pair sits beside the gear. The unseen HTML buttons under the drawing are seated from these same numbers. Pure and
// tested (tests/tools-layout.test.ts).
import { type Box, lu, place, REGIONS, type Stage } from '../ui3d/layout.ts';

const TAP = 44; // a finger's target (design system, section 8): no button is ever smaller
const GAP = 8; // between the buttons

export type Tool = 'back' | 'undo' | 'left' | 'right' | 'gear';

// Which buttons show: the gear always; Undo and the camera pair while the screen buttons are on (screen-buttons.ts: a
// finger's default, an Options switch on a PC); Back only for a finger while there is a screen to go back to (Esc and
// the right button go back on a PC). style.css .kbd .tools .back hides the same one, so no unseen button takes a click
export const toolShown = (tool: Tool, keys: boolean, hidden: boolean, buttons: boolean) =>
  tool === 'gear' || (tool === 'back' ? !(keys || hidden) : buttons);

const buttonSize = (s: number) => Math.max(TAP, lu(56 * s));
// a button's height, and where the row on the right ends at the bottom with its gap: what the Height corner keeps
// under (hints3d.ts; Fernando, Nov 18: on a phone it sat under the menu button and Undo)
export const toolsFoot = (s: number, top: number) => top + buttonSize(s) + GAP;

export interface ToolsSpec {
  pageW: number;
  stage: Stage; // where the regions are laid out (ui3d/layer.ts)
  inset: { top: number; right: number }; // a panel's margin to the page's edges
  // the row on the right, left to right, gear last: each button's drawn width (Back and Undo carry their word); a
  // button is never narrower than it is tall
  row: number[];
  pair: 'list' | 'row' | 'none'; // the camera pair after the turn list, at the row's left end, or not shown
}

export function toolsLayout(q: ToolsSpec) {
  const size = buttonSize(q.stage.s),
    top = q.inset.top,
    row: Box[] = [],
    widths = [...(q.pair === 'row' ? [size, size] : []), ...q.row];
  // right to left, from the corner
  for (let i = widths.length - 1, x = q.pageW - q.inset.right; i >= 0; i--) {
    const w = Math.max(size, widths[i]);
    x -= w;
    row.unshift({ x, y: top, w, h: size });
    x -= GAP;
  }
  const list = place(REGIONS.turn, q.stage),
    at = list.x + list.w + GAP;
  const pair =
    q.pair === 'list'
      ? [0, 1].map((i): Box => ({ x: at + i * (size + GAP), y: top, w: size, h: size }))
      : q.pair === 'row'
        ? row.splice(0, 2)
        : [];
  return { size, row, pair };
}
export type ToolsLayout = ReturnType<typeof toolsLayout>;
