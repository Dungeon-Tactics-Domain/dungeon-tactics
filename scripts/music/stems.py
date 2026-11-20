"""Split a MIDI into one looping .ogg per channel (stems), for a live mixer on the lab page.

Why: muting an instrument live without a synthesizer in the browser means playing pre-rendered stems together.
Each stem goes through the same fluidsynth settings and PS1 filter as psx.render; one common gain (not one per stem)
keeps the stems' balance, and it is chosen so the SUM lands near -14 LUFS with the peak under -2 dBFS.

Usage: python stems.py <midi> <soundfont key in psx.SOUNDFONTS> <loop_secs> <out_dir>
Writes <out_dir>/<channel>.ogg and <out_dir>/stems.json (name and program per channel).
"""
import json
import math
import os
import subprocess
import sys
import tempfile
import wave

import mido
import numpy as np

from psx import FLUID, SOUNDFONTS, SR, TOOLS

GM = ["Piano", "Percussão melódica", "Órgão", "Violão/guitarra", "Baixo", "Cordas", "Conjunto de cordas", "Metais",
      "Palhetas", "Flautas", "Lead", "Pad", "Efeitos", "Étnicos", "Percussão", "Efeitos sonoros"]


def split_channels(path):
    """One MIDI per channel: the tempo and meta events stay in every file, only that channel's notes and controls."""
    src = mido.MidiFile(path)
    chans = sorted({m.channel for t in src.tracks for m in t if m.type == "note_on"})
    out = {}
    for ch in chans:
        mid = mido.MidiFile(ticks_per_beat=src.ticks_per_beat)
        for t in src.tracks:
            keep = [m for m in t if m.is_meta or getattr(m, "channel", ch) == ch]
            # delta times of the dropped messages must not vanish: mido keeps them if we carry the time over
            tr, carry = mido.MidiTrack(), 0
            for m in t:
                if m.is_meta or getattr(m, "channel", ch) == ch:
                    tr.append(m.copy(time=m.time + carry))
                    carry = 0
                else:
                    carry += m.time
            if keep:
                mid.tracks.append(tr)
        out[ch] = mid
    return src, out


def program_of(mid, ch):
    for t in mid.tracks:
        for m in t:
            if m.type == "program_change" and m.channel == ch:
                return m.program
    return None


def read(path):
    with wave.open(path) as w:
        return np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16).reshape(-1, w.getnchannels()).astype(np.float32)


def main(midi, sf_key, loop_secs, out_dir, fx=None, chain=None):
    """fx: fluidsynth reverb overrides (room, damp, width, level); chain: ffmpeg filters applied on the loop played twice, so echoes wrap around the seam"""
    fx = {"room": 0.35, "damp": 0.5, "width": 0.5, "level": 0.45, **(fx or {})}
    os.makedirs(out_dir, exist_ok=True)
    sf = os.path.join(TOOLS, SOUNDFONTS[sf_key])
    src, parts = split_channels(midi)
    n = int(loop_secs * SR)
    bodies, info = {}, {}
    with tempfile.TemporaryDirectory() as tmp:
        for ch, mid in parts.items():
            mpath, wpath = os.path.join(tmp, f"{ch}.mid"), os.path.join(tmp, f"{ch}.wav")
            mid.save(mpath)
            subprocess.run([FLUID, "-ni", "-g", "0.8", "-r", str(SR), "-o", f"synth.reverb.room-size={fx['room']}",
                            "-o", f"synth.reverb.damp={fx['damp']}", "-o", f"synth.reverb.width={fx['width']}", "-o", f"synth.reverb.level={fx['level']}", "-o", "synth.chorus.active=0",
                            "-F", wpath, sf, mpath], check=True, capture_output=True)
            x = read(wpath)
            body, tail = x[:n].copy(), x[n:]
            if len(body) < n:  # a stem that ends early still has to be loop_secs long
                body = np.vstack([body, np.zeros((n - len(body), 2), np.float32)])
            body[: len(tail)] += tail[: len(body)]  # fold the reverb tail onto the start, as psx does
            bodies[ch] = body
            prog = program_of(src, ch)
            info[ch] = {"canal": ch + 1, "programa": prog, "nome": "Bateria" if ch == 9 else GM[(prog or 0) >> 3]}
        mix = sum(bodies.values())
        peak = np.abs(mix).max() or 1
        # one gain for all: first the sum to -14 LUFS measured by ffmpeg, then capped so the peak stays under -2 dBFS
        with wave.open(os.path.join(tmp, "mix.wav"), "wb") as w:
            w.setnchannels(2), w.setsampwidth(2), w.setframerate(SR)
            w.writeframes((mix * (0.9 * 32767 / peak)).astype(np.int16).tobytes())
        r = subprocess.run(["ffmpeg", "-hide_banner", "-i", os.path.join(tmp, "mix.wav"), "-af", "ebur128", "-f", "null", "-"],
                           capture_output=True, text=True)
        lufs = float([l for l in r.stderr.splitlines() if " I:" in l][-1].split("I:")[1].split("LUFS")[0])
        base = 0.9 * 32767 / peak  # sum at 0.9 full scale
        gain = base * min(10 ** ((-14 - lufs) / 20), 10 ** (-2 / 20) / 0.9)
        for ch, body in bodies.items():
            wav = os.path.join(tmp, f"s{ch}.wav")
            with wave.open(wav, "wb") as w:
                w.setnchannels(2), w.setsampwidth(2), w.setframerate(SR)
                w.writeframes(np.clip(body * gain, -32768, 32767).astype(np.int16).tobytes())
            af = "lowpass=f=8500,aresample=22050,acrusher=bits=11:mode=lin:aa=1,aresample=44100"
            if chain:  # play the loop twice, filter, keep the second pass: the echo tail of the end lands on the start
                af = f"aloop=loop=1:size={n}:start=0,{chain},atrim=start={loop_secs},asetpts=PTS-STARTPTS," + af
            subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", wav, "-af", af, "-c:a", "libvorbis", "-q:a", "3",
                            os.path.join(out_dir, f"{ch}.ogg")], check=True)
    json.dump({"duracao": loop_secs, "stems": list(info.values())}, open(os.path.join(out_dir, "stems.json"), "w"),
              ensure_ascii=False, indent=1)
    print("stems", len(info), "sum LUFS before gain", lufs, "gain", round(20 * math.log10(gain / base), 2), "dB")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2], float(sys.argv[3]), sys.argv[4])
