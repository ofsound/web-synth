# Web Synth Workstation

A React + TypeScript + Vite web-audio workstation with real-time MIDI control, polyphonic synth engines, a flexible effects rack, and a configurable MIDI-driven visualizer.

## Feature Overview

### MIDI Inputs (4 sources → shared bus)
- **Web MIDI** — hardware devices via the Web MIDI API
- **On-screen keyboard** — mouse/touch piano, C2–C6
- **Polyphonic step sequencer** — 16/32-step grid with per-step velocity, gate, probability, and swing; scale/root snapping
- **MIDI file player** — drag-and-drop `.mid` loading, piano-roll preview, per-track selection, transport controls, and seekable progress bar

All sources publish a normalized `MidiEvent` to a single shared `MidiBus`. Per-source channel policies (`"normalized"` or `"source"`) are applied at emission time.

### Synth Engines (3 in parallel)
- **FM (2-operator)** — carrier/modulator oscillator pair with mod-index envelope, selectable carrier waveform, ADSR on both amplitude and modulation
- **Subtractive** — oscillator → lowpass filter with dual ADSR (amplitude + filter envelope), resonance, filter-env amount
- **Granular** — per-note grain streams with Hanning-windowed `AudioBufferSource` grains, lookahead `setTimeout` scheduler, configurable grain size, density, position, position randomization, and pitch randomization

Each engine is independently enable/disable-able and contributes to a shared mix bus.

### Effects Rack
- **Delay / Echo** — tap delay with dry/wet mix and feedback
- **Phaser** — all-pass chain LFO phaser with rate, depth, and mix
- **Bitcrusher** — `WaveShaperNode`-based bit depth and sample-rate reduction

The rack supports **serial** and **parallel** routing modes and per-effect ordering via up/down controls. Routing is rewired surgically (no full disconnect/reconnect) to avoid audio clicks.

### Master Output Chain
```
synthMix → effectsSend → [effects rack] → effectsReturn
         → masterGain → limiter → ctx.destination
                      └→ splitter → analyserL / analyserR → Stereo VU Meter
```
- Safety `DynamicsCompressorNode` limiter before output
- VU analysers tapped **after** the limiter — meters reflect true output levels
- Peak-hold bars with dBFS scale; automatic RAF pause during sustained silence

### Visualizer (5 scenes, lazy-loaded)
| Scene | Renderer | MIDI sources |
|---|---|---|
| Particle Storm | Three.js | pitch, velocity, density, polyphony |
| Geometric Orbits | Three.js + GSAP | pitch, velocity, polyphony, centroid |
| Piano Roll Waterfall | Canvas 2D | pitch, velocity, density |
| Cymatics / Sacred Geometry | Canvas 2D + GSAP | pitch, velocity, density |
| Grid Pulse Matrix | Canvas 2D + GSAP | pitch, velocity, polyphony |

Each scene declares supported visual targets (`hue`, `size`, `speed`, `intensity`, …). A **MIDI Mapper** translates normalized MIDI state (pitch, velocity, density, polyphony, centroid, CC) into those targets via configurable source/target/range/curve mappings, editable per-scene through a mapping modal.

---

## Architecture

### Entry Point & Providers
```
src/main.tsx
└── AudioContextProvider   (lazy-init on first user gesture)
    └── MidiBusProvider    (singleton MidiBus instance)
        └── Workstation    (page layout + wiring)
```

### Workstation Layout
- **Left panel (33%)** — MIDI inputs, synth engines, effects rack, master output; scrollable
- **Right panel (67%)** — visualizer canvas; sticky / full-height
- Mobile: visualizer is hidden behind a toggle button and renders as a full-screen overlay

Section components (`MidiInputSection`, `SynthEngineSection`, `EffectsRackSection`, `MasterOutputSection`) are each wrapped in `React.memo` and `ErrorBoundary` to isolate re-renders and prevent cascading failures.

### Synth Hook Layers
```
useSynthIO          — params state + ref, output GainNode, MidiBus subscription
└── useSynthBase    — VoiceManager lifecycle (noteOn / noteOff / allNotesOff)
    ├── useFMSynth
    └── useSubtractiveSynth
useGranularSynth    — custom grain scheduler on top of useSynthIO directly
```

`useSynthIO` provides a stable `getParams()` getter (via ref) so voice callbacks never capture stale params in closures.

### VoiceManager
Generic class (`src/synth/VoiceManager.ts`) handling polyphonic voice allocation, re-trigger, and oldest-voice stealing. Maximum polyphony is configurable per engine (default 16; granular uses 8).

### ADSR
Shared `applyAttack` / `applyRelease` helpers (`src/synth/ADSREnvelope.ts`) use `cancelAndHoldAtTime` where available (correct mid-automation capture) with a `cancelScheduledValues` fallback.

### MidiBus & Channel Policy
`MidiBus` is a typed pub/sub (`Set<MidiSubscriber>`). Sources apply a `MidiChannelMode` at emit time:
- `"normalized"` — all events remapped to channel 0 (keyboard, sequencer)
- `"source"` — original MIDI channel preserved (MIDI file player)

### Scheduler
Chris Wilson look-ahead scheduler (`src/utils/scheduler.ts`) drives the step sequencer and MIDI file player. Scheduling runs ~25 ms ahead with a 100 ms audio-time lookahead buffer to decouple `setTimeout` jitter from Web Audio event timing.

### MIDI State & Visualizer Pipeline
```
MidiBus events → useMidiState (RingBuffer<NoteRecord>, derived: density/centroid/polyphony)
              → MidiMapper.resolve(state, mappings[])
              → ResolvedParams (normalised 0–1 per VisualTarget)
              → scene.update(resolved, state, dt)
```

`useMidiState` stores everything in a ref (`MutableRefObject<MidiState>`) so the visualizer reads it every RAF frame without triggering any React re-renders.

### Constants
All magic numbers live in `src/constants.ts`, sectioned by domain (audio engine, visualizer, MIDI, scheduler, VU meter, etc.).

---

## Key Directories

| Path | Contents |
|---|---|
| `src/midi` | MidiBus, input adapters (WebMidi, keyboard, sequencer, file player), channel policy |
| `src/synth` | Engine hooks, VoiceManager, ADSREnvelope, useSynthBase, useSynthIO |
| `src/effects` | Effect hooks (delay, phaser, bitcrusher), effect rack router |
| `src/master` | Master output chain hook |
| `src/visualizer` | MidiState, MidiMapper, scene host canvas, 5 scene classes, mapping modal, thumbnail strip |
| `src/components` | Reusable UI — Knob, Slider, ADSREnvelope (canvas), VUMeter, EffectCard, SynthPanel, PianoKeyboard, ErrorBoundary |
| `src/context` | AudioContext provider + context token |
| `src/types` | Shared TypeScript types (`audio.ts`, `midi.ts`) |
| `src/utils` | Audio utilities, MIDI utilities, Scheduler |
| `src/constants.ts` | All tuning constants |

---

## Developer Setup

### Prerequisites
- Node.js 20+
- npm
- Modern browser with Web Audio API (Chrome or Firefox recommended)
- Optional: Web MIDI-capable browser and hardware device

### Install
```bash
npm install
```

### Run
```bash
npm run dev
```

### Test
```bash
npm run test
```

### Lint
```bash
npm run lint
```

### Build
```bash
npm run build
```

### Preview Production Build
```bash
npm run preview
```

### Tech Stack
- React 19, TypeScript 5.9, Vite 7
- Tailwind CSS v4 (via `@tailwindcss/vite`)
- Three.js 0.183 (WebGL visualizer scenes)
- GSAP 3 (tween-driven scene animations)
- `@tonejs/midi` (MIDI file parsing)
- Vitest + jsdom (unit tests)


## Quality Gates

Use this sequence before merge:

```bash
npm run lint
npm run build
```

Expected: all pass cleanly.

## Performance Notes

- Visualizer is lazy-loaded from `Workstation`, reducing initial app chunk size.
- A large visualizer chunk is expected; future optimization can split scenes into separate dynamic imports if needed.

## MIDI + Audio Notes

- Sequencer timing uses scheduler-aligned timing with explicit timeout cleanup and note flush on stop.
- Web MIDI input adapter rebinds listeners on device topology changes and performs teardown on unmount.
- Panic button (`All Notes Off`) is available in header.

## Known Constraints

- Web MIDI support depends on browser + permissions + connected devices.
- Visualizer GPU cost depends on scene complexity and machine capability.
- Chunk size warning from Vite is informational unless your deployment has strict budget limits.

## Maintenance Guidelines

- Keep audio graph changes localized in hooks under `src/synth`, `src/effects`, and `src/master`.
- Preserve MIDI event normalization in `src/midi/MidiBus.ts`.
- Prefer small, verifiable changes and always run quality gates after edits.
- Avoid adding duplicate scene construction paths in visualizer lifecycle code.
