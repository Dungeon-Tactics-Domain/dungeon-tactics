import { describe, expect, it } from 'vitest';
import battleClean from '../scripts/sandbox/battle-clean.json';
import battleMove from '../scripts/sandbox/battle-move.json';
import battleUi from '../scripts/sandbox/battle-ui.json';
import benchArcher from '../scripts/sandbox/bench/archer-shot.json';
import benchGap from '../scripts/sandbox/bench/arena-gap.json';
import benchSpikes from '../scripts/sandbox/bench/arena-spikes.json';
import benchStairs from '../scripts/sandbox/bench/arena-stairs.json';
import benchWall from '../scripts/sandbox/bench/arena-wall.json';
import benchClimb from '../scripts/sandbox/bench/climb.json';
import benchDeath from '../scripts/sandbox/bench/death.json';
import benchDrop from '../scripts/sandbox/bench/drop.json';
import benchFirebolt from '../scripts/sandbox/bench/firebolt.json';
import benchHeavy from '../scripts/sandbox/bench/heavy-strike.json';
import benchMeleeHit from '../scripts/sandbox/bench/melee-hit.json';
import benchMeleeMiss from '../scripts/sandbox/bench/melee-miss.json';
import benchBash from '../scripts/sandbox/bench/shield-bash-fall.json';
import benchWalk from '../scripts/sandbox/bench/walk.json';
import archerShot from '../scripts/sandbox/clips/archer-shot.json';
import blastCharge from '../scripts/sandbox/clips/blast-charge.json';
import climbDescend from '../scripts/sandbox/clips/climb-descend.json';
import death from '../scripts/sandbox/clips/death.json';
import firebolt from '../scripts/sandbox/clips/firebolt.json';
import heavyHit from '../scripts/sandbox/clips/heavy-hit.json';
import leapGap from '../scripts/sandbox/clips/leap-gap.json';
import meleeHit from '../scripts/sandbox/clips/melee-hit.json';
import meleeMiss from '../scripts/sandbox/clips/melee-miss.json';
import shieldBashFall from '../scripts/sandbox/clips/shield-bash-fall.json';
import walkFlat from '../scripts/sandbox/clips/walk-flat.json';
import frostPass from '../scripts/sandbox/frost-pass-ambush.json';
import { ARENA } from '../src/client/dev/arena.ts';
import {
  castOf,
  giveTurn,
  inCells,
  offMap,
  parseSpec,
  patchUnits,
  placementProblems,
  playStep,
  readParam,
  rewind,
  sideAngle,
  specParam,
  specUrl,
  storageFor,
} from '../src/client/dev/sandbox-spec.ts';
import { Battle } from '../src/shared/battle/battle.ts';
import { tileAt } from '../src/shared/battle/grid.ts';
import { halfDef, halve } from '../src/shared/battle/half.ts';
import { SCENARIOS } from '../src/shared/battle/scenarios.ts';
import type { BattleEvent } from '../src/shared/battle/types.ts';
import { UNIT_DEFS } from '../src/shared/battle/units.ts';
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
      crawl: { seed: 1 },
      path: '/?home',
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
      'use only one of scenario, crawl and path (got crawl, path)',
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

  it('places a unit between tiles only on a split map', () => {
    // Nov 15: to stage a token that a push leaves between tiles, as the AI and a push do in play
    const spec = { units: { 'h-archer': { x: 4.5, y: 7 } } };
    expect(parseSpec(spec).problems).toEqual([]);
    expect(parseSpec({ units: { a: { x: 4.25, y: 7 } } }).problems).toEqual([
      'units.a: x and y must be whole or x.5, ≥ 0',
    ]);
    expect(offMap(halve(SCENARIOS.ash_wood).grid, spec)).toEqual([]);
    expect(offMap(SCENARIOS.ash_wood.grid, spec)).toEqual([
      'units.h-archer: 4.5,7 is between tiles, and this map has no half tiles',
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

  it('opens a crawl room by its seed and options, and refuses an unknown theme', () => {
    expect(specUrl({ crawl: { seed: 12, depth: 2, boss: true, theme: 'forest' } })).toMatch(
      /^\/\?crawl=12&depth=2&boss=1&theme=forest&sandbox=/,
    );
    expect(parseSpec({ crawl: { seed: 3 } }).problems).toEqual([]);
    expect(parseSpec({ crawl: { seed: 3, theme: 'swamp' } }).problems).toEqual([
      'crawl must be { seed, depth?, boss?, theme? } with theme among dungeon, forest, mountain',
    ]);
  });

  it('opens another page as is, with the language saved before it loads', () => {
    expect(specUrl({ path: '/?home' })).toBe('/?home');
    expect(storageFor({ path: '/?home', lang: 'pt' })).toEqual({ 'dt:lang': 'pt' });
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
const EXAMPLES = {
  'battle-ui.json': battleUi,
  'battle-clean.json': battleClean,
  'battle-move.json': battleMove,
  'frost-pass-ambush.json': frostPass,
};

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

  // the examples as `stage` builds them on the split map: the cast fits, the places are on the map and the aim reaches
  for (const [file, raw] of Object.entries(EXAMPLES))
    it(`stages ${file} where the whole map has it`, () => {
      const spec = parseSpec(raw).spec;
      const sc = halve(SCENARIOS[spec.scenario!]);
      const cells = inCells(spec, 2);
      const cast = castOf(sc.spawns, cells);
      const battle = Battle.start({ ...sc, spawns: cast.spawns }, spec.seed ?? 1);
      expect([
        ...cast.problems,
        ...placementProblems(battle.grid, battle.state.units),
        ...offMap(battle.grid, spec),
      ]).toEqual([]);
      for (const [id, u] of Object.entries(spec.units ?? {}))
        if (u.x !== undefined)
          expect(battle.state.units.find((x) => x.id === id)?.pos).toEqual({ x: 2 * u.x, y: 2 * u.y! });
      const aim = cells.screen;
      if (typeof aim === 'object') {
        battle.state.turn = { actor: spec.actor!, moved: false, usedAbility: null };
        expect(battle.preview(aim.aim, aim.target).ok).toBe(true);
      }
    });

  it('takes a cursor between tiles only on a split map', () => {
    expect(parseSpec({ cursor: { x: 2.5, y: 3 } }).problems).toEqual([]);
    expect(parseSpec({ cursor: { x: 2.25, y: 3 } }).problems).toEqual(['cursor must be { x, y } (whole or x.5)']);
    expect(offMap(split(4, 4), { cursor: { x: 2.5, y: 3 } })).toEqual([]);
    expect(offMap(flat(4, 4), { cursor: { x: 2.5, y: 3 } })).toEqual([
      'cursor: 2.5,3 is between tiles, and this map has no half tiles',
    ]);
    expect(offMap(flat(4, 4), { cursor: { x: 2.5, y: 2.5 } })).toEqual([
      'cursor: 2.5,2.5 is between tiles, and this map has no half tiles',
    ]);
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

  it('rejects a token placed between tiles that differ, where the game never stops one', () => {
    halve(SCENARIOS.ash_wood);
    const g = split(4, 4);
    for (const i of [2, 3, 10, 11]) g.tiles[i].h = 1; // the tile at 1,0 a level up
    const unit = (id: string, x: number) => stateOf([{ id, def: 'soldier½', team: 'enemy', x, y: 0 }]).units[0];
    expect(placementProblems(g, [unit('a', 1)])).toEqual(['a: 0.5,0 is not on even ground']);
    expect(placementProblems(g, [unit('b', 4)])).toEqual([]);
  });
});

describe('steps', () => {
  it('accepts move, act and wait steps', () => {
    const steps = [
      { move: { unit: 'h-rogue', to: { x: 1, y: 2 } } },
      { act: { unit: 'h-rogue', ability: 'stab', target: { x: 1, y: 1 } } },
      { wait: { unit: 'h-rogue', facing: 2 } },
      { wait: { unit: 'h-rogue' } },
    ];
    expect(parseSpec({ steps }).problems).toEqual([]);
  });

  it('names every malformed step', () => {
    expect(
      parseSpec({
        steps: [
          { walk: { unit: 'a' } },
          { move: { unit: 'a', to: { x: 1, y: 2 } }, wait: { unit: 'a' } },
          { move: { to: { x: -1, y: 0 }, speed: 2 } },
          { act: { unit: 'a', ability: 'fireball', target: 3 } },
          { wait: { unit: 'a', facing: 4 } },
          { wait: 'a' },
        ],
      }).problems,
    ).toEqual([
      'steps[0] must be one of { move }, { act }, { wait } or { pause }',
      'steps[1] must be one of { move }, { act }, { wait } or { pause }',
      'steps[2].move: unknown key "speed"',
      'steps[2].move.unit must be a unit id',
      'steps[2].move.to must be { x, y }',
      'steps[3].act: unknown ability "fireball"',
      'steps[3].act.target must be { x, y }',
      'steps[4].wait.facing must be 0-3',
      'steps[5].wait must be an object',
    ]);
    expect(parseSpec({ steps: {} }).problems).toEqual(['steps must be a list']);
  });

  it('names the step tiles outside the map', () => {
    const steps = [
      { move: { unit: 'a', to: { x: 5, y: 0 } } },
      { act: { unit: 'a', ability: 'shot', target: { x: 0, y: 9 } } },
    ];
    expect(offMap(flat(4, 4), { steps })).toEqual([
      'steps[0].move.to: 5,0 is outside the 4x4 map',
      'steps[1].act.target: 0,9 is outside the 4x4 map',
    ]);
  });
});

describe('playStep', () => {
  // Ash Wood as it loads: the warrior on 3,11 and the archer on 5,10; the soldier on 2,0, across the river
  const start = () => Battle.start(SCENARIOS.ash_wood, 1);

  it('walks the unit there, giving it the turn first', () => {
    const b = start();
    const { events, problem } = playStep(b, { move: { unit: 'h-warrior', to: { x: 3, y: 9 } } });
    expect(problem).toBeNull();
    expect(b.actor.id).toBe('h-warrior');
    expect(b.actor.pos).toEqual({ x: 3, y: 9 });
    expect(events.at(-1)).toMatchObject({ k: 'move', unit: 'h-warrior' });
  });

  it('acts, then refuses a second act in the same turn', () => {
    const b = start();
    b.state.units.find((u) => u.id === 'e-soldier')!.pos = { x: 5, y: 6 };
    const shot = { act: { unit: 'h-archer', ability: 'shot', target: { x: 5, y: 6 } } };
    expect(playStep(b, shot).events[0]).toMatchObject({ k: 'attack', unit: 'h-archer', ability: 'shot' });
    expect(playStep(b, shot)).toEqual({ events: [], problem: 'h-archer already acted this turn' });
  });

  it('says why a step cannot be played instead of doing nothing', () => {
    const b = start();
    expect(playStep(b, { move: { unit: 'h-warrior', to: { x: 3, y: 0 } } }).problem).toBe('h-warrior cannot reach 3,0');
    expect(playStep(b, { act: { unit: 'h-warrior', ability: 'shot', target: { x: 3, y: 9 } } }).problem).toBe(
      'h-warrior cannot use shot on 3,9: not one of its abilities',
    );
    expect(playStep(b, { act: { unit: 'h-archer', ability: 'shot', target: { x: 2, y: 0 } } }).problem).toBe(
      'h-archer cannot use shot on 2,0: out of range',
    );
    expect(playStep(b, { wait: { unit: 'ghost' } }).problem).toBe('"ghost" is not a unit that plays on this map');
    b.state.outcome = 'victory';
    expect(playStep(b, { wait: { unit: 'h-mage' } })).toEqual({ events: [], problem: 'the battle is already over' });
  });

  it('passes the turn on when the mover falls to a counter-attack', () => {
    const b = start();
    b.state.units.find((u) => u.id === 'e-soldier')!.pos = { x: 3, y: 10 };
    b.state.units.find((u) => u.id === 'h-warrior')!.hp = 1;
    playStep(b, { act: { unit: 'h-warrior', ability: 'strike', target: { x: 3, y: 10 } } });
    const { events, problem } = playStep(b, { move: { unit: 'h-warrior', to: { x: 5, y: 11 } } });
    expect(problem).toBeNull();
    expect(events).toContainEqual(expect.objectContaining({ k: 'die', unit: 'h-warrior' }));
    // the turn screen reads the actor right after: it must be a living unit
    expect(b.state.units.some((u) => u.id === b.state.turn.actor)).toBe(true);
    expect(() => b.reach()).not.toThrow();
  });

  it('plays a shot with no clear line, stopping at the first unit on its path', () => {
    const b = start();
    b.state.units.find((u) => u.id === 'e-soldier')!.pos = { x: 5, y: 6 };
    b.state.units.find((u) => u.id === 'h-warrior')!.pos = { x: 5, y: 8 };
    const { events, problem } = playStep(b, { act: { unit: 'h-archer', ability: 'shot', target: { x: 5, y: 6 } } });
    expect(problem).toBeNull();
    expect(events.find((e) => e.k === 'hit' || e.k === 'miss')).toMatchObject({ unit: 'h-warrior' });
  });

  it('wait turns the unit and passes the turn on', () => {
    const b = start();
    playStep(b, { wait: { unit: 'h-mage', facing: 3 } });
    expect(b.state.units.find((u) => u.id === 'h-mage')!.facing).toBe(3);
    expect(b.actor.id).not.toBe('h-mage');
  });

  it('gives the scene its actor only among heroes that play', () => {
    const b = start();
    expect(giveTurn(b, 'e-brute', true)).toBe('"e-brute" is not a hero that plays on this map');
    expect(giveTurn(b, 'e-brute')).toBeNull();
    expect(b.actor.id).toBe('e-brute');
  });
});

// steps are whole tiles like the rest of the spec, played on the split map every game battle runs on (half.ts)
describe('playStep on a split map', () => {
  const start = () => Battle.start(halve(SCENARIOS.ash_wood), 1);
  const at = (b: Battle, id: string) => b.state.units.find((u) => u.id === id)!;

  it('walks to the corner cell of the whole tile', () => {
    const b = start();
    expect(playStep(b, { move: { unit: 'h-warrior', to: { x: 3, y: 9 } } }).problem).toBeNull();
    expect(at(b, 'h-warrior').pos).toEqual({ x: 6, y: 18 });
  });

  it('aims at the whole tile', () => {
    const b = start();
    at(b, 'e-soldier').pos = { x: 10, y: 12 };
    const { events, problem } = playStep(b, { act: { unit: 'h-archer', ability: 'shot', target: { x: 5, y: 6 } } });
    expect(problem).toBeNull();
    expect(events.find((e) => e.k === 'hit' || e.k === 'miss')).toMatchObject({ unit: 'e-soldier' });
  });

  it('names the tiles it refuses in whole tiles', () => {
    const b = start();
    expect(playStep(b, { move: { unit: 'h-warrior', to: { x: 3, y: 0 } } }).problem).toBe('h-warrior cannot reach 3,0');
    expect(playStep(b, { act: { unit: 'h-archer', ability: 'shot', target: { x: 2, y: 0 } } }).problem).toBe(
      'h-archer cannot use shot on 2,0: out of range',
    );
    expect(offMap(b.grid, { steps: [{ move: { unit: 'h-warrior', to: { x: 14, y: 0 } } }] })).toEqual([
      'steps[0].move.to: 14,0 is outside the 12x12 map',
    ]);
  });
});

// The clip specs were picked on whole-tile movement (Nov 14); staged and played the way the page does on the split map
// (stage: halve, inCells, castOf; apply: patchUnits, actor; play: playStep), each must still show its named mechanic.
// Tiles in whole tiles (x.5 is a token between tiles), heights of the tile walked on
const CLIPS = {
  'walk-flat': [['move h-warrior 3,7 h0 > 3.5,7 h0 > 4,7 h0 > 4.5,7 h0 > 5,7 h0 > 5.5,7 h0 > 6,7 h0'], walkFlat],
  // up 1 then down 2, without going round the drop
  'climb-descend': [['move h-rogue 1,11 h1 > 1.5,11 h1 > 2,11 h2 > 2.5,11 h2 > 3,11 h0'], climbDescend],
  // one leap over the moat
  'leap-gap': [['move h-rogue 5,4 h2 > 5,2 h2'], leapGap],
  'melee-hit': [['attack h-warrior strike', 'hit e-brute 50'], meleeHit],
  'melee-miss': [['attack h-warrior strike', 'miss e-brute'], meleeMiss],
  'heavy-hit': [['attack h-warrior heavy_strike', 'hit e-soldier 95'], heavyHit],
  'archer-shot': [['attack h-archer shot', 'hit e-soldier 45'], archerShot],
  'shield-bash-fall': [
    [
      'attack h-warrior shield_bash',
      'hit e-soldier 20',
      'push e-soldier 11,1.5',
      'push e-soldier 11,2',
      'fall e-soldier 2 45',
      'push e-soldier 11,2.5',
      'push e-soldier 11,3',
    ],
    shieldBashFall,
  ],
  death: [['attack h-archer shot', 'hit e-soldier 45', 'die e-soldier'], death],
  firebolt: [['attack h-mage firebolt', 'hit e-soldier 50'], firebolt],
  // the charge on the act, the blast on the wait, before anyone else's turn
  'blast-charge': [
    ['charge h-mage blast', '|', 'attack h-mage blast', 'hit e-soldier 45', 'hit e-brute 70'],
    blastCharge,
  ],
} as const;

// A spec staged as the page does on the split map (stage: halve, inCells, castOf; apply: patchUnits without the removed
// units, actor; play: playStep), its steps told in whole tiles with the height walked on; '|' between steps, so a charge
// shows on the act and its blast on the wait
function staged(raw: unknown) {
  const spec = parseSpec(raw).spec;
  SCENARIOS.arena = ARENA; // as the page registers it
  const sc = halve(SCENARIOS[spec.scenario!]);
  const cells = inCells(spec, 2);
  cells.add = cells.add?.map((a) => ({ ...a, def: halfDef(a.def) }));
  const cast = castOf(sc.spawns, cells);
  const b = Battle.start({ ...sc, spawns: cast.spawns }, spec.seed ?? 1);
  const kept = Object.entries(cells.units ?? {}).filter(([, u]) => !u.remove);
  const units = patchUnits(b.state.units, Object.fromEntries(kept));
  b.state.units = units.units;
  const p = [...cast.problems, ...units.problems, ...placementProblems(b.grid, b.state.units)];
  const turn = giveTurn(b, spec.actor ?? b.state.units.find((u) => u.team === 'hero')!.id, true);
  if (turn) p.push(turn);
  const w = (q: { x: number; y: number }) => `${q.x / 2},${q.y / 2}`;
  const said = (e: BattleEvent) =>
    e.k === 'move'
      ? `move ${e.unit} ${e.path.map((q) => `${w(q)} h${tileAt(b.grid, q).h}`).join(' > ')}`
      : e.k === 'attack' || e.k === 'charge'
        ? `${e.k} ${e.unit} ${e.ability}`
        : e.k === 'hit'
          ? `hit ${e.unit} ${e.dmg}`
          : e.k === 'push'
            ? `push ${e.unit} ${w(e.to)}`
            : e.k === 'fall'
              ? `fall ${e.unit} ${e.levels} ${e.dmg}`
              : `${e.k} ${e.unit}`;
  const play = () =>
    spec.steps!.flatMap((step, i) => {
      const r = playStep(b, step);
      if (r.problem) p.push(r.problem);
      return [...(i ? ['|'] : []), ...r.events.map(said)];
    });
  return { b, p, play };
}

describe('clip specs on a split map', () => {
  for (const [name, [want, raw]] of Object.entries(CLIPS))
    it(`plays ${name} as on whole tiles`, () => {
      const { p, play } = staged(raw);
      expect(play()).toEqual(want);
      expect(p).toEqual([]);
    });

  // the camera shakes on a strike of 25% of life or more: the heavy hit must reach it
  it('keeps the heavy hit at a quarter of the life or more', () => {
    const hit = CLIPS['heavy-hit'][0][1].split(' ');
    expect(Number(hit[2]) / UNIT_DEFS.soldier.hp).toBeGreaterThanOrEqual(0.25);
  });
});

describe('bench fields', () => {
  it('accepts loop, timing, speed, a fixed camera and pause steps', () => {
    const raw = {
      loop: true,
      timing: { hitStop: 160, jumpCrouch: 380 },
      speed: 0.25,
      camera: { fixed: 'side', focus: { x: 1, y: 1 } },
      steps: [{ pause: 500 }, { wait: { unit: 'a' } }],
    };
    expect(parseSpec(raw)).toEqual({ spec: raw, problems: [] });
  });

  it('names every bad bench value', () => {
    expect(
      parseSpec({
        loop: 'yes',
        timing: { hitStp: 160, shake: 0, jumpLand: '300' },
        speed: 0,
        camera: { fixed: 'top', action: { from: 'a', to: { x: 1, y: 1 } } },
        steps: [{ pause: -1 }, { pause: 500, wait: { unit: 'a' } }],
      }).problems,
    ).toEqual([
      'camera.fixed must be "side" or "three-quarter"',
      'camera.fixed turns the action camera off: drop action',
      'steps[0].pause must be ms from 0 to 60000',
      'steps[1] must be one of { move }, { act }, { wait } or { pause }',
      'loop must be true or false',
      expect.stringContaining('timing: unknown key "hitStp" (one of enemyStart, '),
      'timing.shake must be ms above 0, up to 10000',
      'timing.jumpLand must be ms above 0, up to 10000',
      'speed must be above 0, up to 4 (pause with __sandbox.pause)',
    ]);
    expect(parseSpec({ loop: true }).problems).toEqual(['loop needs steps to play']);
  });

  it('plays a pause step as no event', () => {
    expect(playStep(Battle.start(SCENARIOS.ash_wood, 1), { pause: 300 })).toEqual({ events: [], problem: null });
  });

  it('reads the spec as JSON, base64url JSON or a spec file name', () => {
    const spec = { scenario: 'ash_wood', units: { 'h-mage': { x: 1, y: 2 } }, name: 'ação' };
    const b64 = specParam(spec);
    expect(b64).toMatch(/^[\w-]+$/);
    expect(JSON.parse((readParam(b64) as { json: string }).json)).toEqual(spec);
    expect(readParam('{"seed":2}')).toEqual({ json: '{"seed":2}' });
    expect(readParam('bench/walk.json')).toEqual({ file: '/scripts/sandbox/bench/walk.json' });
    expect(() => readParam('not base64!')).toThrow();
  });

  it('looks across the first line for a side view', () => {
    expect(sideAngle({ x: 2, y: 6 }, { x: 5, y: 6 })).toBe(7);
    expect(sideAngle({ x: 9, y: 3 }, { x: 9, y: 1 })).toBe(1);
  });

  it('rewinds the battle to where it started, so a loop plays the same round again', () => {
    const { b, p, play } = staged(death);
    const start = structuredClone(b.state);
    const first = play();
    expect(b.state.units.some((u) => u.id === 'e-soldier')).toBe(false);
    rewind(b, start);
    expect(b.state).toEqual(start);
    expect(b.canUndo).toBe(false);
    expect(play()).toEqual(first);
    expect(p).toEqual([]);
  });
});

describe('arena', () => {
  it('keeps the steps out of reach for a unit that jumps less', () => {
    const { b } = staged({ scenario: 'arena', add: [{ id: 'w', def: 'warrior', team: 'hero', x: 3, y: 0 }] });
    // the warrior jumps 1: the step up 2 is too high
    expect(playStep(b, { move: { unit: 'w', to: { x: 4, y: 0 } } }).problem).toBe('w cannot reach 4,0');
  });
});

// The bench scenes of the Mechanics lab (scripts/sandbox/bench/), on the rules: Ash Wood in whole tiles (x column, y row of
// WOOD_H) and the arena (src/client/dev/arena.ts). Ash Wood's 2,6-4,6 and the climb's 9,3 and 9,2 are ramp tiles
const BENCH = {
  walk: [['move h-warrior 2,6 h0 > 2.5,6 h0 > 3,6 h0 > 3.5,6 h0 > 4,6 h0 > 4.5,6 h0 > 5,6 h0'], benchWalk],
  climb: [['move h-rogue 9,3 h1 > 9,2.5 h2 > 9,2 h2 > 9,1.5 h3 > 9,1 h3'], benchClimb],
  drop: [['move h-rogue 11,1 h4 > 11,1.5 h4 > 11,2 h2 > 11,2.5 h2 > 11,3 h2'], benchDrop],
  'melee-hit': [['attack h-warrior strike', 'hit e-soldier 50'], benchMeleeHit],
  'melee-miss': [['attack h-warrior strike', 'miss e-soldier'], benchMeleeMiss],
  // 95 of 225 HP: a quarter or more shakes the camera
  'heavy-strike': [['attack h-warrior heavy_strike', 'hit e-soldier 95'], benchHeavy],
  death: [['attack h-warrior strike', 'hit e-soldier 50', 'die e-soldier'], benchDeath],
  'archer-shot': [['attack h-archer shot', 'hit e-archer 45'], benchArcher],
  'shield-bash-fall': [
    [
      'attack h-warrior shield_bash',
      'hit e-soldier 20',
      'push e-soldier 11,1.5',
      'push e-soldier 11,2',
      'fall e-soldier 2 45',
      'push e-soldier 11,2.5',
      'push e-soldier 11,3',
    ],
    benchBash,
  ],
  firebolt: [['attack h-mage firebolt', 'hit e-soldier 50'], benchFirebolt],
  // up 1, up 2 (wait), up 3, down 2: only the lancer jumps 3
  'arena-stairs': [
    [
      'move lancer 0,0 h0 > 0.5,0 h0 > 1,0 h0 > 1.5,0 h0 > 2,0 h1',
      '|',
      'move lancer 2,0 h1 > 2.5,0 h1 > 3,0 h1 > 3.5,0 h1 > 4,0 h3',
      '|',
      '|',
      'move lancer 4,0 h3 > 4.5,0 h3 > 5,0 h3 > 5.5,0 h3 > 6,0 h6',
      '|',
      'move lancer 6,0 h6 > 6.5,0 h6 > 7,0 h6 > 7.5,0 h6 > 8,0 h4',
    ],
    benchStairs,
  ],
  'arena-gap': [['move rogue 4,2 h0 > 6,2 h0'], benchGap],
  'arena-wall': [['attack a-hero shield_bash', 'hit a-foe 20', 'bump a-foe'], benchWall],
  'arena-spikes': [
    [
      'attack a-hero shield_bash',
      'hit a-foe 20',
      'push a-foe 1.5,4',
      'push a-foe 2,4',
      'push a-foe 2.5,4',
      'spike a-foe',
      'push a-foe 3,4',
    ],
    benchSpikes,
  ],
} as const;

describe('bench specs', () => {
  for (const [name, [want, raw]] of Object.entries(BENCH))
    it(`plays ${name}`, () => {
      const { p, play } = staged(raw);
      expect(play()).toEqual(want);
      expect(p).toEqual([]);
    });

  it('names every bench spec after its file', () => {
    for (const [name, [, raw]] of Object.entries(BENCH)) expect(raw.name).toBe(name);
  });
});
