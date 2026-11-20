"""Battle theme, eval slot C: D minor, 132 bpm, 52 bars (intro 4, theme 16, contrast 8, bridge 8, return 16).

One chord table drives the bass, the ostinato, the timpani and the checks. Run: python slot_C.py
"""
import os
import re
import statistics
import subprocess
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))
from psx import TOOLS, Song, render  # noqa: E402

BPM, BARS = 132, 52
OUT = os.path.join(TOOLS, "eval", "battle", "slot_C")
SECTIONS = [("intro", 0, 4), ("theme", 4, 16), ("contrast", 20, 8), ("bridge", 28, 8), ("return", 36, 16)]

# one chord per bar; the bridge climbs the bass by semitones from the tonic to the dominant
THEME = "Dm Bb C Am Dm Bb Gm A Bb C Dm F Gm Edim Asus4 A".split()
CHORDS = ("Dm Dm Bb A".split() + THEME + "F C Dm Am Bb F Eb A".split()
          + "Dm Eb Edim F F#dim Gm G#dim A".split() + THEME)
BRIDGE = range(28, 36)
CONTRAST = range(20, 28)

PC = {"C": 0, "D": 2, "E": 4, "F": 5, "G": 7, "A": 9, "B": 11}
QUALITY = {"": (4, 7), "m": (3, 7), "dim": (3, 6), "sus4": (5, 7)}
D_MINOR = {2, 4, 5, 7, 9, 10, 0}


def chord(name):
    """'F#dim' -> (root pitch class, third interval, fifth interval)."""
    m = re.fullmatch(r"([A-G])([#b]?)(.*)", name)
    root = (PC[m[1]] + {"#": 1, "b": -1, "": 0}[m[2]]) % 12
    return (root, *QUALITY[m[3]])


def n(name):
    """'C#5' -> 73 (C4 = 60)."""
    m = re.fullmatch(r"([A-G])([#b]?)(\d)", name)
    return PC[m[1]] + {"#": 1, "b": -1, "": 0}[m[2]] + 12 * (int(m[3]) + 1)


def vel(v):
    return max(1, min(127, round(v)))


def seq(bar, text, v, gate=0.92, swell=0):
    """'D5:1.5 A4:.5 | r:4' from `bar`: downbeats get an accent, `swell` is added linearly over the phrase."""
    for seg in text.split("|"):
        assert abs(sum(float(t.split(":")[1]) for t in seg.split()) - 4) < 1e-9, seg
    toks = [t.split(":") for t in text.replace("|", " ").split()]
    total, t, out = sum(float(d) for _, d in toks), 0.0, []
    for name, d in toks:
        d = float(d)
        if name != "r":
            accent = {0.0: 6, 2.0: 3}.get(t % 4, 0)
            # long notes keep a breath before the next one, short ones are detached by the gate
            out.append((bar * 4 + t, d - 0.12 if d > 1 else d * gate, n(name), vel(v + accent + swell * t / total)))
        t += d
    return out


def shift(notes, semis):
    return [(b, ln, p + semis, v) for b, ln, p, v in notes]


def roll(bar, b0, b1, pitch, v0, v1):
    """Sixteenths from beat b0 to b1 with a crescendo."""
    k = round((b1 - b0) * 4)
    return [(bar * 4 + b0 + i / 4, 0.22, pitch, vel(v0 + (v1 - v0) * i / (k - 1))) for i in range(k)]


# ---- low parts from the chord table -----------------------------------------------------------------------------

BASS_ROOT = {2: 38, 10: 34, 0: 36, 9: 33, 7: 31, 5: 41, 4: 40, 3: 39}  # contrabass register, G1 to F2


def bass_root(bar):
    if bar in BRIDGE:
        return 38 + (bar - 28)  # D2 up to A2, one semitone per bar
    return BASS_ROOT[chord(CHORDS[bar])[0]]


def approach(bar):
    """The eighth before the next bar: a scale step below its root, the leading tone when a dominant resolves."""
    nxt = bass_root((bar + 1) % BARS)
    if CHORDS[bar] in ("A", "Asus4") and nxt % 12 == 2:
        return nxt - 1
    return nxt - 2 if (nxt - 2) % 12 in D_MINOR else nxt - 1


def bass():
    out = []
    for bar in range(BARS):
        b, r, fifth = bar * 4, bass_root(bar), chord(CHORDS[bar])[2]
        low5 = r + fifth if r + fifth <= 45 else r + fifth - 12
        if bar in CONTRAST:  # long notes: the contrast section breathes
            out += [(b, 2.8, r, 78), (b + 3, 0.9, approach(bar), 66)]
        elif bar in BRIDGE:  # quarters that swell over the eight bars (the arco patch is too slow for eighths)
            base = 64 + 5 * (bar - 28)
            out += [(b + i, 0.85, r, vel(base + (8 if i % 2 == 0 else 0))) for i in range(4)]
        else:  # 3+3+2 against the drums
            lift = 6 if bar >= 36 else -8 if bar < 4 else 0
            out += [(b, 1.3, r, 94 + lift), (b + 1.5, 1.3, r, 82 + lift),
                    (b + 3, 0.45, low5, 80 + lift), (b + 3.5, 0.45, approach(bar), 74 + lift)]
    return out


def ostinato():
    out = []
    for bar in range(BARS):
        b, (_, third, fifth), r = bar * 4, chord(CHORDS[bar]), bass_root(bar) + 12
        if bar in CONTRAST:  # quarter-note arpeggio instead of the driving eighths
            out += [(b + i, 0.9, r + iv, 64 if i == 0 else 56) for i, iv in enumerate((0, fifth, third, fifth))]
            continue
        # the return swaps the third for the octave: same figure, wider
        steps = (0, 0, fifth, 0, 12 if bar >= 36 else third, 0, fifth, 0 if bar < 36 else third)
        if bar in BRIDGE:
            loud, soft = 76 + 5 * (bar - 28), 58 + 4 * (bar - 28)
        else:
            loud, soft = (100, 76) if bar >= 36 else (90, 66) if bar < 4 else (98, 74)
        out += [(b + i / 2, 0.4, r + iv, loud if i in (0, 3, 6) else soft) for i, iv in enumerate(steps)]
    return out


TIMP = {2: 50, 9: 45, 10: 46, 0: 48, 7: 43, 5: 41, 4: 52, 3: 51, 6: 42, 8: 44}


def timpani():
    def hit(bar, beat, v):
        return (bar * 4 + beat, 0.45, TIMP[chord(CHORDS[bar])[0]], v)

    def pickup(bar):
        return [hit(bar, 3, 76), hit(bar, 3.5, 86)]

    a = TIMP[9]
    out = [hit(0, 0, 104), *pickup(1), hit(2, 0, 92), hit(3, 0, 88), *roll(3, 2, 4, a, 58, 102)]
    out += [hit(4, 0, 100), *pickup(7), hit(8, 0, 96), *pickup(11), hit(12, 0, 98), *pickup(15), hit(16, 0, 96),
            hit(18, 0, 88), hit(18, 2, 84), hit(19, 0, 90), *roll(19, 2, 4, a, 62, 100)]
    out += roll(27, 2, 4, a, 44, 76)
    out += [hit(bar, 0, 62 + 4 * (bar - 28)) for bar in range(28, 32)]
    out += [hit(bar, beat, 80 + 4 * (bar - 32)) for bar in range(32, 35) for beat in (0, 2)]
    out += roll(35, 0, 4, a, 70, 118)
    for bar in range(36, 52):
        out.append(hit(bar, 0, 102 if bar % 4 == 0 else 84))
        if bar in (39, 43, 47):
            out += pickup(bar)
    out += [hit(50, 2, 90), *roll(51, 2, 4, a, 66, 118)]
    return out


# ---- melodies ---------------------------------------------------------------------------------------------------

# the motif: a held note, a drop, back to the first pitch, then two steps up (1.5 .5 .5 .5 1)
PHRASE_A = "D5:1.5 A4:.5 D5:.5 E5:.5 F5:1 | F5:1.5 E5:.5 D5:2 | E5:1.5 C5:.5 E5:.5 F5:.5 G5:1 | E5:3 r:1"
# the strings answer turns the tail downwards and mirrors the fall of bar 2 with a leap up
ANSWER = ("A5:1.5 F5:.5 A5:.5 G5:.5 F5:1 | D5:1.5 F5:.5 Bb5:2 | G5:1.5 D5:.5 G5:.5 A5:.5 Bb5:1 "
          "| A5:1.5 G5:.5 E5:1 C#5:1")
# the motif again under a new chord (Bb instead of Dm), then the climb to the top note
PHRASE_B = "D5:1.5 Bb4:.5 D5:.5 E5:.5 F5:1 | G5:1.5 E5:.5 G5:1 r:.5 G5:.5 | A5:1.5 G5:.5 F5:1 E5:1 | F5:3 r:1"
CLOSE = "Bb5:1.5 G5:.5 Bb5:.5 A5:.5 G5:1 | E5:1.5 G5:.5 Bb5:2"


def trumpet():
    out = seq(4, PHRASE_A, 96, swell=8) + seq(12, PHRASE_B, 98, swell=10)
    out += seq(18, "D5:2 E5:1 D5:1 | C#5:3 r:1", 94, swell=8)  # 4-3 suspension on the dominant
    # bridge: only the three-step tail, then the motif rhythm hammered on the dominant note
    out += seq(32, "A4:.5 Bb4:.5 C5:1 r:2 | Bb4:.5 C5:.5 D5:1 r:2 | B4:.5 C#5:.5 D5:1 r:2", 92, swell=14)
    out += seq(35, "E5:1.5 E5:.5 E5:.5 E5:.5 E5:1", 100, gate=0.8, swell=12)
    out += seq(36, PHRASE_A, 100, swell=8)
    out += seq(42, "r:2.5 D5:.5 D5:1 | E5:3 r:1", 90, swell=8)  # a call under the strings
    out += seq(44, PHRASE_B, 100, swell=10)
    out += seq(48, "D5:3.5 r:.5 | Bb4:2 E5:2 | D5:2 E5:1 D5:1 | C#5:2 E5:1.5 r:.5", 92, swell=14)
    return out


def strings():
    out = seq(8, ANSWER, 98, swell=8) + seq(16, CLOSE + " | A5:4 | A5:1 G5:1 E5:2", 100, swell=8)
    # contrast: a soft pad under the oboe, each voice moving by step or staying
    pads = ["A3 C4 F4", "G3 C4 E4", "A3 D4 F4", "A3 C4 E4", "Bb3 D4 F4", "A3 C4 F4", "Bb3 Eb4 G4", "A3 C#4 E4"]
    for i, names in enumerate(pads):
        out += [((20 + i) * 4, 3.8, n(x), 40 + 2 * i) for x in names.split()]
    # bridge: the motif a semitone higher each time, then its tail in half bars answering the trumpet
    out += seq(29, "Eb5:1.5 Bb4:.5 Eb5:.5 F5:.5 G5:1", 90) + seq(31, "F5:1.5 C5:.5 F5:.5 G5:.5 A5:1", 96)
    out += seq(32, "r:2 C5:.5 D5:.5 Eb5:1 | r:2 D5:.5 F5:.5 G5:1 | r:2 D5:.5 E5:.5 F5:1 | A5:3.75 r:.25", 96, swell=14)
    # return: a descant over the brass, the answer, the second phrase in unison, the close
    out += seq(36, "F5:2 A5:2 | Bb5:2.5 r:.5 F5:1 | G5:2 C6:2 | A5:3 r:1", 84, swell=6)
    out += seq(40, ANSWER, 98, swell=8) + seq(44, PHRASE_B, 94, swell=10)
    out += seq(48, CLOSE + " | A5:4 | A5:1 G5:1 E5:1.5 r:.5", 100, swell=10)
    return out


def horns():
    def dyads(bar, pairs, v):
        return [((bar + i) * 4, 3.8, p, v + 2 * i) for i, pair in enumerate(pairs) for p in pair]

    cadence = [(62, 65), (60, 64), (62, 65), (60, 65), (62, 67), (58, 64), (57, 62), (57, 61)]
    out = seq(2, "D4:1.5 Bb3:.5 D4:.5 E4:.5 F4:1 | E4:3.5 r:.5", 76, swell=12)  # the motif foreshadowed, low
    out += dyads(12, cadence, 62)
    out += seq(28, "D4:1.5 A3:.5 D4:.5 E4:.5 F4:1", 84) + seq(30, "E4:1.5 Bb3:.5 E4:.5 F4:.5 G4:1", 90)
    out += dyads(32, [(60, 63), (58, 62), (59, 62), (61, 64)], 66)
    out += shift(seq(36, PHRASE_A, 88, swell=8), -12)  # the theme an octave under the trumpet
    out += dyads(40, [(62, 65), (62, 65), (62, 67), (61, 64)], 70) + dyads(44, cadence, 72)
    return out


def oboe():
    return seq(20, "A4:2 C5:1 F5:1 | E5:3 D5:.5 E5:.5 | F5:2 E5:1 D5:1 | C5:2.5 r:.5 A4:1 "
                   "| Bb4:2 D5:1 F5:1 | A5:2.5 G5:.5 F5:1 | G5:1.5 Eb5:.5 G5:1 Bb5:1 | A5:1 E5:1 C#5:2", 84, swell=12)


# ---- drums ------------------------------------------------------------------------------------------------------

KICK, RIM, SNARE, HAT, OPEN_HAT, CRASH = 36, 37, 38, 42, 46, 49
TOMS = (50, 50, 48, 48, 47, 47, 45, 41)


def drums():
    out = []

    def put(bar, beat, note, v):
        out.append((bar * 4 + beat, 0.2, note, vel(v)))

    def hats(bar, v, until=4.0, open_last=False):
        for i in range(round(until * 2)):
            put(bar, i / 2, OPEN_HAT if open_last and i == 7 else HAT, v + (10 if i % 2 == 0 else 0))

    def groove(bar, heavy, fill=None, end=4.0):
        end = 3.0 if fill else end
        hats(bar, 62 if heavy else 54, end, open_last=heavy)
        for beat, v in [(0, 100), (1.5, 84), (2.5, 78)] + ([(3.5, 72)] if heavy else []):
            if beat < end:
                put(bar, beat, KICK, v)
        for beat, v in [(1, 92), (3, 96)] + ([(1.75, 42), (2.75, 46)] if heavy else []):
            if beat < end:
                put(bar, beat, SNARE, v)
        if fill:  # the last beat of a phrase lifts into the next one
            for i in range(4):
                put(bar, 3 + i / 4, SNARE if fill == "snare" else TOMS[2 * i + 1], 72 + 10 * i)

    for bar in range(4):  # intro: hats and a kick, the snare only arrives to open the theme
        hats(bar, 44 + 3 * bar, 2.0 if bar == 3 else 4.0)
        put(bar, 0, KICK, 84)
        if bar >= 2:
            put(bar, 2, KICK, 76)
    out.extend(roll(3, 2, 4, SNARE, 48, 100))
    for start, heavy in ((4, False), (12, True), (36, True), (44, True)):
        for i in range(8):
            bar = start + i
            if bar in (19, 51):
                groove(bar, heavy, end=2.0)  # the big fill below takes the second half
            else:
                groove(bar, heavy, ("snare", "toms")[i // 4] if i % 4 == 3 else None)
    for bar in (19, 51):  # the two big section ends: snare roll into toms
        out.extend(roll(bar, 2, 3, SNARE, 78, 100))
        for i in range(4):
            put(bar, 3 + i / 4, TOMS[2 * i + 1], 96 + 6 * i)
    for bar in CONTRAST:
        first = bar < 24
        hats(bar, 40 if first else 44, 2.0 if bar == 27 else 4.0)
        put(bar, 0, KICK, 66)
        for beat in (2,) if first else (1, 3):
            if bar != 27 or beat < 2:
                put(bar, beat, RIM, 58)
    out.extend(roll(27, 2, 4, SNARE, 40, 78))
    for bar in range(28, 32):  # bridge: starts hushed
        hats(bar, 46)
        put(bar, 0, KICK, 72)
        put(bar, 2, KICK, 70)
        if bar >= 30:
            put(bar, 1, SNARE, 66)
            put(bar, 3, SNARE, 70)
    for bar in range(32, 36):  # then the snare takes over: eighths, sixteenths, toms
        for beat in range(4):
            put(bar, beat, KICK, 80 + 5 * (bar - 32))
    for bar in (32, 33):
        for i in range(8):
            put(bar, i / 2, SNARE, 56 + 8 * (bar - 32) + (12 if i % 2 == 0 else 0))
    out.extend(roll(34, 0, 4, SNARE, 64, 92) + roll(35, 0, 2, SNARE, 88, 108))
    for i, tom in enumerate(TOMS):
        put(35, 2 + i / 4, tom, 92 + 3 * i)
    for bar, v in ((0, 96), (4, 100), (12, 96), (36, 108), (40, 88), (44, 100)):
        put(bar, 0, CRASH, v)
    return out


# ---- song and checks --------------------------------------------------------------------------------------------

# name: (channel, program, volume, pan, notes, lowest and highest pitch the part is allowed)
PARTS = {
    # solo cello: measured on stems, the ensemble patch (48) is about 5.6 dB quieter at equal velocity and dips
    # only 6 dB between eighths at this tempo (cello 8.5 to 10 dB)
    "cello ostinato": (0, 42, 96, 76, ostinato(), 43, 65),
    "contrabass": (1, 43, 94, 64, bass(), 28, 45),
    "trumpet": (2, 56, 100, 74, trumpet(), 57, 81),
    "french horns": (3, 60, 88, 50, horns(), 55, 68),
    "high strings": (4, 48, 127, 42, strings(), 55, 84),
    "timpani": (5, 47, 104, 60, timpani(), 41, 52),
    "oboe": (6, 68, 100, 58, oboe(), 69, 82),
}
DRUMS = drums()


def check():
    total = BARS * 4
    secs = total * 60 / BPM
    assert len(CHORDS) == BARS and sum(ln for _, _, ln in SECTIONS) == BARS, "bar count"
    assert all(a + ln == b for (_, a, ln), (_, b, _) in zip(SECTIONS, SECTIONS[1:])), "sections not contiguous"
    assert 80 <= secs <= 130 and 108 <= BPM <= 150
    assert 6 <= len(PARTS) + 1 <= 9, "palette"
    print(f"{BARS} bars at {BPM} bpm = {secs:.3f} s; parts: {len(PARTS)} pitched + drums")
    print(f"{'part':18}{'notes':>6}{'pitch min/med/max':>20}{'vel min/max':>13}   notes per section")
    for name, (_, _, _, _, notes, lo, hi) in {**PARTS, "drums": (9, 0, 0, 0, DRUMS, 35, 81)}.items():
        ps, vs = [p for _, _, p, _ in notes], [v for *_, v in notes]
        per = [sum(a * 4 <= b < (a + ln) * 4 for b, *_ in notes) for _, a, ln in SECTIONS]
        print(f"{name:18}{len(notes):>6}{min(ps):>9}/{round(statistics.median(ps)):>3}/{max(ps):>3}"
              f"{min(vs):>9}/{max(vs):>3}   {per}")
        assert lo <= min(ps) and max(ps) <= hi, f"{name}: pitch outside {lo}-{hi}"
        assert all(1 <= v <= 127 for v in vs) and max(vs) - min(vs) >= 10, f"{name}: velocity"
        # anything past the loop point would be folded onto bar 1 by the pipeline
        assert all(b >= 0 and ln > 0 and b + ln <= total + 1e-9 for b, ln, _, _ in notes), f"{name}: outside the loop"
        last = {}
        for b, ln, p, _ in sorted(notes):  # a note-off of an overlapping same pitch would cut the second note
            assert b >= last.get(p, 0) - 1e-9, f"{name}: pitch {p} overlaps itself at beat {b}"
            last[p] = b + ln
    pitched = [x for *_, notes, _, _ in PARTS.values() for x in notes]
    bass_notes = PARTS["contrabass"][4]
    for bar, name in enumerate(CHORDS):
        root, third, fifth = chord(name)
        beat = bar * 4
        lowest = min(p for b, ln, p, _ in pitched if b <= beat < b + ln)
        assert lowest % 12 == root, f"bar {bar + 1} {name}: lowest sounding pitch {lowest} is not the root"
        assert any(b == beat and p == lowest for b, _, p, _ in bass_notes), f"bar {bar + 1}: bass is not the lowest"
        # melody notes on the downbeat belong to the chord (dim7 and the dominant seventh count)
        tones = {root, (root + third) % 12, (root + fifth) % 12} | ({(root + 9) % 12} if "dim" in name else set())
        tones |= {(root + 10) % 12} if name == "A" else set()
        for part in ("trumpet", "french horns", "high strings", "oboe"):
            for b, _, p, _ in PARTS[part][4]:
                assert b != beat or p % 12 in tones, f"bar {bar + 1} {name}: {part} downbeat {p} is not a chord tone"
    print(f"bass root is the lowest sounding pitch on the downbeat of all {BARS} bars; downbeat melody notes are chord tones")
    return secs


def build():
    song = Song(bpm=BPM, bars=BARS)
    for ch, prog, vol, pan, notes, _, _ in PARTS.values():
        song.add(ch, prog, notes, volume=vol, pan=pan)
    song.drum(DRUMS, volume=78)
    return song


if __name__ == "__main__":
    expected = check()
    ogg = render(build(), OUT, soundfont="MuseScore_General")
    dur = float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", ogg],
                               capture_output=True, text=True, check=True).stdout)
    vol = subprocess.run(["ffmpeg", "-hide_banner", "-i", ogg, "-af", "volumedetect", "-f", "null", "-"],
                         capture_output=True, text=True).stderr
    mean, peak = (float(re.search(rf"{k}_volume: (-?[\d.]+) dB", vol)[1]) for k in ("mean", "max"))
    print(f"{ogg}: ffprobe {dur:.3f} s (expected {expected:.3f}), mean {mean} dB, max {peak} dB")
    assert abs(dur - expected) < 0.05, "rendered length differs from bars*4*60/bpm"
    assert mean > -35, "the render is close to silent"
