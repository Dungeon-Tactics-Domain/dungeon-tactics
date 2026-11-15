import { describe, expect, it } from 'vitest';
import { queueRows } from '../src/client/hud.ts';
import { Battle } from '../src/shared/battle/battle.ts';
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
    expect(rows[at]).toEqual({ unit: 'a', charge: 'aimed_shot', ticks: 4 });
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

// Every unit of the battle on the list (Nov 15, Fernando's decision: it showed only the next 4)
describe('turn list with every unit', () => {
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
    return new Battle(flat(8, 4), stateOf(units));
  };

  it('shows each of 12 units, the one acting now on top, and stops once the round is complete', () => {
    const b = crowd();
    const { rows } = queueRows(b, null);
    expect(rows[0].unit).toBe(b.actor.id);
    expect(new Set(rows.map((r) => r.unit))).toEqual(new Set(b.state.units.map((u) => u.id)));
    // the last row is the first turn of the last unit to show
    const last = rows.at(-1)!.unit;
    expect(rows.filter((r) => r.unit === last)).toHaveLength(1);
  });

  it('a queued charge is a row with its ticks left, even when it fires after everyone has played', () => {
    const b = crowd();
    b.state.charges = [{ unit: 'e3', ability: 'shadow_wave', target: { x: 0, y: 0 }, follow: null, ticks: 40 }];
    const { rows } = queueRows(b, null);
    expect(rows.at(-1)).toEqual({ unit: 'e3', charge: 'shadow_wave', ticks: 40 });
  });
});
