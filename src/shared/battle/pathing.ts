import type { AbilityDef } from './abilities.ts';
import { TERRAIN, canStand, dist, neighbors, posKey, samePos, standH, stepCost, tileAt, type Grid } from './grid.ts';
import { rulesOf } from './rules.ts';
import type { BattleState, Pos, UnitState } from './types.ts';
import { UNIT_DEFS } from './units.ts';

// Salto de quem não diz o seu (UnitDef.jump): subir ou descer mais que isso num passo bloqueia (spec, 25/10). Desde 13/11
// cada classe pode ter o seu, como no FFT; o estudo do FFT troca pela regra própria (rules.jump)
export const MAX_JUMP = 1;
export const jumpOf = (state: BattleState, def: string) => rulesOf(state).jump?.(def) ?? UNIT_DEFS[def]?.jump ?? MAX_JUMP;
// Altura dos olhos e do ponto de mira acima do chão da casa, em níveis. Com blocks do terreno decide quem enxerga por cima.
const EYE = 1;

// Unidade grande (UnitDef.size, noite de 12/11: o chefe que ocupa 2x2): `pos` é a casa de cima à esquerda do quadrado.
// Toda pergunta "quem está nesta casa" passa por aqui, então andar, bloquear e mirar valem para as 4 casas.
export function footprint(u: UnitState): Pos[] {
  const size = UNIT_DEFS[u.def].size ?? 1;
  const out: Pos[] = [];
  for (let dy = 0; dy < size; dy++) for (let dx = 0; dx < size; dx++) out.push({ x: u.pos.x + dx, y: u.pos.y + dy });
  return out;
}
// distância até a casa mais perto da unidade (alcance, área e acerto contra o chefe grande)
export const distTo = (u: UnitState, p: Pos) => Math.min(...footprint(u).map((f) => dist(f, p)));
export const nearestTile = (u: UnitState, p: Pos): Pos => footprint(u).reduce((a, b) => (dist(b, p) < dist(a, p) ? b : a));

export const unitAt = (state: BattleState, p: Pos): UnitState | undefined => state.units.find((u) => footprint(u).some((f) => samePos(f, p)));

export interface Step {
  pos: Pos;
  cost: number;
  from: string | null; // chave da casa anterior
}

// Busca pelo custo de cada passo (1, ou 2 na água rasa) até def.move pontos. Passa por aliado, nunca por inimigo; o resultado não inclui
// a casa de saída nem casas ocupadas, para o cliente poder pintar só onde dá para parar.
export function reachable(grid: Grid, state: BattleState, unitId: string): Map<string, Step> {
  const unit = state.units.find((u) => u.id === unitId)!;
  const budget = UNIT_DEFS[unit.def].move;
  const jump = jumpOf(state, unit.def);
  const seen = new Map<string, Step>([[posKey(unit.pos), { pos: unit.pos, cost: 0, from: null }]]);
  const queue: Pos[] = [unit.pos];
  for (let i = 0; i < queue.length; i++) {
    const cur = queue[i];
    const cost = seen.get(posKey(cur))!.cost;
    for (const n of neighbors(grid, cur)) {
      const k = posKey(n);
      const to = tileAt(grid, n);
      // água rasa custa 2: o caminho mais barato pode chegar depois, então a casa é revista quando sai mais barata
      const next = cost + stepCost(to);
      if (next > budget || (seen.get(k)?.cost ?? Infinity) <= next) continue;
      if (!canStand(to) || Math.abs(standH(to) - standH(tileAt(grid, cur))) > jump) continue;
      const other = unitAt(state, n);
      if (other && other.team !== unit.team) continue;
      seen.set(k, { pos: n, cost: next, from: posKey(cur) });
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
  const eye = standH(tileAt(grid, a)) + EYE;
  const aim = standH(tileAt(grid, b)) + EYE;
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
  const up = ability.heightRange ? Math.max(0, standH(tileAt(grid, from)) - standH(tileAt(grid, to))) : 0;
  return ability.range[1] + up;
}

export function inAbilityRange(grid: Grid, ability: AbilityDef, from: Pos, to: Pos): boolean {
  const d = dist(from, to);
  return d >= ability.range[0] && d <= maxRange(grid, ability, from, to);
}
