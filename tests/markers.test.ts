import { describe, expect, it } from 'vitest';
import { MARKER, barYOf, unitHeight } from '../src/client/markers.ts';
import { UNIT_DEFS } from '../src/shared/battle/units.ts';

// Bug de 25/10 (celular, ambiente do PR 1): a moldura do cursor e a seta amarela eram desenhadas por cima do herói
describe('altura dos marcadores', () => {
  const tallest = Math.max(...Object.keys(UNIT_DEFS).map(unitHeight));

  it('a moldura do cursor fica no chão e respeita a profundidade (o boneco a cobre)', () => {
    expect(MARKER.frameY).toBeLessThan(0.1);
    expect(MARKER.frameDepthTest).toBe(true);
  });

  it('a barra de vida fica acima de cada boneco, o grande inclusive', () => {
    for (const def of Object.keys(UNIT_DEFS)) expect(barYOf(def), def).toBeGreaterThan(unitHeight(def));
    expect(barYOf('colossus')).toBeGreaterThan(tallest - 0.01);
  });

  it('a seta flutua acima da barra de vida, mesmo no ponto mais baixo do balanço', () => {
    expect(MARKER.arrowY - MARKER.arrowBob - MARKER.arrowHalf).toBeGreaterThan(MARKER.barY + MARKER.barHalf);
  });
});
