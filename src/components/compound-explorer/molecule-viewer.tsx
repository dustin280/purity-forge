/**
 * Three.js/react-three-fiber renderer for a compound's 3D structure:
 * CPK-colored atom spheres, cylinder bonds, orbit controls, and residue
 * highlighting driven by the parent route.
 */
import { useMemo, useRef, useEffect } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import * as THREE from "three";
import type { StructureAtom, StructureBond } from "@/lib/nc-structures.functions";
import type {
  MorphModel,
  MorphAtomState,
  MorphBondState,
} from "@/components/compound-explorer/morph";

const CPK: Record<string, string> = {
  C: "#909090",
  N: "#3050f8",
  O: "#ff2010",
  H: "#ffffff",
  S: "#ffe000",
  CU: "#b87333",
  P: "#ff8000",
  F: "#90e050",
  CL: "#1ff01f",
  BR: "#a62929",
  I: "#940094",
  ZN: "#7d80b0",
  FE: "#e06633",
  NA: "#ab5cf2",
  K: "#8f40d4",
  CA: "#3dff00",
  MG: "#8aff00",
  SE: "#ffa100",
};
const DEFAULT_COLOR = "#ff69b4";

const RADIUS: Record<string, number> = { H: 0.22, C: 0.34, N: 0.32, O: 0.31, S: 0.4 };

function elementColor(el: string) {
  return CPK[el.toUpperCase()] ?? DEFAULT_COLOR;
}

/** Emissive ring colour for atoms altered by a non-conformance transform. */
const CHANGED_COLOR = "#ff2d55";

type Props = {
  atoms: StructureAtom[];
  bonds: StructureBond[];
  highlighted: Set<number>;
  focusKey: string;
  /**
   * Atoms added or transformed relative to the native structure. Rendered
   * with a distinct emissive tint so the structural change reads at a glance,
   * independent of (and layered under) the residue highlight.
   */
  changed?: Set<number>;
  /**
   * When present the viewer animates the native -> non-conformance transition
   * instead of drawing a single static structure. `progressRef` is read every
   * frame (0 = native, 1 = impurity); it is a ref rather than state so the
   * playback loop never re-renders React.
   */
  morph?: MorphModel | null;
  progressRef?: React.MutableRefObject<number>;
};

function Bonds({ atoms, bonds, positions }: { atoms: StructureAtom[]; bonds: StructureBond[]; positions: Map<number, THREE.Vector3> }) {
  const geom = useMemo(() => new THREE.CylinderGeometry(0.07, 0.07, 1, 8), []);
  const meshRef = useRef<THREE.InstancedMesh>(null);

  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const dummy = new THREE.Object3D();
    const up = new THREE.Vector3(0, 1, 0);
    let i = 0;
    for (const b of bonds) {
      const pa = positions.get(b.a);
      const pb = positions.get(b.b);
      if (!pa || !pb) continue;
      const dir = new THREE.Vector3().subVectors(pb, pa);
      const len = dir.length();
      if (len === 0) continue;
      dummy.position.copy(pa).addScaledVector(dir, 0.5);
      dummy.quaternion.setFromUnitVectors(up, dir.clone().normalize());
      dummy.scale.set(1, len, 1);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      i++;
    }
    mesh.count = i;
    mesh.instanceMatrix.needsUpdate = true;
  }, [bonds, positions, atoms]);

  return (
    <instancedMesh ref={meshRef} args={[geom, undefined, Math.max(bonds.length, 1)]}>
      <meshStandardMaterial color="#8a8a8a" roughness={0.5} metalness={0.1} />
    </instancedMesh>
  );
}

function Atoms({
  atoms,
  positions,
  highlighted,
  changed,
}: {
  atoms: StructureAtom[];
  positions: Map<number, THREE.Vector3>;
  highlighted: Set<number>;
  changed: Set<number>;
}) {
  return (
    <group>
      {atoms.map(a => {
        const p = positions.get(a.id)!;
        const on = highlighted.size > 0 && highlighted.has(a.id);
        const dim = highlighted.size > 0 && !on;
        const isChanged = changed.has(a.id);
        // A residue click still wins the emissive slot; otherwise a changed
        // atom glows in the non-conformance colour so the edit site is obvious.
        const emissive = on ? elementColor(a.element) : isChanged ? CHANGED_COLOR : "#000000";
        const emissiveIntensity = on ? 0.75 : isChanged ? 0.9 : 0;
        const scale = on ? 1.35 : isChanged ? 1.25 : 1;
        const r = (RADIUS[a.element.toUpperCase()] ?? 0.36) * scale;
        return (
          <mesh key={a.id} position={p}>
            <sphereGeometry args={[r, 20, 20]} />
            <meshStandardMaterial
              color={elementColor(a.element)}
              emissive={emissive}
              emissiveIntensity={emissiveIntensity}
              transparent={dim && !isChanged}
              opacity={dim && !isChanged ? 0.25 : 1}
              roughness={0.35}
              metalness={0.05}
            />
          </mesh>
        );
      })}
    </group>
  );
}

/* ---------------------------------------------------------------------- */
/* Animated native -> non-conformance transition                           */
/* ---------------------------------------------------------------------- */

const BOND_RADIUS = 0.07;
/** Old atoms/bonds leave first, then new ones arrive — reads as a transformation. */
const OUT_START = 0.1;
const OUT_END = 0.5;
const IN_START = 0.45;
const IN_END = 0.85;

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smoothstep = (t: number) => t * t * (3 - 2 * t);
const window01 = (t: number, a: number, b: number) => clamp01((t - a) / (b - a));

function visibilityFor(state: MorphAtomState | MorphBondState, t: number): number {
  if (state === "added") return smoothstep(window01(t, IN_START, IN_END));
  if (state === "removed") return 1 - smoothstep(window01(t, OUT_START, OUT_END));
  return 1;
}

/**
 * Drives the whole transition from a single `useFrame`: one pass computes
 * every interpolated atom position, then reuses them for the bonds. Doing it
 * in one place avoids depending on the order separate effects would run in,
 * and keeps React out of the animation loop entirely — the meshes are mutated
 * directly, so a 350-atom peptide animates without a single re-render.
 */
function MorphScene({
  model,
  progressRef,
  highlighted,
}: {
  model: MorphModel;
  progressRef: React.MutableRefObject<number>;
  highlighted: Set<number>;
}) {
  const atomRefs = useRef<(THREE.Mesh | null)[]>([]);
  const bondRef = useRef<THREE.InstancedMesh>(null);

  const sphere = useMemo(() => new THREE.SphereGeometry(1, 16, 16), []);
  const cylinder = useMemo(() => new THREE.CylinderGeometry(1, 1, 1, 8), []);

  const positions = useMemo(() => model.atoms.map(() => new THREE.Vector3()), [model]);
  const keyIndex = useMemo(
    () => new Map(model.atoms.map((a, i) => [a.key, i])),
    [model],
  );
  const palette = useMemo(
    () =>
      model.atoms.map(a => ({
        from: new THREE.Color(elementColor(a.fromElement)),
        to: new THREE.Color(elementColor(a.element)),
        radius: RADIUS[a.element.toUpperCase()] ?? 0.36,
      })),
    [model],
  );

  // Preallocated scratch: this loop runs every frame over every atom and bond,
  // so allocating here would hand the GC a few hundred objects per frame.
  const scratch = useMemo(
    () => ({
      dummy: new THREE.Object3D(),
      up: new THREE.Vector3(0, 1, 0),
      dir: new THREE.Vector3(),
      norm: new THREE.Vector3(),
      black: new THREE.Color("#000000"),
      changed: new THREE.Color(CHANGED_COLOR),
      lit: new THREE.Color(),
    }),
    [],
  );

  useFrame(() => {
    const t = clamp01(progressRef.current);
    const e = smoothstep(t);
    const { dummy, up, dir, norm, black, changed: changedColor, lit: litColor } = scratch;

    for (let i = 0; i < model.atoms.length; i++) {
      const a = model.atoms[i];
      const p = positions[i];
      p.set(
        a.from[0] + (a.to[0] - a.from[0]) * e,
        a.from[1] + (a.to[1] - a.from[1]) * e,
        a.from[2] + (a.to[2] - a.from[2]) * e,
      );

      const mesh = atomRefs.current[i];
      if (!mesh) continue;
      const vis = visibilityFor(a.state, t);
      const lit = a.id !== null && highlighted.has(a.id);
      const changed = a.state !== "persist";

      mesh.position.copy(p);
      // Scale carries both the element radius and the appear/disappear, so a
      // vanishing atom shrinks away instead of popping out at full size.
      mesh.scale.setScalar(palette[i].radius * (0.25 + 0.75 * vis) * (lit ? 1.35 : 1));
      mesh.visible = vis > 0.01;

      const mat = mesh.material as THREE.MeshStandardMaterial;
      mat.opacity = vis;
      mat.transparent = vis < 0.999;
      if (a.state === "substituted") {
        mat.color.lerpColors(palette[i].from, palette[i].to, e);
      }
      if (lit) {
        mat.emissive.copy(litColor.copy(palette[i].to));
      } else if (changed) {
        mat.emissive.copy(changedColor);
      } else {
        mat.emissive.copy(black);
      }
      mat.emissiveIntensity = lit ? 0.75 : changed ? 0.9 * Math.max(vis, 0.35) : 0;
    }

    const mesh = bondRef.current;
    if (!mesh) return;
    let n = 0;
    for (const b of model.bonds) {
      const ia = keyIndex.get(b.aKey);
      const ib = keyIndex.get(b.bKey);
      if (ia === undefined || ib === undefined) continue;
      const vis = visibilityFor(b.state, t);
      if (vis <= 0.01) continue;
      const pa = positions[ia];
      const pb = positions[ib];
      dir.subVectors(pb, pa);
      const len = dir.length();
      if (len === 0) continue;
      dummy.position.copy(pa).addScaledVector(dir, 0.5);
      dummy.quaternion.setFromUnitVectors(up, norm.copy(dir).normalize());
      // Radius, not opacity: instanced meshes share one material, so a bond
      // thins out of existence rather than fading.
      dummy.scale.set(BOND_RADIUS * vis, len, BOND_RADIUS * vis);
      dummy.updateMatrix();
      mesh.setMatrixAt(n, dummy.matrix);
      n++;
    }
    mesh.count = n;
    mesh.instanceMatrix.needsUpdate = true;
  });

  return (
    <group>
      {model.atoms.map((a, i) => (
        <mesh
          key={a.key}
          ref={el => {
            atomRefs.current[i] = el;
          }}
          geometry={sphere}
        >
          <meshStandardMaterial
            color={elementColor(a.fromElement)}
            roughness={0.35}
            metalness={0.05}
          />
        </mesh>
      ))}
      <instancedMesh
        ref={bondRef}
        args={[cylinder, undefined, Math.max(model.bonds.length, 1)]}
      >
        <meshStandardMaterial color="#8a8a8a" roughness={0.5} metalness={0.1} />
      </instancedMesh>
    </group>
  );
}

function Controls({ controls }: { controls: React.RefObject<OrbitControls | null> }) {
  const camera = useThree(s => s.camera);
  const gl = useThree(s => s.gl);
  useEffect(() => {
    const c = new OrbitControls(camera, gl.domElement);
    c.enableDamping = true;
    c.dampingFactor = 0.1;
    controls.current = c;
    return () => {
      c.dispose();
      controls.current = null;
    };
  }, [camera, gl, controls]);
  useFrame(() => controls.current?.update());
  return null;
}

function CameraFocus({ target, controls }: { target: THREE.Vector3 | null; controls: React.RefObject<{ target: THREE.Vector3; update: () => void } | null> }) {
  const goal = useRef<THREE.Vector3 | null>(null);
  useEffect(() => {
    goal.current = target ? target.clone() : null;
  }, [target]);
  useFrame(() => {
    const c = controls.current;
    if (!c || !goal.current) return;
    c.target.lerp(goal.current, 0.12);
    c.update();
    if (c.target.distanceTo(goal.current) < 0.01) goal.current = null;
  });
  return null;
}

export function MoleculeViewer({
  atoms,
  bonds,
  highlighted,
  focusKey,
  changed,
  morph,
  progressRef,
}: Props) {
  const changedSet = useMemo(() => changed ?? new Set<number>(), [changed]);
  const fallbackProgress = useRef(1);
  const animating = !!morph && !!progressRef;
  const controls = useRef<OrbitControls | null>(null);

  const { positions, center, radius } = useMemo(() => {
    const c = new THREE.Vector3();
    atoms.forEach(a => c.add(new THREE.Vector3(a.x, a.y, a.z)));
    if (atoms.length) c.divideScalar(atoms.length);
    const map = new Map<number, THREE.Vector3>();
    let maxD = 1;
    for (const a of atoms) {
      const v = new THREE.Vector3(a.x - c.x, a.y - c.y, a.z - c.z);
      map.set(a.id, v);
      maxD = Math.max(maxD, v.length());
    }
    return { positions: map, center: c, radius: maxD };
  }, [atoms]);

  const focusTarget = useMemo(() => {
    if (!highlighted.size) return new THREE.Vector3(0, 0, 0);
    const v = new THREE.Vector3();
    let n = 0;
    highlighted.forEach(id => {
      const p = positions.get(id);
      if (p) {
        v.add(p);
        n++;
      }
    });
    return n ? v.divideScalar(n) : new THREE.Vector3(0, 0, 0);
    // focusKey re-triggers focus even when the same residue is clicked twice
  }, [highlighted, positions, focusKey]);

  void center;

  // Frame the whole transition, not just one end of it: a variant can be
  // larger or smaller than its parent (a cleaved lipid, an added ring).
  const morphRadius = useMemo(() => {
    if (!morph) return 0;
    let maxD = 1;
    for (const a of morph.atoms) {
      for (const p of [a.from, a.to]) {
        const d = Math.hypot(p[0], p[1], p[2]);
        if (d > maxD) maxD = d;
      }
    }
    return maxD;
  }, [morph]);

  const viewRadius = animating ? Math.max(radius, morphRadius) : radius;

  return (
    <Canvas camera={{ position: [0, 0, viewRadius * 3 + 6], fov: 45 }} dpr={[1, 2]}>
      <color attach="background" args={["#0b0f14"]} />
      <ambientLight intensity={0.7} />
      <directionalLight position={[6, 8, 10]} intensity={1.1} />
      <directionalLight position={[-8, -4, -6]} intensity={0.4} />
      {animating ? (
        <MorphScene
          model={morph!}
          progressRef={progressRef ?? fallbackProgress}
          highlighted={highlighted}
        />
      ) : (
        <>
          <Atoms atoms={atoms} positions={positions} highlighted={highlighted} changed={changedSet} />
          <Bonds atoms={atoms} bonds={bonds} positions={positions} />
        </>
      )}
      <Controls controls={controls} />
      <CameraFocus target={focusTarget} controls={controls} />
    </Canvas>
  );
}
