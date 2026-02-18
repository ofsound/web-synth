import { useCallback, useEffect, useRef, useState } from "react";
import { useAudioContext } from "../../hooks/useAudioContext";
import { DemoShell } from "../../components/DemoShell";
import { Slider } from "../../components/Slider";
import { Toggle } from "../../components/Toggle";
import { Waveform } from "../../components/Waveform";

interface PedalState {
  distortion: { on: boolean; drive: number };
  delay: { on: boolean; time: number; feedback: number };
  chorus: { on: boolean; rate: number; depth: number };
  eq: { on: boolean; frequency: number; gain: number };
}

function makeDistortionCurve(amount: number): Float32Array {
  const samples = 44100;
  const curve = new Float32Array(samples);
  for (let i = 0; i < samples; i++) {
    const x = (i * 2) / samples - 1;
    curve[i] = ((Math.PI + amount) * x) / (Math.PI + amount * Math.abs(x));
  }
  return curve;
}

export default function Pedalboard() {
  const { ctx, resume, masterGain } = useAudioContext();
  const [playing, setPlaying] = useState(false);
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);
  const [pedals, setPedals] = useState<PedalState>({
    distortion: { on: true, drive: 20 },
    delay: { on: true, time: 0.3, feedback: 0.4 },
    chorus: { on: false, rate: 1.5, depth: 0.005 },
    eq: { on: true, frequency: 1000, gain: 3 },
  });

  const oscRef = useRef<OscillatorNode | null>(null);
  const inputGainRef = useRef<GainNode | null>(null);

  /* Audio node refs */
  const shaperRef = useRef<WaveShaperNode | null>(null);
  const delayRef = useRef<DelayNode | null>(null);
  const delayFeedbackRef = useRef<GainNode | null>(null);
  const delayDryRef = useRef<GainNode | null>(null);
  const delayWetRef = useRef<GainNode | null>(null);
  const chorusDelayRef = useRef<DelayNode | null>(null);
  const chorusLfoRef = useRef<OscillatorNode | null>(null);
  const chorusDryRef = useRef<GainNode | null>(null);
  const chorusWetRef = useRef<GainNode | null>(null);
  const chorusDepthRef = useRef<GainNode | null>(null);
  const eqRef = useRef<BiquadFilterNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const chainNodesRef = useRef<AudioNode[]>([]);

  /* Build full signal chain whenever pedals toggle on/off */
  const buildChain = useCallback(() => {
    if (!ctx || !masterGain) return;

    /* Disconnect old chain nodes */
    chainNodesRef.current.forEach((n) => {
      try {
        n.disconnect();
      } catch {
        /* ok */
      }
    });
    chainNodesRef.current = [];
    try {
      chorusLfoRef.current?.stop();
    } catch {
      /* ok */
    }
    chorusLfoRef.current = null;

    const an = ctx.createAnalyser();
    an.fftSize = 2048;
    analyserRef.current = an;
    queueMicrotask(() => setAnalyser(an));

    const inputGain = ctx.createGain();
    inputGain.gain.value = 0.35;
    inputGainRef.current = inputGain;

    const nodes: AudioNode[] = [inputGain];
    let lastNode: AudioNode = inputGain;

    /* Distortion */
    if (pedals.distortion.on) {
      const shaper = ctx.createWaveShaper();
      shaper.curve = makeDistortionCurve(
        pedals.distortion.drive,
      ) as Float32Array<ArrayBuffer>;
      shaper.oversample = "4x";
      shaperRef.current = shaper;
      lastNode.connect(shaper);
      lastNode = shaper;
      nodes.push(shaper);
    }

    /* Delay */
    if (pedals.delay.on) {
      const dry = ctx.createGain();
      dry.gain.value = 1;
      const wet = ctx.createGain();
      wet.gain.value = 0.5;
      const delay = ctx.createDelay(2);
      delay.delayTime.value = pedals.delay.time;
      const feedback = ctx.createGain();
      feedback.gain.value = pedals.delay.feedback;
      const merge = ctx.createGain();

      lastNode.connect(dry);
      lastNode.connect(delay);
      delay.connect(feedback);
      feedback.connect(delay);
      delay.connect(wet);
      dry.connect(merge);
      wet.connect(merge);

      delayRef.current = delay;
      delayFeedbackRef.current = feedback;
      delayDryRef.current = dry;
      delayWetRef.current = wet;
      lastNode = merge;
      nodes.push(dry, wet, delay, feedback, merge);
    }

    /* Chorus */
    if (pedals.chorus.on) {
      const dry = ctx.createGain();
      dry.gain.value = 0.7;
      const wet = ctx.createGain();
      wet.gain.value = 0.5;
      const chorusDelay = ctx.createDelay(0.1);
      chorusDelay.delayTime.value = 0.025;
      const depthGain = ctx.createGain();
      depthGain.gain.value = pedals.chorus.depth;
      const lfo = ctx.createOscillator();
      lfo.type = "sine";
      lfo.frequency.value = pedals.chorus.rate;
      lfo.connect(depthGain);
      depthGain.connect(chorusDelay.delayTime);
      lfo.start();

      const merge = ctx.createGain();

      lastNode.connect(dry);
      lastNode.connect(chorusDelay);
      chorusDelay.connect(wet);
      dry.connect(merge);
      wet.connect(merge);

      chorusDelayRef.current = chorusDelay;
      chorusLfoRef.current = lfo;
      chorusDryRef.current = dry;
      chorusWetRef.current = wet;
      chorusDepthRef.current = depthGain;
      lastNode = merge;
      nodes.push(dry, wet, chorusDelay, depthGain, lfo, merge);
    }

    /* EQ */
    if (pedals.eq.on) {
      const eq = ctx.createBiquadFilter();
      eq.type = "peaking";
      eq.frequency.value = pedals.eq.frequency;
      eq.gain.value = pedals.eq.gain;
      eq.Q.value = 1.5;
      eqRef.current = eq;
      lastNode.connect(eq);
      lastNode = eq;
      nodes.push(eq);
    }

    lastNode.connect(an);
    an.connect(masterGain);
    nodes.push(an);

    chainNodesRef.current = nodes;
  }, [
    ctx,
    masterGain,
    pedals.distortion.on,
    pedals.distortion.drive,
    pedals.delay.on,
    pedals.delay.time,
    pedals.delay.feedback,
    pedals.chorus.on,
    pedals.chorus.rate,
    pedals.chorus.depth,
    pedals.eq.on,
    pedals.eq.frequency,
    pedals.eq.gain,
  ]);

  /* Rebuild chain when pedals toggled */
  useEffect(() => {
    if (!playing) return;
    const osc = oscRef.current;
    if (!osc) return;

    try {
      osc.disconnect();
    } catch {
      /* ok */
    }
    buildChain();
    if (inputGainRef.current) osc.connect(inputGainRef.current);
  }, [
    pedals.distortion.on,
    pedals.delay.on,
    pedals.chorus.on,
    pedals.eq.on,
    buildChain,
    playing,
  ]);

  /* Update continuous params without rebuilding */
  useEffect(() => {
    if (shaperRef.current && pedals.distortion.on) {
      shaperRef.current.curve = makeDistortionCurve(
        pedals.distortion.drive,
      ) as Float32Array<ArrayBuffer>;
    }
  }, [pedals.distortion.drive, pedals.distortion.on]);

  useEffect(() => {
    if (delayRef.current && pedals.delay.on) {
      delayRef.current.delayTime.value = pedals.delay.time;
    }
    if (delayFeedbackRef.current && pedals.delay.on) {
      delayFeedbackRef.current.gain.value = pedals.delay.feedback;
    }
  }, [pedals.delay.time, pedals.delay.feedback, pedals.delay.on]);

  useEffect(() => {
    if (chorusLfoRef.current && pedals.chorus.on) {
      chorusLfoRef.current.frequency.value = pedals.chorus.rate;
    }
    if (chorusDepthRef.current && pedals.chorus.on) {
      chorusDepthRef.current.gain.value = pedals.chorus.depth;
    }
  }, [pedals.chorus.rate, pedals.chorus.depth, pedals.chorus.on]);

  useEffect(() => {
    if (eqRef.current && pedals.eq.on) {
      eqRef.current.frequency.value = pedals.eq.frequency;
      eqRef.current.gain.value = pedals.eq.gain;
    }
  }, [pedals.eq.frequency, pedals.eq.gain, pedals.eq.on]);

  /* Toggle play */
  const togglePlay = useCallback(async () => {
    await resume();
    if (!ctx || !masterGain) return;

    if (playing) {
      try {
        oscRef.current?.stop();
      } catch {
        /* ok */
      }
      try {
        chorusLfoRef.current?.stop();
      } catch {
        /* ok */
      }
      oscRef.current = null;
      chainNodesRef.current.forEach((n) => {
        try {
          n.disconnect();
        } catch {
          /* ok */
        }
      });
      chainNodesRef.current = [];
      setAnalyser(null);
      setPlaying(false);
      return;
    }

    buildChain();

    const osc = ctx.createOscillator();
    osc.type = "sawtooth";
    osc.frequency.value = 196; // G3 — guitar-like
    if (inputGainRef.current) osc.connect(inputGainRef.current);
    osc.start();
    oscRef.current = osc;

    setPlaying(true);
  }, [ctx, resume, masterGain, playing, buildChain]);

  /* Cleanup */
  useEffect(() => {
    return () => {
      try {
        oscRef.current?.stop();
      } catch {
        /* ok */
      }
      try {
        chorusLfoRef.current?.stop();
      } catch {
        /* ok */
      }
      chainNodesRef.current.forEach((n) => {
        try {
          n.disconnect();
        } catch {
          /* ok */
        }
      });
    };
  }, []);

  const updatePedal = <K extends keyof PedalState>(
    pedal: K,
    update: Partial<PedalState[K]>,
  ) => {
    setPedals((p) => ({ ...p, [pedal]: { ...p[pedal], ...update } }));
  };

  const pedalOrder: { id: keyof PedalState; label: string; color: string }[] = [
    { id: "distortion", label: "Distortion", color: "text-red-400" },
    { id: "delay", label: "Delay", color: "text-blue-400" },
    { id: "chorus", label: "Chorus", color: "text-green-400" },
    { id: "eq", label: "EQ", color: "text-yellow-400" },
  ];

  return (
    <DemoShell
      title="Effects Pedalboard"
      description="Chain multiple guitar effects in series: Distortion → Delay → Chorus → EQ. Each pedal can be toggled on/off and has adjustable parameters. Uses a sawtooth oscillator as a test guitar signal."
      nodes={[
        "WaveShaperNode",
        "DelayNode",
        "BiquadFilterNode",
        "OscillatorNode",
        "GainNode",
      ]}
    >
      {/* Signal chain visual */}
      <div className="bg-surface-alt border-border rounded-lg border p-4">
        <div className="text-text-muted mb-4 flex items-center gap-2 text-xs">
          <span className="text-text font-medium">Signal Chain:</span>
          <span className="bg-accent/20 text-accent rounded px-2 py-0.5">
            Input
          </span>
          {pedalOrder.map((p) => (
            <span key={p.id}>
              <span className="text-text-muted">→</span>
              <span
                className={`ml-1 rounded px-2 py-0.5 ${
                  pedals[p.id].on
                    ? "bg-accent/20 text-accent"
                    : "bg-surface-alt text-text-muted line-through opacity-50"
                }`}
              >
                {p.label}
              </span>
            </span>
          ))}
          <span className="text-text-muted">→</span>
          <span className="bg-accent/20 text-accent rounded px-2 py-0.5">
            Output
          </span>
        </div>
      </div>

      {/* Pedal controls */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {/* Distortion */}
        <div className="bg-surface-alt border-border space-y-3 rounded-lg border p-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-red-400">Distortion</span>
            <Toggle
              label="On"
              value={pedals.distortion.on}
              onChange={(v) => updatePedal("distortion", { on: v })}
            />
          </div>
          <Slider
            label="Drive"
            min={1}
            max={100}
            step={1}
            value={pedals.distortion.drive}
            onChange={(v) => updatePedal("distortion", { drive: v })}
          />
        </div>

        {/* Delay */}
        <div className="bg-surface-alt border-border space-y-3 rounded-lg border p-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-blue-400">Delay</span>
            <Toggle
              label="On"
              value={pedals.delay.on}
              onChange={(v) => updatePedal("delay", { on: v })}
            />
          </div>
          <Slider
            label="Time"
            min={0.05}
            max={1}
            step={0.01}
            value={pedals.delay.time}
            onChange={(v) => updatePedal("delay", { time: v })}
            unit=" s"
          />
          <Slider
            label="Feedback"
            min={0}
            max={0.9}
            step={0.01}
            value={pedals.delay.feedback}
            onChange={(v) => updatePedal("delay", { feedback: v })}
          />
        </div>

        {/* Chorus */}
        <div className="bg-surface-alt border-border space-y-3 rounded-lg border p-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-green-400">Chorus</span>
            <Toggle
              label="On"
              value={pedals.chorus.on}
              onChange={(v) => updatePedal("chorus", { on: v })}
            />
          </div>
          <Slider
            label="Rate"
            min={0.1}
            max={10}
            step={0.1}
            value={pedals.chorus.rate}
            onChange={(v) => updatePedal("chorus", { rate: v })}
            unit=" Hz"
          />
          <Slider
            label="Depth"
            min={0.001}
            max={0.02}
            step={0.001}
            value={pedals.chorus.depth}
            onChange={(v) => updatePedal("chorus", { depth: v })}
          />
        </div>

        {/* EQ */}
        <div className="bg-surface-alt border-border space-y-3 rounded-lg border p-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-yellow-400">EQ</span>
            <Toggle
              label="On"
              value={pedals.eq.on}
              onChange={(v) => updatePedal("eq", { on: v })}
            />
          </div>
          <Slider
            label="Frequency"
            min={100}
            max={8000}
            step={10}
            value={pedals.eq.frequency}
            onChange={(v) => updatePedal("eq", { frequency: v })}
            unit=" Hz"
          />
          <Slider
            label="Gain"
            min={-12}
            max={12}
            step={0.5}
            value={pedals.eq.gain}
            onChange={(v) => updatePedal("eq", { gain: v })}
            unit=" dB"
          />
        </div>
      </div>

      <Waveform analyser={analyser} />

      <button
        onClick={togglePlay}
        className={`self-start rounded-lg px-5 py-2 text-sm font-medium transition ${
          playing
            ? "border border-red-500 bg-red-500/20 text-red-400"
            : "bg-accent/20 text-accent border-accent border"
        }`}
      >
        {playing ? "Stop" : "Play Test Signal"}
      </button>
    </DemoShell>
  );
}
