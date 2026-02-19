/**
 * Synth Workstation — single-page app layout.
 *
 * Left panel (50 %): MIDI inputs, synth engines, effects rack, master.
 * Right panel (50 %): MIDI-driven visualiser canvas (sticky).
 * On small screens the visualiser is hidden behind a toggle button.
 *
 * Decomposed into section sub-components to isolate re-renders.
 */

import {
  Suspense,
  lazy,
  useCallback,
  useRef,
  useEffect,
  useState,
  useMemo,
} from "react";
import { useAudioContext } from "./hooks/useAudioContext";
import { useMidiBus } from "./midi/useMidiBus";
import { useSynthOrchestrator } from "./hooks/useSynthOrchestrator";

// MIDI inputs
import { useWebMidiInput } from "./midi/WebMidiInput";

// Synth engine types (hooks are consumed via useSynthOrchestrator)

// Visualiser (lazy-loaded for bundle splitting)
const VisualizerCanvas = lazy(() =>
  import("./visualizer/VisualizerCanvas").then((m) => ({
    default: m.VisualizerCanvas,
  })),
);

// UI
import { DelayCard, PhaserCard, BitcrusherCard } from "./components/EffectCard";
import { ErrorBoundary } from "./components/ErrorBoundary";
import {
  MidiInputSection,
  SynthEngineSection,
  EffectsRackSection,
  MasterOutputSection,
  MidiCCMappingSection,
} from "./components/workstation/Sections";

import type { EffectSlot } from "./effects/useEffectRack";
import type { MidiChannelMode } from "./midi/channelPolicy";
import { usePresetManager } from "./hooks/usePresetManager";
import { useMidiCCMapping } from "./midi/useMidiCCMapping";
import type { CCMappingSetters } from "./midi/useMidiCCMapping";

export default function App() {
  const { ctx, resume } = useAudioContext();
  const midiBus = useMidiBus();

  // ── Mobile visualiser toggle ──
  const [showViz, setShowViz] = useState(false);
  const midiFileTransportRef = useRef<(() => void) | null>(null);
  const sequencerTransportRef = useRef<(() => void) | null>(null);

  const keyboardChannelMode: MidiChannelMode = "normalized";
  const sequencerChannelMode: MidiChannelMode = "normalized";
  const midiFileChannelMode: MidiChannelMode = "source";

  // ── Per-engine MIDI channel routing ──
  // null = listen on all channels (omni), 0-15 = specific channel
  const [fmChannel, setFmChannel] = useState<number | null>(null);
  const [subChannel, setSubChannel] = useState<number | null>(null);
  const [granChannel, setGranChannel] = useState<number | null>(null);

  const registerMidiFileStop = useCallback((stop: (() => void) | null) => {
    midiFileTransportRef.current = stop;
  }, []);

  const registerSequencerStop = useCallback((stop: (() => void) | null) => {
    sequencerTransportRef.current = stop;
  }, []);

  // ── Orchestrator: engines + effects + master ──
  const {
    master,
    masterVolume,
    setMasterVolume,
    fmSynth,
    subSynth,
    granSynth,
    delay,
    phaser,
    bitcrusher,
    effectRack,
  } = useSynthOrchestrator(ctx, midiBus, {
    fmChannel,
    subChannel,
    granChannel,
  });

  // ── MIDI inputs ──
  const {
    supported: midiSupported,
    inputs: midiInputs,
    permissionState: midiPermissionState,
  } = useWebMidiInput(midiBus);

  // Ref for stable effect rack actions — avoids renderEffectCard churn when
  // slots/routingMode change. Methods from useEffectRack are useCallback-stable.
  const effectRackRef = useRef(effectRack);
  useEffect(() => {
    effectRackRef.current = effectRack;
  }, [effectRack]);

  // Render-map for effect cards — add new effects here without touching
  // EffectsRackSection. Uses effectRackRef to avoid depending on effectRack.
  const renderEffectCard = useCallback(
    (slot: EffectSlot): React.ReactNode => {
      const rack = effectRackRef.current;
      const common = {
        enabled: slot.enabled,
        onToggle: () => rack.toggleEffect(slot.id),
        onMoveUp: () => rack.moveEffect(slot.id, "up"),
        onMoveDown: () => rack.moveEffect(slot.id, "down"),
      };
      switch (slot.id) {
        case "delay":
          return (
            <DelayCard
              key={slot.id}
              params={delay.params}
              setParams={delay.setParams}
              {...common}
            />
          );
        case "phaser":
          return (
            <PhaserCard
              key={slot.id}
              params={phaser.params}
              setParams={phaser.setParams}
              {...common}
            />
          );
        case "bitcrusher":
          return (
            <BitcrusherCard
              key={slot.id}
              params={bitcrusher.params}
              setParams={bitcrusher.setParams}
              {...common}
            />
          );
        default:
          return null;
      }
    },
    [
      delay.params,
      delay.setParams,
      phaser.params,
      phaser.setParams,
      bitcrusher.params,
      bitcrusher.setParams,
    ],
  );

  // ── Preset management (extracted to dedicated hook) ──
  const presetSources = useMemo(
    () => ({
      fmParams: fmSynth.params,
      subParams: subSynth.params,
      granParams: granSynth.params,
      delayParams: delay.params,
      phaserParams: phaser.params,
      bitcrusherParams: bitcrusher.params,
      effectSlots: effectRack.slots,
      routingMode: effectRack.routingMode,
      fmChannel,
      subChannel,
      granChannel,
      masterVolume,
    }),
    [
      fmSynth.params,
      subSynth.params,
      granSynth.params,
      delay.params,
      phaser.params,
      bitcrusher.params,
      effectRack.slots,
      effectRack.routingMode,
      fmChannel,
      subChannel,
      granChannel,
      masterVolume,
    ],
  );

  const presetSetters = useMemo(
    () => ({
      setFmParams: fmSynth.setParams,
      setSubParams: subSynth.setParams,
      setGranParams: granSynth.setParams,
      setDelayParams: delay.setParams,
      setPhaserParams: phaser.setParams,
      setBitcrusherParams: bitcrusher.setParams,
      setEffectEnabled: effectRack.setEffectEnabled,
      setRoutingMode: effectRack.setRoutingMode,
      setFmChannel,
      setSubChannel,
      setGranChannel,
      setMasterVolume,
    }),
    [
      fmSynth.setParams,
      subSynth.setParams,
      granSynth.setParams,
      delay.setParams,
      phaser.setParams,
      bitcrusher.setParams,
      effectRack.setEffectEnabled,
      effectRack.setRoutingMode,
      setMasterVolume,
    ],
  );

  const {
    presets,
    presetName,
    setPresetName,
    handleSavePreset,
    handleLoadPreset,
    handleDeletePreset,
  } = usePresetManager(presetSources, presetSetters);

  // ── MIDI CC → synth param mapping ──
  const ccSetters = useMemo<CCMappingSetters>(
    () => ({
      setFmParams: fmSynth.setParams,
      setSubParams: subSynth.setParams,
      setGranParams: granSynth.setParams,
      setDelayParams: delay.setParams,
      setPhaserParams: phaser.setParams,
      setBitcrusherParams: bitcrusher.setParams,
      setMasterVolume,
    }),
    [
      fmSynth.setParams,
      subSynth.setParams,
      granSynth.setParams,
      delay.setParams,
      phaser.setParams,
      bitcrusher.setParams,
      setMasterVolume,
    ],
  );
  const ccMapping = useMidiCCMapping(midiBus, ccSetters);

  return (
    <div className="bg-surface text-text flex h-screen flex-col overflow-hidden">
      {/* Header */}
      <header className="border-border shrink-0 border-b px-4 py-3">
        <div className="flex items-center justify-between">
          <h1 className="text-accent text-lg font-bold tracking-wide">
            ⚡ Synth Workstation
          </h1>
          <div className="flex items-center gap-2">
            {/* Preset bar */}
            <div className="flex items-center gap-1">
              <input
                id="preset-name"
                name="preset-name"
                type="text"
                value={presetName}
                onChange={(e) => setPresetName(e.target.value)}
                placeholder="Preset name"
                className="bg-surface border-border text-text w-28 rounded border px-2 py-1 text-xs placeholder:text-gray-500"
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSavePreset();
                }}
              />
              <button
                type="button"
                onClick={handleSavePreset}
                disabled={!presetName.trim()}
                className="border-accent text-accent hover:bg-accent/10 disabled:border-border disabled:text-text-muted rounded border px-2 py-1 text-xs"
              >
                Save
              </button>
              {presets.length > 0 && (
                <select
                  id="preset-load"
                  name="preset-load"
                  className="bg-surface border-border text-text rounded border px-1 py-1 text-xs"
                  value=""
                  onChange={(e) => {
                    if (e.target.value) handleLoadPreset(e.target.value);
                  }}
                >
                  <option value="">Load…</option>
                  {presets.map((p) => (
                    <option key={p.name} value={p.name}>
                      {p.name}
                    </option>
                  ))}
                </select>
              )}
              {presets.length > 0 && (
                <select
                  id="preset-delete"
                  name="preset-delete"
                  className="bg-surface border-border text-danger rounded border px-1 py-1 text-xs"
                  value=""
                  onChange={(e) => {
                    if (e.target.value) handleDeletePreset(e.target.value);
                  }}
                >
                  <option value="">Del…</option>
                  {presets.map((p) => (
                    <option key={p.name} value={p.name}>
                      {p.name}
                    </option>
                  ))}
                </select>
              )}
            </div>
            {/* Mobile viz toggle */}
            <button
              type="button"
              onClick={() => setShowViz((v) => !v)}
              aria-label={showViz ? "Hide visualizer" : "Show visualizer"}
              aria-pressed={showViz}
              className="border-accent text-accent hover:bg-accent/10 rounded border px-3 py-1 text-xs lg:hidden"
            >
              {showViz ? "Hide Viz" : "Show Viz"}
            </button>
            <button
              type="button"
              onClick={async () => {
                await resume();
                midiFileTransportRef.current?.();
                sequencerTransportRef.current?.();
                midiBus.allNotesOff();
              }}
              aria-label="Panic: stop transports and send all notes off"
              className="border-danger text-danger hover:bg-danger/10 rounded border px-3 py-1 text-xs"
            >
              Panic (Stop + All Notes Off)
            </button>
          </div>
        </div>
      </header>

      {/* Main: 50 / 50 split on lg+, stacked on mobile */}
      <div className="flex min-h-0 flex-1">
        {/* ── LEFT PANEL: Controls ── */}
        <div className="flex-1 overflow-y-auto lg:w-1/2 lg:flex-none">
          <div className="space-y-6 p-4">
            {/* ═══ SECTION 1: MIDI INPUTS ═══ */}
            <ErrorBoundary>
              <MidiInputSection
                midiBus={midiBus}
                midiSupported={midiSupported}
                midiInputs={midiInputs}
                midiPermissionState={midiPermissionState}
                ctx={ctx}
                keyboardChannelMode={keyboardChannelMode}
                sequencerChannelMode={sequencerChannelMode}
                midiFileChannelMode={midiFileChannelMode}
                onSequencerTransportRegister={registerSequencerStop}
                onMidiFileTransportRegister={registerMidiFileStop}
              />
            </ErrorBoundary>

            {/* ═══ SECTION 2: SYNTH ENGINES ═══ */}
            <ErrorBoundary>
              <SynthEngineSection
                fmParams={fmSynth.params}
                setFmParams={fmSynth.setParams}
                subParams={subSynth.params}
                setSubParams={subSynth.setParams}
                granParams={granSynth.params}
                setGranParams={granSynth.setParams}
                fmChannel={fmChannel}
                setFmChannel={setFmChannel}
                subChannel={subChannel}
                setSubChannel={setSubChannel}
                granChannel={granChannel}
                setGranChannel={setGranChannel}
              />
            </ErrorBoundary>

            {/* ═══ SECTION 3: EFFECTS RACK ═══ */}
            <ErrorBoundary>
              <EffectsRackSection
                slots={effectRack.slots}
                routingMode={effectRack.routingMode}
                setRoutingMode={effectRack.setRoutingMode}
                renderCard={renderEffectCard}
              />
            </ErrorBoundary>

            {/* ═══ SECTION 4: MASTER OUTPUT ═══ */}
            <ErrorBoundary>
              <MasterOutputSection
                masterVolume={masterVolume}
                setMasterVolume={setMasterVolume}
                analyserL={master?.analyserL ?? null}
                analyserR={master?.analyserR ?? null}
              />
            </ErrorBoundary>

            {/* ═══ SECTION 5: MIDI CC MAPPING ═══ */}
            <ErrorBoundary>
              <MidiCCMappingSection ccMapping={ccMapping} />
            </ErrorBoundary>
          </div>
        </div>

        {/* ── RIGHT PANEL: Visualiser ── */}
        {/* Desktop: always visible. Mobile: overlay when toggled. */}
        <div
          className={`border-border bg-surface lg:border-l ${
            showViz
              ? "fixed inset-0 top-13 z-40"
              : "hidden lg:flex lg:w-1/2 lg:flex-none"
          }`}
        >
          <ErrorBoundary>
            <Suspense fallback={<div className="h-full w-full" />}>
              <VisualizerCanvas midiBus={midiBus} />
            </Suspense>
          </ErrorBoundary>

          {/* Mobile close button (inside overlay) */}
          {showViz && (
            <button
              type="button"
              onClick={() => setShowViz(false)}
              aria-label="Close visualizer overlay"
              className="bg-surface/80 text-text-muted hover:text-text absolute top-3 right-3 z-50 rounded-full p-2 text-lg backdrop-blur lg:hidden"
            >
              ✕
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
