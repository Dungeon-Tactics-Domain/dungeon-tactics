import { describe, expect, it } from 'vitest';
import { type BattlePanel, barCells, panelRows } from '../src/client/battleedit/panel.ts';
import { playWhy } from '../src/client/battleedit/play.ts';
import {
  addAbility,
  cycleItem,
  dropAbility,
  missingAbilities,
  numberOf,
  setName,
  stepNumber,
} from '../src/client/battleedit/sheet-edit.ts';
import { firstSlots, parseSlots, withSlot } from '../src/client/battleedit/slots.ts';
import { mapSources, nextSource, roomBattle } from '../src/client/battleedit/sources.ts';
import { defaultSetup } from '../src/client/dev-roster.ts';
import { PALETTE } from '../src/content/map-palette.ts';
import { BEACON_HILL } from '../src/content/maps/beacon-hill.ts';
import { UNIT_DEFS } from '../src/shared/battle/units.ts';
import { type BattleDoc, battleFromScenario, blankBattle } from '../src/shared/mapedit/battle.ts';
import { blankDoc } from '../src/shared/mapedit/doc.ts';
import { paint } from '../src/shared/mapedit/edit.ts';
import { afterUnits, bagStep, setControl, setObjective, sound, withMap } from '../src/shared/mapedit/setup.ts';
import { placeUnit, removeUnit, setSheet } from '../src/shared/mapedit/units.ts';

const two = (): BattleDoc => {
  const b = placeUnit(blankBattle(blankDoc(6, 6)), { x: 1, y: 1 }, 'warrior', 'hero');
  return placeUnit(b, { x: 4, y: 4 }, 'rat', 'enemy');
};
const wall = PALETTE.find((e) => e.terrain === 'wall')!;

describe('battle-wide edits keep the draft readable', () => {
  it('another map keeps the units that fit and drops the rest', () => {
    const b = two();
    const small = withMap(b, blankDoc(4, 4));
    expect(small.units.map((u) => u.def)).toEqual(['warrior']);
    const walled = withMap(b, paint(blankDoc(6, 6), { x: 1, y: 1 }, wall));
    expect(walled.units.map((u) => u.def)).toEqual(['rat']);
    expect(sound(small) && sound(walled)).toBe(true);
  });

  it('the Beacon objective needs a Beacon on the heroes’ side and leaves with it', () => {
    let b = two();
    expect(setObjective(b, 'beacon')).toBe(b);
    b = placeUnit(b, { x: 0, y: 5 }, 'beacon', 'hero');
    b = setObjective(b, 'beacon');
    expect(b.objective).toEqual({ kind: 'beacon' });
    const gone = afterUnits(removeUnit(b, { x: 0, y: 5 }));
    expect(gone.objective).toBeUndefined();
    expect(sound(gone)).toBe(true);
    // without afterUnits the save would refuse it
    expect(sound(removeUnit(b, { x: 0, y: 5 }))).toBe(false);
  });

  it('survive keeps its turns within 1 to 99, default drops the field', () => {
    const b = setObjective(two(), 'survive', 500);
    expect(b.objective).toEqual({ kind: 'survive', turns: 99 });
    expect(setObjective(b, 'default').objective).toBeUndefined();
    expect(setObjective(setObjective(two(), 'survive'), 'survive').objective).toEqual({ kind: 'survive', turns: 10 });
  });

  it('who plays each side: the usual choice leaves the field out', () => {
    const b = setControl(two(), 'enemy', 'player');
    expect(b.control).toEqual({ enemy: 'player' });
    expect(setControl(b, 'enemy', 'ai').control).toBeUndefined();
    expect(setControl(two(), 'hero', 'ai').control).toEqual({ hero: 'ai' });
  });

  it('a bag steps between 0 and 99 per item, and an empty one leaves', () => {
    let b = bagStep(two(), 'enemy', 'life_potion', 1);
    expect(b.bags).toEqual({ enemy: { life_potion: 1 } });
    expect(bagStep(b, 'enemy', 'life_potion', -1).bags).toBeUndefined();
    expect(bagStep(b, 'enemy', 'nope', 1)).toBe(b);
    for (let i = 0; i < 120; i++) b = bagStep(b, 'enemy', 'life_potion', 1);
    expect(b.bags?.enemy?.life_potion).toBe(99);
    expect(sound(b)).toBe(true);
  });
});

describe('a unit’s sheet in the builder', () => {
  const u = () => two().units[0];

  it('a number back at the class’s value leaves the sheet', () => {
    const up = stepNumber(u(), 'speed', 1);
    expect(up.speed).toBe(UNIT_DEFS.warrior.speed + 1);
    expect(stepNumber({ ...u(), ...up }, 'speed', -1)).toEqual({});
    expect(numberOf(u(), 'hp')).toBe(UNIT_DEFS.warrior.hp);
  });

  it('numbers stop at their limits', () => {
    let x = u();
    for (let i = 0; i < 200; i++) x = { ...x, ...stepNumber(x, 'hp', 1) };
    expect(x.hp).toBe(999);
    for (let i = 0; i < 20; i++) x = { ...x, ...stepNumber(x, 'move', -1) };
    expect(x.move).toBe(1);
  });

  it('the starting CT starts empty, + gives 0, − under 0 empties it, at most 100', () => {
    let x = u();
    expect(stepNumber(x, 'ct', -1).ct).toBeUndefined();
    x = { ...x, ...stepNumber(x, 'ct', 1) };
    expect(x.ct).toBe(0);
    for (let i = 0; i < 20; i++) x = { ...x, ...stepNumber(x, 'ct', 1) };
    expect(x.ct).toBe(100);
    expect(stepNumber({ ...u(), ct: 0 }, 'ct', -1).ct).toBeUndefined();
  });

  it('the name: empty or the class’s gives the class back', () => {
    expect(setName(u(), ' Bran ')).toEqual({ name: 'Bran' });
    expect(setName({ ...u(), name: 'Bran' }, '')).toEqual({});
    expect(setName(u(), UNIT_DEFS.warrior.name)).toEqual({});
  });

  it('equipment cycles round the slot’s pieces, none included', () => {
    const one = cycleItem(u(), 'head', 1);
    expect(one.items?.head).toBeDefined();
    expect(cycleItem({ ...u(), ...one }, 'head', -1)).toEqual({});
    expect(cycleItem(u(), 'head', -1).items?.head).toBeDefined();
  });

  it('abilities: the last never leaves, an added one joins once', () => {
    const x = { ...u(), abilities: ['strike'] };
    expect(dropAbility(x, 0).abilities).toEqual(['strike']);
    const id = missingAbilities(x)[0];
    expect(addAbility(x, id).abilities).toEqual(['strike', id]);
    expect(addAbility({ ...x, abilities: ['strike', id] }, id).abilities).toEqual(['strike', id]);
  });

  it('every step reads back through the save', () => {
    let b = two();
    const p = { x: 1, y: 1 };
    for (const step of [
      (x: BattleDoc['units'][0]) => stepNumber(x, 'ct', 1),
      (x: BattleDoc['units'][0]) => cycleItem(x, 'main', 1),
      (x: BattleDoc['units'][0]) => setName(x, 'Vesper'),
    ])
      b = setSheet(b, p, step(b.units[0]));
    expect(b.units[0]).toMatchObject({ ct: 0, name: 'Vesper' });
    expect(sound(b)).toBe(true);
  });
});

describe('saves and the Developer menu’s cast', () => {
  it('the first opening turns the saved cast into the slot “Desenvolvedor”', () => {
    const slots = firstSlots(null, JSON.parse(JSON.stringify(defaultSetup('beacon_hill'))));
    expect(slots.map((s) => s.name)).toEqual(['Desenvolvedor']);
    expect(sound(slots[0].doc)).toBe(true);
    expect(slots[0].doc.units.some((u) => u.team === 'enemy')).toBe(true);
  });

  it('with slots already saved, the cast is left alone; no cast, no slot', () => {
    expect(firstSlots([], defaultSetup('beacon_hill'))).toEqual([]);
    expect(firstSlots(null, null)).toEqual([]);
  });

  it('slots read back one per name, the broken dropped, the newest last', () => {
    const a = { name: 'A', doc: two() };
    const raw = JSON.parse(
      JSON.stringify([a, { name: 'B', doc: { map: 1 } }, { ...a, doc: blankBattle(blankDoc(5, 5)) }]),
    );
    const slots = parseSlots(raw);
    expect(slots).toHaveLength(1);
    expect(slots[0].doc.map.width).toBe(5);
    expect(withSlot(slots, { name: 'C', doc: two() }).map((s) => s.name)).toEqual(['A', 'C']);
  });
});

describe('maps and rooms', () => {
  it('the game’s maps come first, then the map builder’s saved ones', () => {
    const list = mapSources([blankDoc(5, 5)]);
    expect(list[0].key).toBe('game:skirmish');
    expect(list.at(-1)?.key).toBe('saved:Novo mapa');
    expect(nextSource(list, list[0].key, -1)).toBe(list.at(-1));
  });

  it('an expedition room is a whole battle that saves', () => {
    const b = roomBattle(77, 2)!;
    expect(b.objective).toEqual({ kind: 'defeat_all' });
    expect(b.units.filter((u) => u.team === 'enemy').length).toBeGreaterThan(0);
    expect(sound(b)).toBe(true);
  });

  it('a game map’s battle reads back', () => {
    expect(sound(battleFromScenario(BEACON_HILL))).toBe(true);
  });
});

describe('the panel', () => {
  const state = (more: Partial<BattlePanel> = {}): BattlePanel => ({
    tab: 'units',
    sub: 0,
    doc: two(),
    unit: null,
    cls: 'warrior',
    tool: 'hero',
    page: 0,
    perPage: 8,
    name: 'Teste',
    slots: [],
    playWhy: null,
    canUndo: false,
    canRedo: false,
    shown: 'keyboard',
    finger: false,
    source: '',
    seed: 1,
    depth: 1,
    bagSide: 'hero',
    adding: null,
    ...more,
  });

  it('Play says why it cannot open', () => {
    expect(playWhy(two())).toBeNull();
    expect(playWhy(removeUnit(two(), { x: 4, y: 4 }))).toBe('falta um inimigo');
    expect(playWhy(blankBattle(blankDoc(4, 4)))).toBe('falta um herói');
    const play = barCells(state({ playWhy: 'falta um herói' })).at(-1)!;
    expect(play.off).toBe(true);
    expect(play.text).toContain('falta um herói');
  });

  it('nine bar plates with their keys, the tool in use lit', () => {
    const bar = barCells(state());
    expect(bar).toHaveLength(9);
    expect(bar[1].on).toBe(true);
    expect(bar[0].text.endsWith('· 1')).toBe(true);
    expect(barCells(state({ finger: true }))[0].text).toBe('Escolher');
  });

  it('the Sheet shows Move and Jump in half tiles, and the Beacon has none', () => {
    const u = two().units[0];
    const rows = panelRows(state({ tab: 'sheet', unit: u }));
    const move = rows.flatMap((r) => r.cells).find((c) => c.id === 'num:moveValue');
    expect(move?.text).toBe(String(UNIT_DEFS.warrior.move * 2));
    const beacon = placeUnit(two(), { x: 0, y: 0 }, 'beacon', 'hero').units.at(-1)!;
    const ids = panelRows(state({ tab: 'sheet', unit: beacon })).flatMap((r) => r.cells.map((c) => c.id));
    expect(ids).toContain('beacon');
    expect(ids).not.toContain('num:hp:1');
  });

  it('every tab and page has rows, every id unique', () => {
    const u = two().units[0];
    for (const tab of ['units', 'sheet', 'battle', 'file'] as const)
      for (const sub of [0, 1, 2]) {
        const ids = panelRows(state({ tab, sub, unit: u, adding: 'strike' })).flatMap((r) => r.cells.map((c) => c.id));
        expect(ids.length).toBeGreaterThan(0);
        expect(new Set(ids).size).toBe(ids.length);
      }
  });
});
