import { describe, expect, it } from 'vitest';
import { neighbors, posKey, tileAt, TERRAIN } from '../src/shared/battle/grid.ts';
import { MAX_JUMP } from '../src/shared/battle/pathing.ts';
import { FIRST_BATTLE, SCENARIOS } from '../src/shared/battle/scenarios.ts';
import { OBJECTIVE_DEF } from '../src/shared/battle/units.ts';

// Milestone 3 (approved by Fernando on Nov 11): the first real battle, as the spec asks
describe('1st battle scenario', () => {
  const s = FIRST_BATTLE;
  const defs = (team: string) =>
    s.spawns
      .filter((u) => u.team === team && u.def !== OBJECTIVE_DEF)
      .map((u) => u.def)
      .sort();

  it('is the 20x20 map and is in the scenario list', () => {
    expect([s.grid.width, s.grid.height]).toEqual([20, 20]);
    expect(SCENARIOS[s.id]).toBe(s);
  });

  it('has the 4 heroes, the target to protect and the 4 enemy types', () => {
    expect(defs('hero')).toEqual(['archer', 'mage', 'rogue', 'warrior']);
    expect(s.spawns.filter((u) => u.def === OBJECTIVE_DEF)).toHaveLength(1);
    expect([...new Set(defs('enemy'))]).toEqual(['brute', 'dark_mage', 'skeleton_archer', 'soldier']);
  });

  it('each unit spawns on its own tile where one can step', () => {
    expect(new Set(s.spawns.map((u) => posKey({ x: u.x, y: u.y }))).size).toBe(s.spawns.length);
    for (const u of s.spawns) expect(TERRAIN[tileAt(s.grid, { x: u.x, y: u.y }).terrain].walkable, u.id).toBe(true);
  });

  it('everyone can reach everyone on foot (max jump of 1 level)', () => {
    const start = s.spawns[0];
    const seen = new Set([posKey({ x: start.x, y: start.y })]);
    const todo = [{ x: start.x, y: start.y }];
    for (let p = todo.pop(); p; p = todo.pop()) {
      for (const n of neighbors(s.grid, p)) {
        const t = tileAt(s.grid, n);
        if (seen.has(posKey(n)) || !TERRAIN[t.terrain].walkable || Math.abs(t.h - tileAt(s.grid, p).h) > MAX_JUMP)
          continue;
        seen.add(posKey(n));
        todo.push(n);
      }
    }
    for (const u of s.spawns) expect(seen.has(posKey({ x: u.x, y: u.y })), u.id).toBe(true);
  });
});
