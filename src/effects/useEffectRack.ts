/**
 * Effects Rack — manages serial/parallel routing of multiple effects.
 *
 * Patches between the master output's effectsSend and effectsReturn nodes.
 * Each effect exposes { input, output } (EffectIO).  The rack rewires
 * connections whenever effects are enabled/disabled, reordered, or the
 * routing mode changes.
 *
 * Serial mode:
 *   effectsSend → fx1.in → fx1.out → fx2.in → fx2.out → effectsReturn
 *
 * Parallel mode:
 *   effectsSend ──┬─ fx1.in → fx1.out ─┬── effectsReturn
 *                 ├─ fx2.in → fx2.out ─┤
 *                 └─ fx3.in → fx3.out ─┘
 */

import { useEffect, useCallback, useState } from "react";
import type { EffectIO } from "../types/audio";

export interface EffectSlot {
  id: string;
  label: string;
  io: EffectIO | null;
  enabled: boolean;
}

export type RoutingMode = "serial" | "parallel";

/**
 * Rebuild the entire audio routing graph.
 * Pure function — no React refs or state.
 */
function rewire(
  send: GainNode,
  ret: GainNode,
  slots: EffectSlot[],
  mode: RoutingMode,
) {
  // First, disconnect effectsSend from everything
  try {
    send.disconnect();
  } catch {
    /* ok */
  }

  // Disconnect all effect outputs
  for (const slot of slots) {
    if (slot.io) {
      try {
        slot.io.output.disconnect();
      } catch {
        /* ok */
      }
    }
  }

  const active = slots.filter((s) => s.enabled && s.io);

  if (active.length === 0) {
    // Bypass: direct connection
    send.connect(ret);
    return;
  }

  if (mode === "serial") {
    // Chain: send → fx1 → fx2 → ... → return
    send.connect(active[0].io!.input);
    for (let i = 0; i < active.length - 1; i++) {
      active[i].io!.output.connect(active[i + 1].io!.input);
    }
    active[active.length - 1].io!.output.connect(ret);
  } else {
    // Parallel: send → all fx inputs, all fx outputs → return
    for (const slot of active) {
      send.connect(slot.io!.input);
      slot.io!.output.connect(ret);
    }
  }
}

export function useEffectRack(
  effectsSend: GainNode | null,
  effectsReturn: GainNode | null,
) {
  const [slots, setSlots] = useState<EffectSlot[]>([]);
  const [routingMode, setRoutingMode] = useState<RoutingMode>("serial");

  // Single consolidated effect: rewire whenever any dependency changes.
  // All values are read directly from state/props — no stale-ref timing issues.
  useEffect(() => {
    if (!effectsSend || !effectsReturn) return;
    rewire(effectsSend, effectsReturn, slots, routingMode);
  }, [effectsSend, effectsReturn, slots, routingMode]);

  /** Register an effect into the rack. Call order determines initial position. */
  const registerEffect = useCallback(
    (id: string, label: string, io: EffectIO | null) => {
      setSlots((prev) => {
        const existing = prev.find((s) => s.id === id);
        if (existing) {
          // Update IO reference
          return prev.map((s) => (s.id === id ? { ...s, io } : s));
        }
        return [...prev, { id, label, io, enabled: false }];
      });
    },
    [],
  );

  /** Register multiple effects in one batch. Reduces re-renders and rewires. */
  const registerEffects = useCallback(
    (effects: Array<{ id: string; label: string; io: EffectIO | null }>) => {
      setSlots((prev) => {
        let next = [...prev];
        for (const { id, label, io } of effects) {
          const existing = next.find((s) => s.id === id);
          if (existing) {
            next = next.map((s) => (s.id === id ? { ...s, io } : s));
          } else {
            next = [...next, { id, label, io, enabled: false }];
          }
        }
        return next;
      });
    },
    [],
  );

  /** Toggle an effect on/off. */
  const toggleEffect = useCallback((id: string) => {
    setSlots((prev) =>
      prev.map((s) => (s.id === id ? { ...s, enabled: !s.enabled } : s)),
    );
  }, []);

  /** Enable/disable an effect explicitly. */
  const setEffectEnabled = useCallback((id: string, enabled: boolean) => {
    setSlots((prev) => prev.map((s) => (s.id === id ? { ...s, enabled } : s)));
  }, []);

  /** Move an effect in the ordering. */
  const moveEffect = useCallback((id: string, direction: "up" | "down") => {
    setSlots((prev) => {
      const idx = prev.findIndex((s) => s.id === id);
      if (idx < 0) return prev;
      const newIdx = direction === "up" ? idx - 1 : idx + 1;
      if (newIdx < 0 || newIdx >= prev.length) return prev;
      const copy = [...prev];
      [copy[idx], copy[newIdx]] = [copy[newIdx], copy[idx]];
      return copy;
    });
  }, []);

  return {
    slots,
    routingMode,
    setRoutingMode,
    registerEffect,
    registerEffects,
    toggleEffect,
    setEffectEnabled,
    moveEffect,
  };
}
