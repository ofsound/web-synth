/**
 * Web MIDI hardware input adapter.
 *
 * Requests MIDI access, tracks the browser permission state, and forwards
 * parsed MIDI events into the shared MidiBus.
 *
 * Returns:
 *   supported      — true when the Web MIDI API exists in this browser
 *   inputs         — display names of connected MIDI input devices
 *   permissionState — 'granted' | 'denied' | 'prompt' | 'unknown'
 */

import { useEffect, useState } from "react";
import type { MidiBus } from "./MidiBus";
import type { MidiEvent } from "./MidiBus";

export type MidiPermissionState = "granted" | "denied" | "prompt" | "unknown";

export function useWebMidiInput(midiBus: MidiBus) {
    const [supported, setSupported] = useState(false);
    const [inputs, setInputs] = useState<string[]>([]);
    const [permissionState, setPermissionState] = useState<MidiPermissionState>("unknown");

    useEffect(() => {
        if (!navigator.requestMIDIAccess) {
            queueMicrotask(() => setSupported(false));
            return;
        }
        queueMicrotask(() => setSupported(true));

        // Pre-query permission status so the UI can show a helpful message.
        if (navigator.permissions) {
            navigator.permissions
                .query({ name: "midi" as PermissionName })
                .then((status) => {
                    setPermissionState(status.state as MidiPermissionState);
                    status.onchange = () => {
                        setPermissionState(status.state as MidiPermissionState);
                    };
                })
                .catch(() => setPermissionState("unknown"));
        }

        let cancelled = false;
        let accessRef: MIDIAccess | null = null;
        const boundInputs = new Set<MIDIInput>();

        const onMessage = (e: MIDIMessageEvent) => {
            const data = e.data;
            if (!data || data.length < 3) return;
            const status = data[0];
            const d1 = data[1];
            const d2 = data[2];
            const channel = status & 0x0f;
            const cmd = status >> 4;

            let evt: MidiEvent | null = null;

            if (cmd === 9 && d2 > 0) {
                evt = { type: "noteon", channel, note: d1, velocity: d2 };
            } else if (cmd === 8 || (cmd === 9 && d2 === 0)) {
                evt = { type: "noteoff", channel, note: d1, velocity: 0 };
            } else if (cmd === 11) {
                evt = { type: "cc", channel, note: 0, velocity: 0, cc: d1, value: d2 };
            }

            if (evt) midiBus.emit(evt);
        };

        const unbindAllInputs = () => {
            for (const input of boundInputs) {
                input.onmidimessage = null;
            }
            boundInputs.clear();
        };

        const bindAllInputs = (access: MIDIAccess) => {
            unbindAllInputs();
            for (const input of access.inputs.values()) {
                input.onmidimessage = onMessage;
                boundInputs.add(input);
            }
        };

        const updateInputs = (access: MIDIAccess) => {
            if (cancelled) return;
            queueMicrotask(() => {
                if (cancelled) return;
                setInputs(
                    Array.from(access.inputs.values()).map(
                        (i) => i.name ?? "Unknown MIDI device",
                    ),
                );
            });
        };

        navigator
            .requestMIDIAccess({ sysex: false })
            .then((access) => {
                if (cancelled) return;
                accessRef = access;
                setPermissionState("granted");

                access.onstatechange = () => {
                    bindAllInputs(access);
                    updateInputs(access);
                };

                bindAllInputs(access);
                updateInputs(access);
            })
            .catch(() => {
                if (cancelled) return;
                setPermissionState("denied");
                queueMicrotask(() => {
                    if (cancelled) return;
                    setInputs([]);
                });
            });

        return () => {
            cancelled = true;
            if (accessRef) {
                accessRef.onstatechange = null;
            }
            unbindAllInputs();
        };
    }, [midiBus]);

    return { supported, inputs, permissionState };
}
