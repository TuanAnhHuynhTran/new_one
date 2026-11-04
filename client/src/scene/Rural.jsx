import React, { useMemo } from 'react';
import { RoundedBox } from '@react-three/drei';
import { GableRoof, Inst, Mat, checker, hash, mix, pick, rng, useNight, useOccluder } from './kit.jsx';
import { Shrubs } from './Nature.jsx';
import { HomeFlag } from './City.jsx';
import { MAP } from '../world.js';

const DIRT = '#dcbf8f';

// Bố cục sân nhà vườn (tọa độ tương đối với tâm lô) — dùng chung cho hình vẽ và va chạm.
const FE = 10.6;
export const FENCE_SIDES = [[-FE, -FE, FE, -FE], [-FE, -FE, -FE, FE], [FE, -FE, FE, FE], [-FE, FE, -1.6, FE], [1.6, FE, FE, FE]];
export const BED_SPOTS = [[-6.4, 6.6], [6.4, 6.6]];
export const GATE_POSTS = [[-1.9, 10.7], [1.9, 10.7], [2.4, 10.9]]; // 2 cột đèn + hộp thư

// ---------- Mặt đất nông thôn: cỏ ô vuông, đường đất, suối và cầu gỗ ----------
export function RuralGround() {
  const grass = useMemo(() => checker('#a9dc84', '#9cd27a', 2, [44, 80]), []);
  return (
    <group>
      <mesh position={[49, 0.012, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow><planeGeometry args={[88, 160]} /><Mat map={grass} rough={0.95} /></mesh>
      <mesh position={[MAP.ruralPathX, 0.03, 0]} receiveShadow><boxGeometry args={[4, 0.04, 160]} /><Mat color={DIRT} rough={1} /></mesh>
      {MAP.ruralPathsZ.map(z => (
        <mesh key={z} position={[43, 0.028, z]} receiveShadow><boxGeometry args={[94, 0.04, 4]} /><Mat color={DIRT} rough={1} /></mesh>
      ))}
      <Stream />
    </group>
  );
}

function Stream() {
  const rocks = useMemo(() => {
    const r = rng(77), list = [];
    for (let z = -78; z < 78; z += 2.6) {
      [-1, 1].forEach(side => list.push({ p: [MAP.streamX + side * (1.9 + r() * 0.4), 0.12, z + r()], s: [0.5 + r() * 0.5, 0.35 + r() * 0.3, 0.6 + r() * 0.6], r: r() * 3, c: mix('#b9b2a8', '#8f8980', r()) }));
    }
    return list;
  }, []);
  return (
    <group>
      <mesh position={[MAP.streamX, 0.035, 0]} receiveShadow><boxGeometry args={[4.6, 0.04, 160]} /><Mat color="#c9b48a" /></mesh>
      <mesh position={[MAP.streamX, 0.07, 0]}><boxGeometry args={[3.4, 0.04, 160]} /><Mat color="#7fd0e6" rough={0.15} metal={0.1} emissive="#4fb3d9" ei={0.15} /></mesh>
      <Inst items={rocks}><dodecahedronGeometry args={[1, 0]} /><Mat flat /></Inst>
      {MAP.ruralPathsZ.map(z => <Bridge key={z} z={z} />)}
    </group>
  );
}

function Bridge({ z }) {
  return (
    <group position={[MAP.streamX, 0, z]}>
      <mesh position={[0, 0.25, 0]} castShadow receiveShadow><boxGeometry args={[5.6, 0.25, 3.4]} /><Mat color="#b98552" /></mesh>
      {[-1.6, 1.6].map(dz => (
        <group key={dz}>
          <mesh position={[0, 0.85, dz]} castShadow><boxGeometry args={[5.6, 0.12, 0.12]} /><Mat color="#9a6b47" /></mesh>
          {[-2.6, -1.3, 0, 1.3, 2.6].map(x => <mesh key={x} position={[x, 0.6, dz]} castShadow><boxGeometry args={[0.16, 0.7, 0.16]} /><Mat color="#9a6b47" /></mesh>)}
        </group>
      ))}
    </group>
  );
}

// ---------- Nhà vườn ----------
const ROOFS = ['#6f9a5c', '#c46d4f', '#7d8fb3', '#a8744f', '#5f8f7f'];
const WALLS = ['#f7ecd8', '#fbe6d0', '#f3efe4', '#fde9c9'];

export function Cottage({ seed = 1, owned = false }) {
  const night = useNight();
  const roof = owned ? '#e0735a' : pick(ROOFS, hash(seed * 3));
  const wall = pick(WALLS, hash(seed * 5));
  const wood = '#a9764f';
  const glass = <Mat color="#b6dcea" emissive="#ffc46b" ei={0.05 + night * 1.5} rough={0.2} />;
  const W = 7.6, D = 6, H = 3;
  const occ = useOccluder();
  return (
    <group ref={occ}>
      <mesh position={[0, 0.2, 0]} castShadow receiveShadow><boxGeometry args={[W + 0.4, 0.4, D + 0.4]} /><Mat color="#b9ada0" /></mesh>
      <mesh position={[0, 0.4 + H / 2, 0]} castShadow receiveShadow><boxGeometry args={[W, H, D]} /><Mat color={wall} /></mesh>
      {[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sz]) => (
        <mesh key={sx + ':' + sz} position={[(sx * W) / 2, 0.4 + H / 2, (sz * D) / 2]} castShadow><boxGeometry args={[0.32, H, 0.32]} /><Mat color={wood} /></mesh>
      ))}
      <mesh position={[0, 0.4 + H + 0.08, 0]}><boxGeometry args={[W + 0.2, 0.16, D + 0.2]} /><Mat color={wood} /></mesh>
      <GableRoof len={W} depth={D} rise={2.5} y={0.4 + H + 0.16} wallColor={wall} roofColor={roof} overhang={0.65} />
      <group position={[2.2, 0, -1.3]}>
        <mesh position={[0, 5.4, 0]} castShadow><boxGeometry args={[0.8, 2.2, 0.8]} /><Mat color="#c0644a" /></mesh>
        <mesh position={[0, 6.55, 0]} castShadow><boxGeometry args={[1, 0.2, 1]} /><Mat color="#9e4f3a" /></mesh>
      </group>
      {/* Cửa chính */}
      <mesh position={[0, 1.55, D / 2 + 0.02]}><boxGeometry args={[1.6, 2.4, 0.1]} /><Mat color={wood} /></mesh>
      <mesh position={[0, 1.5, D / 2 + 0.06]}><boxGeometry args={[1.25, 2.2, 0.08]} /><Mat color="#7d5136" /></mesh>
      <mesh position={[0, 2.1, D / 2 + 0.11]}><boxGeometry args={[0.6, 0.5, 0.03]} />{glass}</mesh>
      <mesh position={[0.42, 1.4, D / 2 + 0.13]}><sphereGeometry args={[0.07, 8, 6]} /><Mat color="#f6c453" metal={0.4} rough={0.3} /></mesh>
      <mesh position={[0, 0.12, D / 2 + 0.55]} castShadow receiveShadow><boxGeometry args={[2.2, 0.24, 1]} /><Mat color="#cfc3b4" /></mesh>
      {/* Cửa sổ có bồn hoa */}
      {[-2.5, 2.5].map(x => (
        <group key={x} position={[x, 2.15, D / 2 + 0.02]}>
          <mesh><boxGeometry args={[1.35, 1.25, 0.12]} /><Mat color="#fffaf0" /></mesh>
          <mesh position={[0, 0, 0.04]}><boxGeometry args={[1.05, 0.95, 0.08]} />{glass}</mesh>
          <mesh position={[0, 0, 0.1]}><boxGeometry args={[0.08, 0.95, 0.03]} /><Mat color="#fffaf0" /></mesh>
          <mesh position={[0, -0.78, 0.2]} castShadow><boxGeometry args={[1.45, 0.3, 0.4]} /><Mat color={wood} /></mesh>
          {[-0.45, 0, 0.45].map((fx, i) => (
            <mesh key={fx} position={[fx, -0.55, 0.22]}><icosahedronGeometry args={[0.2, 0]} /><Mat flat color={['#f2727a', '#fff4e4', '#f6c453'][(i + Math.floor(hash(seed) * 3)) % 3]} /></mesh>
          ))}
        </group>
      ))}
      <group position={[W / 2 + 0.02, 2.15, 0]} rotation={[0, Math.PI / 2, 0]}>
        <mesh><boxGeometry args={[1.35, 1.25, 0.12]} /><Mat color="#fffaf0" /></mesh>
        <mesh position={[0, 0, 0.04]}><boxGeometry args={[1.05, 0.95, 0.08]} />{glass}</mesh>
      </group>
      {/* Đèn lồng cạnh cửa */}
      {[-1.15, 1.15].map(x => (
        <mesh key={x} position={[x, 2.45, D / 2 + 0.18]}><boxGeometry args={[0.22, 0.32, 0.22]} /><Mat color="#fff3d1" emissive="#ffc46b" ei={0.2 + night * 2} /></mesh>
      ))}
    </group>
  );
}

function CropBed({ x, z }) {
  return (
    <group position={[x, 0, z]}>
      <mesh position={[0, 0.25, 0]} castShadow receiveShadow><boxGeometry args={[5, 0.5, 3]} /><Mat color="#9a6b47" /></mesh>
      <mesh position={[0, 0.27, 0]} receiveShadow><boxGeometry args={[4.6, 0.52, 2.6]} /><Mat color="#7a5238" rough={1} /></mesh>
    </group>
  );
}

export function Farmstead({ plot, owned }) {
  const id = Number(plot.id);
  return (
    <group position={[+plot.world_x, 0, +plot.world_z]}>
      <mesh position={[0, 0.035, 0]} receiveShadow><boxGeometry args={[21.6, 0.04, 21.6]} /><Mat color={owned ? '#c3e69a' : '#b6e08e'} /></mesh>
      <Cottage seed={id} owned={owned} />
      {BED_SPOTS.map(([x, z]) => <CropBed key={x} x={x} z={z} />)}
      {/* Hộp thư và đèn cổng */}
      <group position={[2.4, 0, 10.9]}>
        <mesh position={[0, 0.55, 0]}><boxGeometry args={[0.12, 1.1, 0.12]} /><Mat color="#9a6b47" /></mesh>
        <RoundedBox args={[0.5, 0.42, 0.7]} radius={0.12} position={[0, 1.25, 0]} castShadow><Mat color="#e8524a" /></RoundedBox>
      </group>
      {[-1.9, 1.9].map(x => (
        <group key={x} position={[x, 0, 10.7]}>
          <mesh position={[0, 0.8, 0]} castShadow><boxGeometry args={[0.18, 1.6, 0.18]} /><Mat color="#3f6f63" /></mesh>
          <LanternHead y={1.75} />
        </group>
      ))}
      {owned && <HomeFlag y={6.2} />}
    </group>
  );
}
function LanternHead({ y }) {
  const night = useNight();
  return <mesh position={[0, y, 0]}><boxGeometry args={[0.32, 0.36, 0.32]} /><Mat color="#fff3d1" emissive="#ffc46b" ei={0.2 + night * 2.2} /></mesh>;
}

// ---------- Trang trí chung cho mọi nhà vườn (instanced): hàng rào, cây trồng, bụi hoa, đá lát ----------
const CROPS = ['tomato', 'wheat', 'cabbage', 'pumpkin', 'carrot'];
export function RuralDecor({ nodes }) {
  const d = useMemo(() => {
    const posts = [], rails = [], leaves = [], fruit = [], wheat = [], stones = [], bushes = [], flowers = [];
    const r = rng(31);
    nodes.filter(p => p.zone === 'rural').forEach(p => {
      const X = +p.world_x, Z = +p.world_z;
      // Hàng rào gỗ trắng quanh sân, chừa cổng phía trước.
      const side = (x0, z0, x1, z1) => {
        const len = Math.hypot(x1 - x0, z1 - z0), n = Math.max(1, Math.round(len / 2.1)), rot = Math.atan2(x1 - x0, z1 - z0);
        for (let i = 0; i <= n; i++) posts.push({ p: [X + x0 + ((x1 - x0) * i) / n, 0.55, Z + z0 + ((z1 - z0) * i) / n] });
        [0.42, 0.85].forEach(y => rails.push({ p: [X + (x0 + x1) / 2, y, Z + (z0 + z1) / 2], s: [0.08, 0.1, len], r: rot }));
      };
      FENCE_SIDES.forEach(s => side(...s));
      // Hai luống rau.
      BED_SPOTS.forEach(([bx, bz], bi) => {
        const crop = CROPS[(Math.floor(hash(+p.id * 13 + bi) * CROPS.length))];
        for (let i = 0; i < 4; i++) for (let j = 0; j < 2; j++) {
          const x = X + bx - 1.65 + i * 1.1, z = Z + bz - 0.6 + j * 1.2, y = 0.55;
          if (crop === 'wheat') { for (let k = 0; k < 3; k++) wheat.push({ p: [x + (k - 1) * 0.25, y + 0.45, z + (r() - 0.5) * 0.3], s: [0.12, 0.9 + r() * 0.3, 0.12], c: mix('#f2c94c', '#e5a93b', r()) }); continue; }
          if (crop === 'cabbage') { fruit.push({ p: [x, y + 0.22, z], s: 0.42, c: mix('#b8e08c', '#8fcf72', r()) }); continue; }
          if (crop === 'pumpkin') { leaves.push({ p: [x, y + 0.12, z], s: [0.5, 0.25, 0.5], c: '#5fa35a' }); fruit.push({ p: [x + 0.1, y + 0.22, z], s: [0.36, 0.28, 0.36], c: '#f08a3c' }); continue; }
          leaves.push({ p: [x, y + 0.32, z], s: [0.42, 0.42, 0.42], c: mix('#5fa35a', '#7cc46b', r()) });
          if (crop === 'tomato') [[0.2, 0.1], [-0.18, 0.15], [0.05, -0.2]].forEach(([dx, dz]) => fruit.push({ p: [x + dx, y + 0.35 + r() * 0.15, z + dz], s: 0.13, c: '#e8483f' }));
          else fruit.push({ p: [x, y + 0.08, z], s: [0.12, 0.1, 0.12], c: '#f08a3c' });
        }
      });
      // Lối đá từ cửa ra cổng.
      for (let z = 4.6; z < 10.6; z += 1.1) stones.push({ p: [X + (r() - 0.5) * 0.3, 0.06, Z + z], s: [0.55 + r() * 0.15, 1, 0.45], r: r() });
      // Bụi cẩm tú cầu dọc hàng rào sau, hoa trước nhà.
      for (let x = -7; x <= 7; x += 2.3) bushes.push({ x: X + x, z: Z - 9.4 + r() * 0.4, s: 0.9 + r() * 0.4, c: pick(['#7cc46b', '#f3f6ef', '#f7c5d2', '#c9d7f5'], r()) });
      for (let i = 0; i < 18; i++) flowers.push({ x: X + (r() < 0.5 ? -1 : 1) * (1.5 + r() * 2.5), z: Z + 3.6 + r() * 0.8, c: pick(['#f2727a', '#fff4e4', '#f6c453', '#c9a3f0', '#ff9f6b'], r()) });
    });
    // Hoa dại rải rác bên đường đất.
    for (let i = 0; i < 160; i++) {
      const z = pick(MAP.ruralPathsZ, r()) + (r() < 0.5 ? -1 : 1) * (2.3 + r() * 0.6);
      flowers.push({ x: 8 + r() * 80, z, c: pick(['#f2727a', '#fff4e4', '#f6c453', '#c9a3f0'], r()), s: 0.8 });
    }
    return { posts, rails, leaves, fruit, wheat, stones, bushes, flowers };
  }, [nodes]);
  return (
    <>
      <Inst items={d.posts}><boxGeometry args={[0.2, 1.1, 0.2]} /><Mat color="#fbf4e8" /></Inst>
      <Inst items={d.rails}><boxGeometry args={[1, 1, 1]} /><Mat color="#fbf4e8" /></Inst>
      <Inst items={d.leaves}><icosahedronGeometry args={[1, 0]} /><Mat flat /></Inst>
      <Inst items={d.fruit}><sphereGeometry args={[1, 10, 8]} /><Mat rough={0.5} /></Inst>
      <Inst items={d.wheat}><coneGeometry args={[1, 1, 5]} /><Mat flat /></Inst>
      <Inst items={d.stones} castShadow={false}><cylinderGeometry args={[1, 1, 0.08, 8]} /><Mat color="#d6cfc4" /></Inst>
      <Shrubs bushes={d.bushes} flowers={d.flowers} />
    </>
  );
}
