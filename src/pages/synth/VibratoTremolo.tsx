import { useEffect, useRef, useState } from "react";
import { useAudioContext } from "../../hooks/useAudioContext";
import { DemoShell } from "../../components/DemoShell";
import { Slider } from "../../components/Slider";
import { Toggle } from "../../components/Toggle";
import { Waveform } from "../../components/Waveform";

type EffectMode = "vibrato" | "tremolo" | "both";
const WAVE_TYPES: OscillatorType[] = ["sine", "triangle"];
const CARRIER_WAVES: OscillatorType[] = [
  "sine",
  "square",
  "sawtooth",
  "triangle",
];

export default function VibratoTremolo() {
  const { ctx, resume, masterGain } = useAudioContext();

  const [playing, setPlaying] = useState(false);
  const [effectMode, setEffectMode] = useState<EffectMode>("vibrato");
  const [lfoRate, setLfoRate] = useState(5);
  const [lfoWaveform, setLfoWaveform] = useState<OscillatorType>("sine");
  const [vibratoDepth, setVibratoDepth] = useState(20);
  const [tremoloDepth, setTremoloDepth] = useState(0.5);
  const [carrierFreq, setCarrierFreq] = useState(440);
  const [carrierWave, setCarrierWave] = useState<OscillatorType>("sawtooth");

  const carrierRef = useRef<OscillatorNode | null>(null);
  const vcaRef = useRef<GainNode | null>(null);
  const vibratoLfoRef = useRef<OscillatorNode | null>(null);
  const vibratoDepthRef = useRef<GainNode | null>(null);
  const tremoloLfoRef = useRef<OscillatorNode | null>(null);
  const tremoloDepthGainRef = useRef<GainNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);
  const outGainRef = useRef<GainNode | null>(null);

  /* Build static graph parts */
  useEffect(() => {
    if (!ctx || !masterGain) return;
    const an = ctx.createAnalyser();
    an.fftSize = 4096;
    const outGain = ctx.createGain();
    outGain.gain.value = 0.3;
    outGain.connect(an);
    an.connect(masterGain);
    analyserRef.current = an;
    outGainRef.current = outGain;
    setAnalyser(an);
    return () => {
      outGain.disconnect();
      an.disconnect();
    };
  }, [ctx, masterGain]);

  /* Start / stop */
  useEffect(() => {
    if (!ctx || !outGainRef.current) return;
    if (!playing) {
      /* Tear down oscillators */
      [carrierRef, vibratoLfoRef, tremoloLfoRef].forEach((r) => {
        if (r.current) {
          try {
            r.current.stop();
          } catch {
            /* already stopped */
          }
          r.current.disconnect();
          r.current = null;
        }
      });
      [vcaRef, vibratoDepthRef, tremoloDepthGainRef].forEach((r) => {
        if (r.current) {
          r.current.disconnect();
          r.current = null;
        }
      });
      return;
    }

    /* === Build carrier chain === */
    const carrier = ctx.createOscillator();
    carrier.type = carrierWave;
    carrier.frequency.value = carrierFreq;

    const vca = ctx.createGain();
    vca.gain.value = 1;
    carrier.connect(vca);
    vca.connect(outGainRef.current);

    carrierRef.current = carrier;
    vcaRef.current = vca;

    /* === Vibrato LFO === */
    const vibLfo = ctx.createOscillator();
    vibLfo.type = lfoWaveform;
    vibLfo.frequency.value = lfoRate;

    const vibDepthGain = ctx.createGain();
    vibDepthGain.gain.value =
      effectMode === "vibrato" || effectMode === "both" ? vibratoDepth : 0;
    vibLfo.connect(vibDepthGain);
    vibDepthGain.connect(carrier.detune);

    vibratoLfoRef.current = vibLfo;
    vibratoDepthRef.current = vibDepthGain;

    /* === Tremolo LFO === */
    const tremLfo = ctx.createOscillator();
    tremLfo.type = lfoWaveform;
    tremLfo.frequency.value = lfoRate;

    const tremDepthGain = ctx.createGain();
    tremDepthGain.gain.value =
      effectMode === "tremolo" || effectMode === "both" ? tremoloDepth : 0;
    tremLfo.connect(tremDepthGain);
    tremDepthGain.connect(vca.gain);

    tremoloLfoRef.current = tremLfo;
    tremoloDepthGainRef.current = tremDepthGain;

    carrier.start();
    vibLfo.start();
    tremLfo.start();

    return () => {
      [carrier, vibLfo, tremLfo].forEach((o) => {
        try {
          o.stop();
        } catch {
          /* noop */
        }
        o.disconnect();
      });
      vca.disconnect();
      vibDepthGain.disconnect();
      tremDepthGain.disconnect();
      carrierRef.current = null;
      vcaRef.current = null;
      vibratoLfoRef.current = null;
      vibratoDepthRef.current = null;
      tremoloLfoRef.current = null;
      tremoloDepthGainRef.current = null;
    };
    // Restart when playing toggled or fundamental params change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx, playing]);

  /* Live param updates */
  useEffect(() => {
    if (carrierRef.current) {
      carrierRef.current.type = carrierWave;
      carrierRef.current.frequency.value = carrierFreq;
    }
  }, [carrierWave, carrierFreq]);

  useEffect(() => {
    if (vibratoLfoRef.current) {
      vibratoLfoRef.current.type = lfoWaveform;
      vibratoLfoRef.current.frequency.value = lfoRate;
    }
    if (tremoloLfoRef.current) {
      tremoloLfoRef.current.type = lfoWaveform;
      tremoloLfoRef.current.frequency.value = lfoRate;
    }
  }, [lfoWaveform, lfoRate]);

  useEffect(() => {
    if (vibratoDepthRef.current) {
      vibratoDepthRef.current.gain.value =
        effectMode === "vibrato" || effectMode === "both" ? vibratoDepth : 0;
    }
    if (tremoloDepthGainRef.current) {
      tremoloDepthGainRef.current.gain.value =
        effectMode === "tremolo" || effectMode === "both" ? tremoloDepth : 0;
    }
  }, [effectMode, vibratoDepth, tremoloDepth]);

  const handleToggle = async (on: boolean) => {
    if (on) await resume();
    setPlaying(on);
  };

  return (
    <DemoShell
      title="Vibrato & Tremolo"
      description="Demonstrate LFO-based effects: vibrato modulates pitch (carrier detune) while tremolo modulates amplitude (VCA gain). Toggle each independently and hear the difference."
      nodes={["OscillatorNode (carrier)", "OscillatorNode (LFO)", "GainNode"]}
    >
      {/* Info */}
      <div className="bg-surface rounded-lg border border-white/5 p-4">
        <div className="grid gap-3 text-xs sm:grid-cols-2">
          <div>
            <h3 className="text-accent mb-1 font-semibold">Vibrato</h3>
            <p className="text-text-muted">
              An LFO modulates the carrier&apos;s <strong>pitch</strong> (detune
              in cents). Depth controls how many cents the pitch wavers.
            </p>
          </div>
          <div>
            <h3 className="text-accent mb-1 font-semibold">Tremolo</h3>
            <p className="text-text-muted">
              An LFO modulates the carrier&apos;s <strong>amplitude</strong>{" "}
              (VCA gain). Depth controls how much the volume fluctuates.
            </p>
          </div>
        </div>
      </div>

      {/* Controls */}
      <div className="bg-surface rounded-lg border border-white/5 p-4">
        <h2 className="text-text mb-3 text-sm font-semibold">Controls</h2>

        <div className="mb-4 flex flex-wrap items-center gap-4">
          <Toggle label="Play" value={playing} onChange={handleToggle} />

          {/* Effect mode selector */}
          <div className="flex items-center gap-2">
            <span className="text-text-muted text-xs">Effect:</span>
            {(["vibrato", "tremolo", "both"] as EffectMode[]).map((m) => (
              <button
                key={m}
                type="button"
                className={`rounded-md px-3 py-1 text-xs font-medium transition ${
                  effectMode === m
                    ? "bg-accent text-white"
                    : "text-text-muted bg-white/5 hover:bg-white/10"
                }`}
                onClick={() => setEffectMode(m)}
              >
                {m}
              </button>
            ))}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {/* Carrier */}
          <div>
            <h3 className="text-text-muted mb-2 text-xs font-medium">
              Carrier
            </h3>
            <Slider
              label="Frequency"
              min={100}
              max={1000}
              step={1}
              value={carrierFreq}
              onChange={setCarrierFreq}
              unit="Hz"
            />
            <div className="mt-2 flex items-center gap-2">
              <span className="text-text-muted min-w-[4rem] text-xs">Wave</span>
              {CARRIER_WAVES.map((w) => (
                <button
                  key={w}
                  type="button"
                  className={`rounded px-2 py-0.5 text-[10px] font-medium transition ${
                    carrierWave === w
                      ? "bg-accent text-white"
                      : "text-text-muted bg-white/5 hover:bg-white/10"
                  }`}
                  onClick={() => setCarrierWave(w)}
                >
                  {w}
                </button>
              ))}
            </div>
          </div>

          {/* LFO */}
          <div>
            <h3 className="text-text-muted mb-2 text-xs font-medium">LFO</h3>
            <Slider
              label="Rate"
              min={0.5}
              max={15}
              step={0.1}
              value={lfoRate}
              onChange={setLfoRate}
              unit="Hz"
            />
            <div className="mt-2 flex items-center gap-2">
              <span className="text-text-muted min-w-[4rem] text-xs">
                Shape
              </span>
              {WAVE_TYPES.map((w) => (
                <button
                  key={w}
                  type="button"
                  className={`rounded px-2 py-0.5 text-[10px] font-medium transition ${
                    lfoWaveform === w
                      ? "bg-accent text-white"
                      : "text-text-muted bg-white/5 hover:bg-white/10"
                  }`}
                  onClick={() => setLfoWaveform(w)}
                >
                  {w}
                </button>
              ))}
            </div>
          </div>

          {/* Depths */}
          <div>
            <h3 className="text-text-muted mb-2 text-xs font-medium">Depth</h3>
            <Slider
              label="Vibrato"
              min={0}
              max={50}
              step={1}
              value={vibratoDepth}
              onChange={setVibratoDepth}
              unit="cents"
            />
            <div className="mt-2">
              <Slider
                label="Tremolo"
                min={0}
                max={1}
                step={0.01}
                value={tremoloDepth}
                onChange={setTremoloDepth}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Waveform */}
      <div className="bg-surface rounded-lg border border-white/5 p-4">
        <Waveform analyser={analyser} />
      </div>
    </DemoShell>
  );
}
