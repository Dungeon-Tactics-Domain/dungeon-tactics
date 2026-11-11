import { ABILITIES, type AbilityDef } from './abilities.ts';
import { TERRAIN, dist, inBounds, samePos, tileAt, type Grid } from './grid.ts';
import { MAX_JUMP, inAbilityRange, lineOfSight, unitAt } from './pathing.ts';
import { nextRng, rollInt } from './rng.ts';
import { rulesOf } from './rules.ts';
import type { BattleEvent, BattleState, Outcome, Pos, UnitState } from './types.ts';
import { OBJECTIVE_DEF, UNIT_DEFS } from './units.ts';

// Números iniciais de 25/10; só mudam depois de medidos na simulação (scripts/battle-sim.ts).
export const COMBAT = {
  DIST_PENALTY: 3, // pontos de acerto perdidos por casa além da primeira
  HEIGHT_BONUS: 5, // pontos por nível acima (ganha) ou abaixo (perde) do alvo
  COVER_PENALTY: 20, // alvo em terreno com cobertura, contra ataque à distância
  MIN_CHANCE: 5, // nunca certeza nem impossível: o dado sempre existe
  MAX_CHANCE: 95,
  BUMP_DAMAGE: 3, // empurrão parado por parede, unidade, borda ou degrau alto
  FALL_FREE: 1, // queda de até 1 nível é só um degrau
  FALL_DAMAGE: 5, // por nível além do degrau livre
};

export interface TargetPreview {
  unit: string;
  chance: number; // % de acerto; cura sempre 100
  dmgMin: number;
  dmgMax: number;
  healMin: number;
  healMax: number;
}

export type PreviewReason = 'unknown' | 'range' | 'sight' | 'no-target';
export interface Preview {
  ok: boolean;
  reason?: PreviewReason;
  center: Pos; // casa de onde a habilidade age (a do alvo, ou a de quem usa quando é centrada)
  targets: TargetPreview[];
}

const isHeal = (a: AbilityDef) => a.heal[1] > 0;

export function hitChance(grid: Grid, ability: AbilityDef, from: Pos, to: Pos): number {
  if (isHeal(ability)) return 100;
  const d = dist(from, to);
  const dh = tileAt(grid, from).h - tileAt(grid, to).h;
  // cobertura só vale contra quem ataca de longe: o corpo a corpo enxerga o alvo por inteiro
  const cover = d > 1 && TERRAIN[tileAt(grid, to).terrain].cover ? COMBAT.COVER_PENALTY : 0;
  const raw = ability.accuracy - COMBAT.DIST_PENALTY * Math.max(0, d - 1) + COMBAT.HEIGHT_BONUS * dh - cover;
  return Math.max(COMBAT.MIN_CHANCE, Math.min(COMBAT.MAX_CHANCE, raw));
}

function affected(state: BattleState, actor: UnitState, ability: AbilityDef, center: Pos): UnitState[] {
  const inArea = state.units.filter((u) => u.id !== actor.id && dist(u.pos, center) <= ability.radius);
  if (ability.radius > 0) return inArea; // área atinge todo mundo, aliado inclusive
  const u = unitAt(state, center);
  const wanted = u && u.id !== actor.id && (isHeal(ability) ? u.team === actor.team : u.team !== actor.team);
  return wanted ? [u] : [];
}

// O que a habilidade faria se confirmada, sem mexer no estado: a interface mostra isto antes do Confirmar (pilar "sorte com leitura").
export function previewAbility(grid: Grid, state: BattleState, actorId: string, abilityId: string, target: Pos): Preview {
  const actor = state.units.find((u) => u.id === actorId);
  const ability = ABILITIES[abilityId];
  const center = ability && ability.range[1] === 0 && actor ? actor.pos : target;
  const fail = (reason: PreviewReason): Preview => ({ ok: false, reason, center, targets: [] });
  if (!actor || !ability || !UNIT_DEFS[actor.def].abilities.includes(abilityId) || !inBounds(grid, center)) return fail('unknown');
  if (!inAbilityRange(grid, ability, actor.pos, center)) return fail('range');
  if (ability.needsSight && !lineOfSight(grid, actor.pos, center)) return fail('sight');
  const hit = affected(state, actor, ability, center);
  if (!hit.length) return fail('no-target');
  const targets = hit.map((u) => ({
    unit: u.id,
    chance: isHeal(ability) ? 100 : rulesOf(state).hitChance?.(grid, state, actor, ability, u) ?? hitChance(grid, ability, actor.pos, u.pos),
    dmgMin: ability.damage[0],
    dmgMax: ability.damage[1],
    healMin: ability.heal[0],
    healMax: ability.heal[1],
  }));
  return { ok: true, center, targets };
}

// Aplica a habilidade no estado (muda units e rng) e devolve os eventos para o cliente animar.
// Ordem dos sorteios, por unidade atingida na ordem da lista: acerto, depois dano. Mudar a ordem muda o hash dos testes.
export function resolveAbility(grid: Grid, state: BattleState, actorId: string, abilityId: string, target: Pos): BattleEvent[] {
  const preview = previewAbility(grid, state, actorId, abilityId, target);
  if (!preview.ok) return [];
  const actor = state.units.find((u) => u.id === actorId)!;
  const ability = ABILITIES[abilityId];
  const events: BattleEvent[] = [{ k: 'attack', unit: actorId, ability: abilityId, target: preview.center }];
  for (const t of preview.targets) {
    const unit = state.units.find((u) => u.id === t.unit)!;
    if (isHeal(ability)) {
      let amount: number;
      [amount, state.rng] = rollInt(state.rng, ability.heal[0], ability.heal[1]);
      const healed = Math.min(amount, UNIT_DEFS[unit.def].hp - unit.hp);
      unit.hp += healed;
      events.push({ k: 'heal', unit: unit.id, amount: healed });
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
    events.push({ k: 'hit', unit: unit.id, dmg, chance: t.chance });
    if (!hurt(state, unit, dmg, events)) continue;
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
  events.push({ k: 'die', unit: unit.id });
  return false;
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
    const blocked = !inBounds(grid, next) || !TERRAIN[tileAt(grid, next).terrain].walkable || !!unitAt(state, next)
      || tileAt(grid, next).h - tileAt(grid, cur).h > MAX_JUMP;
    if (blocked) {
      result.events.push({ k: 'bump', unit: unit.id, dmg: COMBAT.BUMP_DAMAGE });
      result.dmg += COMBAT.BUMP_DAMAGE;
      return result;
    }
    const levels = tileAt(grid, cur).h - tileAt(grid, next).h;
    result.to = next;
    result.events.push({ k: 'push', unit: unit.id, to: next });
    const dmg = levels <= 0 ? 0 : rulesOf(state).fallDamage?.(levels, unit.def) ?? Math.max(0, levels - COMBAT.FALL_FREE) * COMBAT.FALL_DAMAGE;
    if (dmg > 0) {
      result.events.push({ k: 'fall', unit: unit.id, levels, dmg });
      result.dmg += dmg;
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
  const objective = state.units.some((u) => u.def === OBJECTIVE_DEF);
  if (!objective || heroes.length === 0) return 'defeat';
  if (!state.units.some((u) => u.team === 'enemy')) return 'victory';
  return 'ongoing';
}
