import { describe, expect, it } from 'vitest';
import { SKIRMISH } from '../src/content/maps/skirmish.ts';
import { bagCount, itemOptions } from '../src/shared/battle/bag.ts';
import { Battle, parseBattleState } from '../src/shared/battle/battle.ts';
import { halve } from '../src/shared/battle/half.ts';
import { lastStanding, surviveFor } from '../src/shared/battle/outcome.ts';
import { initialState, SCENARIOS, type Scenario } from '../src/shared/battle/scenarios.ts';
import { flat, stateOf } from './battle-helpers.ts';

// What the battle builder (Nov 25 grill) needs from the engine: a starting CT per spawn, a bag per side, and the
// objectives as rules a scenario can carry
const register = (sc: Scenario) => {
  SCENARIOS[sc.id] = sc;
  return sc;
};

describe('starting CT on a spawn', () => {
  const duel = (heroCt?: number, foeCt?: number) =>
    register({
      ...SKIRMISH,
      id: `probe_ct_${heroCt}_${foeCt}`,
      spawns: [
        { id: 'h', def: 'brute', team: 'hero', x: 0, y: 7, ...(heroCt !== undefined && { ct: heroCt }) }, // speed 7
        { id: 'e', def: 'rogue', team: 'enemy', x: 7, y: 0, ...(foeCt !== undefined && { ct: foeCt }) }, // speed 12
      ],
    });

  it('without one every unit starts at 0 and the faster acts first', () => {
    const st = initialState(duel(), 1);
    expect(st.units.map((u) => u.ct)).toEqual([0, 0]);
    expect(Battle.start(duel(), 1).actor.id).toBe('e');
  });

  it('a slow unit at 100 acts before a fast one at 0', () => {
    expect(initialState(duel(100), 1).units[0].ct).toBe(100);
    expect(Battle.start(duel(100), 1).actor.id).toBe('h');
  });

  it('two units at 100 tie in the list order, enemies first', () => {
    expect(Battle.start(duel(100, 100), 1).actor.id).toBe('e');
  });

  it('carries through the half-tile battle', () => {
    expect(Battle.start(halve(duel(100)), 1).actor.id).toBe('h');
  });
});

describe('a bag per side', () => {
  const g = flat(8, 3);
  const sides = () => {
    const s = stateOf([
      { id: 'e', def: 'soldier', team: 'enemy', x: 0, y: 1 },
      { id: 'h', def: 'warrior', team: 'hero', x: 6, y: 1 },
    ]);
    s.units[0].hp = 10;
    return s;
  };

  it('an enemy spends the enemies bag and leaves the heroes one alone', () => {
    const s = sides();
    s.bag = { life_potion: 3 };
    s.enemyBag = { life_potion: 1 };
    const b = new Battle(g, s);
    expect(b.useItem('life_potion', { x: 0, y: 1 }).map((e) => e.k)).toEqual(['item', 'heal']);
    expect(b.state.enemyBag).toEqual({});
    expect(b.state.bag).toEqual({ life_potion: 3 });
  });

  it('an enemy with an empty bag of its own lists nothing, however full the heroes one', () => {
    const s = sides();
    s.bag = { life_potion: 3 };
    expect(itemOptions(g, s, 'e')).toEqual([]);
    expect(bagCount(s, 'life_potion', 'enemy')).toBe(0);
    expect(bagCount(s, 'life_potion')).toBe(3); // the heroes bag stays the default
  });

  it('a hero still spends only the heroes bag', () => {
    const s = sides();
    s.turn.actor = 'h';
    s.enemyBag = { life_potion: 2 };
    expect(itemOptions(g, s, 'h')).toEqual([]);
  });

  it('starts from the scenario and reads back from a save', () => {
    const sc = register({ ...SKIRMISH, id: 'probe_bags', bags: { hero: { ether: 2 }, enemy: { life_potion: 1 } } });
    const st = initialState(sc, 1);
    expect(st.bag).toEqual({ ether: 2 });
    expect(st.enemyBag).toEqual({ life_potion: 1 });
    st.bag!.ether = 0; // a copy, never the scenario's own record
    expect(sc.bags?.hero).toEqual({ ether: 2 });
    expect(parseBattleState(JSON.parse(JSON.stringify(Battle.start(sc, 1).state)))?.enemyBag).toEqual({
      life_potion: 1,
    });
  });

  it('a save with a broken enemies bag is refused', () => {
    const raw = JSON.parse(JSON.stringify(Battle.start(SKIRMISH, 1).state));
    raw.enemyBag = { dragon_egg: 1 };
    expect(parseBattleState(raw)).toBeNull();
  });
});

describe('objective rules', () => {
  const st = (units: Parameters<typeof stateOf>[0], turns = 0) => ({ ...stateOf(units), turnsPlayed: turns });
  const hero = { id: 'h', def: 'warrior', team: 'hero' as const, x: 0, y: 0 };
  const beacon = { id: 'b', def: 'beacon', team: 'hero' as const, x: 1, y: 0 };
  const foe = { id: 'e', def: 'soldier', team: 'enemy' as const, x: 3, y: 0 };

  it('defeat all: the Beacon neither wins nor loses it', () => {
    expect(lastStanding(st([hero, foe]))).toBe('ongoing');
    expect(lastStanding(st([hero, beacon]))).toBe('victory');
    expect(lastStanding(st([beacon, foe]))).toBe('defeat');
  });

  it('survive: holding the turns wins, every hero down loses first', () => {
    const rule = surviveFor(10);
    expect(rule(st([hero, foe], 9))).toBe('ongoing');
    expect(rule(st([hero, foe], 10))).toBe('victory');
    expect(rule(st([hero], 3))).toBe('victory'); // downing everyone also wins
    expect(rule(st([beacon, foe], 10))).toBe('defeat');
  });
});
