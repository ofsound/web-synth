/**
 * Web MIDI hardware input adapter.
 *
 * Reuses the logic from useMidi.ts but forwards parsed events
 * into the shared MidiBus instead of providing its own subscriber.
 */

import { useEffect, useState } from "react";
import type { MidiBus } from "./MidiBus";
import type { MidiEvent } from "./MidiBus";

export function useWebMidiInput(midiBus: MidiBus) {
    const [supported, setSupported] = useState(false);
    const [inputs, setInputs] = useState<string[]>([]);

    useEffect(() => {
        if (!navigator.requestMIDIAccess) {
            queueMicrotask(() => setSupported(false));
            return;
        }
        queueMicrotask(() => setSupported(true));

        let cancelled = false;

        navigator.requestMIDIAccess().then((access) => {
            if (cancelled) return;

            const updateInputs = () => {
                setInputs(
                    Array.from(access.inputs.values()).map(
                        (i) => i.name ?? "Unknown MIDI device",
                    ),
                );
            };
            access.onstatechange = updateInputs;
            updateInputs();

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

            for (const input of access.inputs.values()) {
                input.onmidimessage = onMessage;
            }
        });

        return () => {
            cancelled = true;
        };
    }, [midiBus]);

    return { supported, inputs };
}
