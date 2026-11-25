// The map builder's browser saves (Nov 25, spec: named slots read back field by field): the map being edited, which
// Play and a reload read too, and the named slots, one per map name. Pure and tested; store.ts does the storing.
import type { MapDoc } from '../../shared/mapedit/doc.ts';
import { parseMapDoc } from '../../shared/mapedit/parse.ts';

export const DRAFT_KEY = 'dt:mapedit'; // the map on the builder's screen
export const SLOTS_KEY = 'dt:mapedit:slots';
export const PLAY_KEY = 'dt:battle:mapedit'; // Play's battle save, cleared on every Play so an edit never resumes it
export const MAX_SLOTS = 20;

// a slot list from storage: every map rebuilt by parseMapDoc, the broken ones dropped, one per name (the last wins)
export function parseSlots(v: unknown): MapDoc[] {
  if (!Array.isArray(v)) return [];
  const byName = new Map<string, MapDoc>();
  for (const raw of v) {
    const doc = parseMapDoc(raw);
    if (doc) byName.set(doc.name, doc);
  }
  return [...byName.values()].slice(-MAX_SLOTS);
}

// the map saved under its Portuguese name, newest last; the oldest leaves past MAX_SLOTS
export const withSlot = (slots: MapDoc[], doc: MapDoc): MapDoc[] =>
  [...slots.filter((s) => s.name !== doc.name), doc].slice(-MAX_SLOTS);

// a map id from its name, as parseMapDoc and the .ts export take it (letters, digits, _)
export function idOf(name: string): string {
  const id = name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40);
  return id || 'new_map';
}
