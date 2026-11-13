import { describe, expect, it } from 'vitest';
import { Battle } from '../src/shared/battle/battle.ts';
import { simulate } from '../src/shared/battle/simulate.ts';
import { CHAPTERS, SPEAKERS, chapterScenario, learned, parseProgress, parseStars, starText, starsOf } from '../src/client/campaign.ts';
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

  it('estrelas: vencer, ninguém cair e o Farol inteiro (sem Farol, todos acima da metade da vida)', () => {
    const won = (n: number) => ({ ...Battle.start(chapterScenario(n), 1).state, outcome: 'victory' as const });
    const hill = won(1); // Colina: tem Farol
    expect(starsOf(hill, 1)).toBe(3);
    expect(starsOf({ ...hill, units: hill.units.map((u) => (u.def === 'beacon' ? { ...u, hp: u.hp - 1 } : u)) }, 1)).toBe(2);
    expect(starsOf({ ...hill, units: hill.units.filter((u) => !u.def.endsWith('h0')) }, 1)).toBe(2);
    const wood = won(0); // Bosque: sem Farol
    expect(starsOf({ ...wood, units: wood.units.map((u) => (u.team === 'hero' ? { ...u, hp: 3 } : u)) }, 0)).toBe(2);
    expect(starsOf({ ...wood, outcome: 'defeat' }, 0)).toBe(0);
    expect(parseStars([3, 'x', 9, 2])).toEqual(CHAPTERS.map((_, i) => [3, 0, 0, 2][i] ?? 0));
    expect(starText(2)).toBe('★★☆');
  });

  it('os heróis aprendem uma habilidade por fase até ter as 4 (a Cura do Odo chega na 3ª)', () => {
    expect(CHAPTERS[0].setup.heroes.map((u) => u.abilities.length)).toEqual([2, 2, 2, 2]);
    expect(learned(0).map((x) => x.abilities)).toEqual([['shield_bash'], ['knock_shot'], ['gust'], ['trip']]);
    expect(learned(1).find((x) => x.name === 'Odo')?.abilities).toEqual(['heal']);
    expect(learned(2)).toEqual([]);
    expect(learned(CHAPTERS.length - 1)).toEqual([]);
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
