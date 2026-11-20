"""Three one-shot jingles for Dungeon Tactics, dark lo-fi folk (brief: BRIEF_JINGLES_LOFI.md), all in E.

One motif ties them: B4-E5-F#5 (a rising fourth, then a step) reaching for the minor third G5.
  vitoria  76 bpm  ocarina sings the motif over rolled nylon guitar, cello and warm pad: Em9 Cmaj7 D A Em9.
                   The A major (Dorian IV, its C#) is the one lit turn; the line closes C#-A-B, open on the fifth.
  derrota  60 bpm  pan flute starts the motif and falls back before reaching G; the cello sinks E-D-C-A under a
                   soft piano; it stops on Am9 with the melody on B (unresolved); the celesta echoes only B-E.
  chefe    72 bpm  the harp states the motif, the ocarina answers and climbs to B5 while pad, cello and a shaker
                   ("rain") swell; Cmaj7 Am9 lands on E major (minor plagal, no dominant), the melody walks down
                   B-A-G#-F#-E and the shaker stops at the arrival.
Rendered once (no loop): fluidsynth with psx.render's settings, natural tail, PS1 filter, 0.4 s fade, loudnorm.
Run: python scripts/music/jingles_F.py   (writes <MUSIC_TOOLS>/jingles/F/{vitoria,derrota,chefe}.mid/.ogg)
"""
import json
import os
import re
import subprocess
import wave

import mido
import numpy as np

from psx import FLUID, PPQ, SOUNDFONTS, SR, TOOLS, Song

OUT = os.path.join(TOOLS, "jingles", "F")
PS1 = f"lowpass=f=8500,aresample=22050,acrusher=bits=11:mode=lin:aa=1,aresample={SR}"  # psx.render's chain
LOUD = "loudnorm=I=-16:TP=-2.5:LRA=20"  # TP 0.5 dB under the -2 limit: the vorbis encode moves peaks a little
STEP = {"C": 0, "D": 2, "E": 4, "F": 5, "G": 7, "A": 9, "B": 11}


def pitch(name):
    return 12 * (int(name[-1]) + 1) + STEP[name[0]] + name.count("#") - name[1:].count("b")


def pcs(names):
    return {pitch(n + "4") % 12 for n in names.split()}


# Chord tones plus the tensions a held melody note may take (add9 on minor chords, 9th on the major ones).
TONES = {k: pcs(v) for k, v in {
    "Em9": "E G B F#", "Em/D": "D E G B F#", "Cmaj7": "C E G B D", "D": "D F# A E", "A": "A C# E B",
    "Am7": "A C E G", "Am9": "A C E G B", "E9": "E G# B F#"}.items()}


def seq(start, text):
    """'PITCH:BEATS:VELOCITY' tokens one after another."""
    out, t = [], start
    for tok in text.split():
        name, dur, v = tok.split(":")
        out.append((t, float(dur), pitch(name), int(v)))
        t += float(dur)
    return out


def chord(t, end, names, v):
    return [(t, end - t, pitch(n), v) for n in names.split()]


def roll(t, end, names, v, step=0.1):
    """A soft strum, low string first; every string rings until `end` (the next chord)."""
    return [(t + i * step, end - t - i * step, pitch(n), v - 2 * i) for i, n in enumerate(names.split())]


def arp(t, end, names, v, step=0.5):
    """Rising broken chord, each note ringing until the chord changes."""
    return [(t + i * step, end - t - i * step, pitch(n), v + (4 if i == 0 else -2 * (i % 2)))
            for i, n in enumerate(names.split()) if t + i * step < end]


def hits(note, pairs):
    return [(t, 0.25, note, v) for t, v in pairs]


LOW_CONGA, HI_BONGO, MARACAS, TRIANGLE = 64, 60, 70, 81  # GM kit: hand drums, shaker, finger-cymbal stand-in
OCARINA, PAN_FLUTE, PIANO, CELESTA, NYLON, HARP, CELLO, WARM_PAD = 79, 75, 0, 8, 24, 46, 42, 89

# ---- vitoria: the room is won, not the day ----------------------------------------------------------------
V_END = 8.2
vitoria = {
    "bpm": 76, "tail": 2.2, "secs": (6, 9), "melody": ["ocarina", "celesta"], "bass": "cello",
    "chords": [(0, 2, "Em9"), (2, 3, "Cmaj7"), (3, 4, "D"), (4, 6, "A"), (6, 99, "Em9")],
    "parts": {  # name: (channel, program, volume, pan, notes)
        "ocarina": (0, OCARINA, 84, 70, seq(0, "B4:.5:52 E5:1:60 F#5:.5:56 G5:1:64 F#5:.5:56 E5:.5:50 "
                                                 "C#5:1.5:62 A4:.5:48 B4:2.2:56")),
        "guitar": (1, NYLON, 92, 48, roll(0, 2, "E3 B3 F#4 G4", 50) + roll(2, 3, "C3 G3 B3 E4", 44)
                   + roll(3, 4, "D3 A3 D4 F#4", 46) + roll(4, 6, "E3 A3 C#4 E4", 52)
                   + roll(6, V_END, "E3 B3 F#4 G4 B4", 48, step=0.15)),
        "cello": (2, CELLO, 56, 60, seq(0, "E2:2:58 C2:1:60 D2:1:62 A2:2:66 E2:2.2:58")),
        "pad": (3, WARM_PAD, 90, 64, chord(0, 3, "G3 B3 E4", 42) + chord(3, 4, "F#3 A3 D4", 48)
                + chord(4, 6, "A3 C#4 E4", 54) + chord(6, V_END, "G3 B3 E4", 48)),
        "celesta": (4, CELESTA, 96, 82, seq(6.5, "F#5:1.7:48")),  # the add9 glint over the last chord
    },
    "drums": hits(MARACAS, [(2, 34), (2.5, 44), (3, 36), (3.5, 48), (4, 38), (4.5, 50), (5, 37), (5.5, 46)])
    + hits(LOW_CONGA, [(4, 50), (6, 58)]) + hits(HI_BONGO, [(5.5, 32)]) + hits(TRIANGLE, [(6, 40)]),
}

# ---- derrota: carried back, tired and tender --------------------------------------------------------------
D_END = 8.5
derrota = {
    "bpm": 60, "tail": 2.0, "secs": (7, 11), "melody": ["flute", "celesta"], "bass": "cello",
    "chords": [(0, 3, "Em9"), (3, 4, "Em/D"), (4, 6, "Cmaj7"), (6, 99, "Am9")],
    "parts": {
        "flute": (0, PAN_FLUTE, 86, 66, seq(0, "B4:1:48 E5:1.5:56 F#5:.5:52 E5:1:46 B4:1.5:44 A4:.5:38 B4:2.5:40")),
        "piano": (1, PIANO, 86, 56, roll(0, 4, "E2 B2 G3 B3 F#4", 46, step=0.05) + roll(4, 6, "G3 B3 E4", 40, 0.05)
                  + roll(6, D_END, "G3 C4 E4", 36, step=0.06)),
        "cello": (2, CELLO, 56, 62, seq(0, "E3:3:48 D3:1:44 C3:2:46 A2:2.5:42")),  # tenor lament, audible small
        "pad": (3, WARM_PAD, 84, 64, chord(0, 6, "G3 B3 E4", 34) + chord(6, D_END, "G3 C4 E4", 32)),
        "celesta": (4, CELESTA, 80, 80, seq(7, "B4:.5:40 E5:1:36")),  # the motif's first step, left hanging
    },
    "drums": hits(LOW_CONGA, [(0, 46), (2, 38), (4, 32)]) + hits(TRIANGLE, [(6, 28)]),  # slow steps, then still
}

# ---- chefe: the boss is down, the rain stops ---------------------------------------------------------------
C_END = 14.5
chefe = {
    "bpm": 72, "tail": 2.3, "secs": (10, 15), "melody": ["ocarina", "harp", "celesta"], "bass": "cello",
    "chords": [(0, 2, "Em9"), (2, 4, "Cmaj7"), (4, 6, "Am7"), (6, 8, "D"), (8, 10, "Cmaj7"), (10, 11, "Am9"),
               (11, 99, "E9")],
    "parts": {
        "harp": (0, HARP, 92, 76, seq(0, "B4:.5:64 E5:1:74 F#5:.5:66 G5:1.5:76 E5:.5:62")
                 + arp(4, 6, "A3 C4 E4 G4", 40) + arp(6, 8, "A3 D4 F#4 A4", 42) + arp(8, 10, "G3 C4 E4 B4", 44)
                 + arp(10, 11, "A3 C4 E4 B4", 44, step=0.25) + roll(11, C_END, "E3 B3 E4 F#4 G#4 B4", 50, 0.12)),
        "ocarina": (1, OCARINA, 84, 60, seq(4, "C5:.5:46 E5:1:52 G5:.5:50 F#5:1.5:56 E5:.5:48 G5:.5:56 "
                                                 "B5:1.5:66 A5:1:62 G#5:1.5:64 F#5:.5:54 E5:1.5:52")),
        "guitar": (2, NYLON, 92, 46, roll(8, 10, "C3 G3 C4 E4", 44) + roll(10, 11, "E3 A3 C4 E4", 46)
                   + roll(11.25, C_END, "E3 B3 E4 G#4", 46, step=0.15)),  # a beat-quarter after the harp
        "cello": (3, CELLO, 58, 60, seq(0, "E2:2:58 C2:2:60 A2:2:62 D3:2:66 C3:2:72 A2:1:74 E2:3.5:68")),
        "pad": (4, WARM_PAD, 92, 64, chord(0, 4, "G3 B3 E4", 40) + chord(4, 6, "G3 C4 E4", 44)
                + chord(6, 8, "F#3 A3 D4", 52) + chord(8, 11, "G3 C4 E4", 60) + chord(11, C_END, "G#3 B3 E4", 56)),
        "celesta": (5, CELESTA, 104, 84, seq(11.5, "B5:3:54")),
    },
    "drums": hits(MARACAS, [(k / 2, 28 + k + (6 if k % 2 else 0)) for k in range(22)])  # rain until the arrival
    + hits(LOW_CONGA, [(4, 44), (6, 50), (8, 56), (10, 62), (11, 66)]) + hits(TRIANGLE, [(11, 48), (13, 30)]),
}


# ---- checks on the notes ----------------------------------------------------------------------------------
def check(name, j):
    """Guardrails from the brief; returns the last note-off in seconds."""
    parts, drums = j["parts"], j["drums"]

    def tones(t):
        return next(TONES[c] for s, e, c in j["chords"] if s <= t < e)

    for part, (_, prog, vol, _, notes) in parts.items():
        ps, vs = [p for _, _, p, _ in notes], [v for *_, v in notes]
        assert 28 <= min(ps) and max(ps) <= 84, (name, part, min(ps), max(ps))  # bass from E1, nothing over C6
        assert all(n > 0.01 for _, n, _, _ in notes) and 1 <= min(vs) and max(vs) <= 127, (name, part)
        assert prog not in (42, 43) or vol <= 60, (name, part, "a cello or contrabass bass over 60 got muddy")
        print(f"  {part:8} notes {len(notes):3}  pitch {min(ps)}-{max(ps)}  velocity {min(vs)}-{max(vs)}")
    dv = [v for *_, v in drums]
    assert max(dv) <= 80 and len(set(dv)) > 1, (name, "percussion")
    print(f"  {'drums':8} hits  {len(drums):3}  velocity {min(dv)}-{max(dv)}")

    flat = sorted((t, t + n, p, part) for part, (*_, notes) in parts.items() for t, n, p, _ in notes)
    clash = [(round(t2, 2), a, p, b, q) for i, (t, e, p, a) in enumerate(flat) for t2, e2, q, b in flat[i + 1:]
             if t2 < e and a != b and abs(p - q) in (1, 13) and min(e, e2) - t2 >= 0.75]
    assert not clash, ("held semitone or minor ninth between parts", clash)
    off = [(part, t, p) for part in j["melody"] for t, n, p, _ in parts[part][4] if n >= 1 and p % 12 not in tones(t)]
    assert not off, ("held melody note outside the chord", off)

    def top(t):
        for part in j["melody"]:
            now = [p for s, n, p, _ in parts[part][4] if s <= t < s + n]
            if now:
                return max(now)

    pairs = [(b, top(t)) for t, _, b, _ in parts[j["bass"]][4]]
    par = [pair for pair in zip(pairs, pairs[1:]) if pair[0][1] and pair[1][1]
           and (pair[1][0] - pair[0][0]) * (pair[1][1] - pair[0][1]) > 0
           and (pair[0][1] - pair[0][0]) % 12 == (pair[1][1] - pair[1][0]) % 12 in (0, 7)]
    assert not par, ("parallel fifths or octaves, bass against melody", par)

    last = max(t + n for *_, notes in parts.values() for t, n, _, _ in notes) * 60 / j["bpm"]
    lo, hi = j["secs"]
    assert lo <= last + j["tail"] <= hi, (name, last, j["tail"])
    return last


# ---- one-shot render --------------------------------------------------------------------------------------
def ff(*args):
    return subprocess.run(["ffmpeg", "-y", "-hide_banner", "-nostats", *args], check=True, capture_output=True,
                          text=True, encoding="utf-8", errors="replace").stderr


def loudnorm_json(err):
    return json.loads(re.findall(r"\{[^{}]*\}", err)[-1])


def render_once(song, out, last, tail):
    """MIDI -> fluidsynth (psx.render's settings) -> crop to first note .. last note-off + tail -> PS1 filter
    -> 0.4 s fade -> loudnorm (two passes, linear) -> ogg. Returns the loudnorm mode and the peak-to-loudness."""
    mid = song.midi()
    end_tick = round((last + tail) * song.bpm / 60 * PPQ)
    for tr in mid.tracks:  # keep the player alive through the tail, so a short release never cuts the reverb
        tr.append(mido.MetaMessage("end_of_track", time=max(0, end_tick - sum(m.time for m in tr))))
    mid.save(out + ".mid")
    raw, cut, ps1 = out + ".raw.wav", out + ".cut.wav", out + ".ps1.wav"
    subprocess.run([FLUID, "-ni", "-g", "0.8", "-r", str(SR), "-o", "synth.reverb.room-size=0.35",
                    "-o", "synth.reverb.damp=0.5", "-o", "synth.reverb.level=0.45", "-o", "synth.chorus.active=0",
                    "-F", raw, os.path.join(TOOLS, SOUNDFONTS["MuseScore_General"]), out + ".mid"],
                   check=True, capture_output=True)
    with wave.open(raw) as w:
        x = np.frombuffer(w.readframes(w.getnframes()), np.int16).reshape(-1, 2).astype(np.float32) / 32768
    peak = float(np.abs(x).max())
    assert peak < 0.99, f"fluidsynth output clipped ({peak:.3f})"
    start = max(0, int(np.argmax(np.abs(x).max(1) > peak * 0.003)) - int(0.005 * SR))  # 5 ms before the onset
    x = x[start:int((last + tail) * SR)] * (0.9 / peak)  # same headroom as psx before the bit crusher
    with wave.open(cut, "wb") as w:
        w.setparams((2, 2, SR, 0, "NONE", "not compressed"))
        w.writeframes((x * 32767).astype(np.int16).tobytes())
    dur = len(x) / SR
    ff("-i", cut, "-af", f"{PS1},afade=t=out:st={dur - 0.4:.4f}:d=0.4", "-c:a", "pcm_s16le", ps1)
    m = loudnorm_json(ff("-i", ps1, "-af", LOUD + ":print_format=json", "-f", "null", "-"))
    lufs = ebur(ps1)[0]  # on files this short loudnorm reads ~0.35 dB under ebur128, the meter the brief uses
    second = ff("-i", ps1, "-af", f"{LOUD}:measured_I={lufs}:measured_TP={m['input_tp']}"
                f":measured_LRA={m['input_lra']}:measured_thresh={m['input_thresh']}"
                f":linear=true:print_format=json,aresample={SR}", "-c:a", "libvorbis", "-q:a", "4", out + ".ogg")
    for f in (raw, cut, ps1):
        os.remove(f)
    return loudnorm_json(second)["normalization_type"], float(m["input_tp"]) - lufs


def db(v):
    return 20 * np.log10(max(v, 1e-9))


def ebur(path):
    """Integrated loudness (LUFS) and true peak (dBTP) from ffmpeg's ebur128 summary."""
    err = ff("-i", path, "-af", "ebur128=peak=true", "-f", "null", "-").split("Summary:")[-1]
    return (float(re.search(r"I:\s+(-?[\d.]+) LUFS", err).group(1)),
            float(re.search(r"Peak:\s+(-?[\d.]+|-inf) dBFS", err).group(1)))


def measure(ogg):
    lufs, tp = ebur(ogg)
    pcm = subprocess.run(["ffmpeg", "-v", "error", "-i", ogg, "-f", "f32le", "-ac", "2", "-ar", str(SR), "-"],
                         capture_output=True, check=True).stdout
    x = np.frombuffer(pcm, np.float32).reshape(-1, 2).astype(np.float64)
    m, n = x.mean(1), len(x)

    def rms(a, b):
        return db(np.sqrt(np.mean(m[int(a * SR):int(b * SR)] ** 2)))

    body = max(rms(t, t + 0.4) for t in np.arange(0, n / SR - 0.4, 0.1))  # loudest 400 ms window
    return {"secs": n / SR, "lufs": lufs, "tp": tp, "sample_peak": db(np.abs(x).max()),
            "lead_ms": 1000 * int(np.argmax(np.abs(x).max(1) > 10 ** (-50 / 20))) / SR,
            "pre_fade_vs_body": rms(n / SR - 0.5, n / SR - 0.4) - body, "last_50ms": rms(n / SR - 0.05, n / SR)}


def main():
    os.makedirs(OUT, exist_ok=True)
    for name, j in {"vitoria": vitoria, "derrota": derrota, "chefe": chefe}.items():
        print(name)
        last = check(name, j)
        song = Song(bpm=j["bpm"], bars=int(last * j["bpm"] / 240) + 1)
        for ch, prog, vol, pan, notes in j["parts"].values():
            song.add(channel=ch, program=prog, notes=sorted(notes), volume=vol, pan=pan)
        song.drum(sorted(j["drums"]), volume=80)
        mode, crest = render_once(song, os.path.join(OUT, name), last, j["tail"])
        r = measure(os.path.join(OUT, name + ".ogg"))
        print(f"  {r['secs']:.2f} s (last note-off {last:.2f} s), {r['lufs']:.1f} LUFS, true peak {r['tp']:.1f} dBTP,"
              f" sample peak {r['sample_peak']:.1f} dBFS, peak-to-loudness {crest:.1f} dB, loudnorm {mode};"
              f" leading silence {r['lead_ms']:.0f} ms; 100 ms before the fade {r['pre_fade_vs_body']:.1f} dB under"
              f" the loudest 400 ms; last 50 ms {r['last_50ms']:.0f} dBFS")
        lo, hi = j["secs"]
        assert lo <= r["secs"] <= hi and abs(r["lufs"] + 16) <= 0.5 and r["tp"] < -2, r
        assert r["lead_ms"] <= 50 and r["last_50ms"] < -60 and r["sample_peak"] < 0, r


if __name__ == "__main__":
    main()
