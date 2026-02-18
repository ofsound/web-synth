import { useCallback, useEffect, useRef, useState } from "react";
import { useAudioContext } from "../../hooks/useAudioContext";
import { DemoShell } from "../../components/DemoShell";
import { Slider } from "../../components/Slider";
import { Toggle } from "../../components/Toggle";
import { Waveform } from "../../components/Waveform";

export default function PingPongDelay() {
  const { ctx, resume, masterGain } = useAudioContext();
  const [playing, setPlaying] = useState(false);

  const [delayTime, setDelayTime] = useState(0.3);
  const [feedback, setFeedback] = useState(0.5);
  const [spread, setSpread] = useState(1);
  const [mix, setMix] = useState(0.5);

  const inputRef = useRef<GainNode | null>(null);
  const delayLRef = useRef<DelayNode | null>(null);
  const delayRRef = useRef<DelayNode | null>(null);
  const fbRef = useRef<GainNode | null>(null);
  const panLRef = useRef<StereoPannerNode | null>(null);
  const panRRef = useRef<StereoPannerNode | null>(null);
  const dryRef = useRef<GainNode | null>(null);
  const wetRef = useRef<GainNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<OscillatorNode | null>(null);
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);

  /*
   * Graph:
   *  source → input → dryGain ───────────────────→ analyser → master
   *                 → delayL → panL(-spread) ─────→ wetGain → analyser
   *                   delayL → delayR → panR(+spread) → wetGain
   *                            delayR → fbGain → delayL  (feedback loop)
   */
  useEffect(() => {
    if (!ctx || !masterGain) return;

    const input = ctx.createGain();
    const dry = ctx.createGain();
    dry.gain.value = 1 - mix;
    const wet = ctx.createGain();
    wet.gain.value = mix;

    const delayL = ctx.createDelay(2);
    delayL.delayTime.value = delayTime;
    const delayR = ctx.createDelay(2);
    delayR.delayTime.value = delayTime;

    const fb = ctx.createGain();
    fb.gain.value = feedback;

    const panL = ctx.createStereoPanner();
    panL.pan.value = -spread;
    const panR = ctx.createStereoPanner();
    panR.pan.value = spread;

    const an = ctx.createAnalyser();
    an.fftSize = 2048;

    // Dry path
    input.connect(dry);
    dry.connect(an);

    // Ping-pong path
    input.connect(delayL);
    delayL.connect(panL);
    panL.connect(wet);

    delayL.connect(delayR);
    delayR.connect(panR);
    panR.connect(wet);

    delayR.connect(fb);
    fb.connect(delayL); // feedback loop

    wet.connect(an);
    an.connect(masterGain);

    inputRef.current = input;
    delayLRef.current = delayL;
    delayRRef.current = delayR;
    fbRef.current = fb;
    panLRef.current = panL;
    panRRef.current = panR;
    dryRef.current = dry;
    wetRef.current = wet;
    analyserRef.current = an;
    queueMicrotask(() => setAnalyser(an));

    return () => {
      input.disconnect();
      dry.disconnect();
      wet.disconnect();
      delayL.disconnect();
      delayR.disconnect();
      fb.disconnect();
      panL.disconnect();
      panR.disconnect();
      an.disconnect();
    };
  }, [ctx, masterGain]); // eslint-disable-line react-hooks/exhaustive-deps

  /* Live-update params */
  useEffect(() => {
    if (delayLRef.current) delayLRef.current.delayTime.value = delayTime;
    if (delayRRef.current) delayRRef.current.delayTime.value = delayTime;
  }, [delayTime]);

  useEffect(() => {
    if (fbRef.current) fbRef.current.gain.value = feedback;
  }, [feedback]);

  useEffect(() => {
    if (panLRef.current) panLRef.current.pan.value = -spread;
    if (panRRef.current) panRRef.current.pan.value = spread;
  }, [spread]);

  useEffect(() => {
    if (dryRef.current) dryRef.current.gain.value = 1 - mix;
    if (wetRef.current) wetRef.current.gain.value = mix;
  }, [mix]);

  /* Play / Stop oscillator */
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
    osc.frequency.value = 330;
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
      title="Ping-Pong Delay"
      description="Stereo ping-pong delay using two cross-fed DelayNodes panned hard left and right via StereoPannerNode. Each repeat alternates between stereo channels, creating a bouncing spatial effect."
      nodes={[
        "DelayNode ×2",
        "StereoPannerNode ×2",
        "GainNode ×3",
        "AnalyserNode",
      ]}
    >
      <Waveform analyser={analyser} />

      <Slider
        label="Delay Time"
        min={0.1}
        max={1}
        step={0.01}
        value={delayTime}
        onChange={setDelayTime}
        unit="s"
      />
      <Slider
        label="Feedback"
        min={0}
        max={0.9}
        step={0.01}
        value={feedback}
        onChange={setFeedback}
      />
      <Slider
        label="Spread"
        min={0}
        max={1}
        step={0.01}
        value={spread}
        onChange={setSpread}
      />
      <Slider
        label="Dry / Wet"
        min={0}
        max={1}
        step={0.01}
        value={mix}
        onChange={setMix}
      />

      <Toggle
        label={playing ? "Stop" : "Play Sawtooth 330 Hz"}
        value={playing}
        onChange={togglePlay}
      />
    </DemoShell>
  );
}
