// Músicas da campanha (noite de 12/11, pedido do Fernando: "músicas novas"): composições nossas, tocadas por um
// sequenciador de 2 vozes no WebAudio (melodia em onda quadrada, baixo em triangular), sem arquivo. Cada token é uma
// colcheia: nota ("C4", "F#3", "Bb1") ou "-" (pausa). O agendador olha 0,2 s à frente para o tempo não tremer.
export interface Song {
  bpm: number;
  lead: string;
  bass: string;
}

export const SONGS = {
  // Estrada: dó maior, andando, a viagem começa
  road: {
    bpm: 120,
    lead: 'E4 G4 A4 G4 E4 D4 C4 D4  E4 G4 A4 C5 B4 A4 G4 -  A4 G4 E4 D4 C4 D4 E4 G4  A4 - G4 E4 D4 - C4 -',
    bass: 'C3 - G2 - C3 - G2 -  A2 - E2 - A2 - E2 -  F2 - C3 - F2 - C3 -  G2 - D3 - G2 - G2 -',
  },
  // Cripta: lá menor, devagar, com a sensível (G#) puxando de volta para o lá
  crypt: {
    bpm: 84,
    lead: 'A4 - C5 - B4 - E4 -  A4 - C5 - D5 - B4 -  C5 - B4 - A4 - G#4 -  A4 - - - E4 - - -',
    bass: 'A2 - - - E2 - - -  F2 - - - E2 - - -  D2 - - - E2 - - -  A2 - - - A2 - - -',
  },
  // Chefe: ré menor, rápido, baixo em oitavas
  boss: {
    bpm: 144,
    lead: 'D5 D5 C5 D5 F5 E5 D5 C5  A4 A4 G4 A4 C5 A4 G4 F4  D5 D5 C5 D5 F5 G5 A5 G5  F5 E5 D5 C#5 D5 - D5 -',
    bass: 'D2 D3 D2 D3 D2 D3 D2 D3  F2 F3 F2 F3 F2 F3 F2 F3  Bb1 Bb2 Bb1 Bb2 Bb1 Bb2 Bb1 Bb2  A1 A2 A1 A2 A1 A2 A1 A2',
  },
} satisfies Record<string, Song>;
export type SongId = keyof typeof SONGS;

const SEMI: Record<string, number> = { C: -9, D: -7, E: -5, F: -4, G: -2, A: 0, B: 2 };
// "A4" = 440 Hz; sustenido e bemol sobem e descem meio tom. Pausa ou nota inválida = null
export function freq(note: string): number | null {
  const m = /^([A-G])([#b]?)(-?\d)$/.exec(note);
  if (!m) return null;
  const semis = SEMI[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0) + (Number(m[3]) - 4) * 12;
  return 440 * 2 ** (semis / 12);
}

export const tokens = (voice: string) => voice.trim().split(/\s+/);

// Toca em laço até stop(). volume 0–1 (o nível de música das opções)
export function playSong(ctx: AudioContext, song: Song, volume: number) {
  const out = ctx.createGain();
  out.gain.value = volume * 0.12; // onda quadrada é alta: bem abaixo dos efeitos
  out.connect(ctx.destination);
  const voices = [{ notes: tokens(song.lead), type: 'square' as OscillatorType, gain: 0.6 }, { notes: tokens(song.bass), type: 'triangle' as OscillatorType, gain: 1 }];
  const step = 60 / song.bpm / 2; // colcheia
  let i = 0;
  let at = ctx.currentTime + 0.05;
  const tick = () => {
    while (at < ctx.currentTime + 0.2) {
      for (const v of voices) {
        const f = freq(v.notes[i % v.notes.length]);
        if (!f) continue;
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = v.type;
        osc.frequency.value = f;
        g.gain.setValueAtTime(v.gain, at);
        g.gain.exponentialRampToValueAtTime(0.001, at + step * 0.95);
        osc.connect(g).connect(out);
        osc.start(at);
        osc.stop(at + step);
      }
      i++;
      at += step;
    }
  };
  tick();
  const timer = setInterval(tick, 50);
  return {
    setVolume: (v: number) => (out.gain.value = v * 0.12),
    stop: () => {
      clearInterval(timer);
      out.disconnect();
    },
  };
}
