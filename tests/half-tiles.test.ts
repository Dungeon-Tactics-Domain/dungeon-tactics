import { describe, expect, it, vi } from 'vitest';
import { DEV_KEY, DEV_SCENARIO, defaultSetup } from '../src/client/dev-roster.ts';
import { selectBattle } from '../src/client/game/boot.ts';
import { confirm, freshUi, selectMode, tapTile } from '../src/client/interaction.ts';
import { store } from '../src/client/store.ts';
import { ABILITIES } from '../src/shared/battle/abilities.ts';
import { chooseTurn, playAiTurn, walkMap } from '../src/shared/battle/ai.ts';
import { Battle } from '../src/shared/battle/battle.ts';
import { COMBAT, checkOutcome, previewAbility, resolveAbility, simulatePush } from '../src/shared/battle/combat.ts';
import { registerFftStudy } from '../src/shared/battle/fft/gariland.ts';
import {
  canStand,
  dist,
  FACING,
  type Grid,
  posKey,
  subOf,
  type Tile,
  tileAt,
  withRamps,
} from '../src/shared/battle/grid.ts';
import { halve, registerHalf } from '../src/shared/battle/half.ts';
import { cellsOf, reachable, restsOn, squareMoves } from '../src/shared/battle/pathing.ts';
import { initialState, MAPS, SCENARIOS, type Scenario } from '../src/shared/battle/scenarios.ts';
import { simulate } from '../src/shared/battle/simulate.ts';
import type { BattleState, Pos, UnitState } from '../src/shared/battle/types.ts';
import { baseDef, HALF, UNIT_DEFS } from '../src/shared/battle/units.ts';
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

  // Nov 15, Fernando: "the move and jump values double; 1 per half tile". Drawn in cells: a token with jump J flies up to
  // J cells of gap, 1 movement point per cell it moves, and climbs and drops by height levels as before
  const hops = (heights: string, jump: number) => {
    const g: Grid = { ...gridOf([heights.replace(/./g, '.'), heights.replace(/./g, '.')], [heights, heights]), sub: 2 };
    return squareMoves(g, { x: 0, y: 0 }, 2, jump, () => false).filter((m) => m.to.x > 1);
  };

  it('flies up to as many cells of gap as its jump', () => {
    // a gap of 3 cells, 2 levels below both banks
    expect(hops('22000222', 2)).toEqual([]);
    expect(hops('22000222', 3)).toEqual([{ to: { x: 5, y: 0 }, cost: 5 }]);
    // a single cell: jump 1 flies it (on whole tiles jump 1 flies nothing, and no whole-tile gap is 1 cell wide)
    expect(hops('22022', 1)).toEqual([{ to: { x: 3, y: 0 }, cost: 3 }]);
  });

  it('lands level, wholly past the gap', () => {
    // Flooded Crypt: from the ledge at 3 over the trench at 1 to the floor at 2. A 1-cell hop landed half in the trench
    expect(hops('331122', 1)).toEqual([]);
    expect(hops('331122', 2)).toEqual([{ to: { x: 4, y: 0 }, cost: 4 }]);
  });
});

describe('half tiles: where a token may stop', () => {
  // Nov 14, Fernando, playing stage 0: "it must not let the character stand still on a corner like that" (a hero hovering
  // over a ledge). A stop's 4 cells are the same ground; between tiles, no ramp cell under it
  const even = (g: Grid, p: Pos) => {
    const ts = cellsOf(p, 2).map((c) => tileAt(g, c));
    const kind = (t: Tile) => `${t.h},${t.depth ?? 0},${!!t.spikes},${t.terrain}`;
    return ts.every((t) => kind(t) === kind(ts[0]) && (!t.ramp || (p.x % 2 === 0 && p.y % 2 === 0)));
  };
  for (const map of MAPS) {
    it(`${map.id}: every stop of every spawn is even ground`, () => {
      const hm = halve(map);
      const hs = initialState(hm, 1);
      const bad = hs.units.flatMap((u) =>
        [...reachable(hm.grid, hs, u.id).values()]
          .filter((s) => !even(hm.grid, s.pos))
          .map((s) => `${u.id} ${posKey(s.pos)}`),
      );
      expect(bad).toEqual([]);
    });
  }

  // a warrior token (move 8 cells, jump 1) from the corner cell of a small split map
  const reachOn = (whole: Grid, at: Pos = { x: 0, y: 0 }) =>
    reachable(split(whole, 't-stops').grid, stateOf([{ id: 'u', def: `warrior${HALF}`, team: 'hero', ...at }]), 'u');

  it('does not stop on a ledge corner or across a step, but walks over them', () => {
    // the high tile (2,2) touches the square between tiles (3,3) at one corner; row 0 climbs a step of 1 at tile 2
    const r = reachOn(gridOf(['...', '...', '...'], ['001', '000', '001']));
    expect(r.has('3,3')).toBe(false); // 3 cells at 0, 1 at 1
    expect(r.has('3,0')).toBe(false); // across the step
    expect(r.has('4,0')).toBe(true); // on the step's tile, through the square across it
    expect(r.get('4,0')?.path?.some((p) => posKey(p) === '3,0')).toBe(true);
    expect(r.has('1,1')).toBe(true); // between flat tiles of one height it still stops
  });

  it('stops on a ramp only on its own tile', () => {
    // tile (1,0) is a ramp up to (2,0); between it and the flat tile below, one cell is the slope
    const r = reachOn(withRamps(gridOf(['...', '...'], ['001', '001']), ['.>.', '...']));
    expect(r.has('2,0')).toBe(true);
    expect(r.has('2,1')).toBe(false);
    expect(r.has('3,0')).toBe(false); // ramp's top cell against the tile above
  });

  it('does not stop with one corner on spikes or in deep water', () => {
    const whole = gridOf(['...', '...', '...']);
    whole.tiles[4] = { ...whole.tiles[4], spikes: true };
    whole.tiles[2] = { ...whole.tiles[2], depth: 1 };
    whole.tiles[6] = { ...whole.tiles[6], depth: 2 };
    const r = reachOn(whole);
    expect(r.has('1,1')).toBe(false); // spikes on one corner
    expect(r.has('2,2')).toBe(true); // on the spike tile, as on the whole map
    expect(r.has('3,0')).toBe(true); // half in the shallow water: it stands like dry ground
    expect(r.has('4,0')).toBe(true);
    expect(r.has('1,3')).toBe(false); // half in the deep water
    expect(r.has('0,4')).toBe(true);
  });

  it('a token left on a corner can still walk off it', () => {
    const r = reachOn(gridOf(['...', '...', '...'], ['001', '000', '001']), { x: 3, y: 3 });
    expect(r.has('2,2')).toBe(true);
  });
});

describe('half tiles: the AI walking map', () => {
  // the AI's distance on foot follows the token's square, not a 1-cell walker that slips through gaps a 2x2 cannot (Nov 14
  // review: 192 of 400 Beacon Hill tiles came out 1 or 2 tiles shorter for the hero h0). Since Nov 15 a gap lands level,
  // wholly past it, so the token no longer flies a single cell to land straddling a bank and every whole tile is exactly
  // twice as far, jump 2 included (it used to come out up to 1 tile nearer)
  for (const map of MAPS) {
    it(`${map.id}: every whole tile is twice as far in cells`, () => {
      const hm = halve(map);
      const ws = initialState(map, 1),
        hs = initialState(hm, 1);
      for (const u of ws.units) {
        if (!UNIT_DEFS[u.def].move) continue;
        const w = walkMap(map.grid, ws, u);
        const h = walkMap(hm.grid, hs, hs.units.find((x) => x.id === u.id) as UnitState);
        const diff: string[] = [];
        for (let y = 0; y < map.grid.height; y++)
          for (let x = 0; x < map.grid.width; x++) {
            const p = { x, y };
            const want = w.has(posKey(p)) ? 2 * (w.get(posKey(p)) as number) : undefined;
            const got = h.get(posKey(cell(p)));
            if (want !== got) diff.push(`${posKey(p)} whole ${want} half ${got}`);
          }
        expect(diff.slice(0, 5), `${u.id}`).toEqual([]);
      }
    });
  }
});

describe('half tiles: the AI position score', () => {
  it('does not stop a token that the spikes would kill with any cell on them', () => {
    // spikes from tile 2 to 7; the enemy far beyond. Read at the top-left cell only, the corner 1 cell before the band
    // looked safe while the token's right column stood on the spikes (Nov 14 review)
    const whole = gridOf(['..........', '..........']);
    whole.tiles.forEach((t, i) => {
      if (i % 10 >= 2 && i % 10 <= 7) t.spikes = true;
    });
    const sc = split(whole, 't-spikes', [
      { id: 'b', def: 'brute', team: 'enemy', x: 0, y: 0 },
      { id: 'w', def: 'warrior', team: 'hero', x: 0, y: 0 },
    ]);
    const s = stateOf([
      { id: 'b', def: `brute${HALF}`, team: 'enemy', x: 0, y: 0, hp: 5 },
      { id: 'w', def: `warrior${HALF}`, team: 'hero', x: 18, y: 0 },
    ]);
    const to = chooseTurn(sc.grid, s, 'b').moveTo ?? { x: 0, y: 0 };
    expect(cellsOf(to, 2).filter((c) => tileAt(sc.grid, c).spikes)).toEqual([]);
  });
});

describe('half tiles: push', () => {
  it('a shot stopped by a token between tiles pushes it away from the shooter', () => {
    // shooting down column 0 at a target 4 tiles below; a Brute half a tile to the right stands in the way. The probe square
    // that meets it has its corner outside the Brute, and the push read the direction from that square (Nov 14 review)
    const sc = split(gridOf(Array(8).fill('....')), 't-knock', [
      { id: 'a', def: 't-all', team: 'hero', x: 0, y: 0 },
      { id: 'x', def: 'brute', team: 'enemy', x: 0, y: 0 },
      { id: 't', def: 'soldier', team: 'enemy', x: 0, y: 0 },
    ]);
    const s = stateOf(
      [
        { id: 'a', def: `t-all${HALF}`, team: 'hero', x: 0, y: 0 },
        { id: 'x', def: `brute${HALF}`, team: 'enemy', x: 1, y: 3 },
        { id: 't', def: `soldier${HALF}`, team: 'enemy', x: 0, y: 8 },
      ],
      HIT_SEED,
    );
    const events = resolveAbility(sc.grid, s, 'a', 'knock_shot', { x: 0, y: 8 });
    expect(events.find((e) => e.k === 'hit')).toMatchObject({ unit: 'x' });
    expect(s.units.find((u) => u.id === 'x')?.pos).toEqual({ x: 1, y: 5 });
  });

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

  // Nov 15, Fernando: a push that would leave the token on uneven ground "tie-breaks by making the guy fall, or hit a wall"
  const pushOn = (heights: string, at: number, steps: number, more: Parameters<typeof stateOf>[0] = []) => {
    const whole = gridOf(['.'.repeat(heights.length), '.'.repeat(heights.length)], [heights, heights]);
    const g = split(whole, 't-uneven').grid;
    const s = stateOf([{ id: 'b', def: `soldier${HALF}`, team: 'enemy', x: at, y: 0 }, ...more]);
    const b = s.units[0];
    return simulatePush(g, s, b, b.pos, { x: at - 2, y: 0 }, steps);
  };

  it('falls off the ledge onto the lower tile when the push ends over the drop', () => {
    // between the two tiles at 3, pushed 1 tile: the square ends half over the drop and falls onto the tile at 0
    const r = pushOn('3300', 1, 1);
    expect(r.to).toEqual({ x: 4, y: 0 });
    expect(r.dmg).toBe(2 * COMBAT.FALL_DAMAGE); // 3 levels: 3 - 1 past the free one, no bump
    expect(r.events.map((e) => e.k)).toEqual(['push', 'push', 'push', 'fall']);
  });

  it('goes back to where it last rested, bumped, when it cannot fall', () => {
    // up a step of 1: half on the step is not even ground, and climbing onto it is not a fall
    const up = pushOn('001', 1, 1);
    expect(up.to).toEqual({ x: 2, y: 0 });
    expect(up.dmg).toBe(COMBAT.BUMP_DAMAGE);
    expect(up.events.map((e) => e.k)).toEqual(['push', 'bump']);
    // a unit below the ledge holds the fall: back onto the high tile
    const held = pushOn('1100', 1, 1, [{ id: 'x', def: `soldier${HALF}`, team: 'enemy', x: 5, y: 0 }]);
    expect(held.to).toEqual({ x: 2, y: 0 });
    expect(held.events.map((e) => e.k)).toEqual(['push', 'bump']);
  });

  // floor, floor, rubble, floor: level ground where only the terrain keeps a square between tiles 1 and 2 from resting
  const pushOnRubble = (at: number, more: Parameters<typeof stateOf>[0] = []) => {
    const whole = gridOf(['....', '....']);
    for (const y of [0, 1]) whole.tiles[y * 4 + 2].terrain = 'rubble';
    const g = split(whole, 't-rubble').grid;
    const s = stateOf([{ id: 'b', def: `soldier${HALF}`, team: 'enemy', x: at, y: 0 }, ...more]);
    return simulatePush(g, s, s.units[0], s.units[0].pos, { x: at - 2, y: 0 }, 1);
  };

  it('goes 1 more cell, unhurt, when only the terrain kept a level square from resting', () => {
    // Fernando after the review (Nov 15): before, it went back a cell and took the bump (633 of the 24,840 pushes the review tried)
    const r = pushOnRubble(1);
    expect(r.to).toEqual({ x: 4, y: 0 });
    expect(r.dmg).toBe(0);
    expect(r.events.map((e) => e.k)).toEqual(['push', 'push', 'push']);
  });

  it('a square that started uneven and is held stays where it was, bumped', () => {
    // a sandbox placement or an old save between floor and rubble; a unit right ahead holds the push
    const r = pushOnRubble(3, [{ id: 'x', def: `soldier${HALF}`, team: 'enemy', x: 5, y: 0 }]);
    expect(r.to).toEqual({ x: 3, y: 0 });
    expect(r.events.map((e) => e.k)).toEqual(['bump']);
  });

  for (const map of MAPS) {
    it(`${map.id}: a push from any stop never ends on uneven ground`, () => {
      const hm = halve(map);
      const hs = initialState(hm, 1);
      const bad: string[] = [];
      for (const u of hs.units) {
        if (!UNIT_DEFS[u.def].move) continue;
        for (const { pos } of reachable(hm.grid, hs, u.id).values())
          for (const d of FACING)
            for (const steps of [1, 2, 3]) {
              const s = structuredClone(hs);
              const v = s.units.find((x) => x.id === u.id) as UnitState;
              v.pos = pos;
              const r = simulatePush(hm.grid, s, v, pos, { x: pos.x - 2 * d.x, y: pos.y - 2 * d.y }, steps);
              if (!restsOn(hm.grid, r.to, 2))
                bad.push(`${u.id} ${posKey(pos)} ${d.x},${d.y} x${steps} -> ${posKey(r.to)}`);
            }
      }
      expect(bad.slice(0, 5)).toEqual([]);
    }, 30000);
  }
});

describe('half tiles: the test map', () => {
  it('plants its trees and props without touching Ash Wood on half tiles', () => {
    // registerHalf used to write into the grid halve(ash_wood) registered (Nov 14 review)
    registerHalf();
    const after = SCENARIOS[`ash_wood${HALF}`].grid;
    expect(after).toEqual(halve(SCENARIOS.ash_wood).grid);
  });
});

describe('half tiles: saves', () => {
  it('a split battle save does not load with whole-tile sheets', () => {
    // an edited save (Nov 14 review): 1-cell units on the split map measured range from a single cell
    const b = Battle.start(halve(SCENARIOS.ash_wood), 1);
    expect(Battle.load(b.save())).not.toBeNull();
    const raw = JSON.parse(b.save());
    raw.state.units = raw.state.units.map((u: UnitState) => ({ ...u, def: baseDef(u.def) }));
    expect(Battle.load(JSON.stringify(raw))).toBeNull();
  });
});

describe('half tiles: whole battles', () => {
  it('the Beacon of a split map still loses the battle when it falls', () => {
    const hill = halve(MAPS[1]);
    const s = initialState(hill, 1);
    expect(checkOutcome(s)).toBe('ongoing');
    expect(checkOutcome({ ...s, units: s.units.filter((u) => !u.def.startsWith('beacon')) })).toBe('defeat');
  });

  it('a developer battle on the Gariland map opens and plays on half tiles', async () => {
    // Nov 15, Fernando: no whole-tile battle left in the game; the developer menu's Gariland map was the last one.
    // Through the boot's real path (boot.ts has no DOM or Three): the address and the saved roster
    // the roster the menu saved (the title registers the study for the menu); a fresh page has no study registered
    registerFftStudy();
    store.set(DEV_KEY, JSON.stringify(defaultSetup('fft-gariland')));
    delete SCENARIOS['fft-gariland'];
    vi.stubGlobal('location', { search: `?scenario=${DEV_SCENARIO}` });
    try {
      const sel = await selectBattle();
      if (!sel) throw new Error('no battle');
      expect(sel.scenario.id).toBe(`${DEV_SCENARIO}${HALF}`);
      expect(subOf(sel.scenario.grid)).toBe(2);
      expect(sel.scenario.spawns.every((s) => s.def.endsWith(HALF))).toBe(true);
      expect(simulate(sel.scenario, 3).outcome).not.toBe('timeout');
    } finally {
      vi.unstubAllGlobals();
    }
  }, 30000);

  it('every game map plays to the end on half tiles', () => {
    for (const m of MAPS) expect(simulate(halve(m), 3).outcome, m.id).not.toBe('timeout');
  }, 60000);
});

describe('half tiles: a turn through the interface (on Ash Wood)', () => {
  it('moves the token to a cell between tiles and undoes the move for free', () => {
    const b = Battle.start(halve(SCENARIOS.ash_wood), 7);
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

  it('the AI plays its turns on the split map, walking cell by cell, and the save loads back', () => {
    const b = Battle.start(halve(SCENARIOS.ash_wood), 11);
    for (let turn = 0; turn < 6; turn++) {
      for (const e of playAiTurn(b))
        if (e.k === 'move')
          for (let i = 1; i < e.path.length; i++) expect(dist(e.path[i - 1], e.path[i])).toBeLessThanOrEqual(4); // 1, or a gap
      expect(Battle.load(b.save())?.state).toEqual(b.state);
    }
  });
});
