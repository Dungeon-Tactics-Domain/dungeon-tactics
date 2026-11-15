import { afterEach, describe, expect, it, vi } from 'vitest';
import { selectBattle } from '../src/client/game/boot.ts';
import { store } from '../src/client/store.ts';
import { Battle } from '../src/shared/battle/battle.ts';
import { HALF } from '../src/shared/battle/half.ts';
import type * as Generate from '../src/shared/crawl/generate.ts';
import { CRAWL_VERSION, type RoomOptions } from '../src/shared/crawl/generate.ts';

// ?crawl= through the boot's real path (boot.ts has no DOM or Three), as tests/half-tiles.test.ts does. Seeds 1 to 3
// stand for seeds whose 200 layouts all fail (none of the 500 tested do), so the fallback can be checked
vi.mock('../src/shared/crawl/generate.ts', async (importOriginal) => {
  const real = await importOriginal<typeof Generate>();
  return {
    ...real,
    generateRoom: (seed: number, opts: RoomOptions) => {
      if (seed >= 1 && seed <= 3) throw new Error(`crawl: no room passed the checks for seed ${seed}`);
      return real.generateRoom(seed, opts);
    },
  };
});

const open = (search: string) => {
  const location = { search };
  vi.stubGlobal('location', location);
  return location;
};

describe('crawl rooms in the client', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('?crawl= opens the room in half tiles, without the title, and a save of it resumes', async () => {
    open('?crawl=7&depth=2&boss=1&theme=forest');
    const sel = await selectBattle();
    if (!sel || sel === 'world') throw new Error('no battle');
    expect(sel.scenario.id).toBe(`${CRAWL_VERSION}-7-d2-boss-forest${HALF}`);
    expect(sel.title).toBe(false);
    expect(sel.saveKey).toBe('dt:battle:crawl');
    store.set(sel.saveKey, Battle.start(sel.scenario, 3).save());
    const again = await selectBattle();
    if (!again || again === 'world') throw new Error('no battle');
    expect(Battle.load(store.get(again.saveKey) ?? '')?.state.scenario).toBe(again.scenario.id);
  });

  it('a seed with no room moves on to the next one', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    open('?crawl=3');
    const sel = await selectBattle();
    if (!sel || sel === 'world') throw new Error('no battle');
    expect(sel.scenario.id).toBe(`${CRAWL_VERSION}-4-d1-dungeon${HALF}`);
  });

  it('two seeds with no room go back to the title with a message, without throwing', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const alert = vi.fn();
    vi.stubGlobal('alert', alert);
    const location = open('?crawl=1');
    expect(await selectBattle()).toBeNull();
    expect(alert).toHaveBeenCalledOnce();
    expect(location.search).toBe('');
  });
});
