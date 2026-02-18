import { lazy, type JSX } from "react";

export interface RouteItem {
  path: string;
  label: string;
  element: React.LazyExoticComponent<() => JSX.Element>;
}

export interface RouteSection {
  title: string;
  basePath: string;
  routes: RouteItem[];
}

/* ────────── Audio Manipulation (Section A) ────────── */

const manipulation: RouteItem[] = [
  {
    path: "parametric-eq",
    label: "A1 · Parametric EQ",
    element: lazy(() => import("./pages/manipulation/ParametricEQ")),
  },
  {
    path: "convolution-reverb",
    label: "A2 · Convolution Reverb",
    element: lazy(() => import("./pages/manipulation/ConvolutionReverb")),
  },
  {
    path: "distortion",
    label: "A3 · Distortion",
    element: lazy(() => import("./pages/manipulation/Distortion")),
  },
  {
    path: "compressor",
    label: "A4 · Compressor",
    element: lazy(() => import("./pages/manipulation/Compressor")),
  },
  {
    path: "delay-echo",
    label: "A5 · Delay / Echo",
    element: lazy(() => import("./pages/manipulation/DelayEcho")),
  },
  {
    path: "ping-pong-delay",
    label: "A6 · Ping-Pong Delay",
    element: lazy(() => import("./pages/manipulation/PingPongDelay")),
  },
  {
    path: "chorus",
    label: "A7 · Chorus",
    element: lazy(() => import("./pages/manipulation/Chorus")),
  },
  {
    path: "flanger",
    label: "A8 · Flanger",
    element: lazy(() => import("./pages/manipulation/Flanger")),
  },
  {
    path: "phaser",
    label: "A9 · Phaser",
    element: lazy(() => import("./pages/manipulation/Phaser")),
  },
  {
    path: "auto-wah",
    label: "A10 · Auto-Wah",
    element: lazy(() => import("./pages/manipulation/AutoWah")),
  },
  {
    path: "auto-pan",
    label: "A11 · Auto-Pan",
    element: lazy(() => import("./pages/manipulation/AutoPan")),
  },
  {
    path: "spatial-audio",
    label: "A12 · 3D Spatial Audio",
    element: lazy(() => import("./pages/manipulation/SpatialAudio")),
  },
  {
    path: "bitcrusher",
    label: "A13 · Bitcrusher",
    element: lazy(() => import("./pages/manipulation/Bitcrusher")),
  },
  {
    path: "ring-modulator",
    label: "A14 · Ring Modulator",
    element: lazy(() => import("./pages/manipulation/RingModulator")),
  },
  {
    path: "oscilloscope",
    label: "A15 · Oscilloscope",
    element: lazy(() => import("./pages/manipulation/Oscilloscope")),
  },
  {
    path: "spectrum-analyzer",
    label: "A16 · Spectrum Analyzer",
    element: lazy(() => import("./pages/manipulation/SpectrumAnalyzer")),
  },
  {
    path: "spectrogram",
    label: "A17 · Spectrogram",
    element: lazy(() => import("./pages/manipulation/SpectrogramView")),
  },
  {
    path: "vocal-effects",
    label: "A18 · Vocal Effects",
    element: lazy(() => import("./pages/manipulation/VocalEffects")),
  },
  {
    path: "audio-recorder",
    label: "A19 · Audio Recorder",
    element: lazy(() => import("./pages/manipulation/AudioRecorder")),
  },
  {
    path: "custom-iir-filter",
    label: "A20 · Custom IIR Filter",
    element: lazy(() => import("./pages/manipulation/CustomIIRFilter")),
  },
  {
    path: "pedalboard",
    label: "A21 · Pedalboard",
    element: lazy(() => import("./pages/manipulation/Pedalboard")),
  },
  {
    path: "mid-side",
    label: "A22 · Mid/Side Processing",
    element: lazy(() => import("./pages/manipulation/MidSideProcessing")),
  },
];

/* ────────── Synthesizer Engine (Section B) ────────── */

const synth: RouteItem[] = [
  {
    path: "oscillator-explorer",
    label: "B1 · Oscillator Explorer",
    element: lazy(() => import("./pages/synth/OscillatorExplorer")),
  },
  {
    path: "waveform-designer",
    label: "B2 · Waveform Designer",
    element: lazy(() => import("./pages/synth/WaveformDesigner")),
  },
  {
    path: "adsr-visualizer",
    label: "B3 · ADSR Visualizer",
    element: lazy(() => import("./pages/synth/ADSRVisualizer")),
  },
  {
    path: "subtractive-synth",
    label: "B4 · Subtractive Synth",
    element: lazy(() => import("./pages/synth/SubtractiveSynth")),
  },
  {
    path: "additive-synth",
    label: "B5 · Additive Synth",
    element: lazy(() => import("./pages/synth/AdditiveSynth")),
  },
  {
    path: "fm-synth-2op",
    label: "B6 · FM Synth (2-Op)",
    element: lazy(() => import("./pages/synth/FMSynth2Op")),
  },
  {
    path: "fm-synth-6op",
    label: "B7 · FM Synth (6-Op)",
    element: lazy(() => import("./pages/synth/FMSynth6Op")),
  },
  {
    path: "am-ring-mod",
    label: "B8 · AM / Ring Mod",
    element: lazy(() => import("./pages/synth/AMRingModSynth")),
  },
  {
    path: "wavetable-synth",
    label: "B9 · Wavetable Synth",
    element: lazy(() => import("./pages/synth/WavetableSynth")),
  },
  {
    path: "karplus-strong",
    label: "B10 · Karplus-Strong",
    element: lazy(() => import("./pages/synth/KarplusStrong")),
  },
  {
    path: "vibrato-tremolo",
    label: "B11 · Vibrato & Tremolo",
    element: lazy(() => import("./pages/synth/VibratoTremolo")),
  },
  {
    path: "noise-generator",
    label: "B12 · Noise Generator",
    element: lazy(() => import("./pages/synth/NoiseGenerator")),
  },
  {
    path: "noise-filter-sweep",
    label: "B13 · Noise + Filter Sweep",
    element: lazy(() => import("./pages/synth/NoiseFilterSweep")),
  },
  {
    path: "granular-synth",
    label: "B14 · Granular Synth",
    element: lazy(() => import("./pages/synth/GranularSynth")),
  },
  {
    path: "granular-freeze",
    label: "B15 · Granular Freeze",
    element: lazy(() => import("./pages/synth/GranularFreeze")),
  },
  {
    path: "poly-keyboard",
    label: "B16 · Polyphonic Keyboard",
    element: lazy(() => import("./pages/synth/PolyKeyboard")),
  },
  {
    path: "unison-supersaw",
    label: "B17 · Unison / Supersaw",
    element: lazy(() => import("./pages/synth/UnisonSupersaw")),
  },
  {
    path: "portamento",
    label: "B18 · Portamento / Glide",
    element: lazy(() => import("./pages/synth/Portamento")),
  },
  {
    path: "arpeggiator",
    label: "B19 · Arpeggiator",
    element: lazy(() => import("./pages/synth/Arpeggiator")),
  },
  {
    path: "step-sequencer",
    label: "B20 · Step Sequencer",
    element: lazy(() => import("./pages/synth/StepSequencer")),
  },
  {
    path: "drum-machine",
    label: "B21 · Drum Machine",
    element: lazy(() => import("./pages/synth/DrumMachine")),
  },
  {
    path: "drone-machine",
    label: "B22 · Drone Machine",
    element: lazy(() => import("./pages/synth/DroneMachine")),
  },
  {
    path: "theremin",
    label: "B23 · Theremin",
    element: lazy(() => import("./pages/synth/Theremin")),
  },
  {
    path: "web-midi",
    label: "B24 · Web MIDI",
    element: lazy(() => import("./pages/synth/WebMIDI")),
  },
];

export const sections: RouteSection[] = [
  {
    title: "Audio Manipulation",
    basePath: "manipulation",
    routes: manipulation,
  },
  { title: "Synthesizer Engine", basePath: "synth", routes: synth },
];
