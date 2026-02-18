import { useEffect, useRef, useState, useCallback } from "react";

export interface MidiEvent {
    type: "noteon" | "noteoff" | "cc";
    channel: number;
    note: number;
    velocity: number;
    cc?: number;
    value?: number;
}

export function useMidi() {
    const [inputs, setInputs] = useState<MIDIInput[]>([]);
    const [supported, setSupported] = useState(false);
    const listenersRef = useRef<Set<(e: MidiEvent) => void>>(new Set());

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
                setInputs(Array.from(access.inputs.values()));
            };
            access.onstatechange = updateInputs;
            updateInputs();

            /* Listen on every input */
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
                    evt = {
                        type: "cc",
                        channel,
                        note: 0,
                        velocity: 0,
                        cc: d1,
                        value: d2,
                    };
                }

                if (evt) {
                    listenersRef.current.forEach((fn) => fn(evt!));
                }
            };

            for (const input of access.inputs.values()) {
                input.onmidimessage = onMessage;
            }
        });

        return () => {
            cancelled = true;
        };
    }, []);

    const subscribe = useCallback((fn: (e: MidiEvent) => void) => {
        listenersRef.current.add(fn);
        return () => {
            listenersRef.current.delete(fn);
        };
    }, []);

    return { inputs, supported, subscribe };
}
