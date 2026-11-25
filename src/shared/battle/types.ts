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
  facing?: number; // where it looks: index in FACING (grid.ts)
  // unit counters (mana, stamina; the study's stock, MP and attribute bonus); the keys come from UnitDef.vars, and a key absent
  // reads as the sheet's start value (poolOf in combat.ts)
  vars?: Record<string, number>;
}

// what the acting unit has already done: walks (as many times as it wants, up to its movement) and acts in its two slots, in any order
export interface TurnState {
  actor: string;
  moved: boolean;
  // what filled the turn's two slots (action-slots.ts): the ability or item (bag.ts) id; a second bonus action sits in `main`
  main: string | null;
  bonus: string | null;
  // Movement in parts (Nov 13, Fernando's request: "walk, attack and then walk again with the remaining movement"): points
  // already spent in the turn (absent = 0, the old save stays valid)
  spent?: number;
  // the units the actor struck this turn: each strikes back once, when the actor walks out of its reach (it leaves this list after answering), a shooter it stood
  // too close to once it walks out of that contact (counter.ts counters;
  // Nov 15, Fernando: only in the turn of the strike). Absent = none
  engaged?: string[];
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
  // cells the dead lie on, a large unit's whole square (Fernando, Nov 16): nobody stops there, anyone passes over
  // (pathing.ts noStopAt). They stay to the end of the battle; absent = none (a save from before, a battle without deaths)
  corpses?: Pos[];
  // what died on each corpse cell, by `posKey` (Nov 19: a resumed battle draws the dead unit's model, not a stock body); a save
  // from before has none and the scene falls back to the stock bodies
  corpseDefs?: Record<string, string>;
  // the heroes' shared bag of consumables, item id to count (Nov 19, bag.ts); absent = empty (a save from before, a battle
  // outside an expedition)
  bag?: Record<string, number>;
  // timed effects of items on units (effects.ts); absent = none
  effects?: { unit: string; item: string; turns: number }[];
}

// A point of a shot's path (pathing.ts traceShot): x and y in cells from the map's corner (a cell's middle is +0.5), h in
// levels above level 0. A half tile and a level are both 1 m (the trajectory grill of Nov 15)
export interface Point {
  x: number;
  y: number;
  h: number;
}
// A shot's path and where it stops: at k along the way (0 to 1) it stands at shotAt(shot, k), h = from.h + rise k - fall k²
// (fall 0: straight). `stop` is short of `to`: the unit's cell it hit, or the corner of the obstacle's whole tile
export interface Shot {
  from: Point;
  to: Point;
  rise: number;
  fall: number;
  lift: number; // how far `to` stands over the aimed ground (the aimed point of the target's body), for the landing ring
  seen: number; // share of the target's body points the shot's origin sees, which scales the hit chance (combat.ts); else 1
  stop: { k: number; pos: Pos; unit: string | null } | null;
}

// events for the client to animate; the rule has already been applied to the state when they come out
export type BattleEvent =
  | { k: 'move'; unit: string; path: Pos[] }
  | { k: 'attack'; unit: string; ability: string; target: Pos; shot?: Shot } // `shot`: the path the projectile flies
  | { k: 'charge'; unit: string; ability: string; target: Pos } // started charging; fires later
  | { k: 'fizzle'; unit: string; ability: string } // the charge fired and found no target (it left the tile or the range)
  | { k: 'hit'; unit: string; dmg: number; chance: number }
  | { k: 'miss'; unit: string; chance: number }
  | { k: 'heal'; unit: string; amount: number }
  | { k: 'regen'; unit: string; amount: number } // life regen at the start of its turn: not a heal (no power, no undead harm)
  | { k: 'item'; unit: string; item: string; target: Pos } // used an item from the bag on the unit at `target`
  | { k: 'mana'; unit: string; amount: number } // mana given back (an Ether)
  | { k: 'effect'; unit: string; item: string; turns: number } // an item's or, since Nov 21, an ability's timed effect on the unit (effects.ts)
  | { k: 'push'; unit: string; to: Pos }
  | { k: 'bump'; unit: string; dmg: number }
  | { k: 'fall'; unit: string; levels: number; dmg: number }
  | { k: 'spike'; unit: string; dmg: number } // spikes: pushed onto the tile or ended the turn on it
  | { k: 'die'; unit: string };
