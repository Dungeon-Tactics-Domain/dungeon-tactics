// HUD pieces (design system): key hints, the HP/MP/CT bar, the unit panel, the strike strips and the painted faces.
// The battle HUD composes them; the town, the save slots and the result board reuse the bar and the still face.

import { poolOf } from '../shared/battle/combat.ts';
import { TURN_THRESHOLD } from '../shared/battle/turn-queue.ts';
import type { BattleState, UnitState } from '../shared/battle/types.ts';
import { RESOURCES, type Resource, UNIT_DEFS, type UnitDef } from '../shared/battle/units.ts';
import { battleFace, type Expression, frameOf } from './battle-face.ts';
import { range, sideName } from './battle-text.ts';
import { classOf } from './dev-roster.ts';
import { type Forecast, strikeInfo } from './forecast.ts';
import { abilityName, t, unitName } from './i18n.ts';
import { abilityIcon, el } from './icons.ts';
import { portrait } from './portrait.ts';
import { faceSheet } from './talk.ts';
import { statsText, unitStats } from './turn-list.ts';

export const KEYS = typeof matchMedia !== 'undefined' && matchMedia('(hover: hover) and (pointer: fine)').matches;
export { hint } from './key-hints.ts';

// bar with label and number (HP, MP, CT), like the ones in FFT's unit panel. `change` marks in stripes the part
// that the strike takes (loss) or the heal adds (gain), like the target bar in Tactics Ogre; the number comes along in the panel
export function gauge(
  cls: string,
  label: string,
  value: number,
  max: number,
  change?: { from: number; to: number; kind: 'loss' | 'gain' },
) {
  const pct = (v: number) => Math.round(Math.max(0, Math.min(1, v / max)) * 100);
  return el(
    'div',
    { class: `gauge ${cls}` },
    el('span', { class: 'gauge-label' }, label),
    el(
      'span',
      { class: 'gauge-bar' },
      el('i', { style: `width:${pct(value)}%` }),
      change
        ? el('b', {
            class: `gauge-change ${change.kind}`,
            style: `left:${pct(change.from)}%;width:${pct(change.to) - pct(change.from)}%`,
          })
        : null,
    ),
    el('span', { class: 'gauge-num' }, `${Math.max(0, value)}/${max}`),
  );
}

// The end of a turn list row, after the name: a turn's life and CT (Fernando, Nov 17), the short line of each over a
// thin bar of how full it is, the same numbers the 3D list draws beside its cards (turn-list.ts unitStats); then the
// round's tag. A charge's row has only the tag: it is a spell going off, not a turn
let pen: CanvasRenderingContext2D | null | undefined;
// The width of a text in the help line's letters (16 px of --font), for the line's height with no HTML to measure
// (place-beside.ts helpEnd)
export function helpWidth(text: string): number {
  if (pen === undefined) {
    pen = document.createElement('canvas').getContext('2d');
    if (pen)
      pen.font = `16px ${getComputedStyle(document.documentElement).getPropertyValue('--font').trim() || 'sans-serif'}`;
  }
  return pen?.measureText(text).width ?? 0;
}

// A panel's right edge on the page, 0 while it is hidden: a sandbox spec hides panels with `visibility`, keeping their box
export const shownRight = (el: HTMLElement) =>
  getComputedStyle(el).visibility === 'hidden' ? 0 : el.getBoundingClientRect().right;

export function queueEnd(u: UnitState, charge: boolean, round: number) {
  const s = unitStats(u),
    text = statsText(s);
  const line = (cls: string, str: string, v: number, max: number) =>
    el('span', { class: `queue-stat ${cls}`, style: `--f:${Math.round((v / max) * 100)}%` }, str);
  return [
    charge
      ? null
      : el(
          'span',
          { class: 'queue-stats', title: text.long },
          line('hp', text.hp, s.hp, s.hpMax),
          line('ct', text.ct, s.ct, s.ctMax),
        ),
    el('span', { class: 'queue-round', title: t(`Rodada ${round}`, `Round ${round}`) }, String(round)),
  ];
}

// Preview strips in the Tactics Ogre style (Nov 13, Fernando's request; our design): one arrow strip per target,
// "HP", the big number (−12–15 PTS, or +7–10 on a heal) and the aim with the hit chance; below, the small `strikeInfo` line.
// Up to STRIKES strips: more than that would rise above the panel band and cover the map; the rest becomes "+N targets".
const STRIKES = 3;
// Two-colour strip (Nov 15, the lab kit's strike preview): the action on the panel blue (ability icon and name, the big
// number, the hit chance) and the target on its side's colour (wine for an enemy): name and side, the life bar with the part
// that goes away (or the heal adds) in stripes, and the small `strikeInfo` line. It stands in for the target panel while aiming
function strike(f: Forecast, ability: string) {
  const amount = f.heal ? `+${range(f.heal)}` : f.dmg ? `−${range(f.dmg)}` : null;
  const change =
    f.support || !(f.heal || f.dmg)
      ? undefined
      : f.heal
        ? { from: f.unit.hp, to: f.after[1], kind: 'gain' as const }
        : { from: f.after[0], to: f.unit.hp, kind: 'loss' as const };
  return el(
    'div',
    { class: `strike${f.heal ? ' gain' : ''}${f.ally ? ' ally' : ''}` },
    el(
      'div',
      { class: 'strike-main' },
      abilityIcon(ability),
      el(
        'div',
        {},
        el('span', { class: 'strike-name' }, abilityName(ability)),
        amount
          ? el(
              'span',
              { class: 'strike-row' },
              el('strong', { class: 'strike-pts' }, amount, el('small', {}, 'PTS')),
              el('span', { class: 'strike-hit', title: t('Chance de acerto', 'Chance to hit') }, `⊕ ${f.chance}%`),
            )
          : null,
      ),
    ),
    el(
      'div',
      { class: `strike-target ${f.unit.team}` },
      el(
        'span',
        { class: 'strike-who' },
        unitName(f.unit.def),
        el('span', { class: 'unit-side' }, sideName(f.unit.team)),
      ),
      gauge('hp', t('Vida', 'HP'), f.unit.hp, UNIT_DEFS[f.unit.def].hp, change),
      el('span', { class: 'strike-info' }, strikeInfo(f, ability).slice(1).join(' · ')),
    ),
  );
}
export function strikes(fs: Forecast[], ability: string) {
  const rest = fs.slice(STRIKES).map((o) => unitName(o.unit.def) + (o.ally ? t(' (aliado!)', ' (ally!)') : ''));
  return [
    ...fs.slice(0, STRIKES).map((f) => strike(f, ability)),
    rest.length
      ? el(
          'p',
          { class: 'strike-more' },
          t(
            `+${rest.length} ${rest.length === 1 ? 'alvo' : 'alvos'}: `,
            `+${rest.length} ${rest.length === 1 ? 'target' : 'targets'}: `,
          ) + rest.join(', '),
        )
      : null,
  ].filter((x) => x !== null);
}

// a painted face sheet showing one expression: the node, the sheet, the frame shown and how to show another; null for a
// class without a sheet (it keeps its portrait)
export function sheetFace(def: string, cls: string, expr: Expression) {
  const f = battleFace(def);
  if (!f) return null;
  const { node, show } = faceSheet(def, f, cls);
  const n = frameOf(f, expr);
  show(n);
  return { node, show, f, n };
}

// the painted face held on one expression outside the battle (result cards, party, tavern): 64 px, `big` 128, whole
// ratios of the 128 px paint so it stays crisp; a class without a sheet keeps portrait()
export function stillFace(def: string, expr: Expression, big = false) {
  return sheetFace(def, `still-face${big ? ' big' : ''}`, expr)?.node ?? portrait(def);
}

// the class line, only for those with their own name (the party, developer menu): "Rogue" under "Lia"
function classText(u: UnitState) {
  const base = classOf(u.def);
  return base && unitName(base) !== unitName(u.def) ? unitName(base) : null;
}

// unit panel (the acting one bottom left, the one under the cursor bottom right, mirrored)
// the bars of a unit's pools (mana, stamina), only those its sheet has; `u` absent: full (the party sheet)
const POOL_GAUGE: Record<Resource, [cls: string, label: () => string]> = {
  mana: ['mp', () => 'MP'],
  stamina: ['sp', () => 'ST'],
};
const poolGauges = (def: UnitDef, u?: UnitState) =>
  RESOURCES.filter((k) => def.vars?.[k]).map((k) =>
    gauge(POOL_GAUGE[k][0], POOL_GAUGE[k][1](), u ? poolOf(u, k) : def.vars![k], def.vars![k]),
  );
export function unitPanel(state: BattleState, u: UnitState, pic: HTMLElement) {
  const def = UNIT_DEFS[u.def];
  const rows = [gauge('hp', t('Vida', 'HP'), u.hp, def.hp), ...poolGauges(def, u)];
  if (u.vars?.mp !== undefined) rows.push(gauge('mp', 'MP', u.vars.mp, def.vars?.mp ?? u.vars.mp));
  if (def.speed > 0) rows.push(gauge('ct', 'CT', Math.min(u.ct, TURN_THRESHOLD), TURN_THRESHOLD));
  const charge = state.charges.find((c) => c.unit === u.id);
  const cls = classText(u);
  return el(
    'div',
    { class: `panel unit-panel ${u.team}` },
    pic,
    el(
      'div',
      { class: 'unit-body' },
      el('strong', { class: 'unit-name' }, unitName(u.def), el('span', { class: 'unit-side' }, sideName(u.team))),
      cls ? el('span', { class: 'unit-class' }, cls) : null,
      ...rows,
      charge
        ? el(
            'p',
            { class: 'unit-note' },
            t(
              `Carregando ${abilityName(charge.ability)} (${charge.ticks} tiques)`,
              `Charging ${abilityName(charge.ability)} (${charge.ticks} ticks)`,
            ),
          )
        : null,
    ),
  );
}
