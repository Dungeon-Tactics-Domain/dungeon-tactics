import { describe, expect, it } from 'vitest';
import { eventLog } from '../src/client/hud.ts';
import { initialState, SCENARIOS } from '../src/shared/battle/scenarios.ts';

const state = initialState(SCENARIOS.skirmish, 1);

describe('summary of what happened', () => {
  it('says who used what and the result on each target, including whoever already left the map', () => {
    const text = eventLog(
      [
        { k: 'attack', unit: 'h-rogue', ability: 'throwing_knife', target: { x: 6, y: 3 } },
        { k: 'hit', unit: 'e-mage', dmg: 6, chance: 76 },
        { k: 'die', unit: 'e-mage' },
      ],
      { ...state, units: state.units.filter((u) => u.id !== 'e-mage') },
    );
    expect(text).toBe('Ladino: Faca arremessada → Mago sombrio −6 · Mago sombrio caiu');
  });

  it('miss, heal, wall hit and fall', () => {
    expect(
      eventLog(
        [
          { k: 'attack', unit: 'h-mage', ability: 'heal', target: { x: 2, y: 5 } },
          { k: 'heal', unit: 'h-warrior', amount: 8 },
          { k: 'miss', unit: 'e-soldier', chance: 40 },
          { k: 'bump', unit: 'e-brute', dmg: 3 },
          { k: 'fall', unit: 'e-brute', levels: 2, dmg: 5 },
        ],
        state,
      ),
    ).toBe('Mago: Cura → Guerreiro +8 · errou Soldado (40%) · Bruto bateu −3 · Bruto caiu de altura −5');
  });

  it('just moving produces no summary', () => {
    expect(eventLog([{ k: 'move', unit: 'h-rogue', path: [] }], state)).toBe('');
  });
});
