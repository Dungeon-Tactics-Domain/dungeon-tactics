import { describe, expect, it } from 'vitest';
import { canStand, tileAt } from '../src/shared/battle/grid.ts';
import { SCENARIOS } from '../src/shared/battle/scenarios.ts';

// Mapas do jogo (12/11: Colina do Farol vestida com peças e a Cripta Alagada nova): grade inteira e ninguém nascendo
// em parede, água funda ou em cima de outro
describe('mapas do jogo', () => {
  for (const s of Object.values(SCENARIOS)) {
    it(`${s.id}: grade completa e casas de partida livres`, () => {
      expect(s.grid.tiles.length).toBe(s.grid.width * s.grid.height);
      const cells = new Set<string>();
      for (const sp of s.spawns) {
        expect(canStand(tileAt(s.grid, sp)), `${sp.id} em ${sp.x},${sp.y}`).toBe(true);
        cells.add(`${sp.x},${sp.y}`);
      }
      expect(cells.size).toBe(s.spawns.length);
    });
  }

  it('Colina do Farol: neve só no lado dos inimigos e ouro na casa do Farol', () => {
    const s = SCENARIOS.beacon_hill;
    const beacon = s.spawns.find((sp) => sp.def === 'beacon')!;
    expect(tileAt(s.grid, beacon).look).toBe('gold');
    for (const sp of s.spawns) {
      const snowy = /snow|bare/.test(tileAt(s.grid, sp).look ?? '');
      expect(snowy, sp.id).toBe(sp.team === 'enemy');
    }
  });
});
