import { describe, expect, it } from 'vitest';
import { FACING, canStand, inBounds, standH, tileAt } from '../src/shared/battle/grid.ts';
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

  // rampa é só desenho (13/11): fica em chão plano pisável (sem água nem espinho) e sobe exatamente 1 nível até a
  // vizinha, que também é chão. Assim o desenho nunca mostra subida onde a regra pede pulo de 2 ou não deixa passar
  it('rampas dos mapas do jogo: chão que sobe 1 nível até a vizinha', () => {
    let total = 0;
    for (const s of Object.values(SCENARIOS)) {
      if (s.rules) continue; // estudo do FFT: rampas do arquivo original, com subidas de 2 (fft-gariland.test)
      s.grid.tiles.forEach((t, i) => {
        if (!t.ramp) return;
        total++;
        const p = { x: i % s.grid.width, y: Math.floor(i / s.grid.width) }, f = FACING[t.ramp[0]];
        const up = { x: p.x + f.x, y: p.y + f.y };
        const where = `${s.id} ${p.x},${p.y}`;
        expect(t.terrain === 'floor' && !t.depth && !t.spikes && t.ramp[1] === 1, where).toBe(true);
        expect(inBounds(s.grid, up), where).toBe(true);
        const u = tileAt(s.grid, up);
        expect(u.terrain === 'floor' && !u.depth && standH(u) === standH(t) + 1, where).toBe(true);
      });
    }
    expect(total).toBeGreaterThan(0);
  });

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
