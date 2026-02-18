import { useCallback, useEffect, useRef, useState } from "react";
import { useAudioContext } from "../../hooks/useAudioContext";
import { useMasterAnalyser } from "../../hooks/useMasterAnalyser";
import { DemoShell } from "../../components/DemoShell";
import { Slider } from "../../components/Slider";
import { Knob } from "../../components/Knob";
import { PianoKeyboard } from "../../components/PianoKeyboard";
import { Waveform } from "../../components/Waveform";
import { midiToFreq } from "../../utils/midiUtils";

interface Voice {
  osc: OscillatorNode;
  filter: BiquadFilterNode;
  vca: GainNode;
}

interface Envelope {
  attack: number;
  decay: number;
  sustain: number;
  release: number;
}

const DEFAULT_AMP_ENV: Envelope = {
  attack: 0.01,
  decay: 0.2,
  sustain: 0.5,
  release: 0.3,
};

const DEFAULT_FILTER_ENV: Envelope = {
  attack: 0.01,
  decay: 0.3,
  sustain: 0.2,
  release: 0.3,
};

export default function SubtractiveSynth() {
  const { ctx, resume, masterGain } = useAudioContext();
  const { analyserRef, analyser } = useMasterAnalyser(ctx, masterGain);

  const [oscType, setOscType] = useState<OscillatorType>("sawtooth");
  const [cutoff, setCutoff] = useState(2000);
  const [resonance, setResonance] = useState(4);
  const [filterEnvAmt, setFilterEnvAmt] = useState(3000);
  const [ampEnv, setAmpEnv] = useState<Envelope>(DEFAULT_AMP_ENV);
  const [filterEnv, setFilterEnv] = useState<Envelope>(DEFAULT_FILTER_ENV);

  const voicesRef = useRef<Map<number, Voice>>(new Map());
  const [activeNotes, setActiveNotes] = useState<Set<number>>(new Set());

  const updateAmpEnv = (key: keyof Envelope, value: number) => {
    setAmpEnv((prev) => ({ ...prev, [key]: value }));
  };

  const updateFilterEnv = (key: keyof Envelope, value: number) => {
    setFilterEnv((prev) => ({ ...prev, [key]: value }));
  };

  const noteOn = useCallback(
    async (note: number) => {
      await resume();
      if (!ctx || !analyserRef.current) return;
      if (voicesRef.current.has(note)) return;

      const freq = midiToFreq(note);
      const now = ctx.currentTime;

      /* OSC */
      const osc = ctx.createOscillator();
      osc.type = oscType;
      osc.frequency.value = freq;

      /* Filter */
      const filter = ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.Q.value = resonance;

      /* Filter envelope */
      const baseCutoff = cutoff;
      filter.frequency.cancelScheduledValues(now);
      filter.frequency.setValueAtTime(baseCutoff, now);
      filter.frequency.linearRampToValueAtTime(
        baseCutoff + filterEnvAmt,
        now + Math.max(filterEnv.attack, 0.005),
      );
      filter.frequency.setTargetAtTime(
        baseCutoff + filterEnvAmt * filterEnv.sustain,
        now + filterEnv.attack,
        Math.max(filterEnv.decay, 0.01) / 4,
      );

      /* VCA */
      const vca = ctx.createGain();
      vca.gain.cancelScheduledValues(now);
      vca.gain.setValueAtTime(0.001, now);
      vca.gain.exponentialRampToValueAtTime(
        0.4,
        now + Math.max(ampEnv.attack, 0.005),
      );
      vca.gain.setTargetAtTime(
        0.4 * ampEnv.sustain,
        now + ampEnv.attack,
        Math.max(ampEnv.decay, 0.01) / 4,
      );

      /* Connect: osc → filter → vca → analyser */
      osc.connect(filter);
      filter.connect(vca);
      vca.connect(analyserRef.current);

      osc.start(now);

      voicesRef.current.set(note, { osc, filter, vca });
      setActiveNotes((prev) => new Set(prev).add(note));
    },
    [
      ctx,
      resume,
      analyserRef,
      oscType,
      cutoff,
      resonance,
      filterEnvAmt,
      ampEnv,
      filterEnv,
    ],
  );

  const noteOff = useCallback(
    (note: number) => {
      if (!ctx) return;
      const voice = voicesRef.current.get(note);
      if (!voice) return;

      const now = ctx.currentTime;

      /* Amp release */
      voice.vca.gain.cancelScheduledValues(now);
      voice.vca.gain.setValueAtTime(voice.vca.gain.value, now);
      voice.vca.gain.setTargetAtTime(
        0.001,
        now,
        Math.max(ampEnv.release, 0.01) / 4,
      );

      /* Filter release */
      voice.filter.frequency.cancelScheduledValues(now);
      voice.filter.frequency.setValueAtTime(voice.filter.frequency.value, now);
      voice.filter.frequency.setTargetAtTime(
        cutoff,
        now,
        Math.max(filterEnv.release, 0.01) / 4,
      );

      /* Schedule stop with Web Audio timing */
      const stopTime = now + ampEnv.release + 0.3;
      voice.osc.stop(stopTime);
      voice.osc.onended = () => {
        voice.osc.disconnect();
        voice.filter.disconnect();
        voice.vca.disconnect();
      };

      voicesRef.current.delete(note);
      setActiveNotes((prev) => {
        const next = new Set(prev);
        next.delete(note);
        return next;
      });
    },
    [ctx, ampEnv.release, filterEnv.release, cutoff],
  );

  /* Cleanup on unmount */
  useEffect(() => {
    const voices = voicesRef.current;
    return () => {
      voices.forEach((v) => {
        try {
          v.osc.stop();
        } catch {
          /* ok */
        }
      });
    };
  }, []);

  return (
    <DemoShell
      title="Subtractive Synth"
      description="Classic subtractive synthesis: harmonically rich oscillator → resonant lowpass filter with its own ADSR envelope → VCA with ADSR. Play notes on the keyboard below."
      nodes={[
        "OscillatorNode",
        "BiquadFilterNode (lowpass)",
        "GainNode (VCA)",
        "AudioParam ADSR",
      ]}
    >
      <Waveform analyser={analyser} height={120} />

      {/* Oscillator type */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-text-muted text-xs">Oscillator:</span>
        {(["sawtooth", "square", "triangle", "sine"] as OscillatorType[]).map(
          (t) => (
            <button
              key={t}
              onClick={() => setOscType(t)}
              className={`rounded border px-3 py-1 text-xs capitalize ${
                oscType === t
                  ? "border-accent bg-accent/20 text-accent"
                  : "border-border text-text-muted"
              }`}
            >
              {t}
            </button>
          ),
        )}
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Filter section */}
        <div className="border-border rounded-lg border p-4">
          <h3 className="text-text-muted mb-3 text-xs font-semibold tracking-wider uppercase">
            Filter
          </h3>
          <div className="flex flex-wrap justify-center gap-4">
            <Knob
              label="Cutoff"
              min={20}
              max={15000}
              value={cutoff}
              onChange={setCutoff}
              unit="Hz"
            />
            <Knob
              label="Resonance"
              min={0.1}
              max={30}
              value={resonance}
              onChange={setResonance}
            />
            <Knob
              label="Env Amt"
              min={0}
              max={10000}
              value={filterEnvAmt}
              onChange={setFilterEnvAmt}
              unit="Hz"
            />
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <Slider
              label="F.Atk"
              min={0.005}
              max={2}
              step={0.005}
              value={filterEnv.attack}
              onChange={(v) => updateFilterEnv("attack", v)}
              unit="s"
            />
            <Slider
              label="F.Dec"
              min={0.01}
              max={2}
              step={0.01}
              value={filterEnv.decay}
              onChange={(v) => updateFilterEnv("decay", v)}
              unit="s"
            />
            <Slider
              label="F.Sus"
              min={0}
              max={1}
              step={0.01}
              value={filterEnv.sustain}
              onChange={(v) => updateFilterEnv("sustain", v)}
            />
            <Slider
              label="F.Rel"
              min={0.01}
              max={3}
              step={0.01}
              value={filterEnv.release}
              onChange={(v) => updateFilterEnv("release", v)}
              unit="s"
            />
          </div>
        </div>

        {/* Amp envelope section */}
        <div className="border-border rounded-lg border p-4">
          <h3 className="text-text-muted mb-3 text-xs font-semibold tracking-wider uppercase">
            Amp Envelope
          </h3>
          <div className="grid grid-cols-2 gap-2">
            <Slider
              label="Attack"
              min={0.005}
              max={2}
              step={0.005}
              value={ampEnv.attack}
              onChange={(v) => updateAmpEnv("attack", v)}
              unit="s"
            />
            <Slider
              label="Decay"
              min={0.01}
              max={2}
              step={0.01}
              value={ampEnv.decay}
              onChange={(v) => updateAmpEnv("decay", v)}
              unit="s"
            />
            <Slider
              label="Sustain"
              min={0}
              max={1}
              step={0.01}
              value={ampEnv.sustain}
              onChange={(v) => updateAmpEnv("sustain", v)}
            />
            <Slider
              label="Release"
              min={0.01}
              max={3}
              step={0.01}
              value={ampEnv.release}
              onChange={(v) => updateAmpEnv("release", v)}
              unit="s"
            />
          </div>
        </div>
      </div>

      {/* Keyboard */}
      <PianoKeyboard
        startNote={48}
        endNote={72}
        onNoteOn={noteOn}
        onNoteOff={noteOff}
        activeNotes={activeNotes}
      />
    </DemoShell>
  );
}
