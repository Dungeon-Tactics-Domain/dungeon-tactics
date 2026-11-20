"""Measures the slot_*.ogg loops (levels, spectrum, loop seam, stereo, silence) and writes medicoes.md."""
import subprocess
import sys
from pathlib import Path

import numpy as np
from scipy.signal import welch

EVAL = Path(r"D:\Projetos\_musica-tools\eval")
OUT = EVAL / "analysis" / "medicoes.md"
SR = 44100
BANDS = [("<150", 0, 150), ("150-2k", 150, 2000), ("2-5k", 2000, 5000), (">5k", 5000, 30000)]


def load(p):
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", str(p), "-f", "f32le", "-ac", "2", "-ar", str(SR), "-"],
                         capture_output=True, check=True).stdout
    return np.frombuffer(raw, np.float32).reshape(-1, 2).astype(np.float64)


def db(x):
    return 20 * np.log10(max(x, 1e-9))


def rms(x):
    return float(np.sqrt(np.mean(x ** 2)))


def psd(mono):
    return welch(mono, SR, nperseg=8192)


def bands_centroid(mono):
    f, p = psd(mono)
    tot = p.sum()
    sh = [100 * p[(f >= lo) & (f < hi)].sum() / tot for _, lo, hi in BANDS]
    return float((f * p).sum() / tot), sh


def measure(x):
    m = x.mean(1)
    n = len(x)
    r = {"dur": n / SR, "rms": db(rms(x)), "peak": db(np.abs(x).max())}
    secs = np.array_split(np.arange(n), 5)
    r["sec_db"] = [db(rms(x[i])) for i in secs]
    r["sec_cent"] = [bands_centroid(m[i])[0] for i in secs]
    r["cent"], r["bands"] = bands_centroid(m)
    # seam: last 2 s vs first 2 s
    a, b = m[-2 * SR:], m[:2 * SR]
    r["seam_rms"] = db(rms(b)) - db(rms(a))
    fa, pa = psd(a)
    _, pb = psd(b)
    k = (fa >= 20) & (fa <= 16000)
    r["seam_spec"] = float(np.mean(np.abs(10 * np.log10(pa[k] + 1e-14) - 10 * np.log10(pb[k] + 1e-14))))
    # wrap jump vs typical sample step around the wrap point, worst channel
    jumps = []
    for c in range(2):
        d = np.abs(np.diff(np.concatenate([x[-SR:, c], x[:SR, c]])))
        wrap = abs(x[0, c] - x[-1, c])
        jumps.append((wrap, wrap / max(np.percentile(d, 99.9), 1e-9)))
    r["wrap_jump"] = max(j for j, _ in jumps)
    r["wrap_ratio"] = max(j for _, j in jumps)
    r["edge_start"] = db(rms(x[:2205]))
    r["edge_end"] = db(rms(x[-2205:]))
    # stereo
    mid, side = (x[:, 0] + x[:, 1]) / 2, (x[:, 0] - x[:, 1]) / 2
    r["side_mid"] = db(rms(side)) - db(rms(mid))
    r["corr"] = float(np.corrcoef(x[:, 0], x[:, 1])[0, 1])
    # near-silence: 50 ms windows under -60 dBFS, runs longer than 1 s
    w = 2205
    lv = np.array([db(rms(m[i * w:(i + 1) * w])) for i in range(n // w)])
    runs, c = [], 0
    for q in list(lv < -60) + [False]:
        if q:
            c += 1
        else:
            if c * w / SR > 1:
                runs.append(round(c * w / SR, 2))
            c = 0
    r["silent_runs"] = runs
    r["min_win"] = float(lv.min())
    return r


def rank(res, key):
    names = sorted(res, key=lambda s: res[s][key], reverse=True)
    return " > ".join(f"{s}({res[s][key]:.1f})" for s in names)


def main():
    res = {p.stem[-1]: measure(load(p)) for p in sorted(EVAL.glob("slot_?.ogg"))}
    for r in res.values():
        r["b150"], r["b2k"], r["b25"], r["b5"] = r["bands"]
        r["sec_range"] = max(r["sec_db"]) - min(r["sec_db"])
        r["seam_abs"] = abs(r["seam_rms"])
    L = ["# Measurements of slot_A..F (by code, numpy/scipy; no listening)", "",
         "## Summary table", "",
         "| slot | dur s | RMS dB | peak dB | centroid Hz | <150 % | 150-2k % | 2-5k % | >5k % | seam RMS dB | seam spec dB | wrap jump | side/mid dB | corr | silent >1s |",
         "|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|"]
    for s, r in res.items():
        L.append(f"| {s} | {r['dur']:.1f} | {r['rms']:.1f} | {r['peak']:.1f} | {r['cent']:.0f} | {r['b150']:.1f} | {r['b2k']:.1f} | {r['b25']:.1f} | {r['b5']:.1f} | {r['seam_rms']:+.1f} | {r['seam_spec']:.1f} | {r['wrap_jump']:.4f} ({r['wrap_ratio']:.1f}x p99.9) | {r['side_mid']:.1f} | {r['corr']:.2f} | {r['silent_runs'] or '-'} |")
    L += ["", "## Per-section (5 equal sections)", "",
          "| slot | level dB per section | centroid Hz per section | section range dB |", "|---|---|---|---|"]
    for s, r in res.items():
        L.append(f"| {s} | {' / '.join(f'{v:.1f}' for v in r['sec_db'])} | {' / '.join(f'{v:.0f}' for v in r['sec_cent'])} | {r['sec_range']:.1f} |")
    L += ["", "## Loop seam details (last 2 s vs first 2 s; wrap = jump between last and first sample)", ""]
    for s, r in res.items():
        L.append(f"- {s}: first/last 50 ms RMS {r['edge_start']:.1f} / {r['edge_end']:.1f} dB; seam RMS diff {r['seam_rms']:+.2f} dB; spectral distance {r['seam_spec']:.2f} dB (mean abs log-PSD, 20 Hz-16 kHz); wrap jump {r['wrap_jump']:.5f} = {r['wrap_ratio']:.1f}x the p99.9 sample step; quietest 50 ms window {r['min_win']:.1f} dB")
    mean25 = np.mean([r["b25"] for r in res.values()])
    mean150 = np.mean([r["b150"] for r in res.values()])
    L += ["", f"## Risk flags (vs mean of the slots: 2-5k {mean25:.1f} %, <150 {mean150:.1f} %)", ""]
    for s, r in res.items():
        fl = []
        if r["b25"] > 1.5 * mean25:
            fl.append("SHRILL risk (2-5 kHz share > 1.5x mean)")
        if r["b150"] > 1.25 * mean150:
            fl.append("MUD risk (<150 Hz share > 1.25x mean)")
        if r["wrap_ratio"] > 3:
            fl.append("possible CLICK at wrap")
        if r["silent_runs"]:
            fl.append(f"near-silent stretch {r['silent_runs']} s")
        L.append(f"- {s}: {', '.join(fl) or 'no flag'}")
    L += ["", "## Rankings (high to low)", ""]
    for k, lab in [("rms", "Integrated RMS dB"), ("peak", "Peak dB"), ("cent", "Centroid Hz"), ("b150", "<150 Hz share %"),
                   ("b25", "2-5 kHz share %"), ("b5", ">5 kHz share %"), ("sec_range", "Section level range dB"),
                   ("seam_abs", "|seam RMS diff| dB"), ("seam_spec", "Seam spectral distance dB"),
                   ("wrap_ratio", "Wrap jump ratio"), ("side_mid", "Side/mid dB")]:
        L.append(f"- {lab}: {rank(res, k)}")

    def top(k):
        return sorted(res, key=lambda s: res[s][k], reverse=True)

    g = lambda k, i: res[top(k)[i]]
    L += ["", "## Observations (all measured)", "",
          f"- Loudest by RMS: {top('rms')[0]} ({g('rms', 0)['rms']:.1f} dB), quietest {top('rms')[-1]} ({g('rms', -1)['rms']:.1f} dB); spread {g('rms', 0)['rms'] - g('rms', -1)['rms']:.1f} dB; max peak {max(r['peak'] for r in res.values()):.1f} dB. (measured)",
          f"- Highest 2-5 kHz share: {top('b25')[0]} ({g('b25', 0)['b25']:.1f} %) vs lowest {top('b25')[-1]} ({g('b25', -1)['b25']:.1f} %); highest centroid {top('cent')[0]} ({g('cent', 0)['cent']:.0f} Hz). (measured)",
          f"- Highest <150 Hz share: {top('b150')[0]} ({g('b150', 0)['b150']:.1f} %), lowest {top('b150')[-1]} ({g('b150', -1)['b150']:.1f} %). (measured)",
          f"- Seam: smoothest by spectral distance {top('seam_spec')[-1]} ({g('seam_spec', -1)['seam_spec']:.1f} dB), roughest {top('seam_spec')[0]} ({g('seam_spec', 0)['seam_spec']:.1f} dB, RMS diff {g('seam_spec', 0)['seam_rms']:+.1f} dB); largest wrap jump ratio {top('wrap_ratio')[0]} ({g('wrap_ratio', 0)['wrap_ratio']:.1f}x). (measured)",
          f"- Widest stereo {top('side_mid')[0]} (side/mid {g('side_mid', 0)['side_mid']:.1f} dB), narrowest {top('side_mid')[-1]} ({g('side_mid', -1)['side_mid']:.1f} dB); slots with silence >1 s: {[s for s, r in res.items() if r['silent_runs']] or 'none'}; widest section level range {top('sec_range')[0]} ({g('sec_range', 0)['sec_range']:.1f} dB). (measured)"]
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text("\n".join(L) + "\n", encoding="utf-8")
    print("\n".join(L))


if __name__ == "__main__":
    sys.exit(main())
