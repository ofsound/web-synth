import { useCallback, useEffect, useRef, useState } from "react";
import { useAudioContext } from "../../hooks/useAudioContext";
import { DemoShell } from "../../components/DemoShell";
import { Slider } from "../../components/Slider";
import { Waveform } from "../../components/Waveform";

export default function MidSideProcessing() {
  const { ctx, resume, masterGain } = useAudioContext();
  const [playing, setPlaying] = useState(false);
  const [midLevel, setMidLevel] = useState(1);
  const [sideLevel, setSideLevel] = useState(1);
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);

  const sourceRef = useRef<AudioBufferSourceNode | null>(null);
  const nodesRef = useRef<AudioNode[]>([]);
  const midGainRef = useRef<GainNode | null>(null);
  const sideGainRef = useRef<GainNode | null>(null);

  /** Create stereo pink noise with different content per channel. */
  const createStereoNoise = useCallback(
    (audioCtx: AudioContext): AudioBuffer => {
      const sr = audioCtx.sampleRate;
      const length = sr * 4;
      const buffer = audioCtx.createBuffer(2, length, sr);

      for (let ch = 0; ch < 2; ch++) {
        const data = buffer.getChannelData(ch);
        let b0 = 0,
          b1 = 0,
          b2 = 0,
          b3 = 0,
          b4 = 0,
          b5 = 0,
          b6 = 0;
        for (let i = 0; i < length; i++) {
          const w = Math.random() * 2 - 1;
          b0 = 0.99886 * b0 + w * 0.0555179;
          b1 = 0.99332 * b1 + w * 0.0750759;
          b2 = 0.969 * b2 + w * 0.153852;
          b3 = 0.8665 * b3 + w * 0.3104856;
          b4 = 0.55 * b4 + w * 0.5329522;
          b5 = -0.7616 * b5 - w * 0.016898;
          data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
          b6 = w * 0.115926;
        }
      }
      return buffer;
    },
    [],
  );

  /* Update mid/side gain in real-time */
  useEffect(() => {
    if (midGainRef.current) midGainRef.current.gain.value = midLevel;
  }, [midLevel]);

  useEffect(() => {
    if (sideGainRef.current) sideGainRef.current.gain.value = sideLevel;
  }, [sideLevel]);

  /**
   * M/S Matrix:
   *   Mid  = (L + R) / 2
   *   Side = (L - R) / 2
   *
   * After processing, recombine:
   *   L_out = Mid + Side
   *   R_out = Mid - Side
   *
   * We implement this with ChannelSplitter, GainNodes (including -1 for
   * phase inversion), and ChannelMerger.
   */
  const togglePlay = useCallback(async () => {
    await resume();
    if (!ctx || !masterGain) return;

    if (playing) {
      try {
        sourceRef.current?.stop();
      } catch {
        /* ok */
      }
      sourceRef.current = null;
      nodesRef.current.forEach((n) => {
        try {
          n.disconnect();
        } catch {
          /* ok */
        }
      });
      nodesRef.current = [];
      setAnalyser(null);
      setPlaying(false);
      return;
    }

    const an = ctx.createAnalyser();
    an.fftSize = 2048;

    /* Stereo source */
    const src = ctx.createBufferSource();
    src.buffer = createStereoNoise(ctx);
    src.loop = true;

    /* Split into L and R */
    const splitter = ctx.createChannelSplitter(2);

    /* Encode to M/S:
       Mid  = 0.5 * (L + R)
       Side = 0.5 * (L - R)  →  L * 0.5 + R * -0.5 */
    const midMixL = ctx.createGain();
    midMixL.gain.value = 0.5;
    const midMixR = ctx.createGain();
    midMixR.gain.value = 0.5;
    const sideMixL = ctx.createGain();
    sideMixL.gain.value = 0.5;
    const sideMixR = ctx.createGain();
    sideMixR.gain.value = -0.5; // phase invert R for side

    /* Mid and Side level controls */
    const midGain = ctx.createGain();
    midGain.gain.value = midLevel;
    midGainRef.current = midGain;

    const sideGain = ctx.createGain();
    sideGain.gain.value = sideLevel;
    sideGainRef.current = sideGain;

    /* Sum mid channels */
    const midSum = ctx.createGain();
    midSum.gain.value = 1;
    /* Sum side channels */
    const sideSum = ctx.createGain();
    sideSum.gain.value = 1;

    /* Encode: L → mid + side, R → mid - side */
    splitter.connect(midMixL, 0);
    splitter.connect(midMixR, 1);
    splitter.connect(sideMixL, 0);
    splitter.connect(sideMixR, 1);

    midMixL.connect(midSum);
    midMixR.connect(midSum);
    midSum.connect(midGain);

    sideMixL.connect(sideSum);
    sideMixR.connect(sideSum);
    sideSum.connect(sideGain);

    /* Decode back to L/R:
       L = Mid + Side
       R = Mid - Side → Mid + (-1 * Side) */
    const sideInvert = ctx.createGain();
    sideInvert.gain.value = -1;
    sideGain.connect(sideInvert);

    const merger = ctx.createChannelMerger(2);

    /* L_out = midGain + sideGain */
    const lOut = ctx.createGain();
    lOut.gain.value = 1;
    midGain.connect(lOut);
    sideGain.connect(lOut);
    lOut.connect(merger, 0, 0);

    /* R_out = midGain + sideInvert (= midGain - sideGain) */
    const rOut = ctx.createGain();
    rOut.gain.value = 1;
    midGain.connect(rOut);
    sideInvert.connect(rOut);
    rOut.connect(merger, 0, 1);

    /* Output */
    src.connect(splitter);
    merger.connect(an);
    an.connect(masterGain);

    src.start();

    sourceRef.current = src;
    nodesRef.current = [
      src,
      splitter,
      midMixL,
      midMixR,
      sideMixL,
      sideMixR,
      midSum,
      sideSum,
      midGain,
      sideGain,
      sideInvert,
      lOut,
      rOut,
      merger,
      an,
    ];
    setAnalyser(an);
    setPlaying(true);
  }, [
    ctx,
    resume,
    masterGain,
    playing,
    midLevel,
    sideLevel,
    createStereoNoise,
  ]);

  /* Cleanup on unmount */
  useEffect(() => {
    return () => {
      try {
        sourceRef.current?.stop();
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
    };
  }, []);

  return (
    <DemoShell
      title="Mid/Side Processing"
      description="Split a stereo signal into Mid (L+R) and Side (L−R) components using a ChannelSplitter / ChannelMerger matrix. The Mid channel contains the centre image and the Side channel contains the stereo difference. Adjust Mid and Side levels independently to control the stereo width."
      nodes={["ChannelSplitterNode", "ChannelMergerNode", "GainNode"]}
    >
      <div className="bg-surface-alt border-border text-text-muted space-y-1 rounded-lg border p-4 text-xs">
        <p>
          <strong className="text-text">Encode:</strong> Mid = (L + R) / 2
          &nbsp;|&nbsp; Side = (L − R) / 2
        </p>
        <p>
          <strong className="text-text">Decode:</strong> L = Mid + Side
          &nbsp;|&nbsp; R = Mid − Side
        </p>
      </div>

      <div className="bg-surface-alt border-border space-y-3 rounded-lg border p-4">
        <Slider
          label="Mid Level"
          min={0}
          max={2}
          step={0.01}
          value={midLevel}
          onChange={setMidLevel}
        />
        <Slider
          label="Side Level"
          min={0}
          max={2}
          step={0.01}
          value={sideLevel}
          onChange={setSideLevel}
        />
      </div>

      <Waveform analyser={analyser} />

      <button
        onClick={togglePlay}
        className={`self-start rounded-lg px-5 py-2 text-sm font-medium transition ${
          playing
            ? "border border-red-500 bg-red-500/20 text-red-400"
            : "bg-accent/20 text-accent border-accent border"
        }`}
      >
        {playing ? "Stop" : "Play Stereo Noise"}
      </button>
    </DemoShell>
  );
}
