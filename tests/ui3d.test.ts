/// <reference types="vite/client" />
import { describe, expect, it } from 'vitest';
import { actActions } from '../src/client/act-flow.ts';
import { itemDetail } from '../src/client/battle-text.ts';
import { commandIndex, type Screen } from '../src/client/command.ts';
import { parseSpec } from '../src/client/dev/sandbox-spec.ts';
import type { HudView } from '../src/client/hud.ts';
import { cornerLayout, LEAD, menuLayout, REF, rowBox, touchScale } from '../src/client/menu3d/menu-layout.ts';
import { abilityIcon3d, changes, type MenuView, menuView } from '../src/client/menu3d/menu-view.ts';
import { cardBars, cardLines, queueRows, statsText, unitStats } from '../src/client/turn-list.ts';
import {
  LIST_MIN,
  linesHeight,
  listFloor,
  matchRows,
  queueCards,
  statsLayout,
  statWidth,
} from '../src/client/turn3d/queue-view.ts';
import { type Box, PHONE_SHRINK, place, REGIONS, setPageFloor, sheetBox, stage } from '../src/client/ui3d/layout.ts';
import { ease, land, pageStep, settled, spring, stepSpring } from '../src/client/ui3d/spring.ts';
import { wrapLines } from '../src/client/ui3d/text.ts';
import { ABILITIES } from '../src/shared/battle/abilities.ts';
import { Battle } from '../src/shared/battle/battle.ts';
import { flat, stateOf } from './battle-helpers.ts';

// The 3D interface (Nov 16; the only one since Nov 18): the pure parts behind the drawing. The drawing
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
    const m = menuView(view(b, { k: 'menu', index: commandIndex('wait') }), true);
    expect(m?.rows.map((r) => [r.label, r.kind, r.off])).toEqual([
      ['Agir', 'sword', false],
      ['Mover', 'boot', false],
      ['Esperar', 'hourglass', false],
      ['Status', 'scroll', false],
    ]);
    expect(m).toMatchObject({ head: 'Guerreiro', index: 2, sub: null, sheet: null });
    expect(m?.commands).toEqual(['act', 'move', 'wait', 'status'].map((c) => commandIndex(c as 'move')));
    expect(menuView(view(b, { k: 'menu', index: 0 }), false)).toBeNull();
    expect(menuView(view(b, { k: 'map', command: 'move' }), true)).toBeNull();
  });

  // Fernando, Nov 18: after a move Move stays and "Undo move" shows under it; a row stands for its place in COMMANDS
  it('after a move: five rows, Undo move under Move, and each row clicks its own command', () => {
    const b = duel();
    b.move({ x: 2, y: 2 });
    const m = menuView(view(b, { k: 'menu', index: commandIndex('act') }), true);
    expect(m?.rows.map((r) => [r.label, r.off])).toEqual([
      ['Agir', false],
      ['Mover', b.reach().size === 0],
      ['Desfazer movimento', false],
      ['Esperar', false],
      ['Status', false],
    ]);
    expect(m?.commands).toEqual([0, 1, 2, 3, 4]);
    expect(m?.index).toBe(0); // the cursor on Abilities, never on Undo move
    // an Agir list open: Abilities stays picked on its row
    expect(menuView(view(b, { k: 'targets', index: 0 }), true)?.index).toBe(0);
  });

  it('the target list keeps Act picked and the action list names each ability with its cost', () => {
    const b = duel();
    const foe = { k: 'unit' as const, unit: 'b', pos: { x: 2, y: 1 } };
    const targets = menuView(view(b, { k: 'targets', index: 0 }), true);
    expect(targets?.index).toBe(0); // Act
    expect(targets?.subTitle).toBe('Alvo');
    expect(targets?.sub?.map((r) => r.label)).toEqual(['Soldado', 'Farol', 'Giro']);
    const actions = menuView(view(b, { k: 'actions', target: foe, index: 1 }), true);
    expect(actions?.sub?.map((r) => r.label)).toEqual(['Golpe', 'Golpe pesado', 'Escudada', 'Giro', 'Rajada']);
    expect(actions?.sub?.[1].note).toBe('30 stamina'); // a main action carries no tag
    expect(actions?.subIndex).toBe(1);
    expect(targets?.sheet).toBeNull(); // the sheet is the action list's only
  });

  it('the Agir list starts with Escolher alvo, then each ability with its reason when off (prototype)', () => {
    const b = duel();
    const m = menuView(view(b, { k: 'acts', index: 0 }), true);
    expect(m?.subTitle).toBe('Agir');
    expect(m?.index).toBe(0);
    expect(m?.sub?.[0].label).toBe('Escolher alvo');
    expect(m?.sub?.slice(1).map((r) => r.label)).toEqual(['Golpe', 'Técnicas', 'Magias']); // the basic attack, then its groups
  });

  it('the action list shows the sheet of the focused ability, on the page asked for', () => {
    const b = duel();
    const foe = { k: 'unit' as const, unit: 'b', pos: { x: 2, y: 1 } };
    const m = menuView(view(b, { k: 'actions', target: foe, index: 1, page: 2 }), true);
    expect(m?.sheet).toMatchObject({ owner: 'Guerreiro', name: 'Golpe pesado', kind: 'sword', page: 2 });
    expect(m?.sheet?.pages.map((p) => p.title)).toEqual(['Descrição', 'Efeitos', 'Custo']);
    expect(m?.sheet?.pages[0].text).toBe('Alcance 1.\nDano 95–130.\nAcerto 75%.');
    expect(m?.sheet?.pages[1].text).toBe('Nenhum efeito além do golpe.');
    expect(m?.sheet?.pages[2].text).toBe('Gasta 30 stamina.');
  });

  it('an item row gets a one-page sheet of what the item does, kept on its first page', () => {
    const b = duel();
    b.state.bag = { life_potion: 1 };
    const target = { k: 'unit' as const, unit: b.actor.id, pos: b.actor.pos };
    const i = actActions(b, target).findIndex((a) => a.k === 'item');
    expect(i).toBeGreaterThanOrEqual(0);
    const m = menuView(view(b, { k: 'actions', target, index: i, page: 2 }), true);
    expect(m?.sheet).toMatchObject({ name: 'Poção de vida', kind: 'potion', page: 0 });
    expect(m?.sheet?.pages).toEqual([{ title: 'Descrição', text: itemDetail('life_potion') }]);
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
    const sub = at({ k: 'targets', index: 0 });
    expect([...changes(null, menu)]).toEqual(['enter']);
    expect([...changes(null, sub)]).toEqual(['enter', 'cascade']);
    expect([...changes(menu, null)]).toEqual(['leave']);
    expect([...changes(menu, sub)]).toEqual(['cascade', 'focus']);
    expect([...changes(sub, at({ k: 'menu', index: 1 }))]).toEqual(['fold', 'focus']);
    expect([...changes(menu, at({ k: 'menu', index: 2 }))]).toEqual(['focus']);
    const foe = { k: 'unit' as const, unit: 'b', pos: { x: 2, y: 1 } };
    expect([
      ...changes(at({ k: 'actions', target: foe, index: 0 }), at({ k: 'actions', target: foe, index: 0, page: 1 })),
    ]).toEqual(['page']);
    expect([...changes(menu, menu)]).toEqual([]);
    expect([...changes(null, null)]).toEqual([]);
  });
});

describe('3D menu: where it sits', () => {
  const at = (w: number, h: number, mode: 'edges' | 'frame' = 'edges') => stage(w, h, mode);

  it('on the reference places at the reference size, in both layouts', () => {
    for (const mode of ['edges', 'frame'] as const) {
      const { main, sub, sheet, prev, next } = menuLayout(at(1920, 1080, mode), 4, 0);
      // as tall as its rows (Nov 18: no blank fifth row), on the region's foot
      expect(main).toEqual({ x: 1152, y: 745, w: 414, h: REF.head + 4 * REF.row + REF.foot });
      expect(sub.x).toBe(1284);
      expect(sheet).toEqual({ x: 1450, y: 100, w: 400, h: 564 });
      expect(prev.x + prev.w).toBe(next.x);
      expect(next.x + next.w).toBe(sheet.x + sheet.w);
      expect(prev.y + prev.h).toBe(sheet.y + sheet.h);
    }
  });

  // Fernando, Nov 19: the menu grew when Agir opened its longer list; it must not
  it('each column is as tall as its own list, both on the same foot', () => {
    const { main, sub } = menuLayout(at(1920, 1080), 4, 7);
    expect(main).toEqual(menuLayout(at(1920, 1080), 4, 0).main);
    expect(main.h).toBe(REF.head + 4 * REF.row + REF.foot);
    expect(sub.h).toBe(REF.head + 7 * REF.row + REF.foot);
    expect(sub.y + sub.h).toBe(main.y + main.h);
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

  // Fernando, Nov 20, option A: on a phone every piece holds its own corner, the menu bottom right, nothing over another
  // (a phone held upright shows only the turn-the-phone notice, rotate-note.ts, so only the landscape pages)
  it("on a phone the menu stands in the combat bar's bottom right corner, clear of every other piece", () => {
    const apart = (a: Box, b: Box) => a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y;
    for (const [w, h, safe, tap] of [
      [844, 390, { x: 0, y: 0 }, 44],
      [667, 375, { x: 0, y: 0 }, 44],
      [844, 390, { x: 47, y: 21 }, 44], // the notch and the home bar
    ] as const) {
      const st = stage(w, h, 'edges', safe),
        small = { ...st, s: st.s * PHONE_SHRINK },
        bar = place(REGIONS.bar, small),
        acting = place(REGIONS.sheet, small),
        height = place(REGIONS.height, st),
        coords = { ...height, h: height.h + 56 * st.s }, // and the tile's coordinates line under it
        foot = bar.y + bar.h;
      for (const [rows, sub] of [
        [4, 0],
        [4, 6],
        [5, 0],
      ]) {
        const m = menuLayout(st, rows, sub, true, foot),
          say = `${w}x${h} ${rows} ${sub}`;
        expect(m).toEqual(cornerLayout(st, rows, sub, foot));
        expect(m.main.x + m.main.w, say).toBeCloseTo(st.x + st.w); // the right edge
        expect(m.sub.x, say).toBe(m.main.x); // the submenu replaces the menu, no cascade off the page
        expect(m.main.y + m.main.h, say).toBeCloseTo(foot); // the bottom right corner (the target's plate shows only
        // on the tile screens, with the menu closed)
        for (const col of [m.main, m.sub]) {
          for (const other of [acting, coords, m.sheet]) expect(apart(col, other), say).toBe(true);
          expect(col.y, say).toBeGreaterThanOrEqual(st.y);
        }
        if (rows === 4 && !sub) expect(rowBox(m.main, 0, m.cs).h, say).toBeGreaterThanOrEqual(tap);
        expect(m.prev.h, say).toBeGreaterThanOrEqual(44);
      }
    }
  });

  // Fernando, Nov 18: at 844x390 the menu covered the end of the acting unit's stamina ("50/5")
  it("never covers the acting unit's sheet in the combat bar; on a phone the cascade shortens instead", () => {
    for (const [w, h, safe] of [
      [844, 390, { x: 47, y: 21 }],
      [667, 375, { x: 0, y: 0 }],
      [1024, 768, { x: 0, y: 0 }],
      [768, 1024, { x: 0, y: 0 }],
      [1280, 720, { x: 0, y: 0 }],
    ] as const) {
      const st = stage(w, h, 'edges', safe),
        bar = sheetBox(st, h);
      for (const touch of [false, true])
        for (const [rows, sub] of [
          [4, 0],
          [4, 6],
          [5, 0], // moved with movement left (Nov 18): Move and Undo move
        ]) {
          const m = menuLayout(st, rows, sub, touch),
            say = `${w}x${h} ${touch} ${rows} ${sub}`;
          expect(m.main.y, say).toBeGreaterThanOrEqual(st.y); // a fifth row grows it up, still on the page
          expect(m.main.x, say).toBeGreaterThan(bar.x + bar.w);
          expect(m.sub.x, say).toBeGreaterThanOrEqual(m.main.x);
          if (h < 500) expect(m.sub.x + m.sub.w, say).toBeLessThan(m.sheet.x); // a phone: side by side
        }
    }
    // a page with room keeps the full cascade
    const ref = menuLayout(stage(1920, 1080, 'edges'), 4, 6);
    expect(ref.sub.x - ref.main.x).toBe(LEAD);
  });

  it('is as tall as its rows: no blank row under four commands, one more row for five, on the same foot', () => {
    const st = stage(844, 390, 'edges', { x: 47, y: 21 });
    for (const rows of [3, 4, 5]) {
      const m = menuLayout(st, rows, 0, true);
      expect(m.main.h).toBeCloseTo((REF.head + rows * REF.row + REF.foot) * m.cs);
      expect(rowBox(m.main, rows - 1, m.cs).y + (REF.row + REF.foot) * m.cs).toBeCloseTo(m.main.y + m.main.h);
    }
    const four = menuLayout(st, 4, 0, true).main,
      five = menuLayout(st, 5, 0, true).main;
    expect(five.y + five.h).toBeCloseTo(four.y + four.h);
    expect(five.y).toBeCloseTo(four.y - REF.row * touchScale(st));
  });

  it('in the frame an ultrawide page keeps the menu where the reference has it', () => {
    const { main, sheet } = menuLayout(at(3440, 1440, 'frame'), 4, 0);
    expect(main.x).toBeCloseTo(440 + (1152 * 4) / 3);
    expect(main.y).toBeCloseTo((745 * 4) / 3);
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

// The lines beside each card (Nov 17, Fernando; Nov 20: name, HP, MP, ST and CT on a unit's first card, the name alone on
// its repeats, a smaller card)
describe('3D turn list: the lines beside the cards', () => {
  it("a unit's first card says its name, life, mana, stamina and CT with no gains; a repeat its name, smaller", () => {
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
    const cards = queueCards(b, queueRows(b, null), []).filter((c) => c.id.unit === 'b');
    expect(cards.length).toBeGreaterThan(1); // two rounds: the soldier shows again
    const [card, again] = cards;
    expect(card.small).toBe(false);
    expect(card.stats!.lines).toEqual(cardLines(foe));
    expect(card.stats!.lines[0]).toBe('Soldado');
    expect(card.stats!.lines[1]).toMatch(/^HP 90\/\d+ · MP \d+\/\d+$/);
    expect(card.stats!.lines[2]).toMatch(/^ST \d+\/\d+ · CT 40\/100$/); // no "+8" a tick
    expect(again).toMatchObject({ small: true, stats: { lines: ['Soldado'] } });
    expect(again.stats!.bars).toBeUndefined(); // a repeat draws no bars
    // a bar for each pool it has (Fernando, Nov 20): mana and stamina full at the start, CT at 40 of 100
    expect(card.stats!.bars).toEqual([1, 1, 0.4]);
    // folded, no card has lines nor bars: faces and order only
    expect(queueCards(b, queueRows(b, null), [], undefined, true).every((c) => c.stats === null)).toBe(true);
    expect(card.tip).toContain(statsText(unitStats(foe)).long);
  });

  it('a pool the unit lacks has no bar, as its line has no number; CT always has one', () => {
    const b = new Battle(flat(4, 1), stateOf([{ id: 'a', def: 'warrior', team: 'hero', x: 0, y: 0 }]));
    const u = b.state.units[0];
    u.ct = 25;
    expect(cardBars(u)).toEqual([1, 1, 0.25]);
    expect(cardBars({ ...u, def: 'beacon' })[0]).toBeLessThan(0); // the Beacon has no pools
    expect(cardLines({ ...u, def: 'beacon' })[1]).not.toContain('MP');
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
    // a first card's height (queue-layout.ts): 52 design px tall, never under 48 px times the floor nor its lines
    for (const s of [0.5, 0.585, 0.87, 0.9, 1, 1.5, 2, 3]) {
      const h = Math.max(52 * s, 48 * listFloor(s), linesHeight(3, s, true));
      const l = statsLayout(h, s);
      // a narrow page (under LIST_MIN) shrinks the floor with the pieces
      expect(l.size).toBeGreaterThanOrEqual(16 * Math.min(1, s / LIST_MIN));
      expect(l.fits).toBe(true);
      // top to bottom: name, life, its bar, stamina and CT, all inside the card
      expect(l.lines[0]).toBeLessThan(l.lines[1]);
      expect(l.lines[1]).toBeLessThan(l.hpBar);
      expect(l.hpBar + l.bar).toBeLessThanOrEqual(l.lines[2] - l.size / 2);
      expect(l.lines[2]).toBeLessThan(l.stBar); // stamina and CT's bars under their line, inside the card
      expect(l.stBar + l.bar).toBeLessThanOrEqual(h + 1e-9);
      expect(l.lines[2] + l.size * 0.55).toBeLessThanOrEqual(h + 1e-9);
      expect(statsLayout(h * 0.6, s, 1)).toMatchObject({ fits: true, hpBar: -1 }); // a repeat: its name, no bar
    }
    expect(statsLayout(40, 1).fits).toBe(false);
  });

  it('a pair of parts takes two columns as wide as its widest part, so MP and CT start on their bars (Nov 21)', () => {
    // name 90 px; "HP 120/120" 80, "MP 15/30" 60; "ST 30/30" 60, "CT 20/100" 70; 3 px margin a side, scale 1
    const w = statWidth([[90], [80, 60], [60, 70]], 1, 3);
    expect(w).toBe(2 * 80 - 6 + 4);
    const half = (w - 6 - 4) / 2; // each bar's width (card.ts): the column's ink fits on it
    expect(half).toBeGreaterThanOrEqual(80 - 6);
    expect(statWidth([[200], [80, 60]], 1, 3)).toBe(200); // a long name keeps its own width
    expect(statWidth([], 1, 3)).toBe(0);
  });

  it("a tablet's 14 px floor lifts the turn list's lines and its rows with them (768x1024: list scale 0.6)", () => {
    setPageFloor(768, 1024);
    expect(listFloor(0.6)).toBeCloseTo(14 / 16, 5);
    const h = Math.max(52 * 0.6, 48 * listFloor(0.6), linesHeight(3, 0.6, true));
    expect(statsLayout(h, 0.6)).toMatchObject({ size: 14, fits: true });
    setPageFloor(844, 390); // a phone on its side keeps its shrunk lines
    expect(statsLayout(h, 0.6).size).toBeCloseTo((16 * 0.6) / LIST_MIN, 5);
    setPageFloor(0, 0);
  });
});

describe('3D interface: bench scenes and boundaries', () => {
  it('every bench scene of the looks is a valid spec', () => {
    const scenes = import.meta.glob<object>('../scripts/sandbox/bench/{menu3d,turn3d,ui3d,layout,batalha}*.json', {
      import: 'default',
      eager: true,
    });
    expect(Object.keys(scenes).length).toBe(16); // the two pixel filter scenes left with it (Nov 18)
    for (const [path, raw] of Object.entries(scenes)) expect(parseSpec(raw).problems, path).toEqual([]);
  });

  const sources = import.meta.glob<string>('../src/client/**/*.ts', { query: '?raw', import: 'default', eager: true });
  const code = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
  const is3d = (path: string) => /\/(ui3d|menu3d|turn3d|bar3d|hints3d|result3d|town3d|flow3d|window3d)\//.test(path);

  // the game online never fetches the looks: outside their folders they are named only as a type or in a dynamic
  // import. The layout and the flags are the exception: small and pure, the Options and the HUD read them
  it('the rest of the client takes the 3D folders and the CSS menu by type or by dynamic import only', () => {
    const value =
      /^import (?!type )[^;]*from\s+['"][^'"]*\/(ui3d\/(?!layout\.ts|walk\.ts)|menu3d\/|turn3d\/|bar3d\/|hints3d\/|result3d\/|town3d\/|flow3d\/|window3d\/)/m;
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
      'ui3d/layout',
      'menu3d/menu-view',
      'menu3d/menu-layout',
      'turn3d/queue-view',
      'turn3d/queue-layout',
      'window3d/tools-layout',
      'window3d/talk-layout',
      'hints3d/hints-view',
      'hints3d/effects-view',
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
    for (const name of ['ui3d/layout'])
      expect(/^import /m.test(code(sources[`../src/client/${name}.ts`])), name).toBe(false);
    for (const name of pure) {
      const text = code(sources[`../src/client/${name}.ts`]);
      expect(/from\s+['"]three['"]|document\.|window\./.test(text), name).toBe(false);
    }
  });

  // Nov 18 (the 3D-only plan, phase 2): a 3D piece lays itself out by its own numbers (the *-layout.ts and *-view.ts
  // files), so the style sheet can go without moving the drawing. What still reads the page is listed here, file by
  // file, with how many reads and why; a new one fails until it is either made pure or argued for on this list.
  //   page: the canvas's own size, the one measure everything else is computed from
  //   notch: env(safe-area-inset-*) through a probe, which CSS alone can tell
  //   colour: a colour or a font NAME off :root's custom properties (--ui3d-*, --mark-*), never a size
  //   scroll: how far the unseen list under the drawing can scroll (the skeleton scrolls, the drawing follows it)
  it('no 3D piece measures the HTML outside the listed reads', () => {
    const MEASURE =
      /getBoundingClientRect|getComputedStyle|offset(?:Width|Height|Left|Top|Parent)|client(?:Width|Height|Left|Top)|scroll(?:Width|Height)/g;
    const ALLOWED: Record<string, [number, string]> = {
      'ui3d/layer': [3, 'page: the layer root clientWidth and clientHeight; colour: the theme off :root'],
      'ui3d/safe-area': [1, 'notch: the padding of the env() probe'],
      'flow3d/draw': [1, 'colour'],
      'flow3d/sheet-draw': [1, 'colour: a mark of the how-to-play sheet'],
      'flow3d/dev3d': [1, 'colour'],
      'flow3d/sheet3d': [7, 'scroll: the sheet scroller range and its page step for PageUp, PageDown, Home, End'],
      'hints3d/effects3d': [1, 'colour: the floating numbers and the counter'],
      'result3d/result3d': [1, 'colour'],
      'town3d/town3d': [3, 'colour; scroll: whether the open list has more under its foot'],
      'town3d/map3d': [1, 'colour'],
      'window3d/note3d': [1, 'colour'],
    };
    const found: Record<string, number> = {};
    for (const [path, text] of Object.entries(sources)) {
      const n = is3d(path) ? (code(text).match(MEASURE)?.length ?? 0) : 0;
      if (n) found[path.replace('../src/client/', '').replace('.ts', '')] = n;
    }
    expect(found).toEqual(Object.fromEntries(Object.entries(ALLOWED).map(([file, [n]]) => [file, n])));
  });
});
