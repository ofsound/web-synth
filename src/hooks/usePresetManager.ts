/**
 * Preset Manager hook — encapsulates preset save/load/delete state
 * that was previously inlined in Workstation.tsx.
 *
 * Accepts setter refs from synth engines, effects, and channels so
 * it can restore parameters without depending on the full synth objects.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  listPresets,
  savePreset,
  loadPreset,
  deletePreset,
  type Preset,
} from "../utils/presetStore";
import type { FMSynthParams } from "../synth/useFMSynth";
import type { SubtractiveSynthParams } from "../synth/useSubtractiveSynth";
import type { GranularSynthParams } from "../synth/useGranularSynth";
import type { DelayParams } from "../effects/useDelay";
import type { PhaserParams } from "../effects/usePhaser";
import type { BitcrusherParams } from "../effects/useBitcrusher";
import type { EffectSlot, RoutingMode } from "../effects/useEffectRack";

/* ── Setter collections expected by the hook ── */

export interface PresetManagerSources {
  fmParams: FMSynthParams;
  subParams: SubtractiveSynthParams;
  granParams: GranularSynthParams;
  delayParams: DelayParams;
  phaserParams: PhaserParams;
  bitcrusherParams: BitcrusherParams;
  effectSlots: EffectSlot[];
  routingMode: RoutingMode;
  fmChannel: number | null;
  subChannel: number | null;
  granChannel: number | null;
  masterVolume: number;
}

export interface PresetManagerSetters {
  setFmParams: React.Dispatch<React.SetStateAction<FMSynthParams>>;
  setSubParams: React.Dispatch<React.SetStateAction<SubtractiveSynthParams>>;
  setGranParams: React.Dispatch<React.SetStateAction<GranularSynthParams>>;
  setDelayParams: React.Dispatch<React.SetStateAction<DelayParams>>;
  setPhaserParams: React.Dispatch<React.SetStateAction<PhaserParams>>;
  setBitcrusherParams: React.Dispatch<React.SetStateAction<BitcrusherParams>>;
  setEffectEnabled: (id: string, enabled: boolean) => void;
  setRoutingMode: (mode: RoutingMode) => void;
  setFmChannel: (ch: number | null) => void;
  setSubChannel: (ch: number | null) => void;
  setGranChannel: (ch: number | null) => void;
  setMasterVolume: (v: number) => void;
}

export interface UsePresetManagerResult {
  presets: Preset[];
  presetName: string;
  setPresetName: (name: string) => void;
  handleSavePreset: () => void;
  handleLoadPreset: (name: string) => void;
  handleDeletePreset: (name: string) => void;
}

export function usePresetManager(
  sources: PresetManagerSources,
  setters: PresetManagerSetters,
): UsePresetManagerResult {
  const [presets, setPresets] = useState<Preset[]>(() => listPresets());
  const [presetName, setPresetName] = useState("");

  // ── Save ──
  const handleSavePreset = useCallback(() => {
    const name = presetName.trim();
    if (!name) return;
    const preset: Preset = {
      name,
      createdAt: Date.now(),
      fm: sources.fmParams,
      sub: sources.subParams,
      gran: sources.granParams,
      effects: {
        delayParams: sources.delayParams,
        phaserParams: sources.phaserParams,
        bitcrusherParams: sources.bitcrusherParams,
        rackSlots: sources.effectSlots.map((s) => ({
          id: s.id,
          enabled: s.enabled,
        })),
        routingMode: sources.routingMode,
      },
      channels: {
        fmChannel: sources.fmChannel,
        subChannel: sources.subChannel,
        granChannel: sources.granChannel,
      },
      masterVolume: sources.masterVolume,
    };
    savePreset(preset);
    setPresets(listPresets());
    setPresetName("");
  }, [
    presetName,
    sources.fmParams,
    sources.subParams,
    sources.granParams,
    sources.delayParams,
    sources.phaserParams,
    sources.bitcrusherParams,
    sources.effectSlots,
    sources.routingMode,
    sources.fmChannel,
    sources.subChannel,
    sources.granChannel,
    sources.masterVolume,
  ]);

  // ── Load (uses ref to avoid depending on all setters) ──
  const settersRef = useRef(setters);
  useEffect(() => {
    settersRef.current = setters;
  }, [setters]);

  const handleLoadPreset = useCallback(
    (name: string) => {
      const preset = loadPreset(name);
      if (!preset) return;
      const s = settersRef.current;
      s.setFmParams(preset.fm);
      s.setSubParams(preset.sub);
      s.setGranParams(preset.gran);
      s.setDelayParams(preset.effects.delayParams);
      s.setPhaserParams(preset.effects.phaserParams);
      s.setBitcrusherParams(preset.effects.bitcrusherParams);
      for (const slot of preset.effects.rackSlots) {
        s.setEffectEnabled(slot.id, slot.enabled);
      }
      s.setRoutingMode(preset.effects.routingMode);
      s.setFmChannel(preset.channels.fmChannel);
      s.setSubChannel(preset.channels.subChannel);
      s.setGranChannel(preset.channels.granChannel);
      s.setMasterVolume(preset.masterVolume);
    },
    [], // setters accessed via ref
  );

  // ── Delete ──
  const handleDeletePreset = useCallback((name: string) => {
    deletePreset(name);
    setPresets(listPresets());
  }, []);

  return {
    presets,
    presetName,
    setPresetName,
    handleSavePreset,
    handleLoadPreset,
    handleDeletePreset,
  };
}
