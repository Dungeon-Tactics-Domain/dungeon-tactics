// Save slots (Nov 15, Fernando: "save games so New game does not erase the progress"). The game keeps reading and writing
// its progress keys as before; a slot is a stored copy of them in the dt:saves manifest. Loading a slot puts its copy in
// the live keys after writing the live game back into its own slot, so nothing is lost. Settings (language, sound, theme,
// camera) and the standalone battles' saves stay outside the slots. Pure and tested; the window is game/saves-ui.ts.
import { expeditionMap, openNodes, parseExpedition } from '../shared/crawl/expedition.ts';
import { CHEST_KEY, EQUIP_KEY, parseChest, startingEquip } from './chest.ts';
import { GROUP_KEY, type Job, parseGroup } from './group.ts';

export const SAVES_KEY = 'dt:saves';
export const BAD_KEY = 'dt:saves:bad'; // the last manifest the parse could not read whole, kept to recover by hand
export const CRAWL_KEY = 'dt:crawl';
export const ROOM_KEY = 'dt:battle:expedition'; // the room in play, saved from its first frame (entry.ts boot)
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
// `saved` reads what the browser kept, without store.ts's in-tab memory: a write the full storage refused shows there
type Saves = Pick<Storage, 'getItem' | 'setItem'> & { saved(k: string): string | null };

const json = (v: string | null | undefined): unknown => {
  try {
    return JSON.parse(v || 'null');
  } catch {
    return null;
  }
};

// Trust boundary: the manifest comes from the browser. A slot needs a safe whole positive id of its own (2^60 passes
// isInteger and id + 1 equals it); its copy keeps only
// the slot keys with text values (a crafted save cannot write settings); an active id with no slot is none
export function parseManifest(raw: unknown): Manifest {
  const r = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const slots: Slot[] = [];
  for (const x of Array.isArray(r.slots) ? r.slots : []) {
    const { id, data } = (x && typeof x === 'object' ? x : {}) as Record<string, unknown>;
    if (!Number.isSafeInteger(id) || (id as number) < 1 || slots.some((s) => s.id === id)) continue;
    const d = (data && typeof data === 'object' ? data : {}) as Record<string, unknown>;
    const kept = SLOT_KEYS.flatMap((k) => (typeof d[k] === 'string' && d[k] ? [[k, d[k] as string]] : []));
    slots.push({ id: id as number, data: Object.fromEntries(kept) });
  }
  return { active: slots.some((s) => s.id === r.active) ? (r.active as number) : null, slots };
}

// the live game's keys, without the cleared ones ('' is how the game clears a save)
export const snapshot = (s: Pick<Storage, 'getItem'>): Data =>
  Object.fromEntries(
    SLOT_KEYS.flatMap((k) => {
      const v = s.getItem(k);
      return v ? [[k, v]] : [];
    }),
  );

// key by key; false at the first one the browser refused (a room battle can be large)
const restore = (s: Saves, data: Data) =>
  SLOT_KEYS.every((k) => {
    const v = data[k] ?? '';
    s.setItem(k, v);
    return s.saved(k) === v;
  });
// the first free id, so a huge id kept in the manifest never makes the next one overflow
const nextId = (m: Manifest) => {
  let id = 1;
  while (m.slots.some((x) => x.id === id)) id++;
  return id;
};

// The manifest as it stands now: the active slot holds the live game (its stored copy is older), and live progress with
// no slot (the single save from before the slots, or a town reached by its address) becomes a new active slot
export function readSaves(s: Pick<Storage, 'getItem'>): Manifest {
  const m = parseManifest(json(s.getItem(SAVES_KEY)));
  const live = snapshot(s);
  if (m.active !== null) return { ...m, slots: m.slots.map((x) => (x.id === m.active ? { ...x, data: live } : x)) };
  if (!PROGRESS_KEYS.some((k) => live[k])) return m;
  const id = nextId(m);
  return { active: id, slots: [...m.slots, { id, data: live }] };
}

// false when the browser kept the old manifest (storage full), so the caller stops. A stored manifest the parse does not
// give back the same (broken text, a dropped slot) goes aside first: the parse read it as less than it holds
function write(s: Saves, m: Manifest) {
  const old = s.getItem(SAVES_KEY);
  if (old && JSON.stringify(parseManifest(json(old))) !== old) s.setItem(BAD_KEY, old);
  const v = JSON.stringify(m);
  s.setItem(SAVES_KEY, v);
  return s.saved(SAVES_KEY) === v;
}

// Puts `data` in the live keys and makes `id` the slot in play; `m` holds the game in play in its own slot. While the
// keys change no slot owns them (active null): a refused key halfway leaves them to readSaves, which keeps them as a
// slot of their own instead of mixing two games in one slot; the game in play goes back when the browser takes it
function switchTo(s: Saves, m: Manifest, id: number | null, data: Data) {
  if (!write(s, { ...m, active: null })) return false;
  if (!restore(s, data)) {
    if (restore(s, m.slots.find((x) => x.id === m.active)?.data ?? {})) write(s, m);
    return false;
  }
  return write(s, { ...m, active: id });
}

// New game: the live game stays in its slot and a clean game starts in a new slot, listed at once, with 0 gold and only
// the story members' weapons (Nov 16, slice 3; written here, so a save without them never gets them)
export function newGame(s: Saves, now: number) {
  const m = readSaves(s);
  const id = nextId(m);
  return switchTo(s, { ...m, slots: [...m.slots, { id, data: {} }] }, id, {
    [EQUIP_KEY]: JSON.stringify(startingEquip()),
    [PLAYED_KEY]: String(now),
  });
}

export function loadSlot(s: Saves, id: number) {
  const m = readSaves(s);
  const slot = m.slots.find((x) => x.id === id);
  return !!slot && switchTo(s, m, id, slot.data);
}

// deleting the game in play clears the live keys too, otherwise its progress would live on with no slot
export function deleteSlot(s: Saves, id: number) {
  const m = readSaves(s);
  const rest = { ...m, slots: m.slots.filter((x) => x.id !== id) };
  return m.active === id ? switchTo(s, rest, null, {}) : write(s, rest);
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
