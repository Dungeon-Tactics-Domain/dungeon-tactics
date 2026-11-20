import { describe, expect, it } from 'vitest';
import { ABILITIES } from '../src/shared/battle/abilities.ts';
import { abilityKind } from '../src/shared/battle/action-slots.ts';
import { playAiTurn } from '../src/shared/battle/ai.ts';
import { Battle, parseBattleState } from '../src/shared/battle/battle.ts';
import { SCENARIOS } from '../src/shared/battle/scenarios.ts';
import { UNIT_DEFS } from '../src/shared/battle/units.ts';
import { flat, stateOf } from './battle-helpers.ts';

// Main and bonus action (Fernando, Nov 19): a turn has a main action and a secondary one; points come later
UNIT_DEFS.test_slots = { ...UNIT_DEFS.acolyte, id: 'test_slots', abilities: ['strike', 'heal', 'firebolt'] };
const g = flat(8, 5);
const at = { foe: { x: 1, y: 2 }, ally: { x: 3, y: 2 } };
const duel = (team: 'hero' | 'enemy' = 'hero') => {
  const other = team === 'hero' ? 'enemy' : 'hero';
  const s = stateOf([
    { id: 'a', def: 'test_slots', team, x: 2, y: 2 },
    { id: 'e', def: 'soldier', team: other, x: 1, y: 2 },
    { id: 'w', def: 'warrior', team, x: 3, y: 2, hp: 10 },
    { id: 'far', def: 'soldier', team: other, x: 7, y: 4 }, // keeps the battle going when the strike kills
    { id: 'f', def: 'beacon', team: 'hero', x: 0, y: 0 }, // a test state counts as a map with a Beacon
  ]);
  s.bag = { life_potion: 2 };
  return new Battle(g, s);
};
const used = (b: Battle) => [b.state.turn.main, b.state.turn.bonus];

describe('what kind an action is', () => {
  it('data field first; else no damage means bonus, else main; the heal is bonus, the strike main', () => {
    expect(abilityKind(ABILITIES.heal)).toBe('bonus');
    expect(abilityKind(ABILITIES.strike)).toBe('main');
    expect(abilityKind({ ...ABILITIES.strike, action: 'bonus' })).toBe('bonus');
    expect(abilityKind({ ...ABILITIES.heal, action: 'main' })).toBe('main');
  });
});

describe('main and bonus slots in a turn', () => {
  it('main then bonus', () => {
    const b = duel();
    expect(b.act('strike', at.foe).length).toBeGreaterThan(0);
    expect(b.act('heal', at.ally).length).toBeGreaterThan(0);
    expect(used(b)).toEqual(['strike', 'heal']);
  });

  it('bonus then main', () => {
    const b = duel();
    expect(b.act('heal', at.ally).length).toBeGreaterThan(0);
    expect(used(b)).toEqual([null, 'heal']);
    expect(b.act('strike', at.foe).length).toBeGreaterThan(0);
    expect(used(b)).toEqual(['strike', 'heal']);
  });

  it('two bonus: the second spends the main action, and then no main is left', () => {
    const b = duel();
    expect(b.useItem('life_potion', at.ally).length).toBeGreaterThan(0);
    expect(b.act('heal', at.ally).length).toBeGreaterThan(0);
    expect(used(b)).toEqual(['heal', 'life_potion']);
    expect(b.act('strike', at.foe)).toEqual([]);
  });

  it('two items in one turn; a third is refused', () => {
    const b = duel();
    b.state.bag = { life_potion: 3 };
    expect(b.useItem('life_potion', at.ally).length).toBeGreaterThan(0);
    expect(b.useItem('life_potion', at.ally).length).toBeGreaterThan(0);
    expect(used(b)).toEqual(['life_potion', 'life_potion']);
    expect(b.useItem('life_potion', at.ally)).toEqual([]);
  });

  it('two mains are refused', () => {
    const b = duel();
    b.act('strike', at.foe);
    expect(b.act('strike', at.foe)).toEqual([]);
    expect(b.act('firebolt', at.foe)).toEqual([]);
    expect(used(b)).toEqual(['strike', null]);
  });

  it('a bonus is refused when both slots are spent', () => {
    const b = duel();
    b.act('strike', at.foe);
    b.useItem('life_potion', at.ally);
    expect(b.act('heal', at.ally)).toEqual([]);
    expect(b.useItem('life_potion', at.ally)).toEqual([]);
  });

  it('undo after a bonus gives it back, the item too, and costs no undo', () => {
    const b = duel();
    b.useItem('life_potion', at.ally);
    expect(b.undo()).toBe(true);
    expect(used(b)).toEqual([null, null]);
    expect(b.state.bag).toEqual({ life_potion: 2 });
    expect(b.undosLeft).toBe(3);
  });

  it('lastFree is false once a slot changed after the walk', () => {
    const b = duel();
    b.move({ x: 2, y: 1 });
    expect(b.lastFree).toBe(true);
    b.useItem('life_potion', at.ally);
    expect(b.lastFree).toBe(false);
  });
});

describe('saves with the two slots', () => {
  const raw = () => JSON.parse(JSON.stringify(Battle.start(SCENARIOS.skirmish, 1).state));
  const turnOf = (patch: Record<string, unknown>, drop: string[] = []) => {
    const s = raw();
    for (const k of drop) delete s.turn[k];
    return parseBattleState({ ...s, turn: { ...s.turn, ...patch } })?.turn;
  };
  const own = () => UNIT_DEFS[Battle.start(SCENARIOS.skirmish, 1).actor.def].abilities[0];

  it('an old save with usedAbility loads as the main action spent', () => {
    expect(turnOf({ usedAbility: own() }, ['main', 'bonus'])).toMatchObject({ main: own(), bonus: null });
    expect(turnOf({ usedAbility: null }, ['main', 'bonus'])).toMatchObject({ main: null, bonus: null });
    expect(turnOf({ usedAbility: 'evil' }, ['main', 'bonus'])).toBeUndefined();
  });

  it('round trip; an unknown id or a damage ability in the bonus slot is rejected', () => {
    expect(turnOf({ main: own(), bonus: 'ether' })).toMatchObject({ main: own(), bonus: 'ether' });
    expect(turnOf({ main: 'evil' })).toBeUndefined();
    expect(turnOf({ bonus: 'evil' })).toBeUndefined();
    expect(turnOf({ bonus: 'strike' })).toBeUndefined();
    expect(turnOf({ main: 7 })).toBeUndefined();
  });
});

describe('the enemy follows the same rule', () => {
  it('after its main attack it also takes a worthwhile bonus (a heal on a hurt ally)', () => {
    const b = duel('enemy');
    b.state.units[2].hp = 5; // the ally at 3,2 is hurt
    const ev = playAiTurn(b);
    const fired = ev.filter((e) => e.k === 'charge' || e.k === 'hit' || e.k === 'miss');
    expect(fired.some((e) => e.k === 'charge' && e.ability === 'heal')).toBe(true);
    expect(fired.some((e) => e.k === 'hit' || e.k === 'miss' || (e.k === 'charge' && e.ability !== 'heal'))).toBe(true);
  });
});
