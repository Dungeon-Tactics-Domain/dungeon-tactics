import { describe, expect, it } from 'vitest';
import { CHAPTERS, chapterScenario } from '../src/client/campaign.ts';
import { confirm, freshUi, selectMode, tapTile } from '../src/client/interaction.ts';
import { ABILITIES } from '../src/shared/battle/abilities.ts';
import { playAiTurn, walkMap } from '../src/shared/battle/ai.ts';
import { Battle } from '../src/shared/battle/battle.ts';
import { checkOutcome, previewAbility, simulatePush } from '../src/shared/battle/combat.ts';
import { canStand, dist, type Grid, posKey, tileAt } from '../src/shared/battle/grid.ts';
import { halve } from '../src/shared/battle/half.ts';
import { cellsOf, jumpOf, reachable } from '../src/shared/battle/pathing.ts';
import { initialState, MAPS, type Scenario } from '../src/shared/battle/scenarios.ts';
import { simulate } from '../src/shared/battle/simulate.ts';
import type { BattleState, Pos, UnitState } from '../src/shared/battle/types.ts';
import { HALF, UNIT_DEFS } from '../src/shared/battle/units.ts';
import { gridOf, HIT_SEED, stateOf } from './battle-helpers.ts';

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
  for (const id of Object.keys(ABILITIES)) {
    it(`${id}: same reach, targets and hit chance against every tile`, () => {
      const diff: string[] = [];
      for (let y = 0; y < 9; y++)
        for (let x = 0; x < 9; x++) {
          const B = { x, y };
          if (posKey(B) === posKey(A)) continue;
          // the target (or empty ground, Nov 14 review) and, for the areas, a bystander beside it (facing +x: front, side
          // and back all show up)
          for (const empty of [false, true]) {
            const units: Parameters<typeof stateOf>[0] = [{ id: 'a', def: 't-all', team: 'hero', ...A }];
            if (!empty) units.push({ id: 'b', def: 'soldier', team: 'enemy', ...B });
            const by = { x: B.x, y: B.y + 1 };
            if (by.y < 9 && posKey(by) !== posKey(A)) units.push({ id: 'c', def: 'brute', team: 'enemy', ...by });
            const s = stateOf(units);
            for (const u of s.units) if (u.id !== 'a') u.facing = 1;
            const w = previewAbility(whole, s, 'a', id, B);
            const hs = halfState(s);
            const say = (p: { ok: boolean; targets: { unit: string; chance: number; side: string }[] }) =>
              p.ok
                ? p.targets
                    .map((t) => `${t.unit}:${t.chance}:${t.side}`)
                    .sort()
                    .join(',')
                : 'out';
            // the player may aim at any of the tile's 4 cells: each one answers as the whole tile
            for (const p of cellsOf(cell(B), 2)) {
              const hp = previewAbility(half, hs, 'a', id, p);
              if (say(w) !== say(hp)) diff.push(`${posKey(B)} cell ${posKey(p)} whole ${say(w)} half ${say(hp)}`);
            }
          }
        }
      expect(diff).toEqual([]);
    });
  }
});

describe('half tiles: line of sight on the game maps', () => {
  // the walls, trees and slopes of the real maps: a cell-by-cell line slipped through corners the whole map blocks
  const sighted = Object.keys(ABILITIES).filter((id) => ABILITIES[id].needsSight);
  for (const map of MAPS) {
    it(`${map.id}: the shots that pass and stop are the same`, () => {
      const hm = halve({ ...map, spawns: [] });
      const g = map.grid;
      const diff: string[] = [];
      for (let ay = 0; ay < g.height; ay += 3)
        for (let ax = 0; ax < g.width; ax += 3) {
          const A = { x: ax, y: ay };
          if (!canStand(tileAt(g, A))) continue;
          for (let y = 0; y < g.height; y++)
            for (let x = 0; x < g.width; x++) {
              const B = { x, y };
              if (posKey(B) === posKey(A) || !canStand(tileAt(g, B))) continue;
              const s = stateOf([
                { id: 'a', def: 't-all', team: 'hero', ...A },
                { id: 'b', def: 'soldier', team: 'enemy', ...B },
              ]);
              const hs = halfState(s);
              for (const id of sighted) {
                const say = (p: ReturnType<typeof previewAbility>) =>
                  p.ok ? p.targets.map((t) => `${t.unit}:${t.chance}`).join(',') : 'out';
                const w = say(previewAbility(g, s, 'a', id, B));
                const h = say(previewAbility(hm.grid, hs, 'a', id, cell(B)));
                if (w !== h) diff.push(`${id} ${posKey(A)} -> ${posKey(B)} whole ${w} half ${h}`);
              }
            }
        }
      expect(diff.slice(0, 5)).toEqual([]);
    }, 30000);
  }
});

describe('half tiles: aiming at a big unit', () => {
  it('every tile of the Colossus answers as on the whole map, from every cell of it', () => {
    // review, "The Shade on the Summit": range went to the Colossus' nearest tile and sight to the aimed one, and an area
    // centered on its whole 4x4 square; the whole map measures all three from the aimed tile
    UNIT_DEFS['t-all'] = { ...UNIT_DEFS.warrior, id: 't-all', abilities: Object.keys(ABILITIES) };
    const whole = gridOf(Array(9).fill('.........'), [
      '000011122',
      '000111122',
      '001112223',
      ...Array(6).fill('001122233'),
    ]);
    const half = split(whole, 't-colossus', [
      { id: 'a', def: 't-all', team: 'hero', x: 0, y: 0 },
      { id: 'k', def: 'colossus', team: 'enemy', x: 0, y: 0 },
      { id: 'c', def: 'brute', team: 'enemy', x: 0, y: 0 },
    ]).grid;
    const C = { x: 4, y: 3 };
    const by = { x: 3, y: 4 }; // beside the Colossus' left column: an area on its left tiles catches it, one on its right does not
    const diff: string[] = [];
    for (let y = 0; y < 9; y++)
      for (let x = 0; x < 9; x++) {
        const A = { x, y };
        if ([...cellsOf(C, 2), by].some((p) => posKey(p) === posKey(A))) continue;
        const s = stateOf([
          { id: 'a', def: 't-all', team: 'hero', ...A },
          { id: 'k', def: 'colossus', team: 'enemy', ...C },
          { id: 'c', def: 'brute', team: 'enemy', ...by },
        ]);
        const hs = halfState(s);
        const say = (p: ReturnType<typeof previewAbility>) =>
          p.ok
            ? p.targets
                .map((t) => `${t.unit}:${t.chance}`)
                .sort()
                .join(',')
            : 'out';
        for (const id of Object.keys(ABILITIES))
          for (const T of cellsOf(C, 2)) {
            const w = say(previewAbility(whole, s, 'a', id, T));
            for (const p of cellsOf(cell(T), 2)) {
              const h = say(previewAbility(half, hs, 'a', id, p));
              if (w !== h) diff.push(`${id} ${posKey(A)} -> ${posKey(p)} whole ${w} half ${h}`);
            }
          }
      }
    expect(diff.slice(0, 5)).toEqual([]);
  });
});

describe('half tiles: aiming at empty ground', () => {
  it('a Blast at empty ground stops on Beacon Hill where the whole map stops it, from every cell of the tile', () => {
    // review, stage 1 turn 33: from the tile corner the line runs to a raw odd cell and reached the archer behind the hill
    const map = MAPS.find((m) => m.id === 'beacon_hill') as Scenario;
    const hm = halve({ ...map, spawns: [] });
    const g = map.grid;
    const diff: string[] = [];
    for (let ay = 0; ay < g.height; ay += 3)
      for (let ax = 0; ax < g.width; ax += 3) {
        const A = { x: ax, y: ay };
        if (!canStand(tileAt(g, A))) continue;
        const s = stateOf([{ id: 'a', def: 't-all', team: 'hero', ...A }]);
        const hs = halfState(s);
        for (let y = 0; y < g.height; y++)
          for (let x = 0; x < g.width; x++) {
            const B = { x, y };
            if (posKey(B) === posKey(A)) continue;
            const w = previewAbility(g, s, 'a', 'blast', B);
            const want = w.ok ? posKey(cell(w.center)) : w.reason;
            for (const p of cellsOf(cell(B), 2)) {
              const h = previewAbility(hm.grid, hs, 'a', 'blast', p);
              const got = h.ok ? posKey(h.center) : h.reason;
              if (want !== got) diff.push(`${posKey(A)} -> ${posKey(p)} whole ${want} half ${got}`);
            }
          }
      }
    expect(diff.slice(0, 5)).toEqual([]);
  }, 30000);
});

describe('half tiles: line of sight between tiles and against big units', () => {
  it('a shooter between tiles does not lose a target on a ledge to the ledge it stands on', () => {
    // flat ground up to a ledge of 5 on the last tile: from tile 0 the whole map sees the target up there
    const sc = split(gridOf(['....', '....'], ['0005', '0005']), 't-ledge', [
      { id: 'a', def: 'archer', team: 'hero', x: 0, y: 0 },
      { id: 'b', def: 'soldier', team: 'enemy', x: 0, y: 0 },
    ]);
    for (const x of [0, 1]) {
      const s = stateOf([
        { id: 'a', def: `archer${HALF}`, team: 'hero', x, y: 0 },
        { id: 'b', def: `soldier${HALF}`, team: 'enemy', x: 6, y: 0 },
      ]);
      const p = previewAbility(sc.grid, s, 'a', 'shot', { x: 6, y: 0 });
      expect(p.ok && p.targets.map((t) => t.unit), `shooter at ${x}`).toEqual(['b']);
    }
  });

  it('the Colossus sees and is seen from the same tiles as on the whole map', () => {
    UNIT_DEFS['t-all'] = { ...UNIT_DEFS.warrior, id: 't-all', abilities: Object.keys(ABILITIES) };
    const map = MAPS.find((m) => m.id === 'frost_pass') as Scenario;
    const hm = halve({ ...map, spawns: [{ id: 'c', def: 'colossus', team: 'enemy', x: 0, y: 0 }] });
    const g = map.grid;
    const sighted = Object.keys(ABILITIES).filter((id) => ABILITIES[id].needsSight);
    const fits = (p: Pos) => cellsOf(p, 2).every((c) => c.x < g.width && c.y < g.height && canStand(tileAt(g, c)));
    const diff: string[] = [];
    for (let cy = 0; cy < g.height; cy += 4)
      for (let cx = 0; cx < g.width; cx += 4) {
        const C = { x: cx, y: cy };
        if (!fits(C)) continue;
        for (let y = 0; y < g.height; y++)
          for (let x = 0; x < g.width; x++) {
            const A = { x, y };
            if (!canStand(tileAt(g, A)) || cellsOf(C, 2).some((c) => posKey(c) === posKey(A))) continue;
            const s = stateOf([
              { id: 'a', def: 't-all', team: 'hero', ...A },
              { id: 'c', def: 'colossus', team: 'enemy', ...C },
            ]);
            const hs = halfState(s);
            const say = (p: ReturnType<typeof previewAbility>) =>
              p.ok ? p.targets.map((t) => `${t.unit}:${t.chance}`).join(',') : 'out';
            // aimed at its tile nearest to the shooter, where both maps measure the range alike
            const T = cellsOf(C, 2).reduce((p, q) => (dist(q, A) < dist(p, A) ? q : p));
            for (const id of sighted) {
              const w = say(previewAbility(g, s, 'a', id, T));
              const h = say(previewAbility(hm.grid, hs, 'a', id, cell(T)));
              if (w !== h) diff.push(`${id} ${posKey(A)} -> ${posKey(T)} whole ${w} half ${h}`);
            }
          }
      }
    expect(diff.slice(0, 5)).toEqual([]);
  }, 30000);
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

  it('flies a gap whose first cell is a drop deeper than the jump', () => {
    // Crypt Heart: from the island (height 3) over the canal (0) to the floor at 1, as the whole map's leap does; the square
    // half over the canal edge (3 against 0) cannot stand, and that used to cancel the gap
    const map = MAPS.find((m) => m.id === 'crypt_heart') as Scenario;
    const hm = halve(map);
    const whole = reachable(map.grid, stateOf([{ id: 'r', def: 'rogue', team: 'hero', x: 3, y: 6 }]), 'r');
    const half = reachable(hm.grid, stateOf([{ id: 'r', def: `rogue${HALF}`, team: 'hero', x: 6, y: 12 }]), 'r');
    expect(whole.get('3,8')?.cost).toBe(2);
    expect(half.get(posKey(cell({ x: 3, y: 8 })))?.cost).toBe(4);
  });
});

describe('half tiles: the AI walking map', () => {
  // the AI's distance on foot follows the token's square, not a 1-cell walker that slips through gaps a 2x2 cannot (Nov 14
  // review: 192 of 400 Beacon Hill tiles came out 1 or 2 tiles shorter for the hero h0). With jump 2 the token may also fly
  // a single cell and land straddling a bank, which no whole tile can, so it is only never farther
  for (const map of MAPS) {
    it(`${map.id}: every whole tile is twice as far in cells`, () => {
      const hm = halve(map);
      const ws = initialState(map, 1),
        hs = initialState(hm, 1);
      for (const u of ws.units) {
        if (!UNIT_DEFS[u.def].move) continue;
        const w = walkMap(map.grid, ws, u);
        const h = walkMap(hm.grid, hs, hs.units.find((x) => x.id === u.id) as UnitState);
        const flies = jumpOf(ws, u.def) >= 2;
        const diff: string[] = [];
        for (let y = 0; y < map.grid.height; y++)
          for (let x = 0; x < map.grid.width; x++) {
            const p = { x, y };
            const want = w.has(posKey(p)) ? 2 * (w.get(posKey(p)) as number) : undefined;
            const got = h.get(posKey(cell(p)));
            const ok = want === got || (flies && want !== undefined && got !== undefined && got <= want);
            if (!ok) diff.push(`${posKey(p)} whole ${want} half ${got}`);
          }
        expect(diff.slice(0, 5), `${u.id}`).toEqual([]);
      }
    });
  }
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

describe('half tiles: a turn through the interface (stage 0 is what Fernando plays)', () => {
  it('moves the token to a cell between tiles and undoes the move for free', () => {
    const b = Battle.start(halve(chapterScenario(0)), 7);
    while (b.actor.team !== 'hero') playAiTurn(b);
    const from = { ...b.actor.pos };
    const odd = [...b.reach().values()].find((s) => s.pos.x % 2 === 1)!.pos;
    const ui = tapTile(b, selectMode(b, freshUi(b), { k: 'move' }), odd);
    const { events } = confirm(b, ui);
    const move = events.find((e) => e.k === 'move');
    expect(b.actor.pos).toEqual(odd);
    // one cell per step: the walk animation reads the path
    if (move?.k === 'move')
      for (let i = 1; i < move.path.length; i++) expect(dist(move.path[i - 1], move.path[i])).toBe(1);
    const undos = b.undosLeft;
    expect(b.undo()).toBe(true);
    expect(b.actor.pos).toEqual(from);
    expect(b.undosLeft).toBe(undos);
  });

  it('attacks a token from any of its cells, undoes the attack and keeps the save', () => {
    const sc = split(gridOf(Array(6).fill('......')), 't-turn', [
      { id: 'a', def: 'warrior', team: 'hero', x: 1, y: 1 },
      { id: 'b', def: 'soldier', team: 'enemy', x: 2, y: 1 },
    ]);
    const b = Battle.start(sc, HIT_SEED);
    while (b.actor.id !== 'a') playAiTurn(b);
    const foe = () => b.state.units.find((u) => u.id === 'b')!;
    const hp = foe().hp;
    // the far cell of the enemy square: the attack still reaches, measured between the closest cells
    const far = { x: foe().pos.x + 1, y: foe().pos.y + 1 };
    const ui = tapTile(b, selectMode(b, freshUi(b), { k: 'ability', id: 'strike' }), far);
    expect(ui.pending).toEqual(far);
    const { events } = confirm(b, ui);
    expect(events.some((e) => e.k === 'hit' || e.k === 'miss')).toBe(true);
    expect(Battle.load(b.save())?.state).toEqual(b.state);
    expect(b.undo()).toBe(true);
    expect(foe().hp).toBe(hp);
  });

  it('the AI plays its turns on the split stage, walking cell by cell, and the save loads back', () => {
    const b = Battle.start(halve(chapterScenario(0)), 11);
    for (let turn = 0; turn < 6; turn++) {
      for (const e of playAiTurn(b))
        if (e.k === 'move')
          for (let i = 1; i < e.path.length; i++) expect(dist(e.path[i - 1], e.path[i])).toBeLessThanOrEqual(4); // 1, or a gap
      expect(Battle.load(b.save())?.state).toEqual(b.state);
    }
  });
});
