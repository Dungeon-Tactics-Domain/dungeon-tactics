"""Main battle theme of Dungeon Tactics (dark) and its intense variation, built with psx.py.

Recipe, not notes: blocks of layered strings alternate with blocks where a low horn pulse takes over (the shape of a
Final Fantasy Tactics battle theme, from measured statistics only); the dread comes from a long low pedal, a tolling
bell, a whispered choir, the Phrygian second and silence (the mood of Darkest Dungeon). It is a texture, not a tune:
the weight sits in the pedal, the bass, the timpani, the chords and the bell, and the motif (D-A-D-Eb-D) comes back
inside them, soft, in two parts an octave apart; only in the coda the choir whispers it alone, at half speed. Motif,
bass line and chord order are our own. D Phrygian with harmonic-minor cadences, 60 bars that loop.

Run from the repository root:  python scripts/music/battle_dark.py
Writes battle_dark and battle_dark_intense (.mid, .ogg) to MUSIC_TOOLS/dark and prints the checks. An assert stops
the run when a part leaves its range, the loop length is off, a mix guardrail is broken, the motif of the strings
and horns comes to the front or the loop point shows.
"""
import io
import os
import random
import re
import subprocess

import mido
import numpy as np

from psx import PPQ, SR, TOOLS, Song, render

OUT = os.path.join(TOOLS, "dark")
BARS = 60
INTRO, THEME, BRASS, BRIDGE, RETURN, CODA = 1, 5, 21, 33, 41, 57  # first bar of each section
PEAK_DB = -3.0  # psx.render normalises to -0.9 dB; the mix guardrail is a peak under -2 dB
PC = {"C": 0, "D": 2, "E": 4, "F": 5, "G": 7, "A": 9, "B": 11}

# name, GM program, volume, pan, lowest and highest pitch the part may sound (the mix guardrails are these limits).
# Volumes come from measuring each SGM patch alone: bass and drums are loud, the bell is soft.
PARTS = (
    ("strings hi", 48, 110, 50, 55, 84),  # the chords and, under them, the motif: nothing above C6
    ("strings lo", 48, 110, 78, 45, 55),
    ("contrabass", 43, 60, 64, 28, 43),  # never below E1; down from 86 (31% of the energy at 60-120 Hz) and 70 (28%): muddy by ear, 15/11
    ("horns", 60, 92, 44, 43, 74),  # the only brass (the muted trumpet broke the music and was taken out): none above G5
    ("choir", 52, 110, 64, 55, 65),
    ("bell", 14, 127, 70, 50, 62),
    ("timpani", 47, 100, 58, 38, 53),
    ("drums", None, 100, 64, 36, 49),
)

# Chord of every bar: "X/Y" is X over the bass Y, "X,Y" is two beats each. The bass reads its note from the name, so
# the pedals are spelled out: D under bars 1-16, A under the bridge, D again from the return.
CHORDS = """
    D5 D5 Eb/D D5
    Dm Dm F/D F/D  Dm Gm/D Eb/D,A/D D5
    Dm Dm F/D F/D  F Gm Eb A7
    Bb Bb Gm Gm  Eb Eb Cm Cm  Dm Cm Bb Bb
    A7b9 A7b9 A7b9 A7b9  A7b9 A7b9 A7b5 A7b5
    Dm Dm F/D F/D  Dm Gm/D Eb/D,A/D D5
    Dm Bb F F  Dm Gm Eb,A7 Dm
    D5 D5,Eb/D D5 A/D
""".split()

# The motif: down a fourth, back, up the Phrygian semitone and home. It never sings in front (Fernando: the piece is
# atmosphere and had too much lead voice): two parts play it an octave apart, softer than the chords around it, for
# two bars at most, and then it stays out for at least as long. Only the coda differs: the choir whispers it alone at
# half speed there, as it did before that decision (the choir was to stay as it was).
CELL = "D4:1.5 A3:.5 D4:1 Eb4:1 D4:3"
MOTIF = {bar: CELL for bar in (THEME, THEME + 4, THEME + 8, THEME + 12, RETURN + 4, RETURN + 8, RETURN + 12)} | {
    BRASS: "F4:1.5 Bb4:.5 F4:1 Eb4:1 F4:3",  # upside down over the horn pulse
    BRASS + 4: "Bb4:1.5 Eb5:.5 Bb4:1 A4:1 Bb4:3",  # and again a fourth higher
    BRIDGE + 2: "A3:1.5 Bb3:.5 A3:2",  # only its semitone, on the two notes of the tritone to come
    BRIDGE + 4: "Eb4:1.5 E4:.5 Eb4:2",
    BRIDGE + 6: "A4:1.5 Eb4:.5 A4:1 Bb4:1 Eb4:2",  # on the dominant, its fourth bent into a tritone; then silence
}

# Two-voice pads, common tones held and the rest moving by step; Bb-C#-D is the harmonic-minor close.
PAD_PEDAL = "A3+F4:8 C4+F4:8 A3+F4:4 Bb3+G4:4 Bb3+G4:2 C#4+G4:2 D4+F4:3 -:1"  # over the D pedal
PAD_OPEN = "A3+D4:8 A3+C4:8 A3+F4:4 Bb3+D4:4 Bb3+Eb4:4 A3+E4:4"  # bars 13-20, ends on the dominant
PAD_CLOSE = "A3+F4:4 Bb3+F4:4 C4+F4:8 D4+F4:4 Bb3+G4:4 Bb3+G4:2 C#4+G4:2 D4+F4:4"  # bars 49-56: the seventh falls to the third

FILLS = {6, 8, 12, 16, 44}  # phrase ends: the low strings put the Phrygian second over their D on the last beat
PICKUPS = {6, 8, 12, 14, 16, 42, 44, 48, 52, 56}  # bars that hand over to a D: two soft timpani strokes on A

KICK, SNARE, TOM_LO, TOM_MID, CRASH = 36, 38, 41, 45, 49
# Velocities stay well under the cap of 80: at 80 one SGM drum stroke peaks 5 to 10 dB above a string note.
MARCH = ((0, KICK, 64), (1, SNARE, 52), (1.5, SNARE, 58), (2, TOM_LO, 52), (3, SNARE, 54), (3.5, SNARE, 60))
FILL = MARCH[:4] + ((3, SNARE, 56), (3.25, SNARE, 62), (3.5, TOM_MID, 56), (3.75, TOM_LO, 62))  # toms never on a kick
DRIVE = ((.5, SNARE, 42), (.75, SNARE, 46), (2.5, KICK, 50))  # added where the piece pushes hardest


def at(bar, beat=0):
    """Beat count of `beat` (from 0) in `bar` (from 1)."""
    return 4 * (bar - 1) + beat


def pitch(name):
    """'Eb4' -> 63 (C4 = 60)."""
    return 12 * (int(name[-1]) + 1) + PC[name[0]] + name.count("#") - name[1:].count("b")


def bass(bar, beat=0):
    """Contrabass pitch (Ab1..G2) under `beat` of `bar`: the slash bass of the chord name, or else its root."""
    names = CHORDS[bar - 1].split(",")
    name = names[int(beat // 2) if len(names) > 1 else 0].split("/")[-1]
    return 32 + (PC[name[0]] + (name[1:2] == "#") - (name[1:2] == "b") - 32) % 12


def timp(low):
    """Timpani tuning of a bass note: the same note inside G2..F#3."""
    return 43 + (low - 43) % 12


def line(bar, text, v0, v1, up=0, gate=.92):
    """Notes of 'D4:1.5 A3:.5 D4+F4:1 -:1' (pitch[+pitch]:beats, '-' is a rest) from the start of `bar`, `up` semitones
    higher. Velocity runs from v0 to v1 along the phrase, with a small metric accent so that no two notes sit flat."""
    tokens = [token.split(":") for token in text.split()]
    total = sum(float(beats) for _, beats in tokens)
    notes, t = [], 0.0
    for names, beats in tokens:
        if names != "-":
            vel = v0 + (v1 - v0) * t / total + (4 if t % 4 == 0 else 2 if t % 2 == 0 else -3 if t % 1 else 0)
            notes += [(at(bar, t), float(beats) * gate, pitch(name) + up, min(127, round(vel))) for name in names.split("+")]
        t += float(beats)
    return notes


def roll(start, end, step, note, v0, v1):
    """Repeated strokes from beat `start` up to `end`, `step` beats apart, velocity growing from v0 to v1."""
    count = round((end - start) / step)
    return [(start + i * step, step * .9, note, round(v0 + (v1 - v0) * i / max(count - 1, 1))) for i in range(count)]


def drumroll(rng, start, end, note, v0, v1):
    """A roll in thirty-seconds from beat `start` up to `end` as two hands play it: the swell grows by equal steps of
    loudness, the second hand is softer, and each stroke lands up to 8 ms and 2 velocity steps off. The strokes on
    the eighths keep their place (a kick can meet them there); .09 is short enough for a late stroke to end before
    an early one starts."""
    count = round((end - start) * 8)
    return [(start + i / 8 + (rng.uniform(-.012, .012) if i % 4 else 0), .09, note,
             min(80, round(v0 * (v1 / v0) ** (i / (count - 1)) - 3 * (i % 2) + rng.uniform(-2, 2))))
            for i in range(count)]


def build(hot):
    """The main theme or, when hot, the intense variation: the same 60 bars, harmony and motif, played faster, with
    the string chords as a pulse in eighths instead of held, horn pads under them from the first theme on, a galloping
    low-string figure in sixteenths, busier drums and no quiet bars (only the two beats of silence before the return
    stay). Returns the song and the notes of the motif by part, which the checks compare with the rest."""
    s = Song(bpm=100 if hot else 90, bars=BARS)
    rng = random.Random(BARS)  # seeded here: the rolls come out the same on every build, whichever version runs first
    cut = at(BRIDGE + 7, 2)  # everything stops here: two beats of silence before the return

    def level(bar):  # a soft pedal at the edges, growing through the bridge, strongest at the return
        v = 56 if bar < THEME else 64 if bar < BRASS else 70 if bar < BRIDGE else 50 + 4 * (bar - BRIDGE) if bar < RETURN else 72
        return (58 if bar >= CODA else v) + 6 * hot + bar // 2 % 2 * 3

    # the notes of the motif: in the strings and an octave below in the horns, at .7 of the bass that sounds under it
    motif = {"strings hi": [], "horns": []}
    for bar, text in MOTIF.items():
        v = round(.7 * level(bar))
        motif["strings hi"] += line(bar, text, v, v)
        motif["horns"] += line(bar, text, v, v, up=-12)

    # strings hi: the chords, held (a pulse in eighths when hot). Every pad note under F4 goes an octave up, which
    # leaves the octave below to the motif
    hi = line(THEME, PAD_PEDAL, 58, 62, gate=.98) + line(THEME + 8, PAD_OPEN, 60, 64, gate=.98)
    hi += line(RETURN, PAD_PEDAL, 64, 68, gate=.98) + line(RETURN + 8, PAD_CLOSE, 66, 70, gate=.98)
    hi = [(beat, length, note + 12 * (note < 65), vel) for beat, length, note, vel in hi]
    if hot:
        hi = [(beat + i / 2, .4, note, vel + 6 - 5 * (i % 2)) for beat, length, note, vel in hi for i in range(round(2 * length))]
    hi += motif["strings hi"]

    def gallop(bar, vel, fill=False):
        """One bar of the low-string figure an octave above the bass: long-short-short, twice as fast when hot."""
        unit = 1 if hot else 2
        notes = [(at(bar, (k + off) * unit), length * unit * .8, bass(bar, (k + off) * unit) + 12, vel + accent)
                 for k in range(4 // unit) for off, length, accent in ((0, .5, 6), (.5, .25, -6), (.75, .25, -3))]
        if fill:  # added to the figure, not in its place: the D stays under the second
            beat, length, note, v = notes[-2]
            notes.append((beat, length, note + 1, v + 4))
        return notes

    # strings lo: the pedal an octave above the bass, as a held note, a gallop or a measured tremolo. It never leaves
    # while the bass sounds (small speakers hear the bass through it): the pickups of bars 4 and 60 move under it
    low = [n for bar in range(THEME, BRASS) for n in gallop(bar, 60 + 6 * (bar >= THEME + 8) + 6 * hot, bar in FILLS)]
    low += [n for bar in range(RETURN, CODA) for n in gallop(bar, 68 + 6 * hot, bar in FILLS)]
    if hot:
        low += [n for bar in (1, 2, 3, 4, 57, 58, 59, 60) for n in gallop(bar, 52 + 4 * (bar % 4 or 4))]
        low += roll(at(BRIDGE), at(BRIDGE + 2), .5, 45, 50, 60) + roll(at(BRIDGE + 2), cut, .25, 45, 58, 88)
        low += line(BARS, "A2:.5 A2:.5 A2:.5 A2:.5 A2:.5 Bb2:.5 C#3:.5 C#3:.5", 62, 90)
    else:
        low += [(at(1), 7.8, 50, 54), (at(3), 7.8, 50, 58)] + line(4, "-:3 A2:.5 C3:.5", 58, 64)
        low += [(at(BRIDGE), 7.8, 45, 48)] + roll(at(BRIDGE + 2), at(BRIDGE + 4), .5, 45, 48, 58)
        low += roll(at(BRIDGE + 4), cut, .25, 45, 56, 80)
        low += [(at(CODA), 7.8, 50, 56), (at(CODA + 2), 7.8, 50, 50)]
        low += line(BARS, "A2:1 A2:1 A2:.5 Bb2:.5 C#3:1", 50, 80)  # Bb to C#: the harmonic-minor step, back into bar 1

    # contrabass: the form moves in two-bar units; a note that lasts the unit is held and bowed again on the next
    deep = []
    for bar in range(1, BARS, 2):
        if len({bass(b, beat) for b in (bar, bar + 1) for beat in (0, 2)}) == 1:
            deep.append((at(bar), 6 if bar == BRIDGE + 6 else 8, bass(bar), level(bar)))
            continue
        for b in (bar, bar + 1):
            if bass(b, 0) != bass(b, 2):
                deep += [(at(b), 1.9, bass(b, 0), level(b)), (at(b, 2), 1.9, bass(b, 2), level(b) - 4)]
            elif BRASS <= b < BRIDGE:
                deep.append((at(b), 3.9, bass(b), level(b)))  # the horn pulse moves above it
            else:
                deep += [(at(b), 2.8, bass(b), level(b)), (at(b, 3), .9, bass(b), level(b) - 8)]

    # horns: in the brass block a low pulse on every beat (fading in its last bar). After each of the motif's two
    # turns there they hold the chord, then Dm-Cm-Bb with the upper voices rising against the falling bass (no parallel
    # fifths or octaves with it); pads under the string chords from the return on (from the first theme on when hot)
    horn = [(at(bar, beat), .7, bass(bar) + 12, (70, 56, 64, 54)[beat] + bar % 2 * 3 - 5 * beat * (bar == BRIDGE - 1))
            for bar in range(BRASS, BRIDGE) for beat in range(4)]
    horn += line(BRASS + 2, "Bb3+G4:8 -:8 C4+Eb4:8 A3+F4:4 C4+G4:4 D4+Bb4:6", 58, 68, gate=.98)
    horn += line(RETURN, PAD_PEDAL, 58, 64, gate=.98) + line(RETURN + 8, PAD_CLOSE, 60, 70, gate=.98)
    if hot:
        horn += line(BRIDGE + 4, "C#4+G4:4 C#4+G4:4 C#4+G4:4 C#4+G4:2 -:2", 60, 88)
        horn += line(THEME, PAD_PEDAL, 54, 60, gate=.98) + line(THEME + 8, PAD_OPEN, 56, 64, gate=.98)
        horn = [(beat, length, note, vel + 4) for beat, length, note, vel in horn]  # louder with everything else
    else:
        horn += line(BRIDGE + 6, "C#4+G4:4 C#4+G4:2 -:2", 72, 84)  # the other tritone of A7b5, around the motif's A-Eb
    horn += motif["horns"]

    # choir: whispered; the fifth D-A lifts a semitone and sinks back, later the motif's semitone sounds as a cluster
    if hot:
        choir = line(INTRO, "A3+D4:4 A3+D4:4 Bb3+Eb4:4 A3+D4:4", 54, 62, gate=.98)
        choir += line(BRIDGE, "A3+Bb3:8 A3+Bb3:8 A3+Bb3+C#4:8", 50, 68, gate=.98)
    else:
        choir = line(INTRO + 1, "A3+D4:4 Bb3+Eb4:4 A3+D4:3.5", 42, 48, gate=.98)
        choir += line(THEME + 8, PAD_OPEN, 38, 46, gate=.98)
        choir += line(BRIDGE + 1, "A3+Bb3:4 A3+Bb3:8 A3+Bb3+C#4:8", 40, 60, gate=.98)
    choir += line(CODA, "D4:3 A3:1 D4:2 Eb4:2 D4:4 C#4:4", 52 + 8 * hot, 44 + 8 * hot, gate=.98)  # the motif at half speed

    # bell: one low D with its octave; across the bridge it tolls every six beats, against the bar
    tolls = [(1, 0, 118), (3, 0, 100), (5, 0, 108), (9, 0, 92), (13, 0, 104), (17, 0, 92), (21, 0, 110), (29, 0, 104),
             (33, 0, 112), (34, 2, 96), (36, 0, 100), (37, 2, 104), (39, 0, 116),
             (41, 0, 118), (45, 0, 96), (49, 0, 112), (53, 0, 96), (57, 0, 110), (59, 0, 94)]
    if hot:
        tolls += [(2, 0, 100), (4, 0, 104), (58, 0, 100), (60, 0, 104)]
    bell = [(at(bar, beat), 4, note, vel - soft) for bar, beat, vel in tolls for note, soft in ((50, 0), (62, 18))]

    # timpani: a stroke when the bass lands on a new note and on every odd bar of a pedal
    tim = []
    for bar in list(range(THEME, BRASS)) + list(range(RETURN, CODA)):
        for beat in (0, 2):
            before = bass(bar, 0) if beat else bass(bar - 1, 3)
            if bass(bar, beat) != before or beat == 0 and bar % 2:
                tim.append((at(bar, beat), 1, timp(bass(bar, beat)), 62 + 4 * (bar % 4 == 1) + 4 * hot))
        if bar in PICKUPS:
            tim += [(at(bar, 3), .5, 45, 50), (at(bar, 3.5), .5, 45, 56)]
    for bar in range(BRASS, BRIDGE):  # the pulse of the brass block: it gives the slow low horn its attack
        for beat, vel in enumerate((60, 42, 52, 42)):
            tim.append((at(bar, beat), .5, timp(bass(bar)), vel + bar % 3 - 5 * beat * (bar == BRIDGE - 1)))
            if hot:
                tim.append((at(bar, beat + .5), .5, timp(bass(bar)), 38 + bar % 3))
    b = at(BRIDGE)
    if hot:
        tim += roll(b, b + 8, 2, 45, 50, 56) + roll(b + 8, b + 16, 1, 45, 56, 64) + roll(b + 16, b + 24, .5, 45, 60, 70)
        tim += roll(b + 24, b + 28, .25, 45, 56, 64)
        for bar in (1, 2, 3, 4, 57, 58, 59):
            tim += [(at(bar), 1, 50, 70 - 6 * (bar % 2 == 0)), (at(bar, 3), .5, 45, 52), (at(bar, 3.5), .5, 45, 58)]
    else:
        tim += roll(b + 8, b + 16, 2, 45, 44, 52) + roll(b + 16, b + 24, 1, 45, 54, 62) + roll(b + 24, b + 28, .5, 45, 56, 64)
        tim += [(at(1), 1, 38, 74), (at(4, 2), .5, 45, 46), (at(4, 3), .5, 45, 54), (at(4, 3.5), .5, 45, 60)]
        tim += [(at(CODA), 1, 38, 66), (at(CODA + 2), 1, 38, 54)]  # the low D only where no kick sits under it
    # rolls into the silence and into bar 1, kept soft: thirty-second strokes pile up and were the loudest peak of the piece
    tim += drumroll(rng, b + 28, cut, 45, 50, 66) + drumroll(rng, at(BARS), at(BARS + 1), 45, 30 + 6 * hot, 62)

    kit = []

    def hit(bar, strokes):  # every stroke moves a little (-2..+2) so no velocity repeats flat
        kit.extend((at(bar, beat), 4 if drum == CRASH else .25, drum, vel + 4 * hot + (bar * 3 + round(beat * 4)) % 5 - 2)
                   for beat, drum, vel in strokes)

    for bar in list(range(THEME, BRASS)) + list(range(RETURN, CODA)):
        if bar < THEME + 8 and not hot:
            hit(bar, [(0, KICK, 62 - 8 * (bar % 2 == 0))])  # first statement: one stroke a bar, space between hits
            continue
        hit(bar, FILL if bar % 4 == 0 else MARCH)
        if bar >= RETURN + 8 or hot and bar >= THEME + 8:
            hit(bar, DRIVE)
    for bar in range(BRASS, BRIDGE):
        hit(bar, [(0, KICK, 62), (2, KICK, 52)] + [(3 + i / 4, SNARE, 40 + 6 * i) for i in range(4) if hot or bar % 2 == 0])
    for bar, vel in ((BRASS, 54), (BRASS + 8, 60), (RETURN, 58), (RETURN + 8, 62)):
        hit(bar, [(0, CRASH, vel)])
    for bar in range(BRIDGE if hot else BRIDGE + 4, RETURN):
        hit(bar, [(0, KICK, 46 + 3 * (bar - BRIDGE))])  # a heartbeat that grows
    kit += drumroll(rng, at(BRIDGE + 6, 2), cut, SNARE, 30, 64)
    if hot:
        for bar in range(INTRO, THEME):
            hit(bar, [(0, KICK, 54 + 2 * bar)])
        for bar in range(CODA, BARS):
            hit(bar, MARCH)
        hit(BARS, [(0, KICK, 60)])
        kit += drumroll(rng, at(4, 2), at(5), SNARE, 30, 58) + drumroll(rng, at(BARS, 2), at(BARS + 1), SNARE, 30, 62)

    # two low drums on one tick popped small speakers: where a kick lands, the timpani steps back to 60% of it
    kicks = {round(beat * PPQ): vel for beat, _, drum, vel in kit if drum == KICK}
    tim = [(beat, length, note, round(.6 * kicks.get(round(beat * PPQ), 0)) or vel) for beat, length, note, vel in tim]

    for channel, (part, notes) in enumerate(zip(PARTS, (hi, low, deep, horn, choir, bell, tim))):
        s.add(channel, part[1], notes, part[2], part[3])
    s.drum(kit, PARTS[-1][2])
    return s, motif


def levels(ogg):
    """Mean and peak level of a file in dB, from ffmpeg's volumedetect."""
    log = subprocess.run(["ffmpeg", "-hide_banner", "-i", ogg, "-af", "volumedetect", "-f", "null", "-"],
                         capture_output=True, text=True).stderr
    return tuple(float(re.search(rf"{key}_volume: (-?[\d.]+) dB", log).group(1)) for key in ("mean", "max"))


def from_return(song):
    """`song` started at the return. psx.render filters the loop from a cold start, which bent the first samples and
    left a step of 0.09 of full scale at the loop point of the main theme. Started after the two beats of silence,
    the cold start meets silence and bar 60 plays into bar 1 like any other bar line; finish() turns the audio back."""
    turned = Song(song.bpm, song.bars)
    turned.parts = [(channel, program, volume, pan,
                     [((beat - at(RETURN)) % (4 * BARS), length, note, vel) for beat, length, note, vel in notes])
                    for channel, program, volume, pan, notes in song.parts]
    return turned


def pcm(path):
    """Samples of an audio file as a float array of (frames, 2); a warning from the decoder stops the run."""
    out = subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "warning", "-i", path, "-f", "f32le", "-"],
                         capture_output=True, check=True)
    assert not out.stderr, out.stderr.decode()
    return np.frombuffer(out.stdout, dtype=np.float32).reshape(-1, 2)


def finish(turned, ogg, lead):
    """Write `turned` as `ogg` with its first `lead` samples moved to the end, so that the file starts at bar 1, and
    quieter: psx.render leaves the peak near -0.9 dB, the guardrail is -2 dB. Encoding raw samples also gives the file
    clean timestamps (encoding from the .ogg left jumps in them that ffmpeg warned about)."""
    audio = np.roll(pcm(turned), -lead, axis=0).tobytes()
    gain = PEAK_DB - levels(turned)[1]
    for _ in range(4):  # Vorbis moves a peak by up to a dB: correct the gain from the measured result, same source
        subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-f", "f32le", "-ar", str(SR), "-ac", "2", "-i", "-",
                        "-af", f"volume={gain:.2f}dB", "-c:a", "libvorbis", "-q:a", "4", ogg], input=audio, check=True)
        over = levels(ogg)[1] - PEAK_DB
        if over <= .5:
            break
        gain -= over


def read_notes(track):
    """(start tick, end tick, pitch, velocity) of every note in a written MIDI track."""
    tick, sounding, notes = 0, {}, []
    for msg in track:
        tick += msg.time
        if msg.type == "note_on" and msg.velocity:
            assert msg.note not in sounding, f"pitch {msg.note} starts again while sounding, beat {tick / PPQ}"
            sounding[msg.note] = (tick, msg.velocity)
        elif msg.type in ("note_on", "note_off"):
            start, vel = sounding.pop(msg.note)
            notes.append((start, tick, msg.note, vel))
    assert not sounding
    return notes


def check(name, song, motif):
    """Check the files as written, not the note lists: ranges, loop length, the motif kept back, mix guardrails, then
    the rendered audio."""
    path = os.path.join(OUT, name)
    secs = BARS * 4 * 60 / song.bpm
    mid = mido.MidiFile(path + ".mid")
    parts = {part[0]: read_notes(track) for part, track in zip(PARTS, mid.tracks, strict=True)}
    print(f"\n{name}: {song.bpm} bpm, {BARS} bars, loop {secs:.3f} s")
    print(f"  {'part':14}{'notes':>6}{'low':>5}{'high':>5}  allowed  velocity")
    for part, _, _, _, low, high in PARTS:
        pitches, vels = [n[2] for n in parts[part]], [n[3] for n in parts[part]]
        print(f"  {part:14}{len(pitches):6}{min(pitches):5}{max(pitches):5}  {low:3}-{high:<3}  {min(vels)}-{max(vels)}")
        assert low <= min(pitches) and max(pitches) <= high, f"{part} leaves its range"
    end = max(n[1] for notes in parts.values() for n in notes)
    assert end == BARS * 4 * PPQ and abs(mid.length - secs) < 1e-3, f"the MIDI ends at beat {end / PPQ}, {mid.length} s"
    rest = (at(RETURN) - 2) * PPQ  # the render starts at the return (from_return): the two beats before it stay silent
    assert not any(a < rest + 2 * PPQ and b > rest for notes in parts.values() for a, b, _, _ in notes), "a note in the silence"
    lead = {(part, round(beat * PPQ), note) for part, notes in motif.items() for beat, _, note, _ in notes}
    soft = [v for part in motif for a, _, p, v in parts[part] if (part, a, p) in lead]
    below = {(a, p) for a, _, p, _ in parts["horns"]}
    assert len(soft) == len(lead), "a note of the motif was not written"
    assert all((a, p - 12) in below for part, a, p in lead if part == "strings hi"), "the motif without its octave in the horns"
    kept = {part: np.mean(soft) / np.mean([v for a, _, p, v in parts[part] if (part, a, p) not in lead])
            for part in ("strings hi", "strings lo", "contrabass", "horns")}  # the chords, the pulse, the bass, the pads
    print(f"  motif: {len(soft)} notes at velocity {min(soft)}-{max(soft)}, mean {np.mean(soft):.1f}: of the mean of the rest of "
          + ", ".join(f"{part} {x:.2f}" for part, x in kept.items()))
    assert all(.7 <= x <= .8 for x in kept.values()), "the motif is not 20 to 30 percent softer than the chords, pulse and bass"
    drums = parts["drums"]
    assert max(n[3] for n in drums + parts["timpani"]) <= 80, "a drum stroke above velocity 80"
    kicks = {n[0]: n[3] for n in drums if n[2] in (35, 36)}
    assert not any(n[0] in kicks for n in drums if n[2] in (41, 43, 45, 47, 48, 50)), "kick and tom on the same stroke"
    share = [n[3] / kicks[n[0]] for n in parts["timpani"] if n[0] in kicks]
    above = parts["strings lo"] + parts["horns"]
    bare = 0  # small speakers hear the bass through its octave: the longest stretch of bass without it, in ticks
    for start, stop, low, _ in parts["contrabass"]:
        t = start
        for a, b in sorted((a, b) for a, b, p, _ in above if p == low + 12 and a < stop and b > start):
            bare, t = max(bare, a - t), max(t, b)
        bare = max(bare, stop - t)
    print(f"  bass without its octave above: {bare / PPQ:g} beat at most | kick and timpani on one tick {len(share)} times,"
          f" timpani at {min(share):.2f}-{max(share):.2f} of the kick")
    assert bare <= PPQ * 3 // 10, "the bass loses its octave above for longer than the rests of the horn pulse (.3 beat)"
    assert max(share) <= .62, "a timpani stroke at more than 60% of the kick it lands on"
    probe = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", path + ".ogg"],
                           capture_output=True, text=True, check=True)
    mean, peak = levels(path + ".ogg")
    x = pcm(path + ".ogg").mean(axis=1)
    edge = SR // 20  # 50 ms on each side of the loop point
    steps = np.abs(np.diff(np.concatenate((x[-edge:], x[:edge]))))
    seam, near = steps[edge - 1], np.delete(steps, edge - 1)
    back = round(at(RETURN) * 60 / song.bpm * SR)  # where finish() joined the two ends of the render
    hush = 20 * np.log10(np.sqrt(np.mean(x[back - round(30 / song.bpm * SR):back] ** 2)))
    print(f"  midi {end / PPQ / 4:g} bars, {mid.length:.3f} s | ogg {float(probe.stdout):.3f} s, {len(x)} samples"
          f" | mean {mean} dB, peak {peak} dB")
    print(f"  loop point: step {seam:.4f}, steps within 50 ms of it up to {near.max():.4f} (median {np.median(near):.4f})"
          f" | join at the return: step {abs(x[back] - x[back - 1]):.4f}, the half beat before it {hush:.1f} dB")
    assert len(x) == round(secs * SR) and abs(float(probe.stdout) - secs) < .05, "the .ogg is not one loop long"
    assert mean > -40 and peak < -2, "silent, or the peak is over the guardrail"
    assert seam <= near.max(), "the loop point clicks: its step is larger than every step around it"
    assert hush < -50, "the cold start of the render no longer falls on silence"


if __name__ == "__main__":
    assert len(CHORDS) == BARS
    for name, hot in (("battle_dark", False), ("battle_dark_intense", True)):
        (song, motif), path = build(hot), os.path.join(OUT, name)
        song.midi().save(path + ".mid")
        turned = render(from_return(song), path + ".turned", soundfont="SGM")
        finish(turned, path + ".ogg", round((BARS + 1 - RETURN) * 4 * 60 / song.bpm * SR))
        os.remove(turned)
        os.remove(path + ".turned.mid")
        twin = io.BytesIO()
        build(hot)[0].midi().save(file=twin)
        with open(path + ".mid", "rb") as written:
            assert written.read() == twin.getvalue(), "two builds differ: something random has no seed"
        check(name, song, motif)
