# Using voiceverb in calls (Discord, Zoom, Meet, Teams)

voiceverb processes the microphone in the browser. For **other participants** to hear the effect, the processed audio must reach the call app through a **virtual audio device** — a local "cable" that appears to the system as if it were a sound card.

> **Important:** this is not a native "share audio" feature of the call. It is local audio routing. Nothing leaves your machine beyond what the call app normally sends over your connection.

## The audio path

```
Microphone
   │
   ▼
voiceverb (browser)  ── processes reverb, EQ, pitch, etc.
   │
   ▼  output chosen in the app
CABLE Input  (input side of the virtual cable)
   │
   ▼  the cable delivers the audio on the other side
CABLE Output (output side of the virtual cable)
   │
   ▼  microphone chosen in the call app
Discord / Zoom / Google Meet / Teams
```

On Windows the cable is called **VB-CABLE**; on macOS, **BlackHole**; on Linux, a PipeWire/PulseAudio **null sink**. The principle is always the same: voiceverb writes to a virtual device and the call app reads from the other side of that device.

### Before you start

1. Run voiceverb in **Chrome or Edge 110+**, via `http://127.0.0.1:8123` or `https://`.
2. Turn on the microphone in the app and confirm the meter moves.
3. Use **headphones**. Speakers + open microphone = feedback (echo).
4. Only move on to the virtual cable once local monitoring is working.

---

## Windows — VB-CABLE

### 1. Install

1. Download from <https://vb-audio.com/Cable/> (the `VB-CABLE` package, free for personal use; donations are optional).
2. Extract the ZIP and run `VBCABLE_Setup_x64.exe` **as administrator**.
3. Click **Install Driver** and **restart Windows**. The restart is required for the driver to show up in every application.

Windows will see two devices:

| System name | Role |
|---|---|
| `CABLE Input (VB-Audio Virtual Cable)` | **Cable input** — this is where voiceverb writes |
| `CABLE Output (VB-Audio Virtual Cable)` | **Cable output** — this is where the call app reads from |

The naming is counterintuitive on purpose: you "enter" the cable through `CABLE Input` and "exit" through `CABLE Output`.

### 2. Configure voiceverb

1. Open voiceverb and turn on the microphone.
2. Under **Saída de áudio / Output device**, choose `CABLE Input (VB-Audio Virtual Cable)`.
3. Click **Testar saída** (`playTestTone`). The tone should play into the cable, not into your headphones.
4. Adjust the output volume so the meter is strong but **without clipping** (the limiter protects you, but do not push it).
5. If you want to hear yourself while speaking, use **headphones** and enable "Ouvir este dispositivo" on `CABLE Output` (never with speakers), or use VoiceMeeter as a monitoring mixer.

### 3. Configure the call app

In all of them, the input microphone must be **`CABLE Output (VB-Audio Virtual Cable)`**.

| Application | Where to change it |
|---|---|
| **Discord** | Configurações do usuário → **Voz e vídeo** → *Dispositivo de entrada* → `CABLE Output` |
| **Zoom** | Configurações → **Áudio** → *Microfone* → `CABLE Output` |
| **Google Meet** | Configurações (engrenagem) → **Áudio** → *Microfone* → `CABLE Output` |
| **Microsoft Teams** | Configurações → **Dispositivos** → *Microfone* → `CABLE Output` |

Tips per app:

- **Discord:** turn off *Sensibilidade automática de entrada* and set the threshold manually; voiceverb's gate already handles silence. Also turn off **cancelamento de eco**, **supressão de ruído** and **controle automático de ganho** while testing — they can eat the reverb tail.
- **Zoom:** under *Áudio → Avançado*, disable **Supressão de ruído**, **Cancelamento de eco** and **Ganho automático** to preserve the effect.
- **Meet/Teams:** look for the noise-suppression/ecosystem options in the audio settings and disable them while testing.

### 4. Test

1. Join a Discord test channel, a Zoom/Meet test room, or use the app's own microphone test.
2. Speak and confirm the other side hears the reverb.
3. If there is no sound, see [Troubleshooting](#troubleshooting).

### 5. Headphone tip (avoiding echo)

If you hear the processed audio on **speakers**, the microphone picks up that sound and the effect feeds back. Prefer:

- **Headphones plugged directly into the motherboard/interface**, with voiceverb monitoring through them; **or**
- hearing only the call in the headphones and leaving voiceverb's monitor muted; **or**
- on Windows, using a second physical output device for monitoring, keeping the virtual cable separate.

Never use "Ouvir este dispositivo" (Listen to this device) on `CABLE Output` with open speakers.

### 6. Check in the Windows sound panel

1. Open `mmsys.cpl` (Win+R → `mmsys.cpl`).
2. **Playback** tab: `CABLE Input` must exist and be enabled. The level should move while voiceverb is transmitting.
3. **Recording** tab: `CABLE Output` must exist, be enabled, with the level responding to the processed audio.
4. Under **Properties → Advanced**, check that the format is the same on both sides (for example, 48 kHz, 16 bits) to avoid unnecessary resampling.

---

## macOS — BlackHole 2ch

BlackHole is a free, open-source virtual audio driver. The **2ch** channel count is the simplest for voice.

### 1. Install

**Option A — Homebrew:**

```bash
brew install blackhole-2ch
```

**Option B — installer:**

1. Download from <https://existential.audio/blackhole/>.
2. Open the `.pkg`, authorize the installation and restart the Mac if the installer asks.
3. Under **Ajustes do Sistema → Privacidade e segurança → Microfone**, allow browser access.

### 2. Configure voiceverb and the call

1. Turn on the microphone in voiceverb.
2. Under **Saída de áudio**, choose **BlackHole 2ch**. The processed sound now goes to the virtual driver.
3. In the call app (Discord, Zoom, Meet, Teams), choose **BlackHole 2ch** as the **microphone/input**.
4. Test with the test tone or the app's microphone test.

### 3. I also want to hear myself (Multi-Output Device)

If you select only BlackHole, the audio does not play in your headphones — it all goes to the call. To monitor **and** feed the call at the same time:

1. Open **Audio MIDI Setup** (`/System/Applications/Utilities/Audio MIDI Setup.app`).
2. Click **+** in the lower-left corner → **Create Multi-Output Device**.
3. Check **BlackHole 2ch** and your physical output device (your **headphones**, preferably).
4. Select the Multi-Output Device as the **output in voiceverb**.
5. Keep **BlackHole 2ch** as the **microphone in the call app**.

Cautions:

- Put **headphones** on the Multi-Output. If you use speakers, the call will hear what comes out of them and the echo comes back.
- Set the Multi-Output and BlackHole to the **same sample rate** (for example, 48 kHz) in Audio MIDI Setup.
- If there are crackles or drift, prefer BlackHole alone on the output and monitor the call directly.

---

## Linux — PipeWire (or PulseAudio)

PipeWire exposes a *null sink*: a virtual output device whose "monitor" becomes an input source.

### 1. Create the virtual sink

```bash
pactl load-module module-null-sink sink_name=voiceverb \
  sink_properties=device.description=voiceverb
```

Check that it appeared:

```bash
pactl list short sinks
pactl list short sources
```

You should see the `voiceverb` sink and the `voiceverb.monitor` source (the name may appear as **Monitor of voiceverb** in the interface).

### 2. Configure

1. In voiceverb, choose **voiceverb** (or the equivalent friendly name) as the **output**.
2. In the call app, choose **Monitor of voiceverb** as the **microphone/input**.
3. Test with the test tone. Because the output went to the virtual sink, you do not hear yourself automatically: to monitor, also route `Monitor of voiceverb` to the physical output in `pavucontrol`/`helvum` (use headphones, to avoid echo).

### 3. Persist across restarts (optional)

The `pactl load-module` command lasts until the session restarts. To recreate the sink automatically, use a systemd user service:

```ini
# ~/.config/systemd/user/voiceverb-sink.service
[Unit]
Description=Null sink for voiceverb
After=pipewire-pulse.service
Wants=pipewire-pulse.service

[Service]
Type=oneshot
ExecStart=/usr/bin/pactl load-module module-null-sink sink_name=voiceverb sink_properties=device.description=voiceverb
RemainAfterExit=yes

[Install]
WantedBy=default.target
```

```bash
systemctl --user daemon-reload
systemctl --user enable --now voiceverb-sink.service
```

Verify with `systemctl --user status voiceverb-sink.service`. On some distributions the PipeWire/PulseAudio socket may take a while to come up; if the service fails at login, adjust `After=`/`Wants=` for your session's service or fall back to an autostart script that waits a few seconds.

> On classic PulseAudio the same commands work; for persistence, add the `load-module` to `~/.config/pulse/default.pa` (with `pactl` available in the session) or use the service above.

---

## Alternative on Windows — VoiceMeeter

**VoiceMeeter** (VB-Audio, optional donation) is a virtual mixer. It is useful when you want to, at the same time, **mix the microphone with the system audio**, monitor in headphones and deliver a single virtual microphone to the call.

Typical flow:

```
voiceverb → VoiceMeeter Input (virtual input)
                     │
                     ├── A1: your board/headphones (monitor)
                     └── B1: VoiceMeeter VAIO (virtual call microphone)
```

1. Install VoiceMeeter (or Banana, for more channels) and restart.
2. In voiceverb, choose **VoiceMeeter Input** as the output.
3. In VoiceMeeter, select your physical device on **A1** (headphones) and enable **B1** on the input strip.
4. In the call app, choose **VoiceMeeter Output (VB-Audio VoiceMeeter VAIO)** as the microphone.
5. Adjust the faders and gain so it does not distort.

Use VoiceMeeter only if you need extra mixing/monitoring: each virtual layer adds latency and one more place to misconfigure.

---

## Troubleshooting

| Symptom | Likely cause | What to do |
|---|---|---|
| **Nobody hears anything in the call** | voiceverb output on the wrong device, or the call microphone still on the physical mic | Confirm `CABLE Input`/BlackHole/voiceverb on the app output and `CABLE Output`/BlackHole/Monitor on the call input. Play the test tone. |
| **Echo or feedback** | Open speakers, monitor on, "Listen to this device" active | Use headphones, mute the monitor, disable "Ouvir este dispositivo" on Windows. Reduce the reverb mix if needed. |
| **High latency** | Large buffer, many apps open, extra virtual path | Use headphones, close heavy apps, prefer the browser's low-latency mode. A virtual cable adds a few milliseconds — unavoidable. |
| **Device does not appear** | Driver not installed/restarted, microphone permission, non-Chromium browser | Restart after installing the driver; allow the microphone in the system and in the browser; reload the page; for **output**, use Chrome/Edge (setSinkId). |
| **Sound only on one side** | Windows/cable balance or extreme stereo width | Check the balance in `mmsys.cpl`; set width back to ~100%; test with the test tone. |
| **The call app destroys the effect** | Echo cancellation, noise suppression and AGC in the call app | Disable those three features in Discord/Zoom/Meet/Teams. They process the voice and cut the reverb tail. |
| **Low volume** | Low input/output gain, reduced cable level, limiter engaging | Raise the input gain and output volume, check the `CABLE Input` level at 100% and the call input volume. Avoid clipping. |
| **Robotic/crackling audio** | Overloaded CPU or buffer too small | Close tabs/apps, increase the buffer/latency if the UI offers it, turn off heavy effects (pitch, robot, drive) while testing. |
| **Works on the monitor, not in the call** | Virtual cable not installed or call app permission denied | Reinstall/restart the driver; check the call app's microphone permission in the system. |

---

## Privacy and security

- voiceverb processes **everything locally** with the Web Audio API. The audio is not sent to any server; there are no accounts, analytics or uploads.
- The virtual cable is a **local** path. Any application with audio capture permission on the system can read `CABLE Output`/BlackHole/Monitor — treat it like a normal microphone.
- The service worker only stores the app's own files in the browser cache, so it works offline.
- A call app may keep sending the audio over the internet (that is its job). What voiceverb guarantees is that **processing and routing do not leave the machine**.
- On shared computers, end the transmission in the app and turn off the microphone in voiceverb when you are done.
