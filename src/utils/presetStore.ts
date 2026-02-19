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

/** Read all saved presets from localStorage. */
export function listPresets(): Preset[] {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return [];
        return JSON.parse(raw) as Preset[];
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
