import { describe, expect, it } from 'vitest';
import { DEFAULT_SOUND, parseSound } from '../src/client/sound.ts';

// Preferência de som guardada no navegador (12/11): valor estranho volta ao padrão, campo a campo.
// Desde 13/11 é volume em % de 5 em 5; o save antigo (0, 1, 2) vira o volume equivalente.
describe('preferência de som', () => {
  it('aceita volume de 0 a 100 de 5 em 5', () => {
    expect(parseSound({ music: 0, sfx: 100 })).toEqual({ music: 0, sfx: 100 });
    expect(parseSound({ music: 35, sfx: 5 })).toEqual({ music: 35, sfx: 5 });
  });
  it('converte o save antigo (desligado, baixo, alto)', () => {
    expect(parseSound({ music: 1, sfx: 2 })).toEqual({ music: 45, sfx: 100 });
    expect(parseSound({ music: 0, sfx: 1 })).toEqual({ music: 0, sfx: 45 });
  });
  it('valor estranho volta ao padrão', () => {
    expect(parseSound({ music: 7, sfx: 'alto' })).toEqual(DEFAULT_SOUND);
    expect(parseSound({ music: 105, sfx: -5 })).toEqual(DEFAULT_SOUND);
    expect(parseSound(null)).toEqual(DEFAULT_SOUND);
  });
});
