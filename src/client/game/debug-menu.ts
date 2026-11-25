// The debug panel (Fernando, Nov 25: "o menu debug deve ser um menu separado do esc ... com varios comandos tipo spawnar
// mosntro novo no mapa, mudar a formula de balanceamento e cover ... no meio da luta"): F2 or the pad's L3 open and close
// it in a battle; with ?debug=1, a row of Options opens it for a finger. It is the Options screen (flow3d/options3d.ts)
// with a board of its own, so keys, pad and touch work as there: Spawn, Units, Shot rules, Pixel effect, Models, Tools, Map builder. The
// battle changes are shared/battle/debug.ts; each closes the panel and leaves the battle as an Undo does (settle)
import { forgetUndo, healAll, killAt, spawnClasses, spawnUnit } from '../../shared/battle/debug.ts';
import { checkOutcome } from '../../shared/battle/outcome.ts';
import { unitAt } from '../../shared/battle/pathing.ts';
import type { Team } from '../../shared/battle/types.ts';
import { openBattleBuilder } from '../battleedit/play.ts';
import { startScreen } from '../command.ts';
import { giveTurn } from '../dev/sandbox-play.ts';
import { fpsOn } from '../fps.ts';
import { t, unitName } from '../i18n.ts';
import { el } from '../icons.ts';
import { freshUi } from '../interaction.ts';
import { looks3d } from '../looks3d.ts';
import type { Game } from '../main.ts';
import { type Go, type Option, pick } from '../option-row.ts';
import { battleGroup } from './debug-battle.ts';
import { bodyGroup } from './debug-bodies.ts';
import { builderGroup } from './debug-builder.ts';
import { shotGroup } from './debug-shot.ts';
import { type OptionsBoard, sectionOf, valueNote } from './options.ts';
import type { OptionsGroup } from './options-list.ts';
import { pixelGroup } from './options-pixel.ts';

let shown: Element | undefined; // the panel's window while it is open
let close = () => {};
// what Spawn creates, kept between openings so the same monster comes again
let spawnDef = 'rat';
let spawnTeam: Team = 'enemy';

export function toggleDebug(g: Game) {
  if (shown?.isConnected) return close();
  const help = el('p', { class: 'opt-help', 'aria-live': 'polite' });
  const sections = groups(g).map((s) => sectionOf(s, (text) => (help.textContent = text)));
  const board: OptionsBoard = {
    title: t('Depuração', 'Debug'),
    get note() {
      return valueNote();
    },
    sections,
    list: el('div', { class: 'camp-list opt-list' }, ...sections.flatMap((s) => [el('h3', {}, s.title), ...s.rows])),
    help,
    actions: [],
  };
  const d = looks3d.options?.(board); // nothing once the 3D context is lost
  if (!d) return;
  close = d.close;
  shown = [...document.querySelectorAll('.overlay')].at(-1);
}

// After a change: Undo stops here, the one playing may have died (the turn passes, as Game.played does), and the battle
// goes on from its new state: the end, the enemies' turns or the hero's menu
async function settle(g: Game) {
  const b = g.battle,
    actor = b.state.turn.actor;
  forgetUndo(b);
  if (!b.over && !b.state.units.some((u) => u.id === actor)) b.endTurn();
  g.scene.sync(b.state);
  g.save();
  if (b.over) return g.finish();
  g.turn.screen = startScreen(b);
  if (!g.heroTurn) return g.runEnemies();
  if (b.state.turn.actor !== actor) g.turn.cursorToActor();
  g.update(freshUi(b));
}

// a command that changes the battle: only on the hero's turn with nothing playing, as Restart; a row says why it waits.
// `change` answers whether it changed anything
function command(g: Game, link: string, help: string, change: () => boolean | Promise<boolean>): Go {
  const wait = g.busy || !g.heroTurn;
  return {
    link: wait ? t(`${link}: espere a sua vez`, `${link}: wait for your turn`) : link,
    help,
    run: async () => {
      if (wait) return;
      close();
      if (await change()) await settle(g);
    },
  };
}

const UNDO = t(' O Desfazer não volta isto.', ' Undo does not take this back.');

function groups(g: Game): OptionsGroup[] {
  const b = g.battle,
    under = () => unitAt(b.state, g.turn.cursor);
  return [
    {
      title: t('Criar', 'Spawn'),
      help: t(
        'Cria um monstro ou um aliado no meio da luta.',
        'Creates a monster or an ally in the middle of a fight.',
      ),
      rows: [
        pick(
          t('Classe', 'Class'),
          t('Quem nasce: qualquer classe que uma batalha pode ter.', 'Who is born: any class a battle may hold.'),
          spawnClasses().map((id): [string, string] => [id, unitName(id)]),
          () => spawnDef,
          (v) => (spawnDef = v),
        ),
        pick(
          t('Lado', 'Side'),
          t('Inimigo joga pela IA; aliado é seu.', 'An enemy is played by the AI; an ally is yours.'),
          [
            ['enemy', t('Inimigo', 'Enemy')],
            ['hero', t('Aliado', 'Ally')],
          ] as [Team, string][],
          () => spawnTeam,
          (v) => (spawnTeam = v),
        ),
        command(
          g,
          t('Criar no cursor', 'Create at the cursor'),
          t(
            'Nasce na casa do cursor do mapa, ou na livre mais perto onde o corpo cabe, com a vida cheia, e entra na ordem dos turnos.',
            'It is born on the map cursor’s tile, or the nearest free one its body fits, at full life, and joins the turn order.',
          ) + UNDO,
          async () => {
            const u = spawnUnit(b.grid, b.state, spawnDef, spawnTeam, g.turn.cursor, Object.keys(g.roster));
            if (!u) return false;
            g.roster[u.id] = { team: u.team, def: u.def }; // the end's tally names it
            g.busy = true; // the model may still download: no key acts on a half-drawn battle
            await g.scene.addModel(u.def);
            g.busy = false;
            return true;
          },
        ),
      ],
    },
    {
      title: t('Unidades', 'Units'),
      help: t(
        'Cura, mata, passa a vez e termina a batalha, para testar.',
        'Heal, kill, hand the turn over and end the battle, to test.',
      ),
      rows: [
        command(
          g,
          t('Curar todos', 'Heal everyone'),
          t('Todos voltam à vida cheia.', 'Everyone back to full life.') + UNDO,
          () => {
            healAll(b.state);
            return true;
          },
        ),
        command(
          g,
          t('Matar a unidade do cursor', 'Kill the unit at the cursor'),
          t('A unidade sob o cursor do mapa cai como num golpe.', 'The unit under the map cursor falls as to a blow.') +
            UNDO,
          () => {
            const died = killAt(b.state, g.turn.cursor).length > 0;
            b.state.outcome = checkOutcome(b.state);
            return died;
          },
        ),
        command(
          g,
          t('Dar a vez à unidade do cursor', 'Give the turn to the unit at the cursor'),
          t(
            'A unidade sob o cursor joga agora, como se a fila tivesse chegado nela. Um inimigo joga pela IA.',
            'The unit under the map cursor plays now, as if the queue had reached it. An enemy is played by the AI.',
          ) + UNDO,
          () => {
            const u = under();
            return !!u && !giveTurn(b, u.id);
          },
        ),
        command(
          g,
          t('Vencer a batalha', 'Win the battle'),
          t('Termina já, como vitória.', 'Ends now, as a victory.'),
          () => {
            b.state.outcome = 'victory';
            return true;
          },
        ),
        command(
          g,
          t('Perder a batalha', 'Lose the battle'),
          t('Termina já, como derrota.', 'Ends now, as a defeat.'),
          () => {
            b.state.outcome = 'defeat';
            return true;
          },
        ),
      ],
    },
    shotGroup(),
    pixelGroup(),
    bodyGroup(g),
    {
      title: t('Ferramentas', 'Tools'),
      help: t(
        'O contador de desempenho e o construtor de batalhas.',
        'The performance counter and the battle builder.',
      ),
      rows: [
        {
          ...pick(
            t('Contador de fps', 'FPS counter'),
            t(
              'Mostra no canto quadros por segundo, desenhos e memória da cena. No teclado, F3.',
              'Shows frames per second, draw calls and the scene’s memory in the corner. On a keyboard, F3.',
            ),
            [
              [false, t('Desligado', 'Off')],
              [true, t('Ligado', 'On')],
            ],
            fpsOn,
            () => void g.toggleFps(),
          ),
          on: fpsOn,
        } satisfies Option,
        {
          link: t('Construtor de batalhas', 'Battle builder'),
          help: t(
            'Monta uma batalha: mapa, heróis e inimigos, com vida, velocidade, movimento, equipamento e habilidades.',
            'Builds a battle: map, heroes and enemies, with life, speed, movement, equipment and abilities.',
          ),
          run: () => {
            close();
            openBattleBuilder();
          },
        },
      ],
    },
    builderGroup(g, () => close()),
    battleGroup(g, () => close()),
  ];
}
