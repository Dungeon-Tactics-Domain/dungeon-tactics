"""Measures the battle slot_*.ogg loops (arc per 10 s, bands, seam, crest) and writes battle_medicoes.md."""
import subprocess
import sys
from pathlib import Path

import numpy as np
from scipy.signal import welch

SRC = Path(r"D:\Projetos\_musica-tools\eval\battle")
OUT = Path(r"D:\Projetos\_musica-tools\eval\analysis\battle_medicoes.md")
SR = 44100
# edges chosen to match the brief: mud <150 Hz, harshness 2-6 kHz and >6 kHz
BANDS = [("<60", 0, 60), ("60-150", 60, 150), ("150-500", 150, 500), ("500-2k", 500, 2000), ("2-6k", 2000, 6000), (">6k", 6000, 30000)]


def load(p):
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", str(p), "-f", "f32le", "-ac", "2", "-ar", str(SR), "-"],
                         capture_output=True, check=True).stdout
    return np.frombuffer(raw, np.float32).reshape(-1, 2).astype(np.float64)


def db(x):
    return 20 * np.log10(max(x, 1e-9))


def rms(x):
    return float(np.sqrt(np.mean(x ** 2)))


def shares(mono):
    f, p = welch(mono, SR, nperseg=8192)
    tot = p.sum()
    return [100 * p[(f >= lo) & (f < hi)].sum() / tot for _, lo, hi in BANDS], float((f * p).sum() / tot)


def measure(x):
    m = x.mean(1)
    n = len(x)
    r = {"dur": n / SR, "rms": db(rms(x)), "peak": db(np.abs(x).max())}
    r["crest"] = r["peak"] - r["rms"]
    r["bands"], r["cent"] = shares(m)
    w = 10 * SR
    wins = [x[i:i + w] for i in range(0, n, w) if len(x[i:i + w]) >= 5 * SR]  # drop a tail shorter than 5 s
    r["win_db"] = [db(rms(c)) for c in wins]
    r["win_crest"] = [db(np.abs(c).max()) - db(rms(c)) for c in wins]
    r["win_hi"] = [shares(c.mean(1))[0][4] for c in wins]
    r["first2"], r["last2"] = db(rms(x[:2 * SR])), db(rms(x[-2 * SR:]))
    r["first50"], r["last50"] = db(rms(x[:2205])), db(rms(x[-2205:]))
    # wrap click: jump between last and first sample vs the p99.9 sample step around the wrap
    j = []
    for c in range(2):
        d = np.abs(np.diff(np.concatenate([x[-SR:, c], x[:SR, c]])))
        j.append((abs(x[0, c] - x[-1, c]), abs(x[0, c] - x[-1, c]) / max(np.percentile(d, 99.9), 1e-9)))
    r["wrap_jump"], r["wrap_ratio"] = max(a for a, _ in j), max(b for _, b in j)
    fa, pa = welch(m[-2 * SR:], SR, nperseg=8192)
    _, pb = welch(m[:2 * SR], SR, nperseg=8192)
    k = (fa >= 20) & (fa <= 16000)
    r["seam_spec"] = float(np.mean(np.abs(10 * np.log10(pa[k] + 1e-14) - 10 * np.log10(pb[k] + 1e-14))))
    return r


def main():
    res = {p.stem[-1]: measure(load(p)) for p in sorted(SRC.glob("slot_?.ogg"))}
    L = ["# Battle loops slot_A..F: measurements (numpy/scipy on the decoded .ogg; nobody listened)", "",
         "Measured = computed from the audio. Interpretation = marked as such. Levels are unweighted RMS dBFS (not LUFS).", "",
         "## Summary", "",
         "| slot | dur s | mean RMS | peak | crest dB | <150 Hz % | 2-6k % | >6k % | centroid Hz | arc (10 s windows, dB) | arc range | first/last 2 s dB | seam delta | wrap jump |",
         "|---|---|---|---|---|---|---|---|---|---|---|---|---|---|"]
    for s, r in res.items():
        b = r["bands"]
        L.append(f"| {s} | {r['dur']:.1f} | {r['rms']:.1f} | {r['peak']:.1f} | {r['crest']:.1f} | {b[0] + b[1]:.1f} | {b[4]:.1f} | {b[5]:.1f} | {r['cent']:.0f} | "
                 f"{' '.join(f'{v:.0f}' for v in r['win_db'])} | {max(r['win_db']) - min(r['win_db']):.1f} | {r['first2']:.1f} / {r['last2']:.1f} | {r['first2'] - r['last2']:+.1f} | {r['wrap_ratio']:.1f}x |")
    L += ["", "## Spectral balance (% of power, mono mix)", "",
          "| slot | " + " | ".join(n for n, _, _ in BANDS) + " |", "|---|" + "---|" * len(BANDS)]
    for s, r in res.items():
        L.append(f"| {s} | " + " | ".join(f"{v:.1f}" for v in r["bands"]) + " |")
    L += ["", "## Per 10 s window: level dB / crest dB / 2-6k share %", ""]
    for s, r in res.items():
        L.append(f"- {s}: " + "; ".join(f"{i * 10}s {a:.1f}/{c:.1f}/{h:.1f}" for i, (a, c, h) in enumerate(zip(r["win_db"], r["win_crest"], r["win_hi"]))))
    L += ["", "## Loop seam (measured)", ""]
    for s, r in res.items():
        L.append(f"- {s}: last/first 2 s RMS {r['last2']:.1f} / {r['first2']:.1f} dB; last/first 50 ms {r['last50']:.1f} / {r['first50']:.1f} dB; "
                 f"wrap sample jump {r['wrap_jump']:.5f} = {r['wrap_ratio']:.1f}x p99.9 step; spectral distance {r['seam_spec']:.2f} dB")
    m = lambda k: np.mean([r["bands"][k] for r in res.values()])
    mud = {s: r["bands"][0] + r["bands"][1] for s, r in res.items()}
    mm = np.mean(list(mud.values()))
    L += ["", "## Flags (interpretation; thresholds are my rules of thumb, not standards)", ""]
    for s, r in res.items():
        fl = []
        if mud[s] > 1.25 * mm:
            fl.append(f"mud risk (<150 Hz {mud[s]:.1f} % vs mean {mm:.1f} %)")
        if r["bands"][4] > 1.5 * m(4):
            fl.append(f"harsh risk 2-6k ({r['bands'][4]:.1f} % vs mean {m(4):.1f} %)")
        if r["bands"][5] > 1.5 * m(5):
            fl.append(f"bright >6k ({r['bands'][5]:.1f} % vs mean {m(5):.1f} %)")
        if r["wrap_ratio"] > 3:
            fl.append("possible click at wrap")
        if abs(r["first2"] - r["last2"]) > 3:
            fl.append(f"level jump at wrap {r['first2'] - r['last2']:+.1f} dB")
        if max(r["win_db"]) - min(r["win_db"]) < 2:
            fl.append("flat arc (<2 dB range)")
        L.append(f"- {s}: {', '.join(fl) or 'no flag'}")
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text("\n".join(L) + "\n", encoding="utf-8")
    print("\n".join(L))


if __name__ == "__main__":
    sys.exit(main())
