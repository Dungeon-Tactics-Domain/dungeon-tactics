"""Three one-shot jingles for Dungeon Tactics, dark lo-fi folk (brief: BRIEF_JINGLES_LOFI.md, letter E).

One motif ties them: E4 A4 B4 C5 (5-1-2-b3 of A minor; rhythm 1/2, 1, 1/2, long), a lantern lifted.
  vitoria  84 bpm  Am | Cmaj7 D | Am6/9           ocarina states the motif; the D chord lights an F#, it settles on E
  derrota  66 bpm  Am | Em/G | Fmaj7 | E7sus4     cello plays the motif backwards over a lament bass, stalls on the sus
  chefe    76 bpm  Am | Fmaj7 Em7 | D D/E E | A   flute; the motif returns with C# for C and the shaker (rain) stops
Run: python scripts/music/jingles_E.py  (writes <MUSIC_TOOLS>/jingles/E/<name>.mid and .ogg)
"""
import json
import math
import os
import re
import subprocess
import sys
import wave

import mido
import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from psx import FLUID, PPQ, SOUNDFONTS, SR, TOOLS, Song  # noqa: E402

OUT = os.path.join(TOOLS, "jingles", "E")
STEP = {"C": 0, "D": 2, "E": 4, "F": 5, "G": 7, "A": 9, "B": 11}
PIANO, HARP, GUITAR, CELLO, FLUTE, OCARINA, PAD = 0, 46, 24, 42, 73, 79, 89
LOW_CONGA, OPEN_CONGA, MUTE_CONGA, TAMBOURINE, MARACAS, TRIANGLE = 64, 63, 62, 54, 70, 81


def pitch(name):
    acc = name[1:-1]
    return 12 * (int(name[-1]) + 1) + STEP[name[0]] + acc.count("#") - acc.count("b")


def ps(text):
    return [pitch(n) for n in text.split()]


def line(text, t=0.0):
    """'PITCH:BEATS:VELOCITY' tokens played one after another; 'r:BEATS' is a rest."""
    out = []
    for tok in text.split():
        name, dur, *v = tok.split(":")
        if name != "r":
            out.append((t, float(dur), pitch(name), int(v[0])))
        t += float(dur)
    return out


def roll(t, dur, text, v, step=0.06):
    """A chord spread upwards like a harp or a strum, a little softer as it climbs."""
    return [(t + i * step, dur - i * step, p, v - 2 * i) for i, p in enumerate(ps(text))]


def arp(t, dur, text, order, v):
    """Eighth-note broken chord; every note rings until the chord changes, like a held hand."""
    vo = ps(text)
    return [(t + k / 2, dur - k / 2, vo[order[k % len(order)]], v + (6 if k == 0 else 0) - (4 if k % 2 else 0))
            for k in range(int(dur * 2))]


def pad(chords):
    """Held chords (t, beats, pitches, velocity); a pitch the next chord keeps is held, not re-attacked."""
    out, held = [], {}
    for t, _, text, v in chords:
        cur = set(ps(text))
        for p in [p for p in held if p not in cur]:
            st, pv = held.pop(p)
            out.append((st, t - st, p, pv))
        for p in cur - held.keys():
            held[p] = (t, v)
    end = chords[-1][0] + chords[-1][1]
    return out + [(st, end - st, p, pv) for p, (st, pv) in held.items()]


def hits(pairs):
    return [(t, 0.25, note, v) for t, note, v in pairs]


def fade(track, ch, t0, t1, to=20, steps=32):
    """Expression (CC11) falls from full to `to` between beats t0 and t1, so a held note dies away instead of
    stopping dead at its note_off; geometric values give equal dB steps (about 1 dB each)."""
    ev, tick = [], 0
    for m in track:
        tick += m.time
        ev.append((tick, m))
    ev += [(round((t0 + (t1 - t0) * k / steps) * PPQ),
            mido.Message("control_change", channel=ch, control=11, value=round(127 * (to / 127) ** (k / steps))))
           for k in range(1, steps + 1)]
    ev.sort(key=lambda e: e[0])  # stable: events on the same tick keep their order
    track[:] = [m.copy(time=t - prev) for (t, m), prev in zip(ev, [0] + [t for t, _ in ev[:-1]])]


def trim(notes):
    """A repeated pitch on one channel cuts the earlier note, so a note_off never lands inside the next note."""
    notes = sorted(notes)
    out = []
    for i, (t, n, p, v) in enumerate(notes):
        nxt = next((t2 for t2, _, p2, _ in notes[i + 1:] if p2 == p and t2 > t), None)
        out.append((t, min(n, nxt - t) if nxt is not None else n, p, v))
    return out


# ---- vitoria: the room is won, not the day ----------------------------------------------------------------
def vitoria():
    melody = line("E4:.5:56 A4:1:62 B4:.5:58 C5:1.5:64 B4:.5:54 "  # the motif, landing on the minor third
                  "E5:1:64 D5:.5:58 C5:.5:55 D5:.5:58 E5:.5:62 F#5:1:70 "  # sigh over Cmaj7, then up to the lit F#
                  "E5:2.5:60")  # the F# (Dorian sixth) settles on the fifth: open, not final
    guitar = (arp(0, 4, "E3 A3 C4 E4", [0, 1, 2, 3, 2, 1, 2, 1], 44) + arp(4, 2, "E3 G3 B3 E4", [0, 1, 2, 3], 46)
              + arp(6, 2, "F#3 A3 D4 F#4", [0, 1, 2, 3], 50) + roll(8, 2.5, "E3 A3 C4 E4", 48))
    harp = roll(0, 2, "A2 E3 A3", 54) + roll(6, 2, "D4 F#4 A4", 40) + roll(8, 2.5, "A2 E3 F#4 B4", 52, step=0.09)
    strings = pad([(0, 4, "A3 C4 E4", 34), (4, 2, "G3 B3 E4", 38), (6, 2, "F#3 A3 D4", 42), (8, 2.5, "F#3 A3 C4 E4", 36)])
    bass = line("A2:4:56 C3:2:54 D3:2:58 A2:2.5:52")  # D down to A: the Dorian plagal close
    shaker = [(k / 2, MARACAS, (34 if k % 2 else 24) + k) for k in range(16)]
    drums = hits(shaker + [(0, LOW_CONGA, 46), (4, LOW_CONGA, 40), (7.5, OPEN_CONGA, 34), (6, TAMBOURINE, 30),
                           (8, TRIANGLE, 40)])
    return 84, [("lead", 0, OCARINA, 88, 64, melody), ("guitar", 1, GUITAR, 96, 44, guitar),
                ("harp", 2, HARP, 92, 86, harp), ("pad", 3, PAD, 66, 64, strings),
                ("bass", 4, CELLO, 58, 60, bass)], drums, [(0, 8.5, 10.5), (3, 8, 10.5), (4, 8.5, 10.5)]


# ---- derrota: carried back wounded ------------------------------------------------------------------------
def derrota():
    melody = line("C5:1.5:62 B4:.5:56 A4:1:58 E4:1:50 "  # the motif backwards: the lantern going down
                  "A4:1.5:56 G4:.5:48 A4:3.5:50")  # the E-A head tries again and stalls on the unresolved fourth
    piano = (arp(0, 2, "E3 A3 C4", [0, 1, 2, 1], 46) + arp(2, 2, "G3 B3 E4", [0, 1, 2, 1], 42)
             + arp(4, 2, "A3 C4 E4", [0, 1, 2, 1], 40) + roll(6, 3.5, "E3 B3 D4", 40, step=0.12))
    strings = pad([(0, 2, "A3 C4 E4", 28), (2, 2, "G3 B3 E4", 28), (4, 2, "A3 C4 E4", 26), (6, 3.5, "B3 D4 E4", 24)])
    bass = line("A2:2:48 G2:2:46 F2:2:44 E2:3.5:42")  # lament bass A G F E, ends on the dominant: no home yet
    drums = hits([(0, LOW_CONGA, 40), (4, LOW_CONGA, 28)])  # two soft steps
    return 66, [("lead", 0, CELLO, 80, 56, melody), ("piano", 1, PIANO, 100, 70, piano),
                ("pad", 2, PAD, 56, 64, strings), ("bass", 3, CELLO, 55, 72, bass)], drums, \
        [(0, 6.5, 9.5), (2, 6, 9.5), (3, 6.5, 9.5)]  # the held sus fades like a tired breath


# ---- chefe: the expedition ends well, the rain stops -------------------------------------------------------
def chefe():
    melody = line("E4:.5:54 A4:1:60 B4:.5:56 C5:2:62 "  # the motif as the victory states it
                  "E5:1.5:64 D5:.5:58 C5:1:62 B4:1:56 "  # over Fmaj7 then a sigh on Em7
                  "A4:.5:60 D5:1:66 E5:.5:64 F#5:1:74 E5:.5:66 B4:.5:60 "  # the motif in D major, climbing to F#
                  "A4:1:64 B4:.5:62 C#5:3.5:68")  # its tail again, C# for C: the minor world lifts
    guitar = (arp(0, 4, "E3 A3 C4 E4", [0, 1, 2, 3, 2, 1, 2, 1], 42) + arp(4, 2, "F3 A3 C4 E4", [0, 1, 2, 3], 44)
              + arp(6, 2, "E3 G3 D4 E4", [0, 1, 2, 3], 44) + arp(8, 2, "F#3 A3 D4 F#4", [0, 1, 2, 3], 50)
              + arp(10, 1, "E3 A3 D4 F#4", [0, 2], 52) + arp(11, 1, "E3 G#3 B3 E4", [0, 2], 54)
              + roll(12, 5, "E3 A3 C#4 E4", 50))
    harp = (roll(0, 2, "A2 E3 A3", 50) + roll(4, 2, "F2 C3 A3", 44) + roll(8, 3, "D3 A3 F#4", 52)
            + roll(12, 5, "A1 E2 A2 E3 B3 C#4 E4", 56, step=0.1))
    strings = pad([(0, 4, "A3 C4 E4", 30), (4, 2, "A3 C4 E4", 34), (6, 2, "G3 D4 E4", 36), (8, 2, "F#3 A3 D4", 46),
                   (10, 1, "F#3 A3 D4", 48), (11, 1, "G#3 B3 E4", 50), (12, 5, "A3 C#4 E4", 44)])
    bass = line("A2:4:56 F2:2:54 E2:2:52 D2:2:58 E2:2:60 A2:5:58")
    inner = line("r:8 F#3:3:50 G#3:1:56 A3:5:58")  # the rising inner line under the swell
    shaker = [(k / 2, MARACAS, 16 + k + (8 if k % 2 else 0)) for k in range(24)]  # grows, then stops at the arrival
    drums = hits(shaker + [(0, LOW_CONGA, 44), (4, LOW_CONGA, 46), (8, LOW_CONGA, 54), (3.5, MUTE_CONGA, 28),
                           (7.5, MUTE_CONGA, 32), (11, OPEN_CONGA, 40), (11.5, OPEN_CONGA, 46), (8, TAMBOURINE, 32),
                           (10, TAMBOURINE, 38), (12, TRIANGLE, 46)])
    return 76, [("lead", 0, FLUTE, 90, 64, melody), ("guitar", 1, GUITAR, 94, 44, guitar),
                ("harp", 2, HARP, 90, 86, harp), ("pad", 3, PAD, 80, 64, strings),
                ("bass", 4, CELLO, 58, 60, bass), ("inner", 5, CELLO, 64, 70, inner)], drums, \
        [(0, 14.5, 17), (3, 13.5, 17), (4, 13.5, 17), (5, 13.5, 17)]  # the flute fades only after its C# is heard


# ---- checks: the brief's mix guardrails, read from the notes -----------------------------------------------
def check(name, parts, drums):
    last = 0.0
    for role, _, prog, vol, _, notes in parts:
        lo, hi = min(p for _, _, p, _ in notes), max(p for _, _, p, _ in notes)
        assert lo >= 28, (name, role, "below E1")
        assert role != "lead" or hi <= 84, (name, role, "lead above C6")
        assert role != "bass" or prog not in (42, 43) or vol <= 60, (name, role, "cello/contrabass bass above 60")
        for i, (t, n, p, v) in enumerate(notes):
            assert n > 0.01 and isinstance(v, int) and 1 <= v <= 127, (name, role, t, p, v)
            assert not any(p2 == p and t <= t2 < t + n - 1e-9 for t2, _, p2, _ in notes[i + 1:]), (name, role, t, p)
        last = max(last, max(t + n for t, n, _, _ in notes))
        print(f"  {role:6} prog {prog:3} vol {vol:3}  pitch {lo}-{hi}  vel {min(v for *_, v in notes)}-{max(v for *_, v in notes)}")
    dv = [v for *_, v in drums]
    assert max(dv) <= 80 and len(set(dv)) > 1, (name, "percussion velocities")
    print(f"  drums  {len(drums)} hits  vel {min(dv)}-{max(dv)}")
    # no two parts holding a semitone or a minor ninth together for 3/4 beat or more
    flat = sorted((t, t + n, p, role) for role, *_, notes in parts for t, n, p, _ in notes)
    clash = [(t2, a, p, b, p2) for i, (t, e, p, a) in enumerate(flat) for t2, e2, p2, b in flat[i + 1:]
             if t2 < e and a != b and abs(p - p2) in (1, 13) and min(e, e2) - t2 >= 0.75]
    assert not clash, (name, clash)
    return last


# ---- one-shot render: psx.render without the loop fold ----------------------------------------------------
def report(stderr):
    """The JSON block loudnorm prints at the end of ffmpeg's log."""
    i = stderr.rindex("{")
    return json.loads(stderr[i:stderr.index("}", i) + 1])


def render(name, bpm, parts, drums, fades):
    last = check(name, parts, drums)
    song = Song(bpm=bpm, bars=math.ceil(last / 4))
    for _, ch, prog, vol, pan, notes in parts:
        song.add(channel=ch, program=prog, notes=notes, volume=vol, pan=pan)
    song.drum(drums, volume=80)
    out = os.path.join(OUT, name)
    mid = song.midi()
    for ch, t0, t1 in fades:  # Song.midi writes one track per part, in order
        fade(mid.tracks[[c for _, c, *_ in parts].index(ch)], ch, t0, t1)
    mid.save(out + ".mid")
    wav = out + ".wav"
    # same fluidsynth settings as psx.render
    subprocess.run([FLUID, "-ni", "-g", "0.8", "-r", str(SR), "-o", "synth.reverb.room-size=0.35",
                    "-o", "synth.reverb.damp=0.5", "-o", "synth.reverb.level=0.45", "-o", "synth.chorus.active=0",
                    "-F", wav, os.path.join(TOOLS, SOUNDFONTS["MuseScore_General"]), out + ".mid"],
                   check=True, capture_output=True)
    with wave.open(wav) as w:
        p, raw = w.getparams(), w.readframes(w.getnframes())
    x = np.frombuffer(raw, dtype=np.int16).reshape(-1, p.nchannels).astype(np.float32) / 32768
    peak, w = np.abs(x).max(), int(0.05 * SR)
    start = max(0, np.flatnonzero(np.abs(x).max(1) > peak * 10 ** (-54 / 20))[0] - int(0.01 * SR))  # 10 ms before the first sound
    rms = np.sqrt(np.mean(x[: len(x) // w * w].reshape(-1, w * p.nchannels) ** 2, axis=1))
    # the tail ends where 50 ms windows sit 50 dB under the peak, and at most 2.5 s past the last note-off
    end = min((np.flatnonzero(rms > peak * 10 ** (-50 / 20))[-1] + 1) * w, int((last * 60 / bpm + 2.5) * SR))
    x = x[start:end]
    x *= 0.9 / np.abs(x).max()  # same headroom as psx before the bit crusher
    with wave.open(wav, "wb") as w:
        w.setparams(p)
        w.writeframes((x * 32767).astype(np.int16).tobytes())
    dur = len(x) / SR
    # PS1 chain of psx.render, then the fade on the crushed signal so its quantization fades too
    ps1 = out + "_ps1.wav"
    af = f"lowpass=f=8500,aresample=22050,acrusher=bits=11:mode=lin:aa=1,aresample={SR},afade=t=out:st={dur - 0.4:.3f}:d=0.4"
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", wav, "-af", af, "-c:a", "pcm_f32le", ps1], check=True)
    # loudnorm, linear, to -16 LUFS and -2 dBTP; fed by ebur128 because loudnorm's own first pass reads these
    # short files about 0.5 dB quieter than ebur128, the meter the brief checks with
    m = ebur(ps1)
    ln = (f"loudnorm=I=-16:TP=-2:LRA=20:measured_I={m['I']}:measured_TP={m['TP']}:measured_LRA={m['LRA']}"
          f":measured_thresh={m['thresh']}:linear=true:print_format=json")
    r = subprocess.run(["ffmpeg", "-y", "-hide_banner", "-i", ps1, "-af", ln + f",aresample={SR}", "-c:a", "libvorbis",
                        "-q:a", "4", out + ".ogg"], capture_output=True, text=True, check=True)
    mode = report(r.stderr)["normalization_type"]
    os.remove(wav)
    os.remove(ps1)
    return out + ".ogg", mode


# ---- measure the delivered file -----------------------------------------------------------------------------
def ebur(path):
    """Integrated loudness, its gate threshold, loudness range and true peak from ffmpeg's ebur128 summary."""
    r = subprocess.run(["ffmpeg", "-hide_banner", "-i", path, "-af", "ebur128=peak=true", "-f", "null", "-"],
                       capture_output=True, text=True, check=True).stderr
    s = r[r.rindex("Summary:"):]
    get = lambda pat: float(re.search(pat + r":\s+(-?[\d.]+)", s)[1])  # noqa: E731
    return {"I": get("I"), "thresh": get("Threshold"), "LRA": get("LRA"), "TP": get("Peak")}


def measure(path):
    m = ebur(path)
    lufs, tp = m["I"], m["TP"]
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", path, "-f", "f32le", "-ac", "2", "-ar", str(SR), "-"],
                         capture_output=True, check=True).stdout
    x = np.frombuffer(raw, np.float32).reshape(-1, 2)
    db = lambda s: 20 * np.log10(max(float(np.sqrt(np.mean(s ** 2))), 1e-9))  # noqa: E731
    lead = np.flatnonzero(np.abs(x).max(1) > 10 ** (-60 / 20))[0] / SR
    return {"dur": len(x) / SR, "lufs": lufs, "tp": tp, "peak": 20 * np.log10(np.abs(x).max()),
            "lead_ms": lead * 1000, "end_db": db(x[-2205:]), "clip": int((np.abs(x) >= 0.999).sum())}


if __name__ == "__main__":
    os.makedirs(OUT, exist_ok=True)
    for name, build in (("vitoria", vitoria), ("derrota", derrota), ("chefe", chefe)):
        print(name)
        bpm, parts, drums, fades = build()
        parts = [(role, ch, prog, vol, pan, trim(notes)) for role, ch, prog, vol, pan, notes in parts]
        path, mode = render(name, bpm, parts, trim(drums), fades)
        r = measure(path)
        print(f"  -> {path}  {r['dur']:.2f} s  {r['lufs']:.1f} LUFS  TP {r['tp']:.1f} dBFS  sample peak {r['peak']:.1f}"
              f"  lead-in {r['lead_ms']:.0f} ms  last 50 ms {r['end_db']:.1f} dB  clipped {r['clip']}  loudnorm {mode}")
