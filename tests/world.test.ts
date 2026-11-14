import { describe, expect, it } from 'vitest';
import { SPEAKERS } from '../src/client/campaign.ts';
import {
  ALL_CHAPTERS,
  afterNode,
  chaptersOnMap,
  isOpen,
  nodeOfChapter,
  parseWorld,
  partyFor,
  step,
  WORLD,
} from '../src/client/world.ts';

describe('world map', () => {
  it('every stage has one point, once only, in campaign order; the rest is story with dialogue', () => {
    expect(chaptersOnMap()).toEqual(ALL_CHAPTERS);
    const order = ALL_CHAPTERS.map(nodeOfChapter);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    for (const w of WORLD) {
      expect(w.x >= 0 && w.x <= 100 && w.y >= 0 && w.y <= 100, w.id).toBe(true);
      if (w.chapter === undefined) {
        expect(w.scene?.length, w.id).toBeGreaterThan(0);
        for (const l of w.scene!) expect(SPEAKERS[l.who] && l.pt && l.en).toBeTruthy();
      }
    }
    expect(new Set(WORLD.map((w) => w.id)).size).toBe(WORLD.length);
  });

  it('opens the points already passed and the next; replaying an old one does not roll back progress', () => {
    expect(isOpen(0, 0)).toBe(true);
    expect(isOpen(1, 0)).toBe(false);
    expect(isOpen(3, 3)).toBe(true);
    expect(isOpen(WORLD.length - 1, WORLD.length)).toBe(true);
    expect(afterNode(1, 5)).toBe(5);
    expect(afterNode(5, 5)).toBe(6);
  });

  it('arrows move one point and stop at the end or at a closed point', () => {
    expect(step(0, -1, 3)).toBe(0);
    expect(step(2, 1, 3)).toBe(3);
    expect(step(3, 1, 3)).toBe(3);
    expect(step(3, -1, 3)).toBe(2);
  });

  it('the Party shows who goes to the next battle, with its abilities, and who stays in camp', () => {
    const start = partyFor(0, { name: 'Aria', cls: 'mage' });
    expect(start.units.map((u) => u.name)).toEqual(['Bran', 'Tess', 'Aria', 'Lia']);
    expect(start.units.every((u) => u.abilities.length === 2)).toBe(true);
    expect(start.benched).toBe('Odo');
    expect(partyFor(WORLD.length, null)).toMatchObject({ benched: null });
    expect(partyFor(WORLD.length, null).units[0].abilities).toHaveLength(4);
  });

  it('saved progress only accepts a valid number', () => {
    expect(parseWorld('4')).toBe(4);
    for (const bad of ['-1', '999', 'x', null, '2.5']) expect(parseWorld(bad)).toBe(0);
  });
});
