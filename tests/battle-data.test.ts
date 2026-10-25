import { describe, expect, it } from 'vitest';
import { ABILITIES } from '../src/shared/battle/abilities.ts';
import { UNIT_DEFS } from '../src/shared/battle/units.ts';

// teste de completude: dado esquecido ou inconsistente aparece aqui, não no meio da batalha
describe('dados de habilidades e unidades', () => {
  it('toda habilidade de toda unidade existe', () => {
    for (const u of Object.values(UNIT_DEFS)) for (const a of u.abilities) expect(ABILITIES[a], `${u.id} → ${a}`).toBeDefined();
  });

  it('cada herói tem 4 habilidades ou mais e cabe na barra de 6 (mover + habilidades + terminar)', () => {
    for (const id of ['warrior', 'archer', 'mage', 'rogue']) {
      const n = UNIT_DEFS[id].abilities.length;
      expect(n, id).toBeGreaterThanOrEqual(4);
      expect(n + 2, id).toBeLessThanOrEqual(6);
    }
  });

  it('habilidade faz dano ou cura, nunca os dois, e tem alcance coerente', () => {
    for (const a of Object.values(ABILITIES)) {
      expect(a.damage[1] > 0 !== a.heal[1] > 0, a.id).toBe(true);
      expect(a.range[0], a.id).toBeLessThanOrEqual(a.range[1]);
      expect(a.damage[0], a.id).toBeLessThanOrEqual(a.damage[1]);
      expect(a.accuracy, a.id).toBeGreaterThan(0);
    }
  });
});
