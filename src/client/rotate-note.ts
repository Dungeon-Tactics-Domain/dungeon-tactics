// The turn-the-phone notice (Fernando, Nov 18: a phone plays on its side only, a tablet both ways): one for the whole
// game, over every screen. style.css shows it only on a touch phone held upright (.rotate-note).
import { t } from './i18n.ts';
import { el } from './icons.ts';

// a phone lying on its side, in the text's colour: what to do, where ⟳ only said "turn" (Nov 18 review). Drawn here,
// since no font has a sideways phone, and as tall as the glyph was (1em of .rotate-glyph)
const SIDEWAYS_PHONE =
  '<svg viewBox="0 0 24 16" width="1.5em" height="1em" fill="none" stroke="currentColor" stroke-width="1.6">' +
  '<rect x="1" y="2" width="22" height="12" rx="2.5"/><path d="M4.5 6v4"/>' +
  '<circle cx="19.5" cy="8" r="0.9" fill="currentColor"/></svg>';

export function rotateNote(host: HTMLElement = document.body) {
  const glyph = el('span', { class: 'rotate-glyph', 'aria-hidden': 'true' });
  glyph.innerHTML = SIDEWAYS_PHONE;
  host.append(
    el(
      'div',
      { class: 'rotate-note', role: 'status' },
      el(
        'div',
        { class: 'panel rotate-card' },
        glyph,
        el('p', {}, t('Gire o celular para jogar.', 'Turn your phone sideways to play.')),
      ),
    ),
  );
}
