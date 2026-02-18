import { useEffect, useRef, useState } from "react";
import { useAudioContext } from "../../hooks/useAudioContext";
import { DemoShell } from "../../components/DemoShell";
import { Slider } from "../../components/Slider";
import { Knob } from "../../components/Knob";
import { Toggle } from "../../components/Toggle";
import { Waveform } from "../../components/Waveform";

/**
 * Drone Machine — multiple oscillators at consonant intervals with slow
 * LFO-modulated filter sweep and subtle vibrato for ambient textures.
 */

type ChordType = "power" | "minor" | "major" | "sus4";

/** Semitone intervals for each chord type (relative to root) */
const CHORD_INTERVALS: Record<ChordType, number[]> = {
  power: [0, 7, 12], // root, 5th, octave
  minor: [0, 3, 7], // root, b3, 5th
  major: [0, 4, 7], // root, 3rd, 5th
  sus4: [0, 5, 7], // root, 4th, 5th
};

/** Convert semitone offset to frequency ratio */
function semitonesToRatio(semitones: number): number {
  return Math.pow(2, semitones / 12);
}

interface DroneNodes {
  oscs: OscillatorNode[];
  oscGains: GainNode[];
  vibratoLFOs: OscillatorNode[];
  vibratoGains: GainNode[];
  filter: BiquadFilterNode;
  filterLFO: OscillatorNode;
  filterLFOGain: GainNode;
  masterVCA: GainNode;
}

export default function DroneMachine() {
  const { ctx, resume, masterGain } = useAudioContext();

  const [playing, setPlaying] = useState(false);
  const [rootFreq, setRootFreq] = useState(65);
  const [chordType, setChordType] = useState<ChordType>("power");
  const [volume, setVolume] = useState(0.4);
  const [detune, setDetune] = useState(3);
  const [cutoff, setCutoff] = useState(800);
  const [lfoRate, setLfoRate] = useState(0.08);

  const nodesRef = useRef<DroneNodes | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);

  /* Analyser setup */
  useEffect(() => {
    if (!ctx || !masterGain) return;
    const an = ctx.createAnalyser();
    an.fftSize = 4096;
    an.connect(masterGain);
    analyserRef.current = an;
    setAnalyser(an);
    return () => {
      an.disconnect();
    };
  }, [ctx, masterGain]);

  /* Start / stop drone */
  useEffect(() => {
    if (!playing || !ctx || !analyserRef.current) {
      /* Stop existing nodes */
      if (nodesRef.current) {
        const n = nodesRef.current;
        n.oscs.forEach((o) => {
          try {
            o.stop();
          } catch {
            /* ok */
          }
          o.disconnect();
        });
        n.vibratoLFOs.forEach((l) => {
          try {
            l.stop();
          } catch {
            /* ok */
          }
          l.disconnect();
        });
        n.vibratoGains.forEach((g) => g.disconnect());
        n.oscGains.forEach((g) => g.disconnect());
        try {
          n.filterLFO.stop();
        } catch {
          /* ok */
        }
        n.filterLFO.disconnect();
        n.filterLFOGain.disconnect();
        n.filter.disconnect();
        n.masterVCA.disconnect();
        nodesRef.current = null;
      }
      return;
    }

    const intervals = CHORD_INTERVALS[chordType];
    const now = ctx.currentTime;

    /* Master VCA with fade-in */
    const masterVCA = ctx.createGain();
    masterVCA.gain.setValueAtTime(0.001, now);
    masterVCA.gain.exponentialRampToValueAtTime(volume, now + 1.5);

    /* Lowpass filter */
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = cutoff;
    filter.Q.value = 2;

    /* Filter LFO */
    const filterLFO = ctx.createOscillator();
    filterLFO.type = "sine";
    filterLFO.frequency.value = lfoRate;
    const filterLFOGain = ctx.createGain();
    filterLFOGain.gain.value = cutoff * 0.5;
    filterLFO.connect(filterLFOGain);
    filterLFOGain.connect(filter.frequency);
    filterLFO.start(now);

    filter.connect(masterVCA);
    masterVCA.connect(analyserRef.current);

    const oscs: OscillatorNode[] = [];
    const oscGains: GainNode[] = [];
    const vibratoLFOs: OscillatorNode[] = [];
    const vibratoGains: GainNode[] = [];

    intervals.forEach((semitones) => {
      const freq = rootFreq * semitonesToRatio(semitones);

      const osc = ctx.createOscillator();
      osc.type = "sawtooth";
      osc.frequency.value = freq;
      /* Slight initial detune for organic feel */
      osc.detune.value = (Math.random() - 0.5) * detune * 2;

      /* Subtle vibrato LFO per oscillator */
      const vibLFO = ctx.createOscillator();
      vibLFO.type = "sine";
      vibLFO.frequency.value = 0.3 + Math.random() * 0.5;
      const vibGain = ctx.createGain();
      vibGain.gain.value = detune;
      vibLFO.connect(vibGain);
      vibGain.connect(osc.detune);
      vibLFO.start(now);

      const oscGain = ctx.createGain();
      oscGain.gain.value = 1 / intervals.length;

      osc.connect(oscGain);
      oscGain.connect(filter);
      osc.start(now);

      oscs.push(osc);
      oscGains.push(oscGain);
      vibratoLFOs.push(vibLFO);
      vibratoGains.push(vibGain);
    });

    nodesRef.current = {
      oscs,
      oscGains,
      vibratoLFOs,
      vibratoGains,
      filter,
      filterLFO,
      filterLFOGain,
      masterVCA,
    };

    return () => {
      /* Fade out then cleanup */
      const t = ctx.currentTime;
      const fadeOutTime = t + 0.5;
      masterVCA.gain.cancelScheduledValues(t);
      masterVCA.gain.setValueAtTime(masterVCA.gain.value, t);
      masterVCA.gain.exponentialRampToValueAtTime(0.001, fadeOutTime);

      const stopTime = fadeOutTime + 0.1;
      oscs.forEach((o) => o.stop(stopTime));
      vibratoLFOs.forEach((l) => l.stop(stopTime));
      filterLFO.stop(stopTime);

      oscs[0].onended = () => {
        oscs.forEach((o) => o.disconnect());
        vibratoLFOs.forEach((l) => l.disconnect());
        vibratoGains.forEach((g) => g.disconnect());
        oscGains.forEach((g) => g.disconnect());
        filterLFO.disconnect();
        filterLFOGain.disconnect();
        filter.disconnect();
        masterVCA.disconnect();
      };
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, ctx, chordType, rootFreq]);

  /* Live parameter updates */
  useEffect(() => {
    if (!nodesRef.current) return;
    nodesRef.current.masterVCA.gain.setTargetAtTime(
      volume,
      (ctx?.currentTime ?? 0) + 0.01,
      0.1,
    );
  }, [volume, ctx]);

  useEffect(() => {
    if (!nodesRef.current) return;
    nodesRef.current.filter.frequency.setTargetAtTime(
      cutoff,
      (ctx?.currentTime ?? 0) + 0.01,
      0.1,
    );
    nodesRef.current.filterLFOGain.gain.value = cutoff * 0.5;
  }, [cutoff, ctx]);

  useEffect(() => {
    if (!nodesRef.current) return;
    nodesRef.current.filterLFO.frequency.value = lfoRate;
  }, [lfoRate]);

  useEffect(() => {
    if (!nodesRef.current) return;
    nodesRef.current.vibratoGains.forEach((g) => {
      g.gain.value = detune;
    });
  }, [detune]);

  const handleToggle = async (on: boolean) => {
    if (on) await resume();
    setPlaying(on);
  };

  return (
    <DemoShell
      title="Drone Machine"
      description="Ambient drone generator: multiple oscillators at consonant intervals (root, third/fifth, octave) with slow LFO filter sweeps and subtle vibrato for evolving, relaxing soundscapes."
      nodes={[
        "OscillatorNode (x3-4)",
        "OscillatorNode (LFO)",
        "BiquadFilterNode",
        "GainNode",
      ]}
    >
      {/* Controls */}
      <div className="bg-surface rounded-lg border border-white/5 p-4">
        <h2 className="text-text mb-3 text-sm font-semibold">Controls</h2>

        <div className="mb-4">
          <Toggle label="Play" value={playing} onChange={handleToggle} />
        </div>

        {/* Chord type selector */}
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <span className="text-text-muted text-xs">Chord:</span>
          {(["power", "minor", "major", "sus4"] as ChordType[]).map((t) => (
            <button
              key={t}
              onClick={() => setChordType(t)}
              className={`rounded border px-3 py-1 text-xs capitalize ${
                chordType === t
                  ? "border-accent bg-accent/20 text-accent"
                  : "border-border text-text-muted"
              }`}
            >
              {t === "power"
                ? "Power (R+5+8)"
                : t === "minor"
                  ? "Minor (R+b3+5)"
                  : t === "major"
                    ? "Major (R+3+5)"
                    : "Sus4 (R+4+5)"}
            </button>
          ))}
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {/* Frequency */}
          <div>
            <h3 className="text-text-muted mb-2 text-xs font-medium">Pitch</h3>
            <Slider
              label="Root Freq"
              min={30}
              max={200}
              step={0.5}
              value={rootFreq}
              onChange={setRootFreq}
              unit="Hz"
            />
            <div className="mt-2">
              <Slider
                label="Detune"
                min={0}
                max={10}
                step={0.1}
                value={detune}
                onChange={setDetune}
                unit="ct"
              />
            </div>
          </div>

          {/* Filter */}
          <div>
            <h3 className="text-text-muted mb-2 text-xs font-medium">Filter</h3>
            <div className="flex flex-wrap justify-center gap-4">
              <Knob
                label="Cutoff"
                min={50}
                max={5000}
                value={cutoff}
                onChange={setCutoff}
                unit="Hz"
              />
              <Knob
                label="LFO Rate"
                min={0.01}
                max={1}
                value={lfoRate}
                onChange={setLfoRate}
                unit="Hz"
              />
            </div>
          </div>

          {/* Volume */}
          <div>
            <h3 className="text-text-muted mb-2 text-xs font-medium">Output</h3>
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
      </div>

      {/* Waveform */}
      <div className="bg-surface rounded-lg border border-white/5 p-4">
        <Waveform analyser={analyser} />
      </div>
    </DemoShell>
  );
}
