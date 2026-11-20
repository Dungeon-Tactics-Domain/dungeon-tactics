"""Smoke check of the music pipeline: a 2-bar strings + drum loop must render a non-empty .ogg."""
import os, sys, tempfile
sys.path.insert(0, os.path.dirname(__file__))
from psx import Song, render

s = Song(bpm=100, bars=2)
s.add(0, 48, [(i, 1, 60 + (i % 4) * 2, 90) for i in range(8)])
s.drum([(i, 0.25, 36 if i % 2 == 0 else 38, 100) for i in range(8)])
for sf in ("MuseScore_General", "GeneralUser-GS"):
    out = render(s, os.path.join(tempfile.mkdtemp(), "t"), soundfont=sf)
    assert os.path.getsize(out) > 5000, sf
    print("ok", sf, os.path.getsize(out))
