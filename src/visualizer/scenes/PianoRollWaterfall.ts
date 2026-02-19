/**
 * PianoRollWaterfall — Canvas 2D + GSAP piano-roll style visualiser.
 *
 * Notes fall downward as coloured bars.  X = pitch (0–127), bar height
 * grows while held, colour = velocity brightness.  GSAP tweens smooth
 * entry glow and fade-out on release.
 */

import type { RefObject } from "react";
import gsap from "gsap";
import type { VisualizerScene } from "./types";
import type { MidiState } from "../useMidiState";
import type { MidiMapping, ResolvedParams } from "../MidiMapper";

const NOTE_LO = 21; // A0
const NOTE_HI = 108; // C8
const NOTE_RANGE = NOTE_HI - NOTE_LO + 1;
const SCROLL_SPEED = 120; // px per second
const BAR_MAX_HISTORY = 600;

interface Bar {
  note: number;
  velocity: number;
  y: number; // top edge (grows each frame while held)
  height: number;
  hue: number;
  alpha: number;
  held: boolean;
  glowScale: number;
}

export class PianoRollWaterfall implements VisualizerScene {
  readonly id = "piano-roll";
  readonly name = "Piano Roll Waterfall";
  readonly thumbnail = "🎹";
  readonly type = "canvas2d" as const;
  readonly supportedTargets = ["hue", "brightness", "speed", "size"] as const;

  readonly defaultMappings: MidiMapping[] = [
    { source: "pitch", target: "hue", range: [0, 1], curve: "linear" },
    {
      source: "velocity",
      target: "brightness",
      range: [0.4, 1],
      curve: "linear",
    },
    { source: "density", target: "speed", range: [0.5, 2], curve: "linear" },
    { source: "velocity", target: "size", range: [0.5, 1], curve: "linear" },
  ];

  private ctx2d: CanvasRenderingContext2D | null = null;
  private w = 0;
  private h = 0;
  private bars: Bar[] = [];
  private heldBars = new Map<number, Bar>(); // note → bar currently being held
  private lastNotes = new Set<number>();
  private canvas: HTMLCanvasElement | null = null;
  private contextLost = false;

  init(canvas: HTMLCanvasElement, width: number, height: number) {
    this.canvas = canvas;
    this.ctx2d = canvas.getContext("2d");
    this.w = width;
    this.h = height;
    if (!this.ctx2d) return;
    for (const bar of this.bars) gsap.killTweensOf(bar);
    this.bars = [];
    this.heldBars.clear();
    this.lastNotes.clear();
    this.contextLost = false;

    // Handle context loss/restoration for Canvas2D
    canvas.addEventListener("contextlost", this.handleContextLost);
    canvas.addEventListener("contextrestored", this.handleContextRestored);
  }

  private handleContextLost = (e: Event) => {
    e.preventDefault();
    this.contextLost = true;
    this.ctx2d = null;
  };

  private handleContextRestored = () => {
    this.contextLost = false;
    if (this.canvas) {
      this.ctx2d = this.canvas.getContext("2d");
    }
  };

  update(
    resolved: ResolvedParams,
    state: MidiState,
    dt: number,
    lastProcessedEventIdRef: RefObject<number>,
  ) {
    void lastProcessedEventIdRef;
    if (!this.ctx2d || this.contextLost) return;
    const c = this.ctx2d;
    const speedMul = resolved.speed ?? 1;
    const sizeScale = resolved.size ?? 1;
    const scroll = SCROLL_SPEED * speedMul * dt;

    const currentNotes = new Set(state.activeNotes.keys());

    // Detect new noteOns
    for (const note of currentNotes) {
      if (!this.lastNotes.has(note) && !this.heldBars.has(note)) {
        const active = state.activeNotes.get(note)!;
        const pitchClass = note % 12;
        const hue = pitchClass / 12;
        const bar: Bar = {
          note,
          velocity: active.velocity,
          y: 0,
          height: 2,
          hue,
          alpha: 1,
          held: true,
          glowScale: 1.5,
        };
        // GSAP glow animation on spawn
        gsap.to(bar, { glowScale: 1, duration: 0.3, ease: "power2.out" });
        this.bars.push(bar);
        this.heldBars.set(note, bar);
      }
    }

    // Detect noteOffs
    for (const note of this.lastNotes) {
      if (!currentNotes.has(note)) {
        const bar = this.heldBars.get(note);
        if (bar) {
          bar.held = false;
          this.heldBars.delete(note);
          // GSAP fade out
          gsap.to(bar, { alpha: 0.25, duration: 1.5, ease: "power1.out" });
        }
      }
    }
    this.lastNotes = currentNotes;

    // Update bars
    for (const bar of this.bars) {
      if (bar.held) {
        // Grow bar while held
        bar.height += scroll;
      } else {
        // Scroll the bar downward
        bar.y += scroll;
      }
    }

    // Remove off-screen bars
    this.bars = this.bars.filter((b) => b.y < this.h + 20);
    if (this.bars.length > BAR_MAX_HISTORY) {
      this.bars.splice(0, this.bars.length - BAR_MAX_HISTORY);
    }

    // ── Draw ──
    c.clearRect(0, 0, this.w, this.h);
    c.fillStyle = "#0f0f0f";
    c.fillRect(0, 0, this.w, this.h);

    // Piano key guides (very subtle)
    const colW = this.w / NOTE_RANGE;
    for (let n = NOTE_LO; n <= NOTE_HI; n++) {
      const isBlack = [1, 3, 6, 8, 10].includes(n % 12);
      if (isBlack) {
        const x = (n - NOTE_LO) * colW;
        c.fillStyle = "rgba(255,255,255,0.02)";
        c.fillRect(x, 0, colW, this.h);
      }
    }

    // Draw bars
    for (const bar of this.bars) {
      const x = ((bar.note - NOTE_LO) / NOTE_RANGE) * this.w;
      const barW = Math.max(colW * sizeScale, 3);
      const velNorm = bar.velocity / 127;

      // HSL to CSS
      const l = 35 + velNorm * 40; // 35–75% lightness
      c.globalAlpha = bar.alpha;

      // Glow layer
      if (bar.glowScale > 1.01) {
        c.shadowColor = `hsl(${bar.hue * 360}, 80%, ${l}%)`;
        c.shadowBlur = 12 * bar.glowScale;
      } else {
        c.shadowBlur = 0;
      }

      c.fillStyle = `hsl(${bar.hue * 360}, 75%, ${l}%)`;
      c.fillRect(x - barW / 2, bar.y, barW, Math.max(bar.height, 2));
    }

    c.globalAlpha = 1;
    c.shadowBlur = 0;
  }

  resize(width: number, height: number) {
    this.w = width;
    this.h = height;
  }

  dispose() {
    // Kill all active GSAP tweens targeting bar objects
    for (const bar of this.bars) {
      gsap.killTweensOf(bar);
    }
    for (const [, bar] of this.heldBars) {
      gsap.killTweensOf(bar);
    }
    this.bars = [];
    this.heldBars.clear();
    this.lastNotes.clear();
    this.ctx2d = null;

    // Remove event listeners
    if (this.canvas) {
      this.canvas.removeEventListener("contextlost", this.handleContextLost);
      this.canvas.removeEventListener(
        "contextrestored",
        this.handleContextRestored,
      );
      this.canvas = null;
    }
  }
}
