"""Slot E: "Hearth Road", a pastoral, wistful loop in D major (Bm contrast) at 76 bpm, 40 bars (~2:06).

Form (bars, 1-based): intro 1-4 | A 5-12 | A' 13-20 | B (relative minor) 21-28 | A'' 29-36 | coda turnaround 37-40.
The motif M is defined once in scale degrees; the intro, B section and coda use transformed copies of it.
"""
import os
import sys
from itertools import permutations

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
from psx import Song, render  # noqa: E402

BPM, BARS = 76, 40
TOTAL = BARS * 4
OUT = r"D:\Projetos\_musica-tools\eval\slot_E"

# ---- harmony ------------------------------------------------------------------------------------------------------
SCALE = [0, 2, 4, 5, 7, 9, 11]  # D major from D4 = 62
CHORDS = {  # name -> (bass pitch class, chord pitch classes)
    "D": (2, [2, 6, 9]), "Bm": (11, [11, 2, 6]), "G": (7, [7, 11, 2]), "A": (9, [9, 1, 4]),
    "F#m": (6, [6, 9, 1]), "Em": (4, [4, 7, 11]), "C": (0, [0, 4, 7]), "Asus4": (9, [9, 2, 4]),
    "A7": (9, [1, 7, 9]), "D/F#": (6, [2, 6, 9]),
}
# one entry per bar; "X|Y" changes chord on beat 3 (beat 2 counting from 0)
PROG = ("D G Em A7 "                      # intro 1-4
        "D Bm G A F#m G Em A "            # A 5-12
        "D Bm G A Bm G Em|A D "           # A' 13-20
        "Bm F#m G D Em C G Asus4|A "      # B 21-28 (relative minor, bVII colour in bar 26)
        "D Bm G A F#m Bm Em|A D "         # A'' 29-36
        "G D/F# Em A7").split()           # coda 37-40, A7 turns back to D at bar 1
assert len(PROG) == BARS


def chord_at(beat):
    names = PROG[int(beat // 4)].split("|")
    return CHORDS[names[1] if len(names) > 1 and beat % 4 >= 2 else names[0]]


def deg(d):
    return 62 + 12 * (d // 7) + SCALE[d % 7]


def near(pc, lo):
    """Lowest pitch of pitch class pc at or above lo."""
    return lo + (pc - lo) % 12


# ---- the motif and its transformations ----------------------------------------------------------------------------
M = [(1.5, 9), (0.5, 8), (1, 7), (1, 4)]  # (length, scale degree): F#5 E5 D5 A4, a falling sigh


def motif(m, start, vel, transpose=0, invert_axis=None, augment=1):
    out, t = [], start
    for length, d in m:
        d = 2 * invert_axis - d if invert_axis is not None else d
        out.append((t, length * augment, deg(d + transpose), vel))
        t += length * augment
    return out


def bar(n, notes, vel):
    """Notes given inside bar n (1-based) as (beat, length, pitch); accents on the beat, softer off-beats."""
    b0 = (n - 1) * 4
    return [(b0 + b, ln, p, vel + (6 if b % 1 == 0 and b % 2 == 0 else 0) - (8 if b % 1 else 0)) for b, ln, p in notes]


D4, E4, Fs4, G4, A4, B4, C5, Cs5, D5, E5, Fs5, G5, A5, B5 = 62, 64, 66, 67, 69, 71, 72, 73, 74, 76, 78, 79, 81, 83

# ---- lead: flute ----------------------------------------------------------------------------------------------------
flute = []
# A 5-12: statement of M, then an answering phrase ending on a half cadence
flute += motif(M, 16, 74)
flute += bar(6, [(0, 1.5, B4), (1.5, 0.5, Cs5), (2, 2, D5)], 70)
flute += bar(7, [(0, 1, G5), (1, 1, Fs5), (2, 1.5, E5), (3.5, 0.5, D5)], 72)
flute += bar(8, [(0, 3, E5)], 68)
flute += bar(9, [(0, 1.5, Fs5), (1.5, 0.5, E5), (2, 1, Cs5), (3, 1, E5)], 74)  # echo of M's head
flute += bar(10, [(0, 1.5, G5), (1.5, 0.5, Fs5), (2, 2, D5)], 72)
flute += bar(11, [(0, 1.5, E5), (1.5, 0.5, Fs5), (2, 1, G5), (3, 1, B5)], 78)
flute += bar(12, [(0, 2, A5), (2, 1, G5), (3, 1, E5)], 72)
# A' 13-20: M with a turn, then a new phrase that closes on the tonic
flute += bar(13, [(0, 1, Fs5), (1, 0.25, G5), (1.25, 0.25, Fs5), (1.5, 0.5, E5), (2, 1, D5), (3, 1, A4)], 80)
flute += bar(14, [(0, 1.5, B4), (1.5, 0.5, Cs5), (2, 2, D5)], 76)
flute += bar(15, [(0, 1, G5), (1, 0.5, Fs5), (1.5, 0.5, G5), (2, 1.5, E5), (3.5, 0.5, D5)], 78)
flute += bar(16, [(0, 2.5, E5), (2.5, 0.5, D5), (3, 1, Cs5)], 74)
flute += bar(17, [(0, 1.5, D5), (1.5, 0.5, Cs5), (2, 1, B4), (3, 1, Fs5)], 80)
flute += bar(18, [(0, 1.5, G5), (1.5, 0.5, Fs5), (2, 1, D5), (3, 1, G5)], 78)
flute += bar(19, [(0, 1, E5), (1, 1, G5), (2, 1.5, Cs5), (3.5, 0.5, E5)], 76)
flute += bar(20, [(0, 3, D5)], 72)
# A'' 29-36: M returns at full strength and climbs higher
flute += motif(M, 112, 92)
flute += bar(30, [(0, 1.5, B4), (1.5, 0.5, Cs5), (2, 1, D5), (3, 1, Fs5)], 88)
flute += bar(31, [(0, 1.5, B5), (1.5, 0.5, A5), (2, 1, G5), (3, 1, D5)], 94)
flute += bar(32, [(0, 1.5, Cs5), (1.5, 0.5, D5), (2, 2, E5)], 86)
flute += bar(33, [(0, 1.5, A5), (1.5, 0.5, Fs5), (2, 1, E5), (3, 1, Cs5)], 90)
flute += bar(34, [(0, 1.5, D5), (1.5, 0.5, E5), (2, 1, Fs5), (3, 1, B5)], 94)
flute += bar(35, [(0, 1, G5), (1, 1, B5), (2, 1, A5), (3, 1, E5)], 90)
flute += bar(36, [(0, 2, Fs5), (2, 2, D5)], 82)
# coda: the head of M, softer, as a memory
flute += [(n[0], n[1], n[2], 58) for n in motif(M[:3], 148, 58)]

# ---- second voice: oboe ---------------------------------------------------------------------------------------------
oboe = []
# intro 3-4: M augmented x2 and a step lower, foreshadowing the theme (E5 D5 C#5 G4 over Em -> A7)
oboe += motif(M, 8, 56, transpose=-1, augment=2)
# B 21-28: M inverted (rising instead of falling) carries the contrasting section
oboe += motif(M, 80, 80, invert_axis=7)  # B4 C#5 D5 G5, G5 leans into F#5 of the next bar
oboe += bar(22, [(0, 1.5, Fs5), (1.5, 0.5, E5), (2, 2, Cs5)], 78)
oboe += bar(23, [(0, 1, B4), (1, 1, D5), (2, 1.5, G5), (3.5, 0.5, Fs5)], 82)
oboe += bar(24, [(0, 2.5, Fs5), (2.5, 0.5, E5), (3, 1, D5)], 78)
oboe += bar(25, [(0, 1.5, E5), (1.5, 0.5, Fs5), (2, 1, G5), (3, 1, B5)], 90)
oboe += bar(26, [(0, 2, G5), (2, 1, E5), (3, 1, C5)], 94)
oboe += bar(27, [(0, 1.5, D5), (1.5, 0.5, E5), (2, 1, B4), (3, 1, G4)], 82)
oboe += bar(28, [(0, 3, A4)], 74)
# A'' 29-36: chord-tone harmony under the flute (highest chord tone at least a minor third below)
for t, ln, p, v in flute:
    if 112 <= t < 144:
        pcs = chord_at(t)[1]
        h = max(q for q in range(p - 12, p - 2) if q % 12 in pcs)
        oboe.append((t, ln, h, v - 18))
# coda 37 and 39: long soft notes
oboe += bar(37, [(0, 4, D5)], 50) + bar(39, [(0, 2, B4), (2, 2, G4)], 48)
# coda 40: M a step lower leads back to D at bar 1 (E5 D5 C#5 then A4 instead of G4)
oboe += motif(M[:3], 156, 56, transpose=-1) + [(159, 1, A4, 50)]

# ---- guitar (A sections) and harp (intro, B, coda): arpeggios ------------------------------------------------------
def tones(beat, lo, count):
    bass, pcs = chord_at(beat)
    out = [near(bass, lo)]
    while len(out) < count:
        out.append(min(near(pc, out[-1] + 1) for pc in pcs))
    return out


def ring(t, ln):
    """Let an arpeggio note ring, but stop it where the chord changes so it never smears into the next chord."""
    change = (t // 2 + 1) * 2
    return min(ln, change - t) if chord_at(change % TOTAL) != chord_at(t) else ln


guitar, harp = [], []
GUITAR_SHAPE = [0, 2, 1, 3, 2, 3, 1, 2]  # p-i-m-a style picking over 8 eighths
HARP_SHAPE = [0, 1, 2, 3, 4, 3, 2, 1]    # rolling up and down
for b in range(BARS):
    n = b + 1
    for i in range(8):
        t = b * 4 + i * 0.5
        if 5 <= n <= 20 or 29 <= n <= 36:
            vel = (66 if i == 0 else 50 if i % 2 else 56) + (6 if n >= 29 else 0)
            guitar.append((t, ring(t, 1), tones(t, 45, 4)[GUITAR_SHAPE[i]], vel))
        if n <= 4 or 21 <= n <= 28 or n >= 37:
            vel = (62 if i == 0 else 46 if i % 2 else 52) + (8 if 21 <= n <= 28 else 0)
            harp.append((t, ring(t, 1.5), tones(t, 50, 5)[HARP_SHAPE[i]], vel))

# ---- strings: voice-led three-voice pads -------------------------------------------------------------------------
def voice(prev, pcs):
    best = None
    for perm in permutations(pcs):
        cand = sorted(min((p for p in range(55, 80) if p % 12 == pc), key=lambda p: abs(p - v)) for pc, v in zip(perm, prev))
        cost = sum(abs(a - b) for a, b in zip(cand, prev))
        if len(set(cand)) == 3 and (best is None or cost < best[0]):
            best = (cost, cand)
    return best[1]


STRING_VEL = {range(1, 5): 40, range(13, 21): 50, range(21, 29): None, range(29, 37): 62, range(37, 41): 44}
strings, prev = [], [62, 66, 69]
for b in range(BARS):
    n = b + 1
    vel = next((v for r, v in STRING_VEL.items() if n in r), 0)
    if 21 <= n <= 28:
        vel = 56 + 2 * (n - 21)  # swell through the contrasting section
    halves = [(0, 4)] if "|" not in PROG[b] else [(0, 2), (2, 2)]
    for off, ln in halves:
        prev = voice(prev, chord_at(b * 4 + off)[1])
        if vel:
            strings += [(b * 4 + off, ln, p, vel) for p in prev]

# ---- bass ----------------------------------------------------------------------------------------------------------
bass = []
for b in range(BARS):
    n, t = b + 1, b * 4
    root = near(chord_at(t)[0], 38)
    if "|" in PROG[b]:
        bass += [(t, 2, root, 76), (t + 2, 2, near(chord_at(t + 2)[0], 38), 70)]
    elif n <= 4 or n >= 37:
        bass += [(t, 4, root, 62)]
    elif 21 <= n <= 28:
        bass += [(t, 3, root, 74), (t + 3, 1, near(chord_at(t)[1][1], 40), 60)]
    else:
        fifth = root + 7 if root + 7 <= 50 else root - 5
        third = near(chord_at(t)[1][1], 40)  # walking up to the third avoids octaves against the flute
        bass += [(t, 2, root, 80), (t + 2, 1, fifth, 64), (t + 3, 1, third, 58)]

# ---- percussion (GM: 54 tambourine, 63/64 high/low conga, 70 maracas, 81 open triangle) ------------------------------
drums = [(0, 1, 81, 34)] + [(15, 0.5, 63, 40), (15.5, 0.5, 63, 46)]  # triangle at the loop start, fill into A
for b in range(BARS):
    n, t = b + 1, b * 4
    if 5 <= n <= 20 or 29 <= n <= 36:
        loud = 10 if n >= 29 else 0
        drums += [(t, 0.5, 64, 70 + loud), (t + 1.5, 0.5, 63, 44 + loud), (t + 2.5, 0.5, 64, 52 + loud),
                  (t + 3, 0.5, 63, 50 + loud)]
        if n >= 13:
            drums += [(t + 1, 0.5, 54, 32 + loud), (t + 3, 0.5, 54, 36 + loud)]
    elif 21 <= n <= 28:
        drums += [(t + i * 0.5, 0.25, 70, 38 if i % 2 == 0 else 28) for i in range(8)]
        drums += [(t, 0.5, 64, 58), (t + 2, 0.5, 64, 50), (t + 3.5, 0.5, 63, 42)]
    elif n >= 37:
        drums += [(t, 0.5, 64, 48)]
drums += [(111, 0.5, 63, 50), (111.5, 0.5, 64, 56)]  # fill out of B into A''

PARTS = {  # name: (channel, program, volume, pan, notes, range)
    "flute": (0, 73, 100, 70, flute, (60, 96)),
    "oboe": (1, 68, 92, 54, oboe, (58, 91)),
    "guitar": (2, 24, 88, 44, guitar, (40, 76)),
    "harp": (3, 46, 84, 84, harp, (36, 91)),
    "strings": (4, 48, 76, 64, strings, (55, 84)),
    "bass": (5, 32, 100, 64, bass, (28, 55)),
    "drums": (9, 0, 80, 64, drums, (35, 81)),
}


def trim_overlaps(notes):
    """A re-struck pitch would be cut by the earlier note_off: shorten the earlier note to end at the new onset."""
    notes = sorted(notes)
    out = []
    for i, (t, ln, p, v) in enumerate(notes):
        later = [u for u, _, q, _ in notes[i + 1:] if q == p and u > t]
        end = min([t + ln, TOTAL] + later[:1])
        out.append((t, end - t, p, v))
    return out


# ---- checks: collect every violation, then print -------------------------------------------------------------------
def check():
    bad = []
    for name, (_, _, _, _, notes, (lo, hi)) in PARTS.items():
        for t, ln, p, v in notes:
            if not lo <= p <= hi:
                bad.append(f"{name}: pitch {p} out of range {lo}-{hi} at beat {t}")
            if t < 0 or t + ln > TOTAL + 1e-9 or ln < 1 / 480:
                bad.append(f"{name}: note {p} at beat {t} len {ln} outside the loop or empty")
            if not 1 <= v <= 127:
                bad.append(f"{name}: velocity {v} at beat {t}")
        s = sorted(notes)
        for i, (t, ln, p, _) in enumerate(s):
            for u, _, q, _ in s[i + 1:]:
                if u >= t + ln:
                    break
                if q == p and u > t - 1e-9:
                    bad.append(f"{name}: same pitch {p} overlaps at beats {t} and {u}")
    # sustained semitone / major-seventh rubs between pitched parts on every beat; beats 1 and 3 fail the check,
    # beats 2 and 4 (where passing and leaning notes live) are only reported
    pitched = {k: v[4] for k, v in PARTS.items() if k != "drums"}
    rubs, weak = 0, []
    for beat in range(TOTAL):
        sounding = [(k, p) for k, notes in pitched.items() for t, ln, p, _ in notes if t <= beat < t + ln and ln >= 1]
        for i, (k1, p1) in enumerate(sounding):
            for k2, p2 in sounding[i + 1:]:
                if k1 != k2 and abs(p1 - p2) % 12 in (1, 11) and beat % 2:
                    weak.append(f"rub {k1} {p1} vs {k2} {p2} at bar {beat // 4 + 1} beat {beat % 4 + 1}")
                elif k1 != k2 and abs(p1 - p2) % 12 in (1, 11):
                    bad.append(f"rub {k1} {p1} vs {k2} {p2} at bar {beat // 4 + 1} beat {beat % 4 + 1}")
                    rubs += 1
    # parallel fifths/octaves between the outer voices, onset to onset: the lead line (flute, plus the oboe where it
    # leads: intro, B and coda; in bars 29-36 it is an inner harmony) against the bass
    def at(notes, beat):
        return next((p for t, ln, p, _ in notes if t <= beat < t + ln), None)
    lead = sorted(flute + [n for n in oboe if not 112 <= n[0] < 144])
    pairs = [(t, p, at(bass, t)) for t, _, p, _ in lead]
    for (t1, m1, b1), (t2, m2, b2) in zip(pairs, pairs[1:]):
        if None in (b1, b2) or m1 == m2 or b1 == b2 or t2 - t1 > 4:
            continue
        i1, i2 = (m1 - b1) % 12, (m2 - b2) % 12
        if i1 == i2 and i1 in (0, 7) and (m2 - m1) * (b2 - b1) > 0:
            bad.append(f"parallel {'octave' if i1 == 0 else 'fifth'} lead/bass at beats {t1} -> {t2}")
    last = max(t + ln for v in PARTS.values() for t, ln, _, _ in v[4])
    print(f"bars: {len(PROG)} progression, notes end at beat {last} of {TOTAL} -> {last / 4:g} bars")
    print(f"length: {BARS}*4*60/{BPM} = {TOTAL * 60 / BPM:.3f} s")
    for name, v in PARTS.items():
        ps = [p for _, _, p, _ in v[4]]
        vs = [n[3] for n in v[4]]
        print(f"  {name:8s} prog {v[1]:3d} notes {len(ps):4d} pitch {min(ps)}-{max(ps)} vel {min(vs)}-{max(vs)}")
    print(f"violations: {len(bad)} (rubs {rubs})")
    for b in bad:
        print("  " + b)
    print(f"report only, rubs on beats 2 and 4: {len(weak)}")
    for w in weak:
        print("  " + w)
    return bad


if __name__ == "__main__":
    for k, (ch, prog, vol, pan, notes, rng) in PARTS.items():
        PARTS[k] = (ch, prog, vol, pan, trim_overlaps(notes), rng)
    flute, oboe, bass = PARTS["flute"][4], PARTS["oboe"][4], PARTS["bass"][4]
    check()
    song = Song(bpm=BPM, bars=BARS)
    for k, (ch, prog, vol, pan, notes, _) in PARTS.items():
        if ch == 9:
            song.drum(notes, volume=vol)
        else:
            song.add(ch, prog, notes, volume=vol, pan=pan)
    print("wrote", render(song, OUT, soundfont="MuseScore_General"))
