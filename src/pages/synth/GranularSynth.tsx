import { useCallback, useEffect, useRef, useState } from "react";
import { useAudioContext } from "../../hooks/useAudioContext";
import { DemoShell } from "../../components/DemoShell";
import { Slider } from "../../components/Slider";
import { Toggle } from "../../components/Toggle";
import { Waveform } from "../../components/Waveform";

/**
 * Granular Synth — plays many tiny overlapping "grains" from a source buffer.
 *
 * Each grain is an AudioBufferSourceNode with a Hanning-window amplitude envelope
 * applied via GainNode.setValueCurveAtTime. Grains are scheduled on a periodic timer.
 */

/** Generate a 2-second tonal source buffer (sawtooth via OfflineAudioContext) */
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

/** Pre-compute a Hanning window (Float32Array) of given length */
function hanningWindow(length: number): Float32Array {
  const win = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    win[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (length - 1)));
  }
  return win;
}

export default function GranularSynth() {
  const { ctx, resume, masterGain } = useAudioContext();

  const [playing, setPlaying] = useState(false);
  const [grainSize, setGrainSize] = useState(60); // ms
  const [density, setDensity] = useState(15); // grains/sec
  const [pitch, setPitch] = useState(1);
  const [pitchRand, setPitchRand] = useState(0.05);
  const [position, setPosition] = useState(0.25);
  const [posRand, setPosRand] = useState(0.1);
  const [volume, setVolume] = useState(0.5);

  const sourceBufferRef = useRef<AudioBuffer | null>(null);
  const gainRef = useRef<GainNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  /* Keep latest param values accessible in the grain scheduler */
  const paramsRef = useRef({
    grainSize,
    density,
    pitch,
    pitchRand,
    position,
    posRand,
    volume,
  });

  useEffect(() => {
    paramsRef.current = {
      grainSize,
      density,
      pitch,
      pitchRand,
      position,
      posRand,
      volume,
    };
  }, [grainSize, density, pitch, pitchRand, position, posRand, volume]);

  /* Static graph: gain → analyser → master */
  useEffect(() => {
    if (!ctx || !masterGain) return;
    const g = ctx.createGain();
    g.gain.value = paramsRef.current.volume;
    const an = ctx.createAnalyser();
    an.fftSize = 4096;
    g.connect(an);
    an.connect(masterGain);
    gainRef.current = g;
    analyserRef.current = an;
    queueMicrotask(() => setAnalyser(an));

    /* Pre-generate source buffer */
    createSourceBuffer(ctx).then((buf) => {
      sourceBufferRef.current = buf;
    });

    return () => {
      g.disconnect();
      an.disconnect();
    };
  }, [ctx, masterGain]);

  /* Live volume  */
  useEffect(() => {
    if (gainRef.current) gainRef.current.gain.value = volume;
  }, [volume]);

  /** Spawn a single grain */
  const spawnGrain = useCallback(() => {
    if (!ctx || !gainRef.current || !sourceBufferRef.current) return;

    const p = paramsRef.current;
    const buf = sourceBufferRef.current;
    const grainDur = p.grainSize / 1000; // seconds

    /* Pick start position with randomisation */
    const maxStart = Math.max(0, buf.duration - grainDur);
    let startPos = p.position * maxStart;
    startPos += (Math.random() - 0.5) * p.posRand * maxStart;
    startPos = Math.max(0, Math.min(startPos, maxStart));

    /* Pick playback rate with randomisation */
    let rate = p.pitch;
    rate += (Math.random() - 0.5) * 2 * p.pitchRand;
    rate = Math.max(0.1, rate);

    /* Create source */
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = rate;

    /* Hanning envelope via GainNode + setValueCurveAtTime */
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
      /* fallback: simple linear envelope */
      env.gain.setValueAtTime(0, now);
      env.gain.linearRampToValueAtTime(1, now + grainDur * 0.5);
      env.gain.linearRampToValueAtTime(0, now + grainDur);
    }

    src.start(now, startPos, grainDur);
    src.stop(now + grainDur + 0.01);

    /* Cleanup once done */
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

    const scheduleGrains = () => {
      const intervalMs = 1000 / paramsRef.current.density;
      if (timerRef.current !== null) clearInterval(timerRef.current);
      timerRef.current = setInterval(() => {
        spawnGrain();
      }, intervalMs);
    };

    scheduleGrains();

    return () => {
      if (timerRef.current !== null) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [playing, spawnGrain]);

  /* Re-schedule when density changes so interval updates */
  useEffect(() => {
    if (!playing || timerRef.current === null) return;
    const intervalMs = 1000 / density;
    clearInterval(timerRef.current);
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
      title="Granular Synth"
      description="Granular synthesis: a source buffer is sliced into tiny overlapping grains (10–200 ms) with independent control over position, size, density, pitch, and randomization."
      nodes={[
        "AudioBufferSourceNode (×many)",
        "GainNode (grain envelope)",
        "OfflineAudioContext",
      ]}
    >
      {/* Controls */}
      <div className="bg-surface rounded-lg border border-white/5 p-4">
        <h2 className="text-text mb-3 text-sm font-semibold">Controls</h2>

        <div className="mb-4">
          <Toggle label="Play" value={playing} onChange={handleToggle} />
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {/* Grain params */}
          <div>
            <h3 className="text-text-muted mb-2 text-xs font-medium">Grain</h3>
            <Slider
              label="Size"
              min={10}
              max={200}
              step={1}
              value={grainSize}
              onChange={setGrainSize}
              unit="ms"
            />
            <div className="mt-2">
              <Slider
                label="Density"
                min={1}
                max={50}
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
              label="Rate"
              min={0.5}
              max={2}
              step={0.01}
              value={pitch}
              onChange={setPitch}
              unit="×"
            />
            <div className="mt-2">
              <Slider
                label="Randomize"
                min={0}
                max={1}
                step={0.01}
                value={pitchRand}
                onChange={setPitchRand}
              />
            </div>
          </div>

          {/* Position */}
          <div>
            <h3 className="text-text-muted mb-2 text-xs font-medium">
              Position
            </h3>
            <Slider
              label="Offset"
              min={0}
              max={1}
              step={0.01}
              value={position}
              onChange={setPosition}
            />
            <div className="mt-2">
              <Slider
                label="Randomize"
                min={0}
                max={1}
                step={0.01}
                value={posRand}
                onChange={setPosRand}
              />
            </div>
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
