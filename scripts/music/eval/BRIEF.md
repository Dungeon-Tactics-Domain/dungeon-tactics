# Composition brief (eval, same for every slot)

Write ONE original loop for the game Dungeon Tactics (a tactics RPG in the browser, FFT / Breath of Fire 4 mood) as a
Python script that builds the song with `scripts/music/psx.py` (read it first, it is short) and renders it.

Reference mood: "Truth and Dreams" from Breath of Fire 4 (Yuko Takehara, Capcom): nostalgic, pastoral, wistful folk-fantasy,
a lyrical lead over gentle plucked/arpeggiated support, light ethnic percussion, warm and a little sad but hopeful.
Use it for MOOD AND INSTRUMENTATION ONLY. Do not reproduce or transcribe its melody, bass line or chord order from memory.
The melody, harmony and structure must be your own composition.

Target:

- PS1 feel: a small palette (6 to 8 parts at most), GM programs from the SoundFont, short reverb (the pipeline adds it).
- Length 1:40 to 2:30, tempo 66 to 92 bpm, loops seamlessly (last bar leads back to the first).
- Real structure: an intro or a statement, a theme, a contrasting section, a return with variation; a motif that
  comes back transformed. Voice leading and bass line that make sense. Dynamics through velocity (no flat 90 everywhere),
  human timing is NOT needed (it is a sequenced PS1 track), but vary note lengths and use rests.
- Drums go through `Song.drum` (GM drum notes on channel 9); folk percussion (hand drum, tambourine, shaker via GM
  percussion notes) is welcome, keep it light.

Hard rules:

- Everything in English (code, comments). The script is `scripts/music/eval/slot_<LETTER>.py`; output is
  `D:\Projetos\_musica-tools\eval\slot_<LETTER>.ogg` (+ .mid) rendered with `soundfont="MuseScore_General"`.
- Run your script with `python`; it must finish and write the .ogg. Verify with code (note ranges, bar counts, total
  length equals bars*4*60/bpm, no parallel part clashes) and with ffprobe (duration, not silent: `ffmpeg -i x.ogg -af volumedetect -f null -`).
  You cannot listen: say so, never claim it sounds good.
- Do not commit, do not touch any file outside your slot script and your output, do not edit psx.py (copy a helper into your
  script if you need one).
- Time box: finish in one pass of writing plus at most 3 fix-and-rerun rounds.

Final report (short): what the piece is (key, tempo, form with bar numbers, instruments), the check outputs, open doubts.
