"""Re-voice a General MIDI file for the Tactical Fantasy Guy (PSX) soundfont and render it with the PS1 chain.

That soundfont is not General MIDI (27 custom presets, no bass, no drum kit), so programs are remapped here,
the contrabass becomes celli, and the drum track becomes timpani (kick, toms), a snare preset and a cymbal preset.
Run: python scripts/music/tfg_remap.py <in.mid> <bars> <bpm> <out-without-extension>
"""
import sys

import mido

import psx

psx.SOUNDFONTS["TFG"] = r"tactical-fantasy-guy\Tactical Fantasy Guy PSX.sf2"

PROGRAM = {42: 5, 43: 5, 32: 5, 33: 5, 48: 6, 56: 13, 60: 25, 47: 9, 68: 19, 46: 8, 49: 10, 52: 12, 73: 20, 24: 7, 61: 15, 75: 20, 79: 20, 108: 2}  # GM -> TFG preset
BASS = {32, 33, 43}  # GM basses become celli, an octave up when they would fall under the celli range
TIMP, SNARE, CYMBAL, BELL = 7, 8, 10, 11  # new channels for the former drum track
KICK, TOMS, SNARES, CRASH = {36}, {41, 43, 45, 47, 48, 50}, {37, 38, 39, 40}, {49, 51, 57}  # GM drum notes
CONGAS, TRIANGLE = {62, 63, 64}, {81}  # hand drums become soft timpani, the triangle a glockenspiel ping


def remap(path):
    mid = mido.MidiFile(path)
    bass = {m.channel for track in mid.tracks for m in track if m.type == "program_change" and m.program in BASS}
    for track in mid.tracks:
        for i, m in enumerate(track):
            if m.type == "program_change" and m.channel in range(9):
                m.program = PROGRAM[m.program]
            elif m.type in ("note_on", "note_off"):
                if m.channel != 9:
                    if m.channel in bass and m.note < 36:  # the bass line is now celli: keep it inside their range
                        m.note += 12
                    continue
                if m.note in KICK:
                    m.channel, m.note = TIMP, 38
                elif m.note in TOMS:
                    m.channel, m.note = TIMP, m.note + 2
                elif m.note in SNARES:
                    m.channel, m.note = SNARE, 60
                elif m.note in CRASH:
                    m.channel, m.note = CYMBAL, 60
                elif m.note in CONGAS:
                    m.channel, m.note, m.velocity = TIMP, {64: 45, 63: 50, 62: 52}[m.note], m.velocity * 2 // 3
                elif m.note in TRIANGLE:
                    m.channel, m.note = BELL, 96
                else:  # hats and the like: the bank has none, so keep the delta time and play nothing
                    track[i] = mido.Message("note_off", channel=9, note=m.note, velocity=0, time=m.time)
    setup = [mido.Message("program_change", channel=TIMP, program=9, time=0),
             mido.Message("program_change", channel=SNARE, program=22, time=0),
             mido.Message("program_change", channel=CYMBAL, program=23, time=0),
             mido.Message("program_change", channel=BELL, program=1, time=0)]
    setup += [mido.Message("control_change", channel=c, control=7, value=v, time=0)
              for c, v in ((TIMP, 100), (SNARE, 96), (CYMBAL, 70), (BELL, 80))]
    mid.tracks[-1][:0] = setup
    return mid


class Piece:
    def __init__(self, mid, bars, bpm):
        self._mid, self.bars, self.bpm, self.bpb = mid, bars, bpm, 4

    def midi(self):
        return self._mid


if __name__ == "__main__":
    src, bars, bpm, out = sys.argv[1], int(sys.argv[2]), float(sys.argv[3]), sys.argv[4]
    print("wrote", psx.render(Piece(remap(src), bars, bpm), out, soundfont="TFG"))
