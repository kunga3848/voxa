"""
Traitement audio de Voxa : effets de voix (robot, radio, téléphone, mégaphone)
et finition « spot » (égalisation, compression, volume normalisé au standard pub).

Uniquement numpy + scipy : fonctionne sans FFmpeg.
"""
from __future__ import annotations

import numpy as np
from scipy import signal

# ---------------------------------------------------------------- filtres de base


def _biquad_peak(f0, gain_db, q, sr):
    a = 10 ** (gain_db / 40)
    w0 = 2 * np.pi * f0 / sr
    alpha = np.sin(w0) / (2 * q)
    b = [1 + alpha * a, -2 * np.cos(w0), 1 - alpha * a]
    den = [1 + alpha / a, -2 * np.cos(w0), 1 - alpha / a]
    return np.array(b) / den[0], np.array(den) / den[0]


def _biquad_shelf(f0, gain_db, sr, high=True, q=0.7071):
    a = 10 ** (gain_db / 40)
    w0 = 2 * np.pi * f0 / sr
    alpha = np.sin(w0) / (2 * q)
    cw = np.cos(w0)
    s = 1 if high else -1
    b0 = a * ((a + 1) + s * (a - 1) * cw + 2 * np.sqrt(a) * alpha)
    b1 = -2 * s * a * ((a - 1) + s * (a + 1) * cw)
    b2 = a * ((a + 1) + s * (a - 1) * cw - 2 * np.sqrt(a) * alpha)
    a0 = (a + 1) - s * (a - 1) * cw + 2 * np.sqrt(a) * alpha
    a1 = 2 * s * ((a - 1) - s * (a + 1) * cw)
    a2 = (a + 1) - s * (a - 1) * cw - 2 * np.sqrt(a) * alpha
    return np.array([b0, b1, b2]) / a0, np.array([a0, a1, a2]) / a0


def _apply(b, a, x):
    return signal.lfilter(b, a, x).astype("float32")


def highpass(x, f, sr, order=2):
    return _apply(*signal.butter(order, f / (sr / 2), "highpass"), x)


def bandpass(x, lo, hi, sr, order=2):
    hi = min(hi, sr / 2 * 0.95)
    return _apply(*signal.butter(order, [lo / (sr / 2), hi / (sr / 2)], "bandpass"), x)


def _db(x):
    return 20 * np.log10(np.maximum(x, 1e-9))


# ---------------------------------------------------------------- dynamique


def compress(x, sr, threshold_db=-20.0, ratio=3.0, attack_ms=8.0, release_ms=120.0, knee_db=6.0):
    """Compresseur RMS à genou doux."""
    win = max(1, int(sr * 0.01))
    rms = np.sqrt(np.convolve(x ** 2, np.ones(win) / win, mode="same") + 1e-12)
    level = _db(rms)
    over = level - threshold_db
    gr = np.where(over <= -knee_db / 2, 0.0,
                  np.where(over >= knee_db / 2, over * (1 - 1 / ratio),
                           (over + knee_db / 2) ** 2 / (2 * knee_db) * (1 - 1 / ratio)))
    # lissage attaque / relâchement
    att = np.exp(-1 / (sr * attack_ms / 1000))
    rel = np.exp(-1 / (sr * release_ms / 1000))
    smooth = np.empty_like(gr)
    g = 0.0
    for i, v in enumerate(gr):
        coef = att if v > g else rel
        g = coef * g + (1 - coef) * v
        smooth[i] = g
    return (x * 10 ** (-smooth / 20)).astype("float32")


def limit(x, sr, ceiling_db=-1.0, lookahead_ms=5.0, release_ms=60.0):
    """Limiteur à anticipation : aucun échantillon ne dépasse le plafond."""
    ceil = 10 ** (ceiling_db / 20)
    la = max(1, int(sr * lookahead_ms / 1000))
    peak = np.abs(x)
    # maximum glissant sur la fenêtre d'anticipation
    padded = np.concatenate([peak, np.zeros(la)])
    windows = np.lib.stride_tricks.sliding_window_view(padded, la + 1)
    future_peak = windows.max(axis=1)[: len(x)]
    target = np.minimum(1.0, ceil / np.maximum(future_peak, 1e-9))
    rel = np.exp(-1 / (sr * release_ms / 1000))
    gain = np.empty_like(target)
    g = 1.0
    for i, t in enumerate(target):
        g = t if t < g else rel * g + (1 - rel) * t
        gain[i] = g
    return np.clip(x * gain, -ceil, ceil).astype("float32")


# ---------------------------------------------------------------- volume (ITU-R BS.1770)


def loudness_lufs(x, sr):
    """Volume intégré en LUFS (pondération K, portes absolue et relative)."""
    b1, a1 = _biquad_shelf(1681.974450955533, 3.99984385397, sr, high=True, q=0.7071752369554196)
    b2, a2 = signal.butter(2, 38.13547087602444 / (sr / 2), "highpass")
    y = signal.lfilter(b2, a2, signal.lfilter(b1, a1, x))
    block, hop = int(0.4 * sr), int(0.1 * sr)
    if len(y) < block:
        y = np.pad(y, (0, block - len(y)))
    energies = np.array([np.mean(y[i:i + block] ** 2) for i in range(0, len(y) - block + 1, hop)])
    lk = -0.691 + 10 * np.log10(energies + 1e-12)
    gated = energies[lk > -70]
    if not len(gated):
        return -70.0
    rel = -0.691 + 10 * np.log10(gated.mean()) - 10
    final = energies[(lk > -70) & (lk > rel)]
    return float(-0.691 + 10 * np.log10(final.mean() + 1e-12))


def normalize_loudness(x, sr, target_lufs):
    current = loudness_lufs(x, sr)
    if current <= -69:
        return x
    return (x * 10 ** ((target_lufs - current) / 20)).astype("float32")


# ---------------------------------------------------------------- nettoyage


def trim_silence(x, sr, threshold_db=-50.0, pad_ms=120):
    win = int(sr * 0.02)
    if len(x) < win * 2:
        return x
    env = np.sqrt(np.convolve(x ** 2, np.ones(win) / win, mode="same"))
    loud = np.where(_db(env) > threshold_db)[0]
    if not len(loud):
        return x
    pad = int(sr * pad_ms / 1000)
    return x[max(0, loud[0] - pad): min(len(x), loud[-1] + pad)]


def fade(x, sr, ms=12):
    n = min(len(x) // 2, int(sr * ms / 1000))
    if n:
        ramp = np.linspace(0, 1, n, dtype="float32")
        x = x.copy()
        x[:n] *= ramp
        x[-n:] *= ramp[::-1]
    return x


# ---------------------------------------------------------------- effets de voix


def fx_robot(x, sr):
    t = np.arange(len(x)) / sr
    ring = x * np.sin(2 * np.pi * 55 * t)                    # modulation en anneau
    mix = 0.75 * ring + 0.35 * x
    d = int(sr * 0.007)                                       # résonance métallique (filtre en peigne)
    out = np.copy(mix)
    for i in range(d, len(out)):
        out[i] += 0.45 * out[i - d]
    out = _apply(*_biquad_peak(1800, 4, 1.2, sr), out)
    return np.tanh(out * 1.4).astype("float32")


def fx_radio(x, sr):
    y = bandpass(x, 180, 5500, sr)
    y = compress(y, sr, threshold_db=-24, ratio=4)
    return np.tanh(y * 2.0).astype("float32") * 0.8


def fx_telephone(x, sr):
    y = bandpass(x, 320, 3400, sr, order=4)
    return np.tanh(y * 3.0).astype("float32") * 0.6


def fx_megaphone(x, sr):
    y = bandpass(x, 600, 3600, sr, order=3)
    y = np.tanh(y * 6.0)
    d = int(sr * 0.045)
    echo = np.concatenate([np.zeros(d), y[:-d]]) * 0.25
    return (0.7 * (y + echo)).astype("float32")


EFFECTS = {"robot": fx_robot, "radio": fx_radio, "telephone": fx_telephone, "megaphone": fx_megaphone}

# Finitions : (cible de volume en LUFS, traitement voix)
FINISHES = {
    "spot": -16.0,       # pub radio / réseaux sociaux / web
    "broadcast": -23.0,  # télévision (EBU R128)
    "podcast": -16.0,
    "raw": None,
}


def voice_polish(x, sr):
    """Chaîne « voix de studio » : propreté, présence et densité."""
    y = highpass(x, 75, sr)
    y = _apply(*_biquad_peak(300, -2.5, 1.0, sr), y)          # retire l'effet « carton »
    y = _apply(*_biquad_peak(3500, 2.5, 0.9, sr), y)          # présence, intelligibilité
    y = _apply(*_biquad_shelf(min(9000, sr * 0.36), 2.0, sr, high=True), y)  # air
    y = _apply(*_biquad_shelf(140, 1.5, sr, high=False), y)   # assise dans les graves
    y = compress(y, sr, threshold_db=-22, ratio=3.0)
    return y


def process(x, sr, effect: str | None = None, finish: str = "spot"):
    x = np.asarray(x, dtype="float32")
    x = trim_silence(x, sr)
    if finish != "raw":
        x = voice_polish(x, sr)
    if effect in EFFECTS:
        x = EFFECTS[effect](x, sr)
    target = FINISHES.get(finish)
    if target is not None:
        x = normalize_loudness(x, sr, target)
        x = limit(x, sr, ceiling_db=-1.0)
    else:
        peak = float(np.abs(x).max() or 1.0)
        if peak > 0.95:
            x = x * (0.95 / peak)
    return fade(x, sr)
