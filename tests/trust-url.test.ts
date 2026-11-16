import { afterEach, describe, expect, it, vi } from 'vitest';
import { newBattle, selectBattle } from '../src/client/game/boot.ts';
import { CRAWL_KEY } from '../src/client/game/crawl.ts';
import { store } from '../src/client/store.ts';
import { playAiTurn } from '../src/shared/battle/ai.ts';
import { HALF } from '../src/shared/battle/half.ts';
import { FIRST_BATTLE } from '../src/shared/battle/scenarios.ts';
import { isObjective } from '../src/shared/battle/units.ts';
import { expeditionMap, openNodes, startExpedition } from '../src/shared/crawl/expedition.ts';
import { CRAWL_VERSION } from '../src/shared/crawl/generate.ts';

// Security review of the address: anyone can send a link with any ?scenario=, ?crawl=, ?room=. selectBattle (game/boot.ts,
// no DOM or Three, already driven this way by tests/crawl-boot.test.ts) must open a known battle or go home, never throw:
// a throw there leaves the page blank.

const open = (search: string) => {
  const location = { search };
  vi.stubGlobal('location', location);
  vi.stubGlobal('alert', () => {});
  return location;
};

describe('hostile addresses', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    store.set(CRAWL_KEY, '');
  });

  it.each([
    '?scenario=missing',
    '?scenario=%3Cscript%3Ealert(1)%3C%2Fscript%3E',
    `?scenario=${'x'.repeat(100_000)}`,
    `?scenario=${encodeURIComponent(FIRST_BATTLE.id + HALF)}`,
    '?scenario=',
    '?cenario=missing',
  ])('%s opens the default battle', async (q) => {
    open(q);
    const sel = await selectBattle();
    expect(sel?.scenario.id.startsWith(FIRST_BATTLE.id)).toBe(true);
    expect(sel?.saveKey).toBe('dt:battle');
  });

  // Bug: boot.ts:111 tests `SCENARIOS[study]` for truth instead of Object.hasOwn, so a key inherited from Object.prototype
  // passes and boot.ts:118 reads `scenario.grid.sub` off a function: TypeError, blank page (measured: "Cannot read properties
  // of undefined (reading 'sub')"). Fix: `Object.hasOwn(SCENARIOS, study)` as parseBattleState does.
  for (const key of ['constructor', '__proto__', 'toString', 'hasOwnProperty'])
    it.fails(`?scenario=${key} opens the default battle instead of throwing`, async () => {
      open(`?scenario=${key}`);
      const sel = await selectBattle();
      expect(sel?.scenario.id.startsWith(FIRST_BATTLE.id)).toBe(true);
    });

  it('?crawl= with hostile seed, depth and theme is clamped to a valid room', async () => {
    open('?crawl=abc&depth=-Infinity&boss=yes&theme=__proto__');
    const sel = await selectBattle();
    expect(sel?.scenario.id).toBe(`${CRAWL_VERSION}-0-d1-dungeon${HALF}`);
  }, 60_000);

  // Bug (game rule, not data): boot.ts:69 reads the held room with Battle.load before that room's scenario is registered;
  // on a fresh page (a reload, a typed address) SCENARIOS has no generated rooms, parseBattleState rejects the unknown id,
  // `held` is undefined and a sibling ?room= opens, so the party escapes a bad room without losing the expedition (the
  // rule of crawl.ts leftRoom). The in-module test in crawl-boot.test.ts passes only because the first call registered the
  // room. Fix: read the held id as savedRoom does (crawl.ts:89, the raw JSON's state.scenario), not through Battle.load.
  it.fails('a sibling ?room= on a fresh page still goes home while another room is saved', async () => {
    const kept = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => kept.get(k) ?? null,
      setItem: (k: string, v: string) => void kept.set(k, v),
      removeItem: (k: string) => void kept.delete(k),
      key: (i: number) => [...kept.keys()][i] ?? null,
      get length() {
        return kept.size;
      },
    });
    // a fresh page: new module instances, so SCENARIOS holds only the shipped maps and store reads the stubbed storage
    const fresh = async () => {
      vi.resetModules();
      return {
        boot: await import('../src/client/game/boot.ts'),
        crawl: await import('../src/client/game/crawl.ts'),
        group: await import('../src/client/group.ts'),
        exp: await import('../src/shared/crawl/expedition.ts'),
        store: (await import('../src/client/store.ts')).store,
      };
    };
    let m = await fresh();
    const ids = m.group.parseGroup(null).deployed;
    const exp = m.exp.startExpedition(
      21,
      ids.map((id) => ({ id, max: 20 })),
    );
    m.store.set(m.crawl.CRAWL_KEY, JSON.stringify(exp));
    const [node, sibling] = m.exp.openNodes(m.exp.expeditionMap(21), []);
    open(`?room=${node}`);
    const sel = await m.boot.selectBattle();
    if (!sel) throw new Error('no battle');
    m.store.set(m.crawl.ROOM_KEY, m.boot.newBattle(sel.scenario, sel.room).save()); // main.ts saves the first frame
    m = await fresh();
    const location = open(`?room=${sibling}`);
    expect(await m.boot.selectBattle()).toBeNull();
    expect(location.search).toBe('?home');
  }, 60_000);

  it('an expedition whose party is not in the town party opens a room that ends without throwing', async () => {
    // dt:crawl and dt:party are separate keys: castRoom keeps only members still in the group, so an edited party of
    // strangers casts a room with no heroes. It must still end (a defeat), not hang or throw
    store.set(CRAWL_KEY, JSON.stringify(startExpedition(21, [{ id: 'ghost', max: 50 }])));
    open(`?room=${openNodes(expeditionMap(21), [])[0]}`);
    const sel = await selectBattle();
    if (!sel) throw new Error('no battle');
    const b = newBattle(sel.scenario, sel.room);
    expect(b.state.units.some((u) => u.team === 'hero' && !isObjective(u.def))).toBe(false);
    for (let i = 0; i < 40 && !b.over; i++) playAiTurn(b);
    expect(b.state.outcome).toBe('defeat');
  }, 60_000);

  it.each(['?room=', '?room=-1', '?room=1e99', '?room=__proto__', '?room=0x0', '?room=NaN'])(
    '%s with no expedition goes home without throwing',
    async (q) => {
      const location = open(q);
      expect(await selectBattle()).toBeNull();
      expect(location.search).toBe('?home');
    },
  );
});
