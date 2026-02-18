import { useCallback, useEffect, useRef, useState } from "react";
import { useAudioContext } from "../../hooks/useAudioContext";
import { DemoShell } from "../../components/DemoShell";
import { Toggle } from "../../components/Toggle";
import { Waveform } from "../../components/Waveform";
import { Spectrum } from "../../components/Spectrum";

export default function Oscilloscope() {
  const { ctx, resume, masterGain } = useAudioContext();
  const [playing, setPlaying] = useState(false);
  const [waveType, setWaveType] = useState<OscillatorType>("sine");
  const [freq, setFreq] = useState(440);

  const analyserRef = useRef<AnalyserNode | null>(null);
  const oscRef = useRef<OscillatorNode | null>(null);
  const gainRef = useRef<GainNode | null>(null);
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);

  useEffect(() => {
    if (!ctx || !masterGain) return;
    const an = ctx.createAnalyser();
    an.fftSize = 4096;
    an.smoothingTimeConstant = 0.5;
    const g = ctx.createGain();
    g.gain.value = 0.3;
    g.connect(an);
    an.connect(masterGain);
    analyserRef.current = an;
    gainRef.current = g;
    queueMicrotask(() => setAnalyser(an));
    return () => {
      an.disconnect();
      g.disconnect();
    };
  }, [ctx, masterGain]);

  /* Update oscillator params live */
  useEffect(() => {
    if (oscRef.current) {
      oscRef.current.type = waveType;
      oscRef.current.frequency.value = freq;
    }
  }, [waveType, freq]);

  const togglePlay = useCallback(async () => {
    await resume();
    if (!ctx) return;
    if (playing) {
      try {
        oscRef.current?.stop();
      } catch {
        /* ok */
      }
      oscRef.current = null;
      setPlaying(false);
      return;
    }
    const osc = ctx.createOscillator();
    osc.type = waveType;
    osc.frequency.value = freq;
    osc.connect(gainRef.current || ctx.destination);
    osc.start();
    oscRef.current = osc;
    setPlaying(true);
  }, [ctx, resume, playing, waveType, freq]);

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
      title="Oscilloscope"
      description="Real-time waveform and spectrum visualization using AnalyserNode. Displays both time-domain (oscilloscope) and frequency-domain (spectrum) representations of the audio signal."
      nodes={["AnalyserNode", "OscillatorNode", "GainNode"]}
    >
      {/* Waveform display */}
      <div>
        <h3 className="text-text-muted mb-1 text-xs font-medium">
          Time Domain (Waveform)
        </h3>
        <Waveform analyser={analyser} height={180} />
      </div>

      {/* Spectrum display */}
      <div>
        <h3 className="text-text-muted mb-1 text-xs font-medium">
          Frequency Domain (Spectrum)
        </h3>
        <Spectrum analyser={analyser} height={180} barColor="rainbow" />
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-4">
        <Toggle
          label={playing ? "Stop" : "Play"}
          value={playing}
          onChange={togglePlay}
        />

        <div className="flex gap-2">
          {(["sine", "square", "sawtooth", "triangle"] as OscillatorType[]).map(
            (t) => (
              <button
                key={t}
                onClick={() => setWaveType(t)}
                className={`rounded-md border px-3 py-1 text-xs capitalize ${
                  waveType === t
                    ? "border-accent bg-accent/20 text-accent"
                    : "border-border text-text-muted"
                }`}
              >
                {t}
              </button>
            ),
          )}
        </div>

        <div className="flex items-center gap-2">
          <label className="text-text-muted text-xs">Freq:</label>
          <input
            type="range"
            min={55}
            max={4000}
            value={freq}
            onChange={(e) => setFreq(parseFloat(e.target.value))}
            className="accent-accent w-32"
          />
          <span className="text-text text-xs tabular-nums">{freq} Hz</span>
        </div>
      </div>
    </DemoShell>
  );
}
