// Where a battle's map comes from (grill, Nov 25): the game's maps, the maps saved in the map builder, and an
// expedition room by seed and depth (its monsters and the party come with it). Pure and tested.
import { MAPS } from '../../shared/battle/scenarios.ts';
import { generateRoom } from '../../shared/crawl/generate.ts';
import { type BattleDoc, battleFromScenario } from '../../shared/mapedit/battle.ts';
import { docFromScenario, type MapDoc } from '../../shared/mapedit/doc.ts';
import { t } from '../i18n.ts';
import { parseSlots } from '../mapedit/slots.ts';

export interface Source {
  key: string; // `game:<id>` or `saved:<name>`
  label: string;
  map: MapDoc;
}

// `saved`: the map builder's slot list as stored (dt:mapedit:slots), read back by its parse
export function mapSources(saved: unknown): Source[] {
  return [
    ...MAPS.map((s) => ({ key: `game:${s.id}`, label: t(s.name, s.en), map: docFromScenario(s) })),
    ...parseSlots(saved).map((m) => ({
      key: `saved:${m.name}`,
      label: t(`${m.name} (construtor)`, `${m.en} (builder)`),
      map: m,
    })),
  ];
}

// the source after `key` (dir +1) or before it, round the list; the first when `key` is not there
export function nextSource(list: Source[], key: string, dir: 1 | -1): Source {
  const at = list.findIndex((s) => s.key === key);
  return list[at < 0 ? 0 : (at + dir + list.length) % list.length];
}

export const DEPTHS = [1, 9] as const; // the generator takes 1 to 99; 9 keeps every depth a few presses away
export const SEEDS = [0, 99999] as const;

// An expedition room as a whole battle: its map, the party on the hero spawns and its monsters, won by defeating all
// (a room has no Beacon); null when the generator gives up on that seed
export function roomBattle(seed: number, depth: number): BattleDoc | null {
  try {
    const room = generateRoom(seed, { depth });
    return { ...battleFromScenario(room), objective: { kind: 'defeat_all' } };
  } catch {
    return null;
  }
}
