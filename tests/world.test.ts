import { describe, expect, it } from 'vitest';
import { SPEAKERS } from '../src/client/campaign.ts';
import { ALL_CHAPTERS, WORLD, afterNode, chaptersOnMap, isOpen, nodeOfChapter, parseWorld, step } from '../src/client/world.ts';

describe('mapa mundial', () => {
  it('toda fase tem um ponto, uma vez só, na ordem da campanha; o resto é história com fala', () => {
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

  it('abre os pontos já passados e o próximo; rejogar um antigo não volta o progresso', () => {
    expect(isOpen(0, 0)).toBe(true);
    expect(isOpen(1, 0)).toBe(false);
    expect(isOpen(3, 3)).toBe(true);
    expect(isOpen(WORLD.length - 1, WORLD.length)).toBe(true);
    expect(afterNode(1, 5)).toBe(5);
    expect(afterNode(5, 5)).toBe(6);
  });

  it('as setas andam um ponto e param na ponta ou no ponto fechado', () => {
    expect(step(0, -1, 3)).toBe(0);
    expect(step(2, 1, 3)).toBe(3);
    expect(step(3, 1, 3)).toBe(3);
    expect(step(3, -1, 3)).toBe(2);
  });

  it('o progresso salvo só aceita um número válido', () => {
    expect(parseWorld('4')).toBe(4);
    for (const bad of ['-1', '999', 'x', null, '2.5']) expect(parseWorld(bad)).toBe(0);
  });
});
