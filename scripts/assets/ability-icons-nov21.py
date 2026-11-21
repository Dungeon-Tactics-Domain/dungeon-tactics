# The three ability icons of Nov 21 (Shove, Throw sand, Focus), drawn from cells of the approved atlas so they keep its
# pixel style: the Gust's wind recoloured as sand with grains, the Aimed shot's target without its arrow in gold, the
# Shield bash's shield mirrored in steel with motion lines. Appends a row to public/ui/fft/atlas-32.png and its .json.
# Run once: python scripts/assets/ability-icons-nov21.py (it refuses to run twice).
import colorsys
import json
import pathlib

from PIL import Image

ROOT = pathlib.Path(__file__).resolve().parents[2] / "public/ui/fft"
PNG, JSON = ROOT / "atlas-32.png", ROOT / "atlas-32.json"
C = 32
atlas = Image.open(PNG).convert("RGBA")
meta = json.loads(JSON.read_text(encoding="utf-8"))
NEW = ["empurrar", "jogar-areia", "focar"]
if NEW[0] in meta["icones"]:
    raise SystemExit("already appended")


def cell(name: str) -> Image.Image:
    i = meta["icones"].index(name)
    x, y = i % meta["colunas"], i // meta["colunas"]
    return atlas.crop((x * C, y * C, x * C + C, y * C + C))


def recolour(im: Image.Image, hue: float, sat: float, light: float = 1.0) -> Image.Image:
    out = im.copy()
    px = out.load()
    for y in range(C):
        for x in range(C):
            r, g, b, a = px[x, y]
            if not a:
                continue
            _, l, s = colorsys.rgb_to_hls(r / 255, g / 255, b / 255)
            nr, ng, nb = colorsys.hls_to_rgb(hue, min(1, l * light), min(1, s * sat + 0.25 * sat))
            px[x, y] = (round(nr * 255), round(ng * 255), round(nb * 255), a)
    return out


# sand: the wind in tan, with dark grains scattered on its stroke
sand = recolour(cell("rajada"), 0.11, 0.7, 1.05)
spx = sand.load()
for i, (x, y) in enumerate([(6, 9), (11, 22), (17, 6), (21, 17), (25, 11), (14, 14), (8, 26), (27, 24)]):
    spx[x, y] = (92, 64, 30, 255)
    if i % 2 == 0:
        spx[x + 1, y] = (150, 110, 60, 255)

# focus: a gold target drawn here in the atlas's way (dark outline, light rim, solid bands) with four sparkle rays
focus = Image.new("RGBA", (C, C))
fpx = focus.load()
DARK, GOLD, PALE, RED = (58, 40, 14, 255), (226, 170, 52, 255), (255, 236, 150, 255), (190, 60, 40, 255)
for y in range(C):
    for x in range(C):
        d = ((x - 15.5) ** 2 + (y - 15.5) ** 2) ** 0.5
        band = None
        if 10.5 <= d < 11.6 or 6.6 <= d < 7.5 or d < 0.1:
            band = DARK
        elif 9.4 <= d < 10.5:
            band = PALE
        elif 7.5 <= d < 9.4:
            band = GOLD
        elif 3.6 <= d < 6.6:
            band = PALE if d > 5.6 else GOLD
        elif 2.6 <= d < 3.6:
            band = DARK
        elif d < 2.6:
            band = RED
        if band:
            fpx[x, y] = band
for k in range(3):
    for x, y in ((15 - 0, 1 + k), (16, 1 + k), (15, 28 + k), (16, 28 + k), (1 + k, 15), (1 + k, 16), (28 + k, 15), (28 + k, 16)):
        fpx[x, y] = PALE if k < 2 else GOLD

# shove: the shield mirrored, steel grey, with three motion lines on its back
shield = recolour(cell("escudada").transpose(Image.FLIP_LEFT_RIGHT), 0.6, 0.15, 1.0)
hpx = shield.load()
for y in (10, 16, 22):
    for x in range(24, 30):
        hpx[x, y] = (210, 220, 230, 255) if x % 2 == 0 else (150, 165, 180, 255)

icons = [shield, sand, focus]
n = len(meta["icones"])
rows = (n + len(icons) + meta["colunas"] - 1) // meta["colunas"]
out = Image.new("RGBA", (atlas.width, rows * C))
out.paste(atlas, (0, 0))
for k, im in enumerate(icons):
    i = n + k
    out.paste(im, ((i % meta["colunas"]) * C, (i // meta["colunas"]) * C))
out.save(PNG)
meta["icones"] += NEW
JSON.write_text(json.dumps(meta, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
print("atlas", out.size, "icons", len(meta["icones"]))
