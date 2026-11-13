// Som do jogo (12/11, pedido do Fernando: música e efeitos no jeito do FFT, mas nada do original): músicas em
// laço (arquivos, 13/11), efeitos curtos e as fanfarras de vitória e derrota, que são notas feitas aqui no WebAudio.
// Arquivos e licenças (todos CC0) em public/CREDITS.txt. O navegador só deixa tocar depois do 1º clique ou tecla.
import { TRACKS, trackUrl, type SongId } from './music.ts';
import { store } from './store.ts';

export const SOUND_KEY = 'dt:sound';
export type Level = 0 | 1 | 2; // desligado, baixo, alto
export interface SoundSettings {
  music: Level;
  sfx: Level;
}
// música baixa por padrão para não cobrir os efeitos; em localhost começa desligada (várias abas de teste tocando juntas
// incomodavam, decisão de 20/10 herdada do Warlock)
const LOCAL = typeof location !== 'undefined' && /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
export const DEFAULT_SOUND: SoundSettings = { music: LOCAL ? 0 : 1, sfx: 2 };
const GAIN = [0, 0.35, 0.8];

const isLevel = (v: unknown): v is Level => v === 0 || v === 1 || v === 2;
export function parseSound(raw: unknown): SoundSettings {
  const r = (raw ?? {}) as Partial<SoundSettings>;
  return { music: isLevel(r.music) ? r.music : DEFAULT_SOUND.music, sfx: isLevel(r.sfx) ? r.sfx : DEFAULT_SOUND.sfx };
}

export type Sfx = 'cursor' | 'confirm' | 'cancel' | 'step' | 'swing' | 'throw' | 'hit' | 'miss' | 'heal' | 'charge' | 'spell' | 'fire' | 'die';
const FILE: Record<Sfx, string> = {
  cursor: 'click', confirm: 'confirm', cancel: 'cancel', step: 'step', swing: 'swing', throw: 'throw', hit: 'hit', miss: 'miss',
  heal: 'heal', charge: 'charge', spell: 'spell', fire: 'fireball', die: 'die',
};

let settings = parseSound(store.json(SOUND_KEY));
let ctx: AudioContext | null = null;
const buffers = new Map<string, Promise<AudioBuffer | null>>();

// Música em arquivo (music.ts), uma faixa por momento (título, mapa, fases; sem fase toca a batalha avulsa). Trocar de
// faixa faz fade de 0,5 s: a antiga some enquanto a nova sobe. Volume = nível das opções × 0,6 (a música fica abaixo
// dos efeitos) × ganho da faixa.
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
// 0,05 a cada 50 ms: de 0 ao teto do nível alto (0,48) em ~0,5 s
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

const applyMusic = () => {
  if (!ctx) return;
  const want = settings.music ? (track ?? 'battle') : null;
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
    v.to = GAIN[settings.music] * 0.6 * TRACKS[want].gain;
  }
  fader ??= setInterval(fadeTick, 50);
};

// primeiro gesto do jogador: cria o contexto de áudio e começa a música
function unlock() {
  if (ctx) return;
  ctx = new AudioContext();
  applyMusic();
}
if (typeof addEventListener !== 'undefined') for (const ev of ['pointerdown', 'keydown']) addEventListener(ev, unlock, { once: true, capture: true });

const load = (name: string) => {
  let p = buffers.get(name);
  if (!p) {
    p = fetch(`/sfx/${name}.mp3`).then((r) => r.arrayBuffer()).then((b) => ctx!.decodeAudioData(b)).catch(() => null);
    buffers.set(name, p);
  }
  return p;
};

export function sfx(name: Sfx) {
  if (!ctx || !settings.sfx) return;
  const c = ctx;
  void load(FILE[name]).then((buf) => {
    if (!buf) return;
    const src = c.createBufferSource();
    const gain = c.createGain();
    gain.gain.value = GAIN[settings.sfx];
    src.buffer = buf;
    src.connect(gain).connect(c.destination);
    src.start();
  });
}

// Fanfarra curta feita de notas (nossa, sem arquivo): sobe em dó maior na vitória, desce em lá menor na derrota
export function jingle(win: boolean) {
  if (!ctx || !settings.sfx) return;
  const notes = win ? [523.25, 659.25, 783.99, 1046.5] : [440, 349.23, 293.66];
  const step = win ? 0.14 : 0.32;
  notes.forEach((f, i) => {
    const osc = ctx!.createOscillator();
    const gain = ctx!.createGain();
    const t0 = ctx!.currentTime + i * step;
    const last = i === notes.length - 1;
    osc.type = win ? 'square' : 'triangle';
    osc.frequency.value = f;
    // 0,4 (era 0,25, medido em 13/11): a fanfarra ficava em -24 a -27 dB, mais baixa que um clique; agora perto dos efeitos
    gain.gain.setValueAtTime(GAIN[settings.sfx] * 0.4, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + (last ? 0.9 : step * 0.95));
    osc.connect(gain).connect(ctx!.destination);
    osc.start(t0);
    osc.stop(t0 + (last ? 0.9 : step));
  });
}

// Bipe de fala (campanha): uma nota curta de onda quadrada por letra falada, no tom de quem fala, variando um pouco
// para não soar como alarme. Sintetizado, sem arquivo.
export function blip(pitch: number) {
  if (!ctx || !settings.sfx) return;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  const t0 = ctx.currentTime;
  osc.type = 'square';
  osc.frequency.value = pitch * (0.94 + Math.random() * 0.12);
  // 0,2 (era 0,08, medido em 13/11): o bipe ficava em -33 dB, abaixo da música (-31 dB), e a voz sumia nas conversas;
  // agora -26 dB, acima da música e abaixo dos efeitos de arquivo (-14 a -21 dB)
  gain.gain.setValueAtTime(GAIN[settings.sfx] * 0.2, t0);
  gain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.05);
  osc.connect(gain).connect(ctx.destination);
  osc.start(t0);
  osc.stop(t0 + 0.05);
}

export const soundSettings = () => settings;
export function setSound(s: SoundSettings) {
  settings = s;
  store.set(SOUND_KEY, JSON.stringify(s));
  applyMusic();
}
