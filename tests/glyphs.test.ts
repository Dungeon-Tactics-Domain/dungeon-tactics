import { describe, expect, it } from 'vitest';
import { emptyMemory, padActions } from '../src/client/gamepad.ts';
import {
  ACTIONS,
  type Act,
  capsOf,
  familyOf,
  GLYPH_MODES,
  hintLine,
  keysText,
  PAD_INDEX,
  PADLESS,
  padBusy,
  parseGlyphMode,
  shownFor,
} from '../src/client/glyphs.ts';
import { type KeyAction, keyAction, keyHelp } from '../src/client/keyboard.ts';
import { toolRows } from '../src/client/tool-rows.ts';

// The key hints' rules (glyphs.ts; Fernando, Nov 17: gamepad icons in place of the keys). The tests run in Portuguese

describe("the controller's family, by its id", () => {
  it('reads the ids the browsers give', () => {
    const ids: [string, string][] = [
      ['Xbox 360 Controller (XInput STANDARD GAMEPAD)', 'xbox'],
      ['Xbox Wireless Controller (STANDARD GAMEPAD Vendor: 045e Product: 0b13)', 'xbox'],
      ['DualSense Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 0ce6)', 'playstation'],
      ['Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 09cc)', 'playstation'],
      ['054c-05c4-Wireless Controller', 'playstation'],
      ['PLAYSTATION(R)3 Controller (STANDARD GAMEPAD Vendor: 054c Product: 0268)', 'playstation'],
      ['Pro Controller (STANDARD GAMEPAD Vendor: 057e Product: 2009)', 'switch'],
      ['Joy-Con L+R (STANDARD GAMEPAD Vendor: 057e Product: 200e)', 'switch'],
      ['057e-2009-Pro Controller', 'switch'],
    ];
    for (const [id, family] of ids) expect(familyOf(id), id).toBe(family);
  });
  it('draws one it does not know as an Xbox pad', () => {
    expect(familyOf('Wireless Controller')).toBe('xbox');
    expect(familyOf('Logitech Dual Action (Vendor: 046d Product: c216)')).toBe('xbox');
    expect(familyOf('')).toBe('xbox');
  });
});

describe('what the hints show', () => {
  it('Automatic follows the input last used, and a fixed choice holds', () => {
    expect(shownFor('auto', 'key', 'playstation')).toBe('keyboard');
    expect(shownFor('auto', 'pad', 'playstation')).toBe('playstation');
    expect(shownFor('auto', 'pad', 'xbox')).toBe('xbox');
    expect(shownFor('keyboard', 'pad', 'xbox')).toBe('keyboard');
    expect(shownFor('switch', 'key', 'xbox')).toBe('switch');
  });
  it('a stored choice it does not know reads as Automatic', () => {
    expect(GLYPH_MODES.map((m) => parseGlyphMode(m))).toEqual(GLYPH_MODES);
    expect([null, '', 'gamepad'].map(parseGlyphMode)).toEqual(['auto', 'auto', 'auto']);
  });
  it('a pad counts as used with a button down or a stick off its rest', () => {
    expect(padBusy([false, false], [0.1, -0.2])).toBe(false);
    expect(padBusy([false, true], [0, 0])).toBe(true);
    expect(padBusy([], [0, -0.9])).toBe(true);
  });
});

describe('the table: action, key, pad button', () => {
  const acts = Object.keys(ACTIONS) as Act[];
  // what each action is to the game (KeyAction): the table must name the key and the button that really do it
  const DOES: Partial<Record<Act, KeyAction[]>> = {
    confirm: [{ k: 'confirm' }],
    cancel: [{ k: 'cancel' }],
    status: [{ k: 'status' }],
    info: [{ k: 'info' }],
    undo: [{ k: 'undo' }],
    help: [{ k: 'help' }],
    rotateLeft: [{ k: 'rotate', dir: -1 }],
    rotateRight: [{ k: 'rotate', dir: 1 }],
    zoom: [
      { k: 'zoom', factor: 1.15 },
      { k: 'zoom', factor: 1 / 1.15 },
    ],
    wait: [{ k: 'wait' }],
    face: [{ k: 'face' }],
    cycle: [{ k: 'cycle', dir: 1 }],
    recenter: [{ k: 'recenter' }],
    pixel: [{ k: 'pixel' }],
    fps: [{ k: 'fps' }],
    turns: [
      { k: 'turns', dir: -1 },
      { k: 'turns', dir: 1 },
    ],
  };
  const pressKey = (cap: string) => {
    const shiftKey = cap.startsWith('⇧');
    const key = { Esc: 'Escape', PgUp: 'PageUp', PgDn: 'PageDown' }[cap] ?? cap.replace('⇧', '');
    return keyAction({ key, shiftKey, ctrlKey: false, altKey: false, metaKey: false });
  };
  const pressPad = (index: number) => {
    const buttons = Array.from({ length: 16 }, (_, i) => i === index);
    return padActions({ buttons, axes: [0, 0, 0, 0] }, emptyMemory(), 0);
  };

  it('each key written in the table is the one keyboard.ts reads for the action', () => {
    for (const [act, does] of Object.entries(DOES) as [Act, KeyAction[]][])
      expect(ACTIONS[act].keys.map(pressKey), act).toEqual(does);
  });
  it('each pad button in the table is the one gamepad.ts reads for the action', () => {
    for (const [act, does] of Object.entries(DOES) as [Act, KeyAction[]][]) {
      const pad = (ACTIONS[act].pad as readonly (keyof typeof PAD_INDEX)[]).flatMap((g) => PAD_INDEX[g] ?? []);
      if (pad.length) expect(pad.flatMap(pressPad), act).toEqual(does);
    }
    // the sticks and the d-pad: the right stick scrolls the turn list, the d-pad moves the cursor
    expect(padActions({ buttons: [], axes: [0, 0, 0, 1] }, emptyMemory(), 0)).toEqual([{ k: 'turns', dir: 1 }]);
    expect(pressPad(12)).toEqual([{ k: 'cursor', dir: 'up' }]);
    expect(ACTIONS.turns.pad).toEqual(['rstick']);
    expect(ACTIONS.move.pad).toEqual(['dpad']);
  });
  it('every button gamepad.ts presses has its action in the table', () => {
    const used = new Set(
      acts.flatMap((a) => (ACTIONS[a].pad as readonly (keyof typeof PAD_INDEX)[]).map((g) => PAD_INDEX[g])),
    );
    for (let i = 0; i <= 9; i++) expect(used.has(i), `button ${i}`).toBe(true);
  });

  it('the actions the pad has no button for hide with its icons', () => {
    expect(PADLESS).toEqual(['wait', 'face', 'cycle', 'slots', 'recenter', 'pixel', 'fps']);
    for (const a of PADLESS) {
      expect(capsOf(a, 'xbox'), a).toBeNull();
      expect(capsOf(a, 'keyboard')?.length, a).toBeGreaterThan(0);
    }
  });
  it('each family writes its own names, by the place of the button', () => {
    const families = ['xbox', 'playstation', 'switch'] as const;
    expect(keysText('confirm', 'keyboard')).toBe('Enter');
    expect(families.map((f) => keysText('confirm', f))).toEqual(['A', '✕', 'B']);
    expect(families.map((f) => keysText('cancel', f))).toEqual(['B', '○', 'A']);
    expect(keysText('camera', 'switch')).toBe('ZL ZR L R');
    expect(keysText('help', 'playstation')).toBe('Options');
    expect(keysText('move', 'xbox')).toBe('Direcional');
    expect(capsOf('camera', 'xbox')).toEqual(['lt', 'rt', 'lb', 'rb'].map((pad) => ({ pad, family: 'xbox' })));
  });
  it('a line of hints leaves out what the pad cannot do', () => {
    const pairs: [Act, string][] = [
      ['confirm', 'escolher'],
      ['wait', 'esperar'],
      ['cancel', 'sair'],
    ];
    expect(hintLine('keyboard', pairs, ' · ')).toBe('Enter: escolher · P: esperar · Esc: sair');
    expect(hintLine('playstation', pairs, ' · ')).toBe('✕: escolher · ○: sair');
  });
});

describe('the screens read the table', () => {
  it('the help list names the keys, or the pad buttons without the rows it has none for', () => {
    const keys = keyHelp().map(([k]) => k);
    expect(keys).toContain('W A S D · ← ↑ → ↓');
    expect(keys).toContain('P');
    expect(keys).toContain('1 – 7');
    const pad = keyHelp('xbox');
    expect(pad.map(([k]) => k)).toEqual([
      'Direcional',
      'A',
      'B',
      'X',
      'View',
      'LB · RB',
      'LT RT',
      'Analógico direito',
      'Y',
      'Menu',
      'Na cidade',
    ]);
    expect(pad.find(([k]) => k === 'A')?.[1]).toContain('o 2º A age');
    expect(pad.at(-1)?.[1]).toContain('B · Menu abre o menu da cidade');
  });
  it("the corner menu's rows name actions of the table", () => {
    const keys = (shown: 'keyboard' | 'xbox') => toolRows().map((r) => r.key && keysText(r.key, shown));
    expect(keys('keyboard')).toEqual(['Z', '⇧R', 'R', 'F', 'V', '', 'F3', 'H']);
    expect(keys('xbox')).toEqual(['View', 'LB', 'RB', null, null, '', null, 'Menu']);
  });
});
