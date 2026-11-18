// The Status window of a battle: a unit's sheet (Game.status: side, life, pools, CT, speed, move, jump, attributes,
// charge, facing, abilities) or an ability's facts (Game.abilitySheet), in a window of dialog.ts. With the 3D look
// (window3d/status3d.ts) the sheet is drawn on the 3D layer, over its unseen body; this file is all the rest of the
// client names.
import type { BattleState } from '../shared/battle/types.ts';
import { abilityDetail, unitStatus } from './battle-text.ts';
import { abilityName, unitName } from './i18n.ts';
import { el } from './icons.ts';
import { looks3d } from './looks3d.ts';

export interface StatusSheet {
  title: string;
  rows: [label: string, value: string][];
  text?: string; // a sheet with no rows: one paragraph (an ability's detail)
}

export const statusBody = (s: StatusSheet) =>
  s.rows.length
    ? el('dl', { class: 'keys' }, ...s.rows.flatMap(([k, v]) => [el('dt', {}, k), el('dd', {}, v)]))
    : el('p', {}, s.text ?? '');

// drawn by window3d/status3d.ts
export const statusWindow = (s: StatusSheet) => looks3d.status?.(s);

// a unit's sheet (the Status command, the C key, a unit's mini menu): any unit of the battle, ally or enemy
export function unitSheet(state: BattleState, id: string) {
  const u = state.units.find((x) => x.id === id);
  if (u) statusWindow({ title: unitName(u.def), rows: unitStatus(state, id) });
}
// an ability's facts (the I key on the submenu): name, numbers and its notes
export const abilitySheet = (id: string) => statusWindow({ title: abilityName(id), rows: [], text: abilityDetail(id) });
