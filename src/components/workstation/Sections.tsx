import { memo } from "react";
import { KeyboardInput } from "../../midi/KeyboardInput";
import type { MidiPermissionState } from "../../midi/WebMidiInput";
import { PolySequencer } from "../../midi/PolySequencer";
import { MidiFilePlayer } from "../../midi/MidiFilePlayer";
import {
  FMSynthPanel,
  SubtractiveSynthPanel,
  GranularSynthPanel,
} from "../SynthPanel";
import { VUMeter } from "../VUMeter";
import { Slider } from "../Slider";
import type { MidiBus } from "../../midi/MidiBus";
import type { FMSynthParams } from "../../synth/useFMSynth";
import type { SubtractiveSynthParams } from "../../synth/useSubtractiveSynth";
import type { GranularSynthParams } from "../../synth/useGranularSynth";
import type { EffectSlot, RoutingMode } from "../../effects/useEffectRack";
import type { MidiChannelMode } from "../../midi/channelPolicy";
import { useMidiCCMapping, CC_TARGETS } from "../../midi/useMidiCCMapping";

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
    <div className="mb-2 flex items-center gap-2 text-xs">
      <span className="text-text-muted">{label} Ch:</span>
      <select
        id={selectId}
        name={selectId}
        className="bg-surface border-border text-text rounded border px-2 py-1 text-xs"
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

export const MidiInputSection = memo(function MidiInputSection({
  midiBus,
  midiSupported,
  midiInputs,
  midiPermissionState,
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
  midiPermissionState: MidiPermissionState;
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

      <div className="text-text-muted mb-2 flex items-center gap-2 text-xs">
        <span
          className={`inline-block h-2 w-2 rounded-full ${
            midiPermissionState === "denied"
              ? "bg-danger"
              : midiSupported
                ? "bg-success"
                : "bg-text-muted/30"
          }`}
        />
        <span>
          Web MIDI:{" "}
          {!midiSupported
            ? "Not supported"
            : midiPermissionState === "denied"
              ? "Permission denied — check browser settings"
              : midiPermissionState === "prompt"
                ? "Permission required"
                : midiInputs.length > 0
                  ? midiInputs.join(", ")
                  : "Supported (no devices)"}
        </span>
      </div>

      <div className="mb-3">
        <KeyboardInput
          midiBus={midiBus}
          startNote={36}
          endNote={84}
          channelMode={keyboardChannelMode}
        />
      </div>

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

export const SynthEngineSection = memo(function SynthEngineSection({
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
      <div className="grid gap-4">
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

export const EffectsRackSection = memo(function EffectsRackSection({
  slots,
  routingMode,
  setRoutingMode,
  renderCard,
}: {
  slots: EffectSlot[];
  routingMode: RoutingMode;
  setRoutingMode: (mode: RoutingMode) => void;
  renderCard: (slot: EffectSlot) => React.ReactNode;
}) {
  return (
    <section>
      <div className="mb-2 flex items-center gap-4">
        <h2 className="text-text-muted text-xs font-semibold tracking-wider uppercase">
          Effects Rack
        </h2>
        <div className="flex items-center gap-2">
          <span className="text-text-muted text-xs">Routing:</span>
          {(["serial", "parallel"] as const).map((mode) => (
            <button
              type="button"
              key={mode}
              onClick={() => setRoutingMode(mode)}
              aria-label={`Set effects routing to ${mode}`}
              aria-pressed={routingMode === mode}
              className={`rounded border px-2 py-1 text-xs capitalize ${
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

      <div className="grid gap-3">{slots.map((slot) => renderCard(slot))}</div>
    </section>
  );
});

export const MasterOutputSection = memo(function MasterOutputSection({
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

export const MidiCCMappingSection = memo(function MidiCCMappingSection({
  ccMapping,
}: {
  ccMapping: ReturnType<typeof useMidiCCMapping>;
}) {
  return (
    <section>
      <h2 className="text-text-muted mb-2 text-xs font-semibold tracking-wider uppercase">
        MIDI CC Mapping
      </h2>
      <div className="border-border space-y-2 rounded-lg border p-3">
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
  );
});
