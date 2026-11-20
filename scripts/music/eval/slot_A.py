"""Eval slot A: "Embers on the Mill Road", an original pastoral loop in D major (80 bpm, 40 bars, 2:00).

Form (bars, 1-based):
   1- 4  intro      harp arpeggio, pad, the oboe pre-echoes the motif's falling step
   5-12  A          pan flute theme over a stepwise falling bass, nylon guitar arpeggio, hand drum
  13-20  A'         theme ornamented, oboe counter-line, pad, harp off-beats, tambourine
  21-28  B          relative minor, oboe lead with the motif inverted, bVII colour (C) before the dominant
  29-36  A''        return: the motif's second statement leaps up instead of down, peak on D6, deceptive cadence
  37-40  coda       motif augmented to two bars, texture thins, dominant leads back to bar 1

Run: python scripts/music/eval/slot_A.py  (checks the score, renders, then checks the files).
"""
import os
import subprocess
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))  # psx.py lives one folder up

import mido
from psx import TOOLS, Song, render

BPM, BARS = 80, 40
TOTAL = BARS * 4  # beats
LOOP_SECS = TOTAL * 60 / BPM
OUT = os.path.join(TOOLS, "eval", "slot_A")

PITCH_CLASS = {"C": 0, "D": 2, "E": 4, "F": 5, "G": 7, "A": 9, "B": 11}
D_MAJOR = (0, 2, 4, 5, 7, 9, 11)


def n(name):
    """'F#4' -> 66."""
    return 12 * (int(name[-1]) + 1) + PITCH_CLASS[name[0]] + (name[1] == "#")


def deg(i):
    """Diatonic index in D major -> MIDI pitch; 0 is D4. Motif transforms stay in the scale this way."""
    return 62 + 12 * (i // 7) + D_MAJOR[i % 7]


# The motif: fifth of the chord, a step up, a leap to the ninth, a step down onto the root.
MOTIF_STEPS, MOTIF_RHYTHM = (0, 1, 4, 3), (1.5, 0.5, 1, 1)


def motif(start, invert=False, aug=1):
    sign = -1 if invert else 1
    return [(deg(start + sign * s), d * aug) for s, d in zip(MOTIF_STEPS, MOTIF_RHYTHM)]


def line(text):
    """'A4:1.5 R:.5' -> [(pitch or None for a rest, beats)]."""
    return [(None if p == "R" else n(p), float(d)) for p, d in (t.split(":") for t in text.split())]


def voice(phrases):
    """(first bar, tokens, base velocity) -> psx notes for a monophonic part."""
    out = []
    for bar, tokens, base in phrases:
        assert sum(d for _, d in tokens) % 4 == 0, f"phrase at bar {bar} does not fill whole bars"
        top = max(p for p, _ in tokens if p)
        t = (bar - 1) * 4
        for i, (p, d) in enumerate(tokens):
            if p:
                ends_phrase = i + 1 < len(tokens) and tokens[i + 1][0] is None
                gate = d * (0.88 if ends_phrase else 0.97)  # legato inside the phrase, a breath before a rest
                vel = base + 5 * (t % 4 == 0) - 7 * (d <= 0.5) + 4 * (p == top)  # downbeat, passing note, peak
                out.append((t, gate, p, vel))
            t += d
    return out


# ---- harmony -------------------------------------------------------------------------------------------------
CHORDS = {  # name: bass, guitar voicing (low to high), pad voicing; upper voices move by step between chords
    "D": ("D3", "A3 D4 F#4 A4", "D4 F#4 A4"),
    "G/D": ("D3", "G3 B3 D4 G4", "D4 G4 B4"),
    "A/C#": ("C#3", "A3 C#4 E4 A4", "C#4 E4 A4"),
    "Bm7": ("B2", "A3 D4 F#4 B4", "D4 F#4 A4"),
    "F#m/A": ("A2", "A3 C#4 F#4 A4", "C#4 F#4 A4"),
    "G": ("G2", "G3 B3 D4 G4", "B3 D4 G4"),
    "D/F#": ("F#2", "F#3 A3 D4 F#4", "A3 D4 F#4"),
    "Em7": ("E2", "E3 B3 D4 G4", "B3 D4 G4"),
    "Asus4": ("A2", "A3 D4 E4 A4", "A3 D4 E4"),
    "A": ("A2", "A3 C#4 E4 A4", "A3 C#4 E4"),
    "A7": ("A2", "G3 C#4 E4 A4", "G3 C#4 E4"),
    "Bm": ("B2", "B3 D4 F#4 B4", "B3 D4 F#4"),
    "Em": ("E2", "E3 B3 E4 G4", "B3 E4 G4"),
    "F#m": ("F#2", "F#3 C#4 F#4 A4", "A3 C#4 F#4"),
    "C": ("C3", "G3 C4 E4 G4", "G3 C4 E4"),
}
CHORDS = {k: (n(b), [n(x) for x in g.split()], [n(x) for x in p.split()]) for k, (b, g, p) in CHORDS.items()}

# one cell per bar; "X+Y" splits the bar in two halves
PROG = ("D G/D D Asus4+A "
        "D A/C# Bm7 F#m/A G D/F# Em7 Asus4+A "
        "D A/C# Bm7 F#m/A G D/F# Em7+A7 D+A/C# "
        "Bm G Em F#m Bm G C Asus4+A "
        "D A/C# Bm7 F#m/A G D/F# Em7+A7 Bm "
        "G D/F#+G Em7 Asus4+A").split()
assert len(PROG) == BARS
SEGS = []  # (bar, start beat, beats, chord name)
for b, cell in enumerate(PROG):
    names = cell.split("+")
    SEGS += [(b + 1, b * 4 + k * 4 / len(names), 4 / len(names), name) for k, name in enumerate(names)]


def section(bar):
    return ("intro" if bar <= 4 else "A" if bar <= 12 else "A2" if bar <= 20 else "B" if bar <= 28
            else "A3" if bar <= 36 else "coda")


def arp(t, beats, voicing, order, vels, offset=0.0, ring=0.9):
    """Eighth-note broken chord; notes ring but never across the chord change."""
    out = []
    for k in range(int(beats * 2)):
        start = t + offset + k * 0.5
        out.append((start, min(ring, t + beats - start), voicing[order[k]], vels[k]))
    return out


# ---- lead: pan flute -----------------------------------------------------------------------------------------
flute = voice([
    # A: the motif falls by thirds with the chord roots (on A, on F#), then rises to D for the second half
    (5, motif(4), 74),
    (6, line("E5:1 C#5:.5 B4:.5 A4:1.5 R:.5"), 70),
    (7, motif(2), 72),
    (8, line("C#5:1.5 A4:.5 F#4:1 A4:.5 B4:.5"), 72),
    (9, motif(7), 82),
    (10, line("A5:1.5 F#5:.5 D5:1 E5:.5 F#5:.5"), 84),
    (11, line("G5:1.5 F#5:.5 E5:1 D5:.5 B4:.5"), 78),
    (12, line("D5:2 C#5:1.5 R:.5"), 70),  # 4-3 suspension on the half cadence
    # A': same skeleton, answers ornamented, closes on the tonic
    (13, motif(4), 78),
    (14, line("E5:.5 F#5:.5 E5:.5 C#5:.5 A4:1.5 R:.5"), 74),
    (15, motif(2), 76),
    (16, line("C#5:1 E5:1 C#5:.5 A4:.5 B4:.5 C#5:.5"), 78),
    (17, motif(7), 86),
    (18, line("A5:1 B5:.5 A5:.5 F#5:1 D5:.5 F#5:.5"), 90),
    (19, line("G5:1.5 F#5:.5 E5:1 C#5:.5 E5:.5"), 82),
    (20, line("D5:2 R:2"), 72),
    # A'': the second statement leaps up a sixth instead of falling a third; the piece peaks on D6 in bar 33
    (29, motif(4), 84),
    (30, line("E5:1 F#5:.5 E5:.5 C#5:.5 B4:.5 A4:.5 R:.5"), 80),
    (31, motif(9), 90),
    (32, line("C#6:1.5 A5:.5 F#5:1 A5:.5 B5:.5"), 94),
    (33, line("D6:2 B5:.5 A5:.5 G5:1"), 100),
    (34, line("A5:1.5 F#5:.5 D5:1 E5:.5 F#5:.5"), 90),
    (35, line("G5:1.5 F#5:.5 E5:1 C#5:.5 E5:.5"), 84),
    (36, line("D5:3 R:1"), 76),  # over Bm: the cadence is deceptive, the coda finishes the thought
    # coda: the motif at half speed, then a fall onto the dominant's fifth
    (37, motif(7, aug=2), 72),
    (39, line("E5:1.5 D5:.5 B4:1 D5:1"), 64),
    (40, line("E5:2.5 R:1.5"), 56),
])

# ---- oboe: intro echo, counter-line in A' and A'', lead in B --------------------------------------------------
tail, tail_low = motif(4)[2:], motif(3)[2:]  # the motif's falling step (E-D), then a step lower (D-C#)
oboe = voice([
    (3, [(None, 1), (tail[0][0], 1), (tail[1][0], 2)], 58),
    (4, [(None, 1), (tail_low[0][0], 1), (tail_low[1][0], 1.5), (None, 0.5)], 54),
    (13, line("F#4:4"), 54),
    (14, line("R:2.5 E5:.5 C#5:1"), 60),  # answers in the flute's breath
    (15, line("D5:2 R:2"), 58),
    (16, line("F#4:3 R:1"), 54),
    (17, line("B4:2 D5:2"), 60),
    (18, line("D5:2 A4:2"), 62),
    (19, line("B4:2 G4:2"), 58),
    (20, line("F#4:2 R:1 C#5:.5 E5:.5"), 66),  # pickup: the counter-voice becomes the lead
    # B: inverted motif on F# and on E, then a climb to the bVII bar
    (21, motif(9, invert=True), 80),
    (22, line("B4:1.5 D5:1 R:.5 B4:.5 D5:.5"), 74),
    (23, motif(8, invert=True), 80),
    (24, line("C#5:1.5 B4:.5 A4:1.5 R:.5"), 74),
    (25, line("D5:.5 E5:.5 F#5:1.5 E5:.5 D5:1"), 84),
    (26, line("G5:1.5 F#5:.5 D5:1 E5:.5 F#5:.5"), 90),
    (27, line("G5:2 E5:1 C5:1"), 88),  # C natural: the Mixolydian colour
    (28, line("D5:2 C#5:1.5 R:.5"), 76),  # rhymes with bar 12
    (29, line("F#4:2 A4:2"), 60),
    (30, line("E4:2 R:.5 E5:.5 C#5:1"), 64),
    (31, line("D5:2 F#5:2"), 66),
    (32, line("A4:2 C#5:2"), 66),
    (33, line("B4:2 D5:2"), 68),
    (34, line("D5:2 A4:2"), 64),
    (35, line("B4:2 G4:2"), 60),
    (36, line("F#4:3 R:1"), 56),
    (39, line("G4:3 R:1"), 52),
    (40, line("A4:2.5 R:1.5"), 46),
])

# ---- accompaniment, generated from the chord plan ------------------------------------------------------------
GUITAR_ORDER = (0, 1, 2, 3, 2, 1, 2, 3)
GUITAR_VELS = (64, 48, 52, 56, 58, 48, 52, 54)
HARP_B_ORDER = (0, 2, 1, 3, 2, 3, 1, 2)
HARP_B_VELS = (54, 44, 46, 52, 48, 50, 44, 46)
HARP_FILL_ORDER = (2, 3, 1, 2, 3, 2, 1, 2)  # off-sixteenths between the guitar's eighths in the return
INTRO_VELS = (56, 44, 48, 50, 54, 48, 46, 42)
UP_DOWN = (0, 1, 2, 3, 4, 3, 2, 1)

guitar, harp, bass, pad = [], [], [], []
for bar, t, beats, name in SEGS:
    root, gtr, pads = CHORDS[name]
    sec = section(bar)

    if sec in ("A", "A2", "A3") or bar in (37, 38):
        lift = {"A": 0, "A2": 2, "A3": 8, "coda": -8}[sec]
        guitar += arp(t, beats, gtr, GUITAR_ORDER, [v + lift for v in GUITAR_VELS])
    elif sec == "B" or bar in (39, 40):
        # rolled chord, then two plucks: the guitar steps back while the harp carries the motion
        guitar += [(t + i * 0.08, min(beats - 0.3, 2.2), p, 58 - 3 * i) for i, p in enumerate(gtr)]
        if beats == 4:
            guitar += [(t + 2.5, 0.5, gtr[2], 46), (t + 3, 0.9, gtr[3], 50)]

    if sec == "A2":  # off-beat dyads, a light lilt against the bass on 1 and 3
        for off in (1, 3) if beats == 4 else (1,):
            harp += [(t + off, 0.9, p, 44) for p in pads[1:]]
    elif sec == "B":
        harp += arp(t, beats, gtr, HARP_B_ORDER, HARP_B_VELS)
    elif sec == "A3":
        harp += arp(t, beats, gtr, HARP_FILL_ORDER, [40] * 8, offset=0.25, ring=0.25)

    if sec in ("A", "A2"):
        bass += [(t, 1.5, root, 80), (t + 1.5, 0.5, root, 58), (t + 2, 1.9, root, 70)] if beats == 4 \
            else [(t, 1.9, root, 76)]
    elif sec == "A3":
        bass += [(t, 1.5, root, 84), (t + 1.5, 0.5, root, 60)]
        if beats == 4:
            bass += [(t + 2, 0.95, root, 72), (t + 3, 0.95, root, 64)]
    elif sec == "B":
        bass.append((t, beats - 0.1, root, 66))
    elif sec == "coda":
        bass.append((t, beats - 0.1, root, 68 - 4 * (bar - 37)))

    if sec != "A":  # the first theme statement stays bare: flute, guitar, bass, hand drum
        vel = {"intro": 46, "A2": 46, "B": 54, "A3": 58, "coda": 48 - 2 * (bar - 37)}[sec]
        pad += [(t, beats, p, vel + 3 * (p == pads[-1])) for p in pads]  # ends on the last beat: fixes the loop length

# intro and the last two bars: the harp alone carries the pulse, so the loop point keeps one texture
for bar, voicing in ((1, "D3 A3 D4 F#4 A4"), (2, "D3 G3 B3 D4 G4"), (3, "D3 A3 D4 F#4 A4"), (39, "E3 B3 D4 G4 B4")):
    harp += arp((bar - 1) * 4, 4, [n(x) for x in voicing.split()], UP_DOWN, INTRO_VELS)
for bar, second_half in ((4, "E4 C#4 A3 E3"), (40, "E4 A4 C#5 E5")):  # bar 40 keeps rising into bar 1
    t = (bar - 1) * 4
    harp += arp(t, 2, [n(x) for x in "A2 E3 A3 D4".split()], (0, 1, 2, 3), INTRO_VELS[:4])
    harp += arp(t + 2, 2, [n(x) for x in second_half.split()], (0, 1, 2, 3), (50, 52, 54, 58))
harp += arp(11 * 4 + 2, 2, [n(x) for x in "E4 A4 C#5 E5".split()], (0, 1, 2, 3), (44, 48, 52, 56))  # bar 12 fill
bass += [(0, 7.5, n("D2"), 60), (8, 3.9, n("D2"), 58), (12, 3.9, n("A2"), 62)]  # tonic pedal under the intro

# ---- percussion: hand drums, shaker, tambourine, triangle (GM1 keys only) -------------------------------------
LOW_CONGA, OPEN_CONGA, MUTE_CONGA, HI_BONGO, LOW_BONGO = 64, 63, 62, 60, 61
TAMBOURINE, MARACAS, TRIANGLE = 54, 70, 81
FILL_BARS = (8, 12, 16, 20, 32, 36)
drums = []


def hit(t, key, vel):
    drums.append((t, 0.25, key, vel))


for bar in range(1, BARS + 1):
    t, sec = (bar - 1) * 4, section(bar)
    if sec in ("A", "A2", "A3") or bar in (37, 38):
        lift = {"A": 0, "A2": 2, "A3": 7, "coda": -10}[sec]
        for off, key, vel in ((0, LOW_CONGA, 66), (1.5, HI_BONGO, 46), (2, OPEN_CONGA, 56), (2.5, MUTE_CONGA, 38)):
            hit(t + off, key, vel + lift)
        if bar in FILL_BARS:
            for off, key, vel in ((3, LOW_BONGO, 46), (3.25, HI_BONGO, 42), (3.5, OPEN_CONGA, 54), (3.75, MUTE_CONGA, 50)):
                hit(t + off, key, vel + lift)
        else:
            hit(t + 3.5, LOW_BONGO, 48 + lift)
        for k in range(8):
            hit(t + k * 0.5, MARACAS, (42 if k % 2 else 30) + lift // 2)
        if sec in ("A2", "A3"):
            hit(t + 1, TAMBOURINE, 44)
            hit(t + 3, TAMBOURINE, 40)
    elif sec == "B":
        hit(t, LOW_CONGA, 52)
        hit(t + 2.5, LOW_BONGO, 40)
        for k in range(4):
            hit(t + k, MARACAS, 30)
        if bar % 2:
            hit(t, TRIANGLE, 38)
        if bar == 28:  # crescendo into the return
            for off, key, vel in ((3, LOW_BONGO, 46), (3.25, HI_BONGO, 50), (3.5, OPEN_CONGA, 56), (3.75, MUTE_CONGA, 60)):
                hit(t + off, key, vel)
    elif bar in (3, 4, 39, 40):
        for k in range(4):
            hit(t + k, MARACAS, 28 + 2 * k if bar < 5 else 34 - 2 * k)
        if bar == 39:
            hit(t, TRIANGLE, 36)
        if bar in (4, 40):
            hit(t + 3.5, LOW_BONGO, 42)

# ---- parts: name, channel, GM program (0-based), volume, pan, notes, allowed pitch range ----------------------
PARTS = [
    ("pan flute", 0, 75, 110, 64, flute, (62, 88)),
    ("oboe", 1, 68, 92, 78, oboe, (60, 81)),
    ("nylon guitar", 2, 24, 96, 46, guitar, (40, 76)),
    ("harp", 3, 46, 88, 86, harp, (40, 79)),
    ("acoustic bass", 4, 32, 100, 64, bass, (28, 55)),
    ("string pad", 5, 48, 62, 64, pad, (48, 76)),
]
EPS = 1e-6


def sounding(notes, beat):
    return [p for t, d, p, _ in notes if t - EPS <= beat < t + d - EPS]


def check_score():
    bad = []
    if not 66 <= BPM <= 92:
        bad.append(f"tempo {BPM} outside 66-92")
    if not 100 <= LOOP_SECS <= 150:
        bad.append(f"length {LOOP_SECS:.1f}s outside 1:40-2:30")
    if len(PARTS) + 1 > 8:
        bad.append("more than 8 parts")
    last_end = 0
    for name, _, _, _, _, notes, (lo, hi) in PARTS + [("drums", 9, 0, 0, 0, drums, (35, 81))]:
        pitches, vels = [p for _, _, p, _ in notes], [v for _, _, _, v in notes]
        last_end = max(last_end, max(t + d for t, d, _, _ in notes))
        print(f"  {name:14} notes {len(notes):4}  pitch {min(pitches)}-{max(pitches)}  velocity {min(vels)}-{max(vels)}"
              f" ({len(set(vels))} levels)  bars {int(min(t for t, *_ in notes) // 4) + 1}-"
              f"{int((max(t + d for t, d, _, _ in notes) - EPS) // 4) + 1}")
        if min(pitches) < lo or max(pitches) > hi:
            bad.append(f"{name}: pitch outside {lo}-{hi}")
        if min(vels) < 1 or max(vels) > 127 or len(set(vels)) < 3:
            bad.append(f"{name}: velocity range or variety")
        if any(t < 0 or d <= 0 or t + d > TOTAL + EPS for t, d, _, _ in notes):
            bad.append(f"{name}: note outside 0-{TOTAL} beats")
        # a second note_on of a pitch still sounding on the same channel gets cut by the first note_off
        by_pitch = {}
        for t, d, p, _ in sorted(notes):
            if t < by_pitch.get(p, 0) - EPS:
                bad.append(f"{name}: pitch {p} re-struck while sounding at beat {t}")
            by_pitch[p] = t + d
    if abs(last_end - TOTAL) > EPS:
        bad.append(f"last note ends at beat {last_end}, not {TOTAL}: the render would not match the loop length")
    for name, notes in (("pan flute", flute), ("oboe", oboe), ("acoustic bass", bass)):
        s = sorted(notes)
        bad += [f"{name}: overlapping notes at beat {b[0]}" for a, b in zip(s, s[1:]) if b[0] < a[0] + a[1] - EPS]
    # clash = a minor 2nd or minor 9th between two parts held for 3/4 of a beat or more
    pitched = sorted((t, t + d, p, name) for name, _, _, _, _, notes, _ in PARTS for t, d, p, _ in notes)
    for i, (t1, e1, p1, n1) in enumerate(pitched):
        for t2, e2, p2, n2 in pitched[i + 1:]:
            if t2 >= e1:
                break
            if n1 != n2 and min(e1, e2) - t2 >= 0.75 and (max(p1, p2) - min(p1, p2)) % 12 == 1:
                bad.append(f"clash bar {int(t2 // 4) + 1} beat {t2 % 4 + 1:g}: {n1} {p1} against {n2} {p2}")
    # outer voices: no parallel fifths or octaves from one downbeat to the next
    outer = []
    for bar in range(BARS):
        top, low = sounding(flute, bar * 4) + sounding(oboe, bar * 4), sounding(bass, bar * 4)
        outer.append((max(top), low[0]) if top and low else None)
    for bar, (a, b) in enumerate(zip(outer, outer[1:]), 1):
        if a and b and (a[0] - a[1]) % 12 == (b[0] - b[1]) % 12 and (a[0] - a[1]) % 12 in (0, 7) \
                and (b[0] - a[0]) * (b[1] - a[1]) > 0:
            bad.append(f"parallel perfect interval between lead and bass, bars {bar}-{bar + 1}")
    return bad


def check_files():
    bad = []
    mid = mido.MidiFile(OUT + ".mid").length
    dur = float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0",
                                OUT + ".ogg"], capture_output=True, text=True, check=True).stdout)
    vol = subprocess.run(["ffmpeg", "-hide_banner", "-i", OUT + ".ogg", "-af", "volumedetect", "-f", "null", "-"],
                         capture_output=True, text=True).stderr
    levels = {k: float(l.split(k + ":")[1].split()[0]) for l in vol.splitlines() for k in ("mean_volume", "max_volume")
              if k + ":" in l}
    print(f"  midi {mid:.3f}s  ogg {dur:.3f}s  expected {LOOP_SECS:.3f}s  {levels}")
    if abs(mid - LOOP_SECS) > 0.01:
        bad.append("midi length differs from the loop length")
    if abs(dur - LOOP_SECS) > 0.05:
        bad.append("ogg length differs from the loop length")
    if levels.get("mean_volume", -99) < -40:
        bad.append("ogg is silent or nearly silent")
    return bad


if __name__ == "__main__":
    print(f"score: {BARS} bars x 4 beats at {BPM} bpm = {LOOP_SECS:.1f}s, {len(PARTS) + 1} parts")
    problems = check_score()
    if not problems:
        song = Song(bpm=BPM, bars=BARS)
        for _, channel, program, volume, pan, notes, _ in PARTS:
            song.add(channel, program, notes, volume=volume, pan=pan)
        song.drum(drums, volume=78)
        print("rendered", render(song, OUT, soundfont="MuseScore_General"))
        problems = check_files()
    for p in problems:
        print("FAIL", p)
    sys.exit(1 if problems else 0)
