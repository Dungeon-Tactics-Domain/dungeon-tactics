import { describe, expect, it } from 'vitest';
import { Battle } from '../src/shared/battle/battle.ts';
import { simulate } from '../src/shared/battle/simulate.ts';
import { CHAPTERS, SPEAKERS, chapterScenario, parseProgress } from '../src/client/campaign.ts';
import { problems } from '../src/client/dev-roster.ts';

const say = (pt: string) => pt;
// MEDIR=300 npx vitest run tests/campaign.test.ts mostra a vitória dos heróis (IA contra IA) em cada fase
const RUNS = Number((globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env.MEDIR ?? 0); // sem @types/node no projeto

describe('campanha Cinzas do Farol', () => {
  it('toda fase monta, cabe no mapa, joga, salva e carrega', () => {
    CHAPTERS.forEach((c, n) => {
      expect(problems(c.setup, say), c.title[0]).toEqual([]);
      const b = Battle.start(chapterScenario(n), 3);
      expect(Battle.load(b.save()), c.title[0]).not.toBeNull();
      expect(simulate(chapterScenario(n), 5).turns).toBeGreaterThan(1);
    });
  });

  it('as falas têm as duas línguas e quem fala existe', () => {
    for (const c of CHAPTERS) for (const l of [...c.intro, ...c.outro]) {
      expect(SPEAKERS[l.who]).toBeDefined();
      expect(l.pt.length && l.en.length).toBeTruthy();
    }
  });

  it('o progresso salvo só aceita um número de fases válido', () => {
    expect(parseProgress('2')).toBe(2);
    expect(parseProgress(String(CHAPTERS.length))).toBe(CHAPTERS.length);
    for (const bad of ['-1', '99', 'x', null, '1.5']) expect(parseProgress(bad)).toBe(0);
  });

  it.runIf(RUNS > 0)('mede a vitória dos heróis por fase', () => {
    CHAPTERS.forEach((c, n) => {
      let wins = 0, turns = 0;
      for (let s = 1; s <= RUNS; s++) {
        const r = simulate(chapterScenario(n), s);
        if (r.outcome === 'victory') wins++;
        turns += r.turns;
      }
      console.log(`${n + 1}. ${c.title[0]}: heróis ${((wins / RUNS) * 100).toFixed(1)}% · ${(turns / RUNS).toFixed(0)} turnos`);
    });
  }, 600000);
});
