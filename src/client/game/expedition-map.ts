// The expedition map: the whole descent as a chart of places linked by ways, the box that describes the picked place, the
// travel commands, the party's state and the chest window.

import { CRAWL_RUN } from '../../content/crawl/rooms.ts';
import {
  type CrawlNode,
  descentGold,
  type Expedition,
  expeditionMap,
  nodeGold,
  openNodes,
} from '../../shared/crawl/expedition.ts';
import { roomGroup } from '../../shared/crawl/generate.ts';
import { commandRow, dialog, secondTap } from '../dialog.ts';
import { chart, goldRange, type Place, type Spot } from '../expedition-places.ts';
import { gauge, stillFace } from '../hud-pieces.ts';
import { t, unitName } from '../i18n.ts';
import { button, el, icon, UI_ICON } from '../icons.ts';
import { setTrack } from '../sound.ts';
import { goldNote } from '../town-ui.ts';
import { current, group, retreat, takeChest, toTown } from './crawl.ts';

// the floor of the rooms open now
const floorAt = (exp: Expedition) => {
  const map = expeditionMap(exp.seed);
  return map[openNodes(map, exp.path)[0]].floor;
};
export const floorOf = (exp: Expedition) =>
  t(`andar ${floorAt(exp)} de ${CRAWL_RUN.floors}`, `floor ${floorAt(exp)} of ${CRAWL_RUN.floors}`);

const groupOf = (n: CrawlNode) => roomGroup(n.seed, { depth: n.floor, boss: n.boss }).group;
const nameOf = (n: CrawlNode) => {
  if (n.chest) return t('Baú', 'Chest');
  const { name } = groupOf(n);
  return `${n.boss ? t('Chefe: ', 'Boss: ') : ''}${t(name[0], name[1])}`;
};
// "Minion ×2 · Skeleton archer": two rooms of a row often share a group, so the box counts them out
const foesOf = (n: CrawlNode) => {
  const all = groupOf(n).enemies;
  return [...new Set(all)]
    .map((e) => unitName(e) + (all.filter((x) => x === e).length > 1 ? ` ×${all.filter((x) => x === e).length}` : ''))
    .join(' · ');
};
// what the party may do with a place, in words: on the place's name for a screen reader, in the box and under Travel
const word = (n: CrawlNode, p: Place) =>
  ({
    cleared: n.chest ? t('já aberto', 'already opened') : t('vencida', 'cleared'),
    open: n.chest ? t('ao alcance', 'in reach') : t('aberta', 'open'),
    ahead: t('abre depois da anterior', 'opens after the one before'),
    skipped: t('caminho não tomado', 'path not taken'),
  })[p.state];

const memberOf = (id: string) => group().members.find((m) => m.id === id);
// the party's state in the map's corner, as the battle's unit panels show it
const partyBox = (exp: Expedition) =>
  el(
    'section',
    { class: 'map-box map-party', 'aria-label': t('Grupo', 'Party') },
    ...exp.party.map((h) => {
      const m = memberOf(h.id);
      return el(
        'div',
        { class: 'map-hero' },
        m ? stillFace(m.cls, 'neutral') : null,
        el(
          'div',
          { class: 'map-hero-body' },
          el('strong', {}, m?.name ?? h.id, m ? el('span', { class: 'map-hero-class' }, unitName(m.cls)) : null),
          gauge('hp', t('Vida', 'HP'), h.hp, h.max),
          h.manaMax ? gauge('mp', 'MP', h.mana ?? h.manaMax, h.manaMax) : null,
        ),
      );
    }),
  );

// the mark of a place: its kind by shape and drawing (a room counts its enemies), its state by the glyph over it
const mark = (n: CrawlNode, p: Place) =>
  p.state === 'cleared'
    ? '✓'
    : p.state === 'skipped'
      ? '✕'
      : n.chest
        ? el('i', { class: 'map-chest' })
        : n.boss
          ? icon(UI_ICON.quest)
          : String(groupOf(n).enemies.length);
const kindOf = (n: CrawlNode) => (n.chest ? 'chest' : n.boss ? 'boss' : 'room');

const NS = 'http://www.w3.org/2000/svg';
const pct = (v: number) => `${(v * 100).toFixed(2)}%`;

// The descent as a chart of places (Nov 16, Fernando: the map after FFT's world map): every floor's rooms, chest and the
// boss linked by their ways, the party's flag on the last place cleared. A place is only picked on the chart; the box
// describes it and Travel enters it, so no tap on the map commits the party
export function expeditionScreen(exp: Expedition) {
  setTrack('crypt');
  const map = expeditionMap(exp.seed);
  const c = chart(map, exp.path);
  const here = exp.path.at(-1);
  const spot = ([x, y]: Spot) => `left:${pct(x)};top:${pct((y + 0.5) / c.rows)}`;

  const describe = (p: Place) => {
    const n = map[p.node];
    const [lo, hi] = goldRange(n);
    const foes = groupOf(n).enemies.length;
    const way = [
      word(n, p),
      p.node === here && t('o grupo está aqui', 'the party is here'),
      !n.chest && n.next.some((k) => map[k].chest) && t('leva ao baú', 'leads to the chest'),
      n.next.some((k) => map[k].floor > n.floor) &&
        t(
          `vencê-la desce um andar: +${CRAWL_RUN.floorHeal}% de vida`,
          `clearing it leads down a floor: +${CRAWL_RUN.floorHeal}% life`,
        ),
      n.boss && t('vencê-lo encerra a expedição', 'beating it ends the expedition'),
    ];
    return [
      el(
        'h3',
        {},
        nameOf(n),
        el('small', {}, t(`andar ${n.floor} de ${CRAWL_RUN.floors}`, `floor ${n.floor} of ${CRAWL_RUN.floors}`)),
      ),
      el(
        'dl',
        { class: 'keys' },
        el('dt', {}, n.chest ? t('Batalha', 'Battle') : t(`Inimigos (${foes})`, `Enemies (${foes})`)),
        el('dd', {}, n.chest ? t('nenhuma: o grupo anda até o baú', 'none: the party walks to the chest') : foesOf(n)),
        el('dt', {}, t('Recompensa', 'Reward')),
        el(
          'dd',
          {},
          p.state === 'cleared'
            ? t(`${nodeGold(n)} de ouro, já achado`, `${nodeGold(n)} gold, already found`)
            : hi
              ? lo === hi
                ? t(`${hi} de ouro`, `${hi} gold`)
                : t(`${lo} a ${hi} de ouro`, `${lo} to ${hi} gold`)
              : t('nenhum ouro', 'no gold'),
        ),
        el('dt', {}, t('Caminho', 'Way')),
        el('dd', {}, way.filter(Boolean).join(' · ')),
      ),
    ];
  };

  const enter = (node: number) => {
    if (!map[node].chest) {
      location.search = `?room=${node}`;
      return;
    }
    d.close();
    const next = takeChest(exp, node);
    if (next) return chestScreen(next, nodeGold(map[node]));
    // a stale map: the expedition as it is now, or the town when it ended
    const now = current(exp);
    if (now) expeditionScreen(now);
    else toTown();
  };
  // Travel names what it does to the picked place; off for a place that is not open, with the reason under its name
  const travel = (p: Place) => {
    const n = map[p.node];
    const label = n.chest ? t('Abrir o baú', 'Open the chest') : t('Entrar na sala', 'Enter the room');
    const row = commandRow(
      'gold',
      p.state === 'open' ? label : [label, el('small', { class: 'continue-where' }, word(n, p))],
      () => enter(p.node),
      'primary',
    );
    row.disabled = p.state !== 'open';
    return row;
  };

  const info = el('section', { class: 'map-box map-info', 'aria-live': 'polite' });
  const marks = new Map<number, HTMLButtonElement>();
  let travelRow: HTMLButtonElement;
  // `act`: Enter, A or a tap on the place also moves on to the commands (Travel, or Information when it is closed)
  const pick = (p: Place, act = false) => {
    for (const [node, b] of marks) b.setAttribute('aria-current', String(node === p.node));
    info.replaceChildren(...describe(p));
    const row = travel(p);
    travelRow.replaceWith(row);
    travelRow = row;
    if (act) (row.disabled ? infoRow : row).focus();
  };
  const infoRow = commandRow('blue', t('Informações', 'Information'), () => infoScreen(() => infoRow.focus()));
  // the 2nd tap confirms: going back ends the descent (decision 32), alive, so its gold goes home whole
  const backRow = commandRow('bronze', t('Voltar à cidade', 'Back to town'), (e: Event) => {
    const again = t(
      'Confirmar: encerra a expedição, o ouro achado vai à cidade',
      'Confirm: ends the expedition, the gold found goes to town',
    );
    if (!secondTap(e, again)) return;
    retreat(exp);
    d.close();
    toTown();
  });

  const ways = document.createElementNS(NS, 'svg');
  ways.setAttribute('class', 'map-ways');
  ways.setAttribute('viewBox', `0 0 1 ${c.rows}`);
  ways.setAttribute('preserveAspectRatio', 'none'); // the chart stretches with its window; the strokes do not (style.css)
  ways.setAttribute('aria-hidden', 'true');
  // the walked ways last, over the others
  const ORDER = ['off', 'ahead', 'open', 'walked'];
  for (const l of [...c.links].sort((a, b) => ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind))) {
    const line = document.createElementNS(NS, 'line');
    line.setAttribute('class', l.kind);
    line.setAttribute('x1', String(l.from[0]));
    line.setAttribute('y1', String(l.from[1] + 0.5));
    line.setAttribute('x2', String(l.to[0]));
    line.setAttribute('y2', String(l.to[1] + 0.5));
    ways.append(line);
  }
  // in reading order (down the chart, left to right), which is the order the arrows and the d-pad walk them (dialog.ts)
  const places = [...c.places].sort((a, b) => a.at[1] - b.at[1] || a.at[0] - b.at[0]);
  for (const p of places) {
    const n = map[p.node];
    marks.set(
      p.node,
      button(`map-place ${kindOf(n)} ${p.state}`, mark(n, p), () => pick(p, true), {
        style: spot(p.at),
        'aria-label': `${nameOf(n)}: ${word(n, p)}`,
        'aria-current': 'false',
        onfocus: () => pick(p),
      }),
    );
  }
  const first = c.places.find((p) => p.state === 'open')!;
  travelRow = travel(first);
  const d = dialog(
    'title',
    `${t('Masmorra', 'Dungeon')} · ${floorOf(exp)}`,
    [
      el(
        'div',
        { class: 'map-scroll' },
        el(
          'div',
          { class: 'map-chart arrow-walk', style: `height:calc(var(--map-step) * ${c.rows})` },
          ...c.floors.map((f) =>
            el(
              'div',
              { class: 'map-floor', style: `top:${pct(f.from / c.rows)};height:${pct((f.to - f.from + 1) / c.rows)}` },
              t(`Andar ${f.floor}`, `Floor ${f.floor}`),
            ),
          ),
          el(
            'div',
            { class: 'map-field' },
            ways,
            el('span', { class: 'map-gate', style: spot(c.gate) }, t('Portão', 'Gate')),
            ...places.map((p) => marks.get(p.node)!),
            el('span', { class: 'map-flag', style: spot(c.party), 'aria-hidden': 'true' }),
          ),
        ),
      ),
      partyBox(exp),
      info,
      el('div', { class: 'menu-actions camp-list command-list map-commands' }, travelRow, infoRow, backRow),
    ],
    { fixed: true, note: goldNote(t('Ouro achado', 'Gold found'), descentGold(exp)) },
  );
  d.overlay.classList.add('crawl-map');
  pick(first);
  // the open place in the middle of the chart's window, wherever the party is on the way down
  marks.get(first.node)!.scrollIntoView({ block: 'center' });
  marks.get(first.node)!.focus({ preventScroll: true });
}

// Information (FFT's map command): what the chart's marks mean and what the descent's rules give and take
function infoScreen(back: () => void) {
  const sample = (cls: string, child: Parameters<typeof el>[2], text: string) =>
    el('li', {}, el('span', { class: `map-place ${cls}`, 'aria-hidden': 'true' }, child), text);
  const d = dialog(
    'title',
    t('Informações', 'Information'),
    [
      el(
        'ul',
        { class: 'legend' },
        sample(
          'room open',
          '3',
          t('Sala aberta: o número é quantos inimigos ela tem', 'Open room: the number is how many enemies it holds'),
        ),
        sample(
          'room ahead',
          '3',
          t('Sala mais adiante: abre depois da anterior', 'Room further on: opens after the one before'),
        ),
        sample('chest open', el('i', { class: 'map-chest' }), t('Baú: ouro sem batalha', 'Chest: gold with no battle')),
        sample('boss ahead', icon(UI_ICON.quest), t('Chefe: a última sala', 'Boss: the last room')),
        sample('room cleared', '✓', t('Sala vencida ou baú aberto', 'Room cleared or chest opened')),
        sample('room skipped', '✕', t('Caminho não tomado: não abre mais', 'Path not taken: it will not open')),
        el(
          'li',
          {},
          el('span', { class: 'map-flag', 'aria-hidden': 'true' }),
          t('Onde o grupo está', 'Where the party is'),
        ),
      ),
      el(
        'p',
        {},
        t(
          `Vencer uma sala: quem ficou de pé recupera ${CRAWL_RUN.roomHeal}% da vida e da mana, quem caiu volta com ${CRAWL_RUN.fallen}%. Descer um andar: +${CRAWL_RUN.floorHeal}% para todos.`,
          `Clearing a room: whoever stood recovers ${CRAWL_RUN.roomHeal}% of their life and mana, the fallen come back at ${CRAWL_RUN.fallen}%. Going down a floor: +${CRAWL_RUN.floorHeal}% to everyone.`,
        ),
      ),
      el(
        'p',
        {},
        t(
          'Voltar à cidade pelo mapa leva todo o ouro achado. Cair ou deixar uma sala no meio da luta encerra a expedição com metade dele.',
          'Going back to town from the map takes all the gold found. Falling or leaving a room mid-fight ends the expedition with half of it.',
        ),
      ),
      el(
        'div',
        { class: 'menu-actions' },
        button('primary', t('Voltar ao mapa', 'Back to the map'), () => {
          d.close();
          back();
        }),
      ),
    ],
    { onBack: back },
  );
  d.overlay.classList.add('map-help');
  d.overlay.querySelector<HTMLButtonElement>('.primary')!.focus();
}

// The chest just opened (already saved): its gold in a window over the map as it is now, which takes the focus back
function chestScreen(exp: Expedition, gold: number) {
  expeditionScreen(exp);
  const place = document.activeElement as HTMLElement;
  const back = () => place.focus();
  const d = dialog(
    'result',
    t('Baú aberto', 'Chest opened'),
    [
      goldNote(t('Ouro', 'Gold'), gold),
      el(
        'div',
        { class: 'menu-actions' },
        button('primary', t('Seguir no mapa', 'On to the map'), () => {
          d.close();
          back();
        }),
      ),
    ],
    { onBack: back },
  );
  d.overlay.querySelector<HTMLButtonElement>('.primary')!.focus();
}
