"""Three one-shot jingles for Dungeon Tactics, version C: vitoria (room won), derrota (party fell), chefe (boss down).

Same world as battle_dark.py: SGM-V2.01, strings, contrabass, horns, choir, bell, timpani, and its motif D-A-D-Eb-D in
its own rhythm (1.5, .5, 1, 1, then the long note). Each jingle retells what happens to the motif's Phrygian Eb:
  vitoria  the Eb opens to E and the line keeps climbing to F#, the major third (the one lit moment); it comes home
           through G major darkened to G minor (B-Bb-A in an inner voice): the room is won, the day is not.
  derrota  the Eb becomes a 4-3 sigh over Bb, the bass walks down D-C-Bb-G and stops on A: a half cadence, unresolved.
  chefe    trombones state the motif in D minor, the horns answer it a fifth higher, the trumpets turn its Eb into E-F#
           over iv-V-I in D major, and the trombones close by playing the motif themselves, in major.

Run from the repository root:  python scripts/music/jingles_C.py
Writes vitoria, derrota and chefe (.mid, .ogg) to MUSIC_TOOLS/jingles/C and prints the checks. An assert stops the run
when a guardrail of the brief breaks: ranges, the bass octave, drum velocities, parallel fifths or octaves between the
real voices, length, loudness, true peak, onset or decay.
"""
import json
import math
import os
import random
import re
import subprocess
import wave

import mido
import numpy as np

from battle_dark import PARTS, drumroll, line, pcm, read_notes
from psx import FLUID, SOUNDFONTS, SR, TOOLS, Song

OUT = os.path.join(TOOLS, "jingles", "C")
PS1 = "lowpass=f=8500,aresample=22050,acrusher=bits=11:mode=lin:aa=1,aresample=44100"  # psx.render's PS1 pass
LUFS, PEAK = -16.0, -2.0  # battle music sits at -17.8 LUFS; a true peak under -2 dBFS
# Program, volume, pan. The battle theme's values were measured per SGM patch; trumpet and trombone are new here.
BANK = {name: (program, volume, pan) for name, program, volume, pan, *_ in PARTS}
# From rendering each part of chefe alone. A trumpet carrying the climax level with the horns put three times the
# battle theme's share of energy above 3 kHz there (3.0% against 0.9%): a horn carries the line and the trumpet doubles
# it 6 dB under, for its edge (1.4%). Trombones sit right, as an orchestra seats them: with both brass groups left of
# centre the last chord peaked in one channel.
BANK |= {"horn lead": (60, 104, 60), "trumpet": (56, 76, 72), "trombone": (57, 106, 84)}
BRASS = ("horn lead", "trumpet", "trombone", "horns")
SNARE, CRASH = 38, 49
# Seconds: the last note-off may not come before the low bound, the file (with its tail) may not pass the high one.
SPAN = {"vitoria": (6, 9), "derrota": (7, 11), "chefe": (10, 15)}


def seg(start, text, v0, v1, gate=.92):
    """battle_dark.line() from beat `start` (from 0) instead of from a bar line."""
    return [(beat + start, length, note, vel) for beat, length, note, vel in line(1, text, v0, v1, gate=gate)]


def octave(notes, soft=4):
    """The bass an octave up: small speakers hear the bass through it (the brief: the octave above doubled)."""
    return [(beat, length, note + 12, vel - soft) for beat, length, note, vel in notes]


def song(bpm, parts, kit=()):
    """A psx Song with one channel per part, in the bank's program, volume and pan."""
    end =max(beat + length for notes in parts.values() for beat, length, _, _ in notes)
    s = Song(bpm, bars=math.ceil(end / 4))  # bars only matter to psx.render's loop, which a jingle does not use
    for i, (name, notes) in enumerate(parts.items()):
        program, volume, pan = BANK[name]
        s.add(i + (i >= 9), program, notes, volume, pan)  # channel 9 is the drum kit
    if kit:
        s.drum(list(kit), BANK["drums"][1])
    s.names = list(parts) + ["drums"] * bool(kit)  # track order, for the checks
    return s


def vitoria():
    """D minor turning to D major, 96 bpm, 11 beats. Strings sing the line, two horns hold a hymn under it, one bell
    rings D at the end. Bass D-C-D-G-D: i-bVII-I, then IV-iv-I (the plagal close, softer than a dominant)."""
    melody = seg(0, "D5:1.5 A4:.5 D5:1 E5:1 F#5:1.5 G5:.5", 62, 80) + seg(6, "A5:1 G5:1 F#5:3", 84, 64)
    alto = seg(0, "F4:3 G4:1 F#4:2", 52, 62, gate=.98) + seg(6, "G4:2 A4:3", 64, 54, gate=.98)
    tenor = seg(0, "A3:3 C4:1 A3:2", 50, 58, gate=.98) + seg(6, "B3:1 Bb3:1 A3:3", 60, 50, gate=.98)
    bass = seg(0, "D2:3 C2:1 D2:2 G1:2 D2:3", 66, 58, gate=.98)
    # strokes where the bass lands, the loudest on the lit F#; C3 rather than an A pickup, A would clash with C major
    tim = [(0, 1, 50, 62), (3, .5, 48, 46), (4, 1, 50, 70), (6, 1, 43, 54), (8, 2, 50, 58)]
    bell = [(8, 3, 62, 84), (8, 3, 74, 64)]  # the battle's tolling D, now over D major
    parts = {"strings hi": melody, "horns": alto + tenor, "contrabass": bass, "strings lo": octave(bass),
             "timpani": tim, "bell": bell}
    return song(96, parts), {"melody": melody, "alto": alto, "tenor": tenor, "bass": bass}


def derrota():
    """D minor, 66 bpm, 9.5 beats. The motif in the strings, tired; its Eb leans on a Bb chord as a 4-3 sigh and the
    line sinks step by step to A, over a bass that walks down D-C-Bb-G and rises to A: a half cadence that does not
    resolve. Horns and a whispered choir hold the inner voices, the timpani fades in a roll, a soft bell tolls A."""
    melody = seg(0, "D5:1.5 A4:.5 D5:1 Eb5:1", 62, 76) + seg(4, "D5:1.5 C5:.5 Bb4:1 A4:2.5", 70, 50)
    alto = seg(0, "F4:6 G4:1 E4:2.5", 54, 44, gate=.98)
    tenor = seg(0, "A3:3 Bb3:3 D4:1 C#4:2.5", 52, 44, gate=.98)
    bass = seg(0, "D2:2 C2:1 Bb1:3 G1:1 A1:2.5", 62, 50, gate=.98)
    choir = [(beat, length, note, round(.8 * vel)) for beat, length, note, vel in alto + tenor]  # whispered, as in battle
    tim = [(0, 1, 50, 58), (3, 1, 46, 50), (6, 1, 43, 46), (7, .5, 45, 54)] + drumroll(random.Random(7), 7.5, 9, 45, 40, 20)
    bell = [(7, 2.5, 57, 80), (7, 2.5, 69, 60)]
    parts = {"strings hi": melody, "horns": alto + tenor, "choir": choir, "contrabass": bass, "strings lo": octave(bass),
             "timpani": tim, "bell": bell}
    return song(66, parts), {"melody": melody, "alto": alto, "tenor": tenor, "bass": bass}


def chefe():
    """D minor to D major, 100 bpm, 20 beats, four entries that climb. Trombones state the motif over a D pedal (Eb/D
    lifts in strings and choir, as in battle); horns answer it a fifth up, still Phrygian; a lead horn with a trumpet
    under it takes it from D5 and turns the Eb into E-F# over Dm-Gm/Bb-A7-D; then the lead sings F#-G-F# over D-G/B-A7-D
    while the trombones play the motif in major (D-A-D-E-F#). Timpani drive every entry, snare rolls lead into the two
    arrivals, the bell rings once, in major."""
    rng = random.Random(15)
    call = seg(0, "D3:1.5 A2:.5 D3:1 Eb3:1 D3:3", 84, 94)
    resolved = seg(12, "D3:1.5 A2:.5 D3:1 E3:1 F#3:4", 92, 100)
    horn1 = seg(4, "A4:1.5 E4:.5 A4:1 Bb4:1", 74, 86) + seg(8, "A4:2 G4:2", 84, 88, gate=.98)
    horn1 += seg(12, "F#4:2 B4:1 C#5:1 D5:4", 86, 92, gate=.98)
    horn2 = seg(6, "F4:1 G4:1 F4:2 D4:1 C#4:1", 70, 84, gate=.98) + seg(12, "D4:3 A3:5", 82, 88, gate=.98)
    lead = seg(8, "D5:1.5 A4:.5 D5:1 E5:1", 86, 96) + seg(12, "F#5:2 G5:2 F#5:4", 98, 94, gate=.98)
    bass = seg(0, "D2:3 D2:1 D2:3 D2:1 D2:2 Bb1:1 A1:1 D2:2 B1:1 A1:1 D2:4", 64, 74, gate=.95)
    lift = "A3+D4:3 Bb3+Eb4:1 A3+D4:3 Bb3+Eb4:1"  # the fifth D-A lifts a semitone with the motif's Eb and sinks back
    horns = horn1 + horn2
    # strings and choir double the horns well under them: at full weight the last chord peaked 14 dB over the
    # loudness and loudnorm could not reach -16 LUFS under -3 dBTP with a plain gain
    fill = [(16, 4, 66, 64), (16, 4, 69, 64)]  # F#4 and A4 fill the gap of the last chord between A3 and D5
    strings = [(b, l, p + 12, v) for b, l, p, v in seg(0, lift, 58, 66, gate=.98)]
    strings += [(b, l, p, v - 16) for b, l, p, v in horns if b >= 8] + fill
    choir = seg(0, lift, 42, 52, gate=.98) + [(b, l, p, v - 28) for b, l, p, v in horns if b >= 12] + fill
    # the pickups into beats 4 and 8 stay on D: an A there would rub against the Bb of Eb/D
    tim = [(0, 1, 50, 74), (1, 1, 50, 46), (2, 1, 50, 62), (3, .5, 50, 50), (3.5, .5, 50, 56),
           (4, 1, 50, 66), (5, 1, 50, 44), (6, 1, 50, 60), (7, .5, 50, 48), (7.5, .5, 50, 58),
           (8, 2, 50, 70), (10, 1, 46, 58), (11, .5, 45, 62), (11.5, .5, 45, 52),
           (12, 2, 50, 72), (14, 1, 47, 60), (15, .5, 45, 64), (15.5, .5, 45, 56), (16, .5, 50, 70)]
    tim += drumroll(rng, 16.5, 19.5, 50, 52, 22)  # the last chord rings over a roll that fades
    kit = drumroll(rng, 6, 8, SNARE, 26, 56) + drumroll(rng, 14, 16, SNARE, 28, 60) + [(12, 4, CRASH, 52), (16, 4, CRASH, 64)]
    bell = [(16, 4, 62, 92), (16, 4, 74, 74)]  # once, on the last chord: a bell on beat 12 still rang D against A7's C#
    low_brass = call + seg(8, "D3:2 Bb2:1 A2:1", 84, 92) + resolved  # beats 8-12: the bass line an octave up, for weight
    parts = {"horn lead": lead, "trumpet": lead, "horns": horns, "trombone": low_brass, "strings hi": strings,
             "choir": choir, "contrabass": bass, "strings lo": octave(bass), "timpani": tim, "bell": bell}
    voices = {"lead": lead, "horn 1": horn1, "horn 2": horn2, "trombone": call + resolved, "bass": bass}
    return song(100, parts, kit), voices


def parallels(voices):
    """(beat, voice, voice) wherever two real voices move the same way from a fifth or an octave into the same one.
    Doublings (the bass octave, strings and choir on the horns, the Eb/D lift) are left out on purpose."""
    times = sorted({beat for notes in voices.values() for beat, *_ in notes})

    def sounding(notes, t):  # the latest note started by `t`; the .2 covers the gap the gate leaves
        on = [(beat, note) for beat, length, note, _ in notes if beat <= t < beat + length + .2]
        return max(on)[1] if on else None

    names, bad = list(voices), []
    for t0, t1 in zip(times, times[1:]):
        for i, a in enumerate(names):
            for b in names[i + 1:]:
                a0, a1, b0, b1 = (sounding(voices[v], t) for v in (a, b) for t in (t0, t1))
                if None in (a0, a1, b0, b1) or a0 == a1 or b0 == b1 or (a1 - a0) * (b1 - b0) < 0:
                    continue
                if abs(a0 - b0) % 12 == abs(a1 - b1) % 12 in (0, 7):
                    bad.append((t1, a, b))
    return bad


def ffmpeg(audio, af, *out):
    """Run `af` on raw float stereo samples; returns ffmpeg's log."""
    return subprocess.run(["ffmpeg", "-hide_banner", "-nostats", "-y", "-f", "f32le", "-ar", str(SR), "-ac", "2", "-i", "-",
                           "-af", af, *out], input=audio, capture_output=True, check=True).stderr.decode()


def render(s, name, tail=2.0):
    """MIDI -> wav (fluidsynth with psx.render's settings) -> cut from the first note to `tail` s after the last note-off
    -> PS1 pass -> fade of the last .4 s -> -16 LUFS -> ogg. psx.render makes loops and folds the tail onto the start;
    a jingle plays once, so its tail stays where it rings."""
    path = os.path.join(OUT, name)
    s.midi().save(path + ".mid")
    wav = path + ".wav"
    subprocess.run([FLUID, "-ni", "-g", "0.8", "-r", str(SR), "-o", "synth.reverb.room-size=0.35",
                    "-o", "synth.reverb.damp=0.5", "-o", "synth.reverb.level=0.45", "-o", "synth.chorus.active=0",
                    "-F", wav, os.path.join(TOOLS, SOUNDFONTS["SGM"]), path + ".mid"], check=True, capture_output=True)
    with wave.open(wav) as w:
        x = np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16).reshape(-1, 2)
    os.remove(wav)
    assert np.abs(x.astype(np.int32)).max() < 32767, "fluidsynth clipped"
    last = max(beat + length for *_, notes in s.parts for beat, length, _, _ in notes) * 60 / s.bpm
    end = round((last + tail) * SR)
    assert len(x) >= end, f"fluidsynth stopped {len(x) / SR:.2f} s in, before the tail ends"
    first = int(np.argmax(np.abs(x).max(axis=1) > 33))  # -60 dBFS: where the first note speaks
    audio = (x[first:end] / 32768).astype(np.float32).tobytes()
    chain = f"{PS1},afade=t=out:st={(end - first) / SR - .4:.4f}:d=0.4"
    # loudnorm in two passes so the second is a plain gain (one pass rides the level and lifts the reverb tail);
    # aimed at -3 dBTP because Vorbis moves a peak by up to a dB
    norm = f"loudnorm=I={LUFS}:TP=-3:LRA=50:print_format=json"
    found = json.loads(re.findall(r"\{[^{}]*\}", ffmpeg(audio, f"{chain},{norm}", "-f", "null", "-"))[-1])
    norm += "".join(f":measured_{key}={found['input_' + key.lower()]}" for key in ("I", "TP", "LRA", "thresh"))
    log = ffmpeg(audio, f"{chain},{norm}:offset={found['target_offset']}:linear=true", "-ar", str(SR), "-c:a",
                 "libvorbis", "-q:a", "4", path + ".ogg")
    kind = json.loads(re.findall(r"\{[^{}]*\}", log)[-1])["normalization_type"]
    assert kind == "linear", "loudnorm fell back to dynamic: the peaks are too high for -16 LUFS, soften the drums"
    return path, last


def loudness(path):
    """Integrated loudness (LUFS) and true peak (dBFS) from ffmpeg's ebur128 summary."""
    log = subprocess.run(["ffmpeg", "-hide_banner", "-nostats", "-i", path, "-af", "ebur128=peak=true", "-f", "null", "-"],
                         capture_output=True, text=True, check=True).stderr
    return float(re.findall(r"I:\s+(-?[\d.]+) LUFS", log)[-1]), float(re.findall(r"Peak:\s+(-?[\d.]+) dBFS", log)[-1])


def db(x):
    return 20 * np.log10(np.sqrt(np.mean(x ** 2)) + 1e-12)


def check(name, s, voices, path, last):
    """Check the files as written: the notes read back from the .mid, then the audio of the .ogg."""
    parts = {part: read_notes(track) for part, track in zip(s.names, mido.MidiFile(path + ".mid").tracks, strict=True)}
    print(f"\n{name}: {s.bpm} bpm, last note-off {last:.2f} s")
    print(f"  {'part':12}{'notes':>6}{'low':>5}{'high':>5}  velocity")
    for part, notes in parts.items():
        print(f"  {part:12}{len(notes):6}{min(n[2] for n in notes):5}{max(n[2] for n in notes):5}"
              f"  {min(n[3] for n in notes)}-{max(n[3] for n in notes)}")
        if part != "drums":
            assert max(n[2] for n in notes) <= 84, f"{part} above C6"
        if part in BRASS:
            assert max(n[2] for n in notes) <= 79, f"{part}: brass above G5"
        if part in ("drums", "timpani"):
            vels = [n[3] for n in notes]
            assert max(vels) <= 80 and len(set(vels)) > 1, f"{part}: a stroke above 80, or flat velocities"
    deep, up = parts["contrabass"], {(a, p - 12) for a, _, p, _ in parts["strings lo"]}
    assert min(n[2] for n in deep) >= 28 and all((a, p) in up for a, _, p, _ in deep), "bass under E1 or without its octave"
    assert BANK["contrabass"][1] <= 60, "contrabass volume over 60"
    bad = parallels(voices)
    assert not bad, f"parallel fifths or octaves: {bad}"
    loud, peak = loudness(path + ".ogg")
    x = pcm(path + ".ogg")
    secs = len(x) / SR
    mono = x.mean(axis=1)
    onset = np.argmax(np.abs(x).max(axis=1) > 10 ** (-50 / 20)) / SR
    spectrum = np.abs(np.fft.rfft(mono)) ** 2
    hz = np.fft.rfftfreq(len(mono), 1 / SR)
    low = spectrum[(hz >= 60) & (hz < 120)].sum() / spectrum[hz >= 20].sum()
    before, after = db(mono[-round(.9 * SR):-round(.4 * SR)]), db(mono[-round(.1 * SR):])
    print(f"  ogg {secs:.2f} s | {loud:.1f} LUFS, true peak {peak:.1f} dBFS, max sample {np.abs(x).max():.3f}"
          f" | onset {onset * 1000:.0f} ms | before the fade {before:.0f} dB, last 100 ms {after:.0f} dB"
          f" | 60-120 Hz {100 * low:.0f}% of the energy")
    lo, hi = SPAN[name]
    assert last >= lo and lo <= secs <= hi, f"{name} should run {lo}-{hi} s"
    assert abs(loud - LUFS) <= .5 and peak < PEAK, "loudness off -16 LUFS or true peak over -2 dBFS"
    assert onset <= .05 and after < -60, "silence before the first note, or the end does not decay"
    assert before < -40, "the tail still rings where the fade starts: the fade cuts it instead of letting it decay"


if __name__ == "__main__":
    # the voice check must catch what it looks for: fifths C-G to D-A, octaves C-C to B-B; contrary motion passes
    assert parallels({"a": [(0, 1, 67, 0), (1, 1, 69, 0)], "b": [(0, 1, 60, 0), (1, 1, 62, 0)]})
    assert parallels({"a": [(0, 1, 72, 0), (1, 1, 71, 0)], "b": [(0, 1, 48, 0), (1, 1, 47, 0)]})
    assert not parallels({"a": [(0, 1, 67, 0), (1, 1, 69, 0)], "b": [(0, 1, 60, 0), (1, 1, 57, 0)]})
    os.makedirs(OUT, exist_ok=True)
    for name, build, tail in (("vitoria", vitoria, 1.8), ("derrota", derrota, 1.8), ("chefe", chefe, 1.8)):
        s, voices = build()
        check(name, s, voices, *render(s, name, tail))
