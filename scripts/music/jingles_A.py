"""Three one-shot jingles of Dungeon Tactics (version A), built with psx.py in the world of battle_dark.py.

All three take the battle motif's rhythm (long, short, then three steps: D-A-D-Eb-D) and give it another ending:
- vitoria (room won): the semitone Eb becomes a whole step, D-A-D-E-D, and the motif goes home while the harmony
  lifts from D minor through G (the Dorian sixth) and A7 to a quiet D major; the violins rise A-B-C#-D above it.
- derrota (party fell): the motif cannot climb back. D-A-C-Bb, then a slow fall A-G-F-E over the lament bass
  D-C-Bb-A, with tired timpani steps; it stops on the dominant A (Phrygian half cadence), unresolved.
- chefe (boss down): the low horns call the motif as the battle plays it (with Eb), the strings answer it on F and
  the horns climb A-Bb-C#-D (the battle's harmonic-minor close); then the whole band plays it with E natural and lands
  on the major third F# over D major (bass D-Bb-A-D), timpani and a crash under the arrival.
Instruments and volumes are the battle theme's (SGM-V2.01): strings, contrabass, horns, choir, bell, timpani.

psx.render makes loops, so the render here is one-shot: fluidsynth with psx.render's settings, the natural tail cut
where it falls 60 dB under the peak (2.5 s past the last note at most), the PS1 filter, a gain to -16 LUFS, a fade of
the last 0.4 s and libvorbis q4.

Run from the repository root:  python scripts/music/jingles_A.py
Writes vitoria, derrota and chefe (.mid, .ogg) to MUSIC_TOOLS/jingles/A, prints the notes and the measures; an assert
stops the run when a guardrail of the brief is broken.
"""
import os
import random
import re
import subprocess
import wave

import mido
import numpy as np

from battle_dark import drumroll, line, pcm, read_notes
from psx import FLUID, PPQ, SOUNDFONTS, SR, TOOLS, Song

OUT = os.path.join(TOOLS, "jingles", "A")
LUFS, PEAK_DB = -16.0, -2.0  # the battle music sits at -17.8 LUFS
LENGTHS = {"vitoria": (6, 9), "derrota": (7, 11), "chefe": (10, 15)}  # seconds, from the brief
NAMES = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"]

# name, GM program, volume, pan, lowest and highest pitch allowed; volumes are battle_dark's (measured there), except
# the second horn line, a little under the first because it is an inner voice
PARTS = (
    ("strings hi", 48, 110, 50, 55, 84),  # nothing above C6
    ("strings lo", 48, 110, 78, 40, 57),  # the bass an octave up, always
    ("contrabass", 43, 60, 64, 28, 45),  # never below E1, volume never above 60 (70 was muddy)
    ("horns", 60, 92, 44, 55, 74),  # brass: nothing above G5
    ("horns 2", 60, 84, 84, 55, 74),
    ("choir", 52, 110, 64, 55, 66),
    ("bell", 14, 127, 70, 50, 69),
    ("timpani", 47, 100, 58, 38, 53),
    ("drums", None, 100, 64, 38, 49),
)
SNARE, CRASH = 38, 49


def ph(beat, text, v0, v1, gate=.96):
    """battle_dark.line() started at `beat`: 'D4:1.5 A3:.5 D4+F4:1 -:1', velocity from v0 to v1."""
    return [(b + beat, length, note, vel) for b, length, note, vel in line(1, text, v0, v1, gate=gate)]


def bassline(beat, text, v0, v1):
    """Contrabass notes and the low strings an octave above them, over exactly the same beats."""
    deep = ph(beat, text, v0, v1, gate=.98)
    return {"contrabass": deep, "strings lo": [(b, length, note + 12, vel) for b, length, note, vel in deep]}


def vitoria():
    """76 bpm. Dm - G/B - A7 - D: soprano A-B-C#-D, alto F-G-G-F#, the horn motif D-A-D-E-D, bass D-B-A-D."""
    rng = random.Random(1)
    return 76, bassline(0, "D2:2 B1:1 A1:1 D2:3.4", 56, 62) | {
        "horns": ph(0, "D4:1.5 A3:.5 D4:1 E4:1 D4:3.4", 62, 70),
        "strings hi": ph(0, "A4:2 B4:1 C#5:1 D5:3.4", 50, 62, .98) + ph(0, "F4:2 G4:2 F#4:3.4", 46, 56, .98),
        "choir": ph(4, "A3+D4:3.4", 40, 40, .98),  # the fifth of the last chord, whispered
        "bell": [(4, 3.4, 50, 80), (4, 3.4, 62, 62)],  # the battle's bell, soft, on the first major chord
        "timpani": [(0, 1, 50, 54)] + drumroll(rng, 3, 4, 45, 30, 50) + [(4, 1, 50, 60)],
    }


def derrota():
    """62 bpm. Lament bass D-C-Bb-A under Dm - C - Gm/Bb - A; the horns move in tenths with the bass (F-E-D-C#)."""
    return 62, bassline(0, "D2:2 C2:2 Bb1:2 A1:3", 58, 50) | {
        "strings hi": ph(0, "D5:1.5 A4:.5 C5:1 Bb4:1 A4:1.5 G4:.5 F4:1 E4:2", 64, 50, .97),  # 7-6 over Bb, 6-5 over A
        "horns": ph(0, "F4:2 E4:2 D4:2 C#4:3", 52, 44, .98) + ph(2, "G3:4 A3:3", 48, 44, .98),
        "choir": ph(7, "A3+E4:2", 42, 36, .98),  # enters with the melody's E: over its F it would grind a semitone
        # the toll, then once on A; at 100 the first toll was the loudest instant of the file, a stinger
        "bell": [(0, 4, 50, 86), (0, 4, 62, 70), (6, 3, 57, 76), (6, 3, 69, 58)],
        # heavy steps, each with a weaker drag after it, tiring
        "timpani": [(beat, .9, note, vel) for beat, note, vel in
                    ((0, 50, 52), (1, 50, 40), (2, 48, 52), (3, 48, 36), (4, 46, 50), (5, 46, 34), (6, 45, 46), (7, 45, 30))],
    }


def chefe():
    """84 bpm. Call (bar 1, D5 - Eb/D), answer (bar 2, Dm/F - Gm - A7), the motif in tutti (Dm - Bb - A7 - D)."""
    rng = random.Random(3)
    return 84, bassline(0, "D2:4 F2:2 G2:1 A2:1 D2:2 Bb1:1 A1:1 D2:3.5", 64, 82) | {
        "horns": ph(0, "D4:1.5 A3:.5 D4:1 Eb4:1 D4:1.5", 72, 70) + ph(8, "D4:1.5 A3:.5 D4:1 E4:1 F#4:3.5", 80, 92),
        # A-Bb-C#-D, the close of the battle theme, leads into the tutti; then C#-D again under the arrival
        "horns 2": ph(0, "A3:3 Bb3:1 A3:2 Bb3:1 C#4:1", 58, 66, .98) + ph(8, "D4:3 C#4:1 D4:3.5", 74, 86, .98),
        # the answer (the motif on F, a whole step on top), then its G falls to F and the alto resolves G-F#;
        # the violins double the horn motif an octave up and the last chord opens to four voices
        "strings hi": ph(4, "F4:1.5 C4:.5 F4:1 G4:1", 60, 68) + ph(8, "F4:3 G4:1 F#4:3.5", 72, 84, .98)
        + ph(8, "D5:1.5 A4:.5 D5:1 E5:1 F#5:3.5", 76, 90) + ph(12, "A4+D5:3.5", 82, 82, .98),
        "choir": ph(0, "A3+D4:3 Bb3+Eb4:1", 44, 50, .98) + ph(12, "A3+D4:3.5", 60, 56, .98),
        "bell": [(0, 4, 50, 108), (0, 4, 62, 90), (12, 3.5, 50, 116), (12, 3.5, 62, 98)],
        # the timpani speaks the motif's rhythm with the horns, follows the bass, rolls into the arrival and closes A-D
        "timpani": [(beat, length, note, vel) for beat, length, note, vel in
                    ((0, 1, 50, 72), (1.5, .5, 45, 56), (2, 1, 50, 66), (3, 1, 50, 52), (4, 1, 53, 62), (6, 1, 43, 56),
                     (7, .5, 45, 60), (7.5, .5, 45, 66), (8, 1, 50, 76), (9.5, .5, 45, 58), (10, 1, 46, 68))]
        + drumroll(rng, 11, 12, 45, 50, 76) + [(12, 1, 50, 80), (14.5, .5, 45, 50), (15, 1, 50, 58)],  # a soft close under the held chord
        "drums": drumroll(rng, 11, 12, SNARE, 26, 62) + [(12, 3.5, CRASH, 70)],
    }


def song(bpm, parts):
    """The Song and the PARTS rows it holds, in track order."""
    s = Song(bpm=bpm, bars=1)  # bars only matter to psx.render's loop, not used here
    used = [p for p in PARTS if p[0] in parts]
    for channel, (part, program, volume, pan, _, _) in enumerate(used):
        if part == "drums":
            s.drum(parts[part], volume)
        else:
            s.add(channel, program, parts[part], volume, pan)
    return s, used


def ps1(x):
    """psx.render's PS1 filter (low rate, 11 bits, dull top), on float samples through ffmpeg."""
    af = "lowpass=f=8500,aresample=22050,acrusher=bits=11:mode=lin:aa=1,aresample=44100"
    out = subprocess.run(["ffmpeg", "-loglevel", "error", "-f", "f32le", "-ar", str(SR), "-ac", "2", "-i", "-", "-af", af,
                          "-f", "f32le", "-"], input=x.astype(np.float32).tobytes(), capture_output=True, check=True)
    return np.frombuffer(out.stdout, dtype=np.float32).reshape(-1, 2)


def loudness(path):
    """Integrated loudness (LUFS) and true peak (dBFS) from ffmpeg's ebur128."""
    log = subprocess.run(["ffmpeg", "-hide_banner", "-nostats", "-i", path, "-af", "ebur128=peak=true", "-f", "null", "-"],
                         capture_output=True, text=True).stderr
    return float(re.findall(r"I:\s+(-?[\d.]+) LUFS", log)[-1]), float(re.findall(r"Peak:\s+(-?[\d.]+) dBFS", log)[-1])


def render(s, path):
    """One-shot render: no loop fold. Returns the seconds of tail kept after the last note-off."""
    s.midi().save(path + ".mid")
    wav = path + ".wav"
    sf = os.path.join(TOOLS, SOUNDFONTS["SGM"])
    subprocess.run([FLUID, "-ni", "-g", "0.8", "-r", str(SR), "-o", "synth.reverb.room-size=0.35",
                    "-o", "synth.reverb.damp=0.5", "-o", "synth.reverb.level=0.45", "-o", "synth.chorus.active=0",
                    "-F", wav, sf, path + ".mid"], check=True, capture_output=True)
    with wave.open(wav) as w:  # pcm() would stop on ffmpeg's note about the guessed channel layout of this wav
        x = np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16).reshape(-1, 2) / 32768
    os.remove(wav)
    loud = np.abs(x).max(axis=1)
    peak = loud.max()
    heard = np.nonzero(loud > peak * 1e-3)[0]  # -60 dB under the peak
    last_off = max(b + length for _, _, _, _, notes in s.parts for b, length, _, _ in notes) * 60 / s.bpm
    # the natural tail, cut where it falls 60 dB under the peak, never past 2.5 s and never before the fade has room
    end = int(SR * min(max(heard[-1] / SR, last_off + .6), last_off + 2.5))
    y = ps1(x[heard[0]:end] * (.9 / peak))  # psx.render normalises to .9 before the filter too
    fade = np.linspace(1, 0, int(.4 * SR))[:, None]
    gain = 0.0
    for _ in range(5):  # Vorbis moves the level a little: correct the gain from the encoded file
        z = y * 10 ** (gain / 20)
        z[-len(fade):] *= fade  # the fade comes last, after the crusher and the gain: the file ends at zero
        subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-f", "f32le", "-ar", str(SR), "-ac", "2", "-i", "-",
                        "-c:a", "libvorbis", "-q:a", "4", path + ".ogg"], input=z.astype(np.float32).tobytes(), check=True)
        i, _ = loudness(path + ".ogg")
        if abs(i - LUFS) <= .2:
            break
        gain += LUFS - i
    return end / SR - last_off


def name(note):
    return NAMES[note % 12] + str(note // 12 - 1)


def check(title, s, order, tail):
    """Read the written MIDI and the encoded .ogg back and check them against the brief."""
    path = os.path.join(OUT, title)
    mid = mido.MidiFile(path + ".mid")
    parts = {p[0]: read_notes(track) for p, track in zip(order, mid.tracks, strict=True)}
    print(f"\n{title}: {s.bpm} bpm")
    for part, _, volume, _, low, high in order:
        notes = parts[part]
        pitches, vels = [n[2] for n in notes], [n[3] for n in notes]
        print(f"  {part:11} {min(pitches):3}-{max(pitches):<3} vel {min(vels)}-{max(vels):<3} "
              + " ".join(f"{a / PPQ:g}:{name(p)}:{(b - a) / PPQ:.2g}" for a, b, p, _ in notes if part != "drums" or p != SNARE))
        assert low <= min(pitches) and max(pitches) <= high, f"{part} leaves its range"
        if part in ("timpani", "drums"):
            assert max(vels) <= 80 and len(set(vels)) > 1, f"{part}: a stroke above 80, or flat velocities"
        if part == "contrabass":
            assert volume <= 60 and min(pitches) >= 28, "contrabass too loud in the bank or below E1"
    assert not any(n[2] in (35, 36) for n in parts.get("drums", [])), "a kick: it would meet the timpani"
    for a, b, p, _ in parts["contrabass"]:  # small speakers hear the bass through its octave
        assert any(a2 <= a and b2 >= b and p2 == p + 12 for a2, b2, p2, _ in parts["strings lo"]), "bass without its octave"
    tones = [n for part, notes in parts.items() if part not in ("timpani", "drums") for n in notes]
    for a, b, p, _ in tones:  # no third (or second) between two notes under C3
        assert not any(p < 48 and q < 48 and a < b2 and a2 < b and abs(p - q) % 12 not in (0, 5, 7)
                       for a2, b2, q, _ in tones), f"a muddy low interval at beat {a / PPQ}"

    x = pcm(path + ".ogg").mean(axis=1)
    i, tp = loudness(path + ".ogg")
    secs = len(x) / SR
    lead = np.argmax(np.abs(x) > 1e-3) / SR  # first sample above -60 dBFS
    last = 20 * np.log10(np.sqrt(np.mean(x[-SR // 20:] ** 2)) + 1e-12)
    print(f"  ogg {secs:.2f} s (tail {tail:.2f} s past the last note-off) | {i} LUFS, true peak {tp} dBFS,"
          f" sample peak {20 * np.log10(np.abs(x).max()):.1f} dBFS | starts after {lead * 1000:.0f} ms | last 50 ms {last:.0f} dBFS")
    lo, hi = LENGTHS[title]
    assert lo <= secs <= hi, "length outside the brief"
    assert tail <= 2.5 and lead <= .05 and last < -60, "tail too long, silence at the start or no silence at the end"
    assert abs(i - LUFS) <= .5 and tp < PEAK_DB, "loudness off -16 LUFS or true peak over -2 dBFS"


if __name__ == "__main__":
    os.makedirs(OUT, exist_ok=True)
    for title, build in (("vitoria", vitoria), ("derrota", derrota), ("chefe", chefe)):
        s, order = song(*build())
        check(title, s, order, render(s, os.path.join(OUT, title)))
