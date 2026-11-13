import { describe, expect, it } from 'vitest';
import { TRACKS, trackUrl, type SongId } from '../src/client/music.ts';

describe('músicas', () => {
  it('toda faixa tem arquivo em /music e ganho entre 0 e 1 (o volume do audio não passa de 1)', () => {
    for (const id of Object.keys(TRACKS) as SongId[]) {
      expect(trackUrl(id), id).toMatch(/^\/music\/[a-z]+\.(ogg|mp3)$/);
      expect(TRACKS[id].gain).toBeGreaterThan(0);
      expect(TRACKS[id].gain).toBeLessThanOrEqual(1);
    }
  });
});
