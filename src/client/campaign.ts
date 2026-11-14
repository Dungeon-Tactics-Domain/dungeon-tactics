// Campaign "Beacon Ashes" (night of Nov 12: Fernando asked for a campaign with several stages, story, dialogue and
// speech sounds). Each stage is a cast from the developer menu (dev-roster.ts) on a game map, with lines before and after the
// battle; the stages and lines are data in src/content/campaign.ts. Pure and tested; the dialogue screen lives in talk.ts.
import { SPEAKERS, STAGES } from '../content/campaign.ts';
import type { Scenario } from '../shared/battle/scenarios.ts';
import { OBJECTIVE_DEF, UNIT_DEFS } from '../shared/battle/units.ts';
import type { Equip } from './chest.ts';
import { buildDevScenario, type DevSetup, type DevUnit, slotsOf, unitFrom } from './dev-roster.ts';
import { defaultGroup, type Group, heroesFor } from './group.ts';
import type { Hero } from './hero.ts';
import type { SongId } from './music.ts';

export interface Line {
  who: keyof typeof SPEAKERS;
  pt: string;
  en: string;
}
export interface Chapter {
  title: [string, string];
  song: SongId; // stage music (music.ts)
  boss?: true; // wins by downing the 1st enemy in the list (chapterScenario)
  light?: number; // stage mood (BattleScene.setDaylight: 0 night, 1 sunrise); without it, the usual light
  setup: DevSetup;
  intro: Line[];
  outro: Line[];
}

// an enemy as the content writes it: its class plus only the numbers that differ from the class (unitFrom fills the rest)
export type Foe = Partial<DevUnit> & { base: string };
// a stage as the content writes it: the heroes are not written, they come from the party (heroesFor)
export type Stage = Omit<Chapter, 'setup'> & { setup: { map: string; enemies: Foe[] } };

export { SPEAKERS };

export const CAMPAIGN_KEY = 'dt:campaign'; // how many stages were already won

// The heroes learn one ability per stage won (2 in the 1st, 3 in the 2nd, all 4 from the 3rd on): the 1st stage teaches a little of
// each at a time and Odo's Heal arrives mid-campaign, when the enemies press
const party = (n: number): DevUnit[] => heroesFor(defaultGroup(), n).map(({ items: _, ...u }) => u);
// abilities each hero gains when going from stage n to n+1 (for the notice at the end of the stage)
// (of the fielded party, with each one's current class)
export const learned = (n: number, hero: Hero | null = null, group: Group = defaultGroup()) =>
  n + 1 >= CHAPTERS.length
    ? []
    : heroesFor(group, n + 1, hero)
        .map((u, i) => ({
          name: u.name,
          abilities: u.abilities.filter((a) => !heroesFor(group, n, hero)[i].abilities.includes(a)),
        }))
        .filter((x) => x.abilities.length);
// the stages with their battle cast: the story party with the abilities unlocked so far against the written enemies
export const CHAPTERS: Chapter[] = STAGES.map((s, n) => ({
  ...s,
  setup: {
    map: s.setup.map,
    heroes: party(n),
    enemies: s.setup.enemies.map(({ base, ...patch }) => ({ ...unitFrom(base), ...patch })),
  },
}));

export const chapterId = (n: number) => `camp${n}`;
// Boss stage (boss: true, the 1st enemy in the list, id e0): downing the boss wins, even with others still standing; losing all
// heroes (or the Beacon, if there is one) loses. Calls for another tactic: cut a path to him instead of clearing the map.
// `eq`: each member's saved equipment (chest.ts) and `group`: who goes to battle (group.ts); the difficulty measurement
// runs without both (the story party, no items)
export function chapterScenario(
  n: number,
  hero: Hero | null = null,
  eq: Equip = {},
  group: Group = defaultGroup(),
): Scenario {
  const s = buildDevScenario(
    { ...CHAPTERS[n].setup, heroes: heroesFor(group, n, hero, eq) },
    chapterId(n),
    CHAPTERS[n].title,
  );
  if (CHAPTERS[n].boss) {
    UNIT_DEFS[s.spawns.find((sp) => sp.id === 'e0')!.def].boss = true;
    const beacon = s.spawns.some((sp) => sp.def === OBJECTIVE_DEF);
    s.rules = {
      outcome: (state) =>
        !state.units.some((u) => u.id === 'e0')
          ? 'victory'
          : !state.units.some((u) => u.team === 'hero' && u.def !== OBJECTIVE_DEF) ||
              (beacon && !state.units.some((u) => u.def === OBJECTIVE_DEF))
            ? 'defeat'
            : 'ongoing',
    };
  }
  return s;
}

// what awaits in the stage, for the map panel (FFT shows the enemy before entering): "4 enemies · boss: Vesper"
export function foesText(n: number, say: (pt: string, en: string) => string): string {
  const c = CHAPTERS[n];
  const count = c.setup.enemies.length;
  const boss = c.boss ? c.setup.enemies[0] : null;
  return say(
    `${count} inimigos${boss ? ` · chefe: ${boss.name}` : ''}`,
    `${count} enemies${boss ? ` · boss: ${boss.en ?? boss.name}` : ''}`,
  );
}

// stage objective in one sentence, announced at the start of the battle (like FFT's objective banner)
export function objectiveText(n: number, say: (pt: string, en: string) => string): string {
  const c = CHAPTERS[n];
  const beacon = slotsOf(c.setup.map).objective.length > 0;
  if (c.boss) {
    const boss = c.setup.enemies[0];
    return say(
      `Derrube ${boss.name}${beacon ? ' e proteja o Farol' : ''}!`,
      `Bring down ${boss.en ?? boss.name}${beacon ? ' and protect the Beacon' : ''}!`,
    );
  }
  return beacon
    ? say('Derrote os inimigos e proteja o Farol!', 'Defeat the enemies and protect the Beacon!')
    : say('Derrote todos os inimigos!', 'Defeat every enemy!');
}

// progress saved in the browser (trust boundary): integer between 0 and the number of stages, otherwise 0
export function parseProgress(raw: unknown): number {
  const n = Number(raw);
  return Number.isInteger(n) && n >= 0 && n <= CHAPTERS.length ? n : 0;
}
