// What the page opens, read from the URL: a campaign stage, a bar mission, a study or developer battle, another map, the
// world map, or the standalone battle behind the title. Also the save readers the screens share.
import { Battle } from '../../shared/battle/battle.ts';
import { subOf } from '../../shared/battle/grid.ts';
import { HALF, HALF_ID, halve, registerHalf } from '../../shared/battle/half.ts';
import { FIRST_BATTLE, SCENARIOS, type Scenario } from '../../shared/battle/scenarios.ts';
import { CAMPAIGN_KEY, CHAPTERS, chapterId, chapterScenario, parseProgress } from '../campaign.ts';
import { EQUIP_KEY, parseEquip } from '../chest.ts';
import { buildDevScenario, DEV_KEY, DEV_SCENARIO, parseSetup, problems } from '../dev-roster.ts';
import { GROUP_KEY, parseGroup } from '../group.ts';
import { HERO_KEY, parseHero } from '../hero.ts';
import { t } from '../i18n.ts';
import { MISSIONS, MISSIONS_KEY, type Mission, missionScenario, missionScenarioId, parseDone } from '../missions.ts';
import { setTrack } from '../sound.ts';
import { param, RENAMED_QUESTS, store } from '../store.ts';
import { SURVIVAL_ID, survivalScenario } from '../survival.ts';

// the battle the page opens: the scenario, where it is saved and what it belongs to
export interface BattleSelection {
  scenario: Scenario;
  mission: Mission | null; // bar mission in play (missions.ts)
  saveKey: string;
  chapter: number | null; // campaign stage in play (null = standalone battle)
  study: string | null; // the ?scenario= asked for
  title: boolean; // no parameter: the title screen opens over the standalone battle
}

export const newBattle = (scenario: Scenario) => Battle.start(scenario, (Math.random() * 2 ** 31) | 0);

export const toWorld = () => {
  location.search = '?world';
};
export const savedHero = () => parseHero(store.json(HERO_KEY));
export const savedGroup = () => parseGroup(store.json(GROUP_KEY)); // player's group (group.ts): who goes, class and recruits

// 'world' for the world map; null when the address went back to the map (unknown, won or locked)
export async function selectBattle(): Promise<BattleSelection | 'world' | null> {
  // the battle the game opens and where it is saved; the FFT study swaps both at boot (separate save)
  let scenario = FIRST_BATTLE;
  let mission: Mission | null = null;
  let saveKey = 'dt:battle';
  let chapter: number | null = null;
  // FFT reference study (Nov 11): not game content. Only opens with the parameter and comes in a separate chunk of the
  // build (dynamic import), so none of it goes into the package the player downloads.
  const study = param('scenario');
  const camp = param('stage');
  // bar mission (missions.ts): only the ones not yet won; unknown or won mission address goes back to the map
  const mis = param('quest');
  if (mis !== null) {
    const m = MISSIONS.find((x) => x.id === (Object.hasOwn(RENAMED_QUESTS, mis) ? RENAMED_QUESTS[mis] : mis));
    if (!m || parseDone(store.json(MISSIONS_KEY)).includes(m.id)) {
      toWorld();
      return null;
    }
    mission = m;
    setTrack('road');
    scenario = missionScenario(
      m,
      parseProgress(store.get(CAMPAIGN_KEY)),
      savedHero(),
      parseEquip(store.json(EQUIP_KEY)),
      savedGroup(),
    );
    saveKey = `dt:battle:${missionScenarioId(m.id)}`;
  }
  if (param('world') !== null) return 'world'; // world map: no battle assembled
  // stage that does not exist or is still locked (typed or saved address): goes back to the map instead of falling into a standalone battle
  const allowed =
    camp !== null &&
    camp !== '' &&
    CHAPTERS[Number(camp)] !== undefined &&
    Number(camp) <= parseProgress(store.get(CAMPAIGN_KEY));
  if (camp !== null && !allowed) {
    toWorld();
    return null;
  }
  if (mission) {
    // already assembled above
  } else if (camp !== null && CHAPTERS[Number(camp)] && Number(camp) <= parseProgress(store.get(CAMPAIGN_KEY))) {
    // campaign stage: only opens if already unlocked (beat the previous one); each stage has its own save
    chapter = Number(camp);
    setTrack(CHAPTERS[chapter].song);
    scenario = chapterScenario(chapter, savedHero(), parseEquip(store.json(EQUIP_KEY)), savedGroup());
    saveKey = `dt:battle:${chapterId(chapter)}`;
  } else if (study === 'fft-gariland' || study === 'fft-classes') {
    const fft = await import('../../shared/battle/fft/gariland.ts');
    fft.registerFftStudy();
    scenario = SCENARIOS[study];
    saveKey = `dt:battle:${study}`;
  } else if (study === DEV_SCENARIO) {
    // battle from the developer menu: the saved roster becomes the scenario (no valid roster, goes back to the default battle)
    const setup = parseSetup(store.json(DEV_KEY));
    // roster with a problem (empty team, unit without ability) broke the battle (Nov 13, review): falls back to the default
    if (setup && !problems(setup, t).length) {
      // the Gariland map only: our classes fight on it in half tiles like on any other map
      if (setup.map.startsWith('fft-')) (await import('../../shared/battle/fft/gariland.ts')).registerFftStudy();
      scenario = buildDevScenario(setup);
      saveKey = `dt:battle:${DEV_SCENARIO}`;
    }
  } else if (study === 'half') {
    // half tile (Nov 13, test version: 2x2 characters walking 1 at a time, trees of 3 to 5; half.ts)
    scenario = registerHalf();
    saveKey = `dt:battle:${HALF_ID}`;
  } else if (study === SURVIVAL_ID) {
    // the own rule (wins at dawn) only exists after the scenario is assembled: assemble before loading the save
    scenario = survivalScenario();
    saveKey = `dt:battle:${SURVIVAL_ID}`;
  } else if (study && SCENARIOS[study] && !study.endsWith(HALF)) {
    // other game maps through the same parameter (e.g. ?scenario=flooded_crypt), with their own save
    scenario = SCENARIOS[study];
    saveKey = `dt:battle:${study}`;
  }
  // every battle is played in half tiles (Nov 14; Nov 15, Fernando: no whole-tile battle left, the FFT study included);
  // the test map comes split already
  if (subOf(scenario.grid) === 1) scenario = halve(scenario);
  return { scenario, mission, saveKey, chapter, study, title: camp === null && !study };
}
