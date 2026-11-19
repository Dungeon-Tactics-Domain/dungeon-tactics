// What the scene marks during the hero's turn, from the turn screen, the Ui and the cursor: tiles, counters, cursor frame
// and range ring. Pure; the Game applies it to the scene.
import type { Battle } from '../shared/battle/battle.ts';
import { posKey, samePos } from '../shared/battle/grid.ts';
import { cellsOf, farCells, footprint } from '../shared/battle/pathing.ts';
import type { Pos } from '../shared/battle/types.ts';
import { UNIT_DEFS } from '../shared/battle/units.ts';
import { actMarks, actScreen } from './act-marks.ts';
import { chargeFrom, counterDamage, countersFrom } from './charge-lines.ts';
import { longestRange, type Screen } from './command.ts';
import { facingHighlights, type Highlights, highlights, rangeMarks, type Ui } from './interaction.ts';

// `live`: a hero is choosing (its turn, nothing playing); otherwise nothing is marked. `range`: another unit whose
// range its mini menu painted (unit-peek.ts), in place of the screen's marks until the next tap or key
export function turnMarks(b: Battle, s: Screen, ui: Ui, cursor: Pos, live: boolean, range: string | null = null) {
  // on the menu only the acting unit's tile is marked; the range shows when choosing (like FFT)
  const hl: Highlights | null = !live
    ? null
    : range
      ? rangeMarks(b, range)
      : actScreen(s)
        ? actMarks(b, s)
        : s.k === 'facing'
          ? facingHighlights(b)
          : s.k === 'map'
            ? highlights(b, ui, cursor)
            : {
                tiles: footprint(b.actor).map((pos) => ({ pos, kind: 'actor' as const })),
                path: null,
                preview: null,
              };
  const moving = s.k === 'map';
  const landing = hl && moving && b.reach().has(posKey(cursor)); // the cursor is on a tile the move can end on
  const owed = landing && counterDamage(b, cursor);
  // choosing where to move, or resting on the acting unit (menu, facing), the cursor frames the unit's whole square
  // only on a hero's turn (hl): a battle that ended on the actor's death leaves no actor to read
  const size = hl && (moving || samePos(cursor, b.actor.pos)) ? (UNIT_DEFS[b.actor.def].size ?? 1) : 1;
  // dotted outline of the longest range: on the menu around the acting unit; when aiming the move, around the tile under the cursor (if
  // it can be reached), to see where the strike reaches before moving
  const ringAt =
    !hl || range || s.k === 'facing' || (s.k !== 'menu' && !moving) ? null : landing ? cursor : b.actor.pos;
  return {
    hl,
    // a charging unit picking where to walk sees its shot as it would fire from there (Nov 15, Fernando: "so the player
    // knows where to stand"): the destination's square must fit, like the move itself
    charge: landing ? chargeFrom(b, cursor) : null,
    // walking, what that destination draws in counters
    counters: landing ? countersFrom(b, cursor) : null,
    note: owed ? `−${owed[0] === owed[1] ? owed[0] : `${owed[0]}–${owed[1]}`}` : null,
    cursor: hl ? cursor : null,
    size,
    fits: !hl?.tiles.some((m) => m.kind === 'nogo'),
    ring: ringAt
      ? { from: cellsOf(ringAt, UNIT_DEFS[b.actor.def].size ?? 1), range: farCells(b.grid, longestRange(b)) }
      : null,
  };
}
