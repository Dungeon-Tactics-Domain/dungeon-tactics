// The look-only mini menu of another unit during the hero's turn (Fernando, Nov 18 night: a tap on any other unit, ally
// or enemy, on the map or on its turn card): Status, Abilities and Show range. Nothing here acts or spends the turn; it
// opens the notice window (note.ts, drawn in 3D) and, from it, the Status window.
import { ABILITIES } from '../shared/battle/abilities.ts';
import type { BattleState } from '../shared/battle/types.ts';
import { UNIT_DEFS } from '../shared/battle/units.ts';
import { abilityPages, costText, sideName } from './battle-text.ts';
import { abilityName, t, unitName } from './i18n.ts';
import { noteWindow } from './note.ts';
import { statusWindow, unitSheet } from './status-window.ts';

// one row per ability: its name, then its range (or "around you"), its cost and its charge ticks
export function abilityRows(def: string): [string, string][] {
  return UNIT_DEFS[def].abilities.map((id) => {
    const a = ABILITIES[id];
    const charge = a.charge ? t(`carrega ${a.charge} tiq.`, `charges ${a.charge} tk`) : '';
    return [abilityName(id), [abilityPages(id)[0][0], costText(a), charge].filter(Boolean).join(' · ')];
  });
}

// `range`: paint where the unit walks and strikes on the map, until the next tap or key (hero-turn.ts)
export function peekMenu(state: BattleState, id: string, range: () => void) {
  const u = state.units.find((x) => x.id === id);
  if (!u) return;
  const name = unitName(u.def);
  noteWindow({
    title: `${name} · ${sideName(u.team)}`,
    buttons: [
      { label: t('Status', 'Status'), run: () => unitSheet(state, id) },
      {
        label: t('Habilidades', 'Abilities'),
        run: () => statusWindow({ title: t(`Habilidades: ${name}`, `Abilities: ${name}`), rows: abilityRows(u.def) }),
      },
      { label: t('Mostrar alcance', 'Show range'), run: range },
    ],
  });
}
