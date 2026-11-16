import { describe, expect, it } from 'vitest';
import { ABILITIES } from '../src/shared/battle/abilities.ts';
import { playAiTurn } from '../src/shared/battle/ai.ts';
import { Battle, parseBattleState } from '../src/shared/battle/battle.ts';
import { SCENARIOS } from '../src/shared/battle/scenarios.ts';
import { UNIT_DEFS } from '../src/shared/battle/units.ts';

// Security review of the battle save (dt:battle*): Battle.load is the trust boundary for anything a player, an extension
// or a broken write leaves in localStorage. A hostile save must give null or a battle that plays on, never a throw.

// biome-ignore lint/suspicious/noExplicitAny: the tests corrupt arbitrary fields of a parsed save
type Raw = any;
const fresh = (): Raw => JSON.parse(Battle.start(SCENARIOS.skirmish, 7).save());
// a save after one free move, so the history has a frame to tamper with
const moved = (): Raw => {
  const b = Battle.start(SCENARIOS.skirmish, 7);
  b.move([...b.reach().values()][0].pos);
  return JSON.parse(b.save());
};
const load = (raw: Raw) => Battle.load(typeof raw === 'string' ? raw : JSON.stringify(raw));
const edited = (fn: (s: Raw) => void, base = fresh()) => {
  fn(base.state);
  return load(base);
};

// "does not break later": a loaded battle is played by the AI for a bounded number of turns; a hang or a throw fails
const playsOn = (b: Battle) => {
  for (let i = 0; i < 40 && !b.over; i++) playAiTurn(b);
  return b.state.outcome;
};

describe('battle save: hostile JSON never throws', () => {
  const texts = [
    '',
    'undefined',
    'NaN',
    '1e400',
    '"text"',
    '[[[[[[[[[[]]]]]]]]]]',
    '{"v":2}',
    '{"v":2,"state":null,"undosLeft":0,"history":[]}',
    '{"v":"2","state":{},"undosLeft":0,"history":[]}',
    `{"v":2,"state":${'['.repeat(5000)}${']'.repeat(5000)}}`,
    'x'.repeat(1_000_000),
    '{"__proto__":{"v":2}}',
  ];
  it.each(texts.map((t) => [t.slice(0, 40), t]))('%s becomes null', (_, t) => {
    expect(() => Battle.load(t)).not.toThrow();
    expect(Battle.load(t)).toBeNull();
  });

  it('a non-object state of any kind becomes null', () => {
    for (const v of [undefined, null, 0, -1, Number.NaN, '', 'skirmish', [], [fresh().state], true])
      expect(parseBattleState(v)).toBeNull();
  });
});

describe('battle save: unknown or prototype ids are rejected', () => {
  // Object.hasOwn is what keeps "constructor" from reading Object.prototype off the registries
  const protoKeys = ['__proto__', 'constructor', 'prototype', 'toString', 'hasOwnProperty'];

  it.each(protoKeys)('scenario %s', (k) => expect(edited((s) => (s.scenario = k))).toBeNull());
  it.each(protoKeys)('unit def %s', (k) => expect(edited((s) => (s.units[0].def = k))).toBeNull());
  it.each(protoKeys)('used ability %s', (k) => expect(edited((s) => (s.turn.usedAbility = k))).toBeNull());
  it.each(protoKeys)('charged ability %s', (k) =>
    expect(
      edited((s) => (s.charges = [{ unit: s.turn.actor, ability: k, target: { x: 0, y: 0 }, follow: null, ticks: 2 }])),
    ).toBeNull(),
  );

  it('a real ability the actor does not have is rejected', () => {
    const b = Battle.start(SCENARIOS.skirmish, 7);
    const own = UNIT_DEFS[b.actor.def].abilities;
    const foreign = Object.keys(ABILITIES).find((id) => !own.includes(id));
    expect(foreign).toBeDefined();
    expect(edited((s) => (s.turn.usedAbility = foreign))).toBeNull();
  });

  it('a prototype key in the JSON adds nothing and pollutes nothing', () => {
    const raw = JSON.parse(JSON.stringify(fresh()).replace('"units":', '"__proto__":{"polluted":1},"units":'));
    const b = load(raw);
    expect(b).not.toBeNull();
    expect(Object.keys(b!.state)).not.toContain('__proto__');
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });
});

describe('battle save: numbers out of range', () => {
  it.each([
    ['hp NaN as null', (s: Raw) => (s.units[0].hp = null)],
    ['hp above the sheet', (s: Raw) => (s.units[0].hp += 1)],
    ['hp zero', (s: Raw) => (s.units[0].hp = 0)],
    ['hp as text', (s: Raw) => (s.units[0].hp = '10')],
    ['hp fraction', (s: Raw) => (s.units[0].hp = 1.5)],
    ['hp 1e308', (s: Raw) => (s.units[0].hp = 1e308)],
    ['pos negative', (s: Raw) => (s.units[0].pos = { x: -1, y: 0 })],
    ['pos gigantic', (s: Raw) => (s.units[0].pos = { x: 2 ** 53, y: 0 })],
    ['pos as array', (s: Raw) => (s.units[0].pos = [0, 0])],
    ['ct gigantic', (s: Raw) => (s.units[0].ct = 1e300)],
    ['rng fraction', (s: Raw) => (s.rng = 0.5)],
    ['rng as text', (s: Raw) => (s.rng = '1')],
    ['turnsPlayed negative', (s: Raw) => (s.turnsPlayed = -1)],
    ['facing out of the compass', (s: Raw) => (s.units[0].facing = 9)],
    ['vars on a unit without counters', (s: Raw) => (s.units[0].vars = { x: 1 })],
    ['charge ticks zero', (s: Raw) => (s.charges = [{ unit: s.turn.actor, ticks: 0 }])],
    [
      'charge follows a ghost',
      (s: Raw) => {
        const me = s.units.find((u: Raw) => u.id === s.turn.actor);
        const ability = UNIT_DEFS[me.def].abilities[0];
        s.charges = [{ unit: me.id, ability, target: { x: 0, y: 0 }, follow: 'ghost', ticks: 2 }];
      },
    ],
    ['spent negative', (s: Raw) => (s.turn.spent = -1)],
    ['moved as text', (s: Raw) => (s.turn.moved = 'yes')],
    ['team unknown', (s: Raw) => (s.units[0].team = 'neutral')],
    ['unit id not a string', (s: Raw) => (s.units[0].id = 5)],
  ])('%s is rejected', (_, fn) => expect(edited(fn)).toBeNull());

  it('a huge or negative RNG state is accepted and still rolls inside [0, 1)', () => {
    // isInt is the only check: mulberry32 folds any integer through |0, so the dice stay valid
    for (const rng of [Number.MAX_SAFE_INTEGER, -Number.MAX_SAFE_INTEGER, 2 ** 31, -1, 0]) {
      const b = edited((s) => (s.rng = rng));
      expect(b).not.toBeNull();
      expect(['ongoing', 'victory', 'defeat']).toContain(playsOn(b!));
    }
  });

  it('extreme but allowed clocks and counts still play on', () => {
    const b = edited((s) => {
      for (const u of s.units) u.ct = -10000;
      s.turnsPlayed = Number.MAX_SAFE_INTEGER - 100;
    });
    expect(b).not.toBeNull();
    expect(() => playsOn(b!)).not.toThrow();
  });
});

describe('battle save: arrays', () => {
  it('more units than the cap, a hole in the list or a repeated tile is rejected', () => {
    expect(edited((s) => (s.units = Array(65).fill(s.units[0])))).toBeNull();
    expect(edited((s) => (s.units = [s.units[0], null, ...s.units.slice(1)]))).toBeNull();
    // a hole in the array comes back from JSON as null
    expect(load(JSON.stringify(fresh()).replace('"units":[', '"units":[null,'))).toBeNull();
    expect(edited((s) => (s.units[1].pos = { ...s.units[0].pos }))).toBeNull();
  });

  it('a huge engaged list or charge list is rejected without walking it', () => {
    expect(edited((s) => (s.turn.engaged = Array(64 * 64 + 1).fill('x')))).toBeNull();
    expect(edited((s) => (s.charges = Array(65).fill({})))).toBeNull();
  });

  it('a history longer than the undo budget, or an entry that is not a frame, is rejected', () => {
    const raw = moved();
    expect(load({ ...raw, history: Array(5).fill(raw.history[0]) })).toBeNull();
    expect(load({ ...raw, history: [null] })).toBeNull();
    expect(load({ ...raw, history: 'x' })).toBeNull();
    expect(load({ ...raw, undosLeft: -1 })).toBeNull();
    expect(load({ ...raw, undosLeft: Number.NaN })).toBeNull();
  });
});

describe('battle save: ids that collide with Object.prototype', () => {
  it('units named after prototype keys load and play on without touching the prototype', () => {
    // every map or Set keyed by unit id (AI, counters, charges) must survive these names
    const names = ['__proto__', 'constructor', 'toString', 'hasOwnProperty', 'valueOf', 'prototype', 'x', 'y'];
    const base = fresh();
    const rename = new Map<string, string>(base.state.units.map((u: Raw, i: number) => [u.id, names[i] ?? `u${i}`]));
    for (const u of base.state.units) u.id = rename.get(u.id);
    base.state.turn.actor = rename.get(base.state.turn.actor);
    const b = load(base);
    expect(b).not.toBeNull();
    expect(() => playsOn(b!)).not.toThrow();
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it('a 100 000-character unit id is rejected or plays on (no length cap today)', () => {
    const base = fresh();
    const long = 'u'.repeat(100_000);
    if (base.state.turn.actor === base.state.units[0].id) base.state.turn.actor = long;
    base.state.units[0].id = long;
    const b = load(base);
    if (b) expect(() => playsOn(b)).not.toThrow();
  });
});

describe('battle save: an inconsistent turn queue', () => {
  it('a unit that never plays (speed 0, the Beacon) as the actor is rejected or plays on', () => {
    // the turn queue skips speed-0 units; a save that hands them the turn must not hang or throw the AI loop
    const raw: Raw = JSON.parse(Battle.start(SCENARIOS.beacon_hill, 7).save());
    const still = raw.state.units.find((u: Raw) => UNIT_DEFS[u.def].speed === 0);
    expect(still).toBeDefined();
    raw.state.turn.actor = still.id;
    const b = load(raw);
    if (b) expect(() => playsOn(b)).not.toThrow();
  });

  it('every unit on one side, with the battle still ongoing, ends at the next turn', () => {
    const b = edited(
      (s) => (s.units = s.units.filter((u: Raw) => u.team === s.units.find((x: Raw) => x.id === s.turn.actor).team)),
    );
    expect(b).not.toBeNull();
    b!.endTurn();
    expect(b!.over).toBe(true);
  });
});

describe('battle save: the undo history must belong to the same battle', () => {
  // each frame is parsed on its own grid, so without this check undo would put a state of another map on this map's grid
  it('a history frame of another scenario is rejected', () => {
    const raw = moved();
    const { rng: _rng, ...other } = Battle.start(SCENARIOS.beacon_hill, 1).state;
    raw.history[0].before = other;
    const b = load(raw);
    expect(b).toBeNull();
  });

  // a free (unpaid) frame naming another actor would hand the player an enemy's turn on undo (history never spans a turn)
  it('a history frame of another actor is rejected', () => {
    const raw = moved();
    const foe = raw.state.units.find(
      (u: Raw) => u.team !== raw.state.units.find((x: Raw) => x.id === raw.state.turn.actor).team,
    );
    raw.history[0].before.turn.actor = foe.id;
    raw.history[0].paid = false;
    expect(load(raw)).toBeNull();
  });
});
