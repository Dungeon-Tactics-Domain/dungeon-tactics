"""Pastoral rica, version B: "Old Road Lantern" (eval/slot_D.py) grown up. Brief in BRIEF_PASTORAL_RICA.md.

Same town: E minor, 76 bpm, the motif (rising sixth, stepwise fall), MuseScore General, the PS1 chain.
Form (4/4, 72 bars = 227.4 s):
  1-4    Intro       harp arpeggios and the motif head, celesta pings, conga heartbeat
  5-12   A           flute theme over guitar arpeggios; the cello and pizzicato strings join for the consequent
  13-20  A'          oboe and flute trade the theme, then flute with the oboe in thirds; cello counter-subject over a
                     lament bass (E D C# C B); 4-3 suspension on the cadence
  21-28  B           G major: clarinet lead, then oboe; V/ii (E7/G#), D7/C, and Am-E7 turns the key to A minor
  29-36  Bridge      A minor in a 12/8 siciliana lilt (triplets): clarinet then flute over a circle of fifths,
                     F#m7b5-B7 pivots back to E minor
  37-44  Breakdown   solo cello plays the motif in augmentation over harp alone; flute and clarinet answer each
                     other over G, F#, a Neapolitan F/A, and a 4-3 suspension on the dominant
  45-52  Climax      theme an octave up to a short E6 peak, oboe in thirds, clarinet doubling an octave below, horn
                     and full strings; the cadence is deceptive (C instead of E minor)
  53-56  Picardy     C-D-E: the tonic arrives major (flute G#), then E7/G#-Am7-B7 falls back to the minor
  57-64  Return      half-time with a 3+3+2 pizzicato and claves hemiola; oboe, flute and clarinet share the theme
  65-72  Coda        the B melody remembered (IV V iii vi of G), then the oboe's augmented motif; Bsus4-B7 into bar 1
Run: python scripts/music/pastoral_rica_B.py  (writes pastoral_rica.mid and .ogg in <MUSIC_TOOLS>/pastoral_rica/B)
"""
import os
import re
import subprocess
from fractions import Fraction

from psx import TOOLS, Song, render

BPM, BARS = 76, 72
END = BARS * 4
OUT = os.path.join(TOOLS, "pastoral_rica", "B", "pastoral_rica")
LUFS, PEAK = -18.0, -3.0  # the level the brief asks for the game chain

PROG = [
    "Em", "Cmaj7", "Am7", "Bsus4 B7",  # 1-4 intro
    "Em", "Cmaj7", "Am7", "B7", "Em", "Cmaj7", "Am7 D", "G",  # 5-12 A, unchanged: it is the town's signature
    "Em", "Cmaj7", "Am7", "B7", "Em Em/D", "C#m7b5 Cmaj7", "Am7 B7", "Esus4 Em",  # 13-20 A', lament bass
    "C", "D", "Bm7", "Em E7/G#", "Am7", "D D7/C", "G/B Em", "Am E7",  # 21-28 B; Am is ii of G and i of the bridge
    "Am", "Dm7", "G7", "Cmaj7", "Fmaj7", "Bm7b5 E7", "Am Am/G", "F#m7b5 B7",  # 29-36 bridge; Am = iv of E minor
    "Em", "Cmaj7", "Am7", "Bsus4 B7", "Em/G", "F#m7b5", "F/A", "Bsus4 B7",  # 37-44 breakdown, F/A is the Neapolitan
    "Em", "Cmaj7", "Am7", "B7", "Em Em/D", "C#m7b5 Cmaj7", "Am7 B7", "C",  # 45-52 climax, deceptive cadence
    "D", "Esus4 E", "E E7/G#", "Am7 B7",  # 53-56 Picardy third, then V/iv leads home
    "Em Em/G", "Cmaj7", "F#m7b5", "Bsus4 B7", "Em Em/D", "A/C# Cmaj7", "Am7 B7", "Em",  # 57-64 return, Dorian IV
    "C", "D", "Bm7", "Em", "Cmaj7", "G/B", "Am7", "Bsus4 B7",  # 65-72 coda, the dominant leads into bar 1
]
assert len(PROG) == BARS

STEP = {"C": 0, "D": 2, "E": 4, "F": 5, "G": 7, "A": 9, "B": 11}


def pitch(name):
    acc = name[1:-1]
    return 12 * (int(name[-1]) + 1) + STEP[name[0]] + acc.count("#") - acc.count("b")


def pcs(names):
    return {STEP[n[0]] + n.count("#") for n in names.split()}


# chord: guitar voicing, pad voicing, chord tones plus the tensions allowed under a held melody note.
# Voicings share common tones (Em -> Cmaj7 -> Am7 move one voice), so arpeggios and pad lead smoothly.
CHORDS = {
    "Em": ("E3 B3 E4 G4", "G3 B3 E4", "E G B D F#"),
    "Em/D": ("D3 B3 E4 G4", "G3 B3 E4", "E G B D F#"),
    "Em/G": ("G2 B3 E4 G4", "G3 B3 E4", "E G B D F#"),
    "Esus4": ("E3 B3 E4 A4", "A3 B3 E4", "E A B F# D"),
    "E": ("E3 B3 E4 G#4", "G#3 B3 E4", "E G# B F# C#"),
    "E7": ("E3 B3 D4 G#4", "G#3 B3 D4", "E G# B D F#"),
    "E7/G#": ("G#2 B3 D4 E4", "G#3 B3 D4", "E G# B D F#"),
    "Cmaj7": ("C3 B3 E4 G4", "G3 B3 E4", "C E G B D A F#"),
    "C": ("C3 G3 E4 G4", "G3 C4 E4", "C E G D A B"),
    "C#m7b5": ("C#3 B3 E4 G4", "G3 B3 E4", "C# E G B A"),
    "A/C#": ("C#3 A3 E4 A4", "A3 C#4 E4", "A C# E B F#"),
    "Am7": ("A2 C4 E4 G4", "G3 C4 E4", "A C E G B D"),
    "Am": ("A2 C4 E4 A4", "A3 C4 E4", "A C E G B D"),
    "Am/G": ("G2 C4 E4 A4", "A3 C4 E4", "A C E G B D"),
    "B7": ("B2 A3 D#4 F#4", "F#3 A3 D#4", "B D# F# A"),
    "Bsus4": ("B2 A3 E4 F#4", "F#3 A3 E4", "B E F# A"),
    "Bm7": ("B2 A3 D4 F#4", "F#3 A3 D4", "B D F# A E"),
    "Bm7b5": ("B2 A3 D4 F4", "A3 D4 F4", "B D F A E"),
    "G": ("G2 B3 D4 G4", "G3 B3 D4", "G B D A E"),
    "G/B": ("B2 G3 D4 G4", "G3 B3 D4", "G B D A E"),
    "G7": ("G2 B3 D4 F4", "G3 B3 F4", "G B D F A E"),
    "D": ("D3 A3 D4 F#4", "F#3 A3 D4", "D F# A E B C"),
    "D7/C": ("C3 A3 D4 F#4", "F#3 A3 D4", "D F# A C E"),
    "Dm7": ("D3 A3 C4 F4", "A3 C4 F4", "D F A C E G"),
    "Fmaj7": ("F2 A3 C4 E4", "A3 C4 E4", "F A C E G D"),
    "F/A": ("A2 C4 F4 A4", "A3 C4 F4", "F A C G D E"),
    "F#m7b5": ("F#2 A3 C4 E4", "A3 C4 E4", "F# A C E B"),
}
assert {c for bar in PROG for c in bar.split()} <= CHORDS.keys()
GTR = {k: [pitch(n) for n in v[0].split()] for k, v in CHORDS.items()}
HARP = {k: v + [v[2] + 12, v[3] + 12] for k, v in GTR.items()}
PAD = {k: [pitch(n) for n in v[1].split()] for k, v in CHORDS.items()}
TONES = {k: pcs(v[2]) for k, v in CHORDS.items()}


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
    """Bars of "PITCH:BEATS" tokens ("r" = rest, "2/3" = triplet values, "(F#5)G5:1" = grace note before the beat).
    Velocity follows a 4-bar arch, the pitch and the beat."""
    out = []
    for i, text in enumerate(bars):
        b = Fraction(0)
        for tok in text.split():
            name, dur = tok.split(":")
            dur = Fraction(dur)
            if name != "r":
                grace, _, name = name.rpartition(")")
                p = pitch(name)
                accent = 4 if b % 2 == 0 else 0 if b % 1 == 0 else -3 if b % Fraction(1, 2) == 0 else -6
                v = base + arch[i % 4] + 0.6 * (p - ref) + accent
                t = at(first_bar + i, float(b))
                if grace:
                    out.append((t - 0.125, 0.125, pitch(grace[1:]), vel(v - 10)))
                out.append((t, float(dur), p, vel(v)))
            b += dur
        assert b == 4, f"bar {first_bar + i} has {b} beats: {text}"
    return out


def arpeggio(first, last, table, pattern, base, size=None, ring=2.0, div=2):
    """Arpeggio in eighths (div=3: triplets); notes ring but stop at the chord change, like a player lifting the hand."""
    out = []
    for bar in range(first, last + 1):
        for s, n, name in spans(bar):
            voicing = table[name][:size] if size else table[name]
            for k in range(round(n * div)):
                start = at(bar, s + k / div)
                end = min(start + ring, at(bar, s + n))
                v = base + (8 if k == 0 else 0) - (4 if k % div else 0) + (2 if bar % 2 else 0)
                out.append((start, end - start, voicing[pattern[k % len(pattern)]], vel(v)))
    return out


def roll(start, length, pitches, v, step=0.04):
    return [(start + i * step, length - i * step, p, vel(v - 2 * i)) for i, p in enumerate(pitches)]


def sweep(start, pitches, v, step=0.25, ring=1.0):
    """A rising harp figure that swells as it climbs."""
    stop = (start // 4 + 1) * 4  # the bar line: the next harmony starts clean
    return [(start + i * step, min(ring, stop - start - i * step), p, vel(v + 2 * i)) for i, p in enumerate(pitches)]


def pad(first, last, base, full=False):
    """Sustained strings; a pitch kept by the next chord is held, not re-bowed. full adds the bottom voice an octave up."""
    out, held = [], {}
    for bar in range(first, last + 1):
        for s, _, name in spans(bar):
            t, cur = at(bar, s), set(PAD[name]) | ({PAD[name][0] + 12} if full else set())
            for p in [p for p in held if p not in cur]:
                st, v = held.pop(p)
                out.append((st, t - st, p, v))
            for p in cur - held.keys():
                held[p] = (t, vel(base + (4 if (bar - first) % 4 == 2 else 0) + (bar - first) % 3))
    for p, (st, v) in held.items():
        out.append((st, at(last + 1) - st, p, v))
    return out


def plucks(first, last, hits, base):
    """Pizzicato chords from the pad voicing; hits are (beat, slice of the voicing, velocity offset)."""
    out = []
    for bar in range(first, last + 1):
        for beat, pick, dv in hits:
            for i, p in enumerate(PAD[chord_at(at(bar, beat))][pick]):
                out.append((at(bar, beat), 0.35, p, vel(base + dv - 3 * i + (2 if bar % 2 else 0))))
    return out


def trim(notes):
    """A repeated pitch on one channel cuts the earlier note, so note_offs never land inside the next note."""
    notes = sorted(notes)
    out = []
    for i, (t, n, p, v) in enumerate(notes):
        nxt = next((t2 for t2, _, p2, _ in notes[i + 1:] if p2 == p and t2 > t), None)
        out.append((t, min(n, nxt - t) if nxt is not None else n, p, v))
    return out


def mono(notes):
    """One-voice instruments: a note ends where the next begins, so a grace note takes its time from the note before."""
    notes = sorted(notes)
    return [(t, min(n, nxt[0] - t), p, v) for (t, n, p, v), nxt in zip(notes, notes[1:] + [(END,)])]


def octave(notes, dv=-14):
    """The bass with its octave above, softer: the low fundamentals alone vanish on small speakers."""
    return notes + [(t, n, p + 12, vel(v + dv)) for t, n, p, v in notes]


# ---- melody -----------------------------------------------------------------------------------------------
THEME = ["G5:1.5 F#5:.5 E5:1 D5:.5 E5:.5", "B4:2 A4:.5 B4:.5 C5:.5 D5:.5", "E5:1.5 D5:.5 C5:1 B4:.5 A4:.5"]
RISE = ["G5:1.5 A5:.5 B5:1 A5:.5 G5:.5", "E5:2 D5:.5 E5:.5 G5:1", "A5:1 G5:.5 E5:.5 F#5:1 D#5:1"]

flute = (
    line(4, ["r:3.5 B4:.5"], 64, 76)
    + line(5, THEME + [
        "B4:3 r:.5 B4:.5",  # half cadence
        RISE[0],  # same sixth, now climbing instead of falling
        RISE[1],
        "A5:1.5 G5:.5 F#5:1 E5:.5 F#5:.5",
        "G5:3 r:1",  # the oboe takes the pickup
    ], 70, 76)
    + line(15, [THEME[2], "B4:3 r:.5 B4:.5"] + RISE + ["E5:3 r:1"], 74, 76, arch=(5, -3, 0, 3))  # answers the oboe
    + line(27, ["D5:2 C5:.5 B4:.5 G4:1", "C5:1 B4:.5 A4:.5 G#4:2"], 58, 72)  # sixths under the oboe; G# turns to A minor
    + line(33, [  # bridge: takes the sequence up from the clarinet
        "A5:1 E5:2/3 G5:1/3 A5:1 C6:2/3 A5:1/3",  # E, not F: the root over the chord's major seventh grates
        "B5:1 A5:2/3 F5:1/3 D5:1 E5:2/3 G#5:1/3",
        "A5:2 G5:2/3 E5:1/3 C5:1",
        "E5:2/3 F#5:1/3 A5:1 F#5:2/3 D#5:1/3 B4:1",  # F# and D# bring E minor back
    ], 70, 79)
    + line(42, [  # breakdown: answers the clarinet a step higher, then the two close in thirds
        "r:1 C5:.5 E5:.5 A5:1.5 G5:.5",
        "A5:2 G5:1 F5:1",
        "E5:2 D#5:1.5 B4:.5",  # 4-3 suspension, then the pickup of the theme
    ], 62, 76, arch=(0, 4, 8, 0))
    + line(45, [  # climax: the theme an octave up; the peak is one beat of E6, not more (shrill guardrail)
        "(F#5)G5:1.5 F#5:.5 E5:.5 F#5:.25 E5:.25 D5:.5 E5:.5",
        "B5:2 A5:.5 B5:.5 C6:.5 D6:.5",
        "E6:1 D6:.5 C6:1 B5:.5 A5:.5 G5:.5",
        "B5:1.5 A5:.5 F#5:1 D#5:.5 B4:.5",
        "G5:1.5 A5:.5 B5:1 A5:.5 B5:.5",  # a neighbour note where slot_D went to D6: one visit above C6 is enough
        "B5:2 G5:.5 E5:.5 G5:.5 A5:.5",
        "C6:1.5 B5:.5 A5:.5 F#5:.5 D#5:1",
        "E5:3 r:.5 E5:.5",  # the E is now the third of C
    ], 81, 86)  # a flat velocity slope up here: the E6 must not shout
    + line(53, [
        "F#5:1.5 G5:.5 A5:1 F#5:.5 A5:.5",
        "B5:2 G#5:1.5 E5:.5",  # Picardy third
        "B5:1.5 A5:.5 G#5:1 F#5:.5 E5:.5",  # the motif's stepwise fall, in the major
        "E5:1 C5:.5 E5:.5 D#5:1.5 r:.5",
    ], 78, 81, arch=(0, 4, 2, -4))
    + line(57, ["r:2 B5:1.5 A5:.5", "E5:2 G5:1 r:1"], 52, 79)  # a descant over the oboe
    + line(59, [THEME[2], "B4:3 r:1"], 68, 76)
    + line(63, [RISE[2], "E5:3 r:1"], 70, 76, arch=(3, -2))
    + line(66, ["F#5:2.5 E5:.5 D5:.5 E5:.5"], 58, 76)  # coda: answers the clarinet with the B melody
    + line(68, ["G5:2.5 F#5:.5 E5:1"], 56, 76)
)

oboe = (
    line(12, ["r:3.5 B4:.5"], 64, 76)
    + line(13, [  # A': the oboe sings the theme first, with a grace note and a turn
        "(F#5)G5:1.5 F#5:.5 E5:1 D5:.5 E5:.5",
        "B4:1.5 C5:.25 B4:.25 A4:.5 B4:.5 C5:.5 D5:.5",
    ], 72, 76)
    + line(15, [
        "A4:2 G4:2",
        "F#4:1 F#5:.5 E5:.5 D#5:2",  # echo of the motif tail over the flute's held B
        "E5:1.5 F#5:.5 G5:1 F#5:.5 E5:.5",  # thirds and sixths under the flute
        "G4:2 B4:.5 C5:.5 E5:1",
        "C5:1 B4:.5 C5:.5 A4:2",
        "A4:2 G4:1.5 r:.5",  # the A is B7's seventh, held over Esus4 and resolved: 4-3
    ], 54, 72)
    + line(25, [  # B, second half: takes the lead from the clarinet
        "A5:1.5 G5:.5 E5:1 D5:.5 E5:.5",
        "F#5:1.5 G5:.5 A5:2",
        "B5:2 A5:.5 G5:.5 E5:1",
        "A5:1 G5:.5 F5:.5 E5:2",  # F natural: the key leans to A minor
    ], 73, 78, arch=(0, 3, 5, 0))
    + line(45, [  # climax: mostly thirds under the flute
        "B4:2 G4:1 B4:1",
        "G5:2 E5:1 A5:1",
        "C6:1 B5:.5 A5:1 G5:.5 F#5:.5 E5:.5",
        "D#5:2 A4:2",
        "E5:1.5 F#5:.5 G5:2",
        "G5:2 E5:2",
        "A5:1.5 G5:.5 D#5:1 B4:1",
        "C5:3 r:1",  # the root of the deceptive chord, under the flute's E
    ], 62, 76)
    + line(53, [
        "D5:1.5 E5:.5 F#5:1 D5:.5 F#5:.5",
        "E5:2 B4:2",
        "G#5:1.5 F#5:.5 E5:1 D5:1",
        "C5:1 A4:.5 C5:.5 A4:1.5 B4:.5",
    ], 60, 76, arch=(0, 4, 2, -2))
    + line(57, [  # return: the theme again, quieter
        "(F#5)G5:1.5 F#5:.5 E5:1 D5:.5 E5:.5",
        THEME[1],
        "C5:2 A4:2",
        "r:1 F#5:.5 E5:.5 D#5:2",  # the echo of bar 16, now a 4-3 over Bsus4-B7
    ], 68, 76, arch=(0, 2, -12, -10))
    + line(63, ["C5:1 B4:.5 C5:.5 A4:2", "B4:2 G4:1 r:1"], 54, 72)
    + line(69, [  # coda: the motif in augmentation (every value doubled), fading out
        "G5:3 F#5:1",
        "E5:2 D5:1 E5:1",
        "C5:2 B4:1 A4:1",
        "B4:3 r:1",  # breathes before the loop
    ], 58, 72, arch=(2, 0, -3, -7))
)

clarinet = (
    line(21, [  # B: G -> E is the motif's sixth made major; bar 23 inverts it (B down to D, steps up)
        "E5:1.5 D5:.5 C5:1 D5:.5 E5:.5",
        "F#5:2.5 E5:.5 D5:.5 E5:.5",
        "B5:1 D5:1.5 E5:.5 F#5:1",
        "G5:2 F#5:.5 E5:1 D5:.5",  # leaves the G before E7/G# sounds its G#
    ], 74, 76)
    + line(25, ["C5:2 G4:2", "A4:2 C5:2", "B4:2 G4:2", "A4:2 r:2"], 50, 72)  # inner voice; D7's C falls to B
    + line(29, [  # bridge: a falling sequence in siciliana rhythm (long-short), one step lower every two bars
        "(D5)E5:1 C5:2/3 D5:1/3 E5:1 A4:2/3 B4:1/3",
        "C5:2/3 D5:1/3 F5:1 E5:2/3 D5:1/3 A4:1",
        "D5:1 B4:2/3 C5:1/3 D5:1 G4:2/3 A4:1/3",
        "B4:2/3 C5:1/3 E5:1 D5:2/3 C5:1/3 G4:1",
    ], 72, 72)
    + line(33, [
        "C5:3 A4:1",
        "D5:2 B4:2",
        "C5:1 E5:1 C5:2/3 D5:1/3 E5:1",  # the head of the bridge tune again under the flute
        "A4:3 F#4:1",
    ], 54, 72)
    + line(41, [  # breakdown: the motif head, answered by the flute
        "r:1 B4:.5 E5:.5 G5:1.5 F#5:.5",
        "E5:4",
        "F5:2 E5:1 D5:1",
        "B4:2 A4:2",
    ], 60, 74, arch=(0, 2, 6, 2))
    + line(45, ["E4:2 G4:2", "G4:2 E4:2", "A4:2 G4:2", "F#4:2 A4:2"], 50, 67)
    + line(49, [  # the tune an octave under the flute, for the tutti
        "G4:1.5 A4:.5 B4:1 A4:.5 B4:.5",
        "B4:2 G4:.5 E4:.5 G4:.5 A4:.5",
        "C5:1.5 B4:.5 A4:.5 F#4:.5 D#4:1",
        "E4:3 r:1",
    ], 64, 67)
    + line(53, ["A4:4", "A4:2 G#4:2", "G#4:2 B4:2", "A4:2 F#4:2"], 54, 67)  # 4-3 into the major third
    + line(60, ["r:3.5 B4:.5", "(F#5)" + RISE[0], RISE[1]], 68, 76, arch=(-4, 0, 2))
    + line(65, [  # coda: the B melody remembered
        "E5:1.5 D5:.5 C5:1 D5:.5 E5:.5",
        "D5:2 A4:2",
        "B5:1 D5:1.5 E5:.5 F#5:1",
        "B4:3 r:1",
    ], 58, 76, arch=(2, -6, -2, -8))
)

cello = (
    line(9, ["E4:2 D4:1 B3:1", "G3:2 A3:1 B3:1", "C4:2 D4:1 C4:1", "B3:3 r:1"], 50, 57)  # moves against the flute
    + line(13, [  # A': counter-subject; bars 17-19 return in the climax and the return
        "G3:2 A3:.5 B3:1.5",
        "E4:2 D4:1 G3:1",
        "A3:2 E4:1 C4:1",
        "F#3:2 A3:1 F#3:1",
        "B3:1.5 A3:.5 G3:1 B3:1",
        "E3:2 G3:1 B3:1",
        "C4:2 D#4:1 B3:1",
        "B3:2 E3:1.5 r:.5",
    ], 54, 57)
    + line(21, [  # B: answers in the clarinet's long notes
        "r:1 G3:1 C4:1 E4:1",
        "D4:1.5 C4:.5 B3:.5 A3:.5 F#3:1",
        "F#3:1 B3:1 D4:2",
        "B3:2 D4:1 E4:1",
        "C4:2 E4:1 C4:1",
        "A3:2 F#3:2",
        "G3:2 B3:2",
        "A3:1 C4:1 B3:2",
    ], 58, 57)
    + line(29, [  # bridge: guide tones (thirds and sevenths) of the circle of fifths
        "C4:2 E4:2",
        "D4:2 C4:2",
        "B3:2 D4:2",
        "E4:2 B3:2",
        "A3:2 C4:2",
        "A3:2 G#3:2",
        "A3:1 C4:1 E4:2",
        "C4:2 B3:2",  # the B is the pickup of the solo: B up to G, the motif's sixth
    ], 52, 57)
    + line(37, [  # breakdown: the motif in augmentation, alone over the harp
        "(F#4)G4:3 F#4:1",
        "E4:2 D4:1 E4:1",
        "C4:2 B3:1 A3:1",
        "B3:2 A3:1 F#3:1",
    ], 72, 62, arch=(3, 2, 0, -3))
    + line(41, ["B3:4", "A3:2 C4:2", "C4:3 A3:1", "F#3:2 B3:2"], 54, 57)
    + line(45, [  # climax: contrary motion to the flute
        "E3:1 G3:1 B3:1.5 D4:.5",
        "E4:2 D4:1 G3:1",
        "A3:1 C4:1 E4:1 G4:1",
        "F#4:2 A3:2",
        "B3:1.5 A3:.5 G3:1 B3:1",
        "E3:2 G3:1 B3:1",
        "C4:2 D#4:1 B3:1",
        "E3:2 G3:1 E4:1",
    ], 66, 57)
    + line(53, ["A3:2 F#3:2", "E4:2 B3:2", "B3:2 D4:2", "C4:2 B3:1 A3:1"], 62, 57)  # E7's D falls to C
    + line(61, ["B3:1.5 A3:.5 G3:1 B3:1", "E3:2 G3:1 B3:1", "C4:2 D#4:1 B3:1", "G3:2 E3:1.5 r:.5"], 54, 57)
    + line(65, ["E3:2 G3:2", "F#3:2 A3:2", "D4:2 B3:2", "B3:2 G3:2", "E4:4", "D4:4", "E4:3 C4:1", "B3:2 A3:1.5 r:.5"],
           48, 57, arch=(0, 2, 3, 0, 0, -2, -4, -9))
)

horn = line(45, [  # a slow tenor line for the climax and the major arrival
    "B3:4", "B3:2 G3:2", "A3:2 C4:2", "B3:2 A3:2", "G3:2 B3:2", "G3:4", "A3:2 F#3:2", "E3:2 G3:2",
    "F#3:2 A3:2", "A3:2 G#3:2", "G#3:2 B3:2", "C4:2 B3:2",
], 52, 57)

celesta = (
    line(1, ["r:2.5 E5:.5 B5:1", "r:2.5 E5:.5 G5:1"], 44, 79)
    + line(8, ["r:1 F#5:.5 A5:.5 B5:1 r:1"], 42, 79)  # fills the flute's held notes
    + line(12, ["r:1 D5:.5 G5:.5 B5:1 r:1"], 42, 79)
    + line(20, ["r:1 B5:.5 G5:.5 E5:1 r:1"], 44, 79)
    + line(22, ["r:1 A5:.5 F#5:.5 D5:1 r:1"], 44, 79)
    + line(24, ["r:.5 B5:.5 G5:.5 E5:.5 r:2"], 44, 79)
    + line(26, ["r:2.5 C5:.5 F#5:1"], 44, 79)
    + line(32, ["r:3 G5:1/3 E5:1/3 C5:1/3"], 42, 79)
    + line(37, ["r:2 E5:.5 B5:1.5", "r:2 E5:.5 G5:1.5", "r:2 E5:.5 C6:1.5", "r:2 F#5:.5 B5:1.5"], 40, 79)  # the intro's pings
    + line(46, ["r:2 A4:.5 B4:.5 C5:.5 D5:.5", "E5:1 D5:.5 C5:1 B4:.5 A4:.5 G4:.5"], 56, 72)  # weight under the peak
    + line(52, ["r:1 G5:.5 C6:.5 E5:1 r:1"], 50, 79)
    + line(54, ["r:2 E5:.5 G#5:.5 B5:.5 G#5:.5", "B5:.5 G#5:.5 E5:1 r:2"], 52, 79)  # the major third sparkles
    + line(58, ["r:.5 F#5:.5 E5:.5 D5:.5 E5:1 r:1"], 42, 79)  # echo of the motif tail
    + line(64, ["r:1 B5:.5 G5:.5 E5:1 r:1"], 42, 79)
    + line(68, ["r:2 B5:1 G5:1"], 40, 79)
    + line(70, ["r:2.5 D5:.5 G5:1"], 40, 79)  # nothing in the last bar: the end has to decay into bar 1
)

# ---- accompaniment ----------------------------------------------------------------------------------------
ROLL = [0, 1, 2, 3, 2, 1, 2, 1]
guitar = (
    arpeggio(5, 12, GTR, ROLL, 48)
    + arpeggio(13, 20, GTR, [0, 2, 1, 3, 2, 3, 1, 2], 52)
    + arpeggio(45, 52, GTR, ROLL, 56)
    + arpeggio(61, 64, GTR, [0, 2, 3, 2, 1, 2, 3, 2], 46)
)
for bar in list(range(21, 29)) + list(range(53, 57)):  # syncopated rolled chords, the harp takes the motion
    for s, n, name in spans(bar):
        guitar += roll(at(bar, s), min(n, 2.5), GTR[name], 50 if bar < 29 else 54)
        if n == 4:
            guitar += roll(at(bar, 2.5), 1.5, GTR[name], 44 if bar < 29 else 48)
for bar in range(29, 37):  # bridge: a chord on each dotted half, and a pickup on the last triplet
    for s, n, name in spans(bar):
        for k in range(round(n / 2)):
            guitar += roll(at(bar, s + 2 * k), 5 / 3, GTR[name], 48 - 6 * k)
            guitar.append((at(bar, s + 2 * k + 5 / 3), 1 / 3, GTR[name][3], vel(36 + bar % 3)))
for bar in list(range(41, 45)) + list(range(57, 61)) + list(range(65, 69)):  # one soft chord per harmony
    for s, n, name in spans(bar):
        guitar += roll(at(bar, s), min(n, 3), GTR[name], 42 + (bar - 41 if bar < 45 else 0), step=0.06)

harp = (
    arpeggio(1, 2, HARP, [0, 1, 2, 3, 4, 5, 4, 3], 53)
    + arpeggio(3, 4, HARP, [0, 1, 2, 3, 2, 1, 2, 3], 44, size=4)  # low only: the motif sits on top
    + line(2, ["r:3.5 B4:.5", "G5:1.5 F#5:.5 E5:1.5 F#5:.5", "E5:2 D#5:2"], 60, 76)
    + sweep(at(16, 2), HARP["B7"][1:] + [HARP["B7"][1] + 24], 36, step=0.33)  # phrase ends in A'
    + sweep(at(20, 2), HARP["Em"][1:], 36, step=0.4)
    + arpeggio(21, 28, HARP, [0, 1, 2, 3, 4, 3, 2, 1], 44, size=5)
    + arpeggio(29, 36, HARP, [0, 2, 3, 4, 3, 2], 42, div=3, ring=1.0)
    + arpeggio(37, 40, HARP, [0, 1, 2, 3, 2, 0, 2, 0], 46, size=4, ring=1.5)  # rocks on the low note: no bass here,
    # and the top of the chord is silent when the cello passes a semitone under it
    + arpeggio(41, 44, HARP, [0, 2, 1, 3, 2, 3, 1, 2], 44, size=4)
    + sweep(at(54, 2), [p + 12 for p in GTR["E"]] + [83], 40)  # E major
    + arpeggio(53, 53, HARP, [0, 1, 2, 3, 4, 5, 4, 3], 46)
    + arpeggio(55, 56, HARP, [0, 1, 2, 3, 4, 5, 4, 3], 44)
    + arpeggio(61, 64, HARP, [5, 4, 3, 4], 38, ring=1.0)
    + arpeggio(65, 68, HARP, [0, 1, 2, 3, 4, 3, 2, 1], 42, size=5)
    + arpeggio(69, 72, HARP, [0, 1, 2, 3, 2, 1, 2, 3], 48, size=4)
)
for bar in range(45, 53):  # climax: a high rolled chord every bar for shimmer, a second one on even bars
    for s, n, name in spans(bar)[:1 if bar % 2 else 2]:
        harp += roll(at(bar, s), 1.5, [p + 12 for p in GTR[name][1:]], 46)

strings = (pad(1, 4, 36) + pad(9, 12, 34) + pad(13, 20, 44) + pad(21, 28, 52) + pad(29, 36, 46) + pad(41, 44, 40)
           + pad(45, 52, 58, full=True) + pad(53, 56, 56, full=True) + pad(57, 64, 38) + pad(65, 72, 40))

TOP2, ALL3, TOP1 = slice(1, 3), slice(0, 3), slice(2, 3)
pizz = (
    plucks(9, 12, [(1, TOP2, 0), (3, TOP2, 2)], 40)  # backbeats
    + plucks(13, 20, [(1, TOP2, 0), (2.5, TOP1, -6), (3, TOP2, 2)], 44)
    + plucks(29, 36, [(1, TOP2, 0), (1 + 2 / 3, TOP1, -8), (3, TOP2, 2), (3 + 2 / 3, TOP1, -6)], 42)  # the lilt
    + plucks(57, 64, [(0, ALL3, 4), (1.5, TOP2, -2), (3, ALL3, 0), (3.5, TOP1, -8)], 46)  # 3+3+2 against the half-time
    + plucks(65, 68, [(1, TOP2, 0), (3, TOP2, -2)], 38)
)

bass = (
    line(1, ["E2:4", "C2:4", "A1:4", "B1:4"], 58, 40)
    + line(5, [
        "E2:2 B1:1.5 D2:.5", "C2:2 G1:1.5 B1:.5", "A1:2 E2:1.5 C2:.5", "B1:2 F#2:1.5 D#2:.5",
        "E2:2 B1:1.5 D2:.5", "C2:2 G1:1.5 B1:.5", "A1:2 D2:2", "G2:2 D2:1.5 F#2:.5",
    ], 66, 40)
    + line(13, [  # the second half walks down E D C# C B
        "E2:1.5 B1:.5 G2:1 D2:1", "C2:1.5 G1:.5 C2:1 B1:1", "A1:1.5 E2:.5 C2:1 A1:1", "B1:2 F#2:1 D#2:1",
        "E2:2 D2:2", "C#2:2 C2:2", "A1:2 B1:2", "E2:2 B1:1 D2:1",
    ], 70, 40)
    + line(21, [
        "C2:1.5 G2:.5 E2:1.5 C2:.5", "D2:1.5 A1:.5 D2:1 C2:1", "B1:1.5 F#2:.5 A2:1 F#2:1", "E2:2 G#2:2",
        "A2:1.5 E2:.5 A1:1 C2:1", "D2:2 C2:2", "B1:2 E2:2", "A1:2 E2:1.5 G#1:.5",
    ], 72, 40)
    + line(29, [  # bridge: the root on each dotted half, a pickup on the last triplet
        "A1:5/3 E2:1/3 A1:5/3 C2:1/3", "D2:5/3 A1:1/3 D2:5/3 F2:1/3", "G1:5/3 D2:1/3 G1:5/3 B1:1/3",
        "C2:5/3 G1:1/3 C2:5/3 E2:1/3", "F1:5/3 C2:1/3 F1:5/3 C2:1/3", "B1:5/3 D2:1/3 E2:5/3 B1:1/3",
        "A1:5/3 E2:1/3 G1:2", "F#1:5/3 A1:1/3 B1:2",
    ], 68, 40)
    + line(41, ["G1:4", "F#1:4", "A1:4", "B1:4"], 54, 40, arch=(0, 2, 5, 8))  # silent under the cello solo, 37-40
    + line(45, [
        "E2:1.5 B1:.5 G2:1 D2:1", "C2:1.5 G1:.5 C2:1 B1:1", "A1:1.5 E2:.5 A2:1 G2:1", "B2:1.5 F#2:.5 D#2:1 B1:1",
        "E2:2 D2:2", "C#2:2 C2:2", "A1:2 B1:2", "C2:2 G1:1 C2:1",
    ], 76, 40)
    + line(53, ["D2:2 A1:1 D2:1", "E2:2 E2:2", "E2:2 G#2:2", "A1:2 B1:1.5 D#2:.5"], 72, 40)
    + line(57, [  # return: half-time, long notes
        "E2:2 G2:2", "C2:3 B1:1", "F#1:3 A1:1", "B1:3 F#2:1",
        "E2:2 D2:2", "C#2:2 C2:2", "A1:2 B1:2", "E2:2 B1:1 D2:1",
    ], 64, 40)
    + line(65, ["C2:3 G1:1", "D2:3 A1:1", "B1:3 A1:1", "E2:4", "C2:4", "B1:4", "A1:4", "B1:4"], 60, 40,
           arch=(2, 2, 0, 0, 2, 0, -3, -6))
)

# ---- light folk percussion (GM1 kit notes), a different groove per section ----------------------------------
SIDE_STICK, FLOOR_TOM, LOW_TOM, TAMBOURINE = 37, 41, 45, 54
HI_BONGO, LO_BONGO, MUTE_CONGA, OPEN_CONGA, LOW_CONGA = 60, 61, 62, 63, 64
CABASA, MARACAS, CLAVES, MUTE_TRIANGLE, TRIANGLE = 69, 70, 75, 80, 81
drums = []


def hit(bar, beat, note, v):
    # a hand never strikes twice alike: up to 2 either way, fixed by the position so every run is the same
    drums.append((at(bar, beat), 0.25, note, min(80, v + (bar * 5 + round(beat * 12) * 7 + note) % 5 - 2)))


def groove(bars, pattern, cut=None, lift=0):
    """One bar pattern over the bars; cut maps a bar to the beat where its fill takes over."""
    for bar in bars:
        for beat, note, v in pattern:
            if beat < (cut or {}).get(bar, 4):
                hit(bar, beat, note, v + lift * (bar - bars[0]))


def fill(bar, beat, strokes, step=0.25):
    for k, (note, v) in enumerate(strokes):
        hit(bar, beat + k * step, note, v)


def shaker(soft, loud, note=MARACAS):
    return [(k / 2, note, loud if k % 2 else soft) for k in range(8)]  # leans on the off-beats


PICKUP = [(HI_BONGO, 30), (HI_BONGO, 36), (LO_BONGO, 42), (LO_BONGO, 50)]
SPARSE = [(0, LOW_CONGA, 54), (2, MUTE_CONGA, 34), (1, MARACAS, 22), (3, MARACAS, 24)]
HAND = [(0, LOW_CONGA, 62), (1.5, LOW_CONGA, 40), (2, OPEN_CONGA, 46), (3, MUTE_CONGA, 36), (3.5, MUTE_CONGA, 30)]
HAND_ALT = [(0, LOW_CONGA, 60), (1.5, LOW_CONGA, 38), (2, OPEN_CONGA, 44), (2.5, OPEN_CONGA, 33), (3.5, MUTE_CONGA, 31)]
SYNCOPATED = [(0, LOW_CONGA, 60), (1.5, OPEN_CONGA, 44), (2.5, LOW_CONGA, 46), (3, MUTE_CONGA, 36),
              (3.5, MUTE_CONGA, 30), (1, TAMBOURINE, 32), (3, TAMBOURINE, 36)]
SICILIANA = ([(k / 3, CABASA, (30, 16, 22)[k % 3]) for k in range(12)]  # 12/8: strong, weak, lifting
             + [(0, LOW_CONGA, 52), (2, LOW_CONGA, 44), (1 + 2 / 3, MUTE_CONGA, 30), (3 + 2 / 3, MUTE_CONGA, 33),
                (1, MUTE_TRIANGLE, 26), (3, MUTE_TRIANGLE, 29)])
FULL = [(0, LOW_CONGA, 70), (1.5, LOW_CONGA, 46), (2, OPEN_CONGA, 54), (3, MUTE_CONGA, 42), (3.5, MUTE_CONGA, 37),
        (1, TAMBOURINE, 40), (3, TAMBOURINE, 46), (3.75, TAMBOURINE, 27)]
HALF = [(0, LOW_CONGA, 50), (2, SIDE_STICK, 36), (0, CLAVES, 30), (1.5, CLAVES, 25), (3, CLAVES, 28)]  # 3+3+2 claves

for bar, v in ((3, 34), (4, 42), (39, 30), (40, 36), (69, 40), (70, 33)):  # a soft heartbeat where the music is bare
    hit(bar, 0, LOW_CONGA, v)
groove(range(5, 13), SPARSE, cut={12: 3})
groove(range(6, 13, 2), [(2.5, MUTE_CONGA, 24)])
hit(8, 3.5, HI_BONGO, 28)
fill(12, 3, PICKUP)
groove(range(13, 21, 2), HAND + shaker(20, 28), cut={})
groove(range(14, 21, 2), HAND_ALT + shaker(20, 28), cut={16: 3.5, 20: 3})
fill(16, 3.5, [(HI_BONGO, 32), (LO_BONGO, 38)])
fill(20, 3, PICKUP)
groove(range(21, 29), SYNCOPATED + shaker(20, 28), cut={24: 3.5, 28: 3})
fill(24, 3.5, [(LO_BONGO, 34), (HI_BONGO, 40)])
fill(28, 3, [(HI_BONGO, 34), (LO_BONGO, 40), (LO_BONGO, 46)], step=1 / 3)  # a triplet announces the 12/8
groove(range(29, 36), SICILIANA, cut={32: 3})
fill(32, 3, [(OPEN_CONGA, 36), (OPEN_CONGA, 40), (LOW_CONGA, 46)], step=1 / 3)
groove([36], SICILIANA, cut={36: 2})  # thins out into the solo
groove(range(41, 45), [(0, LOW_CONGA, 40), (2, MUTE_CONGA, 28)] + [(k, MARACAS, 18) for k in range(4)],
       cut={44: 2}, lift=4)
fill(44, 2, [(FLOOR_TOM, 30), (FLOOR_TOM, 34), (FLOOR_TOM, 39), (LOW_TOM, 43), (FLOOR_TOM, 48), (LOW_TOM, 53),
             (LO_BONGO, 58), (HI_BONGO, 64)])  # the swell into the climax
groove(range(45, 53), FULL + shaker(22, 32), cut={48: 3, 52: 2.5})
for bar in (45, 49):
    hit(bar, 0, FLOOR_TOM, 60)
fill(48, 3, [(HI_BONGO, 40), (HI_BONGO, 46), (LO_BONGO, 52), (LO_BONGO, 58)])
fill(52, 2.5, [(HI_BONGO, 44), (HI_BONGO, 50), (LO_BONGO, 56), (LOW_TOM, 60), (LOW_TOM, 66), (FLOOR_TOM, 72)])
groove(range(53, 57), [(0, LOW_CONGA, 60), (2, OPEN_CONGA, 44), (2, TAMBOURINE, 38)] + shaker(17, 24)
       + [(k, TRIANGLE, 25 + 3 * (k % 2)) for k in range(4)], cut={56: 3})  # half-time, bells on every beat
fill(56, 3, [(LO_BONGO, 46), (LO_BONGO, 40), (HI_BONGO, 34), (HI_BONGO, 28)])  # falls away into the quiet return
groove(range(57, 65), HALF + shaker(16, 24), cut={60: 3, 64: 3})
fill(60, 3, [(MUTE_CONGA, 34), (MUTE_CONGA, 28)], step=0.5)
fill(64, 3, [(HI_BONGO, 36), (HI_BONGO, 32), (LO_BONGO, 28), (LO_BONGO, 24)])
groove(range(65, 69), [(0, LOW_CONGA, 46), (2, MUTE_CONGA, 30), (1, MARACAS, 20), (3, MARACAS, 22)], lift=-2)
for bar, v in ((1, 26), (13, 30), (21, 30), (29, 28), (37, 26), (45, 34), (57, 28), (65, 28)):  # section marks
    hit(bar, 0, TRIANGLE, v)

PARTS = {  # name: (channel, GM program 0-based, volume, pan, range low-high, notes); one instrument per channel
    "flute": (0, 73, 100, 72, (60, 88), trim(mono(flute))),
    "oboe": (1, 68, 92, 54, (58, 84), trim(mono(oboe))),
    "guitar": (2, 24, 96, 44, (40, 83), trim(guitar)),
    "harp": (3, 46, 90, 86, (23, 103), trim(harp)),
    "strings": (4, 49, 76, 64, (40, 96), trim(strings)),
    "bass": (5, 32, 88, 64, (28, 59), trim(octave(bass))),
    "cello": (6, 42, 86, 46, (36, 69), trim(mono(cello))),
    "clarinet": (7, 71, 86, 82, (50, 84), trim(mono(clarinet))),
    "celesta": (8, 8, 72, 30, (60, 84), trim(celesta)),
    "pizzicato": (10, 45, 88, 100, (48, 72), trim(pizz)),
    "horn": (11, 60, 66, 58, (41, 65), trim(mono(horn))),
}
DRUMS = trim(drums)
LEADS = ("flute", "oboe", "clarinet")
LINES = LEADS + ("cello", "horn")


# ---- checks -----------------------------------------------------------------------------------------------
def checks():
    last = 0.0
    for name, (_, _, _, _, (lo, hi), notes) in list(PARTS.items()) + [("drums", (9, 0, 0, 0, (35, 81), DRUMS))]:
        ps = [p for _, _, p, _ in notes]
        assert lo <= min(ps) and max(ps) <= hi, f"{name} out of range {min(ps)}-{max(ps)}"
        for t, n, p, v in notes:
            assert t >= 0 and n > 0.01 and 1 <= v <= 127 and isinstance(v, int), (name, t, n, p, v)
        for i, (t, n, p, _) in enumerate(notes):
            assert all(not (p2 == p and t <= t2 < t + n - 1e-9) for t2, _, p2, _ in notes[i + 1:]), (name, t, p)
        last = max(last, max(t + n for t, n, _, _ in notes))
        vs = [v for *_, v in notes]
        print(f"{name:9} notes {len(notes):4}  pitch {min(ps):3}-{max(ps):3}  velocity {min(vs):3}-{max(vs):3}")
    assert abs(last - END) < 1e-9, f"last note ends at {last}, loop is {END}"
    print(f"bars {BARS}, last note ends at beat {last} = {END}; loop length {END * 60 / BPM:.3f} s")

    # mix guardrails of the brief
    assert max(v for *_, v in DRUMS) <= 80, "a drum stroke over 80"
    high = [(name, round(t / 4 + 1, 2), n) for name in LEADS for t, n, p, _ in PARTS[name][5] if p > 84]
    assert sum(n for *_, n in high) <= 2 and all(n <= 1 for *_, n in high), f"leads above C6 too long: {high}"
    assert all(n <= 1 for _, (*_, notes) in PARTS.items() for _, n, p, _ in notes if p >= 88), "a sustained E6 or higher"
    print(f"lead notes above C6: {high}; velocities in use: {len({v for *_, ns in PARTS.values() for *_, v in ns} | {v for *_, v in DRUMS})}")

    # "No part clashes", read as: no two parts holding a semitone or minor ninth together for 3/4 beat or more.
    flat = sorted((t, t + n, p, name) for name, (*_, notes) in PARTS.items() for t, n, p, _ in notes)
    clashes = []
    for i, (t, e, p, a) in enumerate(flat):
        for t2, e2, p2, b in flat[i + 1:]:
            if t2 >= e:
                break
            if a != b and abs(p - p2) in (1, 13) and min(e, e2) - t2 >= 0.75:
                clashes.append((round(t2 / 4 + 1, 2), a, p, b, p2))
    print(f"sustained semitone/minor-ninth clashes between parts: {len(clashes)}", clashes[:20])

    # Held notes of the melodic lines (one beat or more) must be chord tones or the listed tensions.
    off = [(name, round(t / 4 + 1, 2), p, chord_at(t)) for name in LINES
           for t, n, p, _ in PARTS[name][5] if n >= 1 and p % 12 not in TONES[chord_at(t)]]
    print(f"held line notes outside the chord: {len(off)}", off[:20])

    # Parallel fifths/octaves at bass onsets: against the top line, and against the cello (no doubled low parts).
    def sounding(names, t):
        for name in names:
            hits = [p for s, n, p, _ in PARTS[name][5] if s <= t < s + n]
            if hits:
                return max(hits)
        return None

    low = sorted(n for n in bass)
    for label, names in (("top line", LEADS), ("cello", ("cello",))):
        pairs = [(t, p, sounding(names, t)) for t, _, p, _ in low]
        par = [(round(t2 / 4 + 1, 2), (m2 - b2) % 12) for (t1, b1, m1), (t2, b2, m2) in zip(pairs, pairs[1:])
               if m1 and m2 and b1 != b2 and m1 != m2 and (m1 - b1) % 12 == (m2 - b2) % 12 in (0, 7)]
        print(f"parallel fifths/octaves bass vs {label}: {len(par)}", par[:20])


def loudness(path):
    """Integrated loudness (LUFS) and true peak (dBFS) from ffmpeg's ebur128."""
    log = subprocess.run(["ffmpeg", "-hide_banner", "-nostats", "-i", path, "-af", "ebur128=peak=true", "-f", "null", "-"],
                         capture_output=True, text=True, check=True).stderr
    return float(re.findall(r"I:\s+(-?[\d.]+) LUFS", log)[-1]), float(re.findall(r"Peak:\s+(-?[\d.]+) dBFS", log)[-1])


def level(path):
    """psx.render normalises the peak; one fixed gain (the loop seam stays intact) brings the file to the game level."""
    before, _ = loudness(path)
    tmp = path[:-4] + ".tmp.ogg"
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", path, "-af", f"volume={LUFS - before:.2f}dB",
                    "-c:a", "libvorbis", "-q:a", "5", tmp], check=True)
    os.replace(tmp, path)
    after, peak = loudness(path)
    print(f"loudness {before} -> {after} LUFS, true peak {peak} dBFS")
    assert abs(after - LUFS) <= 0.5 and peak < PEAK, "loudness off target or true peak over the guardrail"


if __name__ == "__main__":
    checks()
    song = Song(bpm=BPM, bars=BARS)
    for name, (ch, prog, vol, pan, _, notes) in PARTS.items():
        song.add(channel=ch, program=prog, notes=notes, volume=vol, pan=pan)
    song.drum(DRUMS, volume=84)
    ogg = render(song, OUT, soundfont="MuseScore_General")
    level(ogg)
    print("wrote", ogg)
