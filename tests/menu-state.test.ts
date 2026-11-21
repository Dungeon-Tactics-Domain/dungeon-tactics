import { describe, expect, it } from 'vitest';
import { commandIndex } from '../src/client/command.ts';
import { HeroTurn, type TurnHost } from '../src/client/hero-turn.ts';
import type { HudView } from '../src/client/hud.ts';
import { helpText } from '../src/client/hud-menus.ts';
import { rowUnit } from '../src/client/hud-queue.ts';
import { freshUi, rangeMarks, type Ui } from '../src/client/interaction.ts';
import type { KeyAction } from '../src/client/keyboard.ts';
import { fill } from '../src/client/looks3d.ts';
import { cardTap, menuKey, menuTap, menuUp } from '../src/client/menu-state.ts';
import type { Note } from '../src/client/note.ts';
import { queueRows } from '../src/client/turn-list.ts';
import { turnMarks } from '../src/client/turn-marks.ts';
import { abilityRows } from '../src/client/unit-peek.ts';
import { Battle } from '../src/shared/battle/battle.ts';
import { posKey } from '../src/shared/battle/grid.ts';
import { reachable } from '../src/shared/battle/pathing.ts';
import type { Pos } from '../src/shared/battle/types.ts';
import { UNIT_DEFS } from '../src/shared/battle/units.ts';
import { flat, stateOf } from './battle-helpers.ts';

// Fernando, Nov 18 night (the phone grill): a tap on an empty tile shuts the menu, the hero or its sheet brings it back,
// another unit opens a look-only mini menu whose Show range paints the map until the next tap or key
const duel = () =>
  new Battle(
    flat(8, 8),
    stateOf([
      { id: 'a', def: 'warrior', team: 'hero', x: 1, y: 1 },
      { id: 'b', def: 'soldier', team: 'enemy', x: 5, y: 1 },
      { id: 'c', def: 'archer', team: 'hero', x: 1, y: 5 },
      { id: 'beacon', def: 'beacon', team: 'hero', x: 7, y: 7 },
    ]),
  );
const menu = { k: 'menu', index: commandIndex('move') } as const;
const empty: Pos = { x: 3, y: 4 };

describe('menu state (pure)', () => {
  it('on the menu: an empty tile closes, the hero and the sheet open, another unit peeks', () => {
    const b = duel();
    expect(menuTap(b, menu, empty)).toEqual({ k: 'close', at: empty });
    expect(menuTap(b, menu, { x: 1, y: 1 })).toEqual({ k: 'open' });
    expect(menuTap(b, menu, 'sheet')).toEqual({ k: 'open' });
    expect(menuTap(b, menu, { x: 5, y: 1 })).toEqual({ k: 'peek', unit: 'b' });
    expect(menuTap(b, menu, { x: 1, y: 5 })).toEqual({ k: 'peek', unit: 'c' });
  });

  it('the other screens keep their own taps: on the Act lists the enemy is a target, not a mini menu', () => {
    const b = duel();
    expect(menuTap(b, { k: 'targets', index: 0 }, { x: 5, y: 1 })).toBeNull();
    expect(menuTap(b, { k: 'map', command: 'move' }, empty)).toBeNull();
    expect(menuTap(b, { k: 'facing' }, 'sheet')).toBeNull();
    expect(menuTap(b, menu, null)).toBeNull();
  });

  it('a turn card: the acting hero opens the menu, anyone else peeks', () => {
    const b = duel();
    expect(cardTap(b, 'a')).toEqual({ k: 'open' });
    expect(cardTap(b, 'b')).toEqual({ k: 'peek', unit: 'b' });
  });

  it('keys: closed, Confirm and Cancel open; open, Cancel closes unless it undoes a free move', () => {
    const b = duel();
    const ok: KeyAction = { k: 'confirm' },
      esc: KeyAction = { k: 'cancel' };
    expect(menuKey(b, menu, true, ok)).toBe('open');
    expect(menuKey(b, menu, true, esc)).toBe('open');
    expect(menuKey(b, menu, true, { k: 'cursor', dir: 'up' })).toBeNull();
    expect(menuKey(b, menu, false, esc)).toBeNull(); // Esc on the bare menu opens Options (hero-turn.ts, Nov 21)
    expect(menuKey(b, menu, false, ok)).toBeNull();
    b.move({ x: 1, y: 2 });
    expect(menuKey(b, menu, false, esc)).toBeNull(); // Esc still undoes the move (Nov 13)
    expect(menuKey(b, { k: 'map', command: 'move' }, false, esc)).toBeNull();
  });

  it('a list row gives the unit by its place in the whole queue, the hidden acting row included', () => {
    const b = duel();
    const q = queueRows(b, null);
    expect(rowUnit(q, 0)).toBe('a');
    expect(rowUnit(q, 1)).toBe(q.rows[1].unit);
    expect(rowUnit(q, 99)).toBeNull();
    expect(rowUnit(null, 0)).toBeNull();
  });
});

describe('another unit range', () => {
  it('paints where it walks and what it could strike, its own square and the hero', () => {
    const b = duel();
    const hl = rangeMarks(b, 'b');
    const kind = (p: Pos) => hl.tiles.find((m) => posKey(m.pos) === posKey(p))?.kind;
    const walk = [...reachable(b.grid, b.state, 'b').values()][0].pos;
    expect(kind(walk)).toBe('move');
    expect(kind({ x: 5, y: 1 })).toBe('actor');
    expect(kind({ x: 1, y: 1 })).toBe('actor');
    expect(hl.tiles.some((m) => m.kind === 'threat')).toBe(true);
    // the map shows it in place of the menu's marks, with no range ring of the hero
    const m = turnMarks(b, menu, freshUi(b), b.actor.pos, true, 'b');
    expect(m.hl?.tiles.length).toBe(hl.tiles.length);
    expect(m.ring).toBeNull();
    expect(turnMarks(b, menu, freshUi(b), b.actor.pos, true).ring).not.toBeNull();
  });

  it('the abilities sheet lists each ability with its range and cost', () => {
    const rows = abilityRows('archer');
    expect(rows).toHaveLength(UNIT_DEFS.archer.abilities.length);
    for (const [, info] of rows) expect(info).toMatch(/alcance|em volta/);
  });
});

// the turn screens with a stand-in Game and scene: `at` is the tile the next tap picks
function turn() {
  const battle = duel();
  const host: TurnHost = {
    battle,
    busy: false,
    heroTurn: true,
    update: (ui: Ui) => {
      t.ui = ui;
    },
    runAct: async () => {},
    execute: async () => {},
    endTurn: async () => {},
    undo: () => {},
    status: () => {},
    save: () => {},
    options: () => {},
  };
  const at: { p: Pos | null } = { p: null };
  const scene = { heading: 0, focusOn: () => {}, sync: () => {}, pick: () => at.p } as unknown as ConstructorParameters<
    typeof HeroTurn
  >[1];
  const t = new HeroTurn(host, scene);
  const tap = (p: Pos) => {
    at.p = p;
    t.tap(0, 0);
  };
  return { t, battle, tap };
}

describe('the menu and "Execute?" wait while the map is looked at', () => {
  it('the pure rule: nothing shows unless it is a hero turn with the map not looked at', () => {
    expect(menuUp(true, {})).toBe(true);
    expect(menuUp(true, { closed: false, range: null })).toBe(true);
    expect(menuUp(true, { closed: true })).toBe(false);
    expect(menuUp(true, { range: 'b' })).toBe(false);
    expect(menuUp(false, {})).toBe(false);
  });

  it('on the Act lists, a turn card paints a range: the menu waits, and comes back when it is closed', async () => {
    const { t, battle } = turn();
    const notes: Note[] = [];
    const drop = fill('note', (n) => void notes.push(n));
    t.screen = { k: 'targets', index: 0 };
    expect(menuUp(true, t)).toBe(true);
    t.card('b'); // the card's mini menu opens after its own click (hero-turn.ts)
    await new Promise((r) => setTimeout(r));
    notes[0].buttons[2].run?.(); // Show range
    expect(t.screen.k).toBe('targets'); // still the target list, only hidden
    expect(t.range).toBe('b');
    expect(menuUp(true, t)).toBe(false);
    t.key({ k: 'cancel' }); // the key that closes the range
    expect(t.range).toBeNull();
    expect(t.screen.k).toBe('targets');
    expect(menuUp(true, t)).toBe(true);
    expect(battle.actor.id).toBe('a');
    drop();
  });
});

describe('the hero turn with the menu shut', () => {
  it('a tap on empty ground shuts the menu and moves the cursor; nothing walks', () => {
    const { t, battle, tap } = turn();
    tap(empty);
    expect(t.closed).toBe(true);
    expect(t.cursor).toEqual(empty);
    expect(t.screen.k).toBe('menu');
    expect(battle.actor.pos).toEqual({ x: 1, y: 1 });
    tap({ x: 4, y: 4 }); // shut, another empty tile only moves the cursor
    expect(t.closed).toBe(true);
    expect(t.cursor).toEqual({ x: 4, y: 4 });
  });

  it('the hero, the sheet or Confirm bring it back on the same row', () => {
    const { t, tap } = turn();
    tap(empty);
    tap({ x: 1, y: 1 });
    expect(t.closed).toBe(false);
    tap(empty);
    t.menu({ k: 'open' });
    expect(t.closed).toBe(false);
    tap(empty);
    t.key({ k: 'confirm' });
    expect(t.closed).toBe(false);
    expect(t.screen).toEqual(menu); // the confirm only opened: Move was not chosen
  });

  it('shut, the arrows walk the cursor on the map', () => {
    const { t, tap } = turn();
    tap(empty);
    t.key({ k: 'cursor', dir: 'right' });
    expect(t.cursor).toEqual({ x: 4, y: 4 });
    expect(t.closed).toBe(true);
  });

  it('another unit opens its mini menu; Show range paints until the next tap, which does nothing else', async () => {
    const { t, tap } = turn();
    const notes: Note[] = [];
    const drop = fill('note', (n) => void notes.push(n));
    tap({ x: 5, y: 1 });
    expect(notes).toHaveLength(0); // a map tap opens it after its own click (hero-turn.ts)
    await new Promise((r) => setTimeout(r));
    expect(notes[0].title).toContain('inimigo');
    expect(notes[0].buttons.map((x) => x.label)).toEqual(['Status', 'Habilidades', 'Mostrar alcance']);
    notes[0].buttons[2].run?.();
    expect(t.range).toBe('b');
    tap(empty);
    expect(t.range).toBeNull();
    expect(t.closed).toBe(false); // that tap only closed the range
    t.card('b'); // its turn card opens the same mini menu
    notes[1].buttons[2].run?.();
    expect(t.range).toBe('b');
    t.key({ k: 'cancel' });
    expect(t.range).toBeNull();
    expect(t.closed).toBe(false);
    // the keys: shut, the cursor walked onto the enemy, Confirm opens its mini menu
    tap({ x: 4, y: 1 });
    t.key({ k: 'cursor', dir: 'right' });
    t.key({ k: 'confirm' });
    expect(notes).toHaveLength(3);
    drop();
  });

  it('a new screen shows the menu again', () => {
    const { t, tap } = turn();
    tap(empty);
    t.screen = { k: 'menu', index: commandIndex('act') };
    expect(t.closed).toBe(false);
  });

  it('the help line says how to bring the menu back and whose range shows', () => {
    const b = duel();
    const v: HudView = {
      battle: b,
      screen: menu,
      hl: null,
      busy: false,
      log: '',
      acting: null,
      cursor: empty,
      face: () => 'neutral',
      closed: true,
    };
    expect(helpText(v, true, true)).toBe('Menu: toque no herói ou na ficha.');
    expect(helpText(v, true, false)).toBe('Menu: confirme ou clique no herói.');
    expect(helpText({ ...v, range: 'b' }, true, true)).toBe('Alcance: Soldado. Toque para fechar.');
  });
});
