import { ABILITIES, type AbilityDef } from './abilities.ts';
import type { Battle } from './battle.ts';
import { previewAbility, simulatePush } from './combat.ts';
import { TERRAIN, dist, neighbors, posKey, tileAt, type Grid } from './grid.ts';
import { reachable } from './pathing.ts';
import type { BattleEvent, BattleState, Pos, UnitState } from './types.ts';
import { OBJECTIVE_DEF, UNIT_DEFS } from './units.ts';

// Pesos iniciais de 25/10 (em "pontos de vida esperados"): a IA é gulosa de um turno e sem sorteio, então com a mesma
// situação joga igual. O jogador vê o alcance dela; a intenção só aparece na vez dela (spec).
const W = {
  KILL: 8, // bônus por matar (vezes a chance)
  OBJECTIVE: 1.5, // multiplica o valor de bater no alvo a proteger
  FRIENDLY: 1.5, // multiplica o prejuízo de ferir aliado
  DELAY: 0.05, // por ponto de atraso da habilidade
  COVER: 1,
  HEIGHT: 0.4, // por nível da casa
  APPROACH: 0.35, // por casa de distância do alvo mais interessante
  OBJECTIVE_PULL: 3, // quanto o alvo a proteger "puxa" os inimigos (como se estivesse mais perto)
  THREAT: 0.25, // por ponto de dano médio de quem alcança a casa
  ADVANCE: 1.2, // por casa de distância quando não há em quem bater neste turno
  GUARD: 2, // por casa que o herói se afasta do alvo a proteger além do raio de guarda
};
// Até onde o herói da IA sai de perto do alvo a proteger para ir ao encontro do inimigo. Medido em 11/11 no 20x20
// (1 000 sementes): com 10 os heróis seguram a colina do meio e vencem 53,3%; com 7 ficam no descampado (29%) e sem
// limite se espalham (41%). O resultado é sensível a este número: mudou o mapa, meça de novo.
export const GUARD_RADIUS = 10;

export interface Plan {
  moveTo: Pos | null;
  ability: { id: string; target: Pos } | null;
  score: number;
}

const avg = ([lo, hi]: [number, number]) => (lo + hi) / 2;

function attackScore(grid: Grid, state: BattleState, actor: UnitState, abilityId: string, target: Pos): number {
  const ability = ABILITIES[abilityId];
  const p = previewAbility(grid, state, actor.id, abilityId, target);
  if (!p.ok) return -Infinity;
  let total = -W.DELAY * ability.delay;
  for (const t of p.targets) {
    const u = state.units.find((x) => x.id === t.unit)!;
    const chance = t.chance / 100;
    if (ability.heal[1] > 0) {
      total += chance * Math.min(avg(ability.heal), UNIT_DEFS[u.def].hp - u.hp);
      continue;
    }
    const pushDmg = ability.push > 0 ? simulatePush(grid, state, u, p.center, actor.pos, ability.push).dmg : 0;
    const dmg = avg(ability.damage);
    const expected = chance * (Math.min(dmg + pushDmg, u.hp) + (dmg + pushDmg >= u.hp ? W.KILL : 0));
    const foe = u.team !== actor.team;
    total += foe ? expected * (u.def === OBJECTIVE_DEF ? W.OBJECTIVE : 1) : -expected * W.FRIENDLY;
  }
  return total;
}

// onde a habilidade pode ser mirada: casa de cada unidade e, para área, as vizinhas (a explosão pode pegar de raspão)
function candidateTargets(grid: Grid, state: BattleState, actor: UnitState, ability: AbilityDef): Pos[] {
  if (ability.range[1] === 0) return [actor.pos];
  const out = new Map<string, Pos>();
  for (const u of state.units) {
    if (u.id === actor.id) continue;
    out.set(posKey(u.pos), u.pos);
    if (ability.radius > 0) for (const n of neighbors(grid, u.pos)) out.set(posKey(n), n);
  }
  return [...out.values()];
}

// Valor da casa. Atacando, pesa a ameaça (bater de um lugar seguro). Sem ninguém ao alcance, a ameaça não conta e a
// distância pesa mais: no mapa 20x20 o inimigo fugia do alcance dos heróis em vez de avançar e a batalha não andava
// (medido em 11/11: 28 dos 40 turnos inimigos sem atacar). O herói avança só até o raio de guarda do alvo a proteger.
function positionScore(grid: Grid, state: BattleState, actor: UnitState, at: Pos, attacking: boolean): number {
  const tile = tileAt(grid, at);
  let score = (TERRAIN[tile.terrain].cover ? W.COVER : 0) + W.HEIGHT * tile.h;
  let nearest = Infinity;
  for (const o of state.units) {
    if (o.team === actor.team) {
      if (!attacking && o.def === OBJECTIVE_DEF) score -= W.GUARD * Math.max(0, dist(at, o.pos) - GUARD_RADIUS);
      continue;
    }
    nearest = Math.min(nearest, dist(at, o.pos) - (o.def === OBJECTIVE_DEF ? W.OBJECTIVE_PULL : 0));
    const def = UNIT_DEFS[o.def];
    if (!attacking || def.speed === 0 || !def.abilities.length) continue;
    const reach = def.move + Math.max(...def.abilities.map((a) => ABILITIES[a].range[1]));
    if (dist(at, o.pos) <= reach) score -= W.THREAT * Math.max(...def.abilities.map((a) => avg(ABILITIES[a].damage)));
  }
  return score - (attacking ? W.APPROACH : W.ADVANCE) * (Number.isFinite(nearest) ? nearest : 0);
}

// Melhor jogada do turno: testa cada casa alcançável (e ficar parado) com cada habilidade e cada alvo, e escolhe a de
// maior valor esperado (dano e morte esperados, ferir aliado e atraso contam contra, mais posição). Só lê o estado.
export function chooseTurn(grid: Grid, state: BattleState, unitId: string): Plan {
  const actor = state.units.find((u) => u.id === unitId)!;
  const spots = [actor.pos, ...[...reachable(grid, state, unitId).values()].map((s) => s.pos)];
  let best: Plan = { moveTo: null, ability: null, score: -Infinity };
  for (const spot of spots) {
    const moved = { ...state, units: state.units.map((u) => (u === actor ? { ...u, pos: spot } : u)) };
    const me = moved.units.find((u) => u.id === unitId)!;
    let attack: Plan['ability'] = null;
    let attackBest = 0; // atacar só vale se o saldo for positivo
    for (const id of UNIT_DEFS[actor.def].abilities) {
      for (const target of candidateTargets(grid, moved, me, ABILITIES[id])) {
        const s = attackScore(grid, moved, me, id, target);
        if (s > attackBest) { attackBest = s; attack = { id, target }; }
      }
    }
    const score = attackBest + positionScore(grid, moved, me, spot, !!attack);
    if (score > best.score) best = { moveTo: spot === actor.pos ? null : spot, ability: attack, score };
  }
  return best;
}

// Joga o turno inteiro da unidade da vez (andar, agir e passar a vez) e devolve os eventos para o cliente animar.
export function playAiTurn(battle: Battle): BattleEvent[] {
  const plan = chooseTurn(battle.grid, battle.state, battle.actor.id);
  const events: BattleEvent[] = [];
  if (plan.moveTo) events.push(...battle.move(plan.moveTo));
  if (plan.ability) events.push(...battle.act(plan.ability.id, plan.ability.target));
  battle.endTurn();
  return events;
}
