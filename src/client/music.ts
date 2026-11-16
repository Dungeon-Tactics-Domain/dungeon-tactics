// Game music (Nov 13, Fernando's request: "grab a pack of free music for this kind of RPG and use it instead
// of the ones you made"): .ogg files of CC0 tracks from OpenGameArt in public/music/, looping. Authors, links and license
// in public/CREDITS.txt and docs/ASSETS.md. sound.ts plays them; here only the file and each track's gain live.
//
// Gain per track (measured Nov 13 with ffmpeg's volumedetect, average of each file): the tracks have very different
// volumes (title -12.9 dB, crypt -18.7). The target is that of the standalone battle music, -17.3 dB, which was already at
// the right level; the HTMLAudioElement can't exceed 1, so whatever was louder goes down (title -4.4 dB) and whatever was
// quieter stays at 1 (crypt stays 1.4 dB below).
export const TRACKS = {
  title: { file: 'title.ogg', gain: 0.6 },
  // the town (Nov 16, Fernando: the richer Pastoral D, version B, from the music lab); -18.1 LUFS against the -17.8 target,
  // so it stays at 1 (an audio element can't go above it)
  world: { file: 'city_pastoral_rica.ogg', gain: 1 },
  crypt: { file: 'crypt.ogg', gain: 1 },
  // battles without their own track (Nov 15, Fernando: the lab's dark main theme); loudnorm already at the old file's -17.8 LUFS
  battle: { file: 'battle_dark.ogg', gain: 1 },
} satisfies Record<string, { file: string; gain: number }>;
export type SongId = keyof typeof TRACKS;
export const trackUrl = (id: SongId) => `/music/${TRACKS[id].file}`;
