// Som do jogo (12/11, pedido do Fernando: música e efeitos no jeito do FFT, mas nada do original): música de batalha em
// laço, efeitos curtos e as fanfarras de vitória e derrota, que são notas feitas aqui no WebAudio (sem arquivo).
// Arquivos e licenças (todos CC0) em public/CREDITS.txt. O navegador só deixa tocar depois do 1º clique ou tecla.
import { SONGS, playSong, type SongId } from './music.ts';
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
let music: HTMLAudioElement | null = null;
const buffers = new Map<string, Promise<AudioBuffer | null>>();

// Fase da campanha toca a música sintetizada dela (music.ts) no lugar do arquivo de batalha
let track: SongId | null = null;
let synth: ReturnType<typeof playSong> | null = null;
export function setTrack(id: SongId | null) {
  // trocou de música: a sintetizada anterior para (sem isto, título e batalha tocavam juntos)
  if (id !== track) {
    synth?.stop();
    synth = null;
  }
  track = id;
  applyMusic();
}

const applyMusic = () => {
  if (!ctx) return;
  if (track) {
    music?.pause();
    if (!settings.music) {
      synth?.stop();
      synth = null;
    } else if (synth) synth.setVolume(GAIN[settings.music]);
    else synth = playSong(ctx, SONGS[track], GAIN[settings.music]);
    return;
  }
  if (!music && settings.music) {
    music = new Audio('/music/battle.mp3');
    music.loop = true;
  }
  if (!music) return;
  music.volume = GAIN[settings.music] * 0.6; // a música fica abaixo dos efeitos
  if (settings.music) void music.play().catch(() => undefined);
  else music.pause();
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
