import { describe, expect, it } from 'vitest';
import {
  itemBox,
  optionsLayout,
  optionsTab,
  optionsWalk,
  REF,
  type Spot,
  shown,
  thumb,
} from '../src/client/flow3d/options-layout.ts';
import { optionsHints, optionsView } from '../src/client/flow3d/options-view.ts';
import {
  flow,
  rowBox,
  REF as SHEET,
  scrollOf,
  sheetLayout,
  shown as sheetShown,
  thumb as sheetThumb,
  sideBox,
  stops,
} from '../src/client/flow3d/sheet-layout.ts';
import { REF as TITLE, titleLayout, stops as titleStops } from '../src/client/flow3d/title-layout.ts';
import { percent, pick } from '../src/client/option-row.ts';
import type { Box } from '../src/client/ui3d/layout.ts';
import { neighbour, type Way } from '../src/client/ui3d/walk.ts';

// The flow screens in 3D (flow3d/; Nov 17): the pure parts behind the drawing. The drawing itself and the real
// controls under it are checked on the bench (docs/media/ui3d-fluxo-telas)
describe('3D Options: what each row shows', () => {
  it('reads a heading, a choice, a bar, a switch and a link from the board', () => {
    let on = false,
      vol = 35;
    const speed = pick(
      'Speed',
      '',
      [
        ['a', 'Slow'],
        ['b', 'Fast'],
      ],
      () => 'b',
      () => {},
    );
    const music = percent(
      'Music',
      '',
      () => vol,
      (v) => (vol = v),
    );
    const outline = {
      ...pick(
        'Outline',
        '',
        [
          [false, 'Off'],
          [true, 'On'],
        ],
        () => on,
        (v) => (on = v),
      ),
      on: () => on,
    };
    const items = [{ head: 'Game' }, { option: speed }, { option: music }, { option: outline }, { link: 'Controls' }];
    expect(optionsView(items)).toEqual([
      { kind: 'head', label: 'Game', text: '', fill: 0, on: false },
      { kind: 'pick', label: 'Speed', text: 'Fast', fill: 0, on: false },
      { kind: 'bar', label: 'Music', text: '35%', fill: 0.35, on: false },
      { kind: 'toggle', label: 'Outline', text: 'Off', fill: 0, on: false },
      { kind: 'link', label: 'Controls', text: '', fill: 0, on: false },
    ]);
    // the view follows the setting: nothing is kept
    outline.step(1);
    music.step(1);
    const after = optionsView(items);
    expect(after[3]).toMatchObject({ text: 'On', on: true });
    expect(after[2]).toMatchObject({ text: '40%', fill: 0.4 });
  });
});

describe('3D Options: where it sits', () => {
  // four categories, the eleven rows of the longest one (Picture) and the four commands
  const at = (w: number, h: number, rows = 11) => optionsLayout(w, h, 4, rows, 4);

  it('is the reference at 1920x1080: three columns, a 68 px row, the value column at the row’s right end', () => {
    const L = at(1920, 1080);
    expect(L.s).toBe(1);
    // the columns start under the title and end over the strip of commands
    expect(L.list).toEqual({ x: 460, y: 180, w: 860, h: 668 });
    expect(L.side).toEqual({ x: 1360, y: 180, w: 432, h: 668 });
    expect(L.cats).toHaveLength(4);
    expect(L.cats[0]).toEqual({ x: 128, y: 180, w: 292, h: 68 });
    expect(L.cats[3].y).toBe(180 + 3 * 68);
    // left to right, none over the next: categories, rows, description
    expect(L.cats[0].x + L.cats[0].w).toBeLessThan(L.list.x);
    expect(L.list.x + L.list.w).toBeLessThan(L.side.x);
    expect(L.content).toBe(11 * REF.row);
    expect(itemBox(L, 1, 0)).toEqual({ x: 460, y: 248, w: 860, h: 68 });
    expect(itemBox(L, 1, 100).y).toBe(148);
    expect([L.value, L.arrow, L.number]).toEqual([REF.value, REF.arrow, REF.number]);
    expect(L.help).toEqual({ x: 0, y: 944, w: 1920, h: 84 });
  });

  it('keeps the commands in one strip under the three columns, side by side, whatever the category', () => {
    const L = at(1920, 1080);
    expect(L.buttons).toEqual([128, 548, 968, 1388].map((x) => ({ x, y: 872, w: 404, h: 56 })));
    // from the categories' left edge to the description's right one, over the band at the foot
    expect(L.buttons[3].x + L.buttons[3].w).toBe(L.side.x + L.side.w);
    expect(L.buttons[0].y).toBeGreaterThan(L.list.y + L.list.h);
    expect(L.buttons[0].y + L.buttons[0].h).toBeLessThan(L.help.y);
    expect(at(1920, 1080, 2).buttons).toEqual(L.buttons); // Sound's two rows: the strip does not move
  });

  it('stays a centred 16:9 frame on a wide page, the band at the foot still crossing it whole', () => {
    const L = at(2560, 1080);
    expect(L.cats[0].x).toBe(320 + REF.cats.x);
    expect(L.list.x).toBe(320 + REF.list.x);
    expect(L.title.x).toBe(1280);
    expect(L.help).toMatchObject({ x: 0, w: 2560 });
  });

  it('shrinks with the page down to a phone on its side, a row and a command never under a 44 px tap', () => {
    // every page takes the 3D screen (Fernando, Nov 18: the interface is only 3D), a tablet standing included
    for (const [w, h] of [
      [1152, 648],
      [1180, 820],
      [1024, 768],
      [768, 1024],
      [844, 390],
      [667, 375],
    ]) {
      const L = at(w, h),
        name = `${w}x${h}`;
      expect(L.rowH, name).toBe(44);
      for (const b of [...L.buttons, ...L.cats]) expect(b.h, name).toBe(44);
      expect(L.arrow, name).toBeGreaterThanOrEqual(28);
      // top to bottom, none over the next: title, columns, strip, band, the page's end
      expect(L.rule.y, name).toBeLessThan(L.list.y);
      expect(L.cats[3].y + 44, name).toBeLessThanOrEqual(L.list.y + L.list.h);
      expect(L.list.h, name).toBeGreaterThan(4 * L.rowH);
      expect(L.buttons[0].y, name).toBeGreaterThan(L.list.y + L.list.h);
      expect(L.buttons[0].y + 44, name).toBeLessThan(L.help.y);
      expect(L.help.y + L.help.h, name).toBeLessThan(h);
      // and inside the page from side to side
      expect(L.cats[0].x, name).toBeGreaterThan(0);
      expect(L.buttons[3].x + L.buttons[3].w, name).toBeLessThan(w);
      expect(L.value, name).toBeLessThan(L.list.w * 0.6); // room for the row's name
    }
  });

  it('fades a row leaving the list instead of drawing it over the title', () => {
    const L = at(1920, 1080);
    expect(shown(L, itemBox(L, 0, 0))).toBe(1);
    expect(shown(L, itemBox(L, 0, 17))).toBeCloseTo(0.5); // a quarter out: half faded
    expect(shown(L, itemBox(L, 0, 34))).toBe(0); // half out: gone
    expect(shown(L, itemBox(L, 10, 0))).toBe(0); // below the window
  });

  it('marks the scroll only when the category does not fit, from the top to the bottom of its window', () => {
    expect(thumb(at(1920, 1080, 2), 0)).toBeNull();
    const L = at(1920, 1080);
    const top = thumb(L, 0)!,
      end = thumb(L, L.content - L.list.h)!;
    expect(top.y).toBe(L.list.y);
    expect(end.y + end.h).toBeCloseTo(L.list.y + L.list.h);
  });
});

describe('3D title: where it sits', () => {
  it('is the reference at 1920x1080: the name over the list, a row per command, the language at the corner', () => {
    const L = titleLayout(1920, 1080, 6);
    expect(L.name).toMatchObject({ x: 960, y: TITLE.nameY });
    expect(L.rows).toHaveLength(6);
    expect(L.rows[0]).toEqual({ x: TITLE.list.x, y: TITLE.list.y, w: TITLE.list.w, h: TITLE.row });
    expect(L.rows[5].y).toBe(TITLE.list.y + 5 * TITLE.row);
    // the plate holds every row
    expect(L.plate.y + L.plate.h).toBeGreaterThan(L.rows[5].y + L.rows[5].h);
    expect(L.lang).toEqual(TITLE.lang);
  });

  it('keeps 44 px commands on the smallest page, clear of the foot and of the language button', () => {
    const L = titleLayout(1152, 648, 6);
    for (const r of L.rows) expect(r.h).toBe(44);
    expect(L.lang.h).toBe(44);
    const end = L.rows[5].y + L.rows[5].h;
    expect(end).toBeLessThan(L.foot.y - 8);
    expect(L.lang.y + L.lang.h).toBeLessThanOrEqual(648);
    expect(L.lang.x).toBeGreaterThan(L.rows[0].x + L.rows[0].w); // beside the list, never over it
  });

  it('stays where it was on every PC page: nothing closes up while the 44 px rows fit', () => {
    for (const [w, h] of [
      [1920, 1080],
      [1280, 720],
      [1152, 648],
    ]) {
      const L = titleLayout(w, h, 6),
        s = L.s;
      expect(L.rows[0].y, `${w}x${h}`).toBeCloseTo(TITLE.list.y * s);
      expect(L.name.y, `${w}x${h}`).toBeCloseTo(TITLE.nameY * s);
      expect(L.name.size, `${w}x${h}`).toBeCloseTo(TITLE.size.name * s);
    }
  });

  it('fits whole on a phone on its side and on a tablet: every row, the name over its rule, nothing past the page', () => {
    for (const [w, h] of [
      [844, 390],
      [667, 375],
      [1024, 768],
      [1180, 820],
      [768, 1024],
    ])
      for (const n of [5, 6]) {
        const L = titleLayout(w, h, n),
          name = `${w}x${h}, ${n} rows`,
          last = L.rows[n - 1];
        for (const r of L.rows) expect(r.h, name).toBe(44);
        // top to bottom: the name (its top on the page), the rule, the plate, its last row, the keys' line
        expect(L.name.y - L.name.size / 2, name).toBeGreaterThan(0);
        expect(L.name.y + L.name.size / 2, name).toBeLessThan(L.rule.y);
        expect(L.rule.y + L.rule.h, name).toBeLessThan(L.plate.y);
        expect(L.plate.y + L.plate.h, name).toBeLessThan(L.foot.y - 8);
        expect(last.y + last.h, name).toBeLessThan(h);
        expect(L.name.size, name).toBeGreaterThanOrEqual(10);
        expect(L.lang.y + L.lang.h, name).toBeLessThanOrEqual(h);
        expect(L.lang.x, name).toBeGreaterThan(last.x + last.w); // beside the list, never over it
      }
  });
});

// Fernando, Nov 18: fullscreen in reach on the title; the main button for a phone in the browser, a quiet shortcut else
describe('3D title: the fullscreen buttons', () => {
  const overlap = (a: Box, b: Box) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
  it('fit on every page beside the list and over nothing, with a 44 px tap (56 px for the main one)', () => {
    for (const [w, h] of [
      [1920, 1080],
      [1280, 720],
      [1152, 648],
      [844, 390],
      [667, 375],
      [1024, 768],
      [768, 1024],
    ])
      for (const n of [5, 6]) {
        const L = titleLayout(w, h, n),
          name = `${w}x${h}, ${n} rows`;
        expect(L.fs.h, name).toBeGreaterThanOrEqual(44);
        expect(L.main.h, name).toBeGreaterThanOrEqual(56);
        for (const b of [L.fs, L.main]) {
          expect(b.x, name).toBeGreaterThan(L.plate.x + L.plate.w); // beside the list, never over it
          expect(b.x + b.w, name).toBeLessThanOrEqual(w);
          expect(b.y, name).toBeGreaterThanOrEqual(0);
          expect(b.y + b.h, name).toBeLessThanOrEqual(h);
          expect(overlap(b, L.lang), name).toBe(false);
        }
        expect(L.fs.y + L.fs.h, name).toBeLessThan(L.lang.y); // right over the language button
        expect(L.main.y, name).toBe(L.rows[0].y); // level with the first command
        // the quiet shortcut is wide enough for "Sair da tela cheia" at 16 px
        expect(L.fs.w, name).toBeGreaterThanOrEqual(L.lang.w);
      }
  });

  const L = titleLayout(1920, 1080, 5),
    boxes = titleStops(L, true, true, true); // main, 5 commands, shortcut, language
  it('walks in order: the main button first, then the commands, the shortcut and the language', () => {
    expect(boxes).toEqual([L.main, ...L.rows, L.fs, L.lang]);
    expect(titleStops(L, true)).toEqual([...L.rows, L.lang]);
  });
  it('left from the main button goes to the first command and right comes back; up and right stay', () => {
    expect(neighbour(boxes, 0, 'left')).toBe(1);
    expect(neighbour(boxes, 1, 'right')).toBe(0);
    for (const way of ['up', 'right'] as const) expect(neighbour(boxes, 0, way)).toBe(0);
  });
  it('the shortcut sits over the language in the right column: up and down walk it, and stay at the bottom', () => {
    const fs = 6,
      lang = 7;
    expect(neighbour(boxes, fs, 'down')).toBe(lang);
    expect(neighbour(boxes, lang, 'up')).toBe(fs);
    expect(neighbour(boxes, fs, 'up')).toBe(0); // the right column: the main button over it
    expect(neighbour(boxes, lang, 'down')).toBe(lang);
  });
});

// Fernando, Nov 18: the install line stacks over the fullscreen shortcut, or takes its place where there is none
describe('3D title: the install line', () => {
  it('sits over the shortcut (or in its slot) in the right column, a 44 px tap, inside every page', () => {
    for (const [w, h] of [
      [1920, 1080],
      [844, 390],
      [667, 375],
      [1024, 768],
    ])
      for (const fs of [true, false]) {
        const L = titleLayout(w, h, 6, fs),
          name = `${w}x${h}, shortcut ${fs}`;
        expect(L.install.h, name).toBeGreaterThanOrEqual(44);
        expect(L.install.x, name).toBeGreaterThan(L.plate.x + L.plate.w);
        expect(L.install.y, name).toBeGreaterThanOrEqual(0);
        expect(L.install.y + L.install.h, name).toBeLessThan(fs ? L.fs.y : L.lang.y);
      }
    const L = titleLayout(1920, 1080, 5);
    expect(titleStops(L, true, true, false, true)).toEqual([...L.rows, L.install, L.fs, L.lang]);
  });
});

describe('3D sheets: where a window of the title or of Options sits', () => {
  it('is the reference at 1920x1080: the parchment, a row per saved game, Delete at its right end, Back under it', () => {
    const L = sheetLayout(1920, 1080, { tall: true, side: true });
    expect(L.panel).toEqual(SHEET.panel);
    expect(L.rowH).toBe(SHEET.save);
    const row = rowBox(L, 1, 0),
      del = sideBox(L, 1, 0);
    expect(row).toEqual({ x: 374, y: 216 + 96, w: 1172 - SHEET.side, h: 96 });
    // Delete: beside its row, inside the row's height, ending where the list ends
    expect(del.x).toBeGreaterThanOrEqual(row.x + row.w);
    expect(del.x + del.w).toBe(L.box.x + L.box.w);
    expect(del.y).toBeGreaterThan(row.y);
    expect(del.y + del.h).toBeLessThan(row.y + row.h);
    expect(L.foot).toEqual([{ x: 750, y: 930, w: 420, h: 56 }]);
  });

  it('puts the link plate left of Back, the pair centred', () => {
    const [link, back] = sheetLayout(1920, 1080, { link: true }).foot;
    expect(link.x + link.w).toBeLessThan(back.x);
    expect(link.x + (back.x + back.w - link.x) / 2).toBe(960);
  });

  it('never goes under a 44 px row or plate', () => {
    const L = sheetLayout(1152, 648);
    expect(L.rowH).toBe(44);
    expect(L.foot[0].h).toBe(44);
    expect(sideBox(sheetLayout(1152, 648, { side: true }), 0, 0).h).toBeLessThanOrEqual(44);
  });

  it('fades a row leaving the sheet, and follows the window by the share it scrolled', () => {
    const L = sheetLayout(1920, 1080);
    expect(sheetShown(L, 0, 68)).toBe(1);
    expect(sheetShown(L, -34, 68)).toBe(0);
    expect(sheetShown(L, L.box.h - 51, 68)).toBe(0.5);
    expect(scrollOf(L, L.box.h + 300, 0.5)).toBe(150);
    expect(scrollOf(L, L.box.h - 10, 1)).toBe(0);
    expect(sheetThumb(L, L.box.h, 0)).toBeNull();
    const top = sheetThumb(L, L.box.h * 2, 0),
      end = sheetThumb(L, L.box.h * 2, L.box.h);
    expect(top?.y).toBe(L.box.y);
    expect((end?.y ?? 0) + (end?.h ?? 0)).toBe(L.box.y + L.box.h);
  });

  it('lays the text top to bottom: a heading with its rule, a wrapped line, a key beside what it does', () => {
    const L = sheetLayout(1920, 1080);
    const { lines, height } = flow(
      [
        { k: 'head', str: 'Keys' },
        { k: 'text', str: 'one two' },
        { k: 'item', str: 'water', mark: 'water' },
        { k: 'key', key: 'Enter', str: 'confirm' },
      ],
      L,
      (str) => str.split(' '),
    );
    expect(lines.map((l) => l.str)).toEqual(['Keys', 'one', 'two', 'water', 'Enter', 'confirm']);
    expect(lines[0].rule).toBe(true);
    expect(lines[3]).toMatchObject({ mark: 'water', x: SHEET.indent });
    // the key and its text share a line; every other line sits under the one before
    expect(lines[5]).toMatchObject({ top: lines[4].top, x: SHEET.keyW, ink: 'soft' });
    for (const i of [1, 2, 3, 4]) expect(lines[i].top).toBeGreaterThanOrEqual(lines[i - 1].top + lines[i - 1].h);
    expect(height).toBeGreaterThan(lines[5].top + lines[5].h);
  });
});

// Fernando, Nov 17: the keys and the pad follow what is seen. Nov 18: three zones (the categories, the open category's
// rows, the strip of commands) and the two ways of walking together. Left and right on a row with a value never get
// here (they change it)
describe('3D Options: where an arrow takes the cursor', () => {
  // Game open: five rows; the four commands are Restart, Leave, Developer and Back
  const L = optionsLayout(1920, 1080, 4, 5, 4);
  const [restart, leave, dev, back] = [0, 1, 2, 3];
  const cat = (i: number): Spot => ({ zone: 'cat', i }),
    row = (i: number): Spot => ({ zone: 'row', i }),
    cmd = (i: number): Spot => ({ zone: 'cmd', i });
  const walk = (at: Spot, way: Way, open = 0, off: boolean[] = []) => optionsWalk(L, at, way, open, off);

  it('is drawn so: the categories one under the other, the rows beside them, the commands side by side under both', () => {
    for (const c of L.cats) expect(c.x).toBe(L.cats[0].x);
    expect(L.cats.map((c) => c.y)).toEqual([180, 248, 316, 384]);
    expect(L.cats[0].x + L.cats[0].w).toBeLessThan(L.list.x);
    for (const b of L.buttons) expect(b.y).toBe(L.buttons[0].y);
    expect(L.buttons.map((b) => b.x)).toEqual([...L.buttons.map((b) => b.x)].sort((a, b) => a - b));
    expect(L.buttons[0].y).toBeGreaterThan(L.cats[3].y + L.cats[3].h);
  });

  describe('on a category', () => {
    it('down and up: the category under and the one over', () => {
      expect(walk(cat(0), 'down')).toEqual(cat(1));
      expect(walk(cat(2), 'up')).toEqual(cat(1));
    });
    it('right goes into the rows, at the first; with no row it stays', () => {
      expect(walk(cat(0), 'right')).toEqual(row(0));
      expect(walk(cat(3), 'right', 3)).toEqual(row(0)); // from any category: never the row at its own height
      expect(optionsWalk(optionsLayout(1920, 1080, 4, 0, 4), cat(0), 'right', 0)).toEqual(cat(0));
    });
    it('edges: up from the first and left stay; down from the last is the command under the column', () => {
      expect(walk(cat(0), 'up')).toEqual(cat(0));
      for (const i of [0, 3]) expect(walk(cat(i), 'left')).toEqual(cat(i));
      expect(walk(cat(3), 'down')).toEqual(cmd(restart));
    });
  });

  describe('on a row', () => {
    it('down and up: the row under and the one over', () => {
      expect(walk(row(0), 'down')).toEqual(row(1));
      expect(walk(row(3), 'up')).toEqual(row(2));
    });
    it('left goes back to the open category, whatever the row’s height; right stays', () => {
      expect(walk(row(0), 'left', 0)).toEqual(cat(0));
      expect(walk(row(3), 'left', 0)).toEqual(cat(0)); // not the category drawn beside the 4th row
      expect(walk(row(1), 'left', 2)).toEqual(cat(2));
      expect(walk(row(1), 'right')).toEqual(row(1));
    });
    it('edges: up from the first stays; down from the last is the command under the list', () => {
      expect(walk(row(0), 'up')).toEqual(row(0));
      expect(walk(row(4), 'down')).toEqual(cmd(leave));
    });
    it('a category that scrolls: down is the next row even under the window, the strip only after the last', () => {
      const long = optionsLayout(1920, 1080, 4, 11, 4);
      expect(itemBox(long, 10, 0).y).toBeGreaterThan(long.list.y + long.list.h);
      expect(optionsWalk(long, row(8), 'down', 2)).toEqual(row(9));
      expect(optionsWalk(long, row(9), 'down', 2)).toEqual(row(10));
      expect(optionsWalk(long, row(10), 'down', 2)).toEqual(cmd(leave));
      expect(optionsWalk(long, cmd(leave), 'up', 2)).toEqual(row(10));
    });
  });

  describe('on a command', () => {
    it('left and right walk the strip, and stay at its two ends', () => {
      expect(walk(cmd(restart), 'right')).toEqual(cmd(leave));
      expect(walk(cmd(leave), 'right')).toEqual(cmd(dev));
      expect(walk(cmd(back), 'left')).toEqual(cmd(dev));
      expect(walk(cmd(restart), 'left')).toEqual(cmd(restart));
      expect(walk(cmd(back), 'right')).toEqual(cmd(back));
    });
    it('up goes back to the column over it: the open category, or the last row; down stays', () => {
      expect(walk(cmd(restart), 'up', 0)).toEqual(cat(0));
      expect(walk(cmd(restart), 'up', 2)).toEqual(cat(2)); // the open one: what is shown does not change
      for (const i of [leave, dev, back]) expect(walk(cmd(i), 'up')).toEqual(row(4));
      expect(optionsWalk(optionsLayout(1920, 1080, 4, 0, 4), cmd(back), 'up', 1)).toEqual(cat(1));
      for (const i of [restart, back]) expect(walk(cmd(i), 'down')).toEqual(cmd(i));
    });
    it('a command that is off (Restart on the enemy’s turn) is skipped, from above and from the side', () => {
      const off = [true, false, false, false];
      expect(walk(cat(3), 'down', 3, off)).toEqual(cmd(leave));
      expect(walk(cmd(leave), 'left', 0, off)).toEqual(cmd(leave));
      expect(walk(cmd(dev), 'left', 0, off)).toEqual(cmd(leave));
      expect(walk(row(4), 'down', 0, [true, true, false, false])).toEqual(cmd(dev));
      expect(walk(cmd(back), 'left', 0, [false, true, true, false])).toEqual(cmd(restart));
    });
  });

  it('a place that is not there: it stays', () => {
    for (const at of [cat(9), row(-1), row(5), cmd(7)]) expect(walk(at, 'down')).toEqual(at);
  });

  it('Q and E, LB and RB: the category before and the one after, staying at the first and at the last', () => {
    expect(optionsTab(0, 4, 1)).toBe(1);
    expect(optionsTab(2, 4, -1)).toBe(1);
    expect(optionsTab(0, 4, -1)).toBe(0);
    expect(optionsTab(3, 4, 1)).toBe(3);
  });
});

describe('3D Options: the hints on the band at the foot', () => {
  it('names the keys of the table for where the cursor is', () => {
    expect(optionsHints('cat', 'keyboard', true)).toMatch(/^Q E: .+ · {3}Enter: .+ · {3}Esc: /);
    expect(optionsHints('row', 'keyboard', true)).toMatch(/^Q E: .+ · {3}← →: .+ · {3}Esc: /);
    expect(optionsHints('cmd', 'keyboard', true)).toMatch(/^Q E: .+ · {3}Enter: .+ · {3}Esc: /);
  });
  it('shows the pad’s own buttons while its icons show, each family’s shoulders', () => {
    expect(optionsHints('row', 'xbox', true)).toMatch(/^LB RB: .+ · {3}B: /);
    expect(optionsHints('row', 'playstation', true)).toMatch(/^L1 R1: /);
    expect(optionsHints('cat', 'switch', true)).toMatch(/^L R: .+ · {3}B: .+ · {3}A: /);
    for (const shown of ['xbox', 'playstation', 'switch'] as const)
      expect(optionsHints('row', shown, true)).not.toMatch(/Q E|Esc|Enter/);
  });
  it('names no key on a touch screen: the two taps instead', () => {
    for (const zone of ['cat', 'row', 'cmd'] as const)
      expect(optionsHints(zone, 'keyboard', false)).not.toMatch(/Q|Esc|:/);
  });
});

describe('3D title: where an arrow takes the cursor', () => {
  const L = titleLayout(1920, 1080, 5);
  const boxes = titleStops(L, true),
    lang = 5;
  it('down and up walk the commands, and stay at the first and at the last: no way round', () => {
    expect(neighbour(boxes, 0, 'down')).toBe(1);
    expect(neighbour(boxes, 4, 'up')).toBe(3);
    expect(neighbour(boxes, 0, 'up')).toBe(0);
    expect(neighbour(boxes, 4, 'down')).toBe(4); // the language button is off to the right, not below
  });
  it('right goes to the language button at the corner, left comes back to the last command; left of the list is empty', () => {
    expect(neighbour(boxes, 4, 'right')).toBe(lang);
    expect(neighbour(boxes, lang, 'left')).toBe(4);
    for (let i = 0; i < 5; i++) expect(neighbour(boxes, i, 'left')).toBe(i);
  });
  it('the language button stays at its three edges', () => {
    for (const way of ['up', 'down', 'right'] as const) expect(neighbour(boxes, lang, way)).toBe(lang);
  });
  it('without the language button there are only the commands', () => {
    expect(titleStops(L, false)).toEqual(L.rows);
  });
});

// Fernando, Nov 17: the keys and the pad follow what is seen
describe('3D cursor: an arrow goes to the box seen that way', () => {
  // the saved games: three rows with Delete beside each, Back under the list
  const L = sheetLayout(1920, 1080, { tall: true, side: true });
  const boxes = stops(L, [true, true, true]);
  const [row0, del0, row1, del1, row2, del2, back] = [0, 1, 2, 3, 4, 5, 6];

  it('down: the row right under, never the Delete beside', () => {
    expect(neighbour(boxes, row0, 'down')).toBe(row1);
    expect(neighbour(boxes, del0, 'down')).toBe(del1);
    expect(neighbour(boxes, row2, 'down')).toBe(back);
  });
  it('up: the row right over', () => {
    expect(neighbour(boxes, row2, 'up')).toBe(row1);
    expect(neighbour(boxes, del1, 'up')).toBe(del0);
    expect(neighbour(boxes, back, 'up')).toBe(row2);
  });
  it('right: the Delete of the same row', () => {
    expect(neighbour(boxes, row1, 'right')).toBe(del1);
  });
  it('left: back to its row', () => {
    expect(neighbour(boxes, del2, 'left')).toBe(row2);
  });
  it('the last row: down goes to Back from the row and from its Delete, with three saved games or with nine', () => {
    expect(neighbour(boxes, del2, 'down')).toBe(back);
    const nine = stops(L, Array(9).fill(true));
    expect(neighbour(nine, 16, 'down')).toBe(18);
    expect(neighbour(nine, 17, 'down')).toBe(18);
    expect(neighbour(nine, 18, 'up')).toBe(16);
    expect(neighbour(nine, 15, 'down')).toBe(17);
  });
  it('stays where it is at each edge: no wrap, no jump', () => {
    expect(neighbour(boxes, row0, 'up')).toBe(row0);
    expect(neighbour(boxes, del0, 'up')).toBe(del0);
    expect(neighbour(boxes, back, 'down')).toBe(back);
    expect(neighbour(boxes, row1, 'left')).toBe(row1);
    expect(neighbour(boxes, del1, 'right')).toBe(del1);
    expect(neighbour(boxes, back, 'left')).toBe(back);
    expect(neighbour(boxes, back, 'right')).toBe(back);
    expect(neighbour(boxes, -1, 'down')).toBe(-1);
  });
  it('two plates side by side: left and right walk them, up and down do not', () => {
    const foot = sheetLayout(1920, 1080, { link: true }).foot;
    expect(neighbour(foot, 0, 'right')).toBe(1);
    expect(neighbour(foot, 1, 'left')).toBe(0);
    expect(neighbour(foot, 0, 'down')).toBe(0);
    expect(neighbour(foot, 1, 'up')).toBe(1);
  });
});
