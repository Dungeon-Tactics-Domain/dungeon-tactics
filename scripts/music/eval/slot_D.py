"""Slot D: "Old Road Lantern", a pastoral loop in E minor for Dungeon Tactics (eval brief in BRIEF.md).

Form (4/4, 76 bpm, 40 bars = 126.3 s):
  1-4   Intro      harp arpeggios; the harp states the motif head over Am7; soft conga heartbeat in bars 3-4
  5-12  A          flute theme: motif (rising sixth, stepwise fall), half cadence, then a lift to G major;
                   nylon guitar arpeggios, sparse conga and maracas
  13-20 A'         theme again with an oboe counterline, full hand-drum pattern, cadence on E minor
  21-28 B          oboe lead in G major: the motif's sixth turns major, then inverted (falling sixth, rising steps);
                   harp arpeggios, rolled guitar chords, tambourine joins; bongo pickups close A' and B
  29-36 A''        theme varied an octave up to an E6 climax, oboe in thirds, harp shimmer
  37-40 Coda       oboe plays the motif in augmentation; Bsus4-B7 pulls back into bar 1
Run: python scripts/music/eval/slot_D.py  (writes slot_D.mid and slot_D.ogg in <MUSIC_TOOLS>/eval)
"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
from psx import TOOLS, Song, render  # noqa: E402

BPM, BARS = 76, 40
END = BARS * 4
OUT = os.path.join(TOOLS, "eval", "slot_D")

PROG = [
    "Em", "Cmaj7", "Am7", "Bsus4 B7",  # 1-4 intro
    "Em", "Cmaj7", "Am7", "B7",  # 5-8 A, half cadence
    "Em", "Cmaj7", "Am7 D", "G",  # 9-12 consequent lands on the relative major (the hopeful turn)
    "Em", "Cmaj7", "Am7", "B7",  # 13-16 A'
    "Em Em/D", "Cmaj7", "Am7 B7", "Em",  # 17-20 descending bass, full cadence
    "C", "D", "Bm7", "Em",  # 21-24 B: IV V iii vi of G
    "Am7", "D", "G Em", "Am7 B7",  # 25-28 back to the dominant of E minor
    "Em", "Cmaj7", "Am7", "B7",  # 29-32 A''
    "Em Em/D", "Cmaj7", "Am7 B7", "Em",  # 33-36
    "Cmaj7", "G/B", "Am7", "Bsus4 B7",  # 37-40 coda, the dominant leads into bar 1
]
assert len(PROG) == BARS

STEP = {"C": 0, "D": 2, "E": 4, "F": 5, "G": 7, "A": 9, "B": 11}


def pitch(name):
    acc = name[1:-1]
    return 12 * (int(name[-1]) + 1) + STEP[name[0]] + acc.count("#") - acc.count("b")


def pcs(names):
    return {STEP[n[0]] + n.count("#") for n in names.split()}


GTR = {k: [pitch(n) for n in v.split()] for k, v in {
    "Em": "E3 B3 E4 G4", "Cmaj7": "C3 B3 E4 G4", "Am7": "A2 C4 E4 G4", "B7": "B2 A3 D#4 F#4",
    "Bsus4": "B2 A3 E4 F#4", "G": "G2 B3 D4 G4", "G/B": "B2 G3 D4 G4", "D": "D3 A3 D4 F#4",
    "C": "C3 G3 E4 G4", "Bm7": "B2 A3 D4 F#4", "Em/D": "D3 B3 E4 G4"}.items()}
# Voicings share common tones (Em -> Cmaj7 -> Am7 move one voice), so the arpeggios lead smoothly.
HARP = {k: v + [v[2] + 12, v[3] + 12] for k, v in GTR.items()}
PAD = {k: [pitch(n) for n in v.split()] for k, v in {
    "Em": "G3 B3 E4", "Cmaj7": "G3 B3 E4", "Am7": "G3 C4 E4", "B7": "F#3 A3 D#4", "Bsus4": "F#3 A3 E4",
    "G": "G3 B3 D4", "G/B": "G3 B3 D4", "D": "F#3 A3 D4", "C": "G3 C4 E4", "Bm7": "F#3 A3 D4",
    "Em/D": "G3 B3 E4"}.items()}
# Chord tones plus the tensions allowed under a held melody note (9ths, 6ths, 11th on minor chords,
# #11 on Cmaj7 for the coda's augmented motif).
TONES = {k: pcs(v) for k, v in {
    "Em": "E G B D F#", "Cmaj7": "C E G B D A F#", "Am7": "A C E G B D", "B7": "B D# F# A", "Bsus4": "B E F# A",
    "G": "G B D A E", "G/B": "G B D A E", "D": "D F# A E", "C": "C E G D A B", "Bm7": "B D F# A E",
    "Em/D": "E G B D F#"}.items()}


def at(bar, beat=0.0):
    return (bar - 1) * 4 + beat


def spans(bar):
    names = PROG[bar - 1].split()
    n = 4 / len(names)
    return [(i * n, n, name) for i, name in enumerate(names)]


def chord_at(t):
    bar = int(t // 4) + 1
    return next(name for s, n, name in spans(bar) if s <= t - at(bar) < s + n)


def vel(v):
    return max(1, min(127, int(round(v))))


def line(first_bar, bars, base, ref, arch=(0, 3, 5, -3)):
    """Bars of "PITCH:BEATS" tokens ("r" = rest). Velocity follows a 4-bar arch, the pitch and the beat."""
    out = []
    for i, text in enumerate(bars):
        b = 0.0
        for tok in text.split():
            name, dur = tok.split(":")
            dur = float(dur)
            if name != "r":
                p = pitch(name)
                accent = 4 if b % 2 == 0 else 0 if b % 1 == 0 else -3 if b % 0.5 == 0 else -6
                out.append((at(first_bar + i, b), dur, p, vel(base + arch[i % 4] + 0.6 * (p - ref) + accent)))
            b += dur
        assert abs(b - 4) < 1e-9, f"bar {first_bar + i} has {b} beats: {text}"
    return out


def arpeggio(first, last, table, pattern, base, size=None, ring=2.0):
    """Eighth-note arpeggio; notes ring but stop at the chord change, like a player lifting the hand."""
    out = []
    for bar in range(first, last + 1):
        for s, n, name in spans(bar):
            voicing = table[name][:size] if size else table[name]
            for k in range(int(n * 2)):
                start = at(bar, s + k / 2)
                end = min(start + ring, at(bar, s + n))
                v = base + (8 if k == 0 else 0) - (4 if k % 2 else 0) + (2 if bar % 2 else 0)
                out.append((start, end - start, voicing[pattern[k % len(pattern)]], vel(v)))
    return out


def roll(start, length, pitches, v, step=0.04):
    return [(start + i * step, length - i * step, p, vel(v - 2 * i)) for i, p in enumerate(pitches)]


def pad(first, last, base):
    """Sustained strings; a pitch kept by the next chord is held, not re-bowed."""
    out, held = [], {}
    for bar in range(first, last + 1):
        for s, _, name in spans(bar):
            t, cur = at(bar, s), set(PAD[name])
            for p in [p for p in held if p not in cur]:
                st, v = held.pop(p)
                out.append((st, t - st, p, v))
            for p in cur - held.keys():
                held[p] = (t, vel(base + (4 if (bar - first) % 4 == 2 else 0)))
    for p, (st, v) in held.items():
        out.append((st, at(last + 1) - st, p, v))
    return out


def trim(notes):
    """A repeated pitch on one channel cuts the earlier note, so note_offs never land inside the next note."""
    notes = sorted(notes)
    out = []
    for i, (t, n, p, v) in enumerate(notes):
        nxt = next((t2 for t2, _, p2, _ in notes[i + 1:] if p2 == p and t2 > t), None)
        out.append((t, min(n, nxt - t) if nxt is not None else n, p, v))
    return out


# ---- melody -----------------------------------------------------------------------------------------------
flute = (
    line(4, ["r:3.5 B4:.5"], 64, 76)
    + line(5, [
        "G5:1.5 F#5:.5 E5:1 D5:.5 E5:.5",  # motif: B -> G rising sixth, then the stepwise sigh
        "B4:2 A4:.5 B4:.5 C5:.5 D5:.5",
        "E5:1.5 D5:.5 C5:1 B4:.5 A4:.5",
        "B4:3 r:.5 B4:.5",  # half cadence
        "G5:1.5 A5:.5 B5:1 A5:.5 G5:.5",  # same sixth, now climbing instead of falling
        "E5:2 D5:.5 E5:.5 G5:1",
        "A5:1.5 G5:.5 F#5:1 E5:.5 F#5:.5",
        "G5:3 r:.5 B4:.5",
    ], 70, 76)
    + line(13, [
        "G5:1.5 F#5:.5 E5:1 D5:.5 E5:.5",
        "B4:1.5 C5:.25 B4:.25 A4:.5 B4:.5 C5:.5 D5:.5",  # turn ornament on the second pass
        "E5:1.5 D5:.5 C5:1 B4:.5 A4:.5",
        "B4:3 r:.5 B4:.5",
        "G5:1.5 A5:.5 B5:1 A5:.5 G5:.5",
        "E5:2 D5:.5 E5:.5 G5:1",
        "A5:1 G5:.5 E5:.5 F#5:1 D#5:1",  # leading tone, so this time the phrase closes on E minor
        "E5:3 r:1",
    ], 74, 76)
    + line(28, ["r:3.5 B4:.5"], 72, 76)
    + line(29, [
        "G5:1.5 F#5:.5 E5:.5 F#5:.25 E5:.25 D5:.5 E5:.5",
        "B5:2 A5:.5 B5:.5 C6:.5 D6:.5",  # the held B jumps an octave and runs up to the climax
        "E6:1.5 D6:.5 C6:1 B5:.5 A5:.5",
        "B5:1.5 A5:.5 F#5:1 D#5:.5 B4:.5",
        "G5:1.5 A5:.5 B5:1 D6:.5 B5:.5",
        "B5:2 G5:.5 E5:.5 G5:.5 A5:.5",
        "C6:1.5 B5:.5 A5:.5 F#5:.5 D#5:1",
        "E5:3 r:1",
    ], 82, 76)
)

oboe = (
    line(13, [  # A': a slow inner line under the flute, plus one echo of the motif tail over the held B
        "B4:4",
        "G4:4",
        "A4:2 G4:2",
        "F#4:1 F#5:.5 E5:.5 D#5:2",
        "E5:2 D5:2",
        "B4:2 G4:2",  # not C5: over the Cmaj7's B3 it would be a minor ninth
        "E5:1 C5:1 B4:1 A4:1",
        "G4:2 B4:1 r:.5 G4:.5",
    ], 50, 70)
    + line(21, [  # B: G -> E is the motif's sixth made major; bar 23 inverts it (B down to D, steps up)
        "E5:1.5 D5:.5 C5:1 D5:.5 E5:.5",
        "F#5:2.5 E5:.5 D5:.5 E5:.5",
        "B5:1 D5:1.5 E5:.5 F#5:1",
        "G5:2.5 F#5:.5 E5:.5 C5:.5",
        "A5:1.5 G5:.5 E5:1 D5:.5 E5:.5",
        "F#5:1.5 G5:.5 A5:2",
        "B5:2 A5:.5 G5:.5 E5:1",
        "A5:1 G5:.5 F#5:.5 D#5:2",
    ], 76, 76)
    + line(29, [  # A'': mostly thirds under the flute
        "B4:2 G4:1 B4:1",
        "G5:2 E5:1 A5:1",
        "C6:1.5 B5:.5 A5:1 G5:.5 E5:.5",
        "D#5:2 A4:2",
        "E5:1.5 F#5:.5 G5:2",
        "G5:2 E5:2",
        "A5:1.5 G5:.5 D#5:1 B4:1",
        "G4:3 B4:1",
    ], 62, 76)
    + line(37, [  # coda: the motif in augmentation (every value doubled), fading out
        "G5:3 F#5:1",
        "E5:2 D5:1 E5:1",
        "C5:2 B4:1 A4:1",
        "B4:4",
    ], 58, 72, arch=(2, 0, -3, -6))
)

# ---- accompaniment ----------------------------------------------------------------------------------------
ROLL = [0, 1, 2, 3, 2, 1, 2, 1]
guitar = arpeggio(5, 12, GTR, ROLL, 48) + arpeggio(13, 20, GTR, ROLL, 52) + arpeggio(29, 36, GTR, ROLL, 55)
for bar in range(21, 29):  # B: syncopated rolled chords instead of arpeggios, the harp takes the motion
    for s, n, name in spans(bar):
        guitar += roll(at(bar, s), min(n, 2.5), GTR[name], 50)
        if n == 4:
            guitar += roll(at(bar, 2.5), 1.5, GTR[name], 44)

harp = (
    arpeggio(1, 2, HARP, [0, 1, 2, 3, 4, 5, 4, 3], 50)
    + arpeggio(3, 4, HARP, [0, 1, 2, 3, 2, 1, 2, 3], 44, size=4)  # low only: the motif sits on top
    + line(2, ["r:3.5 B4:.5", "G5:1.5 F#5:.5 E5:1.5 F#5:.5", "E5:2 D#5:2"], 60, 76)
    + arpeggio(21, 28, HARP, [0, 1, 2, 3, 4, 3, 2, 1], 44, size=5)
    + arpeggio(37, 40, HARP, [0, 1, 2, 3, 2, 1, 2, 3], 48, size=4)
)
for bar in (29, 31, 33, 35):  # A'': a high rolled chord every other bar for shimmer
    s, n, name = spans(bar)[0]
    harp += roll(at(bar, s), min(n, 2), [p + 12 for p in GTR[name]], 44)

strings = pad(1, 4, 36) + pad(9, 12, 34) + pad(13, 20, 44) + pad(21, 28, 54) + pad(29, 36, 60) + pad(37, 40, 40)

bass = (
    line(1, ["E2:4", "C2:4", "A1:4", "B1:4"], 58, 40)
    + line(5, [
        "E2:2 B1:1.5 D2:.5", "C2:2 G1:1.5 B1:.5", "A1:2 E2:1.5 C2:.5", "B1:2 F#2:1.5 D#2:.5",
        "E2:2 B1:1.5 D2:.5", "C2:2 G1:1.5 B1:.5", "A1:2 D2:2", "G2:2 D2:1.5 F#2:.5",
    ], 66, 40)
    + line(13, [  # approach notes chosen so the bass never doubles the flute's line in octaves
        "E2:1.5 B1:.5 G2:1 D2:1", "C2:1.5 G1:.5 C2:1 B1:1", "A1:1.5 E2:.5 C2:1 A1:1", "B1:2 F#2:1 D#2:1",
        "E2:2 D2:2", "C2:1.5 G1:.5 C2:1 B1:1", "A1:2 B1:2", "E2:2 B1:1.5 D2:.5",
    ], 70, 40)
    + line(21, [
        "C2:1.5 G2:.5 E2:1.5 C2:.5", "D2:1.5 A1:.5 D2:1 C2:1", "B1:1.5 F#2:.5 A2:1 F#2:1", "E2:1.5 B1:.5 E2:1 G2:1",
        "A2:1.5 E2:.5 A1:1 C2:1", "D2:1.5 A1:.5 D2:1 F#2:1", "G2:2 E2:1.5 B1:.5", "A1:2 B1:1.5 D#2:.5",
    ], 72, 40)
    + line(29, [
        "E2:1.5 B1:.5 G2:1 D2:1", "C2:1.5 G1:.5 C2:1 B1:1", "A1:1.5 E2:.5 G2:1 A2:1", "B2:1.5 F#2:.5 D#2:1 B1:1",
        "E2:2 D2:2", "C2:1.5 G1:.5 C2:1 B1:1", "A1:2 B1:2", "E2:2 B1:1 D2:1",
    ], 76, 40)
    + line(37, ["C2:4", "B1:4", "A1:4", "B1:4"], 60, 40, arch=(2, 0, -3, -6))
)

# ---- light folk percussion (GM1 kit notes) ----------------------------------------------------------------
HI_BONGO, LO_BONGO, MUTE_CONGA, OPEN_CONGA, LOW_CONGA = 60, 61, 62, 63, 64
TAMBOURINE, MARACAS, TRIANGLE = 54, 70, 81
drums = []


def hit(bar, beat, note, v):
    drums.append((at(bar, beat), 0.25, note, v))


for bar in (3, 4, 37, 38):  # a soft heartbeat so the quiet loop seam is not empty
    hit(bar, 0, LOW_CONGA, 34 if bar in (3, 38) else 42)
for bar in range(5, 13):  # A: sparse
    hit(bar, 0, LOW_CONGA, 54)
    hit(bar, 2, MUTE_CONGA, 34)
    hit(bar, 1, MARACAS, 22)
    hit(bar, 3, MARACAS, 24)
for bar in range(13, 37):  # A', B, A'': the full hand-drum pattern
    hit(bar, 0, LOW_CONGA, 62)
    hit(bar, 1.5, LOW_CONGA, 40)
    hit(bar, 2, OPEN_CONGA, 46)
    hit(bar, 3, MUTE_CONGA, 36)
    hit(bar, 3.5, MUTE_CONGA, 30)
    for k in range(8):
        hit(bar, k / 2, MARACAS, 28 if k % 2 else 20)  # shaker leans on the off-beats
    if bar >= 21:
        hit(bar, 1, TAMBOURINE, 32 if bar < 29 else 38)
        hit(bar, 3, TAMBOURINE, 36 if bar < 29 else 42)
for bar in (20, 28):  # bongo pickup into B and into A''
    for k, (note, v) in enumerate([(HI_BONGO, 30), (HI_BONGO, 36), (LO_BONGO, 42), (LO_BONGO, 50)]):
        drums.append((at(bar, 3 + k * 0.25), 0.25, note, v))
drums = [d for d in drums if not (d[0] >= at(20, 3) and d[0] < at(21) and d[2] in (MUTE_CONGA, MARACAS))]
drums = [d for d in drums if not (d[0] >= at(28, 3) and d[0] < at(29) and d[2] in (MUTE_CONGA, MARACAS))]
for bar in (13, 21, 29, 37):  # section marks
    hit(bar, 0, TRIANGLE, 30)

PARTS = {  # name: (channel, GM program 0-based, volume, pan, range low-high, notes)
    "flute": (0, 73, 100, 72, (60, 96), trim(flute)),
    "oboe": (1, 68, 92, 54, (58, 91), trim(oboe)),
    "guitar": (2, 24, 96, 44, (40, 83), trim(guitar)),
    "harp": (3, 46, 90, 86, (23, 103), trim(harp)),
    "strings": (4, 49, 78, 64, (40, 96), trim(strings)),
    "bass": (5, 32, 100, 64, (28, 55), trim(bass)),
}
DRUMS = trim(drums)


# ---- checks -----------------------------------------------------------------------------------------------
def checks():
    last = 0.0
    for name, (_, _, _, _, (lo, hi), notes) in list(PARTS.items()) + [("drums", (9, 0, 0, 0, (35, 81), DRUMS))]:
        ps = [p for _, _, p, _ in notes]
        assert lo <= min(ps) and max(ps) <= hi, f"{name} out of range {min(ps)}-{max(ps)}"
        for t, n, p, v in notes:
            assert n > 0.01 and 1 <= v <= 127 and isinstance(v, int), (name, t, n, p, v)
        for i, (t, n, p, _) in enumerate(notes):
            assert all(not (p2 == p and t <= t2 < t + n - 1e-9) for t2, _, p2, _ in notes[i + 1:]), (name, t, p)
        last = max(last, max(t + n for t, n, _, _ in notes))
        vs = [v for *_, v in notes]
        print(f"{name:8} notes {len(notes):4}  pitch {min(ps):3}-{max(ps):3}  velocity {min(vs):3}-{max(vs):3}")
    assert abs(last - END) < 1e-9, f"last note ends at {last}, loop is {END}"
    print(f"bars {BARS}, last note ends at beat {last} = {END}; loop length {END * 60 / BPM:.3f} s")

    # "No part clashes", read as: no two parts holding a semitone or minor ninth together for 3/4 beat or more.
    flat = sorted((t, t + n, p, name) for name, (*_, notes) in PARTS.items() for t, n, p, _ in notes)
    clashes = []
    for i, (t, e, p, a) in enumerate(flat):
        for t2, e2, p2, b in flat[i + 1:]:
            if t2 >= e:
                break
            if a != b and abs(p - p2) in (1, 13) and min(e, e2) - t2 >= 0.75:
                clashes.append((round(t2 / 4 + 1, 2), a, p, b, p2))
    print(f"sustained semitone/minor-ninth clashes between parts: {len(clashes)}", clashes[:12])

    # Held melody notes (one beat or more) must be chord tones or the listed tensions.
    off = [(name, round(t / 4 + 1, 2), p, chord_at(t)) for name in ("flute", "oboe")
           for t, n, p, _ in PARTS[name][5] if n >= 1 and p % 12 not in TONES[chord_at(t)]]
    print(f"held melody notes outside the chord: {len(off)}", off[:12])

    # Parallel fifths/octaves between the bass and the top line (flute, else oboe) at bass onsets.
    def top(t):
        for name in ("flute", "oboe"):
            hits = [p for s, n, p, _ in PARTS[name][5] if s <= t < s + n]
            if hits:
                return max(hits)
        return None

    pairs = [(t, p, top(t)) for t, _, p, _ in PARTS["bass"][5]]
    par = [(round(t2 / 4 + 1, 2), (m2 - b2) % 12) for (t1, b1, m1), (t2, b2, m2) in zip(pairs, pairs[1:])
           if m1 and m2 and b1 != b2 and m1 != m2 and (m1 - b1) % 12 == (m2 - b2) % 12 in (0, 7)]
    print(f"parallel fifths/octaves bass vs top line: {len(par)}", par[:12])


checks()
song = Song(bpm=BPM, bars=BARS)
for name, (ch, prog, vol, pan, _, notes) in PARTS.items():
    song.add(channel=ch, program=prog, notes=notes, volume=vol, pan=pan)
song.drum(DRUMS, volume=84)
print("wrote", render(song, OUT, soundfont="MuseScore_General"))
