// Seats the unseen HTML turn list (hud.ts renderQueue) under the 3D one, from the 3D list's own layout
// (queue-layout.ts): its box, its padding and each row's size, as inline sizes. The HTML list keeps the scroll, the
// hover and what a screen reader hears; no number of the drawing is read back from it. The list's name is drawn here
// too, in 3D over the cards: the HTML title keeps its words (and its key hint), unseen.
import type { Group, Mesh } from 'three';
import { turnsFolded } from '../hud-queue.ts';
import type { Ui3dLayer } from '../ui3d/layer.ts';
import { dropText, textMesh } from '../ui3d/text.ts';
import { INK } from './card.ts';
import { HEAD, type QueueLayout, TAP, tapGrow } from './queue-layout.ts';

let name: Mesh | undefined; // the list's name as drawn: one turn list at a time
// the 3D list went: its name with it (the HTML title is written anew, seen, by the HUD's next redraw)
export const dropName = () => name && dropText(name);

const px = (v: number) => `${v}px`;

// the rows the cards stand for: with the 3D bar the acting row leaves the list (`headless`)
export const shownRows = (queue: HTMLElement) =>
  [...queue.querySelectorAll<HTMLElement>('.queue-row')].filter((r) => r.style.display !== 'none');

export function seatQueue(queue: HTMLElement, l: QueueLayout, headless: boolean, layer: Ui3dLayer, flat: Group) {
  const { seat } = l,
    p = seat.pad;
  Object.assign(queue.style, {
    boxSizing: 'border-box',
    left: px(l.left),
    top: px(l.top),
    bottom: 'auto',
    width: px(seat.width),
    height: px(seat.height),
    gap: px(seat.gap),
    padding: `${px(p.top)} ${px(p.right)} ${px(p.bottom)} ${px(p.left)}`,
  });
  const title = queue.querySelector<HTMLElement>('.queue-title');
  // the list's name: the HTML's words, written in 3D where the layout says; the HTML line goes unseen under them
  // the title folds the list (hud-queue.ts): its box reaches up over the list's top padding and down over the gap so a
  // finger gets TAP px, the rows staying where the layout put them (the negative margins give the room back)
  const up = Math.min(p.top, TAP - HEAD),
    down = TAP - HEAD - up;
  if (title)
    Object.assign(title.style, {
      boxSizing: 'border-box',
      flex: 'none',
      // from the list's left edge, over the order numbers: a folded phone's column alone is about 23 px wide
      width: `calc(100% + ${px(p.left)} - ${px(seat.stats)})`,
      marginLeft: px(-p.left),
      height: px(TAP),
      paddingTop: px(up),
      marginTop: px(-up),
      marginBottom: px(-down),
      cursor: 'pointer',
      zIndex: '1', // over the rows that scroll under it: a tap there folded nothing and opened a unit's card
      pointerEvents: 'auto', // the list itself lets taps through to the map; only its rows and this title take them
      color: 'transparent',
      textShadow: 'none',
    });
  if (name) dropText(name);
  // a mark says which way the title turns the list, not only the list's width
  const says =
    title?.firstChild?.textContent && `${title.firstChild.textContent} ${turnsFolded(layer.phone) ? '▸' : '▾'}`;
  name = says ? textMesh(says, { size: 16, color: INK, font: layer.theme.font }, layer.dpr) : undefined;
  if (name) {
    name.position.set(l.title.x, -l.title.y, 0);
    name.renderOrder = 4; // over the cards, as their lines
    flat.add(name);
  }
  let shown = 0;
  for (const row of queue.querySelectorAll<HTMLElement>('.queue-row')) {
    const head = headless && row.classList.contains('now');
    row.style.display = head ? 'none' : '';
    if (head) continue;
    const z = seat.sizes[shown++] ?? seat.row;
    row.style.width = px(z.w);
    row.style.height = px(z.h);
    // the row reaches over the card's life and CT lines too: a finger dragging there scrolled the map, not the list
    // (Fernando, Nov 18 night); the card still springs to the width above, read from the layout, not from here
    row.style.boxSizing = 'content-box';
    row.style.paddingRight = px(seat.stats);
    // a card under 28 px tall gets a taller box with the same place in the column: padding takes the extra height and an
    // equal negative margin gives it back, so the list's flow and the cards' rows stay as laid out (the gap holds it)
    // a small card's box also takes half the gap each side, so it and its gap give a finger TAP px
    const grow = Math.max(tapGrow(z.h), z.h < TAP ? Math.floor(seat.gap / 2) : 0);
    row.style.paddingTop = row.style.paddingBottom = px(grow);
    row.style.marginTop = row.style.marginBottom = px(-grow);
  }
}

// The 3D list's input, from the HTML list under it: a scroll moves the cards, the mouse over a row lifts its card
export function wireQueue(queue: HTMLElement, list: { place(): void; hover(row: number): void }) {
  queue.addEventListener('scroll', () => list.place());
  queue.addEventListener('pointermove', (e) => {
    const row = e.target instanceof Element ? e.target.closest('.queue-row') : null;
    list.hover(row ? shownRows(queue).indexOf(row as HTMLElement) : -1);
  });
  queue.addEventListener('pointerleave', () => list.hover(-1));
}
