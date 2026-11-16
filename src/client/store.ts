// Preferences stored in the browser. localStorage can fail (incognito tab, blocked data): falls back to memory and is valid only in this tab.
import { PLAYED_KEY, PROGRESS_KEYS, readSaves, SAVES_KEY } from './saves.ts';

const memory = new Map<string, string>();

type Saves = Pick<Storage, 'getItem' | 'setItem' | 'removeItem' | 'key' | 'length'>;
const MIGRATED = 'dt:migrated'; // how many MIGRATIONS already ran in this browser, so each runs once
// Nov 14: the saves had Portuguese keys; renamed keeping every value (progress, party, options)
const RENAMED: [old: string, now: string][] = [
  ['dt:amanhecer', 'dt:dawn'],
  ['dt:bau', 'dt:chest'],
  ['dt:grupo', 'dt:party'],
  ['dt:rapido', 'dt:fast'],
  ['dt:texto', 'dt:text'],
  ['dt:turnos', 'dt:turns'],
  ['dt:pixel2', 'dt:pixel'],
];
// Save format changes, in order. Each takes the saves as they were left by the previous one.
const MIGRATIONS: ((s: Saves) => void)[] = [
  (s) => {
    // dt:estrelas is dead since the stars left (Nov 13); dt:pixel was abandoned for dt:pixel2 on Nov 13 to put everyone
    // back on plain 3D, so its leftover goes before pixel2 takes the name, otherwise the old setting would come back
    s.removeItem('dt:estrelas');
    s.removeItem('dt:pixel');
    for (const [old, now] of RENAMED) {
      const v = s.getItem(old);
      if (v !== null && s.getItem(now) === null) s.setItem(now, v);
      s.removeItem(old);
    }
  },
  // Nov 14: renamed the Portuguese quest ids; the quests left with the campaign on Nov 15 (the next step drops their
  // saves). Kept as an empty step: dt:migrated counts positions in this list
  () => {},
  (s) => {
    // Nov 15: the world map and the Beacon Ashes campaign left the code; their saves (progress, protagonist, quests, the
    // battles of stages and quests, under the old Portuguese names too) are dead
    for (const k of [
      'dt:world',
      'dt:campaign',
      'dt:hero',
      'dt:quests',
      'dt:mundo',
      'dt:campanha',
      'dt:heroi',
      'dt:missoes',
    ])
      s.removeItem(k);
    const dead: string[] = [];
    for (let i = 0; i < s.length; i++) {
      const k = s.key(i);
      if (k && /^dt:battle:(camp\d+|quest-|missao-)/.test(k)) dead.push(k);
    }
    for (const k of dead) s.removeItem(k);
  },
  (s) => {
    // Nov 15: save slots (saves.ts); the single save from before them becomes slot 1
    const m = readSaves(s);
    if (m.slots.length) s.setItem(SAVES_KEY, JSON.stringify(m));
  },
  (s) => {
    // Nov 15: life and damage x5 (Fernando's grill); a battle saved mid-fight would go on at a fifth of its life, so it
    // starts over (the expedition's own save is dropped by CRAWL_VERSION)
    const dead: string[] = [];
    for (let i = 0; i < s.length; i++) {
      const k = s.key(i);
      if (k && /^dt:battle(:|$)/.test(k)) dead.push(k);
    }
    for (const k of dead) s.removeItem(k);
  },
];
export function migrate(s: Saves) {
  // only a missing count (a browser from before the migrations) reruns them; a negative or garbage count reads as all
  // done, since a rerun step deletes live saves (a negative slice would rerun the last ones)
  const v = s.getItem(MIGRATED);
  const n = Number(v);
  const done = v === null ? 0 : Number.isInteger(n) && n >= 0 ? n : MIGRATIONS.length;
  for (const m of MIGRATIONS.slice(done)) m(s);
  s.setItem(MIGRATED, String(MIGRATIONS.length));
}
// on import, before any module reads a key
try {
  migrate(localStorage);
} catch {
  // no storage (incognito, blocked): nothing saved to migrate
}

export const store = {
  get(k: string): string | null {
    try {
      return localStorage.getItem(k) ?? memory.get(k) ?? null;
    } catch {
      return memory.get(k) ?? null;
    }
  },
  set(k: string, v: string) {
    memory.set(k, v);
    try {
      localStorage.setItem(k, v);
    } catch {
      // memory only
    }
    // the save slot's last-played time (saves.ts), for the Continue list
    if (PROGRESS_KEYS.includes(k)) store.set(PLAYED_KEY, String(Date.now()));
  },
  // What the browser kept, without this tab's memory: set falls back to memory silently, so a write a full storage refused
  // only shows here (no storage at all: the memory is all there is)
  saved(k: string): string | null {
    try {
      return localStorage.getItem(k);
    } catch {
      return memory.get(k) ?? null;
    }
  },
  // Missing or invalid syntax = null; each consumer validates the format before using.
  json(k: string): unknown {
    try {
      return JSON.parse(store.get(k) ?? 'null');
    } catch {
      return null;
    }
  },
};

// URL parameters were Portuguese until Nov 14 (?cenario, ?campanha, ?mundo…): links shared before that still open, through
// the old name. Presence-only flags (?home) come back as '' (test with `!== null`).
const OLD_PARAM: Record<string, string> = {
  scenario: 'cenario',
  music: 'musica',
  units: 'bonecos',
  extension: 'extensao',
};
export function param(name: string): string | null {
  if (typeof location === 'undefined') return null;
  const q = new URLSearchParams(location.search);
  return q.get(name) ?? (OLD_PARAM[name] ? q.get(OLD_PARAM[name]) : null);
}
