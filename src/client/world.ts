// Campaign worldmap (night of Nov 12, Fernando's request: "character walking on the map... worldmap... each
// node is a map, either story or battle"). FFT map style: nodes linked by a road, the party walks
// node to node and enters the chosen one. Pure and tested; the screen lives in world-ui.ts.
// Nodes come in order: winning (battle) or seeing (story) a node unlocks the next one. Replaying what's already passed is allowed.
// The nodes, towns and opening lines are data in src/content/world.ts.
import { INTRO, WORLD } from '../content/world.ts';
import { CHAPTERS, type Line } from './campaign.ts';
import type { DevUnit } from './dev-roster.ts';
import { defaultGroup, type Group, heroesFor } from './group.ts';
import type { Hero } from './hero.ts';

export interface WorldNode {
  id: string;
  name: [string, string];
  x: number; // position on the map, in % of the drawing's width and height
  y: number;
  chapter?: number; // battle node: the campaign stage (campaign.ts)
  scene?: Line[]; // story node: the conversation that plays on entering
  // town (Nov 13, delivery 3 of the design docs/game-design/towns-party-equipment.md): menu with Shop, Bar and Party;
  // `rumors` are the bar's rumors, which tell the story and give hints (pt, en)
  town?: { rumors: [string, string][] };
}

export { INTRO, WORLD };

export const WORLD_KEY = 'dt:world'; // how many nodes were already won or seen, in order

// trust boundary: the number saved in the browser is only valid between 0 and the total number of nodes
export function parseWorld(raw: unknown): number {
  const n = Number(raw);
  return Number.isInteger(n) && n >= 0 && n <= WORLD.length ? n : 0;
}

// open node: the ones already passed and the next one
export const isOpen = (i: number, done: number) => i <= Math.min(done, WORLD.length - 1);

// progress after passing node i (never goes backwards when replaying an old one)
export const afterNode = (i: number, done: number) => Math.max(done, i + 1);

export const nodeOfChapter = (n: number) => WORLD.findIndex((w) => w.chapter === n);

// next open node in the requested direction (keyboard arrows, gamepad d-pad); stops at the ends
export function step(i: number, dir: 1 | -1, done: number): number {
  const j = i + dir;
  return j >= 0 && j < WORLD.length && isOpen(j, done) ? j : i;
}

// Party for the next battle (map's Party screen): the unlocked abilities and who stays out so the protagonist can join
export function partyFor(
  done: number,
  hero: Hero | null,
  group: Group = defaultGroup(),
): { units: DevUnit[]; benched: string | null; chapter: number } {
  const next = WORLD.slice(done).find((w) => w.chapter !== undefined)?.chapter ?? CHAPTERS.length - 1;
  const benched = hero ? (group.members.find((m) => m.id === hero.cls)?.name ?? null) : null;
  return { units: heroesFor(group, next, hero), benched, chapter: next };
}

// every campaign stage has a node on the map, exactly once (the test checks)
export const chaptersOnMap = () =>
  WORLD.filter((w) => w.chapter !== undefined)
    .map((w) => w.chapter!)
    .sort((a, b) => a - b);
export const ALL_CHAPTERS = CHAPTERS.map((_, i) => i);
