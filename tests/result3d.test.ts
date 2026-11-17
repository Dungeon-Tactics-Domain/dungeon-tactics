import { describe, expect, it } from 'vitest';
import lost from '../scripts/sandbox/bench/result3d-derrota.json';
import won from '../scripts/sandbox/bench/result3d-vitoria.json';
import { castOf, giveTurn, patchUnits, placementProblems, playStep } from '../src/client/dev/sandbox-play.ts';
import { inCells, parseSpec } from '../src/client/dev/sandbox-spec.ts';
import type { EndHero } from '../src/client/game/end-screens.ts';
import { REF, resultLayout } from '../src/client/result3d/result-layout.ts';
import { resultView } from '../src/client/result3d/result-view.ts';
import { survivalCols } from '../src/client/survival.ts';
import { type CardLine, tallyLine } from '../src/client/tally.ts';
import { stage } from '../src/client/ui3d/layout.ts';
import { skinFlags, specFlags } from '../src/client/ui3d/skin-flags.ts';
import { Battle } from '../src/shared/battle/battle.ts';
import { halve } from '../src/shared/battle/half.ts';
import { SCENARIOS } from '../src/shared/battle/scenarios.ts';

// The end of battle in 3D behind a localhost flag (?result=3d; Nov 16): the pure parts behind the drawing, which is
// checked on the bench shots (docs/sandbox.md)
const hero = (def: string, hp: number, dmg = 0, kills = 0, mvp = false): EndHero => ({
  id: `h-${def}`,
  def,
  hp,
  max: 100,
  dmg,
  kills,
  mvp,
});
const cards = (...hs: EndHero[]) => hs.map((h): [EndHero, CardLine] => [h, tallyLine(h)]);

describe('3D result: what it shows', () => {
  it('a victory: the title in capitals, a row per hero and the highlight', () => {
    const v = resultView(
      {
        won: true,
        title: 'Vitória!',
        cards: cards(hero('warrior', 80, 37, 1, true), hero('mage', 25)),
        cols: [],
        note: 'Todos os inimigos caíram e o Farol resistiu.',
      },
      ['Cidade', 'Jogar de novo'],
    );
    expect(v.won).toBe(true);
    expect(v.title).toBe('VITÓRIA!');
    expect(v.heads).toEqual(['RESULTADO', 'DESTAQUE']);
    expect(v.heroes).toEqual([
      { name: 'Guerreiro', life: '80/100', line: '37 de dano · 1 derrubado', tone: '' },
      { name: 'Mago', life: '25/100', line: '0 de dano · 0 derrubados', tone: '' },
    ]);
    expect(v.mvp).toEqual({ name: 'Guerreiro', line: '37 de dano · 1 derrubado' });
    expect(v.spoils).toEqual([]);
    expect(v.actions).toEqual(['Cidade', 'Jogar de novo']);
  });

  it('a defeat: the fallen say so in words and nobody is the highlight', () => {
    const v = resultView(
      { won: false, title: 'Derrota', cards: cards(hero('warrior', 0), hero('archer', 0)), cols: [], note: '' },
      ['Jogar de novo'],
    );
    expect(v.won).toBe(false);
    expect(v.heroes.map((h) => [h.life, h.line, h.tone])).toEqual([
      ['0/100', 'Caído', 'fell'],
      ['0/100', 'Caído', 'fell'],
    ]);
    expect(v.mvp).toBeNull();
  });

  it('what the battle gave goes in as it came (Until Dawn)', () => {
    const v = resultView({ won: false, title: 'Derrota', cards: [], cols: survivalCols(12, 9), note: '' }, []);
    expect(v.spoils).toEqual([
      ['Turnos', '12 de 40'],
      ['Recorde', '12, novo!'],
    ]);
  });
});

describe('3D result: where it sits', () => {
  const full = stage(1920, 1080, 'frame');

  it('on the reference places at the reference size, in both layouts', () => {
    for (const mode of ['frame', 'edges'] as const) {
      const at = resultLayout(stage(1920, 1080, mode), 1920, 4, 2, 2);
      expect(at.band, mode).toEqual({ x: 0, y: 485, w: 1920, h: 340 });
      expect(at.title, mode).toEqual({ x: 960, y: 218 });
      expect(at.rule, mode).toEqual({ x: 320, y: 271, w: 1280, h: 2 });
      expect(at.left, mode).toEqual({ x: 213, y: 525, w: 974, h: 36 });
      expect(at.right, mode).toEqual({ x: 1255, y: 525, w: 455, h: 36 });
      expect(at.heroes[0].y + at.heroes[0].h / 2, mode).toBe(601); // the reference's first spoils row
      expect(at.mvp.x, mode).toBe(1482.5);
      // "Next" on the reference: the last button ends at the hints' right edge
      expect(at.buttons[1].x + at.buttons[1].w, mode).toBe(1885);
      expect(at.buttons[1].y + at.buttons[1].h / 2, mode).toBe(1049);
    }
  });

  it('heroes and spoils share the left plate; alone, the heroes take it whole', () => {
    const both = resultLayout(full, 1920, 4, 5, 1);
    expect(both.heroes).toHaveLength(4);
    expect(both.spoils).toHaveLength(5);
    expect(both.heroes[0].x + both.heroes[0].w).toBeLessThan(both.spoils[0].x);
    expect(both.spoils[0].x + both.spoils[0].w).toBe(both.left.x + both.left.w - REF.inset);
    const alone = resultLayout(full, 1920, 4, 0, 1);
    expect(alone.heroes[0].x + alone.heroes[0].w).toBe(alone.left.x + alone.left.w - REF.inset);
  });

  it('the band grows past five rows and every row stays inside it', () => {
    expect(resultLayout(full, 1920, 5, 5, 1).band.h).toBe(340);
    const tall = resultLayout(full, 1920, 8, 0, 1);
    expect(tall.band.h).toBeGreaterThan(340);
    const last = tall.heroes[7];
    expect(last.y + last.h).toBeLessThanOrEqual(tall.band.y + tall.band.h);
  });

  it('on an ultrawide page the frame keeps it centred and the band crosses the page', () => {
    const at = resultLayout(stage(3440, 1440, 'frame'), 3440, 4, 0, 2);
    expect(at.band.x).toBe(0);
    expect(at.band.w).toBe(3440);
    expect(at.band.y).toBeCloseTo((485 * 4) / 3);
    expect(at.title.x).toBe(1720);
    expect(at.left.x).toBeCloseTo(440 + (213 * 4) / 3);
    // edges: the content stays in the middle, the buttons go to the corner
    const edges = resultLayout(stage(3440, 1440, 'edges'), 3440, 4, 0, 2);
    expect(edges.title.x).toBe(1720);
    expect(edges.buttons[1].x + edges.buttons[1].w).toBeCloseTo(3440 - (35 * 4) / 3);
  });

  it('on a small page the buttons keep the touch size and do not overlap', () => {
    const at = resultLayout(stage(800, 450, 'edges'), 800, 4, 0, 2);
    expect(at.buttons[0].h).toBe(44);
    expect(at.buttons[0].x + at.buttons[0].w).toBeLessThan(at.buttons[1].x);
    expect(at.buttons[0].x).toBeGreaterThanOrEqual(0);
  });
});

describe('3D result: flag and bench scenes', () => {
  const url = (q: string) => (name: string) => new URLSearchParams(q).get(name);

  it('?result=3d, the preset and a spec turn it on; the 3D window is the default', () => {
    expect(skinFlags(url('')).result).toBe('3d');
    expect(skinFlags(url('ui=html')).result).toBe('html');
    expect(skinFlags(url('result=3d')).result).toBe('3d');
    expect(skinFlags(url('ui=3d')).result).toBe('3d');
    expect(skinFlags(url('ui=3d&result=html')).result).toBe('html');
    expect(skinFlags(url('result=css')).result).toBe('3d');
    expect(skinFlags(url(''), specFlags({ result: '3d' })).result).toBe('3d');
    expect(parseSpec({ result: 'css' }).problems).toEqual(['result must be one of html, 3d']);
  });

  // the scene's steps on the rules, as tests/sandbox-spec.test.ts plays the other bench scenes
  const played = (raw: unknown) => {
    const { spec, problems } = parseSpec(raw);
    const sc = halve(SCENARIOS[spec.scenario!]);
    const cells = inCells(spec, 2);
    const cast = castOf(sc.spawns, cells);
    const b = Battle.start({ ...sc, spawns: cast.spawns }, spec.seed ?? 1);
    const kept = Object.entries(cells.units ?? {}).filter(([, u]) => !u.remove);
    const units = patchUnits(b.state.units, Object.fromEntries(kept));
    b.state.units = units.units;
    const p = [...problems, ...cast.problems, ...units.problems, ...placementProblems(b.grid, b.state.units)];
    const turn = giveTurn(b, b.state.units.find((u) => u.team === 'hero')!.id, true);
    if (turn) p.push(turn);
    for (const step of spec.steps!) {
      const r = playStep(b, step);
      if (r.problem) p.push(r.problem);
    }
    return { p, outcome: b.state.outcome, spec };
  };

  it.each([
    ['result3d-vitoria', won, 'victory'],
    ['result3d-derrota', lost, 'defeat'],
  ])('%s is a valid scene whose steps end the battle', (name, raw, outcome) => {
    const r = played(raw);
    expect(r.p).toEqual([]);
    expect(r.spec.name).toBe(name);
    expect(r.spec.result).toBe('3d');
    expect(r.outcome).toBe(outcome);
  });
});
