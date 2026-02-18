import { useCallback, useEffect, useRef, useState } from "react";
import { useAudioContext } from "../../hooks/useAudioContext";
import { DemoShell } from "../../components/DemoShell";
import { Slider } from "../../components/Slider";
import { Toggle } from "../../components/Toggle";
import { Waveform } from "../../components/Waveform";
import { generateSyntheticIR } from "../../utils/impulseResponses";

type Effect = "bypass" | "reverb" | "telephone" | "robot";

export default function VocalEffects() {
  const { ctx, resume, masterGain } = useAudioContext();
  const [micActive, setMicActive] = useState(false);
  const [effect, setEffect] = useState<Effect>("bypass");
  const [reverbMix, setReverbMix] = useState(0.5);
  const [robotFreq, setRobotFreq] = useState(50);
  const [error, setError] = useState<string | null>(null);
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);

  const streamRef = useRef<MediaStream | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const nodesRef = useRef<AudioNode[]>([]);
  const dryGainRef = useRef<GainNode | null>(null);
  const wetGainRef = useRef<GainNode | null>(null);
  const robotOscRef = useRef<OscillatorNode | null>(null);

  /* Rebuild effect chain whenever effect or params change */
  const buildChain = useCallback(() => {
    if (!ctx || !masterGain || !sourceRef.current) return;

    /* Disconnect previous chain */
    nodesRef.current.forEach((n) => {
      try {
        n.disconnect();
      } catch {
        /* ok */
      }
    });
    nodesRef.current = [];
    try {
      sourceRef.current.disconnect();
    } catch {
      /* ok */
    }
    try {
      robotOscRef.current?.stop();
    } catch {
      /* ok */
    }
    robotOscRef.current = null;

    const an = ctx.createAnalyser();
    an.fftSize = 2048;
    analyserRef.current = an;
    queueMicrotask(() => setAnalyser(an));

    const nodes: AudioNode[] = [];

    switch (effect) {
      case "bypass": {
        sourceRef.current.connect(an);
        an.connect(masterGain);
        nodes.push(an);
        break;
      }

      case "reverb": {
        const convolver = ctx.createConvolver();
        convolver.buffer = generateSyntheticIR(ctx, 2.5, 1.8);

        const dry = ctx.createGain();
        dry.gain.value = 1 - reverbMix;
        const wet = ctx.createGain();
        wet.gain.value = reverbMix;
        dryGainRef.current = dry;
        wetGainRef.current = wet;

        sourceRef.current.connect(dry);
        sourceRef.current.connect(convolver);
        convolver.connect(wet);
        dry.connect(an);
        wet.connect(an);
        an.connect(masterGain);

        nodes.push(convolver, dry, wet, an);
        break;
      }

      case "telephone": {
        const hp = ctx.createBiquadFilter();
        hp.type = "highpass";
        hp.frequency.value = 300;
        hp.Q.value = 0.7;

        const lp = ctx.createBiquadFilter();
        lp.type = "lowpass";
        lp.frequency.value = 3400;
        lp.Q.value = 0.7;

        sourceRef.current.connect(hp);
        hp.connect(lp);
        lp.connect(an);
        an.connect(masterGain);

        nodes.push(hp, lp, an);
        break;
      }

      case "robot": {
        const ringGain = ctx.createGain();
        ringGain.gain.value = 0;

        const osc = ctx.createOscillator();
        osc.type = "sine";
        osc.frequency.value = robotFreq;
        osc.connect(ringGain.gain);
        osc.start();
        robotOscRef.current = osc;

        sourceRef.current.connect(ringGain);
        ringGain.connect(an);
        an.connect(masterGain);

        nodes.push(ringGain, osc, an);
        break;
      }
    }

    nodesRef.current = nodes;
  }, [ctx, masterGain, effect, reverbMix, robotFreq]);

  /* Rebuild when effect changes */
  useEffect(() => {
    if (micActive) buildChain();
  }, [effect, reverbMix, robotFreq, buildChain, micActive]);

  /* Update reverb mix without full rebuild */
  useEffect(() => {
    if (dryGainRef.current && wetGainRef.current && effect === "reverb") {
      dryGainRef.current.gain.value = 1 - reverbMix;
      wetGainRef.current.gain.value = reverbMix;
    }
  }, [reverbMix, effect]);

  /* Toggle mic */
  const toggleMic = useCallback(async () => {
    await resume();
    if (!ctx || !masterGain) return;

    if (micActive) {
      /* Stop everything */
      try {
        robotOscRef.current?.stop();
      } catch {
        /* ok */
      }
      nodesRef.current.forEach((n) => {
        try {
          n.disconnect();
        } catch {
          /* ok */
        }
      });
      try {
        sourceRef.current?.disconnect();
      } catch {
        /* ok */
      }
      nodesRef.current = [];
      sourceRef.current = null;

      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      setAnalyser(null);
      setMicActive(false);
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const source = ctx.createMediaStreamSource(stream);
      sourceRef.current = source;
      setMicActive(true);
      setError(null);
    } catch (err) {
      setError(
        err instanceof DOMException && err.name === "NotAllowedError"
          ? "Microphone permission denied. Please allow access in your browser settings."
          : "Could not access microphone. Check that a mic is connected.",
      );
    }
  }, [ctx, resume, masterGain, micActive]);

  /* Cleanup on unmount */
  useEffect(() => {
    return () => {
      try {
        robotOscRef.current?.stop();
      } catch {
        /* ok */
      }
      nodesRef.current.forEach((n) => {
        try {
          n.disconnect();
        } catch {
          /* ok */
        }
      });
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const effects: { id: Effect; label: string }[] = [
    { id: "bypass", label: "Bypass" },
    { id: "reverb", label: "Reverb" },
    { id: "telephone", label: "Telephone" },
    { id: "robot", label: "Robot" },
  ];

  return (
    <DemoShell
      title="Vocal Effects Chain"
      description="Live microphone input processed through selectable effects: reverb (ConvolverNode with synthetic impulse response), telephone filter (bandpass 300–3400 Hz), and robot voice (ring modulation). Requires microphone permission."
      nodes={[
        "MediaStreamSourceNode",
        "BiquadFilterNode",
        "ConvolverNode",
        "GainNode",
      ]}
    >
      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">
          {error}
        </div>
      )}

      <div className="bg-surface-alt border-border space-y-4 rounded-lg border p-4">
        <button
          onClick={toggleMic}
          className={`rounded-lg px-5 py-2 text-sm font-medium transition ${
            micActive
              ? "border border-red-500 bg-red-500/20 text-red-400"
              : "bg-accent/20 text-accent border-accent border"
          }`}
        >
          {micActive ? "Stop Microphone" : "Start Microphone"}
        </button>

        <div className="flex flex-wrap gap-2">
          {effects.map((e) => (
            <Toggle
              key={e.id}
              label={e.label}
              value={effect === e.id}
              onChange={() => setEffect(e.id)}
            />
          ))}
        </div>

        {effect === "reverb" && (
          <Slider
            label="Reverb Mix"
            min={0}
            max={1}
            step={0.01}
            value={reverbMix}
            onChange={setReverbMix}
          />
        )}

        {effect === "robot" && (
          <Slider
            label="Carrier Freq"
            min={20}
            max={200}
            step={1}
            value={robotFreq}
            onChange={setRobotFreq}
            unit=" Hz"
          />
        )}
      </div>

      <Waveform analyser={analyser} />
    </DemoShell>
  );
}
