// The settings of the Options window, grouped in its categories (Fernando, Nov 18: Game, Sound and Display; Help is
// options.ts's own, since its rows open windows). Out of options.ts so that file stays under the 400 lines.
import { fullscreenLabel, fullscreenOn, toggleFullscreen } from '../fullscreen.ts';
import { parseSlowmo, SLOWMO_KEY } from '../hit-weight.ts';
import { LANG, type Lang, setLang, t } from '../i18n.ts';
import { glyphsOption } from '../key-hints.ts';
import { getLayout, setLayout } from '../layout-mode.ts';
import { type Motion, motion, setMotion } from '../motion.ts';
import { type Option, percent, pick } from '../option-row.ts';
import { setSound, soundSettings } from '../sound.ts';
import { store } from '../store.ts';
import { TEXT_KEY, type TextSpeed, textSpeed } from '../talk.ts';
import { GRID_KEY, parseTownGrid } from '../town-map.ts';
import type { LayoutMode } from '../ui3d/layout.ts';
import type { OptionsContext } from './options.ts';
import { marksOption } from './options-marks.ts';

// Fullscreen (Nov 18, Fernando: a phone showed the game under Chrome's bar), the switch of fullscreen.ts; only where
// the API exists (an iPhone has none)
const fullscreenOption = (): Option[] =>
  document.fullscreenEnabled
    ? [
        onOff(
          fullscreenLabel(false),
          t(
            'Esconde a barra do navegador. No celular, também trava a tela deitada.',
            'Hides the browser bar. On a phone it also locks the screen to landscape.',
          ),
          fullscreenOn,
          toggleFullscreen,
          true,
        ),
      ]
    : [];

export const townGrid = () => t('Grade da cidade', 'Town grid');

// `fem`: the Portuguese word agrees with the setting's name ("Paleta … Ligada")
const onOff = (label: string, help: string, get: () => boolean, set: (on: boolean) => void, fem = false): Option => ({
  ...pick(
    label,
    help,
    [
      [false, fem ? t('Desligada', 'Off') : t('Desligado', 'Off')],
      [true, fem ? t('Ligada', 'On') : t('Ligado', 'On')],
    ],
    get,
    set,
  ),
  on: get,
});
// a yes or no kept in its own key, read back by its parser
const flag = (key: string, parse: (raw: unknown) => boolean) =>
  [() => parse(store.json(key)), (on: boolean) => store.set(key, JSON.stringify(on))] as const;

// a category: its name, what it holds (said while the cursor is on it) and its settings in the order of the list
export interface OptionsGroup {
  title: string;
  help: string;
  rows: Option[];
}
export const settings = (o: OptionsContext): OptionsGroup[] => [
  {
    title: t('Jogo', 'Game'),
    help: t(
      'O texto das conversas, o idioma, os ícones das teclas e a grade da cidade.',
      'The conversations’ text, the language, the key icons and the town grid.',
    ),
    rows: [
      pick(
        t('Velocidade do texto', 'Text speed'),
        t('Quão rápido as falas das conversas aparecem.', 'How fast the lines of a conversation appear.'),
        [
          ['normal', t('Normal', 'Normal')],
          ['fast', t('Rápida', 'Fast')],
          ['instant', t('Instantânea', 'Instant')],
        ] as [TextSpeed, string][],
        textSpeed,
        (v) => store.set(TEXT_KEY, v),
      ),
      pick(
        t('Idioma', 'Language'),
        t(
          'Trocar o idioma recarrega a página; a batalha continua de onde parou.',
          'Changing the language reloads the page; the battle goes on from where it was.',
        ),
        [
          ['pt', 'Português'],
          ['en', 'English'],
        ] as [Lang, string][],
        () => LANG,
        setLang,
      ),
      glyphsOption(), // what the key hints show: the keys or a pad's icons (Nov 17, Fernando; key-hints.ts)
      onOff(
        townGrid(),
        t(
          'Mostra as casas do chão da cidade e o espaço que cada um ocupa: uma conferência, não ajuda a jogar.',
          'Shows the town’s floor cells and the room each one takes: a check, not a play aid.',
        ),
        ...flag(GRID_KEY, parseTownGrid),
        true,
      ),
    ],
  },
  {
    title: t('Som', 'Sound'),
    help: t('O volume da música e dos efeitos.', 'The volume of the music and of the effects.'),
    rows: [
      percent(
        t('Música', 'Music'),
        t('Volume da música, em passos de 5%.', 'Music volume, in steps of 5%.'),
        () => soundSettings().music,
        (music) => setSound({ ...soundSettings(), music }),
      ),
      percent(
        t('Efeitos', 'Effects'),
        t('Volume dos golpes, passos e menus, em passos de 5%.', 'Volume of blows, steps and menus, in steps of 5%.'),
        () => soundSettings().sfx,
        (sfx) => setSound({ ...soundSettings(), sfx }),
      ),
    ],
  },
  {
    title: t('Imagem', 'Display'),
    help: t(
      'O visual da interface, as marcas do mapa e a câmera.',
      'The look of the interface, the marks on the map and the camera.',
    ),
    rows: [
      ...fullscreenOption(),
      pick(
        t('Reduzir movimento', 'Reduce motion'),
        t(
          'Sem tremor de câmera, câmera de ação, câmera lenta nem animações de menu. "Do sistema" segue o seu aparelho.',
          'No camera shake, action camera, slow motion or menu animations. "System" follows your device.',
        ),
        [
          ['system', t('Do sistema', 'System')],
          ['reduce', t('Sim', 'Yes')],
          ['full', t('Não', 'No')],
        ] as [Motion, string][],
        motion,
        setMotion,
      ),
      // where the interface sits (Nov 16, Fernando: FFT The Ivalice Chronicles' places; ui3d/layout.ts)
      pick(
        t('Disposição da interface', 'Interface layout'),
        t(
          'Onde ficam os painéis da batalha: nas bordas da tela ou numa moldura 16:9 no centro.',
          'Where the battle panels sit: at the screen edges or in a centred 16:9 frame.',
        ),
        [
          ['edges', t('Nas bordas da tela', 'At the screen edges')],
          ['frame', t('Moldura 16:9 no centro', 'Centred 16:9 frame')],
        ] as [LayoutMode, string][],
        getLayout,
        (mode) => {
          setLayout(mode);
          o.relayout();
        },
      ),
      marksOption(), // how the marks on the board are drawn (Nov 17, Fernando; options-marks.ts)
      // Fernando's grill of Nov 15: the last enemy's or the last hero's death in slow motion with a close-up (narrowed Nov 16), this turns it off
      onOff(
        t('Câmera lenta nas mortes', 'Slow motion on deaths'),
        t(
          'A queda do último inimigo ou do último herói passa devagar, com a câmera perto.',
          'The fall of the last enemy or the last hero plays slowly, with the camera close.',
        ),
        ...flag(SLOWMO_KEY, parseSlowmo),
        true,
      ),
    ],
  },
];
