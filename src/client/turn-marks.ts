// What the scene marks during the hero's turn, from the turn screen, the Ui and the cursor: tiles, counters, cursor frame
// and range ring. Pure; the Game applies it to the scene.
import { ABILITIES } from '../shared/battle/abilities.ts';
import type { Battle } from '../shared/battle/battle.ts';
import { posKey, samePos, subOf } from '../shared/battle/grid.ts';
import { cellsOf, farCells, footprint, unitAt } from '../shared/battle/pathing.ts';
import { traceShot } from '../shared/battle/shot.ts';
import type { Pos } from '../shared/battle/types.ts';
import { UNIT_DEFS } from '../shared/battle/units.ts';
import { actMarks, actScreen, spotAim } from './act-marks.ts';
import { chargeFrom, counterDamage, countersFrom, countersOwed } from './charge-lines.ts';
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
  const spot = live && !range ? spotAim(b, s) : null; // the tile screen of an ability: the strike from the picked tile
  const moving = s.k === 'map';
  const landing = hl && moving && b.reach().has(posKey(cursor)); // the cursor is on a tile the move can end on
  const owed = landing && counterDamage(b, cursor);
  // The cursor's square (Fernando, Nov 20: never one half tile, unless the target is that small): choosing where to move
  // or where to act from, the acting unit's square; over a unit, exactly its body (a large one's 4x4, a mini skeleton's
  // one cell); elsewhere a whole tile's 2x2 half tiles from the cell under it, so it walks half a tile at a time. Only on a hero's turn (hl): a battle that ended on the actor's
  // death leaves no actor to read
  const own = UNIT_DEFS[b.actor.def].size ?? 1,
    on = hl && !moving && s.k !== 'spot' ? unitAt(b.state, cursor) : undefined,
    size = !hl ? 1 : moving || s.k === 'spot' ? own : on ? (UNIT_DEFS[on.def].size ?? 1) : subOf(b.grid),
    // the square's corner: the body's own over a unit, else the cell kept inside the map
    corner = on ? on.pos : { x: Math.min(cursor.x, b.grid.width - size), y: Math.min(cursor.y, b.grid.height - size) };
  // dotted outline of the longest range: on the menu around the acting unit; when aiming the move, around the tile under the cursor (if
  // it can be reached), to see where the strike reaches before moving
  const ringAt =
    !hl || range || s.k === 'facing' || (s.k !== 'menu' && !moving) ? null : landing ? cursor : b.actor.pos;
  // the shot line and the cast area (Nov 13, "like Tactics Ogre"; the trajectory grill of Nov 15; Nov 19 on the tile screen):
  // a flying ability shows the rule's own path to its aim, red past where it stops, traced from where the unit will stand
  // (the picked tile); a spell cast on the target shows its area and a still line instead
  const a = spot ? ABILITIES[spot.ability] : undefined;
  const onSelf = !!spot && samePos(spot.from, spot.target);
  const caster = spot && { ...b.actor, pos: spot.from };
  return {
    hl,
    // a charging unit picking where to walk sees its shot as it would fire from there (Nov 15, Fernando: "so the player
    // knows where to stand"): the destination's square must fit, like the move itself
    charge: landing ? chargeFrom(b, cursor) : null,
    // walking, what that destination draws in counters; on the tile screen, who the strike would leave owed one
    counters:
      spot && hl?.preview
        ? countersOwed(b, spot.ability, hl.preview, spot.from)
        : landing
          ? countersFrom(b, cursor)
          : null,
    note: owed ? `−${owed[0] === owed[1] ? owed[0] : `${owed[0]}–${owed[1]}`}` : null,
    cursor: hl ? corner : null,
    size,
    fits: !hl?.tiles.some((m) => m.kind === 'nogo'),
    ring: ringAt
      ? { from: cellsOf(ringAt, UNIT_DEFS[b.actor.def].size ?? 1), range: farCells(b.grid, longestRange(b)) }
      : null,
    trajectory:
      a && caster && spot && (a.needsSight ? !onSelf : a.magic && a.range[1] > 0)
        ? {
            shot: traceShot(b.grid, b.state, caster, spot.target, !!a.arc),
            cast: a.needsSight ? null : { radius: a.radius, heal: a.heal[1] > 0 },
          }
        : null,
  };
}
