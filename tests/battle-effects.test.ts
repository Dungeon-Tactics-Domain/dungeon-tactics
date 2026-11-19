import { describe, expect, it } from 'vitest';
import { ABILITIES } from '../src/shared/battle/abilities.ts';
import { Battle, parseBattleState } from '../src/shared/battle/battle.ts';
import { damageRange } from '../src/shared/battle/combat.ts';
import { hitElement, moveOf, parseEffects, tickEffects } from '../src/shared/battle/effects.ts';
import { SCENARIOS } from '../src/shared/battle/scenarios.ts';
import { finishTurn } from '../src/shared/battle/turn-queue.ts';
import { UNIT_DEFS } from '../src/shared/battle/units.ts';
import { flat, stateOf } from './battle-helpers.ts';

const g = flat(12, 5);
const duel = () => {
  const s = stateOf([
    { id: 'w', def: 'warrior', team: 'hero', x: 2, y: 2 },
    { id: 'm', def: 'mage', team: 'hero', x: 0, y: 2 },
    { id: 'e', def: 'soldier', team: 'enemy', x: 3, y: 2 },
  ]);
  s.bag = { fire_oil: 2, stone_potion: 1 };
  return s;
};
const strike = ABILITIES[UNIT_DEFS.warrior.abilities[0]];
const by = (s: ReturnType<typeof duel>, id: string) => s.units.find((u) => u.id === id)!;

describe('timed item effects (effects.ts, Nov 19)', () => {
  it('fire oil adds 10 physical power and makes martial hits fire', () => {
    const s = duel();
    const before = damageRange(s, by(s, 'w'), strike, by(s, 'e'));
    const b = new Battle(g, s);
    expect(b.useItem('fire_oil', { x: 2, y: 2 }).map((e) => e.k)).toEqual(['item', 'effect']);
    expect(hitElement(b.state, 'w')).toBe('fire');
    const after = damageRange(b.state, by(b.state, 'w'), strike, by(b.state, 'e'));
    expect(after[1]).toBeGreaterThan(before[1]);
  });

  it('stone potion makes the target take less physical damage and walk 1 tile less', () => {
    const s = duel();
    const foe = { ...by(s, 'e'), team: 'enemy' as const };
    const hit = () => damageRange(s, foe, strike, by(s, 'w'))[1];
    const before = hit();
    const move = moveOf(s, by(s, 'w'));
    new Battle(g, s).useItem('stone_potion', { x: 2, y: 2 });
    expect(hit()).toBeLessThan(before);
    expect(moveOf(s, by(s, 'w'))).toBe(move - 1);
  });

  it('on the user it lasts its 3 next turns, past the turn it was used in', () => {
    const s = duel();
    new Battle(g, s).useItem('fire_oil', { x: 2, y: 2 }); // the warrior on itself
    s.turn.usedAbility = null;
    s.turn.actor = 'w';
    finishTurn(s); // the turn it used it in
    for (let i = 0; i < 3; i++) {
      expect(hitElement(s, 'w')).toBe('fire');
      tickEffects(s, 'w');
    }
    expect(hitElement(s, 'w')).toBeUndefined();
    expect(s.effects).toBeUndefined();
  });

  it('the same item again starts over instead of stacking', () => {
    const s = duel();
    const b = new Battle(g, s);
    b.useItem('fire_oil', { x: 0, y: 2 }); // on the mage
    b.state.turn.usedAbility = null;
    b.useItem('fire_oil', { x: 0, y: 2 });
    expect(b.state.effects).toEqual([{ unit: 'm', item: 'fire_oil', turns: 3 }]);
  });

  it('the save keeps valid effects and refuses edited ones', () => {
    const raw = JSON.parse(Battle.start(SCENARIOS.skirmish, 1).save()).state;
    const id = raw.units[0].id;
    expect(parseBattleState({ ...raw, effects: [{ unit: id, item: 'fire_oil', turns: 2 }] })?.effects).toEqual([
      { unit: id, item: 'fire_oil', turns: 2 },
    ]);
    expect(parseBattleState({ ...raw, effects: [{ unit: id, item: 'life_potion', turns: 2 }] })).toBeNull();
    expect(parseBattleState({ ...raw, effects: [{ unit: id, item: 'fire_oil', turns: 9 }] })).toBeNull();
    expect(parseBattleState({ ...raw, effects: [{ unit: 'ghost', item: 'fire_oil', turns: 1 }] })).toBeNull();
    expect(parseEffects(undefined, [])).toEqual([]);
  });
});
