/**
 * MidiMapper — Translates MIDI state into normalised visual parameters.
 *
 * Pure functions (no React).  Each visualiser scene declares which
 * targets it cares about and provides default mappings.  Users can
 * override any mapping via the MappingModal UI.
 */

import type { MidiState } from "./useMidiState";

/* ------------------------------------------------------------------ */
/*  Source / Target identifiers                                       */
/* ------------------------------------------------------------------ */

export const MIDI_SOURCES = [
    "pitch",
    "velocity",
    "density",
    "polyphony",
    "centroid",
    "cc",
    "noteOn",
    "noteOff",
] as const;
export type MidiSource = (typeof MIDI_SOURCES)[number];

export const VISUAL_TARGETS = [
    "hue",
    "saturation",
    "brightness",
    "size",
    "speed",
    "rotation",
    "spread",
    "intensity",
    "x",
    "y",
    "z",
] as const;
export type VisualTarget = (typeof VISUAL_TARGETS)[number];

export const CURVES = ["linear", "exponential", "logarithmic"] as const;
export type CurveType = (typeof CURVES)[number];

/* ------------------------------------------------------------------ */
/*  Mapping definition                                                */
/* ------------------------------------------------------------------ */

export interface MidiMapping {
    source: MidiSource;
    target: VisualTarget;
    /** Output range [min, max] — normalised 0‥1 by default. */
    range: [number, number];
    curve: CurveType;
    /** CC number — only relevant when source === "cc". */
    ccNumber?: number;
}

export type ResolvedParams = Partial<Record<VisualTarget, number>>;

/* ------------------------------------------------------------------ */
/*  Resolve helpers                                                   */
/* ------------------------------------------------------------------ */

/** Read a normalised 0‥1 raw value for a given source. */
function readSource(source: MidiSource, state: MidiState, ccNumber?: number): number {
    switch (source) {
        case "pitch": {
            // weighted by most recent active note, fallback to centroid
            if (state.activeNotes.size === 0) return state.centroid / 127;
            // use the last noteOn's note for instant reactivity
            if (
                state.lastNoteOnEvent?.type === "noteon" &&
                state.lastNoteOnEvent.velocity > 0
            ) {
                return state.lastNoteOnEvent.note / 127;
            }
            return state.centroid / 127;
        }
        case "velocity": {
            if (
                state.lastNoteOnEvent?.type === "noteon" &&
                state.lastNoteOnEvent.velocity > 0
            ) {
                return state.lastNoteOnEvent.velocity / 127;
            }
            // average velocity of active notes
            if (state.activeNotes.size === 0) return 0;
            let sum = 0;
            for (const v of state.activeNotes.values()) sum += v.velocity;
            return sum / state.activeNotes.size / 127;
        }
        case "density":
            return Math.min(state.density / 20, 1); // 20 nps = max
        case "polyphony":
            return Math.min(state.polyphony / 10, 1); // 10 voices = max
        case "centroid":
            return state.centroid / 127;
        case "cc":
            if (ccNumber !== undefined) {
                return (state.ccValues.get(ccNumber) ?? 0) / 127;
            }
            return 0;
        case "noteOn":
            // 1 for the single frame of a noteOn, 0 otherwise — acts as a trigger
            return state.lastNoteOnEvent?.type === "noteon" &&
                state.lastNoteOnEvent.velocity > 0
                ? 1
                : 0;
        case "noteOff":
            return state.lastEvent?.type === "noteoff" ? 1 : 0;
    }
}

/** Apply curve shaping to a 0‥1 value. */
function applyCurve(v: number, curve: CurveType): number {
    const clamped = Math.max(0, Math.min(1, v));
    switch (curve) {
        case "linear":
            return clamped;
        case "exponential":
            return clamped * clamped;
        case "logarithmic":
            return Math.sqrt(clamped);
    }
}

/* ------------------------------------------------------------------ */
/*  Main resolve function                                             */
/* ------------------------------------------------------------------ */

/**
 * Evaluate all mappings against the current MIDI state and return a
 * record of normalised visual‐parameter values (within each mapping's
 * declared range).
 */
export function resolve(
    state: MidiState,
    mappings: MidiMapping[],
): ResolvedParams {
    const out: ResolvedParams = {};
    for (const m of mappings) {
        const raw = readSource(m.source, state, m.ccNumber);
        const curved = applyCurve(raw, m.curve);
        const [lo, hi] = m.range;
        out[m.target] = lo + curved * (hi - lo);
    }
    return out;
}
