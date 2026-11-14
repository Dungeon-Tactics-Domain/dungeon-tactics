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
