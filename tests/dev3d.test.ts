import { describe, expect, it } from 'vitest';
import { defaultSetup, LIMITS, parseSetup, unitFrom } from '../src/client/dev-roster.ts';
import { devEdit, devFields, devJson, devLayout, MAX_ABILITIES, readSetup } from '../src/client/flow3d/dev-view.ts';
import {
  caretOf,
  clampNumber,
  type Field,
  fieldParts,
  fieldWalk,
  flowFields,
  isStop,
  metrics,
  shown,
  sideways,
  TAP,
  thumb,
} from '../src/client/ui3d/field.ts';
import type { Box } from '../src/client/ui3d/layout.ts';
import { skinFlags } from '../src/client/ui3d/skin-flags.ts';
import { SUB } from '../src/shared/battle/half.ts';
import { UNIT_DEFS } from '../src/shared/battle/units.ts';

// The 3D form kit (ui3d/field.ts) and the developer menu drawn with it (flow3d/dev-view.ts; Nov 18): the pure parts
// behind the drawing and the real controls under it

const PAGES: [w: number, h: number][] = [
  [1920, 1080],
  [1152, 648],
  [844, 390], // a phone on its side
];
const over = (a: Box, b: Box) =>
  a.x < b.x + b.w - 0.01 && b.x < a.x + a.w - 0.01 && a.y < b.y + b.h - 0.01 && b.y < a.y + a.h - 0.01;
const byId = (fields: Field[], id: string) => fields.findIndex((f) => f.id === id);

describe('3D form kit: fields', () => {
  const form: Field[] = [
    { kind: 'pick', id: 'map', label: 'Map', text: 'Hill' },
    { kind: 'note', id: 'goal', label: 'Goal' },
    { kind: 'button', id: 'a', label: 'A' },
    { kind: 'button', id: 'b', label: 'B', off: true },
    { kind: 'button', id: 'c', label: 'C' },
    { kind: 'head', id: 'h', label: 'Heroes' },
    { kind: 'button', id: 'u', label: 'Unit', fold: true },
    { kind: 'text', id: 'name', label: 'Name', value: 'Bran', max: 24 },
    { kind: 'number', id: 'hp', label: 'HP', value: 30, min: 1, max: 999, step: 1 },
    { kind: 'check', id: 'x', label: 'X', on: true },
    { kind: 'check', id: 'y', label: 'Y', on: false },
    { kind: 'area', id: 'json', label: 'JSON', value: '{}', rows: 4 },
  ];

  it('a number goes to the nearest step inside its limits, and to its floor when unreadable', () => {
    const move = { min: 2, max: 24, step: 2 };
    expect(clampNumber(move, 7)).toBe(8);
    expect(clampNumber(move, 999)).toBe(24);
    expect(clampNumber(move, -3)).toBe(2);
    expect(clampNumber(move, Number('abc'))).toBe(2);
    expect(clampNumber({ min: 1, max: 999, step: 1 }, 12.4)).toBe(12);
  });

  it('on every page no two fields overlap, all stay in the column and every control takes a 44 px tap', () => {
    for (const [w, h] of PAGES) {
      const L = devLayout(w, h),
        { boxes, height } = flowFields(form, L.m);
      expect(boxes).toHaveLength(form.length);
      boxes.forEach((b, i) => {
        const at = `${w}x${h} ${form[i].id}`;
        expect(b.x, at).toBeGreaterThanOrEqual(0);
        expect(b.x + b.w, at).toBeLessThanOrEqual(L.m.w + 0.01);
        expect(b.y + b.h, at).toBeLessThanOrEqual(height + 0.01);
        for (const o of boxes.slice(i + 1)) expect(over(b, o), at).toBe(false);
        if (!isStop(form[i])) return;
        expect(b.h, at).toBeGreaterThanOrEqual(TAP);
        const p = fieldParts(form[i], b, L.m);
        for (const arrow of [p.less, p.more]) {
          if (!arrow) continue;
          expect(arrow.w, at).toBeGreaterThanOrEqual(TAP);
          expect(arrow.h, at).toBeGreaterThanOrEqual(TAP);
        }
        // the value and its arrows side by side, inside the row
        if (p.less && p.value && p.more) {
          expect(p.less.x + p.less.w).toBeCloseTo(p.value.x);
          expect(p.value.x + p.value.w).toBeCloseTo(p.more.x);
          expect(p.more.x + p.more.w).toBeCloseTo(b.x + b.w);
          expect(p.value.w, at).toBeGreaterThanOrEqual(100);
        }
      });
    }
  });

  it('the page keeps the sheet on screen, room for the glove at its left and a list to scroll', () => {
    for (const [w, h] of PAGES) {
      const L = devLayout(w, h),
        at = `${w}x${h}`;
      expect(L.panel.x - L.hand, at).toBeGreaterThanOrEqual(0);
      expect(L.panel.x + L.panel.w, at).toBeLessThanOrEqual(w);
      expect(L.panel.y + L.panel.h, at).toBeLessThanOrEqual(h);
      expect(L.list.h, at).toBeGreaterThanOrEqual(4 * L.m.row); // at least four rows in view
      expect(L.m.cols, at).toBeGreaterThanOrEqual(2);
    }
    expect(devLayout(1920, 1080).m.row).toBe(64);
    expect(devLayout(844, 390).m.row).toBe(TAP);
  });

  it('marks and plain buttons share a row in columns; a value, a group and an area span the column', () => {
    const m = metrics(900, 1),
      { boxes } = flowFields(form, m);
    const box = (id: string) => boxes[byId(form, id)];
    expect(m.cols).toBe(3);
    expect(box('a').y).toBe(box('c').y);
    expect(box('a').x).toBeLessThan(box('b').x);
    expect(box('x').y).toBe(box('y').y);
    for (const id of ['map', 'u', 'name', 'hp', 'json']) expect(box(id).w, id).toBe(900);
    expect(box('json').h).toBe(4 * m.line + 2 * m.inset);
  });

  describe('the cursor goes where the eye goes', () => {
    const m = metrics(900, 1),
      { boxes } = flowFields(form, m);
    const go = (from: string, way: 'up' | 'down' | 'left' | 'right') =>
      form[fieldWalk(form, boxes, byId(form, from), way)].id;

    it('down: to the row under, past a note, a heading and a button that is off', () => {
      expect(go('map', 'down')).toBe('a'); // the first column, where reading starts
      expect(go('a', 'down')).toBe('u');
      expect(go('u', 'down')).toBe('name');
      expect(go('hp', 'down')).not.toBe('json');
      expect(go('x', 'down')).toBe('json');
    });
    it('up: back the same way', () => {
      expect(go('u', 'up')).toBe('a');
      expect(go('json', 'up')).toBe('x');
      expect(go('a', 'up')).toBe('map');
      expect(go('name', 'up')).toBe('u');
      expect(go('x', 'up')).toBe('hp');
    });
    it('left and right: along a row of marks or buttons, over the one that is off', () => {
      expect(go('a', 'right')).toBe('c');
      expect(go('c', 'left')).toBe('a');
      expect(go('x', 'right')).toBe('y');
      expect(go('y', 'left')).toBe('x');
    });
    it('at an edge the cursor stays: no wrap', () => {
      expect(go('map', 'up')).toBe('map');
      expect(go('json', 'down')).toBe('json');
      expect(go('a', 'left')).toBe('a');
      expect(go('y', 'right')).toBe('y');
      expect(go('u', 'left')).toBe('u');
    });
    it('from no field, the first stop', () => {
      expect(fieldWalk(form, boxes, -1, 'down')).toBe(0);
      expect(fieldWalk([form[1], form[5]], boxes, -1, 'down')).toBe(-1);
    });
  });

  it('a sideways arrow changes a value, moves a caret or walks', () => {
    const does = (id: string) => sideways(form[byId(form, id)]);
    expect([does('map'), does('hp')]).toEqual(['step', 'step']);
    expect([does('name'), does('json')]).toEqual(['caret', 'caret']);
    expect([does('a'), does('x')]).toEqual(['walk', 'walk']);
  });

  it('finds the caret in lines of text, fades a row leaving the window and sizes the scroll mark', () => {
    expect(caretOf('ab\ncd\nef', 4)).toEqual({ line: 1, col: 1 });
    expect(caretOf('ab', 0)).toEqual({ line: 0, col: 0 });
    expect(shown(300, 100, 44)).toBe(1);
    expect(shown(300, -22, 44)).toBe(0);
    expect(shown(300, 290, 44)).toBe(0);
    expect(shown(300, -11, 44)).toBeCloseTo(0.5);
    const win = { x: 0, y: 100, w: 500, h: 300 };
    expect(thumb(win, 300, 0, 1)).toBeNull();
    expect(thumb(win, 600, 0, 1)).toMatchObject({ y: 100, h: 150 });
    expect(thumb(win, 600, 300, 1)).toMatchObject({ y: 250, h: 150 });
  });
});

describe('3D developer menu: the cast as a form', () => {
  const base = () => defaultSetup('beacon_hill');
  const ids = (fields: Field[]) => fields.map((f) => f.id);
  const field = <K extends Field['kind']>(fields: Field[], id: string, kind: K) => {
    const f = fields[byId(fields, id)];
    expect(f?.kind, id).toBe(kind);
    return f as Extract<Field, { kind: K }>;
  };

  it('closed: the map, the commands, a row per unit and Add per side, the JSON', () => {
    const fields = devFields(base());
    expect(ids(fields)).toEqual([
      ...['map', 'goal', 'start', 'export', 'import', 'reset', 'back'],
      ...['h', 'h0', 'h1', 'h2', 'h3', 'h+'],
      ...['e', 'e0', 'e1', 'e2', 'e3', 'e+'],
      ...['json-head', 'json-note', 'json'],
    ]);
    expect(field(fields, 'map', 'pick').text).toBe('Colina do Farol');
    expect(field(fields, 'h', 'head').label).toBe('Heróis · 4/4');
    expect(field(fields, 'h0', 'button')).toMatchObject({ fold: false, label: '1. Guerreiro' });
    expect(field(fields, 'start', 'button').off).toBe(false);
    // no free starting tile: Add is off and says why
    expect(field(fields, 'h+', 'button')).toMatchObject({ off: true, label: 'Sem casa de partida livre' });
    expect(readSetup(field(fields, 'json', 'area').value)).toEqual(base());
  });

  it('open: the class, the name, the four numbers in what the game spends, every ability and Remove', () => {
    const s = base(),
      fields = devFields(s, { open: 'h0' }),
      u = s.heroes[0];
    expect(field(fields, 'h0', 'button').fold).toBe(true);
    expect(field(fields, 'h0.base', 'pick').text).toBe('Guerreiro');
    expect(field(fields, 'h0.name', 'text')).toMatchObject({ value: u.name, max: 24 });
    expect(field(fields, 'h0.hp', 'number')).toMatchObject({ value: u.hp, min: 1, max: 999, step: 1 });
    // Move and Jump in half tiles, the cast keeps whole tiles
    expect(field(fields, 'h0.move', 'number')).toMatchObject({
      value: u.move * SUB,
      min: LIMITS.move[0] * SUB,
      max: LIMITS.move[1] * SUB,
      step: SUB,
    });
    expect(field(fields, 'h0.jump', 'number').step).toBe(SUB);
    const marks = fields.filter((f) => f.id.startsWith('h0.a.'));
    expect(marks.length).toBeGreaterThan(u.abilities.length);
    expect(marks.filter((f) => f.kind === 'check' && f.on).map((f) => f.id)).toEqual(
      expect.arrayContaining(u.abilities.map((a) => `h0.a.${a}`)),
    );
    // the first ability is numbered 1: the basic attack
    expect(field(fields, `h0.a.${u.abilities[0]}`, 'check').label.startsWith('1. ')).toBe(true);
    expect(byId(fields, 'h0.del')).toBeGreaterThan(0);
    expect(byId(fields, 'h1.base')).toBe(-1); // one unit open at a time
  });

  it('what stops the battle is said and Start goes off saying why', () => {
    const s = base();
    s.enemies = [];
    s.heroes[0].abilities = [];
    const fields = devFields(s, { msg: 'Importado.' });
    const warns = fields.filter((f) => f.kind === 'note' && f.warn);
    expect(warns).toHaveLength(2);
    expect(field(fields, 'start', 'button')).toMatchObject({ off: true, label: 'Começar: resolva os avisos' });
    expect(field(fields, 'msg', 'note').label).toBe('Importado.');
    expect(field(fields, 'e+', 'button').off).toBe(false);
  });

  it('the map steps both ways and cuts what does not fit its starting tiles', () => {
    const s = base();
    const next = devEdit(s, 'map', 1);
    expect(next.map).toBe('skirmish');
    expect(devEdit(next, 'map', -1).map).toBe('beacon_hill');
    expect(devEdit(s, 'map', -1).map).toBe('frost_pass'); // around the ends
    expect(next.heroes.length).toBeLessThanOrEqual(s.heroes.length);
    expect(parseSetup(next)).toEqual(next);
    expect(s).toEqual(base()); // the cast handed in is never changed
  });

  it('a new class restarts the numbers and abilities and keeps a name of the player own', () => {
    const s = base();
    const plain = devEdit(s, 'h0.base', 1).heroes[0];
    expect(plain.base).not.toBe('warrior');
    expect(plain).toEqual(unitFrom(plain.base));
    const named = devEdit(devEdit(s, 'h0.name', '  Bran  '), 'h0.base', 1).heroes[0];
    expect(named).toEqual(unitFrom(plain.base, 'Bran'));
    // an empty name goes back to the class's
    expect(devEdit(s, 'h0.name', '   ').heroes[0].name).toBe(UNIT_DEFS.warrior.name);
    expect(devEdit(s, 'h0.name', 'x'.repeat(40)).heroes[0].name).toHaveLength(24);
  });

  it('a number steps, takes what is typed in half tiles and never leaves its limits', () => {
    const s = base(),
      hp = s.heroes[0].hp,
      move = s.heroes[0].move;
    expect(devEdit(s, 'h0.hp', 1).heroes[0].hp).toBe(hp + 1);
    expect(devEdit(s, 'h0.hp', -1).heroes[0].hp).toBe(hp - 1);
    expect(devEdit(s, 'h0.hp', '5000').heroes[0].hp).toBe(999);
    expect(devEdit(s, 'h0.hp', 'abc').heroes[0].hp).toBe(1);
    expect(devEdit(s, 'h0.move', 1).heroes[0].move).toBe(move + 1); // one step on screen is SUB half tiles
    expect(devEdit(s, 'h0.move', String(5 * SUB)).heroes[0].move).toBe(5);
    expect(devEdit(s, 'h0.move', '999').heroes[0].move).toBe(LIMITS.move[1]);
    expect(devEdit(s, 'e1.jump', String(3 * SUB)).enemies[1].jump).toBe(3);
    let low = s;
    for (let i = 0; i < 80; i++) low = devEdit(low, 'h0.speed', -1);
    expect(low.heroes[0].speed).toBe(LIMITS.speed[0]);
    expect(parseSetup(low)).toEqual(low);
  });

  it('an ability marked goes last, unmarked leaves, and the 9th is not taken', () => {
    const s = base(),
      had = s.heroes[0].abilities,
      free = devFields(s, { open: 'h0' })
        .filter((f) => f.kind === 'check' && !f.on)
        .map((f) => f.id);
    const one = devEdit(s, free[0], true);
    expect(one.heroes[0].abilities).toEqual([...had, free[0].slice('h0.a.'.length)]);
    expect(devEdit(one, free[0], false).heroes[0].abilities).toEqual(had);
    expect(devEdit(s, `h0.a.${had[0]}`, false).heroes[0].abilities).toEqual(had.slice(1));
    expect(devEdit(s, 'h0.a.nothing', true)).toBe(s);
    let full = s;
    for (const id of free) full = devEdit(full, id, true);
    expect(full.heroes[0].abilities).toHaveLength(MAX_ABILITIES);
    expect(parseSetup(full)).toEqual(full); // the save still opens
  });

  it('adds while a starting tile is free, removes, and goes back to the map default', () => {
    const s = base();
    expect(devEdit(s, 'h+', 1)).toBe(s); // 4 of 4
    const less = devEdit(s, 'h1.del', 1);
    expect(less.heroes.map((u) => u.base)).toEqual(['warrior', 'mage', 'rogue']);
    const more = devEdit(less, 'h+', 1);
    expect(more.heroes.at(-1)).toEqual(unitFrom('warrior'));
    expect(devEdit(less, 'e+', 1)).toBe(less);
    expect(devEdit(devEdit(less, 'e0.del', 1), 'e+', 1).enemies.at(-1)).toEqual(unitFrom('soldier'));
    expect(devEdit(less, 'reset', 1)).toEqual(s);
    for (const id of ['h9.del', 'x0.hp', 'h0.nothing', 'start']) expect(devEdit(s, id, 1), id).toBe(s);
  });

  it('reads a cast from text only when it is whole and valid', () => {
    const s = base();
    expect(readSetup(devJson(s))).toEqual(s);
    expect(readSetup('{ not json')).toBeNull();
    expect(readSetup('{"map":"nowhere","heroes":[],"enemies":[]}')).toBeNull();
    expect(readSetup('null')).toBeNull();
  });
});

describe('3D developer menu: the look it takes', () => {
  const url = (q: string) => (name: string) => new URLSearchParams(q).get(name);
  it('3D by default, the HTML window with ?ui=html or ?dev=html', () => {
    expect(skinFlags(url('')).dev).toBe('3d');
    expect(skinFlags(url('ui=html')).dev).toBe('html');
    expect(skinFlags(url('dev=html')).dev).toBe('html');
    expect(skinFlags(url('ui=html&dev=3d')).dev).toBe('3d');
  });
});
