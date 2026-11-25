// The battle builder's way in and out (grill, Nov 25): its page (?battleedit) reads the battle on the screen from the
// draft save, Play opens that battle (?scenario=battleedit, game/boot.ts), and a reload keeps both screens.
import type { Scenario } from '../../shared/battle/scenarios.ts';
import { UNIT_DEFS } from '../../shared/battle/units.ts';
import { type BattleDoc, blankBattle } from '../../shared/mapedit/battle.ts';
import type { MapDoc } from '../../shared/mapedit/doc.ts';
import { battleToScenario } from '../../shared/mapedit/play.ts';
import { withMap } from '../../shared/mapedit/setup.ts';
import { DEV_KEY, setClass } from '../dev-roster.ts';
import { t } from '../i18n.ts';
import { modelOf } from '../markers.ts';
import { navigate } from '../nav.ts';
import { param, store } from '../store.ts';
import { DRAFT_KEY, firstSlots, PLAY_KEY, parseSlot, SLOTS_KEY, type Slot } from './slots.ts';

export const BUILDER = '?battleedit'; // the builder's address (entry.ts)
export const PLAY = 'battleedit'; // ?scenario=battleedit: the battle on the draft

export const readDraft = (): Slot | null => parseSlot(store.json(DRAFT_KEY));
export const writeDraft = (s: Slot) => store.set(DRAFT_KEY, JSON.stringify(s));

// the saved battles; the first opening seeds them with the Developer menu's cast (slots.ts firstSlots) and writes them,
// so that runs once per browser
export function readSlots(): Slot[] {
  const raw = store.get(SLOTS_KEY);
  const slots = firstSlots(raw === null ? null : store.json(SLOTS_KEY), store.json(DEV_KEY));
  if (raw === null) store.set(SLOTS_KEY, JSON.stringify(slots));
  return slots;
}

export function openBattleBuilder(slot?: Slot) {
  if (slot) writeDraft(slot);
  navigate(BUILDER);
}

// The map builder's "build a battle on this map": the draft's units stay where they fit on it (setup.ts withMap)
export function battleOnMap(map: MapDoc) {
  const was = readDraft();
  openBattleBuilder({ name: was?.name ?? map.name, doc: was ? withMap(was.doc, map) : blankBattle(map) });
}

// a battle opened from the battle builder (game/boot.ts reads the same address)
export const isBuilt = () => param('scenario') === PLAY;

// why Play cannot open: a side with nobody who plays
export function playWhy(doc: BattleDoc): string | null {
  const has = (team: string) => doc.units.some((u) => u.team === team && UNIT_DEFS[u.def].speed > 0);
  if (!has('hero')) return t('falta um herói', 'no hero');
  if (!has('enemy')) return t('falta um inimigo', 'no enemy');
  return null;
}

export function play(s: Slot) {
  writeDraft(s);
  store.set(PLAY_KEY, ''); // never resume a battle of an older version of the draft
  navigate(`?scenario=${PLAY}`);
}

// The battle Play opens: the draft as a scenario, each own sheet wearing its class's model, face and name in the HUD
// (dev-roster.ts classOf) before the battle is halved; null with no draft or one that cannot play
export function playedScenario(): Scenario | null {
  const s = readDraft();
  if (!s || playWhy(s.doc)) return null;
  const { scenario, classes } = battleToScenario(s.doc);
  for (const [sheet, cls] of Object.entries(classes)) {
    UNIT_DEFS[sheet].model = modelOf(cls);
    setClass(sheet, cls);
  }
  return scenario;
}
