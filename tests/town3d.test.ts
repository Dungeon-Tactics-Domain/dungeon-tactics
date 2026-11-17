import { describe, expect, it } from 'vitest';
import { defaultGroup, RECRUIT_COST, recruit } from '../src/client/group.ts';
import type { Hit, Page } from '../src/client/town3d/page.ts';
import { PAGES, partyPage } from '../src/client/town3d/party-view.ts';
import { barPage, shopPage } from '../src/client/town3d/shop-view.ts';
import { C, P, T } from '../src/client/town3d/town-layout.ts';
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
    expect(ids(page, 'job:').length).toBeGreaterThan(4);
    expect(inPage(page)).toBe(true);
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
