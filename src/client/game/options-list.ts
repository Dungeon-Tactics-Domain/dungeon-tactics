// The settings of the Options window, grouped in its categories (Fernando, Nov 18: Game, Sound and Display; Help is
// options.ts's own, since its rows open windows). Out of options.ts so that file stays under the 400 lines.
import { secondTap } from '../dialog.ts';
import { fpsOn } from '../fps.ts';
import { fullscreenLabel, fullscreenOn, toggleFullscreen } from '../fullscreen.ts';
import { parseSlowmo, SLOWMO_KEY } from '../hit-weight.ts';
import { LANG, type Lang, setLang, t } from '../i18n.ts';
import { glyphsOption, hintsOption, setTutorial, tutorialOn } from '../key-hints.ts';
import { getLayout, setLayout } from '../layout-mode.ts';
import { type Motion, motion, setMotion } from '../motion.ts';
import { type Go, type Option, percent, pick } from '../option-row.ts';
import { screenButtons, setScreenButtons, touchDevice } from '../screen-buttons.ts';
import { setSound, soundSettings } from '../sound.ts';
import { store } from '../store.ts';
import { TEXT_KEY, type TextSpeed, textSpeed } from '../talk.ts';
import { GRID_KEY, parseTownGrid } from '../town-map.ts';
import { type PadSide, padSide, setPadSide } from '../town-pad.ts';
import type { LayoutMode } from '../ui3d/layout.ts';
import { toTitle } from './crawl.ts';
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

// the town's joystick and button, where a finger plays (Nov 18, Fernando): which side each is on; a PC has no pad, so no row
const padOption = (): Option[] =>
  touchDevice()
    ? [
        pick(
          t('Joystick e botão', 'Joystick and button'),
          t(
            'Na cidade, o joystick anda com o grupo e o botão fala ou entra. Escolha o lado de cada um.',
            'In town, the joystick walks the group and the button talks or goes in. Pick which side each is on.',
          ),
          [
            ['left', t('Joystick à esquerda', 'Joystick left')],
            ['right', t('Joystick à direita', 'Joystick right')],
          ] as [PadSide, string][],
          padSide,
          setPadSide,
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
  rows: (Option | Go)[];
}
// Fernando, Nov 18 night: no ☰ menu anywhere, so what it held moved here: Fast battle and Back to title in Game, the
// screen buttons switch and the fps counter in Display; the battle's own rows only show in a battle
export const settings = (o: OptionsContext): OptionsGroup[] => [
  {
    title: t('Jogo', 'Game'),
    help: o.battle
      ? t(
          'O texto das conversas, o idioma, as dicas e os ícones das teclas, a batalha rápida e a grade da cidade.',
          'The conversations’ text, the language, the key hints and icons, the fast battle and the town grid.',
        )
      : t(
          'O texto das conversas, o idioma, as dicas e os ícones das teclas e a grade da cidade.',
          'The conversations’ text, the language, the key hints and icons and the town grid.',
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
      // the battle's teaching lines, off by default (Fernando, Nov 18; key-hints.ts)
      onOff(
        t('Tutorial', 'Tutorial'),
        t(
          'Mostra no topo da batalha o que fazer agora e por que uma casa não serve, e no topo da cidade como andar. Desligado, fica só o resumo da última ação e a cidade sem a faixa.',
          'Shows at the top of the battle what to do now and why a tile does not work, and at the top of the town how to walk. Off, only the last action’s summary stays and the town has no strip.',
        ),
        tutorialOn,
        setTutorial,
      ),
      ...padOption(),
      hintsOption(), // when the battle's footer shows the key and button hints (Nov 18, Fernando; key-hints.ts)
      glyphsOption(), // what the key hints show: the keys or a pad's icons (Nov 17, Fernando; key-hints.ts)
      ...(o.battle
        ? [
            onOff(
              t('Batalha rápida (3×)', 'Fast battle (3×)'),
              t(
                'As animações da batalha passam três vezes mais rápido. No teclado, segurar Enter faz o mesmo.',
                'The battle’s animations play three times faster. On a keyboard, holding Enter does the same.',
              ),
              o.battle.fast,
              o.battle.setFast,
              true,
            ),
          ]
        : []),
      onOff(
        townGrid(),
        t(
          'Mostra as casas do chão da cidade e o espaço que cada um ocupa: uma conferência, não ajuda a jogar.',
          'Shows the town’s floor cells and the room each one takes: a check, not a play aid.',
        ),
        ...flag(GRID_KEY, parseTownGrid),
        true,
      ),
      {
        link: t('Voltar ao título', 'Back to title'),
        help: o.battle?.room
          ? t(
              'Volta à tela de título. Sair de uma sala perde a expedição.',
              'Goes back to the title. Leaving a room loses the expedition.',
            )
          : t('Volta à tela de título.', 'Goes back to the title.'),
        // from a room the 2nd tap confirms losing the expedition, as "Leave the room" does
        run: (e) =>
          (o.battle?.room && !secondTap(e, t('Confirmar: perde a expedição', 'Confirm: the expedition is lost'))) ||
          toTitle(),
      },
    ],
  },
  {
    title: t('Som', 'Sound'),
    help: t(
      'O volume da música, da interface, do mundo e do diálogo.',
      'The volume of the music, the interface, the world and the dialogue.',
    ),
    rows: [
      percent(
        t('Música', 'Music'),
        t('Volume da música, em passos de 5%.', 'Music volume, in steps of 5%.'),
        () => soundSettings().music,
        (music) => setSound({ ...soundSettings(), music }),
      ),
      percent(
        t('Interface', 'Interface'),
        t('Volume dos cliques dos menus, em passos de 5%.', 'Volume of the menu clicks, in steps of 5%.'),
        () => soundSettings().ui,
        (ui) => setSound({ ...soundSettings(), ui }),
      ),
      percent(
        t('Mundo', 'World'),
        t(
          'Volume dos golpes, magias, passos e fanfarras, em passos de 5%.',
          'Volume of blows, spells, steps and fanfares, in steps of 5%.',
        ),
        () => soundSettings().world,
        (world) => setSound({ ...soundSettings(), world }),
      ),
      percent(
        t('Diálogo', 'Dialogue'),
        t('Volume das vozes das conversas, em passos de 5%.', 'Volume of the voices in conversations, in steps of 5%.'),
        () => soundSettings().voice,
        (voice) => setSound({ ...soundSettings(), voice }),
      ),
    ],
  },
  {
    title: t('Imagem', 'Display'),
    help: t(
      'As marcações do mapa, a tela cheia, o movimento, a interface, os botões na tela e a câmera.',
      'The marks on the map, fullscreen, motion, the interface, the screen buttons and the camera.',
    ),
    rows: [
      marksOption(), // how the marks on the board are drawn (Nov 17, Fernando; options-marks.ts); on top since Nov 18 night
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
      // Undo and the camera pair on the screen: on by default for a finger, off on a PC (screen-buttons.ts)
      onOff(
        t('Botões na tela', 'Screen buttons'),
        t(
          'Mostra no alto da tela os botões Desfazer (↶) e Girar a câmera (↺ ↻). Ligados no celular e no tablet; no PC, as teclas fazem os dois: Z desfaz e R gira a câmera.',
          'Shows the Undo (↶) and Turn the camera (↺ ↻) buttons at the top of the screen. On for phones and tablets; on a PC, the keys do both: Z undoes and R turns the camera.',
        ),
        screenButtons,
        setScreenButtons,
      ),
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
      ...(o.battle
        ? [
            onOff(
              t('Contador de fps', 'FPS counter'),
              t(
                'Mostra no canto quadros por segundo, desenhos e memória da cena. No teclado, F3.',
                'Shows frames per second, draw calls and the scene’s memory in the corner. On a keyboard, F3.',
              ),
              fpsOn,
              o.battle.fps,
            ),
          ]
        : []),
    ],
  },
];
