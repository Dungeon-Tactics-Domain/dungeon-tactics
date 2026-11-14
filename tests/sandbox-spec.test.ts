import { describe, expect, it } from 'vitest';
import frostPass from '../scripts/sandbox/frost-pass-ambush.json';
import {
  castOf,
  inCells,
  offMap,
  parseSpec,
  patchUnits,
  placementProblems,
  specUrl,
  storageFor,
} from '../src/client/dev/sandbox-spec.ts';
import { halve } from '../src/shared/battle/half.ts';
import { SCENARIOS } from '../src/shared/battle/scenarios.ts';
import { flat, gridOf, stateOf } from './battle-helpers.ts';

describe('parseSpec', () => {
  it('accepts a full spec as given', () => {
    const raw = {
      name: 'shot-1',
      scenario: 'ash_wood',
      seed: 3,
      lang: 'en',
      viewport: { width: 1280, height: 720 },
      format: 'webp',
      units: { 'h-archer': { x: 5, y: 7, facing: 2, hp: 10, ct: 40 }, 'e-brute': { remove: true } },
      add: [{ id: 'x1', def: 'minion', team: 'enemy', x: 1, y: 1 }],
      actor: 'h-archer',
      screen: { aim: 'shot', target: { x: 5, y: 3 }, confirm: true },
      cursor: { x: 5, y: 3 },
      camera: { angle: 7, zoom: 1.5, focus: { x: 5, y: 5 }, action: { from: 'h-archer', to: { x: 5, y: 3 } } },
      hide: ['queue', 'marks'],
      pixel: 3,
      daylight: 0.5,
    };
    expect(parseSpec(raw)).toEqual({ spec: raw, problems: [] });
  });

  it('names every problem instead of falling back to a default', () => {
    const { spec, problems } = parseSpec({
      scenari: 'ash_wood',
      stage: 1,
      path: '/?world',
      units: { a: { x: 1 }, b: { facing: 4, hp: 0 } },
      add: [{ id: 'z', def: 'dragon', team: 'hero', x: 0, y: 0 }],
      screen: 'attack',
      camera: { angle: 8, zoom: 0, spin: true },
      hide: ['everything'],
      pixel: 5,
      daylight: 2,
    });
    expect(spec).toEqual({});
    expect(problems).toEqual([
      'unknown key "scenari"',
      'use only one of scenario, stage and path (got stage, path)',
      'units.a: give x and y together',
      'units.b: facing must be 0-3',
      'units.b: hp must be an integer ≥ 1',
      'add[0]: unknown def "dragon"',
      'screen must be menu, abilities, move, facing or { aim, target, confirm? }',
      'camera: unknown key "spin"',
      'camera.angle must be 0-7',
      'camera.zoom must be > 0',
      expect.stringContaining('hide entries must be among'),
      'pixel must be 0, 2, 3 or 4',
      'daylight must be between 0 and 1',
    ]);
  });

  it('rejects a spec that is not an object', () => {
    expect(parseSpec([]).problems).toEqual(['spec must be an object']);
  });
});

describe('specUrl and storageFor', () => {
  it('carries the spec in the address so a reload shows the same scene', () => {
    const spec = { scenario: 'frost_pass', seed: 2 };
    const q = new URLSearchParams(specUrl(spec).slice(2));
    expect(q.get('scenario')).toBe('frost_pass');
    expect(JSON.parse(q.get('sandbox')!)).toEqual(spec);
  });

  it('opens a stage and unlocks it before the page loads', () => {
    expect(specUrl({ stage: 2 })).toMatch(/^\/\?stage=2&sandbox=/);
    expect(storageFor({ stage: 2, lang: 'pt' })).toEqual({ 'dt:campaign': '2', 'dt:lang': 'pt' });
  });

  it('opens another page as is, with a hero for the world map', () => {
    expect(specUrl({ path: '/?world' })).toBe('/?world');
    expect(storageFor({ path: '/?world' })).toHaveProperty('dt:hero');
  });
});

describe('castOf', () => {
  const spawns = SCENARIOS.ash_wood.spawns;

  it('moves, removes and adds spawns', () => {
    const { spawns: out, problems } = castOf(spawns, {
      units: { 'h-archer': { x: 5, y: 7 }, 'e-brute': { remove: true } },
      add: [{ id: 'x1', def: 'minion', team: 'enemy', x: 1, y: 1 }],
    });
    expect(problems).toEqual([]);
    expect(out.find((s) => s.id === 'h-archer')).toMatchObject({ x: 5, y: 7 });
    expect(out.some((s) => s.id === 'e-brute')).toBe(false);
    expect(out.at(-1)).toEqual({ id: 'x1', def: 'minion', team: 'enemy', x: 1, y: 1 });
  });

  it('flags an unknown unit and a repeated id', () => {
    const { problems } = castOf(spawns, {
      units: { ghost: { x: 0, y: 0 } },
      add: [{ id: 'h-mage', def: 'mage', team: 'hero', x: 0, y: 0 }],
    });
    expect(problems).toEqual(['units: no unit "ghost" on this map', 'add: id "h-mage" is already on the map']);
  });
});

describe('patchUnits', () => {
  const units = stateOf([
    { id: 'a', def: 'warrior', team: 'hero', x: 0, y: 0 },
    { id: 'b', def: 'soldier', team: 'enemy', x: 3, y: 3 },
  ]).units;

  it('changes position, facing, HP and CT of live units', () => {
    const { units: out, problems } = patchUnits(units, { b: { x: 1, y: 2, facing: 3, hp: 4, ct: 70 } });
    expect(problems).toEqual([]);
    expect(out[1]).toMatchObject({ pos: { x: 1, y: 2 }, facing: 3, hp: 4, ct: 70 });
    expect(out[0]).toBe(units[0]);
  });

  it('refuses removing on a live page (it would leave a corpse) and unknown ids', () => {
    expect(patchUnits(units, { a: { remove: true }, z: { hp: 1 } }).problems).toEqual([
      'units.a: remove only works when the scene loads',
      'units: no unit "z" on this map',
    ]);
  });
});

describe('offMap', () => {
  it('names every tile the spec points at outside the map', () => {
    const spec = {
      cursor: { x: 1, y: 1 },
      camera: { focus: { x: 9, y: 0 }, action: { from: 'a', to: { x: 0, y: 5 } } },
      screen: { aim: 'shot', target: { x: 3, y: 3 } },
    };
    expect(offMap(flat(4, 4), spec)).toEqual([
      'camera.focus: 9,0 is outside the 4x4 map',
      'camera.action.to: 0,5 is outside the 4x4 map',
    ]);
  });
});

describe('placementProblems', () => {
  const unit = (id: string, def: string, x: number, y: number) => stateOf([{ id, def, team: 'enemy', x, y }]).units[0];

  it('accepts units on free ground', () => {
    expect(placementProblems(flat(4, 4), [unit('a', 'soldier', 0, 0), unit('b', 'soldier', 1, 0)])).toEqual([]);
  });

  it('refuses walls, tiles outside the map and taken tiles', () => {
    const grid = gridOf(['.#..', '....']);
    expect(
      placementProblems(grid, [
        unit('a', 'soldier', 1, 0),
        unit('b', 'soldier', 4, 0),
        unit('c', 'soldier', 2, 1),
        unit('d', 'soldier', 2, 1),
      ]),
    ).toEqual(['a: cannot stand on 1,0 (wall)', 'b: tile 4,0 is outside the 4x2 map', 'd: tile 2,1 is taken by c']);
  });

  it('checks every tile of a large unit', () => {
    const grid = flat(3, 3);
    expect(placementProblems(grid, [unit('big', 'colossus', 2, 2)])).toEqual([
      'big: tile 3,2 is outside the 3x3 map',
      'big: tile 2,3 is outside the 3x3 map',
      'big: tile 3,3 is outside the 3x3 map',
    ]);
    expect(placementProblems(grid, [unit('big', 'colossus', 0, 0), unit('s', 'soldier', 1, 1)])).toEqual([
      's: tile 1,1 is taken by big',
    ]);
  });

  it('refuses a tile you can only pass over', () => {
    const grid = flat(2, 1);
    grid.tiles[1] = { ...grid.tiles[1], noStop: true };
    expect(placementProblems(grid, [unit('a', 'soldier', 1, 0)])).toEqual(['a: cannot stand on 1,0 (floor)']);
  });
});

// every game battle runs split since Nov 14 (half.ts) while specs stay in whole tiles (Nov 14 review)
describe('specs on a split map', () => {
  const split = (w: number, h: number) => ({ ...flat(w * 2, h * 2), sub: 2 });

  it('puts every whole tile of the spec on the corner cell of its square', () => {
    const spec = {
      units: { a: { x: 1, y: 2, hp: 3 }, b: { facing: 1 } },
      add: [{ id: 'x', def: 'minion', team: 'enemy' as const, x: 3, y: 0 }],
      screen: { aim: 'shot', target: { x: 2, y: 2 } },
      cursor: { x: 4, y: 1 },
      camera: { zoom: 2, focus: { x: 5, y: 5 }, action: { from: 'a', to: { x: 0, y: 1 } } },
    };
    expect(inCells(spec, 1)).toBe(spec);
    expect(inCells(spec, 2)).toEqual({
      units: { a: { x: 2, y: 4, hp: 3 }, b: { facing: 1 } },
      add: [{ id: 'x', def: 'minion', team: 'enemy', x: 6, y: 0 }],
      screen: { aim: 'shot', target: { x: 4, y: 4 } },
      cursor: { x: 8, y: 2 },
      camera: { zoom: 2, focus: { x: 10, y: 10 }, action: { from: 'a', to: { x: 0, y: 2 } } },
    });
  });

  it('stages the Frost Pass example where the whole map has it', () => {
    const spec = parseSpec(frostPass).spec;
    const { spawns, problems } = castOf(halve(SCENARIOS.frost_pass).spawns, inCells(spec, 2));
    expect(problems).toEqual([]);
    expect(spawns.find((s) => s.id === 'e-soldier')).toMatchObject({ x: 8, y: 20 });
  });

  it('names places off the map in whole tiles', () => {
    expect(offMap(split(4, 4), { cursor: { x: 3, y: 3 }, camera: { focus: { x: 4, y: 0 } } })).toEqual([
      'camera.focus: 4,0 is outside the 4x4 map',
    ]);
  });

  it('names a token problem once, at its whole tile', () => {
    halve(SCENARIOS.ash_wood); // registers the token sheets (soldier½)
    const unit = (id: string, x: number, y: number) => stateOf([{ id, def: 'soldier½', team: 'enemy', x, y }]).units[0];
    expect(placementProblems(split(4, 4), [unit('a', 2, 2), unit('b', 2, 2), unit('c', 6, 7)])).toEqual([
      'b: tile 1,1 is taken by a',
      'c: tile 3,4 is outside the 4x4 map',
    ]);
  });
});
