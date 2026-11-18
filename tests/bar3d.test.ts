/// <reference types="vite/client" />
import { describe, expect, it } from 'vitest';
import { hang, PLATE, type Spot, sheetLayout } from '../src/client/bar3d/bar-layout.ts';
import { barView, plateView, sheetView } from '../src/client/bar3d/bar-view.ts';
import { parseSpec } from '../src/client/dev/sandbox-spec.ts';
import { forecast } from '../src/client/forecast.ts';
import { REGIONS } from '../src/client/ui3d/layout.ts';
import { Battle } from '../src/shared/battle/battle.ts';
import { UNIT_DEFS } from '../src/shared/battle/units.ts';
import { flat, stateOf } from './battle-helpers.ts';

// The 3D combat bar behind ?bar=3d (Nov 16): the pure parts behind the drawing. The drawing itself is checked on the
// bench shots (scripts/sandbox/bench/bar3d*.json)
const duel = (hp?: number) =>
  new Battle(
    flat(6, 6),
    stateOf([
      { id: 'a', def: 'warrior', team: 'hero', x: 1, y: 1 },
      { id: 'b', def: 'soldier', team: 'enemy', x: 2, y: 1, hp },
      { id: 'beacon', def: 'beacon', team: 'hero', x: 5, y: 5 },
    ]),
  );
const unit = (b: Battle, id: string) => b.state.units.find((u) => u.id === id)!;
const strike = (b: Battle) => {
  const p = b.preview('strike', unit(b, 'b').pos);
  if (!p.ok) throw new Error('the strike should reach');
  return forecast(b, 'strike', p);
};

describe('3D combat bar: what it shows', () => {
  it("the acting unit's sheet reads the same numbers as the HTML panel", () => {
    const b = duel();
    const s = sheetView(b.state, b.actor);
    expect(s).toMatchObject({ name: 'Guerreiro', enemy: false, tag: '', line: 'Guerreiro' });
    expect(s.hp).toEqual({ label: 'Vida', value: 210, max: 210 });
    expect(s.change).toEqual({ left: 1, upTo: 1, gain: false });
    expect(s.pools).toEqual([{ label: 'ST', value: 50, max: 50 }]);
    expect(s.ct).toEqual({ label: 'CT', value: 0, max: 100 });
    // what the turn list says after each number (Nov 17): no life regen without a piece, the CT gained each tick
    expect(s.hpRegen).toBe('');
    expect(s.ctGain).toBe(`+${UNIT_DEFS[b.actor.def].speed}`);
    const bare = UNIT_DEFS[b.actor.def];
    UNIT_DEFS[b.actor.def] = { ...bare, hpRegen: 12 };
    try {
      expect(sheetView(b.state, b.actor).hpRegen).toBe('+12');
    } finally {
      UNIT_DEFS[b.actor.def] = bare;
    }
  });

  it('an enemy carries its tag, and what never takes a turn has no CT', () => {
    const b = duel();
    expect(sheetView(b.state, unit(b, 'b'))).toMatchObject({ name: 'Soldado', enemy: true, tag: 'Inimigo' });
    expect(sheetView(b.state, unit(b, 'beacon')).ct).toBeNull();
    expect(sheetView(b.state, unit(b, 'beacon')).ctGain).toBe('');
  });

  it('a unit charging says so on its strip', () => {
    const b = duel();
    b.state.charges.push({ ...b.state.charges[0], unit: 'a', ability: 'strike', ticks: 3 });
    expect(sheetView(b.state, b.actor).line).toBe('Guerreiro · Carregando Golpe (3 tiques)');
  });

  it('without a strike aimed: no plate, and the unit under the cursor on the right', () => {
    const b = duel();
    const v = barView(b.state, b.actor, unit(b, 'b'), [], null);
    expect(v.plate).toBeNull();
    expect(v.sheet?.name).toBe('Guerreiro');
    expect(v.target?.name).toBe('Soldado');
    expect(barView(b.state, undefined, undefined, [], null)).toEqual({ sheet: null, plate: null, target: null });
  });

  it("aiming: the plate carries the forecast's numbers and the target's bar the part that goes away", () => {
    const b = duel();
    const fs = strike(b);
    const [f] = fs;
    const v = barView(b.state, b.actor, undefined, fs, 'strike');
    expect(v.plate).toEqual({
      chance: `⊕ ${f.chance}%`,
      amount: `${f.dmg![0]}–${f.dmg![1]}`,
      big: true,
      label: 'Dano',
      name: 'Golpe',
      warn: false,
    });
    const max = 225;
    expect(v.target?.change).toEqual({ left: f.after[0] / max, upTo: 1, gain: false });
    expect(v.target?.line).toBe(`Soldado · vida ${max} → ${f.after[0]}–${f.after[1]}`);
  });

  it('more targets are counted, a heal adds and a strike on an ally warns', () => {
    const b = duel();
    const [f] = strike(b);
    expect(plateView(f, 'strike', 2).name).toBe('Golpe · +2 alvos');
    expect(plateView(f, 'strike', 1).name).toBe('Golpe · +1 alvo');
    const heal = plateView({ ...f, dmg: null, heal: [7, 10], chance: 100 }, 'heal', 0);
    expect(heal).toMatchObject({ amount: '+7–10', label: 'Cura', chance: '⊕ 100%' });
    expect(plateView({ ...f, ally: true }, 'strike', 0)).toMatchObject({ label: 'Dano · ALIADO!', warn: true });
    // a support has no number: the ability's name takes its place
    const support = plateView({ ...f, dmg: null, support: true }, 'strike', 0);
    expect(support).toMatchObject({ amount: 'Golpe', big: false, chance: '', label: 'Apoio', name: '' });
  });

  it('a heal fills the bar from the life it has', () => {
    const b = duel(100);
    const [f] = strike(b);
    const v = sheetView(b.state, unit(b, 'b'), { ...f, dmg: null, heal: [20, 50], after: [120, 150] }, 'heal');
    expect(v.change).toEqual({ left: 100 / 225, upTo: 150 / 225, gain: true });
  });
});

describe('3D combat bar: where it sits', () => {
  const spots = (l: object) =>
    Object.entries(l).filter((e): e is [string, Spot] => typeof e[1] === 'object' && 'align' in e[1]);
  const boxes = (l: object) =>
    Object.entries(l).filter(
      (e): e is [string, { x: number; y: number; w: number; h: number }] => typeof e[1] === 'object' && 'w' in e[1],
    );

  it('the sheets and the plate are the size of their regions', () => {
    expect([sheetLayout(false).w, sheetLayout(false).h]).toEqual([REGIONS.sheet.w, REGIONS.sheet.h]);
    expect([sheetLayout(true).w, sheetLayout(true).h]).toEqual([REGIONS.target.w, REGIONS.target.h]);
    expect([PLATE.w, PLATE.h]).toEqual([REGIONS.preview.w, REGIONS.preview.h]);
  });

  it('every part lies inside its region', () => {
    for (const l of [sheetLayout(false), sheetLayout(true)]) {
      expect(boxes(l).length).toBe(8);
      expect(spots(l).length).toBe(13);
      for (const [id, b] of boxes(l))
        expect(b.x >= 0 && b.y >= 0 && b.x + b.w <= l.w && b.y + b.h <= l.h, `${id} ${l.mirror}`).toBe(true);
      for (const [id, s] of spots(l))
        expect(s.x > 0 && s.x < l.w && s.y > 0 && s.y < l.h, `${id} ${l.mirror}`).toBe(true);
    }
    expect(spots(PLATE).length).toBe(5);
    for (const [id, s] of spots(PLATE)) expect(s.x + (s.max ?? 0) / 2 <= PLATE.w - PLATE.tip, id).toBe(true);
  });

  it('on the 1920x1080 reference the parts fall on the measured places', () => {
    const at = (r: { x: number; y: number }, b: { x: number; y: number }) => [r.x + b.x, r.y + b.y];
    const s = sheetLayout(false),
      m = sheetLayout(true);
    expect(at(REGIONS.sheet, s.portrait)).toEqual([100, 818]);
    expect(at(REGIONS.sheet, s.hpBar)).toEqual([278, 902]);
    expect(at(REGIONS.sheet, s.poolBar)).toEqual([528, 902]);
    expect(at(REGIONS.sheet, s.ctBar)).toEqual([326, 941]);
    expect(at(REGIONS.sheet, s.name)[0]).toBe(280);
    // the target: its portrait on the right, its text from x=1152
    expect(at(REGIONS.target, m.portrait)).toEqual([1660, 818]);
    expect(at(REGIONS.target, m.name)[0]).toBe(1152);
    expect(at(REGIONS.target, m.hpBar)).toEqual([1150, 902]);
    // the plate's number is centred on x=932
    expect(REGIONS.preview.x + PLATE.amount.x).toBe(932);
  });

  it('a text hangs by its left end, its right end or its middle, and shrinks to fit', () => {
    const sp = (align: Spot['align'], max?: number): Spot => ({ x: 100, y: 0, size: 20, align, max });
    // a 60 px label with 3 px of margin on each side: 54 px of ink
    expect(hang(sp('l'), 60, 1, 3)).toEqual({ x: 127, k: 1 });
    expect(hang(sp('r'), 60, 1, 3)).toEqual({ x: 73, k: 1 });
    expect(hang(sp('c'), 60, 1, 3)).toEqual({ x: 100, k: 1 });
    expect(hang(sp('l'), 60, 2, 3).x).toBe(227); // the spot scales, the label is already in page px
    const fit = hang(sp('l', 27), 60, 1, 3);
    expect(fit.k).toBe(0.5);
    expect(fit.x).toBe(113.5);
  });
});

describe('3D combat bar: bench scenes and boundaries', () => {
  it('its bench scenes are valid', () => {
    const scenes = import.meta.glob<object>('../scripts/sandbox/bench/bar3d*.json', { import: 'default', eager: true });
    expect(Object.keys(scenes).length).toBe(3);
    for (const [path, raw] of Object.entries(scenes)) expect(parseSpec(raw).problems, path).toEqual([]);
  });

  it('the pure parts stay free of Three.js and of the DOM', () => {
    const sources = import.meta.glob<string>('../src/client/bar3d/bar-*.ts', {
      query: '?raw',
      import: 'default',
      eager: true,
    });
    expect(Object.keys(sources).length).toBe(2);
    for (const [path, text] of Object.entries(sources))
      expect(/from\s+['"]three['"]|document\.|window\./.test(text), path).toBe(false);
  });
});
