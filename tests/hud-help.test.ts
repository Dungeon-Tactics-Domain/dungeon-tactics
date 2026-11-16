import { describe, expect, it } from 'vitest';
import type { Screen } from '../src/client/command.ts';
import type { HudView } from '../src/client/hud.ts';
import { backKind, helpText } from '../src/client/hud-menus.ts';
import { freshUi, highlights, hoverTile, selectMode, tapTile, type Ui } from '../src/client/interaction.ts';
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
      { k: 'confirm', ability: 'strike', target: { x: 2, y: 1 }, yes: true },
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
});

describe('help line after a tap', () => {
  const move: Screen = { k: 'map', command: 'move' };
  const act: Screen = { k: 'map', command: 'act' };

  it('Move: the 1st tap says to tap again; a tile that does not work says so', () => {
    const b = duel();
    const ui = selectMode(b, freshUi(b), { k: 'move' });
    const first = (touch: boolean) => helpText(view(b, move, ui, b.actor.pos), true, touch);
    expect(first(true)).toBe('Mover: escolha uma casa marcada.');
    const marked = view(b, move, tapTile(b, ui, { x: 1, y: 2 }), { x: 1, y: 2 });
    expect(helpText(marked, true, true)).toBe('Mover: toque de novo na casa para confirmar.');
    const bad = view(b, move, tapTile(b, ui, { x: 5, y: 0 }), { x: 5, y: 0 });
    expect(tapTile(b, ui, { x: 5, y: 0 }).pending).toBeNull();
    expect(helpText(bad, true, true)).toBe('Mover: essa casa não serve; toque numa casa marcada.');
    // keyboard and mouse: the hover already marks, the text stays
    expect(helpText(marked, true, false)).toBe(first(false));
    expect(helpText(bad, true, false)).toBe(first(false));
  });

  it('Act: the same on the target', () => {
    const b = duel();
    const ui = selectMode(b, freshUi(b), { k: 'ability', id: 'strike' });
    const start = helpText(view(b, act, ui, b.actor.pos), true, true);
    expect(start).toContain('Escolha o alvo na área laranja');
    const marked = view(b, act, tapTile(b, ui, { x: 2, y: 1 }), { x: 2, y: 1 });
    expect(helpText(marked, true, true)).toBe('Toque de novo no alvo para confirmar.');
    const bad = view(b, act, tapTile(b, ui, { x: 4, y: 4 }), { x: 4, y: 4 });
    expect(helpText(bad, true, true)).toBe('Essa casa não serve; toque na área laranja.');
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
    expect(helpText(v, true, true)).toContain('toque de novo no mesmo lado');
    expect(helpText(v, true, false)).toContain('Enter');
  });
});
