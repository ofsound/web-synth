import { useCallback, useEffect, useRef, useState } from "react";
import { useAudioContext } from "../../hooks/useAudioContext";
import { DemoShell } from "../../components/DemoShell";
import { Slider } from "../../components/Slider";
import { ADSREnvelope } from "../../components/ADSREnvelope";
import { Waveform } from "../../components/Waveform";

export default function ADSRVisualizer() {
  const { ctx, resume, masterGain } = useAudioContext();
  const [attack, setAttack] = useState(0.1);
  const [decay, setDecay] = useState(0.2);
  const [sustain, setSustain] = useState(0.6);
  const [release, setRelease] = useState(0.4);
  const [playing, setPlaying] = useState(false);
  const [frequency, setFrequency] = useState(440);

  const oscRef = useRef<OscillatorNode | null>(null);
  const envGainRef = useRef<GainNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);

  /* Static graph part */
  useEffect(() => {
    if (!ctx || !masterGain) return;
    const g = ctx.createGain();
    g.gain.value = 0;
    const an = ctx.createAnalyser();
    an.fftSize = 2048;
    g.connect(an);
    an.connect(masterGain);
    envGainRef.current = g;
    analyserRef.current = an;
    queueMicrotask(() => setAnalyser(an));
    return () => {
      g.disconnect();
      an.disconnect();
    };
  }, [ctx, masterGain]);

  /* Trigger envelope */
  const triggerNote = useCallback(async () => {
    await resume();
    if (!ctx || !envGainRef.current) return;

    /* Stop previous */
    try {
      oscRef.current?.stop();
    } catch {
      /* ok */
    }

    const osc = ctx.createOscillator();
    osc.type = "sawtooth";
    osc.frequency.value = frequency;
    osc.connect(envGainRef.current);

    const now = ctx.currentTime;
    const param = envGainRef.current.gain;

    /* ADSR attack phase */
    param.cancelScheduledValues(now);
    param.setValueAtTime(0.001, now);
    param.exponentialRampToValueAtTime(1, now + Math.max(attack, 0.005));
    /* Decay → Sustain */
    param.setTargetAtTime(sustain, now + attack, Math.max(decay, 0.01) / 4);

    osc.start(now);
    oscRef.current = osc;
    setPlaying(true);
  }, [ctx, resume, attack, decay, sustain, frequency]);

  /* Release */
  const releaseNote = useCallback(() => {
    if (!ctx || !envGainRef.current || !oscRef.current) return;
    const now = ctx.currentTime;
    const param = envGainRef.current.gain;

    param.cancelScheduledValues(now);
    param.setValueAtTime(param.value, now);
    param.setTargetAtTime(0.001, now, Math.max(release, 0.01) / 4);

    /* Schedule oscillator stop after release tail */
    const osc = oscRef.current;
    setTimeout(
      () => {
        try {
          osc.stop();
        } catch {
          /* ok */
        }
      },
      release * 1000 + 200,
    );

    oscRef.current = null;
    setPlaying(false);
  }, [ctx, release]);

  useEffect(() => {
    return () => {
      try {
        oscRef.current?.stop();
      } catch {
        /* ok */
      }
    };
  }, []);

  return (
    <DemoShell
      title="ADSR Envelope Visualizer"
      description="Interactive Attack/Decay/Sustain/Release envelope with real-time visualization. Uses AudioParam scheduling methods (setValueAtTime, exponentialRampToValueAtTime, setTargetAtTime) applied to a GainNode."
      nodes={[
        "GainNode",
        "OscillatorNode",
        "AudioParam scheduling",
        "AnalyserNode",
      ]}
    >
      {/* Envelope shape */}
      <div className="flex justify-center">
        <ADSREnvelope
          attack={attack}
          decay={decay}
          sustain={sustain}
          release={release}
          width={500}
          height={140}
        />
      </div>

      {/* Waveform */}
      <Waveform analyser={analyser} height={120} />

      {/* ADSR sliders */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Slider
          label="Attack"
          min={0.005}
          max={2}
          step={0.005}
          value={attack}
          onChange={setAttack}
          unit="s"
        />
        <Slider
          label="Decay"
          min={0.01}
          max={2}
          step={0.01}
          value={decay}
          onChange={setDecay}
          unit="s"
        />
        <Slider
          label="Sustain"
          min={0}
          max={1}
          step={0.01}
          value={sustain}
          onChange={setSustain}
        />
        <Slider
          label="Release"
          min={0.01}
          max={3}
          step={0.01}
          value={release}
          onChange={setRelease}
          unit="s"
        />
      </div>

      <Slider
        label="Frequency"
        min={55}
        max={2000}
        step={1}
        value={frequency}
        onChange={setFrequency}
        unit="Hz"
      />

      {/* Play / Release button */}
      <div className="flex gap-3">
        <button
          onPointerDown={triggerNote}
          onPointerUp={releaseNote}
          onPointerLeave={releaseNote}
          className={`rounded-lg border px-8 py-3 text-sm font-medium transition select-none ${
            playing
              ? "border-accent bg-accent/20 text-accent"
              : "border-border bg-surface-alt text-text-muted hover:border-accent"
          }`}
        >
          Hold to Play
        </button>
        <span className="text-text-muted self-center text-xs">
          Press and hold — release to hear the release phase
        </span>
      </div>
    </DemoShell>
  );
}
