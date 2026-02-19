/**
 * Preset persistence — localStorage-backed save/load/list/delete.
 *
 * Stores snapshots of all synth params, effect params, effect rack state,
 * and MIDI channel routing under a namespaced key.
 */

import type { FMSynthParams } from "../synth/useFMSynth";
import type { SubtractiveSynthParams } from "../synth/useSubtractiveSynth";
import type { GranularSynthParams } from "../synth/useGranularSynth";
import type { RoutingMode } from "../effects/useEffectRack";
import type { DelayParams } from "../effects/useDelay";
import type { PhaserParams } from "../effects/usePhaser";
import type { BitcrusherParams } from "../effects/useBitcrusher";

const STORAGE_KEY = "web-synth:presets";

export interface EffectPresetState {
    delayParams: DelayParams;
    phaserParams: PhaserParams;
    bitcrusherParams: BitcrusherParams;
    /** Ordered array of { id, enabled } slots */
    rackSlots: Array<{ id: string; enabled: boolean }>;
    routingMode: RoutingMode;
}

export interface ChannelPresetState {
    fmChannel: number | null;
    subChannel: number | null;
    granChannel: number | null;
}

export interface Preset {
    name: string;
    createdAt: number;
    fm: FMSynthParams;
    sub: SubtractiveSynthParams;
    gran: GranularSynthParams;
    effects: EffectPresetState;
    channels: ChannelPresetState;
    masterVolume: number;
}

/** Validate a single preset loaded from storage. Returns true if it
 *  has the minimum required shape; filters out corrupt / stale entries. */
function isValidPreset(p: unknown): p is Preset {
    if (typeof p !== "object" || p === null) return false;
    const o = p as Record<string, unknown>;

    // Top-level required fields
    if (typeof o.name !== "string" || !o.name) return false;
    if (typeof o.createdAt !== "number") return false;
    if (typeof o.masterVolume !== "number") return false;

    // Synth param blocks must be objects
    if (typeof o.fm !== "object" || o.fm === null) return false;
    if (typeof o.sub !== "object" || o.sub === null) return false;
    if (typeof o.gran !== "object" || o.gran === null) return false;

    // Effects block
    if (typeof o.effects !== "object" || o.effects === null) return false;
    const eff = o.effects as Record<string, unknown>;
    if (typeof eff.delayParams !== "object" || eff.delayParams === null) return false;
    if (typeof eff.phaserParams !== "object" || eff.phaserParams === null) return false;
    if (typeof eff.bitcrusherParams !== "object" || eff.bitcrusherParams === null) return false;
    if (!Array.isArray(eff.rackSlots)) return false;
    if (typeof eff.routingMode !== "string") return false;

    // Channels block
    if (typeof o.channels !== "object" || o.channels === null) return false;
    const ch = o.channels as Record<string, unknown>;
    if (ch.fmChannel !== null && typeof ch.fmChannel !== "number") return false;
    if (ch.subChannel !== null && typeof ch.subChannel !== "number") return false;
    if (ch.granChannel !== null && typeof ch.granChannel !== "number") return false;

    return true;
}

/** Read all saved presets from localStorage. Invalid entries are silently filtered. */
export function listPresets(): Preset[] {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return [];
        const parsed: unknown = JSON.parse(raw);
        if (!Array.isArray(parsed)) return [];
        return parsed.filter(isValidPreset);
    } catch {
        return [];
    }
}

/** Save a preset. If a preset with the same name exists, it is overwritten. */
export function savePreset(preset: Preset): void {
    const presets = listPresets().filter((p) => p.name !== preset.name);
    presets.push(preset);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(presets));
}

/** Delete a preset by name. */
export function deletePreset(name: string): void {
    const presets = listPresets().filter((p) => p.name !== name);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(presets));
}

/** Load a preset by name. Returns null if not found. */
export function loadPreset(name: string): Preset | null {
    return listPresets().find((p) => p.name === name) ?? null;
}
