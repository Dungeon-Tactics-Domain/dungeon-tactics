// Debug › Models (Fernando, Nov 25: "basta homem q eh base e mulher"): the figures' height in heads and each
// character's body, a man (the model as it is) or a woman, saved per player (dt:bodies) and read when a battle loads.
// Pure: which file a model draws from and which body a unit wears.
import { baseDef } from '../shared/battle/units.ts';
import { modelOf } from './markers.ts';
import { store } from './store.ts';

const KEY = 'dt:bodies';
export const HEADS = [2, 3, 4, 5] as const; // 2 is KayKit's own figure; 3 to 5 are scripts/assets/four-heads.mjs
export type Heads = (typeof HEADS)[number];
export type Sex = 'f' | 'm';
export interface Bodies {
  heads: Heads;
  sex: Record<string, Sex>; // by the unit's id in its battle; a unit not here takes its class's default
}

// the 10 KayKit humanoids built at 3, 4 and 5 heads; the snake, rat, spider and bat keep their own rigs
const LIVING = ['knight', 'ranger', 'mage', 'rogue_hooded', 'lancer', 'barbarian'];
const HUMANOIDS = new Set([...LIVING, 'skeleton_warrior', 'skeleton_rogue', 'skeleton_mage', 'skeleton_minion']);
// Fernando's defaults (Nov 25): the Mage, the hooded Rogue and the Archer are women; every other living class a man
const WOMEN = new Set(['mage', 'rogue', 'archer']);
const MAX_SEX = 64; // more than any battle holds: a saved list never grows without end
const ID = /^[\w-]{1,40}$/;

// trust boundary: the saved settings come from the browser, rebuilt field by field; anything odd is the default
export function parseBodies(v: unknown): Bodies {
  const o = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>;
  const heads = HEADS.find((h) => h === o.heads) ?? 2;
  const raw = o.sex && typeof o.sex === 'object' && !Array.isArray(o.sex) ? (o.sex as Record<string, unknown>) : {};
  const sex = Object.fromEntries(
    Object.entries(raw)
      .filter(([id, s]) => ID.test(id) && (s === 'f' || s === 'm'))
      .slice(0, MAX_SEX),
  ) as Record<string, Sex>;
  return { heads, sex };
}

let saved = parseBodies(store.json(KEY));
export const bodies = () => saved;
export function setBodies(b: Bodies) {
  saved = parseBodies(b);
  store.set(KEY, JSON.stringify(saved));
}

// the file a model draws from at this height: the stock one at 2 heads and for anything outside the 10 humanoids
export const modelFile = (model: string, heads: Heads = saved.heads) =>
  heads > 2 && HUMANOIDS.has(model) ? `${model}_${heads}h` : model;

// a sex only for the living humanoids: the skeletons and the creatures keep their model's body
export const hasSex = (def: string) => LIVING.includes(modelOf(def));
export const defaultSex = (def: string): Sex => (WOMEN.has(baseDef(def)) ? 'f' : 'm');
export const sexOf = (b: Bodies, id: string, def: string): Sex | null =>
  hasSex(def) ? (b.sex[id] ?? defaultSex(def)) : null;
