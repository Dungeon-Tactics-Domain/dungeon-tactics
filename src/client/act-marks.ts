// What the map marks on the Agir primeiro screens (act-flow.ts): on the target list every listed unit, the focused one as
// the target; on the action list the tiles the focused action works from; on the tile choice those tiles, the picked one
// with its walk and its forecast. Pure, like turn-marks.ts, which calls it
import { ABILITIES } from '../shared/battle/abilities.ts';
import type { Battle } from '../shared/battle/battle.ts';
import { posKey, samePos, subOf } from '../shared/battle/grid.ts';
import { cellsOf, footprint, pathTo, unitAt } from '../shared/battle/pathing.ts';
import type { Pos } from '../shared/battle/types.ts';
import { UNIT_DEFS } from '../shared/battle/units.ts';
import { type ActAction, type ActTarget, actActions, actAims, actTargets, bestSpot, withAim } from './act-flow.ts';
import type { Screen } from './command.ts';
import { attackMarks, type Highlights, type TileKind } from './interaction.ts';

type ActScreen = Extract<Screen, { k: 'targets' | 'actions' | 'aim' | 'spot' }>;
export const actScreen = (s: Screen): s is ActScreen =>
  s.k === 'targets' || s.k === 'actions' || s.k === 'aim' || s.k === 'spot';

const cellsOfTarget = (b: Battle, t: ActTarget): Pos[] => {
  const u = t.k === 'unit' && b.state.units.find((x) => x.id === t.unit);
  return u ? footprint(u) : [];
};
// the cells an aim covers on the map: the unit standing there, else its ground tile (one aim per tile, aimTile)
export const aimCells = (b: Battle, aim: Pos): Pos[] => {
  const u = unitAt(b.state, aim);
  return u ? footprint(u) : cellsOf(aim, subOf(b.grid));
};

// the action the screen is on: the focused row of the action list, or the one picked for the aim and the tile choice (on
// the tile choice after an aim, only the tiles aiming there)
export function screenAction(b: Battle, s: ActScreen): ActAction | null {
  if (s.k === 'targets') return null;
  const a = actActions(b, s.target)[s.k === 'actions' ? s.index : s.action];
  if (!a) return null;
  return s.k === 'spot' && s.aim ? withAim(a, s.aim) : a;
}

export function actMarks(b: Battle, s: ActScreen): Highlights {
  const tiles: { pos: Pos; kind: TileKind }[] = [];
  const mark = (cells: Pos[], kind: TileKind) => {
    for (const pos of cells) tiles.push({ pos, kind });
  };
  const size = UNIT_DEFS[b.actor.def].size ?? 1;
  if (s.k === 'targets') {
    const rows = actTargets(b);
    rows.forEach((r, i) => {
      mark(cellsOfTarget(b, r), i === s.index ? 'target' : 'range');
    });
    mark(footprint(b.actor), 'actor');
    return { tiles, path: null, preview: null };
  }
  const a = screenAction(b, s);
  if (s.k === 'aim' && a) {
    // the aims, the focused one with the area it would cover (its best tile's preview)
    const aims = actAims(a);
    aims.forEach((p, i) => {
      if (i !== s.index) mark(aimCells(b, p), 'range');
    });
    const here = aims[s.index] ? withAim(a, aims[s.index]) : null;
    mark(cellsOfTarget(b, s.target), 'target');
    mark(footprint(b.actor), 'actor');
    if (aims[s.index]) tiles.push(...attackMarks(b, ABILITIES[a.id], aims[s.index]));
    return { tiles, path: null, preview: here?.spots[bestSpot(here)]?.preview ?? null };
  }
  const spots = a?.spots ?? [];
  const seen = new Set<string>();
  for (const sp of spots)
    for (const c of cellsOf(sp.pos, size))
      if (!seen.has(posKey(c))) {
        seen.add(posKey(c));
        tiles.push({ pos: c, kind: 'move' });
      }
  mark(cellsOfTarget(b, s.target), 'target');
  const picked = s.k === 'spot' ? spots[s.index] : undefined;
  if (!picked) {
    mark(footprint(b.actor), 'actor');
    return { tiles, path: null, preview: null };
  }
  // the picked tile: the unit's square there, its walk, and what the action would do from there
  mark(cellsOf(picked.pos, size), 'actor');
  // an area also lights the whole tiles it covers at its aim, as before a strike
  if (a?.k === 'ability' && ABILITIES[a.id].radius > 0) tiles.push(...attackMarks(b, ABILITIES[a.id], picked.aim));
  const walk = samePos(picked.pos, b.actor.pos) ? null : pathTo(b.reach(), picked.pos);
  return { tiles, path: walk, preview: picked.preview ?? null, size };
}

// On the tile choice, the ability and where it is aimed from the picked tile, for the HUD's forecast strips and turn list
// (an item has no strike to forecast). `from`: the picked tile, where the unit will stand to strike
export function spotAim(b: Battle, s: Screen): { ability: string; target: Pos; from: Pos } | null {
  if (s.k !== 'spot') return null;
  const a = screenAction(b, s);
  const spot = a?.spots[s.index];
  return a?.k === 'ability' && spot ? { ability: a.id, target: spot.aim, from: spot.pos } : null;
}
