import { describe, expect, it } from 'vitest';
import { ABILITY_LIST } from '../src/content/abilities.ts';
import { CRAWL_BOSS, CRAWL_GOLD, CRAWL_GROUPS, CRAWL_PARTY, CRAWL_THEMES } from '../src/content/crawl/rooms.ts';
import { CONSUMABLES, ITEM_LIST } from '../src/content/items.ts';
import { RECRUIT_NAMES, STARTING_WEAPON, STORY } from '../src/content/party.ts';
import { UNIT_LIST } from '../src/content/units.ts';
import { ABILITIES } from '../src/shared/battle/abilities.ts';
import { ITEMS } from '../src/shared/battle/equipment.ts';
import { TERRAIN } from '../src/shared/battle/grid.ts';
import { MAPS } from '../src/shared/battle/scenarios.ts';
import { UNIT_DEFS } from '../src/shared/battle/units.ts';

// Content in src/content refers to itself by id (a map names unit classes, a crawl group its enemies). A typo only shows
// up mid-game, so it shows up here. Covered elsewhere, not repeated: full grid and free spawns and ramps (scenario-maps).
const unique = (ids: string[]) => ids.filter((id, i) => ids.indexOf(id) !== i);
const mapIds = MAPS.map((m) => m.id);

describe('content ids', () => {
  // the registries are built with Object.fromEntries, which keeps the last of two equal ids without a word
  it('are unique in every list', () => {
    expect(unique(UNIT_LIST.map((u) => u.id))).toEqual([]);
    expect(unique(ABILITY_LIST.map((a) => a.id))).toEqual([]);
    expect(unique([...ITEM_LIST, ...CONSUMABLES].map((i) => i.id))).toEqual([]);
    expect(unique(mapIds)).toEqual([]);
    expect(unique(STORY.map((m) => m.id))).toEqual([]);
    expect(unique(RECRUIT_NAMES)).toEqual([]);
  });
});

describe('mana and stamina (Nov 16, the Mechanics lab equipamento.json)', () => {
  it('a spell costs mana and a martial ability stamina', () => {
    for (const a of ABILITY_LIST.filter((x) => x.cost)) expect(a.cost![0], a.id).toBe(a.magic ? 'mana' : 'stamina');
  });
  it('a basic attack is free, and every unit can pay each of its abilities from its full pool', () => {
    for (const u of UNIT_LIST) {
      if (u.abilities[0]) expect(ABILITIES[u.abilities[0]].cost, u.id).toBeUndefined();
      for (const id of u.abilities) {
        const cost = ABILITIES[id].cost;
        if (cost) expect(u.vars?.[cost[0]] ?? 0, `${u.id} → ${id}`).toBeGreaterThanOrEqual(cost[1]);
      }
      // a pool's regen only for a pool the unit has
      for (const k of Object.keys(u.regen ?? {})) expect(u.vars?.[k], `${u.id} regen ${k}`).toBeGreaterThan(0);
    }
  });
  // Fernando, Nov 20: every unit has both pools; the second one comes back too, slower (3 a turn), so its one ability is
  // not a single use
  it('every pool a unit has comes back each turn, the second at 3', () => {
    for (const u of UNIT_LIST.filter((x) => x.vars))
      for (const k of (['mana', 'stamina'] as const).filter((k) => u.vars![k] !== undefined))
        expect(u.regen?.[k] ?? 0, `${u.id} regen ${k}`).toBeGreaterThanOrEqual(3);
  });
});

describe('classes and abilities', () => {
  it('every ability of every unit exists', () => {
    for (const u of Object.values(UNIT_DEFS))
      for (const a of u.abilities) expect(ABILITIES[a], `${u.id} → ${a}`).toBeDefined();
  });

  // the 6-slot action bar is gone (the Agir lists since Nov 19), so there is no upper bound
  it('each hero has 4 abilities or more', () => {
    for (const id of ['warrior', 'archer', 'mage', 'rogue'])
      expect(UNIT_DEFS[id].abilities.length, id).toBeGreaterThanOrEqual(4);
  });

  it('an ability deals damage or heals, never both, and has a coherent range', () => {
    for (const a of Object.values(ABILITIES)) {
      // or neither, for a pure effect: a push or a timed effect (the Shove, the sand, Focus; Nov 21)
      if (a.damage[1] === 0 && a.heal[1] === 0) expect(a.push > 0 || !!a.buff, a.id).toBe(true);
      else expect(a.damage[1] > 0 !== a.heal[1] > 0, a.id).toBe(true);
      expect(a.range[0], a.id).toBeLessThanOrEqual(a.range[1]);
      expect(a.damage[0], a.id).toBeLessThanOrEqual(a.damage[1]);
      expect(a.accuracy, a.id).toBeGreaterThan(0);
    }
  });
});

describe('maps', () => {
  // a letter missing from a map key gives a tile without terrain, and a short height row gives a NaN height
  it('every tile has a known terrain and a whole height, and every spawn a known class', () => {
    for (const m of MAPS) {
      m.grid.tiles.forEach((t, i) => {
        expect(TERRAIN[t.terrain], `${m.id} tile ${i}`).toBeDefined();
        expect(Number.isInteger(t.h), `${m.id} tile ${i}`).toBe(true);
      });
      for (const s of m.spawns) expect(UNIT_DEFS[s.def], `${m.id} → ${s.def}`).toBeDefined();
    }
  });
});

describe('party', () => {
  it('story members are existing classes, each starting with an existing common weapon', () => {
    for (const m of STORY) expect(UNIT_DEFS[m.cls], m.id).toBeDefined();
    expect(Object.keys(STARTING_WEAPON)).toEqual(STORY.map((m) => m.id));
    for (const w of Object.values(STARTING_WEAPON)) expect(ITEMS[w]).toMatchObject({ kind: 'main', rarity: 'common' });
  });
});

describe('equipment', () => {
  // the Mechanics lab's rarity budget (equipamento.json, Nov 15): common 2 points, rare 4, epic 6, and what 1 point buys;
  // only an epic may take one negative stat, which gives its points back
  const BUDGET = { common: 2, rare: 4, epic: 6 };
  const PER_POINT: Record<string, number> = {
    physPower: 10,
    magPower: 10,
    hp: 25,
    dodge: 5,
    hit: 5,
    mana: 20,
    stamina: 20,
    hpRegen: 10, // Fernando, Nov 16: 10 life regen a point (the lab first said 5)
    manaRegen: 3,
    speed: 0.5,
    jump: 0.5,
    move: 1 / 3,
  };
  const RESIST_PER_POINT = (k: string) => (k === 'phys' || k === 'mag' ? 10 : 20);
  it('every piece spends exactly its rarity budget, with at most one negative stat on an epic', () => {
    for (const it of ITEM_LIST) {
      const stats = [
        ...Object.entries(PER_POINT).flatMap(([k, per]) => {
          const v = it[k as keyof typeof it] as number | undefined;
          return v ? [v / per] : [];
        }),
        ...Object.entries(it.resist ?? {}).map(([k, v]) => v / RESIST_PER_POINT(k)),
      ];
      expect(
        stats.reduce((s, p) => s + p, 0),
        it.id,
      ).toBeCloseTo(BUDGET[it.rarity]);
      expect(stats.filter((p) => p < 0).length, it.id).toBeLessThanOrEqual(it.rarity === 'epic' ? 1 : 0);
    }
  });
});

describe('crawl rooms', () => {
  // the Mechanics lab's descent proposal (Nov 15): 1 to 3 enemies worth 64 to 102 life (320 to 510 since the x5 of life),
  // depths 1 to 3, the boss 2x2; a swarm room (Nov 20) brings up to 5 smaller bodies for the same life
  it('groups and the party use existing classes, within the lab numbers', () => {
    for (const id of CRAWL_PARTY) expect(UNIT_DEFS[id]?.speed, id).toBeGreaterThan(0);
    for (const g of CRAWL_GROUPS) {
      const life = g.enemies.reduce((sum, e) => sum + UNIT_DEFS[e].hp, 0);
      expect(g.enemies.length, g.name[1]).toBeGreaterThanOrEqual(1);
      expect(g.enemies.length, g.name[1]).toBeLessThanOrEqual(g.enemies.some((e) => UNIT_DEFS[e].swarm) ? 5 : 3);
      expect(life, g.name[1]).toBeGreaterThanOrEqual(320);
      expect(life, g.name[1]).toBeLessThanOrEqual(510);
    }
    expect([...new Set(CRAWL_GROUPS.map((g) => g.depth))].sort()).toEqual([1, 2, 3]);
    expect(CRAWL_BOSS.enemies.some((e) => UNIT_DEFS[e]?.size === 2)).toBe(true);
  });

  it('gold drops name existing enemies, with whole ranges', () => {
    for (const [id, [lo, hi]] of Object.entries(CRAWL_GOLD)) {
      expect(UNIT_DEFS[id], id).toBeDefined();
      expect(Number.isInteger(lo) && Number.isInteger(hi) && lo >= 0 && lo <= hi, id).toBe(true);
    }
  });

  it('themes use known terrains', () => {
    for (const [name, th] of Object.entries(CRAWL_THEMES))
      for (const p of [...th.props, ...th.border, ...(th.hazard ? [th.hazard] : [])])
        expect(p.terrain && TERRAIN[p.terrain], `${name} → ${p.look}`).toBeDefined();
  });
});
