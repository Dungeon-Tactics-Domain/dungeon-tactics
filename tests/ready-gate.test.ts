/// <reference types="vite/client" />
import { describe, expect, it } from 'vitest';
import entry from '../src/client/entry.ts?raw';
import town from '../src/client/game/town.ts?raw';
import townHud from '../src/client/game/town-hud.ts?raw';
import { loadingLayout, loadShare, whenReady } from '../src/client/ready-gate.ts';

// The readiness gate (Nov 18, Fernando: the HTML title and HUD showed while the models loaded and then changed into
// the 3D ones): nothing of the interface is built before every part landed, and the cover leaves only after it
const deferred = <T>() => {
  let resolve!: (v: T) => void, reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};
const tick = () => new Promise((r) => setTimeout(r));

describe('readiness gate', () => {
  const setup = () => {
    const log: string[] = [];
    const opened = deferred<void>();
    const cover = {
      fail: () => void log.push('fail'),
      open: () => {
        log.push('open');
        return opened.promise;
      },
    };
    return { log, opened, cover };
  };

  it('builds nothing until every part landed, then builds once and only then opens the cover', async () => {
    const { log, opened, cover } = setup();
    const models = deferred<string>(),
      skin = deferred<number>();
    const done = whenReady(cover, [models.promise, skin.promise], ([m, s]) => {
      log.push(`build ${m} ${s}`);
      return 'game';
    });
    await tick();
    expect(log).toEqual([]);
    skin.resolve(3); // the chunks first: the models still hold the interface back
    await tick();
    expect(log).toEqual([]);
    models.resolve('scene');
    await tick();
    expect(log).toEqual(['build scene 3', 'open']);
    let out: string | undefined;
    void done.then((v) => (out = v));
    await tick();
    expect(out).toBeUndefined(); // the caller goes on only once the cover left
    opened.resolve();
    expect(await done).toBe('game');
  });

  it('a part that fails builds nothing: the cover says so and stays', async () => {
    const { log, cover } = setup();
    const models = deferred<string>();
    const done = whenReady(cover, [models.promise, Promise.resolve(1)], () => void log.push('build'));
    models.reject(new Error('404'));
    await expect(done).rejects.toThrow('404');
    expect(log).toEqual(['fail']);
  });

  it('an interface that breaks while it is built leaves the cover on, saying so', async () => {
    const { log, cover } = setup();
    const done = whenReady(cover, [Promise.resolve(1)], () => {
      throw new Error('no WebGL');
    });
    await expect(done).rejects.toThrow('no WebGL');
    expect(log).toEqual(['fail']);
  });

  it('the bar grows with every file, never goes back and is never full before the cover leaves', () => {
    expect(loadShare(0, 0)).toBe(0);
    let was = 0;
    for (let done = 1; done <= 400; done++) {
      const now = loadShare(was, done);
      expect(now).toBeGreaterThan(was);
      expect(now).toBeLessThan(1);
      was = now;
    }
    expect(loadShare(0, 28)).toBeCloseTo(0.5, 1);
    expect(loadShare(0, 100)).toBeGreaterThan(0.9);
    expect(loadShare(0.8, 3)).toBe(0.8); // a count that starts over (a second scene) does not empty the bar
  });

  it('the 3D line and bar sit in the middle of the page and fit a narrow one', () => {
    const wide = loadingLayout(1920, 1080, 1);
    expect(wide.bar).toEqual({ x: 680, y: 548, w: 560, h: 14 });
    expect(wide.line).toEqual({ x: 960, y: 512 });
    const phone = loadingLayout(360, 640, 0.6);
    expect(phone.bar.x).toBe(32);
    expect(phone.bar.x + phone.bar.w).toBe(360 - 32);
    expect(phone.bar.h).toBeGreaterThanOrEqual(8);
  });
});

// The pages' own boot: the source is read, so a title or a HUD made outside the gate fails here without a browser
describe('boot: the interface is only made inside the gate', () => {
  const code = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
  // every call of `what` sits after the gate's call, inside its `build` (the last argument, up to the file's next
  // top-level statement)
  const inGate = (text: string, what: RegExp) => {
    const src = code(text),
      gate = src.indexOf('whenReady('),
      end = gate + src.slice(gate).search(/\n {2}[)}]/); // the call's closing line, however it was wrapped
    const calls = [...src.matchAll(what)].map((m) => m.index);
    return gate >= 0 && calls.length > 0 && calls.every((at) => at > gate && at < end);
  };

  it('the battle: the cover first, the Game and the title inside the gate', () => {
    const src = code(entry);
    expect(src.indexOf('loadingCover(')).toBeGreaterThan(0);
    expect(src.indexOf('loadingCover(')).toBeLessThan(src.indexOf('selectBattle('));
    expect(inGate(entry, /new Game\(/g)).toBe(true);
    expect(inGate(entry, /titleScreen\(/g)).toBe(true);
    expect(inGate(entry, /loadSkin\(/g)).toBe(true); // a part of the gate, not awaited after the HUD
  });

  it('the town: the Town, its 3D look and what home opens inside the gate', () => {
    expect(inGate(town, /new Town\(/g)).toBe(true);
    expect(inGate(town, /homeScreen\(/g)).toBe(true);
    expect(inGate(town, /loadTownSkin\(/g)).toBe(true);
    // the HUD no longer fetches its look by itself, after it is on screen
    expect(code(townHud)).not.toContain('loadTownSkin');
  });

  it('the checker itself catches a title opened before the gate', () => {
    const early = 'titleScreen();\nawait whenReady(\n  cover,\n  () => {\n    new Game();\n  },\n  );';
    expect(inGate(early, /titleScreen\(/g)).toBe(false);
    expect(inGate(early, /new Game\(/g)).toBe(true);
  });
});
