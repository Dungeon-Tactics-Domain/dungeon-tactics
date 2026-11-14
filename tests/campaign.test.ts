import { describe, expect, it } from 'vitest';
import {
  CHAPTERS,
  chapterScenario,
  foesText,
  learned,
  objectiveText,
  parseProgress,
  SPEAKERS,
} from '../src/client/campaign.ts';
import { problems } from '../src/client/dev-roster.ts';
import { unitHeight } from '../src/client/markers.ts';
import { Battle } from '../src/shared/battle/battle.ts';
import { simulate } from '../src/shared/battle/simulate.ts';
import { UNIT_DEFS } from '../src/shared/battle/units.ts';

const say = (pt: string) => pt;
// MEASURE=300 npx vitest run tests/campaign.test.ts shows hero wins (AI vs AI) in each stage
const RUNS = Number(
  (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env.MEASURE ?? 0,
); // no @types/node in the project

describe('campaign Beacon Ashes', () => {
  it('every stage builds, fits the map, plays, saves and loads', () => {
    CHAPTERS.forEach((c, n) => {
      expect(problems(c.setup, say), c.title[0]).toEqual([]);
      const b = Battle.start(chapterScenario(n), 3);
      expect(Battle.load(b.save()), c.title[0]).not.toBeNull();
      expect(simulate(chapterScenario(n), 5).turns).toBeGreaterThan(1);
    });
  });

  it("boss stage: downing the 1st enemy wins with others standing; without heroes or without the Beacon, it's a loss", () => {
    const n = CHAPTERS.findIndex((c) => c.boss && c.setup.map === 'beacon_hill');
    const s = chapterScenario(n);
    const st = Battle.start(s, 1).state;
    const outcome = s.rules!.outcome!;
    expect(outcome(st)).toBe('ongoing');
    expect(outcome({ ...st, units: st.units.filter((u) => u.id !== 'e0') })).toBe('victory');
    expect(outcome({ ...st, units: st.units.filter((u) => u.team !== 'hero' || u.def === 'beacon') })).toBe('defeat');
    expect(outcome({ ...st, units: st.units.filter((u) => u.def !== 'beacon') })).toBe('defeat');
  });

  it('the announced objective follows the stage rule (boss, Beacon or all)', () => {
    expect(objectiveText(0, say)).toBe('Derrote todos os inimigos!');
    expect(objectiveText(1, say)).toBe('Derrote os inimigos e proteja o Farol!');
    expect(objectiveText(3, say)).toBe('Derrube Vesper e proteja o Farol!');
    expect(objectiveText(CHAPTERS.length - 1, (_pt, en) => en)).toBe('Bring down The Shade!');
  });

  it('the map panel states how many enemies and the boss, if any', () => {
    expect(foesText(0, say)).toBe('4 inimigos');
    expect(foesText(3, say)).toBe('4 inimigos · chefe: Vesper');
    expect(foesText(CHAPTERS.length - 1, (_pt, en) => en)).toBe('4 enemies · boss: The Shade');
  });

  it("the campaign Brute (own sheet) has the Brute's height", () => {
    const s = chapterScenario(1);
    const brute = s.spawns.find((sp) => UNIT_DEFS[sp.def].name === UNIT_DEFS.brute.name)!;
    expect(unitHeight(brute.def)).toBe(unitHeight('brute'));
    expect(unitHeight(brute.def)).toBeGreaterThan(unitHeight('soldier'));
  });

  it('lines have both languages and the speaker exists', () => {
    for (const c of CHAPTERS)
      for (const l of [...c.intro, ...c.outro]) {
        expect(SPEAKERS[l.who]).toBeDefined();
        expect(l.pt.length && l.en.length).toBeTruthy();
      }
  });

  it('saved progress only accepts a valid stage count', () => {
    expect(parseProgress('2')).toBe(2);
    expect(parseProgress(String(CHAPTERS.length))).toBe(CHAPTERS.length);
    for (const bad of ['-1', '99', 'x', null, '1.5']) expect(parseProgress(bad)).toBe(0);
  });

  it("heroes learn one ability per stage until they have 4 (Odo's Heal arrives in the 3rd)", () => {
    expect(CHAPTERS[0].setup.heroes.map((u) => u.abilities.length)).toEqual([2, 2, 2, 2]);
    expect(learned(0).map((x) => x.abilities)).toEqual([['shield_bash'], ['knock_shot'], ['gust'], ['trip']]);
    expect(learned(1).find((x) => x.name === 'Odo')?.abilities).toEqual(['heal']);
    expect(learned(2)).toEqual([]);
    expect(learned(CHAPTERS.length - 1)).toEqual([]);
  });

  it.runIf(RUNS > 0)(
    'measures hero wins per stage',
    () => {
      CHAPTERS.forEach((c, n) => {
        let wins = 0,
          turns = 0;
        for (let s = 1; s <= RUNS; s++) {
          const r = simulate(chapterScenario(n), s);
          if (r.outcome === 'victory') wins++;
          turns += r.turns;
        }
        console.log(
          `${n + 1}. ${c.title[1]}: heroes ${((wins / RUNS) * 100).toFixed(1)}% · ${(turns / RUNS).toFixed(0)} turns`,
        );
      });
    },
    600000,
  );
});
