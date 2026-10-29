#!/usr/bin/env python3
"""
audio/make_audio.py — Synthesizes the 36-second stereo score + SFX to audio/score.wav.

Cue times are written in the same "design time" as index.html and mapped onto video time
with W() so every hit lands on the natural-pace voiceover.mp3 (+0.2s delay).
"""
import os
import wave
import numpy as np
from scipy.signal import butter, lfilter

SR = 48000
DURATION = 36.0
N_SAMPLES = int(SR * DURATION)

# [design s, video s] — keep in sync with TIME_WARP in index.html
TIME_WARP = [
    (0.00, 0.00),
    (0.20, 0.20), (4.65, 5.50),
    (4.85, 5.78), (7.05, 8.08),
    (7.25, 8.43), (14.70, 17.14),
    (15.00, 17.48), (21.80, 24.21),
    (22.05, 24.61), (26.20, 28.83),
    (26.45, 29.23), (33.60, 34.13),
    (33.75, 34.25),
    (36.00, 36.00),
]
_WD = np.array([p[0] for p in TIME_WARP])
_WV = np.array([p[1] for p in TIME_WARP])

# Impact hits in video time («ميول», «تفك البلاط») — keep in sync with IMPACT_TIMES in index.html
IMPACT_TIMES = (6.85, 26.45)


def W(t_design: float) -> float:
    """Map a design-time cue onto video time."""
    return float(np.interp(t_design, _WD, _WV))


def env_adsr(length: int, a: float, d: float, s_level: float, r: float) -> np.ndarray:
    t = np.linspace(0, length / SR, length, endpoint=False)
    total = length / SR
    env = np.ones_like(t) * s_level
    a_mask = t < a
    env[a_mask] = t[a_mask] / max(a, 1e-4)
    d_mask = (t >= a) & (t < a + d)
    env[d_mask] = 1.0 - (1.0 - s_level) * ((t[d_mask] - a) / max(d, 1e-4))
    r_mask = t >= max(0.0, total - r)
    env[r_mask] = s_level * (1.0 - (t[r_mask] - (total - r)) / max(r, 1e-4))
    return np.clip(env, 0.0, 1.0)


def lowpass(sig: np.ndarray, cutoff: float) -> np.ndarray:
    b, a = butter(2, cutoff / (0.5 * SR), btype="low")
    return lfilter(b, a, sig)


def highpass(sig: np.ndarray, cutoff: float) -> np.ndarray:
    b, a = butter(2, cutoff / (0.5 * SR), btype="high")
    return lfilter(b, a, sig)


def add_clip(buf: np.ndarray, t_start: float, clip_mono: np.ndarray, pan: float = 0.0):
    idx = int(t_start * SR)
    if idx >= N_SAMPLES or idx + len(clip_mono) <= 0:
        return
    s0 = max(0, idx)
    s1 = min(N_SAMPLES, idx + len(clip_mono))
    c0 = s0 - idx
    c1 = c0 + (s1 - s0)
    left_gain = np.cos((pan + 1.0) * np.pi / 4.0)
    right_gain = np.sin((pan + 1.0) * np.pi / 4.0)
    buf[s0:s1, 0] += clip_mono[c0:c1] * left_gain
    buf[s0:s1, 1] += clip_mono[c0:c1] * right_gain


def synth_pad(freqs, dur: float, amp: float = 0.08) -> np.ndarray:
    n = int(dur * SR)
    t = np.linspace(0, dur, n, endpoint=False)
    sig = np.zeros(n, dtype=np.float64)
    for f in freqs:
        sig += np.sin(2 * np.pi * f * t) + 0.35 * np.sin(2 * np.pi * (f * 2.0) * t + 0.4)
    sig /= len(freqs)
    sig = lowpass(sig, 1600.0)
    return sig * env_adsr(n, 0.9, 0.6, 0.75, 1.2) * amp


def synth_impact(f_start: float = 115.0, f_end: float = 34.0, dur: float = 0.65, amp: float = 0.55) -> np.ndarray:
    n = int(dur * SR)
    t = np.linspace(0, dur, n, endpoint=False)
    freq = f_start * ((f_end / f_start) ** (t / dur))
    phase = 2 * np.pi * np.cumsum(freq) / SR
    sub = np.sin(phase) * np.exp(-t * 5.5)
    rng = np.random.default_rng(42)
    trans = lowpass(rng.normal(0, 1, n), 900.0) * np.exp(-t * 38.0) * 0.35
    return (sub + trans) * amp


def synth_tile_clack(seed: int = 1, amp: float = 0.25) -> np.ndarray:
    dur = 0.085
    n = int(dur * SR)
    t = np.linspace(0, dur, n, endpoint=False)
    rng = np.random.default_rng(seed)
    body = (
        np.sin(2 * np.pi * 1180 * t) * np.exp(-t * 55)
        + 0.6 * np.sin(2 * np.pi * 2460 * t) * np.exp(-t * 85)
        + 0.3 * highpass(rng.normal(0, 1, n), 1200.0) * np.exp(-t * 120)
    )
    return body * amp


def build_score(out_wav: str):
    os.makedirs(os.path.dirname(out_wav), exist_ok=True)
    buf = np.zeros((N_SAMPLES, 2), dtype=np.float64)
    rng = np.random.default_rng(2026)

    # Problem → solution switch rides the yellow wipe
    t_switch = W(14.8)

    # 1. Problem Half Tense Minor Pad
    minor_pad = synth_pad([73.42, 110.0, 174.61, 220.0, 261.63], t_switch + 0.2, amp=0.075)
    add_clip(buf, 0.0, minor_pad, pan=-0.1)

    # Low dripping pluck pattern in problem half (steady pulse in video time)
    drip_notes = [293.66, 349.23, 440.0, 329.63, 293.66, 261.63]
    for i, t_drip in enumerate(np.arange(0.40, W(14.4), 0.48)):
        f = drip_notes[i % len(drip_notes)]
        n = int(0.22 * SR)
        t = np.linspace(0, 0.22, n, endpoint=False)
        pluck = np.sin(2 * np.pi * f * t + 0.8 * np.sin(2 * np.pi * f * 3 * t) * np.exp(-t * 30))
        pluck *= np.exp(-t * 18) * 0.085
        add_clip(buf, float(t_drip), pluck, pan=float(np.sin(i) * 0.45))

    # 2. Solution Half Major Pad
    major_pad = synth_pad([73.42, 110.0, 185.00, 220.0, 293.66, 440.0], DURATION - t_switch, amp=0.085)
    add_clip(buf, t_switch, major_pad, pan=0.1)

    # Soft hats in solution half (steady pulse in video time)
    for i, t_hat in enumerate(np.arange(W(15.0), W(33.5), 0.25)):
        n = int(0.055 * SR)
        t = np.linspace(0, 0.055, n, endpoint=False)
        noise = highpass(rng.normal(0, 1, n), 5000.0)
        accent = 0.045 if (i % 2 == 0) else 0.024
        hat = noise * np.exp(-t * 75) * accent
        add_clip(buf, float(t_hat), hat, pan=0.25 if (i % 2 == 0) else -0.25)

    # 3. Frame-Accurate SFX
    # Light impact at start
    add_clip(buf, 0.05, synth_impact(95, 38, 0.55, amp=0.35), pan=0.0)

    # Water trickle when water spreads and when it drains to the outlet
    for t_base in [W(0.55), W(17.85)]:
        for k in range(30):
            wt = t_base + k * 0.11 + rng.uniform(0, 0.04)
            f_drop = rng.uniform(680, 1480)
            n = int(0.06 * SR)
            t = np.linspace(0, 0.06, n, endpoint=False)
            chirp = np.sin(2 * np.pi * (f_drop + 600 * (t / 0.06)) * t) * np.exp(-t * 55) * 0.045
            add_clip(buf, float(wt), chirp, pan=float(rng.uniform(-0.5, 0.5)))

    # Heavy impacts on «ميول» and «تفك البلاط»
    add_clip(buf, IMPACT_TIMES[0], synth_impact(125, 32, 0.75, amp=0.58), pan=0.0)
    add_clip(buf, IMPACT_TIMES[1], synth_impact(135, 30, 0.82, amp=0.62), pan=0.0)

    # Riser and whoosh into the yellow scan-line wipe (whoosh peaks 1.2s in, at the switch)
    n_riser = int(1.5 * SR)
    t_r = np.linspace(0, 1.5, n_riser, endpoint=False)
    f_r = 160 * ((1400 / 160) ** (t_r / 1.5))
    riser = np.sin(2 * np.pi * np.cumsum(f_r) / SR) * ((t_r / 1.5) ** 2) * np.exp(-np.maximum(0, t_r - 1.2) * 14)
    whoosh = lowpass(rng.normal(0, 1, n_riser), 2400.0) * np.exp(-((t_r - 1.2) ** 2) / 0.035) * 0.28
    add_clip(buf, t_switch - 1.2, riser * 0.18 + whoosh, pan=0.0)

    # Specialist laser "zap" sweep while the laser level is up
    laz_start = W(15.3)
    laz_dur = W(20.3) - laz_start
    n_laz = int(laz_dur * SR)
    t_l = np.linspace(0, laz_dur, n_laz, endpoint=False)
    zap = np.sin(2 * np.pi * (420 + 65 * np.sin(2 * np.pi * 1.8 * t_l)) * t_l)
    zap *= env_adsr(n_laz, 0.3, 0.4, 0.6, 0.5) * 0.045
    add_clip(buf, laz_start, zap, pan=0.15)

    # Tile clacks: lift, flashback pop/stack on «تفك», and drop into place
    for k in range(10):
        add_clip(buf, W(15.00) + k * 0.07, synth_tile_clack(10 + k, amp=0.14), pan=(k % 3 - 1) * 0.3)
    for k in range(16):
        add_clip(buf, IMPACT_TIMES[1] + 0.05 + k * 0.055, synth_tile_clack(30 + k, amp=0.22), pan=(k % 3 - 1) * 0.4)
    for k in range(12):
        add_clip(buf, W(25.9) + k * 0.065, synth_tile_clack(60 + k, amp=0.18), pan=(k % 3 - 1) * 0.3)

    # Shimmer on the end-card logo
    t_end = W(33.75)
    shimmer = synth_pad([587.33, 880.0, 1174.66, 1479.98, 1760.0], DURATION - t_end, amp=0.15)
    add_clip(buf, t_end, shimmer, pan=0.0)

    buf = np.tanh(buf * 1.1) * 0.85
    pcm = (np.clip(buf, -1.0, 1.0) * 32767).astype(np.int16)
    with wave.open(out_wav, "wb") as wf:
        wf.setnchannels(2)
        wf.setsampwidth(2)
        wf.setframerate(SR)
        wf.writeframes(pcm.tobytes())


if __name__ == "__main__":
    script_dir = os.path.dirname(os.path.abspath(__file__))
    out_score = os.path.join(script_dir, "score.wav")
    build_score(out_score)
    print(f"[Audio] Synthesized 36s stereo score -> {out_score}")
