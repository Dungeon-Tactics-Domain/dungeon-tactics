"""Battle loop (eval slot F): D minor, 132 bpm, 56 bars (~1:42), loops back into the intro.

Form (bar numbers are 1-based):
  Intro    1-4   cello gallop + timpani, horn previews the motif over Bb and A
  A        5-12  brass states the theme (motif M = rising A-D-F, falls E-D), answer phrase ends on the dominant
  A'      13-20  strings take phrase 1, brass plays a higher variant of phrase 2, horn drone
  B       21-28  F major, oboe over harp arpeggios, side stick and soft timpani (contrast)
  Bridge  29-36  motif M climbs in sequence (Gm, A, Bb, A, then an octave up), strings stab, snare builds
  Return  37-44  theme again, heavier drums, horn drone, strings pad
  Return' 45-52  ornamented theme, brass and strings in unison, new second half
  Tail    53-56  motif echo, ends on A with snare and timpani rolls back into bar 1

Motif M (rising third-ish arpeggio then a step-down) returns: sequenced in the theme (bars 5-7), as an
oboe cousin (A-C-F, bar 21), as the bridge sequence, ornamented in Return'.
"""
import itertools
import os
import random
import sys

sys.path.insert(0, os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..")))
from psx import TOOLS, Song, render  # noqa: E402

BPM, BARS = 132, 56
OUT = os.path.join(TOOLS, "eval", "battle", "slot_F")
rnd = random.Random(6)

# ---------- helpers ----------
PCS = {"C": 0, "D": 2, "E": 4, "F": 5, "G": 7, "A": 9, "B": 11}


def pitch(name):
    pc = PCS[name[0]]
    rest = name[1:]
    if rest[0] == "#":
        pc, rest = pc + 1, rest[1:]
    elif rest[0] == "b":
        pc, rest = pc - 1, rest[1:]
    return 12 * (int(rest) + 1) + pc


def parse(bar):
    """'A4:.5 r:1' -> [(beat, length, pitch)], must fill exactly 4 beats."""
    out, t = [], 0.0
    for tok in bar.split():
        name, d = tok.split(":")
        d = float(d)
        if name != "r":
            out.append((t, d, pitch(name)))
        t += d
    assert abs(t - 4) < 1e-9, (bar, t)
    return out


def chord_pcs(name):
    minor = name.endswith("m")
    letter = name[:-1] if minor else name  # the root comes from the name, never from a voicing
    root = PCS[letter[0]] + (-1 if letter.endswith("b") else 0)
    third = 3 if minor else 4
    return root, (root, (root + third) % 12, (root + 7) % 12)


def fit(pc, lo):
    """Lowest pitch >= lo with this pitch class."""
    return lo + (pc - lo) % 12


def v(x):
    return max(1, min(127, int(round(x + rnd.randint(-3, 3)))))


# ---------- structure ----------
SEC = {
    "intro": (0, ["Dm", "Dm", "Bb", "A"]),
    "A": (4, "Dm Bb C Dm Dm Gm Bb A".split()),
    "A2": (12, "Dm Bb C Dm Dm Gm Bb C".split()),
    "B": (20, "F C Dm Bb Gm F Bb C".split()),
    "bridge": (28, "Gm A Bb A Gm Bb C A".split()),
    "ret1": (36, "Dm Bb C Dm Dm Gm Bb A".split()),
    "ret2": (44, "Dm Bb C Dm Gm Bb C A".split()),
    "tail": (52, "Dm Bb C A".split()),
}
chords, info = [], []
for name, (start, ch) in SEC.items():
    assert start == len(chords)
    for i, c in enumerate(ch):
        chords.append(c)
        info.append((name, i))
assert len(chords) == BARS

# ---------- melodies ----------
M_A1 = ["A4:.5 D5:.5 F5:1.5 E5:.5 D5:1", "Bb4:.5 D5:.5 F5:1.5 G5:.5 F5:1",
        "C5:.5 E5:.5 G5:1.5 F5:.5 E5:1", "F5:1.5 E5:.5 D5:2"]
M_A2 = ["D5:.5 F5:.5 A5:1.5 G5:.5 F5:1", "D5:.5 G5:.5 Bb5:1.5 A5:.5 G5:1",
        "F5:1 G5:.5 F5:.5 D5:1 Bb4:1", "E5:1.5 C#5:.5 E5:1 r:1"]
M_A2V = ["D5:.5 F5:.5 A5:1 Bb5:1 A5:.5 G5:.5", "Bb5:1 G5:.5 D5:.5 G5:1.5 A5:.5",
         "Bb5:1 A5:.5 G5:.5 F5:1 D5:1", "G5:1 E5:.5 C5:.5 E5:1 D5:.5 E5:.5"]
M_B = ["A4:1.5 C5:.5 F5:1 E5:.5 D5:.5", "E5:1.5 G5:.5 E5:1 D5:1", "F5:1.5 A5:.5 F5:1 E5:.5 D5:.5",
       "D5:2 C5:1 Bb4:1", "Bb4:1 D5:1 G5:1.5 F5:.5", "A5:1.5 G5:.5 F5:1 C5:1",
       "D5:1 F5:1 D5:.5 C5:.5 Bb4:1", "G5:1.5 E5:.5 C5:2"]
M_BR = ["D4:.5 G4:.5 Bb4:1.5 A4:.5 G4:1", "E4:.5 A4:.5 C#5:1.5 B4:.5 A4:1",
        "F4:.5 Bb4:.5 D5:1.5 C5:.5 Bb4:1", "E4:.5 A4:.5 C#5:.5 E5:.5 A5:2",
        "D5:.5 G5:.5 Bb5:1.5 A5:.5 G5:1", "F5:.5 Bb5:.5 D6:1.5 C6:.5 Bb5:1",
        "G5:.5 C6:.5 G5:.5 C6:.5 B5:1 A5:1", "A5:.5 r:3.5"]
M_R2 = ["A4:.5 D5:.5 F5:.5 A5:1 G5:.5 F5:.5 E5:.5", "D5:.5 F5:.5 Bb5:1 A5:.5 G5:.5 F5:1",
        "E5:.5 G5:.5 C6:1 B5:.5 A5:.5 G5:1", "A5:1 F5:1 D5:2",
        "Bb5:1.5 A5:.5 G5:1 D5:1", "Bb5:1.5 A5:.5 F5:1 D5:1",
        "C6:1 B5:1 C6:1 G5:1", "A5:.5 G5:.5 F5:.5 E5:.5 C#5:1 r:1"]
M_FORE = ["F4:.5 Bb4:.5 D5:1.5 C5:.5 Bb4:1", "E4:.5 A4:.5 C#5:1.5 B4:.5 A4:1"]  # horn preview, bars 3-4
M_TAIL = M_A1[:3] + ["E5:1 C#5:1 A4:.5 r:1.5"]

notes = {k: [] for k in ("lead", "str", "cello", "bass", "timp", "oboe", "horn", "harp")}
drums = []


def put(part, bar, bar_notes, vel, shape=True):
    for t, d, p in bar_notes:
        x = vel
        if shape:  # accents on the downbeat and long notes, lighter pickups
            x += (7 if t == 0 else 0) + (4 if d >= 1.5 else 0) - (6 if d <= 0.5 else 0)
        notes[part].append((bar * 4 + t, d * 0.92 if d < 1 else d - 0.08, p, v(x)))


def melody(part, start, bars, vel):
    for i, s in enumerate(bars):
        put(part, start + i, parse(s), vel(i) if callable(vel) else vel)


# ---------- harmony voicings (voice-led) ----------
prev_pad = [None]


def pad_voice(chord, lo, hi):
    _, pcs = chord_pcs(chord)
    best = None
    for combo in itertools.product(*[[p for p in range(lo, hi + 1) if p % 12 == pc] for pc in pcs]):
        c = tuple(sorted(combo))
        cost = (sum(abs(a - b) for a, b in zip(c, prev_pad[0])) if prev_pad[0] else 0) + 0.3 * (c[-1] - c[0])
        if best is None or cost < best[0]:
            best = (cost, c)
    prev_pad[0] = best[1]
    return best[1]


prev_horn = [57]


def horn_note(chord, lo=50, hi=62):
    _, pcs = chord_pcs(chord)
    p = min((q for q in range(lo, hi + 1) if q % 12 in pcs), key=lambda q: (abs(q - prev_horn[0]), q))
    prev_horn[0] = p
    return p


# ---------- per-bar parts ----------
def bass_bar(b, kind, R, nR, prog=0.0):
    r, ap = fit(R, 31), fit(nR, 31) - 5  # approach = fifth below the next root
    if ap < 28:
        ap += 12
    base = b * 4
    pat = {
        "drive": [(0, 1.5, r, 100), (1.5, .5, r, 70), (2, 1, r + 7, 85), (3, .5, r, 75), (3.5, .5, ap, 80)],
        "long": [(0, 1.5, r, 100), (2, 1.5, r, 85), (3.5, .5, ap, 80)],
        "soft": [(0, 2, r, 66), (2, 1.5, r + 7, 56), (3.5, .5, ap, 56)],
        "heavy": [(0, .75, r, 110), (1, .5, r, 80), (1.5, .5, r, 72), (2, .75, r + 7, 92), (3, .5, r, 80), (3.5, .5, ap, 86)],
        "eights": [(k * .5, .45, r, 70 + 40 * prog + (8 if k % 2 == 0 else 0)) for k in range(7)] + [(3.5, .5, ap, 85 + 25 * prog)],
    }[kind]
    for t, d, p, vel in pat:
        notes["bass"].append((base + t, d, p, v(vel)))


def cello_bar(b, kind, R, scale=1.0, prog=0.0, i=0):
    r = fit(R, 46)
    base = b * 4
    if kind == "long":
        notes["cello"] += [(base, 1.95, r, v(48)), (base + 2, 1.95, r, v(44))]
        return
    for k in range(8):
        n = k % 4
        if kind == "bridge":
            p, vel = (r + 7 if (n == 2 and prog > .5) else r), 55 + 50 * (prog + k / 64)
        elif kind == "oct":
            p, vel = (r, r, r + 7, r + 12 if r + 12 <= 64 else r + 7)[n], (92, 66, 78, 70)[n]
        else:
            p, vel = (r, r, r + 7, r)[n], (86, 60, 72, 60)[n]
        notes["cello"].append((base + k * .5, .45, p, v(vel * scale if kind != "bridge" else vel)))


def timp_bar(b, kind, R, i=0, prog=0.0):
    p = fit(R, 38)
    base = b * 4

    def hit(t, d, vel):
        notes["timp"].append((base + t, d, p, v(vel)))

    def roll(t0, n, v0, v1):
        for k in range(n):
            hit(t0 + k * .25, .25, v0 + (v1 - v0) * k / max(1, n - 1))

    if kind == "intro":
        hit(0, 1.5, 85)
        hit(2, 1.5, 70 + 8 * (i >= 2))
        if i == 2:
            hit(3, .75, 80)
        if i == 3:
            roll(2.5, 6, 55, 100)
    elif kind == "drive":
        hit(0, 1, 95)
        if i % 4 == 3:
            roll(3, 4, 60, 92)
        else:
            hit(2.5, .5, 75)
    elif kind == "soft":
        if i % 2 == 0:
            hit(0, 2, 55)
    elif kind == "bridge":
        if i < 4:
            hit(0, 1, 76 + 3 * i)
            hit(2, 1, 68 + 3 * i)
        elif i < 7:
            for k in range(8):
                hit(k * .5, .45, 66 + 5 * (i - 4) + 2 * k)
        else:
            roll(0, 16, 50, 112)
    elif kind == "heavy":
        hit(0, 1, 105)
        hit(1.5, .5, 75)
        if i % 4 == 3:
            roll(3, 4, 65, 100)
        else:
            hit(2.5, .5, 82)
    elif kind == "last":
        roll(0, 16, 55, 115)


K, S, SS, HC, HO, CR, TL, TM, TH = 36, 38, 37, 42, 46, 49, 41, 45, 48


def drum_bar(b, kind, i):
    base = b * 4

    def d(t, n, vel, ln=.25):
        drums.append((base + t, ln, n, v(vel)))

    def fill(t0=3, vel=88):
        for k, n in enumerate((TH, TM, TM, TL)):
            d(t0 + k * .25, n, vel + 3 * k)

    def hats(lo, hi, upto=4.0):
        for k in range(int(upto * 2)):
            d(k * .5, HC, lo if k % 2 else hi)

    if kind == "intro":
        if b == 0:
            d(0, CR, 78, 1)
        d(0, TL, 80)
        d(2, TL, 70)
        if i == 0:
            d(3.5, TM, 60)
        if i == 1:
            d(1, TM, 65)
            d(3.5, TM, 68)
        if i == 2:
            d(0, K, 80)
            d(1, TM, 80)
            d(3, TM, 80)
            d(3.5, TH, 78)
        if i == 3:
            d(0, K, 85)
            for k in range(8):
                d(2 + k * .25, S, 50 + 7 * k)
    elif kind in ("A", "A2"):
        if i == 0 or (kind == "A2" and i == 4):
            d(0, CR, 86, 1)
        for t in ([0, 2.5] if i % 2 == 0 else [0, 2, 3.5]):
            d(t, K, 98)
        if i % 4 == 3:
            hats(46, 66, 3)
            d(1, S, 100)
            fill()
        else:
            d(1, S, 100)
            d(3, S, 98)
            hats(48, 68)
            if kind == "A2":
                d(2.75, S, 34)
    elif kind == "B":
        d(0, K, 66)
        d(2, K, 56)
        d(1, SS, 62)
        d(3, SS, 58)
        for t in range(4):
            d(t, HC, 44)
        if i == 7:
            d(3.5, TM, 62)
            d(3.75, TL, 72)
    elif kind == "bridge":
        for t in range(4):
            d(t, K, 70 + 4 * i if i < 4 else 98)
        if i < 4:
            d(1, S, 55 + 8 * i)
            d(3, S, 55 + 8 * i)
            hats(36 + 5 * i, 46 + 5 * i)
        elif i < 6:
            for k in range(8):
                d(k * .5, S, 68 + 5 * k + 12 * (i - 4))
        elif i == 6:
            for k in range(8):
                d(k * .5, S, 85 + 4 * k)
            d(3, TH, 105)
            d(3.5, TM, 108)
        else:
            for k in range(16):
                d(k * .25, S, 55 + 4 * k)
    elif kind in ("ret1", "ret2", "tail"):
        if kind != "tail" and i in (0, 4):
            d(0, CR, 105 if kind == "ret1" else 110, 1)
        for t in ([0, 2, 2.5] if i % 2 == 0 else [0, 1.5, 2]):
            d(t, K, 105)
        if kind == "tail" and i == 3:
            d(0, K, 105)
            d(2, K, 100)
            for k in range(16):
                d(k * .25, S, 62 + 4 * k)
            return
        if i % 4 == 3:
            hats(54, 72, 3)
            d(1, S, 112)
            fill(3, 100)
        else:
            d(1, S, 112)
            d(3, S, 110)
            hats(55, 74)
            if i % 2 == 1:
                d(3.5, HO, 72)
            if kind == "ret2":
                d(2.75, S, 40)


def pad_bar(b, vel, lo=53, hi=68, ln=3.95):
    for p in pad_voice(chords[b], lo, hi):
        notes["str"].append((b * 4, ln, p, v(vel)))


def stab_bar(b, v0, v1, lo, hi):
    for k in range(8):
        for p in pad_voice(chords[b], lo, hi):
            notes["str"].append((b * 4 + k * .5, .4, p, v(v0 + (v1 - v0) * k / 7 - (10 if k % 2 else 0))))


def harp_bar(b):
    _, pcs = chord_pcs(chords[b])
    tones = [p for p in range(55, 69) if p % 12 in pcs]
    for k, ix in enumerate((0, 1, 2, 3, 2, 1, 2, 3)):
        notes["harp"].append((b * 4 + k * .5, 1.0, tones[ix % len(tones)], v(62 if k == 0 else 50)))


# ---------- assemble ----------
for b in range(BARS):
    name, i = info[b]
    R = chord_pcs(chords[b])[0]
    nR = chord_pcs(chords[(b + 1) % BARS])[0]
    if name == "intro":
        cello_bar(b, "gallop", R, scale=(0.6, 0.7, 0.8, 0.9)[i])
        timp_bar(b, "intro", R, i)
        drum_bar(b, "intro", i)
        pad_bar(b, 38 + 9 * i)
        if i >= 2:
            bass_bar(b, "soft", R, nR)
        if i >= 2:
            put("horn", b, parse(M_FORE[i - 2]), 70)
    elif name in ("A", "A2"):
        cello_bar(b, "gallop", R)
        timp_bar(b, "drive", R, i)
        drum_bar(b, name, i)
        bass_bar(b, "long" if i % 4 == 3 else "drive", R, nR)
        if name == "A":
            pad_bar(b, 58 + (6 if i % 4 == 0 else 0))
        elif i >= 4:
            pad_bar(b, 62)
        else:
            horn_note(chords[b])  # keep the drone line moving even while strings carry the theme
            notes["horn"].append((b * 4, 3.9, prev_horn[0], v(60)))
    elif name == "B":
        cello_bar(b, "long", R)
        timp_bar(b, "soft", R, i)
        drum_bar(b, "B", i)
        bass_bar(b, "soft", R, nR)
        pad_bar(b, 44)
        harp_bar(b)
    elif name == "bridge":
        prog = i / 7
        cello_bar(b, "bridge", R, prog=prog)
        timp_bar(b, "bridge", R, i)
        drum_bar(b, "bridge", i)
        bass_bar(b, "eights", R, nR, prog)
        if i < 4:
            pad_bar(b, 48 + 7 * i, lo=50, hi=63)
        else:
            stab_bar(b, 66 + 5 * (i - 4), 76 + 8 * (i - 4), 55, 67)
    elif name in ("ret1", "ret2"):
        cello_bar(b, "oct", R)
        timp_bar(b, "heavy", R, i)
        drum_bar(b, name, i)
        bass_bar(b, "drive" if i % 4 == 3 else "heavy", R, nR)
        if name == "ret1":
            pad_bar(b, 78)
            notes["horn"].append((b * 4, 3.9, horn_note(chords[b], 50, 61), v(72)))
        else:
            notes["horn"].append((b * 4, 3.9, horn_note(chords[b], 50, 61), v(78)))
    elif name == "tail":
        last = i == 3
        cello_bar(b, "bridge" if last else "oct", R, prog=1.0, scale=.9)
        timp_bar(b, "last" if last else "heavy", R, i)
        drum_bar(b, "tail", i)
        bass_bar(b, "eights" if last else "heavy", R, nR, 1.0)
        if last:
            stab_bar(b, 86, 100, 55, 67)
        else:
            pad_bar(b, 74)

melody("lead", 4, M_A1, 92)
melody("lead", 8, M_A2, 92)
melody("str", 12, M_A1, 80)
melody("lead", 16, M_A2V, 98)
melody("oboe", 20, M_B, 80)
melody("lead", 28, M_BR, lambda i: 74 + 5 * i)
melody("lead", 36, M_A1, 104)
melody("lead", 40, M_A2, 104)
melody("lead", 44, M_R2, 108)
melody("str", 44, M_R2, 82)
melody("lead", 52, M_TAIL, 96)

song = Song(bpm=BPM, bars=BARS)
for part, ch, prog, vol, pan in (("lead", 0, 61, 104, 64), ("str", 1, 48, 82, 44), ("cello", 2, 42, 92, 36),
                                 ("bass", 3, 33, 104, 64), ("timp", 4, 47, 92, 72), ("oboe", 5, 68, 94, 84),
                                 ("horn", 6, 60, 88, 80), ("harp", 7, 46, 78, 92)):
    song.add(ch, prog, notes[part], volume=vol, pan=pan)
song.drum(drums, volume=100)

# ---------- checks ----------
if __name__ == "__main__":
    total = BARS * 4
    names = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"]

    def nm(p):
        return f"{names[p % 12]}{p // 12 - 1}"

    for part, ns in list(notes.items()) + [("drums", drums)]:
        assert ns, part
        assert max(b + d for b, d, *_ in ns) <= total + 1e-9, (part, "runs past the loop point")
        assert min(b for b, *_ in ns) >= 0
        if part != "drums":
            ps = [n[2] for n in ns]
            vs = [n[3] for n in ns]
            print(f"{part:6s} notes={len(ns):4d} range={nm(min(ps))}-{nm(max(ps))} vel={min(vs)}-{max(vs)}")
        else:
            print(f"drums  notes={len(ns):4d}")
    # bass root under every chord: lowest sounding pitched note at each bar start must have the chord root's pc
    for b in range(BARS):
        t = b * 4
        low = min(p for part, ns in notes.items() for bt, d, p, _ in ns if bt <= t + 1e-9 and bt + d > t + 1e-9)
        root = chord_pcs(chords[b])[0]
        assert low % 12 == root, (b + 1, chords[b], nm(low))
        bs = [p for bt, d, p, _ in notes["bass"] if abs(bt - t) < 1e-9]
        assert not bs or bs[0] % 12 == root, (b + 1, chords[b], "bass")
    print("bars", BARS, "expected seconds", round(BARS * 4 * 60 / BPM, 3))
    print("root-under-chord check passed for all", BARS, "bars")
    print(render(song, OUT, soundfont="MuseScore_General"))
