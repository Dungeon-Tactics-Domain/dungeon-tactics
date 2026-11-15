// Save slots (Nov 15, Fernando: "save games so New game does not erase the progress"). The game keeps reading and writing
// its progress keys as before; a slot is a stored copy of them in the dt:saves manifest. Loading a slot puts its copy in
// the live keys after writing the live game back into its own slot, so nothing is lost. Settings (language, sound, theme,
// camera) and the standalone battles' saves stay outside the slots. Pure and tested; the window is game/saves-ui.ts.
import { expeditionMap, openNodes, parseExpedition } from '../shared/crawl/expedition.ts';
import { CHEST_KEY, EQUIP_KEY, parseChest } from './chest.ts';
import { GROUP_KEY, type Job, parseGroup } from './group.ts';

export const SAVES_KEY = 'dt:saves';
export const CRAWL_KEY = 'dt:crawl';
export const ROOM_KEY = 'dt:battle:expedition'; // the room in play, saved from its first frame (main.ts boot)
export const PLAYED_KEY = 'dt:played'; // when the game was last played: store.ts stamps it on every progress write
// what a game is made of: the party, its chest and equipment, the expedition and the room in play
export const PROGRESS_KEYS = [GROUP_KEY, CHEST_KEY, EQUIP_KEY, CRAWL_KEY, ROOM_KEY];
// played goes last: restoring the progress keys through store.set stamps it, the slot's own time must win
const SLOT_KEYS = [...PROGRESS_KEYS, PLAYED_KEY];

type Data = Record<string, string>;
export interface Slot {
  id: number;
  data: Data;
}
export interface Manifest {
  active: number | null; // the slot the live keys belong to
  slots: Slot[];
}
type Saves = Pick<Storage, 'getItem' | 'setItem'>;

const json = (v: string | null | undefined): unknown => {
  try {
    return JSON.parse(v || 'null');
  } catch {
    return null;
  }
};

// Trust boundary: the manifest comes from the browser. A slot needs a whole positive id of its own; its copy keeps only
// the slot keys with text values (a crafted save cannot write settings); an active id with no slot is none
export function parseManifest(raw: unknown): Manifest {
  const r = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const slots: Slot[] = [];
  for (const x of Array.isArray(r.slots) ? r.slots : []) {
    const { id, data } = (x && typeof x === 'object' ? x : {}) as Record<string, unknown>;
    if (!Number.isInteger(id) || (id as number) < 1 || slots.some((s) => s.id === id)) continue;
    const d = (data && typeof data === 'object' ? data : {}) as Record<string, unknown>;
    const kept = SLOT_KEYS.flatMap((k) => (typeof d[k] === 'string' && d[k] ? [[k, d[k] as string]] : []));
    slots.push({ id: id as number, data: Object.fromEntries(kept) });
  }
  return { active: slots.some((s) => s.id === r.active) ? (r.active as number) : null, slots };
}

// the live game's keys, without the cleared ones ('' is how the game clears a save)
export const snapshot = (s: Saves): Data =>
  Object.fromEntries(
    SLOT_KEYS.flatMap((k) => {
      const v = s.getItem(k);
      return v ? [[k, v]] : [];
    }),
  );

const restore = (s: Saves, data: Data) => {
  for (const k of SLOT_KEYS) s.setItem(k, data[k] ?? '');
};
const nextId = (m: Manifest) => Math.max(0, ...m.slots.map((x) => x.id)) + 1;

// The manifest as it stands now: the active slot holds the live game (its stored copy is older), and live progress with
// no slot (the single save from before the slots, or a town reached by its address) becomes a new active slot
export function readSaves(s: Saves): Manifest {
  const m = parseManifest(json(s.getItem(SAVES_KEY)));
  const live = snapshot(s);
  if (m.active !== null) return { ...m, slots: m.slots.map((x) => (x.id === m.active ? { ...x, data: live } : x)) };
  if (!PROGRESS_KEYS.some((k) => live[k])) return m;
  const id = nextId(m);
  return { active: id, slots: [...m.slots, { id, data: live }] };
}

// Written before any live key changes; false when the browser kept the old manifest (storage full), so the caller stops
// and the live game stays as it was
function write(s: Saves, m: Manifest) {
  const v = JSON.stringify(m);
  s.setItem(SAVES_KEY, v);
  return s.getItem(SAVES_KEY) === v;
}

// New game: the live game stays in its slot and a clean game starts in a new slot, listed at once (a fresh town writes nothing)
export function newGame(s: Saves, now: number) {
  const m = readSaves(s);
  const id = nextId(m);
  if (!write(s, { active: id, slots: [...m.slots, { id, data: {} }] })) return false;
  restore(s, { [PLAYED_KEY]: String(now) });
  return true;
}

export function loadSlot(s: Saves, id: number) {
  const m = readSaves(s);
  const slot = m.slots.find((x) => x.id === id);
  if (!slot || !write(s, { ...m, active: id })) return false;
  restore(s, slot.data);
  return true;
}

// deleting the game in play clears the live keys too, otherwise its progress would live on with no slot
export function deleteSlot(s: Saves, id: number) {
  const m = readSaves(s);
  if (!write(s, { active: m.active === id ? null : m.active, slots: m.slots.filter((x) => x.id !== id) })) return false;
  if (m.active === id) restore(s, {});
  return true;
}

// a row of the Continue list, read from the slot's copy by the game's own parsers (nothing stored that could go stale)
export interface SlotSummary {
  id: number;
  leader: Job; // the first deployed member's class, for the face
  names: string[]; // who goes, in order
  gold: number;
  floor: number | null; // the floor of the expedition in progress; null in town
  room: boolean; // a room battle is saved (Continue reopens it)
  played: number | null;
}
export function summary({ id, data }: Slot): SlotSummary {
  const g = parseGroup(json(data[GROUP_KEY]));
  const team = g.deployed.map((d) => g.members.find((m) => m.id === d)!);
  const exp = parseExpedition(json(data[CRAWL_KEY]));
  const map = exp && expeditionMap(exp.seed);
  const open = exp && map ? openNodes(map, exp.path) : [];
  const played = Number(data[PLAYED_KEY]);
  return {
    id,
    leader: team[0].cls,
    names: team.map((m) => m.name),
    gold: parseChest(json(data[CHEST_KEY])).gold,
    floor: map && open.length ? map[open[0]].floor : null,
    room: !!data[ROOM_KEY] && open.length > 0,
    played: played > 0 ? played : null,
  };
}

// the latest played first; a slot never played (a save from before the slots) after them, newest slot first
export const byPlayed = (a: SlotSummary, b: SlotSummary) => (b.played ?? 0) - (a.played ?? 0) || b.id - a.id;
