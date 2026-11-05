// Sân vườn sau nhà: bãi cỏ có hàng rào cây, mảnh vườn chỉnh được kích thước,
// bên trong là các luống rau / cây ăn quả và hồ cá do người chơi tự xây.
import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { RoundedBox } from '@react-three/drei';
import * as THREE from 'three';
import { GhostCtx, Inst, Mat, ScreenLabel, checker, hash, mix, rng, useNight, useOccluder } from './kit.jsx';
import { Trees } from './Nature.jsx';
import { Avatar, Puppy, hairColor, shirtColor } from './Characters.jsx';
import { clamp, stepWalker, useWalkControls } from './walk.js';

// Mảnh vườn bắt đầu cách tường nhà GZ mét (chừa hiên sau để đi lại); vườn chạy theo +z.
export const GZ = 1.6;
// Vùng đi được: giữa hàng rào cây hai bên, tường nhà phía sau và hàng rào phía trước.
const WALK = { x0: -10.3, x1: 10.3, z0: -0.75, z1: GZ + 12 + 2.4 };
const PLAYER_R = 0.3;
const SOIL_Y = 0.34;
const squareRing = new THREE.RingGeometry(1.32, 1.414, 4, 1).rotateZ(Math.PI / 4);

// Hộp va chạm / nhắm của một khu (tọa độ cảnh).
const boxOf = p => ({ x: p.x + p.w / 2, z: GZ + p.z + p.d / 2, hw: p.w / 2 - 0.06, hd: p.d / 2 - 0.06 });
const rectDist = (px, pz, b) => Math.hypot(Math.max(Math.abs(px - b.x) - b.hw, 0), Math.max(Math.abs(pz - b.z) - b.hd, 0));
const overlaps = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.z < b.z + b.d && b.z < a.z + a.d;

// Tiến độ lớn của cây 0..1 (theo giờ máy; server là nơi quyết định cuối cùng khi thu hoạch).
export function growthOf(plot, crops, now = Date.now()) {
  const c = plot.crop && crops.find(x => x.id === plot.crop);
  if (!c || !plot.planted_at) return 0;
  return Math.min(1, Math.max(0, (now - Date.parse(plot.planted_at)) / (c.grow * 60000)));
}
const isTree = (crop, crops) => !!crops.find(c => c.id === crop)?.tree;

// ---------- Khung cảnh: bãi cỏ, tường sau nhà, hiên, hàng rào cây ----------
function Yard({ zone }) {
  const night = useNight();
  const grass = useMemo(() => checker('#a9dc84', '#9fd37b', 2, [12, 10]), []);
  const wallOcc = useOccluder();
  const city = zone === 'city';
  const wall = city ? '#f3c57a' : '#f7ecd8', trim = city ? '#fff7ea' : '#a9764f';
  const glass = <Mat color="#b6dcea" emissive="#ffc46b" ei={0.05 + night * 1.6} rough={0.2} />;
  const deco = useMemo(() => {
    const r = rng(91), trees = [], bushes = [];
    for (let z = 0; z < 18; z += 3.2) [-13.4, 13.4].forEach(x => trees.push({ x: x + (r() - 0.5), z: z + r(), s: 0.85 + r() * 0.35, type: r() < 0.35 ? 'pine' : 'round', c: r() }));
    for (let x = -10; x <= 10; x += 3.4) trees.push({ x: x + r(), z: GZ + 17.6 + r(), s: 0.8 + r() * 0.4, type: r() < 0.3 ? 'pine' : 'round', c: r() });
    // Hàng rào cây bao quanh sân (trái, phải, trước).
    for (let z = -1; z <= GZ + 15; z += 1.3) [-11.1, 11.1].forEach(x => bushes.push({ p: [x, 0.55, z], s: [0.75, 0.62 + r() * 0.12, 0.8], c: mix('#6fb35f', '#86c46a', r()) }));
    for (let x = -11; x <= 11; x += 1.3) bushes.push({ p: [x, 0.55, GZ + 15.3], s: [0.8, 0.62 + r() * 0.12, 0.75], c: mix('#6fb35f', '#86c46a', r()) });
    return { trees, bushes };
  }, []);
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 8]} receiveShadow><planeGeometry args={[60, 60]} /><Mat color="#98cc78" rough={1} /></mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, GZ + 6.5]} receiveShadow><planeGeometry args={[23, 19]} /><Mat map={grass} rough={0.95} /></mesh>
      {/* Hiên lát đá sau nhà */}
      <mesh position={[0, 0.04, -0.3]} receiveShadow><boxGeometry args={[9, 0.08, 1.9]} /><Mat color="#e4dbcd" /></mesh>
      {/* Tường sau của ngôi nhà */}
      <group ref={wallOcc}>
        <mesh position={[0, 1.9, -1.65]} castShadow receiveShadow><boxGeometry args={[16, 3.8, 0.4]} /><Mat color={wall} rough={0.95} /></mesh>
        <mesh position={[0, 3.9, -1.55]} castShadow><boxGeometry args={[16.6, 0.25, 0.7]} /><Mat color={trim} /></mesh>
        <mesh position={[0, 4.4, -2.1]} rotation={[0.5, 0, 0]} castShadow><boxGeometry args={[17, 0.22, 2.4]} /><Mat color={city ? '#7f93b8' : '#c46d4f'} /></mesh>
        <mesh position={[0, 1.2, -1.42]}><boxGeometry args={[1.5, 2.4, 0.08]} /><Mat color="#8a5a3c" /></mesh>
        <mesh position={[0, 1.75, -1.36]}><boxGeometry args={[0.6, 0.6, 0.04]} />{glass}</mesh>
        {[-4.5, 4.5].map(x => (
          <group key={x} position={[x, 2.05, -1.42]}>
            <mesh><boxGeometry args={[1.8, 1.4, 0.1]} /><Mat color="#fffaf0" /></mesh>
            <mesh position={[0, 0, 0.04]}><boxGeometry args={[1.5, 1.1, 0.06]} />{glass}</mesh>
            <mesh position={[0, -0.85, 0.2]} castShadow><boxGeometry args={[1.9, 0.28, 0.4]} /><Mat color="#a9764f" /></mesh>
            {[-0.6, -0.2, 0.2, 0.6].map((fx, i) => <mesh key={fx} position={[fx, -0.62, 0.22]}><icosahedronGeometry args={[0.18, 0]} /><Mat flat color={['#f2727a', '#fff4e4', '#f6c453', '#c9a3f0'][i]} /></mesh>)}
          </group>
        ))}
        {/* Đèn hiên */}
        {[-1.2, 1.2].map(x => <mesh key={x} position={[x, 2.5, -1.3]}><boxGeometry args={[0.24, 0.34, 0.24]} /><Mat color="#fff3d1" emissive="#ffc46b" ei={0.2 + night * 2.2} /></mesh>)}
      </group>
      {/* Vòi nước, bình tưới và bao hạt giống cạnh hiên */}
      <group position={[-6.4, 0, -0.9]}>
        <mesh position={[0, 0.5, 0]} castShadow><cylinderGeometry args={[0.06, 0.06, 1, 8]} /><Mat color="#8f9aa6" metal={0.4} /></mesh>
        <mesh position={[0.7, 0.22, 0.2]} castShadow><cylinderGeometry args={[0.22, 0.25, 0.42, 12]} /><Mat color="#5fbfae" /></mesh>
        <mesh position={[0.98, 0.3, 0.2]} rotation={[0, 0, -0.9]} castShadow><cylinderGeometry args={[0.03, 0.05, 0.45, 6]} /><Mat color="#5fbfae" /></mesh>
        <RoundedBox args={[0.5, 0.6, 0.35]} radius={0.12} position={[-0.6, 0.3, 0.25]} castShadow><Mat color="#e7c98f" /></RoundedBox>
      </group>
      <Inst items={deco.bushes}><icosahedronGeometry args={[1, 1]} /><Mat flat rough={0.9} /></Inst>
      <Trees trees={deco.trees} />
    </group>
  );
}

// Mảnh vườn: nền đất cỏ nhạt có viền gỗ; hiện lưới ô 1 m khi đang xây khu.
function GardenBed({ width, depth, grid }) {
  const lines = useMemo(() => {
    const l = [];
    for (let i = 1; i < width; i++) l.push({ p: [-width / 2 + i, 0.05, GZ + depth / 2], s: [0.03, 1, depth] });
    for (let j = 1; j < depth; j++) l.push({ p: [0, 0.05, GZ + j], s: [width, 1, 0.03] });
    return l;
  }, [width, depth]);
  const edge = [
    [0, GZ - 0.06, width + 0.24, 0.12], [0, GZ + depth + 0.06, width + 0.24, 0.12],
    [-width / 2 - 0.06, GZ + depth / 2, 0.12, depth], [width / 2 + 0.06, GZ + depth / 2, 0.12, depth],
  ];
  return (
    <group>
      <mesh position={[0, 0.02, GZ + depth / 2]} receiveShadow><boxGeometry args={[width, 0.03, depth]} /><Mat color="#c9dd96" rough={1} /></mesh>
      {edge.map(([x, z, w, d], i) => <mesh key={i} position={[x, 0.07, z]} castShadow receiveShadow><boxGeometry args={[w, 0.14, d]} /><Mat color="#b98552" /></mesh>)}
      {[[-1, 0], [1, 0], [-1, 1], [1, 1]].map(([sx, sz]) => (
        <mesh key={sx + ':' + sz} position={[(sx * (width + 0.12)) / 2, 0.2, GZ + sz * depth + (sz ? 0.06 : -0.06)]} castShadow><boxGeometry args={[0.2, 0.4, 0.2]} /><Mat color="#9a6b47" /></mesh>
      ))}
      {grid && (
        <Inst items={lines} castShadow={false} receiveShadow={false}><boxGeometry args={[1, 0.005, 1]} /><Mat color="#ffffff" transparent opacity={0.45} /></Inst>
      )}
    </group>
  );
}

// ---------- Cây trồng ----------
// Giai đoạn: 0 hạt, 1 nảy mầm, 2 đang lớn, 3 chín.
const stageOf = g => (g >= 1 ? 3 : g >= 0.45 ? 2 : g >= 0.12 ? 1 : 0);
function CropCell({ crop, g, x, z, seed }) {
  const st = stageOf(g), y = SOIL_Y;
  const k = st === 3 ? 1 : 0.55 + 0.45 * g;
  const tilt = (hash(seed) - 0.5) * 0.4;
  if (st === 0) return <mesh position={[x, y + 0.02, z]} scale={[0.16, 0.05, 0.16]}><sphereGeometry args={[1, 8, 6]} /><Mat color="#6b4630" /></mesh>;
  if (st === 1) {
    return (
      <group position={[x, y, z]} rotation={[0, seed, 0]}>
        <mesh position={[0, 0.06, 0]}><cylinderGeometry args={[0.015, 0.015, 0.12, 4]} /><Mat color="#5fa35a" /></mesh>
        {[-1, 1].map(s => <mesh key={s} position={[s * 0.06, 0.12, 0]} scale={[0.07, 0.03, 0.05]}><sphereGeometry args={[1, 6, 4]} /><Mat color="#7cc46b" /></mesh>)}
      </group>
    );
  }
  const ripe = st === 3;
  switch (crop) {
    case 'cabbage':
      return (
        <group position={[x, y, z]} scale={k}>
          <mesh position={[0, 0.16, 0]} castShadow><icosahedronGeometry args={[0.26, 1]} /><Mat flat color="#8fcf72" /></mesh>
          <mesh position={[0, 0.24, 0]}><icosahedronGeometry args={[0.16, 1]} /><Mat flat color={ripe ? '#d6f0a8' : '#a9dc84'} /></mesh>
        </group>
      );
    case 'carrot':
      return (
        <group position={[x, y, z]} scale={k}>
          {[-0.07, 0, 0.07].map((dx, i) => <mesh key={dx} position={[dx, 0.2, (i - 1) * 0.03]} rotation={[0, 0, dx * 3]} castShadow><coneGeometry args={[0.05, 0.4, 5]} /><Mat flat color="#5fa35a" /></mesh>)}
          {ripe && <mesh position={[0, 0.03, 0]}><cylinderGeometry args={[0.08, 0.05, 0.08, 8]} /><Mat color="#f08a3c" /></mesh>}
        </group>
      );
    case 'sunflower':
      return (
        <group position={[x, y, z]} rotation={[0, tilt, 0]}>
          <mesh position={[0, 0.55 * k, 0]} castShadow><cylinderGeometry args={[0.03, 0.04, 1.1 * k, 6]} /><Mat color="#5fa35a" /></mesh>
          {[-1, 1].map(s => <mesh key={s} position={[s * 0.12, 0.4 * k, 0]} rotation={[0, 0, s * 0.6]} scale={[0.14, 0.03, 0.08]}><sphereGeometry args={[1, 6, 4]} /><Mat color="#6fb35f" /></mesh>)}
          <group position={[0, 1.1 * k + 0.05, 0.04]} rotation={[Math.PI / 2 - 0.35, 0, 0]}>
            <mesh castShadow><cylinderGeometry args={[ripe ? 0.24 : 0.1, ripe ? 0.24 : 0.1, 0.04, 14]} /><Mat color={ripe ? '#f6c453' : '#8fcf72'} /></mesh>
            {ripe && <mesh position={[0, 0.03, 0]}><cylinderGeometry args={[0.11, 0.11, 0.04, 12]} /><Mat color="#7a5238" /></mesh>}
          </group>
        </group>
      );
    case 'tomato':
      return (
        <group position={[x, y, z]} scale={k}>
          <mesh position={[0.12, 0.35, 0]}><cylinderGeometry args={[0.015, 0.015, 0.7, 4]} /><Mat color="#c9a26a" /></mesh>
          <mesh position={[0, 0.3, 0]} castShadow><icosahedronGeometry args={[0.24, 0]} /><Mat flat color="#5fa35a" /></mesh>
          {[[0.17, 0.25, 0.1], [-0.15, 0.32, 0.08], [0.02, 0.2, -0.18]].map(([fx, fy, fz]) => (
            <mesh key={fx} position={[fx, fy, fz]}><sphereGeometry args={[ripe ? 0.09 : 0.06, 8, 6]} /><Mat color={ripe ? '#e8483f' : '#a9dc84'} rough={0.4} /></mesh>
          ))}
        </group>
      );
    case 'pumpkin':
      return (
        <group position={[x, y, z]} scale={k}>
          <mesh position={[0, 0.08, 0]} scale={[0.32, 0.1, 0.32]} castShadow><icosahedronGeometry args={[1, 0]} /><Mat flat color="#5fa35a" /></mesh>
          <mesh position={[0.05, 0.16, 0.04]} scale={[1, 0.75, 1]} castShadow><sphereGeometry args={[ripe ? 0.24 : 0.1, 12, 8]} /><Mat color={ripe ? '#f08a3c' : '#9cd27a'} rough={0.5} /></mesh>
          {ripe && <mesh position={[0.05, 0.34, 0.04]}><cylinderGeometry args={[0.025, 0.03, 0.08, 5]} /><Mat color="#7a5238" /></mesh>}
        </group>
      );
    default:
      return null;
  }
}

// Cây ăn quả chiếm cả luống: lớn dần tới 60%, sau đó ra hoa và kết trái ở 100%.
function FruitTree({ crop, g, size, seed }) {
  const k = (0.3 + 0.7 * Math.min(1, g / 0.6)) * size;
  const ripe = g >= 1, bloom = g >= 0.6 && !ripe;
  const fruit = crop === 'apple' ? '#e8483f' : '#f59a2e';
  const spots = useMemo(() => {
    const r = rng(seed), s = [];
    for (let i = 0; i < 9; i++) {
      const a = r() * Math.PI * 2, e = 0.2 + r() * 0.9;
      s.push([Math.cos(a) * Math.cos(e) * 0.86, 0.15 + Math.sin(e) * 0.8, Math.sin(a) * Math.cos(e) * 0.86]);
    }
    return s;
  }, [seed]);
  return (
    <group position={[0, SOIL_Y, 0]} scale={k}>
      <mesh position={[0, 0.6, 0]} castShadow><cylinderGeometry args={[0.09, 0.14, 1.2, 7]} /><Mat color="#a0704c" /></mesh>
      <group position={[0, 1.45, 0]}>
        <mesh castShadow><icosahedronGeometry args={[0.8, 1]} /><Mat flat color={crop === 'apple' ? '#6fb35f' : '#5fa35a'} rough={0.9} /></mesh>
        <mesh position={[0.4, -0.15, 0.25]}><icosahedronGeometry args={[0.5, 1]} /><Mat flat color="#7cc46b" rough={0.9} /></mesh>
        {(ripe || bloom) && spots.map((p, i) => (
          <mesh key={i} position={p}><sphereGeometry args={[ripe ? 0.13 : 0.07, 8, 6]} /><Mat color={ripe ? fruit : crop === 'apple' ? '#f7c5d2' : '#fff7ea'} rough={0.4} /></mesh>
        ))}
      </group>
    </group>
  );
}

// Ngôi sao nhỏ nhấp nhô báo hiệu luống đã chín.
function Sparkle({ y }) {
  const ref = useRef();
  useFrame(({ clock }) => {
    if (!ref.current) return;
    ref.current.position.y = y + Math.sin(clock.elapsedTime * 3) * 0.08;
    ref.current.rotation.y = clock.elapsedTime * 2;
  });
  return <mesh ref={ref}><octahedronGeometry args={[0.14, 0]} /><Mat color="#ffe27a" emissive="#ffc94d" ei={1.2} toneMapped={false} /></mesh>;
}

function Bed({ plot, crops, now }) {
  const g = growthOf(plot, crops, now);
  const tree = plot.crop && isTree(plot.crop, crops);
  const cells = [];
  if (plot.crop && !tree) {
    for (let i = 0; i < plot.w; i++) for (let j = 0; j < plot.d; j++) {
      cells.push(<CropCell key={i + ':' + j} crop={plot.crop} g={g} x={i - plot.w / 2 + 0.5} z={j - plot.d / 2 + 0.5} seed={plot.id * 31 + i * 7 + j} />);
    }
  }
  const ripe = plot.crop && g >= 1;
  const size = Math.min(1.25, 0.55 + Math.min(plot.w, plot.d) * 0.3);
  return (
    <group>
      <mesh position={[0, 0.16, 0]} castShadow receiveShadow><boxGeometry args={[plot.w - 0.12, 0.32, plot.d - 0.12]} /><Mat color="#9a6b47" /></mesh>
      <mesh position={[0, 0.17, 0]} receiveShadow><boxGeometry args={[plot.w - 0.34, 0.34, plot.d - 0.34]} /><Mat color={plot.crop ? '#6f4a33' : '#80583d'} rough={1} /></mesh>
      {/* Rãnh luống */}
      {!tree && Array.from({ length: plot.d - 1 }, (_, j) => (
        <mesh key={j} position={[0, SOIL_Y + 0.005, j + 1 - plot.d / 2]}><boxGeometry args={[plot.w - 0.4, 0.01, 0.05]} /><Mat color="#5e3e2a" /></mesh>
      ))}
      {cells}
      {tree && <FruitTree crop={plot.crop} g={g} size={size} seed={plot.id} />}
      {ripe && <Sparkle y={tree ? SOIL_Y + 2.4 * size : 1.25} />}
    </group>
  );
}

// ---------- Hồ cá ----------
const FISH_LOOK = { goldfish: ['#ff8a3d', '#ffb36b'], koi: ['#fff6ec', '#f2553f'], guppy: ['#4fa3e0', '#c9a3f0'] };
function FishSchool({ fish, rx, rz, seed }) {
  const refs = useRef([]);
  const params = useMemo(() => fish.map((_, i) => {
    const r = rng(seed * 13 + i);
    return { ph: r() * Math.PI * 2, sp: (0.35 + r() * 0.35) * (r() < 0.5 ? 1 : -1), rad: 0.45 + r() * 0.5, wob: r() * 3 };
  }), [fish, seed]);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    params.forEach((q, i) => {
      const g = refs.current[i];
      if (!g) return;
      const a = q.ph + t * q.sp, rr = q.rad + Math.sin(t * 0.7 + q.wob) * 0.12;
      const x = Math.cos(a) * rx * rr, z = Math.sin(a) * rz * rr;
      // Hướng bơi = tiếp tuyến quỹ đạo.
      const tx = -Math.sin(a) * rx * Math.sign(q.sp), tz = Math.cos(a) * rz * Math.sign(q.sp);
      g.position.set(x, 0.1 + Math.sin(t * 2 + q.wob) * 0.015, z);
      g.rotation.y = Math.atan2(tx, tz);
      const tail = g.children[1];
      if (tail) tail.rotation.y = Math.sin(t * 9 + q.wob) * 0.5;
    });
  });
  return fish.map((sp, i) => {
    const [body, mark] = FISH_LOOK[sp] || FISH_LOOK.goldfish;
    return (
      <group key={i} ref={el => { refs.current[i] = el; }}>
        <mesh scale={[0.09, 0.07, 0.2]}><sphereGeometry args={[1, 10, 8]} /><Mat color={body} rough={0.4} /></mesh>
        <group position={[0, 0, -0.18]}>
          <mesh position={[0, 0, -0.07]} rotation={[-Math.PI / 2, 0, 0]} scale={[1, 1, 0.35]}><coneGeometry args={[0.09, 0.16, 6]} /><Mat color={mark} rough={0.4} /></mesh>
        </group>
        {sp === 'koi' && <mesh position={[0, 0.045, 0.03]} scale={[0.06, 0.03, 0.09]}><sphereGeometry args={[1, 8, 6]} /><Mat color={mark} /></mesh>}
      </group>
    );
  });
}

function Pond({ plot }) {
  const iw = plot.w - 0.62, id = plot.d - 0.62;
  const pads = useMemo(() => {
    const r = rng(plot.id * 7 + 3), list = [];
    const n = Math.max(1, Math.floor((plot.w * plot.d) / 4));
    for (let i = 0; i < n; i++) list.push({ x: (r() - 0.5) * iw * 0.8, z: (r() - 0.5) * id * 0.8, s: 0.16 + r() * 0.1, f: r() < 0.5, a: r() * 6 });
    return list;
  }, [plot.id, plot.w, plot.d, iw, id]);
  const stones = useMemo(() => {
    const r = rng(plot.id * 3 + 1), list = [];
    const ring = (len, fixed, alongX) => {
      const n = Math.max(2, Math.round(len / 0.55));
      for (let i = 0; i < n; i++) {
        const t = -len / 2 + (len * (i + 0.5)) / n;
        list.push({ p: alongX ? [t, 0.14, fixed] : [fixed, 0.14, t], s: [0.34 + r() * 0.12, 0.16 + r() * 0.08, 0.3 + r() * 0.1], r: r() * 3, c: mix('#cfc6ba', '#a9a196', r()) });
      }
    };
    const hw = (plot.w - 0.3) / 2, hd = (plot.d - 0.3) / 2;
    ring(plot.w - 0.3, -hd, true); ring(plot.w - 0.3, hd, true); ring(plot.d - 0.9, -hw, false); ring(plot.d - 0.9, hw, false);
    return list;
  }, [plot.id, plot.w, plot.d]);
  return (
    <group>
      <mesh position={[0, 0.02, 0]} receiveShadow><boxGeometry args={[iw + 0.1, 0.03, id + 0.1]} /><Mat color="#3f7f8f" rough={1} /></mesh>
      <Inst items={stones}><dodecahedronGeometry args={[1, 0]} /><Mat flat /></Inst>
      <FishSchool fish={plot.fish} rx={iw / 2} rz={id / 2} seed={plot.id} />
      <mesh position={[0, 0.15, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[iw, id]} />
        <meshStandardMaterial color="#7fd0e6" transparent opacity={0.55} roughness={0.08} metalness={0.1} emissive="#4fb3d9" emissiveIntensity={0.12} depthWrite={false} />
      </mesh>
      {pads.map((l, i) => (
        <group key={i} position={[l.x, 0.16, l.z]} rotation={[0, l.a, 0]}>
          <mesh><cylinderGeometry args={[l.s, l.s, 0.015, 12, 1, false, 0.4, Math.PI * 2 - 0.4]} /><Mat color="#5fa35a" /></mesh>
          {l.f && <mesh position={[0.02, 0.05, 0]}><icosahedronGeometry args={[0.06, 0]} /><Mat flat color="#f7c5d2" /></mesh>}
        </group>
      ))}
    </group>
  );
}

export function PlotModel({ plot, crops, now }) {
  return plot.kind === 'pond' ? <Pond plot={plot} /> : <Bed plot={plot} crops={crops} now={now} />;
}

// ---------- Cảnh sân vườn ----------
// held: khu đang cầm để đặt { kind, w, d, id? } (id có nghĩa là đang di chuyển khu đã có).
export function Garden({ me, view, player, garden, crops, now, held, onPlace, onRotateHeld, onAction, onPickPlot, onTarget, onBlocked, entry = 'yard', onEnterHouse }) {
  // Xuất hiện ở đầu vườn, quay mặt về phía nhà để thấy cả mảnh vườn.
  // Đi ra từ cửa sau của nhà → đứng ngay trước cửa, quay mặt ra vườn; còn lại xuất hiện ở đầu vườn, quay về phía nhà.
  useLayoutEffect(() => {
    Object.assign(player.current, entry === 'house' ? { x: 0, z: 0.4, angle: 0, speed: 0, y: 0, level: 0 } : { x: 0, z: GZ + garden.depth + 1.2, angle: Math.PI, speed: 0, y: 0, level: 0 });
    view.current.roomLook.yaw = null; view.current.roomLook.cy = null;
  }, [player, view]); // eslint-disable-line react-hooks/exhaustive-deps
  const entered = useRef(false);
  const anim = useRef({ moving: false, run: false });
  const vel = useRef({ x: 0, z: 0 });
  const avatar = useRef(), ghost = useRef(), ghostPad = useRef(), targetRing = useRef();
  const spot = useRef({ x: 0, z: 0, valid: false });
  const [target, setTarget] = useState(null);
  const { gl } = useThree();
  const latest = useRef();
  latest.current = { garden, held, target, onPlace, onRotateHeld, onAction, onPickPlot, onBlocked };

  useEffect(() => { onTarget?.(target); }, [target, onTarget]);
  useEffect(() => { if (held) setTarget(null); }, [held]);
  // Khu đang nhắm bị xóa / thay đổi → cập nhật theo dữ liệu mới.
  useEffect(() => { setTarget(t => (t ? garden.plots.find(p => p.id === t.id) || null : t)); }, [garden.plots]);

  // Chuột trái: đặt khu / thao tác chính (gieo, thu hoạch, thả cá). Chuột phải: xoay khu đang cầm / nhấc khu lên để dời.
  const keys = useWalkControls(gl, view, button => {
    const L = latest.current;
    if (button === 0) {
      if (L.held) { if (spot.current.valid) L.onPlace({ x: spot.current.x, z: spot.current.z }); else L.onBlocked?.(); }
      else if (L.target) L.onAction(L.target);
    } else if (button === 2) {
      if (L.held) L.onRotateHeld(); else if (L.target) L.onPickPlot(L.target);
    }
  });

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.06), p = player.current, L = latest.current;
    const { width: W, depth: D } = L.garden;
    const others = L.garden.plots.filter(q => q.id !== L.held?.id);
    const boxes = others.map(q => ({ q, ...boxOf(q) }));
    stepWalker({ p, v: vel.current, k: keys.current, yaw: view.current.tp ? view.current.roomLook.yaw : null, dt, anim, walk: WALK, hit: (x, z) => boxes.some(b => rectDist(x, z, b) < PLAYER_R) });
    // Đi vào cửa sau của nhà (giữa tường nhà) → vào trong nhà.
    if (!entered.current && p.z < WALK.z0 + 0.12 && Math.abs(p.x) < 0.75 && vel.current.z < 0) { entered.current = true; onEnterHouse?.(); }
    avatar.current?.position.set(p.x, 0, p.z);
    if (avatar.current) avatar.current.rotation.y = p.angle;
    const dx = Math.sin(p.angle), dz = Math.cos(p.angle);

    if (L.held) {
      // ---- Đang xây khu: ô lưới ngay trước mặt, bám theo mép vườn ----
      const { w, d } = L.held;
      const reach = 0.55 + Math.abs(dx) * (w / 2) + Math.abs(dz) * (d / 2);
      const gx = clamp(Math.round(p.x + dx * reach - w / 2), -W / 2, W / 2 - w);
      const gz = clamp(Math.round(p.z + dz * reach - GZ - d / 2), 0, D - d);
      const c = { x: gx, z: gz, w, d };
      const fits = w <= W && d <= D && Number.isInteger(gx) && Number.isInteger(gz);
      const valid = fits && !others.some(q => overlaps(q, c)) && rectDist(p.x, p.z, boxOf(c)) > PLAYER_R - 0.05;
      spot.current = { x: gx, z: gz, valid };
      ghost.current?.position.set(gx + w / 2, 0, GZ + gz + d / 2);
      ghostPad.current?.material.color.set(valid ? '#5fbfae' : '#f2727a');
      if (targetRing.current) targetRing.current.visible = false;
      return;
    }
    // ---- Tay không: khu gần nhất ở trước mặt ----
    let best = null, bestScore = 1.2;
    for (const b of boxes) {
      const dist = rectDist(p.x, p.z, b);
      if (dist > 0.95) continue;
      const tx = b.x - p.x, tz = b.z - p.z, tl = Math.hypot(tx, tz) || 1;
      const facing = (tx * dx + tz * dz) / tl;
      if (facing < -0.25 && dist > 0.05) continue;
      const score = dist - facing * 0.35;
      if (score < bestScore) { bestScore = score; best = b; }
    }
    if ((best?.q.id ?? null) !== (L.target?.id ?? null)) setTarget(best ? best.q : null);
    if (targetRing.current) {
      targetRing.current.visible = !!best;
      if (best) { targetRing.current.position.set(best.x, 0.05, best.z); targetRing.current.scale.set(best.hw + 0.2, best.hd + 0.2, 1); }
    }
  });

  return (
    <group>
      <Yard zone={me?.zone} />
      <ScreenLabel position={[0, 2.85, -1.2]} className="door-tag" text="🏠 Vào nhà" />
      <GardenBed width={garden.width} depth={garden.depth} grid={!!held} />
      {garden.plots.filter(q => q.id !== held?.id).map(q => (
        <group key={q.id} position={[q.x + q.w / 2, 0, GZ + q.z + q.d / 2]}>
          <PlotModel plot={q} crops={crops} now={now} />
        </group>
      ))}
      <mesh ref={targetRing} geometry={squareRing} rotation={[-Math.PI / 2, 0, 0]} visible={false}>
        <meshBasicMaterial color="#5fbfae" transparent opacity={0.9} depthWrite={false} />
      </mesh>
      {held && (
        <group ref={ghost}>
          <GhostCtx.Provider value={true}>
            <PlotModel plot={{ id: held.id || 0, kind: held.kind, w: held.w, d: held.d, crop: held.crop || null, planted_at: held.planted_at || null, fish: held.fish || [] }} crops={crops} now={now} />
          </GhostCtx.Provider>
          <mesh ref={ghostPad} position={[0, 0.06, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <planeGeometry args={[held.w, held.d]} />
            <meshBasicMaterial color="#5fbfae" transparent opacity={0.35} depthWrite={false} />
          </mesh>
        </group>
      )}
      <group ref={avatar}>
        <Avatar anim={anim} shirt={shirtColor(me?.id)} hair={hairColor(me?.id)} name={me?.display_name} />
      </group>
      <Puppy player={player} bounds={WALK} />
    </group>
  );
}
