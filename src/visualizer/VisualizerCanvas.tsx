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

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from "react";
import type { MidiBus } from "../midi/MidiBus";
import { useMidiState } from "./useMidiState";
import type { MidiState } from "./useMidiState";
import { resolve } from "./MidiMapper";
import type { MidiMapping } from "./MidiMapper";
import { createScenes } from "./scenes";
import type { VisualizerScene } from "./scenes/types";
import { ThumbnailStrip } from "./ThumbnailStrip.tsx";
import { MappingModal } from "./MappingModal.tsx";

function useVisualizerLoop(
  containerRef: RefObject<HTMLDivElement | null>,
  canvasRef: RefObject<HTMLCanvasElement | null>,
  scene: VisualizerScene | null,
  midiStateRef: RefObject<MidiState>,
  mappings: MidiMapping[],
) {
  const rafRef = useRef(0);
  const prevTimeRef = useRef(0);
  const lastProcessedEventIdRef = useRef(-1);
  const loopStartedRef = useRef(false);

  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas || !scene) return;

    loopStartedRef.current = false;

    const startLoopIfReady = (deviceW: number, deviceH: number) => {
      if (deviceW <= 0 || deviceH <= 0 || loopStartedRef.current) return;

      canvas.width = deviceW;
      canvas.height = deviceH;
      scene.init(canvas, deviceW, deviceH);
      loopStartedRef.current = true;
      prevTimeRef.current = performance.now();

      const loop = (now: number) => {
        const dt = Math.min((now - prevTimeRef.current) / 1000, 0.1);
        prevTimeRef.current = now;

        const state = midiStateRef.current;
        const resolved = resolve(state, mappings);
        scene.update(resolved, state, dt, lastProcessedEventIdRef);

        rafRef.current = requestAnimationFrame(loop);
      };

      rafRef.current = requestAnimationFrame(loop);
    };

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        const dpr = Math.min(window.devicePixelRatio, 2);
        const w = Math.round(width * dpr);
        const h = Math.round(height * dpr);
        canvas.width = w;
        canvas.height = h;

        if (loopStartedRef.current) {
          scene.resize(w, h);
        } else if (w > 0 && h > 0) {
          startLoopIfReady(w, h);
        }
      }
    });

    observer.observe(container);

    return () => {
      observer.disconnect();
      cancelAnimationFrame(rafRef.current);
      scene.dispose();
    };
  }, [containerRef, canvasRef, scene, midiStateRef, mappings]);
}

export function VisualizerCanvas({ midiBus }: { midiBus: MidiBus }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const midiStateRef = useMidiState(midiBus);

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

  const [showModal, setShowModal] = useState(false);

  useVisualizerLoop(containerRef, canvasRef, activeScene, midiStateRef, activeMappings);

  return (
    <div className="flex h-full flex-col">
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

      <div ref={containerRef} className="relative min-h-0 flex-1">
        <canvas
          ref={canvasRef}
          className="absolute inset-0 h-full w-full"
          style={{ imageRendering: "auto" }}
        />
      </div>

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
