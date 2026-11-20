"""Battle theme for Dungeon Tactics, blind composition eval, slot E.

D minor, 128 bpm, 52 bars of 4/4 = 97.5 s, seamless loop. Everything grows from one five-note motif
(root, fifth below, root, second, third; long-short-short-short-long). Form (1-based bars):
   1-4   intro: cello/contrabass ostinato in 3+3+2 with timpani, snare roll, trumpet pickup
   5-12  theme A1: trumpet over horn pads (motif on D, then a fifth lower on G)
  13-20  theme A2: the strings take the theme over new harmony (motif climbs to C), trumpet answers
  21-28  contrast B: F major, the motif augmented on legato strings; drums thinned to kick, toms, pedal hat
         and a soft crash, with a snare roll in bar 28
  29-36  bridge: the bass climbs Bb C D Eb F G A, the motif head rises in sequence on horns, trumpet joins
         an octave up at 33, high string tremolo and snare build to a roll
  37-52  return: trumpet and strings in unison, horn stabs, backbeat snare and hats, a new ending peaking on G5;
         bar 52 sits on A and falls back into bar 1
"""
import itertools
import statistics
import subprocess
import sys
from pathlib import Path

sys.dont_write_bytecode = True  # leave no __pycache__ next to psx.py
sys.path.insert(0, str(Path(__file__).resolve().parents[2]))  # scripts/music, home of psx.py

import mido  # noqa: E402
from psx import Song, render  # noqa: E402

BPM, BARS = 128, 52
END = BARS * 4
OUT = r"D:\Projetos\_musica-tools\eval\battle\slot_E"

# one chord per bar, "F|C" splits a bar in halves; the bass and every voicing come from this table
CHORDS = """
Dm Dm Bb A
Dm Bb Gm A   Dm F|C Bb A
Dm Bb Gm C   F Gm Eb A
F Dm Bb C    F Dm Gm A
Bb C C Dm    Eb F Gm A
Dm Bb Gm A   Dm F|C Bb A
Dm Bb Gm C   F Gm Eb A
""".split()
SECTIONS = [("intro", 1, 4), ("theme A1", 5, 12), ("theme A2", 13, 20), ("contrast B", 21, 28),
            ("bridge", 29, 36), ("return A1", 37, 44), ("return A2", 45, 52)]
# part: (channel, GM program 0-based, volume, pan, allowed range); lead above pads above ostinato above bass,
# with small overlaps where the melody dips (bars 7, 15, 39, 47) and in the bridge brass vs string tremolo
SPEC = {
    "trumpet": (0, 56, 100, 76, (62, 79)),
    "horns": (1, 60, 90, 50, (53, 70)),  # pads stay in 53-67; the bridge line peaks on Bb4
    "strings": (2, 48, 96, 40, (60, 81)),
    "cello": (3, 42, 100, 86, (43, 66)),
    "contrabass": (4, 43, 92, 64, (31, 42)),
    "timpani": (5, 47, 96, 58, (38, 52)),
}
KICK, SNARE, HAT, PEDAL, OPEN, CRASH, TOM_LOW, TOM_FLOOR = 36, 38, 42, 44, 46, 49, 45, 41
TOM_RUN = [50, 50, 48, 48, 45, 45, 43, 41]
PC = {"C": 0, "D": 2, "E": 4, "F": 5, "G": 7, "A": 9, "B": 11}
ACC = {"": 0, "b": -1, "#": 1}


def section(bar):
    return next((name, bar - a) for name, a, b in SECTIONS if a <= bar <= b)


def root_pc(chord):  # read from the name, never from a voicing
    acc = chord[1:2] if chord[1:2] in ("b", "#") else ""
    return (PC[chord[0]] + ACC[acc]) % 12


def tones(chord):
    r = root_pc(chord)
    return {r, (r + (3 if chord.endswith("m") else 4)) % 12, (r + 7) % 12}


def pitch(name):  # "C#5" -> 73
    return 12 * (int(name[-1]) + 1) + PC[name[0]] + ACC[name[1:-1]]


def vel(v):
    return max(1, min(127, round(v)))


def low(pc, lo):  # the note of this pitch class in [lo, lo + 11]
    return lo + (pc - lo) % 12


SPANS = []  # (start beat, end beat, chord)
for i, cell in enumerate(CHORDS):
    names = cell.split("|")
    SPANS += [(i * 4 + j * 4 / len(names), i * 4 + (j + 1) * 4 / len(names), c) for j, c in enumerate(names)]


def chord_at(t):
    return next(c for a, b, c in SPANS if a <= t < b)


def hits(bars, pos):
    """(beat, beats to the next hit, chord) at the given in-bar positions plus every chord change."""
    times = sorted({(b - 1) * 4 + p for b in bars for p in pos} | {a for a, _, _ in SPANS if int(a // 4) + 1 in bars})
    return [(t, e - t, chord_at(t)) for t, e in zip(times, times[1:] + [bars[-1] * 4])]


def voicing(chord, prev, lo, hi):
    """Close triad inside [lo, hi] that moves least from the previous one."""
    cands = [[p for p in range(lo, hi + 1) if p % 12 == pc] for pc in sorted(tones(chord))]
    options = [sorted(v) for v in itertools.product(*cands) if max(v) - min(v) <= 12]
    if prev is None:
        return min(options, key=lambda v: abs(sum(v) / 3 - (lo + hi) / 2))
    return min(options, key=lambda v: (sum(abs(a - b) for a, b in zip(v, prev)), v[-1] - v[0]))


def chords(hit_list, lo, hi, length, velocity):
    out, prev = [], None
    for t, d, c in hit_list:
        prev = voicing(c, prev, lo, hi)
        out += [(t, length(d), p, vel(velocity(t))) for p in prev]
    return out


# the motif: chord-relative semitones ("3rd" follows the chord quality) and durations in beats
MOTIF = [0, -5, 0, 2, "3rd"]
MOTIF_DUR = [1.5, 0.5, 0.5, 0.5, 1]


def motif(root, minor=True, scale=1):  # transposed; augmented when scale > 1
    third = 3 if minor else 4
    return [(root + (third if s == "3rd" else s), d * scale) for s, d in zip(MOTIF, MOTIF_DUR)]


def head(root):  # fragment: the first three notes, the last one held a beat, then a beat of rest
    (a, da), (b, db), (c, _) = motif(root)[:3]
    return [(a, da), (b, db), (c, 1), (None, 1)]


def line(text):  # "D5 1.5 r .5 ..." -> [(pitch or None, beats)]
    tok = text.split()
    return [(None if p == "r" else pitch(p), float(d)) for p, d in zip(tok[::2], tok[1::2])]


def flat(bars):
    for b in bars:
        assert sum(d for _, d in b) % 4 == 0, b
    return [n for b in bars for n in b]


def place(seq, bar, base, gap=0.06):
    """Lay a melody from a bar: strong beats louder, short notes softer, an arch over each 4-bar phrase."""
    t, out = (bar - 1) * 4, []
    for p, d in seq:
        if p is not None:
            v = base + {0: 8, 2: 4}.get(t % 4, 0) + (4 if d >= 1.5 else 0) - (8 if d <= 0.5 else 0)
            out.append((t, d - gap, p, vel(v + (0, 2, 5, -2)[int(t // 4) % 4])))
        t += d
    return out


P = pitch
THEME_BARS = [
    motif(P("D5")),                           # Dm: the motif
    line("D5 1.5 C5 .5 Bb4 1 F4 1"),          # Bb
    motif(P("G4")),                           # Gm: the motif a fifth lower
    line("A4 2 r 1 A4 .5 C#5 .5"),            # A: half cadence and pickup
    motif(P("D5")),                           # Dm
    line("F5 1.5 G5 .5 E5 1 C5 1"),           # F|C
    line("D5 1.5 C5 .5 Bb4 .5 C5 .5 D5 1"),   # Bb
    line("E5 1.5 D5 .5 C#5 1 r 1"),           # A: the strings take the pickup
]
SECOND_BARS = [
    motif(P("D5")), line("D5 1.5 C5 .5 Bb4 1 F4 1"), motif(P("G4")),
    motif(P("C5"), minor=False),              # C: the sequence climbs a step
    line("F5 1.5 E5 .5 D5 .5 C5 .5 A4 1"),    # F
    line("Bb4 1.5 A4 .5 G4 1 D5 1"),          # Gm
    line("Eb5 1.5 D5 .5 Bb4 1 C5 1"),         # Eb: C, then C# over the A
    line("C#5 2 A4 1 r 1"),                   # A
]
CONTRAST = [
    motif(P("F4"), minor=False, scale=2),     # F, Dm: the motif augmented in F major
    line("D5 2 Bb4 1 C5 1"),                  # Bb
    line("E5 1.5 D5 .5 C5 2"),                # C
    motif(P("F5"), minor=False, scale=2),     # F, Dm: augmented again, an octave up
    line("G5 1.5 F5 .5 D5 1 Bb4 1"),          # Gm
    line("A4 1 C#5 1 E5 2"),                  # A
]
RETURN_BARS = THEME_BARS[:7] + [line("E5 1.5 D5 .5 C#5 1 A4 .5 C#5 .5")] + [
    motif(P("D5")), line("F5 1.5 D5 .5 Bb4 1 D5 1"), motif(P("G4")), motif(P("C5"), minor=False),
    line("F5 1.5 G5 .5 F5 .5 E5 .5 C5 1"),    # F
    line("D5 1.5 E5 .5 F5 1 G5 1"),           # Gm: climbing
    line("G5 2 Eb5 1 F5 1"),                  # Eb: the peak
    line("E5 1.5 D5 .5 C#5 1 A4 1"),          # A: falls back into the intro
]
BRIDGE_HORNS = [head(P("Bb3")), head(P("C4")), motif(P("C4"), minor=False), head(P("D4")),
                head(P("Eb4")), head(P("F4")), motif(P("G4")), line("C#4 4")]
BRIDGE_TRUMPET = [head(P("Eb5")), head(P("F5")), line("G5 1.5 D5 .5 G5 .5 F5 .5 E5 1"),
                  line("E5 2 r 1 A4 .5 C#5 .5")]


def build():
    trumpet = (place(line("r 3 A4 .5 C#5 .5"), 4, 78) + place(flat(THEME_BARS), 5, 90)
               + place(line("r 2 A4 .5 C#5 .5 E5 1"), 20, 84) + place(flat(BRIDGE_TRUMPET), 33, 94)
               + place(flat(RETURN_BARS), 37, 100))
    melody = (place(line("r 3 A4 .5 C#5 .5"), 12, 80, .03) + place(flat(SECOND_BARS), 13, 86, .03)
              + place(flat(CONTRAST), 21, 74, .03) + place(line("r 3 A4 .5 C#5 .5"), 36, 92, .03)
              + place(flat(RETURN_BARS), 37, 96, .03))
    # high tremolo-like eighths over the bridge, growing; stops on beat 3 of bar 36 for the pickup
    tremolo = chords([h for h in hits(range(29, 37), [i / 2 for i in range(8)]) if h[0] < 143], 62, 76,
                     lambda d: .42, lambda t: 44 + (t - 112) * 1.6 + (8 if t % 4 in (0, 1.5, 3) else 0))

    horns = (chords(hits(range(3, 5), (0,)), 53, 67, lambda d: d - .05, lambda t: 50 + 10 * (t >= 12))
             + chords(hits(range(5, 13), (0,)), 53, 67, lambda d: d - .05, lambda t: 58 + 5 * (t % 16 == 0))
             + chords(hits(range(13, 21), (0, 2)), 53, 67, lambda d: d - .05, lambda t: 62 - 4 * (t % 4 == 2))
             + chords(hits(range(21, 29), (0, 2)), 53, 67, lambda d: d - .05, lambda t: 56 - 4 * (t % 4 == 2)))
    for i, seq in enumerate(BRIDGE_HORNS):
        horns += place(seq, 29 + i, 62 + 5 * i, .08)
    # the return gets its weight from short brass stabs on the 3+3+2 accents
    horns += chords(hits(range(37, 53), (0, 1.5, 3)), 53, 67, lambda d: min(d, 1.2) * .7,
                    lambda t: {0: 94, 1.5: 76}.get(t % 4, 84))

    cello = []
    ost, ost_v = [0, 0, 7, 0, 0, 7, 0, 12], [100, 58, 76, 94, 56, 80, 92, 70]  # 3+3+2 accents
    for bar in range(1, BARS + 1):
        b0, (name, k) = (bar - 1) * 4, section(bar)
        if name == "contrast B":  # the motif rhythm, slower and legato
            for p, off, d, v in ((0, 0, 1.4, 72), (1.5, 7, .45, 54), (2, 12, .9, 64), (3, 7, .9, 58)):
                cello.append((b0 + p, d, low(root_pc(chord_at(b0 + p)), 43) + off, v))
        elif name == "bridge" and bar < 35:
            for i in range(8):
                t = b0 + i / 2
                cello.append((t, .42, low(root_pc(chord_at(t)), 43) + 12 * (i == 7),
                              vel((64 + 4 * k) * (1 if i in (0, 3, 6) else .75))))
        elif name == "bridge":  # sixteenths for the last two bars of tension
            for i in range(16):
                t = b0 + i / 4
                cello.append((t, .2, low(root_pc(chord_at(t)), 43), vel(70 + 10 * (bar - 35) + i)))
        else:
            scale = {"intro": .7 + .06 * k, "theme A1": .86, "theme A2": .9}.get(name, 1.0)
            for i in range(8):
                t = b0 + i / 2
                cello.append((t, .44, low(root_pc(chord_at(t)), 43) + ost[i], vel(ost_v[i] * scale)))

    bass = []
    for name, a, b in SECTIONS:
        bars = range(a, b + 1)
        if name == "contrast B":
            bass += [(t, d - .2, low(root_pc(c), 31), vel(70 if t % 4 == 0 else 60)) for t, d, c in hits(bars, (0, 2))]
        elif name == "bridge":
            for t, d, c in hits(range(29, 35), (0, 1, 2, 3)) + hits(range(35, 37), [i / 2 for i in range(8)]):
                bass.append((t, d * .8, low(root_pc(c), 31), vel(70 + (t - 112) * .8)))
        else:
            base = {"intro": 72, "theme A1": 84, "theme A2": 86}.get(name, 94)
            for t, d, c in hits(bars, (0, 1.5, 3)):
                bass.append((t, max(.3, d - .25), low(root_pc(c), 31), vel(base + {0: 8, 1.5: -8}.get(t % 4, 0))))

    timpani = []

    def tp(t, d, v, fifth=False):
        r = low(root_pc(chord_at(t)), 38)
        timpani.append((t, d, (r + 7 if r + 7 <= 52 else r - 5) if fifth else r, vel(v)))

    def troll(t0, t1, v0, v1):
        n = round((t1 - t0) * 4)
        for i in range(n):
            tp(t0 + i / 4, .2, v0 + (v1 - v0) * i / max(1, n - 1))

    for bar in range(1, BARS + 1):
        b0, (name, k) = (bar - 1) * 4, section(bar)
        if name == "intro":
            if bar < 4:
                tp(b0, 1.5 if bar == 1 else 1, (92, 78, 72)[k])
                if bar > 1:
                    tp(b0 + 3, .8, 60, fifth=True)
            else:
                troll(b0 + 1, b0 + 4, 44, 96)
        elif name == "contrast B":
            tp(b0, 1 if bar == 28 else 1.8, 58 + 6 * (k % 4 == 0))
            if bar == 28:
                troll(b0 + 2, b0 + 4, 42, 84)
        elif name == "bridge":
            if bar < 35:
                tp(b0, .9, 62 + 5 * k)
                tp(b0 + 2, .9, 56 + 5 * k)
            else:
                troll(b0, b0 + (4 if bar == 35 else 3), 60 if bar == 35 else 86, 86 if bar == 35 else 104)
                if bar == 36:
                    tp(b0 + 3, .8, 100)
        else:
            ret = name.startswith("return")
            tp(b0, .9, (96 if ret else 86) if k % 4 == 0 else (86 if ret else 74))
            if ret:
                tp(b0 + 1.5, .45, 70)  # short, so it never runs into the roll at beat 2 of bar 52
            if bar in (20, 52):
                troll(b0 + 2, b0 + 4, 56, 98)
            else:
                tp(b0 + 3, .8, 78 if ret else 60, fifth=True)

    drums = []

    def hit(t, n, v):
        drums.append((t, .25, n, vel(v)))

    def roll(t0, t1, n, v0, v1, step=.25):
        k = round((t1 - t0) / step)
        for i in range(k):
            hit(t0 + i * step, n, v0 + (v1 - v0) * i / max(1, k - 1))

    for bar in range(1, BARS + 1):
        b0, (name, k) = (bar - 1) * 4, section(bar)
        if name == "intro":  # the pulse keeps going across the loop seam
            if bar == 1:
                hit(b0, CRASH, 88)
            for p, v in ((0, 78), (1.5, 54), (3, 64)):
                if bar < 4 or p == 0:
                    hit(b0 + p, KICK, v)
            if bar < 4:
                for i in range(8):
                    hit(b0 + i / 2, HAT, 34 if i % 2 == 0 else 24)
            else:
                roll(b0 + 1, b0 + 4, SNARE, 36, 96)
        elif name == "contrast B":  # thinned: kick, toms, pedal hat
            if k % 4 == 0:
                hit(b0, CRASH, 62)
            hit(b0, KICK, 76)
            hit(b0 + 1, PEDAL, 34)
            hit(b0 + 1.5, TOM_LOW, 50)
            hit(b0 + 3, PEDAL, 30)
            if bar == 28:
                roll(b0 + 2, b0 + 4, SNARE, 40, 90)
            else:
                hit(b0 + 3, TOM_FLOOR, 56)
        elif name == "bridge":
            hit(b0, KICK, 86)
            hit(b0 + 2, KICK, 80)
            if bar <= 32:
                hit(b0 + 1, SNARE, 56 + 7 * k)
                hit(b0 + 3, SNARE, 60 + 7 * k)
                for i in range(8):
                    hit(b0 + i / 2, HAT, 38 if i % 2 == 0 else 26)
            elif bar <= 34:
                roll(b0, b0 + 4, SNARE, 50 + 18 * (k - 4), 68 + 18 * (k - 4), step=.5)
            elif bar == 35:
                roll(b0, b0 + 4, SNARE, 56, 90)
            else:
                roll(b0, b0 + 2, SNARE, 88, 104)
                for i, n in enumerate(TOM_RUN):
                    hit(b0 + 2 + i / 4, n, 84 + 3 * i)
        else:
            ret = name.startswith("return")
            fill = 2 if bar in (20, 52) else 3 if k % 4 == 3 else 4  # beat where the bar's fill starts
            if k % 4 == 0:
                hit(b0, CRASH, 94 if ret else 84)
            for p, v in zip((0, 1.5, 3), (100, 80, 88) if ret else (92, 70, 80)):
                if p < fill:
                    hit(b0 + p, KICK, v)
            if ret and bar % 2 and fill == 4:
                hit(b0 + 3.5, KICK, 68)
            for p, v in ((1, 92), (3, 86)) if ret else ((2, 86),):  # the return doubles the backbeat
                if p < fill:
                    hit(b0 + p, SNARE, v)
            if name != "theme A1" and fill == 4:
                hit(b0 + 3.75, SNARE, 30)
            for i in range(8):
                if i / 2 < fill:
                    accent = i % 2 == 0
                    note = OPEN if ret and bar % 2 == 0 and i == 7 else HAT
                    hit(b0 + i / 2, note, (58 if accent else 40) if ret else (48 if accent else 32))
            if fill == 2:
                for i, n in enumerate(TOM_RUN):
                    hit(b0 + 2 + i / 4, n, 64 + 5 * i)
            elif fill == 3:
                roll(b0 + 3, b0 + 4, SNARE, 56, 88)

    parts = {"trumpet": trumpet, "horns": horns, "strings": melody + tremolo, "cello": cello,
             "contrabass": bass, "timpani": timpani}
    return parts, drums, trumpet + melody


def check(parts, drums, lead):
    secs = END * 60 / BPM
    assert len(CHORDS) == BARS and 80 <= secs <= 130
    print(f"length: {BARS} bars x 4 beats x 60 / {BPM} bpm = {secs:.3f} s")
    everything = [n for ns in parts.values() for n in ns] + drums
    for name, notes in list(parts.items()) + [("drums", drums)]:
        lo, hi = SPEC[name][4] if name in SPEC else (35, 81)
        for t, d, p, v in notes:
            assert isinstance(p, int) and lo <= p <= hi, (name, t, p)
            assert isinstance(v, int) and 1 <= v <= 127, (name, t, v)
            assert t >= 0 and d > 0 and t + d <= END + 1e-9, (name, t, d)
        by_pitch = sorted(notes, key=lambda n: (n[2], n[0]))
        for x, y in zip(by_pitch, by_pitch[1:]):
            assert x[2] != y[2] or y[0] >= x[0] + x[1] - 1e-9, (name, "same pitch overlaps", x, y)
    assert abs(max(t + d for t, d, _, _ in everything) - END) < 1e-9, "nothing ends on the last beat"
    print("ranges, velocities, bar bounds, same-pitch overlaps: ok; last note ends on beat", END)

    pitched = [n for ns in parts.values() for n in ns]
    for a, _, c in SPANS:
        sounding = [p for t, d, p, _ in pitched if t <= a + 1e-9 < t + d]
        assert sounding and min(sounding) % 12 == root_pc(c), (a / 4 + 1, c, sorted(sounding))
    print(f"root check: the lowest sounding note is the chord root at all {len(SPANS)} chord onsets")

    warn = [(int(t // 4) + 1, t % 4, name, p) for name in ("trumpet", "strings", "horns")
            for t, d, p, _ in parts[name] if d >= .9 and t % 4 in (0, 2) and p % 12 not in tones(chord_at(t))]
    print("long strong-beat non-chord tones (bar, beat, part, pitch):", warn or "none")
    sig = {}
    for t, d, p, _ in lead:
        sig.setdefault(int(t // 4) + 1, set()).add((round(t % 4, 3), p))
    seen, repeats = [], 0
    for bar in sorted(sig):
        s = frozenset(sig[bar])
        repeats += s in seen
        seen.append(s)
    print(f"lead: {len(sig)} bars with melody, {repeats} literally repeat an earlier bar")

    print("register by section (min-max MIDI):")
    print(" " * 13 + "".join(f"{n:>12}" for n in parts))
    for sname, a, b in SECTIONS:
        row = []
        for notes in parts.values():
            ps = [p for t, _, p, _ in notes if (a - 1) * 4 <= t < b * 4]
            row.append(f"{min(ps)}-{max(ps)}" if ps else "-")
        print(f"  {sname:<11}" + "".join(f"{r:>12}" for r in row))
    print("velocity per part (min / max / mean / stdev):")
    for name, notes in list(parts.items()) + [("drums", drums)]:
        vs = [v for *_, v in notes]
        print(f"  {name:<11}{min(vs):>4}{max(vs):>5}{statistics.mean(vs):>7.1f}{statistics.pstdev(vs):>7.1f}"
              f"   ({len(notes)} notes)")


def loudness(start=None, dur=None):
    cut = ["-ss", f"{start:.3f}", "-t", f"{dur:.3f}"] if start is not None else []
    err = subprocess.run(["ffmpeg", "-hide_banner", "-nostats", *cut, "-i", OUT + ".ogg", "-af", "volumedetect",
                          "-f", "null", "-"], capture_output=True, text=True).stderr
    vals = {k: float(x.split(":")[1].split()[0]) for x in err.splitlines() for k in ("mean_volume", "max_volume")
            if k in x}
    return vals["mean_volume"], vals["max_volume"]


def after_render():
    secs = END * 60 / BPM
    mid = mido.MidiFile(OUT + ".mid").length
    dur = float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0",
                                OUT + ".ogg"], capture_output=True, text=True, check=True).stdout)
    print(f"midi length {mid:.3f} s, ogg duration {dur:.3f} s, formula {secs:.3f} s")
    assert abs(mid - secs) < .01 and abs(dur - secs) < .05
    bar_s = 4 * 60 / BPM
    for label, start, bars in (("whole", None, None), ("intro 1-2", 0, 2), ("contrast 21-28", 20 * bar_s, 8),
                               ("bridge 29-32", 28 * bar_s, 4), ("return 37-44", 36 * bar_s, 8)):
        mean, peak = loudness(start, bars and bars * bar_s)
        print(f"  {label:<15} mean {mean:6.1f} dB   max {peak:6.1f} dB")
        assert mean > -40, f"{label} is near silent"


def main():
    parts, drums, lead = build()
    check(parts, drums, lead)
    song = Song(bpm=BPM, bars=BARS)
    for name, notes in parts.items():
        ch, prog, volume, pan, _ = SPEC[name]
        song.add(channel=ch, program=prog, notes=notes, volume=volume, pan=pan)
    song.drum(drums, volume=92)
    print("wrote", render(song, OUT, soundfont="MuseScore_General"))
    after_render()


if __name__ == "__main__":
    main()
