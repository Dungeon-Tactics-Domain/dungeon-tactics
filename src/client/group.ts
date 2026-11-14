// Player party (Nov 13, Fernando's request: "recruitment and class change", like the FFT formation; design in
// docs/game-design/cidades-grupo-equipamento.md, delivery 5). Pure and tested; the screens live in world-ui.ts.
// The 4 from the story never leave; recruits are hired at the Bar with gold and can be dismissed. Anyone can change class
// among the unlocked ones (JOBS), and up to 4 go to battle (the maps' starting tiles). The default party assembles exactly the
// measured cast of each stage, so the campaign curve doesn't change for whoever doesn't touch the party.
import type { Chest, Equip } from './chest.ts';
import { unitFrom, type DevUnit } from './dev-roster.ts';
import { HERO_CLASSES, NAME_MAX, type Hero } from './hero.ts';

// party classes: the protagonist's 4 and the new ones, which only join via recruitment and class change (design, section 4)
export const JOBS = [...HERO_CLASSES, 'lancer'] as const;
export type Job = (typeof JOBS)[number];

export interface Member {
  id: string; // equipment key (dt:equip); the story ones use the starting class, like the old save
  name: string;
  cls: Job;
  recruit: boolean;
}
export interface Group {
  members: Member[];
  deployed: string[]; // ids of who goes to battle, in the order of the starting tiles
}
export const GROUP_KEY = 'dt:grupo';
export const GROUP_MAX = 8; // design cap (section 3)
export const DEPLOY_MAX = 4; // the maps have 4 hero starting tiles
export const RECRUIT_COST = 200; // initial number: a victory gives 150, the 1st act shop costs 100 to 240

const STORY: Member[] = [
  { id: 'warrior', name: 'Bran', cls: 'warrior', recruit: false },
  { id: 'archer', name: 'Tess', cls: 'archer', recruit: false },
  { id: 'mage', name: 'Odo', cls: 'mage', recruit: false },
  { id: 'rogue', name: 'Lia', cls: 'rogue', recruit: false },
];
// names of the recruits, in order (no draw: the same party gives the same names)
const NAMES = ['Ivo', 'Nina', 'Caio', 'Vera', 'Rui', 'Duda', 'Téo', 'Mira', 'Saulo', 'Bia', 'Otto', 'Lena'];

export const defaultGroup = (): Group => ({ members: STORY.map((m) => ({ ...m })), deployed: STORY.map((m) => m.id) });

// trust boundary: the saved party comes from the browser. The story ones always come back (with the saved class, if valid);
// a recruit without a valid name, class or id disappears; up to 4 fielded, only ids that exist; with none fielded the default returns
export function parseGroup(raw: unknown): Group {
  const r = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const list = Array.isArray(r.members)
    ? r.members.filter((m): m is Record<string, unknown> => !!m && typeof m === 'object')
    : [];
  const cls = (v: unknown, d: Job) => (JOBS.includes(v as Job) ? (v as Job) : d);
  const story = STORY.map((s) => ({ ...s, cls: cls(list.find((m) => m.id === s.id)?.cls, s.cls) }));
  const recruits = list
    .filter(
      (m) =>
        typeof m.id === 'string' &&
        /^r\d{1,3}$/.test(m.id) &&
        typeof m.name === 'string' &&
        m.name.trim() &&
        m.name.length <= NAME_MAX &&
        JOBS.includes(m.cls as Job),
    )
    .map((m) => ({ id: m.id as string, name: (m.name as string).trim(), cls: m.cls as Job, recruit: true }))
    .filter((m, i, a) => a.findIndex((o) => o.id === m.id) === i)
    .slice(0, GROUP_MAX - STORY.length);
  const members = [...story, ...recruits];
  const deployed = (Array.isArray(r.deployed) ? r.deployed : [])
    .filter(
      (id, i, a): id is string => typeof id === 'string' && members.some((m) => m.id === id) && a.indexOf(id) === i,
    )
    .slice(0, DEPLOY_MAX);
  return { members, deployed: deployed.length ? deployed : defaultGroup().deployed };
}

// hires a recruit of the requested class: costs gold, respects the cap; null if not possible
export function recruit(g: Group, chest: Chest, cls: Job): { group: Group; chest: Chest } | null {
  if (g.members.length >= GROUP_MAX || chest.gold < RECRUIT_COST) return null;
  const used = new Set(g.members.map((m) => m.id));
  let k = 1;
  while (used.has(`r${k}`)) k++;
  const name = NAMES.find((n) => !g.members.some((m) => m.name === n)) ?? `Recruta ${k}`;
  const m: Member = { id: `r${k}`, name, cls, recruit: true };
  // joins the fielded party if there's still room in the battle
  const deployed = g.deployed.length < DEPLOY_MAX ? [...g.deployed, m.id] : g.deployed;
  return { group: { members: [...g.members, m], deployed }, chest: { ...chest, gold: chest.gold - RECRUIT_COST } };
}

// dismisses a recruit (the story ones stay); their equipment returns to the chest
export function dismiss(
  g: Group,
  eq: Equip,
  chest: Chest,
  id: string,
): { group: Group; eq: Equip; chest: Chest } | null {
  const m = g.members.find((x) => x.id === id);
  if (!m?.recruit) return null;
  const { [id]: gear, ...rest } = eq;
  const back = Object.values(gear ?? {}).filter((x): x is string => !!x);
  const deployed = g.deployed.filter((x) => x !== id);
  return {
    group: {
      members: g.members.filter((x) => x.id !== id),
      deployed: deployed.length ? deployed : [g.members.find((x) => x.id !== id)!.id],
    },
    eq: rest,
    chest: { ...chest, items: [...chest.items, ...back] },
  };
}

export const changeClass = (g: Group, id: string, cls: Job): Group => ({
  ...g,
  members: g.members.map((m) => (m.id === id ? { ...m, cls } : m)),
});

// fields or removes from battle: at most 4 and never none; null if not possible
export function toggleDeploy(g: Group, id: string): Group | null {
  if (g.deployed.includes(id))
    return g.deployed.length > 1 ? { ...g, deployed: g.deployed.filter((x) => x !== id) } : null;
  return g.deployed.length < DEPLOY_MAX && g.members.some((m) => m.id === id)
    ? { ...g, deployed: [...g.deployed, id] }
    : null;
}

// Abilities unlocked at stage n: 2 in the 1st, 3 in the 2nd, all 4 from the 3rd on (the 1st stage teaches a little at a time and Odo's
// Heal arrives mid-campaign). Applies to each one's current class
export const learnedCount = (n: number) => Math.min(4, 2 + n);

// who goes to the battle of stage n, with the unlocked abilities, the equipment and the protagonist (hero.ts) in place of the
// story companion who has his starting class (the companion stays in the conversations)
export function heroesFor(g: Group, n: number, hero: Hero | null = null, eq: Equip = {}): DevUnit[] {
  return g.deployed
    .map((id) => g.members.find((m) => m.id === id)!)
    .map((m) => {
      const name = hero && m.id === hero.cls ? hero.name : m.name;
      const u = unitFrom(m.cls, name);
      return {
        ...u,
        ...(hero && m.id === hero.cls ? { en: hero.name } : {}),
        abilities: u.abilities.slice(0, learnedCount(n)),
        items: eq[m.id],
      };
    });
}
