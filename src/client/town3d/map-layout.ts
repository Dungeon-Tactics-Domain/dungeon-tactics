// Where the 3D expedition map puts its parts (map3d.ts), in px of the 1920x1080 reference, inside the town windows'
// frame (town-layout.ts: the name and the gold on top, the plaques down the left edge, the help band and the hints at
// the foot). After FFT: The Ivalice Chronicles' world map (labs refs/fft-ivalice/05-mapa): the chart takes the middle
// of the screen as one sheet of parchment, with the text about the picked place beside it. Ours: the descent runs down
// the sheet whole, with no scroll, the party's state sits over the place's box, and the commands are the town's
// plaques. The places stand on a grid (Fernando, Nov 17: down goes to what is straight below, sideways to what is
// beside): the rooms in columns, every row holding the middle one (the spine: the gate over it, the boss on it), and a
// floor's chest at the sheet's edge in the row of the room that leads to it.
// Pure numbers: no DOM, no Three. Tested in tests/map3d.test.ts.
import type { Chart, LinkKind, PlaceState, Spot } from '../expedition-places.ts';
import type { Box } from '../ui3d/layout.ts';
import { T } from './town-layout.ts';

export const M = {
  chart: { x: 410, y: 100, w: 700, h: 830 }, // the sheet with the descent
  pad: 20,
  gutter: 100, // the floors' names, down the sheet's left edge
  cols: [0.22, 0.78], // the rooms' columns, from the first to the last, across the field
  side: 0.08, // a chest's column, at either edge of the field
  step: 84, // a row of the chart at most; a longer descent packs its rows into the sheet
  place: 52, // a room or a chest; the boss is `boss`
  boss: 68,
  party: { x: 1140, y: 100, w: 750, h: 346 }, // the party: two members a row
  info: { x: 1140, y: 466, w: 750, h: 464 }, // the picked place
  head: 56,
  hero: { h: 124, face: 96, gap: 18 },
};

export type PlaceKind = 'room' | 'chest' | 'boss';
export interface MapLayout {
  field: Box; // where the chart's spots land: x across it, a row every `step` down it
  step: number;
  places: { x: number; y: number; size: number; kind: PlaceKind; state: PlaceState }[]; // by node, x and y the middle
  links: { x1: number; y1: number; x2: number; y2: number; kind: LinkKind }[]; // the walked ones last, over the others
  gate: { x: number; y: number };
  flag: { x: number; y: number }; // the top of the flag's pole: up and to the right of where the party stands
  floors: { floor: number; box: Box }[]; // each floor's band across the sheet
  heroes: Box[];
  commands: Box[];
}

const ORDER: LinkKind[] = ['off', 'ahead', 'open', 'walked'];

const key = (s: Spot) => s.join();

export function mapLayout(c: Chart, kinds: PlaceKind[], heroes: number, commands: number): MapLayout {
  const { chart: S, pad, party: P, hero: H } = M;
  // the chart's rows that hold rooms, each left to right; a chest's own row is dropped (it joins its room's row)
  const rooms = new Map<number, number[]>();
  c.places.forEach((p, i) => {
    if (kinds[i] !== 'chest') rooms.set(p.at[1], [...(rooms.get(p.at[1]) ?? []), i]);
  });
  for (const r of rooms.values()) r.sort((a, b) => c.places[a].at[0] - c.places[b].at[0]);
  const used = [c.gate[1], ...[...rooms.keys()].sort((a, b) => a - b)];
  const cols = Math.max(...[...rooms.values()].map((r) => r.length));
  const spine = Math.floor((cols - 1) / 2);
  const colX = (k: number) => (cols === 1 ? 0.5 : M.cols[0] + ((M.cols[1] - M.cols[0]) * k) / (cols - 1));
  // ponytail: no scroll, the rows shrink to fit; past about 13 rows the places touch and the sheet needs one
  const step = Math.min(M.step, (S.h - 2 * pad) / used.length);
  const field: Box = { x: S.x + M.gutter, y: S.y + pad, w: S.w - M.gutter - pad, h: step * used.length };
  const point = (x: number, row: number) => ({
    x: field.x + x * field.w,
    y: field.y + (used.indexOf(row) + 0.5) * step,
  });
  const spots = new Map([[key(c.gate), point(colX(spine), c.gate[1])]]);
  for (const [row, r] of rooms) {
    // the row's rooms side by side, on the columns around the spine
    const first = Math.min(Math.max(spine - Math.floor((r.length - 1) / 2), 0), cols - r.length);
    r.forEach((i, k) => spots.set(key(c.places[i].at), point(colX(first + k), row)));
  }
  c.places.forEach((p, i) => {
    if (kinds[i] !== 'chest') return;
    // beside the row of the room that leads to it, on the side with fewer rooms in the way
    const lead = c.links.find((l) => key(l.to) === key(p.at))?.from ?? p.at;
    const r = rooms.get(lead[1]) ?? [];
    const k = r.findIndex((j) => key(c.places[j].at) === key(lead));
    spots.set(key(p.at), point(k <= r.length - 1 - k ? M.side : 1 - M.side, rooms.has(lead[1]) ? lead[1] : used[1]));
  });
  const at = (s: Spot) => spots.get(key(s)) ?? point(colX(spine), c.gate[1]);
  const cellW = (P.w - 2 * pad - H.gap) / 2;
  const plaque = T.plaque;
  return {
    field,
    step,
    places: c.places.map((p, i) => ({
      ...at(p.at),
      size: kinds[i] === 'boss' ? M.boss : M.place,
      kind: kinds[i],
      state: p.state,
    })),
    links: [...c.links]
      .sort((a, b) => ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind))
      .map((l) => {
        const a = at(l.from),
          b = at(l.to);
        return { x1: a.x, y1: a.y, x2: b.x, y2: b.y, kind: l.kind };
      }),
    gate: at(c.gate),
    flag:
      key(c.party) === key(c.gate)
        ? { x: at(c.gate).x + 76, y: at(c.gate).y - 22 }
        : { x: at(c.party).x + 20, y: at(c.party).y - 56 },
    floors: c.floors.map((f) => {
      const rows = used.flatMap((r, k) => (r >= f.from && r <= f.to ? [k] : []));
      return {
        floor: f.floor,
        box: { x: S.x + 6, y: field.y + (rows[0] ?? 0) * step, w: S.w - 12, h: rows.length * step },
      };
    }),
    heroes: Array.from({ length: heroes }, (_, i) => ({
      x: P.x + pad + (i % 2) * (cellW + H.gap),
      y: P.y + M.head + 14 + Math.floor(i / 2) * (H.h + 10),
      w: cellW,
      h: H.h,
    })),
    commands: Array.from({ length: commands }, (_, i) => ({
      x: plaque.x,
      y: plaque.y + i * (plaque.h + plaque.gap),
      w: plaque.w,
      h: plaque.h,
    })),
  };
}

// What a command's plaque and the help band say. An armed 2nd tap rewrites the button as "Confirm: what it does"
// (dialog.ts secondTap): the plaque keeps the word before the colon and the band says the whole sentence. A command
// that is off says why; any other leaves the band to the picked place ('')
export function commandText(label: string, note: string, armed: boolean): { plaque: string; help: string } {
  if (armed) return { plaque: label.split(':')[0], help: label };
  return { plaque: label, help: note ? `${label}: ${note}` : '' };
}
