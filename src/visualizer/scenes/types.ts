/**
 * VisualizerScene — interface that every visualiser scene must implement.
 *
 * A scene owns its rendering resources (Three.js objects OR Canvas 2D
 * state) and exposes a frame-by-frame `update()` driven by the
 * VisualizerCanvas host component's rAF loop.
 */

import type { MidiState } from "../useMidiState";
import type { MidiMapping, ResolvedParams } from "../MidiMapper";

export interface VisualizerScene {
    /** Unique stable id used as React key and for persisting settings. */
    id: string;
    /** Human-readable name. */
    name: string;
    /** Emoji or very short label for the thumbnail strip. */
    thumbnail: string;
    /** Renderer requirement. */
    type: "three" | "canvas2d";
    /** Default MIDI → visual mappings for this scene. */
    defaultMappings: MidiMapping[];
    /** Which visual targets this scene actually reads. */
    supportedTargets: readonly string[];

    /**
     * Initialise the scene.  For Three.js scenes the host provides a
     * `WebGLRenderer`; for Canvas 2D scenes a `CanvasRenderingContext2D`.
     */
    init(canvas: HTMLCanvasElement, width: number, height: number): void;

    /**
     * Called every animation frame.
     *
     * @param resolved  — mapped & curved visual parameters
     * @param state     — raw MIDI snapshot (for direct note access)
     * @param dt        — delta time in seconds since last frame
     */
    update(resolved: ResolvedParams, state: MidiState, dt: number): void;

    /** Handle viewport resize. */
    resize(width: number, height: number): void;

    /** Tear down all GPU / event resources. */
    dispose(): void;
}
