import { describe, expect, it } from 'vitest';
import { SONGS, freq, tokens } from '../src/client/music.ts';

describe('músicas sintetizadas', () => {
  it('converte nota em frequência (lá 440, oitavas e acidentes)', () => {
    expect(freq('A4')).toBe(440);
    expect(freq('A5')).toBeCloseTo(880);
    expect(freq('C4')).toBeCloseTo(261.63, 1);
    expect(freq('Bb1')).toBeCloseTo(58.27, 1);
    expect(freq('G#4')).toBeCloseTo(415.3, 1);
    expect(freq('-')).toBeNull();
  });

  it('toda nota das músicas é válida e as duas vozes têm o mesmo tamanho (o laço não desencontra)', () => {
    for (const [id, s] of Object.entries(SONGS)) {
      const lead = tokens(s.lead), bass = tokens(s.bass);
      expect(lead.length, id).toBe(bass.length);
      for (const n of [...lead, ...bass]) expect(n === '-' || freq(n) !== null, `${id}: ${n}`).toBe(true);
    }
  });
});
