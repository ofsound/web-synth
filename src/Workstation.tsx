/**
 * Synth Workstation — single-page app layout.
 *
 * Left panel (33 %): MIDI inputs, synth engines, effects rack, master.
 * Right panel (67 %): MIDI-driven visualiser canvas (sticky).
 * On small screens the visualiser is hidden behind a toggle button.
 *
 * Decomposed into section sub-components to isolate re-renders.
 */

import {
  Suspense,
  lazy,
  memo,
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
import { KeyboardInput } from "./midi/KeyboardInput";
import { PolySequencer } from "./midi/PolySequencer";
import { MidiFilePlayer } from "./midi/MidiFilePlayer";

// Synth engine types (hooks are consumed via useSynthOrchestrator)

// Visualiser (lazy-loaded for bundle splitting)
const VisualizerCanvas = lazy(() =>
  import("./visualizer/VisualizerCanvas").then((m) => ({
    default: m.VisualizerCanvas,
  })),
);

// UI
import {
  FMSynthPanel,
  SubtractiveSynthPanel,
  GranularSynthPanel,
} from "./components/SynthPanel";
import { DelayCard, PhaserCard, BitcrusherCard } from "./components/EffectCard";
import { VUMeter } from "./components/VUMeter";
import { Slider } from "./components/Slider";
import { ErrorBoundary } from "./components/ErrorBoundary";

import type { MidiBus } from "./midi/MidiBus";
import type { FMSynthParams } from "./synth/useFMSynth";
import type { SubtractiveSynthParams } from "./synth/useSubtractiveSynth";
import type { GranularSynthParams } from "./synth/useGranularSynth";
import type { EffectSlot, RoutingMode } from "./effects/useEffectRack";
import type { MidiChannelMode } from "./midi/channelPolicy";
import { usePresetManager } from "./hooks/usePresetManager";
import { useMidiCCMapping, CC_TARGETS } from "./midi/useMidiCCMapping";
import type { CCMappingSetters } from "./midi/useMidiCCMapping";

/* ── Memoized Section Components ── */

/** Tiny MIDI channel selector shared by all engine panels. */
function ChannelSelect({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number | null;
  onChange: (ch: number | null) => void;
}) {
  const selectId = `ch-${label.toLowerCase().replace(/\s+/g, "-")}`;
  return (
    <div className="mb-1 flex items-center gap-2 text-[10px]">
      <span className="text-text-muted">{label} Ch:</span>
      <select
        id={selectId}
        name={selectId}
        className="bg-surface border-border text-text rounded border px-1 py-0.5 text-[10px]"
        value={value === null ? "all" : String(value)}
        onChange={(e) => {
          const v = e.target.value;
          onChange(v === "all" ? null : Number(v));
        }}
      >
        <option value="all">All</option>
        {Array.from({ length: 16 }, (_, i) => (
          <option key={i} value={String(i)}>
            {i + 1}
          </option>
        ))}
      </select>
    </div>
  );
}

const MidiInputSection = memo(function MidiInputSection({
  midiBus,
  midiSupported,
  midiInputs,
  ctx,
  keyboardChannelMode,
  sequencerChannelMode,
  midiFileChannelMode,
  onSequencerTransportRegister,
  onMidiFileTransportRegister,
}: {
  midiBus: MidiBus;
  midiSupported: boolean;
  midiInputs: string[];
  ctx: AudioContext | null;
  keyboardChannelMode: MidiChannelMode;
  sequencerChannelMode: MidiChannelMode;
  midiFileChannelMode: MidiChannelMode;
  onSequencerTransportRegister: (stop: (() => void) | null) => void;
  onMidiFileTransportRegister: (stop: (() => void) | null) => void;
}) {
  return (
    <section>
      <h2 className="text-text-muted mb-2 text-xs font-semibold tracking-wider uppercase">
        MIDI Inputs
      </h2>

      {/* Web MIDI status */}
      <div className="text-text-muted mb-2 flex items-center gap-2 text-xs">
        <span
          className={`inline-block h-2 w-2 rounded-full ${
            midiSupported ? "bg-success" : "bg-text-muted/30"
          }`}
        />
        <span>
          Web MIDI:{" "}
          {midiSupported
            ? midiInputs.length > 0
              ? midiInputs.join(", ")
              : "Supported (no devices)"
            : "Not supported"}
        </span>
      </div>

      {/* Piano Keyboard */}
      <div className="mb-3">
        <KeyboardInput
          midiBus={midiBus}
          startNote={36}
          endNote={84}
          channelMode={keyboardChannelMode}
        />
      </div>

      {/* MIDI File Player */}
      <div className="border-border rounded-lg border p-3">
        <h3 className="text-text-muted mb-2 text-xs font-semibold tracking-wider uppercase">
          MIDI File Player
        </h3>
        <MidiFilePlayer
          midiBus={midiBus}
          ctx={ctx}
          channelMode={midiFileChannelMode}
          onTransportStopRegister={onMidiFileTransportRegister}
        />
      </div>

      {/* Poly Sequencer */}
      <div className="border-border rounded-lg border p-3">
        <h3 className="text-text-muted mb-2 text-xs font-semibold tracking-wider uppercase">
          Polyphonic Sequencer
        </h3>
        <PolySequencer
          midiBus={midiBus}
          ctx={ctx}
          channelMode={sequencerChannelMode}
          onTransportStopRegister={onSequencerTransportRegister}
        />
      </div>
    </section>
  );
});

const SynthEngineSection = memo(function SynthEngineSection({
  fmParams,
  setFmParams,
  subParams,
  setSubParams,
  granParams,
  setGranParams,
  fmChannel,
  setFmChannel,
  subChannel,
  setSubChannel,
  granChannel,
  setGranChannel,
}: {
  fmParams: FMSynthParams;
  setFmParams: React.Dispatch<React.SetStateAction<FMSynthParams>>;
  subParams: SubtractiveSynthParams;
  setSubParams: React.Dispatch<React.SetStateAction<SubtractiveSynthParams>>;
  granParams: GranularSynthParams;
  setGranParams: React.Dispatch<React.SetStateAction<GranularSynthParams>>;
  fmChannel: number | null;
  setFmChannel: (ch: number | null) => void;
  subChannel: number | null;
  setSubChannel: (ch: number | null) => void;
  granChannel: number | null;
  setGranChannel: (ch: number | null) => void;
}) {
  return (
    <section>
      <h2 className="text-text-muted mb-2 text-xs font-semibold tracking-wider uppercase">
        Synth Engines
      </h2>
      <div className="grid gap-4 xl:grid-cols-3">
        <div>
          <ChannelSelect label="FM" value={fmChannel} onChange={setFmChannel} />
          <FMSynthPanel params={fmParams} setParams={setFmParams} />
        </div>
        <div>
          <ChannelSelect
            label="Sub"
            value={subChannel}
            onChange={setSubChannel}
          />
          <SubtractiveSynthPanel params={subParams} setParams={setSubParams} />
        </div>
        <div>
          <ChannelSelect
            label="Gran"
            value={granChannel}
            onChange={setGranChannel}
          />
          <GranularSynthPanel params={granParams} setParams={setGranParams} />
        </div>
      </div>
    </section>
  );
});

const EffectsRackSection = memo(function EffectsRackSection({
  slots,
  routingMode,
  setRoutingMode,
  renderCard,
}: {
  slots: EffectSlot[];
  routingMode: RoutingMode;
  setRoutingMode: (mode: RoutingMode) => void;
  /** Render the card for a single effect slot. Defined at the registration
   *  site in App so that adding a new effect only requires one change. */
  renderCard: (slot: EffectSlot) => React.ReactNode;
}) {
  return (
    <section>
      <div className="mb-2 flex items-center gap-4">
        <h2 className="text-text-muted text-xs font-semibold tracking-wider uppercase">
          Effects Rack
        </h2>
        <div className="flex items-center gap-2">
          <span className="text-text-muted text-[10px]">Routing:</span>
          {(["serial", "parallel"] as const).map((mode) => (
            <button
              type="button"
              key={mode}
              onClick={() => setRoutingMode(mode)}
              aria-label={`Set effects routing to ${mode}`}
              aria-pressed={routingMode === mode}
              className={`rounded border px-2 py-0.5 text-[10px] capitalize ${
                routingMode === mode
                  ? "border-accent text-accent"
                  : "border-border text-text-muted"
              }`}
            >
              {mode}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        {slots.map((slot) => renderCard(slot))}
      </div>
    </section>
  );
});

const MasterOutputSection = memo(function MasterOutputSection({
  masterVolume,
  setMasterVolume,
  analyserL,
  analyserR,
}: {
  masterVolume: number;
  setMasterVolume: (v: number) => void;
  analyserL: AnalyserNode | null;
  analyserR: AnalyserNode | null;
}) {
  return (
    <section>
      <h2 className="text-text-muted mb-2 text-xs font-semibold tracking-wider uppercase">
        Master Output
      </h2>
      <div className="border-border flex items-center gap-6 rounded-lg border p-4">
        <div className="flex-1">
          <Slider
            label="Master Volume"
            min={0}
            max={1}
            step={0.01}
            value={masterVolume}
            onChange={setMasterVolume}
          />
        </div>
        <VUMeter
          analyserL={analyserL}
          analyserR={analyserR}
          width={80}
          height={160}
        />
      </div>
    </section>
  );
});

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
  const { supported: midiSupported, inputs: midiInputs } =
    useWebMidiInput(midiBus);

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

      {/* Main: 33 / 67 split on lg+, stacked on mobile */}
      <div className="flex min-h-0 flex-1">
        {/* ── LEFT PANEL: Controls ── */}
        <div className="flex-1 overflow-y-auto lg:max-w-[33%]">
          <div className="space-y-6 p-4">
            {/* ═══ SECTION 1: MIDI INPUTS ═══ */}
            <ErrorBoundary>
              <MidiInputSection
                midiBus={midiBus}
                midiSupported={midiSupported}
                midiInputs={midiInputs}
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
            <section>
              <h2 className="text-text-muted mb-2 text-xs font-semibold tracking-wider uppercase">
                MIDI CC Mapping
              </h2>
              <div className="border-border space-y-2 rounded-lg border p-3">
                {/* CC Learn row */}
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    id="cc-target-select"
                    name="cc-target-select"
                    className="bg-surface border-border text-text rounded border px-2 py-1 text-xs"
                    value=""
                    onChange={(e) => {
                      if (e.target.value) ccMapping.startLearn(e.target.value);
                    }}
                  >
                    <option value="">CC Learn…</option>
                    {Object.entries(CC_TARGETS).map(([key, { label }]) => (
                      <option key={key} value={key}>
                        {label}
                      </option>
                    ))}
                  </select>
                  {ccMapping.learning && (
                    <span className="text-accent animate-pulse text-xs">
                      Move a CC knob…{" "}
                      <button
                        type="button"
                        onClick={ccMapping.cancelLearn}
                        className="text-text-muted underline"
                      >
                        cancel
                      </button>
                    </span>
                  )}
                </div>

                {/* Active mappings */}
                {ccMapping.mappings.length === 0 ? (
                  <p className="text-text-muted text-[10px]">
                    No CC mappings. Select a target above, then move a MIDI CC
                    knob/slider to bind.
                  </p>
                ) : (
                  <div className="grid gap-1">
                    {ccMapping.mappings.map((m) => (
                      <div
                        key={m.cc}
                        className="text-text flex items-center justify-between text-[10px]"
                      >
                        <span>
                          CC {m.cc} → {m.label}
                        </span>
                        <button
                          type="button"
                          onClick={() => ccMapping.removeMapping(m.cc)}
                          className="text-danger text-[10px]"
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </section>
          </div>
        </div>

        {/* ── RIGHT PANEL: Visualiser ── */}
        {/* Desktop: always visible. Mobile: overlay when toggled. */}
        <div
          className={`border-border bg-surface lg:border-l ${
            showViz ? "fixed inset-0 top-13 z-40" : "hidden lg:flex lg:flex-2"
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
