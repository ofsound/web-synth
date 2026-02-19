/**
 * GridPulseMatrix — Canvas 2D + GSAP grid visualiser.
 *
 * 12 columns (pitch classes C–B) × octave rows.  noteOn lights up
 * the cell and triggers a GSAP-driven ripple to adjacent cells.
 * Velocity → brightness and ripple radius.  Cells decay back to a
 * dim state.
 */

import gsap from "gsap";
import type { VisualizerScene } from "./types";
import type { MidiState } from "../useMidiState";
import type { MidiMapping, ResolvedParams } from "../MidiMapper";

const COLS = 12; // pitch classes
const ROWS = 9; // octaves 1–9
const OCT_OFFSET = 1; // row 0 = octave 1 (MIDI note 12–23)

const NOTE_NAMES = [
    "C",
    "C♯",
    "D",
    "D♯",
    "E",
    "F",
    "F♯",
    "G",
    "G♯",
    "A",
    "A♯",
    "B",
];

// Cell state animated by GSAP
interface CellState {
    brightness: number; // 0–1
    scale: number; // 0–1 (1 = full cell size)
    ripple: number; // 0–1 ripple expansion
    hue: number;
}

export class GridPulseMatrix implements VisualizerScene {
    readonly id = "grid-pulse";
    readonly name = "Grid Pulse Matrix";
    readonly thumbnail = "▦";
    readonly type = "canvas2d" as const;
    readonly supportedTargets = [
        "hue",
        "brightness",
        "intensity",
        "size",
    ] as const;

    readonly defaultMappings: MidiMapping[] = [
        { source: "pitch", target: "hue", range: [0, 1], curve: "linear" },
        { source: "velocity", target: "brightness", range: [0.5, 1], curve: "exponential" },
        { source: "density", target: "intensity", range: [0.1, 0.8], curve: "linear" },
        { source: "velocity", target: "size", range: [0.6, 1], curve: "linear" },
    ];

    private ctx2d: CanvasRenderingContext2D | null = null;
    private w = 0;
    private h = 0;
    private cells: CellState[][] = []; // [row][col]
    private lastNotes = new Set<number>();

    init(canvas: HTMLCanvasElement, width: number, height: number) {
        this.ctx2d = canvas.getContext("2d")!;
        this.w = width;
        this.h = height;

        // Initialise cell state
        this.cells = [];
        for (let r = 0; r < ROWS; r++) {
            this.cells[r] = [];
            for (let c = 0; c < COLS; c++) {
                this.cells[r][c] = { brightness: 0, scale: 0, ripple: 0, hue: c / 12 };
            }
        }
        this.lastNotes.clear();
    }

    update(resolved: ResolvedParams, state: MidiState, dt: number) {
        if (!this.ctx2d) return;
        const ctx = this.ctx2d;
        const intensity = resolved.intensity ?? 0.3;

        const currentNotes = new Set(state.activeNotes.keys());

        // Detect new noteOns
        for (const note of currentNotes) {
            if (!this.lastNotes.has(note)) {
                const vel = (state.activeNotes.get(note)?.velocity ?? 100) / 127;
                this.triggerCell(note, vel, resolved);
            }
        }
        this.lastNotes = currentNotes;

        // ── Draw ──
        ctx.clearRect(0, 0, this.w, this.h);
        ctx.fillStyle = "#0f0f0f";
        ctx.fillRect(0, 0, this.w, this.h);

        const pad = 3;
        const cellW = (this.w - pad * (COLS + 1)) / COLS;
        const cellH = (this.h - pad * (ROWS + 1) - 20) / ROWS; // 20 for header

        // Column headers (pitch class names)
        ctx.font = `${Math.min(cellW * 0.35, 11)}px monospace`;
        ctx.textAlign = "center";
        ctx.fillStyle = "#8888aa";
        for (let c = 0; c < COLS; c++) {
            const x = pad + c * (cellW + pad) + cellW / 2;
            ctx.fillText(NOTE_NAMES[c], x, 14);
        }

        const yOff = 20;

        for (let r = 0; r < ROWS; r++) {
            for (let c = 0; c < COLS; c++) {
                const cell = this.cells[r][c];
                const x = pad + c * (cellW + pad);
                const y = yOff + pad + r * (cellH + pad);

                // Base dim background
                ctx.fillStyle = `rgba(36, 36, 66, ${0.3 + intensity * 0.3})`;
                ctx.fillRect(x, y, cellW, cellH);

                if (cell.brightness > 0.01) {
                    // Active cell glow
                    const sz = cell.scale;
                    const insetX = cellW * (1 - sz) * 0.5;
                    const insetY = cellH * (1 - sz) * 0.5;
                    const l = 30 + cell.brightness * 50;

                    ctx.fillStyle = `hsla(${cell.hue * 360}, 80%, ${l}%, ${cell.brightness})`;
                    ctx.fillRect(x + insetX, y + insetY, cellW * sz, cellH * sz);

                    // Ripple ring
                    if (cell.ripple > 0.01) {
                        const rippleR = Math.max(cellW, cellH) * cell.ripple * 1.5;
                        ctx.strokeStyle = `hsla(${cell.hue * 360}, 70%, 60%, ${cell.ripple * 0.4})`;
                        ctx.lineWidth = 1.5;
                        ctx.beginPath();
                        ctx.arc(x + cellW / 2, y + cellH / 2, rippleR, 0, Math.PI * 2);
                        ctx.stroke();
                    }
                }

                // Subtle grid border for held notes
                if (currentNotes.has((r + OCT_OFFSET) * 12 + c)) {
                    ctx.strokeStyle = `hsla(${cell.hue * 360}, 90%, 65%, 0.7)`;
                    ctx.lineWidth = 1.5;
                    ctx.strokeRect(x + 0.5, y + 0.5, cellW - 1, cellH - 1);
                }
            }
        }

        // Suppress unused dt warning
        void dt;
    }

    resize(width: number, height: number) {
        this.w = width;
        this.h = height;
    }

    dispose() {
        this.cells = [];
        this.ctx2d = null;
    }

    /* ---- internal ---- */

    private triggerCell(note: number, velNorm: number, resolved: ResolvedParams) {
        const col = note % 12;
        const row = Math.floor(note / 12) - OCT_OFFSET;
        if (row < 0 || row >= ROWS) return;

        const hue = resolved.hue ?? col / 12;
        const sizeTarget = resolved.size ?? 0.8;
        const cell = this.cells[row][col];

        // Immediate flash
        cell.hue = hue;
        cell.brightness = 1;
        cell.scale = sizeTarget;
        cell.ripple = 1;

        // Decay via GSAP
        gsap.to(cell, {
            brightness: 0,
            duration: 0.8 + velNorm * 0.5,
            ease: "power2.out",
            overwrite: true,
        });
        gsap.to(cell, {
            scale: 0,
            duration: 0.6,
            ease: "power1.out",
            overwrite: "auto",
        });
        gsap.to(cell, {
            ripple: 0,
            duration: 1,
            ease: "power1.out",
            overwrite: "auto",
        });

        // Ripple to adjacent cells
        const rippleRadius = Math.ceil(velNorm * 2);
        for (let dr = -rippleRadius; dr <= rippleRadius; dr++) {
            for (let dc = -rippleRadius; dc <= rippleRadius; dc++) {
                if (dr === 0 && dc === 0) continue;
                const nr = row + dr;
                const nc = ((col + dc) % COLS + COLS) % COLS;
                if (nr < 0 || nr >= ROWS) continue;

                const dist = Math.sqrt(dr * dr + dc * dc);
                const delay = dist * 0.06;
                const falloff = 1 / (1 + dist * 1.5);
                const adj = this.cells[nr][nc];

                gsap.to(adj, {
                    brightness: Math.max(adj.brightness, velNorm * falloff * 0.6),
                    hue,
                    scale: sizeTarget * falloff,
                    duration: 0.15,
                    delay,
                    overwrite: "auto",
                });
                gsap.to(adj, {
                    brightness: 0,
                    scale: 0,
                    duration: 0.6 + dist * 0.1,
                    delay: delay + 0.15,
                    ease: "power2.out",
                    overwrite: "auto",
                });
            }
        }
    }
}
