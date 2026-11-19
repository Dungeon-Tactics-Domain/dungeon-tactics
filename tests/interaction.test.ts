import { describe, expect, it } from 'vitest';
import {
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
import { halve } from '../src/shared/battle/half.ts';
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

  it('after moving, nothing is aimed on the map: acting has its own screens', () => {
    const b = scene();
    confirm(b, tapTile(b, freshUi(b), at(1, 2)));
    expect(defaultMode(b)).toEqual({ k: 'idle' });
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
    expect(ui.mode).toEqual({ k: 'idle' });
  });

  it('with everything done in the turn, there is no mode or marked tile', () => {
    const b = scene();
    confirm(b, tapTile(b, freshUi(b), at(1, 1)));
    b.act('shot', at(4, 1));
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
