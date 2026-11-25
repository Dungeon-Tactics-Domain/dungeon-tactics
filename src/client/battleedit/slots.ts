// The battle builder's browser saves (Nov 25, grill: named slots like the map builder's, and the Developer menu's
// saved cast becomes the first slot): the battle on the screen (which Play and a reload read) and the named slots.
// Pure and tested; store.ts does the storing.
import type { BattleDoc } from '../../shared/mapedit/battle.ts';
import { battleFromDevCast } from '../../shared/mapedit/migrate.ts';
import { parseBattleDoc } from '../../shared/mapedit/parse.ts';
import { parseSetup } from '../dev-roster.ts';

export const DRAFT_KEY = 'dt:battleedit';
export const SLOTS_KEY = 'dt:battleedit:slots';
export const PLAY_KEY = 'dt:battle:battleedit'; // Play's battle save, cleared on every Play
export const MAX_SLOTS = 20;
export const NAME_MAX = 40;

export interface Slot {
  name: string; // the slot's own name: two battles on one map are two slots
  doc: BattleDoc;
}

const isName = (v: unknown): v is string =>
  typeof v === 'string' && !!v.trim() && v.length <= NAME_MAX && !/\p{Cc}/u.test(v);

// one saved battle, rebuilt field by field; null on any doubt
export function parseSlot(v: unknown): Slot | null {
  if (!v || typeof v !== 'object') return null;
  const { name, doc } = v as Record<string, unknown>;
  const battle = parseBattleDoc(doc);
  return isName(name) && battle ? { name: name.trim(), doc: battle } : null;
}

// a slot list from storage: the broken ones dropped, one per name (the last wins), the newest MAX_SLOTS
export function parseSlots(v: unknown): Slot[] {
  if (!Array.isArray(v)) return [];
  const byName = new Map<string, Slot>();
  for (const raw of v) {
    const s = parseSlot(raw);
    if (s) {
      byName.delete(s.name);
      byName.set(s.name, s);
    }
  }
  return [...byName.values()].slice(-MAX_SLOTS);
}

export const withSlot = (slots: Slot[], slot: Slot): Slot[] =>
  [...slots.filter((s) => s.name !== slot.name), slot].slice(-MAX_SLOTS);

// The slots the first opening starts with: none saved yet (`saved` null) and a Developer cast in the browser, that cast
// as the slot "Desenvolvedor" (grill, Nov 25); once the slot list is written this never runs again
export function firstSlots(saved: unknown, devCast: unknown): Slot[] {
  if (saved !== null) return parseSlots(saved);
  const cast = parseSetup(devCast);
  const doc = cast && battleFromDevCast(cast);
  return doc ? [{ name: 'Desenvolvedor', doc }] : [];
}
