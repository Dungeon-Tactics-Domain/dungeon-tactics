import { describe, expect, it } from 'vitest';
import { ABILITY_LIST } from '../src/content/abilities.ts';
import { CRAWL_BOSS, CRAWL_GROUPS, CRAWL_PARTY, CRAWL_THEMES } from '../src/content/crawl/rooms.ts';
import { ITEM_LIST } from '../src/content/items.ts';
import { RECRUIT_NAMES, STORY } from '../src/content/party.ts';
import { UNIT_LIST } from '../src/content/units.ts';
import { ABILITIES } from '../src/shared/battle/abilities.ts';
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
    expect(unique(ITEM_LIST.map((i) => i.id))).toEqual([]);
    expect(unique(mapIds)).toEqual([]);
    expect(unique(STORY.map((m) => m.id))).toEqual([]);
    expect(unique(RECRUIT_NAMES)).toEqual([]);
  });
});

describe('classes and abilities', () => {
  it('every ability of every unit exists', () => {
    for (const u of Object.values(UNIT_DEFS))
      for (const a of u.abilities) expect(ABILITIES[a], `${u.id} → ${a}`).toBeDefined();
  });

  it('each hero has 4 abilities or more and fits the 6-slot bar (move + abilities + end)', () => {
    for (const id of ['warrior', 'archer', 'mage', 'rogue']) {
      const n = UNIT_DEFS[id].abilities.length;
      expect(n, id).toBeGreaterThanOrEqual(4);
      expect(n + 2, id).toBeLessThanOrEqual(6);
    }
  });

  it('an ability deals damage or heals, never both, and has a coherent range', () => {
    for (const a of Object.values(ABILITIES)) {
      expect(a.damage[1] > 0 !== a.heal[1] > 0, a.id).toBe(true);
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
  it('story members are existing classes', () => {
    for (const m of STORY) expect(UNIT_DEFS[m.cls], m.id).toBeDefined();
  });
});

describe('crawl rooms', () => {
  // the Mechanics lab's descent proposal (Nov 15): 1 to 3 enemies worth 64 to 102 life, depths 1 to 3, the boss 2x2
  it('groups and the party use existing classes, within the lab numbers', () => {
    for (const id of CRAWL_PARTY) expect(UNIT_DEFS[id]?.speed, id).toBeGreaterThan(0);
    for (const g of CRAWL_GROUPS) {
      const life = g.enemies.reduce((sum, e) => sum + UNIT_DEFS[e].hp, 0);
      expect(g.enemies.length, g.name[1]).toBeGreaterThanOrEqual(1);
      expect(g.enemies.length, g.name[1]).toBeLessThanOrEqual(3);
      expect(life, g.name[1]).toBeGreaterThanOrEqual(64);
      expect(life, g.name[1]).toBeLessThanOrEqual(102);
    }
    expect([...new Set(CRAWL_GROUPS.map((g) => g.depth))].sort()).toEqual([1, 2, 3]);
    expect(CRAWL_BOSS.enemies.some((e) => UNIT_DEFS[e]?.size === 2)).toBe(true);
  });

  it('themes use known terrains', () => {
    for (const [name, th] of Object.entries(CRAWL_THEMES))
      for (const p of [...th.props, ...th.border, ...(th.hazard ? [th.hazard] : [])])
        expect(p.terrain && TERRAIN[p.terrain], `${name} → ${p.look}`).toBeDefined();
  });
});
