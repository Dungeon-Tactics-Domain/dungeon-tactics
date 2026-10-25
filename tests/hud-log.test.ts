import { describe, expect, it } from 'vitest';
import { eventLog } from '../src/client/hud.ts';
import { initialState, SCENARIOS } from '../src/shared/battle/scenarios.ts';

const state = initialState(SCENARIOS.skirmish, 1);

describe('resumo do que aconteceu', () => {
  it('diz quem usou o quê e o resultado em cada alvo, inclusive quem já saiu do mapa', () => {
    const text = eventLog([
      { k: 'attack', unit: 'h-rogue', ability: 'throwing_knife', target: { x: 6, y: 3 } },
      { k: 'hit', unit: 'e-mage', dmg: 6, chance: 76 },
      { k: 'die', unit: 'e-mage' },
    ], { ...state, units: state.units.filter((u) => u.id !== 'e-mage') });
    expect(text).toBe('Ladino: Faca arremessada → Mago sombrio −6 · Mago sombrio caiu');
  });

  it('erro, cura, batida e queda', () => {
    expect(eventLog([
      { k: 'attack', unit: 'h-mage', ability: 'heal', target: { x: 2, y: 5 } },
      { k: 'heal', unit: 'h-warrior', amount: 8 },
      { k: 'miss', unit: 'e-soldier', chance: 40 },
      { k: 'bump', unit: 'e-brute', dmg: 3 },
      { k: 'fall', unit: 'e-brute', levels: 2, dmg: 5 },
    ], state)).toBe('Mago: Cura → Guerreiro +8 · Soldado errou (40%) · Bruto bateu −3 · Bruto caiu de altura −5');
  });

  it('só andar não gera resumo', () => {
    expect(eventLog([{ k: 'move', unit: 'h-rogue', path: [] }], state)).toBe('');
  });
});
