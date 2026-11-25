// The map builder's tools (Nov 25, docs/game-design/map-builder.md): the bar of keys 1 to 9, the brush's footprint,
// one stroke's edits (each tile once per stroke: height and ramp are not idempotent), the colour a tool lights the
// tiles in, and where Play puts its default hero. Pure and tested (tests/mapedit-screen.test.ts).
import { PALETTE, type PaletteEntry } from '../../content/map-palette.ts';
import { canStand, isDeep } from '../../shared/battle/grid.ts';
import { SUB } from '../../shared/battle/half.ts';
import type { Pos } from '../../shared/battle/types.ts';
import { index, inside, type MapDoc } from '../../shared/mapedit/doc.ts';
import { cycleRamp, paint, raise } from '../../shared/mapedit/edit.ts';
import type { TileKind } from '../interaction.ts';

export type Tool = { k: 'paint'; entry: string } | { k: 'height'; delta: 1 | -1 } | { k: 'ramp' };
export type Brush = 1 | 3;

export interface BarSlot {
  id: string;
  name: [string, string];
  tool: (picked: string) => Tool;
}
const painter = (entry: string) => () => ({ k: 'paint', entry }) as Tool;
// keys 1 to 9 (spec: ground, tree, water, wall, height +, height −, ramp, ...): 8 paints the entry picked in the Paint
// panel, 9 the rubble, the low cover the builder exists to test aim on
export const BAR: BarSlot[] = [
  { id: 'ground', name: ['Chão', 'Ground'], tool: painter('grass') },
  { id: 'tree', name: ['Árvore', 'Tree'], tool: painter('tree') },
  { id: 'water', name: ['Água', 'Water'], tool: painter('water_shallow') },
  { id: 'wall', name: ['Muro', 'Wall'], tool: painter('brick') },
  { id: 'up', name: ['Altura +', 'Height +'], tool: () => ({ k: 'height', delta: 1 }) },
  { id: 'down', name: ['Altura −', 'Height −'], tool: () => ({ k: 'height', delta: -1 }) },
  { id: 'ramp', name: ['Rampa', 'Ramp'], tool: () => ({ k: 'ramp' }) },
  { id: 'palette', name: ['Paleta', 'Palette'], tool: (picked) => ({ k: 'paint', entry: picked }) },
  { id: 'rubble', name: ['Entulho', 'Rubble'], tool: painter('rubble') },
];

// the first look on the map no palette entry has (a pasted map's): the scene has no piece to draw it with
export const unknownLook = (doc: MapDoc): string | null =>
  doc.tiles.find((t) => t.look !== undefined && !PALETTE.some((e) => e.look === t.look))?.look ?? null;

export const entryOf = (id: string): PaletteEntry => PALETTE.find((e) => e.id === id) ?? PALETTE[0];
export const sameTool = (a: Tool, b: Tool) => JSON.stringify(a) === JSON.stringify(b);

// the whole tiles a brush covers around `p`, cut at the map's edges
export function footprint(doc: Pick<MapDoc, 'width' | 'height'>, p: Pos, brush: Brush): Pos[] {
  const r = (brush - 1) / 2,
    out: Pos[] = [];
  for (let y = p.y - r; y <= p.y + r; y++)
    for (let x = p.x - r; x <= p.x + r; x++) if (inside(doc, { x, y })) out.push({ x, y });
  return out;
}

// The tool on the tiles of `cells` this stroke has not touched yet (`done`, filled here); the same document when
// nothing changed, so the history records nothing (history.ts)
export function strokeStep(doc: MapDoc, tool: Tool, cells: Pos[], done: Set<string>): MapDoc {
  let d = doc;
  for (const p of cells) {
    const key = `${p.x},${p.y}`;
    if (done.has(key) || !inside(d, p)) continue;
    done.add(key);
    if (tool.k === 'paint') d = paint(d, p, entryOf(tool.entry));
    else if (tool.k === 'height') d = raise(d, p, tool.delta);
    else d = cycleRamp(d, p);
  }
  return d;
}

// the tool's colour on the tiles about to change (spec), one of the battle's marks, each with its own drawing too
export function toolMark(tool: Tool): TileKind {
  if (tool.k === 'height') return tool.delta > 0 ? 'target' : 'range';
  if (tool.k === 'ramp') return 'threat';
  const e = entryOf(tool.entry);
  if (e.depth) return 'move';
  if (e.terrain === 'wall') return 'blocked';
  if (e.terrain === 'forest' || e.terrain === 'rubble') return 'area';
  return 'actor';
}

// a whole tile as the half cells the halved scene draws it with (half.ts halve: x SUB)
export const halfCells = (p: Pos): Pos[] =>
  Array.from({ length: SUB * SUB }, (_, k) => ({ x: p.x * SUB + (k % SUB), y: p.y * SUB + Math.floor(k / SUB) }));
export const wholeOf = (p: Pos): Pos => ({ x: Math.floor(p.x / SUB), y: Math.floor(p.y / SUB) });

const standable = (doc: MapDoc, p: Pos) => {
  const t = doc.tiles[index(doc, p)];
  return canStand(t) && !isDeep(t) && !t.noStop;
};
// Where Play's default hero stands (Fernando, Nov 25: "um heroi default num canto"): the first free corner, else the
// standable tile nearest to a corner; null on a map nobody can stand on (Play says so)
export function heroCorner(doc: MapDoc): Pos | null {
  const w = doc.width - 1,
    h = doc.height - 1;
  const corners = [
    { x: 0, y: h },
    { x: 0, y: 0 },
    { x: w, y: h },
    { x: w, y: 0 },
  ];
  const all = doc.tiles.map((_, i) => ({ x: i % doc.width, y: Math.floor(i / doc.width) }));
  const by = (p: Pos) => Math.min(...corners.map((c) => Math.abs(c.x - p.x) + Math.abs(c.y - p.y)));
  return (
    corners.find((p) => standable(doc, p)) ??
    all.filter((p) => standable(doc, p)).sort((a, b) => by(a) - by(b))[0] ??
    null
  );
}
