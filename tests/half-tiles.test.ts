import { describe, expect, it } from 'vitest';
import { CHAPTERS, chapterScenario } from '../src/client/campaign.ts';
import { ABILITIES } from '../src/shared/battle/abilities.ts';
import { checkOutcome, previewAbility, simulatePush } from '../src/shared/battle/combat.ts';
import { type Grid, posKey } from '../src/shared/battle/grid.ts';
import { halve } from '../src/shared/battle/half.ts';
import { cellsOf, reachable } from '../src/shared/battle/pathing.ts';
import { initialState, MAPS, type Scenario } from '../src/shared/battle/scenarios.ts';
import { simulate } from '../src/shared/battle/simulate.ts';
import type { BattleState, Pos, UnitState } from '../src/shared/battle/types.ts';
import { HALF, UNIT_DEFS } from '../src/shared/battle/units.ts';
import { gridOf, stateOf } from './battle-helpers.ts';

// Half tiles in the game battles (Nov 14): on whole-tile positions the split map must answer exactly as the whole one, so
// the balance measured on whole tiles still holds. Each check runs the same question on both maps.
const cell = (p: Pos): Pos => ({ x: p.x * 2, y: p.y * 2 });
const split = (grid: Grid, id: string, spawns: Scenario['spawns'] = []) =>
  halve({ id, name: id, en: id, grid, spawns });
// the same units, on the split map: each one on the cell of its tile's corner, with its token sheet
const halfState = (s: BattleState): BattleState => ({
  ...structuredClone(s),
  units: s.units.map((u) => ({ ...structuredClone(u), def: u.def + HALF, pos: cell(u.pos) })),
});

describe('half tiles: abilities measure the same as on whole tiles', () => {
  // every game ability in one sheet, on a map with slopes (height bonus and +range from above)
  UNIT_DEFS['t-all'] = { ...UNIT_DEFS.warrior, id: 't-all', abilities: Object.keys(ABILITIES) };
  const whole = gridOf(Array(9).fill('.........'), [
    '000011122',
    '000111122',
    '001112223',
    ...Array(6).fill('001122233'),
  ]);
  const half = split(whole, 't-slopes', [
    { id: 'a', def: 't-all', team: 'hero', x: 0, y: 0 },
    { id: 'b', def: 'soldier', team: 'enemy', x: 0, y: 0 },
    { id: 'c', def: 'brute', team: 'enemy', x: 0, y: 0 },
  ]).grid;
  const A = { x: 4, y: 4 };
  for (const id of Object.keys(ABILITIES).filter((x) => ABILITIES[x].range[1] > 0 && !ABILITIES[x].charge)) {
    it(`${id}: same reach, targets and hit chance against every tile`, () => {
      const diff: string[] = [];
      for (let y = 0; y < 9; y++)
        for (let x = 0; x < 9; x++) {
          const B = { x, y };
          if (posKey(B) === posKey(A)) continue;
          // the target and, for the areas, a bystander beside it (facing +x: front, side and back all show up)
          const units = [
            { id: 'a', def: 't-all', team: 'hero' as const, ...A },
            { id: 'b', def: 'soldier', team: 'enemy' as const, ...B },
          ];
          const by = { x: B.x, y: B.y + 1 };
          if (by.y < 9 && posKey(by) !== posKey(A)) units.push({ id: 'c', def: 'brute', team: 'enemy', ...by });
          const s = stateOf(units);
          for (const u of s.units) if (u.id !== 'a') u.facing = 1;
          const w = previewAbility(whole, s, 'a', id, B);
          const hs = halfState(s);
          // the player may aim at any of the target's 4 cells; the best answer counts
          const hp = cellsOf(cell(B), 2)
            .map((p) => previewAbility(half, hs, 'a', id, p))
            .find((p) => p.ok);
          const say = (p?: { ok: boolean; targets: { unit: string; chance: number; side: string }[] }) =>
            p?.ok
              ? p.targets
                  .map((t) => `${t.unit}:${t.chance}:${t.side}`)
                  .sort()
                  .join(',')
              : 'out';
          if (say(w) !== say(hp)) diff.push(`${posKey(B)} whole ${say(w)} half ${say(hp)}`);
        }
      expect(diff).toEqual([]);
    });
  }
});

describe('half tiles: walking', () => {
  // every spawn of every map: the whole tiles it reaches are the token's corner cells, at twice the cost
  for (const map of MAPS) {
    it(`${map.id}: the token reaches the same tiles, 1 cell per step`, () => {
      const hm = halve(map);
      const ws = initialState(map, 1),
        hs = initialState(hm, 1);
      for (const u of ws.units) {
        if (!UNIT_DEFS[u.def].move) continue;
        const w = new Map([...reachable(map.grid, ws, u.id).values()].map((s) => [posKey(cell(s.pos)), s.cost * 2]));
        const h = new Map(
          [...reachable(hm.grid, hs, u.id).values()]
            .filter((s) => s.pos.x % 2 === 0 && s.pos.y % 2 === 0)
            .map((s) => [posKey(s.pos), s.cost]),
        );
        expect([...h].sort(), `${u.id}`).toEqual([...w].sort());
      }
    });
  }

  it('enters deep water, climbs a step of 2 with jump 2 and flies over a 1-tile moat', () => {
    // row 1: ground, deep water, ground, step of 2
    const whole = gridOf(['.....', '.....'], ['00002', '00002']);
    whole.tiles[1] = { ...whole.tiles[1], depth: 2, h: 0 };
    whole.tiles[6] = { ...whole.tiles[6], depth: 2, h: 0 };
    const sc = split(whole, 't-water', [
      { id: 'r', def: 'rogue', team: 'hero', x: 0, y: 0 },
      { id: 'w', def: 'warrior', team: 'hero', x: 0, y: 0 },
    ]);
    const reach = (def: string) =>
      reachable(sc.grid, stateOf([{ id: 'u', def: def + HALF, team: 'hero', x: 0, y: 0 }]), 'u');
    const rogue = reach('rogue'),
      warrior = reach('warrior');
    expect(warrior.has('2,0')).toBe(true); // into the deep water
    expect(warrior.has('8,0')).toBe(false); // the step of 2 needs jump 2
    expect(rogue.has('8,0')).toBe(true);
    // the gap: from the bank over the water to the other bank costs 2 tiles = 4 cells, as walking through
    expect(rogue.get('4,0')?.cost).toBe(4);
  });
});

describe('half tiles: push', () => {
  it('pushes the token the same whole tiles, with the same bump and fall', () => {
    const whole = gridOf(['......', '......'], ['322100', '322100']);
    const sc = split(whole, 't-push', [{ id: 'b', def: 'soldier', team: 'enemy', x: 0, y: 0 }]);
    for (const [x, steps] of [
      [1, 1],
      [1, 3],
      [3, 2],
    ]) {
      const ws = stateOf([
        { id: 'a', def: 'warrior', team: 'hero', x: x - 1, y: 0 },
        { id: 'b', def: 'soldier', team: 'enemy', x, y: 0 },
      ]);
      const hs = halfState(ws);
      const target = (s: BattleState) => s.units.find((u) => u.id === 'b') as UnitState;
      const w = simulatePush(whole, ws, target(ws), { x, y: 0 }, { x: x - 1, y: 0 }, steps);
      const h = simulatePush(sc.grid, hs, target(hs), cell({ x, y: 0 }), cell({ x: x - 1, y: 0 }), steps);
      expect(h.to).toEqual(cell(w.to));
      expect(h.dmg).toBe(w.dmg);
    }
  });
});

describe('half tiles: whole battles', () => {
  it('the Beacon of a split map still loses the battle when it falls', () => {
    const hill = halve(MAPS[1]);
    const s = initialState(hill, 1);
    expect(checkOutcome(s)).toBe('ongoing');
    expect(checkOutcome({ ...s, units: s.units.filter((u) => !u.def.startsWith('beacon')) })).toBe('defeat');
  });

  it('every campaign stage plays to the end on half tiles', () => {
    for (let n = 0; n < CHAPTERS.length; n++) {
      const r = simulate(halve(chapterScenario(n)), 3);
      expect(r.outcome, `stage ${n}`).not.toBe('timeout');
    }
  }, 60000);
});
