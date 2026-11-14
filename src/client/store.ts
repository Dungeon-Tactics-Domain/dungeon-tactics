// Preferences stored in the browser. localStorage can fail (incognito tab, blocked data): falls back to memory and is valid only in this tab.
const memory = new Map<string, string>();

type Saves = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
const MIGRATED = 'dt:migrated'; // how many MIGRATIONS already ran in this browser, so each runs once
// Nov 14: the saves had Portuguese keys; renamed keeping every value (progress, party, options)
const RENAMED: [old: string, now: string][] = [
  ['dt:amanhecer', 'dt:dawn'],
  ['dt:bau', 'dt:chest'],
  ['dt:campanha', 'dt:campaign'],
  ['dt:grupo', 'dt:party'],
  ['dt:heroi', 'dt:hero'],
  ['dt:missoes', 'dt:quests'],
  ['dt:mundo', 'dt:world'],
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
];
export function migrate(s: Saves) {
  const done = Number(s.getItem(MIGRATED)) || 0;
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
// the old name. Presence-only flags (?world) come back as '' (test with `!== null`).
const OLD_PARAM: Record<string, string> = {
  scenario: 'cenario',
  stage: 'campanha',
  quest: 'missao',
  world: 'mundo',
  from: 'de',
  music: 'musica',
  units: 'bonecos',
  extension: 'extensao',
};
export function param(name: string): string | null {
  if (typeof location === 'undefined') return null;
  const q = new URLSearchParams(location.search);
  return q.get(name) ?? (OLD_PARAM[name] ? q.get(OLD_PARAM[name]) : null);
}
