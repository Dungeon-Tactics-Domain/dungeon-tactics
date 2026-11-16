// Options window, opened from the battle's corner menu (H): sections Game, Sound, Video and effects, Controls and Language,
// plus restart, home and developer at the foot. It reads and changes the battle only through OptionsContext.
import type { Scenario } from '../../shared/battle/scenarios.ts';
import { choice, dialog, slider } from '../dialog.ts';
import { LANG, type Lang, setLang, t } from '../i18n.ts';
import { button, el } from '../icons.ts';
import { keyHelp } from '../keyboard.ts';
import type { PixelSettings, PixelSize } from '../pixel-settings.ts';
import { setSound, soundSettings } from '../sound.ts';
import { store } from '../store.ts';
import { isSurvival, survivalGoal } from '../survival.ts';
import { TEXT_KEY, type TextSpeed, textSpeed } from '../talk.ts';
import { getTheme, setTheme, THEMES } from '../theme.ts';
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

// Options (Nov 13, Fernando's request: "the menu could take up more of the screen width, with subsections"): wide window
// with the sections in a left column (vertical choice()) and one section at a time on the right, so nothing scrolls far
export function optionsMenu(o: OptionsContext) {
  const { scenario } = o;
  const sections: [id: string, title: string, body: Node[]][] = [
    [
      'game',
      t('Jogo', 'Game'),
      [
        // Until Dawn's own goal; in any other battle, the usual one
        el(
          'p',
          {},
          isSurvival(scenario.id)
            ? t(`Objetivo: ${survivalGoal(t)}`, `Goal: ${survivalGoal(t)}`)
            : t(
                'Objetivo: derrote os inimigos e proteja o Farol (o cristal azul).',
                'Goal: defeat the enemies and protect the Beacon (the blue crystal).',
              ),
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
      button(
        'secondary',
        t('Reiniciar batalha', 'Restart battle'),
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
