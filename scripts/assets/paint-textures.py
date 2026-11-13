# Texturas pintadas do terreno, das árvores e da ponte (13/11, escolha do Fernando: "pintado, tipo FFT", depois de ver
# exemplos do FFT; antes eram fotos do Poly Haven, que não combinavam com os bonecos KayKit). Desenho nosso, gerado aqui:
# ruído suave em várias escalas, mapeado numa paleta de 4 a 5 tons (as manchas grandes de pincel), mais pinceladas
# curtas. Tudo emenda sem costura (o ruído é periódico). Uso: python -I scripts/assets/paint-textures.py public/tex
import sys
import numpy as np
from PIL import Image

N = 512
rng = np.random.default_rng(13)


def smooth_noise(cells):
    """ruído periódico: grade aleatória `cells` x `cells` ampliada com interpolação cúbica de borda a borda"""
    g = rng.random((cells, cells))
    big = np.tile(g, (3, 3))
    img = Image.fromarray((big * 255).astype(np.uint8)).resize((N * 3, N * 3), Image.BICUBIC)
    a = np.asarray(img, dtype=np.float32)[N:2 * N, N:2 * N] / 255
    return a


def fractal(scales, weights):
    v = sum(w * smooth_noise(s) for s, w in zip(scales, weights))
    v -= v.min()
    return v / v.max()


def palette(v, colors, edges=None):
    cols = np.array([[int(c[i:i + 2], 16) for i in (1, 3, 5)] for c in colors], dtype=np.float32)
    k = len(colors)
    idx = np.clip((v * k).astype(int), 0, k - 1) if edges is None else np.digitize(v, edges)
    return cols[idx]


def strokes(img, n, colors, length, width, vertical=False):
    """pinceladas curtas por cima, com volta na borda"""
    cols = [np.array([int(c[i:i + 2], 16) for i in (1, 3, 5)], dtype=np.float32) for c in colors]
    for _ in range(n):
        x, y = rng.integers(0, N, 2)
        ang = (np.pi / 2 if vertical else rng.random() * np.pi) + rng.normal(0, 0.2)
        c = cols[rng.integers(len(cols))]
        L = int(length * (0.6 + rng.random() * 0.8))
        for t in range(L):
            px = int(x + np.cos(ang) * t) % N
            py = int(y + np.sin(ang) * t) % N
            for w in range(-width // 2, width // 2 + 1):
                qx, qy = (px + int(-np.sin(ang) * w)) % N, (py + int(np.cos(ang) * w)) % N
                img[qy, qx] = img[qy, qx] * 0.35 + c * 0.65
    return img


def save(name, img, out):
    Image.fromarray(np.clip(img, 0, 255).astype(np.uint8)).save(f'{out}/{name}.jpg', quality=90)


def main(out):
    # grama: verde-musgo com manchas claras de sol, como o chão do FFT
    v = fractal([4, 9, 23], [0.55, 0.3, 0.15])
    g = palette(v, ['#2b4419', '#3a5a20', '#4d7228', '#638a30', '#82a33c'])
    save('grass', strokes(g, 900, ['#6f9a34', '#2f4c1b', '#93ad48'], 9, 2), out)
    # chão de folhas (perto das árvores): mais escuro, com folhas secas
    v = fractal([5, 12, 30], [0.5, 0.3, 0.2])
    l = palette(v, ['#2a3a18', '#3b4f1f', '#556528', '#6e6a2e', '#8a7a3a'])
    save('leaves', strokes(l, 1200, ['#8c6a2c', '#6b7c2e', '#3d5020'], 6, 2), out)
    # terra da estrada
    v = fractal([4, 10, 26], [0.5, 0.3, 0.2])
    d = palette(v, ['#5e4529', '#775a35', '#927343', '#ab8d56', '#c2a66d'])
    save('dirt', strokes(d, 700, ['#6b5030', '#b39a62', '#4d6a28'], 7, 2), out)
    # pedra das encostas: cinza-esverdeado em blocos, com rachaduras escuras
    v = fractal([3, 8, 20], [0.55, 0.3, 0.15])
    c = palette(v, ['#3e4139', '#51554a', '#666a5b', '#7d806c', '#979880'])
    save('cliff', strokes(c, 220, ['#2a2c26', '#3a4a2a'], 26, 2), out)
    # neve
    v = fractal([4, 10], [0.7, 0.3])
    s = palette(v, ['#aab7c6', '#c1ccd8', '#d6dfe8', '#e9eff5'])
    save('snow', strokes(s, 300, ['#f4f8fb', '#9fb0c2'], 8, 2), out)
    # copa: folhas em tufos, verde-escuro com bordas claras
    v = fractal([6, 14, 34], [0.45, 0.35, 0.2])
    f = palette(v, ['#1a3115', '#26451c', '#335a24', '#447230', '#5c8c3c'])
    save('foliage', strokes(f, 1600, ['#6a9a40', '#1c3416', '#4f7f34'], 5, 3), out)
    # casca: listras verticais marrom-acinzentadas
    v = fractal([3, 7, 18], [0.5, 0.3, 0.2])
    b = palette(v, ['#3b2c20', '#4f3b2a', '#664d36', '#7d6347', '#93795a'])
    save('bark', strokes(b, 600, ['#2c2018', '#8a7154', '#4a5a2c'], 40, 2, vertical=True), out)


if __name__ == '__main__':
    main(sys.argv[1] if len(sys.argv) > 1 else 'public/tex')
