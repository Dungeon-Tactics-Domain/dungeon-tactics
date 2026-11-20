"""Battle loop, slot B: D minor, 116 bpm, 40 bars (about 82.8 s), loops back to bar 0.

Form (bar numbers, 0-based):
  0-3    intro: strings pads, sustained bass, timpani in the last bar
  4-11   theme A: brass states the motif over a walking bass
  12-19  contrast B: strings lead in Bb / Gm / F / C, lighter drums
  20-27  bridge: driving eighth-note bass, timpani and snare roll building to bar 27
  28-35  return A': theme an octave up, with crash and full kit
  36-39  outro: D minor cadence, last bar leads back to bar 0
"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))
from psx import Song, render  # noqa: E402

BPM = 116
BARS = 40
OUT = r"D:\Projetos\_musica-tools\eval\battle\slot_B"

BASS_ROOT = {"C": 36, "D": 38, "Eb": 39, "F": 41, "G": 43, "A": 45, "Bb": 46}

CH_INTRO = ["Dm", "Dm", "Bb", "A"]
CH_A = ["Dm", "Dm", "Bb", "Bb", "Gm", "A", "Dm", "A"]
CH_B = ["Bb", "Bb", "Gm", "Gm", "F", "F", "C", "C"]
CH_BR = ["Dm", "Dm", "Eb", "Eb", "Gm", "Gm", "A", "A"]
CH_OUT = ["Dm", "Dm", "A", "Dm"]
CHORDS = CH_INTRO + CH_A + CH_B + CH_BR + CH_A + CH_OUT
assert len(CHORDS) == BARS

# theme motif, one list of (beat, length, pitch, velocity) per bar, beats counted inside the bar
THEME = [
    [(0, 1.5, 69, 96), (1.5, 0.5, 67, 90), (2, 1, 65, 94), (3, 1, 62, 96)],
    [(0, 1, 64, 92), (1, 0.5, 65, 92), (1.5, 0.5, 67, 94), (2, 2, 69, 100)],
    [(0, 1, 70, 98), (1, 1, 69, 94), (2, 1, 67, 92), (3, 1, 65, 90)],
    [(0, 2, 62, 100), (2, 1, 64, 92), (3, 1, 65, 92)],
    [(0, 1, 67, 96), (1, 1, 70, 98), (2, 1, 74, 100), (3, 1, 72, 94)],
    [(0, 1, 71, 100), (1, 1, 69, 96), (2, 2, 73, 100)],
    [(0, 1, 74, 104), (1, 1, 72, 98), (2, 1, 70, 96), (3, 1, 69, 94)],
    [(0, 3, 71, 100), (3, 1, 69, 92)],
]
# contrast line for the strings in section B
LEAD_B = [
    [(0, 2, 65, 80), (2, 2, 62, 78)],
    [(0, 1, 67, 80), (1, 1, 70, 82), (2, 2, 69, 84)],
    [(0, 2, 67, 80), (2, 2, 70, 84)],
    [(0, 1, 74, 86), (1, 1, 72, 82), (2, 2, 70, 84)],
    [(0, 2, 65, 80), (2, 2, 67, 84)],
    [(0, 1, 69, 82), (1, 1, 65, 80), (2, 2, 64, 84)],
    [(0, 2, 67, 84), (2, 2, 72, 88)],
    [(0, 4, 72, 86)],
]


def root_of(chord):
    return BASS_ROOT[chord[:-1] if chord.endswith("m") else chord]


def triad(chord):
    """Pad voicing in the low strings register; the minor third follows the chord name."""
    b = root_of(chord) + 12
    third = b + (3 if chord.endswith("m") else 4)
    return [b, third, b + 7]


def place(section_start, bars_notes, shift=0):
    out = []
    for i, notes in enumerate(bars_notes):
        for beat, length, pitch, vel in notes:
            out.append(((section_start + i) * 4 + beat, length, pitch + shift, vel))
    return out


def walk_bass(bar, chord, vel=100):
    r = root_of(chord)
    return [(bar * 4 + 0, 1, r, vel), (bar * 4 + 1, 1, r, vel - 12),
            (bar * 4 + 2, 1, r + 7, vel - 6), (bar * 4 + 3, 1, r, vel - 14)]


def drive_bass(bar, chord):
    r = root_of(chord)
    notes = []
    for k in range(8):
        notes.append((bar * 4 + k * 0.5, 0.5, r + (12 if k % 2 else 0), 92 if k % 2 == 0 else 78))
    return notes


def kit(bar, mode):
    """Drum pattern per section mode: hats only, groove, light, full, or drive (roll and toms)."""
    notes = []
    t = bar * 4
    if mode == "intro":
        notes += [(t + k * 0.5, 0.25, 42, 52 if k % 2 else 64) for k in range(8)]
    elif mode == "groove":
        notes += [(t, 0.25, 36, 110), (t + 2, 0.25, 36, 100), (t + 1, 0.25, 38, 104), (t + 3, 0.25, 38, 104)]
        notes += [(t + k * 0.5, 0.25, 42, 60 if k % 2 else 74) for k in range(8)]
    elif mode == "light":
        notes += [(t, 0.25, 36, 96), (t + 2, 0.25, 36, 90), (t + 3, 0.25, 38, 86)]
        notes += [(t + k * 0.5, 0.25, 42, 56) for k in range(8)]
    elif mode == "drive":
        notes += [(t + k * 0.5, 0.25, 42, 70) for k in range(8)]
        notes += [(t, 0.25, 36, 110), (t + 2, 0.25, 36, 104), (t + 1, 0.25, 38, 100), (t + 3, 0.25, 38, 100)]
        if bar >= 26:  # snare roll: 16ths ramping up
            notes += [(t + k * 0.25, 0.2, 38, 60 + 4 * k) for k in range(16)]
    return notes


def build():
    s = Song(bpm=BPM, bars=BARS)
    bass, pads, lead, brass, timp = [], [], [], [], []
    drums = []

    for bar, chord in enumerate(CHORDS):
        if bar < 4:
            bass += [(bar * 4, 4, root_of(chord), 80)]
            pads += [(bar * 4, 4, p, 70) for p in triad(chord)]
            if bar == 3:
                timp += [(bar * 4 + k * 0.5, 0.5, root_of(chord), 60 + 6 * k) for k in range(8)]
            drums += kit(bar, "intro")
        elif bar < 12:
            bass += walk_bass(bar, chord, 100)
            pads += [(bar * 4, 4, p, 58) for p in triad(chord)]
            drums += kit(bar, "groove")
            if bar in (4, 8):
                drums += [(bar * 4, 0.5, 49, 110)]
        elif bar < 20:
            bass += walk_bass(bar, chord, 96)
            pads += [(bar * 4, 4, p, 76) for p in triad(chord)]
            drums += kit(bar, "light")
        elif bar < 28:
            bass += drive_bass(bar, chord)
            pads += [(bar * 4 + k * 0.5, 0.5, p, 70) for k in range(8) for p in triad(chord)]
            drums += kit(bar, "drive")
            if bar >= 24:
                timp += [(bar * 4 + k * 0.5, 0.5, root_of(chord), 70 + 5 * k) for k in range(8)]
            if bar == 27:
                drums += [(bar * 4 + 2, 0.5, 45, 100), (bar * 4 + 3, 0.5, 47, 104)]
        elif bar < 36:
            bass += walk_bass(bar, chord, 104)
            pads += [(bar * 4, 4, p, 62) for p in triad(chord)]
            drums += kit(bar, "groove")
            if bar == 28:
                drums += [(bar * 4, 0.5, 49, 116)]
            if bar in (28, 32):
                timp += [(bar * 4, 2, root_of(chord), 100)]
        else:
            bass += [(bar * 4, 4, root_of(chord), 90)]
            pads += [(bar * 4, 4, p, 60) for p in triad(chord)]
            drums += kit(bar, "light")
            if bar == 36:
                drums += [(bar * 4, 0.5, 49, 100)]

    # theme A (bars 4-11) on brass, A' (bars 28-35) an octave up
    brass += place(4, THEME)
    brass += place(28, THEME, shift=12)
    # contrast B (bars 12-19) on strings
    lead += place(12, LEAD_B)
    # outro (bars 36-39): the tonic holds in the brass
    brass += [(36 * 4, 4, 62, 96), (37 * 4, 4, 65, 90), (38 * 4, 4, 69, 88), (39 * 4, 4, 62, 94)]

    s.add(channel=0, program=33, notes=bass, volume=110, pan=64)        # acoustic bass
    s.add(channel=1, program=48, notes=pads, volume=85, pan=40)         # string ensemble pads
    s.add(channel=4, program=48, notes=lead, volume=100, pan=84)        # string lead, section B
    s.add(channel=3, program=61, notes=brass, volume=105, pan=56)       # brass section, theme
    s.add(channel=2, program=47, notes=timp, volume=95, pan=64)         # timpani
    s.drum(drums, volume=100)
    return s


def check(s):
    # bar count and length: bars * 4 * 60 / bpm, and the notes fit inside the loop
    assert s.bars == BARS
    length = s.bars * 4 * 60 / s.bpm
    print(f"bars={s.bars} bpm={s.bpm} length={length:.2f}s")
    assert 80 <= length <= 130
    for ch, prog, vol, pan, notes in s.parts:
        for beat, ln, pitch, vel in notes:
            assert 0 <= beat < BARS * 4 and beat + ln <= BARS * 4 + 0.01, (ch, beat)
            assert 0 <= pitch <= 127 and 1 <= vel <= 127, (ch, beat, pitch, vel)
    # bass root under each chord: the bass notes of bar i start on the root of CHORDS[i]
    bass = s.parts[0][4]
    for bar, chord in enumerate(CHORDS):
        first = [n for n in bass if int(n[0] // 4) == bar and n[0] % 4 == 0]
        assert first and first[0][2] % 12 == root_of(chord) % 12, (bar, chord)
    print("checks passed")


if __name__ == "__main__":
    song = build()
    check(song)
    print(render(song, OUT, soundfont="MuseScore_General"))
