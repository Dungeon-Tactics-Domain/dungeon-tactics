"""Slot B: "Hearth Road", an original pastoral folk-fantasy loop in E minor (relative G major in the middle).

Form (40 bars, 76 bpm = 126.3 s): intro 1-4, theme A 5-12, varied theme A' 13-20 (harp + strings join),
contrast B 21-28 (G major, oboe, new lead built from the theme head turned upside down), return 29-36, coda/turnaround 37-40.
Motif: E G B A (up a minor third, up a major third, step back). It reappears in the harp (intro), inverted in B, ornamented in A'.
"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
from psx import Song, render  # noqa: E402

BPM = 76
OUT = r"D:\Projetos\_musica-tools\eval\slot_B"

# --- harmony: one chord per bar -------------------------------------------------------------
SECTIONS = [
    ("intro", ["Em", "C", "Am", "B7"]),
    ("A", ["Em", "C", "G", "D", "Am", "Em", "C", "B7"]),
    ("A2", ["Em", "C", "G", "D", "Am", "Em", "C", "B7"]),
    ("B", ["G", "D/F#", "Em", "Cmaj7", "Am", "Bm", "C", "D"]),
    ("R", ["Em", "C", "G", "D", "Am", "Em", "C", "B7"]),
    ("coda", ["C", "Am", "Bsus", "B7"]),
]
PLAN = [(name, ch) for name, chords in SECTIONS for ch in chords]
BARS = len(PLAN)
SCALE = {"intro": 0.7, "A": 0.9, "A2": 1.0, "B": 0.85, "R": 1.05, "coda": 0.75}

GTR = {  # guitar voicings, low to high
    "Em": [52, 59, 64, 67], "C": [48, 55, 60, 64], "G": [55, 62, 67, 71], "D": [50, 57, 62, 66],
    "Am": [52, 57, 60, 64], "B7": [54, 59, 63, 69], "D/F#": [54, 57, 62, 66], "Cmaj7": [48, 55, 59, 64],
    "Bm": [54, 59, 62, 66], "Bsus": [54, 59, 64, 66],
}
ROOT = {"Em": 40, "C": 36, "G": 43, "D": 38, "Am": 45, "B7": 47, "D/F#": 42, "Cmaj7": 36, "Bm": 47, "Bsus": 47}

# --- melodies, one string per bar ("name:beats", r = rest; every bar sums to 4 beats) ------------
A = ["E5:1.5 G5:.5 B5:1 A5:1", "G5:1.5 E5:.5 G5:1 E5:1", "D5:1 G5:1 B5:1.5 A5:.5", "F#5:2 E5:.5 D5:.5 r:1",
     "C5:1 E5:1 A5:1.5 G5:.5", "B5:2 G5:1 E5:1", "E5:1.5 G5:.5 E5:1 D5:1", "F#5:1 D#5:1 A5:1 B5:1"]
A2 = ["B4:.5 E5:1 G5:.5 B5:1 A5:.5 G5:.5", "G5:1 E5:.5 G5:.5 C6:1.5 B5:.5", "D5:.5 G5:.5 B5:1 D6:1 B5:.5 A5:.5",
      "F#5:2 E5:.5 D5:.5 F#5:1"] + A[4:]
B = ["B5:1.5 G5:.5 D5:1 E5:1", "F#5:1 A5:1 D6:1.5 A5:.5", "G5:1.5 B5:.5 G5:1 E5:1", "E5:1 G5:1 B5:2",
     "A5:1.5 E5:.5 C5:1 E5:1", "D5:1 F#5:1 B5:1.5 A5:.5", "G5:1.5 E5:.5 C5:1 D5:1", "F#5:1.5 A5:.5 A5:1 B5:1"]
R = A2[:4] + ["C5:1 E5:1 A5:2", "B5:1.5 G5:.5 E5:2", "E5:1.5 G5:.5 C6:1 B5:1", "A5:1 F#5:1 D#5:1 B4:1"]
CODA = ["G5:2 E5:2", "E5:1.5 C5:.5 A4:2", "F#5:3 r:1", "D#5:1 F#5:1 B5:2"]

N = {"C": 0, "D": 2, "E": 4, "F": 5, "G": 7, "A": 9, "B": 11}


def pitch(name):
    p, i = N[name[0]], 1
    if name[i] == "#":
        p, i = p + 1, i + 1
    return p + 12 * (int(name[i:]) + 1)


def melody(bars, scale_of):
    """bars: list of bar strings or None, one per song bar."""
    out = []
    for b, text in enumerate(bars):
        if text is None:
            continue
        t = 0.0
        for tok in text.split():
            name, ln = tok.split(":")
            ln = float(ln)
            if name != "r":
                s = scale_of[b]
                out.append((b * 4 + t, ln * 0.95 if ln >= 1 else ln, pitch(name), min(120, round((80 if ln >= 1.5 else 68) * s))))
            t += ln
        assert abs(t - 4) < 1e-9, (b, text, t)
    return out


sc = [SCALE[n] for n, _ in PLAN]
sc[-4:] = [0.8, 0.75, 0.7, 0.72]  # coda fades, then the loop lifts back into the intro
flute = melody([None] * 4 + A + A2 + [None] * 8 + R + CODA, sc)
oboe = melody([None] * 20 + B + [None] * 12, sc)

# --- accompaniment ----------------------------------------------------------------------------
guitar, bass, harp, pad, drums = [], [], [], [], []
for b, (sec, ch) in enumerate(PLAN):
    s, v, r0 = SCALE[sec] if b < BARS - 4 else sc[b], GTR[ch], b * 4
    pat = [0, 2, 1, 3, 2, 1, 3, 2] if sec == "B" else [0, 1, 2, 3, 2, 1, 2, 3] if sec != "intro" else [0, 1, 2, 3, 2, 1, 2, 1]
    for i, k in enumerate(pat):  # eighth-note arpeggio, accent on the pulse
        guitar.append((r0 + i * 0.5, 0.8 if i < 7 else 0.5, v[k], round([74, 52, 60, 52, 66, 52, 60, 52][i] * s)))
    r = ROOT[ch]
    nr = ROOT[PLAN[(b + 1) % BARS][1]]
    if sec == "intro" and b < 2:
        pass  # guitar alone first
    elif sec == "B":
        bass += [(r0, 1, r, round(76 * s)), (r0 + 1.5, .5, r + 7, round(58 * s)), (r0 + 2, 1, r + 12, round(66 * s)), (r0 + 3, 1, r + 7, round(56 * s))]
    else:
        app = nr - 1 if nr > r else nr + 1  # chromatic approach to the next root
        bass += [(r0, 1.5, r, round(80 * s)), (r0 + 2, 1, r + 7, round(62 * s)), (r0 + 3.5, .5, app, round(54 * s))]
    if sec in ("A2", "R"):  # harp answers the lead: two high plucks per bar
        harp += [(r0, 2, v[2] + 12, round(58 * s)), (r0 + 3, 1, v[3] + 12, round(50 * s))]
    if sec in ("A2", "B", "R", "coda"):  # strings hold the chord
        pad += [(r0, 3.95, p, round(42 * s)) for p in v[1:]]
    # light folk percussion: 64 low conga, 63 hi conga, 54 tambourine, 70 maracas, 69 cabasa, 60 hi bongo
    pos = b - sum(len(c) for n, c in SECTIONS[: [n for n, _ in SECTIONS].index(sec)])  # bar within section
    if sec == "intro":
        if b >= 2:
            drums += [(r0 + i * 0.5 + 0.5, .25, 70, 30) for i in range(0, 8, 2)]
    elif sec == "B":
        drums += [(r0, .25, 64, 60), (r0 + 2, .25, 64, 48)] + [(r0 + i * 0.5, .25, 69, 24 if i % 2 else 32) for i in range(8)]
    elif sec == "coda":
        if pos < 3:
            drums += [(r0, .25, 64, 56), (r0 + 2.5, .25, 63, 42)] if pos < 2 else [(r0, .25, 64, 40)]
        else:  # fill that pushes back into the intro
            drums += [(r0 + 2 + i * 0.5, .25, 63 if i % 2 else 64, 44 + i * 8) for i in range(4)]
    else:
        drums += [(r0, .25, 64, 72), (r0 + 1.5, .25, 63, 50), (r0 + 2.5, .25, 64, 62)]
        drums += [(r0 + i * 0.5, .25, 70, 34 if i % 2 else 26) for i in range(8)]
        if sec != "A":
            drums += [(r0 + 1, .25, 54, 46), (r0 + 3, .25, 54, 50)]
        if pos == 7:
            drums += [(r0 + 3.5, .25, 60, 60)]
# motif statement in the intro: the harp whispers the theme head over the last two intro bars
harp += [(8, 1.5, pitch("E5"), 50), (9.5, .5, pitch("G5"), 46), (10, 1, pitch("B5"), 52), (11, 1, pitch("A5"), 44),
         (12, 1.5, pitch("F#5"), 50), (13.5, .5, pitch("D#5"), 44), (14, 2, pitch("B4"), 46)]
# ^ placed at beats 8..16 = bars 3-4 of the intro (0-based bars 2 and 3)

s = Song(bpm=BPM, bars=BARS)
s.add(0, 24, guitar, volume=92, pan=48)   # nylon guitar
s.add(1, 73, flute, volume=100, pan=70)   # flute lead
s.add(2, 32, bass, volume=96, pan=60)     # acoustic bass
s.add(3, 46, harp, volume=90, pan=82)     # harp
s.add(4, 49, pad, volume=78, pan=40)      # slow strings
s.add(5, 68, oboe, volume=100, pan=70)    # oboe lead in the contrast section
s.drum(drums, volume=88)

if __name__ == "__main__":
    print("bars", BARS, "expected seconds", BARS * 4 * 60 / BPM)
    # checks: ranges, same-pitch overlaps, sustained lead notes clashing with the harmony
    parts = {"guitar": guitar, "flute": flute, "bass": bass, "harp": harp, "pad": pad, "oboe": oboe}
    for name, notes in parts.items():
        ps = [n[2] for n in notes]
        end = max(n[0] + n[1] for n in notes)
        assert end <= BARS * 4 + 1e-9, (name, end)
        by = {}
        for bt, ln, p, vel in sorted(notes):
            assert 1 <= vel <= 127
            assert by.get(p, -1) <= bt + 1e-9, (name, "overlap", p, bt)
            by[p] = bt + ln
        print(name, "notes", len(notes), "range", min(ps), max(ps), "vel", min(n[3] for n in notes), max(n[3] for n in notes))
    clashes = 0
    for lead in (flute, oboe):
        for bt, ln, p, _ in lead:
            if ln < 1:
                continue
            for other in (guitar, bass, pad):
                for ob, ol, op, _ in other:
                    if ob <= bt + 1e-9 < ob + ol - 1e-9 and (p - op) % 12 in (1, 11):
                        clashes += 1
                        print("clash", "beat", bt, "lead", p, "vs", op)
    print("sustained-note semitone clashes:", clashes)
    print("wrote", render(s, OUT, soundfont="MuseScore_General"))
