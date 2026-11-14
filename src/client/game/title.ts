// Title screen and the windows it opens: standalone battle, how to play, credits and the developer menu. Each one goes back to
// the title with Esc or Back; the title itself never closes (the map behind it is just scenery).
import { SCENARIOS } from '../../shared/battle/scenarios.ts';
import { CAMPAIGN_KEY, CHAPTERS, chapterId } from '../campaign.ts';
import { openDevMenu } from '../dev-menu.ts';
import { DEV_SCENARIO } from '../dev-roster.ts';
import { dialog } from '../dialog.ts';
import { GROUP_KEY } from '../group.ts';
import { HERO_KEY } from '../hero.ts';
import { LANG, setLang, t } from '../i18n.ts';
import { el } from '../icons.ts';
import { setTrack } from '../sound.ts';
import { store } from '../store.ts';
import { BEST_KEY, parseBest, SURVIVAL_ID } from '../survival.ts';
import { parseWorld, WORLD, WORLD_KEY } from '../world.ts';
import { savedHero, toWorld } from './boot.ts';

// Developer menu (Nov 12): loads the FFT study separately just to offer Gariland's terrain as a map. Starting
// saves the roster, erases the previous developer battle and reopens the game on it (boot builds the scenario).
export async function devMenu(onBack?: () => void) {
  (await import('../../shared/battle/fft/gariland.ts')).registerFftStudy();
  openDevMenu(() => {
    store.set(`dt:battle:${DEV_SCENARIO}`, '');
    location.search = `?scenario=${DEV_SCENARIO}`;
  }, onBack);
}

// Standalone battle: the maps with a Beacon (Ash Wood and Pass belong to the campaign). Every choice opens by URL, each with its own
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
          el(
            'button',
            {
              type: 'button',
              class: id === 'beacon_hill' ? 'primary' : 'secondary',
              onclick: () => {
                d.close();
                setTrack(null);
                location.search = `?scenario=${id}`;
              },
            },
            t(SCENARIOS[id].name, SCENARIOS[id].en),
          ),
        ),
        // mode with another rule: survive until dawn in Ash Wood (survival.ts)
        el(
          'button',
          {
            type: 'button',
            class: 'secondary',
            onclick: () => {
              d.close();
              location.search = `?scenario=${SURVIVAL_ID}`;
            },
          },
          t('Até o amanhecer: resistir no Bosque', 'Until Dawn: hold out in the Wood') +
            (parseBest(store.get(BEST_KEY))
              ? t(` (recorde ${parseBest(store.get(BEST_KEY))})`, ` (record ${parseBest(store.get(BEST_KEY))})`)
              : ''),
        ),
      ),
    ],
    { onBack: titleScreen },
  );
  d.overlay.querySelector<HTMLButtonElement>('.primary')!.focus();
}

// Credits (summary; the full list, with each file's license, is public/CREDITS.txt). Back opens `back` (the title,
// or nothing at the end of the campaign, where the map is already underneath).
export function credits(back: () => void = titleScreen) {
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
            'Músicas (CC0, OpenGameArt): CodeManu, TAD, cynicmusic, nene, FAINOD e Emma_MA. Vozes da campanha: compostas para o jogo',
            'Music (CC0, OpenGameArt): CodeManu, TAD, cynicmusic, nene, FAINOD and Emma_MA. Campaign voices: composed for the game',
          ),
        ),
        el(
          'li',
          {},
          t(
            'Fontes: Cinzel e Alegreya Sans (SIL Open Font License 1.1)',
            'Fonts: Cinzel and Alegreya Sans (SIL Open Font License 1.1)',
          ),
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
      el(
        'button',
        {
          type: 'button',
          class: 'primary',
          onclick: () => {
            d.close();
            back();
          },
        },
        t('Voltar', 'Back'),
      ),
    ],
    { onBack: back },
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
          t(
            'Do alto se acerta mais e se alcança mais longe; entulho protege de ataques de longe e árvore não se atravessa. No fim do turno, escolha para onde olhar: golpe pelo lado acerta mais, pelas costas mais ainda. O Salto diz quantos níveis cada um sobe ou desce por passo: o Ladino e o Lacaio 2, os outros 1. Com Salto 2 também se voa 1 casa de água funda ou de buraco.',
            'From high ground you hit more and reach farther; rubble covers you from ranged attacks and trees block the way. At turn end, pick where to face: hits from the side land more often, from behind even more. Jump says how many levels each unit climbs or drops per step: the Rogue and the Minion 2, the rest 1. Jump 2 also clears 1 tile of deep water or a gap.',
          ),
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
      el(
        'button',
        {
          type: 'button',
          class: 'primary',
          onclick: () => {
            d.close();
            titleScreen();
          },
        },
        t('Voltar', 'Back'),
      ),
    ],
    { onBack: titleScreen },
  );
  d.overlay.querySelector<HTMLButtonElement>('.primary')!.focus();
}

// Title screen (night of Nov 12): the game opened straight into a battle without saying what it was or that there was a campaign
export function titleScreen() {
  setTrack('title');
  const go = (fn: () => void) => () => {
    d.close();
    fn();
  };
  const d = dialog(
    'title',
    'Dungeon Tactics',
    [
      el(
        'p',
        { class: 'title-sub' },
        t('Táticas por turnos com bonecos de pixel', 'Turn-based tactics with pixel heroes'),
      ),
      el(
        'div',
        { class: 'menu-actions camp-list' },
        // Continue only shows with saved progress; New game erases campaign progress (the 2nd tap confirms)
        // Continue says who and where (like FFT's save summary): whoever returns after days knows what will open
        ...(parseWorld(store.get(WORLD_KEY)) > 0
          ? [
              el(
                'button',
                { type: 'button', class: 'primary', onclick: go(toWorld) },
                t('Continuar', 'Continue'),
                el('small', { class: 'continue-where' }, continueWhere()),
              ),
            ]
          : []),
        el(
          'button',
          {
            type: 'button',
            class: parseWorld(store.get(WORLD_KEY)) > 0 ? 'secondary' : 'primary',
            onclick: (e: Event) => {
              const btn = e.currentTarget as HTMLButtonElement;
              // asks for the 2nd tap even with only the hero created (review of Nov 13: it erased the hero without asking)
              if ((parseWorld(store.get(WORLD_KEY)) > 0 || savedHero()) && !btn.dataset.armed) {
                btn.dataset.armed = '1';
                btn.textContent = t('Toque de novo: apaga o progresso', 'Tap again: erases progress');
                return;
              }
              for (const k of [
                WORLD_KEY,
                CAMPAIGN_KEY,
                HERO_KEY,
                GROUP_KEY,
                ...CHAPTERS.map((_, n) => `dt:battle:${chapterId(n)}`),
              ])
                store.set(k, '');
              d.close();
              toWorld();
            },
          },
          t('Novo jogo', 'New game'),
        ),
        el(
          'button',
          { type: 'button', class: 'secondary', onclick: go(quickBattle) },
          t('Batalha avulsa', 'Quick battle'),
        ),
        el('button', { type: 'button', class: 'secondary', onclick: go(howToPlay) }, t('Como jogar', 'How to play')),
        el(
          'button',
          { type: 'button', class: 'secondary', onclick: go(() => void devMenu(titleScreen)) },
          t('Desenvolvedor: montar heróis e mapa', 'Developer: build heroes and map'),
        ),
        el('button', { type: 'button', class: 'secondary', onclick: go(credits) }, t('Créditos', 'Credits')),
      ),
      el(
        'p',
        { class: 'title-foot' },
        t('Setas escolhem · Enter confirma', 'Arrows choose · Enter confirms'),
        ' · ',
        // language right on the title (review of Nov 13: it was only reachable from the menu inside the battle)
        el(
          'button',
          { type: 'button', class: 'title-lang', onclick: () => setLang(LANG === 'pt' ? 'en' : 'pt') },
          LANG === 'pt' ? 'English' : 'Português',
        ),
      ),
    ],
    { fixed: true },
  ); // real title screen (Nov 13): does not close, and the map behind it is just scenery
  d.overlay.classList.add('main-title');
  d.overlay.querySelector<HTMLButtonElement>('.primary')!.focus();
}

// "Ayla · Beacon Hill": the saved protagonist and the next open point on the map
function continueWhere(): string {
  const w = WORLD[Math.min(parseWorld(store.get(WORLD_KEY)), WORLD.length - 1)];
  const hero = savedHero();
  return `${hero ? `${hero.name} · ` : ''}${t(w.name[0], w.name[1])}`;
}
