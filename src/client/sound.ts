// Game sound (Nov 12, Fernando's request: music and effects the FFT way, but nothing from the original): looping
// songs (files, Nov 13), short effects and the victory and defeat fanfares, which are notes made here in WebAudio.
// Files and licenses (all CC0) in public/CREDITS.txt. The browser only lets it play after the 1st click or key.
import { type SongId, TRACKS, trackUrl } from './music.ts';
import { param, store } from './store.ts';

export const SOUND_KEY = 'dt:sound';
// volume in % from 0 to 100, in steps of 5 (Nov 13, Fernando's request: "sound and effects should be a bar in 5% steps")
// Since Nov 21 (Fernando: "split the effects into interface and world, and the dialogue too") four bars: the music, the
// menus' clicks, the world's blows, steps and fanfares, and the dialogue's speech beeps
export interface SoundSettings {
  music: number;
  ui: number;
  world: number;
  voice: number;
}
// music on at 25% and effects at 50% by default (Nov 18, Fernando's request; before, music was off since Nov 17): the
// browser still starts the sound only after the first click or key. A saved volume of someone who set it wins
export const DEFAULT_SOUND: SoundSettings = { music: 25, ui: 50, world: 50, voice: 50 };
// 100% = the old "loud" (0.8): the levels measured in dB in the comments below still hold at maximum
const volume = (p: number) => (p / 100) * 0.8;

// The old save stored 0, 1 or 2 (off, low, loud). 1 and 2 aren't multiples of 5, so they aren't confused with
// a new volume: they become 45% and 100% (gain 0.36 and 0.8; before 0.35 and 0.8)
const LEGACY: Record<number, number> = { 1: 45, 2: 100 };
const pct = (v: unknown, fallback: number) =>
  typeof v !== 'number' ? fallback : (LEGACY[v] ?? (v >= 0 && v <= 100 && v % 5 === 0 ? v : fallback));
export function parseSound(raw: unknown): SoundSettings {
  const r = (raw ?? {}) as Partial<Record<keyof SoundSettings | 'sfx', unknown>>;
  // a save from before the split holds one `sfx` bar: the three effect bars start at it
  const sfx = pct(r.sfx, DEFAULT_SOUND.world);
  return {
    music: pct(r.music, DEFAULT_SOUND.music),
    ui: pct(r.ui, sfx),
    world: pct(r.world, sfx),
    voice: pct(r.voice, sfx),
  };
}

export type Sfx =
  | 'cursor'
  | 'confirm'
  | 'cancel'
  | 'step'
  | 'swing'
  | 'throw'
  | 'hit'
  | 'miss'
  | 'heal'
  | 'charge'
  | 'spell'
  | 'fire'
  | 'die';
// the menus' sounds; every other effect is the world's (Nov 21)
const INTERFACE: ReadonlySet<Sfx> = new Set(['cursor', 'confirm', 'cancel']);
const FILE: Record<Sfx, string> = {
  cursor: 'click',
  confirm: 'confirm',
  cancel: 'cancel',
  step: 'step',
  swing: 'swing',
  throw: 'throw',
  hit: 'hit',
  miss: 'miss',
  heal: 'heal',
  charge: 'charge',
  spell: 'spell',
  fire: 'fireball',
  die: 'die',
};

let settings = parseSound(store.json(SOUND_KEY));
let ctx: AudioContext | null = null;
const buffers = new Map<string, Promise<AudioBuffer | null>>();

// Music from a file (music.ts), one track per moment (title, town, expedition map; in battle, the battle track). Switching
// track does a 0.5 s fade: the old one fades while the new one rises. Volume = options bar × 0.6 (the music stays below
// the effects) × track gain.
let track: SongId | null = null;
export function setTrack(id: SongId | null) {
  track = id;
  applyMusic();
}

interface Voice {
  audio: HTMLAudioElement;
  to: number;
}
const voices = new Map<SongId, Voice>();
let fader: ReturnType<typeof setInterval> | undefined;
// 0.05 every 50 ms: from 0 to the volume 100% ceiling (0.48) in ~0.5 s
const FADE_STEP = 0.05;
const fadeTick = () => {
  let moving = false;
  for (const [id, v] of voices) {
    const d = v.to - v.audio.volume;
    v.audio.volume = Math.abs(d) <= FADE_STEP ? v.to : v.audio.volume + Math.sign(d) * FADE_STEP;
    if (v.audio.volume !== v.to) moving = true;
    else if (!v.to) {
      v.audio.pause();
      voices.delete(id);
    }
  }
  if (!moving) {
    clearInterval(fader);
    fader = undefined;
  }
};

// page opened by automation (Playwright from the test sessions): no music, even with a saved volume (Nov 13, Fernando's
// request: "mute the tabs you open, that music can't keep playing in the background"); `?music=1` turns it on to test sound
const AUTOMATED = typeof navigator !== 'undefined' && navigator.webdriver && param('music') === null;
const applyMusic = () => {
  if (!ctx) return;
  const want = settings.music && !AUTOMATED ? (track ?? 'battle') : null;
  for (const [id, v] of voices) if (id !== want) v.to = 0;
  if (want) {
    let v = voices.get(want);
    if (!v) {
      const audio = new Audio(trackUrl(want));
      audio.loop = true;
      audio.volume = 0;
      v = { audio, to: 0 };
      voices.set(want, v);
      void audio.play().catch(() => undefined);
    }
    v.to = volume(settings.music) * 0.6 * TRACKS[want].gain;
  }
  fader ??= setInterval(fadeTick, 50);
};

// iPadOS Safari lets sound start only at the end of a tap (pointerup, touchend, click), so a context made on pointerdown can
// stay suspended: every gesture wakes it until it runs (Nov 16 tablet audit: the sound may not play on the iPad)
export function wake(c: AudioContext | null, make: () => AudioContext): AudioContext {
  const out = c ?? make();
  // not just 'suspended': iOS also leaves it 'interrupted' after a call or a lock screen
  if (out.state !== 'running' && out.state !== 'closed') void out.resume().catch(() => undefined);
  return out;
}
// player's gestures: the first creates the audio context and starts the music; later ones retry what the browser refused
function unlock() {
  const fresh = !ctx;
  ctx = wake(ctx, () => new AudioContext());
  if (fresh) applyMusic();
  else for (const v of voices.values()) if (v.audio.paused && v.to) void v.audio.play().catch(() => undefined);
}
if (typeof addEventListener !== 'undefined')
  for (const ev of ['pointerdown', 'pointerup', 'touchend', 'click', 'keydown'])
    addEventListener(ev, unlock, { capture: true });
// leaving the tab or app stops the music (Nov 18: on a phone it kept playing behind another app); coming back starts it
// again, and wakes the context the system may have suspended while it was away
if (typeof document !== 'undefined')
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) for (const v of voices.values()) v.audio.pause();
    else if (ctx) unlock();
  });

const load = (name: string) => {
  let p = buffers.get(name);
  if (!p) {
    p = fetch(`/sfx/${name}.mp3`)
      .then((r) => r.arrayBuffer())
      .then((b) => ctx!.decodeAudioData(b))
      .catch(() => null);
    buffers.set(name, p);
  }
  return p;
};

export function sfx(name: Sfx) {
  const level = INTERFACE.has(name) ? settings.ui : settings.world;
  if (!ctx || !level) return;
  const c = ctx;
  void load(FILE[name]).then((buf) => {
    if (!buf) return;
    const src = c.createBufferSource();
    const gain = c.createGain();
    gain.gain.value = volume(level);
    src.buffer = buf;
    src.connect(gain).connect(c.destination);
    src.start();
  });
}

// Short fanfare made of notes (ours, no file): rises in C major on victory, falls in A minor on defeat
export function jingle(win: boolean) {
  if (!ctx || !settings.world) return;
  const notes = win ? [523.25, 659.25, 783.99, 1046.5] : [440, 349.23, 293.66];
  const step = win ? 0.14 : 0.32;
  notes.forEach((f, i) => {
    const osc = ctx!.createOscillator();
    const gain = ctx!.createGain();
    const t0 = ctx!.currentTime + i * step;
    const last = i === notes.length - 1;
    osc.type = win ? 'square' : 'triangle';
    osc.frequency.value = f;
    // 0.4 (was 0.25, measured Nov 13): the fanfare sat at -24 to -27 dB, quieter than a click; now close to the effects
    gain.gain.setValueAtTime(volume(settings.world) * 0.4, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + (last ? 0.9 : step * 0.95));
    osc.connect(gain).connect(ctx!.destination);
    osc.start(t0);
    osc.stop(t0 + (last ? 0.9 : step));
  });
}

// Speech beep (dialogue box, talk.ts): a short soft (triangle, low-passed) note per spoken letter, at the speaker's pitch, varying a little
// so it doesn't sound like an alarm. Synthesized, no file.
export function blip(pitch: number) {
  if (!ctx || !settings.voice) return;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  const t0 = ctx.currentTime;
  // triangle through a low-pass (Nov 16, Fernando: the voices were "shrill and piercing"): the square's upper harmonics were
  // the sting; the triangle is about 5 dB quieter, so the gain is 0.3 to keep the level of Nov 13's 0.2 square
  osc.type = 'triangle';
  osc.frequency.value = pitch * (0.94 + Math.random() * 0.12);
  const soften = ctx.createBiquadFilter();
  soften.type = 'lowpass';
  soften.frequency.value = 1200;
  // 0.2 square (was 0.08, measured Nov 13): the beep sat at -33 dB, below the music (-31 dB), and the voice vanished in
  // conversations; -26 dB, above the music and below the file effects (-14 to -21 dB)
  gain.gain.setValueAtTime(volume(settings.voice) * 0.3, t0);
  gain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.05);
  osc.connect(soften).connect(gain).connect(ctx.destination);
  osc.start(t0);
  osc.stop(t0 + 0.05);
}

export const soundSettings = () => settings;
export function setSound(s: SoundSettings) {
  settings = s;
  store.set(SOUND_KEY, JSON.stringify(s));
  applyMusic();
}
