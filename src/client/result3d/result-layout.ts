// Where the 3D battle result sits (result3d.ts): on the places measured on FFT: The Ivalice Chronicles' victory screen
// (labs refs/fft-ivalice/73-vitoria-espolios.webp, read at 1920x1077, +-4 px), around the `result` region of
// ui3d/layout.ts, in either layout. One layout for what is drawn and for the buttons over it. Pure and tested
// (tests/result3d.test.ts): no DOM, no Three.
import { type Box, place, REGIONS, type Stage } from '../ui3d/layout.ts';

export type { Box };

// px on the 1920x1080 reference
export const REF = {
  title: 76, // text sizes
  note: 40,
  head: 26,
  row: 26,
  name: 40,
  button: 28,
  titleY: 218, // the title's middle
  rule: { x: 320, y: 271, w: 1280, h: 2 }, // the hairline under the title
  noteY: 296, // the note's top; it wraps at the rule's width
  noteLine: 50,
  plate: 36, // height of a plate; both start 40 px under the band's top
  plateY: 40,
  left: 974, // width of the left plate; the right one takes the rest after the gap
  gap: 68,
  rowY: 116, // the first row's middle, from the band's top
  rowH: 44,
  inset: 27, // rows start this far inside their plate
  heroes: 560, // width of the heroes' column when the spoils sit beside it
  mvpY: 170, // the highlight's name and line, from the band's top
  mvpLineY: 222,
  mvpRuleY: 298,
  buttonW: 280,
  buttonH: 48,
  buttonGap: 70, // room for the glove between two buttons
  hand: 62, // the pointing glove
};

export interface ResultLayout {
  s: number;
  band: Box; // the dark band, as wide as the page
  title: { x: number; y: number }; // middles
  rule: Box;
  note: { x: number; y: number; w: number }; // top centre and the width it wraps at
  left: Box; // the plates
  right: Box;
  heroes: Box[]; // a row each
  spoils: Box[];
  mvp: { x: number; name: number; line: number; rule: Box }; // middle x, the two texts' middle y and the line under them
  buttons: Box[]; // in the order given, the last at the right edge
}

// `st`: where the interface is laid out and its scale (ui3d/layout.ts `stage`); `page`: the page's width, which the band
// crosses whole. The band grows downwards past five rows. The buttons hold on to the bottom right corner, where the
// reference has its "Next" (the `hints` region), and never go under the game's 44 px touch size
export function resultLayout(st: Stage, page: number, heroes: number, spoils: number, actions: number): ResultLayout {
  const s = st.s;
  const r = REGIONS.result;
  const at = (x: number, y: number, w = 0, h = 0) => place({ at: r.at, x, y, w, h }, st);
  const rows = Math.max(heroes, spoils, 1);
  const top = at(r.x, r.y);
  const h = Math.max(r.h, REF.rowY + (rows - 1) * REF.rowH + REF.rowH) * s;
  const left = at(r.x, r.y + REF.plateY, REF.left, REF.plate);
  const right = at(r.x + REF.left + REF.gap, r.y + REF.plateY, r.w - REF.left - REF.gap, REF.plate);
  const inner = REF.left - 2 * REF.inset;
  const column = (n: number, x: number, w: number): Box[] =>
    Array.from({ length: n }, (_, i) => at(r.x + REF.inset + x, r.y + REF.rowY + (i - 0.5) * REF.rowH, w, REF.rowH));
  const heroW = spoils ? REF.heroes : inner;
  const hints = place(REGIONS.hints, st);
  const bw = Math.max(160, REF.buttonW * s),
    bh = Math.max(44, REF.buttonH * s),
    gap = REF.buttonGap * s;
  const mid = right.x + right.w / 2;
  return {
    s,
    band: { x: 0, y: top.y, w: page, h },
    title: { x: at(960, 0).x, y: at(0, REF.titleY).y },
    rule: at(REF.rule.x, REF.rule.y, REF.rule.w, REF.rule.h),
    note: { x: at(960, 0).x, y: at(0, REF.noteY).y, w: REF.rule.w * s },
    left,
    right,
    heroes: column(heroes, 0, heroW),
    spoils: column(spoils, REF.heroes + 2 * REF.inset, inner - REF.heroes - 2 * REF.inset),
    mvp: {
      x: mid,
      name: top.y + REF.mvpY * s,
      line: top.y + REF.mvpLineY * s,
      rule: { x: right.x + 18 * s, y: top.y + REF.mvpRuleY * s, w: right.w - 36 * s, h: 2 * s },
    },
    buttons: Array.from({ length: actions }, (_, i) => ({
      x: hints.x + hints.w - (actions - i) * bw - (actions - 1 - i) * gap,
      y: hints.y + hints.h / 2 - bh / 2,
      w: bw,
      h: bh,
    })),
  };
}
