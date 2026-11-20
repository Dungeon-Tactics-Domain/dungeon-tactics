# Composition brief: a richer "Old Road Lantern" (Pastoral D), one agent per version

Fernando found the current town theme (`scripts/music/eval/slot_D.py`, read it fully first, plus `scripts/music/psx.py`) too thin next to PS1 RPG scores (Breath of Fire 4, Chrono Cross). Write an EXTENDED, richer version as ONE Python script that builds the song with `psx.py` and renders a seamless looping `.ogg`.

## Base (keep its identity)

Start FROM slot_D: same melody family and motif (rising sixth, stepwise fall), E minor, 76 bpm, MuseScore General soundfont, same PS1 chain, instruments' warm pastoral world. The listener must still recognise it as the same town; it is the same piece grown up. Copy slot_D's helpers/voicings and build on them; do not start from a blank file.

## What to add (all four were chosen by Fernando)

1. More layers and counter-melodies: cello/viola countermelody, walking or syncopated bass, a parallel/harmony voice, fuller pad, ornaments (grace notes, turns), a second lead colour (e.g. flute and oboe trading phrases, plus one new colour such as clarinet, recorder, celesta, glockenspiel or pizzicato strings).
2. Richer harmony: modal borrowing, secondary dominants, inversions with a real bass line, at least one short modulation (e.g. B section to G major or A minor and back by a pivot chord), suspensions, a deceptive or Picardy moment.
3. Longer form with new sections: about 72 to 88 bars (2.5 to 3.2 min at 76 bpm, you may vary tempo inside the 70 to 84 range). Keep Intro, A, A'; add at least: a new contrasting bridge, a quiet solo/breakdown moment, a climax, a varied return, and a coda that loops back into bar 1 cleanly.
4. Richer percussion and rhythm: patterns that change per section, offbeats, fills at phrase ends, one or two sections with a different groove feel (e.g. a light 6/8-feel hemiola or a half-time), still gentle (a town, not a battle).

## Contract

- Seamless loop, same as slot_D (use `psx.render`). Quality over length: every added bar must earn its place (variation, not copy-paste of 8 bars).
- Mix guardrails (Fernando complained before): drum velocities at most 80 and varied; nothing shrill (no lead above C6 except a short peak, no sustained note above E6); bass lowest note E1 (MIDI 28) or higher, octave above doubled; no muddy parallel low parts; contrabass volume at most 60; keep the MIDI channels one instrument each (the lab studio splits stems per channel, max 16 channels, channel 10 is drums).
- Real musical shape: voice leading, dynamics through velocity (62+ distinct values is the bar to beat), phrase breathing, singable counter-lines, not scale runs.
- Originality: melodies and harmony are yours. Do NOT search the web for scores or MIDI and do not use third-party MIDI files.

## Delivery

- Output folder: `D:\Projetos\_musica-tools\pastoral_rica\<LETTER>\` (letter in your task): `pastoral_rica.mid`, `pastoral_rica.ogg` (loop), and the script as `scripts/music/pastoral_rica_<LETTER>.py` in your worktree (same folder as this brief).
- Do NOT touch the game (`src`, `public`), do NOT commit, do NOT read the other letter's folder or script (blind comparison), do NOT open other sessions or touch the lab repo.
- Measure with `D:\Projetos\_musica-tools\analise\compara_complexidade.py` (read how it is called) and report next to slot_D's numbers (126.3 s, 41 bars, 7 voices, 6 instruments, 1176 notes, 9.31 notes/s, polyphony 9.29, range 57, 62 velocities, 8 pitch classes). Also check loop seam (end decays into the start), LUFS about -18 (game chain), true peak under -3 dBFS, no clipping.
- You cannot listen: verify by measuring and by reading your own note list as a musician would.
- Final message (short, pt-BR is fine): form with bar numbers per section, key/modulations, instruments per section, the measured numbers vs slot_D, and what you were unsure of. No decision codes.
