import type { AbilityDef } from './abilities.ts';
import { FACING, TERRAIN, canStand, dist, inBounds, isDeep, neighbors, posKey, samePos, standH, stepCost, tileAt, type Grid } from './grid.ts';
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
  path?: Pos[]; // caminho desde a casa de saída (sem ela), montado antes de tirar as casas ocupadas
}

// Pulo por cima de vão, como no FFT (13/11, pedido do Fernando; BMG: o vão vai até [Jump/2] casas): em linha reta, por
// cima de casas onde não se fica de pé (água funda) ou mais baixas que as duas pontas; parede no meio bloqueia. Pousa no
// mesmo nível ou até `jump` níveis abaixo (o FFT não deixa pousar mais alto). `over` são as casas voadas, cada uma conta 1 ponto de movimento. Salto 1 não voa nada.
export function leaps(grid: Grid, from: Pos, jump: number): { to: Pos; over: Pos[] }[] {
  const out: { to: Pos; over: Pos[] }[] = [];
  const h0 = standH(tileAt(grid, from));
  for (const d of FACING) {
    const over: Pos[] = [];
    for (let k = 1; k <= Math.floor(jump / 2); k++) {
      const mid = { x: from.x + d.x * k, y: from.y + d.y * k };
      const to = { x: mid.x + d.x, y: mid.y + d.y };
      if (!inBounds(grid, to)) break;
      const g = tileAt(grid, mid);
      if (!TERRAIN[g.terrain].walkable) break;
      over.push(mid);
      const land = tileAt(grid, to);
      // pouso no mesmo nível ou abaixo, até `jump` níveis (13/11: o tutorial do FFT não deixa o vão pousar mais alto que a
      // saída; antes pousava até `jump` acima)
      if (!canStand(land) || isDeep(land) || standH(land) > h0 || h0 - standH(land) > jump) continue; // pousar na funda: é só entrar a nado
      const low = Math.min(h0, standH(land));
      if (over.every((p) => { const t = tileAt(grid, p); return !canStand(t) || standH(t) < low; })) out.push({ to, over: [...over] });
    }
  }
  return out;
}

// Busca pelo custo de cada passo (1, ou 2 na água rasa; o vão, 1 por casa voada) até def.move pontos. Passa por aliado, nunca por inimigo; o resultado não inclui
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
      // o salto mede pela superfície (t.h): entrar e sair da água funda é a mesma subida da margem (grid.ts, isDeep)
      if (!canStand(to) || Math.abs(to.h - tileAt(grid, cur).h) > jump) continue;
      const other = unitAt(state, n);
      if (other && other.team !== unit.team) continue;
      seen.set(k, { pos: n, cost: next, from: posKey(cur) });
      queue.push(n);
    }
    // vão: cada casa voada conta 1, mais a casa onde pousa; inimigo embaixo do voo bloqueia, como no caminho a pé
    for (const { to: n, over } of leaps(grid, cur, jump)) {
      const k = posKey(n);
      const next = cost + over.length + stepCost(tileAt(grid, n));
      if (next > budget || (seen.get(k)?.cost ?? Infinity) <= next) continue;
      if ([n, ...over].some((p) => { const o = unitAt(state, p); return o && o.team !== unit.team; })) continue;
      seen.set(k, { pos: n, cost: next, from: posKey(cur) });
      queue.push(n);
    }
  }
  // o caminho de cada casa sai antes de tirar as ocupadas (13/11, revisão): passar por aliado apagava a casa dele e o
  // pathTo devolvia um caminho com buraco, que a cena desenhava como pulo de 2 a 4 casas
  for (const step of seen.values()) {
    const path: Pos[] = [];
    for (let s: Step | undefined = step; s?.from; s = seen.get(s.from)) path.unshift(s.pos);
    step.path = path;
  }
  seen.delete(posKey(unit.pos));
  for (const [k, step] of seen) if (unitAt(state, step.pos)) seen.delete(k);
  return seen;
}

// Caminho até `target`, sem a casa inicial (montado pelo `reachable`, passando por aliados); null se não alcança.
export function pathTo(reach: Map<string, Step>, target: Pos): Pos[] | null {
  return reach.get(posKey(target))?.path ?? null;
}

// Linha de visão na grade: percorre as casas entre os dois pontos (Bresenham) e compara a altura da linha, que vai do olho
// de quem olha até o ponto de mira do alvo, com o topo de cada casa (altura + o quanto o terreno tapa). Roda sem Three e é
// determinística, ao contrário da amostragem 3D da POC.
export function lineOfSight(grid: Grid, from: Pos, to: Pos): boolean {
  return sightBlock(grid, from, to) === null;
}

// a primeira casa que barra a linha de visão (null se passa livre): a prévia da trajetória mostra onde o tiro bate
// (13/11, pedido do Fernando, "como no Tactics Ogre"). A mesma conta de sempre: a linha é traçada da casa de menor índice
export function sightBlock(grid: Grid, from: Pos, to: Pos): Pos | null {
  // traça sempre da casa de menor índice para a de maior (13/11, revisão): o Bresenham desempata a quina conforme o
  // sentido, e um arqueiro levava tiro de onde não conseguia responder (5 a 6% dos pares). Olho e mira têm a mesma altura
  // acima do chão, então trocar as pontas não muda a linha
  const [a, b] = from.y * grid.width + from.x <= to.y * grid.width + to.x ? [from, to] : [to, from];
  const total = dist(a, b);
  if (total <= 1) return null;
  // quem nada na funda mira e é mirado da superfície (revisão de 13/11): com a altura do fundo, a linha passava por baixo do
  // chão vizinho e quem estava na água ficava invisível a 3 casas ou mais; o acerto continua pior pela altura (standH)
  const sight = (p: Pos) => { const t = tileAt(grid, p); return isDeep(t) ? t.h : standH(t); };
  const eye = sight(a) + EYE;
  const aim = sight(b) + EYE;
  let x = a.x, y = a.y;
  const dx = Math.abs(b.x - a.x), dy = -Math.abs(b.y - a.y);
  const sx = a.x < b.x ? 1 : -1, sy = a.y < b.y ? 1 : -1;
  let err = dx + dy;
  for (;;) {
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x += sx; }
    if (e2 <= dx) { err += dx; y += sy; }
    if (x === b.x && y === b.y) return null;
    const t = tileAt(grid, { x, y });
    // fração pelo avanço em passos de grade, não pelo índice do laço, que na diagonal anda 1 casa por iteração
    const frac = dist(a, { x, y }) / total;
    if (t.h + TERRAIN[t.terrain].blocks > eye + (aim - eye) * frac) return { x, y };
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
