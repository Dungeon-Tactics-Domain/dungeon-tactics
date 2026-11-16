// Battle faces (Fernando's request, Nov 15): the dialogue box's painted sheets (src/content/faces.json) in the battle HUD,
// with an expression read from the events Game.animate plays. Pure: which sheet, which expression and for how long.
import faces from '../content/faces.json';
import { samePos } from '../shared/battle/grid.ts';
import type { BattleEvent } from '../shared/battle/types.ts';
import { baseDef } from '../shared/battle/units.ts';
import { classOf } from './dev-roster.ts';
import { modelOf } from './markers.ts';
import type { Face } from './talk.ts';

export type Expression = 'neutral' | 'shout' | 'hurt' | 'wounded' | 'smile' | 'angry';
// a timed expression, in ms of the battle clock
export interface Mood {
  expr: Expression;
  from: number;
  until: number;
}

const FACES: Record<string, Face> = faces;
// the sheet goes by the model on the map, like the dialogue box (faceOf), except the Warrior: Fernando's battle mapping
// gives it the barbarian's face. Story and developer sheets (camp1-h0…) go by their starting class
const BY_CLASS: Record<string, string> = { warrior: 'barbarian' };
export const battleFace = (def: string): Face | undefined =>
  FACES[BY_CLASS[classOf(def) ?? baseDef(def)] ?? modelOf(def)];
// a sheet without that expression (the small skeletons have only their mouth) stays on neutral
export const frameOf = (face: Face, expr: Expression): number => face.expressions?.[expr] ?? 0;

const MOOD_MS = { hurt: 900, shout: 700, angry: 2200, smile: 2200 };
const mood = (expr: keyof typeof MOOD_MS, from = 0): Mood => ({ expr, from, until: from + MOOD_MS[expr] });
const WOUNDED = 0.3; // under 30% of life the face stays wounded between reactions
export const BIG = 0.25; // the strike that shakes the camera (hit-weight.ts isBig) also leaves the target angry

// the moods each event starts, `from` counted from the moment that event plays (Game.beforeEvent). A counter-attack is an
// attack on the tile a later move leaves from (Battle.move puts it before the walk); a kill smiles for the last striker
export function faceCues(events: BattleEvent[], maxHp: (unit: string) => number): [string, Mood][][] {
  let striker: string | null = null;
  return events.map((e, i) => {
    if (e.k === 'charge') return [[e.unit, mood('shout')]];
    if (e.k === 'attack') {
      striker = e.unit;
      const next = events.slice(i + 1).find((n) => n.k === 'attack' || n.k === 'move');
      const counter = next?.k === 'move' && next.unit !== e.unit && samePos(next.path[0], e.target);
      return [[e.unit, mood(counter ? 'angry' : 'shout')]];
    }
    if (e.k === 'die') return striker && striker !== e.unit ? [[striker, mood('smile')]] : [];
    if (e.k !== 'hit' && e.k !== 'bump' && e.k !== 'fall' && e.k !== 'spike') return [];
    if (e.dmg < maxHp(e.unit) * BIG) return [[e.unit, mood('hurt')]];
    return [
      [e.unit, mood('hurt')],
      [e.unit, mood('angry', MOOD_MS.hurt)],
    ];
  });
}

// the face shown now: a running mood, then the victory smile, then wounded under 30% of life, else neutral
export function expressionAt(moods: readonly Mood[], now: number, hp: number, maxHp: number, won = false): Expression {
  const m = moods.find((x) => now >= x.from && now < x.until);
  if (m) return m.expr;
  if (won) return 'smile';
  return hp < maxHp * WOUNDED ? 'wounded' : 'neutral';
}

// the face on the end-of-battle hero card: the fallen hurt (greyed by the card), under 30% of life wounded, the rest
// smile on a victory and stay neutral on a defeat. Not expressionAt: there the victory smile beats wounded
export const endExpression = (hp: number, maxHp: number, won: boolean): Expression =>
  hp <= 0 ? 'hurt' : hp < maxHp * WOUNDED ? 'wounded' : won ? 'smile' : 'neutral';
