/**
 * VisualizerCanvas — main container that hosts the active visualiser
 * scene and drives the animation loop.
 *
 * Manages:
 * - Single <canvas> element shared across all scenes
 * - Scene lifecycle (init → animate → dispose)
 * - MIDI state + mapper integration per frame
 * - Resize observer for responsive sizing
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MidiBus } from "../midi/MidiBus";
import { useMidiState } from "./useMidiState";
import type { MidiState } from "./useMidiState";
import { resolve } from "./MidiMapper";
import type { MidiMapping } from "./MidiMapper";
import { createScenes } from "./scenes";
import type { VisualizerScene } from "./scenes/types";
import { ThumbnailStrip } from "./ThumbnailStrip.tsx";
import { MappingModal } from "./MappingModal.tsx";

/* ------------------------------------------------------------------ */
/*  Hook: scene lifecycle                                             */
/* ------------------------------------------------------------------ */

function useVisualizerLoop(
  canvasRef: React.RefObject<HTMLCanvasElement | null>,
  scene: VisualizerScene | null,
  midiStateRef: React.RefObject<MidiState>,
  mappings: MidiMapping[],
) {
  const rafRef = useRef(0);
  const prevTimeRef = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !scene) return;

    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio, 2);
    const w = Math.round(rect.width * dpr);
    const h = Math.round(rect.height * dpr);
    canvas.width = w;
    canvas.height = h;

    scene.init(canvas, w, h);
    prevTimeRef.current = performance.now();

    const loop = (now: number) => {
      const dt = Math.min((now - prevTimeRef.current) / 1000, 0.1); // cap dt at 100 ms
      prevTimeRef.current = now;

      const state = midiStateRef.current;
      const resolved = resolve(state, mappings);
      scene.update(resolved, state, dt);

      // Clear lastEvent trigger so it only fires once
      if (state.lastEvent) {
        state.lastEvent = null;
      }

      rafRef.current = requestAnimationFrame(loop);
    };

    rafRef.current = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(rafRef.current);
      scene.dispose();
    };
    // Re-init when scene or mappings identity change
  }, [canvasRef, scene, midiStateRef, mappings]);
}

/* ------------------------------------------------------------------ */
/*  Component                                                         */
/* ------------------------------------------------------------------ */

export function VisualizerCanvas({ midiBus }: { midiBus: MidiBus }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const midiStateRef = useMidiState(midiBus);

  // Scenes — stable array created once (useMemo, not useRef, so it's
  // accessible during render without violating react-hooks/refs).
  const scenes = useMemo(() => createScenes(), []);

  const defaultMappings = useMemo<Record<string, MidiMapping[]>>(() => {
    const map: Record<string, MidiMapping[]> = {};
    for (const scene of scenes) {
      map[scene.id] = [...scene.defaultMappings];
    }
    return map;
  }, [scenes]);

  const [activeIdx, setActiveIdx] = useState(0);
  const activeScene = scenes[activeIdx] ?? null;

  // Mappings (per scene, start with defaults)
  const [mappingsMap, setMappingsMap] =
    useState<Record<string, MidiMapping[]>>(defaultMappings);

  const activeId = activeScene?.id ?? "";
  const activeMappings = activeId ? (mappingsMap[activeId] ?? []) : [];

  const handleMappingsChange = useCallback(
    (id: string, newMappings: MidiMapping[]) => {
      setMappingsMap((prev) => ({ ...prev, [id]: newMappings }));
    },
    [],
  );

  // Settings modal
  const [showModal, setShowModal] = useState(false);

  // Drive the animation loop
  useVisualizerLoop(canvasRef, activeScene, midiStateRef, activeMappings);

  // Resize observer
  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas || !activeScene) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        const dpr = Math.min(window.devicePixelRatio, 2);
        const w = Math.round(width * dpr);
        const h = Math.round(height * dpr);
        canvas.width = w;
        canvas.height = h;
        activeScene.resize(w, h);
      }
    });

    observer.observe(container);
    return () => observer.disconnect();
  }, [activeScene]);

  return (
    <div className="flex h-full flex-col">
      {/* Toolbar: thumbnail strip + settings gear */}
      <div className="border-border flex items-center gap-2 border-b px-2 py-1.5">
        <ThumbnailStrip
          scenes={scenes}
          activeIdx={activeIdx}
          onSelect={setActiveIdx}
        />
        <button
          type="button"
          onClick={() => setShowModal(true)}
          aria-label="Open MIDI mapping settings"
          aria-haspopup="dialog"
          aria-expanded={showModal}
          className="text-text-muted hover:text-accent ml-auto rounded p-1 text-sm"
          title="MIDI Mapping Settings"
        >
          ⚙️
        </button>
      </div>

      {/* Canvas container */}
      <div ref={containerRef} className="relative min-h-0 flex-1">
        <canvas
          ref={canvasRef}
          className="absolute inset-0 h-full w-full"
          style={{ imageRendering: "auto" }}
        />
      </div>

      {/* Mapping modal */}
      {showModal && activeScene && (
        <MappingModal
          scene={activeScene}
          mappings={activeMappings}
          onChange={(m: MidiMapping[]) => handleMappingsChange(activeId, m)}
          onClose={() => setShowModal(false)}
        />
      )}
    </div>
  );
}
