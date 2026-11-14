import { describe, expect, it } from 'vitest';
import { confirm, defaultMode, freshUi, highlights, selectMode, tapTile } from '../src/client/interaction.ts';
import { Battle } from '../src/shared/battle/battle.ts';
import { HIT_SEED, flat, stateOf } from './battle-helpers.ts';

const at = (x: number, y = 0) => ({ x, y });
// current archer with a soldier at shooting range and an ally beside
const scene = () =>
  new Battle(
    flat(8, 3),
    stateOf(
      [
        { id: 'a', def: 'archer', team: 'hero', x: 0, y: 1 },
        { id: 'b', def: 'beacon', team: 'hero', x: 0, y: 0 },
        { id: 'f', def: 'soldier', team: 'enemy', x: 4, y: 1 },
      ],
      HIT_SEED,
    ),
  );
const kinds = (b: Battle, ui: ReturnType<typeof freshUi>, kind: string) =>
  highlights(b, ui)
    .tiles.filter((t) => t.kind === kind)
    .map((t) => t.pos);

describe('two-step touch', () => {
  it('starts in Move and shows the reachable tiles', () => {
    const b = scene();
    const ui = freshUi(b);
    expect(ui.mode).toEqual({ k: 'move' });
    expect(kinds(b, ui, 'move').length).toBe(b.reach().size);
  });

  it('1st tap on a tile marks the destination and path; nothing moves before Confirm', () => {
    const b = scene();
    const ui = tapTile(b, freshUi(b), at(2, 1));
    expect(ui.pending).toEqual(at(2, 1));
    expect(highlights(b, ui).path?.at(-1)).toEqual(at(2, 1));
    expect(b.actor.pos).toEqual(at(0, 1));
    const done = confirm(b, ui);
    expect(b.actor.pos).toEqual(at(2, 1));
    expect(done.events[0].k).toBe('move');
    expect(done.ui.pending).toBeNull();
  });

  it('tile out of reach does not become a destination', () => {
    const b = scene();
    const ui = tapTile(b, freshUi(b), at(7, 2));
    expect(ui.pending).toBeNull();
    expect(confirm(b, ui).events).toEqual([]);
  });

  it('after moving, the default mode is the first ability that has a target', () => {
    const b = scene();
    confirm(b, tapTile(b, freshUi(b), at(1, 2)));
    expect(defaultMode(b)).toEqual({ k: 'ability', id: 'shot' });
  });

  it('after moving with no target in reach, no ability is selected', () => {
    const b = new Battle(
      flat(12, 1),
      stateOf(
        [
          { id: 'a', def: 'warrior', team: 'hero', x: 0, y: 0 },
          { id: 'b', def: 'beacon', team: 'hero', x: 1, y: 0 },
          { id: 'f', def: 'soldier', team: 'enemy', x: 11, y: 0 },
        ],
        HIT_SEED,
      ),
    );
    confirm(b, tapTile(b, freshUi(b), at(2)));
    expect(defaultMode(b)).toEqual({ k: 'idle' });
  });

  it('tapping a tile out of reach warns instead of doing nothing', () => {
    const b = scene();
    expect(tapTile(b, freshUi(b), at(7, 2)).invalid).toBe(true);
    expect(tapTile(b, freshUi(b), at(2, 1)).invalid).toBe(false);
  });

  it('ability: valid target shows the hit % before confirming', () => {
    const b = scene();
    const ui = tapTile(b, selectMode(b, freshUi(b), { k: 'ability', id: 'shot' }), at(4, 1));
    const h = highlights(b, ui);
    expect(ui.pending).toEqual(at(4, 1));
    expect(h.preview?.ok).toBe(true);
    expect(h.preview?.targets[0].chance).toBeGreaterThan(0);
    const hp = b.state.units[2].hp;
    confirm(b, ui);
    expect(b.state.turn.usedAbility).toBe('shot');
    expect(b.state.units[2].hp).toBeLessThanOrEqual(hp);
  });

  it('tapping an enemy out of ability range shows what it threatens', () => {
    const b = scene();
    const ui = tapTile(b, freshUi(b), at(4, 1));
    expect(ui.inspect).toBe('f');
    expect(ui.pending).toBeNull();
    expect(kinds(b, ui, 'threat').length).toBeGreaterThan(0);
  });

  it('spent mode cannot be chosen', () => {
    const b = scene();
    confirm(b, tapTile(b, freshUi(b), at(2, 1)));
    // spends the rest of the movement (Nov 13: moves in parts until movement runs out)
    while (b.reach().size) b.move([...b.reach().values()][0].pos);
    const ui = selectMode(b, freshUi(b), { k: 'move' });
    expect(ui.mode).toEqual({ k: 'ability', id: 'shot' });
  });

  it('with everything done in the turn, there is no mode or marked tile', () => {
    const b = scene();
    confirm(b, tapTile(b, freshUi(b), at(1, 1)));
    confirm(b, tapTile(b, freshUi(b), at(4, 1)));
    expect(defaultMode(b)).toEqual({ k: 'idle' });
    expect(highlights(b, freshUi(b)).tiles.filter((t) => t.kind !== 'actor')).toEqual([]);
  });
});
