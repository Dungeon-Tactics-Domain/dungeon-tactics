// Options window, opened from the battle's corner menu (H): sections Game, Sound, Video and effects, Controls and Language,
// plus restart, home and developer at the foot. It reads and changes the battle only through OptionsContext.
import type { Scenario } from '../../shared/battle/scenarios.ts';
import { isObjective } from '../../shared/battle/units.ts';
import { choice, dialog, slider } from '../dialog.ts';
import { ALPHA_MIN, type Blur, getGlass, glassEnv, setGlass } from '../glass.ts';
import { parseSlowmo, SLOWMO_KEY } from '../hit-weight.ts';
import { LANG, type Lang, setLang, t } from '../i18n.ts';
import { button, el } from '../icons.ts';
import { keyHelp } from '../keyboard.ts';
import type { PixelSettings, PixelSize } from '../pixel-settings.ts';
import { setSound, soundSettings } from '../sound.ts';
import { store } from '../store.ts';
import { isSurvival, survivalGoal } from '../survival.ts';
import { TEXT_KEY, type TextSpeed, textSpeed } from '../talk.ts';
import { getTheme, setTheme, THEMES } from '../theme.ts';
import { GRID_KEY, parseTownGrid } from '../town-map.ts';
import { goHome, homeLabel } from './crawl.ts';
import { devMenu } from './title.ts';

export interface OptionsContext {
  room: boolean; // an expedition room: leaving it loses the expedition (crawl.ts leftRoom)
  scenario: Scenario;
  busy: boolean; // animation or enemy turn running: restart is disabled
  pixel: () => PixelSettings; // the current settings, read on every change
  setPixel: (p: PixelSettings) => void;
  restart: () => void;
}

// The walkable town's debug grid (Nov 16, Fernando: off by default): here and in the town menu, since the town has no Options
export const townGridChoice = (onPick: (on: boolean) => void = () => {}) =>
  choice(
    t('Grade da cidade', 'Town grid'),
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

// Options (Nov 13, Fernando's request: "the menu could take up more of the screen width, with subsections"): wide window
// with the sections in a left column (vertical choice()) and one section at a time on the right, so nothing scrolls far
export function optionsMenu(o: OptionsContext) {
  const { scenario } = o;
  const sections: [id: string, title: string, body: Node[]][] = [
    [
      'game',
      t('Jogo', 'Game'),
      [
        // Until Dawn's own goal; the Beacon only on a map born with one, as checkOutcome counts it (Nov 16 review: the
        // expedition rooms, which have none, were told to protect it)
        el(
          'p',
          {},
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
          'ul',
          { class: 'legend' },
          el(
            'li',
            {},
            el('i', { class: 'sw move' }),
            t('Azul, moldura lisa: onde o herói pode andar', 'Blue, plain frame: where the hero can move'),
          ),
          el(
            'li',
            {},
            el('i', { class: 'sw range' }),
            t('Laranja, listras: alcance da habilidade', 'Orange, stripes: ability range'),
          ),
          el(
            'li',
            {},
            el('i', { class: 'sw blocked' }),
            t('Roxo, xis: no alcance, mas sem visão', 'Purple, cross: in range, but no sight'),
          ),
          el(
            'li',
            {},
            el('i', { class: 'sw threat' }),
            t('Vermelho, listras: o que a unidade tocada alcança', 'Red, stripes: what the tapped unit can reach'),
          ),
          el(
            'li',
            {},
            el('i', { class: 'sw nogo' }),
            t('Vermelho, xis: a unidade não cabe ali', 'Red, cross: the unit does not fit there'),
          ),
          el(
            'li',
            {},
            el('i', { class: 'sw counter' }),
            t(
              'Vermelho, moldura lisa: parar ali faz quem você golpeou neste turno contra-atacar',
              'Red, plain frame: stopping there draws the counter of a unit you struck this turn',
            ),
          ),
        ),
        choice(
          t('Velocidade do texto das conversas', 'Dialogue text speed'),
          [
            ['normal', t('Normal', 'Normal')],
            ['fast', t('Rápida', 'Fast')],
            ['instant', t('Instantânea', 'Instant')],
          ] as [TextSpeed, string][],
          textSpeed(),
          (v) => store.set(TEXT_KEY, v),
        ),
      ],
    ],
    [
      'sound',
      t('Som', 'Sound'),
      [
        slider(t('Música', 'Music'), soundSettings().music, (music) => setSound({ ...soundSettings(), music })),
        slider(t('Efeitos', 'Effects'), soundSettings().sfx, (v) => setSound({ ...soundSettings(), sfx: v })),
      ],
    ],
    [
      'video',
      t('Vídeo e efeitos', 'Video and effects'),
      [
        choice(
          t('Tema', 'Theme'),
          THEMES.map(([id, pt, en]) => [id, t(pt, en)]),
          getTheme(),
          setTheme,
        ),
        // panel glass (Nov 16, Fernando's request): opacity of the blue panels and the blur of what shows through them
        slider(
          t('Opacidade dos painéis', 'Panel opacity'),
          getGlass().alpha,
          (alpha) => setGlass({ ...getGlass(), alpha }),
          ALPHA_MIN,
        ),
        choice(
          t('Desfoque atrás dos painéis', 'Blur behind the panels'),
          [
            ['off', t('Desligado', 'Off')],
            ['light', t('Leve', 'Light')],
            ['strong', t('Forte', 'Strong')],
          ] as [Blur, string][],
          getGlass().blur,
          (blur) => setGlass({ ...getGlass(), blur }),
        ),
        el(
          'p',
          {},
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
        ),
        choice(
          t('Tamanho do pixel', 'Pixel size'),
          [
            [0, t('Desligado', 'Off')],
            [2, '2 px'],
            [3, '3 px'],
            [4, '4 px'],
          ] as [PixelSize, string][],
          o.pixel().size,
          (size) => o.setPixel({ ...o.pixel(), size }),
        ),
        choice(
          t('Contorno', 'Outline'),
          [
            [true, t('Ligado', 'On')],
            [false, t('Desligado', 'Off')],
          ],
          o.pixel().outline,
          (outline) => o.setPixel({ ...o.pixel(), outline }),
        ),
        choice(
          t('Paleta reduzida (16 bits)', 'Reduced palette (16-bit)'),
          [
            [false, t('Desligada', 'Off')],
            [true, t('Ligada', 'On')],
          ],
          o.pixel().palette,
          (palette) => o.setPixel({ ...o.pixel(), palette }),
        ),
        choice(
          t('Câmera presa à grade de pixels', 'Camera locked to the pixel grid'),
          [
            [true, t('Ligada', 'On')],
            [false, t('Desligada', 'Off')],
          ],
          o.pixel().snap,
          (snap) => o.setPixel({ ...o.pixel(), snap }),
        ),
        // Fernando's grill of Nov 15: every death in slow motion with a close-up, this turns it off
        choice(
          t('Câmera lenta nas mortes', 'Slow motion on deaths'),
          [
            [false, t('Desligada', 'Off')],
            [true, t('Ligada', 'On')],
          ],
          parseSlowmo(store.json(SLOWMO_KEY)),
          (on) => store.set(SLOWMO_KEY, JSON.stringify(on)),
        ),
        townGridChoice(),
      ],
    ],
    [
      'controls',
      t('Controles', 'Controls'),
      [
        el(
          'p',
          {},
          t(
            'Mouse: passe por cima para escolher, clique para confirmar, botão direito volta; arraste para mover a câmera e use a roda para o zoom. Controle: direcional ou analógico andam, A (×) confirma, B (○) volta, ombros giram a câmera, analógico direito rola a lista de turnos, Start abre este menu.',
            'Mouse: hover to pick, click to confirm, right click goes back; drag to move the camera and use the wheel to zoom. Gamepad: d-pad or stick moves, A (×) confirms, B (○) goes back, shoulders rotate the camera, right stick scrolls the turn list, Start opens this menu.',
          ),
        ),
        el('dl', { class: 'keys' }, ...keyHelp().flatMap(([k, what]) => [el('dt', {}, k), el('dd', {}, what)])),
      ],
    ],
    [
      'language',
      t('Idioma', 'Language'),
      [
        choice(
          t('Idioma', 'Language'),
          [
            ['pt', 'Português'],
            ['en', 'English'],
          ] as [Lang, string][],
          LANG,
          setLang,
        ),
      ],
    ],
  ];
  const panels = sections.map(([id, title, body]) =>
    el('section', { class: 'menu-section', hidden: id !== 'game' }, el('h3', {}, title), ...body),
  );
  const nav = choice(
    t('Seções', 'Sections'),
    sections.map(([id, title]) => [id, title] as [string, string]),
    'game',
    (id) => panels.forEach((p, i) => (p.hidden = sections[i][0] !== id)),
  );
  nav.classList.add('menu-nav');
  const d = dialog('menu', t('Opções', 'Options'), [
    el('div', { class: 'menu-layout' }, nav, el('div', { class: 'menu-body' }, ...panels)),
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
          const btn = e.currentTarget as HTMLButtonElement;
          if (!btn.dataset.armed) {
            btn.dataset.armed = '1';
            btn.textContent = t('Toque de novo para reiniciar', 'Tap again to restart');
            return;
          }
          d.close();
          o.restart();
        },
        { disabled: o.busy },
      ),
      // home: the town (crawl.ts homeScreen); from a room the 2nd tap confirms losing the expedition
      button('secondary', o.room ? t('Sair da sala', 'Leave the room') : homeLabel(), (e: Event) => {
        const btn = e.currentTarget as HTMLButtonElement;
        if (o.room && !btn.dataset.armed) {
          btn.dataset.armed = '1';
          btn.textContent = t('Toque de novo: perde a expedição', 'Tap again: the expedition is lost');
          return;
        }
        goHome();
      }),
      button('secondary', t('Desenvolvedor', 'Developer'), () => {
        d.close();
        void devMenu();
      }),
    ),
  ]);
}
