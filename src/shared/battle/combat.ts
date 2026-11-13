import { ABILITIES, type AbilityDef } from './abilities.ts';
import { FACING, TERRAIN, canStand, dist, inBounds, samePos, sideOf, standH, tileAt, type Grid, type Side } from './grid.ts';
import { MAX_JUMP, distTo, inAbilityRange, lineOfSight, nearestTile, unitAt } from './pathing.ts';
import { nextRng, rollInt } from './rng.ts';
import { rulesOf } from './rules.ts';
import { SCENARIOS } from './scenarios.ts';
import type { BattleEvent, BattleState, Outcome, Pos, UnitState } from './types.ts';
import { OBJECTIVE_DEF, UNIT_DEFS } from './units.ts';

// Números iniciais de 25/10; só mudam depois de medidos na simulação (scripts/battle-sim.ts).
export const COMBAT = {
  DIST_PENALTY: 3, // pontos de acerto perdidos por casa além da primeira
  HEIGHT_BONUS: 5, // pontos por nível acima (ganha) ou abaixo (perde) do alvo
  COVER_PENALTY: 20, // alvo em terreno com cobertura, contra ataque à distância
  MIN_CHANCE: 5, // nunca certeza nem impossível: o dado sempre existe
  MAX_CHANCE: 95,
  // batida, queda e espinhos x1,75 junto com o dano das habilidades (13/11, "danos muito baixos deixando a batalha lenta"):
  // antes 3, 5 e 6
  BUMP_DAMAGE: 5, // empurrão parado por parede, unidade, borda ou degrau alto
  FALL_FREE: 1, // queda de até 1 nível é só um degrau
  FALL_DAMAGE: 9, // por nível além do degrau livre
  SPIKE_DAMAGE: 10, // casa de espinhos (grid.ts): o mesmo que um golpe fraco
  // golpe físico pelo lado e pelas costas (13/11, direção no jogo, como o FFT: lá o lado tira a evasão de classe e as
  // costas tiram também a do escudo). Nosso acerto não tem evasão: vira bônus. Números iniciais, medidos na campanha
  SIDE_BONUS: 15,
  BACK_BONUS: 30,
};

export interface TargetPreview {
  unit: string;
  chance: number; // % de acerto; cura sempre 100
  side: Side; // de onde o golpe pega o alvo (frente sem direção); a interface diz "pelas costas" / "de lado"
  dmgMin: number;
  dmgMax: number;
  healMin: number;
  healMax: number;
}

export type PreviewReason = 'unknown' | 'range' | 'sight' | 'no-target' | 'spent';
export interface Preview {
  ok: boolean;
  reason?: PreviewReason;
  center: Pos; // casa de onde a habilidade age (a do alvo, ou a de quem usa quando é centrada)
  targets: TargetPreview[];
}

// cura e habilidade de apoio miram aliado e não erram
const isHeal = (a: AbilityDef) => a.heal[1] > 0 || !!a.ally;

// `side`: de onde o golpe pega o alvo (sideOf); magia não olha a direção (no FFT ela só passa pelo escudo mágico)
export function hitChance(grid: Grid, ability: AbilityDef, from: Pos, to: Pos, side: Side = 'front'): number {
  if (isHeal(ability)) return 100;
  const d = dist(from, to);
  const dh = standH(tileAt(grid, from)) - standH(tileAt(grid, to));
  // cobertura só vale contra quem ataca de longe: o corpo a corpo enxerga o alvo por inteiro
  const cover = d > 1 && TERRAIN[tileAt(grid, to).terrain].cover ? COMBAT.COVER_PENALTY : 0;
  const flank = ability.magic ? 0 : side === 'back' ? COMBAT.BACK_BONUS : side === 'side' ? COMBAT.SIDE_BONUS : 0;
  const raw = ability.accuracy - COMBAT.DIST_PENALTY * Math.max(0, d - 1) + COMBAT.HEIGHT_BONUS * dh - cover + flank;
  return Math.max(COMBAT.MIN_CHANCE, Math.min(COMBAT.MAX_CHANCE, raw));
}

function affected(state: BattleState, actor: UnitState, ability: AbilityDef, center: Pos): UnitState[] {
  const inArea = state.units.filter((u) => u.id !== actor.id && distTo(u, center) <= ability.radius);
  if (ability.radius > 0) return inArea; // área atinge todo mundo, aliado inclusive
  const u = unitAt(state, center);
  // quem usa só é alvo de habilidade de apoio cujo alcance começa em 0
  const self = u?.id === actor.id;
  const wanted = u && (isHeal(ability) ? u.team === actor.team && (!self || (!!ability.ally && ability.range[0] === 0)) : !self && u.team !== actor.team);
  return wanted ? [u] : [];
}

// O que a habilidade faria se confirmada, sem mexer no estado: a interface mostra isto antes do Confirmar (pilar "sorte com leitura").
// Quem está carregando leva 50% a mais de ataque físico (BMG 6, estado Charging: PA * 3/2). Nosso dano não sai do PA:
// o bônus vai no dano inteiro (adaptação).
const chargingBonus = (state: BattleState, ability: AbilityDef, target: UnitState) =>
  !ability.magic && state.charges.some((c) => c.unit === target.id) ? 1.5 : 1;

// `charged`: é a carga saindo agora; o custo (MP, estoque) já foi pago quando ela começou
export function previewAbility(grid: Grid, state: BattleState, actorId: string, abilityId: string, target: Pos, charged = false): Preview {
  const actor = state.units.find((u) => u.id === actorId);
  const ability = ABILITIES[abilityId];
  const center = ability && ability.range[1] === 0 && actor ? actor.pos : target;
  const fail = (reason: PreviewReason): Preview => ({ ok: false, reason, center, targets: [] });
  if (!actor || !ability || !UNIT_DEFS[actor.def].abilities.includes(abilityId) || !inBounds(grid, center)) return fail('unknown');
  if (!charged && ability.cost && (actor.vars?.[ability.cost[0]] ?? 0) < ability.cost[1]) return fail('spent');
  // unidade grande mede alcance e visão da casa dela mais perto do alvo (para quem ocupa 1 casa é a mesma)
  const from = nearestTile(actor, center);
  if (!inAbilityRange(grid, ability, from, center)) return fail('range');
  if (ability.needsSight && !lineOfSight(grid, from, center)) return fail('sight');
  const hit = affected(state, actor, ability, center);
  if (!hit.length) return fail('no-target');
  const [dmgMin, dmgMax] = rulesOf(state).damage?.(actor, ability) ?? ability.damage;
  const targets = hit.map((u) => {
    // contra unidade grande, a casa dela mais perto de quem ataca (distância e altura)
    const at = nearestTile(u, actor.pos), from = nearestTile(actor, at);
    const side: Side = u.facing === undefined ? 'front' : sideOf(at, FACING[u.facing], from);
    return {
      unit: u.id,
      side,
      chance: isHeal(ability) ? 100 : rulesOf(state).hitChance?.(grid, state, actor, ability, u) ?? hitChance(grid, ability, from, at, side),
      dmgMin: Math.floor(dmgMin * chargingBonus(state, ability, u)),
      dmgMax: Math.floor(dmgMax * chargingBonus(state, ability, u)),
      healMin: ability.heal[0],
      healMax: ability.heal[1],
    };
  });
  return { ok: true, center, targets };
}

// Aplica a habilidade no estado (muda units e rng) e devolve os eventos para o cliente animar.
// Ordem dos sorteios, por unidade atingida na ordem da lista: acerto, depois dano. Mudar a ordem muda o hash dos testes.
export function resolveAbility(grid: Grid, state: BattleState, actorId: string, abilityId: string, target: Pos, charged = false): BattleEvent[] {
  const preview = previewAbility(grid, state, actorId, abilityId, target, charged);
  if (!preview.ok) return [];
  const actor = state.units.find((u) => u.id === actorId)!;
  const ability = ABILITIES[abilityId];
  const events: BattleEvent[] = [{ k: 'attack', unit: actorId, ability: abilityId, target: preview.center }];
  const after = rulesOf(state).after;
  if (ability.cost && !charged) actor.vars![ability.cost[0]] -= ability.cost[1];
  for (const t of preview.targets) {
    const unit = state.units.find((u) => u.id === t.unit)!;
    if (isHeal(ability)) {
      if (ability.heal[1] === 0) { after?.(state, actor, ability, unit, events); continue; } // apoio sem cura: só o efeito
      let amount: number;
      [amount, state.rng] = rollInt(state.rng, ability.heal[0], ability.heal[1]);
      const healed = Math.min(amount, UNIT_DEFS[unit.def].hp - unit.hp);
      unit.hp += healed;
      events.push({ k: 'heal', unit: unit.id, amount: healed });
      after?.(state, actor, ability, unit, events);
      continue;
    }
    let roll: number;
    [roll, state.rng] = nextRng(state.rng);
    if (roll * 100 >= t.chance) {
      events.push({ k: 'miss', unit: unit.id, chance: t.chance });
      continue;
    }
    let dmg: number;
    [dmg, state.rng] = rulesOf(state).rollDamage?.(state, actor, ability, state.rng) ?? rollInt(state.rng, ability.damage[0], ability.damage[1]);
    dmg = Math.floor(dmg * chargingBonus(state, ability, unit));
    events.push({ k: 'hit', unit: unit.id, dmg, chance: t.chance });
    if (!hurt(state, unit, dmg, events)) continue;
    after?.(state, actor, ability, unit, events);
    if (ability.push === 0) continue;
    // empurrão com chance sorteia depois do dano; sem `pushChance` não há sorteio (a ordem dos sorteios do jogo não muda)
    if (ability.pushChance !== undefined) {
      [roll, state.rng] = nextRng(state.rng);
      if (roll * 100 >= ability.pushChance) continue;
    }
    push(grid, state, unit, preview.center, actor.pos, ability.push, events);
  }
  state.outcome = checkOutcome(state);
  return events;
}

// tira vida; devolve false se a unidade morreu (e sai da lista)
function hurt(state: BattleState, unit: UnitState, dmg: number, events: BattleEvent[]): boolean {
  unit.hp -= dmg;
  if (unit.hp > 0) return true;
  state.units = state.units.filter((u) => u !== unit);
  // a carga de quem morre não sai mais; a que seguia quem morreu passa a mirar a casa onde ele estava
  state.charges = state.charges.filter((c) => c.unit !== unit.id).map((c) => (c.follow === unit.id ? { ...c, follow: null, target: unit.pos } : c));
  events.push({ k: 'die', unit: unit.id });
  return false;
}

// Fim da vez em cima de espinhos (grid.ts): fere quem joga agora. Sem sorteio (o hash das partidas sem espinhos não muda)
export function spikeAtTurnEnd(grid: Grid, state: BattleState): BattleEvent[] {
  const actor = state.units.find((u) => u.id === state.turn.actor);
  if (!actor || !tileAt(grid, actor.pos).spikes) return [];
  const events: BattleEvent[] = [{ k: 'spike', unit: actor.id, dmg: COMBAT.SPIKE_DAMAGE }];
  hurt(state, actor, COMBAT.SPIKE_DAMAGE, events);
  return events;
}

export interface PushResult {
  to: Pos;
  dmg: number; // batida e queda somadas
  events: BattleEvent[]; // push, bump e fall, na ordem
}

// Empurra pelo eixo de maior diferença em relação ao centro da habilidade. Se a vítima está no centro (área), afasta
// de quem usou. Cada casa é conferida: parede, unidade, borda e degrau alto param (batida); descer é queda, com dano
// de 2 níveis para cima. Não muda o estado: a IA usa isto para valorizar empurrões antes de escolher a jogada.
export function simulatePush(grid: Grid, state: BattleState, unit: UnitState, center: Pos, origin: Pos, steps: number): PushResult {
  const result: PushResult = { to: unit.pos, dmg: 0, events: [] };
  if ((UNIT_DEFS[unit.def].size ?? 1) > 1) return result; // unidade grande não sai do lugar
  const from = samePos(unit.pos, center) ? origin : center;
  let dx = unit.pos.x - from.x;
  let dy = unit.pos.y - from.y;
  if (dx === 0 && dy === 0) return result;
  const horizontal = Math.abs(dx) >= Math.abs(dy);
  dx = horizontal ? Math.sign(dx) : 0;
  dy = horizontal ? 0 : Math.sign(dy);
  for (let i = 0; i < steps; i++) {
    const cur = result.to;
    const next = { x: cur.x + dx, y: cur.y + dy };
    // água funda segura o empurrão como uma parede (suposição nossa: o guia não diz o que acontece)
    const blocked = !inBounds(grid, next) || !canStand(tileAt(grid, next)) || !!unitAt(state, next)
      || standH(tileAt(grid, next)) - standH(tileAt(grid, cur)) > MAX_JUMP;
    if (blocked) {
      result.events.push({ k: 'bump', unit: unit.id, dmg: COMBAT.BUMP_DAMAGE });
      result.dmg += COMBAT.BUMP_DAMAGE;
      return result;
    }
    const levels = standH(tileAt(grid, cur)) - standH(tileAt(grid, next));
    result.to = next;
    result.events.push({ k: 'push', unit: unit.id, to: next });
    const dmg = levels <= 0 ? 0 : rulesOf(state).fallDamage?.(levels, unit.def) ?? Math.max(0, levels - COMBAT.FALL_FREE) * COMBAT.FALL_DAMAGE;
    if (dmg > 0) {
      result.events.push({ k: 'fall', unit: unit.id, levels, dmg });
      result.dmg += dmg;
    }
    if (tileAt(grid, next).spikes) {
      result.events.push({ k: 'spike', unit: unit.id, dmg: COMBAT.SPIKE_DAMAGE });
      result.dmg += COMBAT.SPIKE_DAMAGE;
    }
  }
  return result;
}

function push(grid: Grid, state: BattleState, unit: UnitState, center: Pos, origin: Pos, steps: number, events: BattleEvent[]) {
  const r = simulatePush(grid, state, unit, center, origin, steps);
  unit.pos = r.to;
  events.push(...r.events);
  if (r.dmg > 0) hurt(state, unit, r.dmg, events);
}

// Vitória: sem inimigos. Derrota: o alvo a proteger caiu ou todos os heróis morreram.
export function checkOutcome(state: BattleState): Outcome {
  const custom = rulesOf(state).outcome;
  if (custom) return custom(state);
  const heroes = state.units.filter((u) => u.team === 'hero' && u.def !== OBJECTIVE_DEF);
  // perde pelo Farol só quem nasceu com ele (13/11, revisão: Bosque e Passo pela Batalha avulsa perdiam no 1º turno);
  // estado de teste fora da lista conta como mapa com Farol
  const hadObjective = SCENARIOS[state.scenario]?.spawns.some((s) => s.def === OBJECTIVE_DEF) ?? true;
  const objective = state.units.some((u) => u.def === OBJECTIVE_DEF);
  if ((hadObjective && !objective) || heroes.length === 0) return 'defeat';
  if (!state.units.some((u) => u.team === 'enemy')) return 'victory';
  return 'ongoing';
}
