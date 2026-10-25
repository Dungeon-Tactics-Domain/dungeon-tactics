import type { AbilityDef } from './abilities.ts';
import { TERRAIN, dist, neighbors, posKey, samePos, tileAt, type Grid } from './grid.ts';
import type { BattleState, Pos, UnitState } from './types.ts';
import { UNIT_DEFS } from './units.ts';

// Subir ou descer mais que isso num passo bloqueia (spec, 25/10). Igual para todos: nada de salto por classe na 1ª fatia.
export const MAX_JUMP = 1;
// Altura dos olhos e do ponto de mira acima do chão da casa, em níveis. Com blocks do terreno decide quem enxerga por cima.
const EYE = 1;

export const unitAt = (state: BattleState, p: Pos): UnitState | undefined => state.units.find((u) => samePos(u.pos, p));

export interface Step {
  pos: Pos;
  cost: number;
  from: string | null; // chave da casa anterior
}

// Busca em largura (custo 1 por passo) até def.move casas. Passa por aliado, nunca por inimigo; o resultado não inclui
// a casa de saída nem casas ocupadas, para o cliente poder pintar só onde dá para parar.
export function reachable(grid: Grid, state: BattleState, unitId: string): Map<string, Step> {
  const unit = state.units.find((u) => u.id === unitId)!;
  const budget = UNIT_DEFS[unit.def].move;
  const seen = new Map<string, Step>([[posKey(unit.pos), { pos: unit.pos, cost: 0, from: null }]]);
  const queue: Pos[] = [unit.pos];
  for (let i = 0; i < queue.length; i++) {
    const cur = queue[i];
    const cost = seen.get(posKey(cur))!.cost;
    if (cost === budget) continue;
    for (const n of neighbors(grid, cur)) {
      const k = posKey(n);
      if (seen.has(k)) continue;
      const to = tileAt(grid, n);
      if (!TERRAIN[to.terrain].walkable || Math.abs(to.h - tileAt(grid, cur).h) > MAX_JUMP) continue;
      const other = unitAt(state, n);
      if (other && other.team !== unit.team) continue;
      seen.set(k, { pos: n, cost: cost + 1, from: posKey(cur) });
      queue.push(n);
    }
  }
  seen.delete(posKey(unit.pos));
  for (const [k, step] of seen) if (unitAt(state, step.pos)) seen.delete(k);
  return seen;
}

// Caminho até `target` pelas casas de saída guardadas em `reach`, sem a casa inicial; null se não alcança.
// A casa de saída não está em `reach`: o laço termina quando `from` não é mais encontrado.
export function pathTo(reach: Map<string, Step>, target: Pos): Pos[] | null {
  let step = reach.get(posKey(target));
  if (!step) return null;
  const path: Pos[] = [];
  while (step) {
    path.unshift(step.pos);
    step = step.from ? reach.get(step.from) : undefined;
  }
  return path;
}

// Linha de visão na grade: percorre as casas entre os dois pontos (Bresenham) e compara a altura da linha, que vai do olho
// de quem olha até o ponto de mira do alvo, com o topo de cada casa (altura + o quanto o terreno tapa). Roda sem Three e é
// determinística, ao contrário da amostragem 3D da POC.
export function lineOfSight(grid: Grid, a: Pos, b: Pos): boolean {
  const total = dist(a, b);
  if (total <= 1) return true;
  const eye = tileAt(grid, a).h + EYE;
  const aim = tileAt(grid, b).h + EYE;
  let x = a.x, y = a.y;
  const dx = Math.abs(b.x - a.x), dy = -Math.abs(b.y - a.y);
  const sx = a.x < b.x ? 1 : -1, sy = a.y < b.y ? 1 : -1;
  let err = dx + dy;
  for (;;) {
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x += sx; }
    if (e2 <= dx) { err += dx; y += sy; }
    if (x === b.x && y === b.y) return true;
    const t = tileAt(grid, { x, y });
    // fração pelo avanço em passos de grade, não pelo índice do laço, que na diagonal anda 1 casa por iteração
    const frac = dist(a, { x, y }) / total;
    if (t.h + TERRAIN[t.terrain].blocks > eye + (aim - eye) * frac) return false;
  }
}

// alcance máximo contra uma casa: +1 por nível acima do alvo para quem tem heightRange
export function maxRange(grid: Grid, ability: AbilityDef, from: Pos, to: Pos): number {
  const up = ability.heightRange ? Math.max(0, tileAt(grid, from).h - tileAt(grid, to).h) : 0;
  return ability.range[1] + up;
}

export function inAbilityRange(grid: Grid, ability: AbilityDef, from: Pos, to: Pos): boolean {
  const d = dist(from, to);
  return d >= ability.range[0] && d <= maxRange(grid, ability, from, to);
}
