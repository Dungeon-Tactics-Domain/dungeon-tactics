import { describe, expect, it } from 'vitest';
import { DEFAULT_SOUND, parseSound } from '../src/client/sound.ts';

// Preferência de som guardada no navegador (12/11): valor estranho volta ao padrão, campo a campo
describe('preferência de som', () => {
  it('aceita só 0, 1 e 2 em música e efeitos', () => {
    expect(parseSound({ music: 2, sfx: 0 })).toEqual({ music: 2, sfx: 0 });
    expect(parseSound({ music: 7, sfx: 'alto' })).toEqual(DEFAULT_SOUND);
    expect(parseSound(null)).toEqual(DEFAULT_SOUND);
  });
});
