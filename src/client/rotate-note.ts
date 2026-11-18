// The turn-the-phone notice (Fernando, Nov 18: a phone plays on its side only, a tablet both ways): one for the whole
// game, over every screen. style.css shows it only on a touch phone held upright (.rotate-note).
import { t } from './i18n.ts';
import { el } from './icons.ts';

// A phone lying on its side, in the text's colour: what to do, where ⟳ only said "turn" (Nov 18 review). Drawn here,
// since neither a font nor the icon sprite has a sideways phone; as tall as the glyph was (1em of .rotate-glyph)
function sidewaysPhone(): SVGSVGElement {
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  const set = (e: Element, attrs: Record<string, string>) => {
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
    return e;
  };
  set(svg, { viewBox: '0 0 24 16', width: '1.5em', height: '1em', fill: 'none', stroke: 'currentColor' });
  svg.setAttribute('stroke-width', '1.6');
  svg.append(
    set(document.createElementNS(NS, 'rect'), { x: '1', y: '2', width: '22', height: '12', rx: '2.5' }), // the body
    set(document.createElementNS(NS, 'path'), { d: 'M4.5 6v4' }), // the speaker
    set(document.createElementNS(NS, 'circle'), { cx: '19.5', cy: '8', r: '0.9', fill: 'currentColor' }), // the button
  );
  return svg;
}

export function rotateNote(host: HTMLElement = document.body) {
  host.append(
    el(
      'div',
      { class: 'rotate-note', role: 'status' },
      el(
        'div',
        { class: 'panel rotate-card' },
        el('span', { class: 'rotate-glyph', 'aria-hidden': 'true' }, sidewaysPhone()),
        el('p', {}, t('Gire o celular para jogar.', 'Turn your phone sideways to play.')),
      ),
    ),
  );
}
