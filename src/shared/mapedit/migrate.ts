// The Developer menu's saved cast (dt:dev, client dev-roster.ts DevSetup) as a battle document, so it becomes the
// battle builder's first slot (grill, Nov 25). Same seats as buildDevScenario: the map's starting tiles in order.
import type { Loadout } from '../battle/equipment.ts';
import { faceNearest } from '../battle/grid.ts';
import { MAX_JUMP } from '../battle/pathing.ts';
import { SCENARIOS, type Spawn } from '../battle/scenarios.ts';
import type { Team } from '../battle/types.ts';
import { isObjective, UNIT_DEFS } from '../battle/units.ts';
import type { BattleDoc, MapUnit } from './battle.ts';
import { docFromScenario } from './doc.ts';
import { parseSheet, type Sheet } from './sheet.ts';

// the shape of dev-roster.ts DevUnit and DevSetup (the engine never imports the client)
export interface DevCastUnit {
  base: string;
  name: string;
  hp: number;
  speed: number;
  move: number;
  jump?: number;
  items?: Loadout;
  abilities: string[];
}
export interface DevCast {
  map: string;
  heroes: DevCastUnit[];
  enemies: DevCastUnit[];
}

// Only what differs from the class stays on the unit, so an untouched cast reads as plain classes. Null on a map the
// game does not have (the cast is read through the client's parseSetup first)
export function battleFromDevCast(cast: DevCast): BattleDoc | null {
  const sc = Object.hasOwn(SCENARIOS, cast.map) ? SCENARIOS[cast.map] : undefined;
  if (!sc || (sc.grid.sub ?? 1) > 1) return null;
  const objective = sc.spawns.filter((s) => isObjective(s.def));
  const slots = (team: Team) => sc.spawns.filter((s) => s.team === team && !isObjective(s.def));
  const seat = (units: DevCastUnit[], team: Team): [DevCastUnit, Spawn, string][] =>
    units.slice(0, slots(team).length).map((u, i) => [u, slots(team)[i], `${team[0]}${i}`]);
  const seated = [...seat(cast.heroes, 'hero'), ...seat(cast.enemies, 'enemy')];
  const at = (team: Team) => seated.filter(([, s]) => s.team === team).map(([, s]) => s);
  const units: MapUnit[] = objective.map((s, i) => ({
    id: `b${i}`,
    def: s.def,
    team: s.team,
    x: s.x,
    y: s.y,
    facing: faceNearest(s, at('enemy')),
  }));
  for (const [u, s, id] of seated) {
    const d = UNIT_DEFS[u.base];
    const edited: Sheet = {
      ...(u.name !== d.name && { name: u.name }),
      ...(u.hp !== d.hp && { hp: u.hp }),
      ...(u.speed !== d.speed && { speed: u.speed }),
      ...(u.move !== d.move && { move: u.move }),
      ...(u.jump !== undefined && u.jump !== (d.jump ?? MAX_JUMP) && { jump: u.jump }),
      ...(u.items && Object.keys(u.items).length > 0 && { items: { ...u.items } }),
      ...(u.abilities.join() !== d.abilities.join() && { abilities: [...u.abilities] }),
    };
    // a field the battle document refuses (the Developer menu took an empty ability list) falls back to the class's,
    // so the migrated slot always reads back
    const kept = Object.entries(edited).filter(([k, v]) => parseSheet({ [k]: v }, u.base));
    units.push({
      id,
      def: u.base,
      team: s.team,
      x: s.x,
      y: s.y,
      facing: faceNearest(s, at(s.team === 'hero' ? 'enemy' : 'hero')),
      ...Object.fromEntries(kept),
    });
  }
  return { map: docFromScenario(sc), units, objective: { kind: objective.length ? 'beacon' : 'defeat_all' } };
}
