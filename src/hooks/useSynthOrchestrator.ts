/**
 * Orchestrator hook — wires up synth engines, effects rack, and master output.
 *
 * Extracts the "audio plumbing" that was previously inlined inside
 * Workstation.tsx into a single composable unit.  The root component
 * only needs to render UI and pass the returned params/setters.
 */

import { useEffect } from "react";
import { useFMSynth } from "../synth/useFMSynth";
import { useSubtractiveSynth } from "../synth/useSubtractiveSynth";
import { useGranularSynth } from "../synth/useGranularSynth";
import { useDelay } from "../effects/useDelay";
import { usePhaser } from "../effects/usePhaser";
import { useBitcrusher } from "../effects/useBitcrusher";
import { useEffectRack } from "../effects/useEffectRack";
import { useMasterOutput } from "../master/useMasterOutput";
import type { MidiBus } from "../midi/MidiBus";

export interface SynthChannels {
    fmChannel: number | null;
    subChannel: number | null;
    granChannel: number | null;
}

export function useSynthOrchestrator(
    ctx: AudioContext | null,
    midiBus: MidiBus,
    channels: SynthChannels,
) {
    // ── Master output chain ──
    const { nodes: master, masterVolume, setMasterVolume } = useMasterOutput(ctx);

    // ── Synth engines ──
    const fmSynth = useFMSynth(ctx, midiBus, channels.fmChannel);
    const subSynth = useSubtractiveSynth(ctx, midiBus, channels.subChannel);
    const granSynth = useGranularSynth(ctx, midiBus, channels.granChannel);

    // Connect synth outputs → synthMix
    useEffect(() => {
        if (!master) return;
        const connections: { node: GainNode | null; target: GainNode }[] = [
            { node: fmSynth.outputNode, target: master.synthMix },
            { node: subSynth.outputNode, target: master.synthMix },
            { node: granSynth.outputNode, target: master.synthMix },
        ];
        for (const c of connections) {
            if (c.node) c.node.connect(c.target);
        }
        return () => {
            for (const c of connections) {
                if (c.node) {
                    try {
                        c.node.disconnect(c.target);
                    } catch {
                        /* ok */
                    }
                }
            }
        };
    }, [master, fmSynth.outputNode, subSynth.outputNode, granSynth.outputNode]);

    // ── Effects ──
    const delay = useDelay(ctx);
    const phaser = usePhaser(ctx);
    const bitcrusher = useBitcrusher(ctx);

    const effectRack = useEffectRack(
        master?.effectsSend ?? null,
        master?.effectsReturn ?? null,
    );
    // Register effects once when master nodes and effect IOs are ready.
    // Re-run when IO refs change (e.g. after ctx resume) so wiring stays correct.
    useEffect(() => {
        if (!master?.effectsSend || !master?.effectsReturn) return;
        effectRack.registerEffects([
            { id: "delay", label: "Delay / Echo", io: delay.io },
            { id: "phaser", label: "Phaser", io: phaser.io },
            { id: "bitcrusher", label: "Bitcrusher", io: bitcrusher.io },
        ]);
    }, [master?.effectsSend, master?.effectsReturn, delay.io, phaser.io, bitcrusher.io, effectRack.registerEffects]);

    return {
        master,
        masterVolume,
        setMasterVolume,
        fmSynth,
        subSynth,
        granSynth,
        delay,
        phaser,
        bitcrusher,
        effectRack,
    };
}
