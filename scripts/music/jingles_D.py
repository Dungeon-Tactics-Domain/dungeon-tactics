"""Three one-shot jingles for Dungeon Tactics, dark lo-fi (brief: BRIEF_JINGLES_LOFI.md), letter D.

One motif ties them: a rising fourth, a step back, another rising fourth onto a held note (in A minor E4 A4 G4 C5,
degrees 5 1 b7 b3); over a major chord the step back is a half step (A D C# F#), which is where the light gets in.
  vitoria  A minor, 80 bpm, 2 bars. Motif on ocarina over nylon guitar, then the same shape a fourth up over D major
           (the Dorian IV, the one lit turn: C# F#). Lands on Am(add9) with the melody on the fifth; the celesta echoes
           A5 -> B5 and stops on the ninth: this room is won, the road is not.
  derrota  D minor, 68 bpm. Cello sings the motif (A3 D4 C4 F4), sighs E -> D over Bbmaj7, drops to Bb and leans
           on A (the b6 -> 5 lament) over a held Asus4; a music box tries the motif (A D C) and stops before the held F.
           Piano drops above, a hand drum walks slowly and stops, a warm pad blooms on the last chord. Never resolves.
  chefe    A minor -> A major, 82 bpm, 4 bars (Am Am7/G | C Gsus4 | F/A D/F# | Asus4/E A). The motif three times, each
           start higher (E->A, G->C, C->F) as strings and percussion swell; the melody holds A5 while F major turns to
           D major under it (F -> F#, the weight lifting), then falls E D C# B A onto the tonic as D -> Asus4 -> A
           closes plagally. The voices leave one by one and the celesta answers E5 -> A5 over the ringing plucks.
Run: python scripts/music/jingles_D.py  (writes <MUSIC_TOOLS>/jingles/D/{vitoria,derrota,chefe}.{mid,ogg})
"""
import json
import os
import re
import subprocess
import tempfile
import wave

import mido
import numpy as np

from psx import FLUID, PPQ, SOUNDFONTS, SR, TOOLS, Song

OUT = os.path.join(TOOLS, "jingles", "D")
STEP = {"C": 0, "D": 2, "E": 4, "F": 5, "G": 7, "A": 9, "B": 11}
LOW_CONGA, MUTE_CONGA, TAMBOURINE, MARACAS, TRIANGLE = 64, 62, 54, 70, 81  # GM kit: frame drum, shaker, finger cymbal


def pitch(name):
    return 12 * (int(name[-1]) + 1) + STEP[name[0]] + name.count("#") - name.count("b")


def pcs(names):
    return {(STEP[n[0]] + n.count("#") - n.count("b")) % 12 for n in names.split()}


def line(start, text):
    """Tokens "PITCH:BEATS:VELOCITY" played one after another from `start`."""
    out, t = [], start
    for tok in text.split():
        name, dur, v = tok.split(":")
        out.append((t, float(dur), pitch(name), int(v)))
        t += float(dur)
    return out


def roll(start, length, names, v, step=0.05):
    """A strummed or harp-rolled chord, low to high, each string a little softer; all end together."""
    return [(start + i * step, length - i * step, pitch(n), v - 2 * i) for i, n in enumerate(names.split())]


def arp(start, end, names, vels, step=0.5):
    """Fingerpicked notes one per eighth, each ringing until the chord changes at `end`."""
    return [(start + i * step, end - start - i * step, pitch(n), v) for i, (n, v) in enumerate(zip(names.split(), vels))]


def trim(notes):
    """A re-struck pitch cuts the earlier note, so its note_off never lands inside the new note."""
    notes = sorted(notes)
    out = []
    for i, (t, n, p, v) in enumerate(notes):
        nxt = next((t2 for t2, _, p2, _ in notes[i + 1:] if p2 == p and t2 > t), None)
        out.append((t, min(n, nxt - t) if nxt is not None else n, p, v))
    return out


# Each jingle: parts are name -> (channel, GM program, volume, pan, notes); the first part is the melody and
# "bass" is the one part that owns the low end (two parts may share a channel, e.g. a guitarist's thumb and fingers).

# ---- vitoria: room won ---------------------------------------------------------------------------------------
VITORIA = {
    "bpm": 80, "window": (6, 9),
    "chords": [(0, "A C E B"), (2, "G A C E B"), (4, "D F# A E"), (7, "A C E B")],  # Am(add9), Am7/G, D, Am(add9)
    "parts": {
        # volumes balanced by rendering each channel alone: this bank's ocarina is ~11 dB louder than the guitar
        "ocarina": (0, 79, 78, 70, line(0, "E4:.5:58 A4:1:68 G4:.5:60 C5:1.5:72 A4:.5:60 D5:1:70 C#5:.5:66 "
                                           "F#5:1.5:78 E5:1.5:64")),
        # the sustained parts stop at beat 9 and the plucked ones ring a beat longer, so the end decays instead of stopping
        "bass": (1, 24, 100, 54, line(0, "A2:2:54 G2:2:50 F#2:3:55 A2:3.75:52")),  # nylon guitar, the thumb
        "guitar": (1, 24, 100, 54, trim(  # the fingers, picking above the thumb
            arp(.5, 2, "E3 B3 C4", [38, 41, 43]) + arp(2.5, 4, "E3 A3 C4", [36, 40, 42])
            + arp(4.5, 7, "D3 A3 D4 F#4 A3", [40, 44, 47, 38, 34]) + roll(7.05, 3.7, "E3 A3 C4 E4", 50))),
        "pad": (2, 89, 100, 64, line(0, "A3:9:42") + line(0, "C4:4:42 D4:3:46 C4:2:40") + line(0, "E4:4:42 F#4:3:46 E4:2:40")),
        "celesta": (3, 8, 100, 82, line(7.5, "A5:.5:50 B5:2.75:46")),
    },
    "drum_volume": 105,
    "drums": [(0, LOW_CONGA, 48), (3.5, MUTE_CONGA, 26), (4, LOW_CONGA, 42), (6.5, MUTE_CONGA, 30), (7, LOW_CONGA, 56),
              (7, TRIANGLE, 42)]
             + [(4 + k / 2, MARACAS, v) for k, v in enumerate([20, 26, 18, 28, 22, 31])],  # the shaker joins the lit turn
}

# ---- derrota: the party is carried back ------------------------------------------------------------------------
DERROTA = {
    "bpm": 68, "window": (7, 11),
    "chords": [(0, "D F A E C"), (4, "Bb D F A"), (6, "G Bb D"), (7, "A D E")],  # Dm(add9), Bbmaj7, Gm, Asus4
    "parts": {
        # the cello lets go under the music box; piano and box ring on and decay by themselves
        "cello": (1, 42, 60, 70, line(.5, "A3:.5:54 D4:1:62 C4:.5:56 F4:1.5:68 E4:.5:62 D4:1.5:56 Bb3:1:52 A3:2:46")),
        "bass": (0, 0, 100, 58, line(0, "D3:4:50 Bb2:2:46 G2:1:44 A2:3.5:48")),  # soft piano, left hand
        "piano": (0, 0, 100, 58, line(0, "A4:1.5:38 E5:1.5:30 C5:1:30 D5:1:36 A4:1:30 D5:1:28")  # right hand drops
                  + roll(7, 3.5, "D4 E4", 40, step=0.08)),
        # the box winds down: each note a little later and softer, and it stops on C, short of the motif's held F
        "music box": (2, 10, 110, 86, [(7.5, .55, pitch("A4"), 58), (8.05, .6, pitch("D5"), 54), (8.65, 1.85, pitch("C5"), 52)]),
        # a warm pad blooms on the Asus4 only, so the end fades on its release instead of stopping with the cello
        "pad": (3, 89, 80, 64, line(7, "A3:3.5:40") + line(7, "D4:3.5:40") + line(7, "E4:3.5:38")),
    },
    "drum_volume": 80,
    "drums": [(0, LOW_CONGA, 40), (2, LOW_CONGA, 28), (4, LOW_CONGA, 36), (6, LOW_CONGA, 24)],  # slow steps that stop
}

# ---- chefe: dungeon boss down ----------------------------------------------------------------------------------
GTR = [("E3 B3 A3 C4", 42), ("E3 C4 G3 E4", 42), ("G3 E4 C4 G4", 46), ("G3 D4 C4 G4", 48), ("F3 C4 A3 F4", 52),
       ("F#3 D4 A3 F#4", 54)]  # Am(add9) Am7/G C Gsus4 F D, picked low, third, second, top
# Gsus4, not G: no B under the melody's C5 pickup into bar 3, and the modal colour stays (no leading tone anywhere)
guitar = [n for i, (names, b) in enumerate(GTR) for n in arp(2 * i, 2 * i + 2, names, [b + 6, b - 3, b, b - 3])]
guitar += roll(12, 1, "E3 A3 D4 E4", 50) + roll(13, 5.5, "E3 A3 C#4 E4 A4", 56)
shaker = [(k / 2, MARACAS, [16, 20, 26, 22][k // 8] + (6 if k % 2 else 0) + (3 if k % 4 == 3 else 0)) for k in range(26)]

CHEFE = {
    "bpm": 82, "window": (10, 15),
    "chords": [(0, "A C E B"), (2, "G A C E"), (4, "C E G D"), (6, "G C D E"), (8, "F A C G"), (10, "D F# A E"),
               (12, "E A D"), (13, "A C# E B")],  # Am(add9) Am7/G | C Gsus4 | F/A D/F# | Asus4/E A
    "parts": {  # the end thins out voice by voice (strings, cello, ocarina) and the plucks ring last: the rain stopping
        "ocarina": (0, 79, 75, 66, line(0, "E4:.5:54 A4:1:60 G4:.5:56 C5:1.5:64 G4:.5:56 C5:1:66 B4:.5:62 E5:1.5:72 "
                                            "D5:.5:66 C5:.5:68 F5:1:78 E5:.5:76 A5:2:88 E5:.5:74 D5:1:72 C#5:1.5:70 "
                                            "B4:.5:62 A4:2:60")),
        "bass": (1, 42, 60, 60, line(0, "A2:2:56 G2:2:58 C3:2:64 G2:2:66 A2:2:72 F#2:2:74 E2:1:70 A2:3:66")),  # cello
        "guitar": (2, 24, 90, 46, trim(guitar)),
        # slow strings enter in bar 2 and swell; the top voice F -> F# is the light changing under the held A5
        "strings": (3, 49, 72, 64, line(4, "G3:4:42 A3:7.5:58") + line(4, "C4:4:42 C4:2:56 D4:3:62 C#4:2.5:54")
                    + line(4, "E4:2:40 D4:2:46 F4:2:56 F#4:2:64 E4:3.5:56")),
        "harp": (4, 46, 85, 84, roll(8, 2, "F3 A3 C4 F4 A4", 50, step=0.06) + roll(10, 2, "D4 F#4 A4 D5", 46, step=0.06)
                 + roll(13, 5.5, "A3 C#4 E4 A4 C#5 E5", 54, step=0.06)),
        "celesta": (5, 8, 100, 76, line(14.5, "E5:.5:44 A5:3.5:48")),
    },
    "drum_volume": 106,
    "taper": [(0, 15.25, 17)],  # the ocarina breathes out on the final A instead of stopping 13 dB above the plucks
    "drums": shaker + [(4, LOW_CONGA, 42), (5.5, LOW_CONGA, 30), (6, LOW_CONGA, 36), (7.5, MUTE_CONGA, 26),
                       (8, LOW_CONGA, 52), (9, TAMBOURINE, 30), (9.5, LOW_CONGA, 36), (10, LOW_CONGA, 48),
                       (11, MUTE_CONGA, 30), (11, TAMBOURINE, 36), (11.5, LOW_CONGA, 38), (12, LOW_CONGA, 40),
                       (13, LOW_CONGA, 58), (13, TAMBOURINE, 40), (13, TRIANGLE, 46)],  # silence after 13: the rain stops
}


# ---- checks: the brief's guardrails and a musician's read of the notes -------------------------------------------
def check(name, spec):
    parts, drums, bpm = spec["parts"], spec["drums"], spec["bpm"]
    print(f"\n== {name}: {bpm} bpm")
    for part, (ch, prog, vol, _, notes) in parts.items():
        ps, vs = [p for _, _, p, _ in notes], [v for *_, v in notes]
        assert max(ps) <= 84, f"{part} above C6"  # nothing shrill: every pitched part stays at or under C6
        assert all(n > 0.01 and 1 <= v <= 127 for _, n, _, v in notes), part
        if prog in (42, 43):
            assert vol <= 60, f"{part}: cello or contrabass volume {vol} > 60"
        for i, (t, n, p, _) in enumerate(notes):  # one part never holds the same pitch twice
            assert all(not (p2 == p and t <= t2 < t + n - 1e-9) for t2, _, p2, _ in notes[i + 1:]), (part, t, p)
        print(f"  {part:9} ch{ch} prog {prog:3} vol {vol:3}  notes {len(notes):3}  pitch {min(ps)}-{max(ps)}  vel {min(vs)}-{max(vs)}")
    bass = sorted(parts["bass"][4])
    assert min(p for _, _, p, _ in bass) >= 28, "bass under E1"
    dv = [v for *_, v in drums]
    assert max(dv) <= 80 and len(set(dv)) > 2 and all(35 <= n <= 81 for _, n, _ in drums), "percussion guardrail"
    print(f"  drums     hits {len(drums)}  vel {min(dv)}-{max(dv)}")

    def chord(t):
        return pcs([c for s, c in spec["chords"] if s <= t][-1])

    mel = next(iter(parts.values()))[4]
    off = [(t, p) for t, n, p, _ in mel if n >= 1 and p % 12 not in chord(t)]
    print(f"  held melody notes outside the chord: {off}")

    def top(t):
        hits = [p for s, n, p, _ in mel if s <= t < s + n]
        return max(hits) if hits else None

    pairs = [(t, b, top(t)) for t, _, b, _ in bass]
    par = [t2 for (t1, b1, m1), (t2, b2, m2) in zip(pairs, pairs[1:])
           if m1 and m2 and b1 != b2 and m1 != m2 and (m1 - b1) % 12 == (m2 - b2) % 12 in (0, 7)]
    print(f"  bass vs melody intervals at bass onsets: {[(t, (m - b) % 12 if m else None) for t, b, m in pairs]}")
    print(f"  parallel fifths/octaves bass vs melody at beats: {par}")
    last = max(t + n for *_, notes in parts.values() for t, n, _, _ in notes)
    secs = last * 60 / bpm
    assert secs + 0.1 <= spec["window"][1] - 0.4, f"last note-off at {secs:.2f} s leaves no room for the tail"
    print(f"  last note-off at beat {last} = {secs:.2f} s")
    return secs


# ---- one-shot render: psx.render's synth settings and PS1 filter, without the loop fold ----------------------------
PS1 = "lowpass=f=8500,aresample=22050,acrusher=bits=11:mode=lin:aa=1,aresample=44100"  # verbatim from psx.render


def ffmpeg(args):
    return subprocess.run(["ffmpeg", "-hide_banner", "-nostats", *args], capture_output=True, text=True, check=True).stderr


def loudnorm_json(stderr):
    return json.loads(re.findall(r"\{[^{}]*\}", stderr)[-1])


def taper(mid, ch, start, end, floor=40, steps=12):
    """Expression (CC11) falls from 127 to `floor` between two beats on one channel: a held note fades like a breath."""
    tr = next(t for t in mid.tracks if any(getattr(m, "channel", None) == ch for m in t))
    ev, t = [], 0
    for m in tr:
        t += m.time
        ev.append((t, m))
    ev += [(round((start + (end - start) * k / steps) * PPQ),
            mido.Message("control_change", channel=ch, control=11, value=round(127 - (127 - floor) * k / steps)))
           for k in range(steps + 1)]
    ev.sort(key=lambda e: e[0])  # stable: notes keep their order, the ramp slots in by tick
    tr[:] = [m.copy(time=t - prev) for (t, m), prev in zip(ev, [0] + [t for t, _ in ev[:-1]])]


def render(name, spec, last_secs, tmp):
    song = Song(bpm=spec["bpm"], bars=4)
    for ch, prog, vol, pan, notes in spec["parts"].values():
        song.add(channel=ch, program=prog, notes=notes, volume=vol, pan=pan)
    song.drum([(t, 0.25, n, v) for t, n, v in sorted(spec["drums"])], volume=spec["drum_volume"])
    out = os.path.join(OUT, name)
    mid = song.midi()
    for ch, a, b in spec.get("taper", []):
        taper(mid, ch, a, b)
    mid.save(out + ".mid")
    raw = os.path.join(tmp, name + ".raw.wav")
    subprocess.run([FLUID, "-ni", "-g", "0.8", "-r", str(SR), "-o", "synth.reverb.room-size=0.35",
                    "-o", "synth.reverb.damp=0.5", "-o", "synth.reverb.level=0.45", "-o", "synth.chorus.active=0",
                    "-F", raw, os.path.join(TOOLS, SOUNDFONTS["MuseScore_General"]), out + ".mid"],
                   check=True, capture_output=True)  # fluidsynth keeps rendering ~10 s of silence past the end
    with wave.open(raw) as w:
        x = np.frombuffer(w.readframes(w.getnframes()), np.int16).reshape(-1, 2).astype(np.float64) / 32768
    peak = np.abs(x).max()
    assert peak < 0.99, f"{name}: the synth clipped ({peak:.3f})"
    start = int(np.argmax(np.abs(x).max(1) > 1e-4))
    # tail: the earliest of last note-off + 2.5 s, the point 60 dB under the peak, and the jingle's time window
    win = SR // 100
    env = np.sqrt((x[: len(x) // win * win].reshape(-1, win, 2) ** 2).mean((1, 2)))
    decayed = (np.nonzero(env > peak * 10 ** (-60 / 20))[0][-1] + 1) * win
    end = min(int((last_secs + 2.5) * SR), decayed, start + int((spec["window"][1] - 0.15) * SR))
    y = x[start:end] * (0.9 / peak)  # same 0.9 headroom psx gives the crusher, so the 11 bits are used the same way
    trimmed = os.path.join(tmp, name + ".wav")
    with wave.open(trimmed, "wb") as w:
        w.setnchannels(2), w.setsampwidth(2), w.setframerate(SR)
        w.writeframes((y * 32767).astype(np.int16).tobytes())
    dur = len(y) / SR
    # loudness: two-pass loudnorm in linear mode (a plain gain); the fade comes after the crusher, so it ends in silence
    target = "I=-16:TP=-3:LRA=20"
    m = loudnorm_json(ffmpeg(["-i", trimmed, "-af", f"{PS1},loudnorm={target}:print_format=json", "-f", "null", "-"]))
    ln = (f"loudnorm={target}:linear=true:measured_I={m['input_i']}:measured_TP={m['input_tp']}:"
          f"measured_LRA={m['input_lra']}:measured_thresh={m['input_thresh']}:print_format=json")  # no offset: in linear
    # mode pass 1's target_offset (from its dynamic run) only adds error
    fix = 0.0
    while True:  # the .ogg measured 0.3-0.7 dB over loudnorm's target: one static trim measured on the .ogg itself
        r = loudnorm_json(ffmpeg(["-y", "-i", trimmed, "-af", f"{PS1},{ln},volume={fix:.2f}dB,aresample={SR},"
                                  f"afade=t=out:st={dur - 0.4:.3f}:d=0.4", "-c:a", "libvorbis", "-q:a", "4", out + ".ogg"]))
        err = -16 - ebur(out + ".ogg")[0]
        if abs(err) < 0.15 or fix:
            break
        fix = err
    print(f"  trimmed {start / SR * 1000:.0f} ms of lead-in, tail {dur - last_secs:.2f} s past the last note-off; "
          f"loudnorm {r['normalization_type']}, trim {fix:+.2f} dB, input {m['input_i']} LUFS / {m['input_tp']} dBTP")
    assert r["normalization_type"] == "linear", f"{name}: loudnorm went dynamic"
    return out + ".ogg"


def ebur(path):
    s = ffmpeg(["-i", path, "-af", "ebur128=peak=true", "-f", "null", "-"]).split("Summary:")[-1]
    return float(re.search(r"I:\s+(-?[\d.]+) LUFS", s).group(1)), float(re.search(r"Peak:\s+(-?[\d.]+) dBFS", s).group(1))


def measure(path, spec):
    """Measured on the decoded .ogg, the file the game would load."""
    rate = int(subprocess.run(["ffprobe", "-v", "error", "-select_streams", "a:0", "-show_entries", "stream=sample_rate",
                               "-of", "default=nw=1:nk=1", path], capture_output=True, text=True, check=True).stdout)
    lufs, tp = ebur(path)
    raw =subprocess.run(["ffmpeg", "-v", "error", "-i", path, "-f", "f32le", "-ac", "2", "-"], capture_output=True, check=True).stdout
    x = np.frombuffer(raw, np.float32).reshape(-1, 2)
    dur = len(x) / rate
    onset = np.argmax(np.abs(x).max(1) > 10 ** (-40 / 20)) / rate
    end_db = 20 * np.log10(np.sqrt((x[-rate // 20:] ** 2).mean()) + 1e-12)
    sample_peak = 20 * np.log10(np.abs(x).max())
    print(f"  {os.path.basename(path)}: {dur:.2f} s, {rate} Hz, {lufs:.1f} LUFS, true peak {tp:.1f} dBTP, "
          f"sample peak {sample_peak:.1f} dBFS, first sound at {onset * 1000:.0f} ms, last 50 ms {end_db:.0f} dBFS")
    lo, hi = spec["window"]
    assert lo <= dur <= hi and rate == SR and abs(lufs + 16) <= 0.5 and tp < -2 and onset <= 0.05 and end_db < -60


if __name__ == "__main__":
    os.makedirs(OUT, exist_ok=True)
    with tempfile.TemporaryDirectory() as tmp:
        for name, spec in {"vitoria": VITORIA, "derrota": DERROTA, "chefe": CHEFE}.items():
            measure(render(name, spec, check(name, spec), tmp), spec)
