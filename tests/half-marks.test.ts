import { describe, expect, it } from 'vitest';
import { attackMarks, chargeDanger, threat } from '../src/client/interaction.ts';
import { inRing } from '../src/client/scene/range-ring.ts';
import { ABILITIES } from '../src/shared/battle/abilities.ts';
import { Battle } from '../src/shared/battle/battle.ts';
import { dist, posKey } from '../src/shared/battle/grid.ts';
import { halfDef, halve } from '../src/shared/battle/half.ts';
import { aimEnds, cellsOf, farCells, footprint, inAbilityRange, reachable } from '../src/shared/battle/pathing.ts';
import type { Pos } from '../src/shared/battle/types.ts';
import { HALF, UNIT_DEFS } from '../src/shared/battle/units.ts';
import { flat, HIT_SEED, stateOf } from './battle-helpers.ts';

// The client drawings of ranges and areas on half tiles (Nov 19): each must show what the rule does, which measures to the
// aimed whole tile's 2x2 square and hits any token whose square touches the area
UNIT_DEFS['t-marks'] = {
  ...UNIT_DEFS.warrior,
  id: 't-marks',
  abilities: ['strike', 'shot', 'blast', 'shadow_wave'],
  vars: { mana: 999, stamina: 999 },
};
const sc = halve({
  id: 't-marks',
  name: 't',
  en: 't',
  grid: flat(12, 12),
  spawns: [{ id: 'a', def: 't-marks', team: 'hero', x: 0, y: 0 }],
});
const grid = sc.grid;
const HERO = `t-marks${HALF}`;
const SOLDIER = halfDef('soldier');
const battle = (a: Pos, e: Pos = { x: 20, y: 20 }) =>
  new Battle(
    grid,
    stateOf(
      [
        { id: 'a', def: HERO, team: 'hero', ...a },
        { id: 'e', def: SOLDIER, team: 'enemy', ...e },
        { id: 'beacon', def: 'beacon', team: 'hero', x: 0, y: 22 },
      ],
      HIT_SEED,
    ),
  );
const everyCell = (): Pos[] =>
  Array.from({ length: grid.width * grid.height }, (_, i) => ({ x: i % grid.width, y: Math.floor(i / grid.width) }));
const keys = (ps: Pos[]) => ps.map(posKey).sort();
// the cells of the whole tile at `t` and of the 4 tiles that touch its sides (radius 1 in whole tiles)
const cross = (t: Pos) =>
  [
    [0, 0],
    [2, 0],
    [-2, 0],
    [0, 2],
    [0, -2],
  ].flatMap(([dx, dy]) => cellsOf({ x: t.x + dx, y: t.y + dy }, 2));

describe('range ring on half tiles', () => {
  for (const id of ['strike', 'shot'])
    for (const at of [
      { x: 12, y: 12 },
      { x: 13, y: 12 },
    ])
      it(`${id} from ${posKey(at)}: the ring holds every cell whose tile the rule reaches`, () => {
        const b = battle(at);
        const range = farCells(grid, ABILITIES[id].range[1]);
        const wrong = everyCell().filter(
          (p) =>
            inRing(grid, { from: footprint(b.actor), range }, p) !==
            dist(...aimEnds(grid, b.state, b.actor, p)) <= range,
        );
        expect(keys(wrong)).toEqual([]);
      });
});

describe('other-unit threat on half tiles', () => {
  it('threat holds every cell whose tile an ability reaches after walking', () => {
    const b = battle({ x: 2, y: 2 }, { x: 12, y: 12 });
    const u = b.state.units.find((x) => x.id === 'e')!;
    const spots = [u.pos, ...[...reachable(grid, b.state, 'e').values()].map((s) => s.pos)];
    const size = UNIT_DEFS[u.def].size ?? 1;
    const want = everyCell().filter((t) =>
      UNIT_DEFS[u.def].abilities.some((id) =>
        spots.some((s) => inAbilityRange(grid, ABILITIES[id], ...aimEnds(grid, b.state, { ...u, pos: s }, t))),
      ),
    );
    expect(size).toBe(2);
    expect(keys(threat(b, 'e'))).toEqual(keys(want));
  });
});

describe('area marks on half tiles', () => {
  const aimed = { x: 10, y: 10 };
  const shooter = { x: 6, y: 6 }; // within blast's range of the aimed tile
  it('chargeDanger paints whole tiles too, and the half tile at each diagonal corner (Nov 24)', () => {
    const b = battle(shooter);
    b.act('blast', aimed);
    const corners = [
      [-1, -1],
      [2, -1],
      [-1, 2],
      [2, 2],
    ].map(([dx, dy]) => ({ x: aimed.x + dx, y: aimed.y + dy }));
    expect([...chargeDanger(grid, b.state).keys()].sort()).toEqual(keys([...cross(aimed), ...corners]));
  });

  it('the enemy attack strip paints whole tiles (shadow wave: 13 tiles and 8 diagonal half tiles, Nov 24)', () => {
    const b = battle(shooter);
    const marks = attackMarks(b, ABILITIES.shadow_wave, aimed);
    expect(marks.length).toBe(13 * 4 + 8);
    expect(marks.filter((m) => m.kind === 'target').map((m) => posKey(m.pos))).toEqual([posKey(aimed)]);
  });
});
