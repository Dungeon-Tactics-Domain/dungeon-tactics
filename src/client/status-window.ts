// The Status window of a battle: a unit's sheet (Game.status: side, life, pools, CT, speed, move, jump, attributes,
// charge, facing, abilities) or an ability's facts (Game.abilitySheet), in a window of dialog.ts. With the 3D look
// (window3d/status3d.ts, ?status=3d) the same sheet is drawn on the 3D layer instead; this file is all the rest of the
// client names.
import { dialog } from './dialog.ts';
import { el } from './icons.ts';

export interface StatusSheet {
  title: string;
  rows: [label: string, value: string][];
  text?: string; // a sheet with no rows: one paragraph (an ability's detail)
}

export const statusBody = (s: StatusSheet) =>
  s.rows.length
    ? el('dl', { class: 'keys' }, ...s.rows.flatMap(([k, v]) => [el('dt', {}, k), el('dd', {}, v)]))
    : el('p', {}, s.text ?? '');

let show3d: ((s: StatusSheet) => void) | undefined;
// the 3D look takes the window while it lives (status3d.ts); nothing gives it back to the HTML one
export const setStatus3d = (show?: (s: StatusSheet) => void) => {
  show3d = show;
};
export function statusWindow(s: StatusSheet) {
  if (show3d) show3d(s);
  else dialog('status', s.title, [statusBody(s)]);
}
