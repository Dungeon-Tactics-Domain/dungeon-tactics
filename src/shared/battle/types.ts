// Tipos do estado da batalha. O estado é só dado (JSON-friendly): salvar, clonar e desfazer dependem disso.
export interface Pos {
  x: number;
  y: number;
}

export type Team = 'hero' | 'enemy';

export interface UnitState {
  id: string;
  def: string; // chave em UNIT_DEFS
  team: Team;
  pos: Pos;
  hp: number;
  ct: number; // carga do turno estilo FFT; age ao chegar em TURN_THRESHOLD
}

// o que o ator da vez já fez: mover uma vez e agir uma vez, em qualquer ordem
export interface TurnState {
  actor: string;
  moved: boolean;
  usedAbility: string | null; // habilidade usada, para o atraso do próximo turno
}

export type Outcome = 'ongoing' | 'victory' | 'defeat';

export interface BattleState {
  scenario: string;
  units: UnitState[]; // morto sai da lista
  rng: number; // estado do sorteio; NÃO volta ao desfazer
  turn: TurnState;
  outcome: Outcome;
  turnsPlayed: number;
}

// eventos para o cliente animar; a regra já foi aplicada no estado quando eles saem
export type BattleEvent =
  | { k: 'move'; unit: string; path: Pos[] }
  | { k: 'attack'; unit: string; ability: string; target: Pos }
  | { k: 'hit'; unit: string; dmg: number; chance: number }
  | { k: 'miss'; unit: string; chance: number }
  | { k: 'heal'; unit: string; amount: number }
  | { k: 'push'; unit: string; to: Pos }
  | { k: 'bump'; unit: string; dmg: number }
  | { k: 'fall'; unit: string; levels: number; dmg: number }
  | { k: 'die'; unit: string };
