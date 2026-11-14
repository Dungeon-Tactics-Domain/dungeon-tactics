import { describe, expect, it } from 'vitest';
import { ABILITIES } from '../src/shared/battle/abilities.ts';
import { UNIT_DEFS } from '../src/shared/battle/units.ts';

// completeness test: forgotten or inconsistent data shows up here, not in the middle of a battle
describe('ability and unit data', () => {
  it('every ability of every unit exists', () => {
    for (const u of Object.values(UNIT_DEFS))
      for (const a of u.abilities) expect(ABILITIES[a], `${u.id} → ${a}`).toBeDefined();
  });

  it('each hero has 4 abilities or more and fits the 6-slot bar (move + abilities + end)', () => {
    for (const id of ['warrior', 'archer', 'mage', 'rogue']) {
      const n = UNIT_DEFS[id].abilities.length;
      expect(n, id).toBeGreaterThanOrEqual(4);
      expect(n + 2, id).toBeLessThanOrEqual(6);
    }
  });

  it('an ability deals damage or heals, never both, and has a coherent range', () => {
    for (const a of Object.values(ABILITIES)) {
      expect(a.damage[1] > 0 !== a.heal[1] > 0, a.id).toBe(true);
      expect(a.range[0], a.id).toBeLessThanOrEqual(a.range[1]);
      expect(a.damage[0], a.id).toBeLessThanOrEqual(a.damage[1]);
      expect(a.accuracy, a.id).toBeGreaterThan(0);
    }
  });
});
