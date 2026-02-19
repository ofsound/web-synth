/**
 * CymaticsGeometry — Canvas 2D + GSAP mathematical pattern visualiser.
 *
 * Lissajous curves whose frequency ratios derive from the intervals
 * between active notes.  Single note → circle, two → figure-8, etc.
 * High density switches to Chladni-style standing-wave patterns.
 * GSAP smoothly morphs control points when notes change.
 */

import type { RefObject } from "react";
import gsap from "gsap";
import type { VisualizerScene } from "./types";
import type { MidiState } from "../useMidiState";
import type { MidiMapping, ResolvedParams } from "../MidiMapper";

// Animated state that GSAP targets
interface CurveState {
  freqX: number;
  freqY: number;
  phaseX: number;
  phaseY: number;
  amplitudeX: number;
  amplitudeY: number;
  trailAlpha: number;
  lineWidth: number;
  hue: number;
}

export class CymaticsGeometry implements VisualizerScene {
  readonly id = "cymatics";
  readonly name = "Cymatics / Sacred Geometry";
  readonly thumbnail = "✡️";
  readonly type = "canvas2d" as const;
  readonly supportedTargets = [
    "hue",
    "brightness",
    "speed",
    "intensity",
    "size",
  ] as const;

  readonly defaultMappings: MidiMapping[] = [
    { source: "pitch", target: "hue", range: [0, 1], curve: "linear" },
    {
      source: "velocity",
      target: "brightness",
      range: [0.4, 1],
      curve: "linear",
    },
    { source: "density", target: "speed", range: [0.5, 3], curve: "linear" },
    {
      source: "polyphony",
      target: "intensity",
      range: [0.3, 1],
      curve: "linear",
    },
    { source: "velocity", target: "size", range: [0.5, 1], curve: "linear" },
  ];

  private ctx2d: CanvasRenderingContext2D | null = null;
  private w = 0;
  private h = 0;
  private time = 0;
  private prevNoteKey = "";

  // Animated state tweened by GSAP
  private curve: CurveState = {
    freqX: 1,
    freqY: 1,
    phaseX: 0,
    phaseY: Math.PI / 2,
    amplitudeX: 0.35,
    amplitudeY: 0.35,
    trailAlpha: 0.06,
    lineWidth: 1.5,
    hue: 0.65,
  };

  init(canvas: HTMLCanvasElement, width: number, height: number) {
    this.ctx2d = canvas.getContext("2d");
    this.w = width;
    this.h = height;
    this.time = 0;

    if (!this.ctx2d) return;

    // Fill initial background
    const c = this.ctx2d;
    c.fillStyle = "#0f0f0f";
    c.fillRect(0, 0, this.w, this.h);
  }

  update(
    resolved: ResolvedParams,
    state: MidiState,
    dt: number,
    lastProcessedEventIdRef: RefObject<number>,
  ) {
    void lastProcessedEventIdRef;
    if (!this.ctx2d) return;
    const c = this.ctx2d;
    const speedMul = resolved.speed ?? 1;
    const brightness = resolved.brightness ?? 0.6;
    const intensity = resolved.intensity ?? 0.5;
    const sizeScale = resolved.size ?? 0.7;

    this.time += dt * speedMul;

    // Derive Lissajous ratios from intervals between active notes
    const notes = [...state.activeNotes.keys()].sort((a, b) => a - b);
    const noteKey = notes.join(",");

    if (noteKey !== this.prevNoteKey) {
      this.prevNoteKey = noteKey;
      const target = this.computeTargetCurve(notes, resolved);
      gsap.to(this.curve, {
        ...target,
        duration: 0.4,
        ease: "power2.out",
        overwrite: true,
      });
    }

    // Trail effect — semi-transparent overlay each frame
    c.fillStyle = `rgba(15, 15, 15, ${this.curve.trailAlpha})`;
    c.fillRect(0, 0, this.w, this.h);

    // Draw Lissajous curve
    const cx = this.w / 2;
    const cy = this.h / 2;
    const ax = this.curve.amplitudeX * Math.min(this.w, this.h) * sizeScale;
    const ay = this.curve.amplitudeY * Math.min(this.w, this.h) * sizeScale;
    const steps = 600 + Math.floor(intensity * 400);

    const l = 40 + brightness * 40;
    c.strokeStyle = `hsl(${this.curve.hue * 360}, 75%, ${l}%)`;
    c.lineWidth = this.curve.lineWidth;
    c.globalAlpha = 0.6 + brightness * 0.4;
    c.beginPath();

    for (let i = 0; i <= steps; i++) {
      const t = (i / steps) * Math.PI * 2;
      const x =
        cx +
        ax *
          Math.sin(this.curve.freqX * t + this.curve.phaseX + this.time * 0.5);
      const y =
        cy +
        ay *
          Math.sin(this.curve.freqY * t + this.curve.phaseY + this.time * 0.3);

      if (i === 0) c.moveTo(x, y);
      else c.lineTo(x, y);
    }
    c.stroke();

    // Secondary layer — subtle inner pattern at higher density
    if (state.density > 4) {
      c.globalAlpha = Math.min((state.density - 4) / 10, 0.3);
      c.strokeStyle = `hsl(${(this.curve.hue * 360 + 180) % 360}, 60%, ${l * 0.6}%)`;
      c.lineWidth = 0.5;
      c.beginPath();
      for (let i = 0; i <= steps; i++) {
        const t = (i / steps) * Math.PI * 2;
        // Chladni-esque: product of two standing waves
        const x =
          cx +
          ax *
            0.8 *
            Math.sin(this.curve.freqX * 2 * t + this.time * 0.7) *
            Math.cos(this.curve.freqY * t);
        const y =
          cy +
          ay *
            0.8 *
            Math.cos(this.curve.freqX * t) *
            Math.sin(this.curve.freqY * 2 * t + this.time * 0.4);
        if (i === 0) c.moveTo(x, y);
        else c.lineTo(x, y);
      }
      c.stroke();
    }

    c.globalAlpha = 1;
  }

  resize(width: number, height: number) {
    this.w = width;
    this.h = height;
  }

  dispose() {
    this.ctx2d = null;
  }

  /* ---- internal ---- */

  private computeTargetCurve(
    notes: number[],
    resolved: ResolvedParams,
  ): Partial<CurveState> {
    const hue = resolved.hue ?? 0.5;

    if (notes.length === 0) {
      return {
        freqX: 1,
        freqY: 1,
        phaseY: Math.PI / 2,
        amplitudeX: 0.1,
        amplitudeY: 0.1,
        trailAlpha: 0.12,
        lineWidth: 0.5,
        hue,
      };
    }

    if (notes.length === 1) {
      // Circle — 1:1
      return {
        freqX: 1,
        freqY: 1,
        phaseY: Math.PI / 2,
        amplitudeX: 0.35,
        amplitudeY: 0.35,
        trailAlpha: 0.06,
        lineWidth: 1.5,
        hue,
      };
    }

    // Use interval between lowest two notes to derive ratio
    const interval = (notes[1] - notes[0]) % 12;

    // Musical interval → Lissajous ratio (approximations)
    const ratioMap: Record<number, [number, number]> = {
      0: [1, 1], // unison
      1: [15, 16], // minor 2nd
      2: [8, 9], // major 2nd
      3: [5, 6], // minor 3rd
      4: [4, 5], // major 3rd
      5: [3, 4], // perfect 4th
      6: [5, 7], // tritone
      7: [2, 3], // perfect 5th
      8: [5, 8], // minor 6th
      9: [3, 5], // major 6th
      10: [5, 9], // minor 7th
      11: [8, 15], // major 7th
    };

    const [a, b] = ratioMap[interval] ?? [1, 1];

    // More notes → more complex, faster trail fade
    const complexity = Math.min(notes.length, 6);

    return {
      freqX: a + (complexity > 3 ? complexity - 3 : 0),
      freqY: b + (complexity > 4 ? complexity - 4 : 0),
      phaseY: Math.PI / (2 + complexity * 0.3),
      amplitudeX: 0.3 + complexity * 0.02,
      amplitudeY: 0.3 + complexity * 0.02,
      trailAlpha: 0.04 + complexity * 0.005,
      lineWidth: 1.5 - complexity * 0.1,
      hue,
    };
  }
}
