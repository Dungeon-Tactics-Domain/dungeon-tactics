import { ABILITIES } from './abilities.ts';
import { checkOutcome, previewAbility, resolveAbility, spikeAtTurnEnd, type Preview } from './combat.ts';
import { FACING, canStand, faceNearest, facingTo, inBounds, samePos, tileAt, type Grid } from './grid.ts';
import { pathTo, reachable, unitAt, type Step } from './pathing.ts';
import { SCENARIOS, initialState, type Scenario } from './scenarios.ts';
import { finishTurn, startNextTurn } from './turn-queue.ts';
import type { BattleEvent, BattleState, Charge, Pos, UnitState } from './types.ts';
import { UNIT_DEFS } from './units.ts';

// Desfazer por batalha (spec: valor inicial 3, a medir). Só vale dentro do turno atual: depois de terminar o turno o
// inimigo já agiu e a informação nova não volta.
export const UNDO_LIMIT = 3;
const SAVE_VERSION = 2; // 2 (12/11): cargas no estado; save antigo começa do zero
const MAX_UNITS = 64;

// O que o desfazer restaura: tudo menos o sorteio. Se o rng voltasse, atacar de novo repetiria o mesmo dado
// e desfazer viraria "tentar até acertar" (pilar 3: nunca erro escondido, mas também nunca dado repetido).
type Frame = Omit<BattleState, 'rng'>;
interface Entry {
  before: Frame;
  paid: boolean; // ataque sorteou dado: desfazer custa um; mover não revela nada e sai de graça
}

// Agregado da batalha: dono do estado, do histórico de desfazer e do salvar. As regras ficam em funções puras
// (combat, pathing, turn-queue); aqui só mora o que tem ciclo de vida.
export class Battle {
  readonly grid: Grid;
  state: BattleState;
  undosLeft: number;
  private history: Entry[];

  // campos explícitos (sem propriedade de parâmetro): o Node só remove tipos ao rodar os scripts de simulação
  constructor(grid: Grid, state: BattleState, undosLeft = UNDO_LIMIT, history: Entry[] = []) {
    this.grid = grid;
    this.state = state;
    this.undosLeft = undosLeft;
    this.history = history;
  }

  static start(scenario: Scenario, seed: number): Battle {
    const state = initialState(scenario, seed);
    startNextTurn(scenario.grid, state);
    return new Battle(scenario.grid, state);
  }

  get actor(): UnitState {
    return this.state.units.find((u) => u.id === this.state.turn.actor)!;
  }
  get over(): boolean {
    return this.state.outcome !== 'ongoing';
  }
  get canUndo(): boolean {
    const last = this.history.at(-1);
    return !!last && (!last.paid || this.undosLeft > 0);
  }

  // quem acabou de declarar uma carga não anda neste turno: andar a desfaria (andar num turno seguinte desfaz, sim)
  reach(): Map<string, Step> {
    const charging = !!this.state.turn.usedAbility && this.state.charges.some((c) => c.unit === this.actor.id);
    return this.over || this.state.turn.moved || charging ? new Map() : reachable(this.grid, this.state, this.actor.id);
  }

  preview(abilityId: string, target: Pos): Preview {
    return previewAbility(this.grid, this.state, this.actor.id, abilityId, target);
  }

  move(to: Pos): BattleEvent[] {
    const path = pathTo(this.reach(), to);
    if (!path) return [];
    this.remember(false);
    const from = this.actor.pos;
    // com direção, quem anda termina olhando para onde ia
    if (this.actor.facing !== undefined) this.actor.facing = facingTo(path.at(-2) ?? from, to);
    this.actor.pos = to;
    // andar desfaz a própria carga (como a Carga do Arqueiro, BMG 2.2; para as outras, suposição)
    this.state.charges = this.state.charges.filter((c) => c.unit !== this.actor.id);
    this.state.turn.moved = true;
    // o evento leva a casa de saída na frente (13/11): sem ela a animação começava no 1º passo e o boneco "teletransportava"
    return [{ k: 'move', unit: this.actor.id, path: [from, ...path] }];
  }

  act(abilityId: string, target: Pos): BattleEvent[] {
    if (this.over || this.state.turn.usedAbility || !this.preview(abilityId, target).ok) return [];
    // declarar carga não sorteia dado: desfazer não gasta (13/11, revisão; o sorteio vem quando ela sai)
    this.remember(ABILITIES[abilityId].charge === 0);
    if (this.actor.facing !== undefined && !samePos(target, this.actor.pos)) this.actor.facing = facingTo(this.actor.pos, target); // vira para o alvo
    const ability = ABILITIES[abilityId];
    let events: BattleEvent[];
    if (ability.charge > 0) {
      // ação lenta: paga o custo agora e entra na fila; uma carga nova troca a anterior da mesma unidade
      if (ability.cost) this.actor.vars![ability.cost[0]] -= ability.cost[1];
      const follow = ability.panel ? null : unitAt(this.state, target)?.id ?? null;
      this.state.charges = [...this.state.charges.filter((c) => c.unit !== this.actor.id), { unit: this.actor.id, ability: abilityId, target, follow, ticks: ability.charge }];
      events = [{ k: 'charge', unit: this.actor.id, ability: abilityId, target }];
    } else events = resolveAbility(this.grid, this.state, this.actor.id, abilityId, target);
    this.state.turn.usedAbility = abilityId;
    return events;
  }

  // Escolhe para onde a unidade da vez olha (só em cenário com direção). De graça e sem desfazer: não revela nada.
  face(dir: number): void {
    if (!this.over && this.actor.facing !== undefined && FACING[dir]) this.actor.facing = dir;
  }

  // devolve os eventos das cargas que saíram antes do próximo turno
  endTurn(): BattleEvent[] {
    this.history = [];
    if (this.over) return [];
    const spiked = spikeAtTurnEnd(this.grid, this.state);
    finishTurn(this.state);
    this.state.outcome = checkOutcome(this.state);
    return [...spiked, ...(this.over ? [] : startNextTurn(this.grid, this.state))];
  }

  undo(): boolean {
    if (!this.canUndo) return false;
    const { before, paid } = this.history.pop()!;
    if (paid) this.undosLeft--;
    this.state = { ...structuredClone(before), rng: this.state.rng };
    return true;
  }

  clone(): Battle {
    return new Battle(this.grid, structuredClone(this.state), this.undosLeft, structuredClone(this.history));
  }

  save(): string {
    return JSON.stringify({ v: SAVE_VERSION, state: this.state, undosLeft: this.undosLeft, history: this.history });
  }

  // Salvo no navegador pode estar velho, editado ou quebrado: qualquer dúvida devolve null e o jogo começa do zero.
  static load(json: string): Battle | null {
    let raw: unknown;
    try {
      raw = JSON.parse(json);
    } catch {
      return null;
    }
    if (!isObj(raw) || raw.v !== SAVE_VERSION) return null;
    const state = parseBattleState(raw.state);
    if (!state || !isInt(raw.undosLeft) || raw.undosLeft < 0 || raw.undosLeft > UNDO_LIMIT) return null;
    if (!Array.isArray(raw.history) || raw.history.length > 4) return null;
    const history: Entry[] = [];
    for (const e of raw.history) {
      if (!isObj(e) || typeof e.paid !== 'boolean' || !isObj(e.before)) return null;
      const frame = parseBattleState({ ...e.before, rng: 0 });
      if (!frame) return null;
      const { rng: _rng, ...before } = frame;
      history.push({ before, paid: e.paid });
    }
    return new Battle(SCENARIOS[state.scenario].grid, state, raw.undosLeft, history);
  }

  private remember(paid: boolean): void {
    const { rng: _rng, ...before } = this.state;
    this.history.push({ before: structuredClone(before), paid });
  }
}

const isObj = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v);
const isInt = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v);

// Fronteira de confiança do save: reconstrói o estado só com campos conhecidos e confere limites (mapa, vida, duplicatas).
export function parseBattleState(raw: unknown): BattleState | null {
  if (!isObj(raw) || typeof raw.scenario !== 'string' || !Object.hasOwn(SCENARIOS, raw.scenario)) return null;
  const grid = SCENARIOS[raw.scenario].grid;
  if (!isInt(raw.rng) || !isInt(raw.turnsPlayed) || raw.turnsPlayed < 0) return null;
  if (raw.outcome !== 'ongoing' && raw.outcome !== 'victory' && raw.outcome !== 'defeat') return null;
  if (!Array.isArray(raw.units) || raw.units.length > MAX_UNITS) return null;
  const units: UnitState[] = [];
  const ids = new Set<string>();
  const cells = new Set<string>();
  for (const u of raw.units) {
    if (!isObj(u) || typeof u.id !== 'string' || typeof u.def !== 'string' || !Object.hasOwn(UNIT_DEFS, u.def)) return null;
    if (u.team !== 'hero' && u.team !== 'enemy') return null;
    if (!isObj(u.pos) || !isInt(u.pos.x) || !isInt(u.pos.y)) return null;
    const pos = { x: u.pos.x, y: u.pos.y };
    // todas as casas da unidade (a grande ocupa 2x2 a partir de `pos`): dentro do mapa, pisáveis e sem ninguém (13/11,
    // revisão: só a casa de canto era conferida, e um Colosso cobria o Farol ou saía do mapa)
    const size = UNIT_DEFS[u.def].size ?? 1;
    const tiles = Array.from({ length: size * size }, (_, i) => ({ x: pos.x + (i % size), y: pos.y + Math.floor(i / size) }));
    if (!tiles.every((p) => inBounds(grid, p) && canStand(tileAt(grid, p)) && !cells.has(`${p.x},${p.y}`))) return null;
    if (!isInt(u.hp) || u.hp < 1 || u.hp > UNIT_DEFS[u.def].hp || !isInt(u.ct) || Math.abs(u.ct) > 10000) return null;
    if (ids.has(u.id)) return null;
    ids.add(u.id);
    for (const p of tiles) cells.add(`${p.x},${p.y}`);
    // direção: todo mapa tem desde 13/11; save de antes (sem ela) abre virado para o inimigo mais perto (preenchido
    // depois do laço). Contadores só com as chaves da ficha
    if (u.facing !== undefined && (!isInt(u.facing) || !FACING[u.facing])) return null;
    const defVars = UNIT_DEFS[u.def].vars;
    let vars: Record<string, number> | undefined;
    if (defVars) {
      if (!isObj(u.vars)) return null;
      vars = {};
      for (const k of Object.keys(defVars)) {
        const v = u.vars[k];
        if (!isInt(v) || Math.abs(v) > 9999) return null;
        vars[k] = v;
      }
    } else if (u.vars !== undefined) return null;
    units.push({ id: u.id, def: u.def, team: u.team, pos, hp: u.hp, ct: u.ct, ...(u.facing !== undefined && { facing: u.facing as number }), ...(vars && { vars }) });
  }
  for (const u of units) if (UNIT_DEFS[u.def].speed > 0) u.facing ??= faceNearest(u.pos, units.filter((o) => o.team !== u.team).map((o) => o.pos));
  const t = raw.turn;
  if (!isObj(t) || typeof t.actor !== 'string' || typeof t.moved !== 'boolean') return null;
  const actor = units.find((u) => u.id === t.actor);
  if (!actor) return null;
  let usedAbility: string | null = null;
  if (t.usedAbility !== null) {
    if (typeof t.usedAbility !== 'string' || !Object.hasOwn(ABILITIES, t.usedAbility) || !UNIT_DEFS[actor.def].abilities.includes(t.usedAbility)) return null;
    usedAbility = t.usedAbility;
  }
  if (!Array.isArray(raw.charges) || raw.charges.length > MAX_UNITS) return null;
  const charges: Charge[] = [];
  for (const c of raw.charges) {
    if (!isObj(c) || typeof c.unit !== 'string' || typeof c.ability !== 'string' || !isInt(c.ticks) || c.ticks < 1 || c.ticks > 99) return null;
    const caster = units.find((u) => u.id === c.unit);
    if (!caster || !UNIT_DEFS[caster.def].abilities.includes(c.ability) || charges.some((x) => x.unit === c.unit)) return null;
    if (!isObj(c.target) || !isInt(c.target.x) || !isInt(c.target.y) || !inBounds(grid, { x: c.target.x, y: c.target.y })) return null;
    if (c.follow !== null && (typeof c.follow !== 'string' || !units.some((u) => u.id === c.follow))) return null;
    charges.push({ unit: c.unit, ability: c.ability, target: { x: c.target.x, y: c.target.y }, follow: c.follow, ticks: c.ticks });
  }
  return { scenario: raw.scenario, units, rng: raw.rng, turn: { actor: actor.id, moved: t.moved, usedAbility }, charges, outcome: raw.outcome, turnsPlayed: raw.turnsPlayed };
}
