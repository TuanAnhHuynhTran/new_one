import React, { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { RoundedBox } from '@react-three/drei';
import * as THREE from 'three';
import { GableRoof, Inst, Mat, facade, hash, mix, pick, signTexture, stripes, useNight, useOccluder } from './kit.jsx';
import { MAP, CAFE } from '../world.js';

const ASPHALT = '#6d7480', PAVING = '#e6dfd2', CURB = '#cfc6b6';
const AV_W = 6, ST_W = 4;

// ---------- Mặt đất khu phố: vỉa hè, đại lộ, đường ngang, vạch kẻ ----------
export function CityGround() {
  const marks = useMemo(() => {
    const dashes = [], zebra = [];
    MAP.avenues.forEach(ax => {
      for (let z = -52; z < 52; z += 3) if (!MAP.cityStreets.some(s => Math.abs(z - s) < ST_W / 2 + 0.6)) dashes.push({ p: [ax, 0.075, z], s: [0.18, 1, 1.4] });
      MAP.cityStreets.forEach(s => {
        for (let k = -2; k <= 2; k++) [s - 3.3, s + 3.3].forEach(zc => zebra.push({ p: [ax + k * 1.15, 0.075, zc], s: [0.6, 1, 1.5] }));
      });
    });
    MAP.cityStreets.forEach(s => {
      for (let x = -40; x < -11; x += 3) if (Math.abs(x + 25.5) > 2) dashes.push({ p: [x, 0.075, s], s: [1.2, 1, 0.14] });
    });
    return { dashes, zebra };
  }, []);
  return (
    <group>
      <mesh position={[-26, 0.02, 0]} receiveShadow><boxGeometry args={[50, 0.04, 108]} /><Mat color={PAVING} /></mesh>
      {MAP.avenues.map(x => (
        <mesh key={x} position={[x, 0.05, 0]} receiveShadow><boxGeometry args={[AV_W, 0.04, 108]} /><Mat color={ASPHALT} rough={0.95} /></mesh>
      ))}
      {MAP.cityStreets.map(z => (
        <mesh key={z} position={[-25.5, 0.045, z]} receiveShadow><boxGeometry args={[43, 0.04, ST_W]} /><Mat color={ASPHALT} rough={0.95} /></mesh>
      ))}
      {/* Lối đi bộ giữa hai dãy nhà */}
      <mesh position={[-25.5, 0.055, 0]} receiveShadow><boxGeometry args={[3, 0.04, 100]} /><Mat color="#efd9b8" /></mesh>
      <Inst items={marks.dashes} castShadow={false}><boxGeometry args={[1, 0.01, 1]} /><Mat color="#fffbea" /></Inst>
      <Inst items={marks.zebra} castShadow={false}><boxGeometry args={[1, 0.01, 1]} /><Mat color="#ffffff" /></Inst>
    </group>
  );
}

// ---------- Đèn đường (sáng vào ban đêm) ----------
export function StreetLamps({ spots }) {
  const night = useNight();
  const poles = useMemo(() => spots.map(([x, z]) => ({ p: [x, 2, z] })), [spots]);
  const heads = useMemo(() => spots.map(([x, z]) => ({ p: [x, 4.15, z] })), [spots]);
  const bases = useMemo(() => spots.map(([x, z]) => ({ p: [x, 0.2, z] })), [spots]);
  return (
    <>
      <Inst items={bases}><cylinderGeometry args={[0.28, 0.34, 0.4, 8]} /><Mat color="#355f55" /></Inst>
      <Inst items={poles}><cylinderGeometry args={[0.09, 0.12, 4, 8]} /><Mat color="#3f6f63" rough={0.5} /></Inst>
      <Inst items={heads}>
        <icosahedronGeometry args={[0.38, 1]} />
        <Mat color="#fff6dc" emissive="#ffd88a" ei={0.15 + night * 2.2} rough={0.3} />
      </Inst>
    </>
  );
}
export function cityLampSpots() {
  const s = [];
  MAP.cityRows.forEach(z => { s.push([-40.4, z], [-10.8, z], [-3.4, z + 4]); });
  return s;
}

// ---------- Tòa nhà phố ----------
const BUILD_COLORS = ['#ee8f6a', '#f3c57a', '#8ccbc6', '#b5d88f', '#f2a3a1', '#c5b5e6', '#efe2cf', '#9fbde0', '#e7b48b'];
const AWNINGS = [['#e0614f', '#fff4e4'], ['#3f9c8c', '#fff4e4'], ['#f2a33a', '#fff4e4'], ['#7a6fc4', '#fff4e4']];

export function CityBuilding({ plot, owned }) {
  const night = useNight();
  const id = Number(plot.id);
  const color = owned ? '#ffc97e' : pick(BUILD_COLORS, hash(id * 17 + 3));
  const townhouse = hash(id * 5 + 1) < 0.35;
  const floors = townhouse ? 2 + Math.floor(hash(id * 11) * 2) : 3 + Math.floor(hash(id * 13) * 3);
  const [awA, awB] = pick(AWNINGS, hash(id * 7));
  const W = 8, G = 2.8, FH = 2.4, bodyH = floors * FH, top = G + bodyH;
  const mats = useMemo(() => {
    const { map, glow } = facade(color, floors);
    const side = new THREE.MeshStandardMaterial({ map, emissiveMap: glow, emissive: '#ffffff', emissiveIntensity: 0, roughness: 0.85 });
    const roof = new THREE.MeshStandardMaterial({ color: '#d4cbbd', roughness: 0.95 });
    return { side, arr: [side, side, roof, roof, side, side] };
  }, [color, floors]);
  useEffect(() => { mats.side.emissiveIntensity = night * 1.15; }, [mats, night]);
  useEffect(() => () => { mats.side.dispose(); mats.arr[2].dispose(); }, [mats]);
  const glass = <Mat color="#a9d6ea" emissive="#ffcf7a" ei={night * 1.3} rough={0.25} />;
  const groundColor = mix(color, '#5a3a2a', 0.18);
  const occ = useOccluder();
  return (
    <group position={[+plot.world_x, 0, +plot.world_z]}>
      <group ref={occ}>
      <mesh position={[0, 0.08, 0]} receiveShadow><boxGeometry args={[12, 0.12, 12]} /><Mat color={owned ? '#f6e3bd' : '#ece5d8'} /></mesh>
      <mesh position={[0, 0.06, 0]} receiveShadow><boxGeometry args={[12.3, 0.1, 12.3]} /><Mat color={CURB} /></mesh>
      {/* Tầng trệt */}
      <mesh position={[0, G / 2, 0]} castShadow receiveShadow><boxGeometry args={[W - 0.3, G, W - 0.3]} /><Mat color={groundColor} /></mesh>
      <mesh position={[0, G, 0]} castShadow><boxGeometry args={[W + 0.35, 0.28, W + 0.35]} /><Mat color="#fff7ea" /></mesh>
      {/* Các tầng trên với mặt tiền cửa sổ */}
      <mesh position={[0, G + bodyH / 2 + 0.14, 0]} material={mats.arr} castShadow receiveShadow><boxGeometry args={[W, bodyH, W]} /></mesh>
      {/* Cửa, kính cửa hàng, mái hiên sọc */}
      <mesh position={[0, 1.15, W / 2 - 0.1]}><boxGeometry args={[1.5, 2.3, 0.12]} /><Mat color="#6f4e3c" /></mesh>
      <mesh position={[0, 1.4, W / 2 - 0.02]}><boxGeometry args={[1.1, 1.2, 0.05]} />{glass}</mesh>
      {[-2.5, 2.5].map(x => (
        <group key={x} position={[x, 1.35, W / 2 - 0.1]}>
          <mesh><boxGeometry args={[2.3, 1.7, 0.14]} /><Mat color="#fff7ea" /></mesh>
          <mesh position={[0, 0, 0.04]}><boxGeometry args={[2, 1.4, 0.1]} />{glass}</mesh>
        </group>
      ))}
      <mesh position={[0, G - 0.45, W / 2 + 0.55]} rotation={[0.42, 0, 0]} castShadow><boxGeometry args={[W - 0.6, 0.07, 1.4]} /><Mat map={stripes(awA, awB, 12)} /></mesh>
      <mesh position={[0, G - 0.82, W / 2 + 1.18]}><boxGeometry args={[W - 0.6, 0.28, 0.05]} /><Mat map={stripes(awA, awB, 12)} /></mesh>
      {/* Mái */}
      {townhouse ? (
        <>
          <GableRoof len={W} depth={W} rise={3} y={top + 0.14} wallColor={color} roofColor={pick(['#7f93b8', '#8a6f8f', '#6f8f86'], hash(id))} />
          <mesh position={[2.3, top + 2.6, -1.6]} castShadow><boxGeometry args={[0.8, 2.2, 0.8]} /><Mat color="#c0644a" /></mesh>
        </>
      ) : (
        <>
          <mesh position={[0, top + 0.32, 0]} castShadow><boxGeometry args={[W + 0.3, 0.36, W + 0.3]} /><Mat color="#f6efe3" /></mesh>
          <mesh position={[0, top + 0.52, 0]}><boxGeometry args={[W - 0.6, 0.06, W - 0.6]} /><Mat color="#bdb3a5" /></mesh>
          <RoundedBox args={[2.2, 1, 1.6]} radius={0.15} position={[-1.6, top + 1, -1.2]} castShadow><Mat color="#d9d3c9" /></RoundedBox>
          <RoundedBox args={[1.2, 0.7, 1.2]} radius={0.12} position={[1.8, top + 0.85, 1.4]} castShadow><Mat color="#c9c2b8" /></RoundedBox>
          {hash(id * 3) > 0.5 && (
            <mesh position={[2, top + 1.4, -1.8]} castShadow><cylinderGeometry args={[0.7, 0.7, 1.5, 12]} /><Mat color="#b98a6a" /></mesh>
          )}
        </>
      )}
      </group>
      {owned && <HomeFlag y={townhouse ? top + 4.2 : top + 2} />}
    </group>
  );
}

// Lá cờ đánh dấu nhà của người chơi.
export function HomeFlag({ y }) {
  const flag = useRef();
  useFrame(({ clock }) => { if (flag.current) flag.current.rotation.y = Math.sin(clock.elapsedTime * 2.2) * 0.25; });
  return (
    <group position={[0, y, 0]}>
      <mesh position={[0, 1.6, 0]} castShadow><cylinderGeometry args={[0.06, 0.06, 3.2, 6]} /><Mat color="#ffffff" /></mesh>
      <group ref={flag} position={[0, 2.7, 0]}>
        <mesh position={[0.75, 0, 0]} castShadow><boxGeometry args={[1.5, 0.9, 0.05]} /><Mat color="#f2727a" /></mesh>
        <mesh position={[0.75, 0, 0.04]}><circleGeometry args={[0.25, 16]} /><Mat color="#fff4e4" /></mesh>
      </group>
      <mesh position={[0, 3.3, 0]}><sphereGeometry args={[0.13, 10, 8]} /><Mat color="#f6c453" /></mesh>
    </group>
  );
}

// ---------- Quán cà phê ở quảng trường giữa hai khu ----------
function Umbrella({ position, a, b }) {
  return (
    <group position={position}>
      <mesh position={[0, 1.3, 0]} castShadow><cylinderGeometry args={[0.05, 0.05, 2.6, 6]} /><Mat color="#f5efe6" /></mesh>
      <mesh position={[0, 2.55, 0]} castShadow><coneGeometry args={[1.9, 0.85, 12, 1, true]} /><Mat map={stripes(a, b, 12)} side={THREE.DoubleSide} /></mesh>
      <mesh position={[0, 0.72, 0]} castShadow><cylinderGeometry args={[0.6, 0.6, 0.06, 16]} /><Mat color="#ffffff" /></mesh>
      <mesh position={[0, 0.36, 0]}><cylinderGeometry args={[0.06, 0.15, 0.7, 6]} /><Mat color="#e8e0d4" /></mesh>
      {[0, Math.PI].map(r => (
        <group key={r} rotation={[0, r, 0]}>
          <mesh position={[0, 0.42, 0.95]} castShadow><boxGeometry args={[0.5, 0.06, 0.45]} /><Mat color="#e7dccb" /></mesh>
          <mesh position={[0, 0.72, 1.16]} castShadow><boxGeometry args={[0.5, 0.55, 0.06]} /><Mat color="#3a3f47" /></mesh>
          <mesh position={[0, 0.2, 0.95]}><boxGeometry args={[0.06, 0.4, 0.06]} /><Mat color="#3a3f47" /></mesh>
        </group>
      ))}
    </group>
  );
}

// Vị trí tương đối với tâm quán — dùng chung cho hình vẽ và va chạm.
export const UMBRELLAS = [[-4.6, 6, 0], [0.2, 7.6, 1], [5, 5.4, 0], [-4.4, 10.8, 1], [4.8, 10.6, 0]];
export const CAFE_PLANTERS = [[-5.9, 2], [-5.9, -2.5], [5.0, 1.2], [5.0, -3]];

export function Cafe() {
  const night = useNight();
  const glass = <Mat color="#a7d3e4" emissive="#ffc46b" ei={0.15 + night * 1.4} rough={0.2} />;
  const occ = useOccluder();
  return (
    <group position={[CAFE.x, 0, CAFE.z]}>
      <group ref={occ}>
      <mesh position={[-0.5, 0.06, 4]} receiveShadow><boxGeometry args={[12, 0.1, 18]} /><Mat color="#d9d2c6" /></mesh>
      <mesh position={[0, 0.25, 0]} castShadow receiveShadow><boxGeometry args={[6.4, 0.5, 6.4]} /><Mat color="#f4efe7" /></mesh>
      <mesh position={[0, 2.1, 0]} castShadow receiveShadow><boxGeometry args={[6, 3.2, 6]} /><Mat color="#f08a3c" /></mesh>
      {/* Tầng mái mansard */}
      <mesh position={[0, 3.85, 0]} castShadow><boxGeometry args={[6.6, 0.3, 6.6]} /><Mat color="#fff5e8" /></mesh>
      <mesh position={[0, 4.8, 0]} rotation={[0, Math.PI / 4, 0]} castShadow><cylinderGeometry args={[3.2, 4.45, 1.6, 4, 1]} /><Mat color="#9a8a80" flat /></mesh>
      <mesh position={[0, 5.62, 0]} castShadow><boxGeometry args={[4.6, 0.12, 4.6]} /><Mat color="#fff5e8" /></mesh>
      {[0, Math.PI / 2, Math.PI, -Math.PI / 2].map(r => (
        <group key={r} rotation={[0, r, 0]}>
          <mesh position={[0, 4.85, 3.05]} rotation={[-0.75, 0, 0]} castShadow><boxGeometry args={[1.1, 1, 0.5]} /><Mat color="#fff5e8" /></mesh>
          <mesh position={[0, 4.88, 3.32]} rotation={[-0.75, 0, 0]}><boxGeometry args={[0.7, 0.6, 0.05]} />{glass}</mesh>
        </group>
      ))}
      {/* Cốc cà phê khổng lồ trên mái */}
      <group position={[0, 6.4, 0]}>
        <mesh castShadow><cylinderGeometry args={[0.95, 0.7, 1.4, 16]} /><Mat color="#e9772f" /></mesh>
        <mesh position={[0.95, 0.05, 0]} rotation={[Math.PI / 2, 0, 0]}><torusGeometry args={[0.35, 0.1, 8, 16]} /><Mat color="#e9772f" /></mesh>
        <mesh position={[0, 0.71, 0]}><cylinderGeometry args={[0.88, 0.88, 0.04, 16]} /><Mat color="#6b3f26" /></mesh>
      </group>
      {/* Mặt tiền: cửa kính, cửa sổ, mái hiên, biển hiệu */}
      {[0, Math.PI / 2].map(r => (
        <group key={r} rotation={[0, r, 0]}>
          <mesh position={[0, 1.65, 3.02]}><boxGeometry args={[1.6, 2.3, 0.08]} /><Mat color="#fff5e8" /></mesh>
          <mesh position={[0, 1.65, 3.06]}><boxGeometry args={[1.3, 2.05, 0.05]} />{glass}</mesh>
          {[-1.9, 1.9].map(x => (
            <group key={x} position={[x, 2.05, 3.02]}>
              <mesh><boxGeometry args={[1.5, 1.5, 0.08]} /><Mat color="#fff5e8" /></mesh>
              <mesh position={[0, 0, 0.04]}><boxGeometry args={[1.25, 1.25, 0.05]} />{glass}</mesh>
            </group>
          ))}
          <mesh position={[0, 3.25, 3.55]} rotation={[0.5, 0, 0]} castShadow><boxGeometry args={[6, 0.06, 1.2]} /><Mat map={stripes('#a8553a', '#fff4e4', 14)} /></mesh>
          <mesh position={[0, 3.62, 3.06]}><planeGeometry args={[2.6, 0.8]} /><Mat map={signTexture('Cà phê Nắng', '#3f6f63')} /></mesh>
        </group>
      ))}
      </group>
      <mesh position={[0, 0.45, 3.5]}><boxGeometry args={[2.2, 0.15, 1]} /><Mat color="#f6c453" /></mesh>
      {/* Bàn ô ngoài trời */}
      {UMBRELLAS.map(([x, z, k]) => <Umbrella key={x + ':' + z} position={[x, 0, z]} a={k ? '#f08a3c' : '#a8553a'} b="#fff4e4" />)}
      {/* Bồn hoa tulip */}
      {CAFE_PLANTERS.map(([x, z]) => (
        <group key={x + ':' + z} position={[x, 0, z]}>
          <mesh position={[0, 0.3, 0]} castShadow><boxGeometry args={[0.9, 0.6, 2.6]} /><Mat color="#9a6b47" /></mesh>
          {[-0.9, -0.3, 0.3, 0.9].map((dz, i) => (
            <group key={dz} position={[0, 0.6, dz]}>
              <mesh position={[0, 0.25, 0]}><cylinderGeometry args={[0.03, 0.03, 0.5, 4]} /><Mat color="#4f9a55" /></mesh>
              <mesh position={[0, 0.55, 0]}><sphereGeometry args={[0.16, 8, 6]} /><Mat color={i % 2 ? '#f6c453' : '#e8524a'} /></mesh>
            </group>
          ))}
        </group>
      ))}
    </group>
  );
}

// ---------- Xe ô tô chạy trên hai đại lộ, dừng khi người chơi đứng chắn ----------
const CAR_COLORS = ['#e8524a', '#4f8fe0', '#f6c453', '#5fbf8f', '#ffffff', '#f08a3c', '#8f7ad6'];
function CarModel({ color, bus }) {
  const L = bus ? 4.2 : 2.6;
  return (
    <group>
      <RoundedBox args={[1.5, 0.7, L]} radius={0.22} position={[0, 0.62, 0]} castShadow><Mat color={color} rough={0.45} /></RoundedBox>
      <RoundedBox args={[1.3, 0.6, bus ? 3.9 : 1.4]} radius={0.2} position={[0, 1.15, bus ? 0 : -0.15]} castShadow><Mat color={bus ? color : '#ffffff'} rough={0.45} /></RoundedBox>
      <mesh position={[0, 1.18, bus ? 0 : -0.15]}><boxGeometry args={[1.34, 0.36, bus ? 3.7 : 1.2]} /><Mat color="#3d5266" rough={0.2} /></mesh>
      {[-1, 1].map(sx => [-1, 1].map(sz => (
        <mesh key={sx + ':' + sz} position={[sx * 0.72, 0.32, sz * (L / 2 - 0.55)]} rotation={[0, 0, Math.PI / 2]}><cylinderGeometry args={[0.3, 0.3, 0.25, 12]} /><Mat color="#2d2f36" /></mesh>
      )))}
      {[-0.5, 0.5].map(x => <mesh key={x} position={[x, 0.66, L / 2 + 0.01]}><boxGeometry args={[0.3, 0.16, 0.04]} /><Mat color="#fff8d6" emissive="#fff1b0" ei={0.6} /></mesh>)}
    </group>
  );
}
export function Cars({ player }) {
  const cars = useMemo(() => {
    const list = [];
    MAP.avenues.forEach((ax, ai) => [[-1.45, -1], [1.45, 1]].forEach(([dx, dir], li) => {
      for (let k = 0; k < 3; k++) list.push({ x: ax + dx, z: -50 + k * 36 + li * 14 + ai * 7, dir, v: 6 + hash(ai * 9 + li * 3 + k) * 3, color: pick(CAR_COLORS, hash(ai * 31 + li * 7 + k * 3)), bus: k === 1 && li === ai % 2 });
    }));
    return list;
  }, []);
  const refs = useRef([]);
  useFrame((_, dt) => {
    const p = player.current;
    cars.forEach((c, i) => {
      const ahead = (p.z - c.z) * c.dir;
      const blocked = Math.abs(p.x - c.x) < 1.6 && ahead > 0 && ahead < (c.bus ? 5 : 4);
      if (!blocked) c.z += c.v * c.dir * Math.min(dt, 0.05);
      if (c.z > 56) c.z = -56; if (c.z < -56) c.z = 56;
      refs.current[i]?.position.set(c.x, 0.05, c.z);
    });
  });
  return cars.map((c, i) => (
    <group key={i} ref={el => (refs.current[i] = el)} position={[c.x, 0.05, c.z]} rotation={[0, c.dir > 0 ? 0 : Math.PI, 0]}>
      <CarModel color={c.color} bus={c.bus} />
    </group>
  ));
}
