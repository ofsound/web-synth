/**
 * Synth Workstation — single-page app layout.
 *
 * Left panel (33 %): MIDI inputs, synth engines, effects rack, master.
 * Right panel (67 %): MIDI-driven visualiser canvas (sticky).
 * On small screens the visualiser is hidden behind a toggle button.
 */

import { Suspense, lazy, useEffect, useState } from "react";
import { useAudioContext } from "./hooks/useAudioContext";
import { useMidiBus } from "./midi/useMidiBus";

// MIDI inputs
import { useWebMidiInput } from "./midi/WebMidiInput";
import { KeyboardInput } from "./midi/KeyboardInput";
import { PolySequencer } from "./midi/PolySequencer";

// Synth engines
import { useFMSynth } from "./synth/useFMSynth";
import { useSubtractiveSynth } from "./synth/useSubtractiveSynth";
import { useGranularSynth } from "./synth/useGranularSynth";

// Effects
import { useDelay } from "./effects/useDelay";
import { usePhaser } from "./effects/usePhaser";
import { useBitcrusher } from "./effects/useBitcrusher";
import { useEffectRack } from "./effects/useEffectRack";

// Master output
import { useMasterOutput } from "./master/useMasterOutput";

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

export default function App() {
  const { ctx, resume } = useAudioContext();
  const midiBus = useMidiBus();

  // ── Mobile visualiser toggle ──
  const [showViz, setShowViz] = useState(false);

  // ── Master output chain ──
  const { nodes: master, masterVolume, setMasterVolume } = useMasterOutput(ctx);

  // ── MIDI inputs ──
  const { supported: midiSupported, inputs: midiInputs } =
    useWebMidiInput(midiBus);

  // ── Synth engines ──
  const fmSynth = useFMSynth(ctx, midiBus);
  const subSynth = useSubtractiveSynth(ctx, midiBus);
  const granSynth = useGranularSynth(ctx, midiBus);

  // Connect synth outputs → synthMix
  useEffect(() => {
    if (!master) return;
    const connections: { node: GainNode | null; target: GainNode }[] = [
      { node: fmSynth.outputNode, target: master.synthMix },
      { node: subSynth.outputNode, target: master.synthMix },
      { node: granSynth.outputNode, target: master.synthMix },
    ];
    for (const c of connections) {
      if (c.node) c.node.connect(c.target);
    }
    return () => {
      for (const c of connections) {
        if (c.node) {
          try {
            c.node.disconnect(c.target);
          } catch {
            /* ok */
          }
        }
      }
    };
  }, [master, fmSynth.outputNode, subSynth.outputNode, granSynth.outputNode]);

  // ── Effects ──
  const delay = useDelay(ctx);
  const phaser = usePhaser(ctx);
  const bitcrusher = useBitcrusher(ctx);

  const effectRack = useEffectRack(
    master?.effectsSend ?? null,
    master?.effectsReturn ?? null,
  );

  // Register effects with the rack
  useEffect(() => {
    effectRack.registerEffect("delay", "Delay / Echo", delay.io);
  }, [delay.io]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    effectRack.registerEffect("phaser", "Phaser", phaser.io);
  }, [phaser.io]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    effectRack.registerEffect("bitcrusher", "Bitcrusher", bitcrusher.io);
  }, [bitcrusher.io]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="bg-surface text-text flex h-screen flex-col overflow-hidden">
      {/* Header */}
      <header className="border-border shrink-0 border-b px-4 py-3">
        <div className="flex items-center justify-between">
          <h1 className="text-accent text-lg font-bold tracking-wide">
            ⚡ Synth Workstation
          </h1>
          <div className="flex items-center gap-2">
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
                midiBus.allNotesOff();
              }}
              aria-label="Panic: send all notes off"
              className="border-danger text-danger hover:bg-danger/10 rounded border px-3 py-1 text-xs"
            >
              Panic (All Notes Off)
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
                <KeyboardInput midiBus={midiBus} startNote={36} endNote={84} />
              </div>

              {/* Poly Sequencer */}
              <div className="border-border rounded-lg border p-3">
                <h3 className="text-text-muted mb-2 text-xs font-semibold tracking-wider uppercase">
                  Polyphonic Sequencer
                </h3>
                <PolySequencer midiBus={midiBus} ctx={ctx} />
              </div>
            </section>

            {/* ═══ SECTION 2: SYNTH ENGINES ═══ */}
            <section>
              <h2 className="text-text-muted mb-2 text-xs font-semibold tracking-wider uppercase">
                Synth Engines
              </h2>
              <div className="grid gap-4 xl:grid-cols-3">
                <FMSynthPanel
                  params={fmSynth.params}
                  setParams={fmSynth.setParams}
                />
                <SubtractiveSynthPanel
                  params={subSynth.params}
                  setParams={subSynth.setParams}
                />
                <GranularSynthPanel
                  params={granSynth.params}
                  setParams={granSynth.setParams}
                />
              </div>
            </section>

            {/* ═══ SECTION 3: EFFECTS RACK ═══ */}
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
                      onClick={() => effectRack.setRoutingMode(mode)}
                      aria-label={`Set effects routing to ${mode}`}
                      aria-pressed={effectRack.routingMode === mode}
                      className={`rounded border px-2 py-0.5 text-[10px] capitalize ${
                        effectRack.routingMode === mode
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
                {effectRack.slots.map((slot) => {
                  if (slot.id === "delay") {
                    return (
                      <DelayCard
                        key={slot.id}
                        params={delay.params}
                        setParams={delay.setParams}
                        enabled={slot.enabled}
                        onToggle={() => effectRack.toggleEffect(slot.id)}
                        onMoveUp={() => effectRack.moveEffect(slot.id, "up")}
                        onMoveDown={() =>
                          effectRack.moveEffect(slot.id, "down")
                        }
                      />
                    );
                  }
                  if (slot.id === "phaser") {
                    return (
                      <PhaserCard
                        key={slot.id}
                        params={phaser.params}
                        setParams={phaser.setParams}
                        enabled={slot.enabled}
                        onToggle={() => effectRack.toggleEffect(slot.id)}
                        onMoveUp={() => effectRack.moveEffect(slot.id, "up")}
                        onMoveDown={() =>
                          effectRack.moveEffect(slot.id, "down")
                        }
                      />
                    );
                  }
                  if (slot.id === "bitcrusher") {
                    return (
                      <BitcrusherCard
                        key={slot.id}
                        params={bitcrusher.params}
                        setParams={bitcrusher.setParams}
                        enabled={slot.enabled}
                        onToggle={() => effectRack.toggleEffect(slot.id)}
                        onMoveUp={() => effectRack.moveEffect(slot.id, "up")}
                        onMoveDown={() =>
                          effectRack.moveEffect(slot.id, "down")
                        }
                      />
                    );
                  }
                  return null;
                })}
              </div>
            </section>

            {/* ═══ SECTION 4: MASTER OUTPUT ═══ */}
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
                  analyserL={master?.analyserL ?? null}
                  analyserR={master?.analyserR ?? null}
                  width={80}
                  height={160}
                />
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
          <Suspense fallback={<div className="h-full w-full" />}>
            <VisualizerCanvas midiBus={midiBus} />
          </Suspense>

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
