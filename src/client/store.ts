// Preferences stored in the browser. localStorage can fail (incognito tab, blocked data): falls back to memory and is valid only in this tab.
const memory = new Map<string, string>();

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
