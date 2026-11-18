import { describe, expect, it } from 'vitest';
import { PAD_KEY, type PadSide, parsePadSide, stickVector } from '../src/client/town-pad.ts';
import { box, padLayout, STICK_MIN, TRAVEL, USE_MIN } from '../src/client/town3d/pad-layout.ts';
import { townHud } from '../src/client/town3d/town-layout.ts';
import { type Box, stage } from '../src/client/ui3d/layout.ts';
import { toolsLayout } from '../src/client/window3d/tools-layout.ts';

// The town's touch pad (Fernando, Nov 18, on his phone): a joystick and the action button in the bottom corners, the
// sides swapped by Options. Pure layout; the drag itself was driven on a touch-emulated Chrome (see the report)
const overlap = (a: Box, b: Box) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
// [name, w, h, the notch's width on each side, the home bar's height]
const PAGES: [string, number, number, number, number][] = [
  ['a phone on its side (844x390)', 844, 390, 0, 0],
  ['the same phone with its notch and home bar', 844, 390, 47, 21],
  ['a small phone (667x375)', 667, 375, 0, 0],
  ['a tablet (1024x768)', 1024, 768, 0, 0],
  ['an upright tablet (768x1024)', 768, 1024, 0, 0],
];
const page = (w: number, h: number, notch: number, home: number, side: PadSide) => {
  const st = stage(w, h, 'edges', { x: notch, y: 0 }),
    inset = { top: 12, right: 12 + notch, bottom: 12 + home, left: 12 + notch };
  return { st, inset, lay: padLayout({ w, h, s: st.s, inset, side }) };
};

describe('town touch pad: where it sits', () => {
  for (const [name, w, h, notch, home] of PAGES)
    for (const side of ['left', 'right'] as const)
      describe(`${name}, joystick ${side}`, () => {
        const { st, inset, lay } = page(w, h, notch, home, side);
        const circles = [lay.stick, lay.use];

        it('has targets of at least 44 px, the joystick and the button at their own minimum', () => {
          expect(lay.stick.r * 2).toBeGreaterThanOrEqual(STICK_MIN);
          expect(lay.use.r * 2).toBeGreaterThanOrEqual(USE_MIN);
          expect(Math.min(lay.zone.w, lay.useBox.w)).toBeGreaterThanOrEqual(44);
        });
        it('stays inside the margins and the notch, on the bottom', () => {
          for (const c of circles) {
            const b = box(c);
            expect(b.x).toBeGreaterThanOrEqual(inset.left);
            expect(b.x + b.w).toBeLessThanOrEqual(w - inset.right);
            expect(b.y + b.h).toBeLessThanOrEqual(h - inset.bottom);
            expect(c.cy).toBeGreaterThan(h / 2);
          }
          expect(lay.zone.x).toBeGreaterThanOrEqual(0);
          expect(lay.zone.y).toBeGreaterThanOrEqual(0);
          expect(lay.zone.x + lay.zone.w).toBeLessThanOrEqual(w);
          expect(lay.zone.y + lay.zone.h).toBeLessThanOrEqual(h);
        });
        it('puts the joystick on its side and the button on the other, each on its own edge', () => {
          const left = side === 'left' ? lay.stick : lay.use,
            right = side === 'left' ? lay.use : lay.stick;
          expect(left.cx).toBeLessThan(w / 2);
          expect(right.cx).toBeGreaterThan(w / 2);
          expect(left.cx - left.r).toBe(inset.left + 8);
          expect(right.cx + right.r).toBe(w - inset.right - 8);
          expect(overlap(box(lay.stick), box(lay.use))).toBe(false);
        });
        it('keeps off the town name, the gear and the camera pair at the top', () => {
          const tools = toolsLayout({
              pageW: w,
              stage: st,
              inset: { top: 12, right: inset.right },
              row: [0],
              pair: 'row',
            }),
            name = townHud(w, inset, false).name;
          const plate: Box = { x: name.x, y: name.y, w: 420, h: name.h };
          for (const c of circles)
            for (const top of [plate, ...tools.row, ...tools.pair]) {
              expect(overlap(box(c), top)).toBe(false);
              expect(overlap(lay.zone, top)).toBe(false);
            }
        });
        it('has the knob reach 60% of the base radius', () => {
          expect(lay.travel).toBeCloseTo(lay.stick.r * TRAVEL, 6);
        });
      });

  it('inverting swaps the sides: the circles trade places for the same page', () => {
    const a = page(844, 390, 0, 0, 'left').lay,
      b = page(844, 390, 0, 0, 'right').lay;
    expect(a.stick.cx).toBeLessThan(844 / 2);
    expect(b.stick.cx).toBeGreaterThan(844 / 2);
    expect(a.use.cx).toBeGreaterThan(844 / 2);
    expect(b.use.cx).toBeLessThan(844 / 2);
    // the stick keeps its size on both sides, as the button does
    expect(b.stick.r).toBe(a.stick.r);
    expect(b.use.r).toBe(a.use.r);
    expect(a.stick.cx + b.stick.cx).toBeCloseTo(844, 6);
  });
});

describe('town touch pad: the stick and the saved side', () => {
  it('gives the finger as a vector: nothing at the middle, proportional inside, held at 1 beyond', () => {
    expect(stickVector(0, 0, 30)).toEqual({ x: 0, y: 0 });
    expect(stickVector(15, 0, 30)).toEqual({ x: 0.5, y: 0 });
    const far = stickVector(300, 400, 30);
    expect(Math.hypot(far.x, far.y)).toBeCloseTo(1, 9);
    expect(far.y / far.x).toBeCloseTo(4 / 3, 9);
    expect(stickVector(0, -30, 30)).toEqual({ x: 0, y: -1 }); // up is up on the screen
    expect(stickVector(5, 5, 0)).toEqual({ x: 0, y: 0 }); // a stick not laid out yet gives nothing
  });
  it('reads the saved side: left by default, right only when saved so', () => {
    expect(PAD_KEY).toBe('dt:town-pad');
    expect(parsePadSide(null)).toBe('left');
    expect(parsePadSide('junk')).toBe('left');
    expect(parsePadSide('right')).toBe('right');
  });
});
