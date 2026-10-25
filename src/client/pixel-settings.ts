// Opções do pixel art (pedido do Fernando, 25/10: comparar e escolher a melhor). Ficam no navegador (store `dt:pixel`)
// e valem na hora. Puro e testado; quem aplica é a BattleScene.
export const PIXEL_SIZES = [0, 2, 3, 4] as const; // 0 = sem pixel art (render normal)
export type PixelSize = (typeof PIXEL_SIZES)[number];
export interface PixelSettings {
  size: PixelSize;
  outline: boolean; // contorno de profundidade e de normal do RenderPixelatedPass
  palette: boolean; // poucas cores por canal (cara de 16 bits)
  snap: boolean; // câmera presa à grade de pixels (sem ela o chão "ferve" ao mover)
}
export const PIXEL_KEY = 'dt:pixel';

// 2 px no celular em pé (393 px viram ~196 de largura; 3 apagava os rostos), 3 px no PC
export const defaultPixel = (phone: boolean): PixelSettings => ({ size: phone ? 2 : 3, outline: true, palette: false, snap: true });

const isSize = (v: unknown): v is PixelSize => PIXEL_SIZES.includes(v as PixelSize);

// o salvo pode estar velho ou editado: cada campo inválido volta ao padrão, os bons ficam
export function parsePixel(raw: unknown, phone: boolean): PixelSettings {
  const d = defaultPixel(phone);
  if (!raw || typeof raw !== 'object') return d;
  const r = raw as Record<string, unknown>;
  const bool = (k: 'outline' | 'palette' | 'snap') => (typeof r[k] === 'boolean' ? (r[k] as boolean) : d[k]);
  return { size: isSize(r.size) ? r.size : d.size, outline: bool('outline'), palette: bool('palette'), snap: bool('snap') };
}

export const nextSize = (s: PixelSize): PixelSize => PIXEL_SIZES[(PIXEL_SIZES.indexOf(s) + 1) % PIXEL_SIZES.length];
