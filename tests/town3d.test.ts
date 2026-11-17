import { describe, expect, it } from 'vitest';
import { defaultGroup, RECRUIT_COST, recruit } from '../src/client/group.ts';
import { type Dir, type Hit, neighbour, type Page, seen, step } from '../src/client/town3d/page.ts';
import { PAGES, partyPage } from '../src/client/town3d/party-view.ts';
import { barPage, shopPage } from '../src/client/town3d/shop-view.ts';
import { gatePage, menuPage, soonPage } from '../src/client/town3d/street-view.ts';
import { C, G, M, P, T } from '../src/client/town3d/town-layout.ts';
import { place, REGIONS, stage } from '../src/client/ui3d/layout.ts';

// The town's windows in 3D (?shop=3d, ?party=3d; Nov 17): the pages the drawing is handed, built from the saved game.
// The drawing itself is checked on the bench (docs/media/ui3d-cidade-grupo)
const hit = (p: Page, id: string) => p.hits.find((h) => h.id === id) as Hit;
const ids = (p: Page, kind: string) => p.hits.filter((h) => h.id.startsWith(kind)).map((h) => h.id);
const says = (p: Page, re: RegExp) => p.items.some((i) => i.k === 'text' && re.test(i.str));
const inPage = (p: Page) =>
  p.hits.filter((h) => h.row === undefined).every((h) => h.box.x >= 0 && h.box.x + h.box.w <= 1920 && h.box.y >= 0);

describe('3D town windows: the Shop and the Tavern', () => {
  const state = (gold: number, items: string[] = []) => ({ chest: { gold, items }, eq: {}, group: defaultGroup() });

  it('Buy lists the pieces as rows of the scrolling list, the picked one in the box with its action', () => {
    const p = shopPage(state(1000), 'buy', 'hood');
    expect(ids(p, 'row:').length).toBeGreaterThan(10); // more than the 10 rows in view: it scrolls
    expect(p.list).toMatchObject({ box: { x: C.list.x }, rowH: C.rowH });
    expect(p.list!.rows).toBeGreaterThanOrEqual(ids(p, 'row:').length); // the section heads take a row too
    expect(hit(p, 'row:hood')).toMatchObject({ picked: true, row: expect.any(Number), on: 'paper' });
    expect(hit(p, 'act')).toMatchObject({ box: C.act, off: false });
    expect(hit(p, 'cmd:buy').picked).toBe(true);
    expect(inPage(p)).toBe(true);
  });

  it('a piece the gold does not reach keeps its row, turns its action off and says how much is missing', () => {
    const p = shopPage(state(20), 'buy', 'iron_blade');
    expect(hit(p, 'act').off).toBe(true);
    expect(says(p, /faltam 100 de ouro/)).toBe(true);
  });

  it('Sell lists one row per kind of piece in the chest and counts them on its plaque', () => {
    const p = shopPage(state(0, ['hood', 'hood', 'iron_blade']), 'sell', 'hood');
    expect(ids(p, 'row:')).toEqual(['row:hood', 'row:iron_blade']);
    expect(hit(p, 'cmd:sell')).toMatchObject({ name: 'Vender (3)', picked: true });
  });

  it('the Tavern lists a recruit per class, off without the gold or with a full party', () => {
    const g = defaultGroup();
    const p = barPage(1000, g, 'lancer');
    expect(hit(p, 'row:lancer').picked).toBe(true);
    expect(hit(p, 'act')).toMatchObject({ name: 'Recrutar Lanceiro', off: false });
    expect(hit(barPage(RECRUIT_COST - 1, g, 'lancer'), 'act').off).toBe(true);
    let full = g;
    for (let i = 0; i < 4; i++) full = recruit(full, { gold: 9999, items: [] }, 'lancer')!.group;
    expect(hit(barPage(9999, full, 'lancer'), 'act').off).toBe(true);
    expect(says(barPage(1000, g, 'lancer', 'Ivo entrou no grupo.'), /Ivo entrou/)).toBe(true);
  });
});

describe('3D town windows: the Party', () => {
  const g = recruit(defaultGroup(), { gold: 1000, items: [] }, 'lancer')!.group;
  const state = { group: g, eq: {}, chest: { gold: 0, items: ['hood', 'iron_blade'] } };
  const recruitId = g.members.at(-1)!.id;

  it('opens on the first member, with a row per member and a plaque per page', () => {
    const { id, page } = partyPage(state, { page: 'status', slot: 'main' });
    expect(id).toBe(g.members[0].id);
    expect(ids(page, 'who:').length).toBe(5);
    expect(ids(page, 'tab:')).toEqual(PAGES.map((p) => `tab:${p}`));
    expect(hit(page, `who:${id}`)).toMatchObject({ picked: true, on: 'dark', box: { x: P.roster.x } });
    expect(hit(page, 'tab:status')).toMatchObject({ picked: true, box: { x: T.plaque.x, y: T.plaque.y } });
    expect(inPage(page)).toBe(true);
  });

  it('a member that is gone falls back to the first one', () => {
    expect(partyPage(state, { id: 'nobody', page: 'status', slot: 'main' }).id).toBe(g.members[0].id);
  });

  it('Status: a story member has no Dismiss, a recruit has, and Dismiss asks a second press', () => {
    const story = partyPage(state, { page: 'status', slot: 'main' }).page;
    expect(hit(story, 'fire')).toBeUndefined();
    const first = partyPage(state, { id: recruitId, page: 'status', slot: 'main' }).page;
    expect(hit(first, 'fire')).toMatchObject({ off: false, name: 'Dispensar' });
    const armed = partyPage(state, { id: recruitId, page: 'status', slot: 'main', armed: true }).page;
    expect(hit(armed, 'fire').name).toBe('Confirmar: dispensar');
    expect(hit(first, 'deploy').name).toBe('Levar à batalha'); // the 5th member starts in town
  });

  it('Equipment: the open slot lists the chest pieces that fit it, and its piece can come off', () => {
    const empty = partyPage(state, { page: 'gear', slot: 'head' }).page;
    expect(hit(empty, 'slot:head')).toMatchObject({ picked: true, name: 'Cabeça: vazio' });
    expect(ids(empty, 'row:')).toEqual(['row:hood']);
    expect(hit(empty, 'row:hood').name).toBe('Equipar Capuz');
    expect(empty.hits.some((h) => h.id === 'off' && !h.off)).toBe(false);
    const worn = partyPage({ ...state, eq: { [g.members[0].id]: { head: 'hood' } } }, { page: 'gear', slot: 'head' });
    expect(hit(worn.page, 'off')).toMatchObject({ name: 'Tirar Capuz' });
  });

  it('Class: a card per class, the current one picked', () => {
    const { page } = partyPage(state, { id: recruitId, page: 'job', slot: 'main' });
    expect(hit(page, 'job:lancer').picked).toBe(true);
    expect(hit(page, 'job:lancer').hand).toBeGreaterThan(354); // the glove under the card's numbers, off the next name
    expect(ids(page, 'job:').length).toBeGreaterThan(4);
    expect(inPage(page)).toBe(true);
  });
});

describe('3D town windows: the street (menu, gate, a place to come)', () => {
  const live = { floor: 'andar 2 de 3', gold: 40 };
  const switches = [
    { label: 'Grade da cidade', value: 'Desligada' },
    { label: 'Movimento fluido na cidade', value: 'Ligado' },
  ];
  const menu = (quest = {}, at?: string) =>
    menuPage({ name: 'Vila de Vauclair', gold: 120, party: [4, 8], quest, switches, at });

  it('the menu lists the quest, the windows, the title and the town’s switches, in the cursor’s order', () => {
    const p = menu();
    expect(p.hits.map((h) => h.id)).toEqual([
      'quest:new',
      'open:shop',
      'open:bar',
      'open:party',
      'title',
      'street',
      'sw:0',
      'sw:1',
    ]);
    expect(says(p, /^Ligado$/)).toBe(true); // a switch says its state in words
    expect(says(p, /Nenhuma expedição em curso/)).toBe(true);
    expect(says(p, /^120$/)).toBe(true);
  });

  it('an expedition in progress adds Continue first and says where it stands', () => {
    const p = menu({ live });
    expect(p.hits[0]).toMatchObject({ id: 'quest:continue', name: 'Continuar a expedição' });
    expect(says(p, /andar 2 de 3 · 40 de ouro achado/)).toBe(true);
  });

  it('the longest menu fits above the help band, inside the page, clear of the town’s box', () => {
    const p = menu({ live });
    expect(p.hits).toHaveLength(9);
    const last = p.hits.at(-1)!.box;
    expect(last.y + last.h).toBeLessThanOrEqual(T.help.y);
    expect(inPage(p)).toBe(true);
    expect(M.rows.x + M.rows.w).toBeLessThanOrEqual(M.box.x);
    expect(M.rows.x).toBeGreaterThanOrEqual(T.hand); // room for the glove at the rows' left
  });

  it('the help band says the row in focus; an armed New expedition says what the 2nd press does', () => {
    expect(says(menu({}, 'open:bar'), /Recruta gente/)).toBe(true);
    const armed = menu({ live, armed: true }, 'quest:new');
    expect(hit(armed, 'quest:new').name).toBe('Confirmar nova expedição');
    expect(says(armed, /Confirmar: encerra a expedição atual/)).toBe(true);
    expect(hit(menu({ live }), 'quest:new').name).toBe('Nova expedição');
  });

  it('the gate has the quest’s plaques and the way back, and says what waits below', () => {
    const p = gatePage({ name: 'Portão da masmorra', gold: 0, floors: 3, quest: { live } });
    expect(p.hits.map((h) => h.id)).toEqual(['quest:continue', 'quest:new', 'stay']);
    expect(says(p, /3 andares de salas[\s\S]*Expedição em curso: andar 2 de 3/)).toBe(true);
    expect(gatePage({ name: 'Portão', gold: 0, floors: 3, quest: {} }).hits.map((h) => h.id)).toEqual([
      'quest:new',
      'stay',
    ]);
    expect(G.box.x).toBeGreaterThanOrEqual(T.plaque.x + T.plaque.w);
    expect(G.box.y + G.box.h).toBeLessThanOrEqual(T.help.y);
  });

  it('a place still to come says its line and has one way out', () => {
    const p = soonPage({ name: 'Ferreiro', gold: 0, says: 'A forja abre em breve.' });
    expect(p.hits.map((h) => h.id)).toEqual(['stay']);
    expect(says(p, /A forja abre em breve/)).toBe(true);
  });
});

describe('3D town windows: where they sit', () => {
  it('the window is the whole reference, centred and scaled as one', () => {
    expect(place(REGIONS.town, stage(1920, 1080, 'frame'))).toEqual({ x: 0, y: 0, w: 1920, h: 1080 });
    const small = place(REGIONS.town, stage(1280, 720, 'frame'));
    expect(small.w / small.h).toBeCloseTo(16 / 9);
    expect(small.w).toBeLessThanOrEqual(1280);
  });

  it('the panels do not overlap the plaques, the help band or each other', () => {
    expect(C.list.x).toBeGreaterThanOrEqual(T.plaque.x + T.plaque.w);
    expect(C.list.x + C.list.w).toBeLessThanOrEqual(C.box.x);
    expect(C.list.y + C.list.h).toBeLessThanOrEqual(T.help.y);
    expect(P.page.x).toBeGreaterThanOrEqual(T.plaque.x + T.plaque.w);
    expect(P.page.x + P.page.w).toBeLessThanOrEqual(P.roster.x);
    expect(P.page.y + P.page.h).toBeLessThanOrEqual(T.help.y);
  });
});

// Fernando, Nov 17: down goes to what is below and sideways to what is beside. The Shop and the Tavern: the commands
// down the left, the scrolling list beside them, the picked row's action in the box at the right (page.ts `step`)
describe('3D town windows: the cursor of the Shop goes by where each button is seen', () => {
  const state = { chest: { gold: 1000, items: [] }, eq: {}, group: defaultGroup() };
  const p = shopPage(state, 'buy', 'hood');
  const rows = ids(p, 'row:');
  const end = p.list!.rows * p.list!.rowH - p.list!.box.h; // the list scrolled to its end
  // the button an arrow goes to from `at`, the list scrolled by `top`
  const go = (at: string, way: Dir, top = 0, page = p) => step(page, top, at, way);
  const midY = (h: Hit) => h.box.y + h.box.h / 2;

  it('down and up stay in their column: command to command, row to row', () => {
    expect(go('cmd:buy', 'down')).toBe('cmd:sell');
    expect(go('cmd:leave', 'up')).toBe('cmd:sell');
    expect(go(rows[0], 'down')).toBe(rows[1]);
    expect(go(rows[1], 'up')).toBe(rows[0]);
  });
  it('the last command does not go down into the list, nor the first row up into the commands: they stay', () => {
    for (const top of [0, end]) {
      expect(go('cmd:leave', 'down', top)).toBe('cmd:leave');
      expect(go('cmd:buy', 'up', top)).toBe('cmd:buy');
    }
    expect(go(rows[0], 'up')).toBe(rows[0]);
    expect(go(rows.at(-1)!, 'down', end)).toBe(rows.at(-1));
  });
  it('right from a command: the row nearest its height on screen, wherever the list is scrolled', () => {
    for (const top of [0, end])
      for (const cmd of ['cmd:buy', 'cmd:sell', 'cmd:leave']) {
        const inList = seen(p, top).filter((h) => h.row !== undefined);
        const off = inList.map((h) => Math.abs(midY(h) - midY(hit(p, cmd))));
        expect(go(cmd, 'right', top)).toBe(inList[off.indexOf(Math.min(...off))].id);
        expect(Math.min(...off)).toBeLessThanOrEqual(p.list!.rowH); // a row in sight (a head may lie level with it)
      }
  });
  it('left from a row: the nearest command; right: the action in the box; left from the action: back to a row', () => {
    expect(go(rows[0], 'left')).toBe('cmd:buy');
    expect(go(rows.at(-1)!, 'left', end)).toBe('cmd:leave');
    expect(go(rows[3], 'right')).toBe('act');
    expect(go('act', 'left')).toMatch(/^row:/);
    for (const way of ['up', 'down', 'right'] as const) expect(go('act', way)).toBe('act');
    for (const cmd of ['cmd:buy', 'cmd:sell', 'cmd:leave']) expect(go(cmd, 'left')).toBe(cmd);
  });
  it('a button that is off and a row scrolled out of sight are not places to go', () => {
    const poor = shopPage({ ...state, chest: { gold: 0, items: [] } }, 'buy', 'hood');
    expect(seen(poor, 0).some((h) => h.id === 'act')).toBe(false);
    expect(go(rows[3], 'right', 0, poor)).toBe(rows[3]);
    const inSight = seen(p, 0).filter((h) => h.row !== undefined);
    expect(inSight.length).toBeLessThan(rows.length);
    expect(inSight.at(-1)!.box.y).toBeLessThan(p.list!.box.y + p.list!.box.h + p.list!.rowH); // the one peeking, no further
    expect(seen(p, end).some((h) => h.id === rows[0])).toBe(false);
    expect(seen(p, end).find((h) => h.id === rows.at(-1))!.box.y).toBe(hit(p, rows.at(-1)!).box.y - end);
  });
  it('the Tavern, whose list ends above the action: left from the action still comes back to its last row', () => {
    const bar = barPage(1000, defaultGroup(), 'mage');
    expect(go('act', 'left', 0, bar)).toBe(ids(bar, 'row:').at(-1));
    expect(go(ids(bar, 'row:')[0], 'left', 0, bar)).toBe('cmd:recruit');
  });
});

// Fernando, Nov 17: the cursor goes where the eye expects, never around to the other end
describe('3D town windows: the cursor goes to the neighbour on that side', () => {
  const b = (id: string, x: number, y: number, off = false): Hit => ({
    id,
    box: { x, y, w: 100, h: 40 },
    name: id,
    on: 'dark',
    off,
  });
  // a 2x2 grid of cards, a wide row under them and a button far to the right, off the grid's lines
  const grid = [b('a', 0, 0), b('b', 120, 0), b('c', 0, 60), b('d', 120, 60), b('far', 600, 300)];

  it('down goes to the one right below, not to the next in the list', () => {
    expect(neighbour(grid, 'a', 'down')).toBe('c');
    expect(neighbour(grid, 'b', 'down')).toBe('d');
  });
  it('up goes to the one right above', () => {
    expect(neighbour(grid, 'd', 'up')).toBe('b');
  });
  it('right goes to the one beside it, on its own line', () => {
    expect(neighbour(grid, 'a', 'right')).toBe('b');
    expect(neighbour(grid, 'c', 'right')).toBe('d');
  });
  it('left goes to the one beside it', () => {
    expect(neighbour(grid, 'd', 'left')).toBe('c');
  });
  it.each([
    ['a', 'up'],
    ['a', 'left'],
    ['d', 'down'],
    ['d', 'right'], // `far` is to the right but not on its line
  ] as const)('at an edge (%s, %s) there is no neighbour: the cursor stays', (at, dir) => {
    expect(neighbour(grid, at, dir)).toBeUndefined();
  });
  it('skips a button that is off and tolerates a few px out of line', () => {
    expect(neighbour([b('a', 0, 0), b('x', 0, 60, true), b('c', 0, 120)], 'a', 'down')).toBe('c');
    expect(neighbour([b('a', 0, 0), b('n', 104, 60)], 'a', 'down')).toBe('n'); // 4 px past its edge
    expect(neighbour([b('a', 0, 0), b('n', 130, 60)], 'a', 'down')).toBeUndefined();
  });
  it('the town menu is one column: up and down walk it, left and right find nobody, the ends do not wrap', () => {
    const p = menuPage({ name: 'Vila', gold: 0, party: [4, 8], quest: {}, switches: [] });
    const ids = p.hits.map((h) => h.id);
    expect(neighbour(p.hits, ids[0], 'down')).toBe(ids[1]);
    expect(neighbour(p.hits, ids[1], 'up')).toBe(ids[0]);
    expect(neighbour(p.hits, ids[0], 'up')).toBeUndefined();
    expect(neighbour(p.hits, ids.at(-1)!, 'down')).toBeUndefined();
    for (const id of ids) for (const d of ['left', 'right'] as const) expect(neighbour(p.hits, id, d)).toBeUndefined();
    const gate = gatePage({ name: 'Portão', gold: 0, floors: 3, quest: {} });
    expect(neighbour(gate.hits, 'quest:new', 'down')).toBe('stay');
    expect(neighbour(gate.hits, 'stay', 'down')).toBeUndefined();
  });
});
