// Grupo do jogador (13/11, pedido do Fernando: "recrutamento e troca de classe", como a formação do FFT; desenho em
// docs/game-design/cidades-grupo-equipamento.md, entrega 5). Puro e testado; as telas ficam em world-ui.ts.
// Os 4 da história nunca saem; recrutados se contratam no Bar com ouro e se dispensam. Qualquer um troca de classe
// entre as 4 liberadas, e até 4 vão à batalha (as casas de partida dos mapas). O grupo padrão monta exatamente o
// elenco medido de cada fase, então a curva da campanha não muda para quem não mexe no grupo.
import type { Chest, Equip } from './chest.ts';
import { unitFrom, type DevUnit } from './dev-roster.ts';
import { HERO_CLASSES, NAME_MAX, type Hero, type HeroClass } from './hero.ts';

export interface Member {
  id: string; // chave do equipamento (dt:equip); os da história usam a classe de partida, como o save antigo
  name: string;
  cls: HeroClass;
  recruit: boolean;
}
export interface Group {
  members: Member[];
  deployed: string[]; // ids de quem vai à batalha, na ordem das casas de partida
}
export const GROUP_KEY = 'dt:grupo';
export const GROUP_MAX = 8; // teto do desenho (seção 3)
export const DEPLOY_MAX = 4; // os mapas têm 4 casas de partida de herói
export const RECRUIT_COST = 200; // número inicial: uma vitória dá 150, a loja do 1º ato custa 100 a 240

const STORY: Member[] = [
  { id: 'warrior', name: 'Bran', cls: 'warrior', recruit: false },
  { id: 'archer', name: 'Tess', cls: 'archer', recruit: false },
  { id: 'mage', name: 'Odo', cls: 'mage', recruit: false },
  { id: 'rogue', name: 'Lia', cls: 'rogue', recruit: false },
];
// nomes dos recrutados, na ordem (sem sorteio: o mesmo grupo dá os mesmos nomes)
const NAMES = ['Ivo', 'Nina', 'Caio', 'Vera', 'Rui', 'Duda', 'Téo', 'Mira', 'Saulo', 'Bia', 'Otto', 'Lena'];

export const defaultGroup = (): Group => ({ members: STORY.map((m) => ({ ...m })), deployed: STORY.map((m) => m.id) });

// fronteira de confiança: o grupo salvo vem do navegador. Os da história voltam sempre (com a classe salva, se válida);
// recrutado sem nome, classe ou id válido some; até 4 escalados, só ids que existem; sem escalado volta o padrão
export function parseGroup(raw: unknown): Group {
  const r = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const list = Array.isArray(r.members) ? r.members.filter((m): m is Record<string, unknown> => !!m && typeof m === 'object') : [];
  const cls = (v: unknown, d: HeroClass) => (HERO_CLASSES.includes(v as HeroClass) ? (v as HeroClass) : d);
  const story = STORY.map((s) => ({ ...s, cls: cls(list.find((m) => m.id === s.id)?.cls, s.cls) }));
  const recruits = list.filter((m) => typeof m.id === 'string' && /^r\d{1,3}$/.test(m.id) && typeof m.name === 'string'
    && m.name.trim() && m.name.length <= NAME_MAX && HERO_CLASSES.includes(m.cls as HeroClass))
    .map((m) => ({ id: m.id as string, name: (m.name as string).trim(), cls: m.cls as HeroClass, recruit: true }))
    .filter((m, i, a) => a.findIndex((o) => o.id === m.id) === i)
    .slice(0, GROUP_MAX - STORY.length);
  const members = [...story, ...recruits];
  const deployed = (Array.isArray(r.deployed) ? r.deployed : []).filter((id, i, a): id is string =>
    typeof id === 'string' && members.some((m) => m.id === id) && a.indexOf(id) === i).slice(0, DEPLOY_MAX);
  return { members, deployed: deployed.length ? deployed : defaultGroup().deployed };
}

// contrata um recrutado da classe pedida: custa ouro, respeita o teto; null se não dá
export function recruit(g: Group, chest: Chest, cls: HeroClass): { group: Group; chest: Chest } | null {
  if (g.members.length >= GROUP_MAX || chest.gold < RECRUIT_COST) return null;
  const used = new Set(g.members.map((m) => m.id));
  let k = 1;
  while (used.has(`r${k}`)) k++;
  const name = NAMES.find((n) => !g.members.some((m) => m.name === n)) ?? `Recruta ${k}`;
  const m: Member = { id: `r${k}`, name, cls, recruit: true };
  // entra escalado se ainda há vaga na batalha
  const deployed = g.deployed.length < DEPLOY_MAX ? [...g.deployed, m.id] : g.deployed;
  return { group: { members: [...g.members, m], deployed }, chest: { ...chest, gold: chest.gold - RECRUIT_COST } };
}

// dispensa um recrutado (os da história ficam); o equipamento dele volta ao baú
export function dismiss(g: Group, eq: Equip, chest: Chest, id: string): { group: Group; eq: Equip; chest: Chest } | null {
  const m = g.members.find((x) => x.id === id);
  if (!m?.recruit) return null;
  const { [id]: gear, ...rest } = eq;
  const back = Object.values(gear ?? {}).filter((x): x is string => !!x);
  const deployed = g.deployed.filter((x) => x !== id);
  return {
    group: { members: g.members.filter((x) => x.id !== id), deployed: deployed.length ? deployed : [g.members.find((x) => x.id !== id)!.id] },
    eq: rest, chest: { ...chest, items: [...chest.items, ...back] },
  };
}

export const changeClass = (g: Group, id: string, cls: HeroClass): Group =>
  ({ ...g, members: g.members.map((m) => (m.id === id ? { ...m, cls } : m)) });

// escala ou tira da batalha: no máximo 4 e nunca nenhum; null se não dá
export function toggleDeploy(g: Group, id: string): Group | null {
  if (g.deployed.includes(id)) return g.deployed.length > 1 ? { ...g, deployed: g.deployed.filter((x) => x !== id) } : null;
  return g.deployed.length < DEPLOY_MAX && g.members.some((m) => m.id === id) ? { ...g, deployed: [...g.deployed, id] } : null;
}

// Habilidades liberadas na fase n: 2 na 1ª, 3 na 2ª, as 4 da 3ª em diante (a 1ª fase ensina pouco de cada vez e a Cura
// do Odo chega no meio da campanha). Vale para a classe atual de cada um
export const learnedCount = (n: number) => Math.min(4, 2 + n);

// quem vai à batalha da fase n, com as habilidades liberadas, o equipamento e o protagonista (hero.ts) no lugar do
// companheiro da história que tem a classe de partida dele (o companheiro segue nas conversas)
export function heroesFor(g: Group, n: number, hero: Hero | null = null, eq: Equip = {}): DevUnit[] {
  return g.deployed.map((id) => g.members.find((m) => m.id === id)!).map((m) => {
    const name = hero && m.id === hero.cls ? hero.name : m.name;
    const u = unitFrom(m.cls, name);
    return { ...u, ...(hero && m.id === hero.cls ? { en: hero.name } : {}), abilities: u.abilities.slice(0, learnedCount(n)), items: eq[m.id] };
  });
}
