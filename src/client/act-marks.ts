// What the map marks on the Agir primeiro screens (act-flow.ts): on the target list every listed unit, the focused one as
// the target; on the action list the tiles the focused action works from; on the tile choice those tiles, the picked one
// with its walk and its forecast. Pure, like turn-marks.ts, which calls it
import type { Battle } from '../shared/battle/battle.ts';
import { posKey, samePos } from '../shared/battle/grid.ts';
import { cellsOf, footprint, pathTo } from '../shared/battle/pathing.ts';
import type { Pos } from '../shared/battle/types.ts';
import { UNIT_DEFS } from '../shared/battle/units.ts';
import { type ActAction, type ActTarget, actActions, actTargets } from './act-flow.ts';
import type { Screen } from './command.ts';
import type { Highlights, TileKind } from './interaction.ts';

type ActScreen = Extract<Screen, { k: 'targets' | 'actions' | 'spot' }>;
export const actScreen = (s: Screen): s is ActScreen => s.k === 'targets' || s.k === 'actions' || s.k === 'spot';

const cellsOfTarget = (b: Battle, t: ActTarget): Pos[] => {
  const u = t.k === 'unit' && b.state.units.find((x) => x.id === t.unit);
  return u ? footprint(u) : [];
};

// the action the screen is on: the focused row of the action list, or the one picked for the tile choice
export function screenAction(b: Battle, s: ActScreen): ActAction | null {
  if (s.k === 'targets') return null;
  return actActions(b, s.target)[s.k === 'actions' ? s.index : s.action] ?? null;
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
