// The turn-the-phone notice (Fernando, Nov 18: a phone plays on its side only, a tablet both ways): one for the whole
// game, over every screen. It must speak before WebGL exists (the cover, a page with no WebGL), so its HTML stays as
// the plain warning of no3d.ts does: one line on a dark plate, shown by style.css only on a touch phone held upright
// (ROTATE, the same query). Once a 3D layer draws it (ui3d/rotate3d.ts), the HTML goes unseen under the drawing,
// still the screen reader's and still blocking the game below.
import { t } from './i18n.ts';
import { el } from './icons.ts';

// the same query as style.css .rotate-note (tests/rotate-note.test.ts holds them together)
export const ROTATE = '(pointer: coarse) and (max-width: 600px) and (orientation: portrait)';
export const ROTATE_TEXT = () => t('Gire o celular para jogar.', 'Turn your phone sideways to play.');

// A phone lying on its side, in the text's colour: what to do, where ⟳ only said "turn" (Nov 18 review). Drawn here,
// since neither a font nor the icon sprite has a sideways phone; as tall as a line of the text
function sidewaysPhone(): SVGSVGElement {
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  const set = (e: Element, attrs: Record<string, string>) => {
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
    return e;
  };
  set(svg, { viewBox: '0 0 24 16', width: '1.5em', height: '1em', fill: 'none', stroke: 'currentColor' });
  svg.setAttribute('stroke-width', '1.6');
  svg.setAttribute('aria-hidden', 'true');
  svg.append(
    set(document.createElementNS(NS, 'rect'), { x: '1', y: '2', width: '22', height: '12', rx: '2.5' }), // the body
    set(document.createElementNS(NS, 'path'), { d: 'M4.5 6v4' }), // the speaker
    set(document.createElementNS(NS, 'circle'), { cx: '19.5', cy: '8', r: '0.9', fill: 'currentColor' }), // the button
  );
  return svg;
}

let note: HTMLElement | undefined;
const drawers = new Set<object>(); // the 3D layers drawing the notice now

export function rotateNote(host: HTMLElement = document.body) {
  note = el(
    'div',
    { class: 'rotate-note', role: 'status' },
    el('p', { class: 'rotate-card' }, sidewaysPhone(), ROTATE_TEXT()),
  );
  host.append(note);
}

// a 3D layer draws the notice (`on`) or stopped: the HTML one shows only while none does
export function drawnIn3d(by: object, on: boolean) {
  if (on) drawers.add(by);
  else drawers.delete(by);
  note?.style.setProperty('opacity', drawers.size ? '0' : '');
}
