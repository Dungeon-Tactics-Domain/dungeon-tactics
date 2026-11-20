"""Battle theme, slot A: C minor, 132 bpm, 56 bars (about 1:42), loops from bar 56 back to bar 1.

Form (bars counted from 1):
  1-4   intro: low string ostinato, timpani, snare roll into the theme
  5-12  theme a: horn states the motif (short-short-long up a fourth), strings ostinato, march groove
  13-20 theme a': violins take the theme an octave up, horn plays a counterline, new cadence
  21-32 contrast in E-flat major: oboe sings the motif inverted (falling), soft string pad, light drums
  33-44 tension bridge: chords rise by step (Ab, Bb, Cm, Db), motif cut to its cell and traded horn/violins,
        snare and timpani build to a two-bar roll on the dominant
  45-56 return: theme with violins doubled and brass stabs, then a new ending (Ab Fm Db G7) back to bar 1
"""
import os
import subprocess
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))  # psx.py lives in scripts/music

from psx import Song, render  # noqa: E402

BPM, BARS = 132, 56
OUT = r"D:\Projetos\_musica-tools\eval\battle\slot_A"

CHORDS = (
    ["Cm", "Cm", "Ab", "G"]  # intro
    + ["Cm", "Cm", "Ab", "Bb", "Cm", "Fm", "Db", "G"]  # theme a
    + ["Cm", "Cm", "Ab", "Bb", "Eb", "Fm", "Ab", "G"]  # theme a'
    + ["Eb", "Bb/D", "Cm", "Ab", "Eb", "Bb", "Ab", "Bb", "Gm", "Cm", "Fm", "G"]  # contrast
    + ["Ab", "Ab", "Bb", "Bb", "Cm", "Cm", "Db", "Db", "Fm", "Ddim", "G", "G7"]  # bridge
    + ["Cm", "Cm", "Ab", "Bb", "Cm", "Fm", "Db", "G", "Ab", "Fm", "Db", "G7"]  # return
)
PC = {"C": 0, "Db": 1, "D": 2, "Eb": 3, "E": 4, "F": 5, "Gb": 6, "G": 7, "Ab": 8, "A": 9, "Bb": 10, "B": 11}
QUAL = {"": (0, 4, 7), "m": (0, 3, 7), "dim": (0, 3, 6), "7": (0, 4, 7, 10)}


def chord(name):
    """(root pc, chord intervals, bass pc); the bass is the slash note when there is one."""
    head, _, slash = name.partition("/")
    root = head[:2] if head[1:2] in ("b", "#") else head[:1]
    r = PC[root]
    return r, QUAL[head[len(root):]], PC[slash] if slash else r


def in_range(pc, lo):
    """The pitch with class pc in [lo, lo+11]."""
    return lo + (pc - lo) % 12


def voicing(name, lo, hi, n=3):
    r, iv, _ = chord(name)
    pcs = {(r + i) % 12 for i in iv}
    return [p for p in range(lo, hi + 1) if p % 12 in pcs][:n]


# --- melody material (beat in bar, length, pitch) -------------------------------------------------------------
THEME = [  # 8 bars over Cm Cm Ab Bb Cm Fm Db G
    [(0, .5, 55), (.5, .5, 55), (1, 2, 60), (3, .5, 62), (3.5, .5, 63)],
    [(0, 1.5, 67), (1.5, .5, 65), (2, 1, 63), (3, 1, 62)],
    [(0, 1.5, 60), (1.5, .5, 63), (2, 2, 68)],
    [(0, 1, 70), (1, .5, 68), (1.5, .5, 67), (2, 2, 65)],
    [(0, .5, 67), (.5, .5, 67), (1, 2, 72), (3, .5, 74), (3.5, .5, 75)],
    [(0, 1.5, 77), (1.5, .5, 75), (2, 1, 72), (3, 1, 68)],
    [(0, 1.5, 73), (1.5, .5, 72), (2, 2, 68)],
    [(0, 1, 71), (1, .5, 74), (1.5, 1.5, 67)],
]
A2_END = [  # violins, bars 17-20 over Eb Fm Ab G
    [(0, 1.5, 79), (1.5, .5, 77), (2, 1, 75), (3, 1, 70)],
    [(0, 1, 77), (1, 1, 80), (2, 1.5, 84), (3.5, .5, 82)],
    [(0, 1.5, 80), (1.5, .5, 79), (2, 2, 75)],
    [(0, 2, 74), (2, 1, 71), (3, 1, 67)],
]
HORN_COUNTER = [  # bars 13-20 under the violins
    [(0, 4, 55)], [(0, 2, 63), (2, 2, 67)], [(0, 4, 60)], [(0, 2, 62), (2, 2, 65)],
    [(0, 4, 67)], [(0, 4, 68)], [(0, 2, 68), (2, 2, 63)], [(0, 2, 62), (2, 2, 59)],
]
OBOE = [  # bars 21-32, the motif inverted (falling) and slower
    [(0, .5, 82), (.5, .5, 82), (1, 2, 79), (3, 1, 77)],
    [(0, 2, 74), (2, 1.5, 70), (3.5, .5, 72)],
    [(0, 1, 72), (1, 1, 75), (2, 1.5, 79), (3.5, .5, 77)],
    [(0, 3, 75), (3, 1, 72)],
    [(0, .5, 82), (.5, .5, 82), (1, 2, 79), (3, 1, 82)],
    [(0, 1.5, 84), (1.5, .5, 82), (2, 2, 77)],
    [(0, 1.5, 80), (1.5, .5, 79), (2, 2, 75)],
    [(0, 2, 74), (2, 1, 77), (3, 1, 79)],
    [(0, 2, 82), (2, 1, 79), (3, 1, 74)],
    [(0, 3, 75), (3, 1, 72)],
    [(0, 2, 77), (2, 2, 80)],
    [(0, 3, 79)],
]
RETURN_END = [  # bars 53-56 over Ab Fm Db G7, horn and violins in unison
    [(0, .5, 63), (.5, .5, 63), (1, 2, 68), (3, 1, 72)],
    [(0, 1.5, 77), (1.5, .5, 75), (2, 1, 72), (3, 1, 68)],
    [(0, 1.5, 73), (1.5, .5, 72), (2, 2, 68)],
    [(0, 1.5, 71), (1.5, .5, 74), (2, 2, 67)],
]
HORN_RETURN_COUNTER = [[(0, 4, 63)], [(0, 4, 65)], [(0, 4, 65)], [(0, 2, 62), (2, 2, 59)]]  # bars 49-52


def cell(start, lo, hi):
    """The motif reduced to its cell: two short notes, then a leap up a fourth."""
    return [(start, .5, lo), (start + .5, .5, lo), (start + 1, 1, hi)]


def place(bar, notes, vel, transpose=0, legato=.95):
    """Bar-relative notes to song notes; downbeats lean in, short notes back off."""
    out = []
    for b, l, p in notes:
        v = vel + (8 if b == 0 else 0) - (6 if l <= .5 else 0) + (4 if l >= 2 else 0)
        out.append((bar * 4 + b, l * legato, p + transpose, max(1, min(127, v))))
    return out


def ramp(i, n, v0, v1):
    return round(v0 + (v1 - v0) * i / max(1, n - 1))


# --- parts ----------------------------------------------------------------------------------------------------
horn, violins, oboe, ostinato, bass, brass, timp, drums = ([] for _ in range(8))

for bar in range(4, 12):
    horn += place(bar, THEME[bar - 4], 84)
for bar in range(12, 20):
    notes = THEME[bar - 12] if bar < 16 else A2_END[bar - 16]
    violins += place(bar, notes, 82, transpose=12 if bar < 16 else 0)
    horn += place(bar, HORN_COUNTER[bar - 12], 62, legato=.9)
for bar in range(20, 32):
    oboe += place(bar, OBOE[bar - 20], 74)
    violins += [(bar * 4, 3.9, p, 48) for p in voicing(CHORDS[bar], 60, 72)]  # soft pad under the oboe

# bridge: the cell climbs with the chords, horn and violins trade it
CELLS = {"Ab": (63, 68), "Bb": (65, 70), "Cm": (67, 72), "Db": (68, 73)}
for i, bar in enumerate(range(32, 40)):
    lo, hi = CELLS[CHORDS[bar]]
    v = ramp(i, 8, 74, 96)
    first, second = (horn, violins) if i % 2 == 0 else (violins, horn)
    first += [(s, l, p + (12 if first is violins else 0), v) for s, l, p in cell(bar * 4, lo, hi)]
    second += [(s, l, p + (12 if second is violins else 0), v - 6) for s, l, p in cell(bar * 4 + 2, lo, hi)]
violins += place(40, [(0, .5, 77), (.5, .5, 77), (1, 1, 80), (2, .5, 80), (2.5, .5, 80), (3, 1, 84)], 94)
violins += place(41, [(0, .5, 74), (.5, .5, 74), (1, 1, 77), (2, .5, 77), (2.5, .5, 77), (3, 1, 80)], 96)
horn += place(40, [(0, 4, 65)], 86) + place(41, [(0, 4, 62)], 88)
horn += place(42, cell(0, 62, 67), 100)
violins += place(42, cell(2, 74, 79), 98)
violins += [(43 * 4 + k * .5, .45, p, 80 + k * 3) for k, p in enumerate([67, 71, 74, 77, 79, 77, 74, 71])]
horn += place(43, [(0, 2, 62), (2, 2, 65)], 94)

# return
for bar in range(44, 48):
    horn += place(bar, THEME[bar - 44], 96)
    violins += place(bar, THEME[bar - 44], 88, transpose=12)
for bar in range(48, 52):
    violins += place(bar, THEME[bar - 44], 96)
    horn += place(bar, HORN_RETURN_COUNTER[bar - 48], 80, legato=.9)
for bar in range(52, 56):
    horn += place(bar, RETURN_END[bar - 52], 98)
    violins += place(bar, RETURN_END[bar - 52], 88)

# ostinato (3+3+2 accents) and bass, per section
for bar, name in enumerate(CHORDS):
    r, iv, bpc = chord(name)
    root, third, fifth = in_range(r, 48), in_range(r, 48) + iv[1], in_range(r, 48) + iv[2]
    low = in_range(bpc, 36)
    t = bar * 4
    if 20 <= bar < 32:  # contrast: calmer quarter-note pulse
        ostinato += [(t + k, .8, p, 54 + (6 if k == 0 else 0)) for k, p in enumerate([root, fifth, third, fifth])]
        bass += [(t, 1.9, low, 72), (t + 2, 1.9, low, 64)]
        continue
    if bar < 4:
        base = ramp(bar, 4, 62, 82)
    elif bar < 20:
        base = 76
    elif bar < 44:
        base = ramp(bar - 32, 12, 70, 96)
    else:
        base = 90
    for k, p in enumerate([root, root, fifth, root, root, third, fifth, third]):
        ostinato.append((t + k * .5, .42, p, base + (14 if k in (0, 3, 6) else 0)))
    if bar < 2:
        bass.append((t, 3.8, low, 80))
    elif 32 <= bar < 44:  # bridge: driving quarters
        bass += [(t + k, .8, low, base + (8 if k == 0 else 0)) for k in range(4)]
    else:
        bass += [(t, 1.25, low, base + 12), (t + 1.5, 1.25, low, base), (t + 3, .8, low, base + 6)]

# brass stabs: accents only, voiced below the melody
for bar in (3, 7, 11, 19):
    brass += [(bar * 4 + 2.5, .4, p, 78) for p in voicing(CHORDS[bar], 52, 64)]
for bar in (4, 8, 12, 16):
    brass += [(bar * 4, .7, p, 82) for p in voicing(CHORDS[bar], 52, 64)]
for bar in range(32, 56):
    v = ramp(bar - 32, 12, 70, 96) if bar < 44 else 96
    brass += [(bar * 4, .6, p, v) for p in voicing(CHORDS[bar], 52, 64)]
    brass += [(bar * 4 + 2.5, .4, p, v - 10) for p in voicing(CHORDS[bar], 52, 64)]

# timpani on the chord roots
TIMP = {0: 48, 1: 49, 2: 50, 3: 51, 5: 41, 7: 43, 8: 44, 10: 46}


def tim(name):
    return TIMP[chord(name)[0]]


def roll(start, beats, pitch, v0, v1):
    n = int(beats * 4)
    return [(start + k * .25, .24, pitch, ramp(k, n, v0, v1)) for k in range(n)]


timp += [(0, 1, 48, 100), (4, 1, 48, 80), (7, .5, 43, 70), (7.5, .5, 43, 82), (8, 1, 44, 88)]
timp += roll(12, 4, 43, 50, 110)
for bar in (4, 8, 12, 16):
    timp.append((bar * 4, 1, tim(CHORDS[bar]), 96))
for bar in (11, 19):
    timp += [(bar * 4 + 2, .5, 43, 80), (bar * 4 + 2.5, .5, 43, 88), (bar * 4 + 3, 1, 43, 96)]
timp += [(80, 2, 51, 62), (96, 2, 51, 62), (112, 2, 43, 66)] + roll(31 * 4 + 2, 2, 43, 50, 90)
for bar in range(32, 42):
    timp.append((bar * 4, 1, tim(CHORDS[bar]), ramp(bar - 32, 10, 76, 100)))
timp += [(42 * 4 + k * .5, .45, 43 if k % 2 == 0 else 50, 70 + k * 3) for k in range(16)]
for bar in range(44, 55):
    timp += [(bar * 4, 1, tim(CHORDS[bar]), 100), (bar * 4 + 2.5, .5, tim(CHORDS[bar]), 80)]
timp += [(220, 1, 43, 100), (222, .5, 43, 84), (222.5, .5, 43, 90), (223, .5, 43, 96), (223.5, .5, 50, 104)]

# drums (GM kit)
KICK, SNARE, STICK, HAT, PEDAL, OPEN, CRASH, RIDE = 36, 38, 37, 42, 44, 46, 49, 51
TOMS = [50, 50, 47, 47, 45, 45, 41, 41]


def groove(bar, v, open_hat=False):
    t = bar * 4
    out = [(t, .2, KICK, v + 8), (t + 1.5, .2, KICK, v - 4), (t + 1, .2, SNARE, v), (t + 3, .2, SNARE, v + 4),
           (t + 2.75, .1, SNARE, 38)]
    out += [(t + k * .5, .1, HAT, v - (22 if k % 2 else 12)) for k in range(8) if not (open_hat and k == 7)]
    if open_hat:
        out.append((t + 3.5, .4, OPEN, v - 20))
    return out


def tom_fill(bar, v0, v1):
    return [(bar * 4 + 2 + k * .25, .2, p, ramp(k, 8, v0, v1)) for k, p in enumerate(TOMS)]


drums += [(0, .5, CRASH, 90), (0, .2, KICK, 96), (8, .2, KICK, 90), (9.5, .2, KICK, 80)]
drums += [(b, .1, PEDAL, 44) for b in range(12)]
drums += [(12 + k * .25, .1, SNARE, ramp(k, 16, 40, 104)) for k in range(16)]
for bar in range(4, 20):
    if bar in (11,):
        drums += [x for x in groove(bar, 82) if x[0] < bar * 4 + 2] + tom_fill(bar, 70, 100)
    elif bar == 19:
        drums += [x for x in groove(bar, 82) if x[0] < bar * 4 + 2]
        drums += [(bar * 4 + 2 + k * .25, .1, SNARE, ramp(k, 8, 60, 100)) for k in range(8)]
    else:
        drums += groove(bar, 82, open_hat=bar % 4 == 3)
drums += [(16, .5, CRASH, 96), (48, .5, CRASH, 92)]
for bar in range(20, 32):
    t = bar * 4
    drums += [(t, .2, KICK, 70), (t + 3, .2, STICK, 58)] + [(t + k, .1, HAT, 40) for k in range(4)]
    if bar % 4 == 3:
        drums.append((t + 2.5, .2, KICK, 60))
drums = [x for x in drums if not (31 * 4 + 2 <= x[0] < 32 * 4)] + tom_fill(31, 50, 96)
for bar in range(32, 44):
    t, v = bar * 4, ramp(bar - 32, 12, 74, 100)
    drums += [(t + k, .2, KICK, v) for k in range(4)] + [(t + k * .5, .1, HAT, v - 26) for k in range(8)]
    if bar < 42:
        drums += [(t + 1, .2, SNARE, v - 4), (t + 3, .2, SNARE, v)]
        if bar % 2 == 1:
            drums += [(t + 3.25 + k * .25, .1, SNARE, v - 20 + k * 8) for k in range(3)]
drums += [(42 * 4 + k * .25, .1, SNARE, ramp(k, 32, 46, 116)) for k in range(32)]
drums.append((32 * 4, .5, CRASH, 84))
for bar in range(44, 56):
    if bar in (51, 55):
        drums += [x for x in groove(bar, 92) if x[0] < bar * 4 + 2] + tom_fill(bar, 80, 110)
    else:
        drums += groove(bar, 92, open_hat=bar % 2 == 1)
drums += [(t * 4, .5, CRASH, 100) for t in (44, 48, 52)]


def build():
    s = Song(bpm=BPM, bars=BARS)
    s.add(0, 48, violins, volume=92, pan=78)  # string ensemble: theme in a', pad in the contrast, bridge answers
    s.add(1, 48, ostinato, volume=84, pan=50)  # the same ensemble kept low and short: the ostinato
    s.add(2, 43, bass, volume=100, pan=64)  # contrabass
    s.add(3, 60, horn, volume=100, pan=58)  # french horn: the theme
    s.add(4, 61, brass, volume=76, pan=70)  # brass section: stabs only
    s.add(5, 47, timp, volume=96, pan=64)  # timpani
    s.add(6, 68, oboe, volume=88, pan=72)  # oboe: the contrast
    s.drum(drums, volume=92)
    return s


PARTS = {"violins": violins, "ostinato": ostinato, "bass": bass, "horn": horn, "brass": brass, "timp": timp,
         "oboe": oboe, "drums": drums}


def check(path):
    end = BARS * 4
    for name, notes in PARTS.items():
        assert all(0 <= b and b + l <= end + 1e-9 for b, l, _, _ in notes), f"{name} runs past the loop"
        assert all(1 <= v <= 127 for *_, v in notes), f"{name} velocity out of range"
        ps, vs = [p for _, _, p, _ in notes], [v for *_, v in notes]
        print(f"{name:9s} notes={len(notes):4d} pitch {min(ps)}-{max(ps)} vel {min(vs)}-{max(vs)}")
    assert len(CHORDS) == BARS, len(CHORDS)
    bad = []
    for bar, name in enumerate(CHORDS):  # the bass note sounding at each downbeat is the chord's (slash) root
        want = chord(name)[2]
        under = [p for b, l, p, _ in bass if b <= bar * 4 < b + l]
        if not under or min(under) % 12 != want:
            bad.append((bar + 1, name, under))
    print("bass under chords:", "OK" if not bad else bad)
    assert not bad
    secs = end * 60 / BPM
    dur = float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", path],
                               capture_output=True, text=True, check=True).stdout)
    print(f"bars={BARS} expected {secs:.3f} s, ogg {dur:.3f} s")
    assert abs(dur - secs) < .1
    vol = subprocess.run(["ffmpeg", "-i", path, "-af", "volumedetect", "-f", "null", "-"], capture_output=True, text=True)
    print("\n".join(line.split("] ")[-1] for line in vol.stderr.splitlines() if "_volume" in line))


if __name__ == "__main__":
    ogg = render(build(), OUT, soundfont="MuseScore_General")
    check(ogg)
