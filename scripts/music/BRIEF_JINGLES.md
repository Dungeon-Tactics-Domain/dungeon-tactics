# Composition brief: three jingles (one Opus agent per version)

Write THREE short one-shot jingles for Dungeon Tactics (browser tactics RPG, Final Fantasy Tactics pacing, KayKit characters, PS1 sound) as ONE Python script that builds them with `scripts/music/psx.py` (read it first, it is short) and renders them. Read `scripts/music/battle_dark.py` too: it is the game's main battle theme (D Phrygian, SGM-V2.01, strings, contrabass, horns, choir, bell, timpani) and your jingles must sound like the same world.

## The three jingles (they play once, no loop)

1. `vitoria` (room won): the party survives a hard fight in a dungeon. 6 to 9 s. Relief and quiet pride, not a fanfare: the day is not won, only this room. Major or Dorian colour is allowed here as the one lit moment.
2. `derrota` (party fell): the party is carried back wounded (no permanent death in this game). 7 to 11 s. Heavy, tired, sorrowful, ends unresolved or on a low chord; no mockery, no horror stinger.
3. `chefe` (dungeon boss down, the expedition ends in triumph): 10 to 15 s. The biggest of the three: brass and timpani, the motif of the main battle theme (D-A-D-Eb-D, see `battle_dark.py`) answered and finally resolved to a major or an open fifth. The dread lifts.

## Decisions already made by Fernando (do not re-open)

- Originality: melody and harmony are your own. Never reproduce a known fanfare (no Final Fantasy victory fanfare, no Zelda, no Darkest Dungeon). Do NOT search the web for scores or MIDI.
- Soundfont: SGM-V2.01 (`soundfont="SGM"`), General MIDI program numbers; drums via `Song.drum`.
- Same PS1 chain as the game (low sample rate, few bits, dull top end).

## Technical contract

- `psx.render` makes seamless LOOPS and folds the reverb tail onto the start: do NOT use it as is. Write a small one-shot render in your script: build the `Song`, save the MIDI, run fluidsynth with the same settings as `psx.render` (copy them), keep the natural reverb tail (at most 2.5 s past the last note), apply the PS1 filter, a fade out of the last 0.4 s, and encode `.ogg` (libvorbis q4). Start the audio at the first note (no leading silence beyond 50 ms).
- Loudness: each file at about -16 LUFS integrated (ffmpeg `loudnorm`, measure with `ebur128`) and a true peak under -2 dBFS. Jingles must not jump out of the battle music (-17.8 LUFS) nor disappear under it.
- Mix guardrails (Fernando complained about these before): drum velocities at most 80 and varied; nothing shrill (no lead above C6, no sustained brass above G5); bass lowest note E1 (MIDI 28) or higher, with the octave above doubled; no muddy parallel low parts; contrabass volume no higher than 60 in the bank settings (a bass at 70 was found muddy).
- Real musical shape even in 8 s: a clear gesture, voice leading, a bass line that follows the chord, dynamics through velocity, one motif. Singable, not scale runs.

## Delivery

- Output folder: `D:\Projetos\_musica-tools\jingles\<LETTER>\` (your letter is in your task). Files: `vitoria.mid/.ogg`, `derrota.mid/.ogg`, `chefe.mid/.ogg`, plus the script as `jingles_<LETTER>.py` in `scripts/music/` of your worktree (the same path as this brief).
- Do NOT touch the game (`src`, `public`), do NOT commit, do NOT read other letters' folders or scripts (a blind comparison), do NOT open other sessions.
- You cannot listen: verify by measuring (duration, LUFS, true peak, ends decayed to silence, no clipping, note ranges inside the guardrails) and by reading your own note list as a musician would.
- Final message (short): what each jingle does musically (key, motif, form, instruments), the measured numbers per file, and anything you were unsure of. No decision codes.
