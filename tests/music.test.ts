import { describe, expect, it } from 'vitest';
import { type SongId, TRACKS, trackUrl } from '../src/client/music.ts';

describe('music', () => {
  it('every track has a file in /music and a gain between 0 and 1 (audio volume never exceeds 1)', () => {
    for (const id of Object.keys(TRACKS) as SongId[]) {
      expect(trackUrl(id), id).toMatch(/^\/music\/[a-z_]+\.(ogg|mp3)$/);
      expect(TRACKS[id].gain).toBeGreaterThan(0);
      expect(TRACKS[id].gain).toBeLessThanOrEqual(1);
    }
  });
});
