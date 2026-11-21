import { describe, expect, it } from 'vitest';
import type { ActRef } from '../src/client/act-flow.ts';
import { actMarks } from '../src/client/act-marks.ts';
import { type ActHost, actHover, actPick } from '../src/client/act-turn.ts';
import { cancelStep, type Screen } from '../src/client/command.ts';
import { menuView } from '../src/client/menu3d/menu-view.ts';
import { Battle } from '../src/shared/battle/battle.ts';
import type { BattleEvent } from '../src/shared/battle/types.ts';
import { flat, stateOf } from './battle-helpers.ts';

// Fernando, Nov 20 ("Escolha no fim"): a dual action with both slots free asks main or secondary as the last step
const battle = () => {
  const s = stateOf([
    { id: 'r', def: 'rogue', team: 'hero', x: 1, y: 2 },
    { id: 'f', def: 'soldier', team: 'enemy', x: 4, y: 2 },
  ]);
  s.scenario = 'ash_wood';
  return new Battle(flat(8, 5), s);
};
const only: ActRef = { k: 'ability', id: 'throwing_knife' };
const host = (b: Battle) => {
  const ran: BattleEvent[][] = [];
  const h: ActHost & { ran: BattleEvent[][] } = {
    battle: b,
    screen: { k: 'targets', index: 0, only },
    ran,
    remember: () => {},
    update: () => {},
    focus: () => {},
    runAct: async (run) => void ran.push(run(b)),
    at: (p) => p,
  };
  return h;
};
// confirms on the focused row until the slot step opens or the action runs
const toStep = async (h: ReturnType<typeof host>) => {
  await actPick(h, 0);
  while (!h.ran.length && !(h.screen.k === 'spot' && h.screen.slot))
    await actPick(h, h.screen.k === 'spot' ? h.screen.index : 0);
};

describe('the slot step of a dual action (Nov 20)', () => {
  it('asks main or secondary, shows the half on the secondary and runs it there', async () => {
    const b = battle();
    const h = host(b);
    await toStep(h);
    expect(h.screen).toMatchObject({ k: 'spot', slot: 'main' });
    const view = menuView({ battle: b, screen: h.screen } as never, true)!;
    expect(view.sub!.map((r) => r.label)).toEqual(['Ação principal · 100%', 'Secundária · 50%']);
    const full = actMarks(b, h.screen as never).preview!.targets[0];
    actHover(h, 1);
    expect(h.screen).toMatchObject({ slot: 'bonus' });
    const half = actMarks(b, h.screen as never).preview!.targets[0];
    expect(half.dmgMax).toBe(Math.floor(full.dmgMax / 2));
    // Cancel leaves the step for the tile choice
    expect(cancelStep(b, h.screen as Screen)).not.toHaveProperty('slot');
    await actPick(h, 1);
    expect(h.ran).toHaveLength(1);
    expect(b.state.turn).toMatchObject({ main: null, bonus: 'throwing_knife' });
  });

  it('with the main slot spent it skips the step and goes to the secondary', async () => {
    const b = battle();
    b.state.turn.main = 'stab';
    const h = host(b);
    await toStep(h);
    expect(h.ran).toHaveLength(1);
    expect(b.state.turn.bonus).toBe('throwing_knife');
  });
});
