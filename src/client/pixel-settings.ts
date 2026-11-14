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
// chave nova em 13/11: quem já tinha o pixel salvo também volta ao 3D normal (o padrão mudou)
export const PIXEL_KEY = 'dt:pixel2';

// 3D normal por padrão (13/11, pedido do Fernando: "tire esse pixelizado como o padrão"); o pixel art segue nas Opções
// e na tecla V. O parâmetro `phone` fica para o dia em que o celular tiver padrão próprio
export const defaultPixel = (_phone: boolean): PixelSettings => ({ size: 0, outline: true, palette: false, snap: true });

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
