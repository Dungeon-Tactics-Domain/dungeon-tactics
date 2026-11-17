// Which look each piece of the battle interface takes (localhost only; hud-skin.ts loads what this says). One place
// reads every flag, from the address and from a sandbox spec:
//   ?menu=html|css|3d, ?turn=html|3d, ?bar=, ?banner=, ?height=, ?hints=, ?confirm=, ?result=html|3d   one piece each
//   ?ui=html|css|3d                    a preset: every piece that has that look takes it
//   ?menu3d, ?menu3d=pixel, ?menucss, ?turn3d   the older flags, kept as shortcuts
//   ?pixel=1                           the 3D pieces through the pixel filter (as ?menu3d=pixel)
// A piece's own flag beats a shortcut, a shortcut beats the preset, and the address beats the spec, piece by piece. A
// value a piece does not have is skipped. Without a flag every piece that has a 3D look takes it (Fernando, Nov 17: the 3D
// interface is the default); ?ui=html brings back the HTML one of always, ?ui=css the parchment menu.
// PIECES is also what the labs page builds its selector from (scripts/sandbox/bench/ui-pecas.json, kept equal by
// tests/layout.test.ts). Pure and tested.

export const VARIANTS = ['html', 'css', '3d'] as const;
export type Variant = (typeof VARIANTS)[number];

// every piece and the looks it has today; the ones with only `html` are reserved for the pieces to come
export const PIECES = {
  menu: ['html', 'css', '3d'], // the command menu, its submenu and the ability sheet
  turn: ['html', '3d'], // the turn list
  bar: ['html', '3d'], // the combat bar at the bottom: the acting sheet, the strike preview and the target's sheet
  sheet: ['html'], // the acting unit's sheet
  height: ['html', '3d'], // the tile height
  banner: ['html', '3d'], // the instruction banner
  hints: ['html', '3d'], // the button hints
  preview: ['html'], // the strike preview
  confirm: ['html', '3d'], // "Execute?": the strike's confirmation beside the character
  result: ['html', '3d'], // the end of battle: victory, defeat, a cleared room
} as const satisfies Record<string, readonly Variant[]>;
export type Piece = keyof typeof PIECES;

// the older flags, in the order they win: ?menu3d over ?menucss
const SHORTCUTS: [flag: string, piece: Piece, look: Variant][] = [
  ['menu3d', 'menu', '3d'],
  ['menucss', 'menu', 'css'],
  ['turn3d', 'turn', '3d'],
];

// a flag by name: null or undefined when absent, '' when present with no value
export type Flags = (name: string) => string | null | undefined;
export type Skin = Record<Piece, Variant> & { pixel: boolean };

const has = (piece: Piece, look: string | null | undefined): look is Variant =>
  (PIECES[piece] as readonly string[]).includes(look ?? '');

function look(piece: Piece, f: Flags): Variant | undefined {
  const own = f(piece);
  if (has(piece, own)) return own;
  const short = SHORTCUTS.find(([flag, p]) => p === piece && f(flag) != null);
  if (short) return short[2];
  const preset = f('ui');
  return has(piece, preset) ? preset : undefined;
}
function pixel(f: Flags): boolean | undefined {
  const own = f('pixel');
  if (own != null) return own !== '0' && own !== 'false';
  return f('menu3d') === 'pixel' ? true : undefined;
}

// `sources`: the strongest first (the address, then the spec)
export function skinFlags(...sources: Flags[]): Skin {
  const first = <T>(read: (f: Flags) => T | undefined) => sources.map(read).find((v) => v !== undefined);
  const skin = { pixel: first(pixel) ?? false } as Skin;
  for (const piece of Object.keys(PIECES) as Piece[])
    skin[piece] = first((f) => look(piece, f)) ?? (has(piece, '3d') ? '3d' : 'html');
  return skin;
}

// A sandbox spec's keys as flags: `true` is a flag with no value, and the spec's `pixel` is the scene's pixel art, so
// the filter is `uiPixel` there
export const specFlags =
  (spec: Record<string, unknown>): Flags =>
  (name) => {
    const v = spec[name === 'pixel' ? 'uiPixel' : name];
    return v === true ? '' : v === false ? '0' : typeof v === 'string' ? v : undefined;
  };
