import { describe, expect, it } from 'vitest';
import {
  aimStep,
  confirm,
  defaultMode,
  facingHighlights,
  freshUi,
  highlights,
  hoverTile,
  selectMode,
  tapTile,
} from '../src/client/interaction.ts';
import { squareUnder } from '../src/client/scene/space.ts';
import { playAiTurn } from '../src/shared/battle/ai.ts';
import { Battle } from '../src/shared/battle/battle.ts';
import { posKey } from '../src/shared/battle/grid.ts';
import { halfDef, halve } from '../src/shared/battle/half.ts';
import { cellsOf, footprint } from '../src/shared/battle/pathing.ts';
import type { Pos } from '../src/shared/battle/types.ts';
import { flat, gridOf, HIT_SEED, stateOf } from './battle-helpers.ts';

const at = (x: number, y = 0) => ({ x, y });
// current archer with a soldier at shooting range and an ally beside
const scene = () =>
  new Battle(
    flat(8, 3),
    stateOf(
      [
        { id: 'a', def: 'archer', team: 'hero', x: 0, y: 1 },
        { id: 'b', def: 'beacon', team: 'hero', x: 0, y: 0 },
        { id: 'f', def: 'soldier', team: 'enemy', x: 4, y: 1 },
      ],
      HIT_SEED,
    ),
  );
const kinds = (b: Battle, ui: ReturnType<typeof freshUi>, kind: string) =>
  highlights(b, ui)
    .tiles.filter((t) => t.kind === kind)
    .map((t) => t.pos);

describe('two-step touch', () => {
  it('starts in Move and shows the reachable tiles', () => {
    const b = scene();
    const ui = freshUi(b);
    expect(ui.mode).toEqual({ k: 'move' });
    expect(kinds(b, ui, 'move').length).toBe(b.reach().size);
  });

  it('1st tap on a tile marks the destination and path; nothing moves before Confirm', () => {
    const b = scene();
    const ui = tapTile(b, freshUi(b), at(2, 1));
    expect(ui.pending).toEqual(at(2, 1));
    expect(highlights(b, ui).path?.at(-1)).toEqual(at(2, 1));
    expect(b.actor.pos).toEqual(at(0, 1));
    const done = confirm(b, ui);
    expect(b.actor.pos).toEqual(at(2, 1));
    expect(done.events[0].k).toBe('move');
    expect(done.ui.pending).toBeNull();
  });

  it('tile out of reach does not become a destination', () => {
    const b = scene();
    const ui = tapTile(b, freshUi(b), at(7, 2));
    expect(ui.pending).toBeNull();
    expect(confirm(b, ui).events).toEqual([]);
  });

  it('after moving, the default mode is the first ability that has a target', () => {
    const b = scene();
    confirm(b, tapTile(b, freshUi(b), at(1, 2)));
    expect(defaultMode(b)).toEqual({ k: 'ability', id: 'shot' });
  });

  it('after moving with no target in reach, no ability is selected', () => {
    const b = new Battle(
      flat(12, 1),
      stateOf(
        [
          { id: 'a', def: 'warrior', team: 'hero', x: 0, y: 0 },
          { id: 'b', def: 'beacon', team: 'hero', x: 1, y: 0 },
          { id: 'f', def: 'soldier', team: 'enemy', x: 11, y: 0 },
        ],
        HIT_SEED,
      ),
    );
    confirm(b, tapTile(b, freshUi(b), at(2)));
    expect(defaultMode(b)).toEqual({ k: 'idle' });
  });

  // the red cross, red cursor and "cannot stop here" line are for units bigger than one cell (Nov 14 review): a 1-cell unit
  // keeps the plain cursor over an enemy or a far tile
  it('a 1-cell unit shows no red square on a tile or enemy out of reach', () => {
    const b = scene();
    for (const p of [at(7, 2), at(4, 1)]) {
      const ui = hoverTile(b, freshUi(b), p);
      expect(b.reach().has(posKey(p))).toBe(false);
      expect(highlights(b, ui, p)).toEqual(highlights(b, ui));
      expect(kinds(b, ui, 'nogo')).toEqual([]);
    }
  });

  it('tapping a tile out of reach warns instead of doing nothing', () => {
    const b = scene();
    expect(tapTile(b, freshUi(b), at(7, 2)).invalid).toBe(true);
    expect(tapTile(b, freshUi(b), at(2, 1)).invalid).toBe(false);
  });

  it('ability: valid target shows the hit % before confirming', () => {
    const b = scene();
    const ui = tapTile(b, selectMode(b, freshUi(b), { k: 'ability', id: 'shot' }), at(4, 1));
    const h = highlights(b, ui);
    expect(ui.pending).toEqual(at(4, 1));
    expect(h.preview?.ok).toBe(true);
    expect(h.preview?.targets[0]).toMatchObject({ unit: 'f', chance: b.preview('shot', at(4, 1)).targets[0].chance });
    const hp = b.state.units[2].hp;
    const { events } = confirm(b, ui);
    expect(b.state.turn.usedAbility).toBe('shot');
    expect(events).toContainEqual(expect.objectContaining({ k: 'hit', unit: 'f' })); // the scene's seed hits
    expect(b.state.units[2].hp).toBeLessThan(hp);
  });

  it('tapping an enemy out of ability range shows what it threatens', () => {
    const b = scene();
    const ui = tapTile(b, freshUi(b), at(4, 1));
    expect(ui.inspect).toBe('f');
    expect(ui.pending).toBeNull();
    expect(kinds(b, ui, 'threat').length).toBeGreaterThan(0);
  });

  it('spent mode cannot be chosen', () => {
    const b = scene();
    confirm(b, tapTile(b, freshUi(b), at(2, 1)));
    // spends the rest of the movement (Nov 13: moves in parts until movement runs out)
    while (b.reach().size) b.move([...b.reach().values()][0].pos);
    const ui = selectMode(b, freshUi(b), { k: 'move' });
    expect(ui.mode).toEqual({ k: 'ability', id: 'shot' });
  });

  it('with everything done in the turn, there is no mode or marked tile', () => {
    const b = scene();
    confirm(b, tapTile(b, freshUi(b), at(1, 1)));
    confirm(b, tapTile(b, freshUi(b), at(4, 1)));
    expect(defaultMode(b)).toEqual({ k: 'idle' });
    expect(highlights(b, freshUi(b)).tiles.filter((t) => t.kind !== 'actor')).toEqual([]);
  });
});

// Half tiles (Nov 14, Fernando on stage 0: "it needs a preview of the tiles the units will occupy in 2x2"): a 2x2 token is
// marked by its whole square, never by its corner cell alone
describe('the square of a 2x2 token', () => {
  // heights: a step of 2 between whole tiles (1,1) and (2,1), both reachable around the top through (1,0)
  const token = () => {
    const sc = halve({
      id: 't-square',
      name: 't',
      en: 't',
      grid: gridOf(['....', '....', '....'], ['0122', '0022', '0000']),
      spawns: [
        { id: 'w', def: 'warrior', team: 'hero', x: 0, y: 1 },
        { id: 'f', def: 'soldier', team: 'enemy', x: 3, y: 2 },
      ],
    });
    const b = Battle.start(sc, HIT_SEED);
    while (b.actor.id !== 'w') playAiTurn(b);
    return b;
  };
  const keys = (ps: Pos[]) => new Set(ps.map(posKey));
  const of = (b: Battle, ui: ReturnType<typeof freshUi>, kind: string, cursor?: Pos) =>
    keys(
      highlights(b, ui, cursor)
        .tiles.filter((t) => t.kind === kind)
        .map((t) => t.pos),
    );

  it('marks every cell its reachable squares cover, and its own 4 cells as the actor', () => {
    const b = token();
    const ui = selectMode(b, freshUi(b), { k: 'move' });
    const h = highlights(b, ui);
    const covered = keys([...b.reach().values()].flatMap((s) => cellsOf(s.pos, 2)));
    const own = keys(footprint(b.actor));
    for (const t of h.tiles) {
      if (t.kind === 'move') expect(covered.has(posKey(t.pos))).toBe(true);
      if (t.kind === 'actor') expect(own.has(posKey(t.pos))).toBe(true);
    }
    for (const k of covered) if (!own.has(k)) expect(of(b, ui, 'move').has(k)).toBe(true);
    expect(of(b, ui, 'actor').size).toBe(4);
  });

  it('shows the destination as its whole square, over its own cells too, with the path and its size', () => {
    const b = token();
    const to = { x: b.actor.pos.x + 1, y: b.actor.pos.y };
    const ui = hoverTile(b, selectMode(b, freshUi(b), { k: 'move' }), to);
    expect(ui.pending).toEqual(to);
    expect(of(b, ui, 'target', to)).toEqual(keys(cellsOf(to, 2)));
    const h = highlights(b, ui, to);
    expect(h.path?.at(-1)).toEqual(to);
    expect(h.size).toBe(2);
  });

  it('a square that straddles a step too high is not a destination, even with all 4 cells marked', () => {
    const b = token();
    const at = { x: 3, y: 2 }; // cells 3 (height 0) and 4 (height 2) of the row: a step of 2 inside the square
    expect(b.reach().has(posKey(at))).toBe(false);
    const ui = hoverTile(b, selectMode(b, freshUi(b), { k: 'move' }), at);
    const covered = keys([...b.reach().values()].flatMap((s) => cellsOf(s.pos, 2)));
    for (const c of cellsOf(at, 2)) expect(covered.has(posKey(c))).toBe(true);
    expect(ui.pending).toBeNull();
    expect(of(b, ui, 'nogo', at)).toEqual(keys(cellsOf(at, 2)));
    expect(of(b, ui, 'target', at).size).toBe(0);
  });

  it('shows no square on the unit itself, and only the part of one inside the map', () => {
    const b = token();
    const ui = selectMode(b, freshUi(b), { k: 'move' });
    expect(of(b, ui, 'nogo', b.actor.pos).size).toBe(0);
    expect(of(b, ui, 'nogo', { x: 7, y: 5 })).toEqual(keys([{ x: 7, y: 5 }]));
  });

  it('aiming at any cell of a token marks all 4 of its cells', () => {
    const b = new Battle(
      halve({ id: 't-aim', name: 't', en: 't', grid: gridOf(['....']), spawns: [] }).grid,
      stateOf(
        [
          { id: 'w', def: 'warrior½', team: 'hero', x: 2, y: 0 },
          { id: 'f', def: 'soldier½', team: 'enemy', x: 4, y: 0 },
        ],
        HIT_SEED,
      ),
    );
    const far = { x: 5, y: 1 };
    const ui = tapTile(b, selectMode(b, freshUi(b), { k: 'ability', id: 'strike' }), far);
    expect(ui.pending).toEqual(far);
    expect(of(b, ui, 'target')).toEqual(keys(cellsOf({ x: 4, y: 0 }, 2)));
  });

  // a split map 12 whole tiles wide and `rows` deep
  const aimAt = (units: { id: string; def: string; team: 'hero' | 'enemy'; x: number; y: number }[], rows = 1) =>
    new Battle(
      halve({ id: 't-aim1', name: 't', en: 't', grid: gridOf(Array(rows).fill('............')), spawns: [] }).grid,
      stateOf(units, HIT_SEED),
    );

  it('aiming at empty ground marks only the aimed half-tile cell', () => {
    const b = aimAt([{ id: 'a', def: halfDef('archer'), team: 'hero', x: 0, y: 0 }]);
    const cell = { x: 7, y: 1 };
    const ui = tapTile(b, selectMode(b, freshUi(b), { k: 'ability', id: 'shot' }), cell);
    expect(ui.pending).toEqual(cell);
    expect(of(b, ui, 'target')).toEqual(keys([cell]));
  });

  it('an empty cell whose whole tile the rule lands on a token marks that token, the one the forecast hits', () => {
    // the soldier straddles two map tiles (cells 5 and 6); cell 7 is empty, but its tile's corner (6) is the soldier's
    const b = aimAt([
      { id: 'a', def: halfDef('archer'), team: 'hero', x: 0, y: 0 },
      { id: 'f', def: halfDef('soldier'), team: 'enemy', x: 5, y: 0 },
    ]);
    const cell = { x: 7, y: 1 };
    const ui = tapTile(b, selectMode(b, freshUi(b), { k: 'ability', id: 'shot' }), cell);
    expect(b.preview('shot', cell).targets.map((t) => t.unit)).toEqual(['f']);
    expect(of(b, ui, 'target')).toEqual(keys(cellsOf({ x: 5, y: 0 }, 2)));
  });

  it('an area aimed at empty ground keeps one target cell and marks the rest of its area', () => {
    const b = aimAt([{ id: 'm', def: halfDef('mage'), team: 'hero', x: 0, y: 0 }], 3);
    const cell = { x: 9, y: 3 };
    const ui = tapTile(b, selectMode(b, freshUi(b), { k: 'ability', id: 'blast' }), cell);
    expect(of(b, ui, 'target')).toEqual(keys([cell]));
    // the rest of the aimed whole tile is area, and so is the ring of radius 1 around it
    for (const c of [
      { x: 8, y: 2 },
      { x: 9, y: 2 },
      { x: 8, y: 3 },
      { x: 10, y: 3 },
      { x: 7, y: 2 },
    ])
      expect(of(b, ui, 'area').has(posKey(c))).toBe(true);
  });

  it('aiming at any cell of the Colossus marks its whole body', () => {
    const b = aimAt(
      [
        { id: 'a', def: halfDef('archer'), team: 'hero', x: 0, y: 0 },
        { id: 'c', def: halfDef('colossus'), team: 'enemy', x: 6, y: 0 },
      ],
      2,
    );
    const ui = tapTile(b, selectMode(b, freshUi(b), { k: 'ability', id: 'shot' }), { x: 9, y: 3 });
    expect(of(b, ui, 'target')).toEqual(keys(cellsOf({ x: 6, y: 0 }, 4)));
  });

  describe('the aiming cursor steps until the mark moves', () => {
    // soldier on cells 4-5, Colossus on cells 18-21 against the right edge (map 24 cells wide, 4 deep)
    const b = aimAt(
      [
        { id: 'a', def: halfDef('archer'), team: 'hero', x: 0, y: 0 },
        { id: 'f', def: halfDef('soldier'), team: 'enemy', x: 4, y: 0 },
        { id: 'c', def: halfDef('colossus'), team: 'enemy', x: 20, y: 0 },
      ],
      2,
    );
    const step = (from: Pos, x: number, y = 0) => aimStep(b.grid, b.state, from, { x, y });

    it('enters a body from outside on its near cell', () => expect(step({ x: 3, y: 0 }, 1)).toEqual({ x: 4, y: 0 }));
    it('crosses a token in one press', () => expect(step({ x: 4, y: 0 }, 1)).toEqual({ x: 6, y: 0 }));
    it('steps one cell on empty ground', () => expect(step({ x: 8, y: 1 }, 1)).toEqual({ x: 9, y: 1 }));
    it('crosses the Colossus in one press', () => expect(step({ x: 23, y: 2 }, -1)).toEqual({ x: 19, y: 2 }));
    it('does not move off the map through a body at its edge', () => expect(step({ x: 21, y: 1 }, 1)).toBeNull());
  });

  it('the facing marks sit beside each side of the square, none under it', () => {
    const b = token();
    const h = facingHighlights(b);
    const own = keys(footprint(b.actor));
    const sides = h.tiles.filter((t) => t.kind !== 'actor');
    for (const t of sides) expect(own.has(posKey(t.pos))).toBe(false);
    expect(sides.filter((t) => t.kind === 'target')).toHaveLength(2);
  });

  it('the mouse picks the square centred on the cell corner nearest to it', () => {
    const g = flat(10, 8),
      c = { x: 5, y: 5 };
    expect(squareUnder(g, c, -0.3, -0.3, 2)).toEqual({ x: 4, y: 4 });
    expect(squareUnder(g, c, 0.3, -0.3, 2)).toEqual({ x: 5, y: 4 });
    expect(squareUnder(g, c, 0.3, 0.3, 2)).toEqual({ x: 5, y: 5 });
    expect(squareUnder(g, c, 0.6, -0.6, 2)).toEqual({ x: 5, y: 4 }); // a point past the cell's edge stays on its cell
    expect(squareUnder(g, c, 0.4, -0.4, 1)).toEqual(c);
    expect(squareUnder(g, c, -0.2, 0.2, 4)).toEqual({ x: 3, y: 4 });
    // at the map's edge the square stays inside: the outer half of the first and last cells picks the edge square
    expect(squareUnder(g, { x: 0, y: 0 }, -0.3, -0.3, 2)).toEqual({ x: 0, y: 0 });
    expect(squareUnder(g, { x: 9, y: 7 }, 0.3, 0.3, 2)).toEqual({ x: 8, y: 6 });
  });
});
