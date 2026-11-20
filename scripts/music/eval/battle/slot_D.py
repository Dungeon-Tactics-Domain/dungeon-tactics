"""Battle theme, slot D: D minor, 132 bpm, 56 bars (~1:42); the last bar is the A dominant, which leads back to the Dm intro.
Form: intro 4 | A 16 (brass, then oboe/brass trade) | B 12 (lyrical, harp) | bridge 8 (build) | A' 16 (full + variation).
Motif m = up a fourth then a third (A-D-F over Dm), sequenced in A, inverted in the final 8 bars."""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))
from psx import Song, render  # noqa: E402

BPM, BARS = 132, 56
OUT = r"D:\Projetos\_musica-tools\eval\battle\slot_D"
PC = {"D": 2, "Bb": 10, "C": 0, "A": 9, "G": 7, "F": 5, "E": 4}
# (root name, quality)
Dm, Bb, C, A, Gm, F, Edim = ("D", "m"), ("Bb", "M"), ("C", "M"), ("A", "M"), ("G", "m"), ("F", "M"), ("E", "dim")
INTRO = [Dm, Dm, Bb, A]
APROG = [Dm, Bb, C, A, Dm, Gm, A, A]
BPROG = [F, C, Gm, Dm, Bb, F, Gm, A, Bb, C, A, A]
BRIDGE = [Gm, Gm, Bb, Bb, Edim, Edim, A, A]
EPROG = [Dm, Bb, Gm, A, Dm, Bb, A, A]
CHORDS = INTRO + APROG + APROG + BPROG + BRIDGE + APROG + EPROG
assert len(CHORDS) == BARS
SEC = [("intro", 4), ("A1", 8), ("A2", 8), ("B", 12), ("bridge", 8), ("Ap", 8), ("Ae", 8)]
KIND = [(k, i) for k, n in SEC for i in range(n)]  # per bar: (section, bar within section)


def m(a, b, c):
    return [(0, 1.5, a), (1.5, .5, b), (2, 2, c)]


# melodies: per bar, list of (beat, len, pitch)
MEL_A = [m(69, 74, 77), m(65, 70, 74), m(67, 72, 76),
         [(0, 1, 76), (1, .5, 74), (1.5, .5, 73), (2, 1, 74), (3, 1, 76)],
         [(0, 1, 81), (1, .5, 79), (1.5, .5, 77), (2, 2, 74)],
         [(0, 1.5, 74), (1.5, .5, 72), (2, 1, 70), (3, 1, 67)],
         [(0, 1, 69), (1, 1, 73), (2, 1, 76), (3, 1, 73)],
         [(0, 3, 69)]]
MEL_E = [m(81, 76, 74), m(77, 74, 70), m(74, 70, 67),
         [(0, 1, 73), (1, 1, 76), (2, 2, 81)],
         m(74, 77, 81), m(79, 77, 74),
         [(0, 1, 76), (1, 1, 73), (2, 1, 69), (3, 1, 73)],
         [(0, 2, 76), (2, 1, 73), (3, 1, 69)]]
MEL_B = [[(0, 2, 72), (2, 1, 74), (3, 1, 77)], [(0, 3, 76), (3, 1, 74)], [(0, 2, 74), (2, 1, 70), (3, 1, 74)],
         [(0, 1.5, 77), (1.5, .5, 76), (2, 2, 74)], [(0, 2, 74), (2, 2, 77)], [(0, 2, 77), (2, 2, 81)],
         [(0, 2, 82), (2, 1, 81), (3, 1, 79)], [(0, 2, 81), (2, 2, 76)], [(0, 3, 77), (3, 1, 74)],
         [(0, 2, 79), (2, 2, 76)], [(0, 2, 73), (2, 2, 76)], [(0, 3, 69)]]
MEL_BR = [m(70, 74, 79), m(70, 74, 77), m(74, 77, 82), m(74, 77, 79), m(76, 79, 82),
          [(0, 1, 79), (1, 1, 82), (2, 2, 79)], [(0, 1, 76), (1, 1, 81), (2, 1, 76), (3, 1, 73)], [(0, 1, 81)]]


def pcs(ch):
    r = PC[ch[0]]
    return [r, (r + (4 if ch[1] == "M" else 3)) % 12, (r + (6 if ch[1] == "dim" else 7)) % 12]


def fit(pc, lo, hi):
    p = pc + 12 * (lo // 12)
    while p < lo:
        p += 12
    assert p <= hi
    return p


def dyn(bar):
    k, i = KIND[bar]
    return {"intro": [.65, .65, .75, .8][i] if k == "intro" else 0, "A1": .85, "A2": .95, "B": .72 + .01 * i,
            "bridge": .75 + .04 * i, "Ap": 1.0, "Ae": 1.05}[k]


def vel(base, bar, accent=0):
    return max(1, min(127, round(base * dyn(bar) + accent)))


bass, cello, pad, brass, oboe, horn, timp, harp = ([] for _ in range(8))
prev = None
for b, ch in enumerate(CHORDS):
    k, i = KIND[b]
    t0 = b * 4
    r = PC[ch[0]]
    br = fit(r, 36, 47)
    fifth = br + 7
    # bass: enters at bar 2; sustained in B; ostinato in A; eighth drive in bridge and A'
    if k == "intro" and b < 2:
        pass
    elif k == "B":
        bass += [(t0, 2, br, vel(88, b)), (t0 + 2, 1, fifth, vel(70, b)), (t0 + 3, 1, br, vel(72, b))]
    elif k in ("A1", "A2", "intro"):
        bass += [(t0, 1.5, br, vel(95, b)), (t0 + 1.5, .5, br, vel(75, b)), (t0 + 2, 1, br, vel(88, b)),
                 (t0 + 3, .5, br, vel(75, b)), (t0 + 3.5, .5, fifth, vel(80, b))]
    else:
        for e in range(8):
            p = br + 12 if (e in (2, 6) and br + 12 <= 52) else br
            bass.append((t0 + e / 2, .45, p, vel(96 if e == 0 else 78, b)))
    # cello ostinato everywhere but B
    if k != "B":
        cr = br + 12
        for e, p in enumerate([cr, cr + 7, cr + 12, cr + 7] * 2):
            cello.append((t0 + e / 2, .5, p, vel(78 if e % 4 == 0 else 62, b)))
    # strings pad, voice-led (minimal total motion between consecutive triads)
    if not (k == "intro" and b < 2):
        tones = sorted({p for pc_ in pcs(ch) for p in (pc_ + 48, pc_ + 60) if 52 <= p <= 68})
        best = None
        for x in tones:
            for y in tones:
                for z in tones:
                    if not (x < y < z) or z - x > 12 or {x % 12, y % 12, z % 12} != set(pcs(ch)):
                        continue
                    cost = 0 if prev is None else sum(abs(u - v) for u, v in zip((x, y, z), prev))
                    if best is None or cost < best[0]:
                        best = (cost, (x, y, z))
        prev = best[1]
        pad += [(t0, 3.95, p, vel(58 if k != "B" else 66, b)) for p in prev]
    # timpani
    tr = fit(r, 40, 52)
    if k == "intro":
        timp += [(t0, .75, tr, vel(100, b)), (t0 + 2, .75, tr, vel(90, b))]
        if b == 3:
            timp += [(t0 + 3 + j / 4, .25, tr, vel(70 + 10 * j, b)) for j in range(4)]
    elif k in ("A1", "A2", "Ap", "Ae"):
        timp += [(t0, .75, tr, vel(100, b)), (t0 + 2.5, .5, tr, vel(80, b)), (t0 + 3.5, .5, tr, vel(70, b))]
    elif k == "B":
        timp += [(t0, 1.5, tr, vel(62, b))] + ([(t0 + 2, 1, tr, vel(50, b))] if i % 2 else [])
    elif i < 6:
        timp += [(t0, .5, tr, vel(100, b)), (t0 + 1.5, .5, tr, vel(80, b)), (t0 + 2, .5, tr, vel(90, b)),
                 (t0 + 3.5, .5, tr, vel(80, b))]
    else:
        timp += [(t0 + j / 4, .25, tr, min(127, 62 + (i - 6) * 28 + 3 * j)) for j in range(16)]
    # harp arpeggio: lyrical B, shimmer in the final 8 bars
    if k in ("B", "Ae"):
        base = sorted(fit(pc_, 43, 54) for pc_ in pcs(ch))
        tl = base + [p + 12 for p in base]
        for e, idx in enumerate([0, 1, 2, 3, 4, 3, 2, 1]):
            harp.append((t0 + e / 2, .5, tl[idx], vel(60 if k == "B" else 50, b, 8 if e == 0 else 0)))


def harmony(p, ch):
    # highest chord tone at least a minor third below the melody note
    return [x for x in range(50, p - 2) if x % 12 in pcs(ch)][-1]


def put(track, bar0, mel, v, harm=None):
    for j, notes in enumerate(mel):
        b = bar0 + j
        for beat, ln, p in notes:
            acc = 5 if beat == 0 else 0
            track.append((b * 4 + beat, ln * .92, p, vel(v, b, acc)))
            if harm is not None:
                harm.append((b * 4 + beat, ln * .92, harmony(p, CHORDS[b]), vel(v - 18, b, acc)))


put(brass, 4, MEL_A, 92)
put(oboe, 12, MEL_A[:4], 80, harm=horn)
put(brass, 16, MEL_A[4:], 90)
put(oboe, 16, MEL_A[4:], 76, harm=horn)
put(oboe, 20, MEL_B, 78)
put(brass, 32, MEL_BR, 88)
put(brass, 40, MEL_A, 96)
put(oboe, 40, MEL_A, 82, harm=horn)
put(brass, 48, MEL_E, 98)
put(oboe, 48, MEL_E, 84, harm=horn)
horn += [(8, 1.5, 69, 74), (9.5, .5, 74, 70), (10, 2, 72, 72)]  # intro call over Bb, answers the cello
horn += [(30 * 4, 4, 62, 56), (31 * 4, 4, 57, 58)]  # B: sustained horn into the bridge

# drums (GM: 36 kick, 38 snare, 37 side stick, 42/46 hats, 41/47/50 toms, 49 crash, 51 ride)
dr = []
for b in range(BARS):
    k, i = KIND[b]
    t0 = b * 4

    def d(o, n, v, t0=t0, b=b):
        dr.append((t0 + o, .25, n, min(127, round(v * dyn(b)))))

    if k == "intro":
        if b < 2:
            d(0, 41, 100)
            d(2, 41, 90)
            if b:
                d(3, 47, 70)
        elif b == 2:
            d(0, 36, 95)
            d(2, 36, 90)
            for o in (0, 1, 2, 3):
                d(o, 42, 60)
        else:
            for j, o in enumerate((0, 1, 2, 2.5, 3, 3.25, 3.5, 3.75)):
                d(o, 38, 60 + 10 * j)
    elif k in ("A1", "A2", "Ap", "Ae"):
        for o in (0, 2, 2.5) + ((3.5,) if k in ("Ap", "Ae") else ()):
            d(o, 36, 100 if o == 0 else 85)
        d(1, 38, 100)
        d(3, 38, 100)
        for e in range(8):
            if k != "A1" and e == 7:
                d(3.5, 46, 70)
            else:
                d(e / 2, 42, 68 if e % 2 == 0 else 48)
        if i == 0 or (i == 4 and k != "A1"):
            d(0, 49, 105)
        if i % 4 == 3:
            for j, n in enumerate((47, 47, 41, 41)):
                d(3 + j / 4, n, 85 + 3 * j)
    elif k == "B":
        d(0, 36, 80)
        d(2, 36, 70)
        for o in (1, 3):
            d(o, 37, 70)
        for o in (0, 1, 2, 3):
            d(o, 51, 60)
        if i == 0:
            d(0, 49, 80)
        if i in (3, 7, 11):
            for j, n in enumerate((50, 47, 41, 41)):
                d(3 + j / 4, n, 80 + 4 * j)
    elif i < 4:
        d(0, 36, 95)
        d(2, 36, 90)
        d(1.5, 41, 80)
        d(3, 38, 90)
        for o in (0, 1, 2, 3):
            d(o, 42, 62)
    elif i < 6:
        d(0, 36, 100)
        d(2, 36, 95)
        for e in range(8):
            d(e / 2, 38, 60 + 5 * e + 20 * (i - 4))
    elif i == 6:
        d(0, 36, 100)
        d(2, 36, 100)
        for e in range(16):
            d(e / 4, 38, 70 + 3 * e)
    else:
        for e in range(16):
            d(e / 4, 38, 70 + 3 * e)
        for o in (0, 1, 2, 3):
            d(o, 36, 100)

s = Song(bpm=BPM, bars=BARS)
s.add(0, 33, bass, volume=105, pan=64)   # finger bass
s.add(1, 42, cello, volume=92, pan=48)   # cello ostinato
s.add(2, 48, pad, volume=78, pan=80)     # string ensemble
s.add(3, 61, brass, volume=100, pan=70)  # brass section
s.add(4, 68, oboe, volume=88, pan=56)    # oboe
s.add(5, 60, horn, volume=88, pan=44)    # french horn harmony
s.add(6, 47, timp, volume=105, pan=64)   # timpani
s.add(7, 46, harp, volume=82, pan=86)    # harp
s.drum(dr, volume=95)
print("wrote", render(s, OUT, soundfont="MuseScore_General"))

# checks
for name, nt in (("bass", bass), ("cello", cello), ("pad", pad), ("brass", brass), ("oboe", oboe), ("horn", horn),
                 ("timp", timp), ("harp", harp)):
    ps = [n[2] for n in nt]
    print(f"{name:6} n={len(nt):4} range {min(ps)}-{max(ps)} vel {min(n[3] for n in nt)}-{max(n[3] for n in nt)}")
print("bars", len(CHORDS), "expected secs", BARS * 4 * 60 / BPM)
bad = 0
for n in bass:
    b = int(n[0] // 4)
    if abs(n[0] - b * 4) < 1e-9 and n[2] % 12 != PC[CHORDS[b][0]]:
        bad += 1
    if n[2] % 12 not in pcs(CHORDS[b]):
        bad += 1
print("bass notes off-chord or wrong root on downbeat:", bad)
end = max(n[0] + n[1] for p in (bass, cello, pad, brass, oboe, horn, timp, harp, dr) for n in p)
assert end <= BARS * 4 + 1e-6, end
