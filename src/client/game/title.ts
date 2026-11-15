// Title screen and the windows it opens: new game and continue (both to the town), standalone battle, how to play,
// credits and the developer menu. Each window goes back to the title with Esc or Back; the title itself never closes (the
// map behind it is just scenery).
import { SCENARIOS } from '../../shared/battle/scenarios.ts';
import { openDevMenu } from '../dev-menu.ts';
import { DEV_SCENARIO } from '../dev-roster.ts';
import { dialog } from '../dialog.ts';
import { LANG, setLang, t } from '../i18n.ts';
import { button, el } from '../icons.ts';
import { setTrack } from '../sound.ts';
import { store } from '../store.ts';
import { BEST_KEY, parseBest, SURVIVAL_ID } from '../survival.ts';
import { jumpHelp } from '../town-ui.ts';
import { openSaves, savedGames, startNewGame } from './saves-ui.ts';

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
            'Músicas (CC0, OpenGameArt): CodeManu e nene. Vozes dos diálogos: compostas para o jogo',
            'Music (CC0, OpenGameArt): CodeManu and nene. Dialogue voices: composed for the game',
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
        // the Nov 15 charge rules (battle.ts act, turn-queue.ts chargeAim): the lock is the player's and the shot is traced when it fires
        el(
          'li',
          {},
          t(
            'Habilidade com carga sai depois: a área roxa mostra onde vai cair, e a lista de turnos mostra quando. Começar a carga gasta metade do movimento que sobrou. Mirando alguém, você trava no personagem (a mira segue ele) ou no chão. O tiro é traçado na hora de sair, de onde quem lança estiver, e para na primeira cobertura ou unidade no caminho; a linha mostra até onde vai. Fogo amigo fere pela metade.',
            'Charged abilities land later: the purple area shows where and the turn list shows when. Starting a charge costs half the movement you have left. Aiming at someone, you lock it on the character (the aim follows them) or on the tile. The shot is traced when it fires, from where the caster stands, and stops at the first cover or unit in its way; the line shows how far it goes. Friendly fire hurts at half.',
          ),
        ),
        // Nov 15 counters (combat.ts pendingCounters): they change where to walk after striking
        el(
          'li',
          {},
          t(
            'Quem você golpeia sem carga contra-ataca pela metade cada vez que você se mover, neste turno e no próximo, se responde do mesmo jeito (de perto ou de longe) com golpe de alvo único: de perto quando você sai do alcance dele, de longe onde você parar. Ao mirar e ao escolher para onde andar, uma linha ou seta mostra quem contra-ataca.',
            'Whoever you strike without a charge strikes back at half each time you move, this turn and your next, if it answers the same way (up close or from afar) with a single-target attack: up close when you leave its reach, from afar where you stop. Aiming and choosing where to walk, a line or arrow shows who strikes back.',
          ),
        ),
        el(
          'li',
          {},
          t(
            'Proteja o Farol (o cristal azul) quando houver um.',
            'Protect the Beacon (the blue crystal) when there is one.',
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
  // read here, not at load: crawl.ts imports this module back
  const saved = savedGames().length;
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
        // Continue only shows with a saved game and opens the list of them (saves-ui.ts); New game starts a new save
        // slot and keeps the others (Fernando, Nov 15: it used to erase the progress)
        ...(saved
          ? [
              button(
                'primary',
                [
                  t('Continuar', 'Continue'),
                  el(
                    'small',
                    { class: 'continue-where' },
                    saved === 1
                      ? t('1 jogo salvo', '1 saved game')
                      : t(`${saved} jogos salvos`, `${saved} saved games`),
                  ),
                ],
                go(() => openSaves(titleScreen)),
              ),
            ]
          : []),
        button(saved ? 'secondary' : 'primary', t('Novo jogo', 'New game'), go(startNewGame)),
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
