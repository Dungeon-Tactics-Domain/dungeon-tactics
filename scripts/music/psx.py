"""PS1-style music pipeline: notes -> MIDI -> SoundFont (fluidsynth) -> PS1 filter -> looping .ogg.

Why this shape: PS1 games played a SEQ (a converted MIDI) through a small bank of ADPCM samples (VAB) with the
SPU hardware reverb. Same chain here: MIDI + SoundFont, then a lo-fi pass and a short reverb.

Usage from a song script:
    from psx import Song, render
    s = Song(bpm=92, bars=32)
    s.add(channel=0, program=48, notes=[(beat, length_in_beats, midi_pitch, velocity), ...])
    s.drum([(beat, length, drum_note, velocity), ...])     # channel 9
    render(s, "out/name", soundfont="MuseScore_General")   # writes name.mid, name.ogg
Beats count from 0 in quarter notes; the song loops after `bars` bars of 4 beats (beats_per_bar to change).
"""
import os
import subprocess
import wave

import mido
import numpy as np

TOOLS = os.environ.get("MUSIC_TOOLS", r"D:\Projetos\_musica-tools")  # soundfonts and fluidsynth live outside the repo
FLUID = os.path.join(TOOLS, r"fluid\fluidsynth-v2.6.2-win10-x64-cpp11\bin\fluidsynth.exe")
SOUNDFONTS = {"MuseScore_General": "MuseScore_General.sf2", "GeneralUser-GS": "GeneralUser-GS.sf2", "SGM": r"soundfonts\sgm\SGM-V2.01.sf2"}
PPQ = 480
SR = 44100


class Song:
    def __init__(self, bpm, bars, beats_per_bar=4):
        self.bpm, self.bars, self.bpb = bpm, bars, beats_per_bar
        self.parts = []  # (channel, program, volume 0-127, pan 0-127, notes)

    def add(self, channel, program, notes, volume=100, pan=64):
        assert channel != 9, "channel 9 is the drum kit: use drum()"
        self.parts.append((channel, program, volume, pan, notes))

    def drum(self, notes, volume=100):
        self.parts.append((9, 0, volume, 64, notes))

    def midi(self):
        mid = mido.MidiFile(ticks_per_beat=PPQ)
        for i, (ch, prog, vol, pan, notes) in enumerate(self.parts):
            tr = mido.MidiTrack()
            mid.tracks.append(tr)
            if i == 0:
                tr.append(mido.MetaMessage("set_tempo", tempo=mido.bpm2tempo(self.bpm)))
            tr.append(mido.Message("control_change", channel=ch, control=7, value=vol))
            tr.append(mido.Message("control_change", channel=ch, control=10, value=pan))
            if ch != 9:
                tr.append(mido.Message("program_change", channel=ch, program=prog))
            ev = []
            for beat, length, pitch, vel in notes:
                ev.append((round(beat * PPQ), 1, mido.Message("note_on", channel=ch, note=pitch, velocity=vel)))
                ev.append((round((beat + length) * PPQ), 0, mido.Message("note_off", channel=ch, note=pitch, velocity=0)))
            ev.sort(key=lambda e: (e[0], e[1]))  # note_off before note_on at the same tick
            t = 0
            for tick, _, msg in ev:
                tr.append(msg.copy(time=tick - t))
                t = tick
        return mid


def _loop_fold(path, loop_secs):
    """Fold the reverb tail past the loop point onto the start, so the file loops without a gap."""
    with wave.open(path) as w:
        p, raw = w.getparams(), w.readframes(w.getnframes())
    x = np.frombuffer(raw, dtype=np.int16).reshape(-1, p.nchannels).astype(np.float32)
    n = int(loop_secs * p.framerate)
    body, tail = x[:n].copy(), x[n:]
    body[: len(tail)] += tail[: len(body)]
    peak = np.abs(body).max() or 1
    body *= 0.9 * 32767 / peak  # normalize with headroom
    with wave.open(path, "wb") as w:
        w.setparams(p)
        w.writeframes(body.astype(np.int16).tobytes())


def render(song, out, soundfont="MuseScore_General", rate=22050, bits=11):
    """MIDI -> wav (fluidsynth) -> seamless loop -> PS1 filter -> ogg. `out` has no extension."""
    os.makedirs(os.path.dirname(out) or ".", exist_ok=True)
    song.midi().save(out + ".mid")
    loop_secs = song.bars * song.bpb * 60 / song.bpm
    wav = out + ".wav"
    sf = os.path.join(TOOLS, SOUNDFONTS[soundfont])
    # the song's own reverb is fluidsynth's; the tail goes 4 s past the end and is folded back
    # -T/-F make it a file render; -g gain; -r44100 renders at CD rate, the lo-fi comes after
    subprocess.run([FLUID, "-ni", "-g", "0.8", "-r", str(SR), "-o", "synth.reverb.room-size=0.35",
                    "-o", "synth.reverb.damp=0.5", "-o", "synth.reverb.level=0.45", "-o", "synth.chorus.active=0",
                    "-F", wav, sf, out + ".mid"], check=True, capture_output=True)
    _loop_fold(wav, loop_secs)
    # PS1 feel: low sample rate, few bits, dull top end (the 4-bit ADPCM banks)
    af = f"lowpass=f=8500,aresample={rate},acrusher=bits={bits}:mode=lin:aa=1,aresample={SR}"
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", wav, "-af", af, "-c:a", "libvorbis", "-q:a", "4",
                    out + ".ogg"], check=True)
    os.remove(wav)
    return out + ".ogg"
