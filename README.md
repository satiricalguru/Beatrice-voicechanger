# 🎙️ Beatrice Voice Changer

> Real-time AI voice conversion powered by the **Beatrice 2.0.0-rc.2** DSP engine and the **JVS corpus** (100 Japanese speaker voices).

<div align="center">
  <img src="beatrice_paraphernalia_jvs/noimage.png" width="120" alt="Beatrice Logo" />
</div>

---

## ✨ Features

- **100 target voices** from the JVS corpus — each mapped to a chemical element
- Real-time voice morphing at 16 kHz, 10 ms latency (160-sample blocks)
- Pitch shift (−12 to +12 semitones) and formant shift controls
- Noise gate threshold to suppress background noise
- Input / Output audio routing with PortAudio device selection
- "Hear Yourself" monitoring with separate monitor device support
- Sleek dark glassmorphic Electron UI

---

## 🖥️ Requirements

| Dependency | Version |
|---|---|
| macOS | 12 Monterey or later (Apple Silicon or Intel) |
| Node.js | 18+ |
| Python | 3.9+ |
| sounddevice | `pip install sounddevice` |
| numpy | `pip install numpy` |

> **Note:** The Beatrice VST3 library (`beatrice_2.0.0-rc.2.vst3`) is a **macOS-only** native binary. Windows/Linux are not supported in this release.

---

## Screenshots

<img width="1462" height="860" alt="Screenshot 2026-05-28 at 10 29 46 PM" src="https://github.com/user-attachments/assets/61564043-ec9e-46f9-8b7d-7a6d65dce136" />





---

## 🚀 Setup & Run

```bash
# 1. Clone the repo
git clone https://github.com/satiricalguru/beatrice-voicechanger.git
cd beatrice-voicechanger

# 2. Install Python audio dependencies
pip install sounddevice numpy

# 3. Install Node dependencies
npm install

# 4. Launch the app
npm start
```

The Electron window will open. Voice conversion is **active immediately** — you should hear the converted voice as soon as audio flows. Use the power button in the sidebar to toggle bypass (BYPASSED = raw mic passthrough).

---

## 🎛️ Controls

| Control | Description |
|---|---|
| **Power Button** | Toggle between LIVE (converting) and BYPASSED (raw mic) |
| **Input Microphone** | Select your input device |
| **Output Device** | Select where converted audio goes |
| **Hear Yourself** | Route output to a monitor device for local feedback |
| **Noise Gate** | Threshold below which input is silenced |
| **Pitch Shift** | Shift pitch ±12 semitones |
| **Formant Shift** | Shift vocal tract formants independently of pitch |
| **Output Volume** | Final output gain (0–200%) |

---

## 🔊 Voice Selection

Click any speaker card in the main grid to switch your target voice. All 100 voices are named after Japanese historical poets and assigned to chemical elements (Hydrogen → Oganesson). Search by name, element, or JVS ID (e.g. `JVS-042`).

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────┐
│              Electron UI                │
│   index.html + index.css + renderer.js  │
│   - Speaker grid (100 JVS voices)       │
│   - DSP controls & level meters         │
└──────────────┬──────────────────────────┘
               │ HTTP REST (127.0.0.1:5005)
               ▼
┌─────────────────────────────────────────┐
│         Python Audio Backend            │
│              beatrice_audio.py          │
│   - PortAudio I/O via sounddevice       │
│   - Beatrice VST3 ctypes wrapper        │
│   - Phone extraction → Pitch estimation │
│     → Waveform synthesis pipeline       │
└──────────────┬──────────────────────────┘
               │ ctypes CDLL
               ▼
┌─────────────────────────────────────────┐
│     Beatrice 2.0.0-rc.2 VST3 Library    │
│   beatrice_2.0.0-rc.2.vst3 (macOS)     │
│   + beatrice_paraphernalia_jvs/         │
│     (model weights & embeddings)        │
└─────────────────────────────────────────┘
```

---

## 📜 License & Credits

- **Beatrice DSP engine** — [prj-beatrice/beatrice-vst](https://github.com/prj-beatrice/beatrice-vst)
- **Voice Changer UI/backend** — Inspired by [w-okada/voice-changer](https://github.com/w-okada/voice-changer)
- **JVS Corpus** — [Shinnosuke Takamichi, UTokyo](https://sites.google.com/site/shinnosuketakamichi/research-topics/jvs_corpus)
  - Non-commercial use only. See `LICENSE.txt` and `LICENSES_BUNDLED.txt`.
- **Developed by Satirical Guru , Claude & Antigravity .
---

## ⚠️ Disclaimer

The JVS corpus and JVS-MuSiC models are licensed for **non-commercial use only**. Do not use this software for commercial purposes without obtaining appropriate licenses from the original authors.
