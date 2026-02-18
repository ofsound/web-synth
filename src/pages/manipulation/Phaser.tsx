import { useCallback, useEffect, useRef, useState } from "react";
import { useAudioContext } from "../../hooks/useAudioContext";
import { DemoShell } from "../../components/DemoShell";
import { Slider } from "../../components/Slider";
import { Toggle } from "../../components/Toggle";
import { Waveform } from "../../components/Waveform";

const NUM_STAGES = 4;
const BASE_FREQ = 1000;
const MAX_FREQ = 4000;

export default function Phaser() {
  const { ctx, resume, masterGain } = useAudioContext();
  const [playing, setPlaying] = useState(false);

  const [rate, setRate] = useState(0.5);
  const [depth, setDepth] = useState(0.7);
  const [feedback, setFeedback] = useState(0.7);

  const inputRef = useRef<GainNode | null>(null);
  const filtersRef = useRef<BiquadFilterNode[]>([]);
  const lfoRef = useRef<OscillatorNode | null>(null);
  const lfoGainsRef = useRef<GainNode[]>([]);
  const fbRef = useRef<GainNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<OscillatorNode | null>(null);
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);

  /*
   * Graph:
   *  source → input ─────────────────────────────→ analyser → master  (dry)
   *                 → allpass[0→1→2→3] → fbGain ──↗                    (wet)
   *                                      fbGain → allpass[0]           (feedback)
   *
   *  LFO → lfoGain[i] → allpass[i].frequency   (modulation per stage)
   */
  useEffect(() => {
    if (!ctx || !masterGain) return;

    const input = ctx.createGain();

    // Create allpass filter stages
    const filters: BiquadFilterNode[] = [];
    for (let i = 0; i < NUM_STAGES; i++) {
      const f = ctx.createBiquadFilter();
      f.type = "allpass";
      f.frequency.value = BASE_FREQ;
      f.Q.value = 0.5;
      filters.push(f);
    }

    // Chain allpass filters
    for (let i = 0; i < NUM_STAGES - 1; i++) {
      filters[i].connect(filters[i + 1]);
    }

    // Feedback gain
    const fb = ctx.createGain();
    fb.gain.value = feedback;

    // LFO
    const lfo = ctx.createOscillator();
    lfo.type = "sine";
    lfo.frequency.value = rate;

    // LFO gain per stage (modulation depth)
    const lfoGains: GainNode[] = [];
    for (let i = 0; i < NUM_STAGES; i++) {
      const g = ctx.createGain();
      g.gain.value = depth * MAX_FREQ;
      lfoGains.push(g);
      lfo.connect(g);
      g.connect(filters[i].frequency);
    }

    const an = ctx.createAnalyser();
    an.fftSize = 2048;

    // Dry path
    input.connect(an);

    // Wet path: input → allpass chain → feedback → analyser
    input.connect(filters[0]);
    filters[NUM_STAGES - 1].connect(fb);
    fb.connect(an);

    // Feedback → first allpass
    fb.connect(filters[0]);

    an.connect(masterGain);
    lfo.start();

    inputRef.current = input;
    filtersRef.current = filters;
    lfoRef.current = lfo;
    lfoGainsRef.current = lfoGains;
    fbRef.current = fb;
    analyserRef.current = an;
    queueMicrotask(() => setAnalyser(an));

    return () => {
      try {
        lfo.stop();
      } catch {
        /* ok */
      }
      input.disconnect();
      for (const f of filters) f.disconnect();
      fb.disconnect();
      lfo.disconnect();
      for (const g of lfoGains) g.disconnect();
      an.disconnect();
    };
  }, [ctx, masterGain]); // eslint-disable-line react-hooks/exhaustive-deps

  /* Live-update params */
  useEffect(() => {
    if (lfoRef.current) lfoRef.current.frequency.value = rate;
  }, [rate]);

  useEffect(() => {
    const gains = [...lfoGainsRef.current];
    for (const g of gains) {
      g.gain.value = depth * MAX_FREQ;
    }
  }, [depth]);

  useEffect(() => {
    if (fbRef.current) fbRef.current.gain.value = feedback;
  }, [feedback]);

  /* Play / Stop sawtooth */
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
    osc.connect(inputRef.current || ctx.destination);
    osc.start();
    sourceRef.current = osc;
    setPlaying(true);
  }, [ctx, resume, playing]);

  /* Cleanup on unmount */
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
      title="Phaser"
      description="Phasing passes a signal through a cascade of allpass filters whose frequencies are swept by an LFO, then mixes it back with the dry signal. The moving notches in the frequency spectrum produce the classic swirling, sweeping effect."
      nodes={[
        "BiquadFilterNode (allpass) ×4",
        "OscillatorNode (LFO)",
        "GainNode ×6",
        "AnalyserNode",
      ]}
    >
      <Waveform analyser={analyser} />

      <Slider
        label="Rate"
        min={0.1}
        max={5}
        step={0.01}
        value={rate}
        onChange={setRate}
        unit="Hz"
      />
      <Slider
        label="Depth"
        min={0}
        max={1}
        step={0.01}
        value={depth}
        onChange={setDepth}
      />
      <Slider
        label="Feedback"
        min={0}
        max={0.9}
        step={0.01}
        value={feedback}
        onChange={setFeedback}
      />

      <Toggle
        label={playing ? "Stop" : "Play Sawtooth 220 Hz"}
        value={playing}
        onChange={togglePlay}
      />
    </DemoShell>
  );
}
