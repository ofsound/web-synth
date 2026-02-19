/**
 * GeometricOrbits — Three.js scene where each active note spawns a
 * rotating polyhedron orbiting the centre.
 *
 * Pitch → orbit radius & shape type, velocity → scale pulse & orbit
 * speed, polyphony → camera distance, centroid → ambient light colour.
 * Note-off fades and shrinks the mesh via GSAP timelines.
 */

import type { RefObject } from "react";
import * as THREE from "three";
import gsap from "gsap";
import type { VisualizerScene } from "./types";
import type { MidiState } from "../useMidiState";
import type { MidiMapping, ResolvedParams } from "../MidiMapper";

// 12 pitch-class hues evenly distributed around the colour wheel
const PITCH_HUES = Array.from({ length: 12 }, (_, i) => i / 12);

const GEOMETRIES = [
  () => new THREE.IcosahedronGeometry(0.5, 0),
  () => new THREE.OctahedronGeometry(0.5, 0),
  () => new THREE.TetrahedronGeometry(0.5, 0),
  () => new THREE.DodecahedronGeometry(0.5, 0),
];

interface OrbitMesh {
  mesh: THREE.Mesh;
  note: number;
  angle: number;
  radius: number;
  speed: number; // rad/s
  tween: gsap.core.Tween | null;
}

export class GeometricOrbits implements VisualizerScene {
  readonly id = "geometric-orbits";
  readonly name = "Geometric Orbits";
  readonly thumbnail = "💎";
  readonly type = "three" as const;
  readonly supportedTargets = [
    "hue",
    "size",
    "speed",
    "rotation",
    "intensity",
  ] as const;

  readonly defaultMappings: MidiMapping[] = [
    { source: "pitch", target: "hue", range: [0, 1], curve: "linear" },
    {
      source: "velocity",
      target: "size",
      range: [0.4, 1.5],
      curve: "exponential",
    },
    { source: "velocity", target: "speed", range: [0.3, 2], curve: "linear" },
    {
      source: "polyphony",
      target: "rotation",
      range: [0.2, 2],
      curve: "linear",
    },
    {
      source: "density",
      target: "intensity",
      range: [0.3, 1],
      curve: "linear",
    },
  ];

  private renderer: THREE.WebGLRenderer | null = null;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(50, 1, 0.1, 200);
  private orbitGroup = new THREE.Group();
  private meshes = new Map<number, OrbitMesh>();
  private ambientLight = new THREE.AmbientLight(0x333366, 0.8);
  private pointLight = new THREE.PointLight(0xffffff, 1.5, 100);
  private lastNotes = new Set<number>();

  init(canvas: HTMLCanvasElement, width: number, height: number) {
    this.resetOrbits();
    this.lastNotes.clear();

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      alpha: true,
      antialias: true,
    });
    this.renderer.setSize(width, height, false);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setClearColor(0x0f0f0f, 1);

    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.camera.position.set(0, 8, 20);
    this.camera.lookAt(0, 0, 0);

    this.scene.add(this.ambientLight);
    this.pointLight.position.set(5, 10, 5);
    this.scene.add(this.pointLight);
    this.scene.add(this.orbitGroup);
  }

  update(
    resolved: ResolvedParams,
    state: MidiState,
    dt: number,
    lastProcessedEventIdRef: RefObject<number>,
  ) {
    void lastProcessedEventIdRef;
    if (!this.renderer) return;

    const sizeScale = resolved.size ?? 1;
    const speedMul = resolved.speed ?? 1;
    const intensity = resolved.intensity ?? 0.5;

    // Diff active notes vs tracked meshes
    const currentNotes = state.activeNotes;

    // Spawn new meshes for new notes
    for (const note of currentNotes.keys()) {
      if (!this.meshes.has(note)) {
        this.spawnMesh(
          note,
          state.activeNotes.get(note)!.velocity / 127,
          sizeScale,
        );
      }
    }

    // Release meshes for released notes
    for (const note of this.lastNotes) {
      if (!currentNotes.has(note) && this.meshes.has(note)) {
        this.releaseMesh(note);
      }
    }
    this.lastNotes.clear();
    for (const k of currentNotes.keys()) {
      this.lastNotes.add(k);
    }

    // Animate orbits
    for (const [, orb] of this.meshes) {
      orb.angle += orb.speed * speedMul * dt;
      orb.mesh.position.x = Math.cos(orb.angle) * orb.radius;
      orb.mesh.position.z = Math.sin(orb.angle) * orb.radius;
      orb.mesh.position.y = Math.sin(orb.angle * 0.5) * orb.radius * 0.15;
      orb.mesh.rotation.x += dt * 0.5;
      orb.mesh.rotation.y += dt * 0.8;
    }

    // Ambient light colour tracks centroid hue
    const centroidHue = (state.centroid % 12) / 12;
    this.ambientLight.color.setHSL(centroidHue, 0.4, 0.3 + intensity * 0.3);
    this.pointLight.intensity = 1 + intensity * 2;

    // Camera distance based on polyphony
    const targetDist = 15 + (1 - (resolved.rotation ?? 0.5)) * 15;
    this.camera.position.z += (targetDist - this.camera.position.z) * 0.05;

    // Slow orbit for the whole group
    this.orbitGroup.rotation.y += dt * 0.1;

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
    this.resetOrbits();
    this.lastNotes.clear();
    this.renderer?.dispose();
    this.renderer = null;
  }

  /* ---- internal ---- */

  private spawnMesh(note: number, velNorm: number, sizeScale: number) {
    const pitchClass = note % 12;
    const octave = Math.floor(note / 12);
    const hue = PITCH_HUES[pitchClass];
    const geomFactory = GEOMETRIES[pitchClass % GEOMETRIES.length];
    const geometry = geomFactory();
    const material = new THREE.MeshStandardMaterial({
      color: new THREE.Color().setHSL(hue, 0.7, 0.45),
      wireframe: true,
      emissive: new THREE.Color().setHSL(hue, 0.9, 0.2),
      emissiveIntensity: 0.6,
    });

    const mesh = new THREE.Mesh(geometry, material);
    const radius = 2 + octave * 1.8;
    const startAngle = Math.random() * Math.PI * 2;
    mesh.position.set(
      Math.cos(startAngle) * radius,
      0,
      Math.sin(startAngle) * radius,
    );
    mesh.scale.setScalar(0.01);
    this.orbitGroup.add(mesh);

    const orb: OrbitMesh = {
      mesh,
      note,
      angle: startAngle,
      radius,
      speed: 0.5 + velNorm * 2,
      tween: null,
    };

    // Animate scale in with GSAP
    const targetScale = sizeScale * (0.6 + velNorm * 0.8);
    orb.tween = gsap.to(mesh.scale, {
      x: targetScale,
      y: targetScale,
      z: targetScale,
      duration: 0.15,
      ease: "back.out(2)",
    });

    this.meshes.set(note, orb);
  }

  private releaseMesh(note: number) {
    const orb = this.meshes.get(note);
    if (!orb) return;

    orb.tween?.kill();
    // Keep the mesh in the map during the release tween so dispose() can find it
    const releaseTween = gsap.to(orb.mesh.scale, {
      x: 0,
      y: 0,
      z: 0,
      duration: 0.6,
      ease: "power2.in",
      onComplete: () => {
        this.orbitGroup.remove(orb.mesh);
        orb.mesh.geometry.dispose();
        (orb.mesh.material as THREE.Material).dispose();
        this.meshes.delete(note);
      },
    });
    orb.tween = releaseTween;
  }

  private resetOrbits() {
    for (const [, orb] of this.meshes) {
      orb.tween?.kill();
      this.orbitGroup.remove(orb.mesh);
      orb.mesh.geometry.dispose();
      (orb.mesh.material as THREE.Material).dispose();
    }
    this.meshes.clear();
  }
}
