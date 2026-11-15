# Dialogue face sheets for the game from the design lab's masters: frames bigger than 128 px are resampled to 128 with
# Lanczos (premultiplied alpha, so the transparent edge gets no dark fringe), every sheet is saved as lossless WebP and
# src/content/faces.json is rewritten to match. The approved art is only resized, never redrawn.
# Usage: python scripts/assets/faces-128.py <folder with the master sheets and their faces.json>
import json, sys
from pathlib import Path
from PIL import Image

FRAME = 128  # the size the dialogue box shows (talk.ts, faceSize): a whole ratio of every master (256 at half, 64 at 2x)
src = Path(sys.argv[1])
out = Path('public/chars/px')
out.mkdir(parents=True, exist_ok=True)
faces = json.loads((src / 'faces.json').read_text(encoding='utf-8'))
for id_, f in faces.items():
    im = Image.open(src / Path(f['sheet']).name).convert('RGBA')
    if f['frameSize'] > FRAME:
        im = im.convert('RGBa').resize((f['frames'] * FRAME, FRAME), Image.LANCZOS).convert('RGBA')
        f['frameSize'] = FRAME
    im.save(out / f'{id_}.webp', lossless=True, method=6)
    f['sheet'] = f'px/{id_}.webp'
Path('src/content/faces.json').write_text(json.dumps(faces, indent=1) + '\n', encoding='utf-8')
