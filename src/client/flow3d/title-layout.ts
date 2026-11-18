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
  end: 1000, // the plate ends over this, clear of the keys' line
  lang: { x: 1660, y: 986, w: 200, h: 48 },
  // fullscreen (Fernando, Nov 18): the quiet shortcut right over the language button, wide enough for "Sair da tela
  // cheia" at its 16 px floor; the main button of a phone in the browser at the top of the right column, beside the
  // list's first row, so the name and the 44 px rows keep their room on a phone on its side
  fs: { x: 1500, w: 360, gap: 12 },
  main: { x: 1330, w: 530, h: 96, min: 56, size: 40 },
};

export interface TitleLayout {
  s: number;
  name: { x: number; y: number; size: number }; // middle, and the text's size in page px
  rule: Box;
  plate: Box;
  rows: Box[]; // a command each, never under the game's 44 px tap
  inset: number;
  foot: { x: number; y: number }; // middle
  lang: Box;
  fs: Box; // the quiet fullscreen shortcut
  main: Box; // the main "Play in fullscreen" (a phone in the browser)
  install: Box; // "Install the game": over the fullscreen shortcut, or in its place where there is none
}

// what an arrow or the d-pad walks (ui3d/walk.ts), in order: the main fullscreen button, the commands, the quiet
// install line, fullscreen shortcut and the language button, each when there is one (title3d.ts walks its buttons in this order)
export const stops = (L: TitleLayout, lang: boolean, fs = false, main = false, install = false): Box[] => [
  ...(main ? [L.main] : []),
  ...L.rows,
  ...(install ? [L.install] : []),
  ...(fs ? [L.fs] : []),
  ...(lang ? [L.lang] : []),
];

// `fs`: the quiet fullscreen shortcut is on the title (the install line then stacks over it)
export function titleLayout(w: number, h: number, rows: number, fs = true): TitleLayout {
  const st = stage(w, h, 'frame'),
    s = st.s;
  const at = (x: number, y: number, bw = 0, bh = 0): Box => ({
    x: st.x + x * s,
    y: st.y + y * s,
    w: bw * s,
    h: bh * s,
  });
  const rowH = Math.max(44, REF.row * s),
    pad = REF.pad * s;
  // A short page (a phone on its side; Fernando, Nov 18: the pieces may shrink with the screen) cannot hold the 44 px
  // rows at the reference's places: the name, its rule and the list close up towards the top by one factor, the name
  // shrinking with them, so the list still ends over the keys' line. 1 on the reference and on every PC page
  const k = Math.min(1, (REF.end * s - pad - rows * rowH) / (REF.list.y * s));
  const list = at(REF.list.x, REF.list.y * k, REF.list.w);
  const lang = at(REF.lang.x, REF.lang.y, REF.lang.w, REF.lang.h),
    lh = Math.max(44, lang.h);
  return {
    s,
    name: { ...at(SCREEN.w / 2, REF.nameY * k), size: REF.size.name * s * k },
    rule: at(REF.rule.x, REF.rule.y * k, REF.rule.w, REF.rule.h),
    plate: { x: list.x - pad, y: list.y - pad, w: list.w + 2 * pad, h: rows * rowH + 2 * pad },
    rows: Array.from({ length: rows }, (_, i) => ({ x: list.x, y: list.y + i * rowH, w: list.w, h: rowH })),
    inset: REF.inset * s,
    foot: at(SCREEN.w / 2, REF.footY),
    lang: { ...lang, y: lang.y + lang.h - lh, h: lh },
    fs: { ...at(REF.fs.x, 0, REF.fs.w), y: lang.y + lang.h - 2 * lh - REF.fs.gap * s, h: lh },
    main: { ...at(REF.main.x, 0, REF.main.w), y: list.y, h: Math.max(REF.main.min, REF.main.h * s) },
    install: {
      ...at(REF.fs.x, 0, REF.fs.w),
      y: lang.y + lang.h - (fs ? 3 : 2) * lh - (fs ? 2 : 1) * REF.fs.gap * s,
      h: lh,
    },
  };
}
