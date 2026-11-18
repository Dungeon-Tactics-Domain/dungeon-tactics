// The turn-the-phone notice (Fernando, Nov 18: a phone plays on its side only, a tablet both ways): one for the whole
// game, over every screen. style.css shows it only on a touch phone held upright (.rotate-note).
import { t } from './i18n.ts';
import { el } from './icons.ts';

export function rotateNote(host: HTMLElement = document.body) {
  host.append(
    el(
      'div',
      { class: 'rotate-note', role: 'status' },
      el(
        'div',
        { class: 'panel rotate-card' },
        el('span', { class: 'rotate-glyph', 'aria-hidden': 'true' }, '⟳'),
        el('p', {}, t('Gire o celular para jogar.', 'Turn your phone sideways to play.')),
      ),
    ),
  );
}
