// The shot rules' debug settings (Debug › Shot rules, game/debug-shot.ts): saved per player in `dt:shot-rules` and copied
// into the engine's SHOT_RULES, which every shot reads (shared/battle/shot-rules.ts)
import { type BodyForm, SHOT_DEFAULTS, SHOT_RULES, type ShotRules } from '../shared/battle/shot-rules.ts';
import { store } from './store.ts';

export const SHOT_KEY = 'dt:shot-rules';
const FORMS = Object.keys(SHOT_DEFAULTS.forms) as BodyForm[];
// a share in 5% steps from 0 to 1, as the menu's percent rows step
const share = (v: unknown, fallback: number) =>
  typeof v === 'number' && v >= 0 && v <= 1 && Number.isInteger(Math.round(v * 100) / 5) ? v : fallback;
const flag = (v: unknown, fallback: boolean) => (typeof v === 'boolean' ? v : fallback);

// read back from the browser: every field rebuilt on its own, a doubtful one falls to its default
export function parseShotRules(raw: unknown): ShotRules {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Partial<Record<keyof ShotRules, unknown>>;
  const d = SHOT_DEFAULTS;
  // a range per body form (the launch's `forms`, the aim's `aims`): both ends shares, low not above high
  const ranges = (k: 'forms' | 'aims') => {
    const all = (r[k] && typeof r[k] === 'object' ? r[k] : {}) as Partial<Record<BodyForm, unknown>>;
    const range = (f: BodyForm): [number, number] => {
      const v = all[f];
      const [lo, hi] = Array.isArray(v) ? [share(v[0], -1), share(v[1], -1)] : [-1, -1];
      return lo >= 0 && hi >= 0 && lo <= hi ? [lo, hi] : [...d[k][f]];
    };
    return Object.fromEntries(FORMS.map((f) => [f, range(f)])) as ShotRules[typeof k];
  };
  return {
    launch: flag(r.launch, d.launch),
    parts: flag(r.parts, d.parts),
    cover: flag(r.cover, d.cover),
    forms: ranges('forms'),
    aims: ranges('aims'),
    coverWeight: share(r.coverWeight, d.coverWeight),
  };
}

export const shotRules = (): ShotRules => SHOT_RULES;
export function setShotRules(next: ShotRules) {
  Object.assign(SHOT_RULES, structuredClone(next));
  store.set(SHOT_KEY, JSON.stringify(next));
}
// at boot, before any battle reads a shot
export const applySavedShotRules = () => Object.assign(SHOT_RULES, parseShotRules(store.json(SHOT_KEY)));
