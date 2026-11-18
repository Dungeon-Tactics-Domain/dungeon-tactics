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
  // a hero's row, which the reference does not have (ours: the HTML board's row, end-screens.ts heroCard): the face,
  // then name, class and life, and at the right end what the hero did in two number columns under their names
  face: 38,
  who: 48, // the name starts this far in, after the face
  did: 22, // the columns' names, on the row above the first hero
  dmg: 150, // the damage column's right end, from the row's right end
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
  heroes: Box[]; // a row each, under the columns' names
  faces: Box[]; // each row's face, square
  who: number; // where a row's name starts, from its left
  did: { y: number; dmg: number; kills: number }; // the columns' names: their middle and each column's right end
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
  const rows = Math.max(heroes && heroes + 1, spoils, 1); // the heroes' rows start under their columns' names
  const top = at(r.x, r.y);
  const h = Math.max(r.h, REF.rowY + (rows - 1) * REF.rowH + REF.rowH) * s;
  const left = at(r.x, r.y + REF.plateY, REF.left, REF.plate);
  const right = at(r.x + REF.left + REF.gap, r.y + REF.plateY, r.w - REF.left - REF.gap, REF.plate);
  const inner = REF.left - 2 * REF.inset;
  const column = (n: number, x: number, w: number, from = 0): Box[] =>
    Array.from({ length: n }, (_, i) =>
      at(r.x + REF.inset + x, r.y + REF.rowY + (i + from - 0.5) * REF.rowH, w, REF.rowH),
    );
  const heroW = spoils ? REF.heroes : inner;
  const rowsOf = column(heroes, 0, heroW, 1);
  const end = at(r.x + REF.inset + heroW, r.y + REF.rowY);
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
    heroes: rowsOf,
    faces: rowsOf.map((b) => ({ x: b.x, y: b.y + b.h / 2 - (REF.face * s) / 2, w: REF.face * s, h: REF.face * s })),
    who: REF.who * s,
    did: { y: end.y, dmg: end.x - REF.dmg * s, kills: end.x },
    spoils: column(spoils, REF.heroes + 2 * REF.inset, inner - REF.heroes - 2 * REF.inset),
    mvp: {
      x: mid,
      name: top.y + REF.mvpY * s,
      line: top.y + REF.mvpLineY * s,
      rule: { x: right.x + 18 * s, y: top.y + REF.mvpRuleY * s, w: right.w - 36 * s, h: 2 * s },
    },
    buttons: Array.from({ length: actions }, (_, i) => ({
      x: hints.x + hints.w - (actions - i) * bw - (actions - 1 - i) * gap,
      // on a short page the 44 px tap is taller than the hints row: kept on the page, 4 px over its bottom edge
      y: Math.min(hints.y + hints.h / 2 - bh / 2, st.y + st.h - bh - 4),
      w: bw,
      h: bh,
    })),
  };
}
