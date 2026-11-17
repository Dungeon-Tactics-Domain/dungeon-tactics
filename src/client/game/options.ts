// Options window, opened from the battle's corner menu (H): one list of settings like FFT's option menu (Game, Sound,
// Video and effects), the tile marks and the controls in windows over it, plus restart, home and developer at the foot.
// It reads and changes the battle only through OptionsContext.
import type { Scenario } from '../../shared/battle/scenarios.ts';
import { isObjective } from '../../shared/battle/units.ts';
import { choice, dialog, secondTap } from '../dialog.ts';
import { ALPHA_MIN, type Blur, getGlass, glassEnv, setGlass } from '../glass.ts';
import { parseSlowmo, SLOWMO_KEY } from '../hit-weight.ts';
import { KEYS } from '../hud-pieces.ts';
import { LANG, type Lang, setLang, t } from '../i18n.ts';
import { button, el } from '../icons.ts';
import { getLayout, setLayout } from '../layout-mode.ts';
import { type Motion, motion, setMotion } from '../motion.ts';
import { hoverFocus, type Option, optionRow, percent, pick } from '../option-row.ts';
import type { PixelSettings, PixelSize } from '../pixel-settings.ts';
import { setSound, soundSettings } from '../sound.ts';
import { store } from '../store.ts';
import { isSurvival, survivalGoal } from '../survival.ts';
import { TEXT_KEY, type TextSpeed, textSpeed } from '../talk.ts';
import { getTheme, setTheme, THEMES } from '../theme.ts';
import { FREE_KEY, GRID_KEY, parseTownFree, parseTownGrid } from '../town-map.ts';
import type { LayoutMode } from '../ui3d/layout.ts';
import { goHome, homeLabel } from './crawl.ts';
import { controls, tileMarks } from './options-help.ts';
import { marksOption } from './options-marks.ts';
import { devMenu } from './title.ts';

export interface OptionsContext {
  room: boolean; // an expedition room: leaving it loses the expedition (crawl.ts leftRoom)
  scenario: Scenario;
  busy: boolean; // animation or enemy turn running: restart is disabled
  pixel: () => PixelSettings; // the current settings, read on every change
  setPixel: (p: PixelSettings) => void;
  relayout: () => void; // the interface layout changed: what is not laid out by CSS fits again
  restart: () => void;
}

const townGrid = () => t('Grade da cidade', 'Town grid');
const townFree = () => t('Movimento fluido na cidade', 'Fluid movement in town');
// The walkable town's debug grid (Nov 16, Fernando: off by default): here and in the town menu, since the town has no Options
export const townGridChoice = (onPick: (on: boolean) => void = () => {}) =>
  choice(
    townGrid(),
    [
      [false, t('Desligada', 'Off')],
      [true, t('Ligada', 'On')],
    ],
    parseTownGrid(store.json(GRID_KEY)),
    (on) => {
      store.set(GRID_KEY, JSON.stringify(on));
      onPick(on);
    },
  );
// Fluid movement in the walkable town instead of the half-tile steps (Nov 16, Fernando: off by default, to compare the two)
export const townFreeChoice = (onPick: (on: boolean) => void = () => {}) =>
  choice(
    townFree(),
    [
      [false, t('Desligado', 'Off')],
      [true, t('Ligado', 'On')],
    ],
    parseTownFree(store.json(FREE_KEY)),
    (on) => {
      store.set(FREE_KEY, JSON.stringify(on));
      onPick(on);
    },
  );

// `fem`: the Portuguese word agrees with the setting's name ("Paleta … Ligada")
const onOff = (label: string, help: string, get: () => boolean, set: (on: boolean) => void, fem = false) =>
  pick(
    label,
    help,
    [
      [false, fem ? t('Desligada', 'Off') : t('Desligado', 'Off')],
      [true, fem ? t('Ligada', 'On') : t('Ligado', 'On')],
    ],
    get,
    set,
  );
// a yes or no kept in its own key, read back by its parser
const flag = (key: string, parse: (raw: unknown) => boolean) =>
  [() => parse(store.json(key)), (on: boolean) => store.set(key, JSON.stringify(on))] as const;

// the settings in the order of the list, under the names the old sections had
const settings = (o: OptionsContext): [title: string, rows: Option[]][] => [
  [
    t('Jogo', 'Game'),
    [
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
    ],
  ],
  [
    t('Som', 'Sound'),
    [
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
  ],
  [
    t('Vídeo e efeitos', 'Video and effects'),
    [
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
      pick(
        t('Tema', 'Theme'),
        t('O visual das janelas e dos painéis.', 'The look of the windows and panels.'),
        THEMES.map(([id, pt, en]) => [id, t(pt, en)]),
        getTheme,
        setTheme,
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
      // panel glass (Nov 16, Fernando's request): opacity of the blue panels and the blur of what shows through them
      percent(
        t('Opacidade dos painéis', 'Panel opacity'),
        t(
          'Quanto os painéis azuis deixam ver o que está atrás; 100% é o painel cheio.',
          'How much the blue panels let through what is behind them; 100% is the solid panel.',
        ),
        () => getGlass().alpha,
        (alpha) => setGlass({ ...getGlass(), alpha }),
        ALPHA_MIN,
      ),
      pick(
        t('Desfoque atrás dos painéis', 'Blur behind the panels'),
        // every notice that applies: an old browser can also be asked for less transparency
        [
          !glassEnv().blur &&
            t('Este navegador não desfoca o fundo dos painéis.', 'This browser cannot blur behind the panels.'),
          glassEnv().reducedTransparency &&
            t(
              'O sistema pede menos transparência: os painéis ficam opacos.',
              'The system asks for less transparency: the panels stay opaque.',
            ),
          glassEnv().blur &&
            !glassEnv().reducedTransparency &&
            t(
              'O desfoque aparece com a opacidade abaixo de 100%; no celular ele pesa.',
              'The blur shows with the opacity below 100%; on a phone it is heavy.',
            ),
        ]
          .filter(Boolean)
          .join(' '),
        [
          ['off', t('Desligado', 'Off')],
          ['light', t('Leve', 'Light')],
          ['strong', t('Forte', 'Strong')],
        ] as [Blur, string][],
        () => getGlass().blur,
        (blur) => setGlass({ ...getGlass(), blur }),
      ),
      pick(
        t('Tamanho do pixel', 'Pixel size'),
        t(
          'Desenha a batalha em pixels maiores, como um jogo antigo (tecla V).',
          'Draws the battle in bigger pixels, like an old game (V key).',
        ),
        [
          [0, t('Desligado', 'Off')],
          [2, '2 px'],
          [3, '3 px'],
          [4, '4 px'],
        ] as [PixelSize, string][],
        () => o.pixel().size,
        (size) => o.setPixel({ ...o.pixel(), size }),
      ),
      onOff(
        t('Contorno', 'Outline'),
        t('Linha escura em volta dos personagens e do terreno.', 'A dark line around the characters and the terrain.'),
        () => o.pixel().outline,
        (outline) => o.setPixel({ ...o.pixel(), outline }),
      ),
      onOff(
        t('Paleta reduzida (16 bits)', 'Reduced palette (16-bit)'),
        t('Menos cores na tela, como nos consoles de 16 bits.', 'Fewer colours on screen, like the 16-bit consoles.'),
        () => o.pixel().palette,
        (palette) => o.setPixel({ ...o.pixel(), palette }),
        true,
      ),
      onOff(
        t('Câmera presa à grade de pixels', 'Camera locked to the pixel grid'),
        t(
          'A câmera anda de pixel em pixel, sem tremer a imagem ao deslizar.',
          'The camera moves pixel by pixel, so the picture does not shimmer as it slides.',
        ),
        () => o.pixel().snap,
        (snap) => o.setPixel({ ...o.pixel(), snap }),
        true,
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
      onOff(
        townGrid(),
        t(
          'Mostra as casas do chão da cidade e o espaço que cada um ocupa: uma conferência, não ajuda a jogar.',
          'Shows the town’s floor cells and the room each one takes: a check, not a play aid.',
        ),
        ...flag(GRID_KEY, parseTownGrid),
        true,
      ),
      onOff(
        townFree(),
        t('Anda livre pela cidade em vez de passo a passo.', 'Walk the town freely instead of step by step.'),
        ...flag(FREE_KEY, parseTownFree),
      ),
    ],
  ],
];

// Options (Nov 16, Fernando: the interface on its Final Fantasy Tactics counterpart): one list like FFT's option menu, the
// current value at the right of each row, left and right change it and the box at the foot says what the focused row
// does. It replaced the sections column of Nov 13; what is not a setting (tile marks, controls) opens from the last rows
export function optionsMenu(o: OptionsContext) {
  const { scenario } = o;
  const help = el('p', { class: 'opt-help', 'aria-live': 'polite' });
  const describe = (text: string) => (help.textContent = text);
  // a window over this one, which stays open under it; closing it puts the cursor back on its row
  const helpRow = (label: string, text: string, body: () => Node[]) => {
    const back = () => row.focus();
    const row = button(
      'opt-row',
      [el('span', { class: 'opt-label' }, label), el('span', { class: 'opt-arrow', 'aria-hidden': 'true' }, '▸')],
      () => {
        const w = dialog(
          'menu-help',
          label,
          [
            ...body(),
            button('primary', t('Voltar', 'Back'), () => {
              w.close();
              back();
            }),
          ],
          { onBack: back },
        );
      },
      { onfocus: () => describe(text), onpointermove: hoverFocus },
    );
    return row;
  };
  const d = dialog(
    'menu',
    t('Opções', 'Options'),
    [
      // Until Dawn's own goal; the Beacon only on a map born with one, as checkOutcome counts it (Nov 16 review: the
      // expedition rooms, which have none, were told to protect it)
      el(
        'p',
        { class: 'opt-goal' },
        isSurvival(scenario.id)
          ? t(`Objetivo: ${survivalGoal(t)}`, `Goal: ${survivalGoal(t)}`)
          : scenario.spawns.some((s) => isObjective(s.def))
            ? t(
                'Objetivo: derrote os inimigos e proteja o Farol (o cristal azul).',
                'Goal: defeat the enemies and protect the Beacon (the blue crystal).',
              )
            : t('Objetivo: derrote todos os inimigos.', 'Goal: defeat every enemy.'),
      ),
      el(
        'div',
        { class: 'camp-list opt-list' },
        ...settings(o).flatMap(([title, rows]) => [el('h3', {}, title), ...rows.map((r) => optionRow(r, describe))]),
        el('h3', {}, t('Ajuda', 'Help')),
        helpRow(
          t('Marcas do mapa', 'Tile marks'),
          t(
            'O que cada cor e desenho no chão da batalha quer dizer.',
            'What each colour and pattern on the battle floor means.',
          ),
          tileMarks,
        ),
        helpRow(
          t('Controles', 'Controls'),
          t(
            'Mouse, teclado, controle e toque: o que cada um faz.',
            'Mouse, keyboard, gamepad and touch: what each one does.',
          ),
          controls,
        ),
      ),
      help,
      el(
        'div',
        { class: 'menu-actions' },
        // during the animation or the enemy turn the loop is still running the old battle
        // the 1st tap only asks: restart erases the saved battle and cannot be undone (mobile audit of Oct 25)
        // a disabled button says why in its own text (design system, Disabled)
        button(
          'secondary',
          o.busy
            ? t('Reiniciar batalha: espere a sua vez', 'Restart battle: wait for your turn')
            : t('Reiniciar batalha', 'Restart battle'),
          (e: Event) => {
            if (!secondTap(e, t('Confirmar: reiniciar a batalha', 'Confirm: restart the battle'))) return;
            d.close();
            o.restart();
          },
          { disabled: o.busy },
        ),
        // home: the town (crawl.ts homeScreen); from a room the 2nd tap confirms losing the expedition
        button('secondary', o.room ? t('Sair da sala', 'Leave the room') : homeLabel(), (e: Event) => {
          if (o.room && !secondTap(e, t('Confirmar: perde a expedição', 'Confirm: the expedition is lost'))) return;
          goHome();
        }),
        button('secondary', t('Desenvolvedor', 'Developer'), () => {
          d.close();
          devMenu();
        }),
      ),
    ],
    // how a row changes, said once on the head band: the keys on a PC, the drawn arrows on touch
    {
      note: el(
        'span',
        { class: 'opt-keys' },
        KEYS ? t('← → mudam o valor', '← → change the value') : t('◀ ▶ mudam o valor', '◀ ▶ change the value'),
      ),
    },
  );
  d.overlay.querySelector<HTMLButtonElement>('.opt-row')!.focus();
}
