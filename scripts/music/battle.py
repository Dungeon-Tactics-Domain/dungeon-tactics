"""Battle theme "Iron Dusk": a driving D minor loop for Dungeon Tactics, in the mood of the PS1 tactics battle themes.

Original notes; the mood (low string ostinato, horn and trumpet lead, timpani, snare build) comes from the genre, no tune is copied.
Form (4/4, 132 bpm, 48 bars = 87.3 s):
  1-4   Intro   timpani and low strings, the dominant pulls into the theme
  5-12  A       horn theme over the string ostinato, bass in eights
  13-20 B       lyrical line, horn with a trumpet an octave above
  21-28 Bridge  ostinato drops out, tremolo strings and choir, snare roll into A'
  29-36 A'      theme again, trumpet joins the horn
  37-44 B'      second B, full band
  45-48 Outro   falls through Bb and Gm onto A, which leads into bar 1
Run: python scripts/music/battle.py  (writes battle.mid and battle.ogg in <MUSIC_TOOLS>/battle)
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from psx import TOOLS, Song, render  # noqa: E402

BPM, BARS = 132, 48
OUT = os.path.join(TOOLS, "battle", "battle")

# chord: (bass root, triad)
CHORD = {
    "Dm": (38, [62, 65, 69]), "Bb": (34, [58, 62, 65]), "C": (36, [60, 64, 67]), "Gm": (43, [55, 58, 62]),
    "A": (33, [57, 61, 64]), "F": (41, [57, 60, 65]), "Eb": (39, [55, 58, 63]),
}
A_PART = "Dm Dm Bb C Dm Gm Bb A"
B_PART = "Bb C Dm F Bb C A A"
PROG = ("Dm Dm Bb A " + A_PART + " " + B_PART + " Gm Dm Eb A Gm Dm Bb A " + A_PART + " " + B_PART + " Dm Bb Gm A").split()
assert len(PROG) == BARS

STEP = {"C": 0, "D": 2, "E": 4, "F": 5, "G": 7, "A": 9, "B": 11}


def pitch(name):
    acc = name[1:-1]
    return 12 * (int(name[-1]) + 1) + STEP[name[0]] + acc.count("#") - acc.count("b")


def at(bar, beat=0.0):
    return (bar - 1) * 4 + beat


def line(first_bar, bars, base, shift=0):
    """Bars of "PITCH:BEATS" tokens ("r" = rest); beats must add up to 4. Downbeats lean harder."""
    out = []
    for i, text in enumerate(bars.split("|")):
        b = 0.0
        for tok in text.split():
            name, dur = tok.split(":")
            dur = float(dur)
            if name != "r":
                out.append((at(first_bar + i, b), dur, pitch(name) + shift, base + (8 if b == 0 else 0 if b % 1 == 0 else -4)))
            b += dur
        assert abs(b - 4) < 1e-9, f"bar {first_bar + i} has {b} beats: {text}"
    return out


THEME_A = (
    "D5:1.5 F5:.5 A5:1 G5:.5 F5:.5|E5:1 F5:1 D5:2|D5:1.5 F5:.5 Bb5:1 A5:.5 G5:.5|G5:2 E5:1 C5:1|"
    "F5:1.5 A5:.5 D6:1 C6:.5 A5:.5|A5:1 G5:1 F5:2|G5:1.5 Bb5:.5 D6:1 C6:.5 Bb5:.5|A5:1.5 G5:.5 E5:1 C#5:1"
)
THEME_B = (  # an octave lower than it looks: the horn carries it, the trumpet doubles above
    "D5:2 C5:1 Bb4:1|C5:2 G4:1 E4:1|F4:1 A4:1 D5:2|C5:1.5 A4:.5 F4:1 A4:1|"
    "D5:2 F5:1 D5:.5 C5:.5|E5:1.5 D5:.5 C5:1 G4:1|C#5:1.5 D5:.5 E5:1 F5:.5 E5:.5|E5:2 C#5:1 A4:1"
)
BRIDGE = (
    "G5:3 A5:1|A5:2 F5:1 E5:1|G5:2 Bb5:1 G5:1|E5:2 C#5:1 E5:1|"
    "Bb5:2 D6:2|A5:2 D6:2|D6:1.5 C6:.5 Bb5:1 D6:1|E6:2 C#6:1 E6:1"
)
OUTRO = "D6:2 A5:2|Bb5:2 F5:2|G5:2 D5:2|A5:3 r:1"

horn = line(5, THEME_A, 78) + line(13, THEME_B, 80) + line(29, THEME_A, 84) + line(37, THEME_B, 86) + line(45, OUTRO, 74)
trumpet = line(29, THEME_A, 58) + line(13, THEME_B, 56, 12) + line(37, THEME_B, 64, 12)
choir = line(21, BRIDGE, 62)

strings, pad, bass, timp = [], [], [], []
for bar in range(1, BARS + 1):
    root, triad = CHORD[PROG[bar - 1]]
    intro, bridge, outro = bar <= 4, 21 <= bar <= 28, bar >= 45
    if not (intro or bridge):  # eighth-note string ostinato (power-chord fifths, no third: stays ambiguous)
        for k, off in enumerate([0, 0, 7, 0, 0, 7, 0, 12]):
            strings.append((at(bar, k / 2), 0.42, root + 24 + off, 60 + (10 if k % 4 == 0 else 0) + (6 if bar >= 29 else 0)))
    else:
        strings.append((at(bar), 4, root + 12, 58))  # low sustained line
    for p in triad:
        pad.append((at(bar), 4, p, 50 if not bridge else 62))
    if intro or bridge:  # half-note bass
        bass += [(at(bar), 2, root, 80), (at(bar, 2), 2, root + (7 if bar % 2 else 0), 70)]
    else:
        for k, off in enumerate([0, 0, 12, 0, 0, 12, 0, 7]):
            bass.append((at(bar, k / 2), 0.45, root + off, 84 if k % 4 == 0 else 70))
    timp.append((at(bar), 1.5, root + (12 if root < 38 else 0), 92))
    if not (intro or bridge):
        timp.append((at(bar, 2.5), 1.0, root + (12 if root < 38 else 0), 70))

# drums (GM kit): kick 36, snare 38, closed hat 42, crash 49, toms 41/45/47/48
drums = []
KICK, SNARE, HAT, CRASH = 36, 38, 42, 49


def hit(bar, beat, note, v):
    drums.append((at(bar, beat), 0.25, note, v))


for bar in range(1, BARS + 1):
    intro, bridge, outro = bar <= 4, 21 <= bar <= 28, bar >= 45
    if bar in (5, 13, 29, 37) or (bar == 21 and False):
        hit(bar, 0, CRASH, 90)
    if intro or outro:
        hit(bar, 0, KICK, 90)
        hit(bar, 2, KICK, 80)
        if bar % 2 == 0:
            hit(bar, 3, SNARE, 70)
    elif bridge:
        hit(bar, 0, KICK, 70)
        hit(bar, 2, 41, 70)
        if bar == 27:
            for k in range(8):
                hit(bar, 2 + k / 4, SNARE, 40 + k * 6)
        if bar == 28:
            for k in range(16):
                hit(bar, k / 4, SNARE, 50 + k * 4)
    else:
        for k in range(8):
            hit(bar, k / 2, HAT, 50 if k % 2 == 0 else 34)
        hit(bar, 0, KICK, 100)
        hit(bar, 2, KICK, 92)
        hit(bar, 1, SNARE, 96)
        hit(bar, 3, SNARE, 96)
        if bar % 2 == 1:
            hit(bar, 3.5, KICK, 80)
hit(29, 0, CRASH, 100)
for k, n in enumerate([48, 48, 47, 47, 45, 45, 41, 41]):  # tom fill into the loop point
    hit(48, 2 + k / 4, n, 70 + k * 4)

PARTS = {  # name: (channel, GM program 0-based, volume, pan, notes)
    "horn": (0, 60, 100, 50, horn),
    "trumpet": (1, 56, 90, 78, trumpet),
    "strings": (2, 48, 96, 36, strings),
    "pad": (3, 49, 74, 66, pad),
    "bass": (4, 33, 100, 64, bass),
    "timpani": (5, 47, 100, 64, timp),
    "choir": (6, 52, 88, 64, choir),
}


def checks():
    end = BARS * 4
    for name, (_, _, _, _, notes) in list(PARTS.items()) + [("drums", (9, 0, 0, 0, drums))]:
        for t, n, p, v in notes:
            assert n > 0.01 and 0 <= p < 128 and 1 <= v <= 127 and t >= 0 and t + n <= end + 1e-9, (name, t, n, p, v)
        ps = [p for _, _, p, _ in notes]
        print(f"{name:8} notes {len(notes):4}  pitch {min(ps):3}-{max(ps):3}")
    print(f"bars {BARS}, loop length {end * 60 / BPM:.2f} s")


checks()
song = Song(bpm=BPM, bars=BARS)
for name, (ch, prog, vol, pan, notes) in PARTS.items():
    song.add(channel=ch, program=prog, notes=sorted(notes), volume=vol, pan=pan)
song.drum(sorted(drums), volume=100)
os.makedirs(os.path.dirname(OUT), exist_ok=True)
print("wrote", render(song, OUT, soundfont="MuseScore_General"))
