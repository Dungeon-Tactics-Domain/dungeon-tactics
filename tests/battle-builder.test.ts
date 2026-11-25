import { describe, expect, it } from 'vitest';
import { CRAWL_THEMES } from '../src/content/crawl/rooms.ts';
import { PALETTE } from '../src/content/map-palette.ts';
import { playAiTurn } from '../src/shared/battle/ai.ts';
import { Battle } from '../src/shared/battle/battle.ts';
import { halve } from '../src/shared/battle/half.ts';
import { bodyOf } from '../src/shared/battle/pathing.ts';
import { initialState, MAPS, SCENARIOS } from '../src/shared/battle/scenarios.ts';
import { simulate } from '../src/shared/battle/simulate.ts';
import { UNIT_DEFS } from '../src/shared/battle/units.ts';
import { generateRoom } from '../src/shared/crawl/generate.ts';
import { type BattleDoc, battleFromScenario, blankBattle, type MapUnit } from '../src/shared/mapedit/battle.ts';
import { blankDoc, docFromScenario, type MapDoc } from '../src/shared/mapedit/doc.ts';
import { paint } from '../src/shared/mapedit/edit.ts';
import { toJson } from '../src/shared/mapedit/export.ts';
import { canEditLive, editLive } from '../src/shared/mapedit/live.ts';
import { battleFromDevCast, type DevCast } from '../src/shared/mapedit/migrate.ts';
import { parseBattleDoc } from '../src/shared/mapedit/parse.ts';
import { battleToScenario } from '../src/shared/mapedit/play.ts';
import { placeUnit, setLife, setSheet, unitOn } from '../src/shared/mapedit/units.ts';

// The battle builder's core (grill, Nov 25): full sheets, CT, bags, objective, who plays, live edit, Developer cast
const rock = PALETTE.find((e) => e.id === 'rock')!;
const duel = (map: MapDoc = blankDoc(6, 6)): BattleDoc =>
  placeUnit(placeUnit(blankBattle(map), { x: 1, y: 1 }, 'warrior', 'hero'), { x: 4, y: 4 }, 'soldier', 'enemy');
const roundTrip = (d: BattleDoc) => parseBattleDoc(JSON.parse(toJson(d)));
const withUnit = (d: BattleDoc, i: number, patch: Partial<MapUnit>): BattleDoc => ({
  ...d,
  units: d.units.map((u, k) => (k === i ? { ...u, ...patch } : u)),
});

describe('unit sheet in the battle document', () => {
  const full: Partial<MapUnit> = {
    name: 'Bran',
    hp: 80,
    speed: 20,
    move: 6,
    jump: 3,
    items: { main: 'iron_blade' },
    abilities: ['strike', 'spin'],
    ct: 100,
  };

  it('reads a full sheet back identical', () => {
    const d = { ...withUnit(duel(), 0, full), bags: { hero: { ether: 2 } }, control: { enemy: 'player' as const } };
    expect(roundTrip(d)).toEqual(d);
  });

  const broken: [string, Partial<MapUnit> | Record<string, unknown>][] = [
    ['speed 0', { speed: 0 }],
    ['move 13', { move: 13 }],
    ['jump 7', { jump: 7 }],
    ['CT 101', { ct: 101 }],
    ['CT -1', { ct: -1 }],
    ['an empty name', { name: '  ' }],
    ['a name with a line break', { name: 'a\nb' }],
    ['no abilities', { abilities: [] }],
    ['an unknown ability', { abilities: ['nuke'] }],
    ['a repeated ability', { abilities: ['strike', 'strike'] }],
    ['an unknown slot', { items: { tail: 'iron_blade' } }],
    ['a piece in the wrong slot', { items: { head: 'iron_blade' } }],
    ['an unknown piece', { items: { main: 'excalibur' } }],
  ];
  for (const [what, patch] of broken)
    it(`refuses ${what}`, () => {
      expect(roundTrip(withUnit(duel(), 0, patch as Partial<MapUnit>))).toBeNull();
    });

  it('refuses a sheet or a CT on the Beacon, and setLife leaves it alone', () => {
    const d = placeUnit(duel(), { x: 0, y: 5 }, 'beacon', 'hero');
    expect(roundTrip(d)).not.toBeNull();
    expect(roundTrip(withUnit(d, 2, { hp: 10 }))).toBeNull();
    expect(roundTrip(withUnit(d, 2, { ct: 10 }))).toBeNull();
    expect(setLife(d, { x: 0, y: 5 }, 10)).toBe(d);
  });

  it('setSheet replaces the own fields and refuses what the save would', () => {
    const d = setSheet(duel(), { x: 1, y: 1 }, { hp: 50, ct: 40 });
    expect(unitOn(d, { x: 1, y: 1 })).toMatchObject({ hp: 50, ct: 40 });
    const again = setSheet(d, { x: 1, y: 1 }, { name: 'Vesper' });
    expect(unitOn(again, { x: 1, y: 1 })).not.toHaveProperty('hp');
    expect(setSheet(d, { x: 1, y: 1 }, { speed: 0 })).toBe(d);
    expect(setSheet(d, { x: 3, y: 3 }, { hp: 9 })).toBe(d);
  });

  it('does not take a runtime sheet as a class', () => {
    const { scenario } = battleToScenario(withUnit(duel(), 0, { hp: 9 }));
    const v = JSON.parse(toJson(duel()));
    v.units[0].def = scenario.spawns[0].def;
    expect(parseBattleDoc(v)).toBeNull();
  });
});

describe('objective, bags and sides', () => {
  it('refuses an objective it does not know, survive out of 1..99, the Beacon with none, a bad side or bag', () => {
    const d = duel();
    for (const objective of [{ kind: 'capture' }, { kind: 'survive', turns: 0 }, { kind: 'beacon' }])
      expect(roundTrip({ ...d, objective } as BattleDoc)).toBeNull();
    expect(roundTrip({ ...d, control: { hero: 'cpu' } } as unknown as BattleDoc)).toBeNull();
    expect(roundTrip({ ...d, bags: { enemy: { gold: 9 } } })).toBeNull();
    expect(roundTrip({ ...d, objective: { kind: 'survive', turns: 40 } })?.objective).toEqual({
      kind: 'survive',
      turns: 40,
    });
  });

  it('protect the Beacon needs a Beacon on the heroes side', () => {
    const d = { ...placeUnit(duel(), { x: 0, y: 5 }, 'beacon', 'hero'), objective: { kind: 'beacon' as const } };
    expect(roundTrip(d)).toEqual(d);
  });
});

describe('battleToScenario carries the whole battle', () => {
  const doc: BattleDoc = {
    ...withUnit(duel(), 0, { name: 'Bran', speed: 20, move: 6, items: { main: 'iron_blade' }, abilities: ['spin'] }),
    bags: { hero: { life_potion: 2 }, enemy: { ether: 1 } },
    control: { hero: 'ai', enemy: 'player' },
    objective: { kind: 'survive', turns: 5 },
  };
  const withCt = withUnit(doc, 1, { ct: 100 });

  it('builds the own sheet on top of the class, with its equipment', () => {
    const { scenario, classes } = battleToScenario(doc);
    const def = UNIT_DEFS[scenario.spawns[0].def];
    expect(classes[def.id]).toBe('warrior');
    expect(def).toMatchObject({ name: 'Bran', en: 'Bran', speed: 20, move: 6, abilities: ['spin'] });
    expect(def.physPower).toBe((UNIT_DEFS.warrior.physPower ?? 0) + 20);
    expect(def.hp).toBe(UNIT_DEFS.warrior.hp);
  });

  it('starts with the CT, the bags and the sides, and the halved battle keeps them', () => {
    const half = halve(battleToScenario(withCt).scenario);
    const st = initialState(half, 1);
    expect(st.units.map((u) => u.ct)).toEqual([0, 100]);
    expect(st).toMatchObject({ bag: { life_potion: 2 }, enemyBag: { ether: 1 } });
    expect(half.control).toEqual({ hero: 'ai', enemy: 'player' });
    expect(Battle.start(half, 1).actor.team).toBe('enemy');
  });

  it('a built battle saves and loads back with its sheets, CT and bags', () => {
    const half = halve(battleToScenario(withCt).scenario);
    const b = Battle.start(half, 1);
    const back = Battle.load(b.save());
    expect(back?.state).toEqual(b.state);
    expect(back?.state.enemyBag).toEqual({ ether: 1 });
  });

  it('never gives the Beacon a sheet of its own', () => {
    const d = withUnit(placeUnit(duel(), { x: 0, y: 5 }, 'beacon', 'hero'), 2, { hp: 10 });
    expect(battleToScenario(d).scenario.spawns[2].def).toBe('beacon');
  });

  it('wins Survive by holding the turns', () => {
    const { scenario } = battleToScenario(doc);
    const st = { ...initialState(scenario, 1), turnsPlayed: 5 };
    expect(scenario.rules?.outcome?.(st)).toBe('victory');
  });

  it('the AI plays the heroes too: AI against AI ends on a built battle', () => {
    const b = battleFromScenario(SCENARIOS.skirmish);
    const { scenario } = battleToScenario({ ...b, control: { hero: 'ai', enemy: 'ai' } });
    for (const seed of [1, 2, 3]) expect(simulate(scenario, seed).outcome).not.toBe('timeout');
  });
});

describe('live map edit mid-battle', () => {
  const start = (d: BattleDoc = duel()) => {
    const scenario = halve(battleToScenario(d).scenario);
    return { scenario, battle: Battle.start(scenario, 1) };
  };

  it('is only open on a player turn with nothing moving', () => {
    const { scenario, battle } = start();
    const st = battle.state;
    const actorTeam = battle.actor.team;
    expect(canEditLive(st, scenario, false)).toBe(actorTeam === 'hero');
    expect(canEditLive(st, scenario, true)).toBe(false);
    expect(canEditLive(st, { ...scenario, control: { hero: 'player', enemy: 'player' } }, false)).toBe(true);
    expect(canEditLive(st, { ...scenario, control: { hero: 'ai', enemy: 'ai' } }, false)).toBe(false);
    expect(canEditLive({ ...st, outcome: 'victory' }, scenario, false)).toBe(false);
  });

  it('moves a unit off a new wall to the nearest free tile and leaves the input state alone', () => {
    const d = duel();
    const { scenario, battle } = start(d);
    const before = JSON.stringify(battle.state);
    const out = editLive(battle.state, scenario, paint(d.map, { x: 1, y: 1 }, rock))!;
    expect(out.moved).toEqual([{ unit: 'h0', from: { x: 2, y: 2 }, to: { x: 2, y: 0 } }]);
    expect(out.state.units.find((u) => u.id === 'h0')!.pos).toEqual({ x: 2, y: 0 });
    expect(JSON.stringify(battle.state)).toBe(before);
    expect(SCENARIOS[scenario.id].grid).toBe(out.grid);
    expect(out.grid.width).toBe(12);
  });

  it('an edit elsewhere moves nobody', () => {
    const d = duel();
    const { scenario, battle } = start(d);
    expect(editLive(battle.state, scenario, paint(d.map, { x: 5, y: 0 }, rock))!.moved).toEqual([]);
  });

  it('a spot the old map already allowed is not the edit doing: the unit stays', () => {
    const d = duel();
    const { scenario, battle } = start(d);
    const st = structuredClone(battle.state);
    st.corpses = [st.units.find((u) => u.id === 'h0')!.pos]; // a body under it: nobody may stop there, yet it stands
    expect(editLive(st, scenario, paint(d.map, { x: 5, y: 0 }, rock))!.moved).toEqual([]);
  });

  it('two stranded units never share a cell', () => {
    const d = placeUnit(duel(), { x: 2, y: 1 }, 'archer', 'hero');
    const { scenario, battle } = start(d);
    const out = editLive(battle.state, scenario, paint(paint(d.map, { x: 1, y: 1 }, rock), { x: 2, y: 1 }, rock))!;
    expect(out.moved).toHaveLength(2);
    const cells = out.state.units.flatMap((u) => bodyOf(u.def, u.pos, u.facing).map((p) => `${p.x},${p.y}`));
    expect(new Set(cells).size).toBe(cells.length);
  });

  // halved as the game plays them, after some AI turns: swarms, long bodies and ramps off the tile corners
  const themes = Object.keys(CRAWL_THEMES);
  const lived = [
    SCENARIOS.frost_pass,
    SCENARIOS.crypt_heart,
    ...[1, 2, 3].map((i) => generateRoom(i, { depth: 1 + i, theme: themes[i % themes.length] })),
  ];
  for (const base of lived)
    it(`the same map again moves nobody on ${base.id}`, () => {
      const scenario = halve(base);
      const battle = Battle.start(scenario, 7);
      for (let k = 0; k < 12 && !battle.over; k++) playAiTurn(battle);
      const out = editLive(battle.state, scenario, docFromScenario(scenario))!;
      expect(out.moved).toEqual([]);
      expect(out.grid.tiles.map((t) => [t.terrain, t.h, t.ramp ?? null])).toEqual(
        scenario.grid.tiles.map((t) => [t.terrain, t.h, t.ramp ?? null]),
      );
      SCENARIOS[scenario.id] = scenario;
    });

  it('refuses a size change and a map with no free tile', () => {
    const d = duel();
    const { scenario, battle } = start(d);
    expect(editLive(battle.state, scenario, blankDoc(8, 8))).toBeNull();
    let walls = d.map;
    for (let y = 0; y < 6; y++) for (let x = 0; x < 6; x++) walls = paint(walls, { x, y }, rock);
    expect(editLive(battle.state, scenario, walls)).toBeNull();
  });
});

describe('Developer cast migration', () => {
  const plain = (map: string): DevCast => {
    const sc = SCENARIOS[map];
    const of = (team: string) =>
      sc.spawns
        .filter((s) => s.team === team && s.def !== 'beacon')
        .map((s) => {
          const d = UNIT_DEFS[s.def];
          return { base: s.def, name: d.name, hp: d.hp, speed: d.speed, move: d.move, abilities: [...d.abilities] };
        });
    return { map, heroes: of('hero'), enemies: of('enemy') };
  };

  for (const { id } of MAPS)
    it(`an untouched cast on ${id} is plain classes on the map's seats and reads back identical`, () => {
      const doc = battleFromDevCast(plain(id))!;
      expect(roundTrip(doc)).toEqual(doc);
      const seats = (l: { def: string; team: string; x: number; y: number }[]) =>
        l.map(({ def, team, x, y }) => `${def} ${team} ${x},${y}`).sort();
      expect(seats(doc.units)).toEqual(seats(SCENARIOS[id].spawns));
      expect(doc.units.every((u) => u.hp === undefined && u.name === undefined && u.abilities === undefined)).toBe(
        true,
      );
      expect(doc.objective?.kind).toBe(SCENARIOS[id].spawns.some((s) => s.def === 'beacon') ? 'beacon' : 'defeat_all');
    });

  it('keeps what was edited and drops the units past the seats', () => {
    const cast = plain('skirmish');
    cast.heroes[0] = {
      ...cast.heroes[0],
      name: 'Bran',
      hp: 400,
      jump: 3,
      items: { main: 'iron_blade' },
      abilities: ['spin'],
    };
    cast.enemies.push(...cast.enemies);
    const doc = battleFromDevCast(cast)!;
    expect(doc.units.find((u) => u.id === 'h0')).toMatchObject({
      name: 'Bran',
      hp: 400,
      jump: 3,
      items: { main: 'iron_blade' },
      abilities: ['spin'],
    });
    expect(doc.units.filter((u) => u.team === 'enemy')).toHaveLength(4);
    expect(roundTrip(doc)).toEqual(doc);
  });

  it('falls back to the class for what the battle document refuses (no abilities, a broken name)', () => {
    const cast = plain('skirmish');
    cast.heroes[0] = { ...cast.heroes[0], name: 'a\nb', abilities: [], hp: 50 };
    const doc = battleFromDevCast(cast)!;
    const h0 = doc.units.find((u) => u.id === 'h0')!;
    expect(h0).toMatchObject({ hp: 50 });
    expect(h0).not.toHaveProperty('name');
    expect(h0).not.toHaveProperty('abilities');
    expect(roundTrip(doc)).toEqual(doc);
  });

  it('refuses a map the game does not have', () => {
    expect(battleFromDevCast({ map: 'nowhere', heroes: [], enemies: [] })).toBeNull();
  });
});
