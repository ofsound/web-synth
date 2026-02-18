import { useCallback, useEffect, useRef, useState } from "react";
import { useAudioContext } from "../../hooks/useAudioContext";
import { DemoShell } from "../../components/DemoShell";
import { Slider } from "../../components/Slider";
import { Toggle } from "../../components/Toggle";
import { Waveform } from "../../components/Waveform";
import { XYPad } from "../../components/XYPad";

type DistanceModel = "linear" | "inverse" | "exponential";

export default function SpatialAudio() {
  const { ctx, resume, masterGain } = useAudioContext();
  const [playing, setPlaying] = useState(false);

  const [hrtf, setHrtf] = useState(true);
  const [distanceModel, setDistanceModel] = useState<DistanceModel>("inverse");
  const [refDistance, setRefDistance] = useState(1);
  const [maxDistance, setMaxDistance] = useState(100);
  const [rolloff, setRolloff] = useState(1);

  const pannerRef = useRef<PannerNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<OscillatorNode | null>(null);
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);

  /*
   * Graph:
   *  source → PannerNode → analyser → masterGain
   *  XY pad controls positionX (left/right) and positionZ (front/back)
   */
  useEffect(() => {
    if (!ctx || !masterGain) return;

    const panner = ctx.createPanner();
    panner.panningModel = hrtf ? "HRTF" : "equalpower";
    panner.distanceModel = distanceModel;
    panner.refDistance = refDistance;
    panner.maxDistance = maxDistance;
    panner.rolloffFactor = rolloff;
    panner.positionX.value = 0;
    panner.positionY.value = 0;
    panner.positionZ.value = 0;

    const an = ctx.createAnalyser();
    an.fftSize = 2048;

    panner.connect(an);
    an.connect(masterGain);

    pannerRef.current = panner;
    analyserRef.current = an;
    queueMicrotask(() => setAnalyser(an));

    return () => {
      panner.disconnect();
      an.disconnect();
    };
  }, [ctx, masterGain]); // eslint-disable-line react-hooks/exhaustive-deps

  /* Live-update panner properties */
  useEffect(() => {
    if (!pannerRef.current) return;
    pannerRef.current.panningModel = hrtf ? "HRTF" : "equalpower";
  }, [hrtf]);

  useEffect(() => {
    if (!pannerRef.current) return;
    pannerRef.current.distanceModel = distanceModel;
  }, [distanceModel]);

  useEffect(() => {
    if (!pannerRef.current) return;
    pannerRef.current.refDistance = refDistance;
  }, [refDistance]);

  useEffect(() => {
    if (!pannerRef.current) return;
    pannerRef.current.maxDistance = maxDistance;
  }, [maxDistance]);

  useEffect(() => {
    if (!pannerRef.current) return;
    pannerRef.current.rolloffFactor = rolloff;
  }, [rolloff]);

  /* XY pad handler: x → positionX (-10..10), y → positionZ (-10..10) */
  const handlePadMove = useCallback((x: number, y: number) => {
    if (!pannerRef.current) return;
    pannerRef.current.positionX.value = (x - 0.5) * 20; // -10..10
    pannerRef.current.positionZ.value = (0.5 - y) * 20; // -10..10 (y inverted)
  }, []);

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
    osc.type = "sine";
    osc.frequency.value = 440;
    osc.connect(pannerRef.current!);
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

  const distanceModels: DistanceModel[] = ["linear", "inverse", "exponential"];

  return (
    <DemoShell
      title="3D Spatial Audio"
      description="Positional 3D audio using PannerNode. Use the XY pad to move the sound source in space — X controls left/right position, Y controls front/back (Z-axis). Switch between HRTF and equalpower panning models."
      nodes={["PannerNode", "OscillatorNode"]}
    >
      <div className="flex flex-wrap gap-6">
        <div>
          <p className="text-text-muted mb-2 text-xs">
            Drag to position sound (X: left/right, Y: front/back)
          </p>
          <XYPad
            width={280}
            height={280}
            onMove={handlePadMove}
            labelX="Position X"
            labelY="Position Z"
          />
        </div>
        <div className="flex flex-1 flex-col gap-3">
          <Waveform analyser={analyser} width={400} height={120} />

          {/* Panning model toggle */}
          <Toggle
            label={hrtf ? "HRTF (realistic)" : "Equalpower (simple)"}
            value={hrtf}
            onChange={setHrtf}
          />

          {/* Distance model selector */}
          <div className="flex items-center gap-2">
            <span className="text-text-muted text-xs">Distance model:</span>
            {distanceModels.map((m) => (
              <button
                key={m}
                onClick={() => setDistanceModel(m)}
                className={`rounded border px-3 py-1 text-[11px] capitalize ${
                  distanceModel === m
                    ? "border-accent text-accent"
                    : "border-border text-text-muted"
                }`}
              >
                {m}
              </button>
            ))}
          </div>

          <Slider
            label="Ref Distance"
            min={0.1}
            max={20}
            step={0.1}
            value={refDistance}
            onChange={setRefDistance}
          />
          <Slider
            label="Max Distance"
            min={10}
            max={500}
            step={10}
            value={maxDistance}
            onChange={setMaxDistance}
          />
          <Slider
            label="Rolloff"
            min={0}
            max={5}
            step={0.1}
            value={rolloff}
            onChange={setRolloff}
          />
        </div>
      </div>

      <Toggle
        label={playing ? "Stop" : "Play Sine 440 Hz"}
        value={playing}
        onChange={togglePlay}
      />
    </DemoShell>
  );
}
