// The interface's pieces by name: what each screen of the 3D layer registers as (ui3d/layer.ts `add`) and which ones are
// hidden for now (the sandbox's `hide`, docs/sandbox.md): a hidden piece is not drawn and takes no input. No DOM and no
// Three.js here: the sandbox's parser and the Node CLI read the names too.
export const PIECE_NAMES = [
  'menu', // the command menu, its submenu and the ability sheet
  'turn', // the turn list
  'bar', // the combat bar: the acting sheet, the strike preview and the target's sheet
  'banner', // the instruction banner
  'height', // the tile height
  'hints', // the button hints
  'confirm', // "Execute?"
  'result', // the end of battle
  'tools', // the corner menu
  'status', // the Status window
  'options',
  'title',
  'sheets', // the windows the title and Options open
  'town', // the town's windows
  'townhud',
  'townpad', // the town's joystick and action button, on a touch device
  'talk', // the speech box of the town and the battle
  'map', // the expedition map
  'dev', // the developer menu
  'note', // a notice window
  'effects', // numbers, cursor note, objective banner, confetti, F3
  'loading', // the loading cover
  'guides', // the labs' drawing guides (?guides=1)
  'rotate', // the turn-the-phone notice, on every layer
] as const;
export type PieceName = (typeof PIECE_NAMES)[number];

const hidden = new Set<PieceName>();
const heard = new Set<() => void>();

export const pieceHidden = (name: PieceName) => hidden.has(name);
// the whole list each time: a piece left out shows again. The same list again tells nobody (the sandbox applies its
// spec on every turn of a loop, and a told screen draws itself again)
export function hidePieces(names: Iterable<PieceName>) {
  const next = new Set(names);
  if (next.size === hidden.size && [...next].every((n) => hidden.has(n))) return;
  hidden.clear();
  for (const n of next) hidden.add(n);
  for (const tell of heard) tell();
}
// the layer hears a change; the call it returns stops it
export const onHidden = (tell: () => void) => {
  heard.add(tell);
  return () => void heard.delete(tell);
};
