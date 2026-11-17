import { describe, expect, it } from 'vitest';
import { fits, itemBox, optionsLayout, REF, shown, thumb } from '../src/client/flow3d/options-layout.ts';
import { optionsView } from '../src/client/flow3d/options-view.ts';
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
import { REF as TITLE, titleLayout } from '../src/client/flow3d/title-layout.ts';
import { percent, pick } from '../src/client/option-row.ts';
import { neighbour } from '../src/client/ui3d/walk.ts';

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
  const heads = [true, false, false, true, ...Array<boolean>(14).fill(false)];

  it('is the reference at 1920x1080: the list, a 68 px row, the value column at the row’s right end', () => {
    const L = optionsLayout(1920, 1080, heads, 4);
    expect(L.s).toBe(1);
    expect(L.list).toEqual(REF.list);
    expect(L.tops.slice(0, 5)).toEqual([0, 52, 120, 188, 240]);
    expect(L.content).toBe(2 * REF.head + 16 * REF.row);
    expect(itemBox(L, 1, 0)).toEqual({ x: 128, y: 232, w: 908, h: 68 });
    expect(itemBox(L, 1, 100).y).toBe(132);
    expect([L.value, L.arrow, L.number]).toEqual([REF.value, REF.arrow, REF.number]);
    expect(L.help).toEqual({ x: 0, y: 944, w: 1920, h: 84 });
    // the commands under the goal, one over the other, none touching
    expect(L.buttons).toHaveLength(4);
    expect(L.buttons[0].y).toBeGreaterThan(L.goal.y + L.goal.h);
    expect(L.buttons[1].y).toBeGreaterThan(L.buttons[0].y + L.buttons[0].h);
  });

  it('stays a centred 16:9 frame on a wide page, the message band still crossing it whole', () => {
    const L = optionsLayout(2560, 1080, heads, 4);
    expect(L.list.x).toBe(320 + REF.list.x);
    expect(L.title.x).toBe(1280);
    expect(L.help).toMatchObject({ x: 0, w: 2560 });
  });

  it('never goes under a 44 px row or command, and leaves the smaller pages to the HTML window', () => {
    expect(fits(1920, 1080)).toBe(true);
    expect(fits(1152, 648)).toBe(true);
    expect(fits(1180, 820)).toBe(true);
    expect(fits(1024, 768)).toBe(false);
    expect(fits(900, 500)).toBe(false);
    const L = optionsLayout(1152, 648, heads, 4);
    expect(L.rowH).toBe(44);
    for (const b of L.buttons) expect(b.h).toBe(44);
    // every command above the message band
    expect(L.buttons[3].y + L.buttons[3].h).toBeLessThan(L.help.y);
  });

  it('fades a row leaving the list instead of drawing it over the title', () => {
    const L = optionsLayout(1920, 1080, heads, 4);
    expect(shown(L, itemBox(L, 1, 0))).toBe(1);
    expect(shown(L, itemBox(L, 1, 52 + 17))).toBeCloseTo(0.5); // a quarter out: half faded
    expect(shown(L, itemBox(L, 1, 52 + 34))).toBe(0); // half out: gone
    expect(shown(L, itemBox(L, 17, 0))).toBe(0); // below the window
  });

  it('marks the scroll only when the list does not fit, from the top to the bottom of its window', () => {
    expect(thumb(optionsLayout(1920, 1080, [true, false, false], 4), 0)).toBeNull();
    const L = optionsLayout(1920, 1080, heads, 4);
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
