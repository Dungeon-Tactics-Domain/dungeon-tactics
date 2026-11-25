import { describe, expect, it } from 'vitest';
import { attackMarks } from '../src/client/interaction.ts';
import { ABILITIES } from '../src/shared/battle/abilities.ts';
import { Battle } from '../src/shared/battle/battle.ts';
import { previewAbility } from '../src/shared/battle/combat.ts';
import { posKey } from '../src/shared/battle/grid.ts';
import { halfDef, halve } from '../src/shared/battle/half.ts';
import { cellsOf } from '../src/shared/battle/pathing.ts';
import type { Pos } from '../src/shared/battle/types.ts';
import { UNIT_DEFS } from '../src/shared/battle/units.ts';
import { flat, HIT_SEED, stateOf } from './battle-helpers.ts';

// Fernando, Nov 24: an area on half tiles takes the diagonal half tiles too, so radius 1 is no longer a cross ("deve ter
// os halftiles das diagonais pra n ficar em formato de cruz"); he picked "Cantos em meio-tile": the corners are painted as
// half tiles, and a token with any cell in them is hit
UNIT_DEFS['t-corner'] = {
  ...UNIT_DEFS.mage,
  id: 't-corner',
  abilities: ['blast', 'shadow_wave'],
  vars: { mana: 999, stamina: 999 },
};
const grid = halve({
  id: 't-corner',
  name: 't',
  en: 't',
  grid: flat(12, 12),
  spawns: [{ id: 'a', def: 't-corner', team: 'hero', x: 0, y: 0 }],
}).grid;
const HERO = halfDef('t-corner'),
  SOLDIER = halfDef('soldier');
const aimed = { x: 10, y: 10 }; // a whole tile's corner cell: cells 10..11
const shooter = { x: 6, y: 6 };
const split = (foe: Pos) =>
  new Battle(
    grid,
    stateOf(
      [
        { id: 'a', def: HERO, team: 'hero', ...shooter },
        { id: 'e', def: SOLDIER, team: 'enemy', ...foe },
        { id: 'beacon', def: 'beacon', team: 'hero', x: 0, y: 22 },
      ],
      HIT_SEED,
    ),
  );
const hits = (b: Battle, ability: string) =>
  previewAbility(b.grid, b.state, 'a', ability, aimed).targets.map((t) => t.unit);
const keys = (ps: Pos[]) => ps.map(posKey).sort();
// the whole aimed tile, the 4 tiles on its sides, and the one cell of each diagonal tile that touches its corner
const rounded = (t: Pos) => [
  ...[
    [0, 0],
    [2, 0],
    [-2, 0],
    [0, 2],
    [0, -2],
  ].flatMap(([dx, dy]) => cellsOf({ x: t.x + dx, y: t.y + dy }, 2)),
  { x: t.x - 1, y: t.y - 1 },
  { x: t.x + 2, y: t.y - 1 },
  { x: t.x - 1, y: t.y + 2 },
  { x: t.x + 2, y: t.y + 2 },
];

describe('area corners on half tiles (Nov 24)', () => {
  it('radius 1 paints the cross and one half tile at each diagonal corner', () => {
    const marks = attackMarks(split({ x: 20, y: 20 }), ABILITIES.blast, aimed);
    expect(keys(marks.map((m) => m.pos))).toEqual(keys(rounded(aimed)));
  });

  it('a token on the diagonal tile is hit through its corner half tile', () => {
    expect(hits(split({ x: 12, y: 12 }), 'blast')).toEqual(['e']);
    expect(hits(split({ x: 8, y: 12 }), 'blast')).toEqual(['e']);
  });

  it('one tile further out on the diagonal is not hit', () => {
    expect(hits(split({ x: 13, y: 13 }), 'blast')).toEqual([]);
    expect(hits(split({ x: 14, y: 12 }), 'blast')).toEqual([]);
  });

  it('radius 2 rounds too: no cell past 3 on an axis, none past 4 steps', () => {
    const marks = attackMarks(split({ x: 20, y: 20 }), ABILITIES.shadow_wave, aimed);
    const off = (p: Pos) => ({
      dx: Math.max(0, aimed.x - p.x, p.x - (aimed.x + 1)),
      dy: Math.max(0, aimed.y - p.y, p.y - (aimed.y + 1)),
    });
    const cells = marks.map((m) => off(m.pos));
    // straight tiles stay whole, so their far cells reach 4 along an axis
    expect(cells.every(({ dx, dy }) => dx + dy <= 4)).toBe(true);
    expect(cells.some(({ dx, dy }) => dx === 2 && dy === 2)).toBe(true); // the diagonal is filled in
    expect(cells.some(({ dx, dy }) => dx === 3 && dy === 3)).toBe(false); // not a square
  });
});

describe('whole tiles keep their cross', () => {
  it('on a map without half tiles the diagonal is not hit', () => {
    const b = new Battle(
      flat(8, 8),
      stateOf(
        [
          { id: 'a', def: 'mage', team: 'hero', x: 2, y: 2 },
          { id: 'e', def: 'soldier', team: 'enemy', x: 5, y: 5 },
          { id: 'beacon', def: 'beacon', team: 'hero', x: 7, y: 0 },
        ],
        HIT_SEED,
      ),
    );
    expect(previewAbility(b.grid, b.state, 'a', 'blast', { x: 4, y: 4 }).targets.map((t) => t.unit)).toEqual([]);
    expect(previewAbility(b.grid, b.state, 'a', 'blast', { x: 4, y: 5 }).targets.map((t) => t.unit)).toEqual(['e']);
  });
});

// Fernando, Nov 24: "o morcego ai q era pra ser 1x1 tile esta 2x2"; he picked "Mira no rato = célula dele": an area aimed
// at a body smaller than a tile starts from that body, not from a 2x2 snapped around it
describe('an area aimed at a one-cell body', () => {
  const at = { x: 11, y: 11 }; // an odd cell: a 2x2 snapped from it straddled four tiles
  const rat = () =>
    new Battle(
      grid,
      stateOf(
        [
          { id: 'a', def: HERO, team: 'hero', ...shooter },
          { id: 'r', def: halfDef('rat'), team: 'enemy', ...at },
          { id: 'e', def: SOLDIER, team: 'enemy', x: 13, y: 11 },
          { id: 'beacon', def: 'beacon', team: 'hero', x: 0, y: 22 },
        ],
        HIT_SEED,
      ),
    );
  it('the area is the 3x3 cells around the rat (its cross and the diagonal cells)', () => {
    const marks = attackMarks(rat(), ABILITIES.blast, at);
    const want: Pos[] = [];
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) want.push({ x: at.x + dx, y: at.y + dy });
    // whole tiles touched by the cross are painted whole (Nov 19), so check the hit, and that nothing 2 cells off is lit
    expect(keys(marks.map((m) => m.pos))).toEqual(expect.arrayContaining(keys(want)));
    expect(marks.some((m) => m.pos.x === at.x + 3 || m.pos.y === at.y + 3)).toBe(false);
  });
  it('a soldier two cells off the rat is not hit by a blast on it', () => {
    expect(
      previewAbility(rat().grid, rat().state, 'a', 'blast', at)
        .targets.map((t) => t.unit)
        .sort(),
    ).toEqual(['r']);
  });
});

// Fernando, Nov 24: "o giro do guerreiro ... deve pegar apenas os ... blocos ao redor dele num range de 1 haalftile nao 2";
// he picked "Anel de 1 meio-tile, 12": the mark shows the 12 cells around the 2x2 body (the hit was already that ring)
describe("the Spin's ring", () => {
  it('paints the body and the one-cell ring around it, nothing two cells out', () => {
    const b = split({ x: 20, y: 20 });
    const me = b.state.units.find((u) => u.id === 'a')!;
    const cells = attackMarks(b, ABILITIES.spin, me.pos).map((m) => m.pos);
    const want: Pos[] = [];
    for (let dy = -1; dy <= 2; dy++) for (let dx = -1; dx <= 2; dx++) want.push({ x: me.pos.x + dx, y: me.pos.y + dy });
    expect(keys(cells)).toEqual(keys(want)); // 4x4: the 2x2 body and its 12-cell ring
  });
});
