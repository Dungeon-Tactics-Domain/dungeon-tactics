"""Three one-shot jingles of Dungeon Tactics (version B), built with psx.py in the world of battle_dark.py.

vitoria: the battle motif's rhythm (long, short, two quarters, long) with a new contour: up a fourth instead of down,
then down by step to rest. Dm - Am - G - D: the Dorian B and the Picardy F# are the one lit moment, and the tune ends
on the fifth, open, because only the room is won.
derrota: the motif itself (D-A-D-Eb) that cannot come home: it sinks D-Bb-A over Dm - Bb - Eb/Bb - Gm and stops on the
A major chord of a half cadence, low and unresolved, over slow timpani steps.
chefe: the horns call the motif over the D pedal (Eb/D, the dread bell, the whispered choir); Bb - A7 turns it, and the
trumpets answer with the same rhythm in D major: the Phrygian Eb above D becomes the leading tone C# below it, and the
answer closes with a full cadence on a D major chord.

Run from scripts/music:  python jingles_B.py
Writes vitoria, derrota and chefe (.mid, .ogg) to MUSIC_TOOLS/jingles/B and prints the checks. psx.render makes loops,
so the one-shot render is here: same fluidsynth settings, the natural tail (at most 2.5 s past the last note), the PS1
filter, a 0.4 s fade out and loudnorm to -16 LUFS with a true peak under -2 dBFS.
"""
import json
import os
import random
import re
import subprocess
import wave

import mido
import numpy as np

from battle_dark import drumroll, line, pcm, read_notes
from psx import FLUID, PPQ, SOUNDFONTS, SR, TOOLS, Song

OUT = os.path.join(TOOLS, "jingles", "B")
TAIL, FADE = 2.5, 0.4  # seconds of reverb kept after the last note, and of the fade out at the end
LUFS, TP = -16.0, -2.3  # loudnorm targets; its true peak only gates linear mode, check() holds the file under -2 dBFS
# (Vorbis moved the measured true peak by 0.05 dB at most here)
WINDOW = {"vitoria": (6, 9), "derrota": (7, 11), "chefe": (10, 15)}  # allowed length of each file in seconds
SNARE, CRASH = 38, 49
NAMES = "C C# D Eb E F F# G Ab A Bb B".split()


def vitoria():
    """D Dorian to D major, 76 bpm: one phrase of four beats and the held chord, the horn echoing the rising fourth."""
    tune = "A4:1.5 D5:.5 C5:1 B4:1"
    parts = [
        ("strings hi", 48, 110, 50, line(1, tune, 60, 72) + line(2, "A4:4", 76, 76, gate=.98)),
        ("strings mid", 48, 100, 58, line(1, "F4:2 E4:1 G4:1 F#4:4", 56, 64, gate=.98)
         + line(1, "A3:2 A3:1 D4:1 D4:4", 54, 62, gate=.98)),
        ("strings lo", 48, 110, 78, line(1, "D3:2 A2:1 G2:1 D3:4", 60, 66, gate=.98)),
        ("contrabass", 43, 60, 64, line(1, "D2:2 A1:1 G1:1 D2:4", 62, 68, gate=.98)),
        ("horns", 60, 92, 44, line(1, tune, 54, 64, up=-12) + line(2, "A3:1.5 D4:2.5", 62, 52)),  # D4 lands on beat 5.5
        ("choir", 52, 100, 64, line(2, "A3+D4+F#4:4", 46, 46, gate=.98)),
        ("timpani", 47, 100, 58, [(0, .9, 50, 52), (3, .9, 43, 44), (4, 1, 50, 60)]),
    ]
    return Song(bpm=76, bars=2), parts, []


def derrota():
    """D minor, 60 bpm: the motif sinks to a half cadence; strings sing it, a horn an octave below, timpani steps."""
    tune = "D5:1.5 A4:.5 D5:1 Eb5:1 D5:1 Bb4:1 A4:2"
    parts = [
        ("strings hi", 48, 110, 50, line(1, tune, 70, 50)),
        ("strings mid", 48, 100, 58, line(1, "F4:3 G4:3 E4:2", 56, 46, gate=.98)
         + line(1, "A3:2 Bb3:3 D4:1 C#4:2", 54, 46, gate=.98)),
        ("strings lo", 48, 110, 78, line(1, "D3:2 Bb2:2 G2:2 A2:2", 64, 54, gate=.98)),
        ("contrabass", 43, 60, 64, line(1, "D2:2 Bb1:2 G1:2 A1:2", 66, 56, gate=.98)),
        ("horns", 60, 92, 44, line(1, tune, 62, 46, up=-12)),
        ("choir", 52, 100, 64, line(1, "A3+F4:2 Bb3+F4:1 Bb3+G4:2 D4+G4:1 C#4+E4:2", 44, 38, gate=.98)),
        ("bell", 14, 127, 70, [(0, 4, 50, 86), (0, 4, 62, 68)]),  # one toll, as in the battle, softer
        # carried back: a heavy step on every beat, strong and weak, each pair a little softer
        ("timpani", 47, 100, 58, [(beat, .9, note, vel) for beat, (note, vel) in
                                  enumerate(((50, 58), (50, 44), (46, 54), (46, 41), (43, 50), (43, 38), (45, 47), (45, 35)))]),
    ]
    return Song(bpm=60, bars=2), parts, []


def chefe():
    """D Phrygian call, D major answer, 96 bpm: bars 1-2 the horns, bars 3-4 the trumpets, bar 5 the final chord."""
    rng = random.Random(5)  # the rolls jitter the same way on every run
    answer = "D5:1.5 A4:.5 D5:1 E5:1 F#5:1.5 E5:.5 D5:1 C#5:1"
    parts = [
        ("trumpets", 56, 88, 72, line(2, "-:3 A4:1", 70, 70) + line(3, answer, 84, 90) + line(5, "D5:3", 86, 86, gate=.98)),
        # one D per octave in the last chord (contrabass, strings lo, choir, trumpet) and the horns' seventh G4 falls to
        # F#4; Ds doubled there made the attack peakier (measured: peak over loudness 13.45 dB, 13.0 without two of them)
        ("strings hi", 48, 110, 50, line(3, answer, 78, 84) + line(5, "A4+F#5:3", 76, 76, gate=.98)),
        ("horns", 60, 92, 44, line(1, "D4:1.5 A3:.5 D4:1 Eb4:1 D4:3 C#4:1", 80, 88)
         + line(3, "D4+F#4:2 D4+G4:1 C#4+G4:1 D4+A4:2 D4+A4:1 E4+G4:1 F#4:3", 76, 82, gate=.98)),
        ("strings lo", 48, 110, 78, line(1, "D3:6 Bb2:1 A2:1 D3:2 B2:1 A2:1 D3:2 B2:1 A2:1 D3:3", 72, 80, gate=.98)),
        ("contrabass", 43, 60, 64, line(1, "D2:6 Bb1:1 A1:1 D2:2 B1:1 A1:1 D2:2 B1:1 A1:1 D2:3", 70, 76, gate=.98)),
        ("choir", 52, 100, 64, line(1, "A3+D4:3 Bb3+Eb4:1 A3+D4:2 Bb3+F4:1 A3+E4:1", 54, 64, gate=.98)
         + line(3, "A3+D4:2 G3+D4:1 A3+C#4:1 A3+D4:3 A3+E4:1 A3+D4:3", 58, 62, gate=.98)),
        # the dread toll on the first beat, the same bell on the major chord at the end
        ("bell", 14, 127, 70, [(0, 4, 50, 100), (0, 4, 62, 82), (16, 2.9, 50, 94), (16, 2.9, 62, 78)]),
        ("timpani", 47, 100, 58, [(0, 1, 38, 70), (2, .9, 50, 46), (4, 1, 38, 60), (5, .9, 50, 44), (6, .9, 46, 54)]
         + [(7 + i / 4, .2, 45, 46 + 8 * i) for i in range(4)]  # A in sixteenths into the answer
         + [(8, 1.5, 50, 72), (10, .9, 47, 57), (11, .9, 45, 63), (12, 1.5, 50, 68), (14, .9, 47, 55)]
         + [(15 + i / 4, .2, 45, 50 + 6 * i) for i in range(4)] + [(16, 1, 38, 72)]
         + drumroll(rng, 16.25, 18.5, 50, 62, 34)),  # the low D, then a roll on D3 that dies away
    ]
    kit = drumroll(rng, 6, 8, SNARE, 30, 62) + [(beat, .25, SNARE, vel) for beat, vel in
                                                ((9, 46), (9.5, 52), (11, 48), (11.5, 55), (13, 45), (13.5, 51))]
    kit += drumroll(rng, 15, 16, SNARE, 36, 64) + [(16, 2.9, CRASH, 70)]
    return Song(bpm=96, bars=5), parts, kit


def note(p):
    return f"{NAMES[p % 12]}{p // 12 - 1}"


def fluid(mid, wav):
    """The fluidsynth render of psx.render, same settings: reverb, no chorus, 44.1 kHz."""
    subprocess.run([FLUID, "-ni", "-g", "0.8", "-r", str(SR), "-o", "synth.reverb.room-size=0.35",
                    "-o", "synth.reverb.damp=0.5", "-o", "synth.reverb.level=0.45", "-o", "synth.chorus.active=0",
                    "-F", wav, os.path.join(TOOLS, SOUNDFONTS["SGM"]), mid], check=True, capture_output=True)


def ffmpeg(audio, af, out):
    """Raw float stereo samples through the filter `af`; returns ffmpeg's log (stderr)."""
    return subprocess.run(["ffmpeg", "-hide_banner", "-y", "-f", "f32le", "-ar", str(SR), "-ac", "2", "-i", "-", "-af", af,
                           *out], input=audio, capture_output=True, check=True).stderr.decode()


def render(song, path):
    """One shot: MIDI -> fluidsynth -> from the first note until the tail is 60 dB down (2.5 s past the last note at
    most) -> PS1 filter -> fade -> loudnorm -> ogg."""
    song.midi().save(path + ".mid")
    fluid(path + ".mid", path + ".wav")
    with wave.open(path + ".wav") as w:  # read here: ffmpeg warns about the channel layout of fluidsynth's wav
        x = np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16).reshape(-1, 2).astype(np.float32) / 32768
    os.remove(path + ".wav")
    first = np.argmax(np.abs(x).max(axis=1) > 10 ** (-50 / 20))  # strings attack slowly: cut by level, not by MIDI time
    last = max(beat + length for *_, notes in song.parts for beat, length, _, _ in notes) * 60 / song.bpm
    x = x[max(first - SR // 200, 0):round((last + TAIL) * SR)]
    level = np.abs(x).max(axis=1)
    x = x[:np.flatnonzero(level > level.max() / 1000).max() + 1]  # the tail ends 60 dB under the peak: no dead air
    secs = len(x) / SR
    # PS1 feel as in psx.render: low sample rate, few bits, dull top end; then the fade and the loudness
    shape = (f"lowpass=f=8500,aresample=22050,acrusher=bits=11:mode=lin:aa=1,aresample={SR},"
             f"afade=t=out:st={secs - FADE:.4f}:d={FADE}")
    norm = f"loudnorm=I={LUFS}:TP={TP}:LRA=50:print_format=json"  # LRA at its maximum: a wide range must not force dynamic mode
    first_pass = json.loads(re.search(r"\{[^{}]*\}", ffmpeg(x.tobytes(), f"{shape},{norm}", ["-f", "null", "-"])).group())
    measured = ":".join(f"measured_{k}={first_pass['input_' + k]}" for k in ("i", "tp", "lra", "thresh"))
    target = LUFS
    for _ in range(3):  # loudnorm and ebur128 differ by up to half a LU on files this short: aim again from the file
        log = ffmpeg(x.tobytes(), f"{shape},{norm.replace(f'I={LUFS}', f'I={target:.2f}')}:{measured}:linear=true",
                     ["-ar", str(SR), "-c:a", "libvorbis", "-q:a", "4", path + ".ogg"])
        second = json.loads(re.search(r"\{[^{}]*\}", log).group())
        assert second["normalization_type"] == "linear", f"loudnorm went dynamic: {first_pass}"
        miss = LUFS - loudness(path + ".ogg")[0]
        if abs(miss) <= .1:
            break
        target += miss
    return first_pass


def loudness(ogg):
    """Integrated loudness (LUFS) and true peak (dBFS) from ffmpeg's ebur128."""
    log = subprocess.run(["ffmpeg", "-hide_banner", "-i", ogg, "-af", "ebur128=peak=true", "-f", "null", "-"],
                         capture_output=True, text=True, check=True).stderr.split("Summary:")[-1]
    return float(re.search(r"I:\s+(-?[\d.]+) LUFS", log).group(1)), float(re.search(r"Peak:\s+(-?[\d.]+) dBFS", log).group(1))


def check(name, song, parts, path, first_pass):
    """Check the written MIDI against the mix guardrails, then the rendered file against the loudness contract."""
    tracks = mido.MidiFile(path + ".mid").tracks
    written = {part[0]: read_notes(track) for part, track in zip(parts, tracks)}
    if len(tracks) > len(parts):
        written["drums"] = read_notes(tracks[-1])
    program = {part: prog for part, prog, *_ in parts}
    volume = {part: vol for part, _, vol, *_ in parts}
    print(f"\n{name}: {song.bpm} bpm")
    for part, notes in written.items():
        p, v = [n[2] for n in notes], [n[3] for n in notes]
        print(f"  {part:12}{len(p):4} notes  {note(min(p)):>4}-{note(max(p)):<4} velocity {min(v)}-{max(v)}")
        if part not in ("drums", "timpani", "bell"):
            print("     " + " ".join(f"{a / PPQ:g}:{note(q)}" for a, _, q, _ in sorted(notes)))
    pitched = [n for part, notes in written.items() if part != "drums" for n in notes]
    assert max(n[2] for n in pitched) <= 84, "a note above C6"
    assert all(n[2] <= 79 for part, notes in written.items() if 56 <= program.get(part, 0) <= 63 for n in notes), "brass above G5"
    hits = [n for part in ("drums", "timpani") for n in written.get(part, [])]
    assert max(n[3] for n in hits) <= 80, "a drum or timpani stroke above velocity 80"
    for part in ("drums", "timpani"):
        v = [n[3] for n in sorted(written.get(part, []))]
        assert not any(v[i] == v[i + 1] == v[i + 2] for i in range(len(v) - 2)), f"three {part} strokes at one velocity"
    bass = written["contrabass"]
    assert volume["contrabass"] <= 60 and min(n[2] for n in bass) >= 28, "contrabass too loud in the bank or below E1"
    bare = 0  # the longest stretch of a contrabass note without its octave above, in ticks
    for start, stop, low, _ in bass:
        t = start
        for a, b in sorted((a, b) for part, notes in written.items() if part != "contrabass" for a, b, q, _ in notes
                           if q == low + 12 and a < stop and b > start):
            bare, t = max(bare, a - t), max(t, b)
        bare = max(bare, stop - t)
    assert bare <= PPQ * 3 // 10, "the bass loses its octave above"
    low = [n for n in pitched if n[2] < 48]  # under C3 only unisons, octaves and fifths: thirds and seconds there are mud
    mud = [(note(a[2]), note(b[2]), a[0] / PPQ) for i, a in enumerate(low) for b in low[i + 1:]
           if a[0] < b[1] and b[0] < a[1] and abs(a[2] - b[2]) % 12 not in (0, 7)]
    assert not mud, f"low thirds or seconds: {mud}"
    i, tp = loudness(path + ".ogg")
    x = pcm(path + ".ogg")
    secs = len(x) / SR
    lead = np.argmax(np.abs(x).max(axis=1) > 10 ** (-50 / 20)) / SR
    db = lambda seg: 20 * np.log10(np.sqrt(np.mean(seg ** 2)) + 1e-12)  # noqa: E731
    before_fade, end = db(x[round((secs - FADE - .1) * SR):round((secs - FADE) * SR)]), db(x[-SR // 20:])
    print(f"  {secs:.2f} s | {i} LUFS, true peak {tp} dBFS (before loudnorm {first_pass['input_i']} LUFS,"
          f" {first_pass['input_tp']} dBTP) | sample peak {20 * np.log10(np.abs(x).max()):.1f} dB"
          f" | first sound at {lead * 1000:.0f} ms | {before_fade:.1f} dB before the fade, last 50 ms {end:.1f} dB")
    low_s, high_s = WINDOW[name]
    assert low_s <= secs <= high_s, f"{secs:.2f} s is outside {WINDOW[name]}"
    assert abs(i - LUFS) <= .5 and tp < -2, "loudness off target or true peak over -2 dBFS"
    assert lead <= .05 and end < -60 and np.abs(x).max() < .99, "leading silence, an end that is not silent, or clipping"


if __name__ == "__main__":
    os.makedirs(OUT, exist_ok=True)
    for build in (vitoria, derrota, chefe):
        song, parts, kit = build()
        for channel, (_, program, volume, pan, notes) in enumerate(parts):
            song.add(channel + (channel >= 9), program, notes, volume, pan)
        if kit:
            song.drum(kit, 90)
        path = os.path.join(OUT, build.__name__)
        check(build.__name__, song, parts, path, render(song, path))
