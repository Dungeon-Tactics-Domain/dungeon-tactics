// Where the 3D title sits (title3d.ts): the structure of FFT: The Ivalice Chronicles' title (labs
// refs/fft-ivalice/50-titulo-menu.png, 1920x1080): the name over the art, a short plain list of commands under it with
// the glove at the left of the one in focus, a small line at the foot. Ours: the name is text (no logo art), the list
// sits on a dark plate so it reads over the turning map, and the language button holds the bottom right corner. A full
// screen, so it is always the centred 16:9 frame. Pure and tested (tests/flow3d.test.ts): no DOM, no Three.
import { type Box, SCREEN, stage } from '../ui3d/layout.ts';

// px on the 1920x1080 reference
export const REF = {
  size: { name: 120, row: 32, note: 22, foot: 20, lang: 22 }, // text
  nameY: 330, // the name's middle
  rule: { x: 460, y: 426, w: 1000, h: 2 }, // the hairline under it
  list: { x: 650, y: 540, w: 620 }, // wide enough for the longest command at 16 px on the smallest page
  row: 58,
  inset: 70, // a command's text starts this far in, after the glove
  pad: 14, // the plate around the list
  hand: 62,
  footY: 1030, // the keys' line, centred
  lang: { x: 1660, y: 986, w: 200, h: 48 },
};

export interface TitleLayout {
  s: number;
  name: { x: number; y: number }; // middle
  rule: Box;
  plate: Box;
  rows: Box[]; // a command each, never under the game's 44 px tap
  inset: number;
  foot: { x: number; y: number }; // middle
  lang: Box;
}

// what an arrow or the d-pad walks (ui3d/walk.ts), in order: the commands, then the language button when there is one
export const stops = (L: TitleLayout, lang: boolean): Box[] => (lang ? [...L.rows, L.lang] : L.rows);

export function titleLayout(w: number, h: number, rows: number): TitleLayout {
  const st = stage(w, h, 'frame'),
    s = st.s;
  const at = (x: number, y: number, bw = 0, bh = 0): Box => ({
    x: st.x + x * s,
    y: st.y + y * s,
    w: bw * s,
    h: bh * s,
  });
  const list = at(REF.list.x, REF.list.y, REF.list.w),
    rowH = Math.max(44, REF.row * s),
    pad = REF.pad * s;
  const lang = at(REF.lang.x, REF.lang.y, REF.lang.w, REF.lang.h),
    lh = Math.max(44, lang.h);
  return {
    s,
    name: at(SCREEN.w / 2, REF.nameY),
    rule: at(REF.rule.x, REF.rule.y, REF.rule.w, REF.rule.h),
    plate: { x: list.x - pad, y: list.y - pad, w: list.w + 2 * pad, h: rows * rowH + 2 * pad },
    rows: Array.from({ length: rows }, (_, i) => ({ x: list.x, y: list.y + i * rowH, w: list.w, h: rowH })),
    inset: REF.inset * s,
    foot: at(SCREEN.w / 2, REF.footY),
    lang: { ...lang, y: lang.y + lang.h - lh, h: lh },
  };
}
