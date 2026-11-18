// The HTML turn list the HUD keeps under the 3D one (hud.ts): its title and one row per turn of the queue projection
// (turn-list.ts queueRows). The 3D list draws over it; this list keeps the scroll, the hover and what a screen reader hears.
import type { Battle } from '../shared/battle/battle.ts';
import type { UnitState } from '../shared/battle/types.ts';
import { hint, queueEnd } from './hud-pieces.ts';
import { abilityName, t, unitName } from './i18n.ts';
import { abilityIcon, el } from './icons.ts';
import { isSurvival, turnsLeft } from './survival.ts';
import type { Queue } from './turn3d/queue-view.ts';

// the unit a row of the list stands for (a charge row: its caster), by the row's place among all of them: the acting
// row stays in the list unseen while the 3D bar's sheet shows it (queue-seat.ts), so the place is the queue's own
export const rowUnit = (q: Queue | null, i: number): string | null => q?.rows[i]?.unit ?? null;

// a tap or click on a card (a drag scrolls the list instead and never clicks): the unit it stands for
export function wireCards(list: HTMLElement, q: () => Queue | null, card: (unit: string) => void) {
  list.addEventListener('click', (e) => {
    const row = e.target instanceof Element ? e.target.closest('.queue-row') : null;
    const unit = row && rowUnit(q(), [...list.querySelectorAll('.queue-row')].indexOf(row));
    if (unit) card(unit);
  });
}

// the list's items: its title, then a row per entry of `q`, in the queue's order (a charge row: the caster's face, the
// ability's icon and name, and the ticks until it goes off)
export function queueItems(b: Battle, q: Queue | null, face: (u: UnitState) => Node): HTMLElement[] {
  const { rows, targets, at } = q ?? { rows: [], targets: new Set<string>(), at: -1 };
  // in Until Dawn mode, the title counts the turns left: the same number the rule uses (all turns)
  const left = isSurvival(b.state.scenario) ? turnsLeft(b.state) : null;
  return [
    el(
      'li',
      { class: 'queue-title', 'aria-hidden': left === null ? 'true' : undefined },
      left === null ? t('Turnos', 'Turns') : t(`Turnos · faltam ${left}`, `Turns · ${left} to dawn`),
      hint('turns'),
    ),
    ...rows.map(({ unit, charge, ticks, round }, i) => {
      const u = b.state.units.find((x) => x.id === unit)!;
      const mark =
        !charge && i > 0 && targets.has(unit) ? el('span', { class: 'queue-target' }, t('◎ alvo', '◎ target')) : null;
      return el(
        'li',
        {
          class: `queue-row ${u.team}${i === 0 ? ' now' : ''}${charge ? ' charge' : ''}${i === at ? ' pending' : ''}`,
        },
        face(u),
        charge ? abilityIcon(charge) : null,
        el(
          'span',
          { class: 'queue-text' },
          el(
            'span',
            { class: 'queue-n' },
            charge ? t(`resolve em ${ticks}`, `resolves in ${ticks}`) : i === 0 ? t('AGORA', 'NOW') : String(i),
            mark,
          ),
          el('span', { class: 'queue-name' }, charge ? abilityName(charge) : unitName(u.def)),
        ),
        ...queueEnd(u, !!charge, round),
      );
    }),
  ];
}
