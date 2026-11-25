import { describe, expect, it } from 'vitest';
import { canUndoMove, commandIndex, type Screen } from '../src/client/command.ts';
import { parseSpec } from '../src/client/dev/sandbox-spec.ts';
import { keysText, type Shown } from '../src/client/glyphs.ts';
import {
  bannerLine,
  type Device,
  heightBox,
  heightShown,
  hintsDevice,
  hintsFor,
  layRow,
  messageScale,
  PHONE_MESSAGE,
  ROW,
  tileLine,
} from '../src/client/hints3d/hints-view.ts';
import { type HintsMode, parseHintsMode, parseTutorial } from '../src/client/key-hints.ts';
import { cursorInfo, tileHeight } from '../src/client/tile-info.ts';
import { place, REGIONS, stage } from '../src/client/ui3d/layout.ts';
import { toolsFoot } from '../src/client/window3d/tools-layout.ts';
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
const actions: Screen = { k: 'actions', target: { k: 'unit', unit: 'b', pos: { x: 2, y: 1 } }, index: 0 };
// each hint as the words of its caps (glyphs.ts) and its text
const row = (b: Battle, s: Screen, open = true, device: Device = 'keyboard') =>
  hintsFor(b, s, open, device).right.map((h) => `${device === 'touch' ? '' : keysText(h.act, device)}=${h.text}`);

describe('button hints: what each screen shows', () => {
  it('the menu offers Select and the camera; Cancel opens Options, then undoes a move', () => {
    const b = battle();
    expect(row(b, menu)).toEqual(['Enter=Escolher', 'Esc=Opções', 'Q E R T=Câmera']);
    b.move({ x: 2, y: 2 });
    expect(canUndoMove(b)).toBe(true);
    expect(row(b, menu)).toEqual(['Enter=Escolher', 'Esc=Desfazer', 'Q E R T=Câmera']);
  });

  it('each step names its Confirm, and Cancel wherever Cancel goes back a step', () => {
    const b = battle();
    const foe = { k: 'unit' as const, unit: 'b', pos: { x: 2, y: 1 } };
    expect(row(b, { k: 'targets', index: 0 })).toEqual(['Enter=Confirmar', 'Esc=Cancelar', 'Q E R T=Câmera']);
    expect(row(b, { k: 'spot', target: foe, action: 0, index: 0 }).slice(0, 2)).toEqual([
      'Enter=Confirmar',
      'Esc=Cancelar',
    ]);
    expect(row(b, { k: 'actions', target: foe, index: 0 })).toEqual(['Enter=Confirmar', 'Esc=Cancelar', 'I=Detalhes']);
    expect(row(b, { k: 'map', command: 'move' }).slice(0, 2)).toEqual(['Enter=Mover', 'Esc=Cancelar']);
    expect(row(b, { k: 'facing' }).slice(0, 2)).toEqual(['Enter=Passar a vez', 'Esc=Cancelar']);
  });

  it('the buttons follow the device in use, and a finger gets none', () => {
    const b = battle();
    expect(row(b, { k: 'map', command: 'move' }, true, 'xbox')).toEqual([
      'A=Mover',
      'B=Cancelar',
      'LT RT LB RB=Câmera',
    ]);
    expect(row(b, { k: 'map', command: 'move' }, true, 'playstation')).toEqual([
      '✕=Mover',
      '○=Cancelar',
      'L2 R2 L1 R1=Câmera',
    ]);
    expect(hintsFor(b, menu, true, 'switch').left).toEqual([{ act: 'help', text: 'Opções' }]);
    // the left hint opens Options (Game.menu, from H or a pad's Start)
    expect(keysText('help', 'keyboard')).toBe('H');
    expect(keysText('help', 'playstation')).toBe('Options');
    expect(hintsFor(b, menu, true, 'touch')).toEqual({ left: [], right: [] });
  });

  it('while the battle plays, Confirm is held to speed it up', () => {
    expect(row(battle(), menu, false)).toEqual(['Enter=Segure: acelerar', 'Q E R T=Câmera']);
  });

  // Fernando, Nov 16: the right row stays inside its region (660 x 28 on the reference) at 1920x1080 and 1280x720. Widths
  // measured in Chrome with the theme's serif: the widest rows below (Passar a vez, and the pad's four camera buttons)
  // came to 595 px at 1920 and 439 px of 440 at 1280. A longer word has to be measured again before this budget grows
  it('every right row keeps to three hints and 26 letters of text, on every screen and device', () => {
    const screens: Screen[] = [
      menu,
      { k: 'targets', index: 0 },
      { k: 'actions', target: { k: 'unit', unit: 'b', pos: { x: 2, y: 1 } }, index: 0 },
      { k: 'spot', target: { k: 'unit', unit: 'b', pos: { x: 2, y: 1 } }, action: 0, index: 0 },
      { k: 'map', command: 'move' },
      { k: 'facing' },
    ];
    const moved = battle();
    moved.move({ x: 2, y: 2 });
    for (const b of [battle(), moved])
      for (const s of screens)
        for (const open of [true, false])
          for (const device of ['keyboard', 'xbox', 'playstation', 'switch'] as const) {
            const right = hintsFor(b, s, open, device).right;
            expect(right.length).toBeLessThanOrEqual(3);
            expect(right.reduce((n, h) => n + h.text.length, 0)).toBeLessThanOrEqual(26);
          }
  });
});

describe('Height corner', () => {
  it('shows the height of the tile under the cursor', () => {
    const b = battle();
    const at = b.actor.pos;
    expect(heightShown(b, menu, at)).toBe(tileHeight(b.grid, at));
    expect(heightShown(b, { k: 'targets', index: 0 }, { x: 0, y: 0 })).toBe(tileHeight(b.grid, { x: 0, y: 0 }));
    expect(heightShown(b, actions, at)).toBeNull(); // the action sheet takes the corner
  });

  // Fernando, Nov 18: on a phone the corner sat under the menu button and Undo
  it('the corner keeps its region where there is room, and drops under the corner buttons where not', () => {
    const ref = stage(1920, 1080, 'edges');
    expect(heightBox(ref, 12)).toEqual(place(REGIONS.height, ref));
    const phone = stage(844, 390, 'edges', { x: 47, y: 21 });
    expect(place(REGIONS.height, phone).y).toBeLessThan(toolsFoot(phone.s, 12)); // the region alone: by the buttons
    expect(heightBox(phone, 12).y).toBe(toolsFoot(phone.s, 12));
    expect(heightBox(phone, 12).x).toBe(place(REGIONS.height, phone).x);
  });

  // Fernando, Nov 16: what the HTML tile line said (floor, water, spikes, a charge landing) goes small under the Height;
  // later on Nov 18: with X, Y and Z spelled out (the Z is the corner's number)
  it("the tile line under it is the HTML corner's own text, and hides with the Height", () => {
    const b = battle();
    const at = { x: 3, y: 3 };
    expect(tileLine(b, menu, at)).toBe(cursorInfo(b.grid, b.state, at, 1));
    expect(tileLine(b, menu, at, 2)).toBe(cursorInfo(b.grid, b.state, at, 2));
    expect(tileLine(b, menu, at)).toBe('X 3 · Y 3 · Z 0 · chão');
    expect(tileLine(b, actions, at)).toBe('');
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

  // the pad's drawn buttons are wider than the letters they replaced (Nov 17): the row closes up before it leaves
  it('a row wider than its region closes the space between its hints, and still ends on the edge', () => {
    const content = 50 + ROW.gap + 100 + 26 + ROW.capGap + 26 + ROW.gap + 60;
    const xs = layRow(sizes, { x: 100, y: 0, w: content + 20, h: 28 }, 'right', 1);
    expect(xs[0].caps).toEqual([100]);
    expect(xs[1].caps[0] - (xs[0].text + 100)).toBe(20);
    expect(xs[1].text + 60).toBe(100 + content + 20);
    // never closer than a cap and its text
    const tight = layRow(sizes, { x: 100, y: 0, w: content, h: 28 }, 'right', 1);
    expect(tight[1].caps[0] - (tight[0].text + 100)).toBe(ROW.gap);
  });
});

describe('3D banner, Height and hints: bench scenes', () => {
  it('the bench scenes are valid specs', () => {
    const scenes = import.meta.glob<object>('../scripts/sandbox/bench/hints3d*.json', {
      import: 'default',
      eager: true,
    });
    expect(Object.keys(scenes).length).toBe(2);
    for (const [path, raw] of Object.entries(scenes)) expect(parseSpec(raw).problems, path).toEqual([]);
  });
});

// Fernando, Nov 18: Options › Key and button hints. Automatic is the input in use: a finger hides the foot's hints, a
// key or a pad brings them back; Always and Never hold whatever the input
describe('key and button hints: who the foot is drawn for', () => {
  it('Automatic follows the input last used; Always and Never hold', () => {
    const table: [HintsMode, boolean, Shown, Device][] = [
      ['auto', true, 'keyboard', 'touch'], // a phone or a tablet with no key pressed
      ['auto', false, 'keyboard', 'keyboard'], // a key pressed
      ['auto', false, 'xbox', 'xbox'], // a pad pressed
      ['always', true, 'keyboard', 'keyboard'],
      ['always', true, 'playstation', 'playstation'],
      ['never', false, 'keyboard', 'touch'],
      ['never', false, 'xbox', 'touch'],
    ];
    for (const [mode, finger, keys, want] of table)
      expect(hintsDevice(mode, finger, keys), `${mode} ${finger} ${keys}`).toBe(want);
  });

  it('Automatic is the default, and anything else read back is Automatic', () => {
    expect(parseHintsMode(null)).toBe('auto');
    expect(parseHintsMode('always')).toBe('always');
    expect(parseHintsMode('never')).toBe('never');
    expect(parseHintsMode('sometimes')).toBe('auto');
    expect(parseHintsMode(1)).toBe('auto');
  });

  it('a finger gets no hint rows at all', () => {
    const b = battle();
    expect(hintsFor(b, menu, true, hintsDevice('auto', true, 'keyboard'))).toEqual({ left: [], right: [] });
    expect(hintsFor(b, menu, true, hintsDevice('always', true, 'keyboard')).right.length).toBeGreaterThan(0);
  });
});

// Fernando, Nov 18: the teaching lines (what to do now, why a tile is refused) are the Tutorial option, off by default
describe('Tutorial: the banner', () => {
  const help = 'Mover — Guerreiro: o que fazer?';
  it('is off unless saved as on', () => {
    expect(parseTutorial(null)).toBe(false);
    expect(parseTutorial('true')).toBe(false); // the saved JSON, read back by store.json, is a boolean
    expect(parseTutorial(true)).toBe(true);
  });
  it('off, a hero turn keeps only the last action, and nothing when there is none', () => {
    expect(bannerLine(help, 'Mover', true, false)).toBe('Mover');
    expect(bannerLine('Não cabe aqui: precisa de chão plano.', '', true, false)).toBe('');
  });
  it('on, the whole line', () => {
    expect(bannerLine(help, 'Mover', true, true)).toBe(help);
  });
  it("the enemy's turn is not teaching: it stays either way", () => {
    expect(bannerLine('Vez do inimigo: Soldado', '', false, false)).toBe('Vez do inimigo: Soldado');
  });
});

describe('messages on a phone', () => {
  it('a phone on its side draws them at 70%; a tablet and a PC at full size', () => {
    expect(messageScale(844, 390)).toBe(PHONE_MESSAGE);
    expect(messageScale(390, 844)).toBe(PHONE_MESSAGE);
    expect(messageScale(1024, 768)).toBe(1);
    expect(messageScale(768, 1024)).toBe(1);
    expect(messageScale(1280, 720)).toBe(1);
  });
});
