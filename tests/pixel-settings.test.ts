import { describe, expect, it } from 'vitest';
import { PIXEL_SIZES, defaultPixel, nextSize, parsePixel } from '../src/client/pixel-settings.ts';

describe('configuração do pixel art', () => {
  it('padrão: 2 px no celular em pé, 3 px no PC, contorno e câmera presa ligados, paleta desligada', () => {
    expect(defaultPixel(true)).toEqual({ size: 0, outline: true, palette: false, snap: true });
    expect(defaultPixel(false)).toEqual({ size: 0, outline: true, palette: false, snap: true });
  });

  it('save torto do navegador cai no padrão, campo a campo', () => {
    expect(parsePixel(null, false)).toEqual(defaultPixel(false));
    expect(parsePixel('lixo', false)).toEqual(defaultPixel(false));
    expect(parsePixel({ size: 7, outline: 'sim', palette: true }, false)).toEqual({ ...defaultPixel(false), palette: true });
    expect(parsePixel({ size: 0, outline: false, palette: false, snap: false, extra: 1 }, true)).toEqual({ size: 0, outline: false, palette: false, snap: false });
  });

  it('atalho rápido passa pelos tamanhos e dá a volta (Desligado, 2, 3, 4)', () => {
    expect(PIXEL_SIZES).toEqual([0, 2, 3, 4]);
    expect(nextSize(0)).toBe(2);
    expect(nextSize(3)).toBe(4);
    expect(nextSize(4)).toBe(0);
  });
});
