# Composition brief: three jingles, dark lo-fi in the Breath of Fire IV direction (one Opus agent per version)

Write THREE short one-shot jingles for Dungeon Tactics (browser tactics RPG, KayKit characters, PS1 sound) as ONE Python script that builds them with `scripts/music/psx.py` (read it first, it is short) and renders them. Read `scripts/music/eval/slot_D.py` (the town's pastoral theme, MuseScore General) to hear the warm, small-ensemble side of the game in code.

## The vibe (Fernando, 15/11: "dark lo-fi, towards Breath of Fire 4, NOT towards Final Fantasy Tactics")

- Dark lo-fi: small, intimate, worn. Rainy-evening melancholy, not dread, not epic. Sparse writing with air between notes, a slow pulse or none, soft dynamics, an old-cassette warmth (the PS1 low-bit filter does it; do not add noise).
- Breath of Fire IV side: plucked and breathed sounds (acoustic or nylon guitar, harp, soft piano, music box or celesta, ocarina, flute or recorder in the low-mid register, pan flute, cello, a warm pad), light hand percussion (shaker, soft frame drum, tambourine, finger-cymbal), a folk, slightly Eastern-tinged modal colour (Dorian, Aeolian, pentatonic minor with a lowered second only as a passing colour). Tender and a little sad even when it wins.
- Stay away from: orchestral brass fanfares, timpani rolls, big choir, taiko, heroic horns, the Final Fantasy Tactics sound (strings and brass fighting in a march), Darkest Dungeon dread, the motif D-A-D-Eb-D of the main battle theme. Do NOT open or imitate `battle_dark.py`.

## The three jingles (they play once, no loop)

1. `vitoria` (room won): the party survives a hard fight in a dungeon. 6 to 9 s. Relief and quiet pride: the day is not won, only this room. One small lit turn (a Dorian or major colour) in a minor world.
2. `derrota` (party fell): the party is carried back wounded (no permanent death in this game). 7 to 11 s. Tired, tender, sorrowful, ends unresolved; no mockery, no horror stinger.
3. `chefe` (dungeon boss down, the expedition ends well): 10 to 15 s. The biggest of the three but still small-ensemble: a warm swell, the melody finally resolving; the weight lifts like rain stopping. No fanfare, no timpani roll.

## Decisions already made by Fernando (do not re-open)

- Originality: melody and harmony are your own. Never reproduce a known tune (no Breath of Fire, no Final Fantasy, no Zelda). Do NOT search the web for scores or MIDI.
- Soundfont: MuseScore General (`soundfont="MuseScore_General"`, MIT), General MIDI program numbers; drums and percussion via `Song.drum`.
- Same PS1 chain as the game (low sample rate, few bits, dull top end).

## Technical contract

- `psx.render` makes seamless LOOPS and folds the reverb tail onto the start: do NOT use it as is. Write a small one-shot render in your script: build the `Song`, save the MIDI, run fluidsynth with the same settings as `psx.render` (copy them), keep the natural reverb tail (at most 2.5 s past the last note), apply the PS1 filter, a fade out of the last 0.4 s, and encode `.ogg` (libvorbis q4). Start the audio at the first note (no leading silence beyond 50 ms).
- Loudness: each file at about -16 LUFS integrated (ffmpeg `loudnorm`, measure with `ebur128`) and a true peak under -2 dBFS. Jingles must not jump out of the battle music (-17.8 LUFS) nor disappear under it.
- Mix guardrails (Fernando complained about these before): percussion velocities at most 80 and varied; nothing shrill (no lead above C6, no flute or piccolo in the top octave); bass lowest note E1 (MIDI 28) or higher and audible on small speakers; no muddy parallel low parts; any contrabass or cello bass at volume 60 or lower in the bank settings (a bass at 70 was found muddy).
- Real musical shape even in 8 s: a clear gesture, voice leading, a bass line that follows the chord, dynamics through velocity, one motif. Singable, not scale runs.

## Delivery

- Output folder: `D:\Projetos\_musica-tools\jingles\<LETTER>\` (your letter is in your task). Files: `vitoria.mid/.ogg`, `derrota.mid/.ogg`, `chefe.mid/.ogg`, plus the script as `jingles_<LETTER>.py` in `scripts/music/` of your worktree (the same path as this brief).
- Do NOT touch the game (`src`, `public`), do NOT commit, do NOT read other letters' folders or scripts (a blind comparison), do NOT open other sessions.
- You cannot listen: verify by measuring (duration, LUFS, true peak, ends decayed to silence, no clipping, note ranges inside the guardrails) and by reading your own note list as a musician would.
- Final message (short): what each jingle does musically (key, motif, form, instruments), the measured numbers per file, and anything you were unsure of. No decision codes.
