// Export of a builder map (spec): JSON for saves and pasting back (parse.ts), and a .ts source shaped like
// src/content/maps/ash-wood.ts (KEY table, MAP, H and RAMPS rows, a Scenario export) to add to MAPS as a game map.
// A map's file has empty spawns; a battle's (battle.ts) adds its spawns with their starting CT, each side's bag, who
// plays each side, the objective's rule and the units' own sheets (battle builder, Nov 25: the whole battle).
import type { BattleDoc } from './battle.ts';
import { kindKey, type MapDoc } from './doc.ts';
import { SHEET_KEYS } from './sheet.ts';

export const toJson = (doc: MapDoc | BattleDoc) => JSON.stringify(doc);

const LETTERS = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
const RAMP = 'v>^<'; // FACING order, as withRamps reads it
// one letter per kind up to 52, then two letters for every kind (2704, more than a 24x24 map's 576 tiles)
const codes = (n: number) =>
  n <= LETTERS.length ? [...LETTERS] : [...LETTERS].flatMap((a) => [...LETTERS].map((b) => a + b));

const str = (s: string) => `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
// a nested value (a loadout, an ability list) as JSON, which is valid TS
const value = (v: unknown) => (typeof v === 'string' ? str(v) : typeof v === 'object' ? JSON.stringify(v) : String(v));
const object = (o: object) =>
  `{ ${Object.entries(o)
    .map(([k, v]) => `${k}: ${value(v)}`)
    .join(', ')} }`;

// the map's constant name: ash_wood → ASH_WOOD
const constName = (id: string) => {
  const n = id.toUpperCase().replace(/[^A-Z0-9]/g, '_');
  return /^[A-Z_]/.test(n) ? n : `MAP_${n}`;
};

export const toTs = (doc: MapDoc) => source(doc, { map: doc, units: [] });
export const battleToTs = (doc: BattleDoc) => source(doc.map, doc);

// the objective as the scenario's rule (play.ts objectiveRules); the Beacon and the default need none
const rule = (b: BattleDoc) =>
  b.objective?.kind === 'defeat_all'
    ? 'lastStanding'
    : b.objective?.kind === 'survive'
      ? `surviveFor(${b.objective.turns})`
      : null;

function source(doc: MapDoc, battle: BattleDoc): string {
  const { units } = battle;
  const { width, height, tiles } = doc;
  const keys = [...new Set(tiles.map(kindKey))];
  const pool = codes(keys.length);
  const code = new Map(keys.map((k, i) => [k, pool[i]]));
  const rows = (cell: (i: number) => string) =>
    Array.from(
      { length: height },
      (_, y) => `  '${Array.from({ length: width }, (_, x) => cell(y * width + x)).join('')}',`,
    ).join('\n');
  const tall = tiles.some((t) => t.ramp && t.ramp[1] !== 1);
  const name = constName(doc.id);
  const cells = pool[0].length === 1 ? '[...row]' : '(row.match(/../g) ?? [])';
  // each unit's own sheet fields, by spawn id (sheet.ts SHEET_KEYS)
  const sheets = units.flatMap((u) => {
    const own = Object.fromEntries(SHEET_KEYS.flatMap((k) => (u[k] === undefined ? [] : [[k, u[k]]])));
    return Object.keys(own).length ? [[u.id, own] as const] : [];
  });
  const outcome = rule(battle);
  const built = `withRamps(
    {
      width: ${width},
      height: ${height},
      tiles: MAP.flatMap((row, y) => ${cells}.map((c, x) => ({ ...KEY[c], h: Number(H[y][x]) }))),
    },
    RAMPS,
  )`;
  return `import { ${tall ? 'type Grid, ' : ''}type Tile, withRamps } from '../../shared/battle/grid.ts';
${outcome ? `import { ${outcome.split('(')[0]} } from '../../shared/battle/outcome.ts';\n` : ''}import type { Scenario } from '../../shared/battle/scenarios.ts';
${sheets.length ? "import type { Sheet } from '../../shared/mapedit/sheet.ts';\n" : ''}
// Made in the map builder. One code per tile kind (KEY), its height (H, one digit) and where its ramp rises (RAMPS:
// v > ^ < in FACING order, a dot for flat ground)
const KEY: Record<string, Omit<Tile, 'h' | 'ramp'>> = {
${keys.map((k) => `  ${code.get(k)}: ${object(JSON.parse(k))},`).join('\n')}
};
const MAP = [
${rows((i) => code.get(kindKey(tiles[i])) ?? '')}
];
const H = [
${rows((i) => String(tiles[i].h))}
];
const RAMPS = [
${rows((i) => (tiles[i].ramp ? RAMP[tiles[i].ramp[0]] : '.'))}
];
${
  tall
    ? `// ramps that rise more than 1 level: each ramp's rise, one digit per tile
const RISE = [
${rows((i) => (tiles[i].ramp ? String(tiles[i].ramp[1]) : '.'))}
];
const rise = (g: Grid): Grid => ({
  ...g,
  tiles: g.tiles.map((t, i) =>
    t.ramp ? { ...t, ramp: [t.ramp[0], Number(RISE[Math.floor(i / g.width)][i % g.width])] as [number, number] } : t,
  ),
});
`
    : ''
}export const ${name}: Scenario = {
  id: ${str(doc.id)},
  name: ${str(doc.name)},
  en: ${str(doc.en)},
  grid: ${tall ? `rise(${built})` : built},
  spawns: [${units.map(({ id, def, team, x, y, facing, ct }) => `\n    ${object({ id, def, team, x, y, facing, ...(ct !== undefined && { ct }) })},`).join('')}${units.length ? '\n  ' : ''}],${battle.bags ? `\n  bags: ${JSON.stringify(battle.bags)},` : ''}${battle.control ? `\n  control: ${object(battle.control)},` : ''}${outcome ? `\n  rules: { outcome: ${outcome} },` : ''}
};
${
  sheets.length
    ? `// each unit's own sheet, by spawn id, on top of its class's (play.ts battleToScenario registers them)
export const ${name}_SHEETS: Record<string, Sheet> = {
${sheets.map(([id, own]) => `  ${str(id)}: ${object(own)},`).join('\n')}
};
`
    : ''
}`;
}
