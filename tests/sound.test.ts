import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_SOUND, parseSound, wake } from '../src/client/sound.ts';

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

// Audio unlock on touch (Nov 16 tablet audit): iPadOS Safari may leave a context made on pointerdown suspended until a
// later gesture resumes it; the context is made once and resumed only while suspended.
describe('audio wake', () => {
  const fake = (state: AudioContextState) =>
    ({ state, resume: vi.fn(async () => undefined) }) as unknown as AudioContext;
  it('makes the context on the first gesture and resumes it if the browser left it suspended', () => {
    const c = fake('suspended');
    const make = vi.fn(() => c);
    expect(wake(null, make)).toBe(c);
    expect(make).toHaveBeenCalledOnce();
    expect(c.resume).toHaveBeenCalledOnce();
  });
  it('a later gesture resumes the same suspended context without making another', () => {
    const c = fake('suspended');
    const make = vi.fn(() => fake('running'));
    expect(wake(c, make)).toBe(c);
    expect(make).not.toHaveBeenCalled();
    expect(c.resume).toHaveBeenCalledOnce();
  });
  it('resumes an interrupted context (iOS after a call) and leaves a closed one', () => {
    const i = fake('interrupted' as AudioContextState);
    wake(i, () => i);
    expect(i.resume).toHaveBeenCalledOnce();
    const x = fake('closed');
    wake(x, () => x);
    expect(x.resume).not.toHaveBeenCalled();
  });
  it('leaves a running context alone', () => {
    const c = fake('running');
    wake(c, () => c);
    expect(c.resume).not.toHaveBeenCalled();
  });

  // the listeners themselves (Nov 16 review): `once` on them, or no replay of a refused song, and the iPad stays silent
  it('listens to every gesture for good and plays again the song the browser refused', async () => {
    const heard = new Map<string, { run: () => void; opts?: AddEventListenerOptions }>();
    const songs: { paused: boolean; play: ReturnType<typeof vi.fn> }[] = [];
    vi.useFakeTimers(); // the music fader's interval
    vi.stubGlobal('addEventListener', (ev: string, run: () => void, opts?: AddEventListenerOptions) =>
      heard.set(ev, { run, opts }),
    );
    // classes: sound.ts calls both with `new`
    vi.stubGlobal(
      'AudioContext',
      class {
        state = 'suspended';
        resume = async () => undefined;
      },
    );
    vi.stubGlobal(
      'Audio',
      class {
        paused = true;
        volume = 0;
        pause = () => undefined;
        play = vi.fn(async () => undefined);
        constructor() {
          songs.push(this);
        }
      },
    );
    vi.resetModules();
    const { setSound } = await import('../src/client/sound.ts');
    setSound({ music: 45, sfx: 100 }); // the default is off: turn the song on to test it
    expect([...heard.keys()]).toEqual(['pointerdown', 'pointerup', 'touchend', 'click', 'keydown']);
    for (const h of heard.values()) expect(h.opts?.once).toBeFalsy();
    heard.get('pointerdown')!.run(); // makes the context and starts the song, which the browser refuses (still paused)
    expect(songs).toHaveLength(1);
    expect(songs[0].play).toHaveBeenCalledTimes(1);
    heard.get('pointerup')!.run();
    expect(songs[0].play).toHaveBeenCalledTimes(2);
    songs[0].paused = false; // playing: later gestures leave it alone
    heard.get('click')!.run();
    expect(songs[0].play).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });
});
