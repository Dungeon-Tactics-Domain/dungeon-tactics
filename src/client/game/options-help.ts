// What Options explains instead of setting, each in a window over it: the tile marks' legend and the controls.
import { dialog } from '../dialog.ts';
import { t } from '../i18n.ts';
import { button, el } from '../icons.ts';
import { keyHelp } from '../keyboard.ts';
import { hoverFocus } from '../option-row.ts';

// A row of the Options list that opens a window over it, which stays open under it; closing it puts the cursor back
// on its row. `describe`: the Options' description box
export function helpRow(label: string, text: string, body: () => Node[], describe: (text: string) => void) {
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
}

export const tileMarks = () => [
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
];

export const controls = () => [
  el(
    'p',
    {},
    t(
      'Mouse: passe por cima para escolher, clique para confirmar, botão direito volta; arraste para mover a câmera e use a roda para o zoom. Controle: direcional ou analógico andam, A (×) confirma, B (○) volta, X (□) abre o Status, Y (△) abre a ficha da habilidade, Back desfaz, ombros giram a câmera, gatilhos dão zoom, analógico direito rola a lista de turnos, Start abre este menu.',
      'Mouse: hover to pick, click to confirm, right click goes back; drag to move the camera and use the wheel to zoom. Gamepad: d-pad or stick moves, A (×) confirms, B (○) goes back, X (□) opens Status, Y (△) opens the ability sheet, Back undoes, shoulders rotate the camera, triggers zoom, right stick scrolls the turn list, Start opens this menu.',
    ),
  ),
  // only what touch-input.ts and the HUD do today (Nov 16, the tablet audit: this section said nothing about touch)
  el(
    'p',
    {},
    t(
      'Toque: toque numa casa para marcar e toque de novo nela para confirmar; arraste com um dedo para mover a câmera e afaste ou aproxime dois dedos para o zoom. O botão Voltar (↩) aparece ao lado do ☰, no alto; girar a câmera, desfazer e ver o mapa inteiro estão no menu ☰.',
      'Touch: tap a tile to mark it and tap it again to confirm; drag with one finger to move the camera and pinch with two to zoom. The Back button (↩) shows beside the ☰ at the top; rotating the camera, undo and the whole map are in the ☰ menu.',
    ),
  ),
  // the short "+N" of the turn list and of the unit sheets (Fernando, Nov 17): two different clocks
  el(
    'p',
    {},
    t(
      'Na lista de turnos e nas fichas, o "+N" depois da Vida é a vida que a unidade recupera a cada turno dela; o "+N" depois do CT é o CT que ela ganha a cada tique.',
      'On the turn list and the unit sheets, the "+N" after HP is the life the unit gets back at each of its turns; the "+N" after CT is the CT it gains each tick.',
    ),
  ),
  el('dl', { class: 'keys' }, ...keyHelp().flatMap(([k, what]) => [el('dt', {}, k), el('dd', {}, what)])),
];
