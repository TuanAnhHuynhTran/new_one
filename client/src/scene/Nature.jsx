import React, { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { Inst, Mat, rng, stripes, mix } from './kit.jsx';
import { MAP, CAFE } from '../world.js';

// ---------- Bầu trời ----------
export function SkyDome({ top, bottom }) {
  const ref = useRef();
  const mat = useMemo(() => new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false,
    uniforms: { top: { value: new THREE.Color() }, bottom: { value: new THREE.Color() } },
    vertexShader: `varying vec3 vP;
void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `uniform vec3 top; uniform vec3 bottom; varying vec3 vP;
void main(){
  float h = clamp(vP.y * 1.6 + 0.12, 0.0, 1.0);
  gl_FragColor = vec4(mix(bottom, top, pow(h, 0.75)), 1.0);
  #include <colorspace_fragment>
}`,
  }), []);
  useEffect(() => { mat.uniforms.top.value.set(top); mat.uniforms.bottom.value.set(bottom); }, [mat, top, bottom]);
  useFrame(({ camera }) => ref.current?.position.copy(camera.position));
  return <mesh ref={ref} material={mat} renderOrder={-2} frustumCulled={false}><sphereGeometry args={[420, 32, 16]} /></mesh>;
}

export function Stars({ night }) {
  const ref = useRef();
  const geo = useMemo(() => {
    const r = rng(99), pts = [];
    for (let i = 0; i < 500; i++) {
      const th = r() * Math.PI * 2, ph = Math.acos(0.15 + r() * 0.85);
      pts.push(380 * Math.sin(ph) * Math.cos(th), 380 * Math.cos(ph), 380 * Math.sin(ph) * Math.sin(th));
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    return g;
  }, []);
  useFrame(({ camera }) => ref.current?.position.copy(camera.position));
  if (night < 0.55) return null;
  return (
    <points ref={ref} geometry={geo} frustumCulled={false} renderOrder={-1}>
      <pointsMaterial color="#fff8e1" size={2.2} sizeAttenuation={false} transparent opacity={(night - 0.55) / 0.45} depthWrite={false} fog={false} />
    </points>
  );
}

export function SunMoon({ night }) {
  const ref = useRef();
  useFrame(({ camera }) => ref.current?.position.set(camera.position.x + 160, camera.position.y + 150, camera.position.z - 260));
  const moon = night > 0.6;
  return (
    <group ref={ref}>
      <mesh><sphereGeometry args={[moon ? 9 : 13, 24, 16]} /><meshBasicMaterial color={moon ? '#fff4d6' : '#fff1b8'} fog={false} toneMapped={false} /></mesh>
      <mesh><sphereGeometry args={[moon ? 14 : 22, 24, 16]} /><meshBasicMaterial color={moon ? '#c9d4ff' : '#ffe49a'} transparent opacity={0.25} fog={false} depthWrite={false} toneMapped={false} /></mesh>
    </group>
  );
}

// ---------- Mây & khinh khí cầu ----------
const puffGeo = new THREE.IcosahedronGeometry(1, 1);
export function Clouds({ night = 0, count = 12, area = 170, y = 48, seed = 5, speed = 1, size = 1, spreadY = 14 }) {
  const clouds = useMemo(() => {
    const r = rng(seed);
    return Array.from({ length: count }, () => ({
      x: (r() - 0.5) * area * 2, z: (r() - 0.5) * area * 2, y: y + r() * spreadY, s: (2.4 + r() * 2.4) * size, v: 0.6 + r() * 0.8,
      puffs: Array.from({ length: 4 + Math.floor(r() * 3) }, (_, i) => [i * 1.5 - 3 + r(), r() * 0.8, (r() - 0.5) * 1.6, 0.9 + r() * 0.7]),
    }));
  }, [count, area, y, seed]);
  const refs = useRef([]);
  useFrame((_, dt) => {
    clouds.forEach((c, i) => {
      c.x += c.v * dt * speed;
      if (c.x > area + 40) c.x = -area - 40;
      refs.current[i]?.position.set(c.x, c.y, c.z);
    });
  });
  const color = mix('#ffffff', '#6f7bb0', night * 0.8);
  return clouds.map((c, i) => (
    <group key={i} ref={el => (refs.current[i] = el)} position={[c.x, c.y, c.z]} scale={c.s}>
      {c.puffs.map(([px, py, pz, ps], j) => (
        <mesh key={j} geometry={puffGeo} position={[px, py, pz]} scale={[ps, ps * 0.8, ps]}>
          <meshStandardMaterial color={color} roughness={1} flatShading emissive={color} emissiveIntensity={0.6} fog={false} />
        </mesh>
      ))}
    </group>
  ));
}

export function Balloons() {
  const list = useMemo(() => [
    { x: -20, z: -70, y: 34, a: '#f47c6a', b: '#ffe7b8' },
    { x: 55, z: -85, y: 42, a: '#7cc6e8', b: '#fff6e0' },
    { x: 110, z: 20, y: 38, a: '#f6c453', b: '#ef8f6a' },
  ], []);
  const refs = useRef([]);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    list.forEach((b, i) => refs.current[i]?.position.set(b.x + Math.sin(t * 0.05 + i) * 8, b.y + Math.sin(t * 0.4 + i * 2) * 1.2, b.z));
  });
  return list.map((b, i) => (
    <group key={i} ref={el => (refs.current[i] = el)}>
      <mesh scale={[3, 3.5, 3]}><sphereGeometry args={[1, 16, 12]} /><Mat map={stripes(b.a, b.b, 10)} rough={0.6} /></mesh>
      <mesh position={[0, -3.6, 0]}><cylinderGeometry args={[1.1, 0.5, 1.2, 12]} /><Mat color={b.a} /></mesh>
      <mesh position={[0, -5.2, 0]}><boxGeometry args={[1, 0.8, 1]} /><Mat color="#a8744f" /></mesh>
    </group>
  ));
}

// ---------- Cây, bụi, hoa ----------
// Các vùng không trồng cây ngẫu nhiên (đường, nhà, suối, quảng trường).
function blockedRects(nodes) {
  const R = [
    [-50, -2, -52, 52],
    [-4, 9, -200, 200], // dải công viên giữa hai khu: chỉ có hàng cây bồn
    [CAFE.x - 8, CAFE.x + 7, CAFE.z - 10, CAFE.z + 15],
    [MAP.ruralPathX - 3, MAP.ruralPathX + 3, -200, 200],
    [MAP.streamX - 3.5, MAP.streamX + 3.5, -200, 200],
    ...MAP.ruralPathsZ.map(z => [-4, 90, z - 3.2, z + 3.2]),
  ];
  nodes.filter(p => p.zone === 'rural').forEach(p => R.push([+p.world_x - 12, +p.world_x + 12, +p.world_z - 12, +p.world_z + 12]));
  return R;
}

export function buildNature(nodes) {
  const r = rng(2024);
  const trees = [];
  const rects = blockedRects(nodes);
  const free = (x, z) => !rects.some(([x0, x1, z0, z1]) => x > x0 && x < x1 && z > z0 && z < z1) && trees.every(t => (t.x - x) ** 2 + (t.z - z) ** 2 > 10);
  for (let i = 0; i < 2600 && trees.length < 260; i++) {
    const x = -80 + r() * 200, z = -100 + r() * 200;
    if (!free(x, z)) continue;
    const outer = x < -52 || x > 92 || Math.abs(z) > 72;
    trees.push({ x, z, s: outer ? 1 + r() * 0.7 : 0.65 + r() * 0.3, type: x > 8 && r() < 0.55 ? 'pine' : 'round', c: r() });
  }
  // Cây trong bồn ở góc các lô phố, cây trong sân nhà vườn.
  nodes.forEach(p => {
    const x = +p.world_x, z = +p.world_z;
    if (p.zone === 'city') [[-5.1, -5.1], [5.1, -5.1], [-5.1, 5.1], [5.1, 5.1]].forEach(([dx, dz]) => trees.push({ x: x + dx, z: z + dz, s: 0.5, type: 'round', c: r(), planter: true }));
    else [[-8.4, -8.2], [8.4, -8.2]].forEach(([dx, dz], k) => trees.push({ x: x + dx, z: z + dz, s: 0.75 + r() * 0.3, type: (p.id + k) % 2 ? 'pine' : 'round', c: r() }));
  });
  // Hàng cây dọc đại lộ phía đông và quanh quảng trường.
  for (let z = -46; z <= 46; z += 8) if (z < CAFE.z - 10 || z > CAFE.z + 15) trees.push({ x: -2.6, z, s: 0.6, type: 'round', c: r(), planter: true });
  return trees;
}

const ROUND = ['#7cc46b', '#8fd06f', '#6bb86a', '#a3d873', '#5fae6b'];
const PINE = ['#3f7d6b', '#4a8c73', '#2f6d61'];
export function Trees({ trees }) {
  const parts = useMemo(() => {
    const trunk = [], round = [], blob = [], pine = [], planters = [];
    trees.forEach(t => {
      const s = t.s;
      if (t.planter) planters.push({ p: [t.x, 0.25, t.z], s: [1, 1, 1] });
      if (t.type === 'pine') {
        trunk.push({ p: [t.x, 0.6 * s, t.z], s: [s, s * 1.2, s] });
        const col = PINE[Math.floor(t.c * PINE.length)];
        [[1.9, 2.2, 1.6], [2.9, 1.7, 1.25], [3.8, 1.2, 0.9]].forEach(([y, h, w]) => pine.push({ p: [t.x, y * s, t.z], s: [w * s, h * s, w * s], c: col, r: t.c * 6 }));
      } else {
        trunk.push({ p: [t.x, 0.9 * s, t.z], s: [s, s * 1.8, s] });
        const col = ROUND[Math.floor(t.c * ROUND.length)];
        round.push({ p: [t.x, 2.6 * s, t.z], s: 1.45 * s, c: col, r: t.c * 6, rx: t.c });
        blob.push({ p: [t.x + 0.75 * s, 2.25 * s, t.z + 0.35 * s], s: 0.85 * s, c: mix(col, '#ffffff', 0.12), r: t.c * 3 });
      }
    });
    return { trunk, round, blob, pine, planters };
  }, [trees]);
  return (
    <>
      <Inst items={parts.trunk}><cylinderGeometry args={[0.16, 0.24, 1, 7]} /><Mat color="#a0704c" /></Inst>
      <Inst items={parts.round}><icosahedronGeometry args={[1, 1]} /><Mat flat rough={0.9} /></Inst>
      <Inst items={parts.blob}><icosahedronGeometry args={[1, 1]} /><Mat flat rough={0.9} /></Inst>
      <Inst items={parts.pine}><coneGeometry args={[1, 1, 7]} /><Mat flat rough={0.9} /></Inst>
      <Inst items={parts.planters}><cylinderGeometry args={[0.75, 0.65, 0.5, 12]} /><Mat color="#d9cfc0" /></Inst>
    </>
  );
}

// Bụi cây và hoa: bushes [{x,z,s,c}], flowers [{x,z,c}]
export function Shrubs({ bushes = [], flowers = [] }) {
  const b = useMemo(() => bushes.map(t => ({ p: [t.x, 0.35 * t.s, t.z], s: [t.s, t.s * 0.75, t.s], c: t.c, r: t.x })), [bushes]);
  const stems = useMemo(() => flowers.map(f => ({ p: [f.x, 0.18, f.z], s: 1 })), [flowers]);
  const heads = useMemo(() => flowers.map(f => ({ p: [f.x, 0.42, f.z], s: f.s ?? 1, c: f.c })), [flowers]);
  return (
    <>
      <Inst items={b}><icosahedronGeometry args={[0.8, 1]} /><Mat flat rough={0.9} /></Inst>
      <Inst items={stems} castShadow={false}><cylinderGeometry args={[0.03, 0.03, 0.36, 4]} /><Mat color="#4f9a55" /></Inst>
      <Inst items={heads}><icosahedronGeometry args={[0.14, 0]} /><Mat flat rough={0.6} /></Inst>
    </>
  );
}
