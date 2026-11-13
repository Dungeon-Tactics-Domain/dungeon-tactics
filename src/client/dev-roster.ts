// Menu de desenvolvedor (pedido do Fernando, 12/11: "criar um menu de desenvolvedor para ir construindo os personagens,
// fazendo as parties e ir escolhendo qual mapa participar"). Puro: monta, valida e transforma o elenco num cenário.
// Decisões dele (múltipla escolha, 12/11): edita classe, nome e números; monta heróis e inimigos; as unidades ocupam as
// casas de partida do mapa; salva no navegador e exporta/importa JSON.
import { ABILITIES } from '../shared/battle/abilities.ts';
import type { Rules } from '../shared/battle/rules.ts';
import { SCENARIOS, type Scenario, type Spawn } from '../shared/battle/scenarios.ts';
import type { Team } from '../shared/battle/types.ts';
import { OBJECTIVE_DEF, UNIT_DEFS } from '../shared/battle/units.ts';
import { modelOf } from './markers.ts';

export interface DevUnit {
  base: string; // classe de partida (id em UNIT_DEFS): dá o boneco e os números iniciais
  name: string;
  en?: string; // nome em inglês, quando o nome é traduzível (Recruta, A Sombra); o menu de desenvolvedor não usa
  hp: number;
  speed: number;
  move: number;
  abilities: string[];
}
export interface DevSetup {
  map: string;
  heroes: DevUnit[];
  enemies: DevUnit[];
}

export const DEV_KEY = 'dt:dev'; // elenco salvo no navegador
export const DEV_SCENARIO = 'dev';
// mapas que o menu oferece: os do jogo e o relevo de Gariland (só o mapa: o estudo é carregado à parte, ver main.ts)
export const DEV_MAPS = ['beacon_hill', 'skirmish', 'flooded_crypt', 'crypt_heart', 'ash_wood', 'frost_pass', 'fft-gariland'];
// limites dos números editáveis: largos para testar, mas sem quebrar a fila de turnos (velocidade 0 nunca joga)
export const LIMITS = { hp: [1, 999], speed: [1, 50], move: [1, 12] } as const;
const MAX_TEAM = 12;

// classes e habilidades do jogo (as do estudo FFT dependem das regras do estudo e ficam de fora)
const ours = (id: string) => !id.startsWith('fft_') && !id.startsWith('dev-');
// unidade grande (size) fica de fora: as casas de partida dos mapas são de 1 casa
export const devClasses = () => Object.keys(UNIT_DEFS).filter((id) => ours(id) && id !== OBJECTIVE_DEF && !UNIT_DEFS[id].size);
export const devAbilities = () => Object.keys(ABILITIES).filter(ours);

export function unitFrom(base: string, name = UNIT_DEFS[base].name): DevUnit {
  const d = UNIT_DEFS[base];
  return { base, name, hp: d.hp, speed: d.speed, move: d.move, abilities: [...d.abilities] };
}

// casas de partida do mapa por lado (o Farol à parte: é o objetivo, não entra na party)
export function slotsOf(map: string): Record<Team, Spawn[]> & { objective: Spawn[] } {
  const spawns = SCENARIOS[map]?.spawns ?? [];
  return {
    hero: spawns.filter((s) => s.team === 'hero' && s.def !== OBJECTIVE_DEF),
    enemy: spawns.filter((s) => s.team === 'enemy'),
    objective: spawns.filter((s) => s.def === OBJECTIVE_DEF),
  };
}

// o elenco padrão de um mapa é quem já nasce nele; em Gariland (unidades do estudo) entram as nossas classes em rodízio
const FALLBACK: Record<Team, string[]> = { hero: ['warrior', 'archer', 'mage', 'rogue'], enemy: ['soldier', 'skeleton_archer', 'dark_mage', 'brute'] };
export function defaultSetup(map: string): DevSetup {
  const s = slotsOf(map);
  const pick = (slots: Spawn[], team: Team) => slots.map((x, i) => unitFrom(ours(x.def) ? x.def : FALLBACK[team][i % 4]));
  return { map, heroes: pick(s.hero, 'hero'), enemies: pick(s.enemy, 'enemy') };
}

// O que impede de começar, em texto para o jogador (vazio = pode começar)
export function problems(setup: DevSetup, say: (pt: string, en: string) => string): string[] {
  const out: string[] = [];
  const s = slotsOf(setup.map);
  const sides: [DevUnit[], Spawn[], string, string][] = [[setup.heroes, s.hero, 'heróis', 'heroes'], [setup.enemies, s.enemy, 'inimigos', 'enemies']];
  for (const [units, slots, pt, en] of sides) {
    if (!units.length) out.push(say(`Ponha ao menos 1 entre os ${pt}.`, `Add at least 1 of the ${en}.`));
    if (units.length > slots.length) out.push(say(`O mapa tem ${slots.length} casas de partida para os ${pt}: tire ${units.length - slots.length}.`, `The map has ${slots.length} starting tiles for the ${en}: remove ${units.length - slots.length}.`));
    for (const u of units) if (!u.abilities.length) out.push(say(`${u.name} está sem habilidade.`, `${u.name} has no ability.`));
  }
  return out;
}

const isInt = (v: unknown, [lo, hi]: readonly [number, number]) => Number.isInteger(v) && (v as number) >= lo && (v as number) <= hi;

// Fronteira de confiança: o JSON vem de arquivo importado ou do navegador. Só passa o formato conhecido, nada mais.
export function parseSetup(raw: unknown): DevSetup | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.map !== 'string' || !DEV_MAPS.includes(r.map)) return null;
  const team = (v: unknown): DevUnit[] | null => {
    if (!Array.isArray(v) || v.length > MAX_TEAM) return null;
    const units: DevUnit[] = [];
    for (const x of v) {
      if (!x || typeof x !== 'object') return null;
      const u = x as Record<string, unknown>;
      if (typeof u.base !== 'string' || !devClasses().includes(u.base)) return null;
      if (typeof u.name !== 'string' || !u.name.trim() || u.name.length > 24) return null;
      if (!isInt(u.hp, LIMITS.hp) || !isInt(u.speed, LIMITS.speed) || !isInt(u.move, LIMITS.move)) return null;
      if (!Array.isArray(u.abilities) || u.abilities.length > 8 || !u.abilities.every((a) => typeof a === 'string' && devAbilities().includes(a))) return null;
      units.push({ base: u.base, name: u.name.trim(), hp: u.hp as number, speed: u.speed as number, move: u.move as number, abilities: [...new Set(u.abilities as string[])] });
    }
    return units;
  };
  const heroes = team(r.heroes), enemies = team(r.enemies);
  return heroes && enemies ? { map: r.map, heroes, enemies } : null;
}

// Mapa sem o Farol (Gariland): sem objetivo, vence quem sobrar; a regra padrão daria derrota na hora (sem Farol = perdeu)
const lastStanding: Rules = {
  outcome: (state) => (!state.units.some((u) => u.team === 'enemy') ? 'victory' : !state.units.some((u) => u.team === 'hero') ? 'defeat' : 'ongoing'),
};

// Transforma o elenco num cenário: cada unidade vira uma ficha própria (dev-h0, dev-e1…) com o boneco da classe de partida
// e ocupa as casas de partida do mapa na ordem. Registra as fichas e o cenário nas listas do motor.
// classe de origem de cada ficha montada aqui (dev-h0 → warrior): o HUD mostra "Bran · Guerreiro"
const BASE: Record<string, string> = {};
export const classOf = (def: string): string | undefined => BASE[def];

// A campanha (campaign.ts) usa o mesmo caminho com id e nome próprios por fase.
export function buildDevScenario(setup: DevSetup, scenarioId = DEV_SCENARIO, title: [string, string] = ['Desenvolvedor', 'Developer']): Scenario {
  const base = SCENARIOS[setup.map];
  const s = slotsOf(setup.map);
  const spawns: Spawn[] = [...s.objective];
  const add = (units: DevUnit[], slots: Spawn[], team: Team, tag: string) =>
    units.slice(0, slots.length).forEach((u, i) => {
      const id = `${scenarioId}-${tag}${i}`;
      // nome sem mudar = o da classe nas duas línguas; nome próprio (Bran, Vesper) é igual nas duas; en só se vier no elenco
      const en = u.en ?? (u.name === UNIT_DEFS[u.base].name ? UNIT_DEFS[u.base].en : u.name);
      BASE[id] = u.base;
      // o tamanho vem da classe (o Colosso da campanha ocupa 2x2 como o original)
      UNIT_DEFS[id] = { ...(UNIT_DEFS[u.base].size && { size: UNIT_DEFS[u.base].size }), ...(UNIT_DEFS[u.base].jump && { jump: UNIT_DEFS[u.base].jump }), ...(UNIT_DEFS[u.base].tint && { tint: UNIT_DEFS[u.base].tint }), id, name: u.name, en, hp: u.hp, speed: u.speed, move: u.move, abilities: [...u.abilities], model: modelOf(u.base) };
      spawns.push({ id: `${tag}${i}`, def: id, team, x: slots[i].x, y: slots[i].y });
    });
  add(setup.heroes, s.hero, 'hero', 'h');
  add(setup.enemies, s.enemy, 'enemy', 'e');
  const scenario: Scenario = { id: scenarioId, name: title[0], en: title[1], grid: base.grid, spawns, ...(!s.objective.length && { rules: lastStanding }) };
  SCENARIOS[scenarioId] = scenario;
  return scenario;
}
