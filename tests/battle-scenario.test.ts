import { describe, expect, it } from 'vitest';
import { neighbors, posKey, tileAt, TERRAIN } from '../src/shared/battle/grid.ts';
import { MAX_JUMP } from '../src/shared/battle/pathing.ts';
import { FIRST_BATTLE, SCENARIOS } from '../src/shared/battle/scenarios.ts';
import { OBJECTIVE_DEF } from '../src/shared/battle/units.ts';

// Marco 3 (liberado pelo Fernando em 11/11): a 1ª batalha de verdade, como a spec pede
describe('cenário da 1ª batalha', () => {
  const s = FIRST_BATTLE;
  const defs = (team: string) => s.spawns.filter((u) => u.team === team && u.def !== OBJECTIVE_DEF).map((u) => u.def).sort();

  it('é o mapa 20x20 e está na lista de cenários', () => {
    expect([s.grid.width, s.grid.height]).toEqual([20, 20]);
    expect(SCENARIOS[s.id]).toBe(s);
  });

  it('tem os 4 heróis, o alvo a proteger e os 4 tipos de inimigo', () => {
    expect(defs('hero')).toEqual(['archer', 'mage', 'rogue', 'warrior']);
    expect(s.spawns.filter((u) => u.def === OBJECTIVE_DEF)).toHaveLength(1);
    expect([...new Set(defs('enemy'))]).toEqual(['brute', 'dark_mage', 'skeleton_archer', 'soldier']);
  });

  it('cada unidade nasce numa casa própria onde se pode pisar', () => {
    expect(new Set(s.spawns.map((u) => posKey({ x: u.x, y: u.y }))).size).toBe(s.spawns.length);
    for (const u of s.spawns) expect(TERRAIN[tileAt(s.grid, { x: u.x, y: u.y }).terrain].walkable, u.id).toBe(true);
  });

  it('todo mundo consegue chegar em todo mundo a pé (salto máximo de 1 nível)', () => {
    const start = s.spawns[0];
    const seen = new Set([posKey({ x: start.x, y: start.y })]);
    const todo = [{ x: start.x, y: start.y }];
    for (let p = todo.pop(); p; p = todo.pop()) {
      for (const n of neighbors(s.grid, p)) {
        const t = tileAt(s.grid, n);
        if (seen.has(posKey(n)) || !TERRAIN[t.terrain].walkable || Math.abs(t.h - tileAt(s.grid, p).h) > MAX_JUMP) continue;
        seen.add(posKey(n));
        todo.push(n);
      }
    }
    for (const u of s.spawns) expect(seen.has(posKey({ x: u.x, y: u.y })), u.id).toBe(true);
  });
});
