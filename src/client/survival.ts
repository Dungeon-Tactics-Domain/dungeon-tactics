// "Until dawn" mode (night of Nov 12, request for new modes): in the standalone Battle, the 4 heroes hold out in the Ash
// Ash Wood against enemies stronger than they are until the queue reaches SURVIVE_TURNS turns (of everyone, as the turn list
// counts). Downing everyone also wins. Kept outside the campaign: a new stage in the middle would change the saves and the map order.
import type { Scenario } from '../shared/battle/scenarios.ts';
import type { BattleState } from '../shared/battle/types.ts';
import { buildDevScenario, type DevUnit, unitFrom } from './dev-roster.ts';

export const SURVIVAL_ID = 'survival';
// measured on Nov 13 (MEDIR=300, AI on both sides) after the x1.75 damage and the facing: with 1.5x HP and 40 turns the heroes
// win 30% and idle ones win 16%; with 36 turns, idle (48%) won more than fighting (43%), and with 2x HP and 28 turns
// idle won 99% (the battle got shorter and the enemies didn't arrive in time). Before the new damage: 2x HP and 64 turns
export const SURVIVE_TURNS = 40;
// 1.5x HP (before 2x): without the reinforcement, downing everyone before the end was the common path and the mode became any battle;
// with the x1.75 damage, 2x left the heroes at 9%
const TOUGH = 1.5;
const tough = (base: string): DevUnit => {
  const u = unitFrom(base);
  return { ...u, hp: Math.round(u.hp * TOUGH) };
};

// grass tiles on Ash Wood's hero side (rows 6 and 7, below the river), surrounding the start on both flanks
const AMBUSH = [
  { x: 1, y: 7 },
  { x: 6, y: 6 },
  { x: 9, y: 7 },
  { x: 11, y: 6 },
];

export const turnsLeft = (state: BattleState) => Math.max(0, SURVIVE_TURNS - state.turnsPlayed);
// Record (to give a reason to replay): how many turns the party held out in the best game, up to SURVIVE_TURNS. Kept in the
// browser; the saved value is a trust boundary (integer between 0 and SURVIVE_TURNS, otherwise 0).
export const BEST_KEY = 'dt:dawn';
export function parseBest(raw: unknown): number {
  const n = Number(raw);
  return Number.isInteger(n) && n >= 0 && n <= SURVIVE_TURNS ? n : 0;
}
export const survived = (state: BattleState) => Math.min(state.turnsPlayed, SURVIVE_TURNS);

export const survivalGoal = (say: (pt: string, en: string) => string) =>
  say(`Resista até o amanhecer: ${SURVIVE_TURNS} turnos!`, `Hold out until dawn: ${SURVIVE_TURNS} turns!`);

// `turns`: only the measurement (tests/survival.test.ts) overrides it, to find the number of turns that gives the right difficulty
export function survivalScenario(turns = SURVIVE_TURNS): Scenario {
  const s = buildDevScenario(
    {
      map: 'ash_wood',
      heroes: ['warrior', 'archer', 'mage', 'rogue'].map((b) => unitFrom(b)),
      enemies: ['brute', 'skeleton_archer', 'dark_mage', 'brute'].map(tough),
    },
    SURVIVAL_ID,
    ['Até o amanhecer', 'Until Dawn'],
  );
  // ambush: the enemies are already born on this side of the river, around the party. Born on the other side, heroes who just passed the
  // turn won 100% (waiting costs little, the turn counter runs and the enemies never even arrived; measured on Nov 13)
  let k = 0;
  s.spawns = s.spawns.map((sp) => (sp.team === 'enemy' ? { ...sp, ...AMBUSH[k++] } : sp));
  // the custom rule replaces the default entirely (which loses without a Lighthouse): hence it repeats fallen heroes and downed enemies
  s.rules = {
    outcome: (st) =>
      !st.units.some((u) => u.team === 'hero')
        ? 'defeat'
        : !st.units.some((u) => u.team === 'enemy') || st.turnsPlayed >= turns
          ? 'victory'
          : 'ongoing',
  };
  return s;
}
