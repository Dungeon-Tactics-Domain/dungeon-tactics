import { describe, expect, it } from 'vitest';
import { DEFAULT_SOUND, parseSound } from '../src/client/sound.ts';

// Sound preference stored in the browser (Nov 12): odd value falls back to the default, field by field.
// Since Nov 13 it is a volume in % in steps of 5; the old save (0, 1, 2) becomes the equivalent volume.
describe('sound preference', () => {
  it('accepts volume from 0 to 100 in steps of 5', () => {
    expect(parseSound({ music: 0, sfx: 100 })).toEqual({ music: 0, sfx: 100 });
    expect(parseSound({ music: 35, sfx: 5 })).toEqual({ music: 35, sfx: 5 });
  });
  it('converts the old save (off, low, high)', () => {
    expect(parseSound({ music: 1, sfx: 2 })).toEqual({ music: 45, sfx: 100 });
    expect(parseSound({ music: 0, sfx: 1 })).toEqual({ music: 0, sfx: 45 });
  });
  it('odd value falls back to the default', () => {
    expect(parseSound({ music: 7, sfx: 'alto' })).toEqual(DEFAULT_SOUND);
    expect(parseSound({ music: 105, sfx: -5 })).toEqual(DEFAULT_SOUND);
    expect(parseSound(null)).toEqual(DEFAULT_SOUND);
  });
});
