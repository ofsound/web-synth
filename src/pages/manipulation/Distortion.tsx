import { useCallback, useEffect, useRef, useState } from "react";
import { useAudioContext } from "../../hooks/useAudioContext";
import { DemoShell } from "../../components/DemoShell";
import { Slider } from "../../components/Slider";
import { Toggle } from "../../components/Toggle";
import { Waveform } from "../../components/Waveform";
import {
  getCurve,
  CURVE_NAMES,
  type CurveName,
} from "../../utils/distortionCurves";

type Oversample = "none" | "2x" | "4x";

export default function Distortion() {
  const { ctx, resume, masterGain } = useAudioContext();
  const [playing, setPlaying] = useState(false);
  const [curveType, setCurveType] = useState<CurveName>("softClip");
  const [drive, setDrive] = useState(20);
  const [oversample, setOversample] = useState<Oversample>("4x");
  const [toneFreq, setToneFreq] = useState(1000);

  const shaperRef = useRef<WaveShaperNode | null>(null);
  const preFilterRef = useRef<BiquadFilterNode | null>(null);
  const postFilterRef = useRef<BiquadFilterNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<OscillatorNode | null>(null);
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);

  /* Build graph: osc → preFilter → waveshaper → postFilter → analyser → master */
  useEffect(() => {
    if (!ctx || !masterGain) return;

    const shaper = ctx.createWaveShaper();
    shaper.curve = getCurve(curveType, drive) as Float32Array<ArrayBuffer>;
    shaper.oversample = oversample;

    const pre = ctx.createBiquadFilter();
    pre.type = "lowpass";
    pre.frequency.value = 8000;

    const post = ctx.createBiquadFilter();
    post.type = "lowpass";
    post.frequency.value = toneFreq;

    const an = ctx.createAnalyser();
    an.fftSize = 2048;

    pre.connect(shaper);
    shaper.connect(post);
    post.connect(an);
    an.connect(masterGain);

    shaperRef.current = shaper;
    preFilterRef.current = pre;
    postFilterRef.current = post;
    analyserRef.current = an;
    queueMicrotask(() => setAnalyser(an));

    return () => {
      pre.disconnect();
      shaper.disconnect();
      post.disconnect();
      an.disconnect();
    };
  }, [ctx, masterGain]); // eslint-disable-line react-hooks/exhaustive-deps

  /* Update curve in real-time */
  useEffect(() => {
    if (shaperRef.current) {
      shaperRef.current.curve = getCurve(
        curveType,
        drive,
      ) as Float32Array<ArrayBuffer>;
      shaperRef.current.oversample = oversample;
    }
  }, [curveType, drive, oversample]);

  /* Update tone filter */
  useEffect(() => {
    if (postFilterRef.current) postFilterRef.current.frequency.value = toneFreq;
  }, [toneFreq]);

  /* Play test signal */
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
      return;
    }

    const osc = ctx.createOscillator();
    osc.type = "sawtooth";
    osc.frequency.value = 220;
    osc.connect(preFilterRef.current || ctx.destination);
    osc.start();
    sourceRef.current = osc;
    setPlaying(true);
  }, [ctx, resume, playing]);

  useEffect(() => {
    return () => {
      try {
        sourceRef.current?.stop();
      } catch {
        /* ok */
      }
    };
  }, []);

  return (
    <DemoShell
      title="Distortion"
      description="Non-linear waveshaping distortion with 4 curve types (soft clip, hard clip, fuzz, tube). Includes pre/post tone shaping via BiquadFilterNode and oversampling to reduce aliasing."
      nodes={["WaveShaperNode", "BiquadFilterNode ×2", "AnalyserNode"]}
    >
      <Waveform analyser={analyser} />

      {/* Curve selector */}
      <div className="flex flex-wrap gap-2">
        {CURVE_NAMES.map((name) => (
          <button
            key={name}
            onClick={() => setCurveType(name)}
            className={`rounded-md border px-4 py-1.5 text-xs capitalize transition ${
              curveType === name
                ? "border-accent bg-accent/20 text-accent"
                : "border-border bg-surface-alt text-text-muted hover:text-text"
            }`}
          >
            {name}
          </button>
        ))}
      </div>

      <Slider
        label="Drive"
        min={1}
        max={100}
        step={1}
        value={drive}
        onChange={setDrive}
      />
      <Slider
        label="Tone"
        min={200}
        max={8000}
        step={10}
        value={toneFreq}
        onChange={setToneFreq}
        unit="Hz"
      />

      {/* Oversample */}
      <div className="flex items-center gap-2">
        <span className="text-text-muted text-xs">Oversample:</span>
        {(["none", "2x", "4x"] as Oversample[]).map((o) => (
          <button
            key={o}
            onClick={() => setOversample(o)}
            className={`rounded border px-3 py-1 text-[11px] ${
              oversample === o
                ? "border-accent text-accent"
                : "border-border text-text-muted"
            }`}
          >
            {o}
          </button>
        ))}
      </div>

      <Toggle
        label={playing ? "Stop" : "Play Sawtooth 220 Hz"}
        value={playing}
        onChange={togglePlay}
      />
    </DemoShell>
  );
}
