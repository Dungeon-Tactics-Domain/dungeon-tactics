"""Slot F: "Hollow Pasture", an original loop for Dungeon Tactics.

E minor, 80 bpm, 44 bars (132 s). Form: intro (1-8, guitar, strings, bass), theme (9-16, flute),
contrast (17-24, kalimba, flute motif in a new harmony), return (25-32, theme again), coda (33-44,
motif fragments, then a tonic cadence in bar 44 that leads back to bar 1).
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from psx import Song, render  # noqa: E402

BPM = 80
BARS = 44
OUT = r"D:\Projetos\_musica-tools\eval\slot_F"

CHORD = {
    "Em": [64, 67, 71],
    "C": [60, 64, 67],
    "G": [59, 62, 67],
    "D": [62, 66, 69],
    "Am": [57, 60, 64],
    "Dm": [62, 65, 69],
    "E": [64, 68, 71],
}
EMCGD = ["Em", "C", "G", "D"] * 2
AMGDE = ["Am", "G", "Dm", "E"] * 2
PROG = EMCGD + EMCGD + AMGDE + EMCGD + EMCGD + ["Em", "C", "G", "Em"]
assert len(PROG) == BARS

# Theme: (beat in bar, length, pitch, velocity), one list per bar, bars 9-16 and 25-32.
THEME = [
    [(0, 1.5, 76, 86), (1.5, 0.5, 79, 76), (2, 1, 83, 86), (3, 1, 81, 80)],
    [(0, 2, 79, 86), (2, 1, 76, 80), (3, 1, 72, 78)],
    [(0, 1, 74, 80), (1, 1, 79, 80), (2, 2, 83, 88)],
    [(0, 1, 81, 84), (1, 1, 78, 76), (2, 1, 74, 80), (3, 1, 69, 78)],
    [(0, 2, 76, 86), (2, 2, 71, 80)],
    [(0, 1, 72, 78), (1, 1, 76, 80), (2, 2, 79, 88)],
    [(0, 1, 79, 80), (1, 1, 78, 76), (2, 1, 76, 80), (3, 1, 74, 78)],
    [(0, 3, 74, 84), (3, 1, 71, 76)],
]
# Contrast: bars 17-24, a rising answer over Am G Dm E.
CONTRAST = [
    [(0, 1, 81, 84), (1, 1, 84, 86), (2, 1, 88, 90), (3, 1, 84, 80)],
    [(0, 2, 83, 86), (2, 2, 79, 82)],
    [(0, 1, 77, 82), (1, 1, 81, 84), (2, 2, 84, 88)],
    [(0, 1, 83, 86), (1, 1, 80, 80), (2, 2, 76, 84)],
    [(0, 2, 84, 88), (2, 2, 81, 84)],
    [(0, 1, 79, 80), (1, 1, 83, 84), (2, 1, 86, 88), (3, 1, 83, 80)],
    [(0, 2, 84, 88), (2, 2, 81, 84)],
    [(0, 3, 83, 86), (3, 1, 80, 80)],
]

guitar, flute, strings, bass, kalimba, drums = [], [], [], [], [], []
SEQ = [0, 2, 1, 3, 0, 2, 1, 2]  # index into chord; 3 = root an octave up

for bar in range(1, BARS + 1):
    ch = CHORD[PROG[bar - 1]]
    t0 = (bar - 1) * 4
    intro = bar <= 8
    # guitar arpeggio, eighths, accents on the bar's downbeats
    for i, idx in enumerate(SEQ):
        pitch = ch[idx] if idx < 3 else ch[0] + 12
        guitar.append((t0 + i * 0.5, 0.45, pitch, (60 if intro else 74) + (10 if i % 4 == 0 else 0)))
    # strings: the chord held, an octave down
    for p in ch:
        strings.append((t0, 4, p - 12, 40 if intro else 50))
    # bass: root and fifth; a single held root in the coda
    root = ch[0] - 24
    if bar >= 41:
        bass.append((t0, 4, root, 72))
    else:
        bass.append((t0, 2, root, 80))
        bass.append((t0 + 2, 2, root + 7, 70))
    if 17 <= bar <= 24:
        for i in range(4):
            kalimba.append((t0 + i, 0.8, ch[i % 3] + 12, 62))

for start, src in [(9, THEME), (25, THEME), (17, CONTRAST)]:
    for k, bar_notes in enumerate(src):
        t0 = (start - 1 + k) * 4
        flute.extend((t0 + b, l, p, v) for b, l, p, v in bar_notes)
# coda: the opening two bars of the theme come back at bars 33-34 and 37-38
for start in (33, 37):
    for k in range(2):
        t0 = (start - 1 + k) * 4
        flute.extend((t0 + b, l, p, v) for b, l, p, v in THEME[k])

# drums: shaker from bar 5 to 40, tambourine on 2 and 4 in the theme and return, light conga in the contrast
for bar in range(1, BARS + 1):
    t0 = (bar - 1) * 4
    if 5 <= bar <= 40:
        for i in range(8):
            drums.append((t0 + i * 0.5, 0.25, 70, 44 if i % 2 == 0 else 58))
    if 9 <= bar <= 32 and bar not in range(17, 25):
        drums.append((t0 + 1, 0.25, 54, 56))
        drums.append((t0 + 3, 0.25, 54, 56))
    if 17 <= bar <= 24:
        for b in (0, 1.5, 3):
            drums.append((t0 + b, 0.4, 64, 66))
    if bar in (9, 17, 25, 33):
        drums.append((t0, 0.5, 36, 60))

s = Song(bpm=BPM, bars=BARS)
s.add(channel=0, program=24, notes=guitar, volume=90, pan=50)     # nylon guitar
s.add(channel=1, program=73, notes=flute, volume=100, pan=72)     # flute, lead
s.add(channel=2, program=48, notes=strings, volume=80, pan=40)    # strings pad
s.add(channel=3, program=32, notes=bass, volume=100, pan=64)      # acoustic bass
s.add(channel=4, program=108, notes=kalimba, volume=90, pan=90)   # kalimba, contrast only
s.drum(drums, volume=90)

# checks: note ranges, last note inside the loop, length = bars * 4 beats at bpm
total_beats = BARS * s.bpb
for ch_, prog, vol, pan, notes in s.parts:
    pitches = [n[2] for n in notes]
    vels = [n[3] for n in notes]
    assert all(0 <= p <= 127 for p in pitches) and all(1 <= v <= 127 for v in vels)
    assert max(b + l for b, l, _, _ in notes) <= total_beats + 1e-9, f"note past the loop in channel {ch_}"
    print(f"channel {ch_:2d} program {prog:3d}: {len(notes):4d} notes, pitch {min(pitches)}-{max(pitches)}")
print(f"length: {total_beats * 60 / BPM:.1f} s over {BARS} bars at {BPM} bpm")

print("wrote", render(s, OUT, soundfont="MuseScore_General"))
