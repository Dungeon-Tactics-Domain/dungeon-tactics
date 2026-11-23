import { describe, expect, it, vi } from 'vitest';
import { chargeCard } from '../src/client/charge-lines.ts';
import { rowCharge, turnsFolded } from '../src/client/hud-queue.ts';
import { t } from '../src/client/i18n.ts';
import { store } from '../src/client/store.ts';
import { queueRows } from '../src/client/turn-list.ts';
import { chargeMarks } from '../src/client/turn-marks.ts';
import { cardsBox, coversUnit, queueLayout } from '../src/client/turn3d/queue-layout.ts';
import { queueCards } from '../src/client/turn3d/queue-view.ts';
import { Battle } from '../src/shared/battle/battle.ts';
import type { Charge } from '../src/shared/battle/types.ts';
import { flat, stateOf } from './battle-helpers.ts';

// The turn list's three changes of Nov 22 (Fernando): folded on a tablet, see-through over a unit, a charge says its targets
describe('the turn list folds by default on a phone and a tablet', () => {
  it('with no saved choice a touch device opens it folded, a PC open; a saved choice wins', () => {
    const saved = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => saved.get(k) ?? null,
      setItem: (k: string, v: string) => saved.set(k, v),
    });
    expect(turnsFolded(false, false)).toBe(false); // PC
    expect(turnsFolded(false, true)).toBe(true); // tablet: a finger points
    expect(turnsFolded(true, true)).toBe(true); // phone
    store.set('dt:turnsFold', '0');
    expect(turnsFolded(false, true)).toBe(false);
    store.set('dt:turnsFold', '1');
    expect(turnsFolded(false, false)).toBe(true);
    vi.unstubAllGlobals();
  });
});

describe('the open list goes see-through over a unit', () => {
  const box = { left: 0, top: 100, right: 200, bottom: 500 };
  it('a unit whose middle is inside the box counts, on its edge too; outside or off screen does not', () => {
    expect(coversUnit(box, [{ x: 100, y: 300 }])).toBe(true);
    expect(coversUnit(box, [{ x: 200, y: 500 }])).toBe(true);
    expect(coversUnit(box, [{ x: 201, y: 300 }, { x: 100, y: 99 }, null])).toBe(false);
    expect(coversUnit(box, [])).toBe(false);
  });
  it('the box starts at the top card: the empty column over a short list covers nothing', () => {
    const l = queueLayout({
      rows: 2,
      now: true,
      s: 1,
      at: { x: 0, y: 0, w: 200, h: 700 },
      pageH: 720,
      sheet: 0,
      stats: 0,
    });
    const b = cardsBox(l, 0);
    expect(b.top).toBe(l.top + Math.min(...l.rows.map((r) => r.y)));
    expect(b.top).toBeGreaterThan(l.box.top);
    expect(b.bottom).toBe(l.box.bottom);
  });
});

// a mage charging Blast (radius 1) at a soldier with a skeleton archer beside it
const mageDuel = (extra: { id: string; def: string; x: number }[] = []) => {
  const s = stateOf([
    { id: 'm', def: 'mage', team: 'hero', x: 0, y: 0 },
    { id: 's', def: 'soldier', team: 'enemy', x: 4, y: 0 },
    { id: 'k', def: 'skeleton_archer', team: 'enemy', x: 5, y: 0 },
    ...extra.map((u) => ({ ...u, team: 'enemy' as const, y: 0 })),
    { id: 'beacon', def: 'beacon', team: 'hero', x: 9, y: 0 },
  ]);
  return new Battle(flat(10, 1), s);
};
const blast = (target = { x: 4, y: 0 }, follow: string | null = null): Charge => ({
  unit: 'm',
  ability: 'blast',
  target,
  follow,
  ticks: 4,
});

describe("a charge's card says the spell and its targets", () => {
  it('two targets: the count and both names', () => {
    const b = mageDuel();
    const { lines, hit } = chargeCard(b.grid, b.state, blast());
    expect(lines).toEqual([
      t('Explosão · 2 alvos', 'Blast · 2 targets'),
      t('Soldado, Arqueiro esqueleto', 'Soldier, Skeleton archer'),
    ]);
    expect(hit.map((u) => u.id)).toEqual(['s', 'k']);
  });
  it('one target says "1 alvo"; more than two show the first and how many more', () => {
    const one = mageDuel();
    one.state.units.find((u) => u.id === 'k')!.pos = { x: 7, y: 0 };
    expect(chargeCard(one.grid, one.state, blast()).lines).toEqual([
      t('Explosão · 1 alvo', 'Blast · 1 target'),
      t('Soldado', 'Soldier'),
    ]);
    const three = mageDuel([{ id: 'x', def: 'soldier', x: 3 }]);
    const { lines } = chargeCard(three.grid, three.state, blast());
    expect(lines[0]).toBe(t('Explosão · 3 alvos', 'Blast · 3 targets'));
    expect(lines[1]).toMatch(/ \+2$/);
  });
  it('nobody in the area: its tile, written as the Height corner writes it', () => {
    const b = mageDuel();
    const { lines, hit } = chargeCard(b.grid, b.state, blast({ x: 2, y: 0 }));
    expect(hit).toEqual([]);
    expect(lines).toEqual([
      t('Explosão · nenhum alvo', 'Blast · no target'),
      t('na casa X 2 · Y 0', 'on tile X 2 · Y 0'),
    ]);
  });
  it('a unit lock follows the unit; a tile lock stays where it was', () => {
    const b = mageDuel();
    b.state.units.find((u) => u.id === 's')!.pos = { x: 2, y: 0 }; // the soldier walked away from the archer
    expect(chargeCard(b.grid, b.state, blast({ x: 4, y: 0 }, 's')).hit.map((u) => u.id)).toEqual(['s']);
    expect(chargeCard(b.grid, b.state, blast({ x: 4, y: 0 }, null)).hit.map((u) => u.id)).toEqual(['k']);
  });
  it("the card of the aimed charge reads it from the queue, before it is in the state, and lists the targets' faces", () => {
    const b = mageDuel();
    const q = queueRows(b, { ability: 'blast', target: { x: 4, y: 0 } });
    expect(rowCharge(q, q.at)).toMatchObject({ unit: 'm', ability: 'blast' });
    expect(rowCharge(q, 0)).toBeNull();
    const card = queueCards(b, q, [])[q.at];
    expect(card.stats).toEqual({
      lines: chargeCard(b.grid, b.state, blast()).lines,
      faces: ['soldier', 'skeleton_archer'],
    });
    expect(queueCards(b, q, [], undefined, true)[q.at].stats).toBeNull(); // folded: faces and order only
  });
  it('its marks light the area and the targets, with the strike preview', () => {
    const b = mageDuel();
    const hl = chargeMarks(b, blast());
    expect(hl.tiles.filter((m) => m.kind === 'target').map((m) => m.pos)).toContainEqual({ x: 5, y: 0 });
    expect(hl.preview?.targets.map((x) => x.unit)).toEqual(['s', 'k']);
  });
});
