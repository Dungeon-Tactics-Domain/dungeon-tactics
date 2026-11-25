// Developer menu (Fernando's request, Nov 12: "create a developer menu to go building the characters,
// making the parties and choosing which map to take part in"). Pure: assembles, validates and turns the cast into a scenario.
// His decisions (multiple choice, Nov 12): edits class, name and numbers; builds heroes and enemies; the units occupy the
// map's starting tiles; saves in the browser and exports/imports JSON.
import { ABILITIES } from '../shared/battle/abilities.ts';
import { type Loadout, withGear } from '../shared/battle/equipment.ts';
import { MAX_JUMP } from '../shared/battle/pathing.ts';
import type { Rules } from '../shared/battle/rules.ts';
import { SCENARIOS, type Scenario, type Spawn } from '../shared/battle/scenarios.ts';
import type { Team } from '../shared/battle/types.ts';
import { baseDef, OBJECTIVE_DEF, UNIT_DEFS } from '../shared/battle/units.ts';
import { modelOf } from './markers.ts';

export interface DevUnit {
  base: string; // starting class (id in UNIT_DEFS): gives the figure and the initial numbers
  name: string;
  en?: string; // English name, when the name is translatable (Recruta, A Sombra); the developer menu doesn't use it
  hp: number;
  speed: number;
  move: number;
  jump?: number; // Jump (Nov 13); optional so casts saved before it open the same (without it, the class's)
  items?: Loadout; // equipment (Nov 13, equipment.ts): adds to the battle sheet
  abilities: string[];
}
export interface DevSetup {
  map: string;
  heroes: DevUnit[];
  enemies: DevUnit[];
}

export const DEV_KEY = 'dt:dev'; // cast saved in the browser
export const DEV_SCENARIO = 'dev';
// maps the menu offers: the game's
export const DEV_MAPS = ['beacon_hill', 'skirmish', 'flooded_crypt', 'crypt_heart', 'ash_wood', 'frost_pass'];
// limits of the editable numbers: wide for testing, but without breaking the turn queue (speed 0 never plays)
export const LIMITS = { hp: [1, 999], speed: [1, 50], move: [1, 12], jump: [1, 6] } as const;
const MAX_TEAM = 12;

// game classes and abilities (the sheets this menu builds are left out)
const ours = (id: string) => !id.startsWith('dev-');
// large unit (size) is left out: the maps' starting tiles are 1 tile
export const devClasses = () =>
  Object.keys(UNIT_DEFS).filter((id) => ours(id) && id !== OBJECTIVE_DEF && !UNIT_DEFS[id].size);
export const devAbilities = () => Object.keys(ABILITIES).filter(ours);

export function unitFrom(base: string, name = UNIT_DEFS[base].name): DevUnit {
  const d = UNIT_DEFS[base];
  return { base, name, hp: d.hp, speed: d.speed, move: d.move, jump: d.jump ?? MAX_JUMP, abilities: [...d.abilities] };
}

// map starting tiles per side (the Beacon aside: it's the objective, not part of the party)
export function slotsOf(map: string): Record<Team, Spawn[]> & { objective: Spawn[] } {
  const spawns = SCENARIOS[map]?.spawns ?? [];
  return {
    hero: spawns.filter((s) => s.team === 'hero' && s.def !== OBJECTIVE_DEF),
    enemy: spawns.filter((s) => s.team === 'enemy'),
    objective: spawns.filter((s) => s.def === OBJECTIVE_DEF),
  };
}

// a map's default cast is whoever is born on it
export function defaultSetup(map: string): DevSetup {
  const s = slotsOf(map);
  const pick = (slots: Spawn[]) => slots.map((x) => unitFrom(x.def));
  return { map, heroes: pick(s.hero), enemies: pick(s.enemy) };
}

// What prevents starting, as text for the player (empty = can start)
export function problems(setup: DevSetup, say: (pt: string, en: string) => string): string[] {
  const out: string[] = [];
  const s = slotsOf(setup.map);
  const sides: [DevUnit[], Spawn[], string, string][] = [
    [setup.heroes, s.hero, 'heróis', 'heroes'],
    [setup.enemies, s.enemy, 'inimigos', 'enemies'],
  ];
  for (const [units, slots, pt, en] of sides) {
    if (!units.length) out.push(say(`Ponha ao menos 1 entre os ${pt}.`, `Add at least 1 of the ${en}.`));
    if (units.length > slots.length)
      out.push(
        say(
          `O mapa tem ${slots.length} casas de partida para os ${pt}: tire ${units.length - slots.length}.`,
          `The map has ${slots.length} starting tiles for the ${en}: remove ${units.length - slots.length}.`,
        ),
      );
    for (const u of units)
      if (!u.abilities.length) out.push(say(`${u.name} está sem habilidade.`, `${u.name} has no ability.`));
  }
  return out;
}

const isInt = (v: unknown, [lo, hi]: readonly [number, number]) =>
  Number.isInteger(v) && (v as number) >= lo && (v as number) <= hi;

// Trust boundary: the JSON comes from an imported file or the browser. Only the known format passes, nothing else.
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
      if (u.jump !== undefined && !isInt(u.jump, LIMITS.jump)) return null;
      if (
        !Array.isArray(u.abilities) ||
        u.abilities.length > 8 ||
        !u.abilities.every((a) => typeof a === 'string' && devAbilities().includes(a))
      )
        return null;
      units.push({
        base: u.base,
        name: u.name.trim(),
        hp: u.hp as number,
        speed: u.speed as number,
        move: u.move as number,
        ...(u.jump !== undefined && { jump: u.jump as number }),
        abilities: [...new Set(u.abilities as string[])],
      });
    }
    return units;
  };
  const heroes = team(r.heroes),
    enemies = team(r.enemies);
  return heroes && enemies ? { map: r.map, heroes, enemies } : null;
}

// Map without the Beacon (a crawl room): no objective, last one standing wins; the default rule would give an instant defeat (no Beacon = lost)
const lastStanding: Rules = {
  outcome: (state) =>
    !state.units.some((u) => u.team === 'enemy')
      ? 'victory'
      : !state.units.some((u) => u.team === 'hero')
        ? 'defeat'
        : 'ongoing',
};

// Turns the cast into a scenario: each unit becomes its own sheet (dev-h0, dev-e1…) with the figure of the starting class
// and occupies the map's starting tiles in order. Registers the sheets and the scenario in the engine's lists.
// origin class of each sheet assembled here (dev-h0 → warrior): the HUD shows "Bran · Guerreiro"
const BASE: Record<string, string> = {};
export const classOf = (def: string): string | undefined => BASE[baseDef(def)]; // the half-tile token too (half.ts)

// The expedition rooms (game/crawl.ts castRoom) use the same path with their own id and name.
export function buildDevScenario(
  setup: DevSetup,
  scenarioId = DEV_SCENARIO,
  title: [string, string] = ['Desenvolvedor', 'Developer'],
): Scenario {
  const base = SCENARIOS[setup.map];
  const s = slotsOf(setup.map);
  const spawns: Spawn[] = [...s.objective];
  const add = (units: DevUnit[], slots: Spawn[], team: Team, tag: string) =>
    units.slice(0, slots.length).forEach((u, i) => {
      const id = `${scenarioId}-${tag}${i}`;
      // unchanged name = the class's in both languages; own name (Bran, Vesper) is the same in both; en only if it comes in the cast
      const en = u.en ?? (u.name === UNIT_DEFS[u.base].name ? UNIT_DEFS[u.base].en : u.name);
      BASE[id] = u.base;
      // size comes from the class (the Colossus occupies 2x2 like the original)
      // the class's resistances, dodge and power (Nov 15): not editable here, so every hero and enemy keeps its class's;
      // and the class's mana or stamina pool and regen (Nov 16), copied so no sheet shares the class's object;
      // the equipment adds its pieces on top (withGear, equipment.ts), the same sheet the party's Sheet shows
      const { resist, dodge, physPower, magPower, vars, regen } = UNIT_DEFS[u.base];
      UNIT_DEFS[id] = withGear(
        {
          ...(resist && { resist }),
          ...(dodge && { dodge }),
          ...(vars && { vars: { ...vars } }),
          ...(regen && { regen: { ...regen } }),
          ...(physPower && { physPower }),
          ...(magPower && { magPower }),
          ...(UNIT_DEFS[u.base].size && { size: UNIT_DEFS[u.base].size }),
          // the body's shape and height on the split map: without them an expedition's rat stood on 2x2 half tiles
          // like a person (Fernando, Nov 25: "rato tá ocupando 4")
          ...(UNIT_DEFS[u.base].halfSize && { halfSize: UNIT_DEFS[u.base].halfSize }),
          ...(UNIT_DEFS[u.base].halfLength && { halfLength: UNIT_DEFS[u.base].halfLength }),
          ...(UNIT_DEFS[u.base].swarm && { swarm: true }),
          ...(UNIT_DEFS[u.base].tall && { tall: UNIT_DEFS[u.base].tall }),
          jump: u.jump ?? UNIT_DEFS[u.base].jump ?? MAX_JUMP,
          ...(UNIT_DEFS[u.base].tint && { tint: UNIT_DEFS[u.base].tint }),
          ...(UNIT_DEFS[u.base].undead && { undead: true as const }), // heals hurt the class's skeletons in every cast too
          id,
          name: u.name,
          en,
          hp: u.hp,
          speed: u.speed,
          move: u.move,
          abilities: [...u.abilities],
          model: modelOf(u.base),
        },
        u.items,
      );
      spawns.push({ id: `${tag}${i}`, def: id, team, x: slots[i].x, y: slots[i].y });
    });
  add(setup.heroes, s.hero, 'hero', 'h');
  add(setup.enemies, s.enemy, 'enemy', 'e');
  const scenario: Scenario = {
    id: scenarioId,
    name: title[0],
    en: title[1],
    grid: base.grid,
    spawns,
    ...(!s.objective.length && { rules: lastStanding }),
  };
  SCENARIOS[scenarioId] = scenario;
  return scenario;
}
