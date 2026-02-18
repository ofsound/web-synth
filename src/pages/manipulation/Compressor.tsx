import { useCallback, useEffect, useRef, useState } from "react";
import { useAudioContext } from "../../hooks/useAudioContext";
import { DemoShell } from "../../components/DemoShell";
import { Slider } from "../../components/Slider";
import { Toggle } from "../../components/Toggle";
import { Waveform } from "../../components/Waveform";
import { createNoiseBuffer } from "../../utils/noiseGenerators";

export default function Compressor() {
  const { ctx, resume, masterGain } = useAudioContext();
  const [playing, setPlaying] = useState(false);

  const [threshold, setThreshold] = useState(-24);
  const [knee, setKnee] = useState(30);
  const [ratio, setRatio] = useState(12);
  const [attack, setAttack] = useState(0.003);
  const [release, setRelease] = useState(0.25);
  const [reduction, setReduction] = useState(0);

  const compressorRef = useRef<DynamicsCompressorNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);
  const rafRef = useRef<number>(0);
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);

  /* Build graph: source → compressor → analyser → masterGain */
  useEffect(() => {
    if (!ctx || !masterGain) return;

    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = threshold;
    comp.knee.value = knee;
    comp.ratio.value = ratio;
    comp.attack.value = attack;
    comp.release.value = release;

    const an = ctx.createAnalyser();
    an.fftSize = 2048;

    comp.connect(an);
    an.connect(masterGain);

    compressorRef.current = comp;
    analyserRef.current = an;
    queueMicrotask(() => setAnalyser(an));

    return () => {
      comp.disconnect();
      an.disconnect();
    };
  }, [ctx, masterGain]); // eslint-disable-line react-hooks/exhaustive-deps

  /* Live-update compressor params */
  useEffect(() => {
    const c = compressorRef.current;
    if (!c) return;
    c.threshold.value = threshold;
    c.knee.value = knee;
    c.ratio.value = ratio;
    c.attack.value = attack;
    c.release.value = release;
  }, [threshold, knee, ratio, attack, release]);

  /* Reduction meter polling */
  useEffect(() => {
    if (!playing || !compressorRef.current) return;
    const poll = () => {
      if (compressorRef.current) {
        setReduction(compressorRef.current.reduction);
      }
      rafRef.current = requestAnimationFrame(poll);
    };
    rafRef.current = requestAnimationFrame(poll);
    return () => cancelAnimationFrame(rafRef.current);
  }, [playing]);

  /* Play / Stop pink noise */
  const togglePlay = useCallback(async () => {
    await resume();
    if (!ctx) return;

    if (playing) {
      try {
        sourceRef.current?.stop();
      } catch {
        /* ok */
      }
      sourceRef.current = null;
      setPlaying(false);
      setReduction(0);
      return;
    }

    const buffer = createNoiseBuffer(ctx, "pink", 4);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    src.connect(compressorRef.current || ctx.destination);
    src.start();
    sourceRef.current = src;
    setPlaying(true);
  }, [ctx, resume, playing]);

  /* Cleanup on unmount */
  useEffect(() => {
    return () => {
      cancelAnimationFrame(rafRef.current);
      try {
        sourceRef.current?.stop();
      } catch {
        /* ok */
      }
    };
  }, []);

  const reductionWidth = Math.min(100, Math.abs(reduction) * 2.5);

  return (
    <DemoShell
      title="Dynamics Compressor"
      description="DynamicsCompressorNode reduces the dynamic range of an audio signal. Watch the gain-reduction meter respond in real time as you adjust threshold, knee, ratio, attack and release."
      nodes={[
        "DynamicsCompressorNode",
        "AudioBufferSourceNode",
        "GainNode",
        "AnalyserNode",
      ]}
    >
      <Waveform analyser={analyser} />

      {/* Reduction meter */}
      <div className="bg-surface-alt border-border rounded-lg border p-3">
        <div className="text-text-muted mb-1 flex items-center justify-between text-xs">
          <span>Gain Reduction</span>
          <span className="text-accent font-mono">
            {reduction.toFixed(1)} dB
          </span>
        </div>
        <div className="bg-surface h-3 overflow-hidden rounded-full">
          <div
            className="h-full rounded-full bg-red-500/70 transition-all duration-75"
            style={{ width: `${reductionWidth}%` }}
          />
        </div>
      </div>

      <Slider
        label="Threshold"
        min={-100}
        max={0}
        step={1}
        value={threshold}
        onChange={setThreshold}
        unit="dB"
      />
      <Slider
        label="Knee"
        min={0}
        max={40}
        step={0.5}
        value={knee}
        onChange={setKnee}
        unit="dB"
      />
      <Slider
        label="Ratio"
        min={1}
        max={20}
        step={0.5}
        value={ratio}
        onChange={setRatio}
        unit=":1"
      />
      <Slider
        label="Attack"
        min={0}
        max={1}
        step={0.001}
        value={attack}
        onChange={setAttack}
        unit="s"
      />
      <Slider
        label="Release"
        min={0}
        max={1}
        step={0.01}
        value={release}
        onChange={setRelease}
        unit="s"
      />

      <Toggle
        label={playing ? "Stop" : "Play Pink Noise"}
        value={playing}
        onChange={togglePlay}
      />
    </DemoShell>
  );
}
