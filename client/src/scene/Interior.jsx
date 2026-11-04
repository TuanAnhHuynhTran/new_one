import React, { useEffect, useMemo, useState } from 'react';
import { RoundedBox } from '@react-three/drei';
import * as THREE from 'three';
import { GhostCtx, Mat, planks, radialGlow, verticalFade, mix, useNight } from './kit.jsx';

// Giới hạn đặt đồ khớp với validation của server (|x| ≤ 4.4, |z| ≤ 3.6), làm tròn lưới 0.5.
export const PLACE_LIMIT = { x: 4, z: 3.5 };
const snap = (v, lim) => Math.max(-lim, Math.min(lim, Math.round(v * 2) / 2));

// ---------- Căn phòng kiểu diorama: hai bức tường cắt lớp, sàn gỗ, cửa sổ nắng chiều ----------
function Room() {
  const night = useNight();
  const floorMats = useMemo(() => {
    const top = new THREE.MeshStandardMaterial({ map: planks([2, 1.6]), roughness: 0.7 });
    const side = new THREE.MeshStandardMaterial({ color: '#f1e4d6', roughness: 0.9 });
    return [side, side, top, side, side, side];
  }, []);
  const wall = '#f8efe6', trim = '#b67a4b';
  const sun = 1 - night * 0.85;
  return (
    <group>
      <mesh position={[0, -0.2, 0]} material={floorMats} receiveShadow><boxGeometry args={[10.4, 0.4, 8.4]} /></mesh>
      {/* Tường sau (z-) và tường trái (x-) */}
      <mesh position={[0, 2, -4.05]} receiveShadow castShadow><boxGeometry args={[10.4, 4.8, 0.3]} /><Mat color={wall} rough={0.95} /></mesh>
      <mesh position={[-5.05, 2, 0]} receiveShadow castShadow><boxGeometry args={[0.3, 4.8, 8.4]} /><Mat color={mix(wall, '#d9c2ae', 0.25)} rough={0.95} /></mesh>
      <mesh position={[0, 4.48, -4.05]} castShadow><boxGeometry args={[10.7, 0.25, 0.5]} /><Mat color={trim} /></mesh>
      <mesh position={[-5.05, 4.48, 0.1]} castShadow><boxGeometry args={[0.5, 0.25, 8.6]} /><Mat color={trim} /></mesh>
      <mesh position={[0, 0.1, -3.88]}><boxGeometry args={[10, 0.2, 0.06]} /><Mat color="#efe2d2" /></mesh>
      <mesh position={[-4.88, 0.1, 0]}><boxGeometry args={[0.06, 0.2, 8]} /><Mat color="#efe2d2" /></mesh>

      {/* Cửa sổ + rèm hồng + vệt nắng */}
      <group position={[2.4, 2.35, -3.88]}>
        <mesh><boxGeometry args={[2.1, 2.3, 0.1]} /><Mat color="#c89466" /></mesh>
        <mesh position={[0, 0, 0.03]}><boxGeometry args={[1.8, 2, 0.06]} /><Mat color={night > 0.6 ? '#3d4a7d' : '#ffe2a8'} emissive={night > 0.6 ? '#6f7fc0' : '#ffd27a'} ei={night > 0.6 ? 0.4 : 1.1} toneMapped={false} /></mesh>
        <mesh position={[0, 0, 0.08]}><boxGeometry args={[0.08, 2, 0.04]} /><Mat color="#c89466" /></mesh>
        <mesh position={[0, 0.1, 0.08]}><boxGeometry args={[1.8, 0.08, 0.04]} /><Mat color="#c89466" /></mesh>
        <mesh position={[0, -1.15, 0.18]}><boxGeometry args={[2.3, 0.1, 0.35]} /><Mat color="#fff7ec" /></mesh>
        <mesh position={[0, 1.42, 0.25]} rotation={[0, 0, Math.PI / 2]}><cylinderGeometry args={[0.04, 0.04, 3.2, 8]} /><Mat color="#b67a4b" /></mesh>
        {[-1, 1].map(s => (
          <group key={s} position={[s * 1.25, -0.05, 0.25]}>
            {[0, 1, 2, 3].map(i => (
              <mesh key={i} position={[s * (i * 0.13 - 0.2), 0, (i % 2) * 0.05]} castShadow><cylinderGeometry args={[0.1, 0.13, 2.9, 10]} /><Mat color="#f2a196" rough={0.95} /></mesh>
            ))}
          </group>
        ))}
      </group>
      {sun > 0.2 && (
        <>
          <mesh position={[2.4, 0.015, -1.6]} rotation={[-Math.PI / 2, 0, 0]}>
            <planeGeometry args={[3, 4.2]} />
            <meshBasicMaterial map={radialGlow('255,205,130')} transparent opacity={0.55 * sun} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
          </mesh>
          <mesh position={[2.4, 1.6, -2.4]} rotation={[-0.62, 0, 0]}>
            <planeGeometry args={[1.9, 3.6]} />
            <meshBasicMaterial map={verticalFade('255,210,140')} transparent opacity={0.22 * sun} blending={THREE.AdditiveBlending} depthWrite={false} side={THREE.DoubleSide} toneMapped={false} />
          </mesh>
        </>
      )}

      {/* Kệ treo tường trái: sách, cây, ảnh */}
      {[2.3, 3.2].map((y, si) => (
        <group key={y} position={[-4.65, y, -1.2 + si * 0.4]}>
          <mesh castShadow receiveShadow><boxGeometry args={[0.5, 0.09, 2.2]} /><Mat color="#b67a4b" /></mesh>
          {[0, 1, 2, 3, 4].map(i => (
            <mesh key={i} position={[0.02, 0.27 - (i % 2) * 0.04, -0.8 + i * 0.16]} castShadow><boxGeometry args={[0.36, 0.46 - (i % 2) * 0.08, 0.12]} /><Mat color={['#f6c453', '#8fc6c9', '#f2a3a1', '#c5b5e6', '#fff4e4'][(i + si) % 5]} /></mesh>
          ))}
          <group position={[0, 0.05, 0.6]}>
            <mesh position={[0, 0.15, 0]} castShadow><cylinderGeometry args={[0.14, 0.11, 0.3, 10]} /><Mat color="#fffaf2" /></mesh>
            <mesh position={[0, 0.38, 0]}><icosahedronGeometry args={[0.2, 0]} /><Mat flat color="#7cbf7a" /></mesh>
          </group>
          {si === 0 && [0, 1, 2, 3].map(i => (
            <mesh key={i} position={[0.05, -0.25 - i * 0.22, 0.65 + (i % 2) * 0.08]}><icosahedronGeometry args={[0.13, 0]} /><Mat flat color="#88c47e" /></mesh>
          ))}
        </group>
      ))}
      {[[-2.6, 2.6, '#c5b5e6'], [-1.3, 2.9, '#f2c6a0'], [-3.6, 1.7, '#9ed1c4']].map(([x, y, art], i) => (
        <group key={i} position={[x, y, -3.88]}>
          <mesh><boxGeometry args={[0.8, 1, 0.06]} /><Mat color="#fffaf2" /></mesh>
          <mesh position={[0, 0, 0.04]}><boxGeometry args={[0.6, 0.8, 0.02]} /><Mat color={art} /></mesh>
        </group>
      ))}
      {/* Đồng hồ treo tường */}
      <group position={[-4.88, 3.4, 2.3]} rotation={[0, Math.PI / 2, 0]}>
        <mesh rotation={[Math.PI / 2, 0, 0]}><cylinderGeometry args={[0.42, 0.42, 0.08, 24]} /><Mat color="#f6c453" /></mesh>
        <mesh position={[0, 0, 0.05]}><circleGeometry args={[0.34, 24]} /><Mat color="#fffaf2" /></mesh>
        <mesh position={[0, 0.1, 0.07]}><boxGeometry args={[0.04, 0.22, 0.01]} /><Mat color="#4a3a30" /></mesh>
        <mesh position={[0.08, 0, 0.07]} rotation={[0, 0, -Math.PI / 2.5]}><boxGeometry args={[0.04, 0.17, 0.01]} /><Mat color="#4a3a30" /></mesh>
      </group>
    </group>
  );
}

// ---------- Mô hình nội thất (mặt trước hướng +Z) ----------
const Leg = ({ p, h = 0.2, r = 0.05, c = '#b98552' }) => <mesh position={p} castShadow><cylinderGeometry args={[r, r * 0.8, h, 8]} /><Mat color={c} /></mesh>;

function Sofa() {
  const pink = '#f2a2a0', deep = '#e48f8f';
  return (
    <group>
      {[[-0.95, 0.1, 0.35], [0.95, 0.1, 0.35], [-0.95, 0.1, -0.35], [0.95, 0.1, -0.35]].map((p, i) => <Leg key={i} p={p} />)}
      <RoundedBox args={[2.2, 0.42, 0.95]} radius={0.12} position={[0, 0.4, 0]} castShadow receiveShadow><Mat color={deep} /></RoundedBox>
      {[-0.52, 0.52].map(x => <RoundedBox key={x} args={[1.02, 0.22, 0.8]} radius={0.1} position={[x, 0.68, 0.06]} castShadow><Mat color={pink} /></RoundedBox>)}
      <RoundedBox args={[2.2, 0.8, 0.3]} radius={0.14} position={[0, 0.9, -0.34]} castShadow><Mat color={pink} /></RoundedBox>
      {[-1.08, 1.08].map(x => <RoundedBox key={x} args={[0.3, 0.62, 0.95]} radius={0.14} position={[x, 0.62, 0]} castShadow><Mat color={pink} /></RoundedBox>)}
      <RoundedBox args={[0.5, 0.42, 0.16]} radius={0.08} position={[-0.58, 0.98, -0.12]} rotation={[-0.2, 0, 0.18]} castShadow><Mat color="#ffe7c2" /></RoundedBox>
      <RoundedBox args={[0.5, 0.42, 0.16]} radius={0.08} position={[0.6, 0.98, -0.12]} rotation={[-0.2, 0, -0.12]} castShadow><Mat color="#fff4e4" /></RoundedBox>
    </group>
  );
}
function Table() {
  return (
    <group>
      <RoundedBox args={[1.7, 0.12, 1.05]} radius={0.05} position={[0, 0.78, 0]} castShadow receiveShadow><Mat color="#dfae78" /></RoundedBox>
      {[[-0.7, -0.4], [0.7, -0.4], [-0.7, 0.4], [0.7, 0.4]].map(([x, z], i) => <Leg key={i} p={[x, 0.36, z]} h={0.72} r={0.045} />)}
      <mesh position={[0.35, 0.92, 0.1]} castShadow><cylinderGeometry args={[0.08, 0.07, 0.16, 12]} /><Mat color="#fffaf2" /></mesh>
      <mesh position={[-0.3, 0.855, -0.05]}><cylinderGeometry args={[0.22, 0.2, 0.03, 16]} /><Mat color="#fffaf2" /></mesh>
      {[[-0.36, -0.02], [-0.24, -0.1], [-0.28, 0.06]].map(([x, z], i) => <mesh key={i} position={[x, 0.89, z]} scale={[1, 0.5, 1]}><sphereGeometry args={[0.06, 8, 6]} /><Mat color="#c98b4f" /></mesh>)}
    </group>
  );
}
function Plant() {
  const leaves = [[0, 1.45, 0, 0, 0], [0.25, 1.2, 0.1, 0.6, 0.9], [-0.25, 1.1, 0.05, -0.6, 2.2], [0.1, 0.95, -0.25, 0.5, 3.6], [-0.1, 0.85, 0.25, -0.5, 5], [0.28, 0.75, -0.1, 0.8, 1.6]];
  return (
    <group>
      <mesh position={[0, 0.04, 0]}><cylinderGeometry args={[0.36, 0.36, 0.05, 20]} /><Mat color="#efe7dc" /></mesh>
      <mesh position={[0, 0.3, 0]} castShadow><cylinderGeometry args={[0.32, 0.24, 0.5, 20]} /><Mat color="#fffaf2" rough={0.5} /></mesh>
      <mesh position={[0, 0.55, 0]}><cylinderGeometry args={[0.29, 0.29, 0.02, 16]} /><Mat color="#6b4a3a" /></mesh>
      <mesh position={[0, 0.85, 0]}><cylinderGeometry args={[0.025, 0.03, 0.7, 6]} /><Mat color="#5a8f4f" /></mesh>
      {leaves.map(([x, y, z, tilt, rot], i) => (
        <mesh key={i} position={[x, y, z]} rotation={[tilt, rot, 0]} scale={[0.22, 0.06, 0.32]} castShadow><sphereGeometry args={[1, 12, 8]} /><Mat color={i % 2 ? '#78b56f' : '#8fc782'} /></mesh>
      ))}
    </group>
  );
}
function Bed() {
  return (
    <group>
      <RoundedBox args={[2, 0.35, 2.6]} radius={0.08} position={[0, 0.3, 0]} castShadow receiveShadow><Mat color="#dcae80" /></RoundedBox>
      <RoundedBox args={[2.1, 1.15, 0.2]} radius={0.1} position={[0, 0.75, -1.3]} castShadow><Mat color="#cf9d6f" /></RoundedBox>
      <RoundedBox args={[1.86, 0.3, 2.4]} radius={0.12} position={[0, 0.6, 0.02]} castShadow><Mat color="#fffaf2" /></RoundedBox>
      <RoundedBox args={[1.92, 0.14, 1.55]} radius={0.06} position={[0, 0.77, 0.42]} castShadow><Mat color="#c7b6e6" /></RoundedBox>
      <mesh position={[0, 0.85, 1.05]}><boxGeometry args={[1.93, 0.02, 0.18]} /><Mat color="#fff4e4" /></mesh>
      {[-0.45, 0.45].map(x => <RoundedBox key={x} args={[0.74, 0.2, 0.44]} radius={0.09} position={[x, 0.85, -0.82]} castShadow><Mat color="#ffffff" /></RoundedBox>)}
    </group>
  );
}
function Lamp({ ghost }) {
  return (
    <group>
      <mesh position={[0, 0.03, 0]} castShadow><cylinderGeometry args={[0.26, 0.28, 0.06, 20]} /><Mat color="#8a7a6a" /></mesh>
      <mesh position={[0, 0.82, 0]} castShadow><cylinderGeometry args={[0.03, 0.03, 1.6, 8]} /><Mat color="#8a7a6a" /></mesh>
      <mesh position={[0, 1.72, 0]} castShadow><cylinderGeometry args={[0.24, 0.42, 0.5, 24, 1, true]} /><Mat color="#f6b39b" emissive="#ffcf8a" ei={0.55} side={THREE.DoubleSide} /></mesh>
      <mesh position={[0, 1.6, 0]}><sphereGeometry args={[0.1, 10, 8]} /><meshBasicMaterial color="#fff1c9" toneMapped={false} /></mesh>
      {!ghost && <pointLight position={[0, 1.55, 0]} intensity={3.5} distance={6} decay={2} color="#ffcf8a" />}
    </group>
  );
}
function Bookshelf() {
  const books = useMemo(() => {
    const cols = ['#f6c453', '#8fc6c9', '#f2a3a1', '#c5b5e6', '#7cbf7a', '#f08a3c', '#fff4e4'], out = [];
    [0.1, 0.78, 1.46].forEach((y, s) => {
      let x = -0.6;
      for (let i = 0; x < 0.5; i++) { const w = 0.08 + ((i * 7 + s * 3) % 4) * 0.025, h = 0.38 + ((i * 5 + s) % 3) * 0.07; out.push({ x: x + w / 2, y: y + h / 2, w, h, c: cols[(i + s * 2) % cols.length], tilt: i === 4 ? 0.25 : 0 }); x += w + 0.015; }
    });
    return out;
  }, []);
  return (
    <group>
      <mesh position={[0, 1.05, -0.2]} castShadow receiveShadow><boxGeometry args={[1.5, 2.1, 0.06]} /><Mat color="#f7f2ec" /></mesh>
      {[-0.72, 0.72].map(x => <mesh key={x} position={[x, 1.05, 0]} castShadow><boxGeometry args={[0.07, 2.1, 0.46]} /><Mat color="#f7f2ec" /></mesh>)}
      {[0.06, 0.74, 1.42, 2.08].map(y => <mesh key={y} position={[0, y, 0]} castShadow receiveShadow><boxGeometry args={[1.5, 0.06, 0.46]} /><Mat color="#f7f2ec" /></mesh>)}
      {books.map((b, i) => <mesh key={i} position={[b.x, b.y, 0.02]} rotation={[0, 0, b.tilt]} castShadow><boxGeometry args={[b.w, b.h, 0.32]} /><Mat color={b.c} /></mesh>)}
      <mesh position={[0.35, 2.3, 0]} castShadow><cylinderGeometry args={[0.12, 0.09, 0.32, 12]} /><Mat color="#9ed1c4" /></mesh>
      <mesh position={[-0.35, 2.22, 0]} castShadow><boxGeometry args={[0.4, 0.22, 0.3]} /><Mat color="#b67a4b" /></mesh>
    </group>
  );
}
function Rug() {
  return (
    <group>
      <RoundedBox args={[2.8, 0.04, 1.8]} radius={0.02} position={[0, 0.02, 0]} receiveShadow><Mat color="#f4e7d2" rough={1} /></RoundedBox>
      <mesh position={[0, 0.042, 0]} rotation={[-Math.PI / 2, 0, 0]}><ringGeometry args={[0.6, 0.66, 40]} /><Mat color="#e7cba6" /></mesh>
    </group>
  );
}
function Chair() {
  return (
    <group>
      {[[-0.22, -0.22], [0.22, -0.22], [-0.22, 0.22], [0.22, 0.22]].map(([x, z], i) => <Leg key={i} p={[x, 0.24, z]} h={0.48} r={0.035} c="#8a5a3c" />)}
      <RoundedBox args={[0.6, 0.08, 0.58]} radius={0.03} position={[0, 0.5, 0]} castShadow><Mat color="#a8744f" /></RoundedBox>
      <RoundedBox args={[0.6, 0.48, 0.07]} radius={0.03} position={[0, 0.85, -0.27]} rotation={[-0.12, 0, 0]} castShadow><Mat color="#8a5a3c" /></RoundedBox>
      <RoundedBox args={[0.5, 0.06, 0.48]} radius={0.03} position={[0, 0.57, 0.02]}><Mat color="#f2c6a0" /></RoundedBox>
    </group>
  );
}
function Fridge() {
  return (
    <group>
      <RoundedBox args={[1, 2.1, 0.85]} radius={0.12} position={[0, 1.05, 0]} castShadow receiveShadow><Mat color="#8fd3c8" rough={0.5} /></RoundedBox>
      <mesh position={[0, 1.42, 0.43]}><boxGeometry args={[0.98, 0.03, 0.02]} /><Mat color="#6fb7ab" /></mesh>
      {[1.75, 1.0].map(y => <RoundedBox key={y} args={[0.07, 0.42, 0.07]} radius={0.03} position={[0.36, y, 0.46]}><Mat color="#5fa69a" /></RoundedBox>)}
      <mesh position={[-0.2, 1.75, 0.435]}><circleGeometry args={[0.08, 16]} /><Mat color="#f2727a" /></mesh>
    </group>
  );
}

const MODELS = { sofa: Sofa, table: Table, plant: Plant, bed: Bed, lamp: Lamp, bookshelf: Bookshelf, rug: Rug, chair: Chair, fridge: Fridge };
export function FurnitureModel({ kind, ghost = false }) {
  const M = MODELS[kind];
  if (!M) return <RoundedBox args={[0.8, 0.8, 0.8]} radius={0.1} position={[0, 0.4, 0]}><Mat color="#d9cfc0" /></RoundedBox>;
  return <M ghost={ghost} />;
}

// held: món đang cầm trên tay — { kind } (món mới từ thanh nội thất) hoặc { kind, id, x, z } (món đã đặt được nhấc lên).
function PlacedItem({ item, held, onPick }) {
  const [hover, setHover] = useState(false);
  return (
    <group
      position={[Number(item.pos_x), 0, Number(item.pos_z)]}
      rotation={[0, Number(item.rotation_y || 0), 0]}
      scale={hover && !held ? 1.04 : 1}
      onPointerOver={e => { if (held) return; e.stopPropagation(); setHover(true); document.body.style.cursor = 'grab'; }}
      onPointerOut={() => { setHover(false); document.body.style.cursor = ''; }}
      onPointerDown={e => {
        // Đang cầm đồ thì để sự kiện rơi xuống sàn (đặt đồ, kể cả lên thảm). Chỉ chuột trái mới nhấc đồ.
        if (held || e.button !== 0) return;
        e.stopPropagation();
        setHover(false); document.body.style.cursor = '';
        onPick?.(item);
      }}
    >
      <FurnitureModel kind={item.kind} />
      {hover && !held && <mesh position={[0, 0.03, 0]} rotation={[-Math.PI / 2, 0, 0]}><ringGeometry args={[0.9, 1.05, 32]} /><meshBasicMaterial color="#5fbfae" transparent opacity={0.8} depthWrite={false} /></mesh>}
    </group>
  );
}

export function Interior({ furniture, held, rotation, onPlace, onPick }) {
  const [hover, setHover] = useState(null);
  // Nhấc một món lên: bản xem trước bắt đầu ngay tại chỗ cũ của nó.
  useEffect(() => { setHover(held?.id ? { x: held.x, z: held.z } : null); }, [held]);
  const at = e => ({ x: snap(e.point.x, PLACE_LIMIT.x), z: snap(e.point.z, PLACE_LIMIT.z) });
  return (
    <group>
      <Room />
      <mesh
        position={[0, 0.012, 0]} rotation={[-Math.PI / 2, 0, 0]}
        onPointerMove={e => held && setHover(at(e))}
        onPointerDown={e => { if (!held || e.button !== 0) return; e.stopPropagation(); onPlace(at(e)); }}
      >
        <planeGeometry args={[9.8, 7.8]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
      {held && <gridHelper args={[9, 18, '#ffffff', '#ffffff']} position={[0, 0.02, 0]} material-transparent material-opacity={0.25} />}
      {furniture.filter(item => item.id !== held?.id).map(item => <PlacedItem key={item.id} item={item} held={!!held} onPick={onPick} />)}
      {held && hover && (
        <group position={[hover.x, 0, hover.z]} rotation={[0, rotation, 0]}>
          <GhostCtx.Provider value={true}><FurnitureModel kind={held.kind} ghost /></GhostCtx.Provider>
          <mesh position={[0, 0.03, 0]} rotation={[-Math.PI / 2, 0, 0]}><ringGeometry args={[0.85, 1, 32]} /><meshBasicMaterial color="#5fbfae" transparent opacity={0.8} depthWrite={false} /></mesh>
        </group>
      )}
    </group>
  );
}
