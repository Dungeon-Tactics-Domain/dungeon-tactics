import { afterEach, describe, expect, it } from 'vitest';
import { ABILITIES } from '../src/shared/battle/abilities.ts';
import { previewAbility } from '../src/shared/battle/combat.ts';
import { traceShot } from '../src/shared/battle/shot.ts';
import { SHOT_DEFAULTS, SHOT_RULES, type ShotRules } from '../src/shared/battle/shot-rules.ts';
import type { Pos } from '../src/shared/battle/types.ts';
import { bodyMetres, PERSON_M } from '../src/shared/battle/units.ts';
import { gridOf, stateOf } from './battle-helpers.ts';

// Fernando, Nov 25: the shooter adapts its launch height to its body's form and the attack, the shot may hit any
// visible part of the target, and the less of it is seen the lower the chance; each part is a switch (shot-rules.ts)
const set = (r: Partial<ShotRules>) => Object.assign(SHOT_RULES, structuredClone(SHOT_DEFAULTS), r);
afterEach(() => set({}));

const row = (heights: string) => gridOf([heights.replace(/./g, '.')], [heights]);
const shoot = (heights: string, shooter: string, target: string, at: Pos, launch?: [number, number]) => {
  const s = stateOf([
    { id: 'a', def: shooter, team: 'hero', x: 0, y: 0 },
    { id: 'b', def: target, team: 'enemy', ...at },
  ]);
  return traceShot(row(heights), s, s.units[0], at, false, launch);
};
// the Rogue's thrown knife (straight, launched overhead) at a unit 4 tiles off, the chance it would land
const knife = (heights: string, target: string) => {
  const s = stateOf([
    { id: 'a', def: 'rogue', team: 'hero', x: 0, y: 0 },
    { id: 'b', def: target, team: 'enemy', x: 4, y: 0 },
  ]);
  return previewAbility(row(heights), s, 'a', 'throwing_knife', { x: 4, y: 0 });
};

describe('the shooter raises its arm over cover (Nov 25)', () => {
  it('a person behind a 1 m wall now shoots a person beyond it; middle to middle (switches off) the wall stops it', () => {
    expect(shoot('0001000', 'soldier', 'soldier', { x: 6, y: 0 }).stop).toBeNull();
    set({ launch: false, parts: false });
    expect(shoot('0001000', 'soldier', 'soldier', { x: 6, y: 0 }).stop).toMatchObject({ pos: { x: 3, y: 0 } });
  });

  it('a four-legged creature launches only from its head; a person from the middle of its range', () => {
    const [lo, hi] = SHOT_RULES.forms.quadruped;
    expect(shoot('0000000', 'rat', 'soldier', { x: 6, y: 0 }).from.h).toBeCloseTo((bodyMetres('rat') * (lo + hi)) / 2);
    expect(shoot('0000000', 'soldier', 'soldier', { x: 6, y: 0 }).from.h).toBeCloseTo(PERSON_M * 0.725);
  });

  it("the thrown knife leaves from the upper half of the body's range", () => {
    const [lo, hi] = SHOT_RULES.forms.humanoid;
    const [a, b] = ABILITIES.throwing_knife.launch!;
    const mid = lo + (hi - lo) * ((a + b) / 2);
    expect(shoot('0000000', 'rogue', 'soldier', { x: 6, y: 0 }, [a, b]).from.h).toBeCloseTo(PERSON_M * mid);
  });

  it('with every height stopped the shot is the middle one and stops on the obstacle', () => {
    const s = shoot('0003000', 'soldier', 'soldier', { x: 6, y: 0 });
    expect(s.stop).toMatchObject({ pos: { x: 3, y: 0 }, unit: null });
    expect(s.from.h).toBeCloseTo(PERSON_M * 0.725);
    expect(s.to.h).toBeCloseTo(PERSON_M / 2);
  });
});

describe('a shot hits any visible part, and less seen is less chance (Nov 25)', () => {
  it('a rat 3 tiles back on a 2 m ledge stays hidden from the thrown knife; a person there shows half its body', () => {
    const throw_ = ABILITIES.throwing_knife.launch;
    expect(shoot('0002222', 'rogue', 'rat', { x: 6, y: 0 }, throw_).stop).toMatchObject({ pos: { x: 3, y: 0 } });
    const person = shoot('0002222', 'rogue', 'soldier', { x: 6, y: 0 }, throw_);
    expect(person.stop).toBeNull();
    expect(person.seen).toBe(0.5);
  });

  it("a bow's curve with the switches on clears a 2 m wall and still sees the whole body beyond it", () => {
    const s = stateOf([
      { id: 'a', def: 'archer', team: 'hero', x: 0, y: 0 },
      { id: 'b', def: 'soldier', team: 'enemy', x: 7, y: 0 },
    ]);
    const shot = traceShot(row('00020000'), s, s.units[0], { x: 7, y: 0 }, true, ABILITIES.shot.launch);
    expect(shot.stop).toBeNull();
    expect(shot.seen).toBe(1);
  });

  // Nov 25, "Rato no alto mais escondido": a small creature is aimed at only up to half its height (its head is too
  // small to count), so 2 tiles back on a 2 m ledge it hides again; a person there is still seen
  it('a rat 2 tiles back on a 2 m ledge hides from the archer below; a person there is hit', () => {
    expect(shoot('0000002222', 'archer', 'rat', { x: 8, y: 0 }).stop).toMatchObject({ unit: null });
    expect(shoot('0000002222', 'archer', 'soldier', { x: 8, y: 0 }).stop).toBeNull();
    set({ aims: { ...SHOT_DEFAULTS.aims, quadruped: [0.2, 0.9] } });
    expect(shoot('0000002222', 'archer', 'rat', { x: 8, y: 0 }).stop).toBeNull(); // the head counted: seen
  });

  it('a rat back on a 3 m ledge stays hidden: none of its points clears the edge', () => {
    expect(knife('00033', 'rat')).toMatchObject({ ok: true, targets: [] });
  });

  it('a person there whose head clears is hit, with half the chance the switch off gives', () => {
    const seen = knife('00033', 'soldier');
    expect(seen.shot?.stop).toBeNull();
    expect(seen.shot?.seen).toBe(0.5);
    set({ cover: false });
    const open = knife('00033', 'soldier');
    expect(open.shot?.seen).toBe(1);
    expect(seen.targets[0].chance).toBe(Math.floor(open.targets[0].chance * 0.5));
    expect(seen.targets[0].chance).toBeLessThan(open.targets[0].chance);
  });

  it('the cover weight scales what the hidden share takes off; weight 0 leaves the chance whole', () => {
    set({ cover: false });
    const open = knife('00033', 'soldier').targets[0].chance;
    set({ coverWeight: 0.5 });
    expect(knife('00033', 'soldier').targets[0].chance).toBe(Math.floor(open * 0.75));
    set({ coverWeight: 0 });
    expect(knife('00033', 'soldier').targets[0].chance).toBe(open);
  });

  it('a form range set from the debug menu moves the launch', () => {
    set({ forms: { ...SHOT_DEFAULTS.forms, quadruped: [0, 0.2] } });
    expect(shoot('0000000', 'rat', 'soldier', { x: 6, y: 0 }).from.h).toBeCloseTo(bodyMetres('rat') * 0.1);
  });

  it('in the open every point is seen and the chance is unchanged', () => {
    const open = knife('00000', 'soldier');
    expect(open.shot?.seen).toBe(1);
    set({ cover: false });
    expect(knife('00000', 'soldier').targets[0].chance).toBe(open.targets[0].chance);
  });

  it('aims at a point of the body and lands its ring under it; with parts off, at the middle', () => {
    const s = shoot('0000000', 'soldier', 'rat', { x: 6, y: 0 });
    expect(s.lift).toBeCloseTo(s.to.h);
    expect(s.lift).toBeGreaterThan(bodyMetres('rat') * 0.2 - 1e-9);
    set({ parts: false });
    expect(shoot('0000000', 'soldier', 'rat', { x: 6, y: 0 }).to.h).toBeCloseTo(bodyMetres('rat') / 2);
  });

  it('an empty aimed tile keeps the person middle and no share', () => {
    const s = stateOf([{ id: 'a', def: 'soldier', team: 'hero', x: 0, y: 0 }]);
    const shot = traceShot(row('0000000'), s, s.units[0], { x: 6, y: 0 }, false);
    expect(shot.to.h).toBeCloseTo(PERSON_M / 2);
    expect(shot.seen).toBe(1);
  });

  it('every switch off gives the path of commit 44aac769: middle to middle', () => {
    set({ launch: false, parts: false, cover: false });
    const s = shoot('0000000', 'soldier', 'rat', { x: 6, y: 0 });
    expect(s.from.h).toBeCloseTo(PERSON_M / 2);
    expect(s.to.h).toBeCloseTo(bodyMetres('rat') / 2);
    expect(s.seen).toBe(1);
  });
});
