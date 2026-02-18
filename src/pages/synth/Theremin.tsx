import { useCallback, useEffect, useRef, useState } from "react";
import { useAudioContext } from "../../hooks/useAudioContext";
import { DemoShell } from "../../components/DemoShell";
import { Slider } from "../../components/Slider";
import { Toggle } from "../../components/Toggle";
import { XYPad } from "../../components/XYPad";
import { Waveform } from "../../components/Waveform";
import { freqToMidi, midiToNoteName } from "../../utils/midiUtils";

type ThereminWave = "sine" | "triangle";

export default function Theremin() {
  const { ctx, resume, masterGain } = useAudioContext();

  const [waveform, setWaveform] = useState<ThereminWave>("sine");
  const [vibrato, setVibrato] = useState(false);
  const [vibratoRate, setVibratoRate] = useState(5);
  const [vibratoDepth, setVibratoDepth] = useState(8);
  const [currentFreq, setCurrentFreq] = useState(440);
  const [currentVol, setCurrentVol] = useState(0);
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);
  const [active, setActive] = useState(false);

  const oscRef = useRef<OscillatorNode | null>(null);
  const gainRef = useRef<GainNode | null>(null);
  const lfoRef = useRef<OscillatorNode | null>(null);
  const lfoGainRef = useRef<GainNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);

  /* Create persistent audio graph */
  useEffect(() => {
    if (!ctx || !masterGain) return;

    const an = ctx.createAnalyser();
    an.fftSize = 2048;
    an.connect(masterGain);
    analyserRef.current = an;
    setAnalyser(an);

    /* Main oscillator */
    const osc = ctx.createOscillator();
    osc.type = waveform;
    osc.frequency.setValueAtTime(440, ctx.currentTime);
    oscRef.current = osc;

    /* Volume gain */
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, ctx.currentTime);
    gainRef.current = gain;

    /* Vibrato LFO */
    const lfo = ctx.createOscillator();
    lfo.type = "sine";
    lfo.frequency.setValueAtTime(vibratoRate, ctx.currentTime);
    lfoRef.current = lfo;

    const lfoGain = ctx.createGain();
    lfoGain.gain.setValueAtTime(0, ctx.currentTime);
    lfoGainRef.current = lfoGain;

    lfo.connect(lfoGain).connect(osc.frequency);
    osc.connect(gain).connect(an);

    osc.start();
    lfo.start();

    return () => {
      osc.stop();
      lfo.stop();
      osc.disconnect();
      lfo.disconnect();
      lfoGain.disconnect();
      gain.disconnect();
      an.disconnect();
      oscRef.current = null;
      gainRef.current = null;
      lfoRef.current = null;
      lfoGainRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx, masterGain]);

  /* Update waveform */
  useEffect(() => {
    if (oscRef.current) oscRef.current.type = waveform;
  }, [waveform]);

  /* Update vibrato params */
  useEffect(() => {
    if (!ctx) return;
    if (lfoRef.current) {
      lfoRef.current.frequency.setTargetAtTime(
        vibratoRate,
        ctx.currentTime,
        0.02,
      );
    }
    if (lfoGainRef.current) {
      lfoGainRef.current.gain.setTargetAtTime(
        vibrato ? vibratoDepth : 0,
        ctx.currentTime,
        0.02,
      );
    }
  }, [ctx, vibrato, vibratoRate, vibratoDepth]);

  /* XYPad movement => frequency + volume */
  const handleMove = useCallback(
    async (x: number, y: number) => {
      await resume();
      if (!ctx || !oscRef.current || !gainRef.current) return;

      /* Logarithmic frequency mapping: 200–2000 Hz */
      const minLog = Math.log(200);
      const maxLog = Math.log(2000);
      const freq = Math.exp(minLog + x * (maxLog - minLog));

      const vol = y * 0.5;

      oscRef.current.frequency.setTargetAtTime(freq, ctx.currentTime, 0.01);
      gainRef.current.gain.setTargetAtTime(vol, ctx.currentTime, 0.01);

      setCurrentFreq(freq);
      setCurrentVol(vol);
      setActive(true);
    },
    [ctx, resume],
  );

  const waveforms: ThereminWave[] = ["sine", "triangle"];
  const midi = freqToMidi(currentFreq);
  const noteName = midiToNoteName(Math.round(midi));
  const cents = Math.round((midi - Math.round(midi)) * 100);

  return (
    <DemoShell
      title="Theremin"
      description="Virtual theremin controlled by the XY pad. X-axis maps to pitch (200–2000 Hz logarithmic), Y-axis maps to volume."
      nodes={["OscillatorNode", "GainNode"]}
    >
      <div className="flex flex-col gap-4 lg:flex-row">
        {/* XYPad */}
        <div className="bg-surface-alt flex-1 rounded-lg p-4">
          <XYPad
            width={360}
            height={360}
            onMove={handleMove}
            labelX="Pitch"
            labelY="Volume"
          />
        </div>

        {/* Controls + Info */}
        <div className="bg-surface-alt flex flex-col gap-4 rounded-lg p-4 lg:w-64">
          {/* Frequency display */}
          <div className="text-center">
            {active && (
              <div className="text-accent mb-1 text-xs font-semibold tracking-wide uppercase">
                Playing
              </div>
            )}
            <div className="text-accent text-3xl font-bold tabular-nums">
              {currentFreq.toFixed(1)}{" "}
              <span className="text-text-muted text-sm">Hz</span>
            </div>
            <div className="text-text-muted text-sm">
              {noteName}{" "}
              <span className="text-[10px]">
                {cents >= 0 ? "+" : ""}
                {cents}¢
              </span>
            </div>
            <div className="text-text-muted mt-1 text-xs">
              Vol: {(currentVol * 200).toFixed(0)}%
            </div>
          </div>

          <hr className="border-border" />

          {/* Waveform selector */}
          <div>
            <label className="text-text-muted mb-1 block text-xs">
              Waveform
            </label>
            <div className="flex gap-2">
              {waveforms.map((w) => (
                <button
                  key={w}
                  onClick={() => setWaveform(w)}
                  className={`rounded px-3 py-1 text-xs font-medium transition ${
                    waveform === w
                      ? "bg-accent text-white"
                      : "bg-surface text-text-muted border-border border"
                  }`}
                >
                  {w}
                </button>
              ))}
            </div>
          </div>

          {/* Vibrato */}
          <Toggle label="Vibrato" value={vibrato} onChange={setVibrato} />
          {vibrato && (
            <>
              <Slider
                label="Rate"
                min={1}
                max={12}
                step={0.5}
                value={vibratoRate}
                onChange={setVibratoRate}
                unit=" Hz"
              />
              <Slider
                label="Depth"
                min={1}
                max={30}
                step={1}
                value={vibratoDepth}
                onChange={setVibratoDepth}
                unit=" Hz"
              />
            </>
          )}
        </div>
      </div>

      {/* Waveform visualization */}
      <div className="bg-surface-alt rounded-lg p-4">
        <Waveform analyser={analyser} />
      </div>
    </DemoShell>
  );
}
