// What the page opens, read from the URL: an expedition room, a crawl room, a study or developer battle, another map, or
// the standalone battle behind the title (and the town).
import { Battle } from '../../shared/battle/battle.ts';
import { regen } from '../../shared/battle/combat.ts';
import { subOf } from '../../shared/battle/grid.ts';
import { HALF, HALF_ID, halve, registerHalf } from '../../shared/battle/half.ts';
import { FIRST_BATTLE, SCENARIOS, type Scenario } from '../../shared/battle/scenarios.ts';
import { UNIT_DEFS } from '../../shared/battle/units.ts';
import { expeditionMap, openNodes } from '../../shared/crawl/expedition.ts';
import { generateRoom, type RoomOptions } from '../../shared/crawl/generate.ts';
import { buildDevScenario, DEV_KEY, DEV_SCENARIO, parseSetup, problems } from '../dev-roster.ts';
import { t } from '../i18n.ts';
import { param, store } from '../store.ts';
import { SURVIVAL_ID, survivalScenario } from '../survival.ts';
import { type CrawlRoom, castRoom, goHome, goHomeNoRoom, heldRoom, ROOM_KEY, savedExpedition } from './crawl.ts';

// the battle the page opens: the scenario, where it is saved and what it belongs to
export interface BattleSelection {
  scenario: Scenario;
  saveKey: string;
  title: boolean; // no battle parameter: the title (or, with ?home, the town) opens over the standalone battle
  room: CrawlRoom | null; // expedition room in play (crawl.ts): who stands on each hero spawn and their life
}

// a new battle, with the expedition party's life and mana carried in (stamina starts full in every room); Options ->
// Restart goes through here too, so restarting a room does not refill the party
export function newBattle(scenario: Scenario, room: CrawlRoom | null = null): Battle {
  const b = Battle.start(scenario, (Math.random() * 2 ** 31) | 0);
  for (const u of b.state.units) {
    const h = room && Object.hasOwn(room.heroes, u.id) ? room.heroes[u.id] : null;
    if (!h) continue;
    u.hp = h.hp || u.hp;
    if (h.mana !== undefined && UNIT_DEFS[u.def].vars?.mana) u.vars = { ...u.vars, mana: h.mana };
  }
  if (room?.bag && Object.keys(room.bag).length) b.state.bag = { ...room.bag };
  // the first to act got its regen on the full pool and life Battle.start gave it: again on the carried ones (a no-op
  // when full; its life regen shows on the bar, not as a number)
  regen(b.actor);
  return b;
}

// A crawl room from its seed; a seed whose 200 layouts all fail (none of the 500 tested; 4 to 7 s each) moves on to the
// next one; a second failure means the rules, not the dice, so the page goes back home, which says so, instead of retrying
function crawlRoom(seed: number, opts: RoomOptions): Scenario | null {
  for (let s = seed; s < seed + 2; s++)
    try {
      return generateRoom(s, opts);
    } catch (err) {
      console.error(err);
    }
  goHomeNoRoom(); // the town says the room would not open (crawl.ts noRoomScreen)
  return null;
}

// null when the address went home instead (a room that is not open, or a crawl room that could not be built)
export async function selectBattle(): Promise<BattleSelection | null> {
  // the battle the game opens and where it is saved; the address may swap both
  let scenario = FIRST_BATTLE;
  let saveKey = 'dt:battle';
  const study = param('scenario');
  const crawl = param('crawl');
  const roomAt = param('room');
  let room: CrawlRoom | null = null;
  if (roomAt !== null) {
    // an expedition room (crawl.ts): only one the party may enter now, so a reload or a typed address cannot replay a
    // cleared room for its heal; anything else (a chest too: it has no battle) goes back home (the town)
    const exp = savedExpedition();
    const map = exp && expeditionMap(exp.seed);
    const node = Number(roomAt);
    if (!exp || !map || roomAt === '' || !openNodes(map, exp.path).includes(node) || map[node].chest) {
      goHome();
      return null;
    }
    const built = crawlRoom(map[node].seed, { depth: map[node].floor, boss: map[node].boss });
    if (!built) return null;
    // another room still saved: the party left it for this one, which loses the expedition (crawl.ts leftRoom, at home)
    const held = heldRoom();
    if (typeof held === 'string' && held !== `${built.id}${HALF}`) {
      goHome();
      return null;
    }
    SCENARIOS[built.id] = built;
    ({ scenario, room } = castRoom(built, exp, node));
    saveKey = ROOM_KEY;
  } else if (crawl !== null) {
    // a dungeon crawl room (Nov 15): rebuilt from the seed in the address, so one save serves every room and resumes only
    // the room its id names (seed, depth, boss, theme and generator version); registered whole too, where the scene finds
    // its mood (ambience.ts kindOf)
    const opts = { depth: Number(param('depth')), boss: param('boss') === '1', theme: param('theme') ?? undefined };
    const built = crawlRoom(Number(crawl) | 0, opts);
    if (!built) return null;
    scenario = built;
    SCENARIOS[scenario.id] = scenario;
    saveKey = 'dt:battle:crawl';
  } else if (study === DEV_SCENARIO) {
    // battle from the developer menu: the saved roster becomes the scenario (no valid roster, goes back to the default battle)
    const setup = parseSetup(store.json(DEV_KEY));
    // roster with a problem (empty team, unit without ability) broke the battle (Nov 13, review): falls back to the default
    if (setup && !problems(setup, t).length) {
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
  } else if (study && Object.hasOwn(SCENARIOS, study) && !study.endsWith(HALF)) {
    // other game maps through the same parameter (e.g. ?scenario=flooded_crypt), with their own save
    scenario = SCENARIOS[study];
    saveKey = `dt:battle:${study}`;
  }
  // every battle is played in half tiles (Nov 14; Nov 15, Fernando: no whole-tile battle left);
  // the test map comes split already
  if (subOf(scenario.grid) === 1) scenario = halve(scenario);
  return { scenario, saveKey, title: !study && crawl === null && !room, room };
}
