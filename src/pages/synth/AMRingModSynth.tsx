import { useCallback, useEffect, useRef, useState } from "react";
import { useAudioContext } from "../../hooks/useAudioContext";
import { DemoShell } from "../../components/DemoShell";
import { Slider } from "../../components/Slider";
import { Toggle } from "../../components/Toggle";
import { Waveform } from "../../components/Waveform";

type ModMode = "am" | "ring";

const WAVE_TYPES: OscillatorType[] = ["sine", "square", "sawtooth", "triangle"];

export default function AMRingModSynth() {
  const { ctx, resume, masterGain } = useAudioContext();

  const [mode, setMode] = useState<ModMode>("am");
  const [playing, setPlaying] = useState(false);
  const [carrierFreq, setCarrierFreq] = useState(440);
  const [modFreq, setModFreq] = useState(5);
  const [modDepth, setModDepth] = useState(0.5);
  const [carrierType, setCarrierType] = useState<OscillatorType>("sine");

  const carrierRef = useRef<OscillatorNode | null>(null);
  const modulatorRef = useRef<OscillatorNode | null>(null);
  const modGainRef = useRef<GainNode | null>(null);
  const dcOffsetRef = useRef<ConstantSourceNode | null>(null);
  const vcaRef = useRef<GainNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);

  /* Static analyser node */
  useEffect(() => {
    if (!ctx || !masterGain) return;
    const an = ctx.createAnalyser();
    an.fftSize = 4096;
    an.connect(masterGain);
    analyserRef.current = an;
    setAnalyser(an);
    return () => {
      an.disconnect();
    };
  }, [ctx, masterGain]);

  /* Stop helper */
  const stopAll = useCallback(() => {
    [carrierRef, modulatorRef].forEach((ref) => {
      try {
        ref.current?.stop();
      } catch {
        /* ok */
      }
      ref.current?.disconnect();
      ref.current = null;
    });
    try {
      dcOffsetRef.current?.stop();
    } catch {
      /* ok */
    }
    dcOffsetRef.current?.disconnect();
    dcOffsetRef.current = null;
    modGainRef.current?.disconnect();
    modGainRef.current = null;
    vcaRef.current?.disconnect();
    vcaRef.current = null;
  }, []);

  const startAudio = useCallback(async () => {
    await resume();
    if (!ctx || !analyserRef.current) return;

    stopAll();

    const now = ctx.currentTime;

    /* Carrier oscillator */
    const carrier = ctx.createOscillator();
    carrier.type = carrierType;
    carrier.frequency.value = carrierFreq;

    /* VCA — the modulation target.
     * AM:   carrier → VCA, VCA.gain = 1 + depth * mod   (stays positive)
     * Ring: carrier → VCA, VCA.gain = depth * mod        (goes negative)
     */
    const vca = ctx.createGain();
    vca.gain.value = 0; /* will be driven by modulator */

    /* Modulator oscillator */
    const modulator = ctx.createOscillator();
    modulator.type = "sine";
    modulator.frequency.value = modFreq;

    /* Modulation gain scales depth */
    const modGain = ctx.createGain();
    modGain.gain.value = modDepth;

    modulator.connect(modGain);
    modGain.connect(vca.gain);

    if (mode === "am") {
      /* Add DC offset of 1 so output = carrier × (1 + depth × mod) */
      const dc = ctx.createConstantSource();
      dc.offset.value = 1;
      dc.connect(vca.gain);
      dc.start(now);
      dcOffsetRef.current = dc;
    }
    /* ring mode: no DC offset, output = carrier × (depth × mod) */

    carrier.connect(vca);
    vca.connect(analyserRef.current);

    carrier.start(now);
    modulator.start(now);

    carrierRef.current = carrier;
    modulatorRef.current = modulator;
    modGainRef.current = modGain;
    vcaRef.current = vca;
  }, [ctx, resume, stopAll, mode, carrierFreq, modFreq, modDepth, carrierType]);

  const togglePlay = useCallback(async () => {
    if (playing) {
      stopAll();
      setPlaying(false);
    } else {
      await startAudio();
      setPlaying(true);
    }
  }, [playing, stopAll, startAudio]);

  /* Live parameter updates */
  useEffect(() => {
    if (carrierRef.current) {
      carrierRef.current.frequency.value = carrierFreq;
      carrierRef.current.type = carrierType;
    }
  }, [carrierFreq, carrierType]);

  useEffect(() => {
    if (modulatorRef.current) modulatorRef.current.frequency.value = modFreq;
  }, [modFreq]);

  useEffect(() => {
    if (modGainRef.current) modGainRef.current.gain.value = modDepth;
  }, [modDepth]);

  /* Restart on mode change if playing */
  useEffect(() => {
    if (playing) {
      startAudio();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  /* Cleanup */
  useEffect(() => {
    return () => {
      stopAll();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <DemoShell
      title="AM / Ring Mod Synth"
      description={
        "Amplitude Modulation (AM) multiplies the carrier by (1 + depth × modulator), keeping the signal positive and preserving the carrier frequency alongside sidebands at carrier ± mod. " +
        "Ring Modulation removes the DC offset, so the output is carrier × modulator — producing only the sum and difference frequencies with no carrier. " +
        "At low mod frequencies both produce tremolo; at audio rates they create inharmonic spectra."
      }
      nodes={[
        "OscillatorNode ×2 (carrier + modulator)",
        "GainNode (VCA)",
        "ConstantSourceNode (AM DC offset)",
      ]}
    >
      <div>
        <h3 className="text-text-muted mb-1 text-xs font-medium">Waveform</h3>
        <Waveform analyser={analyser} height={140} />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {/* Mode + carrier controls */}
        <div className="border-border rounded-lg border p-4">
          <h3 className="text-text-muted mb-3 text-xs font-semibold tracking-wider uppercase">
            Mode & Carrier
          </h3>
          {/* AM / Ring toggle */}
          <div className="mb-3 flex gap-2">
            {(["am", "ring"] as ModMode[]).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`rounded border px-3 py-1 text-xs uppercase ${
                  mode === m
                    ? "border-accent text-accent"
                    : "border-border text-text-muted"
                }`}
              >
                {m === "am" ? "AM" : "Ring Mod"}
              </button>
            ))}
          </div>
          <Slider
            label="Carrier Freq"
            min={100}
            max={2000}
            step={1}
            value={carrierFreq}
            onChange={setCarrierFreq}
            unit="Hz"
          />
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className="text-text-muted text-xs">Wave:</span>
            {WAVE_TYPES.map((t) => (
              <button
                key={t}
                onClick={() => setCarrierType(t)}
                className={`rounded border px-2 py-0.5 text-[10px] capitalize ${
                  carrierType === t
                    ? "border-accent text-accent"
                    : "border-border text-text-muted"
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        {/* Modulator controls */}
        <div className="border-border rounded-lg border p-4">
          <h3 className="text-text-muted mb-3 text-xs font-semibold tracking-wider uppercase">
            Modulator
          </h3>
          <Slider
            label="Mod Freq"
            min={1}
            max={2000}
            step={1}
            value={modFreq}
            onChange={setModFreq}
            unit="Hz"
          />
          <Slider
            label="Mod Depth"
            min={0}
            max={1}
            step={0.01}
            value={modDepth}
            onChange={setModDepth}
          />
        </div>
      </div>

      {/* Math note */}
      <div className="bg-surface-alt border-border rounded border p-3 text-xs">
        <p className="text-text-muted">
          <strong className="text-text">AM:</strong> output = carrier × (1 +
          depth × mod) — carrier frequency always present
        </p>
        <p className="text-text-muted mt-1">
          <strong className="text-text">Ring:</strong> output = carrier × (depth
          × mod) — only sidebands (f_c ± f_m), no carrier
        </p>
      </div>

      <Toggle label="Play" value={playing} onChange={togglePlay} />
    </DemoShell>
  );
}
