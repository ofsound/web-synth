/**
 * ParticleStorm — Three.js particle system driven by MIDI events.
 *
 * noteOn → burst of particles, velocity → count & speed, pitch → hue.
 * Particles have lifetime, gravity, and fade.  Pool of ~3000 recycled
 * oldest-first.
 */

import type { RefObject } from "react";
import * as THREE from "three";
import type { VisualizerScene } from "./types";
import type { MidiState } from "../useMidiState";
import type { MidiMapping, ResolvedParams } from "../MidiMapper";

const MAX_PARTICLES = 3000;
const BURST_SIZE = 40;
const PARTICLE_LIFETIME = 3;

export class ParticleStorm implements VisualizerScene {
  readonly id = "particle-storm";
  readonly name = "Particle Storm";
  readonly thumbnail = "🌪️";
  readonly type = "three" as const;
  readonly supportedTargets = [
    "hue",
    "size",
    "speed",
    "spread",
    "intensity",
  ] as const;

  readonly defaultMappings: MidiMapping[] = [
    { source: "pitch", target: "hue", range: [0, 1], curve: "linear" },
    { source: "velocity", target: "size", range: [0.3, 1], curve: "linear" },
    {
      source: "velocity",
      target: "speed",
      range: [0.5, 3],
      curve: "exponential",
    },
    { source: "density", target: "spread", range: [0.3, 1], curve: "linear" },
    {
      source: "polyphony",
      target: "intensity",
      range: [0.2, 1],
      curve: "linear",
    },
  ];

  private renderer: THREE.WebGLRenderer | null = null;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(60, 1, 0.1, 100);
  private geometry = new THREE.BufferGeometry();
  private material: THREE.PointsMaterial | null = null;
  private points: THREE.Points | null = null;

  private positions = new Float32Array(MAX_PARTICLES * 3);
  private colors = new Float32Array(MAX_PARTICLES * 3);
  private velocities = new Float32Array(MAX_PARTICLES * 3);
  private lifetimes = new Float32Array(MAX_PARTICLES);
  private ages = new Float32Array(MAX_PARTICLES);
  private sizes = new Float32Array(MAX_PARTICLES);
  private nextIdx = 0;
  private activeIndices = new Set<number>();

  init(canvas: HTMLCanvasElement, width: number, height: number) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      alpha: true,
      antialias: false,
    });
    this.renderer.setSize(width, height, false);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setClearColor(0x0f0f0f, 1);

    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.camera.position.z = 25;

    this.lifetimes.fill(0);
    this.ages.fill(999);
    this.sizes.fill(0);
    this.activeIndices.clear();

    this.geometry.setAttribute(
      "position",
      new THREE.BufferAttribute(this.positions, 3),
    );
    this.geometry.setAttribute(
      "color",
      new THREE.BufferAttribute(this.colors, 3),
    );

    this.material = new THREE.PointsMaterial({
      size: 0.3,
      vertexColors: true,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      sizeAttenuation: true,
    });

    this.points = new THREE.Points(this.geometry, this.material);
    this.scene.add(this.points);
  }

  update(
    resolved: ResolvedParams,
    state: MidiState,
    dt: number,
    lastProcessedEventIdRef: RefObject<number>,
  ) {
    if (!this.renderer) return;

    const hue = resolved.hue ?? 0.5;
    const sizeScale = resolved.size ?? 0.5;
    const speed = resolved.speed ?? 1;
    const spread = resolved.spread ?? 0.5;
    const intensity = resolved.intensity ?? 0.5;

    if (
      state.lastEvent?.type === "noteon" &&
      state.lastEvent.velocity > 0 &&
      state.lastEventId !== lastProcessedEventIdRef.current
    ) {
      lastProcessedEventIdRef.current = state.lastEventId;
      this.spawnBurst(
        hue,
        sizeScale,
        speed,
        spread,
        state.lastEvent.velocity / 127,
      );
    }

    const gravity = -2 * intensity;

    const toRemove: number[] = [];
    for (const i of this.activeIndices) {
      this.ages[i] += dt;
      const t = this.ages[i] / this.lifetimes[i];
      if (t >= 1) {
        this.sizes[i] = 0;
        toRemove.push(i);
        continue;
      }

      const i3 = i * 3;
      this.velocities[i3 + 1] += gravity * dt;
      this.positions[i3] += this.velocities[i3] * dt;
      this.positions[i3 + 1] += this.velocities[i3 + 1] * dt;
      this.positions[i3 + 2] += this.velocities[i3 + 2] * dt;

      const fade = 1 - t * t;
      this.colors[i3] *= 0.99;
      this.colors[i3 + 1] *= 0.99;
      this.colors[i3 + 2] = this.colors[i3 + 2] * 0.99 + fade * 0.002;
    }
    for (const i of toRemove) {
      this.activeIndices.delete(i);
    }

    const posAttr = this.geometry.getAttribute("position");
    (posAttr as THREE.BufferAttribute).needsUpdate = true;
    const colAttr = this.geometry.getAttribute("color");
    (colAttr as THREE.BufferAttribute).needsUpdate = true;

    if (this.material) {
      this.material.size = 0.15 + sizeScale * 0.45;
    }

    const t = performance.now() * 0.0001;
    this.camera.position.x = Math.sin(t) * 3;
    this.camera.position.y = Math.cos(t * 0.7) * 2;
    this.camera.lookAt(0, 0, 0);

    this.renderer.render(this.scene, this.camera);
  }

  resize(width: number, height: number) {
    if (!this.renderer) return;
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  dispose() {
    this.activeIndices.clear();
    this.geometry.dispose();
    this.material?.dispose();
    this.renderer?.dispose();
    this.renderer = null;
  }

  private spawnBurst(
    hue: number,
    sizeScale: number,
    speed: number,
    spread: number,
    velNorm: number,
  ) {
    const count = Math.floor(BURST_SIZE * (0.5 + velNorm * 0.5));
    const col = new THREE.Color().setHSL(hue, 0.8, 0.5 + velNorm * 0.3);

    for (let b = 0; b < count; b++) {
      const i = this.nextIdx;
      this.nextIdx = (this.nextIdx + 1) % MAX_PARTICLES;

      const i3 = i * 3;
      this.positions[i3] = (Math.random() - 0.5) * 2 * spread;
      this.positions[i3 + 1] = (Math.random() - 0.5) * 2 * spread;
      this.positions[i3 + 2] = (Math.random() - 0.5) * 2 * spread;

      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const r = speed * (1 + Math.random());
      this.velocities[i3] = r * Math.sin(phi) * Math.cos(theta) * spread * 6;
      this.velocities[i3 + 1] =
        r * Math.sin(phi) * Math.sin(theta) * spread * 6 + 3;
      this.velocities[i3 + 2] = r * Math.cos(phi) * spread * 4;

      this.colors[i3] = col.r + (Math.random() - 0.5) * 0.1;
      this.colors[i3 + 1] = col.g + (Math.random() - 0.5) * 0.1;
      this.colors[i3 + 2] = col.b + (Math.random() - 0.5) * 0.1;

      this.lifetimes[i] = PARTICLE_LIFETIME * (0.5 + Math.random() * 0.5);
      this.ages[i] = 0;
      this.sizes[i] = sizeScale;
      this.activeIndices.add(i);
    }
  }
}
