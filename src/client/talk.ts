// Campaign speech box: portrait, name and the text appearing letter by letter with the speaker's beep. Click, Enter,
// Space or A complete the sentence and, once complete, move to the next; Esc skips the whole conversation. It's a button inside an
// .overlay, so keyboard, mouse and gamepad (main.ts presses the focused button) arrive through the same click.
import { type Line, SPEAKERS } from './campaign.ts';
import type { Hero } from './hero.ts';
import { portrait } from './hud.ts';
import { LANG, t } from './i18n.ts';
import { el } from './icons.ts';
import { blip } from './sound.ts';
import { store } from './store.ts';

// Text speed (menu, dt:text): Normal ~35 letters per second, the pace of someone reading slowly without tiring fast readers;
// Fast ~3 times that; Instant shows the whole sentence (a common request in tactical RPGs, night of Nov 12)
export const TEXT_KEY = 'dt:text';
export type TextSpeed = 'normal' | 'fast' | 'instant';
const CHAR_MS: Record<TextSpeed, number> = { normal: 28, fast: 10, instant: 0 };
export const textSpeed = (): TextSpeed => {
  const v = store.get(TEXT_KEY);
  return v === 'fast' || v === 'instant' ? v : 'normal';
};

export interface TalkOptions {
  title?: string; // strip above the box (stage or place name)
  hero?: Hero | null; // the protagonist: name and portrait of the 'hero' lines (without a hero, "You" with the Warrior)
  dark?: true; // nearly black screen behind (story opening)
}

export function talk(lines: Line[], { title, hero, dark }: TalkOptions = {}): Promise<void> {
  return new Promise((done) => {
    let i = 0,
      shown = 0,
      timer = 0;
    const face = el('div', { class: 'talk-face' });
    const name = el('strong', { class: 'talk-name' });
    const text = el('p', { class: 'talk-text', 'aria-live': 'polite' });
    const box = el(
      'button',
      { type: 'button', class: 'panel talk' },
      face,
      el('div', { class: 'talk-body' }, name, text),
      el('span', { class: 'talk-next', 'aria-hidden': 'true' }, '▼'),
      // discreet hint: whoever didn't know Esc skipped the whole conversation went through line by line
      el('span', { class: 'talk-keys' }, t('Enter segue · Esc pula', 'Enter next · Esc skip')),
    ) as HTMLButtonElement;
    const overlay = el(
      'div',
      { class: `overlay talk-overlay${dark ? ' dark' : ''}` },
      ...(title ? [el('div', { class: 'panel talk-title' }, title)] : []),
      box,
    );
    const full = () => (LANG === 'pt' ? lines[i].pt : lines[i].en);
    const typing = () => shown < full().length;
    const end = () => {
      clearInterval(timer);
      removeEventListener('keydown', onEsc, true);
      overlay.remove();
      done();
    };
    const show = () => {
      const base = SPEAKERS[lines[i].who];
      const who = lines[i].who === 'hero' && hero ? { ...base, name: hero.name, en: hero.name, def: hero.cls } : base;
      // speaker changed: the portrait does a little hop (restarts the CSS animation)
      if (i === 0 || lines[i - 1].who !== lines[i].who) {
        face.classList.remove('pop');
        void face.offsetWidth;
        face.classList.add('pop');
      }
      face.replaceChildren(portrait(who.def));
      name.textContent = LANG === 'en' && 'en' in who ? who.en : who.name; // proper names are the same in both languages
      name.hidden = face.hidden = !who.name; // narrator: no portrait or name
      shown = 0;
      text.textContent = '';
      box.classList.remove('done');
      clearInterval(timer);
      timer = window.setInterval(() => {
        const s = full();
        shown++;
        text.textContent = s.slice(0, shown);
        // every other letter (on fast, 1 in 4): beep without machine-gunning
        if (shown % (textSpeed() === 'fast' ? 4 : 2) === 1 && /\p{L}/u.test(s[shown - 1])) blip(who.pitch);
        if (!typing()) {
          clearInterval(timer);
          box.classList.add('done');
        }
      }, CHAR_MS[textSpeed()] || 1);
      if (!CHAR_MS[textSpeed()]) {
        // instant: the whole sentence at once, with a single beep to mark who speaks
        clearInterval(timer);
        shown = full().length;
        text.textContent = full();
        box.classList.add('done');
        blip(who.pitch);
      }
    };
    box.addEventListener('click', () => {
      if (typing()) {
        shown = full().length;
        text.textContent = full();
        clearInterval(timer);
        box.classList.add('done');
      } else if (++i < lines.length) show();
      else end();
    });
    const onEsc = (e: KeyboardEvent) => {
      // held Enter or Space (the way to speed up the enemy's turn) would repeat the click and skip the lines unread
      if (e.repeat && (e.key === 'Enter' || e.key === ' ')) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      end();
    };
    addEventListener('keydown', onEsc, true);
    document.body.append(overlay);
    box.focus();
    show();
  });
}
