import { describe, expect, it } from 'vitest';
import { ASH_WOOD } from '../src/content/maps/ash-wood.ts';
import { faceNearest } from '../src/shared/battle/grid.ts';
import { HALF, halve } from '../src/shared/battle/half.ts';
import { initialState, MAPS, SCENARIOS, type Scenario } from '../src/shared/battle/scenarios.ts';
import { UNIT_DEFS } from '../src/shared/battle/units.ts';
import { generateRoom } from '../src/shared/crawl/generate.ts';
import { battleFromScenario, spawnsOf } from '../src/shared/mapedit/battle.ts';
import { blankDoc, docFromScenario, unsplit } from '../src/shared/mapedit/doc.ts';
import { battleToScenario, docToScenario, PLAY_PREFIX } from '../src/shared/mapedit/play.ts';

// The map builder edits whole tiles while every battle runs split in half tiles (half.ts); these check both ways back
const spawnsAt = (s: Scenario) => s.spawns.map(({ def, team, x, y }) => ({ def, team, x, y }));
const unitsAt = (s: Scenario, classOf?: (def: string) => string | undefined) =>
  battleFromScenario(s, classOf).units.map(({ def, team, x, y }) => ({ def, team, x, y }));

describe('map document from a battle (terrain only)', () => {
  it('reads a game map as it is written, both names, no units', () => {
    const doc = docFromScenario(ASH_WOOD);
    expect(doc).toEqual({
      id: 'ash_wood',
      name: ASH_WOOD.name,
      en: ASH_WOOD.en,
      width: 12,
      height: 12,
      tiles: ASH_WOOD.grid.tiles,
    });
  });

  it('reads the whole-tile source of a live half-tile battle', () => {
    const live = halve(ASH_WOOD);
    expect(live.id).toBe(`ash_wood${HALF}`);
    const doc = docFromScenario(live);
    expect(doc.id).toBe('ash_wood');
    expect(doc.tiles).toEqual(ASH_WOOD.grid.tiles);
  });

  it('un-splits a half grid back to the whole one, ramps included', () => {
    for (const base of [ASH_WOOD, generateRoom(7)]) {
      const half = halve({ ...base, id: 'probe_unsplit' });
      expect(unsplit(half.grid)).toEqual(base.grid);
    }
  });

  it('reads every game map without a height outside 0 to 9', () => {
    for (const m of MAPS) expect(docFromScenario(m).tiles.every((t) => t.h >= 0 && t.h <= 9)).toBe(true);
  });
});

describe('battle document from a battle', () => {
  it('keeps the map and the spawns of a game map', () => {
    const b = battleFromScenario(ASH_WOOD);
    expect(b.map).toEqual(docFromScenario(ASH_WOOD));
    expect(unitsAt(ASH_WOOD)).toEqual(spawnsAt(ASH_WOOD));
    expect(b.units.map((u) => u.id)).toEqual(ASH_WOOD.spawns.map((s) => s.id));
  });

  it('reads the spawns of a live half-tile battle at whole positions', () => {
    expect(unitsAt(halve(ASH_WOOD))).toEqual(spawnsAt(ASH_WOOD));
  });

  it('round-trips a generated crawl room with no whole source registered, spawns included', () => {
    const room = generateRoom(12345, { depth: 2 });
    const live = halve({ ...room, id: 'probe_crawl' });
    delete SCENARIOS.probe_crawl;
    expect(docFromScenario(live).tiles).toEqual(room.grid.tiles);
    expect(unitsAt(live)).toEqual(spawnsAt(room));
  });

  it('turns a runtime sheet into its class, keeping its own life as the override', () => {
    UNIT_DEFS['probe-sheet-h0'] = { ...UNIT_DEFS.warrior, id: 'probe-sheet-h0', hp: UNIT_DEFS.warrior.hp + 7 };
    const cast: Scenario = {
      ...ASH_WOOD,
      id: 'probe_cast',
      spawns: [{ id: 'h0', def: 'probe-sheet-h0', team: 'hero', x: 3, y: 11 }],
    };
    const classOf = (def: string) => (def === 'probe-sheet-h0' ? 'warrior' : undefined);
    expect(battleFromScenario(cast, classOf).units[0]).toMatchObject({ def: 'warrior', hp: UNIT_DEFS.warrior.hp + 7 });
    delete UNIT_DEFS['probe-sheet-h0'];
  });

  it('gives every unit a facing toward the nearest foe, as the battle would', () => {
    const h = ASH_WOOD.spawns[0];
    const foes = ASH_WOOD.spawns.filter((s) => s.team !== h.team);
    expect(battleFromScenario(ASH_WOOD).units[0].facing).toBe(faceNearest(h, foes));
  });
});

describe('blank map', () => {
  it('is grass at height 0, the English name a copy of the Portuguese', () => {
    const doc = blankDoc(6, 4, 'probe', 'Arena');
    expect(doc.tiles).toHaveLength(24);
    expect(doc.tiles.every((t) => t.terrain === 'floor' && t.look === 'grass' && t.h === 0)).toBe(true);
    expect(doc).toMatchObject({ name: 'Arena', en: 'Arena' });
    expect(doc).not.toHaveProperty('units');
  });

  it('clamps the size to 4..24 tiles', () => {
    expect(blankDoc(1, 99)).toMatchObject({ width: 4, height: 24 });
  });
});

describe('playing a map', () => {
  it('builds a scenario under its own id with no units, which halves like the game', () => {
    const scenario = docToScenario(docFromScenario(ASH_WOOD));
    expect(scenario.id).toBe(`${PLAY_PREFIX}ash_wood`);
    expect(SCENARIOS[scenario.id]).toBe(scenario);
    expect(scenario).toMatchObject({ name: ASH_WOOD.name, en: ASH_WOOD.en, spawns: [] });
    expect(scenario.grid.tiles).toEqual(ASH_WOOD.grid.tiles);
    expect(halve(scenario).grid.sub).toBe(2);
  });

  it('takes the spawns the client passes (the one default hero)', () => {
    const hero = { id: 'h0', def: 'warrior', team: 'hero' as const, x: 0, y: 11, facing: 2 };
    const half = halve(docToScenario(docFromScenario(ASH_WOOD), [hero]));
    expect(half.spawns[0]).toMatchObject({ x: 0, y: 22 });
    expect(initialState(half, 1).units[0].facing).toBe(2);
  });

  it('reads a played map back under its own id', () => {
    const doc = docFromScenario(ASH_WOOD);
    expect(docFromScenario(halve(docToScenario(doc)))).toEqual(doc);
  });
});

describe('playing a battle document', () => {
  it('keeps the chosen facing through halve and initialState', () => {
    const b = battleFromScenario(ASH_WOOD);
    const turned = { ...b, units: b.units.map((u, i) => (i === 0 ? { ...u, facing: 2 } : u)) };
    const { scenario } = battleToScenario(turned);
    expect(scenario.spawns).toEqual(spawnsOf(turned));
    expect(initialState(halve(scenario), 1).units[0].facing).toBe(2);
  });

  it('returns the life overrides by spawn id; reading the battle back does not carry them', () => {
    const b = battleFromScenario(ASH_WOOD);
    const withLife = { ...b, units: b.units.map((u, i) => (i === 1 ? { ...u, hp: 33 } : u)) };
    const { scenario, life } = battleToScenario(withLife);
    expect(life).toEqual({ [b.units[1].id]: 33 });
    expect(battleFromScenario(halve(scenario))).toEqual(b);
  });
});

describe('spawn facing in the engine', () => {
  it('uses the spawn facing when given, else the nearest foe', () => {
    const sc: Scenario = {
      ...ASH_WOOD,
      id: 'probe_facing',
      spawns: ASH_WOOD.spawns.map((s, i) => (i === 0 ? { ...s, facing: 3 } : s)),
    };
    const st = initialState(sc, 1);
    expect(st.units[0].facing).toBe(3);
    expect(st.units[1].facing).toBe(initialState(ASH_WOOD, 1).units[1].facing);
  });
});
