/**
 * Shared MIDI type definitions.
 *
 * Canonical home for all cross-module MIDI types.  The original source
 * files (MidiBus.ts, channelPolicy.ts) re-export from here so existing
 * import paths continue to work without any call-site changes.
 */

// ─── MIDI Events ─────────────────────────────────────────────────────────────

export type MidiEvent =
    | { type: "noteon"; channel: number; note: number; velocity: number }
    | { type: "noteoff"; channel: number; note: number; velocity: number }
    | {
        type: "cc";
        channel: number;
        note: number;
        velocity: number;
        cc: number;
        value: number;
    };

export type MidiSubscriber = (e: MidiEvent) => void;

// ─── Channel Policy ──────────────────────────────────────────────────────────

/**
 * Controls how a synthesizer's MIDI channel assignment is resolved.
 *
 * - `"source"` — use the raw channel number from the incoming MIDI event
 * - `"normalized"` — remap to a fixed logical channel regardless of source
 */
export type MidiChannelMode = "source" | "normalized";

export interface ResolveMidiChannelOptions {
    mode: MidiChannelMode;
    sourceChannel: number;
    normalizedChannel?: number;
}

export function resolveMidiChannel({
    mode,
    sourceChannel,
    normalizedChannel = 0,
}: ResolveMidiChannelOptions): number {
    if (mode === "normalized") return normalizedChannel;
    return sourceChannel;
}
