import { useCallback, useEffect, useRef, useState } from "react";
import { useAudioContext } from "../../hooks/useAudioContext";
import { DemoShell } from "../../components/DemoShell";
import { Slider } from "../../components/Slider";
import { Knob } from "../../components/Knob";
import { PianoKeyboard } from "../../components/PianoKeyboard";
import { Waveform } from "../../components/Waveform";
import { Spectrum } from "../../components/Spectrum";
import { midiToFreq } from "../../utils/midiUtils";

interface FMVoice {
  carrier: OscillatorNode;
  modulator: OscillatorNode;
  modGain: GainNode;
  vca: GainNode;
}

export default function FMSynth2Op() {
  const { ctx, resume, masterGain } = useAudioContext();

  /* FM parameters */
  const [carrierRatio, setCarrierRatio] = useState(1);
  const [modRatio, setModRatio] = useState(2);
  const [modIndex, setModIndex] = useState(200);
  const [carrierType, setCarrierType] = useState<OscillatorType>("sine");

  /* Envelope */
  const [attack, setAttack] = useState(0.01);
  const [decay, setDecay] = useState(0.3);
  const [sustain, setSustain] = useState(0.4);
  const [release, setRelease] = useState(0.5);

  /* Mod index envelope */
  const [modAttack, setModAttack] = useState(0.01);
  const [modDecay, setModDecay] = useState(0.5);
  const [modSustain, setModSustain] = useState(0.3);

  const voicesRef = useRef<Map<number, FMVoice>>(new Map());
  const analyserRef = useRef<AnalyserNode | null>(null);
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);
  const [activeNotes, setActiveNotes] = useState<Set<number>>(new Set());

  useEffect(() => {
    if (!ctx || !masterGain) return;
    const an = ctx.createAnalyser();
    an.fftSize = 4096;
    an.connect(masterGain);
    analyserRef.current = an;
    queueMicrotask(() => setAnalyser(an));
    return () => {
      an.disconnect();
    };
  }, [ctx, masterGain]);

  const noteOn = useCallback(
    async (note: number) => {
      await resume();
      if (!ctx || !analyserRef.current) return;
      if (voicesRef.current.has(note)) return;

      const baseFreq = midiToFreq(note);
      const now = ctx.currentTime;

      /* Modulator oscillator */
      const modulator = ctx.createOscillator();
      modulator.type = "sine";
      modulator.frequency.value = baseFreq * modRatio;

      /* Modulation depth (index × modulator frequency) */
      const modGain = ctx.createGain();
      modGain.gain.cancelScheduledValues(now);
      modGain.gain.setValueAtTime(0.001, now);
      modGain.gain.exponentialRampToValueAtTime(
        modIndex,
        now + Math.max(modAttack, 0.005),
      );
      modGain.gain.setTargetAtTime(
        modIndex * modSustain,
        now + modAttack,
        Math.max(modDecay, 0.01) / 4,
      );

      /* Carrier oscillator */
      const carrier = ctx.createOscillator();
      carrier.type = carrierType;
      carrier.frequency.value = baseFreq * carrierRatio;

      /* Connect modulator → carrier.frequency */
      modulator.connect(modGain);
      modGain.connect(carrier.frequency);

      /* VCA with amp envelope */
      const vca = ctx.createGain();
      vca.gain.cancelScheduledValues(now);
      vca.gain.setValueAtTime(0.001, now);
      vca.gain.exponentialRampToValueAtTime(0.3, now + Math.max(attack, 0.005));
      vca.gain.setTargetAtTime(
        0.3 * sustain,
        now + attack,
        Math.max(decay, 0.01) / 4,
      );

      carrier.connect(vca);
      vca.connect(analyserRef.current);

      modulator.start(now);
      carrier.start(now);

      voicesRef.current.set(note, { carrier, modulator, modGain, vca });
      setActiveNotes((prev) => new Set(prev).add(note));
    },
    [
      ctx,
      resume,
      carrierRatio,
      modRatio,
      modIndex,
      carrierType,
      attack,
      decay,
      sustain,
      modAttack,
      modDecay,
      modSustain,
    ],
  );

  const noteOff = useCallback(
    (note: number) => {
      if (!ctx) return;
      const voice = voicesRef.current.get(note);
      if (!voice) return;

      const now = ctx.currentTime;

      /* Release amp */
      voice.vca.gain.cancelScheduledValues(now);
      voice.vca.gain.setValueAtTime(voice.vca.gain.value, now);
      voice.vca.gain.setTargetAtTime(0.001, now, Math.max(release, 0.01) / 4);

      /* Release mod index */
      voice.modGain.gain.cancelScheduledValues(now);
      voice.modGain.gain.setValueAtTime(voice.modGain.gain.value, now);
      voice.modGain.gain.setTargetAtTime(
        0.001,
        now,
        Math.max(release, 0.01) / 4,
      );

      /* Schedule stop with Web Audio timing */
      const stopTime = now + release + 0.3;
      voice.carrier.stop(stopTime);
      voice.modulator.stop(stopTime);
      voice.carrier.onended = () => {
        voice.carrier.disconnect();
        voice.modulator.disconnect();
        voice.modGain.disconnect();
        voice.vca.disconnect();
      };

      voicesRef.current.delete(note);
      setActiveNotes((prev) => {
        const next = new Set(prev);
        next.delete(note);
        return next;
      });
    },
    [ctx, release],
  );

  useEffect(() => {
    const voices = voicesRef.current;
    return () => {
      voices.forEach((v) => {
        try {
          v.carrier.stop();
        } catch {
          /* ok */
        }
        try {
          v.modulator.stop();
        } catch {
          /* ok */
        }
      });
    };
  }, []);

  return (
    <DemoShell
      title="FM Synth (2-Operator)"
      description="Frequency Modulation synthesis with 2 operators. The modulator oscillator feeds into the carrier's frequency AudioParam. Adjust carrier:modulator ratio and modulation index for different timbres — from bells to metallic bass."
      nodes={[
        "OscillatorNode ×2",
        "GainNode (mod depth)",
        "GainNode (VCA)",
        "AudioParam scheduling",
      ]}
    >
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <h3 className="text-text-muted mb-1 text-xs font-medium">Waveform</h3>
          <Waveform analyser={analyser} height={140} />
        </div>
        <div>
          <h3 className="text-text-muted mb-1 text-xs font-medium">Spectrum</h3>
          <Spectrum analyser={analyser} height={140} barColor="rainbow" />
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* FM parameters */}
        <div className="border-border rounded-lg border p-4">
          <h3 className="text-text-muted mb-3 text-xs font-semibold tracking-wider uppercase">
            FM Parameters
          </h3>
          <div className="flex flex-wrap justify-center gap-4">
            <Knob
              label="C:Ratio"
              min={0.5}
              max={8}
              value={carrierRatio}
              onChange={setCarrierRatio}
            />
            <Knob
              label="M:Ratio"
              min={0.5}
              max={16}
              value={modRatio}
              onChange={setModRatio}
            />
            <Knob
              label="Mod Index"
              min={0}
              max={2000}
              value={modIndex}
              onChange={setModIndex}
            />
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
            <span className="text-text-muted text-xs">Carrier:</span>
            {(
              ["sine", "square", "sawtooth", "triangle"] as OscillatorType[]
            ).map((t) => (
              <button
                key={t}
                onClick={() => setCarrierType(t)}
                className={`rounded border px-2 py-0.5 text-[10px] capitalize ${
                  carrierType === t
                    ? "border-accent text-accent"
                    : "border-border text-text-muted"
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        {/* Envelopes */}
        <div className="border-border rounded-lg border p-4">
          <h3 className="text-text-muted mb-3 text-xs font-semibold tracking-wider uppercase">
            Envelopes
          </h3>
          <p className="text-text-muted mb-2 text-[10px]">Amp Envelope</p>
          <div className="grid grid-cols-2 gap-2">
            <Slider
              label="Attack"
              min={0.005}
              max={2}
              step={0.005}
              value={attack}
              onChange={setAttack}
              unit="s"
            />
            <Slider
              label="Decay"
              min={0.01}
              max={2}
              step={0.01}
              value={decay}
              onChange={setDecay}
              unit="s"
            />
            <Slider
              label="Sustain"
              min={0}
              max={1}
              step={0.01}
              value={sustain}
              onChange={setSustain}
            />
            <Slider
              label="Release"
              min={0.01}
              max={3}
              step={0.01}
              value={release}
              onChange={setRelease}
              unit="s"
            />
          </div>
          <p className="text-text-muted mt-3 mb-2 text-[10px]">
            Mod Index Envelope
          </p>
          <div className="grid grid-cols-2 gap-2">
            <Slider
              label="M.Atk"
              min={0.005}
              max={2}
              step={0.005}
              value={modAttack}
              onChange={setModAttack}
              unit="s"
            />
            <Slider
              label="M.Dec"
              min={0.01}
              max={2}
              step={0.01}
              value={modDecay}
              onChange={setModDecay}
              unit="s"
            />
            <Slider
              label="M.Sus"
              min={0}
              max={1}
              step={0.01}
              value={modSustain}
              onChange={setModSustain}
            />
          </div>
        </div>
      </div>

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
