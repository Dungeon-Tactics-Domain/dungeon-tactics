import { describe, expect, it } from 'vitest';
import {
  chargeFrom,
  chargeFromText,
  chargeLines,
  counterDamage,
  counterFromText,
  counterNote,
  countersFrom,
  countersOwed,
} from '../src/client/charge-lines.ts';
import { needsLock } from '../src/client/command.ts';
import { confirm, freshUi, highlights } from '../src/client/interaction.ts';
import { Battle } from '../src/shared/battle/battle.ts';
import { samePos } from '../src/shared/battle/grid.ts';
import type { Pos } from '../src/shared/battle/types.ts';
import { flat, gridOf, stateOf } from './battle-helpers.ts';

// Charge lines and the lock step (Nov 15, Fernando): every charge keeps a line on screen, and while the charging unit picks
// where to walk the line from that destination says where the shot would stop and whom it hits
const grid = gridOf(['........', '........', '........', '.....#..', '........']);
const battle = () =>
  new Battle(
    grid,
    stateOf([
      { id: 'a', def: 'archer', team: 'hero', x: 1, y: 1 },
      { id: 'ally', def: 'soldier', team: 'hero', x: 3, y: 2 },
      { id: 'foe', def: 'soldier', team: 'enemy', x: 5, y: 1 },
      { id: 'm', def: 'dark_mage', team: 'enemy', x: 7, y: 4 },
      { id: 'beacon', def: 'beacon', team: 'hero', x: 0, y: 4 },
    ]),
  );

describe('charge lines (Nov 15)', () => {
  it('one line per charge, enemies included, to the followed unit or to the locked tile', () => {
    const b = battle();
    b.act('aimed_shot', { x: 5, y: 1 }, 'unit');
    b.state.charges.push({ unit: 'm', ability: 'blast', target: { x: 3, y: 2 }, follow: null, ticks: 3 });
    const lines = chargeLines(grid, b.state);
    expect(lines.map((l) => [l.team, l.from.pos, l.to.pos])).toEqual([
      ['hero', { x: 1, y: 1 }, { x: 5, y: 1 }],
      ['enemy', { x: 7, y: 4 }, { x: 3, y: 2 }],
    ]);
    b.state.units.find((u) => u.id === 'foe')!.pos = { x: 6, y: 1 };
    expect(chargeLines(grid, b.state)[0].to.pos).toEqual({ x: 6, y: 1 }); // the lock follows it
  });

  it('from a destination: where the shot stops and whom it hits, friendly fire flagged', () => {
    const b = battle();
    b.act('aimed_shot', { x: 5, y: 1 }, 'unit');
    // straight along the row: it reaches the foe
    expect(chargeFrom(b, { x: 1, y: 1 })).toMatchObject({
      ok: true,
      stop: null,
      hits: [{ unit: 'foe', friendly: false }],
    });
    // from below the ally, the arrow stops on it, at half
    expect(chargeFrom(b, { x: 1, y: 3 })).toMatchObject({
      ok: true,
      stop: { pos: { x: 3, y: 2 } },
      hits: [{ unit: 'ally', friendly: true }],
    });
    expect(chargeFromText(b, { x: 1, y: 3 })).toContain('metade do dano');
    // out of reach of the move: no sentence for a tile it cannot stop on
    expect(chargeFromText(b, { x: 7, y: 0 })).toBe('');
  });

  it('a charge aimed at someone asks for the lock; the choice reaches the rule', () => {
    const b = battle();
    expect(needsLock(b, 'aimed_shot', { x: 5, y: 1 })).toBe(true);
    expect(needsLock(b, 'aimed_shot', { x: 5, y: 3 })).toBe(false); // empty ground: only the tile
    expect(needsLock(b, 'shot', { x: 5, y: 1 })).toBe(false); // no charge
    const ui = { ...freshUi(b), mode: { k: 'ability' as const, id: 'aimed_shot' }, pending: { x: 5, y: 1 } };
    confirm(b, ui, 'unit');
    expect(b.state.charges[0].follow).toBe('foe');
  });
});

// Counter indicator (Nov 15, Fernando): aiming shows who would strike back and how; walking, what the destination draws
describe('counter indicator (Nov 15)', () => {
  const g = gridOf(['........', '........', '..#.....', '........']);
  const duel = () =>
    new Battle(
      g,
      stateOf([
        { id: 'a', def: 'archer', team: 'hero', x: 0, y: 1 },
        { id: 'b', def: 'skeleton_archer', team: 'enemy', x: 4, y: 1 },
        { id: 'f', def: 'beacon', team: 'hero', x: 7, y: 0 },
      ]),
    );

  it('aiming: a ranged foe answers with its line, a melee one with its mark', () => {
    const b = duel();
    const owed = countersOwed(b, 'shot', b.preview('shot', { x: 4, y: 1 }));
    expect(owed.lines.map((l) => [l.from.pos, l.to.pos, l.hits.map((h) => h.unit)])).toEqual([
      [{ x: 4, y: 1 }, { x: 0, y: 1 }, ['a']],
    ]);
    const m = new Battle(
      flat(4, 3),
      stateOf([
        { id: 'w', def: 'warrior', team: 'hero', x: 1, y: 1 },
        { id: 's', def: 'soldier', team: 'enemy', x: 2, y: 1 },
      ]),
    );
    expect(countersOwed(m, 'strike', m.preview('strike', { x: 2, y: 1 })).melee).toEqual([
      { from: { pos: { x: 2, y: 1 }, size: 1 }, to: { pos: { x: 1, y: 1 }, size: 1 } },
    ]);
  });

  it('a charged strike promises no counter: the rule owes none for it', () => {
    const b = duel();
    const p = b.preview('aimed_shot', { x: 4, y: 1 });
    expect(countersOwed(b, 'aimed_shot', p)).toEqual({ lines: [], melee: [] });
    expect(counterNote(b, 'aimed_shot', p)).toBe('');
    b.act('aimed_shot', { x: 4, y: 1 });
    expect(b.state.turn.engaged).toBeUndefined();
  });

  it('aiming: a struck unit that cannot reach the actor where it stands owes nothing', () => {
    // the archer shoots a soldier 4 tiles off: walking can never leave a reach it is not in
    const b = new Battle(
      flat(8, 4),
      stateOf([
        { id: 'a', def: 'archer', team: 'hero', x: 0, y: 1 },
        { id: 's', def: 'soldier', team: 'enemy', x: 4, y: 1 },
        { id: 'f', def: 'beacon', team: 'hero', x: 7, y: 3 },
      ]),
    );
    expect(countersOwed(b, 'shot', b.preview('shot', { x: 4, y: 1 }))).toEqual({ lines: [], melee: [] });
  });

  // after the strike, the stops out of the struck unit's reach (Nov 15, Fernando): red frame, sword and the damage
  it('walking: the stops out of reach turn red and carry the counter and its damage', () => {
    const b = new Battle(
      flat(6, 4),
      stateOf([
        { id: 'w', def: 'warrior', team: 'hero', x: 1, y: 1 },
        { id: 's', def: 'soldier', team: 'enemy', x: 2, y: 1 },
        { id: 'f', def: 'beacon', team: 'hero', x: 5, y: 3 },
      ]),
    );
    const kinds = () => {
      const hl = highlights(b, { ...freshUi(b), mode: { k: 'move' } });
      return (p: Pos) => hl.tiles.find((m) => samePos(m.pos, p))?.kind;
    };
    expect(kinds()({ x: 0, y: 1 })).toBe('move'); // nothing struck yet
    b.act('strike', { x: 2, y: 1 });
    const kind = kinds();
    expect([kind({ x: 0, y: 1 }), kind({ x: 2, y: 2 })]).toEqual(['counter', 'move']); // out of its reach, still beside it
    expect(countersFrom(b, { x: 0, y: 1 }).melee).toEqual([
      { from: { pos: { x: 2, y: 1 }, size: 1 }, to: { pos: { x: 1, y: 1 }, size: 1 } },
    ]);
    expect(counterDamage(b, { x: 0, y: 1 })).toEqual([5, 8]); // the Strike's 10 to 16, at half
    expect(counterDamage(b, { x: 2, y: 2 })).toBeNull();
    expect(counterFromText(b, { x: 0, y: 1 })).toContain('contra-ataca');
  });

  // a shooter struck up close fires at the stop once the attacker leaves its contact (Nov 15, Fernando's choice)
  it('a shooter struck up close: owed when aiming, red where it would shoot, its line ending at the stop', () => {
    const b = new Battle(
      gridOf(['......', '......', '......', '...#..', '......', '......']),
      stateOf([
        { id: 'w', def: 'warrior', team: 'hero', x: 3, y: 2 },
        { id: 'r', def: 'archer', team: 'enemy', x: 3, y: 1 },
        { id: 'f', def: 'beacon', team: 'hero', x: 0, y: 5 },
      ]),
    );
    const archer = { pos: { x: 3, y: 1 }, size: 1 };
    expect(countersOwed(b, 'strike', b.preview('strike', archer.pos)).melee).toEqual([
      { from: archer, to: { pos: { x: 3, y: 2 }, size: 1 } },
    ]);
    expect(counterNote(b, 'strike', b.preview('strike', archer.pos))).toContain('contra-ataca');
    b.act('strike', archer.pos);
    const hl = highlights(b, { ...freshUi(b), mode: { k: 'move' } });
    const kind = (p: Pos) => hl.tiles.find((m) => samePos(m.pos, p))?.kind;
    expect([kind({ x: 2, y: 1 }), kind({ x: 5, y: 2 })]).toEqual(['move', 'counter']); // beside it, 3 tiles off
    expect(countersFrom(b, { x: 5, y: 2 }).lines.map((l) => l.to)).toEqual([{ pos: { x: 5, y: 2 }, size: 1 }]);
    expect(counterDamage(b, { x: 5, y: 2 })).not.toBeNull();
    // behind the wall the shot still goes and the wall catches it: red, but nothing for the cursor to show
    expect([kind({ x: 3, y: 4 }), counterDamage(b, { x: 3, y: 4 })]).toEqual(['counter', null]);
  });
});
