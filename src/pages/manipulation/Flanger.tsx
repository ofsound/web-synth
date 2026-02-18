import { useCallback, useEffect, useRef, useState } from "react";
import { useAudioContext } from "../../hooks/useAudioContext";
import { DemoShell } from "../../components/DemoShell";
import { Slider } from "../../components/Slider";
import { Toggle } from "../../components/Toggle";
import { Waveform } from "../../components/Waveform";

export default function Flanger() {
  const { ctx, resume, masterGain } = useAudioContext();
  const [playing, setPlaying] = useState(false);

  const [rate, setRate] = useState(0.25);
  const [depth, setDepth] = useState(0.003); // seconds
  const [feedback, setFeedback] = useState(0.6);

  const inputRef = useRef<GainNode | null>(null);
  const delayRef = useRef<DelayNode | null>(null);
  const lfoRef = useRef<OscillatorNode | null>(null);
  const lfoGainRef = useRef<GainNode | null>(null);
  const fbRef = useRef<GainNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<OscillatorNode | null>(null);
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);

  /*
   * Graph:
   *  source → input ────────────────────→ analyser → masterGain  (dry)
   *                 → delay ─────────────↗                        (wet)
   *                   delay → fbGain → delay                     (feedback loop)
   *
   *  LFO → lfoGain → delay.delayTime  (modulation)
   *
   *  Base delay ~3ms, depth modulates ±depth around it
   */
  useEffect(() => {
    if (!ctx || !masterGain) return;

    const input = ctx.createGain();

    const delay = ctx.createDelay(0.05);
    delay.delayTime.value = 0.003; // 3ms base

    const fb = ctx.createGain();
    fb.gain.value = feedback;

    const lfo = ctx.createOscillator();
    lfo.type = "sine";
    lfo.frequency.value = rate;

    const lfoGain = ctx.createGain();
    lfoGain.gain.value = depth;

    const an = ctx.createAnalyser();
    an.fftSize = 2048;

    // Dry + wet summed at analyser
    input.connect(an); // dry
    input.connect(delay);
    delay.connect(an); // wet
    delay.connect(fb);
    fb.connect(delay); // feedback loop

    // LFO → delay time
    lfo.connect(lfoGain);
    lfoGain.connect(delay.delayTime);
    lfo.start();

    an.connect(masterGain);

    inputRef.current = input;
    delayRef.current = delay;
    fbRef.current = fb;
    lfoRef.current = lfo;
    lfoGainRef.current = lfoGain;
    analyserRef.current = an;
    queueMicrotask(() => setAnalyser(an));

    return () => {
      try {
        lfo.stop();
      } catch {
        /* ok */
      }
      input.disconnect();
      delay.disconnect();
      fb.disconnect();
      lfo.disconnect();
      lfoGain.disconnect();
      an.disconnect();
    };
  }, [ctx, masterGain]); // eslint-disable-line react-hooks/exhaustive-deps

  /* Live-update params */
  useEffect(() => {
    if (lfoRef.current) lfoRef.current.frequency.value = rate;
  }, [rate]);

  useEffect(() => {
    if (lfoGainRef.current) lfoGainRef.current.gain.value = depth;
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
      title="Flanger"
      description="Flanging mixes the original signal with a very short, LFO-modulated delay (0–10 ms) and feeds back the result to create sweeping comb-filter resonances. Negative feedback inverts the comb peaks for a distinctive jet-engine character."
      nodes={[
        "OscillatorNode (LFO)",
        "DelayNode",
        "GainNode ×2",
        "AnalyserNode",
      ]}
    >
      <Waveform analyser={analyser} />

      <Slider
        label="Rate"
        min={0.05}
        max={5}
        step={0.01}
        value={rate}
        onChange={setRate}
        unit="Hz"
      />
      <Slider
        label="Depth"
        min={0}
        max={0.005}
        step={0.0001}
        value={depth}
        onChange={setDepth}
        unit="s"
      />
      <Slider
        label="Feedback"
        min={-0.9}
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
