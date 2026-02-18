import { useCallback, useEffect, useRef, useState } from "react";
import { useAudioContext } from "../../hooks/useAudioContext";
import { DemoShell } from "../../components/DemoShell";
import { Slider } from "../../components/Slider";
import { Toggle } from "../../components/Toggle";
import { Waveform } from "../../components/Waveform";

/**
 * Granular Freeze — captures a buffer and "freezes" at a fixed position,
 * continuously re-triggering tiny overlapping grains to create a sustained
 * pad-like texture. Unlike GranularSynth, position is fixed and grains
 * overlap heavily for a drone/pad effect.
 */

async function createSourceBuffer(ctx: AudioContext): Promise<AudioBuffer> {
  const duration = 2;
  const offline = new OfflineAudioContext(
    1,
    ctx.sampleRate * duration,
    ctx.sampleRate,
  );
  const osc = offline.createOscillator();
  osc.type = "sawtooth";
  osc.frequency.value = 220;
  osc.connect(offline.destination);
  osc.start();
  osc.stop(duration);
  return offline.startRendering();
}

function hanningWindow(length: number): Float32Array {
  const win = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    win[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (length - 1)));
  }
  return win;
}

export default function GranularFreeze() {
  const { ctx, resume, masterGain } = useAudioContext();

  const [playing, setPlaying] = useState(false);
  const [freezePos, setFreezePos] = useState(0.3);
  const [grainSize, setGrainSize] = useState(40);
  const [density, setDensity] = useState(20);
  const [pitchShift, setPitchShift] = useState(1.0);
  const [spread, setSpread] = useState(0.02);
  const [volume, setVolume] = useState(0.5);

  const sourceBufferRef = useRef<AudioBuffer | null>(null);
  const gainRef = useRef<GainNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const paramsRef = useRef({
    freezePos,
    grainSize,
    density,
    pitchShift,
    spread,
    volume,
  });
  paramsRef.current = {
    freezePos,
    grainSize,
    density,
    pitchShift,
    spread,
    volume,
  };

  /* Static graph: gain -> analyser -> master */
  useEffect(() => {
    if (!ctx || !masterGain) return;
    const g = ctx.createGain();
    g.gain.value = volume;
    const an = ctx.createAnalyser();
    an.fftSize = 4096;
    g.connect(an);
    an.connect(masterGain);
    gainRef.current = g;
    analyserRef.current = an;
    setAnalyser(an);

    createSourceBuffer(ctx).then((buf) => {
      sourceBufferRef.current = buf;
    });

    return () => {
      g.disconnect();
      an.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx, masterGain]);

  useEffect(() => {
    if (gainRef.current) gainRef.current.gain.value = volume;
  }, [volume]);

  /** Spawn a single grain at the frozen position */
  const spawnGrain = useCallback(() => {
    if (!ctx || !gainRef.current || !sourceBufferRef.current) return;

    const p = paramsRef.current;
    const buf = sourceBufferRef.current;
    const grainDur = p.grainSize / 1000;

    /* Fixed position with tiny spread randomization */
    const maxStart = Math.max(0, buf.duration - grainDur);
    let startPos = p.freezePos * maxStart;
    startPos += (Math.random() - 0.5) * p.spread * maxStart;
    startPos = Math.max(0, Math.min(startPos, maxStart));

    const rate = Math.max(0.1, p.pitchShift);

    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = rate;

    const env = ctx.createGain();
    env.gain.value = 0;
    const winLen = Math.max(Math.round(grainDur * ctx.sampleRate), 4);
    const win = hanningWindow(winLen);

    src.connect(env);
    env.connect(gainRef.current);

    const now = ctx.currentTime;
    try {
      env.gain.setValueCurveAtTime(win, now, grainDur);
    } catch {
      env.gain.setValueAtTime(0, now);
      env.gain.linearRampToValueAtTime(1, now + grainDur * 0.5);
      env.gain.linearRampToValueAtTime(0, now + grainDur);
    }

    src.start(now, startPos, grainDur);
    src.stop(now + grainDur + 0.01);

    src.onended = () => {
      src.disconnect();
      env.disconnect();
    };
  }, [ctx]);

  /* Grain scheduler */
  useEffect(() => {
    if (!playing) {
      if (timerRef.current !== null) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      return;
    }

    const intervalMs = 1000 / paramsRef.current.density;
    timerRef.current = setInterval(() => {
      spawnGrain();
    }, intervalMs);

    return () => {
      if (timerRef.current !== null) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [playing, spawnGrain]);

  /* Re-schedule when density changes */
  useEffect(() => {
    if (!playing || timerRef.current === null) return;
    clearInterval(timerRef.current);
    const intervalMs = 1000 / density;
    timerRef.current = setInterval(() => {
      spawnGrain();
    }, intervalMs);
  }, [density, playing, spawnGrain]);

  const handleToggle = async (on: boolean) => {
    if (on) await resume();
    setPlaying(on);
  };

  return (
    <DemoShell
      title="Granular Freeze"
      description="Spectral freeze effect: a source buffer is generated, then 'frozen' at a fixed position by continuously re-triggering tiny overlapping grains. The result is a sustained, pad-like texture with harmonic content from the freeze point."
      nodes={[
        "AudioBufferSourceNode (x many)",
        "GainNode (grain envelope)",
        "AnalyserNode",
      ]}
    >
      {/* Controls */}
      <div className="bg-surface rounded-lg border border-white/5 p-4">
        <h2 className="text-text mb-3 text-sm font-semibold">Controls</h2>

        <div className="mb-4">
          <Toggle label="Freeze" value={playing} onChange={handleToggle} />
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {/* Position */}
          <div>
            <h3 className="text-text-muted mb-2 text-xs font-medium">
              Freeze Position
            </h3>
            <Slider
              label="Position"
              min={0}
              max={1}
              step={0.01}
              value={freezePos}
              onChange={setFreezePos}
            />
            <div className="mt-2">
              <Slider
                label="Spread"
                min={0}
                max={0.1}
                step={0.001}
                value={spread}
                onChange={setSpread}
              />
            </div>
          </div>

          {/* Grain params */}
          <div>
            <h3 className="text-text-muted mb-2 text-xs font-medium">Grain</h3>
            <Slider
              label="Size"
              min={5}
              max={100}
              step={1}
              value={grainSize}
              onChange={setGrainSize}
              unit="ms"
            />
            <div className="mt-2">
              <Slider
                label="Density"
                min={5}
                max={40}
                step={1}
                value={density}
                onChange={setDensity}
                unit="/s"
              />
            </div>
          </div>

          {/* Pitch */}
          <div>
            <h3 className="text-text-muted mb-2 text-xs font-medium">Pitch</h3>
            <Slider
              label="Shift"
              min={0.5}
              max={2.0}
              step={0.01}
              value={pitchShift}
              onChange={setPitchShift}
              unit="x"
            />
          </div>
        </div>

        <div className="mt-4 max-w-xs">
          <Slider
            label="Volume"
            min={0}
            max={1}
            step={0.01}
            value={volume}
            onChange={setVolume}
          />
        </div>
      </div>

      {/* Waveform */}
      <div className="bg-surface rounded-lg border border-white/5 p-4">
        <Waveform analyser={analyser} />
      </div>
    </DemoShell>
  );
}
