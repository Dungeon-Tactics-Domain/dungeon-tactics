"""Slot C: "Hearth Road", a pastoral folk-fantasy loop in D minor (original melody and harmony).

Form (40 bars of 4/4, 76 bpm, 2:06):
  intro 0-3 | A theme 4-11 | A' answer, climbs 12-19 | B lyrical contrast in F major 20-27
  | A'' return, motif sequenced and a flute counter line 28-35 | turnaround 36-39 (ends on A, leads back to bar 0 Dm)
Motif (A D F E D) returns inverted in B, sequenced up in A''.
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from psx import Song, render  # noqa: E402

OUT = r"D:\Projetos\_musica-tools\eval\slot_C"
BPM, BARS = 76, 40
OCARINA, FLUTE, GUITAR, HARP, BASS, STRINGS = 0, 1, 2, 3, 4, 5  # channels

_PC = {"C": 0, "D": 2, "E": 4, "F": 5, "G": 7, "A": 9, "B": 11}


def p(name):
    """'Bb4' -> MIDI 70."""
    n = _PC[name[0]]
    for ch in name[1:-1]:
        n += 1 if ch == "#" else -1
    return n + 12 * (int(name[-1]) + 1)


# chord -> guitar voicing (4 notes); strings use the upper three, harp rolls the same notes an octave up
V = {
    "Dm": [50, 57, 62, 65], "Bb": [53, 58, 62, 65], "Gm": [55, 58, 62, 67], "DmF": [53, 57, 62, 65],
    "FA": [57, 60, 65, 69], "A": [52, 57, 61, 64], "F": [53, 57, 60, 65], "CE": [52, 55, 60, 64],
    "Am": [57, 60, 64, 69],
}
CH_A = ["Dm", "Bb", "Gm", "DmF", "Bb", "FA", "Gm", "A"]
CH_B = ["F", "CE", "Dm", "Am", "Bb", "FA", "Gm", "A"]
CH_I = ["Dm", "Bb", "Gm", "A"]
BASS_A = [38, 46, 43, 41, 46, 45, 43, 45]  # D2 Bb2 G2 F2 Bb2 A2 G2 A2
BASS_B = [41, 40, 38, 45, 46, 45, 43, 45]  # F2 E2 D2 A2 Bb2 A2 G2 A2, stepwise
BASS_I = [38, 46, 43, 45]

# (start bar, chords, bass roots, scale for accompaniment velocity)
SECTIONS = {
    "intro": (0, CH_I, BASS_I, 0.70), "A": (4, CH_A, BASS_A, 0.85), "A2": (12, CH_A, BASS_A, 1.0),
    "B": (20, CH_B, BASS_B, 0.90), "A3": (28, CH_A, BASS_A, 1.05), "outro": (36, CH_I, BASS_I, 0.75),
}

# ---- melodies: per bar a list of (offset, length, pitch name); velocity is added from section + phrase shape ----
LEAD_A = [
    [(0, 1.5, "A4"), (1.5, .5, "D5"), (2, 1, "F5"), (3, .5, "E5"), (3.5, .5, "D5")],
    [(0, 1, "D5"), (1, 1, "C5"), (2, 2, "Bb4")],
    [(0, 1.5, "Bb4"), (1.5, .5, "D5"), (2, 1, "G5"), (3, 1, "F5")],
    [(0, 1, "F5"), (1, .5, "E5"), (1.5, 1.5, "D5")],
    [(0, 1.5, "D5"), (1.5, .5, "Bb4"), (2, 1, "D5"), (3, .5, "C5"), (3.5, .5, "Bb4")],
    [(0, 1, "C5"), (1, 1, "A4"), (2, 1, "C5"), (3, 1, "F5")],
    [(0, 1.5, "G5"), (1.5, .5, "F5"), (2, 1, "D5"), (3, 1, "Bb4")],
    [(0, 1, "C#5"), (1, 1, "E5"), (2, .5, "D5"), (2.5, .5, "C#5"), (3, 1, "A4")],
]
LEAD_A2 = [
    LEAD_A[0],
    [(0, 1, "D5"), (1, .5, "C5"), (1.5, .5, "D5"), (2, 2, "Bb4")],
    LEAD_A[2],
    [(0, 1, "F5"), (1, .5, "E5"), (1.5, .5, "D5"), (2, .5, "E5"), (2.5, .5, "D5"), (3, 1, "F5")],
    [(0, 1.5, "F5"), (1.5, .5, "D5"), (2, 1, "F5"), (3, 1, "G5")],
    [(0, 1.5, "A5"), (1.5, .5, "G5"), (2, 1, "F5"), (3, 1, "C5")],
    [(0, 2, "G5"), (2, 1, "F5"), (3, 1, "D5")],
    [(0, 1.5, "E5"), (1.5, .5, "D5"), (2, 2, "C#5")],
]
LEAD_B = [  # motif inverted (falls a fifth, then climbs), longer notes
    [(0, 1.5, "A5"), (1.5, .5, "E5"), (2, 1, "C5"), (3, .5, "D5"), (3.5, .5, "E5")],
    [(0, 1, "G5"), (1, 1, "E5"), (2, 2, "C5")],
    [(0, 1.5, "D5"), (1.5, .5, "F5"), (2, 1.5, "A5"), (3.5, .5, "G5")],
    [(0, 2, "A5"), (2, 1, "E5"), (3, 1, "C5")],
    [(0, 1, "D5"), (1, 1, "F5"), (2, 2, "Bb5")],
    [(0, 1.5, "A5"), (1.5, .5, "G5"), (2, 1, "F5"), (3, 1, "C5")],
    [(0, 1, "D5"), (1, 1.5, "G5"), (2.5, .5, "F5"), (3, 1, "D5")],
    [(0, 1, "C#5"), (1, 1, "E5"), (2, 1.5, "A5")],
]
LEAD_A3 = [  # motif as an upward arpeggio, then sequenced up a third in bar 5
    [(0, .5, "A4"), (.5, 1, "D5"), (1.5, .5, "F5"), (2, 1.5, "A5"), (3.5, .5, "G5")],
    [(0, 1, "F5"), (1, 1, "D5"), (2, .5, "C5"), (2.5, .5, "D5"), (3, 1, "Bb4")],
    [(0, 1.5, "Bb4"), (1.5, .5, "D5"), (2, 1, "G5"), (3, .5, "A5"), (3.5, .5, "G5")],
    [(0, 1, "F5"), (1, .5, "E5"), (1.5, 1.5, "D5")],
    [(0, .5, "Bb4"), (.5, 1, "D5"), (1.5, .5, "F5"), (2, 1.5, "Bb5"), (3.5, .5, "A5")],
    [(0, 1, "A5"), (1, 1, "G5"), (2, 1, "F5"), (3, 1, "C5")],
    [(0, 1.5, "G5"), (1.5, .5, "F5"), (2, 1, "D5"), (3, 1, "Bb4")],
    [(0, 1, "C#5"), (1, 1, "E5"), (2, .5, "D5"), (2.5, .5, "C#5"), (3, 1, "A4")],
]
# flute counter line under the A'' theme: held notes, a step down at the end
COUNTER_A3 = [(0, 8, "F4"), (8, 8, "D4"), (16, 8, "C4"), (24, 4, "D4"), (28, 4, "C#4")]
LEAD_INTRO = [[], [], [], [(0, 2, "E5"), (2, 1, "C#5")]]
LEAD_OUT = [
    [(0, 1.5, "A4"), (1.5, .5, "D5"), (2, 2, "F5")],
    [(0, 1, "D5"), (1, 1, "C5"), (2, 2, "Bb4")],
    [(0, 2, "Bb4"), (2, 2, "G4")],
    [(0, 1.5, "E5"), (1.5, .5, "C#5"), (2, 1, "A4")],
]

SHAPE = [0, 2, 4, 6, 2, 4, 7, -3]  # velocity arc over an 8-bar phrase


def lead(start_bar, bars, base, shape=SHAPE, ch_notes=None):
    out = []
    for i, notes in enumerate(bars):
        for off, ln, name in notes:
            v = base + shape[i] + (6 if off in (0, 2) else 0)
            out.append((4 * (start_bar + i) + off, ln - 0.05, p(name), min(v, 118)))
    return out


def guitar(sec):
    start, chords, _, sc = SECTIONS[sec]
    out = []
    for i, c in enumerate(chords):
        v, b = V[c], 4 * (start + i)
        if sec == "B":  # syncopated pluck instead of straight eighths
            pat = [(0, 0), (1, 1), (1.5, 2), (2.5, 3), (3, 2), (3.5, 1)]
            vel = [78, 58, 52, 64, 54, 50]
        else:
            seq = [0, 1, 2, 3, 2, 1, 2, 1] if i % 2 == 0 else [0, 2, 1, 2, 3, 2, 1, 2]
            pat = [(k * .5, s) for k, s in enumerate(seq)]
            vel = [78, 54, 62, 56, 68, 54, 62, 54]
        for (off, idx), vv in zip(pat, vel):
            out.append((b + off, min(1.0, 4 - off), v[idx], round(vv * sc)))  # ring, but not into the next chord
    return out


def harp(sec, only_bars=None):
    start, chords, _, sc = SECTIONS[sec]
    out = []
    for i, c in enumerate(chords):
        if only_bars and i not in only_bars:
            continue
        v, b = [n + 12 for n in V[c][1:]], 4 * (start + i)
        for k, n in enumerate(v):
            out.append((b + k * .25, 2.5, n, round((52 + 4 * k) * sc)))
        if sec == "B":  # second, falling roll on beat 3
            for k, n in enumerate(reversed(v)):
                out.append((b + 2 + k * .25, 1.5, n, round(40 * sc)))
    return out


def bass(sec, only_bars=None):
    start, _, roots, sc = SECTIONS[sec]
    out = []
    for i, r in enumerate(roots):
        if only_bars and i not in only_bars:
            continue
        b = 4 * (start + i)
        if sec in ("A", "B"):
            pat = [(0, r, 1.5, 80), (2.5, r + 7, 1.0, 62)] if sec == "A" else [(0, r, 2.0, 78), (2, r + 7, 1.5, 60)]
        elif sec in ("A2", "A3"):
            pat = [(0, r, 1.0, 82), (1.5, r + 12, .5, 56), (2.5, r + 7, .75, 64), (3.5, r + 7, .4, 50)]
        else:  # intro / outro: one long note
            pat = [(0, r, 3.9, 70)]  # (offset, pitch, length, velocity)
        out += [(b + o, ln, n, round(vv * sc)) for o, n, ln, vv in pat]
    return out


def strings(plan):
    """plan: {bar: velocity}; chord is looked up from the section that owns the bar."""
    out = []
    for bar, vel in plan.items():
        for sec, (start, chords, _, _) in SECTIONS.items():
            if start <= bar < start + len(chords):
                out += [(4 * bar, 3.95, n, vel) for n in V[chords[bar - start]][1:]]
    return out


def drums():
    d = []
    MAR, TAM, LC, HC, LB = 70, 54, 64, 63, 61  # maracas, tambourine, low conga, high conga, low bongo

    def bar(b, items):
        d.extend((4 * b + o, .25, n, v) for o, n, v in items)

    def fill(b, base):  # conga run on the last beat before a new section
        bar(b, [(3 + k * .25, HC if k < 2 else LC, base + 6 * k) for k in range(4)])

    for b in (2, 3):  # intro: shaker enters
        bar(b, [(o, MAR, 28 + 8 * (o % 2 == 0) + 4 * (b - 2)) for o in (0, 1, 2, 3)])
    for b in range(4, 12):  # A: quarter shaker, low conga on the downbeat of every other bar
        bar(b, [(o, MAR, 38 if o % 2 == 0 else 30) for o in (0, 1, 2, 3)])
        if b % 2 == 0:
            bar(b, [(0, LC, 46)])
    for b in range(12, 20):  # A': eighth shaker + conga pattern
        bar(b, [(o * .5, MAR, 44 if o % 2 == 0 else 28) for o in range(8)])
        bar(b, [(0, LC, 62), (1.5, HC, 44), (2.5, LC, 56), (3, HC, 42)])
    for b in range(20, 28):  # B: tambourine on 2 and 4, soft bongo, no shaker
        bar(b, [(1, TAM, 56), (3, TAM, 50), (0, LB, 38), (2.5, LB, 34)])
    for b in range(28, 36):  # A'': everything, tambourine half strength
        bar(b, [(o * .5, MAR, 46 if o % 2 == 0 else 30) for o in range(8)])
        bar(b, [(0, LC, 66), (1, TAM, 40), (1.5, HC, 46), (2.5, LC, 58), (3, TAM, 36)])
    for b in range(36, 40):  # turnaround: shaker thins out
        bar(b, [(o, MAR, max(16, 34 - 6 * (b - 36))) for o in (0, 1, 2, 3)])
    fill(11, 40), fill(19, 48), fill(27, 40), fill(35, 56)
    return d


def fix_overlaps(notes):
    """Same pitch re-struck while still sounding: cut the earlier note (a MIDI note_off would kill the new one)."""
    notes = sorted(notes, key=lambda n: (n[2], n[0]))
    out = []
    for i, (b, ln, pitch, vel) in enumerate(notes):
        nxt = next((m[0] for m in notes[i + 1:] if m[2] == pitch), None)
        if nxt is not None and b + ln > nxt:
            ln = max(0.1, nxt - b - 0.02)
        out.append((b, min(ln, BARS * 4 - b), pitch, vel))
    return sorted(out)


def build():
    s = Song(bpm=BPM, bars=BARS)
    parts = {}
    parts["ocarina"] = (OCARINA, 79, lead(0, LEAD_INTRO, 60, [0, 0, 0, 2]) + lead(4, LEAD_A, 70) + lead(12, LEAD_A2, 78)
                        + lead(28, LEAD_A3, 82) + lead(36, LEAD_OUT, 58, [0, -2, -5, -8]), 100, 54)
    parts["flute"] = (FLUTE, 73, lead(20, LEAD_B, 74)
                      + [(28 * 4 + o, ln - .1, p(n), 52 + (6 if o >= 24 else 0)) for o, ln, n in COUNTER_A3], 96, 74)
    parts["guitar"] = (GUITAR, 24, sum((guitar(x) for x in ("intro", "A", "A2", "B", "A3", "outro")), []), 100, 40)
    parts["harp"] = (HARP, 46, harp("intro") + harp("A", {4, 5, 6, 7}) + harp("A2") + harp("B") + harp("A3")
                     + harp("outro", {0, 1, 2}), 90, 92)
    parts["bass"] = (BASS, 32, bass("intro", {2, 3}) + bass("A") + bass("A2") + bass("B") + bass("A3")
                     + bass("outro", {0, 1, 2, 3}), 100, 64)
    plan = {1: 36, 2: 42, 3: 46}
    plan.update({b: 44 for b in range(8, 12)})
    plan.update({b: 54 + (b - 12) for b in range(12, 20)})
    plan.update({b: 62 + (b - 20) for b in range(20, 28)})
    plan.update({b: 58 + (b - 28) for b in range(28, 36)})
    plan.update({36: 50, 37: 46, 38: 42, 39: 38})
    parts["strings"] = (STRINGS, 49, strings(plan), 84, 56)
    for k, (ch, prog, notes, vol, pan) in parts.items():
        parts[k] = (ch, prog, fix_overlaps(notes), vol, pan)  # checks see exactly what is rendered
        s.add(ch, prog, parts[k][2], volume=vol, pan=pan)
    s.drum(drums(), volume=90)
    return s, parts


def checks(s, parts):
    names = {n: [x for x in v[2]] for n, v in parts.items()}
    print("part ranges (MIDI min-max, note count):")
    for n, notes in names.items():
        ps = [x[2] for x in notes]
        print(f"  {n:8s} {min(ps)}-{max(ps)} n={len(notes)} first bar={min(x[0] for x in notes) / 4:.2f}")
    end = max(b + ln for _, (_, _, notes, _, _) in parts.items() for b, ln, *_ in notes)
    print(f"bars={BARS} last note ends at beat {end:.2f} (limit {BARS * 4}); loop length {BARS * 4 * 60 / BPM:.2f} s")
    assert end <= BARS * 4
    drum_end = max(b + ln for b, ln, *_ in s.parts[-1][4])
    assert drum_end <= BARS * 4, drum_end

    def sounding(t, skip):
        return [x[2] for n, notes in names.items() if n not in skip for x in notes if x[0] <= t < x[0] + x[1] - 1e-6]

    clashes = []
    for n in ("ocarina", "flute"):
        for b, ln, pitch, _ in names[n]:
            if ln < 0.9:  # passing notes may rub
                continue
            others = sounding(b + 1e-6, {n, "bass", "harp"} if False else {n})
            for q in others:
                if abs(pitch - q) % 12 in (1, 11) and abs(pitch - q) < 24:
                    clashes.append((b / 4, n, pitch, q))
    print(f"semitone clashes lead(>=0.9 beat) vs other parts: {len(clashes)}")
    for c in clashes[:30]:
        print(f"  bar {c[0]:.2f} {c[1]} {c[2]} vs {c[3]}")
    # parallel 5ths/octaves lead vs bass at consecutive lead onsets
    par = []
    for n in ("ocarina", "flute"):
        ln_ = sorted(names[n])
        for a, b in zip(ln_, ln_[1:]):
            ba = [x for x in sounding(a[0] + 1e-6, set(names) - {"bass"})]
            bb = [x for x in sounding(b[0] + 1e-6, set(names) - {"bass"})]
            if ba and bb:
                ia, ib = (a[2] - ba[0]) % 12, (b[2] - bb[0]) % 12
                if ia == ib and ia in (0, 7) and (b[2] - a[2]) * (bb[0] - ba[0]) > 0:
                    par.append((a[0] / 4, n, ia))
    print(f"parallel 5ths/8ves lead vs bass (same direction): {len(par)} {par[:10]}")
    # strong-beat chord-tone rate for the lead (beats 0 and 2 of each bar, ocarina+flute)
    tot = ok = 0
    for n in ("ocarina", "flute"):
        for b, ln, pitch, _ in names[n]:
            if b % 4 in (0, 2) and ln >= 1:
                chord = {x % 12 for x in sounding(b + 1e-6, {n, "harp", "ocarina", "flute"})}
                tot += 1
                ok += pitch % 12 in chord
    print(f"lead on strong beats that are chord tones of the sounding accompaniment: {ok}/{tot}")


if __name__ == "__main__":
    song, parts = build()
    checks(song, parts)
    print(render(song, OUT, soundfont="MuseScore_General"))
