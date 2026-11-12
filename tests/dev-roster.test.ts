import { beforeAll, describe, expect, it } from 'vitest';
import { Battle } from '../src/shared/battle/battle.ts';
import { registerFftStudy } from '../src/shared/battle/fft/gariland.ts';
import { simulate } from '../src/shared/battle/simulate.ts';
import { UNIT_DEFS } from '../src/shared/battle/units.ts';
import { DEV_SCENARIO, buildDevScenario, defaultSetup, devClasses, parseSetup, problems, unitFrom } from '../src/client/dev-roster.ts';

const say = (pt: string) => pt;

describe('menu de desenvolvedor: elenco', () => {
  beforeAll(() => registerFftStudy());

  it('o elenco padrão é quem nasce no mapa; em Gariland entram as nossas classes', () => {
    const colina = defaultSetup('beacon_hill');
    expect(colina.heroes.map((u) => u.base)).toEqual(['warrior', 'archer', 'mage', 'rogue']);
    expect(colina.enemies).toHaveLength(4);
    const gariland = defaultSetup('fft-gariland');
    expect(gariland.heroes.every((u) => devClasses().includes(u.base))).toBe(true);
    expect(problems(gariland, say)).toEqual([]);
  });

  it('avisa quando o time passa das casas de partida ou fica vazio', () => {
    const s = defaultSetup('skirmish');
    s.heroes.push(unitFrom('mage'));
    s.enemies = [];
    const p = problems(s, say);
    expect(p.some((x) => x.includes('tire 1'))).toBe(true);
    expect(p.some((x) => x.includes('inimigos'))).toBe(true);
  });

  it('o JSON importado só passa no formato conhecido', () => {
    const ok = defaultSetup('flooded_crypt');
    expect(parseSetup(JSON.parse(JSON.stringify(ok)))).toEqual(ok);
    expect(parseSetup({ ...ok, map: 'nada' })).toBeNull();
    expect(parseSetup({ ...ok, heroes: [{ ...ok.heroes[0], hp: 0 }] })).toBeNull();
    expect(parseSetup({ ...ok, heroes: [{ ...ok.heroes[0], base: 'fft_ramza' }] })).toBeNull();
    expect(parseSetup({ ...ok, heroes: [{ ...ok.heroes[0], abilities: ['nao_existe'] }] })).toBeNull();
  });

  it('vira um cenário jogável com os números editados, salva e carrega', () => {
    const s = defaultSetup('beacon_hill');
    s.heroes[0] = { ...s.heroes[0], name: 'Teste', hp: 99, speed: 20 };
    const scenario = buildDevScenario(s);
    expect(scenario.id).toBe(DEV_SCENARIO);
    const hero = scenario.spawns.find((sp) => sp.id === 'h0')!;
    expect(UNIT_DEFS[hero.def]).toMatchObject({ name: 'Teste', hp: 99, speed: 20 });
    expect(scenario.spawns.some((sp) => sp.def === 'beacon')).toBe(true);
    const b = Battle.start(scenario, 7);
    expect(Battle.load(b.save())).not.toBeNull();
  });

  it('Gariland sem Farol termina quando um lado acaba (sem derrota na hora)', () => {
    const scenario = buildDevScenario(defaultSetup('fft-gariland'));
    expect(scenario.spawns.some((sp) => sp.def === 'beacon')).toBe(false);
    const r = simulate(scenario, 3);
    expect(['victory', 'defeat', 'timeout']).toContain(r.outcome);
    expect(r.turns).toBeGreaterThan(1);
  });
});
