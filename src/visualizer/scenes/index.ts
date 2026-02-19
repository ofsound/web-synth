/**
 * Scene registry — central list of all available visualiser scenes.
 *
 * Metadata (SCENE_METAS) is derived from the scene classes' own readonly
 * properties — single source of truth.  Lightweight factory instances are
 * created once at import time (no GPU resources allocated until `init()`).
 */

import { ParticleStorm } from "./ParticleStorm";
import { GeometricOrbits } from "./GeometricOrbits";
import { PianoRollWaterfall } from "./PianoRollWaterfall";
import { CymaticsGeometry } from "./CymaticsGeometry";
import { GridPulseMatrix } from "./GridPulseMatrix";
import type { VisualizerScene } from "./types";
import type { MidiMapping } from "../MidiMapper";

/** Lightweight metadata for a scene — no GPU resource allocation required. */
export interface SceneMeta {
    id: string;
    name: string;
    thumbnail: string;
    type: "three" | "canvas2d";
    defaultMappings: MidiMapping[];
    supportedTargets: readonly string[];
}

/** Ordered list of scene constructors — the single source of truth. */
const SCENE_CONSTRUCTORS: Array<new () => VisualizerScene> = [
    ParticleStorm,
    GeometricOrbits,
    PianoRollWaterfall,
    CymaticsGeometry,
    GridPulseMatrix,
];

/** Extract metadata from scene classes. The instances are lightweight
 *  (no canvas / GPU resources until `init()` is called) and are created
 *  once per import then discarded by the GC. */
function deriveMetadata(): SceneMeta[] {
    return SCENE_CONSTRUCTORS.map((Ctor) => {
        const s = new Ctor();
        return {
            id: s.id,
            name: s.name,
            thumbnail: s.thumbnail,
            type: s.type,
            defaultMappings: s.defaultMappings,
            supportedTargets: s.supportedTargets,
        };
    });
}

/** Static metadata for all scenes, used by the UI without keeping scene objects alive. */
export const SCENE_METAS: SceneMeta[] = deriveMetadata();

/**
 * Instantiate a fresh scene by index.  Called on-demand when the user
 * switches to a scene — only one scene instance lives in memory at a time.
 */
export function createScene(idx: number): VisualizerScene {
    const Ctor = SCENE_CONSTRUCTORS[idx] ?? SCENE_CONSTRUCTORS[0];
    return new Ctor();
}

