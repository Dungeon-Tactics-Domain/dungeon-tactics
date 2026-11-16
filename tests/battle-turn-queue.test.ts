import { describe, expect, it } from 'vitest';
import { finishTurn, previewOrder, startNextTurn, turnCt } from '../src/shared/battle/turn-queue.ts';
import type { BattleState } from '../src/shared/battle/types.ts';
import { flat, HIT_SEED, stateOf } from './battle-helpers.ts';

const G = flat(8, 8);

// plays `n` turns where each actor uses the given ability (no delay by default) and returns who acted
function play(s: BattleState, n: number, ability: (actor: string) => string | null = () => 'strike'): string[] {
  const order: string[] = [];
  for (let i = 0; i < n; i++) {
    startNextTurn(G, s);
    order.push(s.turn.actor);
    s.turn.usedAbility = ability(s.turn.actor);
    s.turn.moved = s.turn.usedAbility !== null; // moves and acts: the cost the queue preview assumes
    finishTurn(s);
  }
  return order;
}

const mixed = () =>
  stateOf([
    { id: 'rogue', def: 'rogue', team: 'hero', x: 0, y: 0 }, // speed 12
    { id: 'warrior', def: 'warrior', team: 'hero', x: 1, y: 0 }, // 8
    { id: 'brute', def: 'brute', team: 'enemy', x: 2, y: 0 }, // 5
  ]);

describe('turn queue', () => {
  it('whoever has more speed acts first and more often', () => {
    const s = mixed();
    const order = play(s, 25);
    expect(order[0]).toBe('rogue');
    const count = (id: string) => order.filter((x) => x === id).length;
    expect(count('rogue')).toBeGreaterThan(count('warrior'));
    expect(count('warrior')).toBeGreaterThan(count('brute'));
  });

  // Nov 12: FFT rule on all maps (BMG 1.1); before, acting cost 100 plus the ability delay
  it('turn cost by what the unit did: move and act 100, one of the two 80, neither 60; the leftover never exceeds 60', () => {
    const cost = (moved: boolean, acted: boolean) => {
      const s = stateOf([{ id: 'x', def: 'warrior', team: 'hero', x: 0, y: 0 }]);
      s.units[0].ct = 120;
      s.turn = { actor: 'x', moved, usedAbility: acted ? 'strike' : null };
      finishTurn(s);
      return s.units[0].ct;
    };
    expect([cost(true, true), cost(true, false), cost(false, true), cost(false, false)]).toEqual([20, 40, 40, 60]);
    expect(turnCt(200, false, false)).toBe(60);
  });

  it('waiting without acting returns the turn sooner', () => {
    const s = stateOf([
      { id: 'x', def: 'rogue', team: 'hero', x: 0, y: 0 },
      { id: 'y', def: 'brute', team: 'enemy', x: 1, y: 0 },
    ]);
    const order = play(s, 6, () => null);
    expect(order.filter((i) => i === 'x').length).toBeGreaterThanOrEqual(4);
  });

  it('tie at 100 or more: the first in the character list acts, and enemies come first (BMG A.2)', () => {
    const s = stateOf([
      { id: 'h', def: 'warrior', team: 'hero', x: 0, y: 0 },
      { id: 'e', def: 'soldier', team: 'enemy', x: 1, y: 0 },
    ]);
    s.units[0].ct = 130; // more CT does not go first
    s.units[1].ct = 100;
    startNextTurn(G, s);
    expect(s.turn.actor).toBe('e');
  });

  it('a target without speed never gets a turn', () => {
    const s = stateOf([
      { id: 'h', def: 'warrior', team: 'hero', x: 0, y: 0 },
      { id: 'beacon', def: 'beacon', team: 'hero', x: 1, y: 0 },
    ]);
    expect(play(s, 10)).not.toContain('beacon');
    expect(previewOrder(s, 5).map((e) => e.unit)).not.toContain('beacon');
  });

  it('whoever dies leaves the queue', () => {
    const s = mixed();
    s.units = s.units.filter((u) => u.id !== 'rogue');
    expect(play(s, 8)).not.toContain('rogue');
  });

  it('previewOrder does not change the state and matches the real turns', () => {
    const s = mixed();
    startNextTurn(G, s);
    const before = structuredClone(s);
    const preview = previewOrder(s, 12).map((e) => e.unit);
    expect(s).toEqual(before);
    expect(preview[0]).toBe(s.turn.actor); // the first is whoever is playing
    s.turn.usedAbility = 'strike';
    s.turn.moved = true;
    finishTurn(s);
    const real = [preview[0], ...play(s, 11)];
    expect(real).toEqual(preview);
  });

  it('previewOrder of a turn whose actor just died (a counter on the walk) starts with the next unit', () => {
    const s = stateOf([
      { id: 'a', def: 'warrior', team: 'hero', x: 0, y: 0 },
      { id: 'b', def: 'soldier', team: 'enemy', x: 2, y: 0 },
    ]);
    s.turn.actor = 'gone';
    // both at speed 8 from 0: 13 ticks to 104, the enemy first, then the hero still at 104, then the enemy again after 12
    expect(previewOrder(s, 3).map((e) => e.unit)).toEqual(['b', 'a', 'b']);
  });

  it('a charge whose caster died to a charge of the same tick neither fires nor fizzles', () => {
    const s = stateOf(
      [
        { id: 'e', def: 'dark_mage', team: 'enemy', x: 0, y: 0 },
        { id: 'm', def: 'mage', team: 'hero', x: 3, y: 0, hp: 1 },
        { id: 'h', def: 'warrior', team: 'hero', x: 7, y: 7 },
        { id: 'b', def: 'beacon', team: 'hero', x: 7, y: 0 },
      ],
      HIT_SEED,
    );
    // listed hero first: the enemy's blast still fires first (character list order, enemies first) and kills the mage
    s.charges = [
      { unit: 'm', ability: 'gust', target: { x: 0, y: 0 }, follow: null, ticks: 1 },
      { unit: 'e', ability: 'blast', target: { x: 3, y: 0 }, follow: null, ticks: 1 },
    ];
    const ev = startNextTurn(G, s);
    expect(ev.map((e) => [e.k, 'unit' in e ? e.unit : null])).toEqual([
      ['attack', 'e'],
      ['hit', 'm'],
      ['die', 'm'],
    ]);
    expect(s.charges).toEqual([]);
    expect(s.outcome).toBe('ongoing');
  });
});
