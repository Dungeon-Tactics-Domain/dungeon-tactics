import { describe, expect, it } from 'vitest';
import { type ActRef, actActions, actAims, actGroup, actList, actTargets } from '../src/client/act-flow.ts';
import { actMarks } from '../src/client/act-marks.ts';
import { type ActHost, actHoverMap, actKey, actPick, actStart, actTap } from '../src/client/act-turn.ts';
import { itemDetail } from '../src/client/battle-text.ts';
import { cancelStep, type Screen } from '../src/client/command.ts';
import { helpText } from '../src/client/hud-menus.ts';
import { menuView } from '../src/client/menu3d/menu-view.ts';
import { ABILITIES, defaultLock } from '../src/shared/battle/abilities.ts';
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
// the default camera's diamond: grid x goes down-right on screen, grid y down-left
const diamond = (p: { x: number; y: number }) => ({ x: (p.x - p.y) * 32, y: (p.x + p.y) * 16 });
const host = (b: Battle, screen: Screen) => {
  const ran: BattleEvent[][] = [];
  const h: ActHost & { ran: BattleEvent[][]; last?: ActRef } = {
    battle: b,
    screen,
    ran,
    remember: (r) => void (h.last = r),
    update: () => {},
    focus: () => {},
    runAct: async (run) => void ran.push(run(b)),
    at: diamond,
  };
  return h;
};

describe('the Agir list (Fernando, Nov 19 grill: variant A, Agir on top)', () => {
  const rowsOf = (b: Battle) => menuView({ battle: b, screen: { k: 'acts', index: 0 } } as never, true)!.sub!;

  // Fernando, Nov 19: the cursor passes over an off row to read its sheet and see its reach; Confirm only says no
  it('an off row takes the cursor, shows its sheet and reach, and Confirm on it stays put', async () => {
    const b = battle();
    b.state.turn.main = 'firebolt'; // the main action spent: Raio de fogo is off
    const h = host(b, { k: 'acts', index: 0 });
    actKey(h, { k: 'cursor', dir: 'down' });
    expect(h.screen).toEqual({ k: 'acts', index: 1 });
    const view = menuView({ battle: b, screen: h.screen } as never, true)!;
    expect(view.sub![1].off).toBe(true);
    expect(view.sheet?.name).toBe('Raio de fogo');
    expect(actMarks(b, h.screen as never).tiles.some((t) => t.kind === 'range')).toBe(true);
    await actPick(h, 1);
    expect(h.screen).toEqual({ k: 'acts', index: 1 });
  });

  it('the Agir row shows the two actions as dots and why nothing can be done; it still opens', () => {
    const b = battle();
    const note = () => menuView({ battle: b, screen: { k: 'menu', index: 0 } } as never, true)!.rows[0].note;
    expect(note()).toBe('⬤ ●');
    b.state.turn.main = 'firebolt';
    expect(note()).toBe('◯ ●');
    b.state.turn.bonus = 'heal';
    expect(note()).toBe('sem ações  ◯ ○');
    expect(menuView({ battle: b, screen: { k: 'menu', index: 0 } } as never, true)!.rows[0].off).toBe(false);
  });

  it('each row on says how many targets of its own side its target list will show', () => {
    const b = battle();
    const count = (n: number) => (n > 1 ? `${n} alvos` : '1 alvo');
    const rows = rowsOf(b);
    actList(b).forEach((r, i) => {
      if (r.k === 'pick' || !r.enabled) return expect(rows[i].note).not.toMatch(/alvo/);
      if (r.k === 'group') return expect(rows[i].note).toBe(count(r.reach));
      const n = actTargets(b, r).filter((t) => t.k !== 'side').length;
      expect(n).toBeGreaterThan(0);
      expect(rows[i].note).toContain(count(n));
    });
    // Raio de fogo can hit the warrior too, but it counts its foes only: the soldier
    expect(rows[1]).toMatchObject({ label: 'Raio de fogo', note: expect.stringContaining('1 alvo') });
  });

  it('opens on the last action run while it is on (its group for one in a group), else on Escolher alvo', async () => {
    const b = battle();
    const magic = actList(b).findIndex((r) => r.k === 'group' && r.group === 'magic');
    const h = host(b, { k: 'acts', index: magic });
    await actPick(h, magic); // Magias opens its column
    expect(h.screen).toMatchObject({ k: 'group', group: 'magic' });
    await actPick(
      h,
      actGroup(b, 'magic').findIndex((r) => r.id === 'heal'),
    ); // the heal's targets
    await actPick(h, 0); // the first target
    while (h.ran.length === 0) await actPick(h, h.screen.k === 'spot' || h.screen.k === 'aim' ? h.screen.index : 0);
    expect(h.last).toEqual({ k: 'ability', id: 'heal' });
    const fresh = battle();
    expect(actStart(fresh, h.last)).toEqual({ k: 'acts', index: magic });
    fresh.state.turn.bonus = 'heal'; // its slot spent: the list opens on its first row
    fresh.state.turn.main = 'firebolt';
    expect(actStart(fresh, h.last)).toEqual({ k: 'acts', index: 0 });
    expect(actStart(fresh)).toEqual({ k: 'acts', index: 0 });
  });

  // Fernando's grill, Nov 19: the basic attack straight to its targets, a group with no action left out, each group in a third column where the second was, the second over the menu's place
  it('Escolher alvo, the basic attack, then Magias and Itens in a column of their own; a spent slot greys its rows', async () => {
    const b = battle();
    expect(rowsOf(b).map((r) => r.label)).toEqual(['Escolher alvo', 'Raio de fogo', 'Técnicas', 'Magias', 'Itens']);
    const h = host(b, { k: 'acts', index: 3 });
    await actPick(h, 3);
    const view = menuView({ battle: b, screen: h.screen } as never, true)!;
    expect(view).toMatchObject({ head: 'Agir', index: 3, depth: 2, subTitle: 'Magias' });
    expect(view.rows.map((r) => r.label)).toEqual(['Escolher alvo', 'Raio de fogo', 'Técnicas', 'Magias', 'Itens']);
    expect(view.sub!.map((r) => r.label)).toEqual(['Explosão', 'Rajada', 'Cura']);
    expect(view.sub![2].note).toMatch(/^secundária/);
    expect(cancelStep(b, h.screen as Screen)).toEqual({ k: 'acts', index: 3 });
    b.state.turn.main = 'firebolt'; // the main action is spent: only the secondary ones stay on
    expect(rowsOf(b).find((r) => r.label === 'Raio de fogo')).toMatchObject({ off: true, below: true });
    expect(rowsOf(b).find((r) => r.label === 'Magias')!.off).toBe(false); // Cura is still on
  });

  it('an ability picked on the list lists only who it hits, goes straight to its tiles, and Cancel walks back', async () => {
    const b = battle();
    const row = rowsOf(b).findIndex((r) => r.label === 'Raio de fogo');
    const h = host(b, { k: 'acts', index: row });
    await actPick(h, row);
    const only = { k: 'ability' as const, id: 'firebolt' };
    expect(h.screen).toEqual({ k: 'targets', index: 0, only });
    const names = () => menuView({ battle: b, screen: h.screen } as never, true)!.sub!.map((r) => r.label);
    // who Raio de fogo can hit this turn: its foes, then the row that swaps to the allies it would hit (friendly fire)
    expect(names()).toEqual(['Soldado', 'Escolher aliados']);
    await actPick(h, 1);
    expect(h.screen).toEqual({ k: 'targets', index: 0, only, other: true });
    expect(names()).toEqual(['Guerreiro', 'Escolher inimigos']);
    expect(cancelStep(b, h.screen as Screen)).toEqual({ k: 'targets', index: 1, only }); // back on the swap row
    await actPick(h, 1);
    expect(names()).toEqual(['Soldado', 'Escolher aliados']);
    await actPick(h, 0);
    expect(h.screen).toMatchObject({ k: 'spot', only }); // no actions screen: the action is already chosen
    const back: string[] = [];
    let s: Screen | 'undo' | null = h.screen;
    while (s && s !== 'undo') {
      back.push(s.k);
      s = cancelStep(b, s);
    }
    expect(back).toEqual(['spot', 'targets', 'acts', 'menu']);
    expect(cancelStep(b, { k: 'targets', index: 0, only })).toEqual({ k: 'acts', index: row }); // back on its row
  });

  it('on the target list left and right walk the units on the map as seen; up and down stay the list', () => {
    const b = battle(); // targets: the soldier (5,2), the warrior (2,3), the mage itself (1,2)
    const h = host(b, { k: 'targets', index: 0 });
    actKey(h, { k: 'cursor', dir: 'left' }); // on the diamond the warrior (2,3) is left of the soldier (5,2)
    const left = (h.screen as { index: number }).index;
    expect(left).not.toBe(0);
    const t = actTargets(b)[left] as { pos: { x: number; y: number } };
    expect(diamond(t.pos).x).toBeLessThan(diamond({ x: 5, y: 2 }).x);
    actKey(h, { k: 'cursor', dir: 'down' });
    expect((h.screen as { index: number }).index).toBe(left + 1); // the list order
  });

  it('the target list says how far each unit is from the actor where it stands now', () => {
    const notes = menuView({ battle: battle(), screen: { k: 'targets', index: 0 } } as never, true)!.sub!.map(
      (r) => r.note,
    );
    expect(notes[0]).toMatch(/^\d+\/\d+ · \d+ casas?$/); // the icon says enemy or ally; the note stays short
    expect(notes[2]).toMatch(/· você$/); // no distance to itself
  });
});

describe('the action sheet pages (Fernando, Nov 19: "Ficha da habilidade no Agir")', () => {
  const target = { k: 'unit' as const, unit: 'near', pos: { x: 5, y: 2 } };
  it('left and right turn the pages back and forth around the three; Details goes on; the list stays', () => {
    const h = host(battle(), { k: 'actions', target, index: 0 });
    const page = () => (h.screen as { page?: number }).page ?? 0;
    actKey(h, { k: 'cursor', dir: 'right' });
    expect(page()).toBe(1);
    actKey(h, { k: 'info' });
    expect(page()).toBe(2);
    actKey(h, { k: 'cursor', dir: 'right' });
    expect(page()).toBe(0);
    actKey(h, { k: 'cursor', dir: 'left' });
    expect(page()).toBe(2);
    expect(h.screen).toMatchObject({ k: 'actions', index: 0 });
  });

  it('another action opens on the first page; off the action list the keys turn nothing', () => {
    const b = battle();
    const h = host(b, { k: 'actions', target, index: 0, page: 2 });
    actKey(h, { k: 'cursor', dir: 'down' });
    expect(h.screen).toMatchObject({ k: 'actions', index: 1 });
    expect((h.screen as { page?: number }).page).toBeUndefined();
    const t = host(b, { k: 'targets', index: 0 });
    actKey(t, { k: 'info' });
    actKey(t, { k: 'cursor', dir: 'right' });
    expect(t.screen).toEqual({ k: 'targets', index: 0 });
  });
});

describe('Agir primeiro screens on the turn (act-turn.ts, Nov 19)', () => {
  it('target, action, tile: Confirm goes one screen on each time and the last one runs it', async () => {
    const b = battle();
    const h = host(b, { k: 'targets', index: 0 });
    await actPick(h, 0); // the enemy
    expect(h.screen).toMatchObject({ k: 'actions', target: { unit: 'near' }, index: 0 });
    actKey(h, { k: 'confirm' });
    expect(h.screen.k).toBe('spot');
    await actPick(h, (h.screen as { index: number }).index);
    if ((h.screen as { lock?: string }).lock) actKey(h, { k: 'confirm' }); // a charge: the lock step first
    expect(h.ran[0].some((e) => e.k === 'attack' || e.k === 'charge')).toBe(true);
  });

  it('a charge aimed at a unit asks where to lock it before it walks, and runs locked there', async () => {
    const b = battle();
    const target = { k: 'unit' as const, unit: 'near', pos: { x: 5, y: 2 } };
    const i = actActions(b, target).findIndex((a) => a.enabled && a.k === 'ability' && ABILITIES[a.id].charge > 0);
    expect(i).toBeGreaterThanOrEqual(0);
    const id = actActions(b, target)[i].id;
    const h = host(b, { k: 'actions', target, index: i });
    actKey(h, { k: 'confirm' });
    // an area charge picks its aim first: on the target itself, so it can lock on the character
    const onTarget = actAims(actActions(b, target)[i]).findIndex((p) => p.x === 5 && p.y === 2);
    if (h.screen.k === 'aim') await actPick(h, onTarget);
    const aim = (h.screen as { aim?: { x: number; y: number } }).aim;
    const spot = (h.screen as { index: number }).index;
    await actPick(h, spot);
    expect(h.screen).toMatchObject({ k: 'spot', index: spot, lock: defaultLock(ABILITIES[id]) });
    expect(h.ran).toHaveLength(0); // nothing walked yet
    const v = menuView({ battle: b, screen: h.screen } as never, true)!;
    expect(v.subTitle).toMatch(/travar onde\?$/);
    expect(v.sub!.map((r) => r.label)).toEqual(['No personagem', 'Na casa']);
    expect(helpText({ battle: b, screen: h.screen } as never, true, false)).toMatch(/travar onde\?$/);
    actKey(h, { k: 'cursor', dir: 'down' });
    expect(h.screen).toMatchObject({ lock: 'tile' });
    expect(cancelStep(b, h.screen)).toEqual({ k: 'spot', target, action: i, index: spot, aim }); // back to the tiles
    expect(actTap(h, { x: 0, y: 0 })).toBe(true); // a tap on the map does not run it
    expect(h.ran).toHaveLength(0);
    actKey(h, { k: 'confirm' });
    expect(h.ran[0].some((e) => e.k === 'charge')).toBe(true);
    expect(b.state.charges.at(-1)).toMatchObject({ ability: id, follow: null }); // on the tile, as picked
  });

  it('an area picks where it lands first, then only the tiles aiming there (Nov 19)', async () => {
    const b = battle();
    const target = { k: 'unit' as const, unit: 'near', pos: { x: 5, y: 2 } };
    const i = actActions(b, target).findIndex((a) => a.enabled && actAims(a).length > 1);
    expect(i).toBeGreaterThanOrEqual(0); // an area centred on the target or next to it
    const aims = actAims(actActions(b, target)[i]);
    const h = host(b, { k: 'actions', target, index: i });
    await actPick(h, i);
    expect(h.screen.k).toBe('aim');
    expect(helpText({ battle: b, screen: h.screen } as never, true, false)).toBe(
      'Área: escolha onde mirar e confirme.',
    );
    expect(menuView({ battle: b, screen: h.screen } as never, true)).toBeNull(); // the map is the choice
    const pick = aims.findIndex((p) => p.x !== target.pos.x || p.y !== target.pos.y);
    await actPick(h, pick);
    expect(h.screen).toMatchObject({ k: 'spot', aim: aims[pick] });
    const marks = actMarks(b, h.screen as Extract<Screen, { k: 'spot' }>);
    expect(marks.preview?.targets.some((x) => x.unit === 'near')).toBe(true); // that aim still hits the target
    expect(marks.tiles.some((m) => m.kind === 'area')).toBe(true); // and its area is lit
    const onAim = actMarks(b, { k: 'aim', target, action: i, index: pick });
    expect(onAim.tiles.some((m) => m.kind === 'area')).toBe(true);
    expect(cancelStep(b, h.screen)).toEqual({ k: 'aim', target, action: i, index: pick });
    expect(cancelStep(b, { k: 'aim', target, action: i, index: pick })).toEqual({ k: 'actions', target, index: i });
  });

  it('an arrow on the map goes to a point that way on screen, never on a slant, on the diamond view (Nov 19)', async () => {
    const b = battle();
    const target = { k: 'unit' as const, unit: 'near', pos: { x: 5, y: 2 } };
    const i = actActions(b, target).findIndex((a) => a.enabled && actAims(a).length > 1);
    const aims = actAims(actActions(b, target)[i]);
    const ways = { right: [1, 0], left: [-1, 0], down: [0, 1], up: [0, -1] } as const;
    let moved = 0;
    for (const [dir, [wx, wy]] of Object.entries(ways))
      for (let from = 0; from < aims.length; from++) {
        const h = host(b, { k: 'aim', target, action: i, index: from });
        actKey(h, { k: 'cursor', dir: dir as keyof typeof ways });
        const to = (h.screen as { index: number }).index;
        if (to === from) continue;
        moved++;
        const a = diamond(aims[from]),
          c = diamond(aims[to]);
        const ahead = (c.x - a.x) * wx + (c.y - a.y) * wy,
          aside = Math.abs((c.x - a.x) * wy - (c.y - a.y) * wx);
        expect(ahead).toBeGreaterThan(0);
        expect(aside).toBeLessThanOrEqual(ahead); // within 45° of the arrow on screen
      }
    expect(moved).toBeGreaterThan(0);
  });

  it('the pointer focuses an aim without sliding the camera, so a 2nd click on the same pixel goes on (Nov 19)', async () => {
    const b = battle();
    const target = { k: 'unit' as const, unit: 'near', pos: { x: 5, y: 2 } };
    const i = actActions(b, target).findIndex((a) => a.enabled && actAims(a).length > 1);
    const aims = actAims(actActions(b, target)[i]);
    const h = host(b, { k: 'aim', target, action: i, index: 0 });
    let slid = 0;
    h.focus = () => void slid++;
    actHoverMap(h, aims[1]);
    expect(h.screen).toMatchObject({ k: 'aim', index: 1 });
    actTap(h, aims[2]);
    expect(h.screen).toMatchObject({ k: 'aim', index: 2 });
    expect(slid).toBe(0);
  });

  it('the help line says what to pick and what an item does', () => {
    const b = battle();
    const help = (screen: Screen) => helpText({ battle: b, screen } as never, true, false);
    expect(help({ k: 'targets', index: 0 })).toBe('Alvo: escolha quem e confirme.');
    const ally = { k: 'unit' as const, unit: 'w', pos: { x: 2, y: 3 } };
    const potion = actActions(b, ally).findIndex((a) => a.k === 'item');
    expect(help({ k: 'actions', target: ally, index: potion })).toMatch(/^Poção de vida: cura \d+$/);
    expect(help({ k: 'spot', target: ally, action: potion, index: 0 })).toMatch(/^Poção de vida: cura \d+$/);
    // an ability's detail is on its sheet: the line stays short (it was tiny on a phone)
    expect(help({ k: 'actions', target: ally, index: 0 })).toMatch(/: confirme para seguir\.$/);
    expect(itemDetail('stone_potion')).toBe('por 3 turnos: +30% de resistência a dano físico, -1 de movimento');
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
    expect(v.sub!.slice(0, 3).map((r) => r.kind)).toEqual(['sword', 'shield', 'shield']); // enemy, ally, you
    expect(v.sub!.slice(3).every((r) => r.note === 'na área')).toBe(true); // the direct actions come last
    const acts = menuView(
      {
        battle: b,
        screen: { k: 'actions', target: { k: 'unit', unit: 'near', pos: { x: 5, y: 2 } }, index: 0 },
      } as never,
      true,
    )!;
    const potion = acts.sub!.at(-1)!;
    expect(potion).toMatchObject({ label: 'Poção de vida', off: true, note: 'secundária · não atinge este alvo' }); // only the secondary ones carry a tag
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
