import { beforeAll, describe, expect, it } from 'vitest';
import { Battle } from '../src/shared/battle/battle.ts';
import { registerFftStudy } from '../src/shared/battle/fft/gariland.ts';
import { simulate } from '../src/shared/battle/simulate.ts';
import { UNIT_DEFS } from '../src/shared/battle/units.ts';
import {
  DEV_SCENARIO,
  buildDevScenario,
  defaultSetup,
  devClasses,
  parseSetup,
  problems,
  unitFrom,
} from '../src/client/dev-roster.ts';

const say = (pt: string) => pt;

describe('developer menu: roster', () => {
  beforeAll(() => registerFftStudy());

  it('the default roster is whoever spawns on the map; in Gariland our classes come in', () => {
    const colina = defaultSetup('beacon_hill');
    expect(colina.heroes.map((u) => u.base)).toEqual(['warrior', 'archer', 'mage', 'rogue']);
    expect(colina.enemies).toHaveLength(4);
    const gariland = defaultSetup('fft-gariland');
    expect(gariland.heroes.every((u) => devClasses().includes(u.base))).toBe(true);
    expect(problems(gariland, say)).toEqual([]);
  });

  it('warns when the team exceeds the start tiles or is empty', () => {
    const s = defaultSetup('skirmish');
    s.heroes.push(unitFrom('mage'));
    s.enemies = [];
    const p = problems(s, say);
    expect(p.some((x) => x.includes('tire 1'))).toBe(true);
    expect(p.some((x) => x.includes('inimigos'))).toBe(true);
  });

  it('imported JSON only passes in the known format', () => {
    const ok = defaultSetup('flooded_crypt');
    expect(parseSetup(JSON.parse(JSON.stringify(ok)))).toEqual(ok);
    expect(parseSetup({ ...ok, map: 'nada' })).toBeNull();
    expect(parseSetup({ ...ok, heroes: [{ ...ok.heroes[0], hp: 0 }] })).toBeNull();
    expect(parseSetup({ ...ok, heroes: [{ ...ok.heroes[0], base: 'fft_ramza' }] })).toBeNull();
    expect(parseSetup({ ...ok, heroes: [{ ...ok.heroes[0], abilities: ['nao_existe'] }] })).toBeNull();
    // Jump (Nov 13): out of bounds is refused; a roster saved before it (without the field) opens the same
    expect(parseSetup({ ...ok, heroes: [{ ...ok.heroes[0], jump: 9 }] })).toBeNull();
    const { jump: _, ...old } = ok.heroes[0];
    expect(parseSetup({ ...ok, heroes: [old] })?.heroes[0].jump).toBeUndefined();
  });

  it("the edited Jump applies in battle; without it, the class's", () => {
    const s = defaultSetup('beacon_hill');
    s.heroes[0] = { ...s.heroes[0], jump: 4 };
    const { jump: _, ...noJump } = s.heroes[1];
    s.heroes[1] = noJump;
    const scenario = buildDevScenario(s);
    const def = (id: string) => UNIT_DEFS[scenario.spawns.find((sp) => sp.id === id)!.def];
    expect(def('h0').jump).toBe(4);
    expect(def('h1').jump).toBe(UNIT_DEFS[s.heroes[1].base].jump ?? 1);
  });

  it('becomes a playable scenario with the edited numbers, saves and loads', () => {
    const s = defaultSetup('beacon_hill');
    s.heroes[0] = { ...s.heroes[0], name: 'Teste', hp: 99, speed: 20 };
    const scenario = buildDevScenario(s);
    expect(scenario.id).toBe(DEV_SCENARIO);
    const hero = scenario.spawns.find((sp) => sp.id === 'h0')!;
    expect(UNIT_DEFS[hero.def]).toMatchObject({ name: 'Teste', en: 'Teste', hp: 99, speed: 20 });
    // unchanged class name comes out in English in the English game (it used to stay "Soldado")
    expect(UNIT_DEFS[scenario.spawns.find((sp) => sp.id === 'e0')!.def].en).toBe(UNIT_DEFS[s.enemies[0].base].en);
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
