import { describe, expect, it } from 'vitest';
import { Battle } from '../src/shared/battle/battle.ts';
import { COMBAT } from '../src/shared/battle/combat.ts';
import { type Grid, tileAt } from '../src/shared/battle/grid.ts';
import { UNIT_DEFS } from '../src/shared/battle/units.ts';
import { BASH, BASHER, flat, HIT_SEED, stateOf } from './battle-helpers.ts';

// Spikes (night of Nov 12): being pushed onto the tile or ending the turn on it hurts; walking over does not.
const spiky = (...at: [number, number][]): Grid => {
  const g = flat(8, 8);
  for (const [x, y] of at) tileAt(g, { x, y }).spikes = true;
  return g;
};
const units = (ax = 3, ay = 3) =>
  stateOf(
    [
      { id: 'a', def: BASHER, team: 'hero', x: ax, y: ay },
      { id: 'b', def: 'soldier', team: 'enemy', x: 4, y: 3 },
      { id: 'beacon', def: 'beacon', team: 'hero', x: 0, y: 7 },
    ],
    HIT_SEED,
  );

describe('spikes', () => {
  it('pushed onto spikes takes their damage, added to the hit', () => {
    const b = new Battle(spiky([5, 3]), units());
    const hp = b.state.units[1].hp;
    const events = b.act(BASH, { x: 4, y: 3 });
    const spike = events.find((e) => e.k === 'spike');
    expect(spike).toMatchObject({ unit: 'b', dmg: COMBAT.SPIKE_DAMAGE });
    const hit = events.find((e) => e.k === 'hit');
    expect(b.state.units.find((u) => u.id === 'b')!.hp).toBe(
      hp - (hit && 'dmg' in hit ? hit.dmg : 0) - COMBAT.SPIKE_DAMAGE,
    );
  });

  it('ending the turn on top hurts; without spikes, nothing changes', () => {
    const b = new Battle(spiky([3, 3]), units());
    const out = b.endTurn();
    expect(out[0]).toEqual({ k: 'spike', unit: 'a', dmg: COMBAT.SPIKE_DAMAGE });
    expect(b.state.units.find((u) => u.id === 'a')!.hp).toBe(UNIT_DEFS.warrior.hp - COMBAT.SPIKE_DAMAGE);
    expect(new Battle(spiky(), units()).endTurn().some((e) => e.k === 'spike')).toBe(false);
  });

  it('walking over and stopping outside does not hurt', () => {
    const b = new Battle(spiky([3, 4]), units());
    b.move({ x: 3, y: 5 });
    expect(b.endTurn().some((e) => e.k === 'spike')).toBe(false);
  });
});
