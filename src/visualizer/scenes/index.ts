/**
 * Scene registry — central list of all available visualiser scenes.
 */

import { ParticleStorm } from "./ParticleStorm";
import { GeometricOrbits } from "./GeometricOrbits";
import { PianoRollWaterfall } from "./PianoRollWaterfall";
import { CymaticsGeometry } from "./CymaticsGeometry";
import { GridPulseMatrix } from "./GridPulseMatrix";
import type { VisualizerScene } from "./types";

export function createScenes(): VisualizerScene[] {
    return [
        new ParticleStorm(),
        new GeometricOrbits(),
        new PianoRollWaterfall(),
        new CymaticsGeometry(),
        new GridPulseMatrix(),
    ];
}
