import { describe, expect, it } from 'vitest';
import { fits, itemBox, optionsLayout, REF, shown, thumb } from '../src/client/flow3d/options-layout.ts';
import { optionsView } from '../src/client/flow3d/options-view.ts';
import { REF as TITLE, titleLayout } from '../src/client/flow3d/title-layout.ts';
import { percent, pick } from '../src/client/option-row.ts';

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
