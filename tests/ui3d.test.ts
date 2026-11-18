/// <reference types="vite/client" />
import { describe, expect, it } from 'vitest';
import type { Screen } from '../src/client/command.ts';
import { parseSpec } from '../src/client/dev/sandbox-spec.ts';
import type { HudView } from '../src/client/hud.ts';
import { menuLayout, REF, rowBox, touchScale } from '../src/client/menu3d/menu-layout.ts';
import { abilityIcon3d, changes, type MenuView, menuView } from '../src/client/menu3d/menu-view.ts';
import { queueRows, statsText, unitStats } from '../src/client/turn-list.ts';
import { LIST_MIN, listFloor, matchRows, queueCards, statsLayout } from '../src/client/turn3d/queue-view.ts';
import { stage } from '../src/client/ui3d/layout.ts';
import { pixelBlock } from '../src/client/ui3d/pixel.ts';
import { ease, land, pageStep, settled, spring, stepSpring } from '../src/client/ui3d/spring.ts';
import { wrapLines } from '../src/client/ui3d/text.ts';
import { ABILITIES } from '../src/shared/battle/abilities.ts';
import { Battle } from '../src/shared/battle/battle.ts';
import { flat, stateOf } from './battle-helpers.ts';

// The 3D interface behind localhost flags (?menu3d, ?turn3d; Nov 16): the pure parts behind the drawing. The drawing
// itself is checked on the bench shots (docs/sandbox.md)
describe('3D kit: motion', () => {
  const run = (k: number, c: number, dt = 1 / 60) => {
    const s = spring(0);
    s.to = 1;
    let peak = 0;
    for (let t = 0; t < 3; t += dt) {
      stepSpring(s, dt, k, c);
      peak = Math.max(peak, s.x);
    }
    return { s, peak };
  };

  it('a spring passes its place and comes back to rest on it', () => {
    const { s, peak } = run(260, 14);
    expect(peak).toBeGreaterThan(1.05);
    expect(settled(s)).toBe(true);
    expect(s.x).toBeCloseTo(1, 2);
  });

  it('a critically damped spring lands without passing', () => {
    const { s, peak } = run(260, 2 * Math.sqrt(260));
    expect(peak).toBeLessThanOrEqual(1.001);
    expect(settled(s)).toBe(true);
  });

  it('a slow frame or a tab coming back does not blow the spring up', () => {
    const { s, peak } = run(260, 14, 0.5);
    expect(peak).toBeLessThan(2);
    expect(Number.isFinite(s.x)).toBe(true);
  });

  it('reduced motion lands a spring where it is going', () => {
    const s = spring(0);
    s.to = 5;
    s.v = 3;
    land(s);
    expect(s).toEqual({ x: 5, v: 0, to: 5 });
    expect(settled(s)).toBe(true);
  });

  it('an ease approaches without passing the target', () => {
    let x = 0;
    for (let i = 0; i < 30; i++) {
      const next = ease(x, 1, 1 / 60, 12);
      expect(next).toBeGreaterThan(x);
      expect(next).toBeLessThanOrEqual(1);
      x = next;
    }
    expect(x).toBeGreaterThan(0.99);
  });

  it('the sheet takes the short way around its ring of pages', () => {
    expect(pageStep(0, 1, 3)).toBe(1);
    expect(pageStep(2, 0, 3)).toBe(1);
    expect(pageStep(0, 2, 3)).toBe(-1);
    expect(pageStep(1, 1, 3)).toBe(0);
  });

  it('a 40 px icon becomes a 16 px sprite, and the blocks never vanish', () => {
    expect(pixelBlock(1, 1)).toBe(3);
    expect(pixelBlock(1, 2)).toBe(5);
    expect(pixelBlock(0.6, 1)).toBe(2);
    expect(pixelBlock(0.1, 1)).toBe(2);
  });

  it('text wraps at spaces, keeps paragraphs and never splits a word', () => {
    const wide = (s: string) => s.length;
    expect(wrapLines('one two three', 7, wide)).toEqual(['one two', 'three']);
    expect(wrapLines('a\nb c', 10, wide)).toEqual(['a', 'b c']);
    expect(wrapLines('incomprehensible x', 5, wide)).toEqual(['incomprehensible', 'x']);
  });
});

const duel = () =>
  new Battle(
    flat(6, 6),
    stateOf([
      { id: 'a', def: 'warrior', team: 'hero', x: 1, y: 1 },
      { id: 'b', def: 'soldier', team: 'enemy', x: 2, y: 1 },
      { id: 'beacon', def: 'beacon', team: 'hero', x: 5, y: 5 },
    ]),
  );
const view = (battle: Battle, screen: Screen) => ({ battle, screen }) as HudView;

describe('3D menu: what it shows', () => {
  it('the same rows as the HTML menu, and nothing while it is closed', () => {
    const b = duel();
    const m = menuView(view(b, { k: 'menu', index: 2 }), true);
    expect(m?.rows.map((r) => [r.label, r.kind, r.off])).toEqual([
      ['Mover', 'boot', false],
      ['Habilidades', 'sword', false],
      ['Esperar', 'hourglass', false],
      ['Status', 'scroll', false],
    ]);
    expect(m).toMatchObject({ head: 'Guerreiro', index: 2, sub: null, sheet: null });
    expect(menuView(view(b, { k: 'menu', index: 0 }), false)).toBeNull();
    expect(menuView(view(b, { k: 'map', command: 'move' }), true)).toBeNull();
  });

  it('the submenu keeps Act picked and opens the focused ability on the page asked for', () => {
    const m = menuView(view(duel(), { k: 'abilities', index: 1, page: 2 }), true);
    expect(m?.index).toBe(1); // Act
    expect(m?.sub?.map((r) => r.label)).toEqual(['Golpe', 'Golpe pesado', 'Escudada', 'Giro']);
    expect(m?.sub?.[1].note).toBe('30 stamina');
    expect(m?.sheet).toMatchObject({ owner: 'Guerreiro', name: 'Golpe pesado', kind: 'sword', page: 2 });
    expect(m?.sheet?.pages.map((p) => p.title)).toEqual(['Descrição', 'Efeitos', 'Custo']);
    expect(m?.sheet?.pages[0].text).toBe('Alcance 1.\nDano 95–130.\nAcerto 75%.');
    expect(m?.sheet?.pages[1].text).toBe('Nenhum efeito além do golpe.');
    expect(m?.sheet?.pages[2].text).toBe('Gasta 30 stamina.');
  });

  it('reads the model from what the ability does', () => {
    const ids = ['strike', 'shield_bash', 'spin', 'shot', 'knock_shot', 'throwing_knife', 'firebolt', 'heal', 'lance'];
    expect(Object.fromEntries(ids.map((id) => [id, abilityIcon3d(ABILITIES[id])]))).toEqual({
      strike: 'sword',
      shield_bash: 'shield',
      spin: 'axe',
      shot: 'bow',
      knock_shot: 'bow',
      throwing_knife: 'dagger',
      firebolt: 'flame',
      heal: 'potion',
      lance: 'dagger',
    });
  });

  it('names what changed between two draws', () => {
    const b = duel();
    const at = (screen: Screen) => menuView(view(b, screen), true) as MenuView;
    const menu = at({ k: 'menu', index: 0 });
    const sub = at({ k: 'abilities', index: 0 });
    expect([...changes(null, menu)]).toEqual(['enter']);
    expect([...changes(null, sub)]).toEqual(['enter', 'cascade']);
    expect([...changes(menu, null)]).toEqual(['leave']);
    expect([...changes(menu, sub)]).toEqual(['cascade', 'focus']);
    expect([...changes(sub, at({ k: 'menu', index: 1 }))]).toEqual(['fold', 'focus']);
    expect([...changes(menu, at({ k: 'menu', index: 2 }))]).toEqual(['focus']);
    expect([...changes(sub, at({ k: 'abilities', index: 0, page: 1 }))]).toEqual(['page']);
    expect([...changes(menu, menu)]).toEqual([]);
    expect([...changes(null, null)]).toEqual([]);
  });
});

describe('3D menu: where it sits', () => {
  const at = (w: number, h: number, mode: 'edges' | 'frame' = 'edges') => stage(w, h, mode);

  it('on the reference places at the reference size, in both layouts', () => {
    for (const mode of ['edges', 'frame'] as const) {
      const { main, sub, sheet, prev, next } = menuLayout(at(1920, 1080, mode), 4, 0);
      expect(main).toEqual({ x: 1152, y: 688, w: 414, h: 327 });
      expect(sub.x).toBe(1284);
      expect(sheet).toEqual({ x: 1450, y: 100, w: 400, h: 564 });
      expect(prev.x + prev.w).toBe(next.x);
      expect(next.x + next.w).toBe(sheet.x + sheet.w);
      expect(prev.y + prev.h).toBe(sheet.y + sheet.h);
    }
  });

  it('both columns take the longer list and keep their foot', () => {
    const { main, sub } = menuLayout(at(1920, 1080), 4, 7);
    expect(main.h).toBe(sub.h);
    expect(main.h).toBe(REF.head + 7 * REF.row + REF.foot);
    expect(main.y + main.h).toBe(688 + 327);
  });

  it('scales with the page, stays pinned to the corner and keeps the glove on a narrow page', () => {
    const s = 720 / 1080;
    const { main } = menuLayout(at(1280, 720), 4, 0);
    expect(main.x + main.w).toBeCloseTo(1280 - 354 * s);
    expect(main.y + main.h).toBeCloseTo(720 - 65 * s);
    expect(menuLayout(at(2560, 1080), 4, 0).main.x).toBe(2560 - 354 - 414);
    expect(menuLayout(at(250, 700), 4, 0).main.x).toBeCloseTo(REF.hand / 3); // under the narrow floor's page
  });

  // Fernando, Nov 18: phone and tablet; the pieces shrink with a narrow page, a finger's rows as little as it lets them
  it('on touch the columns keep the smallest full scale where the page is tall enough, and half of it on a phone', () => {
    const phone = stage(844, 390, 'edges', { x: 47, y: 21 }); // s 0.39
    expect(touchScale(phone)).toBeCloseTo(348 / 700);
    expect(touchScale(stage(768, 1024, 'edges'))).toBe(0.6);
    expect(touchScale(stage(1920, 1080, 'edges'))).toBe(1); // never under the stage's
    const mouse = menuLayout(phone, 4, 4),
      finger = menuLayout(phone, 4, 4, true);
    expect(mouse.cs).toBe(phone.s);
    expect(rowBox(finger.main, 0, finger.cs).h).toBeGreaterThan(28);
    expect(rowBox(finger.main, 0, finger.cs).h).toBeGreaterThan(rowBox(mouse.main, 0, mouse.cs).h);
    expect(finger.main.y + finger.main.h).toBeCloseTo(390 - 21 - 65 * finger.cs); // still on its corner
    expect(finger.sub.x + finger.sub.w).toBeLessThanOrEqual(844 - 47);
    // the sheet's page arrows: the drawn foot is 19 px there, the finger's box 44 about its middle
    expect(mouse.prev.h).toBeCloseTo(48 * phone.s);
    expect(finger.prev.h).toBe(44);
    expect(finger.prev.y + 22).toBeCloseTo(mouse.prev.y + mouse.prev.h / 2);
  });

  it('on a short page the columns step left of the sheet they would sit under', () => {
    for (const touch of [false, true]) {
      const { main, sub, sheet } = menuLayout(stage(844, 390, 'edges', { x: 47, y: 21 }), 4, 4, touch);
      expect(sheet.y + sheet.h, String(touch)).toBeGreaterThan(main.y); // side by side, not one over the other
      expect(sub.x + sub.w, String(touch)).toBeLessThan(sheet.x);
      expect(main.x, String(touch)).toBeGreaterThan(47);
    }
    // a page tall enough keeps the reference's corner
    const { main } = menuLayout(stage(1024, 768, 'edges'), 4, 4, true);
    expect(main.x + main.w).toBeCloseTo(1024 - 354 * 0.6);
  });

  it('in the frame an ultrawide page keeps the menu where the reference has it', () => {
    const { main, sheet } = menuLayout(at(3440, 1440, 'frame'), 4, 0);
    expect(main.x).toBeCloseTo(440 + (1152 * 4) / 3);
    expect(main.y).toBeCloseTo((688 * 4) / 3);
    expect(sheet.x).toBeCloseTo(440 + (1450 * 4) / 3);
  });

  it('a row box is the row the column draws', () => {
    const { main } = menuLayout(at(1920, 1080), 6, 0);
    expect(rowBox(main, 0, 1)).toEqual({ x: main.x, y: main.y + 42, w: 414, h: 56.5 });
    expect(rowBox(main, 5, 1).y + 56.5 + REF.foot).toBe(main.y + main.h);
  });
});

const rows = (s: string) =>
  s.split(' ').map((r) => {
    const [unit, charge] = r.split('/');
    return charge ? { unit, charge } : { unit };
  });

describe('3D turn list: which card each row keeps', () => {
  it('passing the turn drops only the head: every other card moves one slot', () => {
    // a played; its second row becomes its first, and must not take the card that leaves
    expect(matchRows(rows('a b c a b c'), rows('b c a b c a'), true)).toEqual([1, 2, 3, 4, 5, -1]);
  });

  it('a unit that plays twice in a row keeps its second card', () => {
    expect(matchRows(rows('a a b'), rows('a b a'), true)).toEqual([1, 2, -1]);
  });

  it('aiming reorders the same cards and a previewed charge is a new one', () => {
    expect(matchRows(rows('a b c a b c'), rows('a b a/fire a c b c'), false)).toEqual([0, 1, -1, 3, 2, 4, 5]);
  });

  it('cancelling the aim brings every card back and the charge leaves', () => {
    const kept = matchRows(rows('a b a/fire a c b c'), rows('a b c a b c'), false);
    expect(kept).toEqual([0, 1, 4, 3, 5, 6]);
    expect(kept).not.toContain(2);
  });

  it('a unit that fell leaves its rows unmatched', () => {
    expect(matchRows(rows('a b c a b c'), rows('c a c a'), true)).toEqual([2, 3, 5, -1]);
  });

  it('a charge and its caster are different rows', () => {
    expect(matchRows(rows('a a/fire'), rows('a/fire a'), false)).toEqual([1, 0]);
  });

  // with the 3D bar the one acting is the sheet's portrait (Fernando, Nov 16): the list starts at its card 2
  it('headless: the acting card leaves, the others keep their numbers', () => {
    const b = new Battle(
      flat(6, 6),
      stateOf([
        { id: 'a', def: 'warrior', team: 'hero', x: 1, y: 1 },
        { id: 'b', def: 'soldier', team: 'enemy', x: 3, y: 1 },
      ]),
    );
    const q = queueRows(b, null);
    const all = queueCards(b, q, []);
    const rest = queueCards(b, q, [], q.rows[0].unit);
    expect(all[0].now).toBe(true);
    expect(rest).toEqual(all.slice(1));
    expect(rest[0].num).toBe(2);
    expect(rest.some((c) => c.now)).toBe(false);
  });

  it("headless: an enemy's strike still playing after the turn passed keeps the head, which the sheet does not show", () => {
    const b = new Battle(
      flat(6, 6),
      stateOf([
        { id: 'a', def: 'warrior', team: 'hero', x: 1, y: 1 },
        { id: 'b', def: 'soldier', team: 'enemy', x: 3, y: 1 },
      ]),
    );
    const q = queueRows(b, null);
    const other = q.rows.find((r) => r.unit !== q.rows[0].unit)!.unit;
    expect(queueCards(b, q, [], other)).toEqual(queueCards(b, q, []));
    expect(queueCards(b, q, [], undefined)).toEqual(queueCards(b, q, []));
  });

  it('headless: when the turn passes, the card of the one now acting leaves and the rest slide down one', () => {
    // queue a b c a b c with a acting shows b c a b c; b acts next: b c a b c a shows c a b c a
    expect(matchRows(rows('b c a b c'), rows('c a b c a'), true)).toEqual([1, 2, 3, 4, -1]);
  });
});

// Life and CT beside each card (Nov 17, Fernando)
describe('3D turn list: life and CT lines', () => {
  it("each turn card carries its unit's two lines and CT fill; the tip says them in full", () => {
    const b = new Battle(
      flat(6, 6),
      stateOf([
        { id: 'a', def: 'warrior', team: 'hero', x: 1, y: 1 },
        { id: 'b', def: 'soldier', team: 'enemy', x: 3, y: 1 },
      ]),
    );
    const foe = b.state.units.find((u) => u.id === 'b')!;
    foe.hp = 90;
    foe.ct = 40;
    const card = queueCards(b, queueRows(b, null), []).find((c) => c.id.unit === 'b')!;
    expect(card.stats).toEqual({ hp: statsText(unitStats(foe)).hp, ct: statsText(unitStats(foe)).ct, ctFill: 0.4 });
    expect(card.stats!.hp).toContain('90/');
    expect(card.stats!.ct).toContain('40/100 +');
    expect(card.tip).toContain(statsText(unitStats(foe)).long);
  });

  it("a charge's row has no lines: it is a spell going off, not a turn", () => {
    const b = new Battle(
      flat(8, 1),
      stateOf([
        { id: 'a', def: 'archer', team: 'hero', x: 0, y: 0 },
        { id: 'r', def: 'rogue', team: 'enemy', x: 4, y: 0 },
      ]),
    );
    const cards = queueCards(b, queueRows(b, { ability: 'aimed_shot', target: { x: 4, y: 0 } }), []);
    const charge = cards.find((c) => c.id.charge)!;
    expect(charge.stats).toBeNull();
    expect(cards.filter((c) => !c.id.charge).every((c) => c.stats)).toBe(true);
  });

  it('the lines never go under 16 px from the smallest full scale up, and fit the card at every scale', () => {
    // the rows' sizes in style.css (.hud.turn3d .queue-row): 52 design px tall, never under 48 px times --t3f
    for (const s of [0.5, 0.585, 0.87, 0.9, 1, 1.5, 2, 3]) {
      const h = Math.max(52 * s, 48 * listFloor(s));
      const l = statsLayout(h, s);
      // a narrow page (under LIST_MIN) shrinks the floor with the pieces
      expect(l.size).toBeGreaterThanOrEqual(16 * Math.min(1, s / LIST_MIN));
      expect(l.fits).toBe(true);
      // top to bottom: life text, its bar, CT text, its bar, all inside the card
      expect(l.hp.text).toBeLessThan(l.hp.bar);
      expect(l.hp.bar + l.bar).toBeLessThanOrEqual(l.ct.text);
      expect(l.ct.bar + l.bar).toBeLessThanOrEqual(h);
    }
    expect(statsLayout(40, 1).fits).toBe(false);
  });
});

describe('3D interface: flags and boundaries', () => {
  it('a spec turns each look on by its own key', () => {
    expect(parseSpec({ menu3d: true, turn3d: true }).problems).toEqual([]);
    expect(parseSpec({ menu3d: 'pixel' }).problems).toEqual([]);
    expect(parseSpec({ menu3d: 'big', turn3d: 1 }).problems).toEqual([
      'menu3d must be true or "pixel"',
      'turn3d must be true',
    ]);
  });

  it('every bench scene of the looks is a valid spec', () => {
    const scenes = import.meta.glob<object>(
      '../scripts/sandbox/bench/{menu3d,turn3d,menucss,ui3d,layout,preset,batalha}*.json',
      {
        import: 'default',
        eager: true,
      },
    );
    expect(Object.keys(scenes).length).toBe(25);
    for (const [path, raw] of Object.entries(scenes)) expect(parseSpec(raw).problems, path).toEqual([]);
  });

  const sources = import.meta.glob<string>('../src/client/**/*.ts', { query: '?raw', import: 'default', eager: true });
  const code = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
  const is3d = (path: string) =>
    /\/(ui3d|menu3d|turn3d|bar3d|hints3d|confirm3d|result3d|town3d|flow3d|window3d)\//.test(path);

  // the game online never fetches the looks: outside their folders they are named only as a type or in a dynamic
  // import. The layout and the flags are the exception: small and pure, the Options and the HUD read them
  it('the rest of the client takes the 3D folders and the CSS menu by type or by dynamic import only', () => {
    const value =
      /^import (?!type )[^;]*from\s+['"][^'"]*\/(ui3d\/(?!layout\.ts|skin-flags\.ts)|menu3d\/|turn3d\/|bar3d\/|hints3d\/|confirm3d\/|result3d\/|town3d\/|flow3d\/|window3d\/|hud-menucss)/m;
    expect(value.test("import { Menu3d } from './menu3d/menu3d.ts';")).toBe(true);
    expect(value.test("import { Ui3dLayer } from './ui3d/layer.ts';")).toBe(true);
    expect(value.test("import { stage } from './ui3d/layout.ts';")).toBe(false);
    const offenders = Object.entries(sources)
      .filter(([path]) => !is3d(path))
      .filter(([, text]) => value.test(code(text)))
      .map(([path]) => path);
    expect(offenders).toEqual([]);
  });

  it('the pure parts stay free of Three.js and of the DOM', () => {
    const pure = [
      'ui3d/spring',
      'ui3d/pixel',
      'ui3d/layout',
      'ui3d/skin-flags',
      'menu3d/menu-view',
      'menu3d/menu-layout',
      'turn3d/queue-view',
      'hints3d/hints-view',
      'result3d/result-view',
      'result3d/result-layout',
      'town3d/page',
      'town3d/town-layout',
      'town3d/shop-view',
      'town3d/party-view',
      'town3d/map-layout',
      'flow3d/options-view',
      'flow3d/options-layout',
      'flow3d/title-layout',
      'flow3d/sheet-layout',
      'ui3d/walk',
      'window3d/status-view',
      'ui3d/field',
      'flow3d/dev-view',
    ];
    // and the two the main chunk takes by value bring no other file along
    for (const name of ['ui3d/layout', 'ui3d/skin-flags'])
      expect(/^import /m.test(code(sources[`../src/client/${name}.ts`])), name).toBe(false);
    for (const name of pure) {
      const text = code(sources[`../src/client/${name}.ts`]);
      expect(/from\s+['"]three['"]|document\.|window\./.test(text), name).toBe(false);
    }
  });
});
