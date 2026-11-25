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
    const h = host(b, { k: 'acts', index: 1 }); // Pick allies; the next row is Raio de fogo
    actKey(h, { k: 'cursor', dir: 'down' });
    expect(h.screen).toEqual({ k: 'acts', index: 2 });
    const view = menuView({ battle: b, screen: h.screen } as never, true)!;
    expect(view.sub![2].off).toBe(true);
    expect(view.sheet?.name).toBe('Raio de fogo');
    expect(actMarks(b, h.screen as never).tiles.some((t) => t.kind === 'range')).toBe(true);
    await actPick(h, 2);
    expect(h.screen).toEqual({ k: 'acts', index: 2 });
  });

  it('the Agir row shows the two actions as dots and why nothing can be done; greyed with none left (Nov 21)', () => {
    const b = battle();
    const note = () => menuView({ battle: b, screen: { k: 'menu', index: 0 } } as never, true)!.rows[0].note;
    expect(note()).toBe('⬤ ●');
    b.state.turn.main = 'firebolt';
    expect(note()).toBe('◯ ●');
    b.state.turn.bonus = 'heal';
    expect(note()).toBe('sem ações  ◯ ○');
    expect(menuView({ battle: b, screen: { k: 'menu', index: 0 } } as never, true)!.rows[0].off).toBe(true);
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
    expect(rows[2]).toMatchObject({ label: 'Raio de fogo', note: expect.stringContaining('1 alvo') });
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
    while (h.ran.length === 0) await actPick(h, h.screen.k === 'spot' ? h.screen.index : 0);
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
    const labels = ['Escolher alvo', 'Escolher aliados', 'Raio de fogo', 'Técnicas', 'Magias', 'Itens'];
    expect(rowsOf(b).map((r) => r.label)).toEqual(labels);
    const h = host(b, { k: 'acts', index: 4 });
    await actPick(h, 4);
    const view = menuView({ battle: b, screen: h.screen } as never, true)!;
    expect(view).toMatchObject({ head: 'Agir', index: 4, depth: 2, subTitle: 'Magias' });
    expect(view.rows.map((r) => r.label)).toEqual(labels);
    expect(view.sub!.map((r) => r.label)).toEqual(['Explosão', 'Rajada', 'Cura']);
    expect(view.sub![2].note).toMatch(/^secundária/);
    expect(cancelStep(b, h.screen as Screen)).toEqual({ k: 'acts', index: 4 });
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
    // two enemies: the soldier (5,2) and a second one at (2,4), left of it on the diamond (allies list apart since Nov 25)
    const b = new Battle(
      flat(14, 5),
      stateOf([
        { id: 'm', def: 'mage', team: 'hero', x: 1, y: 2 },
        { id: 'near', def: 'soldier', team: 'enemy', x: 5, y: 2 },
        { id: 'e2', def: 'soldier', team: 'enemy', x: 2, y: 4 },
      ]),
    );
    const at = actTargets(b).findIndex((r) => r.k === 'unit' && r.unit === 'near');
    const h = host(b, { k: 'targets', index: at });
    actKey(h, { k: 'cursor', dir: 'left' });
    const left = (h.screen as { index: number }).index;
    expect(left).not.toBe(at);
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
    const allies = menuView({ battle: battle(), screen: { k: 'targets', index: 0, other: true } } as never, true)!.sub!;
    expect(allies[1].note).toMatch(/· você$/); // no distance to itself
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
    if (h.screen.k === 'aim') {
      h.screen = { ...h.screen, at: target.pos };
      await actPick(h, 0);
    }
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
    expect(h.screen).toMatchObject({ k: 'aim', at: target.pos }); // snapped on the picked target first (Nov 21)
    const pick = aims.find((p) => p.x !== target.pos.x || p.y !== target.pos.y)!;
    h.screen = { ...(h.screen as Extract<Screen, { k: 'aim' }>), at: pick };
    await actPick(h, 0);
    expect(h.screen).toMatchObject({ k: 'spot', aim: pick });
    const marks = actMarks(b, h.screen as Screen as Extract<Screen, { k: 'spot' }>);
    expect(marks.preview?.targets.some((x) => x.unit === 'near')).toBe(true); // that aim still hits the target
    expect(marks.tiles.some((m) => m.kind === 'area')).toBe(true); // and its area is lit
    const onAim = actMarks(b, { k: 'aim', target, action: i, at: pick });
    expect(onAim.tiles.some((m) => m.kind === 'area')).toBe(true);
    expect(cancelStep(b, h.screen)).toEqual({ k: 'aim', target, action: i, at: pick });
    expect(cancelStep(b, { k: 'aim', target, action: i, at: pick })).toEqual({ k: 'actions', target, index: i });
  });

  // Fernando, Nov 21: "snap on the chosen target first, then free on the grid": one tile per arrow, anywhere
  it('the aim cursor walks one tile at a time that way on screen, also where the area cannot land', () => {
    const b = battle();
    const target = { k: 'unit' as const, unit: 'near', pos: { x: 5, y: 2 } };
    const i = actActions(b, target).findIndex((a) => a.enabled && actAims(a).length > 1);
    const ways = { right: [1, 0], left: [-1, 0], down: [0, 1], up: [0, -1] } as const;
    for (const [dir, [wx, wy]] of Object.entries(ways)) {
      const h = host(b, { k: 'aim', target, action: i, at: { x: 7, y: 2 } });
      actKey(h, { k: 'cursor', dir: dir as keyof typeof ways });
      const to = (h.screen as { at: { x: number; y: number } }).at;
      expect(Math.max(Math.abs(to.x - 7), Math.abs(to.y - 2))).toBe(1); // one tile, a neighbour
      const a = diamond({ x: 7, y: 2 }),
        c = diamond(to);
      const ahead = (c.x - a.x) * wx + (c.y - a.y) * wy,
        aside = Math.abs((c.x - a.x) * wy - (c.y - a.y) * wx);
      expect(ahead).toBeGreaterThan(0);
      // along a grid axis (Nov 24): on the 2:1 diamond an axis is 27° off left and right, 63° off up and down
      expect(aside).toBeLessThanOrEqual(2 * ahead);
    }
    // far off, where nothing is in reach: the cursor goes there, Confirm says no and stays
    const h = host(b, { k: 'aim', target, action: i, at: { x: 13, y: 4 } });
    void actPick(h, 0);
    expect(h.screen).toMatchObject({ k: 'aim', at: { x: 13, y: 4 } });
  });

  // Fernando, Nov 24: "na mira livre o movimento esta bugando com o direcional": on the diamond view the arrow sat between
  // two grid axes and the cursor zigzagged; now each arrow keeps one axis, so five presses run a straight line
  it('on the diamond view each arrow keeps one grid axis, five presses in a straight line', () => {
    const b = battle();
    const target = { k: 'unit' as const, unit: 'near', pos: { x: 5, y: 2 } };
    const i = actActions(b, target).findIndex((a) => a.enabled && actAims(a).length > 1);
    const axes = new Set<string>();
    for (const dir of ['left', 'up', 'right', 'down'] as const) {
      const h = host(b, { k: 'aim', target, action: i, at: { x: 7, y: 2 } });
      const seen: { x: number; y: number }[] = [];
      for (let n = 0; n < 5; n++) {
        actKey(h, { k: 'cursor', dir });
        seen.push((h.screen as { at: { x: number; y: number } }).at);
      }
      const steps = seen.map((p, n) => {
        const q = n ? seen[n - 1] : { x: 7, y: 2 };
        return `${p.x - q.x},${p.y - q.y}`;
      });
      const moved = steps.filter((d) => d !== '0,0');
      expect(new Set(moved).size, dir).toBe(1); // one direction only, no zigzag
      expect(moved[0].split(',').filter((v) => v !== '0')).toHaveLength(1); // a grid axis, not a diagonal
      axes.add(moved[0]);
    }
    expect(axes.size).toBe(4); // the four arrows, the four ways
    // on the map's corner the arrows still answer; the scene has no tile to measure off the map (it threw there)
    const h = host(b, { k: 'aim', target, action: i, at: { x: 0, y: 0 } });
    h.at = (p) => {
      if (p.x < 0 || p.y < 0 || p.x >= 14 || p.y >= 5) throw new Error(`no tile at ${p.x},${p.y}`);
      return diamond(p);
    };
    for (const dir of ['left', 'up', 'right', 'down'] as const) actKey(h, { k: 'cursor', dir });
    expect((h.screen as { at: { x: number; y: number } }).at).toEqual({ x: 1, y: 1 });
  });

  // Fernando, Nov 24: "toda magia em area msm se vc escolha um target a selecao deve ser livre"; he picked "Pode lançar no
  // vazio": an empty tile in reach takes the aim, and the charge is queued on it hitting no one
  it('the aim lands on an empty tile in reach, nobody in the area', async () => {
    const b = battle();
    const target = { k: 'unit' as const, unit: 'near', pos: { x: 5, y: 2 } };
    const i = actActions(b, target).findIndex((a) => a.enabled && actAims(a).length > 1);
    const empty = { x: 7, y: 4 };
    const h = host(b, { k: 'aim', target, action: i, at: empty });
    await actPick(h, 0);
    expect(h.screen).toMatchObject({ k: 'spot', aim: empty });
    expect(actMarks(b, h.screen as Screen as Extract<Screen, { k: 'spot' }>).preview?.targets).toEqual([]);
    await actPick(h, (h.screen as Extract<Screen, { k: 'spot' }>).index);
    expect(b.state.charges.at(-1)).toMatchObject({ unit: 'm', target: empty });
  });

  it('the pointer moves the aim without sliding the camera, so a 2nd click on the same pixel goes on (Nov 19)', async () => {
    const b = battle();
    const target = { k: 'unit' as const, unit: 'near', pos: { x: 5, y: 2 } };
    const i = actActions(b, target).findIndex((a) => a.enabled && actAims(a).length > 1);
    const h = host(b, { k: 'aim', target, action: i, at: target.pos });
    let slid = 0;
    h.focus = () => void slid++;
    actHoverMap(h, { x: 6, y: 2 });
    expect(h.screen).toMatchObject({ k: 'aim', at: { x: 6, y: 2 } });
    expect(slid).toBe(0);
    actTap(h, { x: 6, y: 2 }); // the same tile again goes on to the tiles aiming there
    expect(h.screen.k).toBe('spot');
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
    expect(actTap(h, { x: 2, y: 3 })).toBe(true); // the warrior's row: the list swaps to the allies (Nov 25)
    expect(h.screen).toMatchObject({ k: 'targets', index: 0, other: true });
    h.screen = { k: 'actions', target: { k: 'unit', unit: 'near', pos: { x: 5, y: 2 } }, index: 0 };
    for (let i = 0; i < 6; i++) actKey(h, { k: 'cursor', dir: 'down' });
    const view = menuView({ battle: b, screen: h.screen } as never, true)!;
    expect(view.sub![view.subIndex].off).toBe(false);
  });

  it('the 3D menu shows the lists with their head, and an off action says why', () => {
    const b = battle();
    const v = menuView({ battle: b, screen: { k: 'targets', index: 0 } } as never, true)!;
    expect(v.subTitle).toBe('Alvo');
    expect(v.sub![0]).toMatchObject({ kind: 'sword', plate: 'foe' }); // the enemy on a red plate
    expect(v.sub!.slice(1, -1).every((r) => r.note === 'na área')).toBe(true); // the direct actions after the units
    expect(v.sub!.at(-1)).toMatchObject({ label: 'Escolher aliados', plate: 'ally' }); // the allies behind a blue row
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

// Nov 25, Fernando: "no pick a target tbm deve ter a opcao de target allies"
describe('Pick allies on the Agir list', () => {
  it('opens the allies list, and Cancel from an ally target comes back to that side', async () => {
    const b = battle();
    const h = host(b, { k: 'acts', index: 1 });
    await actPick(h, 1);
    expect(h.screen).toEqual({ k: 'targets', index: 0, other: true });
    expect(menuView({ battle: b, screen: h.screen } as never, true)!.sub!.map((r) => r.label)).toEqual([
      'Guerreiro',
      'Mago',
      'Escolher inimigos',
    ]);
    const ally = actTargets(b, undefined, true)[0];
    expect(cancelStep(b, { k: 'actions', target: ally, index: 0 })).toEqual({ k: 'targets', index: 0, other: true });
    // the allies' list goes back to the enemies' on the row that swaps sides, as one action's lists do
    const swap = actTargets(b).findIndex((r) => r.k === 'side');
    expect(cancelStep(b, { k: 'targets', index: 0, other: true })).toEqual({ k: 'targets', index: swap });
  });
});
