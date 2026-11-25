// The map builder's tile pictures (Fernando, Nov 25: "uma imagem pra melhorar a indicação visual do que é cada coisa"):
// which picture each palette entry and bar tool shows, and the tiny map each picture is rendered from on the battle's
// own pieces (scene/tile-shot.ts), so a picture looks like what the tool paints. Pure and tested.
import { PALETTE } from '../../content/map-palette.ts';
import type { Grid } from '../../shared/battle/grid.ts';
import { split } from '../../shared/battle/half.ts';
import { type MapDoc, plainTile } from '../../shared/mapedit/doc.ts';
import { cycleRamp, paint, setHeight } from '../../shared/mapedit/edit.ts';
import { BAR, entryOf } from './tools.ts';

// pictures that are not a palette entry: the height and ramp tools show the ground they make
export const TOOL_PICS = ['up', 'down', 'ramp'] as const;
export const PIC_KEYS = [...PALETTE.map((e) => e.id), ...TOOL_PICS];
// their sign on the picture: at 40 px a raised, a sunk and a sloped tile of smooth ground look much alike
export const PIC_SIGN: Record<string, string> = { up: '+', down: '−', ramp: '↗' };

// every palette entry on one row, each with a ramp (stairs looks load their stairs): the pieces the builder's scene
// loads up front, so painting anything redraws at once
export const paletteGrid = (): Grid => ({
  width: PALETTE.length,
  height: 1,
  tiles: PALETTE.map((e) => ({ ...paint(sized(1, 1), { x: 0, y: 0 }, e).tiles[0], ramp: [0, 1] })),
});

// The picture of a panel cell (pal:<entry>, bar:<i>); the Palette tool shows the entry picked; null for the rest
export function picOf(id: string, picked: string): string | null {
  const [kind, key] = id.split(':');
  if (kind === 'pal') return entryOf(key).id;
  if (kind !== 'bar') return null;
  const tool = BAR[Number(key)]?.tool(picked);
  if (!tool) return null;
  if (tool.k === 'paint') return entryOf(tool.entry).id;
  if (tool.k === 'ramp') return 'ramp';
  return tool.delta > 0 ? 'up' : 'down';
}

const sized = (width: number, height: number, h = 0): MapDoc => ({
  id: 'pic',
  name: '',
  en: '',
  width,
  height,
  tiles: Array.from({ length: width * height }, () => plainTile(h)),
});

// The map a picture is rendered from, halved as the battle draws it: an entry's tile one level up (its side shows);
// Height + a tile raised among lower grass, Height − one sunk among higher grass; Ramp a ramp climbing to a tile
export function picGrid(key: string): Grid {
  const centre = { x: 1, y: 1 };
  let d: MapDoc;
  if (key === 'up') d = setHeight(sized(3, 3), centre, 3);
  else if (key === 'down') d = setHeight(sized(3, 3, 3), centre, 0);
  else if (key === 'ramp') d = cycleRamp(setHeight(sized(2, 1), { x: 1, y: 0 }, 1), { x: 0, y: 0 });
  else d = paint(sized(1, 1, 1), { x: 0, y: 0 }, entryOf(key));
  return split({ width: d.width, height: d.height, tiles: d.tiles.map((t) => ({ ...t })) });
}
