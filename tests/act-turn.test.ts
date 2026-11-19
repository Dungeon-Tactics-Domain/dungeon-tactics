import { describe, expect, it } from 'vitest';
import { actMarks } from '../src/client/act-marks.ts';
import { type ActHost, actFirstOn, actKey, actPick, actTap } from '../src/client/act-turn.ts';
import type { Screen } from '../src/client/command.ts';
import { menuView } from '../src/client/menu3d/menu-view.ts';
import { store } from '../src/client/store.ts';
import { Battle } from '../src/shared/battle/battle.ts';
import type { BattleEvent } from '../src/shared/battle/types.ts';
import { flat, stateOf } from './battle-helpers.ts';

const battle = () => {
  const s = stateOf([
    { id: 'm', def: 'mage', team: 'hero', x: 1, y: 2 },
    { id: 'w', def: 'warrior', team: 'hero', x: 2, y: 3, hp: 40 },
    { id: 'near', def: 'soldier', team: 'enemy', x: 5, y: 2 },
  ]);
  s.bag = { life_potion: 1 };
  s.scenario = 'ash_wood'; // no Beacon: walking keeps the battle on
  return new Battle(flat(14, 5), s);
};
const host = (b: Battle, screen: Screen) => {
  const ran: BattleEvent[][] = [];
  const h: ActHost & { ran: BattleEvent[][] } = {
    battle: b,
    screen,
    ran,
    update: () => {},
    focus: () => {},
    runAct: async (run) => void ran.push(run(b)),
  };
  return h;
};

describe('Agir primeiro screens on the turn (act-turn.ts, Nov 19)', () => {
  it('is on until the Options switch turns it off', () => {
    store.set('dt:act-first', '');
    expect(actFirstOn()).toBe(true);
    store.set('dt:act-first', 'false');
    expect(actFirstOn()).toBe(false);
    store.set('dt:act-first', '');
  });

  it('target, action, tile: Confirm goes one screen on each time and the last one runs it', async () => {
    const b = battle();
    const h = host(b, { k: 'targets', index: 0 });
    await actPick(h, 0); // the enemy
    expect(h.screen).toMatchObject({ k: 'actions', target: { unit: 'near' }, index: 0 });
    actKey(h, { k: 'confirm' });
    expect(h.screen.k).toBe('spot');
    await actPick(h, (h.screen as { index: number }).index);
    expect(h.ran[0].some((e) => e.k === 'attack' || e.k === 'charge')).toBe(true);
  });

  it('up and down skip the off actions; a tap on a unit picks its row', () => {
    const b = battle();
    const h = host(b, { k: 'targets', index: 0 });
    expect(actTap(h, { x: 2, y: 3 })).toBe(true); // the warrior's row
    expect(h.screen).toMatchObject({ k: 'targets', index: 1 });
    h.screen = { k: 'actions', target: { k: 'unit', unit: 'near', pos: { x: 5, y: 2 } }, index: 0 };
    for (let i = 0; i < 6; i++) actKey(h, { k: 'cursor', dir: 'down' });
    const view = menuView({ battle: b, screen: h.screen } as never, true)!;
    expect(view.sub![view.subIndex].off).toBe(false);
  });

  it('the 3D menu shows the lists with their head, and an off action says why', () => {
    const b = battle();
    const v = menuView({ battle: b, screen: { k: 'targets', index: 0 } } as never, true)!;
    expect(v.subTitle).toBe('Alvo');
    const notes = v.sub!.map((r) => r.note.split(' · ')[0]);
    expect(notes.slice(0, 3)).toEqual(['inimigo', 'aliado', 'você']);
    expect(notes.slice(3).every((n) => n === 'na área')).toBe(true); // the direct actions come last
    const acts = menuView(
      {
        battle: b,
        screen: { k: 'actions', target: { k: 'unit', unit: 'near', pos: { x: 5, y: 2 } }, index: 0 },
      } as never,
      true,
    )!;
    const potion = acts.sub!.at(-1)!;
    expect(potion).toMatchObject({ label: 'Poção de vida', off: true, note: 'não atinge este alvo' });
  });

  it('the map marks the listed targets and, on the tile choice, the picked tile with its forecast', () => {
    const b = battle();
    const t = actMarks(b, { k: 'targets', index: 0 });
    expect(t.tiles.some((m) => m.kind === 'target' && m.pos.x === 5 && m.pos.y === 2)).toBe(true);
    const target = { k: 'unit' as const, unit: 'near', pos: { x: 5, y: 2 } };
    const s = actMarks(b, { k: 'spot', target, action: 0, index: 0 });
    expect(s.preview?.ok).toBe(true);
  });
});
