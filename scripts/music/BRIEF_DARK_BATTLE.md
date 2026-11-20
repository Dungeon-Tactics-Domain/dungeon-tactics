# Composition brief: main battle theme, dark (one Fable agent)

Write the MAIN BATTLE THEME of Dungeon Tactics (browser tactics RPG, Final Fantasy Tactics pacing, KayKit characters) plus ONE more intense variation of it, as a Python script that builds the song with `scripts/music/psx.py` (read it first, it is short) and renders it.
Owner's request: take the battle-theme recipe of Final Fantasy Tactics' "Trisection", but darker, with the weight and dread of Darkest Dungeon.

## Decisions already made by Fernando (do not re-open)

- Originality: use Trisection and Darkest Dungeon for STRUCTURE, RECIPE and MOOD only. Melody, bass line and chord order must be your own. Never reproduce or transcribe a tune. Do NOT open `vgmusic_trisection.mid` or `dd_main_theme.mid`; you get numbers only (below). The game's code is public and MIT, assets must be original.
- Tempo 84 to 100 bpm, length about 2:40 (2:20 to 3:00), loops seamlessly (last bar leads back into the first).
- Dark ingredients, ALL four: Phrygian or harmonic-minor colour; low tolling bell and whispered low choir; a constant low pedal for long stretches; silences and dissonance (clusters, a tritone at the climax) used with restraint, the fight lasts 10 to 15 minutes of listening.
- Deliver: the main theme and one more intense variation (same motifs, for a boss or the end of a battle), as two MIDI files, from one reproducible script.
- Soundfont: SGM-V2.01 (`soundfont="SGM"` in `psx.render`), a General MIDI bank, so use GM program numbers. Drums go through `Song.drum` (GM notes on channel 9).

## Reference numbers (read these files, they are measurements, not notes)

- `D:\Projetos\_musica-tools\dark\refs\trisection_stats.txt`: key centre E minor/dorian, 159 bars, density by 8-bar block, instrument list (high strings, low strings, string bass, muted trumpet, horns, horn bass, gong, drums), note-gap statistics. The form alternates blocks where strings carry the theme with blocks where brass and a horn-bass enter and the strings thin out.
- `D:\Projetos\_musica-tools\dark\refs\darkest_dungeon_main_theme_stats.txt`: G minor, 79 bpm, 37 bars, one nylon guitar, notes in a narrow low-mid register; mostly G, Bb, Eb, D.
- Mood words for Darkest Dungeon: oppressive, ritual, low strings and cello tremolo, sparse, a heavy pulse, space between hits.

## What a good result is

- Real structure: a short intro, a theme, a contrasting section, a tension bridge, a return with variation, with a motif that comes back transformed. 6 to 9 parts at most. Voice leading and a bass line that make sense (bass root taken from the chord name, never from the first note of an inverted voicing). Dynamics through velocity, varied note lengths, rests. A melody that is singable and recognisable, not scale runs.
- Keep the mix clear: no two parts fighting for the same register.

## Mix guardrails (Fernando complained of these in earlier renders: shrill highs, speaker-popping bass, drum pops)

- Drum velocities at most 80, vary them; no flat velocity. Kick and toms never stack on the same beat at full strength.
- Nothing shrill: no lead above C6, no solo flute or piccolo in the top octave, no sustained brass above G5.
- Bass: lowest note E1 (MIDI 28) or higher, and the pedal doubled in the octave above so it is audible on small speakers; no muddy parallel low parts.
- After rendering, check the peak (`ffmpeg -i x.ogg -af volumedetect -f null -`), it must stay under -2 dB; I will normalise loudness afterwards.

## Hard rules

- Everything in English (code, comments). Script: `scripts/music/battle_dark.py`. Outputs: `D:\Projetos\_musica-tools\dark\battle_dark.mid`, `battle_dark.ogg`, `battle_dark_intense.mid`, `battle_dark_intense.ogg` (rendered with `soundfont="SGM"`).
- Verify with code: note ranges per part, bar counts, length equals bars*4*60/bpm, no part sounds outside its range, ffprobe duration, not silent. You cannot listen: say so, never claim it sounds good.
- Do not commit. Do not edit `psx.py`. Do not touch files outside `scripts/music/battle_dark.py`, this brief's output folder `D:\Projetos\_musica-tools\dark\` and nothing else. Do not read the other scripts under `scripts/music/` (the earlier eval slots, `battle.py`, `tfg_remap.py`); only `psx.py`.
- Time box: one pass of writing plus at most 3 fix-and-rerun rounds.

## Final report (short)

What the piece is (key/mode, tempo, form with bar numbers, instruments), how the variation differs, the check outputs (ranges, length, peak), open doubts, and where the dark ingredients sit (bar numbers).
