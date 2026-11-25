import { stripTypeScriptTypes } from 'node:module';
import { describe, expect, it } from 'vitest';
import { ASH_WOOD } from '../src/content/maps/ash-wood.ts';
import { CRYPT_HEART } from '../src/content/maps/crypt-heart.ts';
import * as grid from '../src/shared/battle/grid.ts';
import { lastStanding, surviveFor } from '../src/shared/battle/outcome.ts';
import type { Scenario } from '../src/shared/battle/scenarios.ts';
import { generateRoom } from '../src/shared/crawl/generate.ts';
import { battleFromScenario, blankBattle } from '../src/shared/mapedit/battle.ts';
import { blankDoc, docFromScenario, type MapDoc } from '../src/shared/mapedit/doc.ts';
import { cycleRamp, setHeight } from '../src/shared/mapedit/edit.ts';
import { battleToTs, toJson, toTs } from '../src/shared/mapedit/export.ts';
import { parseBattleDoc, parseMapDoc } from '../src/shared/mapedit/parse.ts';
import { placeUnit, setLife, setSheet } from '../src/shared/mapedit/units.ts';

// a battle state both sides still stand in, for an exported objective's rule
const stateOfOutcome = () => ({
  units: [
    { team: 'hero', def: 'warrior' },
    { team: 'enemy', def: 'rat' },
  ],
  turnsPlayed: 0,
});

// Runs an exported .ts the way a map file loads: types stripped, the grid helpers handed in for its import
function loadTs(src: string): Record<string, unknown> {
  const names = [...src.matchAll(/^export const (\w+)/gm)].map((m) => m[1]);
  const js = stripTypeScriptTypes(src)
    .replace(/^import .*$/gm, '')
    .replace(/^export const /gm, 'const ');
  return Function(
    'withRamps',
    'surviveFor',
    'lastStanding',
    `${js}\nreturn { ${names.join(', ')} };`,
  )(grid.withRamps, surviveFor, lastStanding);
}
const scenarioOf = (src: string) => Object.values(loadTs(src)).find((v) => (v as Scenario).grid) as Scenario;
// `kinds` distinct kinds: the first tiles a look of their own, the rest plain grass
const motley = (kinds: number): MapDoc => {
  const d = blankDoc(10, 10);
  return { ...d, tiles: d.tiles.map((t, i) => (i < kinds - 1 ? { ...t, look: `look${i}` } : t)) };
};

describe('map JSON export', () => {
  it('reads back through parseMapDoc identical, for game maps and a crawl room, with no units', () => {
    for (const s of [ASH_WOOD, CRYPT_HEART, generateRoom(99)]) {
      const doc = docFromScenario(s);
      const json = toJson(doc);
      expect(json).not.toContain('units');
      expect(parseMapDoc(JSON.parse(json))).toEqual(doc);
    }
  });
});

describe('map .ts export', () => {
  it('builds the same tiles and both names for Ash Wood and Crypt Heart, with empty spawns', () => {
    for (const s of [ASH_WOOD, CRYPT_HEART]) {
      const back = scenarioOf(toTs(docFromScenario(s)));
      expect(back.grid.tiles).toEqual(s.grid.tiles);
      expect(back).toMatchObject({ id: s.id, name: s.name, en: s.en, spawns: [] });
    }
  });

  it('is shaped like a map file: KEY, MAP, H and RAMPS rows and a Scenario export', () => {
    const src = toTs(docFromScenario(ASH_WOOD));
    for (const name of ['KEY', 'MAP', 'H', 'RAMPS']) expect(src).toContain(`const ${name}`);
    expect(src).toMatch(/export const ASH_WOOD: Scenario = /);
    expect(src).toContain('spawns: [],');
    expect(src).not.toContain('RISE');
    expect(src).not.toContain('_LIFE');
  });

  it('takes more than 52 kinds with two-letter codes', () => {
    for (const kinds of [52, 53, 100]) {
      const doc = motley(kinds);
      const src = toTs(doc);
      expect(src.match(/const MAP = \[\n {2}'([^']*)'/)?.[1].length).toBe(kinds > 52 ? 20 : 10);
      expect(scenarioOf(src).grid.tiles).toEqual(doc.tiles);
    }
  });

  it('keeps a ramp that rises 2 levels', () => {
    let doc = setHeight(blankDoc(4, 4), { x: 1, y: 0 }, 2);
    doc = cycleRamp(doc, { x: 0, y: 0 });
    expect(doc.tiles[0].ramp).toEqual([1, 2]);
    const src = toTs(doc);
    expect(src).toContain('const RISE');
    expect(scenarioOf(src).grid.tiles).toEqual(doc.tiles);
  });

  it('escapes quotes in names', () => {
    const doc = { ...blankDoc(4, 4), name: "Rook's \\ keep", en: "Rook's keep" };
    expect(scenarioOf(toTs(doc))).toMatchObject({ name: "Rook's \\ keep", en: "Rook's keep" });
  });
});

describe('battle export', () => {
  it('the .ts carries the spawns with their facing', () => {
    for (const s of [ASH_WOOD, CRYPT_HEART]) {
      const b = battleFromScenario(s);
      const back = scenarioOf(battleToTs(b));
      expect(back.grid.tiles).toEqual(s.grid.tiles);
      expect(back.spawns.map(({ facing, ...sp }) => sp)).toEqual(s.spawns);
      expect(back.spawns.map((sp) => sp.facing)).toEqual(b.units.map((u) => u.facing));
    }
  });

  it('the .ts exports the own sheets beside the scenario', () => {
    let b = placeUnit(blankBattle(blankDoc(4, 4)), { x: 1, y: 1 }, 'warrior', 'hero');
    b = setLife(b, { x: 1, y: 1 }, 77);
    expect(Object.values(loadTs(battleToTs(b)))).toContainEqual({ [b.units[0].id]: { hp: 77 } });
  });

  it('the .ts carries the whole battle: sheets, starting CT, bags, sides and the objective', () => {
    let b = placeUnit(blankBattle(blankDoc(6, 6)), { x: 1, y: 1 }, 'warrior', 'hero');
    b = placeUnit(b, { x: 4, y: 4 }, 'rat', 'enemy');
    b = setSheet(b, { x: 1, y: 1 }, { name: 'Bran', speed: 9, items: { head: 'hood' }, abilities: ['strike'], ct: 40 });
    b = {
      ...b,
      bags: { hero: { life_potion: 2 } },
      control: { enemy: 'player' },
      objective: { kind: 'survive', turns: 5 },
    };
    const src = battleToTs(b);
    expect(src).toContain("import { surviveFor } from '../../shared/battle/outcome.ts';");
    const back = scenarioOf(src);
    expect(back.spawns[0].ct).toBe(40);
    expect(back.bags).toEqual({ hero: { life_potion: 2 } });
    expect(back.control).toEqual({ enemy: 'player' });
    expect(back.rules?.outcome?.({ ...stateOfOutcome(), turnsPlayed: 5 } as never)).toBe('victory');
    expect(Object.values(loadTs(src))).toContainEqual({
      h0: { name: 'Bran', speed: 9, items: { head: 'hood' }, abilities: ['strike'] },
    });
    expect(battleToTs({ ...b, objective: { kind: 'defeat_all' } })).toContain('rules: { outcome: lastStanding }');
  });

  it('the JSON reads back through parseBattleDoc identical', () => {
    const b = battleFromScenario(ASH_WOOD);
    expect(parseBattleDoc(JSON.parse(toJson(b)))).toEqual(b);
  });
});

describe('parseMapDoc (browser saves and pasted JSON)', () => {
  const good = () => JSON.parse(toJson(blankDoc(4, 4)));
  const broken: [string, (v: ReturnType<typeof good>) => void][] = [
    ['size below 4', (v) => (v.width = 3)],
    ['tile count off', (v) => v.tiles.pop()],
    ['unknown terrain', (v) => (v.tiles[0].terrain = 'lava')],
    ['height above 9', (v) => (v.tiles[0].h = 10)],
    ['fractional height', (v) => (v.tiles[0].h = 1.5)],
    ['ramp direction 4', (v) => (v.tiles[0].ramp = [4, 1])],
    ['ramp rise 0', (v) => (v.tiles[0].ramp = [1, 0])],
    ['depth as text', (v) => (v.tiles[0].depth = '2')],
    ['look with markup', (v) => (v.tiles[0].look = '<img>')],
    ['id with a space', (v) => (v.id = 'a b')],
    ['empty name', (v) => (v.name = '  ')],
    ['no English name', (v) => delete v.en],
    ['line break in the name', (v) => (v.name = 'a\nb')],
    ['line break in the English name', (v) => (v.en = 'a\nb')],
  ];
  for (const [what, spoil] of broken)
    it(`returns null on ${what}`, () => {
      const v = good();
      spoil(v);
      expect(parseMapDoc(v)).toBeNull();
    });

  it('returns null on anything that is not an object', () => {
    for (const v of [null, undefined, 3, 'map', [], { tiles: 'x' }]) expect(parseMapDoc(v)).toBeNull();
  });

  it('drops unknown fields, units included, instead of carrying them', () => {
    const v = good();
    v.extra = 1;
    v.units = [];
    v.tiles[0].tree = 3;
    const doc = parseMapDoc(v)!;
    expect(doc).not.toHaveProperty('extra');
    expect(doc).not.toHaveProperty('units');
    expect(doc.tiles[0]).not.toHaveProperty('tree');
  });
});

describe('parseBattleDoc', () => {
  const good = () => JSON.parse(toJson(placeUnit(blankBattle(blankDoc(4, 4)), { x: 1, y: 1 }, 'warrior', 'hero')));
  const broken: [string, (v: ReturnType<typeof good>) => void][] = [
    ['a broken map', (v) => (v.map.width = 3)],
    ['no units list', (v) => delete v.units],
    ['unknown class', (v) => (v.units[0].def = 'dragon')],
    ['half-tile token', (v) => (v.units[0].def = 'warrior½')],
    ['class from the prototype', (v) => (v.units[0].def = 'toString')],
    ['unknown team', (v) => (v.units[0].team = 'neutral')],
    ['unit off the map', (v) => (v.units[0].x = 4)],
    ['facing 5', (v) => (v.units[0].facing = 5)],
    ['life 0', (v) => (v.units[0].hp = 0)],
    ['two units with one id', (v) => v.units.push({ ...v.units[0], x: 2 })],
    ['two units on one tile', (v) => v.units.push({ ...v.units[0], id: 'h9' })],
    [
      'a unit inside a big one',
      (v) => v.units.push({ ...v.units[0], id: 'e9', def: 'colossus', team: 'enemy', x: 0, y: 0 }),
    ],
  ];
  for (const [what, spoil] of broken)
    it(`returns null on ${what}`, () => {
      const v = good();
      spoil(v);
      expect(parseBattleDoc(v)).toBeNull();
    });

  it('drops unknown unit fields', () => {
    const v = good();
    v.units[0].evil = true;
    expect(parseBattleDoc(v)!.units[0]).not.toHaveProperty('evil');
  });
});
