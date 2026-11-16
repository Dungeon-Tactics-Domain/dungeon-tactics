// Player party (Nov 13, Fernando's request: "recruitment and class change", like the FFT formation; design in
// docs/game-design/towns-party-equipment.md, delivery 5). Pure and tested; the screens live in town-ui.ts.
// The 4 from the story never leave; recruits are hired at the Tavern with gold and can be dismissed. Anyone can change class
// among JOBS, and up to 4 go to battle (the maps' starting tiles). The story members and the recruit names are data in
// src/content/party.ts.
import { JOBS, type Job, type Member, RECRUIT_NAMES, STORY } from '../content/party.ts';
import { CHEST_MAX, type Chest, type Equip } from './chest.ts';
import { type DevUnit, unitFrom } from './dev-roster.ts';

// the party's types are data in src/content/party.ts (the engine side never imports the client)
export { JOBS, type Job, type Member } from '../content/party.ts';

export interface Group {
  members: Member[];
  deployed: string[]; // ids of who goes to battle, in the order of the starting tiles
}
export const GROUP_KEY = 'dt:party';
export const GROUP_MAX = 8; // design cap (section 3)
export const DEPLOY_MAX = 4; // the maps have 4 hero starting tiles
export const RECRUIT_COST = 200; // initial number: the shop's common pieces cost 100 to 150
const NAME_MAX = 16; // a recruit's name in the saved party

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
  const name = RECRUIT_NAMES.find((n) => !g.members.some((m) => m.name === n)) ?? `Recruta ${k}`;
  const m: Member = { id: `r${k}`, name, cls, recruit: true };
  // joins the fielded party if there's still room in the battle
  const deployed = g.deployed.length < DEPLOY_MAX ? [...g.deployed, m.id] : g.deployed;
  return { group: { members: [...g.members, m], deployed }, chest: { ...chest, gold: chest.gold - RECRUIT_COST } };
}

// dismisses a recruit (the story ones stay); their equipment returns to the chest, so null when the chest has no room
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
  if (chest.items.length + back.length > CHEST_MAX) return null;
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

// the Party screen's list: who goes to battle first, in the deployment order, then who stays in town
export const roster = (g: Group): Member[] => [
  ...g.deployed.map((id) => g.members.find((m) => m.id === id)!),
  ...g.members.filter((m) => !g.deployed.includes(m.id)),
];

// who goes to battle, in the deployment order, each with the whole kit of their class and their equipment
export function heroesFor(g: Group, eq: Equip = {}): DevUnit[] {
  return g.deployed
    .map((id) => g.members.find((m) => m.id === id)!)
    .map((m) => ({ ...unitFrom(m.cls, m.name), items: eq[m.id] }));
}
