/**
 * VisualizerScene — interface that every visualiser scene must implement.
 *
 * A scene owns its rendering resources (Three.js objects OR Canvas 2D
 * state) and exposes a frame-by-frame `update()` driven by the
 * VisualizerCanvas host component's rAF loop.
 */

import type { RefObject } from "react";
import type { MidiState } from "../useMidiState";
import type { MidiMapping, ResolvedParams } from "../MidiMapper";

export interface VisualizerScene {
  id: string;
  name: string;
  thumbnail: string;
  type: "three" | "canvas2d";
  defaultMappings: MidiMapping[];
  supportedTargets: readonly string[];

  init(canvas: HTMLCanvasElement, width: number, height: number): void;

  /**
   * Called every animation frame.
   *
   * @param resolved  — mapped & curved visual parameters
   * @param state     — raw MIDI snapshot (for direct note access)
   * @param dt        — delta time in seconds since last frame
   * @param lastProcessedEventIdRef — ref tracking last consumed event ID
   */
  update(
    resolved: ResolvedParams,
    state: MidiState,
    dt: number,
    lastProcessedEventIdRef: RefObject<number>,
  ): void;

  resize(width: number, height: number): void;

  dispose(): void;
}
