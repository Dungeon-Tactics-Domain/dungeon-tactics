// The map builder's way in and out (Nov 25, spec): the debug panel opens it on a battle's map or a blank one, Play opens
// a battle on the map being edited with one default hero (the debug panel creates the rest), and that battle's debug
// panel goes back. The map travels in the builder's draft save (slots.ts DRAFT_KEY), so a reload keeps both screens.
import type { Scenario } from '../../shared/battle/scenarios.ts';
import type { MapDoc } from '../../shared/mapedit/doc.ts';
import { toJson } from '../../shared/mapedit/export.ts';
import { parseMapDoc } from '../../shared/mapedit/parse.ts';
import { docToScenario, PLAY_PREFIX } from '../../shared/mapedit/play.ts';
import { navigate } from '../nav.ts';
import { store } from '../store.ts';
import { DRAFT_KEY, PLAY_KEY } from './slots.ts';
import { heroCorner } from './tools.ts';

export const BUILDER = '?mapedit'; // the builder's address (entry.ts)
export const PLAY = 'mapedit'; // ?scenario=mapedit: the battle on the draft (game/boot.ts)
export const HERO = 'warrior'; // Play's default hero: the first class of every party

export const readDraft = (): MapDoc | null => parseMapDoc(store.json(DRAFT_KEY));
export const writeDraft = (doc: MapDoc) => store.set(DRAFT_KEY, toJson(doc));

export function openBuilder(doc: MapDoc | null = readDraft()) {
  if (doc) writeDraft(doc);
  navigate(BUILDER);
}

// a battle the builder's Play opened (its id is the draft's, PLAY_PREFIX first; halved, `½` after)
export const isPlayed = (scenarioId: string) => scenarioId.startsWith(PLAY_PREFIX);

export function play(doc: MapDoc) {
  writeDraft(doc);
  store.set(PLAY_KEY, ''); // never resume the battle of an older version of the map
  navigate(`?scenario=${PLAY}`);
}

// The battle Play opens: the draft as a scenario with the hero in a free corner. No enemy yet, so the default rule's
// "no enemies left" victory would end it at once: it ends only when the heroes fall (or by the debug panel's Win)
export function playScenario(): Scenario | null {
  const doc = readDraft(),
    at = doc && heroCorner(doc);
  if (!doc || !at) return null;
  const sc = docToScenario(doc, [{ id: 'h0', def: HERO, team: 'hero', x: at.x, y: at.y }]);
  sc.rules = { outcome: (st) => (st.units.some((u) => u.team === 'hero') ? 'ongoing' : 'defeat') };
  return sc;
}
