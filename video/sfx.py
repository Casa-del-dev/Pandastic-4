"""Sound for the video: short effects synthesized from the cue list that render.mjs exports (out/cues.json), mixed
over the music (media/music.mp3: "Warm Fuzz" by HoliznaCC0, CC0). Writes out/audio.wav (48 kHz stereo)."""
import json
import subprocess
from pathlib import Path

import numpy as np
from scipy.io import wavfile
from scipy.signal import butter, sosfilt

HERE = Path(__file__).resolve().parent
SR = 48000
TIMELINE = json.loads((HERE / "out/cues.json").read_text())
DUR = TIMELINE["duration"]
rng = np.random.default_rng(7)


def env(n, attack=0.002, decay=0.08):
    t = np.arange(n) / SR
    return np.minimum(1, t / attack) * np.exp(-t / decay)


def band(x, lo, hi):
    return sosfilt(butter(4, [lo, hi], "bandpass", fs=SR, output="sos"), x)


def tone(freq, dur, decay):
    n = int(SR * dur); t = np.arange(n) / SR
    f = np.broadcast_to(freq, n) if np.isscalar(freq) else freq
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * env(n, 0.002, decay)


def noise(dur, lo, hi, decay):
    n = int(SR * dur)
    return band(rng.standard_normal(n), lo, hi) * env(n, 0.001, decay)


def add(*parts):
    out = np.zeros(max(len(x) for x in parts))
    for x in parts: out[: len(x)] += x
    return out


def sweep(f0, f1, dur):
    n = int(SR * dur); return np.linspace(f0, f1, n)


def scan(dur=1.1):
    n = int(SR * dur); shape = np.sin(np.linspace(0, np.pi, n)) ** 2
    return 0.05 * band(rng.standard_normal(n), 2500, 7000) * shape + 0.025 * tone(sweep(520, 1040, dur), dur, 2.0) * shape


def ratchet(dur=1.3, clicks=24):
    out = np.zeros(int(SR * dur) + SR // 10)
    for k in range(clicks):  # the clicks slow down like the number does (ease-out)
        i = int(SR * dur * (1 - (1 - k / clicks) ** (1 / 3)))
        c = 0.07 * tone(3200 - 40 * k, 0.012, 0.003); out[i:i + len(c)] += c
    return out


SOUNDS = {
    "stamp": lambda: add(0.9 * tone(sweep(130, 52, 0.22), 0.22, 0.07), 0.25 * noise(0.03, 1500, 7000, 0.006)),
    "thud": lambda: add(1.0 * tone(sweep(110, 42, 0.42), 0.42, 0.13), 0.2 * noise(0.05, 800, 4000, 0.01)),
    "tick": lambda: 0.22 * tone(2600, 0.03, 0.006),
    "key": lambda: 0.16 * (tone(1400, 0.05, 0.012) + tone(2100, 0.05, 0.01)),
    "type": lambda: 0.12 * noise(0.02, 2000, 8000, 0.004),
    "shutter": lambda: np.concatenate([0.5 * noise(0.03, 1500, 7000, 0.005), np.zeros(int(SR * 0.045)), 0.4 * noise(0.04, 1200, 6000, 0.008)]),
    "whoosh": lambda: 0.22 * band(rng.standard_normal(int(SR * 0.32)), 300, 3500) * np.sin(np.linspace(0, np.pi, int(SR * 0.32))) ** 2,
    "rise": lambda: 0.07 * tone(sweep(330, 660, 0.45), 0.45, 0.5) * np.linspace(1, 0, int(SR * 0.45)),
    "snip": lambda: np.concatenate([0.35 * noise(0.012, 3000, 9000, 0.003), np.zeros(int(SR * 0.035)), 0.35 * noise(0.012, 3000, 9000, 0.003)]),
    "scan": scan,
    "roll": ratchet,
    "pop": lambda: add(0.14 * tone(sweep(950, 620, 0.07), 0.07, 0.025), 0.05 * noise(0.006, 2000, 8000, 0.002)),
    "send": lambda: 0.16 * tone(sweep(800, 1700, 0.13), 0.13, 0.08),
    "chime": lambda: np.concatenate([0.2 * (tone(1318.5, 0.16, 0.09) + 0.3 * tone(2637, 0.16, 0.05)),
                                     0.2 * (tone(1760, 0.32, 0.16) + 0.3 * tone(3520, 0.32, 0.08))]),
}

fx = np.zeros(int(SR * DUR) + SR)
for t, kind in TIMELINE["cues"]:
    s = SOUNDS[kind](); i = int(t * SR); fx[i:i + len(s)] += s[: len(fx) - i]

raw = subprocess.run(["ffmpeg", "-v", "error", "-i", str(HERE / "media/music.mp3"), "-t", str(DUR), "-ac", "2", "-ar", str(SR),
                      "-f", "f32le", "-"], capture_output=True).stdout
music = np.frombuffer(raw, np.float32).reshape(-1, 2).copy()
n = int(SR * DUR); music = np.pad(music, ((0, max(0, n - len(music))), (0, 0)))[:n]
t = np.arange(n) / SR
music *= np.clip(t / 0.15, 0, 1)[:, None] * np.clip((DUR - t) / 2.4, 0, 1)[:, None] * 0.75
mix = music + 0.9 * fx[:n, None]
mix /= max(1.0, np.abs(mix).max() / 0.95)
wavfile.write(HERE / "out/audio.wav", SR, (mix * 32767).astype(np.int16))
print(f"out/audio.wav: {DUR} s, peak {np.abs(mix).max():.2f}")
