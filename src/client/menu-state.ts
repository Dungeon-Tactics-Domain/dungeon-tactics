// Whether the command menu shows, and what a tap or a key does to it (Fernando, Nov 18 night: a tap on an empty tile
// with the menu up closes it and only moves the cursor; the menu comes back from the acting unit's sheet or the hero
// itself; a tap on another unit opens its look-only mini menu). Pure: hero-turn.ts applies it.
import type { Battle } from '../shared/battle/battle.ts';
import { unitAt } from '../shared/battle/pathing.ts';
import type { Pos } from '../shared/battle/types.ts';
import { cancelStep, type Screen } from './command.ts';
import type { KeyAction } from './keyboard.ts';

// 'open': the menu shows again; 'close': it hides and the cursor goes to the tile; 'peek': the unit's mini menu
export type MenuTap = { k: 'open' } | { k: 'close'; at: Pos } | { k: 'peek'; unit: string };

// the screens the menu belongs to: elsewhere (Move or Act map, "Execute?", facing) a tap keeps its own meaning
export const menuScreen = (s: Screen) => s.k === 'menu' || s.k === 'abilities';

// Whether the menu, its Back and "Execute?" show: a hero's turn with nothing playing (`open`) and the map not being
// looked at (a tap on an empty tile shut the menu, or another unit's range is painted). They come back together.
export const menuUp = (open: boolean, v: { closed?: boolean; range?: string | null }) => open && !v.closed && !v.range;

// A tap on the map (`at`, the tile picked) or on the acting sheet (`sheet`) while the menu's screens are up, shown or
// closed. null: the tap is not the menu's
export function menuTap(b: Battle, s: Screen, at: Pos | 'sheet' | null): MenuTap | null {
  if (!menuScreen(s) || !at) return null;
  if (at === 'sheet') return { k: 'open' };
  const u = unitAt(b.state, at);
  if (!u) return { k: 'close', at };
  return u.id === b.actor.id ? { k: 'open' } : { k: 'peek', unit: u.id };
}

// A unit's card in the turn list: the acting hero brings the menu back, any other unit opens its mini menu
export const cardTap = (b: Battle, unit: string): MenuTap =>
  unit === b.actor.id ? { k: 'open' } : { k: 'peek', unit };

// A key or pad action on the menu's screens. Closed: Confirm and Cancel open it again (the keyboard has no sheet to
// tap). Open: Cancel closes it only where it has nothing else to do; after a free move it still undoes it (Nov 13)
export function menuKey(b: Battle, s: Screen, closed: boolean, a: KeyAction): 'open' | 'close' | null {
  if (!menuScreen(s)) return null;
  if (closed) return a.k === 'confirm' || a.k === 'cancel' ? 'open' : null;
  return a.k === 'cancel' && s.k === 'menu' && cancelStep(b, s) === null ? 'close' : null;
}
