import { describe, expect, it } from 'vitest';
import type { Screen } from '../src/client/command.ts';
import type { HudView } from '../src/client/hud.ts';
import { actionVerb, backKind, confirmParts, helpText, runPick, undoShown } from '../src/client/hud-menus.ts';
import { freshUi, highlights, hoverTile, selectMode, tapTile, type Ui } from '../src/client/interaction.ts';
import { ABILITIES } from '../src/shared/battle/abilities.ts';
import { Battle } from '../src/shared/battle/battle.ts';
import type { Pos } from '../src/shared/battle/types.ts';
import { flat, stateOf } from './battle-helpers.ts';

// Touch (Nov 16, Fernando: his wife could not play on the tablet): the Back button and what the help line says after a tap
const duel = () =>
  new Battle(
    flat(6, 6),
    stateOf([
      { id: 'a', def: 'warrior', team: 'hero', x: 1, y: 1 },
      { id: 'b', def: 'soldier', team: 'enemy', x: 2, y: 1 },
      { id: 'beacon', def: 'beacon', team: 'hero', x: 5, y: 5 },
    ]),
  );
// the view main.ts hands the HUD after a tap on `cursor`
const view = (b: Battle, screen: Screen, ui: Ui, cursor: Pos): HudView => ({
  battle: b,
  screen,
  hl: highlights(b, ui, cursor),
  busy: false,
  log: '',
  acting: null,
  cursor,
  ability: ui.mode.k === 'ability' ? ui.mode.id : null,
  face: () => 'neutral',
});

describe('Back button', () => {
  it('shows on every screen that Esc leaves, and hides on the menu and while nothing responds', () => {
    const b = duel();
    for (const s of [
      { k: 'map', command: 'move' },
      { k: 'map', command: 'act' },
      { k: 'abilities', index: 0 },
      { k: 'confirm', ability: 'strike', target: { x: 2, y: 1 } },
      { k: 'facing' },
    ] as Screen[]) {
      expect(backKind(b, s, true)).toBe('back');
      expect(backKind(b, s, false)).toBeNull(); // animation or enemy turn
    }
    expect(backKind(b, { k: 'menu', index: 0 }, true)).toBeNull();
  });

  it('on the menu after a free move it undoes the move, like Esc there', () => {
    const b = duel();
    b.move({ x: 2, y: 2 });
    expect(backKind(b, { k: 'menu', index: 1 }, true)).toBe('undo');
    b.act('strike', { x: 2, y: 1 }); // the move drew a counter: nothing to undo for free
    expect(backKind(b, { k: 'menu', index: 2 }, true)).toBeNull();
  });

  // Fernando, Nov 18: an Undo button on the battle screen
  it('Undo shows whenever the rules have a step to take back, on the hero turn only', () => {
    const b = duel();
    expect(undoShown(b, true)).toBe(false); // nothing done yet
    b.move({ x: 2, y: 2 });
    expect(undoShown(b, true)).toBe(b.canUndo);
    expect(undoShown(b, true)).toBe(true);
    expect(undoShown(b, false)).toBe(false); // animation or enemy turn
    b.undo();
    expect(undoShown(b, true)).toBe(false);
  });
});

describe('help line after a tap', () => {
  const move: Screen = { k: 'map', command: 'move' };
  const act: Screen = { k: 'map', command: 'act' };

  it('Move: the 1st tap says to tap again; a tile that does not work says so', () => {
    const b = duel();
    const ui = selectMode(b, freshUi(b), { k: 'move' });
    const first = (touch: boolean) => helpText(view(b, move, ui, b.actor.pos), true, touch);
    expect(first(true)).toBe('Mover: escolha a casa e confirme.');
    const marked = view(b, move, tapTile(b, ui, { x: 1, y: 2 }), { x: 1, y: 2 });
    expect(helpText(marked, true, true)).toBe('Mover: toque de novo para confirmar.');
    const bad = view(b, move, tapTile(b, ui, { x: 5, y: 0 }), { x: 5, y: 0 });
    expect(tapTile(b, ui, { x: 5, y: 0 }).pending).toBeNull();
    expect(helpText(bad, true, true)).toBe('Mover: toque numa casa marcada.');
    // keyboard and mouse: the hover already marks, the text stays
    expect(helpText(marked, true, false)).toBe(first(false));
    expect(helpText(bad, true, false)).toBe(first(false));
  });

  it('Act: the same on the target', () => {
    const b = duel();
    const ui = selectMode(b, freshUi(b), { k: 'ability', id: 'strike' });
    const start = helpText(view(b, act, ui, b.actor.pos), true, true);
    expect(start).toBe('Alvo: área laranja. Roxo: bloqueado.');
    const marked = view(b, act, tapTile(b, ui, { x: 2, y: 1 }), { x: 2, y: 1 });
    expect(helpText(marked, true, true)).toBe('Toque de novo para confirmar.');
    const bad = view(b, act, tapTile(b, ui, { x: 4, y: 4 }), { x: 4, y: 4 });
    expect(helpText(bad, true, true)).toBe('Toque dentro da área laranja.');
    expect(helpText(marked, true, false)).toBe(start);
  });

  // the warning comes from `Ui.invalid` (Nov 16 review), not from where the cursor is
  it('no warning when a tap inspects a unit, nor when the gamepad or the mouse moves the cursor', () => {
    const b = duel();
    const ui = selectMode(b, freshUi(b), { k: 'move' });
    const start = helpText(view(b, move, ui, b.actor.pos), true, true);
    const foe = { x: 2, y: 1 };
    expect(tapTile(b, ui, foe).inspect).toBe('b');
    expect(helpText(view(b, move, tapTile(b, ui, foe), foe), true, true)).toBe(start);
    const far = { x: 5, y: 0 };
    expect(helpText(view(b, move, hoverTile(b, ui, far), far), true, true)).toBe(start);
  });

  it('facing: taps instead of arrows and Enter', () => {
    const b = duel();
    const v = view(b, { k: 'facing' }, freshUi(b), b.actor.pos);
    expect(helpText(v, true, true)).toBe('Toque um lado; de novo, passa a vez.');
    expect(helpText(v, true, false)).toContain('confirme');
  });
});

// Fernando, Nov 16: each instruction fits one line of the 3D banner, as on FFT. The longest ones (37 letters, "Não cabe
// aqui: precisa de chão plano.") measured 499 px of the 520 the pill holds, in the reference's 30 px serif in Chrome
describe('help line: one banner line', () => {
  it('every instruction without a log keeps to 37 letters', () => {
    const b = duel();
    const lines: string[] = [];
    for (const touch of [true, false]) {
      for (const k of ['move', 'ability'] as const) {
        const ui = selectMode(b, freshUi(b), k === 'move' ? { k } : { k, id: 'strike' });
        const s: Screen = { k: 'map', command: k === 'move' ? 'move' : 'act' };
        for (const at of [b.actor.pos, { x: 1, y: 2 }, { x: 2, y: 1 }, { x: 5, y: 0 }, { x: 4, y: 4 }])
          lines.push(helpText(view(b, s, tapTile(b, ui, at), at), true, touch));
      }
      for (const s of [
        { k: 'menu', index: 0 },
        { k: 'confirm', ability: 'strike', target: { x: 2, y: 1 } },
        { k: 'confirm', ability: 'strike', target: { x: 2, y: 1 }, lock: 'unit' },
        { k: 'facing' },
      ] as Screen[])
        lines.push(helpText(view(b, s, freshUi(b), b.actor.pos), true, touch));
    }
    for (const line of lines) expect(line.length, line).toBeLessThanOrEqual(37);
  });
});

// The 3D "Execute?" (confirm3d/; Fernando, Nov 16) draws what the HTML window says, from one pure source
describe('"Execute?": its title, notes and choices', () => {
  it('the preview: Confirm in focus and Back; the lock step: its two places, the focus where the screen is', () => {
    const b = duel();
    const preview = confirmParts(b, { k: 'confirm', ability: 'strike', target: { x: 2, y: 1 } });
    expect(preview.title).toBe('Golpe: executar?');
    expect(preview.choices.map((c) => [c.label, c.focus, c.pick])).toEqual([
      ['Atacar', true, 'yes'],
      ['Voltar', false, 'no'],
    ]);
    const lock = confirmParts(b, { k: 'confirm', ability: 'strike', target: { x: 2, y: 1 }, lock: 'tile' });
    expect(lock.choices.map((c) => [c.label, c.focus, c.pick])).toEqual([
      ['No personagem', false, 'unit'],
      ['Na casa', true, 'tile'],
    ]);
  });

  // the confirm button's verb comes from the ability's stats (Nov 18): every ability gets one, short enough for its half
  // of the window
  it('the confirm button says what the press does', () => {
    expect(['strike', 'shot', 'firebolt', 'heal'].map(actionVerb)).toEqual(['Atacar', 'Atirar', 'Lançar', 'Curar']);
    for (const id of Object.keys(ABILITIES)) expect(actionVerb(id).length, id).toBeGreaterThan(0);
  });

  it('a click runs the same action as the HTML button', () => {
    const calls: string[] = [];
    const act = { answer: (y: boolean) => calls.push(`answer ${y}`), lock: (on: string) => calls.push(`lock ${on}`) };
    for (const p of ['yes', 'no', 'unit', 'tile'] as const) runPick(act as never, p);
    expect(calls).toEqual(['answer true', 'answer false', 'lock unit', 'lock tile']);
  });
});
