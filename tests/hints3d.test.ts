import { describe, expect, it } from 'vitest';
import { canUndoMove, commandIndex, type Screen } from '../src/client/command.ts';
import { parseSpec } from '../src/client/dev/sandbox-spec.ts';
import { deviceOf, heightShown, hintsFor, layRow, padBusy, ROW, tileLine } from '../src/client/hints3d/hints-view.ts';
import { cursorInfo, tileHeight } from '../src/client/tile-info.ts';
import { skinFlags, specFlags } from '../src/client/ui3d/skin-flags.ts';
import { Battle } from '../src/shared/battle/battle.ts';
import { flat, stateOf } from './battle-helpers.ts';

// The 3D banner, Height and button hints (hints3d/; Nov 16): the pure part. The tests run in Portuguese
const battle = () =>
  new Battle(
    flat(6, 6),
    stateOf([
      { id: 'a', def: 'warrior', team: 'hero', x: 1, y: 1 },
      { id: 'b', def: 'soldier', team: 'enemy', x: 2, y: 1 },
      { id: 'beacon', def: 'beacon', team: 'hero', x: 5, y: 5 },
    ]),
  );
const menu: Screen = { k: 'menu', index: commandIndex('move') };
const row = (b: Battle, s: Screen, open = true, device: 'keyboard' | 'gamepad' | 'touch' = 'keyboard') =>
  hintsFor(b, s, open, device).right.map((h) => `${h.button}=${h.text}`);

describe('button hints: what each screen shows', () => {
  it('the menu offers Select and the camera; Cancel only once there is a move to undo', () => {
    const b = battle();
    expect(row(b, menu)).toEqual(['Enter=Escolher', 'Q E R=Câmera']);
    b.move({ x: 2, y: 2 });
    expect(canUndoMove(b)).toBe(true);
    expect(row(b, menu)).toEqual(['Enter=Escolher', 'Esc=Desfazer', 'Q E R=Câmera']);
  });

  it('each step names its Confirm, and Cancel wherever Cancel goes back a step', () => {
    const b = battle();
    expect(row(b, { k: 'abilities', index: 0 })).toEqual(['Enter=Escolher', 'Esc=Cancelar', 'I=Detalhes']);
    expect(row(b, { k: 'map', command: 'move' }).slice(0, 2)).toEqual(['Enter=Mover', 'Esc=Cancelar']);
    expect(row(b, { k: 'map', command: 'act' }).slice(0, 2)).toEqual(['Enter=Confirmar', 'Esc=Cancelar']);
    expect(row(b, { k: 'confirm', ability: 'strike', target: { x: 0, y: 0 } }).slice(0, 2)).toEqual([
      'Enter=Confirmar',
      'Esc=Voltar',
    ]);
    expect(row(b, { k: 'facing' }).slice(0, 2)).toEqual(['Enter=Passar a vez', 'Esc=Cancelar']);
  });

  it('the buttons follow the device in use, and a finger gets none', () => {
    const b = battle();
    expect(row(b, { k: 'map', command: 'move' }, true, 'gamepad')).toEqual([
      'A=Mover',
      'B=Cancelar',
      'LT RT LB RB=Câmera',
    ]);
    expect(hintsFor(b, menu, true, 'gamepad').left).toEqual([{ button: 'Start', text: 'Menu e ajuda' }]);
    expect(hintsFor(b, menu, true, 'keyboard').left).toEqual([{ button: 'H', text: 'Menu e ajuda' }]);
    expect(hintsFor(b, menu, true, 'touch')).toEqual({ left: [], right: [] });
  });

  it('while the battle plays, Confirm is held to speed it up', () => {
    expect(row(battle(), menu, false)).toEqual(['Enter=Segure: acelerar', 'Q E R=Câmera']);
  });

  // Fernando, Nov 16: the right row stays inside its region (660 x 28 on the reference) at 1920x1080 and 1280x720. Widths
  // measured in Chrome with the theme's serif: the widest rows below (Passar a vez, and the pad's four camera buttons)
  // came to 595 px at 1920 and 439 px of 440 at 1280. A longer word has to be measured again before this budget grows
  it('every right row keeps to three hints and 26 letters of text, on every screen and device', () => {
    const screens: Screen[] = [
      menu,
      { k: 'abilities', index: 0 },
      { k: 'map', command: 'move' },
      { k: 'map', command: 'act' },
      { k: 'confirm', ability: 'strike', target: { x: 2, y: 1 } },
      { k: 'facing' },
    ];
    const moved = battle();
    moved.move({ x: 2, y: 2 });
    for (const b of [battle(), moved])
      for (const s of screens)
        for (const open of [true, false])
          for (const device of ['keyboard', 'gamepad'] as const) {
            const right = hintsFor(b, s, open, device).right;
            expect(right.length).toBeLessThanOrEqual(3);
            expect(right.reduce((n, h) => n + h.text.length, 0)).toBeLessThanOrEqual(26);
          }
  });

  it('the last input picks the device', () => {
    expect((['key', 'mouse', 'pad', 'touch', 'pen'] as const).map(deviceOf)).toEqual([
      'keyboard',
      'keyboard',
      'gamepad',
      'touch',
      'touch',
    ]);
    expect(padBusy([false, false], [0.1, -0.2])).toBe(false);
    expect(padBusy([false, true], [0, 0])).toBe(true);
    expect(padBusy([], [0, -0.9])).toBe(true);
  });
});

describe('Height corner', () => {
  it('shows the height of the tile under the cursor, and hides under the abilities sheet', () => {
    const b = battle();
    const at = b.actor.pos;
    expect(heightShown(b, menu, at)).toBe(tileHeight(b.grid, at));
    expect(heightShown(b, { k: 'map', command: 'move' }, { x: 0, y: 0 })).toBe(tileHeight(b.grid, { x: 0, y: 0 }));
    expect(heightShown(b, { k: 'abilities', index: 0 }, at)).toBeNull();
  });

  // Fernando, Nov 16: what the HTML tile line said (floor, water, spikes, a charge landing) goes small under the Height
  it("the tile line under it is the HTML corner's own text, and hides with the Height", () => {
    const b = battle();
    const at = { x: 3, y: 3 };
    expect(tileLine(b, menu, at)).toBe(cursorInfo(b.grid, b.state, at));
    expect(tileLine(b, menu, at, 2)).toBe(cursorInfo(b.grid, b.state, at, 2));
    expect(tileLine(b, { k: 'abilities', index: 0 }, at)).toBe('');
  });
});

describe('hint rows: where each hint sits', () => {
  const sizes = [
    { caps: [50], text: 100 },
    { caps: [26, 26], text: 60 },
  ];
  // one hint: caps, 4 between caps, 12 to the text; 40 to the next hint
  it('the right row ends on its region and grows leftwards', () => {
    const xs = layRow(sizes, { x: 1225, y: 1035, w: 660, h: 28 }, 'right', 1);
    const total = 50 + ROW.gap + 100 + ROW.between + 26 + ROW.capGap + 26 + ROW.gap + 60;
    expect(xs[0].caps).toEqual([1885 - total]);
    expect(xs[0].text).toBe(1885 - total + 50 + ROW.gap);
    expect(xs[1].caps).toEqual([1885 - 60 - ROW.gap - 26 - ROW.capGap - 26, 1885 - 60 - ROW.gap - 26]);
    expect(xs[1].text + 60).toBe(1885);
  });

  it('the left row starts on its region, at any scale', () => {
    const xs = layRow([{ caps: [20], text: 80 }], { x: 30, y: 0, w: 100, h: 14 }, 'left', 0.5);
    expect(xs).toEqual([{ caps: [30], text: 30 + 20 + ROW.gap * 0.5 }]);
    expect(layRow([], { x: 0, y: 0, w: 10, h: 10 }, 'right', 1)).toEqual([]);
  });
});

describe('3D banner, Height and hints: flags and scenes', () => {
  it('each piece takes its own flag, the preset takes the three', () => {
    const flags = (q: string, spec = {}) => {
      const p = new URLSearchParams(q);
      const { banner, height, hints } = skinFlags((n) => p.get(n), specFlags(spec));
      return `${banner} ${height} ${hints}`;
    };
    expect(flags('')).toBe('3d 3d 3d');
    expect(flags('ui=html')).toBe('html html html');
    expect(flags('height=html')).toBe('3d html 3d');
    expect(flags('banner=html&hints=html')).toBe('html 3d html');
    expect(flags('ui=3d')).toBe('3d 3d 3d');
    expect(flags('hints=html', { banner: '3d', hints: '3d' })).toBe('3d 3d html');
    expect(flags('banner=css')).toBe('3d 3d 3d');
  });

  it('the bench scenes are valid specs, and a look a piece does not have fails', () => {
    const scenes = import.meta.glob<object>('../scripts/sandbox/bench/hints3d*.json', {
      import: 'default',
      eager: true,
    });
    expect(Object.keys(scenes).length).toBe(2);
    for (const [path, raw] of Object.entries(scenes)) expect(parseSpec(raw).problems, path).toEqual([]);
    expect(parseSpec({ banner: 'css', height: 3, hints: '3d' }).problems).toEqual([
      'banner must be one of html, 3d',
      'height must be one of html, 3d',
    ]);
  });
});
