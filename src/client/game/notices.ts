// The notice windows of the town and the expedition (note.ts noteWindow: drawn in 3D, window3d/note3d.ts, or the HTML
// window each one always had): the map's Information and opened chest (game/expedition-map.ts), the expedition lost
// and a room that would not open (game/crawl.ts homeScreen).
import { CRAWL_RUN } from '../../content/crawl/rooms.ts';
import { dialog } from '../dialog.ts';
import { t } from '../i18n.ts';
import { button, el, icon, UI_ICON } from '../icons.ts';
import { noteWindow } from '../note.ts';
import { goldNote } from '../town-ui.ts';
import { toTown } from './crawl.ts';

// Information (FFT's map command): what the chart's marks mean and what the descent's rules give and take. A notice
// window (note.ts): drawn in 3D, or the HTML one below
export function infoScreen(back: () => void) {
  const title = t('Informações', 'Information'),
    toMap = t('Voltar ao mapa', 'Back to the map');
  const marks = {
    open: t('Sala aberta: o número é quantos inimigos ela tem', 'Open room: the number is how many enemies it holds'),
    ahead: t('Sala mais adiante: abre depois da anterior', 'Room further on: opens after the one before'),
    chest: t('Baú: ouro sem batalha', 'Chest: gold with no battle'),
    boss: t('Chefe: a última sala', 'Boss: the last room'),
    cleared: t('Sala vencida ou baú aberto', 'Room cleared or chest opened'),
    skipped: t('Caminho não tomado: não abre mais', 'Path not taken: it will not open'),
    flag: t('Onde o grupo está', 'Where the party is'),
  };
  const rules = [
    t(
      `Vencer uma sala: quem ficou de pé recupera ${CRAWL_RUN.roomHeal}% da vida e da mana, quem caiu volta com ${CRAWL_RUN.fallen}%. Descer um andar: +${CRAWL_RUN.floorHeal}% para todos.`,
      `Clearing a room: whoever stood recovers ${CRAWL_RUN.roomHeal}% of their life and mana, the fallen come back at ${CRAWL_RUN.fallen}%. Going down a floor: +${CRAWL_RUN.floorHeal}% to everyone.`,
    ),
    t(
      'Voltar à cidade pelo mapa leva todo o ouro achado. Cair ou deixar uma sala no meio da luta encerra a expedição com metade dele.',
      'Going back to town from the map takes all the gold found. Falling or leaving a room mid-fight ends the expedition with half of it.',
    ),
  ];
  const sample = (cls: string, child: Parameters<typeof el>[2], text: string) =>
    el('li', {}, el('span', { class: `map-place ${cls}`, 'aria-hidden': 'true' }, child), text);
  const html = () => {
    const d = dialog(
      'title',
      title,
      [
        el(
          'ul',
          { class: 'legend' },
          sample('room open', '3', marks.open),
          sample('room ahead', '3', marks.ahead),
          sample('chest open', el('i', { class: 'map-chest' }), marks.chest),
          sample('boss ahead', icon(UI_ICON.quest), marks.boss),
          sample('room cleared', '✓', marks.cleared),
          sample('room skipped', '✕', marks.skipped),
          el('li', {}, el('span', { class: 'map-flag', 'aria-hidden': 'true' }), marks.flag),
        ),
        ...rules.map((p) => el('p', {}, p)),
        el(
          'div',
          { class: 'menu-actions' },
          button('primary', toMap, () => {
            d.close();
            back();
          }),
        ),
      ],
      { onBack: back },
    );
    d.overlay.classList.add('map-help');
    d.overlay.querySelector<HTMLButtonElement>('.primary')!.focus();
    return d;
  };
  noteWindow(
    {
      title,
      legend: [
        [{ glyph: '3', look: 'open' }, marks.open],
        [{ glyph: '3', look: 'ahead' }, marks.ahead],
        [{ glyph: '◆', look: 'open', square: true }, marks.chest],
        [{ glyph: '⚔', look: 'ahead' }, marks.boss],
        [{ glyph: '✓', look: 'cleared' }, marks.cleared],
        [{ glyph: '✕', look: 'skipped' }, marks.skipped],
        [{ glyph: '', look: 'flag' }, marks.flag],
      ],
      text: rules,
      buttons: [{ label: toMap, run: back }],
      onBack: back,
    },
    html,
  );
}

// The chest just opened (already saved): its gold in a window over the map as it is now (the caller opened it), which
// takes the focus back
export function chestScreen(gold: number) {
  const place = document.activeElement as HTMLElement;
  const back = () => place.focus();
  const title = t('Baú aberto', 'Chest opened'),
    onward = t('Seguir no mapa', 'On to the map');
  const html = () => {
    const d = dialog(
      'result',
      title,
      [
        goldNote(t('Ouro', 'Gold'), gold),
        el(
          'div',
          { class: 'menu-actions' },
          button('primary', onward, () => {
            d.close();
            back();
          }),
        ),
      ],
      { onBack: back },
    );
    d.overlay.querySelector<HTMLButtonElement>('.primary')!.focus();
    return d;
  };
  noteWindow(
    { title, figure: [t('Ouro', 'Gold'), String(gold)], buttons: [{ label: onward, run: back }], onBack: back },
    html,
  );
}

// A notice window (note.ts): drawn in 3D, or the HTML one below
export function lostScreen(kept: number) {
  const title = t('Expedição perdida', 'Expedition lost'),
    toldTown = t('Voltar à cidade', 'Back to town'),
    gold = t('Ouro para a cidade', 'Gold to town');
  const says = t(
    'O grupo deixou a sala no meio da luta. A expedição acabou, e metade do ouro achado vai à cidade.',
    'The party left the room mid-fight. The expedition is over, and half the gold found goes to town.',
  );
  const html = () => {
    const d = dialog(
      'result',
      title,
      [
        el('p', {}, says),
        goldNote(gold, kept),
        el(
          'div',
          { class: 'menu-actions' },
          button('primary', toldTown, () => {
            d.close();
            toTown();
          }),
        ),
      ],
      { onBack: toTown },
    );
    d.overlay.querySelector<HTMLButtonElement>('.primary')!.focus();
    return d;
  };
  noteWindow(
    { title, text: [says], figure: [gold, String(kept)], buttons: [{ label: toldTown, run: toTown }], onBack: toTown },
    html,
  );
}

// The crawl room the address asked for could not be built (game/boot.ts crawlRoom): said in town, where the page went
// (a native alert on the battle's page until Nov 18). The address goes back to the plain town, so a reload does not
// say it again
export function noRoomScreen(then: () => void) {
  history.replaceState(null, '', '?home');
  const says = t(
    'Não deu para abrir esta sala. Você voltou para a cidade.',
    'This room wouldn’t open. You are back in town.',
  );
  noteWindow({
    title: t('A sala não abriu', 'The room did not open'),
    text: [says],
    buttons: [{ label: t('Voltar à cidade', 'Back to town'), run: then }],
    onBack: then,
  });
}
