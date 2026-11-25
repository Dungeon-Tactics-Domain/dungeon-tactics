// Options › Pixel effect (Fernando, Nov 24: the pixel demo's look, editable and saved per player, with the reference
// author's numbers as a preset): its own category, so the Display list stays as long as it was. Settings in pixel-fx.ts.
import { t } from '../i18n.ts';
import { type Option, percent, pick } from '../option-row.ts';
import {
  PIXEL_LEVELS,
  PIXEL_PRESETS,
  PIXEL_SIZES,
  type PixelFx,
  type PixelPalette,
  type PixelPreset,
  pixelFx,
  presetOf,
  setPixelFx,
} from '../pixel-fx.ts';
import type { OptionsGroup } from './options-list.ts';

// one field of the saved settings as a row's get and set
const field = <K extends keyof PixelFx>(k: K) =>
  [() => pixelFx()[k], (v: PixelFx[K]) => setPixelFx({ ...pixelFx(), [k]: v })] as const;

const onOff = (label: string, help: string, k: 'on' | 'dither'): Option => ({
  ...pick(
    label,
    help,
    [
      [false, t('Desligado', 'Off')],
      [true, t('Ligado', 'On')],
    ],
    ...field(k),
  ),
  on: field(k)[0],
});

export const pixelGroup = (): OptionsGroup => ({
  title: t('Efeito de pixel', 'Pixel effect'),
  help: t(
    'Desenha o mapa em pixels grandes, com poucos tons, paleta e pontilhado. A interface fica nítida por cima.',
    'Draws the map in big pixels, with few tones, a palette and dithering. The interface stays sharp on top.',
  ),
  rows: [
    onOff(
      t('Efeito de pixel', 'Pixel effect'),
      t(
        'Liga o visual de pixel no mapa da batalha e da cidade. Desligado, o 3D liso de sempre.',
        'Turns the pixel look on for the battle and town map. Off, the usual smooth 3D.',
      ),
      'on',
    ),
    // a preset writes all its values; changing one by hand shows "Your own" (the preset is read from the values)
    pick<PixelPreset | null>(
      t('Predefinição', 'Preset'),
      t(
        'Nosso: pixel de 4. Referência: os números do jogo que inspirou o efeito, com o tamanho do pixel tirado da altura da tela.',
        'Ours: 4 px pixels. Reference: the numbers of the game that inspired the effect, with the pixel size taken from the screen height.',
      ),
      [
        ['ours', t('Nosso', 'Ours')],
        ['reference', t('Referência', 'Reference')],
        [null, t('Seu', 'Your own')],
      ],
      () => presetOf(pixelFx()),
      (p) => setPixelFx({ ...pixelFx(), ...PIXEL_PRESETS[p ?? 'ours'] }),
    ),
    pick(
      t('Tamanho do pixel', 'Pixel size'),
      t(
        'Quantos pixels da tela cada pixel grande ocupa. Automático: uns 270 pixels grandes na altura da tela.',
        'How many screen pixels each big pixel takes. Automatic: about 270 big pixels across the screen height.',
      ),
      PIXEL_SIZES.map((s): [number, string] => [s, s ? `${s}` : t('Automático', 'Automatic')]),
      ...field('size'),
    ),
    pick(
      t('Tons de brilho', 'Brightness levels'),
      t('Quantos tons de claro a escuro cada cor tem.', 'How many steps from dark to light each colour has.'),
      PIXEL_LEVELS.map((n): [number, string] => [n, `${n}`]),
      ...field('levels'),
    ),
    pick(
      t('Paleta', 'Palette'),
      t(
        'Quente e Fria trocam cada cor pela família de cor mais próxima. Original mantém as cores, só reduz o brilho.',
        'Warm and Cold swap each colour for the closest colour family. Original keeps the colours and only steps the brightness.',
      ),
      [
        ['warm', t('Quente', 'Warm')],
        ['cold', t('Fria', 'Cold')],
        ['original', t('Original', 'Original')],
      ] as [PixelPalette, string][],
      ...field('palette'),
    ),
    onOff(
      t('Pontilhado', 'Dither'),
      t(
        'Mistura dois tons vizinhos num padrão de pontos onde um tom vira o outro.',
        'Mixes two neighbouring tones in a dot pattern where one tone turns into the next.',
      ),
      'dither',
    ),
    percent(
      t('Força do pontilhado', 'Dither strength'),
      t(
        'Quanto o padrão de pontos se espalha. 50%: só perto da troca de tom; 100%: por toda parte.',
        'How far the dot pattern spreads. 50%: only near a change of tone; 100%: everywhere.',
      ),
      ...field('strength'),
    ),
  ],
});
