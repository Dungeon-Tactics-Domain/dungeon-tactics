"""Pastoral rica A: "Old Road Lantern" grown up, the town theme of Dungeon Tactics (brief in BRIEF_PASTORAL_RICA.md).

Built on eval/slot_D.py: same motif (rising sixth, stepwise fall), E minor, 76 bpm, MuseScore General, psx chain.
slot_D's A and A' flute bars and the intro harp motif are kept note for note; the rest grows around them.
Form (4/4, 76 bpm, 70 bars = 221.05 s):
  1-4   Intro      harp arpeggios and the motif head; a soft cello B3 carried over from the coda's last bar
  5-12  A          flute theme, nylon guitar, sparse hand drums; a celesta echo at the half cadence
  13-20 A'         oboe counterline, full hand drums, bass line cliche E-D-C#-C, cadence on E minor
  21-28 B          G major: oboe lead, then the flute answers with the motif's sixth made major and the oboe moves
                   to a third below it; cello countermelody; E7 as V of Am7; B7 resolves deceptively onto C
  29-36 Bridge     A minor in a 3+3+2 groove: clarinet tune (two clarinets from bar 33) over a pizzicato ostinato;
                   back to E minor through Am (i of A minor = iv of E minor) and F#m7b5-B7
  37-40 Breakdown  the cello sings the theme over the guitar alone, bass E-D#-D-C#-C
  41-44 Build      the theme's climbing phrase over a rising bass C-C#-D-D#, flute joins at the octave, harp glissando
  45-54 Climax     theme an octave up, oboe in thirds, cello countermelody, deceptive cadence (B7 -> C) and a
                   two-bar extension that lands on a 4-3 suspension
  55-62 Return     half-time feel: flute theme with a Dorian A/E over an E pedal and a Picardy E major close,
                   clarinet counter-line in half notes, pizzicato then guitar
  63-70 Coda       oboe plays the motif in augmentation, celesta echo, Neapolitan F leads to Bsus4-B7 and bar 1
Run from scripts/music: python pastoral_rica_A.py [--check]  (writes <MUSIC_TOOLS>/pastoral_rica/A/pastoral_rica.mid
and .ogg; --check stops after the note checks)
"""
import os
import re
import subprocess
import sys
import tempfile
import wave

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(HERE, "eval"))
from measure import load, measure  # noqa: E402
from psx import FLUID, SOUNDFONTS, SR, TOOLS, Song, render  # noqa: E402

BPM, BARS = 76, 70
END = BARS * 4
OUT = os.path.join(TOOLS, "pastoral_rica", "A", "pastoral_rica")
LUFS, TRUE_PEAK = -18.0, -3.0  # the game chain's loudness; true peak ceiling from the brief

PROG = [
    "Em", "Cmaj7", "Am7", "Bsus4 B7",  # 1-4 intro
    "Em", "Cmaj7", "Am7", "Bsus4 B7",  # 5-8 A, half cadence with a 4-3 suspension
    "Em Em/D", "Cmaj7", "Am7 D7", "G",  # 9-12 the hopeful turn to the relative major
    "Em", "Cmaj7", "Am7", "B7",  # 13-16 A'
    "Em Em/D", "C#m7b5 Cmaj7", "Am7 B7", "Em",  # 17-20 line cliche in the bass, full cadence
    "C", "D/C", "Bm7 E7", "Am7",  # 21-24 B in G major; E7 is V of Am7
    "D7", "G", "Em C", "Am7 B7",  # 25-28 B7 resolves deceptively onto the bridge's C
    "Cmaj7", "F", "Dm7:3 E7:1", "Am:3 Am/G:1",  # 29-32 bridge in A minor, chords move on the 3+3+2 grid
    "F", "Dm7:3 E7:1", "Am:3 Am/G:1", "F#m7b5 B7",  # 33-36 Am is the pivot: i of A minor, iv of E minor
    "Em:3 Em/D#:1", "Em/D C#m7b5", "Cmaj7 Am7", "Bsus4 B7",  # 37-40 breakdown
    "Cmaj7", "A7/C#", "D", "B7/D#",  # 41-44 build: secondary dominant A7, rising bass
    "Em Em/D", "Cmaj7", "Am7 F#m7b5", "B7",  # 45-48 climax
    "Em Em/D", "C#m7b5 Cmaj7", "Am7 B7", "C",  # 49-52 deceptive cadence
    "Am7 F#m7b5", "Bsus4 B7",  # 53-54 extension
    "Em", "A/E", "Am7", "Bsus4 B7",  # 55-58 return: Dorian IV over an E pedal, then the minor iv
    "Em Em/D", "Cmaj7", "Am7 B7", "E",  # 59-62 Picardy close
    "Cmaj7", "G/B", "Am7", "Bsus4 B7",  # 63-66 coda: the motif in augmentation
    "Em Em/D", "Cmaj7", "Fmaj7", "Bsus4 B7",  # 67-70 Neapolitan F to the dominant, back into bar 1
]
assert len(PROG) == BARS

STEP = {"C": 0, "D": 2, "E": 4, "F": 5, "G": 7, "A": 9, "B": 11}


def pitch(name):
    acc = name[1:-1]
    return 12 * (int(name[-1]) + 1) + STEP[name[0]] + acc.count("#") - acc.count("b")


def pcs(names):
    return {STEP[n[0]] + n.count("#") for n in names.split()}


def table(spec):
    return {k: [pitch(n) for n in v.split()] for k, v in spec.items()}


# The guitar voicing's lowest note is the chord's bass (slash chords included); neighbours share common tones.
GTR = table({
    "Em": "E3 B3 E4 G4", "Cmaj7": "C3 B3 E4 G4", "C": "C3 G3 E4 G4", "Am7": "A2 C4 E4 G4", "B7": "B2 A3 D#4 F#4",
    "Bsus4": "B2 A3 E4 F#4", "G": "G2 B3 D4 G4", "G/B": "B2 G3 D4 G4", "D": "D3 A3 D4 F#4", "D7": "D3 A3 C4 F#4",
    "Bm7": "B2 A3 D4 F#4", "Em/D": "D3 B3 E4 G4", "C#m7b5": "C#3 B3 E4 G4", "D/C": "C3 A3 D4 F#4",
    "E7": "E3 B3 D4 G#4", "Am": "A2 C4 E4 A4", "Am/G": "G2 C4 E4 A4", "Fmaj7": "F2 C3 A3 E4", "F": "F2 C3 A3 F4", "Dm7": "D3 A3 C4 F4",
    "F#m7b5": "F#2 E3 A3 C4", "Em/D#": "D#3 B3 E4 G4", "A7/C#": "C#3 A3 E4 G4", "B7/D#": "D#3 A3 B3 F#4",
    "A/E": "E3 A3 C#4 E4", "E": "E3 B3 E4 G#4"})
HARP = {k: v + [v[2] + 12, v[3] + 12] for k, v in GTR.items()}
PAD = table({
    "Em": "G3 B3 E4", "Cmaj7": "G3 B3 E4", "C": "G3 C4 E4", "Am7": "G3 C4 E4", "B7": "F#3 A3 D#4",
    "Bsus4": "F#3 A3 E4", "G": "G3 B3 D4", "G/B": "G3 B3 D4", "D": "F#3 A3 D4", "D7": "F#3 A3 C4", "Bm7": "F#3 A3 D4",
    "Em/D": "G3 B3 E4", "C#m7b5": "G3 B3 E4", "D/C": "F#3 A3 D4", "E7": "G#3 B3 D4", "Am": "A3 C4 E4",
    "Am/G": "G3 C4 E4", "Fmaj7": "A3 C4 E4", "F": "A3 C4 F4", "Dm7": "F3 A3 C4", "F#m7b5": "F#3 C4 E4", "Em/D#": "G3 B3 E4",
    "A7/C#": "G3 C#4 E4", "B7/D#": "F#3 A3 B3", "A/E": "A3 C#4 E4", "E": "G#3 B3 E4"})
PIZZ = {k: v + [v[0] + 12] for k, v in PAD.items()}
# Chord tones plus the tensions allowed under a held melody note (9ths, 6ths, 11ths on minor chords, #11 on major 7ths).
TONES = {k: pcs(v) for k, v in {
    "Em": "E G B D F#", "Cmaj7": "C E G B D A F#", "C": "C E G D A B", "Am7": "A C E G B D", "B7": "B D# F# A",
    "Bsus4": "B E F# A", "G": "G B D A E", "G/B": "G B D A E", "D": "D F# A E", "D7": "D F# A C E", "Bm7": "B D F# A E",
    "Em/D": "E G B D F#", "C#m7b5": "C# E G B", "D/C": "D F# A C E", "E7": "E G# B D F#", "Am": "A C E B D",
    "Am/G": "A C E G B D", "Fmaj7": "F A C E G B", "F": "F A C E G D", "Dm7": "D F A C E", "F#m7b5": "F# A C E", "Em/D#": "E G B D# F#",
    "A7/C#": "A C# E G B", "B7/D#": "B D# F# A", "A/E": "A C# E B F#", "E": "E G# B F#"}.items()}


def at(bar, beat=0.0):
    return (bar - 1) * 4 + beat


def spans(bar):
    """(start, length, chord) per chord of a bar; "Dm7:3 E7:1" sets lengths, plain names share the bar equally."""
    toks = [t.split(":") for t in PROG[bar - 1].split()]
    free = (4 - sum(float(t[1]) for t in toks if len(t) == 2)) / max(1, sum(len(t) == 1 for t in toks))
    out, s = [], 0.0
    for t in toks:
        n = float(t[1]) if len(t) == 2 else free
        out.append((s, n, t[0]))
        s += n
    return out


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
                out.append((at(first_bar + i, b), dur, p, vel(base + arch[i % len(arch)] + 0.6 * (p - ref) + accent)))
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


def ostinato(first, last, step, pattern, accents, base, length):
    """Pizzicato on a fixed grid; the pattern runs over the bar, not the chord, so the 3+3+2 accents stay put."""
    out = []
    for bar in range(first, last + 1):
        for k in range(round(4 / step)):
            t = at(bar, k * step)
            v = base + (9 if k in accents else 0) + (2 if bar % 2 else 0) - (3 if k % 2 else 0)
            out.append((t, length, PIZZ[chord_at(t)][pattern[k % len(pattern)]], vel(v)))
    return out


def roll(start, length, pitches, v, step=0.04):
    return [(start + i * step, length - i * step, p, vel(v - 2 * i)) for i, p in enumerate(pitches)]


def pad(first, last, base, full=False, grow=0):
    """Sustained strings; a pitch kept by the next chord is held, not re-bowed. `full` adds the top an octave up."""
    out, held = [], {}
    for bar in range(first, last + 1):
        for s, _, name in spans(bar):
            t, cur = at(bar, s), set(PAD[name] + ([PAD[name][0] + 12] if full else []))
            for p in [p for p in held if p not in cur]:
                st, v = held.pop(p)
                out.append((st, t - st, p, v))
            for p in cur - held.keys():
                held[p] = (t, vel(base + grow * (bar - first) + (4 if (bar - first) % 4 == 2 else 0)))
    for p, (st, v) in held.items():
        out.append((st, at(last + 1) - st, p, v))
    return out


def octaves(notes):
    """The bass with its octave above, softer: small speakers hear the line through the upper note."""
    return notes + [(t, n, p + 12, vel(v * 0.7)) for t, n, p, v in notes]


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
    + line(5, [  # A, slot_D note for note
        "G5:1.5 F#5:.5 E5:1 D5:.5 E5:.5",  # motif: B -> G rising sixth, then the stepwise sigh
        "B4:2 A4:.5 B4:.5 C5:.5 D5:.5",
        "E5:1.5 D5:.5 C5:1 B4:.5 A4:.5",
        "B4:3 r:.5 B4:.5",  # half cadence
        "G5:1.5 A5:.5 B5:1 A5:.5 G5:.5",  # same sixth, now climbing instead of falling
        "E5:2 D5:.5 E5:.5 G5:1",
        "A5:1.5 G5:.5 F#5:1 E5:.5 F#5:.5",
        "G5:3 r:.5 B4:.5",
    ], 70, 76)
    + line(13, [  # A', slot_D note for note
        "G5:1.5 F#5:.5 E5:1 D5:.5 E5:.5",
        "B4:1.5 C5:.25 B4:.25 A4:.5 B4:.5 C5:.5 D5:.5",  # turn ornament on the second pass
        "E5:1.5 D5:.5 C5:1 B4:.5 A4:.5",
        "B4:3 r:.5 B4:.5",
        "G5:1.5 A5:.5 B5:1 A5:.5 G5:.5",
        "E5:2 D5:.5 E5:.5 G5:1",
        "A5:1 G5:.5 E5:.5 F#5:1 D#5:1",  # leading tone, so this time the phrase closes on E minor
        "E5:3 r:1",
    ], 74, 76)
    + line(25, [  # B: the flute answers the oboe; D5 -> B5 is the motif's sixth made major
        "A5:1.5 G5:.5 F#5:1 r:.5 D5:.5",
        "B5:1.5 A5:.5 G5:1 F#5:.5 G5:.5",
        "E5:2 D5:.5 E5:.5 G5:1",
        "A5:1 G5:.5 F#5:.5 D#5:2",
    ], 72, 76)
    + line(32, ["r:1.5 E5:.5 D5:.5 C5:1.5"], 56, 76)  # bridge: a low echo while the clarinet holds its A
    + line(43, [  # build: the flute joins the cello an octave above, then holds B7's fifth over the harp glissando
        "A5:1.5 G5:.5 F#5:1 E5:.5 F#5:.5",
        "F#5:3 r:.5 B4:.5",
    ], 70, 76, arch=(0, 4))
    + line(45, [  # climax: the theme an octave up; the only notes above C6 are the peak in bars 46-47
        "G5:1.5 F#5:.5 E5:.5 F#5:.25 E5:.25 D5:.5 E5:.5",
        "B5:2 A5:.5 B5:.5 C6:.5 D6:.5",
        "E6:1.5 D6:.5 C6:1 B5:.5 A5:.5",
        "B5:1.5 A5:.5 F#5:1 D#5:.5 B4:.5",
        "G5:1.5 A5:.5 B5:1 C6:.5 B5:.5",
        "B5:2 G5:.5 E5:.5 G5:.5 A5:.5",
        "C6:1.5 B5:.5 A5:.5 F#5:.5 D#5:1",
        "E5:2 G5:.5 A5:.5 B5:1",  # the melody arrives home but the chord is C: the cadence is deferred
    ], 82, 76)
    + line(53, ["C6:1.5 B5:.5 A5:1 G5:.5 F#5:.5", "E5:2 D#5:1.5 B4:.5"], 80, 76, arch=(2, -3))
    + line(55, [  # return: the theme at home, a Dorian C# in bar 56, grace notes, a turn and a Picardy G#
        "G5:1.5 F#5:.5 E5:1 D5:.5 E5:.5",
        "B4:2 A4:.5 B4:.5 C#5:.5 D5:.5",
        "F#5:.125 E5:1.375 D5:.5 C5:1 B4:.5 A4:.5",
        "B4:3 r:.5 B4:.5",
        "G5:1.5 A5:.5 B5:1 C6:.25 B5:.25 A5:.25 G5:.25",
        "E5:2 D5:.5 E5:.5 G5:1",
        "A5:1.5 G5:.5 F#5:1 E5:.5 F#5:.5",
        "A5:.125 G#5:2.875 r:1",
    ], 66, 76)
)

oboe = (
    line(13, [  # A': slot_D's slow inner line under the flute, with one echo of the motif tail
        "B4:4",
        "G4:4",
        "A4:2 G4:2",
        "F#4:1 F#5:.5 E5:.5 D#5:2",
        "E5:2 D5:2",
        "B4:2 G4:2",
        "E5:1 C5:1 B4:1 A4:1",
        "G4:2 B4:1 r:.5 G4:.5",
    ], 50, 70)
    + line(21, [  # B: slot_D's oboe tune in G major, a turn in bar 24
        "E5:1.5 D5:.5 C5:1 D5:.5 E5:.5",
        "F#5:2.5 E5:.5 D5:.5 E5:.5",
        "B5:1 D5:1.5 E5:.5 F#5:1",
        "G5:1.5 A5:.25 G5:.25 F#5:.25 G5:.25 F#5:.5 E5:.5 C5:.5",
    ], 76, 76)
    + line(25, [  # then a third (sometimes a sixth) under the flute's answer
        "F#5:1.5 E5:.5 C5:1 r:.5 B4:.5",
        "G5:1.5 F#5:.5 E5:1 D5:1",
        "B4:2.5 C5:.5 E5:1",
        "E5:1.5 C5:.5 B4:2",
    ], 62, 76)
    + line(45, [  # climax: thirds under the flute
        "B4:2 G4:1 B4:1",
        "G5:2 E5:1 A5:1",
        "C6:1.5 B5:.5 A5:1 G5:.5 E5:.5",
        "D#5:2 A4:2",
        "E5:1.5 F#5:.5 G5:2",
        "G5:2 E5:2",
        "A5:1.5 G5:.5 D#5:1 B4:1",
        "C5:2 E5:.5 F#5:.5 G5:1",
    ], 66, 76)
    + line(53, ["A5:1.5 G5:.5 F#5:1 E5:.5 C5:.5", "B4:2 A4:2"], 64, 76, arch=(2, -3))
    + line(63, [  # coda: the motif in augmentation (every value doubled), fading out
        "G5:3 F#5:1",
        "E5:2 D5:1 E5:1",
        "C5:2 B4:1 A4:1",
        "B4:4",
    ], 58, 72, arch=(2, 0, -3, -6))
)

clarinet = (
    line(28, ["r:3.5 E4:.5"], 60, 70)
    + line(29, [  # bridge: E4 -> C5 is the motif's sixth in A minor, laid on the 3+3+2 grid
        "C5:1.5 B4:1.5 G4:1",
        "A4:1.5 C5:1.5 E5:1",
        "F5:1.5 E5:1.5 B4:1",
        "A4:3 r:.5 E4:.5",
        "C5:1.5 A5:1.5 G5:1",  # the sixth again, a step higher and major
        "F5:1.5 E5:1.5 D5:1",
        "C5:1.5 B4:1.5 A4:1",
        "A4:1.5 C5:.5 B4:1 D#5:1",  # straight rhythm: the groove turns back to 4/4
    ], 68, 70)
    + line(33, [  # a second clarinet a third (or sixth) below
        "A4:1.5 F5:1.5 E5:1",
        "D5:1.5 C5:1.5 B4:1",
        "A4:1.5 E4:2.5",
        "F#4:1.5 A4:.5 F#4:1 B4:1",
    ], 58, 70)
    + line(55, [  # return: half notes under the flute, falling by step at the end (the sigh, slowed down)
        "E4:2 G4:2",
        "F#4:2 E4:2",
        "C4:2 E4:2",
        "F#4:2 D#4:2",
        "G4:2 F#4:2",
        "E4:2 D4:2",
        "C4:2 B3:2",
        "B3:3 r:1",
    ], 56, 64)
)

cello = (
    line(1, ["B3:4", "B3:2 A3:2", "C4:4", "B3:4"], 42, 60, arch=(0, 0, 3, 3))
    + line(21, [  # B: a tenor countermelody, moving while the oboe holds
        "G3:2 A3:1.5 B3:.5",
        "C4:3 B3:.5 A3:.5",
        "B3:2 G#3:2",
        "A3:3 G3:1",
        "F#3:2 A3:1 C4:1",
        "B3:1.5 C4:.5 D4:2",
        "D4:1 E4:1 C4:1.5 B3:.5",
        "A3:1 G3:1 F#3:2",
    ], 56, 55)
    + line(36, ["r:3.5 B3:.5"], 58, 60)
    + line(37, [  # breakdown: the theme in the cello's singing register, chromatic where the bass descends
        "G4:1.5 F#4:.5 E4:1 D#4:.5 E4:.5",
        "B3:2 A3:.5 B3:.5 C#4:.5 D4:.5",
        "E4:1.5 D4:.5 C4:1 B3:.5 A3:.5",
        "B3:3 r:.5 B3:.5",
    ], 62, 62)
    + line(41, [  # build: the climbing half of the theme, the flute doubles bar 43 an octave up
        "G4:1.5 A4:.5 B4:1 A4:.5 G4:.5",
        "E4:2 D4:.5 E4:.5 G4:1",
        "A4:1.5 G4:.5 F#4:1 E4:.5 F#4:.5",
        "A3:2 B3:1.5 r:.5",
    ], 62, 62, arch=(0, 3, 6, 4))
    + line(45, [  # climax: half-note countermelody, moving while the flute holds
        "E3:1 G3:.5 B3:.5 D4:2",
        "G3:1 A3:.5 B3:.5 E4:2",
        "E4:1 D4:.5 C4:.5 A3:2",
        "F#3:2 A3:1 B3:1",
        "G3:1.5 B3:.5 E4:1 D4:1",
        "E4:2 B3:2",
        "E4:2 F#4:2",
        "G4:2 E4:2",
        "E4:2 C4:2",
        "B3:2 A3:2",
    ], 60, 55)
    + line(69, ["C4:4", "B3:4"], 46, 60, arch=(0, -3))
)

celesta = (
    line(8, ["r:1 F#5:.5 E5:.5 D#5:1 r:1"], 52, 76)  # echo of the suspension at the half cadence
    + line(58, ["r:1 F#5:.5 E5:.5 D#5:1 r:1"], 50, 76)  # the same echo in the return
    + line(66, ["r:3.5 B4:.5", "G5:1.5 F#5:.5 E5:2", "r:1 D5:.5 E5:.5 B4:2"], 50, 76, arch=(0, 0, -4))
)

# ---- accompaniment ----------------------------------------------------------------------------------------
ROLL = [0, 1, 2, 3, 2, 1, 2, 1]
guitar = (
    arpeggio(5, 12, GTR, ROLL, 48) + arpeggio(13, 20, GTR, ROLL, 52)
    + arpeggio(37, 40, GTR, [0, 1, 2, 1], 54)  # breakdown: alone with the cello, the bass voice on every chord
    + arpeggio(41, 42, GTR, ROLL, 48) + arpeggio(43, 44, GTR, ROLL, 52)
    + arpeggio(45, 54, GTR, ROLL, 56) + arpeggio(59, 62, GTR, ROLL, 46)
)
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
    + arpeggio(41, 43, HARP, [0, 1, 2, 3, 4, 3, 2, 1], 40, size=5)
    + roll(at(44), 3, GTR["B7/D#"], 48)
    + arpeggio(63, 68, HARP, [0, 1, 2, 3, 2, 1, 2, 3], 46, size=4)
    + arpeggio(69, 70, HARP, [0, 1, 2, 3, 4, 5, 4, 3], 48)  # the intro's pattern, so the seam is one texture
    + roll(at(12, 2), 2, [p + 12 for p in GTR["G"]], 40)
    + roll(at(62), 3, [p + 12 for p in GTR["E"]], 44)
)
for i, name in enumerate("B3 D#4 F#4 A4 B4 D#5 F#5 A5".split()):  # glissando up the B7 into the climax
    harp.append((at(44, 3 + i / 8), at(45) - at(44, 3 + i / 8), pitch(name), vel(44 + 3 * i)))
for bar in (45, 47, 49, 51, 53):  # climax: a high rolled chord every other bar for shimmer
    s, n, name = spans(bar)[0]
    harp += roll(at(bar, s), min(n, 2), [p + 12 for p in GTR[name]], 46)

pizz = (
    ostinato(29, 36, .5, [0, 1, 2, 1, 2, 3, 0, 2], {0, 3, 6}, 50, .45)  # eighths grouped 3+3+2: the 6/8 lilt
    + ostinato(55, 58, 1, [0, 2, 1, 3], {0, 2}, 44, .8)  # return: plain quarters under the half-time drums
)

strings = (
    pad(1, 4, 36) + pad(9, 12, 34) + pad(13, 20, 44) + pad(21, 28, 52) + pad(33, 36, 38)
    + pad(41, 44, 40, grow=5) + pad(45, 54, 58, full=True) + pad(55, 62, 44) + pad(63, 70, 38)
)

# Channel volume is capped at 60 (the brief's contrabass limit), so velocities sit about 14 over slot_D's: at the slot's
# levels the share under 150 Hz fell to 7.6 % (slot_D 30 %, flagged as mud; the other slots 8-22 %).
bass = octaves(
    line(1, ["E2:4", "C2:4", "A1:4", "B1:4"], 78, 40)
    + line(5, [
        "E2:2 B1:1.5 D2:.5", "C2:2 G1:1.5 B1:.5", "A1:2 E2:1.5 C2:.5", "B1:2 F#2:1.5 D#2:.5",
        "E2:2 D2:1.5 B1:.5", "C2:2 G1:1.5 B1:.5", "A1:2 D2:2", "G2:2 D2:1.5 F#2:.5",
    ], 84, 40)
    + line(13, [  # approach notes chosen so the bass never doubles the flute's line in octaves
        "E2:1.5 B1:.5 G2:1 D2:1", "C2:1.5 G1:.5 C2:1 B1:1", "A1:1.5 E2:.5 C2:1 A1:1", "B1:2 F#2:1 D#2:1",
        "E2:2 D2:2", "C#2:2 C2:2", "A1:2 B1:2", "E2:2 B1:1.5 D2:.5",
    ], 88, 40)
    + line(21, [  # C under the D chord resolves down to B; E7 then falls to A
        "C2:1.5 G2:.5 E2:1 C2:1", "C2:1.5 A1:.5 D2:1 C2:1", "B1:1.5 F#2:.5 E2:1 B1:1", "A1:1.5 E2:.5 C2:1 E2:1",
        "D2:1.5 A1:.5 D2:1 F#2:1", "G2:1.5 D2:.5 G1:1 D2:1", "E2:1.5 B1:.5 C2:1.5 E2:.5", "A1:1.5 C2:.5 B1:2",
    ], 90, 40)
    + line(29, [  # bridge: dotted quarter, dotted quarter, quarter
        "C2:1.5 G2:1.5 E2:1", "F2:1.5 C2:1.5 A1:1", "D2:1.5 F2:1.5 E2:1", "A1:1.5 C2:1.5 G1:1",
        "F1:1.5 C2:1.5 F2:1", "D2:1.5 A1:1.5 E2:1", "A1:1.5 E2:1.5 G2:1", "F#2:2 B1:2",
    ], 86, 40)
    + line(41, ["C2:2 G1:2", "C#2:2 E2:2", "D2:2 A1:2", "D#2:2 F#2:1 D#2:1"], 80, 40, arch=(0, 4, 8, 12))
    + line(45, [
        "E2:1 G2:1 D2:1 B1:1", "C2:1 E2:1 G2:1 E2:1", "A1:1 E2:1 F#2:1.5 C2:.5", "B1:1 D#2:1 F#2:1 A2:1",
        "E2:1.5 B1:.5 D2:2", "C#2:1.5 G2:.5 C2:1.5 G1:.5", "A1:1.5 E2:.5 B1:2", "C2:1.5 G2:.5 E2:1 C2:1",
        "A1:1.5 E2:.5 F#2:1.5 C2:.5", "B1:2 F#2:1.5 D#2:.5",
    ], 94, 40)
    + line(55, [  # return: an E pedal under Em and the Dorian A/E, then a half-time walk
        "E2:2 B1:2", "E2:4", "A1:2 E2:2", "B1:2 F#2:1.5 D#2:.5",
        "E2:2 D2:2", "C2:2 G1:1.5 B1:.5", "A1:2 B1:2", "E2:4",
    ], 84, 40)
    + line(63, ["C2:4", "B1:4", "A1:4", "B1:4", "E2:2 D2:2", "C2:4", "F2:4", "B1:4"], 80, 40, arch=(2, 0, -3, -6))
)

# ---- light folk percussion (GM1 kit notes) ----------------------------------------------------------------
HI_BONGO, LO_BONGO, MUTE_CONGA, OPEN_CONGA, LOW_CONGA = 60, 61, 62, 63, 64
TAMBOURINE, CABASA, MARACAS, TRIANGLE = 54, 69, 70, 81
drums = []


def hit(bar, beat, note, v):
    """One stroke; a fixed wobble of +-2 (no random) keeps repeated patterns off a flat velocity."""
    drums.append((at(bar, beat), 0.25, note, vel(v + (bar * 7 + int(beat * 4) * 3) % 5 - 2)))


def groove(first, last, strokes, cut=None):
    """A pattern of (beat, note, velocity) over bars; `cut` maps a bar to the beat where its fill takes over."""
    for bar in range(first, last + 1):
        for beat, note, v in strokes:
            if beat < (cut or {}).get(bar, 4):
                hit(bar, beat, note, v)


def fill(bar, beat, notes, v0, v1):
    """Sixteenths from `beat`, velocity moving from v0 to v1."""
    for i, note in enumerate(notes):
        hit(bar, beat + i / 4, note, v0 + (v1 - v0) * i / max(1, len(notes) - 1))


def shaker(note, down, up, step=.5):
    return [(k * step, note, up if k % 2 else down) for k in range(round(4 / step))]


for bar in (3, 4, 69, 70):  # a soft heartbeat on both sides of the loop point
    hit(bar, 0, LOW_CONGA, 34 if bar in (3, 69) else 42)
for bar, v in ((13, 30), (21, 30), (29, 26), (37, 24), (45, 34), (55, 30), (59, 26), (62, 30)):  # section marks
    hit(bar, 0, TRIANGLE, v)
# A: sparse; A': the full hand-drum pattern; B: syncopated, tambourine on 2 and 4
groove(5, 12, [(0, LOW_CONGA, 54), (2, MUTE_CONGA, 34), (1, MARACAS, 22), (3, MARACAS, 24)])
fill(12, 3, [LO_BONGO, HI_BONGO], 32, 38)
groove(13, 20, [(0, LOW_CONGA, 62), (1.5, LOW_CONGA, 40), (2, OPEN_CONGA, 46), (3, MUTE_CONGA, 36),
                (3.5, MUTE_CONGA, 30)] + shaker(MARACAS, 20, 28), cut={16: 3.5, 20: 3})
hit(16, 3.5, HI_BONGO, 36)
fill(20, 3, [HI_BONGO, HI_BONGO, LO_BONGO, LO_BONGO], 30, 50)
groove(21, 28, [(0, LOW_CONGA, 60), (1.5, OPEN_CONGA, 44), (2.5, LOW_CONGA, 42), (3, MUTE_CONGA, 36),
                (3.5, OPEN_CONGA, 38), (1, TAMBOURINE, 32), (3, TAMBOURINE, 36)] + shaker(MARACAS, 20, 28),
       cut={24: 3.5, 28: 2})
hit(24, 3.5, HI_BONGO, 38)
fill(28, 2, [HI_BONGO, HI_BONGO, LO_BONGO, HI_BONGO, LO_BONGO, LO_BONGO, OPEN_CONGA, LOW_CONGA], 30, 58)
# bridge: accents on the 3+3+2 grid, cabasa instead of maracas; bar 36 thins out into the breakdown
groove(29, 35, [(0, LOW_CONGA, 56), (1.5, OPEN_CONGA, 46), (2.5, MUTE_CONGA, 26), (3, LOW_CONGA, 48)]
       + [(k / 2, CABASA, 30 if k in (0, 3, 6) else 18 + 2 * (k % 2)) for k in range(8)], cut={32: 3.25})
for bar in (33, 34, 35):
    hit(bar, 3, TAMBOURINE, 28)
fill(32, 3.25, [HI_BONGO, HI_BONGO, LO_BONGO], 34, 44)
groove(36, 36, [(0, LOW_CONGA, 46), (1.5, OPEN_CONGA, 36), (0, CABASA, 28), (.5, CABASA, 20), (1, CABASA, 18),
                (1.5, CABASA, 16)])
# build: the hand drums come back one by one and roll into the climax
groove(41, 41, [(0, LOW_CONGA, 36), (2, LOW_CONGA, 30)])
groove(42, 42, [(0, LOW_CONGA, 40), (2, MUTE_CONGA, 30), (3, LOW_CONGA, 34)] + shaker(MARACAS, 14, 18))
groove(43, 43, [(0, LOW_CONGA, 46), (1.5, OPEN_CONGA, 36), (2, LOW_CONGA, 40), (3, MUTE_CONGA, 34),
                (3.5, MUTE_CONGA, 32)] + shaker(MARACAS, 18, 24))
groove(44, 44, [(0, LOW_CONGA, 50), (1.5, OPEN_CONGA, 40)])
fill(44, 2, [LO_BONGO, HI_BONGO, LO_BONGO, HI_BONGO, MUTE_CONGA, OPEN_CONGA, LO_BONGO, LOW_CONGA], 36, 70)
CLIMAX = [(0, LOW_CONGA, 70), (1.5, LOW_CONGA, 46), (2, OPEN_CONGA, 54), (2.5, MUTE_CONGA, 34), (3, MUTE_CONGA, 42),
          (3.5, OPEN_CONGA, 38), (1, TAMBOURINE, 42), (3, TAMBOURINE, 46)] + shaker(MARACAS, 24, 32)
groove(45, 51, CLIMAX, cut={48: 3, 51: 2})
fill(48, 3, [HI_BONGO, HI_BONGO, LO_BONGO, LO_BONGO], 40, 56)
fill(51, 2, [HI_BONGO, LO_BONGO, HI_BONGO, LO_BONGO, MUTE_CONGA, OPEN_CONGA, LO_BONGO, LOW_CONGA], 40, 74)
groove(52, 52, [(0, LOW_CONGA, 66)] + shaker(MARACAS, 18, 22))  # the deceptive cadence: the floor drops away
groove(53, 54, [(beat, note, v - 10) for beat, note, v in CLIMAX], cut={54: 3})
fill(54, 3, [LO_BONGO, LO_BONGO, MUTE_CONGA, MUTE_CONGA], 48, 30)
# return: half time, the open conga on beat 3 instead of 2 and 4
groove(55, 61, [(0, LOW_CONGA, 52), (2, OPEN_CONGA, 44), (3.5, MUTE_CONGA, 28)] + shaker(MARACAS, 18, 22, step=1))
hit(62, 0, LOW_CONGA, 46)
for bar in range(63, 67):  # coda: the pulse thins out
    hit(bar, 0, LOW_CONGA, 40 - 2 * (bar - 63))
    if bar < 66:
        hit(bar, 2, MUTE_CONGA, 24)

PARTS = {  # name: (channel, GM program 0-based, volume, pan, range low-high, notes)
    "flute": (0, 73, 100, 72, (60, 88), trim(flute)),
    "oboe": (1, 68, 90, 54, (58, 88), trim(oboe)),
    "guitar": (2, 24, 92, 44, (40, 83), trim(guitar)),
    "harp": (3, 46, 88, 86, (40, 88), trim(harp)),
    "strings": (4, 49, 76, 64, (40, 88), trim(strings)),
    "bass": (5, 32, 60, 64, (28, 60), trim(bass)),
    "cello": (6, 42, 80, 48, (36, 76), trim(cello)),
    "clarinet": (7, 71, 88, 60, (50, 88), trim(clarinet)),
    "pizzicato": (8, 45, 80, 78, (40, 84), trim(pizz)),
    "celesta": (10, 8, 70, 40, (60, 88), trim(celesta)),
}
DRUMS = trim(drums)
LEADS = ("flute", "oboe", "clarinet", "cello", "celesta")


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
        print(f"{name:9} notes {len(notes):4}  pitch {min(ps):3}-{max(ps):3}  velocity {min(vs):3}-{max(vs):3}")
    assert abs(last - END) < 1e-9, f"last note ends at {last}, loop is {END}"
    print(f"bars {BARS}, last note ends at beat {last} = {END}; loop length {END * 60 / BPM:.3f} s")

    # Mix guardrails from the brief, as asserts.
    chans = [ch for ch, *_ in PARTS.values()]
    assert len(set(chans)) == len(chans) <= 15 and 9 not in chans, "one instrument per channel, drums alone on 10"
    assert max(v for *_, v in DRUMS) <= 80, "a drum stroke above velocity 80"
    assert max(p for *_, notes in PARTS.values() for _, _, p, _ in notes) <= 88, "a note above E6"
    high = [(t, n, p) for name in LEADS for t, n, p, _ in PARTS[name][5] if p > 84]
    assert all(at(46) <= t < at(48) for t, _, _ in high) and sum(n for _, n, _ in high) <= 3, high
    print(f"lead notes above C6: {len(high)}, {sum(n for _, n, _ in high)} beats, all in the peak of bars 46-47")
    ch, _, volume, _, _, low = PARTS["bass"]
    assert volume <= 60 and min(p for _, _, p, _ in low) >= 28, "bass volume over 60 or a note under E1"
    onsets = {(t, p) for t, _, p, _ in low}
    roots = [(t, n, p, v) for t, n, p, v in low if (t, p - 12) not in onsets]
    assert all((t, p + 12) in onsets for t, _, p, _ in roots), "a bass note without its octave above"
    every = [v for *_, notes in PARTS.values() for *_, v in notes] + [v for *_, v in DRUMS]
    print(f"distinct velocities: {len(set(every))}")
    assert len(set(every)) > 62, "not more distinct velocities than slot_D"

    # "No part clashes", read as: no two parts holding a semitone or minor ninth together for 3/4 beat or more.
    flat = sorted((t, t + n, p, name) for name, (*_, notes) in PARTS.items() for t, n, p, _ in notes)
    clashes, mud = [], []
    for i, (t, e, p, a) in enumerate(flat):
        for t2, e2, p2, b in flat[i + 1:]:
            if t2 >= e:
                break
            if a != b and abs(p - p2) in (1, 13) and min(e, e2) - t2 >= 0.75:
                clashes.append((round(t2 / 4 + 1, 2), a, p, b, p2))
            # mud: two different pitches under C3 a third or less apart, sounding together for half a beat
            if max(p, p2) < 48 and 0 < abs(p - p2) < 5 and min(e, e2) - t2 >= 0.5:
                mud.append((round(t2 / 4 + 1, 2), a, p, b, p2))
    print(f"sustained semitone/minor-ninth clashes between parts: {len(clashes)}", clashes)
    print(f"low seconds/thirds under C3 held together: {len(mud)}", mud)

    # Held melody notes (one beat or more) must be chord tones or the listed tensions.
    off = [(name, round(t / 4 + 1, 2), p, chord_at(t)) for name in LEADS
           for t, n, p, _ in PARTS[name][5] if n >= 1 and p % 12 not in TONES[chord_at(t)]]
    print(f"held melody notes outside the chord: {len(off)}", off)

    # Parallel fifths/octaves between the bass (its lower notes) and the top line at bass onsets.
    def top(t):
        hits = [p for name in LEADS for s, n, p, _ in PARTS[name][5] if s <= t < s + n]
        return max(hits) if hits else None

    pairs = [(t, p, top(t)) for t, _, p, _ in sorted(roots)]
    par = [(round(t2 / 4 + 1, 2), (m2 - b2) % 12) for (t1, b1, m1), (t2, b2, m2) in zip(pairs, pairs[1:])
           if m1 and m2 and b1 != b2 and m1 != m2 and (m1 - b1) % 12 == (m2 - b2) % 12 in (0, 7)]
    print(f"parallel fifths/octaves bass vs top line: {len(par)}", par)


# ---- render and measure -----------------------------------------------------------------------------------
def ebur(path):
    """Integrated loudness (LUFS) and true peak (dBFS) from ffmpeg's ebur128 summary."""
    log = subprocess.run(["ffmpeg", "-hide_banner", "-nostats", "-i", path, "-af", "ebur128=peak=true", "-f", "null",
                          "-"], capture_output=True, text=True).stderr.split("Summary:")[-1]
    return float(re.search(r"I:\s+(-?[\d.]+) LUFS", log).group(1)), float(re.search(r"Peak:\s+(-?[\d.]+) dBFS", log).group(1))


def raw_peak(mid):
    """Peak of fluidsynth's 16-bit render before psx normalises it (same settings as psx.render): a sample at full
    scale there means the synth clipped, which the later normalisation would hide."""
    with tempfile.TemporaryDirectory() as tmp:
        wav = os.path.join(tmp, "raw.wav")
        subprocess.run([FLUID, "-ni", "-g", "0.8", "-r", str(SR), "-o", "synth.reverb.room-size=0.35",
                        "-o", "synth.reverb.damp=0.5", "-o", "synth.reverb.level=0.45", "-o", "synth.chorus.active=0",
                        "-F", wav, os.path.join(TOOLS, SOUNDFONTS["MuseScore_General"]), mid], check=True,
                       capture_output=True)
        with wave.open(wav) as w:
            x = np.abs(np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16).astype(np.int32))
    return int(x.max()), int((x >= 32767).sum())


def finish(ogg):
    """psx.render normalises the peak to 0.9; one static gain brings the loop to -18 LUFS (no dynamic loudnorm, which
    would ride the level and break the seam). Encoded from raw samples, as battle_dark.py found ogg-to-ogg left
    timestamp jumps."""
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", ogg, "-f", "f32le", "-ac", "2", "-ar", str(SR), "-"],
                         capture_output=True, check=True).stdout
    gain = LUFS - ebur(ogg)[0]
    for _ in range(4):  # Vorbis moves the loudness by a few tenths: correct from the encoded file
        subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-f", "f32le", "-ar", str(SR), "-ac", "2", "-i", "-",
                        "-af", f"volume={gain:.2f}dB", "-c:a", "libvorbis", "-q:a", "4", ogg], input=raw, check=True)
        loud, tp = ebur(ogg)
        if abs(loud - LUFS) <= .2:
            break
        gain += LUFS - loud
    return loud, tp, gain


if __name__ == "__main__":
    checks()
    if "--check" not in sys.argv:
        song = Song(bpm=BPM, bars=BARS)
        for name, (ch, prog, volume, pan, _, notes) in PARTS.items():
            song.add(channel=ch, program=prog, notes=notes, volume=volume, pan=pan)
        song.drum(DRUMS, volume=84)
        ogg = render(song, OUT, soundfont="MuseScore_General")
        peak, full = raw_peak(OUT + ".mid")
        loud, tp, gain = finish(ogg)
        r = measure(load(ogg))
        secs = END * 60 / BPM
        print(f"wrote {ogg}: {r['dur']:.3f} s (loop {secs:.3f} s)")
        print(f"synth peak before normalising {peak}/32767, samples at full scale {full}")
        print(f"loudness {loud:.1f} LUFS (gain {gain:+.2f} dB), true peak {tp:.1f} dBFS, sample peak {r['peak']:.1f} dB")
        print(f"bands <150 {r['bands'][0]:.1f} %, 150-2k {r['bands'][1]:.1f} %, 2-5k {r['bands'][2]:.1f} %, "
              f">5k {r['bands'][3]:.1f} %; centroid {r['cent']:.0f} Hz")
        print(f"seam: last 2 s -> first 2 s {r['seam_rms']:+.2f} dB, spectral distance {r['seam_spec']:.2f} dB, "
              f"wrap jump {r['wrap_jump']:.4f} = {r['wrap_ratio']:.1f}x the p99.9 step; first/last 50 ms "
              f"{r['edge_start']:.1f}/{r['edge_end']:.1f} dB; level per fifth {[round(v, 1) for v in r['sec_db']]}")
        assert abs(r["dur"] - secs) < .05, "the .ogg is not one loop long"
        assert full == 0, "fluidsynth clipped"
        assert abs(loud - LUFS) <= .5 and tp < TRUE_PEAK, "loudness off -18 LUFS or true peak over -3 dBFS"
        assert r["wrap_ratio"] < 3, "possible click at the loop point"
