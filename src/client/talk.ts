// Speech box: portrait, name and the text appearing letter by letter with the speaker's beep. Click, Enter,
// Space or A complete the sentence and, once complete, move to the next; Esc skips the whole conversation. It's a button inside an
// .overlay, so keyboard, mouse and gamepad (battle-input.ts presses the focused button) arrive through the same click.

import faces from '../content/faces.json';
import { UNIT_DEFS } from '../shared/battle/units.ts';
import { hintLine } from './glyphs.ts';
import { LANG, t } from './i18n.ts';
import { button, el } from './icons.ts';
import { liveText } from './key-hints.ts';
import { looks3d } from './looks3d.ts';
import { modelOf } from './markers.ts';
import { reducedMotion } from './motion.ts';
import { portrait } from './portrait.ts';
import { blip } from './sound.ts';
import { store } from './store.ts';

// Text speed (menu, dt:text): Normal ~35 letters per second, the pace of someone reading slowly without tiring fast readers;
// Fast ~3 times that; Instant shows the whole sentence (a common request in tactical RPGs, night of Nov 12)
export const TEXT_KEY = 'dt:text';
export type TextSpeed = 'normal' | 'fast' | 'instant';
const CHAR_MS: Record<TextSpeed, number> = { normal: 28, fast: 10, instant: 0 };
// ms between two letters; 0 shows the whole sentence at once, which Reduce motion asks for whatever the speed
export const charMs = (speed: TextSpeed, still: boolean): number => (still ? 0 : CHAR_MS[speed]);
export const textSpeed = (): TextSpeed => {
  const v = store.get(TEXT_KEY);
  return v === 'fast' || v === 'instant' ? v : 'normal';
};

// Painted face sheets (public/chars/px, described in src/content/faces.json and bundled, so the box never waits on the
// network): one strip of square frames per model, all read from the data so a new sheet needs no code. `expressions`
// (shout, hurt…) is kept for later. An empty mouthFrames list is a still portrait.
export interface Face {
  sheet: string;
  frames: number;
  frameSize: number;
  mouthFrames: number[];
  expressions?: Record<string, number>;
}
const FACES: Record<string, Face> = faces;
const MOUTH_MS = 180; // Fernando's pace for the final sheets: slower than 8 Hz, the mouth reads as speech, not chatter
// frame on screen: neutral unless a talking face is still typing; the mouth opens from the line's first instant
// (talk1, talk2, talk1, neutral for [1, 2]), so even a line that types in under one frame shows it open
export const mouthFrame = (mouth: readonly number[], elapsedMs: number, typing = true): number => {
  if (!typing || !mouth.length) return 0;
  const cycle = [...mouth, ...mouth.slice(0, -1).reverse(), 0];
  return cycle[Math.floor(elapsedMs / MOUTH_MS) % cycle.length];
};
// shown size: the nearest whole ratio of the frame to 128 px (128 as is, the 64 px skeletons at 2x), so an enlarged sheet
// stays crisp with pixelated scaling; 128 fits the dialogue box beside 3 lines of text from 1280x720 up
const FACE_PX = 128;
export const faceSize = (frameSize: number): number =>
  frameSize >= FACE_PX ? frameSize / Math.round(frameSize / FACE_PX) : frameSize * Math.round(FACE_PX / frameSize);
// the speaker's sheet goes by the model drawn on the map (modelOf), so the hero's class and the Acolyte find theirs
export const faceOf = (def: string, from: Record<string, Face> = FACES): Face | undefined => from[modelOf(def)];

// one frame wide box over the whole strip, at faceSize, or at the size the CSS of `cls` gives (the battle HUD's smaller
// faces): the strip fills the box's height and moves by a fraction of its own width. Not decoded yet (a cold first line):
// the KayKit portrait stands in until it is, so the frame is never empty; a failed image leaves portrait() for good
export function faceSheet(def: string, f: Face, cls = '') {
  const size = faceSize(f.frameSize);
  const strip = el('img', {
    class: `face-strip${size > f.frameSize ? ' enlarged' : ''}${UNIT_DEFS[def]?.tint ? ' tinted' : ''}`,
    src: `/chars/${f.sheet}`,
    alt: '',
  }) as HTMLImageElement;
  const box = el('span', { class: `face-sheet${cls ? ` ${cls}` : ''}` }, strip);
  if (!cls) box.style.width = box.style.height = `${size}px`;
  const first = strip.complete ? box : portrait(def);
  if (first !== box) strip.addEventListener('load', () => first.replaceWith(box), { once: true });
  strip.addEventListener('error', () => box.replaceWith(portrait(def)), { once: true });
  return { node: first, show: (n: number) => (strip.style.translate = `${(-n * 100) / f.frames}% 0`) };
}

// who speaks: name (the same in both languages unless `en` says otherwise; empty for the narrator, with no portrait),
// the figure whose face shows, and the speech beep's pitch in Hz, a different one per voice
interface Speaker {
  name: string;
  en?: string;
  def: string;
  pitch: number;
}
export interface Line {
  who: Speaker;
  pt: string;
  en: string;
}

export interface TalkOptions {
  title?: string; // strip above the box (place name)
  dark?: true; // nearly black screen behind (story opening)
}

export function talk(lines: Line[], { title, dark }: TalkOptions = {}): Promise<void> {
  // reduced motion: the face stays still, like the portrait hop, and each sentence shows whole
  const still = reducedMotion();
  const ms = () => charMs(textSpeed(), still);
  // every sheet of the conversation starts loading with it, so later lines find theirs decoded
  for (const sheet of new Set(lines.map((l) => faceOf(l.who.def)?.sheet)))
    if (sheet) new Image().src = `/chars/${sheet}`;
  return new Promise((done) => {
    let i = 0,
      shown = 0,
      timer = 0,
      mouth: ((n: number) => void) | undefined;
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
      // on a touch screen there is no Enter or Esc: the hint says what a finger does (Nov 16, Fernando)
      el(
        'span',
        { class: 'talk-keys' },
        matchMedia('(pointer: coarse)').matches
          ? t('Toque para seguir', 'Tap to continue')
          : liveText('', (s) =>
              hintLine(
                s,
                [
                  ['confirm', t('seguir', 'next')],
                  ['cancel', t('pular', 'skip')],
                ],
                ' · ',
              ),
            ),
      ),
    ) as HTMLButtonElement;
    const overlay = el(
      'div',
      { class: `overlay talk-overlay${dark ? ' dark' : ''}` },
      ...(title ? [el('div', { class: 'panel talk-title' }, title)] : []),
      box,
      // a 44 px button for what Esc does, outside the box (a button cannot hold a button); it ends the whole conversation
      // its name says what it skips: "Pular" alone could be this sentence only
      button('talk-skip', t('Pular', 'Skip'), () => end(), { 'aria-label': t('Pular conversa', 'Skip conversation') }),
    );
    const full = () => (LANG === 'pt' ? lines[i].pt : lines[i].en);
    const typing = () => shown < full().length;
    // the sentence is out (typed, completed by a click, instant, or the box closing): the mouth rests closed
    const finish = () => {
      clearInterval(timer);
      text.removeAttribute('aria-busy');
      box.classList.add('done');
      mouth?.(0);
    };
    const end = () => {
      finish();
      removeEventListener('keydown', onEsc, true);
      overlay.remove();
      done();
    };
    const show = () => {
      const who = lines[i].who;
      // speaker changed: the portrait does a little hop (restarts the CSS animation)
      if (i === 0 || lines[i - 1].who !== lines[i].who) {
        face.classList.remove('pop');
        void face.offsetWidth;
        face.classList.add('pop');
      }
      const sheet = faceOf(who.def);
      const drawn = sheet && faceSheet(who.def, sheet);
      face.replaceChildren(drawn ? drawn.node : portrait(who.def));
      const talking = still ? [] : (sheet?.mouthFrames ?? []);
      // who and which frame, on the face too: the 3D box draws it from there (window3d/talk3d.ts)
      face.dataset.def = who.def;
      face.dataset.frame = '0';
      mouth = (n) => {
        drawn?.show(n);
        face.dataset.frame = String(n);
      };
      const start = performance.now();
      name.textContent = LANG === 'en' && who.en ? who.en : who.name; // proper names are the same in both languages
      name.hidden = face.hidden = !who.name; // narrator: no portrait or name
      shown = 0;
      text.setAttribute('aria-busy', 'true'); // a screen reader hears the sentence once, whole, not each letter typed
      text.textContent = '';
      box.classList.remove('done');
      clearInterval(timer);
      timer = window.setInterval(() => {
        const s = full();
        shown++;
        text.textContent = s.slice(0, shown);
        // every other letter (on fast, 1 in 4): beep without machine-gunning
        if (shown % (textSpeed() === 'fast' ? 4 : 2) === 1 && /\p{L}/u.test(s[shown - 1])) blip(who.pitch);
        if (typing()) mouth?.(mouthFrame(talking, performance.now() - start));
        else finish();
      }, ms() || 1);
      mouth?.(mouthFrame(talking, 0)); // open from the first instant, before the first letter's tick
      if (!ms()) {
        // instant: the whole sentence at once, with a single beep to mark who speaks
        shown = full().length;
        text.textContent = full();
        finish();
        blip(who.pitch);
      }
    };
    box.addEventListener('click', () => {
      if (typing()) {
        shown = full().length;
        text.textContent = full();
        finish();
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
    // a click beside the box left the focus on the page, and Enter, Space and A no longer moved the conversation on
    overlay.addEventListener('mousedown', (e) => e.preventDefault());
    document.body.append(overlay);
    looks3d.talk?.(overlay); // the box drawn over it (window3d/talk3d.ts); the box below stays, unseen
    box.focus();
    show();
  });
}
