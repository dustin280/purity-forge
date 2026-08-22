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

type Props = {
  atoms: StructureAtom[];
  bonds: StructureBond[];
  highlighted: Set<number>;
  focusKey: string;
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

function Atoms({ atoms, positions, highlighted }: { atoms: StructureAtom[]; positions: Map<number, THREE.Vector3>; highlighted: Set<number> }) {
  return (
    <group>
      {atoms.map(a => {
        const p = positions.get(a.id)!;
        const on = highlighted.size > 0 && highlighted.has(a.id);
        const dim = highlighted.size > 0 && !on;
        const r = (RADIUS[a.element.toUpperCase()] ?? 0.36) * (on ? 1.35 : 1);
        return (
          <mesh key={a.id} position={p}>
            <sphereGeometry args={[r, 20, 20]} />
            <meshStandardMaterial
              color={elementColor(a.element)}
              emissive={on ? elementColor(a.element) : "#000000"}
              emissiveIntensity={on ? 0.75 : 0}
              transparent={dim}
              opacity={dim ? 0.25 : 1}
              roughness={0.35}
              metalness={0.05}
            />
          </mesh>
        );
      })}
    </group>
  );
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

export function MoleculeViewer({ atoms, bonds, highlighted, focusKey }: Props) {
  const controls = useRef<{ target: THREE.Vector3; update: () => void } | null>(null);

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

  return (
    <Canvas camera={{ position: [0, 0, radius * 3 + 6], fov: 45 }} dpr={[1, 2]}>
      <color attach="background" args={["#0b0f14"]} />
      <ambientLight intensity={0.7} />
      <directionalLight position={[6, 8, 10]} intensity={1.1} />
      <directionalLight position={[-8, -4, -6]} intensity={0.4} />
      <Atoms atoms={atoms} positions={positions} highlighted={highlighted} />
      <Bonds atoms={atoms} bonds={bonds} positions={positions} />
      <CameraFocus target={focusTarget} controls={controls} />
      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
      <OrbitControls ref={controls as any} enableDamping dampingFactor={0.1} />
    </Canvas>
  );
}
