/**
 * Scene registry — central list of all available visualiser scenes.
 *
 * Metadata (SCENE_METAS) is kept as plain data so components like
 * ThumbnailStrip and MappingModal can render without instantiating
 * any scene class.  Actual scene instances are created on-demand via
 * createScene(idx) so only the active scene lives in memory at a time.
 */

import { ParticleStorm } from "./ParticleStorm";
import { GeometricOrbits } from "./GeometricOrbits";
import { PianoRollWaterfall } from "./PianoRollWaterfall";
import { CymaticsGeometry } from "./CymaticsGeometry";
import { GridPulseMatrix } from "./GridPulseMatrix";
import type { VisualizerScene } from "./types";
import type { MidiMapping } from "../MidiMapper";

/** Lightweight metadata for a scene — no class instantiation required. */
export interface SceneMeta {
  id: string;
  name: string;
  thumbnail: string;
  type: "three" | "canvas2d";
  defaultMappings: MidiMapping[];
  supportedTargets: readonly string[];
}

/** Static metadata for all scenes, used by the UI without allocating scene objects. */
export const SCENE_METAS: SceneMeta[] = [
  {
    id: "particle-storm",
    name: "Particle Storm",
    thumbnail: "\uD83C\uDF2A\uFE0F",
    type: "three",
    supportedTargets: ["hue", "size", "speed", "spread", "intensity"],
    defaultMappings: [
      { source: "pitch", target: "hue", range: [0, 1], curve: "linear" },
      { source: "velocity", target: "size", range: [0.3, 1], curve: "linear" },
      { source: "velocity", target: "speed", range: [0.5, 3], curve: "exponential" },
      { source: "density", target: "spread", range: [0.3, 1], curve: "linear" },
      { source: "polyphony", target: "intensity", range: [0.2, 1], curve: "linear" },
    ],
  },
  {
    id: "geometric-orbits",
    name: "Geometric Orbits",
    thumbnail: "\uD83D\uDC8E",
    type: "three",
    supportedTargets: ["hue", "size", "speed", "rotation", "intensity"],
    defaultMappings: [
      { source: "pitch", target: "hue", range: [0, 1], curve: "linear" },
      { source: "velocity", target: "size", range: [0.4, 1.5], curve: "exponential" },
      { source: "velocity", target: "speed", range: [0.3, 2], curve: "linear" },
      { source: "polyphony", target: "rotation", range: [0.2, 2], curve: "linear" },
      { source: "density", target: "intensity", range: [0.3, 1], curve: "linear" },
    ],
  },
  {
    id: "piano-roll",
    name: "Piano Roll Waterfall",
    thumbnail: "\uD83C\uDFB9",
    type: "canvas2d",
    supportedTargets: ["hue", "brightness", "speed", "size"],
    defaultMappings: [
      { source: "pitch", target: "hue", range: [0, 1], curve: "linear" },
      { source: "velocity", target: "brightness", range: [0.4, 1], curve: "linear" },
      { source: "density", target: "speed", range: [0.5, 2], curve: "linear" },
      { source: "velocity", target: "size", range: [0.5, 1], curve: "linear" },
    ],
  },
  {
    id: "cymatics",
    name: "Cymatics / Sacred Geometry",
    thumbnail: "\u2721\uFE0F",
    type: "canvas2d",
    supportedTargets: ["hue", "brightness", "speed", "intensity", "size"],
    defaultMappings: [
      { source: "pitch", target: "hue", range: [0, 1], curve: "linear" },
      { source: "velocity", target: "brightness", range: [0.4, 1], curve: "linear" },
      { source: "density", target: "speed", range: [0.5, 3], curve: "linear" },
      { source: "polyphony", target: "intensity", range: [0.3, 1], curve: "linear" },
      { source: "velocity", target: "size", range: [0.5, 1], curve: "linear" },
    ],
  },
  {
    id: "grid-pulse",
    name: "Grid Pulse Matrix",
    thumbnail: "\u25A6",
    type: "canvas2d",
    supportedTargets: ["hue", "brightness", "intensity", "size"],
    defaultMappings: [
      { source: "pitch", target: "hue", range: [0, 1], curve: "linear" },
      { source: "velocity", target: "brightness", range: [0.5, 1], curve: "exponential" },
      { source: "density", target: "intensity", range: [0.1, 0.8], curve: "linear" },
      { source: "velocity", target: "size", range: [0.6, 1], curve: "linear" },
    ],
  },
];

/**
 * Instantiate a fresh scene by index.  Called on-demand when the user
 * switches to a scene — only one scene instance lives in memory at a time.
 */
export function createScene(idx: number): VisualizerScene {
  switch (idx) {
    case 0: return new ParticleStorm();
    case 1: return new GeometricOrbits();
    case 2: return new PianoRollWaterfall();
    case 3: return new CymaticsGeometry();
    case 4: return new GridPulseMatrix();
    default: return new ParticleStorm();
  }
}

/** @deprecated Use SCENE_METAS + createScene(idx) instead. */
export function createScenes(): VisualizerScene[] {
  return SCENE_METAS.map((_, i) => createScene(i));
}
