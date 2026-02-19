/**
 * MIDI File Player — drag-and-drop / file-picker MIDI input source.
 *
 * Parses .mid files, renders a miniature piano-roll preview, provides
 * transport controls (play/pause/stop), a seekable progress bar, and a
 * per-track selector.  Emits noteOn/noteOff to the shared MidiBus.
 */

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { useMidiFilePlayer } from "./useMidiFilePlayer";
import type { MidiBus } from "./MidiBus";
import type { MidiFileNote } from "./useMidiFilePlayer";
import type { MidiChannelMode } from "./channelPolicy";

/* ── Props ── */

interface MidiFilePlayerProps {
  midiBus: MidiBus;
  ctx: AudioContext | null;
  channelMode?: MidiChannelMode;
  normalizedChannel?: number;
  onTransportStopRegister?: (stop: (() => void) | null) => void;
}

/* ── Helpers ── */

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/* ── Piano Roll Preview (canvas) ── */

function PianoRollPreview({
  notes,
  selectedTracks,
  progressRef,
  duration,
  onSeek,
}: {
  notes: MidiFileNote[];
  selectedTracks: Set<number>;
  /** Ref updated every RAF tick at 60fps — avoids 60fps React re-renders. */
  progressRef: React.RefObject<number>;
  duration: number;
  onSeek: (fraction: number) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const isDraggingRef = useRef(false);
  // Canvas pixel dimensions tracked by ResizeObserver, not getBoundingClientRect.
  const sizeRef = useRef({ w: 0, h: 0 });
  const rafHandleRef = useRef(0);

  // Filtered notes for drawing
  const visibleNotes = useMemo(
    () => notes.filter((n) => selectedTracks.has(n.trackIndex)),
    [notes, selectedTracks],
  );

  // Compute pitch range
  const { minNote, maxNote } = useMemo(() => {
    if (visibleNotes.length === 0) return { minNote: 21, maxNote: 108 };
    let lo = 127,
      hi = 0;
    for (const n of visibleNotes) {
      if (n.note < lo) lo = n.note;
      if (n.note > hi) hi = n.note;
    }
    // Add 1 semitone padding
    return { minNote: Math.max(0, lo - 1), maxNote: Math.min(127, hi + 1) };
  }, [visibleNotes]);

  // Use ResizeObserver to track canvas size — avoids layout-reflow per frame.
  useEffect(() => {
    const parent = containerRef.current;
    if (!parent) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    const applySize = (w: number, h: number) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      sizeRef.current = { w, h };
    };

    const ro = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const { width, height } = entry.contentRect;
      applySize(width, height);
    });

    ro.observe(parent);
    // Set initial size immediately
    const rect = parent.getBoundingClientRect();
    applySize(rect.width, rect.height);

    return () => ro.disconnect();
  }, []);

  // Draw loop — runs its own RAF, reads progressRef directly (no React state).
  useEffect(() => {
    const draw = () => {
      const canvas = canvasRef.current;
      if (!canvas) {
        rafHandleRef.current = requestAnimationFrame(draw);
        return;
      }
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const { w, h } = sizeRef.current;
      if (w === 0 || h === 0) {
        rafHandleRef.current = requestAnimationFrame(draw);
        return;
      }

      const cx = canvas.getContext("2d");
      if (!cx) {
        rafHandleRef.current = requestAnimationFrame(draw);
        return;
      }

      cx.setTransform(dpr, 0, 0, dpr, 0, 0);

      // Background
      cx.fillStyle = "#1a1a2e";
      cx.fillRect(0, 0, w, h);

      if (duration <= 0 || visibleNotes.length === 0) {
        cx.fillStyle = "#8888aa";
        cx.font = "11px sans-serif";
        cx.textAlign = "center";
        cx.fillText("No notes to display", w / 2, h / 2 + 4);
        rafHandleRef.current = requestAnimationFrame(draw);
        return;
      }

      const pitchRange = maxNote - minNote + 1;
      const noteH = Math.max(1, h / pitchRange);

      // Draw notes
      cx.fillStyle = "#6366f1";
      for (const n of visibleNotes) {
        const x = (n.time / duration) * w;
        const nw = Math.max(1, (n.duration / duration) * w);
        const y = h - ((n.note - minNote + 1) / pitchRange) * h;
        cx.fillRect(x, y, nw, Math.max(1, noteH - 0.5));
      }

      // Playhead — reads live progressRef, no re-render needed
      const px = progressRef.current * w;
      cx.strokeStyle = "#f59e0b";
      cx.lineWidth = 1.5;
      cx.beginPath();
      cx.moveTo(px, 0);
      cx.lineTo(px, h);
      cx.stroke();

      rafHandleRef.current = requestAnimationFrame(draw);
    };

    rafHandleRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafHandleRef.current);
  }, [visibleNotes, progressRef, duration, minNote, maxNote]);

  // Seek on click/drag
  const computeFraction = useCallback((clientX: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return 0;
    const rect = canvas.getBoundingClientRect();
    return Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
  }, []);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      isDraggingRef.current = true;
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      onSeek(computeFraction(e.clientX));
    },
    [onSeek, computeFraction],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!isDraggingRef.current) return;
      onSeek(computeFraction(e.clientX));
    },
    [onSeek, computeFraction],
  );

  const handlePointerUp = useCallback(() => {
    isDraggingRef.current = false;
  }, []);

  return (
    <div
      ref={containerRef}
      className="border-border relative h-20 w-full cursor-crosshair overflow-hidden rounded border"
    >
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      />
    </div>
  );
}

/* ── Main Component ── */

export function MidiFilePlayer({
  midiBus,
  ctx,
  channelMode = "source",
  normalizedChannel = 0,
  onTransportStopRegister,
}: MidiFilePlayerProps) {
  const idBase = useId();
  const fileInputId = `${idBase}-file`;
  const [state, actions] = useMidiFilePlayer(midiBus, ctx, {
    channelMode,
    normalizedChannel,
  });
  const [dragOver, setDragOver] = useState(false);

  /* ── File handling ── */

  const processFile = useCallback(
    (file: File) => {
      if (!file.name.match(/\.(mid|midi)$/i)) {
        actions.setError("Only .mid or .midi files are supported.");
        return;
      }
      actions.setError(null);
      file
        .arrayBuffer()
        .then((buf) => {
          actions.loadFile(buf, file.name);
        })
        .catch((err) => {
          console.error("Failed to read MIDI file:", err);
          actions.setError("Failed to read file. Please try again.");
        });
    },
    [actions],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file) processFile(file);
    },
    [processFile],
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setDragOver(false);
  }, []);

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) processFile(file);
      // Reset so the same file can be re-selected
      e.target.value = "";
    },
    [processFile],
  );

  /* ── Progress bar drag ── */

  const progressBarRef = useRef<HTMLDivElement>(null);
  const isDraggingProgress = useRef(false);

  const computeProgressFraction = useCallback((clientX: number) => {
    const el = progressBarRef.current;
    if (!el) return 0;
    const rect = el.getBoundingClientRect();
    return Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
  }, []);

  const handleProgressPointerDown = useCallback(
    (e: React.PointerEvent) => {
      isDraggingProgress.current = true;
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      actions.seek(computeProgressFraction(e.clientX));
    },
    [actions, computeProgressFraction],
  );

  const handleProgressPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!isDraggingProgress.current) return;
      actions.seek(computeProgressFraction(e.clientX));
    },
    [actions, computeProgressFraction],
  );

  const handleProgressPointerUp = useCallback(() => {
    isDraggingProgress.current = false;
  }, []);

  useEffect(() => {
    if (!onTransportStopRegister) return;
    onTransportStopRegister(actions.stop);
    return () => {
      onTransportStopRegister(null);
    };
  }, [actions.stop, onTransportStopRegister]);

  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = containerRef.current;
    if (!node) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code !== "Space") return;
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" || target.tagName === "TEXTAREA")
      ) {
        return;
      }
      event.preventDefault();
      if (!state.loaded) return;
      if (state.playing) {
        actions.pause();
      } else {
        actions.play();
      }
    };
    node.addEventListener("keydown", onKeyDown);
    return () => {
      node.removeEventListener("keydown", onKeyDown);
    };
  }, [actions, state.loaded, state.playing]);

  return (
    <div ref={containerRef} className="space-y-2" tabIndex={0}>
      {/* ─── Drop Zone / File Picker ─── */}
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        className={`flex items-center justify-center rounded-lg border-2 border-dashed p-3 text-center transition-colors ${
          dragOver
            ? "border-accent bg-accent/10"
            : state.loaded
              ? "border-border bg-surface-alt/30"
              : "border-border hover:border-text-muted"
        }`}
      >
        {state.loaded ? (
          <div className="flex w-full items-center justify-between gap-2">
            <span className="text-text truncate text-xs font-medium">
              🎵 {state.fileName}
            </span>
            <label
              htmlFor={fileInputId}
              className="border-border text-text-muted hover:text-text cursor-pointer rounded border px-2 py-0.5 text-[10px] whitespace-nowrap"
            >
              Change
            </label>
          </div>
        ) : (
          <div className="space-y-1">
            <p className="text-text-muted text-xs">
              Drop <span className="text-text font-medium">.mid</span> file here
            </p>
            <label
              htmlFor={fileInputId}
              className="text-accent hover:text-accent-hover cursor-pointer text-[11px] underline"
            >
              or browse…
            </label>
          </div>
        )}
        <input
          id={fileInputId}
          type="file"
          accept=".mid,.midi"
          onChange={handleFileInput}
          className="hidden"
        />
      </div>

      {state.error && (
        <p className="text-danger text-[11px]" role="alert">
          {state.error}
        </p>
      )}

      {/* ─── Piano Roll Preview ─── */}
      {state.loaded && (
        <PianoRollPreview
          notes={state.allNotes}
          selectedTracks={state.selectedTracks}
          progressRef={state.progressRef}
          duration={state.duration}
          onSeek={actions.seek}
        />
      )}

      {/* ─── Transport Controls ─── */}
      {state.loaded && (
        <div className="space-y-1.5">
          {/* Buttons row */}
          <div className="flex items-center gap-2">
            {/* Play / Pause */}
            <button
              type="button"
              onClick={state.playing ? actions.pause : actions.play}
              aria-label={state.playing ? "Pause" : "Play"}
              className={`rounded border px-3 py-1 text-xs ${
                state.playing
                  ? "border-accent text-accent"
                  : "border-border text-text-muted hover:text-text"
              }`}
            >
              {state.playing ? "⏸ Pause" : "▶ Play"}
            </button>

            {/* Stop */}
            <button
              type="button"
              onClick={actions.stop}
              aria-label="Stop"
              className="border-border text-text-muted hover:text-text rounded border px-3 py-1 text-xs"
            >
              ⏹ Stop
            </button>

            <button
              type="button"
              onClick={actions.toggleLoop}
              aria-label="Toggle loop"
              aria-pressed={state.loopEnabled}
              className={`rounded border px-3 py-1 text-xs ${
                state.loopEnabled
                  ? "border-accent text-accent"
                  : "border-border text-text-muted hover:text-text"
              }`}
            >
              🔁 Loop {state.loopEnabled ? "On" : "Off"}
            </button>

            {/* Time display */}
            <span className="text-text-muted ml-auto font-mono text-[10px]">
              {formatTime(state.elapsed)} / {formatTime(state.duration)}
            </span>
          </div>

          {/* Progress bar */}
          <div
            ref={progressBarRef}
            className="bg-surface-alt relative h-2 w-full cursor-pointer rounded-full"
            onPointerDown={handleProgressPointerDown}
            onPointerMove={handleProgressPointerMove}
            onPointerUp={handleProgressPointerUp}
            onPointerCancel={handleProgressPointerUp}
          >
            <div
              className="bg-accent h-full rounded-full transition-[width] duration-75"
              style={{ width: `${state.progress * 100}%` }}
            />
            {/* Thumb */}
            <div
              className="bg-accent absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full shadow"
              style={{ left: `${state.progress * 100}%` }}
            />
          </div>
        </div>
      )}

      {/* ─── Track Selector ─── */}
      {state.loaded && state.tracks.length >= 2 && (
        <div className="space-y-1">
          <p className="text-text-muted text-[10px] font-semibold tracking-wider uppercase">
            Tracks
          </p>
          <div className="grid gap-1">
            {state.tracks.map((t) => (
              <label
                key={t.index}
                className="flex cursor-pointer items-center gap-2 text-xs"
              >
                <input
                  type="checkbox"
                  checked={state.selectedTracks.has(t.index)}
                  onChange={() => actions.toggleTrack(t.index)}
                  className="accent-accent h-3 w-3"
                />
                <span
                  className={
                    state.selectedTracks.has(t.index)
                      ? "text-text"
                      : "text-text-muted"
                  }
                >
                  {t.name}{" "}
                  <span className="text-text-muted text-[10px]">
                    ({t.noteCount} notes)
                  </span>
                </span>
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
