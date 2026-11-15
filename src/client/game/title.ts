// Title screen and the windows it opens: new game and continue (both to the town), standalone battle, how to play,
// credits and the developer menu. Each window goes back to the title with Esc or Back; the title itself never closes (the
// map behind it is just scenery).
import { SCENARIOS } from '../../shared/battle/scenarios.ts';
import { CHEST_KEY, EQUIP_KEY } from '../chest.ts';
import { openDevMenu } from '../dev-menu.ts';
import { DEV_SCENARIO } from '../dev-roster.ts';
import { dialog } from '../dialog.ts';
import { GROUP_KEY } from '../group.ts';
import { LANG, setLang, t } from '../i18n.ts';
import { button, el } from '../icons.ts';
import { setTrack } from '../sound.ts';
import { store } from '../store.ts';
import { BEST_KEY, parseBest, SURVIVAL_ID } from '../survival.ts';
import { jumpHelp } from '../town-ui.ts';
import { CRAWL_KEY, homeLabel, homeScreen, ROOM_KEY, townScreen } from './crawl.ts';

// the saves a game is made of: the party, its chest and equipment, the expedition and the room in play. Continue shows
// when any is saved; New game erases them all
const PROGRESS = [GROUP_KEY, CHEST_KEY, EQUIP_KEY, CRAWL_KEY, ROOM_KEY];

// Developer menu (Nov 12): loads the FFT study separately just to offer Gariland's terrain as a map. Starting
// saves the roster, erases the previous developer battle and reopens the game on it (boot builds the scenario).
export async function devMenu(onBack?: () => void) {
  (await import('../../shared/battle/fft/gariland.ts')).registerFftStudy();
  openDevMenu(() => {
    store.set(`dt:battle:${DEV_SCENARIO}`, '');
    location.search = `?scenario=${DEV_SCENARIO}`;
  }, onBack);
}

// Standalone battle: the maps with a Beacon. Every choice opens by URL, each with its own
// save: the Hill behind the title is just scenery since the fixed title screen (Nov 13), it is not played through it
// measured on Nov 13 (npm run sim, 300 seeds, AI x AI) with damage x1.75, direction and trees without passage: Hill 74%, Skirmish 85%, Crypt 79%, Crypt Heart 81% (before 61%, 40% and 60%; the Heart with the 2nd archer in place of the Brute, which with the gap dropped to 25%)
const QUICK_MAPS = ['beacon_hill', 'skirmish', 'flooded_crypt', 'crypt_heart'];
function quickBattle() {
  const d = dialog(
    'title',
    t('Batalha avulsa', 'Quick battle'),
    [
      el(
        'div',
        { class: 'menu-actions camp-list' },
        ...QUICK_MAPS.map((id) =>
          button(id === 'beacon_hill' ? 'primary' : 'secondary', t(SCENARIOS[id].name, SCENARIOS[id].en), () => {
            d.close();
            setTrack(null);
            location.search = `?scenario=${id}`;
          }),
        ),
        // mode with another rule: survive until dawn in Ash Wood (survival.ts)
        button(
          'secondary',
          t('Até o amanhecer: resistir no Bosque', 'Until Dawn: hold out in the Wood') +
            (parseBest(store.get(BEST_KEY))
              ? t(` (recorde ${parseBest(store.get(BEST_KEY))})`, ` (record ${parseBest(store.get(BEST_KEY))})`)
              : ''),
          () => {
            d.close();
            location.search = `?scenario=${SURVIVAL_ID}`;
          },
        ),
      ),
    ],
    { onBack: titleScreen },
  );
  d.overlay.querySelector<HTMLButtonElement>('.primary')!.focus();
}

// Credits (summary; the full list, with each file's license, is public/CREDITS.txt)
function credits() {
  const d = dialog(
    'title',
    t('Créditos', 'Credits'),
    [
      el(
        'ul',
        { class: 'legend' },
        el('li', {}, t('Modelos 3D: KayKit, de Kay Lousberg (CC0)', '3D models: KayKit, by Kay Lousberg (CC0)')),
        el(
          'li',
          {},
          t(
            'Efeitos sonoros: Kenney, artisticdude, JaggedStone, Julien Matthey e outros do OpenGameArt (CC0)',
            'Sound effects: Kenney, artisticdude, JaggedStone, Julien Matthey and others from OpenGameArt (CC0)',
          ),
        ),
        el(
          'li',
          {},
          t(
            'Músicas (CC0, OpenGameArt): CodeManu, TAD, cynicmusic, nene, FAINOD e Emma_MA. Vozes dos diálogos: compostas para o jogo',
            'Music (CC0, OpenGameArt): CodeManu, TAD, cynicmusic, nene, FAINOD and Emma_MA. Dialogue voices: composed for the game',
          ),
        ),
        el(
          'li',
          {},
          t('Fonte: Alegreya Sans (SIL Open Font License 1.1)', 'Font: Alegreya Sans (SIL Open Font License 1.1)'),
        ),
        el('li', {}, t('História, mapas e regras: Dungeon Tactics', 'Story, maps and rules: Dungeon Tactics')),
      ),
      el(
        'p',
        {},
        el(
          'a',
          { href: '/CREDITS.txt', target: '_blank', rel: 'noopener' },
          t('Lista completa, com a licença de cada arquivo', "Full list, with each file's license"),
        ),
      ),
      button('primary', t('Voltar', 'Back'), () => {
        d.close();
        titleScreen();
      }),
    ],
    { onBack: titleScreen },
  );
  d.overlay.querySelector<HTMLButtonElement>('.primary')!.focus();
}

// How to play (night of Nov 12): the rules that change the decision, one line each, for whoever arrives without a tutorial (stage
// 1 hints only cover move and act). Text checked against the engine rules (turn-queue, combat, grid).
function howToPlay() {
  const d = dialog(
    'title',
    t('Como jogar', 'How to play'),
    [
      el(
        'ul',
        { class: 'legend' },
        el(
          'li',
          {},
          t(
            'A lista de turnos (canto de cima) mostra quem joga. Quem é mais rápido joga mais vezes.',
            'The turn list (top corner) shows who acts. Faster units act more often.',
          ),
        ),
        el(
          'li',
          {},
          t(
            'Na sua vez: Mover e Agir, em qualquer ordem. Fazer menos traz a próxima vez mais cedo.',
            'On your turn: Move and Act, in any order. Doing less brings your next turn sooner.',
          ),
        ),
        el(
          'li',
          {},
          `${t(
            'Do alto se acerta mais e se alcança mais longe; entulho protege de ataques de longe e árvore não se atravessa. No fim do turno, escolha para onde olhar: golpe pelo lado acerta mais, pelas costas mais ainda.',
            'From high ground you hit more and reach farther; rubble covers you from ranged attacks and trees block the way. At turn end, pick where to face: hits from the side land more often, from behind even more.',
          )} ${jumpHelp()}`,
        ),
        el(
          'li',
          {},
          t(
            'Empurrar contra muro ou alguém fere; empurrar do alto para baixo também; espinhos ferem quem é jogado neles ou termina a vez em cima (passar por cima não fere).',
            'Pushing into a wall or someone hurts; pushing someone off high ground too; spikes hurt whoever is pushed onto them or ends a turn on them (walking over is safe).',
          ),
        ),
        el('li', {}, t('Na água funda só se anda ou espera.', 'In deep water you can only move or wait.')),
        // a charge aimed at someone follows the unit (battle.ts follow): "get out of it" was wrong for the target (review of Nov 13)
        el(
          'li',
          {},
          t(
            'Habilidade com carga sai depois: a área roxa mostra onde vai cair, e a lista de turnos mostra quando. Se mirou alguém, a área anda junto: os vizinhos saem dela; o alvo só escapa saindo do alcance ou da vista de quem lança.',
            'Charged abilities land later: the purple area shows where and the turn list shows when. If it targeted someone, the area moves with them: neighbours step out; the target only escapes by leaving the caster’s range or sight.',
          ),
        ),
        el(
          'li',
          {},
          t(
            'Proteja o Farol (o cristal azul) quando houver um. Inimigo de coroa é o chefe: derrubá-lo vence a fase.',
            'Protect the Beacon (the blue crystal) when there is one. A crowned enemy is the boss: bringing it down wins the stage.',
          ),
        ),
      ),
      button('primary', t('Voltar', 'Back'), () => {
        d.close();
        titleScreen();
      }),
    ],
    { onBack: titleScreen },
  );
  d.overlay.querySelector<HTMLButtonElement>('.primary')!.focus();
}

// Title screen (night of Nov 12): the game opened straight into a battle without saying what it was. Since Nov 15 New
// game and Continue lead to the town (crawl.ts), the dungeon loop's home; there is no world map or campaign
export function titleScreen() {
  setTrack('title');
  const saved = PROGRESS.some((k) => store.get(k));
  const go = (fn: () => void) => () => {
    d.close();
    fn();
  };
  const d = dialog(
    'title',
    'Dungeon Tactics',
    [
      el(
        'div',
        { class: 'menu-actions camp-list' },
        // Continue only shows with saved progress and says where it opens (the town or the expedition map), like FFT's
        // save summary; New game erases the progress (the 2nd tap confirms)
        ...(saved
          ? [
              button(
                'primary',
                [t('Continuar', 'Continue'), el('small', { class: 'continue-where' }, homeLabel())],
                go(homeScreen),
              ),
            ]
          : []),
        button(saved ? 'secondary' : 'primary', t('Novo jogo', 'New game'), (e: Event) => {
          const btn = e.currentTarget as HTMLButtonElement;
          if (saved && !btn.dataset.armed) {
            btn.dataset.armed = '1';
            btn.textContent = t('Toque de novo: apaga o progresso', 'Tap again: erases progress');
            return;
          }
          for (const k of PROGRESS) store.set(k, '');
          d.close();
          townScreen();
        }),
        button('secondary', t('Batalha avulsa', 'Quick battle'), go(quickBattle)),
        button('secondary', t('Como jogar', 'How to play'), go(howToPlay)),
        button(
          'secondary',
          t('Desenvolvedor: montar heróis e mapa', 'Developer: build heroes and map'),
          go(() => void devMenu(titleScreen)),
        ),
        button('secondary', t('Créditos', 'Credits'), go(credits)),
      ),
      el(
        'p',
        { class: 'title-foot' },
        t('Setas escolhem · Enter confirma', 'Arrows choose · Enter confirms'),
        ' · ',
        // language right on the title (review of Nov 13: it was only reachable from the menu inside the battle)
        button('title-lang', LANG === 'pt' ? 'English' : 'Português', () => setLang(LANG === 'pt' ? 'en' : 'pt')),
      ),
    ],
    { fixed: true },
  ); // real title screen (Nov 13): does not close, and the map behind it is just scenery
  d.overlay.classList.add('main-title');
  d.overlay.querySelector<HTMLButtonElement>('.primary')!.focus();
}
