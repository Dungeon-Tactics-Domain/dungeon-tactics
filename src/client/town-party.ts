// The Party screen (Nov 16, Fernando: the interface rebuilt on its FFT counterpart, the formation and unit menus): every
// member on the left (face, name, class, life and pool bars; who goes to battle first, under their count), the picked one's
// pages on the right: Status, Equipment, Abilities and Class. One window: the Sheet and the Equipment windows it had
// became its pages. Rules in group.ts and chest.ts.

import type { Slot } from '../shared/battle/equipment.ts';
import { looks3d } from './looks3d.ts';

const PAGES = ['status', 'gear', 'skills', 'job'] as const;
type Page = (typeof PAGES)[number];
// where the window opens: the member (the first of the list when absent or gone), the page, the Equipment page's open
// slot and the button that had the focus before it rebuilt itself
export interface PartyView {
  id?: string;
  page?: Page;
  slot?: Slot;
  at?: string;
}

export function openParty(back?: () => void, view: PartyView = {}) {
  looks3d.party?.(back, view); // drawn by town3d/screens.ts
}
