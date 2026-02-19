/**
 * VisualizerCanvas — main container that hosts the active visualiser
 * scene and drives the animation loop.
 *
 * Manages:
 * - Dedicated <canvas> elements for WebGL and Canvas2D scenes
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
import { SCENE_METAS, createScene } from "./scenes";
import type { VisualizerScene } from "./scenes/types";
import { ThumbnailStrip } from "./ThumbnailStrip.tsx";
import { MappingModal } from "./MappingModal.tsx";

function useVisualizerLoop(
  containerRef: RefObject<HTMLDivElement | null>,
  canvasRef: RefObject<HTMLCanvasElement | null>,
  scene: VisualizerScene | null,
  midiStateRef: RefObject<MidiState>,
  mappingsRef: RefObject<MidiMapping[]>,
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
    let isVisible = document.visibilityState === "visible";

    const startLoopIfReady = (deviceW: number, deviceH: number) => {
      if (deviceW <= 0 || deviceH <= 0 || loopStartedRef.current) return;

      canvas.width = deviceW;
      canvas.height = deviceH;
      scene.init(canvas, deviceW, deviceH);
      loopStartedRef.current = true;
      prevTimeRef.current = performance.now();

      const loop = (now: number) => {
        if (!isVisible) {
          // Pause rendering when tab is hidden to save battery
          rafRef.current = requestAnimationFrame(loop);
          prevTimeRef.current = now;
          return;
        }

        const dt = Math.min((now - prevTimeRef.current) / 1000, 0.1);
        prevTimeRef.current = now;

        const state = midiStateRef.current;
        const resolved = resolve(state, mappingsRef.current);
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

    const handleVisibilityChange = () => {
      isVisible = document.visibilityState === "visible";
      if (isVisible && loopStartedRef.current) {
        // Reset prevTime to avoid large dt jump when resuming
        prevTimeRef.current = performance.now();
      }
    };

    observer.observe(container);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      cancelAnimationFrame(rafRef.current);
      scene.dispose();
    };
  }, [containerRef, canvasRef, scene, midiStateRef, mappingsRef]);
}

export function VisualizerCanvas({ midiBus }: { midiBus: MidiBus }) {
  const webglCanvasRef = useRef<HTMLCanvasElement>(null);
  const canvas2dRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const midiStateRef = useMidiState(midiBus);

  const [activeIdx, setActiveIdx] = useState(0);

  // One scene instance at a time — created fresh when the user switches scenes.
  // The outgoing instance is disposed by useVisualizerLoop’s cleanup effect.
  const [activeScene, setActiveScene] = useState<VisualizerScene | null>(() =>
    createScene(0),
  );
  useEffect(() => {
    setActiveScene(createScene(activeIdx));
  }, [activeIdx]);

  // Canvas ref tracks the active scene’s renderer type.
  const activeCanvasRef =
    activeScene?.type === "canvas2d" ? canvas2dRef : webglCanvasRef;

  // Mappings are initialised from static metadata — no scene instances needed.
  const [mappingsMap, setMappingsMap] = useState<Record<string, MidiMapping[]>>(
    () =>
      Object.fromEntries(
        SCENE_METAS.map((m) => [m.id, [...m.defaultMappings]]),
      ),
  );

  const activeMeta = SCENE_METAS[activeIdx] ?? SCENE_METAS[0];
  const activeId = activeMeta.id;
  const activeMappings = useMemo(
    () => mappingsMap[activeId] ?? [],
    [mappingsMap, activeId],
  );
  const activeMappingsRef = useRef<MidiMapping[]>(activeMappings);

  useEffect(() => {
    activeMappingsRef.current = activeMappings;
  }, [activeMappings]);

  const handleMappingsChange = useCallback(
    (id: string, newMappings: MidiMapping[]) => {
      setMappingsMap((prev) => ({ ...prev, [id]: newMappings }));
    },
    [],
  );

  const [showModal, setShowModal] = useState(false);

  useVisualizerLoop(
    containerRef,
    activeCanvasRef,
    activeScene,
    midiStateRef,
    activeMappingsRef,
  );

  return (
    <div className="flex h-full flex-col">
      <div className="border-border flex items-center gap-2 border-b px-2 py-1.5">
        <ThumbnailStrip
          scenes={SCENE_METAS}
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
        {activeScene?.type === "three" && (
          <canvas
            ref={webglCanvasRef}
            className="absolute inset-0 h-full w-full"
            style={{ imageRendering: "auto" }}
          />
        )}
        {activeScene?.type === "canvas2d" && (
          <canvas
            ref={canvas2dRef}
            className="absolute inset-0 h-full w-full"
            style={{ imageRendering: "auto" }}
          />
        )}
      </div>

      {showModal && (
        <MappingModal
          scene={activeMeta}
          mappings={activeMappings}
          onChange={(m: MidiMapping[]) => handleMappingsChange(activeId, m)}
          onClose={() => setShowModal(false)}
        />
      )}
    </div>
  );
}
