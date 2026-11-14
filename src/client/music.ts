// Game music (Nov 13, Fernando's request: "grab a pack of free music for this kind of RPG and use it instead
// of the ones you made"): .ogg files of CC0 tracks from OpenGameArt in public/music/, looping. Authors, links and license
// in public/CREDITS.txt and docs/ASSETS.md. sound.ts plays them; here only the file and each track's gain live.
//
// Gain per track (measured Nov 13 with ffmpeg's volumedetect, average of each file): the new tracks have very
// different volumes (title -12.9 dB, road -15.6, map -17.0, snow and boss -17.8, crypt -18.7). The target is that of the
// standalone battle music, -17.3 dB, which was already at the right level; the HTMLAudioElement can't exceed 1, so whatever was louder
// goes down (title -4.4 dB, road -1.7 dB) and whatever was quieter stays at 1 (crypt stays 1.4 dB below, snow and boss 0.6).
// The map file already has +2.2 dB baked in at conversion (limiter at 0.95) to reach the target without exceeding 1.
export const TRACKS = {
  title: { file: 'title.ogg', gain: 0.6 },
  world: { file: 'map.ogg', gain: 0.97 },
  road: { file: 'road.ogg', gain: 0.82 },
  crypt: { file: 'crypt.ogg', gain: 1 },
  snow: { file: 'snow.ogg', gain: 1 },
  boss: { file: 'boss.ogg', gain: 1 },
  // standalone battle (no campaign stage): the same file as before
  battle: { file: 'battle.mp3', gain: 1 },
} satisfies Record<string, { file: string; gain: number }>;
export type SongId = keyof typeof TRACKS;
export const trackUrl = (id: SongId) => `/music/${TRACKS[id].file}`;
