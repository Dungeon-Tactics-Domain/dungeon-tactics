// Title screen and the windows it opens: new game and continue (both to the town), standalone battle, how to play,
// credits and the developer menu. Each window goes back to the title with Esc or Back; the title itself never closes (the
// map behind it is just scenery).
import { CRAWL_RUN } from '../../content/crawl/rooms.ts';
import { SCENARIOS } from '../../shared/battle/scenarios.ts';
import { DEV_SCENARIO } from '../dev-roster.ts';
import { dialog } from '../dialog.ts';
import { FULLSCREEN_CTA, fullscreenEnv, fullscreenLabel, fullscreenOffer, toggleFullscreen } from '../fullscreen.ts';
import { hintLine } from '../glyphs.ts';
import { KEYS } from '../hud-pieces.ts';
import { LANG, setLang, t } from '../i18n.ts';
import { button, el } from '../icons.ts';
import { liveText } from '../key-hints.ts';
import { looks3d } from '../looks3d.ts';
import { setTrack } from '../sound.ts';
import { store } from '../store.ts';
import { BEST_KEY, parseBest, SURVIVAL_ID } from '../survival.ts';
import { jumpHelp } from '../town-ui.ts';
import { openSaves, savedCount, savedGames, startNewGame } from './saves-ui.ts';
import { type Block, blocksHtml, showSheet } from './sheets.ts';

// Developer menu (Nov 12). Starting saves the roster, erases the previous developer battle and reopens the game on it
// (boot builds the scenario). Drawn by flow3d/dev3d.ts.
export function devMenu(onBack?: () => void) {
  looks3d.dev?.(() => {
    store.set(`dt:battle:${DEV_SCENARIO}`, '');
    location.search = `?scenario=${DEV_SCENARIO}`;
  }, onBack);
}

// Standalone battle: the maps with a Beacon. Every choice opens by URL, each with its own
// save: the Hill behind the title is just scenery since the fixed title screen (Nov 13), it is not played through it
// measured on Nov 13 (npm run sim, 300 seeds, AI x AI) with damage x1.75, direction and trees without passage: Hill 74%, Skirmish 85%, Crypt 79%, Crypt Heart 81% (before 61%, 40% and 60%; the Heart with the 2nd archer in place of the Brute, which with the gap dropped to 25%)
const QUICK_MAPS = ['beacon_hill', 'skirmish', 'flooded_crypt', 'crypt_heart'];
function quickBattle() {
  const title = t('Batalha avulsa', 'Quick battle'),
    best = parseBest(store.get(BEST_KEY));
  const rows: [name: string, right: string, id: string][] = [
    ...QUICK_MAPS.map((id): [string, string, string] => [t(SCENARIOS[id].name, SCENARIOS[id].en), '', id]),
    // mode with another rule: survive until dawn in Ash Wood (survival.ts)
    [
      t('Até o amanhecer: resistir no Bosque', 'Until Dawn: hold out in the Wood'),
      best ? t(`recorde ${best}`, `record ${best}`) : '',
      SURVIVAL_ID,
    ],
  ];
  const d = dialog(
    'title',
    title,
    [
      el(
        'div',
        { class: 'menu-actions camp-list' },
        ...rows.map(([name, right, id], i) =>
          button(i ? 'secondary' : 'primary', name + (right && ` (${right})`), () => {
            d.close();
            if (id !== SURVIVAL_ID) setTrack(null);
            location.search = `?scenario=${id}`;
          }),
        ),
      ),
    ],
    { onBack: titleScreen },
  );
  d.overlay.querySelector<HTMLButtonElement>('.primary')!.focus();
  showSheet(d.overlay, { title, rows: rows.map(([name, right]) => ({ name, right })) });
}

// Credits (summary; the full list, with each file's license, is public/CREDITS.txt)
function credits() {
  const title = t('Créditos', 'Credits');
  const blocks = [
    t('Modelos 3D: KayKit, de Kay Lousberg (CC0)', '3D models: KayKit, by Kay Lousberg (CC0)'),
    t(
      'Efeitos sonoros: Kenney, artisticdude, JaggedStone, Julien Matthey e outros do OpenGameArt (CC0)',
      'Sound effects: Kenney, artisticdude, JaggedStone, Julien Matthey and others from OpenGameArt (CC0)',
    ),
    t(
      'Músicas (CC0, OpenGameArt): CodeManu e nene. Vozes dos diálogos: compostas para o jogo',
      'Music (CC0, OpenGameArt): CodeManu and nene. Dialogue voices: composed for the game',
    ),
    t('Fonte: Alegreya Sans (SIL Open Font License 1.1)', 'Font: Alegreya Sans (SIL Open Font License 1.1)'),
    t('História, mapas e regras: Dungeon Tactics', 'Story, maps and rules: Dungeon Tactics'),
  ].map((str): Block => ({ k: 'item', str }));
  const d = dialog(
    'title',
    title,
    [
      ...blocksHtml(blocks),
      el(
        'p',
        {},
        el(
          'a',
          { href: '/CREDITS.txt', target: '_blank', rel: 'noopener' },
          t('Lista completa, com a licença de cada arquivo', 'Full list, with each file’s license'),
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
  showSheet(d.overlay, { title, blocks });
}

// How to play (night of Nov 12): the rules that change the decision, for whoever arrives without a tutorial. Since Nov 15
// in short sections (a heading over a legend list each) and with the town and the expedition. Text checked against the
// engine (turn-queue, combat, battle, crawl/expedition) and the town (game/town.ts, game/crawl.ts)
function howToPlay() {
  const part = (title: string, ...lines: string[]): Block[] => [
    { k: 'head', str: title },
    ...lines.map((str): Block => ({ k: 'item', str })),
  ];
  // the expedition's numbers come from its data, so the text follows a change there (like jumpHelp)
  const { floors, rows, width, roomHeal, fallen, floorHeal } = CRAWL_RUN;
  const title = t('Como jogar', 'How to play');
  const blocks: Block[] = [
    ...part(
      t('Turno e fila', 'Turn and queue'),
      t(
        'A lista de turnos (canto de cima) mostra quem joga nesta rodada e na próxima. Quem é mais rápido joga mais vezes.',
        'The turn list (top corner) shows who acts this round and the next. Faster units act more often.',
      ),
      t(
        'Na sua vez: Mover e Habilidades, em qualquer ordem; depois de agir, ainda se anda com o movimento que sobrou. Fazer menos traz a próxima vez mais cedo.',
        'On your turn: Move and Abilities, in any order; after acting you can still walk with the movement left. Doing less brings your next turn sooner.',
      ),
      t(
        'Nas batalhas avulsas, proteja o Farol (o cristal azul) quando houver um.',
        'In quick battles, protect the Beacon (the blue crystal) when there is one.',
      ),
    ),
    ...part(
      t('Posição e altura', 'Position and height'),
      t(
        'Do alto se acerta mais e se alcança mais longe; entulho protege de ataques de longe e árvore não se atravessa.',
        'From high ground you hit more and reach farther; rubble covers you from ranged attacks and trees block the way.',
      ),
      t(
        'No fim do turno, escolha para onde olhar: golpe pelo lado acerta mais, pelas costas mais ainda.',
        'At turn end, pick where to face: hits from the side land more often, from behind even more.',
      ),
      jumpHelp(),
    ),
    ...part(
      t('Empurrões, espinhos e água', 'Pushes, spikes and water'),
      t(
        'Empurrar contra muro ou alguém fere; empurrar do alto para baixo também.',
        'Pushing into a wall or someone hurts; pushing someone off high ground too.',
      ),
      t(
        'Espinhos ferem quem é jogado neles ou termina a vez em cima; passar por cima não fere.',
        'Spikes hurt whoever is pushed onto them or ends a turn on them; walking over is safe.',
      ),
      t('Na água funda só se anda ou espera.', 'In deep water you can only move or wait.'),
    ),
    // the Nov 15 charge rules (battle.ts act, turn-queue.ts chargeAim): the lock is the player's and the shot is traced when it fires
    ...part(
      t('Cargas', 'Charges'),
      t(
        'Habilidade com carga sai depois: a área roxa mostra onde vai cair, e a lista de turnos mostra quando. Começar a carga gasta metade do movimento que sobrou.',
        'Charged abilities land later: the purple area shows where and the turn list shows when. Starting a charge costs half the movement you have left.',
      ),
      t(
        'Mirando alguém, você trava no personagem (a mira segue ele) ou no chão.',
        'Aiming at someone, you lock on the character (the aim follows them) or on the tile.',
      ),
      t(
        'O tiro é traçado na hora de sair, de onde quem lança estiver, e para na primeira cobertura ou unidade no caminho; a linha mostra até onde vai. Fogo amigo fere pela metade.',
        'The shot is traced when it fires, from where the caster stands, and stops at the first cover or unit in its way; the line shows how far it goes. Friendly fire hurts at half.',
      ),
    ),
    // the counters as the engine plays them (combat.ts canCounter, pendingCounters): they change where to walk after striking
    ...part(
      t('Contra-ataque', 'Counter-attacks'),
      t(
        'Quem você golpeia direto (sem carga, sem cura) contra-ataca pela metade se o ataque básico dele é de alvo único; ataque básico em área nunca contra-ataca.',
        'Whoever you strike directly (no charge, no heal) strikes back at half if its basic attack is single-target; an area basic attack never strikes back.',
      ),
      t(
        'Só no resto do seu turno: cada movimento que sai do alcance dele leva um golpe antes de você sair, e voltar e sair de novo leva outro. O golpe vem sempre de frente.',
        'Only for the rest of your turn: each move that leaves its reach draws a blow before you leave, and walking back in and out draws another. The blow always comes from the front.',
      ),
      t(
        'Um atirador golpeado de perto atira quando você sai do contato, onde você parar, se ali estiver no alcance dele; cobertura ou alguém no caminho leva o tiro.',
        'A shooter struck up close fires once you walk out of contact, where you stop, if that stop is in its range; cover or someone in the way takes the shot.',
      ),
      t(
        'Depois de golpear, as paradas que causam contra-ataque ficam com borda vermelha e o cursor mostra o dano; ao mirar, uma linha ou seta mostra quem contra-ataca.',
        'After striking, the stops that draw a counter get a red frame and the cursor shows the damage; aiming, a line or arrow shows who strikes back.',
      ),
    ),
    // the dungeon loop (game/town.ts, game/crawl.ts, shared/crawl/expedition.ts winRoom)
    ...part(
      t('Cidade e expedição', 'Town and expedition'),
      t(
        'Na cidade se anda com W A S D, as setas, o direcional ou o analógico do gamepad, ou clicando no chão. Perto de alguém ou de uma porta aparece um balão com o que dá para fazer: Enter, A ou um clique no balão fala ou entra. Clicar numa pessoa ou casa só leva até ela. Esc, H, Start, B ou o botão direito do mouse abrem o menu da cidade.',
        'In town you walk with W A S D, the arrows, the gamepad’s d-pad or stick, or by clicking the ground. Near someone or a door a balloon shows what you can do: Enter, A or a click on the balloon talks or goes in. Clicking a person or a house only walks there. Esc, H, Start, B or the right mouse button open the town menu.',
      ),
      t(
        'No toque: toque no chão para andar e no balão para falar ou entrar; o botão ☰ abre o menu da cidade. Na batalha, o 1º toque numa casa marca e o 2º confirma, e o botão Voltar (↩) aparece ao lado do ☰. O botão Desfazer (↶) aparece ao lado do ☰ depois de mover; gire dois dedos para girar a câmera.',
        'On touch: tap the ground to walk and the balloon to talk or go in; the ☰ button opens the town menu. In battle the 1st tap on a tile marks it and the 2nd confirms, and the Back button (↩) shows beside the ☰. The Undo button (↶) shows beside the ☰ after you move; twist two fingers to turn the camera.',
      ),
      t(
        'A Guilda dos Aventureiros abre o Grupo (quem vai e a classe de cada um), a Loja compra e vende, a Taverna recruta e o Portão da masmorra inicia a expedição. Ferreiro e Encantadora ainda estão por vir.',
        'The Adventurers’ Guild opens the Party (who goes and each one’s class), the Shop buys and sells, the Tavern recruits and the Dungeon gate starts the expedition. The Blacksmith and the Enchantress are still to come.',
      ),
      t(
        `A expedição tem ${floors} andares de ${rows} fileiras de salas. Em cada fileira, escolha 1 de ${width[0]} ou ${width[1]} salas: os inimigos aparecem antes. Depois do último andar vem o chefe.`,
        `The expedition has ${floors} floors of ${rows} rows of rooms. In each row, pick 1 of ${width[0]} or ${width[1]}: you see the enemies first. After the last floor comes the boss.`,
      ),
      t(
        `A vida passa de uma sala para a outra: ao vencer, quem ficou de pé ganha ${roomHeal}% da vida máxima e quem caiu volta com ${fallen}%; ao descer de andar, todos ganham ${floorHeal}%, nunca acima do máximo.`,
        `Life carries from room to room: on a win, whoever stood gains ${roomHeal}% of max life and a fallen hero comes back at ${fallen}%; going down a floor, everyone gains ${floorHeal}%, never above the max.`,
      ),
      t(
        'Reiniciar batalha (Opções) tenta a sala de novo de graça, com a vida com que o grupo entrou. Sair da sala antes do fim perde a expedição, e uma derrota também; fechar a aba não é sair: em Continuar, na tela de título, carregar esse jogo salvo reabre a sala.',
        'Restart battle (Options) retries the room for free, with the life the party came in with. Leaving the room before it ends loses the expedition, and so does a defeat; closing the tab is not leaving: on the title screen, Continue and loading that saved game reopens the room.',
      ),
    ),
  ];
  const d = dialog(
    'title',
    title,
    [
      ...blocksHtml(blocks),
      button('primary', t('Voltar', 'Back'), () => {
        d.close();
        titleScreen();
      }),
    ],
    { onBack: titleScreen },
  );
  // opens at the top with the focus on the ✕ (dialog): focusing Back, at the foot, scrolled the window to its end (Nov 16 QA)
  d.overlay.classList.add('how-to-play');
  showSheet(d.overlay, { title, blocks });
}

// Title screen (night of Nov 12): the game opened straight into a battle without saying what it was. Since Nov 15 New
// game and Continue lead to the town (crawl.ts), the dungeon loop's home; there is no world map or campaign. Since Nov 16
// (Fernando: the interface on its FFT counterpart) the name over the art and a small plain command window under it, the
// cursor on Continue when there is a save; the lab kit's Menu head and orbs of Nov 15 left
export function titleScreen() {
  setTrack('title');
  // read here, not at load: crawl.ts imports this module back
  const saved = savedGames().length;
  // fullscreen (Fernando, Nov 18): a phone in the browser gets it as the window's one main button, before the
  // commands; elsewhere a quiet shortcut beside the language. The title opens again once it settles, so the main
  // button leaves and the shortcut says what a tap does now
  const env = fullscreenEnv(),
    offer = fullscreenOffer(env),
    main = offer === 'main',
    leave = new AbortController();
  const go = (fn: () => void) => () => {
    leave.abort();
    d.close();
    fn();
  };
  document.addEventListener('fullscreenchange', go(titleScreen), { signal: leave.signal, once: true });
  const d = dialog(
    'title',
    'Dungeon Tactics',
    [
      ...(main ? [button('primary title-main', FULLSCREEN_CTA(), () => toggleFullscreen(true))] : []),
      el(
        'div',
        { class: 'menu-actions camp-list' },
        // Continue only shows with a saved game and opens the list of them (saves-ui.ts); New game starts a new save
        // slot and keeps the others (Fernando, Nov 15: it used to erase the progress)
        ...(saved
          ? [
              button(
                main ? 'secondary' : 'primary',
                [t('Continuar', 'Continue'), el('small', { class: 'continue-where' }, savedCount(saved))],
                go(() => openSaves(titleScreen)),
              ),
            ]
          : []),
        button(
          saved || main ? 'secondary' : 'primary',
          t('Novo jogo', 'New game'),
          go(() => startNewGame(titleScreen)),
        ),
        button('secondary', t('Batalha avulsa', 'Quick battle'), go(quickBattle)),
        button('secondary', t('Como jogar', 'How to play'), go(howToPlay)),
        button('secondary', t('Créditos', 'Credits'), go(credits)),
        // the tool, not the game: last, under a rule (flow3d/title3d.ts draws it on `dev-row`; Nov 18 review)
        button(
          'secondary dev-row',
          t('Desenvolvedor: montar heróis e mapa', 'Developer: build heroes and map'),
          go(() => devMenu(titleScreen)),
        ),
      ),
      el(
        'p',
        { class: 'title-foot' },
        // the keys only where there is a keyboard (Nov 16 touch audit: a tablet was told to press Enter)
        KEYS &&
          liveText(
            '',
            (s) =>
              `${hintLine(
                s,
                [
                  ['move', t('escolher', 'choose')],
                  ['confirm', t('confirmar', 'confirm')],
                ],
                ' · ',
              )} · `,
          ),
        offer === 'quiet' && button('title-fs', fullscreenLabel(env.on), () => toggleFullscreen()),
        // language right on the title (review of Nov 13: it was only reachable from the menu inside the battle)
        button('title-lang', LANG === 'pt' ? 'English' : 'Português', () => setLang(LANG === 'pt' ? 'en' : 'pt')),
      ),
    ],
    { fixed: true },
  ); // real title screen (Nov 13): does not close, and the map behind it is just scenery
  d.overlay.classList.add('main-title');
  d.overlay.querySelector<HTMLButtonElement>('.primary')!.focus();
  looks3d.title?.(d.overlay); // drawn over this window, unseen under it (flow3d/title3d.ts)
}
