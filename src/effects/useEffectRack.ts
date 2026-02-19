/**
 * Effects Rack — manages serial/parallel routing of multiple effects.
 *
 * Patches between the master output's effectsSend and effectsReturn nodes.
 * Each effect exposes { input, output } (EffectIO).  The rack rewires
 * connections surgically whenever effects are enabled/disabled, reordered,
 * or the routing mode changes — only touching the nodes that need to change
 * rather than doing a full disconnect/reconnect (which causes audio clicks).
 *
 * Serial mode:
 *   effectsSend → fx1.in → fx1.out → fx2.in → fx2.out → effectsReturn
 *
 * Parallel mode:
 *   effectsSend ──┬─ fx1.in → fx1.out ─┬── effectsReturn
 *                 ├─ fx2.in → fx2.out ─┤
 *                 └─ fx3.in → fx3.out ─┘
 */

import { useEffect, useCallback, useRef, useState } from "react";
import type { EffectIO } from "../types/audio";

export interface EffectSlot {
  id: string;
  label: string;
  io: EffectIO | null;
  enabled: boolean;
}

export type RoutingMode = "serial" | "parallel";

// ─── Helpers ────────────────────────────────────────────────────────────────

function safeDisconnect(node: AudioNode, from?: AudioNode) {
  try {
    if (from) node.disconnect(from);
    else node.disconnect();
  } catch {
    /* ok — node was never connected */
  }
}

/**
 * Full (cold) rewire: disconnect everything and rebuild from scratch.
 * Used only when the routing mode flips or nodes are first created.
 */
function fullRewire(
  send: GainNode,
  ret: GainNode,
  slots: EffectSlot[],
  mode: RoutingMode,
) {
  safeDisconnect(send);
  for (const slot of slots) {
    if (slot.io) safeDisconnect(slot.io.output);
  }
  applyWiring(send, ret, slots, mode);
}

/**
 * Build connections for the current active-slot list without disconnecting
 * anything first.  Called by fullRewire after the slate is clean, and also
 * directly for surgical patching.
 */
function applyWiring(
  send: GainNode,
  ret: GainNode,
  slots: EffectSlot[],
  mode: RoutingMode,
) {
  const active = slots.filter((s) => s.enabled && s.io);

  if (active.length === 0) {
    send.connect(ret);
    return;
  }

  if (mode === "serial") {
    send.connect(active[0].io!.input);
    for (let i = 0; i < active.length - 1; i++) {
      active[i].io!.output.connect(active[i + 1].io!.input);
    }
    active[active.length - 1].io!.output.connect(ret);
  } else {
    for (const slot of active) {
      send.connect(slot.io!.input);
      slot.io!.output.connect(ret);
    }
  }
}

/**
 * Surgical serial-mode patch: given the previous and next active lists,
 * only rewire the seams that changed rather than the entire chain.
 *
 * Works by finding the first differing index and walking from there —
 * O(k) where k is the number of changed seams, vs O(n) for a full rewire.
 */
function surgicalSerialRewire(
  send: GainNode,
  ret: GainNode,
  prevActive: EffectSlot[],
  nextActive: EffectSlot[],
) {
  const prevLen = prevActive.length;
  const nextLen = nextActive.length;

  // Find first position where the active chain diverges
  let firstDiff = 0;
  while (
    firstDiff < prevLen &&
    firstDiff < nextLen &&
    prevActive[firstDiff].id === nextActive[firstDiff].id
  ) {
    firstDiff++;
  }

  if (firstDiff === prevLen && firstDiff === nextLen) return; // no change

  // Disconnect old seams starting from firstDiff
  const prevHead = firstDiff === 0 ? null : prevActive[firstDiff - 1];
  const prevTail = firstDiff < prevLen ? prevActive[firstDiff] : null;
  const prevEnd = prevActive[prevLen - 1] ?? null;

  // Remove: send→first or prev→current
  if (firstDiff === 0) {
    // Old head was prevActive[0] (or bypass via send→ret)
    if (prevLen === 0) {
      safeDisconnect(send, ret);
    } else {
      safeDisconnect(send, prevActive[0].io!.input);
    }
  } else if (prevHead) {
    if (prevTail) {
      safeDisconnect(prevHead.io!.output, prevTail.io!.input);
    } else {
      // prevHead was the last one → was connected to ret
      safeDisconnect(prevHead.io!.output, ret);
    }
  }

  // Disconnect the old tail seam to ret if the tail changed
  if (prevEnd && prevEnd !== prevActive[firstDiff - 1]) {
    safeDisconnect(prevEnd.io!.output, ret);
  }

  // Disconnect all old slots from firstDiff onward
  for (let i = firstDiff; i < prevLen; i++) {
    if (i + 1 < prevLen) {
      safeDisconnect(prevActive[i].io!.output, prevActive[i + 1].io!.input);
    }
    if (i === prevLen - 1) {
      safeDisconnect(prevActive[i].io!.output, ret);
    }
  }

  // Reconnect from firstDiff onward
  const newHead = firstDiff < nextLen ? nextActive[firstDiff] : null;

  if (firstDiff === 0) {
    if (nextLen === 0) {
      send.connect(ret);
    } else {
      send.connect(nextActive[0].io!.input);
    }
  } else if (prevHead) {
    if (newHead) {
      prevHead.io!.output.connect(newHead.io!.input);
    } else {
      // New chain ends before firstDiff — prevHead is now the last
      prevHead.io!.output.connect(ret);
    }
  }

  for (let i = firstDiff; i < nextLen; i++) {
    if (i + 1 < nextLen) {
      nextActive[i].io!.output.connect(nextActive[i + 1].io!.input);
    } else {
      nextActive[i].io!.output.connect(ret);
    }
  }
}

// ─── Wiring state snapshot ───────────────────────────────────────────────────

interface WiringState {
  send: GainNode;
  ret: GainNode;
  mode: RoutingMode;
  /** IDs of active (enabled + io ready) slots in order */
  activeIds: string[];
  activeSlots: EffectSlot[];
}

// ─── Hook ────────────────────────────────────────────────────────────────────

export function useEffectRack(
  effectsSend: GainNode | null,
  effectsReturn: GainNode | null,
) {
  const [slots, setSlots] = useState<EffectSlot[]>([]);
  const [routingMode, setRoutingMode] = useState<RoutingMode>("serial");

  /** Last applied wiring snapshot — used to compute surgical diffs. */
  const prevWiringRef = useRef<WiringState | null>(null);

  useEffect(() => {
    if (!effectsSend || !effectsReturn) return;

    const nextActive = slots.filter((s) => s.enabled && s.io);
    const nextActiveIds = nextActive.map((s) => s.id);
    const prev = prevWiringRef.current;

    const nodesChanged =
      !prev || prev.send !== effectsSend || prev.ret !== effectsReturn;
    const modeChanged = !prev || prev.mode !== routingMode;

    if (nodesChanged || modeChanged) {
      // Full rewire: routing mode flipped or audio graph nodes changed
      fullRewire(effectsSend, effectsReturn, slots, routingMode);
    } else if (routingMode === "serial") {
      // Surgical serial patch: only touch changed seams
      surgicalSerialRewire(
        effectsSend,
        effectsReturn,
        prev.activeSlots,
        nextActive,
      );
    } else {
      // Parallel: surgical is straightforward — diff the sets
      const prevIds = new Set(prev.activeIds);
      const nextIds = new Set(nextActiveIds);

      // Removed slots: disconnect from send and ret
      for (const slot of prev.activeSlots) {
        if (!nextIds.has(slot.id)) {
          safeDisconnect(effectsSend, slot.io!.input);
          safeDisconnect(slot.io!.output, effectsReturn);
        }
      }

      // Handle bypass toggle (0 ↔ >0)
      if (prev.activeIds.length === 0 && nextActiveIds.length > 0) {
        safeDisconnect(effectsSend, effectsReturn);
      } else if (prev.activeIds.length > 0 && nextActiveIds.length === 0) {
        effectsSend.connect(effectsReturn);
      }

      // Added slots: connect to send and ret
      for (const slot of nextActive) {
        if (!prevIds.has(slot.id)) {
          effectsSend.connect(slot.io!.input);
          slot.io!.output.connect(effectsReturn);
        }
      }
    }

    prevWiringRef.current = {
      send: effectsSend,
      ret: effectsReturn,
      mode: routingMode,
      activeIds: nextActiveIds,
      activeSlots: nextActive,
    };
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
