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
  // Os dois campos abaixo só existem em cenário que pede (o estudo do FFT); nos mapas do jogo ficam ausentes e o save não muda.
  facing?: number; // para onde olha: índice em FACING (grid.ts)
  vars?: Record<string, number>; // contadores da unidade (estoque, MP, bônus de atributo); as chaves vêm de UnitDef.vars
}

// o que o ator da vez já fez: mover uma vez e agir uma vez, em qualquer ordem
export interface TurnState {
  actor: string;
  moved: boolean;
  usedAbility: string | null; // habilidade usada, para o atraso do próximo turno
}

export type Outcome = 'ongoing' | 'victory' | 'defeat';

// Ação com carga (ação lenta do FFT, BMG 1.1 e A.2): declarada no turno, sai quando `ticks` chega a 0. Mira a casa
// (`follow` null) ou segue a unidade que estava nela.
export interface Charge {
  unit: string;
  ability: string;
  target: Pos;
  follow: string | null;
  ticks: number;
}

export interface BattleState {
  scenario: string;
  units: UnitState[]; // morto sai da lista
  rng: number; // estado do sorteio; NÃO volta ao desfazer
  turn: TurnState;
  charges: Charge[]; // em ordem de declaração
  outcome: Outcome;
  turnsPlayed: number;
}

// eventos para o cliente animar; a regra já foi aplicada no estado quando eles saem
export type BattleEvent =
  | { k: 'move'; unit: string; path: Pos[] }
  | { k: 'attack'; unit: string; ability: string; target: Pos }
  | { k: 'charge'; unit: string; ability: string; target: Pos } // começou a carregar; sai depois
  | { k: 'fizzle'; unit: string; ability: string } // a carga saiu e não achou alvo (ele saiu da casa ou do alcance)
  | { k: 'hit'; unit: string; dmg: number; chance: number }
  | { k: 'miss'; unit: string; chance: number }
  | { k: 'heal'; unit: string; amount: number }
  | { k: 'push'; unit: string; to: Pos }
  | { k: 'bump'; unit: string; dmg: number }
  | { k: 'fall'; unit: string; levels: number; dmg: number }
  | { k: 'die'; unit: string };
