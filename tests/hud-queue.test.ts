import { describe, expect, it } from 'vitest';
import { queueRows } from '../src/client/turn-list.ts';
import { Battle } from '../src/shared/battle/battle.ts';
import type { QueueEntry } from '../src/shared/battle/turn-queue.ts';
import type { Pos } from '../src/shared/battle/types.ts';
import { UNIT_DEFS } from '../src/shared/battle/units.ts';
import { flat, stateOf } from './battle-helpers.ts';

// Turn list with the charge in preview on the "Executar?" (Execute?) prompt (Nov 13, Fernando's request, like FFT's CT list)
const archerVsRogue = (rogueCt = 0) => {
  const s = stateOf([
    { id: 'a', def: 'archer', team: 'hero', x: 0, y: 0 },
    { id: 'r', def: 'rogue', team: 'enemy', x: 4, y: 0 },
  ]);
  s.units[1].ct = rogueCt;
  return new Battle(flat(8, 1), s);
};

describe('turn list with the charge in preview', () => {
  it('a slow spell is placed where it will go off and its target is marked', () => {
    // Rogue with CT 80 and speed 12: reaches 100 in 2 ticks, before the Aimed Shot (4 ticks)
    const { rows, targets, at } = queueRows(archerVsRogue(80), { ability: 'aimed_shot', target: { x: 4, y: 0 } });
    expect(at).toBeGreaterThan(0);
    expect(rows[at]).toEqual({ unit: 'a', charge: 'aimed_shot', ticks: 4, round: 1 });
    expect(targets).toEqual(new Set(['r']));
    // the Rogue acts before the shot lands: you can see he can leave the tile
    expect(rows.slice(1, at).some((r) => r.unit === 'r' && !r.charge)).toBe(true);
    // with CT 0 the shot lands before the Rogue acts
    const slow = queueRows(archerVsRogue(0), { ability: 'aimed_shot', target: { x: 4, y: 0 } });
    expect(slow.rows.slice(1, slow.at).some((r) => r.unit === 'r')).toBe(false);
  });

  it('without a charge (or outside "Executar?") it\'s the usual queue', () => {
    const b = archerVsRogue();
    expect(queueRows(b, { ability: 'shot', target: { x: 4, y: 0 } }).at).toBe(-1);
    expect(queueRows(b, null).targets.size).toBe(0);
  });
});

// Every unit of the battle on the list (Nov 15, Fernando's decision: it showed only the next 4), through this round and the next
const crowd = () => {
  const units = [
    ...['warrior', 'archer', 'mage', 'rogue', 'warrior', 'archer'].map((def, i) => ({
      id: `h${i}`,
      def,
      team: 'hero' as const,
      x: i,
      y: 0,
    })),
    ...['brute', 'skeleton_archer', 'minion', 'acolyte', 'soldier', 'dark_mage'].map((def, i) => ({
      id: `e${i}`,
      def,
      team: 'enemy' as const,
      x: i,
      y: 3,
    })),
  ];
  // a test state counts as a map with a Beacon (checkOutcome): without one the first turn ends the battle
  return new Battle(flat(8, 4), stateOf([...units, { id: 'beacon', def: 'beacon', team: 'hero', x: 7, y: 1 }]));
};

// Plays the real queue for `n` rows: the one acting now does `first` (moved, ability), everyone after moves and acts.
// A charge that fires between two turns is its own row, as on the list
function realQueue(b: Battle, n: number, first: { moved: boolean; ability: string | null; target?: Pos }) {
  const rows: QueueEntry[] = [];
  for (let turn = 0; rows.length < n; turn++) {
    rows.push({ unit: b.actor.id });
    if (turn === 0 && first.target) b.act(first.ability!, first.target);
    else b.state.turn.usedAbility = turn === 0 ? first.ability : 'strike';
    b.state.turn.moved = turn === 0 ? first.moved : true;
    const charges = b.state.charges;
    b.endTurn();
    for (const c of charges) if (!b.state.charges.includes(c)) rows.push({ unit: c.unit, charge: c.ability });
  }
  return rows.slice(0, n);
}
const units = (rows: QueueEntry[]) => rows.map((r) => (r.charge ? `${r.unit}/${r.charge}` : r.unit));

describe('turn list with every unit, this round and the next', () => {
  it('round 1 shows each of 12 units once, from the one acting now; round 2 shows each once more', () => {
    const b = crowd();
    const { rows } = queueRows(b, null);
    expect(rows[0].unit).toBe(b.actor.id);
    const ids = new Set(b.state.units.filter((u) => u.id !== 'beacon').map((u) => u.id));
    for (const round of [1, 2]) {
      const these = rows.filter((r) => r.round === round);
      expect(new Set(these.map((r) => r.unit))).toEqual(ids);
      // the round ends on the first turn of its last unit to show
      expect(these.filter((r) => r.unit === these.at(-1)!.unit)).toHaveLength(1);
    }
    expect(rows.findIndex((r) => r.round === 2)).toBe(rows.filter((r) => r.round === 1).length);
  });

  it('the simulated rounds are the real queue when every unit moves and acts', () => {
    const { rows } = queueRows(crowd(), null);
    expect(units(realQueue(crowd(), rows.length, { moved: true, ability: 'strike' }))).toEqual(units(rows));
  });

  it('while aiming, the one acting pays the cost of acting without moving, and the list is the real queue', () => {
    const b = crowd();
    const ability = UNIT_DEFS[b.actor.def].abilities[0];
    const aimed = queueRows(b, { ability, target: { x: 0, y: 3 } }).rows;
    expect(units(realQueue(crowd(), aimed.length, { moved: false, ability }))).toEqual(units(aimed));
    // the usual list assumes the dearer turn (moving and acting): the one acting comes back later or at the same row
    const usual = queueRows(b, null).rows;
    const again = (rows: QueueEntry[]) => rows.findIndex((r, i) => i > 0 && r.unit === b.actor.id);
    expect(again(aimed)).toBeLessThanOrEqual(again(usual));
    expect(again(aimed)).toBeLessThan(again(usual)); // this battle: the 20 CT saved bring the turn sooner
  });

  it('aiming a charged spell puts its row where the real charge fires', () => {
    const duel = () => {
      const s = stateOf([
        { id: 'a', def: 'archer', team: 'hero', x: 0, y: 0 },
        { id: 'w', def: 'warrior', team: 'hero', x: 1, y: 0 },
        { id: 'b', def: 'brute', team: 'enemy', x: 4, y: 0 },
        { id: 'beacon', def: 'beacon', team: 'hero', x: 7, y: 0 },
      ]);
      return new Battle(flat(8, 1), s);
    };
    const aim = { ability: 'aimed_shot', target: { x: 4, y: 0 } };
    const { rows, at } = queueRows(duel(), aim);
    expect(rows[at]).toMatchObject({ unit: 'a', charge: 'aimed_shot' });
    const real = realQueue(duel(), rows.length, { moved: false, ...aim });
    expect(units(real)).toEqual(units(rows));
  });

  it('a queued charge is a row of round 1 with its ticks left, even when it fires after everyone has played', () => {
    const b = crowd();
    b.state.charges = [{ unit: 'e3', ability: 'shadow_wave', target: { x: 0, y: 0 }, follow: null, ticks: 40 }];
    const { rows } = queueRows(b, null);
    expect(rows.filter((r) => r.round === 1).at(-1)).toEqual({
      unit: 'e3',
      charge: 'shadow_wave',
      ticks: 40,
      round: 1,
    });
  });
});
