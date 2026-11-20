# Composition brief: battle theme (eval 2, same for every slot)

Write ONE original battle loop for the game Dungeon Tactics (a tactics RPG in the browser, FFT / Tactics Ogre mood) as a
Python script that builds the song with `scripts/music/psx.py` (read it first, it is short) and renders it.
It replaces the current standalone battle track, which is boring: it has to push the fight forward and stay listenable
for many loops (a battle lasts 5 to 15 minutes).

Reference mood: the battle themes of Final Fantasy Tactics (Hitoshi Sakimoto) and Breath of Fire 4 fights: driving
but not frantic, minor key, a low string/bass ostinato, brass and strings trading a memorable theme, timpani and
a snare that lifts the sections, a middle section that builds tension, and a return with more weight.
Use it for MOOD AND INSTRUMENTATION ONLY. Do not reproduce or transcribe any melody, bass line or chord order from
memory; the melody, harmony and structure must be your own composition.

Target:

- PS1 feel: a small palette (6 to 9 parts at most), GM programs from the SoundFont, short reverb (the pipeline adds it).
- Length 1:20 to 2:10, tempo 108 to 150 bpm, loops seamlessly (the last bar leads back to the first).
- Real structure: a short intro, a theme, a contrasting section, a tension bridge, a return with variation; a motif that
  comes back transformed. Voice leading and a bass line that make sense. Dynamics through velocity (no flat 90
  everywhere), vary note lengths and use rests. The melody must be singable and recognisable, not scale runs.
- Keep the mix clear: no two parts fighting for the same register, nothing shrill, the bass should not be muddy.
- Drums go through `Song.drum` (GM drum notes on channel 9): kick, snare, toms, hats, crash; timpani as a pitched part.

Hard rules:

- Everything in English (code, comments). The script is `scripts/music/eval/battle/slot_<LETTER>.py`; output is
  `D:\Projetos\_musica-tools\eval\battle\slot_<LETTER>.ogg` (+ .mid) rendered with `soundfont="MuseScore_General"`.
- Run your script with `python`; it must finish and write the .ogg. Verify with code (note ranges, bar counts, total
  length equals bars*4*60/bpm, bass root really sits under each chord: take the root from the chord name, never from the
  first note of an inverted voicing) and with ffprobe (duration, not silent: `ffmpeg -i x.ogg -af volumedetect -f null -`).
  You cannot listen: say so, never claim it sounds good.
- Do not commit, do not touch any file outside your slot script and your output, do not edit psx.py (copy a helper into
  your script if you need one). Do not read other slot scripts, other files in `scripts/music/` besides `psx.py`, or the
  earlier eval; this is blind.
- Time box: finish in one pass of writing plus at most 3 fix-and-rerun rounds.

Final report (short): what the piece is (key, tempo, form with bar numbers, instruments), the check outputs, open doubts.
