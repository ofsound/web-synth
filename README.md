# Web Synth Workstation

A React + TypeScript + Vite web-audio workstation focused on real-time MIDI control, parallel synth engines, flexible effects routing, and a configurable MIDI-driven visualizer.

## Current Product Scope

- 3 MIDI input sources merged into one shared MIDI bus
  - Web MIDI hardware
  - On-screen keyboard
  - Polyphonic step sequencer
- 3 synth engines in parallel
  - FM (2-op)
  - Subtractive
  - Granular
- Effects rack with flexible routing
  - Delay / Echo
  - Phaser
  - Bitcrusher
  - Serial or parallel mode, plus ordering controls
- Master output chain
  - Master gain
  - Safety limiter
  - Stereo VU meter
- MIDI visualizer module
  - Three.js + GSAP scenes
  - MIDI-to-visual mapping controls
  - Lazy-loaded for bundle splitting

## Architecture (High-Level)

- App bootstrap: `src/main.tsx`
  - `AudioContextProvider`
  - `MidiBusProvider`
  - `Workstation`
- Main page shell: `src/Workstation.tsx`
  - Left panel: MIDI, synths, effects, master
  - Right panel: visualizer (lazy-loaded)

### Signal Flow

1. MIDI events are emitted into a shared event bus (`src/midi/MidiBus.ts`).
2. Synth hooks subscribe to MIDI and generate audio in parallel.
3. Synth outputs are summed into `master.synthMix`.
4. Effects rack patches between `effectsSend` and `effectsReturn`.
5. Master gain feeds:
   - limiter → destination
   - analyzers → stereo VU meter

### MIDI Flow

- Sources (`WebMidiInput`, `KeyboardInput`, `PolySequencer`) emit normalized `MidiEvent` objects.
- Consumers (synth hooks + visualizer state hook) subscribe to the same bus.

## Key Directories

- `src/midi` — MIDI bus + input adapters + sequencer
- `src/synth` — synth engines + voice management + ADSR helpers
- `src/effects` — effect hooks + rack router
- `src/master` — master output graph
- `src/visualizer` — MIDI state, mapper, scenes, host canvas
- `src/components` — reusable UI controls and cards

## Developer Setup

### Prerequisites

- Node.js 20+ recommended
- npm
- Modern browser with Web Audio API
- Optional: Web MIDI-capable browser/device for hardware MIDI input

### Install

```bash
npm install
```

### Run

```bash
npm run dev
```

### Build

```bash
npm run build
```

### Preview Production Build

```bash
npm run preview
```

### Lint

```bash
npm run lint
```

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
