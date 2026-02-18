import { useCallback, useEffect, useRef, useState } from "react";
import { useAudioContext } from "../../hooks/useAudioContext";
import { DemoShell } from "../../components/DemoShell";
import { Slider } from "../../components/Slider";
import { Toggle } from "../../components/Toggle";
import { Waveform } from "../../components/Waveform";

export default function AutoPan() {
  const { ctx, resume, masterGain } = useAudioContext();
  const [playing, setPlaying] = useState(false);

  const [rate, setRate] = useState(2);
  const [depth, setDepth] = useState(0.8);

  const inputRef = useRef<GainNode | null>(null);
  const pannerRef = useRef<StereoPannerNode | null>(null);
  const lfoRef = useRef<OscillatorNode | null>(null);
  const lfoGainRef = useRef<GainNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<OscillatorNode | null>(null);
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);

  /*
   * Graph:
   *  source → input → StereoPannerNode → analyser → masterGain
   *  LFO → lfoGain → StereoPannerNode.pan
   */
  useEffect(() => {
    if (!ctx || !masterGain) return;

    const input = ctx.createGain();
    input.gain.value = 1;

    const panner = ctx.createStereoPanner();
    panner.pan.value = 0;

    const lfo = ctx.createOscillator();
    lfo.type = "sine";
    lfo.frequency.value = rate;

    const lfoGain = ctx.createGain();
    lfoGain.gain.value = depth;

    const an = ctx.createAnalyser();
    an.fftSize = 2048;

    input.connect(panner);
    panner.connect(an);
    an.connect(masterGain);

    lfo.connect(lfoGain);
    lfoGain.connect(panner.pan);
    lfo.start();

    inputRef.current = input;
    pannerRef.current = panner;
    lfoRef.current = lfo;
    lfoGainRef.current = lfoGain;
    analyserRef.current = an;
    queueMicrotask(() => setAnalyser(an));

    return () => {
      lfo.stop();
      lfo.disconnect();
      lfoGain.disconnect();
      input.disconnect();
      panner.disconnect();
      an.disconnect();
    };
  }, [ctx, masterGain]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (lfoRef.current) lfoRef.current.frequency.value = rate;
  }, [rate]);

  useEffect(() => {
    if (lfoGainRef.current) lfoGainRef.current.gain.value = depth;
  }, [depth]);

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
    osc.connect(inputRef.current!);
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
      title="Stereo Auto-Pan"
      description="LFO-driven automatic stereo panning using StereoPannerNode. The sound image moves smoothly between left and right channels at a controllable rate and depth."
      nodes={["StereoPannerNode", "OscillatorNode (LFO)", "GainNode"]}
    >
      <Waveform analyser={analyser} />

      <Slider
        label="Rate"
        min={0.1}
        max={10}
        step={0.1}
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

      <Toggle
        label={playing ? "Stop" : "Play Sawtooth 220 Hz"}
        value={playing}
        onChange={togglePlay}
      />
    </DemoShell>
  );
}
