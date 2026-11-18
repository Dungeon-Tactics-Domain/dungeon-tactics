// The Party screen (Nov 16, Fernando: the interface rebuilt on its FFT counterpart, the formation and unit menus): every
// member on the left (face, name, class, life and pool bars; who goes to battle first, under their count), the picked one's
// pages on the right: Status, Equipment, Abilities and Class. One window: the Sheet and the Equipment windows it had
// became its pages. Rules in group.ts and chest.ts.

import { type Slot, withGear } from '../shared/battle/equipment.ts';
import { UNIT_DEFS } from '../shared/battle/units.ts';
import { abilityDetail, regenLine } from './battle-text.ts';
import { CHEST_KEY, CHEST_MAX, EQUIP_KEY } from './chest.ts';
import { choice, dialog, scrollCue, secondTap } from './dialog.ts';
import { changeClass, DEPLOY_MAX, dismiss, JOBS, type Member, roster, toggleDeploy } from './group.ts';
import { gauge, poolGauges, stillFace } from './hud-pieces.ts';
import { abilityName, t, unitName } from './i18n.ts';
import { abilityIcon, button, type Child, el } from './icons.ts';
import { looks3d } from './looks3d.ts';
import { loadChest, loadEquip, sheetRows } from './sheet-lines.ts';
import { sfx } from './sound.ts';
import { store } from './store.ts';
import { gearPage } from './town-gear.ts';
import { chestFull, loadGroup, saveGroup } from './town-ui.ts';
import { focused, refocus } from './window-focus.ts';

const PAGES = ['status', 'gear', 'skills', 'job'] as const;
type Page = (typeof PAGES)[number];
const PAGE_NAME: Record<Page, () => string> = {
  status: () => 'Status',
  gear: () => t('Equipamento', 'Equipment'),
  skills: () => t('Habilidades', 'Abilities'),
  job: () => t('Classe', 'Class'),
};
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
