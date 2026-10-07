"use client";

/* eslint-disable react-hooks/immutability -- three.js state (the shared `world`, buffers, materials) is
   mutated every frame inside useFrame by design; it never drives React rendering. */

import { Canvas, useFrame } from "@react-three/fiber";
import { Environment, Grid, Lightformer, MeshReflectorMaterial, Sparkles } from "@react-three/drei";
import { Bloom, ChromaticAberration, EffectComposer, Noise, Vignette } from "@react-three/postprocessing";
import { BlendFunction, type ChromaticAberrationEffect } from "postprocessing";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { setHealth, sfx } from "./sfx";
import type { ChainRing, VaultEvent, VaultTarget } from "./types";

/* ── Layout ─────────────────────────────────────────────────────────────── */

const DAIS_TOP = 0.5;
const DAIS_R = 4.6;
const LANTERN_Y = 6.4;
const GATE_POS = new THREE.Vector3(12.5, 6.4, -12);
const GATE_ROT_Y = -0.62;
const GATE_SCALE = 0.56;
const MAX_BARS = 360;
const BW = 0.6;
const BH = 0.2;
const BD = 0.3;
const GAP = 0.05;
const MAX_ORBS = 160;
const PARTICLES = 6000;
const PETALS = 8;
const SHOCKS = 10;

/* ── Palette (values > 1 are HDR and feed the bloom pass) ───────────────── */

const GOLD = new THREE.Color(1.0, 0.66, 0.24);
const HOT = new THREE.Color(7, 2.2, 0.5);
const RED = new THREE.Color(1, 0.1, 0.05);
const AMBER = new THREE.Color(1, 0.42, 0.08);
const WARM = new THREE.Color(1, 0.72, 0.32);
const RED_HDR = new THREE.Color(4, 0.3, 0.15);
const CRE_HDR = new THREE.Color(0.5, 0.9, 4);
const GOLD_HDR = new THREE.Color(4, 2.6, 0.9);
const LASER_HDR = new THREE.Color(9, 0.8, 0.7);
const DUST = new THREE.Color(0.9, 0.7, 0.4);

function healthColor(level: number, out: THREE.Color) {
  if (level < 0.9) return out.copy(RED).lerp(AMBER, level / 0.9);
  return out.copy(AMBER).lerp(WARM, Math.min(1, (level - 0.9) / 0.1));
}

const easeInOut = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
const damp = (dt: number, rate: number) => 1 - Math.exp(-dt * rate);

/* ── Shared mutable world (read/written inside useFrame, never via React state) ── */

interface EmitOpts {
  speed?: number;
  up?: number;
  life?: number;
  spread?: number;
  size?: number;
  gravity?: number;
}

interface World {
  time: number;
  shake: number;
  aberration: number;
  /** Smoothed backing level 0..1 (drives lantern, gauge, orbs). */
  level: number;
  /** Smoothed gate openness 0..1; -1 until the first frame. */
  gate: number;
  barMode: "sky" | "split" | "lantern";
  laser: number;
  beam: number;
  beamArrived: boolean;
  portalFlash: number;
  /** Eased gate openness, for the gate label. */
  gateShown: number;
  apex: THREE.Vector3;
  comets: { t: number; from: THREE.Vector3; ctrl: THREE.Vector3; to: THREE.Vector3 }[];
  lastThud: number;
  emit: (p: THREE.Vector3, n: number, color: THREE.Color, o?: EmitOpts) => void;
  shock: (p: THREE.Vector3, color: THREE.Color, o?: { vertical?: boolean; size?: number; dur?: number; rotY?: number }) => void;
}

function createWorld(): World {
  return {
    time: 0,
    shake: 0,
    aberration: 0,
    level: 0,
    gate: -1,
    barMode: "sky",
    laser: -1,
    beam: -1,
    beamArrived: false,
    portalFlash: 0,
    gateShown: 1,
    apex: new THREE.Vector3(0, 2.2, 0),
    comets: [],
    lastThud: 0,
    emit: () => {},
    shock: () => {},
  };
}

type TargetRef = React.RefObject<VaultTarget & { started: boolean; reduced: boolean }>;

/* ── Public component ───────────────────────────────────────────────────── */

export default function VaultScene({
  target,
  events,
  started,
  reduced,
}: {
  target: VaultTarget;
  events: React.RefObject<VaultEvent[]>;
  started: boolean;
  reduced: boolean;
}) {
  const world = useMemo(() => createWorld(), []);
  const targetRef = useRef({ ...target, started, reduced });
  useEffect(() => {
    targetRef.current = { ...target, started, reduced };
  }, [target, started, reduced]);

  const labelEls = useRef<(HTMLDivElement | null)[]>([]);
  const chains = target.chains.slice(0, RINGS.length);
  const anchors = useMemo(
    () => [...RINGS.map((_, i) => ringPoint(i, 0.42, new THREE.Vector3())), GATE_POS.clone().setY(GATE_POS.y + 10.8 * GATE_SCALE)],
    [],
  );

  return (
    <div className="relative h-full w-full">
    <Canvas
      dpr={[1, 1.75]}
      camera={{ position: [0, 36, 64], fov: 40, near: 0.1, far: 220 }}
      gl={{ antialias: false, powerPreference: "high-performance" }}
      aria-label="Lantern vault: gold bars are custodian shares, orbiting lights are tokens, the ring on the right is the mint gate"
    >
      <color attach="background" args={["#04050a"]} />
      <fog attach="fog" args={["#04050a", 28, 75]} />
      <ambientLight intensity={0.2} />
      <directionalLight position={[-10, 12, -8]} intensity={0.7} color="#6f8cff" />
      <spotLight position={[0, 13, 6]} angle={0.45} penumbra={0.8} intensity={320} color="#ffd59a" />

      <Environment resolution={256} frames={1}>
        <Lightformer form="rect" intensity={2.2} color="#ffd9a0" position={[0, 6, -8]} scale={[12, 2, 1]} />
        <Lightformer form="rect" intensity={1.2} color="#7aa2ff" position={[-9, 3, 4]} rotation-y={Math.PI / 2} scale={[10, 3, 1]} />
        <Lightformer form="ring" intensity={3} color="#ffb766" position={[0, 9, 5]} scale={4} />
        <Lightformer form="rect" intensity={0.8} color="#ffffff" position={[9, 2, 6]} rotation-y={-Math.PI / 2} scale={[8, 1, 1]} />
      </Environment>

      <Director world={world} events={events} targetRef={targetRef} />
      <Rig world={world} targetRef={targetRef} />
      <Floor />
      <Dais world={world} targetRef={targetRef} />
      <Bars world={world} targetRef={targetRef} />
      <Lantern world={world} targetRef={targetRef} />
      <TokenRings world={world} targetRef={targetRef} chains={target.chains} />
      <Gate world={world} targetRef={targetRef} />
      <Laser world={world} />
      <Beam world={world} />
      <Comets world={world} />
      <Shockwaves world={world} />
      <Particles world={world} />
      <Sparkles count={160} scale={[36, 14, 36]} position={[0, 7, -2]} size={2.2} speed={0.25} opacity={0.55} color="#ffcf7a" />

      <Post world={world} />
      <LabelProjector world={world} anchors={anchors} els={labelEls} />
    </Canvas>
      {/* Plain DOM labels, positioned each frame by LabelProjector (cheaper than one React root per label). */}
      <div className={`pointer-events-none absolute inset-0 overflow-hidden transition-opacity duration-1000 ${started ? "opacity-100" : "opacity-0"}`} aria-hidden>
        {chains.map((ch, i) => (
          <div key={ch.key} ref={(el) => void (labelEls.current[i] = el)} className="absolute left-0 top-0 whitespace-nowrap font-mono text-[10px] tracking-[0.2em] opacity-80" style={{ color: ch.color, textShadow: "0 0 8px rgba(0,0,0,.9)" }}>
            {ch.label.toUpperCase()} · {ch.supply.toLocaleString("en-US", { maximumFractionDigits: 2 })}
            <span className="ml-1 opacity-60">{ch.gated ? "GATED" : "MONITORED"}</span>
          </div>
        ))}
        <div ref={(el) => void (labelEls.current[RINGS.length] = el)} className="absolute left-0 top-0 whitespace-nowrap font-mono text-[11px] tracking-[0.3em]" style={{ textShadow: "0 0 10px rgba(0,0,0,.9)" }} />
      </div>
    </div>
  );
}

/** Projects 3D anchor points to screen space and moves the overlay labels there. */
function LabelProjector({ world, anchors, els }: { world: World; anchors: THREE.Vector3[]; els: React.RefObject<(HTMLDivElement | null)[]> }) {
  const v = useMemo(() => new THREE.Vector3(), []);
  useFrame((state) => {
    const { width, height } = state.size;
    anchors.forEach((a, i) => {
      const el = els.current[i];
      if (!el) return;
      v.copy(a).project(state.camera);
      el.style.visibility = v.z < 1 ? "visible" : "hidden";
      el.style.transform = `translate(${(v.x * 0.5 + 0.5) * width}px, ${(-v.y * 0.5 + 0.5) * height}px) translate(-50%, -50%)`;
    });
    const gate = els.current[anchors.length - 1];
    if (gate) {
      const open = world.gateShown > 0.5;
      const text = open ? "MINT GATE · OPEN" : "MINT GATE · SEALED";
      if (gate.textContent !== text) {
        gate.textContent = text;
        gate.style.color = open ? "#f5c56b" : "#ff6b5b";
      }
    }
  });
  return null;
}

/** True when the browser can create a WebGL2 or WebGL context. */
export function webglAvailable() {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") ?? c.getContext("webgl"));
  } catch {
    return false;
  }
}

/* ── Event director: turns HUD actions into choreography ───────────────── */

function Director({ world, events, targetRef }: { world: World; events: React.RefObject<VaultEvent[]>; targetRef: TargetRef }) {
  useFrame(() => {
    const q = events.current;
    while (q.length) {
      const e = q.shift()!;
      switch (e.kind) {
        case "drain":
          world.barMode = "sky";
          world.shake += 0.25;
          sfx.dissolve();
          break;
        case "topup":
          world.barMode = "sky";
          sfx.whoosh();
          break;
        case "split":
          world.barMode = "split";
          world.laser = 0;
          sfx.laser();
          break;
        case "reset":
          world.barMode = "lantern";
          world.shake += 0.3;
          sfx.whoosh();
          break;
        case "attest":
          world.beam = 0;
          world.beamArrived = false;
          sfx.beam();
          break;
        case "mint-ok": {
          const solana = ringPoint(0, 0.6, new THREE.Vector3());
          world.comets.push({ t: 0, from: GATE_POS.clone(), ctrl: new THREE.Vector3(8, 12, -2), to: solana });
          sfx.mint();
          break;
        }
        case "mint-fail":
          world.shock(GATE_POS, RED_HDR, { vertical: true, size: 9, rotY: GATE_ROT_Y });
          world.emit(GATE_POS, 140, RED_HDR, { speed: 7, life: 1.2, spread: 0.6 });
          world.shake += 0.9;
          world.aberration += 1;
          sfx.reject();
          break;
      }
    }
    if (targetRef.current.reduced) world.shake = 0;
  });
  return null;
}

/* ── Camera: cinematic dolly-in, pointer parallax, shake ───────────────── */

function Rig({ world, targetRef }: { world: World; targetRef: TargetRef }) {
  const t0 = useRef<number | null>(null);
  const from = useMemo(() => new THREE.Vector3(0, 36, 64), []);
  const to = useMemo(() => new THREE.Vector3(0, 7.4, 25), []);
  const look = useMemo(() => new THREE.Vector3(), []);
  const pos = useMemo(() => new THREE.Vector3(), []);
  const par = useRef({ x: 0, y: 0 });

  useFrame((state, dt) => {
    const { started, reduced } = targetRef.current;
    const now = state.clock.elapsedTime;
    world.time = now;
    if (started && t0.current === null) t0.current = now;
    const k = t0.current === null ? 0 : reduced ? 1 : Math.min(1, (now - t0.current) / 4.8);
    pos.lerpVectors(from, to, 1 - Math.pow(1 - k, 4));

    par.current.x += (state.pointer.x * 2.4 - par.current.x) * damp(dt, 2.5);
    par.current.y += (state.pointer.y * 1.1 - par.current.y) * damp(dt, 2.5);
    const sway = reduced ? 0 : Math.sin(now * 0.12) * 0.8;
    const s = world.shake;
    const sx = (Math.random() - 0.5) * s * 0.5;
    const sy = (Math.random() - 0.5) * s * 0.5;
    state.camera.position.set(pos.x + par.current.x + sway + sx, pos.y + par.current.y + sy, pos.z);
    look.set(2.2 + sx * 0.3, 3.4 + sy * 0.3, -2);
    state.camera.lookAt(look);
    world.shake *= Math.exp(-dt * 4);
  });
  return null;
}

/* ── Floor ──────────────────────────────────────────────────────────────── */

function Floor() {
  return (
    <group>
      <mesh rotation-x={-Math.PI / 2}>
        <planeGeometry args={[160, 160]} />
        <MeshReflectorMaterial
          blur={[400, 120]}
          resolution={1024}
          mixBlur={1}
          mixStrength={7}
          roughness={0.85}
          depthScale={1.1}
          minDepthThreshold={0.4}
          maxDepthThreshold={1.4}
          color="#07080c"
          metalness={0.6}
          mirror={0.6}
        />
      </mesh>
      <Grid
        position={[0, 0.003, 0]}
        args={[80, 80]}
        cellSize={0.75}
        cellThickness={0.5}
        cellColor="#161a24"
        sectionSize={4.5}
        sectionThickness={1}
        sectionColor="#262c3c"
        fadeDistance={48}
        fadeStrength={1.6}
        infiniteGrid
      />
    </group>
  );
}

/* ── Dais with a 120-segment backing gauge around it ───────────────────── */

const GAUGE = 120;

function Dais({ world, targetRef }: { world: World; targetRef: TargetRef }) {
  const gauge = useRef<THREE.InstancedMesh>(null);
  const rimMat = useRef<THREE.MeshBasicMaterial>(null);
  const floorRingMat = useRef<THREE.MeshBasicMaterial>(null);
  const shown = useRef(0);
  const c = useMemo(() => new THREE.Color(), []);
  const dim = useMemo(() => new THREE.Color(0.035, 0.035, 0.045), []);

  useEffect(() => {
    const m = gauge.current;
    if (!m) return;
    const o = new THREE.Object3D();
    for (let i = 0; i < GAUGE; i++) {
      // Start at the front (toward the camera) and run clockwise.
      const a = Math.PI / 2 - (i / GAUGE) * Math.PI * 2;
      o.position.set(Math.cos(a) * (DAIS_R + 0.5), 0.025, Math.sin(a) * (DAIS_R + 0.5));
      o.rotation.set(0, -a, 0);
      o.updateMatrix();
      m.setMatrixAt(i, o.matrix);
      m.setColorAt(i, dim);
    }
    m.instanceMatrix.needsUpdate = true;
  }, [dim]);

  useFrame((state, dt) => {
    const m = gauge.current;
    if (!m) return;
    const t = state.clock.elapsedTime;
    healthColor(world.level, c);
    const want = targetRef.current.started ? Math.min(1, Math.max(0, targetRef.current.ratio)) : 0;
    shown.current += (want - shown.current) * damp(dt, 1.8);
    const lit = shown.current * GAUGE;
    for (let i = 0; i < GAUGE; i++) {
      if (i < lit) {
        const edge = lit - i < 1.5 ? 2.2 + Math.sin(t * 10) * 0.8 : 1;
        m.setColorAt(i, c.clone().multiplyScalar(2.4 * edge));
      } else m.setColorAt(i, dim);
    }
    m.instanceColor!.needsUpdate = true;
    if (rimMat.current) rimMat.current.color.copy(c).multiplyScalar(1.5 + world.level * 2);
    if (floorRingMat.current) floorRingMat.current.color.copy(c).multiplyScalar(0.35 + 0.25 * Math.sin(t * 1.4));
  });

  return (
    <group>
      <mesh position-y={DAIS_TOP / 2}>
        <cylinderGeometry args={[DAIS_R, DAIS_R + 0.15, DAIS_TOP, 96]} />
        <meshStandardMaterial color="#0b0d12" metalness={0.85} roughness={0.32} />
      </mesh>
      <mesh position-y={DAIS_TOP + 0.005}>
        <cylinderGeometry args={[DAIS_R - 0.3, DAIS_R - 0.3, 0.01, 96]} />
        <meshStandardMaterial color="#12151c" metalness={0.9} roughness={0.18} />
      </mesh>
      <mesh position-y={DAIS_TOP} rotation-x={Math.PI / 2}>
        <torusGeometry args={[DAIS_R, 0.035, 12, 160]} />
        <meshBasicMaterial ref={rimMat} toneMapped={false} fog={false} />
      </mesh>
      <mesh position-y={0.01} rotation-x={-Math.PI / 2}>
        <ringGeometry args={[DAIS_R + 1.05, DAIS_R + 1.1, 160]} />
        <meshBasicMaterial ref={floorRingMat} toneMapped={false} transparent blending={THREE.AdditiveBlending} depthWrite={false} />
      </mesh>
      <instancedMesh ref={gauge} args={[undefined, undefined, GAUGE]}>
        <boxGeometry args={[0.36, 0.05, 0.16]} />
        <meshBasicMaterial toneMapped={false} />
      </instancedMesh>
    </group>
  );
}

/* ── Gold bars: one per custodian share, stacked as a pyramid ──────────── */

interface Bar {
  p: THREE.Vector3;
  t: THREE.Vector3;
  vy: number;
  s: number;
  ts: number;
  heat: number;
  /** -1 alive; otherwise seconds since it started dissolving. */
  dying: number;
  delay: number;
  spin: number;
}

function pyramid(n: number) {
  const capacity = (k: number) => {
    let s = 0;
    for (let i = 0; k - i > 0; i++) s += (k + 2 - i) * (k - i);
    return s;
  };
  let k = 1;
  while (capacity(k) < n) k++;
  const pts: THREE.Vector3[] = [];
  for (let layer = 0; pts.length < n; layer++) {
    const cols = k + 2 - layer;
    const rows = k - layer;
    const cells: [number, number][] = [];
    for (let c = 0; c < cols; c++) for (let r = 0; r < rows; r++) cells.push([(c - (cols - 1) / 2) * (BW + GAP), (r - (rows - 1) / 2) * (BD + GAP)]);
    // Partial top layers fill from the centre out, so the stack stays symmetric.
    cells.sort((a, b) => Math.hypot(a[0], a[1] * 1.6) - Math.hypot(b[0], b[1] * 1.6));
    for (const [x, z] of cells) {
      if (pts.length >= n) break;
      pts.push(new THREE.Vector3(x, layer * (BH + 0.012), z));
    }
  }
  const fit = Math.min(1, 6.2 / ((k + 2) * (BW + GAP)), 4.6 / (k * (BD + GAP)));
  return { pts, fit };
}

const slot = (p: THREE.Vector3, fit: number) => new THREE.Vector3(p.x * fit, DAIS_TOP + (BH / 2 + p.y) * fit, p.z * fit);

function reconcile(list: Bar[], n: number, mode: World["barMode"]) {
  const alive = list.filter((b) => b.dying < 0);
  // Remove from the top of the stack down (last slots are the highest).
  for (let i = alive.length - 1; i >= n; i--) {
    alive[i].dying = 0;
    alive[i].heat = 1;
  }
  const keep = alive.slice(0, n);
  const prev = keep.length;
  const { pts, fit } = pyramid(n);
  for (let i = 0; i < prev; i++) {
    keep[i].t.copy(slot(pts[i], fit));
    keep[i].ts = fit;
  }
  for (let i = prev; i < n; i++) {
    const t = slot(pts[i], fit);
    const k = i - prev;
    if (mode === "split" && prev > 0) {
      const parent = keep[k % prev];
      keep.push({ p: parent.p.clone(), t, vy: 0, s: parent.s, ts: fit, heat: 1, dying: -1, delay: 0.75 + (k / prev) * 0.25, spin: 0 });
    } else if (mode === "lantern") {
      keep.push({ p: new THREE.Vector3(0, LANTERN_Y, 0), t, vy: 2, s: 0, ts: fit, heat: 0.6, dying: -1, delay: Math.min(1.8, k * 0.018), spin: 0 });
    } else {
      keep.push({ p: t.clone().setY(t.y + 9 + Math.random() * 5), t, vy: 0, s: 0, ts: fit, heat: 0, dying: -1, delay: Math.min(1.6, k * 0.02), spin: 0 });
    }
  }
  const dying = list.filter((b) => b.dying >= 0);
  list.length = 0;
  list.push(...keep, ...dying);
}

function Bars({ world, targetRef }: { world: World; targetRef: TargetRef }) {
  const mesh = useRef<THREE.InstancedMesh>(null);
  const bars = useRef<Bar[]>([]);
  const count = useRef(-1);
  const geo = useMemo(() => new RoundedBoxGeometry(BW, BH, BD, 2, 0.03), []);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const col = useMemo(() => new THREE.Color(), []);
  const dust = useMemo(() => new THREE.Vector3(), []);

  useFrame((_, rawDt) => {
    const m = mesh.current;
    if (!m) return;
    const dt = Math.min(rawDt, 1 / 30);
    const n = targetRef.current.started ? Math.min(MAX_BARS, Math.max(0, Math.round(targetRef.current.bars))) : 0;
    if (n !== count.current) {
      reconcile(bars.current, n, world.barMode);
      count.current = n;
    }
    const list = bars.current;
    let top = DAIS_TOP;
    let w = 0;
    for (let i = list.length - 1; i >= 0; i--) {
      const b = list[i];
      if (b.dying >= 0) {
        b.dying += dt;
        b.p.y += (0.6 + b.dying * 7) * dt;
        b.spin += dt * (3 + b.dying * 6);
        b.s = b.ts * Math.max(0, 1 - b.dying / 0.85);
        if (Math.random() < 0.6) world.emit(b.p, 2, HOT, { speed: 1.4, up: 1.6, life: 0.9, spread: 0.25 });
        if (b.dying > 0.85) {
          world.emit(b.p, 12, HOT, { speed: 2.6, up: 2, life: 1.2, spread: 0.2 });
          list.splice(i, 1);
          continue;
        }
      } else if (b.delay > 0) {
        b.delay -= dt;
        if (b.delay <= 0 && b.heat > 0.9) world.emit(b.p, 8, LASER_HDR, { speed: 2, life: 0.5, spread: 0.1 });
      } else {
        const k = damp(dt, 6);
        b.p.x += (b.t.x - b.p.x) * k;
        b.p.z += (b.t.z - b.p.z) * k;
        if (b.p.y > b.t.y + 1e-3 || b.vy > 0) {
          b.vy -= 30 * dt;
          b.p.y += b.vy * dt;
          if (b.p.y <= b.t.y) {
            b.p.y = b.t.y;
            if (b.vy < -4) {
              if (world.time - world.lastThud > 0.05) {
                world.lastThud = world.time;
                sfx.thud();
                world.shake += 0.03;
              }
              world.emit(dust.set(b.p.x, b.p.y - BH * 0.4, b.p.z), 4, DUST, { speed: 1.2, up: 0.4, life: 0.6, spread: 0.2, size: 0.8, gravity: -1 });
              b.vy = -b.vy * 0.2;
            } else b.vy = 0;
          }
        } else {
          b.p.y += (b.t.y - b.p.y) * k;
          b.vy = 0;
        }
        b.s += (b.ts - b.s) * damp(dt, 10);
        top = Math.max(top, b.t.y);
      }
      b.heat = Math.max(0, b.heat - dt * 1.1);
      dummy.position.copy(b.p);
      dummy.rotation.set(b.dying >= 0 ? b.spin * 0.3 : 0, b.spin, 0);
      dummy.scale.setScalar(b.delay > 0 ? 0 : b.s);
      dummy.updateMatrix();
      m.setMatrixAt(w, dummy.matrix);
      m.setColorAt(w, col.copy(GOLD).lerp(HOT, b.heat));
      w++;
    }
    m.count = w;
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
    world.apex.y += (top + 0.35 - world.apex.y) * damp(dt, 3);
  });

  return (
    <instancedMesh ref={mesh} args={[geo, undefined, MAX_BARS * 2 + 50]} frustumCulled={false}>
      <meshStandardMaterial color="#ffffff" metalness={0.9} roughness={0.26} envMapIntensity={2.2} emissive="#7a4a0c" emissiveIntensity={0.55} />
    </instancedMesh>
  );
}

/* ── The lantern: its light is the backing ratio ───────────────────────── */

const NOISE_GLSL = /* glsl */ `
  float hash(vec3 p){ p = fract(p*0.3183099+.1); p *= 17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
  float noise(vec3 x){
    vec3 i = floor(x); vec3 f = fract(x); f = f*f*(3.0-2.0*f);
    return mix(mix(mix(hash(i+vec3(0,0,0)),hash(i+vec3(1,0,0)),f.x), mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),
               mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x), mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y), f.z);
  }
  float fbm(vec3 p){ float a = .5, s = 0.; for (int i = 0; i < 5; i++){ s += a*noise(p); p *= 2.02; a *= .5; } return s; }
`;

function glowTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d")!;
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, "rgba(255,255,255,1)");
  gr.addColorStop(0.2, "rgba(255,255,255,0.5)");
  gr.addColorStop(0.5, "rgba(255,255,255,0.12)");
  gr.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = gr;
  g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

function Lantern({ world, targetRef }: { world: World; targetRef: TargetRef }) {
  const group = useRef<THREE.Group>(null);
  const cage = useRef<THREE.Group>(null);
  const light = useRef<THREE.PointLight>(null);
  const halo = useRef<THREE.Sprite>(null);
  const color = useMemo(() => new THREE.Color(), []);
  const lastHum = useRef(0);
  const haloTex = useMemo(() => glowTexture(), []);

  const core = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: { uTime: { value: 0 }, uColor: { value: new THREE.Color() }, uLevel: { value: 0 } },
        vertexShader: /* glsl */ `
          varying vec3 vN; varying vec3 vV; varying vec3 vP;
          void main(){
            vec4 wp = modelMatrix * vec4(position, 1.0);
            vP = position; vN = normalize(normalMatrix * normal);
            vec4 mv = viewMatrix * wp; vV = normalize(-mv.xyz);
            gl_Position = projectionMatrix * mv;
          }`,
        fragmentShader: /* glsl */ `
          uniform float uTime; uniform vec3 uColor; uniform float uLevel;
          varying vec3 vN; varying vec3 vV; varying vec3 vP;
          ${NOISE_GLSL}
          void main(){
            float facing = max(dot(vN, vV), 0.0);
            float n = fbm(vP * 2.4 + vec3(0.0, -uTime * 1.7, uTime * 0.35));
            float core = smoothstep(0.3, 0.95, n + facing * 0.55);
            vec3 col = uColor * (0.35 + core * 3.2) * (0.12 + uLevel * 1.3);
            col += vec3(1.0, 0.95, 0.82) * pow(core, 4.0) * uLevel * 3.5;
            gl_FragColor = vec4(col, 1.0);
          }`,
      }),
    [],
  );

  const cone = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: { uTime: { value: 0 }, uColor: { value: new THREE.Color() }, uLevel: { value: 0 } },
        vertexShader: /* glsl */ `
          varying vec2 vUv; varying vec3 vN; varying vec3 vV; varying vec3 vW;
          void main(){
            vUv = uv;
            vec4 wp = modelMatrix * vec4(position, 1.0);
            vW = wp.xyz; vN = normalize(mat3(modelMatrix) * normal); vV = normalize(cameraPosition - wp.xyz);
            gl_Position = projectionMatrix * viewMatrix * wp;
          }`,
        fragmentShader: /* glsl */ `
          uniform vec3 uColor; uniform float uLevel; uniform float uTime;
          varying vec2 vUv; varying vec3 vN; varying vec3 vV; varying vec3 vW;
          void main(){
            // Written defensively: one NaN pixel here gets smeared over the whole frame by bloom.
            float d = clamp(abs(dot(normalize(vN), normalize(vV))), 0.0, 1.0);
            float edge = d * d;
            float y = clamp(vUv.y, 0.0, 1.0);
            float fall = y * sqrt(y);
            float a = atan(vW.z, vW.x + 1e-5);
            float rays = 0.6 + 0.4 * sin(a * 18.0 + uTime * 0.6) * sin(a * 7.0 - uTime * 0.4);
            gl_FragColor = vec4(clamp(uColor * edge * fall * rays * uLevel * 0.5, 0.0, 8.0), 1.0);
          }`,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
      }),
    [],
  );

  useFrame((state, dt) => {
    const t = state.clock.elapsedTime;
    const want = targetRef.current.started ? Math.min(1, Math.max(0, targetRef.current.ratio)) : 0.15;
    world.level += (want - world.level) * damp(dt, 1.6);
    const L = world.level;
    healthColor(L, color);
    // Under-backed: the flame becomes unstable.
    const flicker = L < 0.98 ? (0.78 + 0.22 * Math.sin(t * 23) * Math.sin(t * 7.3 + 1.1)) * (0.88 + 0.12 * Math.random()) : 1;
    const lvl = (0.06 + L * 0.94) * flicker;

    core.uniforms.uTime.value = t;
    core.uniforms.uColor.value.copy(color);
    core.uniforms.uLevel.value = lvl;
    cone.uniforms.uTime.value = t;
    cone.uniforms.uColor.value.copy(color);
    cone.uniforms.uLevel.value = lvl;
    if (light.current) {
      light.current.intensity = 6 + lvl * 220;
      light.current.color.copy(color);
    }
    if (halo.current) {
      (halo.current.material as THREE.SpriteMaterial).color.copy(color).multiplyScalar(0.5 + lvl * 1.4);
      halo.current.scale.setScalar(3.5 + lvl * 6);
    }
    if (group.current) group.current.position.y = LANTERN_Y + Math.sin(t * 0.8) * 0.12;
    if (cage.current) cage.current.rotation.y = t * 0.15;
    if (t - lastHum.current > 0.4) {
      lastHum.current = t;
      setHealth(L);
    }
  });

  const bronze = <meshStandardMaterial color="#3a2a16" metalness={1} roughness={0.33} />;
  return (
    <>
      <group ref={group} position-y={LANTERN_Y}>
        <mesh material={core}>
          <sphereGeometry args={[0.62, 64, 64]} />
        </mesh>
        <sprite ref={halo}>
          <spriteMaterial map={haloTex} transparent depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} fog={false} />
        </sprite>
        <pointLight ref={light} distance={0} decay={2} />
        <group ref={cage}>
          {Array.from({ length: 6 }).map((_, i) => {
            const a = (i / 6) * Math.PI * 2;
            return (
              <mesh key={i} position={[Math.cos(a) * 1.0, 0, Math.sin(a) * 1.0]}>
                <cylinderGeometry args={[0.03, 0.03, 2.0, 8]} />
                {bronze}
              </mesh>
            );
          })}
          <mesh position-y={1.18}>
            <cylinderGeometry args={[0.28, 1.15, 0.42, 6]} />
            {bronze}
          </mesh>
          <mesh position-y={1.5}>
            <torusGeometry args={[0.22, 0.045, 10, 32]} />
            {bronze}
          </mesh>
          <mesh position-y={-1.06}>
            <cylinderGeometry args={[1.12, 0.8, 0.18, 6]} />
            {bronze}
          </mesh>
        </group>
      </group>
      <mesh position-y={DAIS_TOP + (LANTERN_Y - 1.15 - DAIS_TOP) / 2} material={cone}>
        <cylinderGeometry args={[0.8, 3.9, LANTERN_Y - 1.15 - DAIS_TOP, 64, 1, true]} />
      </mesh>
    </>
  );
}

/* ── Token rings: one orbit per chain, tethered to the stack when backed ── */

const RINGS = [
  { r: 6.9, y: 3.0, tilt: new THREE.Euler(0.16, 0, 0.05), speed: 0.11 },
  { r: 8.1, y: 3.7, tilt: new THREE.Euler(-0.1, 0, 0.14), speed: -0.075 },
  { r: 9.3, y: 2.5, tilt: new THREE.Euler(0.22, 0, -0.1), speed: 0.055 },
  { r: 10.4, y: 4.2, tilt: new THREE.Euler(-0.18, 0, -0.06), speed: -0.04 },
];
const RING_Q = RINGS.map((r) => new THREE.Quaternion().setFromEuler(r.tilt));

function ringPoint(ring: number, angle: number, out: THREE.Vector3) {
  const R = RINGS[ring];
  return out.set(Math.cos(angle) * R.r, 0, Math.sin(angle) * R.r).applyQuaternion(RING_Q[ring]).setY(out.y + R.y);
}

interface Orb {
  ring: number;
  phase: number;
  rank: number;
  b: number;
}

function TokenRings({ world, targetRef, chains }: { world: World; targetRef: TargetRef; chains: ChainRing[] }) {
  const mesh = useRef<THREE.InstancedMesh>(null);
  const lines = useRef<THREE.LineSegments>(null);
  const frac = useRef(0);
  const shown = chains.slice(0, RINGS.length);
  const key = shown.map((c) => `${c.key}:${Math.round(c.supply)}`).join("|");

  const orbs = useMemo(() => {
    const total = shown.reduce((a, c) => a + Math.max(0, c.supply), 0);
    const list: Orb[] = [];
    shown.forEach((c, ring) => {
      const n = c.supply > 0 && total > 0 ? Math.max(4, Math.round((MAX_ORBS * c.supply) / total)) : 0;
      for (let i = 0; i < n; i++) list.push({ ring, phase: (i / n) * Math.PI * 2 + ring * 0.7, rank: 0, b: 1 });
    });
    // Deterministic shuffle (seeded LCG) so unbacked orbs are scattered across rings.
    let seed = 1337;
    const rand = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
    const order = list.map((_, i) => i);
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    order.forEach((idx, r) => (list[idx].rank = r));
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const colors = useMemo(() => shown.map((c) => new THREE.Color(c.color).multiplyScalar(1.6)), [shown]);
  const lineGeo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(MAX_ORBS * 2 * 3 * 2), 3));
    g.setAttribute("color", new THREE.BufferAttribute(new Float32Array(MAX_ORBS * 2 * 3 * 2), 3));
    return g;
  }, []);
  const paths = useMemo(
    () =>
      RINGS.map((_, ring) => {
        const pts: THREE.Vector3[] = [];
        for (let i = 0; i <= 160; i++) pts.push(ringPoint(ring, (i / 160) * Math.PI * 2, new THREE.Vector3()));
        return new THREE.BufferGeometry().setFromPoints(pts);
      }),
    [],
  );

  const dummy = useMemo(() => new THREE.Object3D(), []);
  const p = useMemo(() => new THREE.Vector3(), []);
  const c = useMemo(() => new THREE.Color(), []);
  const red = useMemo(() => new THREE.Color(), []);

  useFrame((state, dt) => {
    const m = mesh.current;
    const l = lines.current;
    if (!m || !l) return;
    const t = state.clock.elapsedTime;
    const want = targetRef.current.started ? Math.min(1, Math.max(0, targetRef.current.ratio)) : 1;
    frac.current += (want - frac.current) * damp(dt, 1.2);
    const backedN = frac.current * orbs.length;
    const pos = l.geometry.attributes.position as THREE.BufferAttribute;
    const col = l.geometry.attributes.color as THREE.BufferAttribute;
    for (let i = 0; i < orbs.length; i++) {
      const o = orbs[i];
      o.b += ((o.rank < backedN ? 1 : 0) - o.b) * damp(dt, 5);
      const ang = o.phase + t * RINGS[o.ring].speed;
      ringPoint(o.ring, ang, p);
      p.y += Math.sin(t * 1.3 + o.phase * 3) * 0.08;
      if (o.b < 0.5) p.addScalar((Math.random() - 0.5) * 0.05);
      const fl = 0.35 + 0.65 * Math.abs(Math.sin(t * 9 + i));
      red.copy(RED_HDR).multiplyScalar(fl * 0.8);
      c.copy(red).lerp(colors[o.ring], o.b);
      dummy.position.copy(p);
      dummy.scale.setScalar(0.085 + 0.045 * o.b);
      dummy.updateMatrix();
      m.setMatrixAt(i, dummy.matrix);
      m.setColorAt(i, c);
      // Tether: orb -> top of the gold stack, fading with backing.
      pos.setXYZ(i * 2, p.x, p.y, p.z);
      pos.setXYZ(i * 2 + 1, world.apex.x, world.apex.y, world.apex.z);
      const tb = o.b * 0.16;
      col.setXYZ(i * 2, colors[o.ring].r * tb, colors[o.ring].g * tb, colors[o.ring].b * tb);
      col.setXYZ(i * 2 + 1, GOLD_HDR.r * tb * 0.25, GOLD_HDR.g * tb * 0.25, GOLD_HDR.b * tb * 0.25);
    }
    m.count = orbs.length;
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
    l.geometry.setDrawRange(0, orbs.length * 2);
    pos.needsUpdate = true;
    col.needsUpdate = true;
  });

  return (
    <group>
      <instancedMesh ref={mesh} args={[undefined, undefined, MAX_ORBS + RINGS.length * 4]} frustumCulled={false}>
        <sphereGeometry args={[1, 14, 14]} />
        <meshBasicMaterial toneMapped={false} fog={false} />
      </instancedMesh>
      <lineSegments ref={lines} geometry={lineGeo} frustumCulled={false}>
        <lineBasicMaterial vertexColors transparent blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} fog={false} />
      </lineSegments>
      {shown.map((ch, ring) => (
        <lineLoop key={ch.key} geometry={paths[ring]}>
          <lineBasicMaterial color={ch.color} transparent opacity={ch.supply > 0 ? 0.22 : 0.07} blending={THREE.AdditiveBlending} depthWrite={false} />
        </lineLoop>
      ))}
    </group>
  );
}

/* ── The mint gate: an iris that seals when the program pauses minting ─── */

function Gate({ world, targetRef }: { world: World; targetRef: TargetRef }) {
  const iris = useRef<THREE.Group>(null);
  const petals = useRef<(THREE.Mesh | null)[]>([]);
  const lipMat = useRef<THREE.MeshBasicMaterial>(null);
  const boltMat = useRef<THREE.MeshBasicMaterial>(null);
  const lock = useRef<THREE.Mesh>(null);
  const c = useMemo(() => new THREE.Color(), []);
  const alarmed = useRef(false);

  const petalGeo = useMemo(() => new THREE.CircleGeometry(4.15, 24, -Math.PI / PETALS, (Math.PI * 2) / PETALS), []);
  const seamGeo = useMemo(() => new THREE.EdgesGeometry(petalGeo, 10), [petalGeo]);
  const seamMat = useMemo(
    () => new THREE.LineBasicMaterial({ toneMapped: false, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }),
    [],
  );
  const portal = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: { uTime: { value: 0 }, uOpen: { value: 1 }, uColor: { value: new THREE.Color() } },
        vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
        fragmentShader: /* glsl */ `
          uniform float uTime; uniform float uOpen; uniform vec3 uColor; varying vec2 vUv;
          void main(){
            vec2 p = vUv * 2.0 - 1.0; float r = length(p); float a = atan(p.y, p.x + 1e-5); // atan(0,0) is NaN on some GPUs
            float swirl = sin(a * 6.0 + r * 10.0 - uTime * 2.0) * 0.5 + 0.5;
            float rings = sin(r * 26.0 - uTime * 3.0) * 0.5 + 0.5;
            float glow = smoothstep(1.0, 0.0, r);
            vec3 col = uColor * (glow * 0.8 + swirl * 0.45 * glow + rings * 0.12) * (0.25 + uOpen * 1.1);
            col += uColor * pow(glow, 8.0) * 1.4 * uOpen;
            gl_FragColor = vec4(col, 1.0);
          }`,
      }),
    [],
  );

  useFrame((state, dt) => {
    const t = state.clock.elapsedTime;
    const want = targetRef.current.gateOpen ? 1 : 0;
    if (world.gate < 0) world.gate = want;
    const before = world.gate;
    const rate = want > world.gate ? 0.9 : 2.4; // opens slowly, slams shut
    world.gate += Math.sign(want - world.gate) * Math.min(Math.abs(want - world.gate), dt * rate);

    if (want === 0 && before >= 0.999 && world.gate < 0.999 && !alarmed.current) {
      alarmed.current = true;
      sfx.alarm();
    }
    if (want === 0 && before > 0.001 && world.gate <= 0.001) {
      sfx.slam();
      world.shake += 1.1;
      world.aberration += 1.2;
      world.shock(GATE_POS, RED_HDR, { vertical: true, size: 9, rotY: GATE_ROT_Y });
      world.emit(GATE_POS, 160, RED_HDR, { speed: 7, life: 1.4, spread: 1 });
    }
    if (want === 1 && before <= 0.001 && world.gate > 0.001) {
      alarmed.current = false;
      sfx.whoosh();
      world.emit(GATE_POS, 120, GOLD_HDR, { speed: 5, life: 1.2, spread: 1 });
    }

    const o = easeInOut(world.gate);
    petals.current.forEach((m) => m && (m.position.x = 0.03 + o * 4.7));
    if (iris.current) iris.current.rotation.z = (1 - o) * 0.6;
    world.portalFlash = Math.max(0, world.portalFlash - dt * 0.8);
    c.copy(RED).lerp(WARM, o).lerp(CRE_HDR, Math.min(1, world.portalFlash) * 0.6);
    portal.uniforms.uTime.value = t;
    portal.uniforms.uOpen.value = o;
    portal.uniforms.uColor.value.copy(c);
    if (lipMat.current) lipMat.current.color.copy(c).multiplyScalar(2.5);
    if (boltMat.current) boltMat.current.color.copy(c).multiplyScalar(o < 0.5 ? 1.5 + Math.abs(Math.sin(t * 6)) * 2 : 2);
    if (lock.current) lock.current.scale.setScalar(Math.max(0.0001, 1 - o));
    // Glowing seams make the closed iris read as "sealed", not as an empty black disc.
    seamMat.color.copy(RED_HDR).multiplyScalar((1 - o) * (0.5 + 0.2 * Math.sin(t * 3)));
    world.gateShown = o;
  });

  return (
    <group position={GATE_POS} rotation-y={GATE_ROT_Y} scale={GATE_SCALE}>
      <mesh position-z={-0.15} material={portal}>
        <circleGeometry args={[4.2, 96]} />
      </mesh>
      <group ref={iris}>
        {Array.from({ length: PETALS }).map((_, i) => (
          <group key={i} rotation-z={(i / PETALS) * Math.PI * 2}>
            <mesh ref={(m) => void (petals.current[i] = m)} geometry={petalGeo} position-z={0.02 + (i % 2) * 0.012}>
              <meshStandardMaterial color="#14161c" metalness={0.95} roughness={0.35} side={THREE.DoubleSide} />
              <lineSegments geometry={seamGeo} material={seamMat} position-z={0.01} />
            </mesh>
          </group>
        ))}
      </group>
      <mesh ref={lock} position-z={0.12}>
        <torusGeometry args={[0.55, 0.08, 6, 6]} />
        <meshBasicMaterial color={RED_HDR} toneMapped={false} />
      </mesh>
      {/* Housing: hides the petals when they retract. */}
      <mesh position-z={0.25}>
        <ringGeometry args={[4.15, 9.3, 128]} />
        <meshStandardMaterial color="#0d0f14" metalness={0.9} roughness={0.38} />
      </mesh>
      <mesh position-z={0.27}>
        <torusGeometry args={[4.15, 0.07, 10, 160]} />
        <meshBasicMaterial ref={lipMat} toneMapped={false} />
      </mesh>
      <mesh position-z={0.25}>
        <torusGeometry args={[9.3, 0.25, 16, 160]} />
        <meshStandardMaterial color="#1a1d24" metalness={1} roughness={0.25} />
      </mesh>
      <mesh rotation-x={Math.PI / 2} position-z={-0.05}>
        <cylinderGeometry args={[4.15, 4.15, 0.6, 96, 1, true]} />
        <meshStandardMaterial color="#0a0b0f" metalness={0.9} roughness={0.4} side={THREE.DoubleSide} />
      </mesh>
      {Array.from({ length: 24 }).map((_, i) => {
        const a = (i / 24) * Math.PI * 2;
        return (
          <mesh key={i} position={[Math.cos(a) * 6.9, Math.sin(a) * 6.9, 0.3]} rotation-z={a}>
            <boxGeometry args={[0.5, 0.12, 0.08]} />
            <meshBasicMaterial ref={i === 0 ? boltMat : undefined} toneMapped={false} color="#f5c56b" />
          </mesh>
        );
      })}
    </group>
  );
}

/* ── Split laser ────────────────────────────────────────────────────────── */

function Laser({ world }: { world: World }) {
  const ref = useRef<THREE.Group>(null);
  const p = useMemo(() => new THREE.Vector3(), []);
  useFrame((_, dt) => {
    const g = ref.current;
    if (!g) return;
    if (world.laser < 0) {
      g.visible = false;
      return;
    }
    world.laser += dt / 0.95;
    const x = THREE.MathUtils.lerp(-3.6, 3.6, easeInOut(Math.min(1, world.laser)));
    g.visible = true;
    g.position.x = x;
    g.scale.y = 0.85 + Math.random() * 0.3;
    for (let i = 0; i < 4; i++) world.emit(p.set(x, DAIS_TOP + Math.random() * 1.6, (Math.random() - 0.5) * 4.4), 1, LASER_HDR, { speed: 3.2, up: 1.2, life: 0.5, spread: 0.05, size: 0.7 });
    if (world.laser >= 1) world.laser = -1;
  });
  return (
    <group ref={ref} position-y={DAIS_TOP + 0.95} visible={false}>
      <mesh>
        <boxGeometry args={[0.025, 1.9, 4.8]} />
        <meshBasicMaterial color={LASER_HDR} toneMapped={false} />
      </mesh>
      <mesh>
        <boxGeometry args={[0.35, 1.9, 4.8]} />
        <meshBasicMaterial color={[1.2, 0.08, 0.06]} transparent opacity={0.35} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
      </mesh>
    </group>
  );
}

/* ── Attestation beam: CRE reads the vault, writes to the gate ─────────── */

function Beam({ world }: { world: World }) {
  const column = useRef<THREE.Mesh>(null);
  const packet = useRef<THREE.Mesh>(null);
  const curve = useMemo(() => new THREE.QuadraticBezierCurve3(new THREE.Vector3(), new THREE.Vector3(6, 13, -4), GATE_POS.clone()), []);
  const p = useMemo(() => new THREE.Vector3(), []);

  useFrame((_, dt) => {
    const col = column.current;
    const pk = packet.current;
    if (!col || !pk) return;
    if (world.beam < 0) {
      col.visible = pk.visible = false;
      return;
    }
    world.beam += dt;
    const T = world.beam;
    curve.v0.copy(world.apex);
    col.visible = T < 0.7;
    if (col.visible) {
      const k = Math.sin((Math.PI * T) / 0.7);
      col.scale.set(0.4 + k, 1, 0.4 + k);
      (col.material as THREE.MeshBasicMaterial).opacity = k;
      if (Math.random() < 0.8) world.emit(p.copy(world.apex), 6, CRE_HDR, { speed: 1.5, up: 7, life: 1, spread: 0.4 });
    }
    const u = (T - 0.35) / 1.0;
    pk.visible = u > 0 && u < 1;
    if (pk.visible) {
      curve.getPoint(easeInOut(u), p);
      pk.position.copy(p);
      world.emit(p, 10, CRE_HDR, { speed: 0.6, life: 0.7, spread: 0.12, size: 1.3 });
    }
    if (u >= 1 && !world.beamArrived) {
      world.beamArrived = true;
      world.shock(GATE_POS, CRE_HDR, { vertical: true, size: 10, rotY: GATE_ROT_Y });
      world.emit(GATE_POS, 220, CRE_HDR, { speed: 6, life: 1.5, spread: 0.6 });
      world.portalFlash = 1.5;
      world.shake += 0.35;
      world.aberration += 0.6;
      sfx.chime();
    }
    if (T > 2.4) world.beam = -1;
  });

  return (
    <>
      <mesh ref={column} position={[0, DAIS_TOP + 8, 0]} visible={false}>
        <cylinderGeometry args={[0.18, 0.18, 16, 24, 1, true]} />
        <meshBasicMaterial color={CRE_HDR} transparent blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} fog={false} />
      </mesh>
      <mesh ref={packet} visible={false}>
        <sphereGeometry args={[0.32, 24, 24]} />
        <meshBasicMaterial color={[3, 4, 8]} toneMapped={false} fog={false} />
      </mesh>
    </>
  );
}

/* ── Mint comets: a successful mint flies out of the gate into the Solana ring ── */

function Comets({ world }: { world: World }) {
  const curve = useMemo(() => new THREE.QuadraticBezierCurve3(), []);
  const p = useMemo(() => new THREE.Vector3(), []);
  useFrame((_, dt) => {
    for (let i = world.comets.length - 1; i >= 0; i--) {
      const c = world.comets[i];
      c.t += dt / 1.3;
      curve.v0.copy(c.from);
      curve.v1.copy(c.ctrl);
      curve.v2.copy(c.to);
      curve.getPoint(easeInOut(Math.min(1, c.t)), p);
      world.emit(p, 12, GOLD_HDR, { speed: 0.7, life: 0.8, spread: 0.1, size: 1.5 });
      if (c.t >= 1) {
        world.shock(c.to, GOLD_HDR, { size: 2.5, dur: 0.8 });
        world.emit(c.to, 80, GOLD_HDR, { speed: 4, life: 1, spread: 0.2 });
        world.comets.splice(i, 1);
      }
    }
  });
  return null;
}

/* ── Shockwave rings (pooled) ──────────────────────────────────────────── */

function Shockwaves({ world }: { world: World }) {
  const meshes = useRef<(THREE.Mesh | null)[]>([]);
  const slots = useRef(Array.from({ length: SHOCKS }, () => ({ t: 1, dur: 1, size: 1 })));
  const next = useRef(0);

  useEffect(() => {
    world.shock = (p, color, o = {}) => {
      const i = next.current++ % slots.current.length;
      const m = meshes.current[i];
      if (!m) return;
      slots.current[i] = { t: 0, dur: o.dur ?? 1.1, size: o.size ?? 4 };
      m.position.copy(p);
      m.rotation.set(o.vertical ? 0 : -Math.PI / 2, o.rotY ?? 0, 0);
      (m.material as THREE.MeshBasicMaterial).color.copy(color);
    };
  }, [world]);

  useFrame((_, dt) => {
    slots.current.forEach((s, i) => {
      const m = meshes.current[i];
      if (!m) return;
      s.t += dt;
      const k = s.t / s.dur;
      m.visible = k < 1;
      if (!m.visible) return;
      m.scale.setScalar(0.2 + s.size * (1 - Math.pow(1 - k, 3)));
      (m.material as THREE.MeshBasicMaterial).opacity = Math.pow(1 - k, 2);
    });
  });

  return (
    <>
      {Array.from({ length: SHOCKS }, (_, i) => (
        <mesh key={i} ref={(m) => void (meshes.current[i] = m)} visible={false}>
          <ringGeometry args={[0.92, 1, 128]} />
          <meshBasicMaterial transparent blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} side={THREE.DoubleSide} fog={false} />
        </mesh>
      ))}
    </>
  );
}

/* ── GPU point particles, simulated on the CPU (pooled ring buffer) ────── */

function Particles({ world }: { world: World }) {
  const { geo, sim } = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(PARTICLES * 3), 3));
    g.setAttribute("aColor", new THREE.BufferAttribute(new Float32Array(PARTICLES * 3), 3));
    g.setAttribute("aAlpha", new THREE.BufferAttribute(new Float32Array(PARTICLES), 1));
    g.setAttribute("aSize", new THREE.BufferAttribute(new Float32Array(PARTICLES), 1));
    return {
      geo: g,
      sim: { vel: new Float32Array(PARTICLES * 3), life: new Float32Array(PARTICLES), max: new Float32Array(PARTICLES), grav: new Float32Array(PARTICLES), head: 0 },
    };
  }, []);

  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: { uPx: { value: 140 } },
        vertexShader: /* glsl */ `
          attribute float aAlpha; attribute float aSize; attribute vec3 aColor;
          uniform float uPx; varying float vA; varying vec3 vC;
          void main(){
            vA = aAlpha; vC = aColor;
            vec4 mv = modelViewMatrix * vec4(position, 1.0);
            gl_Position = projectionMatrix * mv;
            gl_PointSize = aSize * aAlpha * uPx / -mv.z;
          }`,
        fragmentShader: /* glsl */ `
          varying float vA; varying vec3 vC;
          void main(){
            float d = length(gl_PointCoord - 0.5);
            if (d > 0.5) discard;
            float a = smoothstep(0.5, 0.0, d);
            gl_FragColor = vec4(vC * a * vA, 1.0);
          }`,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    [],
  );

  useEffect(() => {
    const pos = geo.attributes.position as THREE.BufferAttribute;
    const col = geo.attributes.aColor as THREE.BufferAttribute;
    const size = geo.attributes.aSize as THREE.BufferAttribute;
    world.emit = (p, n, color, o = {}) => {
      const speed = o.speed ?? 2;
      const spread = o.spread ?? 0.1;
      for (let k = 0; k < n; k++) {
        const i = sim.head++ % PARTICLES;
        pos.setXYZ(i, p.x + (Math.random() - 0.5) * spread * 2, p.y + (Math.random() - 0.5) * spread * 2, p.z + (Math.random() - 0.5) * spread * 2);
        const th = Math.random() * Math.PI * 2;
        const ph = Math.acos(2 * Math.random() - 1);
        const v = speed * (0.3 + 0.7 * Math.random());
        sim.vel[i * 3] = Math.sin(ph) * Math.cos(th) * v;
        sim.vel[i * 3 + 1] = Math.cos(ph) * v + (o.up ?? 0);
        sim.vel[i * 3 + 2] = Math.sin(ph) * Math.sin(th) * v;
        sim.life[i] = 0;
        sim.max[i] = (o.life ?? 1) * (0.6 + Math.random() * 0.8);
        sim.grav[i] = o.gravity ?? -2.5;
        col.setXYZ(i, color.r, color.g, color.b);
        size.setX(i, (o.size ?? 1) * (0.6 + Math.random() * 0.8));
      }
      col.needsUpdate = true;
      size.needsUpdate = true;
    };
  }, [world, geo, sim]);

  useFrame((state, rawDt) => {
    const dt = Math.min(rawDt, 1 / 30);
    mat.uniforms.uPx.value = 140 * state.gl.getPixelRatio();
    const pos = geo.attributes.position as THREE.BufferAttribute;
    const alpha = geo.attributes.aAlpha as THREE.BufferAttribute;
    const P = pos.array as Float32Array;
    const A = alpha.array as Float32Array;
    const { vel, life, max, grav } = sim;
    const drag = Math.exp(-dt * 1.4);
    for (let i = 0; i < PARTICLES; i++) {
      if (life[i] >= max[i]) {
        A[i] = 0;
        continue;
      }
      life[i] += dt;
      const j = i * 3;
      vel[j + 1] += grav[i] * dt;
      vel[j] *= drag;
      vel[j + 1] *= drag;
      vel[j + 2] *= drag;
      P[j] += vel[j] * dt;
      P[j + 1] += vel[j + 1] * dt;
      P[j + 2] += vel[j + 2] * dt;
      A[i] = Math.max(0, 1 - life[i] / max[i]);
    }
    pos.needsUpdate = true;
    alpha.needsUpdate = true;
  });

  return <points geometry={geo} material={mat} frustumCulled={false} />;
}

/* ── Post-processing ───────────────────────────────────────────────────── */

function Post({ world }: { world: World }) {
  const ca = useRef<ChromaticAberrationEffect>(null);
  const offset = useMemo(() => new THREE.Vector2(0.0006, 0.0006), []);
  useFrame((_, dt) => {
    world.aberration *= Math.exp(-dt * 3);
    const a = 0.0005 + world.aberration * 0.003;
    if (ca.current) ca.current.offset.set(a, a);
  });
  return (
    <EffectComposer multisampling={4}>
      <Bloom mipmapBlur intensity={1.25} luminanceThreshold={0.62} luminanceSmoothing={0.2} radius={0.78} />
      <ChromaticAberration ref={ca} offset={offset} radialModulation={false} modulationOffset={0} blendFunction={BlendFunction.NORMAL} />
      <Noise opacity={0.035} premultiply blendFunction={BlendFunction.SCREEN} />
      <Vignette offset={0.25} darkness={0.85} />
    </EffectComposer>
  );
}
