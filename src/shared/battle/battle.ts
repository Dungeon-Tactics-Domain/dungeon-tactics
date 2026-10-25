import { ABILITIES } from './abilities.ts';
import { checkOutcome, previewAbility, resolveAbility, type Preview } from './combat.ts';
import { TERRAIN, inBounds, tileAt, type Grid } from './grid.ts';
import { pathTo, reachable, type Step } from './pathing.ts';
import { SCENARIOS, initialState, type Scenario } from './scenarios.ts';
import { finishTurn, startNextTurn } from './turn-queue.ts';
import type { BattleEvent, BattleState, Pos, UnitState } from './types.ts';
import { UNIT_DEFS } from './units.ts';

// Desfazer por batalha (spec: valor inicial 3, a medir). Só vale dentro do turno atual: depois de terminar o turno o
// inimigo já agiu e a informação nova não volta.
export const UNDO_LIMIT = 3;
const SAVE_VERSION = 1;
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
    startNextTurn(state);
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

  reach(): Map<string, Step> {
    return this.over || this.state.turn.moved ? new Map() : reachable(this.grid, this.state, this.actor.id);
  }

  preview(abilityId: string, target: Pos): Preview {
    return previewAbility(this.grid, this.state, this.actor.id, abilityId, target);
  }

  move(to: Pos): BattleEvent[] {
    const path = pathTo(this.reach(), to);
    if (!path) return [];
    this.remember(false);
    this.actor.pos = to;
    this.state.turn.moved = true;
    return [{ k: 'move', unit: this.actor.id, path }];
  }

  act(abilityId: string, target: Pos): BattleEvent[] {
    if (this.over || this.state.turn.usedAbility || !this.preview(abilityId, target).ok) return [];
    this.remember(true);
    const events = resolveAbility(this.grid, this.state, this.actor.id, abilityId, target);
    this.state.turn.usedAbility = abilityId;
    return events;
  }

  endTurn(): void {
    this.history = [];
    if (this.over) return;
    finishTurn(this.state);
    this.state.outcome = checkOutcome(this.state);
    if (!this.over) startNextTurn(this.state);
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
    if (!inBounds(grid, pos) || !TERRAIN[tileAt(grid, pos).terrain].walkable) return null;
    if (!isInt(u.hp) || u.hp < 1 || u.hp > UNIT_DEFS[u.def].hp || !isInt(u.ct) || Math.abs(u.ct) > 10000) return null;
    if (ids.has(u.id) || cells.has(`${pos.x},${pos.y}`)) return null;
    ids.add(u.id);
    cells.add(`${pos.x},${pos.y}`);
    units.push({ id: u.id, def: u.def, team: u.team, pos, hp: u.hp, ct: u.ct });
  }
  const t = raw.turn;
  if (!isObj(t) || typeof t.actor !== 'string' || typeof t.moved !== 'boolean') return null;
  const actor = units.find((u) => u.id === t.actor);
  if (!actor) return null;
  let usedAbility: string | null = null;
  if (t.usedAbility !== null) {
    if (typeof t.usedAbility !== 'string' || !Object.hasOwn(ABILITIES, t.usedAbility) || !UNIT_DEFS[actor.def].abilities.includes(t.usedAbility)) return null;
    usedAbility = t.usedAbility;
  }
  return { scenario: raw.scenario, units, rng: raw.rng, turn: { actor: actor.id, moved: t.moved, usedAbility }, outcome: raw.outcome, turnsPlayed: raw.turnsPlayed };
}
