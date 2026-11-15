// Campaign speech box: portrait, name and the text appearing letter by letter with the speaker's beep. Click, Enter,
// Space or A complete the sentence and, once complete, move to the next; Esc skips the whole conversation. It's a button inside an
// .overlay, so keyboard, mouse and gamepad (main.ts presses the focused button) arrive through the same click.

import { UNIT_DEFS } from '../shared/battle/units.ts';
import { type Line, SPEAKERS } from './campaign.ts';
import type { Hero } from './hero.ts';
import { portrait } from './hud.ts';
import { LANG, t } from './i18n.ts';
import { el } from './icons.ts';
import { modelOf } from './markers.ts';
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

// Painted face sheets (public/chars/px, faces.json): one strip of square frames per model, all read from the file so a new
// sheet needs no code. While the text types the mouth goes neutral, then mouthFrames up and back (neutral, talk1, talk2,
// talk1 for [1, 2]) and rests on frame 0. An empty list is a still portrait. `expressions` (shout, hurt…) is kept for later.
export interface Face {
  sheet: string;
  frames: number;
  frameSize: number;
  mouthFrames: number[];
  expressions?: Record<string, number>;
}
const MOUTH_MS = 180; // Fernando's pace for the final sheets: slower than 8 Hz, the mouth reads as speech, not chatter
export const mouthFrame = (mouth: readonly number[], elapsedMs: number): number => {
  if (!mouth.length) return 0;
  const cycle = [0, ...mouth, ...mouth.slice(0, -1).reverse()];
  return cycle[Math.floor(elapsedMs / MOUTH_MS) % cycle.length];
};
// shown size: the nearest whole ratio of the frame to 128 px (256 → 128, 64 → 128), so pixelated scaling keeps every pixel
// whole; 128 fits the dialogue box beside 3 lines of text from 1280x720 up
const FACE_PX = 128;
export const faceSize = (frameSize: number): number =>
  frameSize >= FACE_PX ? frameSize / Math.round(frameSize / FACE_PX) : frameSize * Math.round(FACE_PX / frameSize);

// faces.json is a file the browser fetches: rebuilt entry by entry, a bad one is dropped and that speaker keeps portrait()
const int = (v: unknown, max: number): v is number => Number.isInteger(v) && (v as number) > 0 && (v as number) <= max;
export function parseFaces(raw: unknown): Record<string, Face> {
  const out: Record<string, Face> = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const [id, f] of Object.entries(raw as Record<string, Partial<Face>>)) {
    if (!f || typeof f.sheet !== 'string' || !/^px\/[\w-]+\.png$/.test(f.sheet)) continue;
    if (!int(f.frames, 64) || !int(f.frameSize, 512) || !Array.isArray(f.mouthFrames)) continue;
    const frames = f.frames;
    const frame = (n: unknown) => Number.isInteger(n) && (n as number) >= 0 && (n as number) < frames;
    if (!f.mouthFrames.every(frame)) continue;
    const face: Face = { sheet: f.sheet, frames, frameSize: f.frameSize, mouthFrames: [...f.mouthFrames] };
    if (f.expressions && typeof f.expressions === 'object')
      face.expressions = Object.fromEntries(Object.entries(f.expressions).filter(([, n]) => frame(n)));
    out[id] = face;
  }
  return out;
}
// the speaker's sheet goes by the model drawn on the map (modelOf), so the hero's class and the Acolyte find theirs
export const faceOf = (def: string, faces: Record<string, Face>): Face | undefined => faces[modelOf(def)];

let facesFile: Promise<Record<string, Face>> | undefined;
// fetched once; any failure means no sheets (every speaker keeps portrait())
const loadFaces = () =>
  (facesFile ??= fetch('/chars/px/faces.json')
    .then((r) => (r.ok ? r.json() : null))
    .then(parseFaces)
    .catch(() => ({})));
// fetched while the map builds: talk() opens its box without a wait, before a key can reach the battle behind it
if (typeof document !== 'undefined') void loadFaces();

// one frame wide box over the whole strip, at faceSize; a failed image swaps itself for portrait()
function faceSheet(def: string, f: Face) {
  const size = faceSize(f.frameSize);
  const strip = el('img', {
    class: `face-strip${UNIT_DEFS[def]?.tint ? ' tinted' : ''}`,
    src: `/chars/${f.sheet}`,
    alt: '',
  }) as HTMLImageElement;
  const box = el('span', { class: 'face-sheet' }, strip);
  box.style.width = box.style.height = `${size}px`;
  strip.style.width = `${f.frames * size}px`;
  strip.addEventListener('error', () => box.replaceWith(portrait(def)), { once: true });
  return { box, show: (n: number) => (strip.style.translate = `${-n * size}px 0`) };
}

export interface TalkOptions {
  title?: string; // strip above the box (stage or place name)
  hero?: Hero | null; // the protagonist: name and portrait of the 'hero' lines (without a hero, "You" with the Warrior)
  dark?: true; // nearly black screen behind (story opening)
}

export async function talk(lines: Line[], { title, hero, dark }: TalkOptions = {}): Promise<void> {
  const faces = await loadFaces();
  // reduced motion: the face stays still, like the portrait hop
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
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
    // the sentence is out (typed, completed by a click, instant, or the box closing): the mouth rests closed
    const finish = () => {
      clearInterval(timer);
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
      const base = SPEAKERS[lines[i].who];
      const who = lines[i].who === 'hero' && hero ? { ...base, name: hero.name, en: hero.name, def: hero.cls } : base;
      // speaker changed: the portrait does a little hop (restarts the CSS animation)
      if (i === 0 || lines[i - 1].who !== lines[i].who) {
        face.classList.remove('pop');
        void face.offsetWidth;
        face.classList.add('pop');
      }
      const sheet = faceOf(who.def, faces);
      const drawn = sheet && faceSheet(who.def, sheet);
      face.replaceChildren(drawn ? drawn.box : portrait(who.def));
      const talking = still ? [] : (sheet?.mouthFrames ?? []);
      mouth = drawn?.show;
      const start = performance.now();
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
        if (typing()) mouth?.(mouthFrame(talking, performance.now() - start));
        else finish();
      }, CHAR_MS[textSpeed()] || 1);
      if (!CHAR_MS[textSpeed()]) {
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
    document.body.append(overlay);
    box.focus();
    show();
  });
}
