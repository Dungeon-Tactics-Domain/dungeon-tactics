// Battle state types. The state is plain data (JSON-friendly): saving, cloning and undo depend on it.
export interface Pos {
  x: number;
  y: number;
}

export type Team = 'hero' | 'enemy';

export interface UnitState {
  id: string;
  def: string; // key in UNIT_DEFS
  team: Team;
  pos: Pos;
  hp: number;
  ct: number; // FFT-style turn charge; acts on reaching TURN_THRESHOLD
  // The two fields below only exist in scenarios that ask for them (the FFT study); on the game maps they stay absent and the save does not change.
  facing?: number; // where it looks: index in FACING (grid.ts)
  vars?: Record<string, number>; // unit counters (stock, MP, attribute bonus); the keys come from UnitDef.vars
}

// what the acting unit has already done: walks (as many times as it wants, up to its movement) and acts once, in any order
export interface TurnState {
  actor: string;
  moved: boolean;
  usedAbility: string | null; // ability used, for the delay of the next turn
  // Movement in parts (Nov 13, Fernando's request: "walk, attack and then walk again with the remaining movement"): points
  // already spent in the turn (absent = 0, the old save stays valid)
  spent?: number;
  // whom the actor attacked this turn and may counter-attack if it walks afterwards: melee against melee (when it
  // moves away) and ranged against ranged (when it walks); each one only once (combat.ts counters)
  engaged?: { unit: string; ranged: boolean }[];
}

export type Outcome = 'ongoing' | 'victory' | 'defeat';

// Where a charge is locked once aimed (Nov 15, Fernando): the tile, or the character standing on it
export type Lock = 'tile' | 'unit';

// Action with charge (FFT slow action, BMG 1.1 and A.2): declared on the turn, fires when `ticks` reaches 0. `follow` is the
// lock: null on the tile, else the unit it follows. The shot is traced when it fires, from where the caster stands then
export interface Charge {
  unit: string;
  ability: string;
  target: Pos;
  follow: string | null;
  ticks: number;
}

export interface BattleState {
  scenario: string;
  units: UnitState[]; // the dead leave the list
  rng: number; // RNG state; does NOT come back on undo
  turn: TurnState;
  charges: Charge[]; // in declaration order
  outcome: Outcome;
  turnsPlayed: number;
}

// events for the client to animate; the rule has already been applied to the state when they come out
export type BattleEvent =
  | { k: 'move'; unit: string; path: Pos[] }
  | { k: 'attack'; unit: string; ability: string; target: Pos }
  | { k: 'charge'; unit: string; ability: string; target: Pos } // started charging; fires later
  | { k: 'fizzle'; unit: string; ability: string } // the charge fired and found no target (it left the tile or the range)
  | { k: 'hit'; unit: string; dmg: number; chance: number }
  | { k: 'miss'; unit: string; chance: number }
  | { k: 'heal'; unit: string; amount: number }
  | { k: 'push'; unit: string; to: Pos }
  | { k: 'bump'; unit: string; dmg: number }
  | { k: 'fall'; unit: string; levels: number; dmg: number }
  | { k: 'spike'; unit: string; dmg: number } // spikes: pushed onto the tile or ended the turn on it
  | { k: 'die'; unit: string };
