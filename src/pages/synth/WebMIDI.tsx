import { useCallback, useEffect, useRef, useState } from "react";
import { useAudioContext } from "../../hooks/useAudioContext";
import { useMidi, type MidiEvent } from "../../hooks/useMidi";
import { DemoShell } from "../../components/DemoShell";
import { Slider } from "../../components/Slider";
import { PianoKeyboard } from "../../components/PianoKeyboard";
import { Waveform } from "../../components/Waveform";
import { midiToFreq, midiToNoteName } from "../../utils/midiUtils";

type SynthWave = "sawtooth" | "square" | "triangle" | "sine";

interface Voice {
  osc: OscillatorNode;
  filter: BiquadFilterNode;
  vca: GainNode;
}

interface LogEntry {
  id: number;
  time: string;
  type: string;
  detail: string;
}

let logId = 0;

export default function WebMIDI() {
  const { ctx, resume, masterGain } = useAudioContext();
  const { inputs, supported, subscribe } = useMidi();

  const [waveform, setWaveform] = useState<SynthWave>("sawtooth");
  const [filterCutoff, setFilterCutoff] = useState(3000);
  const [volume, setVolume] = useState(0.5);
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);
  const [activeNotes, setActiveNotes] = useState<Set<number>>(new Set());
  const [midiLog, setMidiLog] = useState<LogEntry[]>([]);
  const [ccDisplay, setCcDisplay] = useState<Record<number, number>>({});

  const voicesRef = useRef<Map<number, Voice>>(new Map());
  const analyserRef = useRef<AnalyserNode | null>(null);
  const volumeGainRef = useRef<GainNode | null>(null);
  const waveformRef = useRef(waveform);
  waveformRef.current = waveform;
  const filterCutoffRef = useRef(filterCutoff);
  filterCutoffRef.current = filterCutoff;
  const volumeRef = useRef(volume);
  volumeRef.current = volume;

  /* Setup analyser and volume node */
  useEffect(() => {
    if (!ctx || !masterGain) return;
    const an = ctx.createAnalyser();
    an.fftSize = 2048;

    const vol = ctx.createGain();
    vol.gain.setValueAtTime(volume, ctx.currentTime);
    vol.connect(an).connect(masterGain);
    volumeGainRef.current = vol;

    analyserRef.current = an;
    setAnalyser(an);
    return () => {
      an.disconnect();
      vol.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx, masterGain]);

  /* Update volume */
  useEffect(() => {
    if (ctx && volumeGainRef.current) {
      volumeGainRef.current.gain.setTargetAtTime(volume, ctx.currentTime, 0.02);
    }
  }, [ctx, volume]);

  /* Update filter on existing voices */
  useEffect(() => {
    if (!ctx) return;
    voicesRef.current.forEach((voice) => {
      voice.filter.frequency.setTargetAtTime(
        filterCutoff,
        ctx.currentTime,
        0.02,
      );
    });
  }, [ctx, filterCutoff]);

  const addLogEntry = useCallback((type: string, detail: string) => {
    const now = new Date();
    const time = `${now.getMinutes().toString().padStart(2, "0")}:${now.getSeconds().toString().padStart(2, "0")}.${now.getMilliseconds().toString().padStart(3, "0")}`;
    setMidiLog((prev) => {
      const next = [{ id: ++logId, time, type, detail }, ...prev];
      return next.slice(0, 50);
    });
  }, []);

  /* Note on */
  const noteOn = useCallback(
    async (note: number, velocity = 100) => {
      await resume();
      if (!ctx || !volumeGainRef.current) return;

      /* Kill existing voice for this note */
      const existing = voicesRef.current.get(note);
      if (existing) {
        existing.vca.gain.cancelScheduledValues(ctx.currentTime);
        existing.vca.gain.setTargetAtTime(0, ctx.currentTime, 0.01);
        setTimeout(() => {
          existing.osc.stop();
          existing.osc.disconnect();
          existing.filter.disconnect();
          existing.vca.disconnect();
        }, 50);
      }

      const osc = ctx.createOscillator();
      osc.type = waveformRef.current;
      osc.frequency.setValueAtTime(midiToFreq(note), ctx.currentTime);

      const filter = ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.setValueAtTime(filterCutoffRef.current, ctx.currentTime);
      filter.Q.setValueAtTime(1, ctx.currentTime);

      const vca = ctx.createGain();
      const vel = (velocity / 127) * 0.3;
      vca.gain.setValueAtTime(0, ctx.currentTime);
      vca.gain.linearRampToValueAtTime(vel, ctx.currentTime + 0.01);

      osc.connect(filter).connect(vca).connect(volumeGainRef.current);
      osc.start();

      voicesRef.current.set(note, { osc, filter, vca });
      setActiveNotes((prev) => new Set(prev).add(note));
    },
    [ctx, resume],
  );

  /* Note off */
  const noteOff = useCallback(
    (note: number) => {
      if (!ctx) return;
      const voice = voicesRef.current.get(note);
      if (!voice) return;

      voice.vca.gain.cancelScheduledValues(ctx.currentTime);
      voice.vca.gain.setTargetAtTime(0, ctx.currentTime, 0.05);

      const { osc, filter, vca } = voice;
      setTimeout(() => {
        try {
          osc.stop();
        } catch {
          /* already stopped */
        }
        osc.disconnect();
        filter.disconnect();
        vca.disconnect();
      }, 300);

      voicesRef.current.delete(note);
      setActiveNotes((prev) => {
        const next = new Set(prev);
        next.delete(note);
        return next;
      });
    },
    [ctx],
  );

  /* Subscribe to MIDI events */
  useEffect(() => {
    const unsub = subscribe((e: MidiEvent) => {
      if (e.type === "noteon") {
        noteOn(e.note, e.velocity);
        addLogEntry("Note On", `${midiToNoteName(e.note)} vel:${e.velocity}`);
      } else if (e.type === "noteoff") {
        noteOff(e.note);
        addLogEntry("Note Off", midiToNoteName(e.note));
      } else if (e.type === "cc") {
        addLogEntry("CC", `cc${e.cc} = ${e.value}`);
        setCcDisplay((prev) => ({ ...prev, [e.cc!]: e.value! }));
        /* Map CC1 (mod wheel) to filter cutoff */
        if (e.cc === 1 && e.value !== undefined) {
          const mapped = 200 + (e.value / 127) * 9800;
          setFilterCutoff(mapped);
        }
      }
    });
    return unsub;
  }, [subscribe, noteOn, noteOff, addLogEntry]);

  /* Cleanup voices on unmount */
  useEffect(() => {
    const voices = voicesRef.current;
    return () => {
      voices.forEach((voice) => {
        try {
          voice.osc.stop();
        } catch {
          /* */
        }
        voice.osc.disconnect();
        voice.filter.disconnect();
        voice.vca.disconnect();
      });
      voices.clear();
    };
  }, []);

  const waveforms: SynthWave[] = ["sawtooth", "square", "triangle", "sine"];

  return (
    <DemoShell
      title="Web MIDI Integration"
      description="Connect a hardware MIDI controller to play the built-in synth. MIDI note on/off triggers voices, CC messages map to filter cutoff. Also playable via the on-screen keyboard."
      nodes={["OscillatorNode", "BiquadFilterNode", "GainNode"]}
    >
      {/* MIDI Status */}
      <div className="bg-surface-alt rounded-lg p-4">
        <h3 className="text-text-muted mb-2 text-xs font-medium tracking-wider uppercase">
          MIDI Status
        </h3>
        {!supported ? (
          <div className="rounded border border-yellow-500/30 bg-yellow-500/10 p-3 text-sm text-yellow-300">
            Web MIDI is not supported in this browser. You can still play using
            the on-screen keyboard below.
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-4">
            <span className="inline-flex items-center gap-1.5 text-sm">
              <span className="inline-block h-2 w-2 rounded-full bg-green-400" />
              <span className="text-text">MIDI Supported</span>
            </span>
            {inputs.length === 0 ? (
              <span className="text-text-muted text-sm">
                No devices connected
              </span>
            ) : (
              inputs.map((inp) => (
                <span
                  key={inp.id}
                  className="bg-surface border-border rounded border px-2 py-0.5 text-xs text-cyan-300"
                >
                  {inp.name || "Unknown Device"}
                </span>
              ))
            )}
          </div>
        )}
      </div>

      <div className="flex flex-col gap-4 lg:flex-row">
        {/* Controls */}
        <div className="bg-surface-alt flex-1 rounded-lg p-4">
          <h3 className="text-text-muted mb-3 text-xs font-medium tracking-wider uppercase">
            Synth Controls
          </h3>

          <div className="mb-3">
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

          <div className="flex flex-col gap-3">
            <Slider
              label="Filter"
              min={200}
              max={10000}
              step={100}
              value={filterCutoff}
              onChange={setFilterCutoff}
              unit=" Hz"
            />
            <Slider
              label="Volume"
              min={0}
              max={1}
              step={0.01}
              value={volume}
              onChange={setVolume}
            />
          </div>

          {/* CC display */}
          {Object.keys(ccDisplay).length > 0 && (
            <div className="mt-4">
              <h4 className="text-text-muted mb-1 text-[10px] uppercase">
                CC Values
              </h4>
              <div className="flex flex-wrap gap-2">
                {Object.entries(ccDisplay).map(([cc, val]) => (
                  <span
                    key={cc}
                    className="bg-surface rounded px-2 py-0.5 font-mono text-[10px] text-cyan-300"
                  >
                    CC{cc}: {val}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* MIDI Log */}
        <div className="bg-surface-alt rounded-lg p-4 lg:w-72">
          <h3 className="text-text-muted mb-2 text-xs font-medium tracking-wider uppercase">
            MIDI Log
          </h3>
          <div className="bg-surface border-border h-52 overflow-y-auto rounded border p-2 font-mono text-[10px]">
            {midiLog.length === 0 ? (
              <span className="text-text-muted">
                Waiting for MIDI messages…
              </span>
            ) : (
              midiLog.map((entry) => (
                <div key={entry.id} className="text-text-muted flex gap-2">
                  <span className="text-text-muted/60 shrink-0">
                    {entry.time}
                  </span>
                  <span
                    className={`shrink-0 font-medium ${
                      entry.type === "Note On"
                        ? "text-green-400"
                        : entry.type === "Note Off"
                          ? "text-red-400"
                          : "text-cyan-400"
                    }`}
                  >
                    {entry.type}
                  </span>
                  <span className="text-text">{entry.detail}</span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Waveform */}
      <div className="bg-surface-alt rounded-lg p-4">
        <Waveform analyser={analyser} />
      </div>

      {/* Keyboard */}
      <PianoKeyboard
        startNote={36}
        endNote={84}
        onNoteOn={(n) => noteOn(n)}
        onNoteOff={(n) => noteOff(n)}
        activeNotes={activeNotes}
      />
    </DemoShell>
  );
}
