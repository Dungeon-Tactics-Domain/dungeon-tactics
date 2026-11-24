import { describe, expect, it, vi } from 'vitest';
import { chargeCard } from '../src/client/charge-lines.ts';
import { rowCharge, turnsFolded } from '../src/client/hud-queue.ts';
import { t } from '../src/client/i18n.ts';
import { store } from '../src/client/store.ts';
import { queueRows } from '../src/client/turn-list.ts';
import { chargeMarks } from '../src/client/turn-marks.ts';
import { INK, LINES_GROUND, LINES_GROUND_A, SEE } from '../src/client/turn3d/card.ts';
import { cardsBox, coversUnit, queueLayout } from '../src/client/turn3d/queue-layout.ts';
import { type CardStats, fitStats, queueCards } from '../src/client/turn3d/queue-view.ts';
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
    expect(card.stats).toMatchObject({
      lines: chargeCard(b.grid, b.state, blast()).lines,
      faces: ['soldier', 'skeleton_archer'],
    });
  });
  it('its marks light the area and the targets, with the strike preview', () => {
    const b = mageDuel();
    const hl = chargeMarks(b, blast());
    expect(hl.tiles.filter((m) => m.kind === 'target').map((m) => m.pos)).toContainEqual({ x: 5, y: 0 });
    expect(hl.preview?.targets.map((x) => x.unit)).toEqual(['s', 'k']);
  });
});

// Nov 22 follow-ups (Fernando): "Card de carga com lista dobrada", "Nomes longos alargam a lista", "Medir o contraste"
describe('folded, a charge keeps one short line', () => {
  it('the spell and the count; the other cards keep faces and order only', () => {
    const b = mageDuel();
    const q = queueRows(b, { ability: 'blast', target: { x: 4, y: 0 } });
    const folded = queueCards(b, q, [], undefined, true);
    expect(folded[q.at].stats).toEqual({ lines: [t('Explosão · 2', 'Blast · 2')] });
    expect(folded.filter((_, i) => i !== q.at).every((c) => c.stats === null)).toBe(true);
  });
  it('nobody in the area says 0', () => {
    const b = mageDuel();
    expect(chargeCard(b.grid, b.state, blast({ x: 2, y: 0 })).brief).toBe(t('Explosão · 0', 'Blast · 0'));
  });
});

describe("a charge's lines never widen the list", () => {
  const b = mageDuel();
  const q = queueRows(b, { ability: 'blast', target: { x: 4, y: 0 } });
  const st = queueCards(b, q, [])[q.at].stats as CardStats;
  const measure = (l: string) => l.length * 10; // 10 px a letter
  const FACE = 60; // wide faces, so each form of the ladder is the narrowest at some width
  const widest = (f: CardStats) =>
    Math.max(...f.lines.map((l, i) => measure(l) + (i === f.lines.length - 1 ? (f.faces?.length ?? 0) * FACE : 0)));
  const [names, count] = [t('Soldado, Arqueiro esqueleto', 'Soldier, Skeleton archer'), t('Soldado +1', 'Soldier +1')];
  it('with no other lines (cap 0), or room enough, the whole names and faces', () => {
    expect(fitStats(st, 0, measure, FACE)).toBe(st);
    expect(fitStats(st, widest(st), measure, FACE)).toBe(st);
    expect(st.lines[1]).toBe(names);
  });
  it('a px short, the first name and how many more, faces kept', () => {
    const f = fitStats(st, widest(st) - 1, measure, FACE);
    expect(f.lines).toEqual([st.lines[0], count]);
    expect(f.faces).toEqual(st.faces);
    expect(widest(f)).toBeLessThan(widest(st));
  });
  it('narrower, the faces go, then the spell line shortens to its count; past all, the shortest stays', () => {
    const few = { lines: [st.lines[0], count], faces: st.faces };
    const noFaces = fitStats(st, widest(few) - 1, measure, FACE);
    expect(noFaces).toEqual({ lines: [st.lines[0], count] });
    const brief = fitStats(st, widest(noFaces) - 1, measure, FACE);
    expect(brief).toEqual({ lines: [t('Explosão · 2', 'Blast · 2'), count] });
    expect(fitStats(st, 1, measure, FACE)).toEqual(brief);
  });
  it("a unit's card has no shorter forms, so it is never cut", () => {
    const unit = queueCards(b, q, [])[0].stats as CardStats;
    expect(fitStats(unit, 1, measure, FACE)).toBe(unit);
  });
});

// WCAG relative luminance and contrast ratio of two #rrggbb or [r, g, b] (0-255) colours
const rgb = (c: string | number[]) =>
  typeof c === 'string' ? [1, 3, 5].map((i) => Number.parseInt(c.slice(i, i + 2), 16)) : c;
const lum = (c: string | number[]) => {
  const [r, g, bl] = rgb(c).map((v) => {
    const x = v / 255;
    return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
};
const ratio = (a: string | number[], b: string | number[]) => {
  const [x, y] = [lum(a), lum(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
};
// the lines' ground at a card's faded opacity, blended over `under` as the shader does (measured on screen, Nov 22)
const faded = (see: number, under: string) => {
  const a = LINES_GROUND_A * (1 - see);
  return rgb(LINES_GROUND).map((g, i) => a * g + (1 - a) * rgb(under)[i]);
};

describe("the see-through list's text keeps 4.5:1", () => {
  // the lightest lit snow on Frost Pass in full daylight (99th percentile of the board's pixels, Nov 22 screenshot)
  const SNOW = '#d0cab4';
  it('INK on the faded ground over the lightest snow passes, and SEE is the most that does', () => {
    expect(ratio(INK, faded(SEE, SNOW))).toBeGreaterThanOrEqual(4.5);
    expect(ratio(INK, faded(SEE + 0.01, SNOW))).toBeLessThan(4.5);
  });
  it('the first fade, to 45%, did not', () => {
    expect(ratio(INK, faded(0.55, SNOW))).toBeLessThan(3);
  });
});
