# Music (PS1 feel) - lab state

Brought on Nov 20 from the music worktree's `_notas/musica-psx.md` (outside git there), with the generator scripts it names, so nothing is lost when that worktree goes to quarantine. Kept as written; the newest notes are at the bottom.

Updated 2026-11-14. Artifact with the players and the eval: https://claude.ai/artifact/7WUxYrvoAnYKukBHubnNjo (private).

## Decisions (grill with Fernando)
- Method: MIDI built in code + SoundFont (fluidsynth) + PS1 lo-fi pass (22 kHz, 11 bit, short reverb). Same chain PS1 games used: SEQ (a converted MIDI) + VAB (small ADPCM sample bank) + SPU hardware reverb (psx-spx, VGMTrans docs). No BoF4-specific documentation found.
- Banks to compare: MuseScore General (MIT, Fluid R3 lineage; copyright notices must be kept) and GeneralUser GS (own permissive licence; author does not guarantee every sample's origin). Both outside the repo.
- First test track: "inspired by Truth and Dreams" (mood only, original notes). Fernando asked for an eval: 6 subagents, same brief, rendered blind (slots A-F).
- Existing music in the game stays until a track is approved: 7 CC0 OpenGameArt tracks in `public/music/`, victory and defeat jingles generated in `sound.ts`.

## Pipeline
- `scripts/music/psx.py` (Song, render), `scripts/music/test_pipeline.py` (smoke check, passes on both banks), `scripts/music/eval/` (BRIEF.md, slot_A..F.py).
- Tools in `D:\Projetos\_musica-tools`: fluidsynth 2.6.2 (official release), `MuseScore_General.sf2` sha256 ee51d2c4b1525e70f19a45909c4fd7a2e26d91d115fa89dbf5a6bc413d8b9bf3, `GeneralUser-GS.sf2` sha256 9575028c7a1f589f5770fccc8cff2734566af40cd26ed836944e9a5152688cfe. Renders in `eval/`.

## Eval results (measured with ffprobe and volumedetect)
| Slot | Duration | Mean | Peak | Size |
|---|---|---|---|---|
| A | 120.0 s | -17.5 dB | -0.7 | 1.5 MB |
| B | 126.3 s | -16.8 dB | -0.9 | 1.6 MB |
| C | 126.3 s | -16.7 dB | -0.7 | 1.6 MB |
| D | 126.3 s | -17.2 dB | -0.8 | 1.6 MB |
| E | 126.3 s | -17.3 dB | -0.8 | 1.8 MB |
| F | 132.0 s | -17.4 dB | -1.2 | 1.7 MB |
Nobody listened (agents and I cannot); the agents' own checks (length, ranges, clashes, parallels) reported zero violations, each with its own definition of "clash". Originality was not compared with the reference tune.

## Slot key (do not show Fernando before he ranks)
A Fable 5.2 high, B Sonnet 5.5 medium, C Sonnet 5.5 high, D Opus 5.5 xhigh, E Opus 5.5 high, F Haiku 5.5 low.
Self-reported: A D major 80 bpm 40 bars; B E minor 76 bpm 40 bars; C D minor 76 bpm 40 bars; D E minor 76 bpm 40 bars; E D major 76 bpm 40 bars; F E minor 80 bpm 44 bars. Doubts: B shrill flute+oboe; C muddy low bass; D and E quiet 8-bar stretch at the loop seam; F return repeats theme note for note.

## Critique (2026-11-14, score-based; nobody listened)
Files in `D:\Projetos\_musica-tools\eval\analysis\`: `critica_opus.md` (Opus 5.5 high), `critica_fable.md` (Fable 5.2 high, independent and blind), `medicoes.md` (Sonnet 5.5 medium, `scripts/music/eval/measure.py`). Also in the artifact, in a collapsed section.
- Ranking Opus: D 44, A 43, E 37, C 34, B 29, F 17. Fable: D 47, A 46, C 39, E 36, B 31, F 22. Both agree on D and A on top (a tie on paper), B fifth, F last.
- Biggest fix per slot: D keep a light pulse at bars 39-40/1-2 and rewrite flute bars 13-18; A different bass under one theme statement (Opus: progression follows Pachelbel's Canon for ~21 bars) and rewrite the oboe counter-line; C move the harp out of the lead octave; E keep strings below the melody (G3-A4); B rewrite theme head bars 5-7; F fix the G-chord bass, varied return, shorter intro.
- Shared script bug (B, C, F; confirmed by me in slot_F.py): bass root is taken from the first note of an inverted chord voicing (G = [59, 62, 67] gives B and F# under G).
- B bar 5 and F bar 9 share the same theme head (E5 G5 B5 A5): rewrite one before use.
- Signal (measured): levels within 0.8 dB, no click at the wrap; D and F ~30% energy under 150 Hz (mud risk, mean ~21%); B has the worst seam (start 9.9 dB louder than the end); nobody is shrill.

## Next
1. Fernando listens to A-F blind and picks.
2. Reveal the key, compare the two banks on a 20 s excerpt of the winner.
3. Resume the grill: track list (title, world map, exploration, battle, boss, victory, defeat, town), loop length, format and size (ogg).
4. Wire approved tracks in `music.ts` only, with a line in `public/CREDITS.txt` and an entry in `docs/ASSETS.md` in the same commit (MuseScore General MIT notice included).

## Eval 2: battle theme (2026-11-14)
Fernando liked the style of eval 1 and asked for a battle theme (replaces the boring `public/music/battle.mp3`), same blind eval.
Brief: `scripts/music/eval/BRIEF_BATTLE.md`; scripts `scripts/music/eval/battle/slot_X.py`; renders `D:\Projetos\_musica-tools\eval\battle\`.
Key (hidden from Fernando until he ranks): A Opus 5.5 high, B Haiku 5.5 low, C Fable 5.2 high, D Sonnet 5.5 medium, E Opus 5.5 xhigh, F Sonnet 5.5 high.
My own draft (not in the eval): `scripts/music/battle.py` ("Iron Dusk", D minor 132 bpm), not rendered yet.

## Tactical Fantasy Guy (PSX) soundfont (2026-11-14)
Bought by Fernando on Ko-fi (SoundFontGuy, pay-what-you-want, "inspired by FFT"). Files in `D:\Projetos\_musica-tools\tactical-fantasy-guy\` (never in the repo): `Tactical Fantasy Guy PSX.sf2` (4.0 MB, sha256 6c7975d27b675a826945b0173b2b4b7fbec1b5a4ec842276c9c4c33692ebfda8), the original .rar (Kontakt, WAV samples, Sforzando, SoundFont, EULA).
- Licence (TFG EULA, read 2026-11-14): samples may be used and modified in any creative work, games included, royalty-free; distributing them inside a project that uses them is allowed; reselling or reuploading the original samples unmodified is forbidden; credit is appreciated ("[Sample Name] by SoundFontGuy"), not required. So the rendered .ogg files can ship; the .sf2 and the samples cannot go in the repo.
- Presets are NOT General MIDI (bank 0, programs 0-26): 0 Celesta, 1 Glockenspiel, 2 Marimba, 3 High Violins, 4 Violas, 5 Celli, 6 String Ensemble 1, 7 String Pizz, 8 Harp, 9 Timpani, 10 String Ens2, 11 Slow Strings, 12 Choir Ah, 13 Trumpet, 14 Trombone, 15 Brass, 16 Baritone Sax, 17 Clarinet, 18 Bassoon, 19 Oboe, 20 Flute, 21 Tubular Bell, 22 Snare, 23 Cymbal, 24 Snare 2, 25 French Horn, 26 Piccolo. No bass, no drum kit (snare and cymbal are melodic presets).
- Not done yet: add it to `psx.py` SOUNDFONTS, remap programs, re-render the battle winner (C) with it and compare by ear; credit line in `public/CREDITS.txt` and `docs/ASSETS.md` when a track using it ships.
- 2026-11-14: `scripts/music/tfg_remap.py` re-voices a GM MIDI for this font (celli for the bass, timpani for kick and toms, snare and cymbal presets, no hi-hat). Battle slot C rendered to `D:\Projetos\_musica-tools\battle-tfg\slot_C_tfg.ogg` (94.5 s, mean -18.5 dB, peak -1.0 dB, every part audible when soloed); in the lab page as "C2". Not heard yet.
- 2026-11-14: pastoral D (top score of both critics) re-voiced with the same script: `D:\Projetos\_musica-tools\battle-tfg\pastoral_D_tfg.ogg` (126.3 s, mean -17.9 dB, peak -0.9 dB); guitar became string pizzicato, shakers and tambourine dropped. In the lab page as "PD2". Not heard yet. Fernando chose C2 (TFG) over C for battle.
- 2026-11-14 decision (Fernando): stay with Tactical Fantasy Guy; other soundfonts searched, none free to ship (FFT/FF7 rips are Square samples, GuyGM page gone). All 12 tracks re-voiced ("2" suffix in the lab page). Next: Fernando listens and picks the battle and the pastoral winner, then wire in `music.ts` with CREDITS.txt + ASSETS.md (credit "SoundFontGuy").

## 15/11 · Tema dark (decisão do Fernando)
- Escolheu o **v2** (sem trompete, melodia discreta, 90 e 100 bpm, SGM) sobre o v1. Script: `scripts/music/battle_dark.py`; saídas em `D:\Projetos\_musica-tools\dark\`.
- Páginas no site público: `/musica/tema-dark/dark-principal` e `dark-intenso` (v1 em `dark-v1-*`, sem MIDI).
- Aberto: grave mais forte (28% em 60-120 Hz; contrabaixo vol 70, alternativas 62 ou 56); Fernando ainda vai ouvir. Regra: testes e entregas dos labs sempre pelo site público.
- Mixer ao vivo (spessasynth, página estática `public/content/musica/teste-spessasynth/`) embutido em cada faixa com MIDI.

## 15/11 · Estúdio no lab de música (plataforma dos labs)
- Página de faixa = `Estudio.tsx` (uma linha por instrumento, régua de compassos, visão geral, mudo/solo/volume, Original/Tratada ao vivo) tocando **stems** (um .ogg por canal) de `web/public/content/musica/stems/<nome>/`. Gerados por `scripts/music/stems.py`, com `D:\Projetos\_musica-tools\analise\stems_all.py` (batalha e pastoral, MuseScore e TFG), `stems_trisection.py` (8 sons) e `stems.py` direto (tema dark). Sem estrelas/decisão nas páginas, sem mobile.
- Seletor de som no lugar (batalha/pastoral: MuseScore|TFG; Trisection: 8 sons); menu só com as faixas-base. Links antigos de cada versão seguem abrindo.
- Rebuild do site: `build:watch` só reage a `src/`; depois de mexer só em `public/`, dar `touch` num arquivo de `src/content/musica/`.
- Ainda com o mixer sintetizado antigo (spessasynth em `public/content/musica/teste-spessasynth/`): faixas sem stems (nenhuma na música hoje, exceto a gravação original da Trisection e o tema dark v1, que só têm player).

- 15/11 (grave do dark): Fernando ouviu o grave embolado; contrabaixo 70 -> 60 em `battle_dark.py`; 60-120 Hz de 28,1% -> 20,7%. Arquivos antigos em `_musica-tools/dark/_antes_grave/`. Entrega e lab atualizados; falta ele ouvir.
