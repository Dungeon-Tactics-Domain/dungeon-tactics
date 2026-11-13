import { describe, expect, it } from 'vitest';
import { placeBeside } from '../src/client/hud.ts';

// Menu de comandos ao lado do boneco, como no FFT (13/11, pedido do Fernando)
const area = { left: 12, top: 72, right: 1268, bottom: 560 }; // 1280x720 sem a faixa de cima e os painéis de baixo
const clear = (p: { left: number }, w: number, x: number, r: number) => p.left + w <= x - r || p.left >= x + r; // não cobre o boneco

describe('menu ao lado do boneco', () => {
  it('à direita do boneco, centrado na altura dele', () => {
    const p = placeBeside({ x: 400, y: 300, r: 20 }, 220, 200, area);
    expect(p).toEqual({ left: 432, top: 200, side: 'right' });
    expect(clear(p, 220, 400, 20)).toBe(true);
  });

  it('sem lugar à direita, vai para a esquerda sem cobrir o boneco', () => {
    const p = placeBeside({ x: 1150, y: 300, r: 20 }, 220, 200, area);
    expect(p.side).toBe('left');
    expect(p.left).toBe(1150 - 20 - 12 - 220);
    expect(clear(p, 220, 1150, 20)).toBe(true);
  });

  it('nunca sai da área livre (em cima, embaixo e com o boneco fora da tela)', () => {
    expect(placeBeside({ x: 400, y: 20, r: 20 }, 220, 200, area).top).toBe(72);
    expect(placeBeside({ x: 400, y: 700, r: 20 }, 220, 200, area).top).toBe(360);
    const off = placeBeside({ x: 1500, y: 300, r: 20 }, 220, 200, area);
    expect(off.left).toBeGreaterThanOrEqual(area.left);
    expect(off.left + 220).toBeLessThanOrEqual(area.right);
  });

  it('desce ou sobe ao lado do boneco para não cobrir o alvo nem a lista de turnos, o mais perto possível', () => {
    const target = { left: 460, top: 260, right: 500, bottom: 320 };
    const p = placeBeside({ x: 200, y: 300, r: 20 }, 420, 150, area, 'left', [target]);
    expect(p.side).toBe('right'); // à esquerda não cabe
    expect(p.left).toBe(232);
    expect(p.top).toBe(target.bottom + 12); // logo abaixo do alvo, ainda ao lado do boneco
    expect(clear(p, 420, 200, 20)).toBe(true);
    const queue = { left: 12, top: 56, right: 242, bottom: 248 };
    const q = placeBeside({ x: 400, y: 200, r: 20 }, 220, 150, area, 'left', [queue]);
    expect(q).toEqual({ left: 148, top: 260, side: 'left' }); // à esquerda, mas abaixo da lista
    expect(placeBeside({ x: 500, y: 200, r: 20 }, 220, 150, area, 'left', [queue]).top).toBe(125); // já ao lado da lista: fica no meio
  });

  it('o "Executar?" prefere o lado contrário ao do alvo', () => {
    expect(placeBeside({ x: 600, y: 300, r: 20 }, 420, 200, area, 'left').side).toBe('left');
    // sem lugar à esquerda, fica à direita mesmo
    expect(placeBeside({ x: 200, y: 300, r: 20 }, 420, 200, area, 'left').side).toBe('right');
  });
});
