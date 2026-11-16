// What the scene marks during the hero's turn, from the turn screen, the Ui and the cursor: tiles, charge preview,
// counters, cursor frame, range ring and shot line. Pure; the Game applies it to the scene.
import { ABILITIES } from '../shared/battle/abilities.ts';
import type { Battle } from '../shared/battle/battle.ts';
import { posKey, samePos } from '../shared/battle/grid.ts';
import { cellsOf, farCells, footprint, shotStop, sightEnds } from '../shared/battle/pathing.ts';
import type { Pos } from '../shared/battle/types.ts';
import { UNIT_DEFS } from '../shared/battle/units.ts';
import { chargeFrom, counterDamage, countersFrom, countersOwed } from './charge-lines.ts';
import { longestRange, type Screen } from './command.ts';
import { aimMark, facingHighlights, type Highlights, highlights, type Ui } from './interaction.ts';

// `live`: a hero is choosing (its turn, nothing playing); otherwise nothing is marked
export function turnMarks(b: Battle, s: Screen, ui: Ui, cursor: Pos, live: boolean) {
  // on the menu and submenu only the acting unit's tile is marked; the range shows when choosing (like FFT)
  const hl: Highlights | null = !live
    ? null
    : s.k === 'facing'
      ? facingHighlights(b)
      : s.k === 'map' || s.k === 'confirm'
        ? highlights(b, ui, cursor)
        : {
            tiles: footprint(b.actor).map((pos) => ({ pos, kind: 'actor' as const })),
            path: null,
            preview: null,
          };
  const moving = s.k === 'map' && ui.mode.k === 'move';
  const landing = hl && moving && b.reach().has(posKey(cursor)); // the cursor is on a tile the move can end on
  // counters (Nov 15, Fernando): aiming, who the strike would leave owed a counter; walking, what that destination draws
  const aimed = (s.k === 'map' || s.k === 'confirm') && ui.mode.k === 'ability' && hl?.preview?.ok ? ui.mode.id : null;
  const owed = landing && counterDamage(b, cursor);
  // choosing where to move, or resting on the acting unit (menu, facing), the cursor frames the unit's whole square; aiming,
  // it frames what the target mark covers (one cell, or the body of the unit there)
  const framed =
    (s.k === 'map' || s.k === 'confirm') && ui.mode.k === 'ability'
      ? aimMark(b.grid, b.state, cursor)
      : {
          pos: cursor,
          // only on a hero's turn (hl): a battle that ended on the actor's death leaves no actor to read
          size: hl && (moving || samePos(cursor, b.actor.pos)) ? (UNIT_DEFS[b.actor.def].size ?? 1) : 1,
        };
  // dotted outline of the longest range: on the menu around the acting unit; when aiming the move, around the tile under the cursor (if
  // it can be reached), to see where the strike reaches before moving
  const ringAt =
    !hl || s.k === 'facing' || (s.k !== 'menu' && s.k !== 'abilities' && !moving)
      ? null
      : landing
        ? cursor
        : b.actor.pos;
  // trajectory preview (Nov 13, "like Tactics Ogre"): when aiming a shot or spell that needs line of sight, the line runs from
  // the attacker to the cursor tile and turns red from where it hits
  const aim =
    hl && (s.k === 'map' || s.k === 'confirm') && ui.mode.k === 'ability' && ABILITIES[ui.mode.id].needsSight
      ? cursor
      : null;
  const from = aim && b.actor.pos;
  const magic = ui.mode.k === 'ability' && !!ABILITIES[ui.mode.id].magic;
  return {
    hl,
    // a charging unit picking where to walk sees its shot as it would fire from there (Nov 15, Fernando: "so the player
    // knows where to stand"): the destination's square must fit, like the move itself
    charge: landing ? chargeFrom(b, cursor) : null,
    counters: aimed && hl?.preview ? countersOwed(b, aimed, hl.preview) : landing ? countersFrom(b, cursor) : null,
    note: owed ? `−${owed[0] === owed[1] ? owed[0] : `${owed[0]}–${owed[1]}`}` : null,
    cursor: hl ? framed.pos : null,
    size: framed.size,
    fits: !hl?.tiles.some((m) => m.kind === 'nogo'),
    ring: ringAt
      ? { from: cellsOf(ringAt, UNIT_DEFS[b.actor.def].size ?? 1), range: farCells(b.grid, longestRange(b)) }
      : null,
    trajectory:
      aim && from && (aim.x !== from.x || aim.y !== from.y)
        ? {
            from,
            to: aim,
            block:
              shotStop(b.grid, b.state, ...sightEnds(b.grid, b.state, b.actor, aim), b.actor.id, !magic)?.pos ?? null,
          }
        : null,
  };
}
