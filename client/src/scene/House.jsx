// Ngôi nhà 2 lầu + sân thượng (16 × 11 m): mặt bằng dùng chung cho đi lại / va chạm / đặt đồ, và mô hình 3D kiểu cắt lớp.
// Tầng 0: phòng khách, nhà bếp, nhà tắm, cửa chính (ra ngoài), cửa sau (ra sân vườn), cầu thang lên lầu.
// Tầng 1: 2 phòng ngủ, sảnh lầu, ban công, cầu thang lên sân thượng. Tầng 2: sân thượng.
import React, { useMemo } from 'react';
import * as THREE from 'three';
import { RoundedBox } from '@react-three/drei';
import { Mat, ScreenLabel, checker, mix, planks, useNight } from './kit.jsx';

export const LEVEL_H = 3.4;
export const levelY = l => l * LEVEL_H;
export const LEVELS = 3;
export const LEVEL_NAME = ['Tầng trệt', 'Lầu 1', 'Sân thượng'];
export const HOUSE = { x0: -8, x1: 8, z0: -5.5, z1: 5.5 };
export const BALCONY = { x0: -6, x1: 2, z0: 5.5, z1: 7.5 };
// Cầu thang: đi từ đầu dưới (zb, tầng from) tới đầu trên (zt, tầng to).
export const STAIRS = [
  { from: 0, to: 1, x0: 6.2, x1: 7.8, zb: 4.6, zt: -0.9 },
  { from: 1, to: 2, x0: 4.4, x1: 6.0, zb: -0.9, zt: 4.6 },
];
const stairRect = s => ({ x0: s.x0, x1: s.x1, z0: Math.min(s.zb, s.zt), z1: Math.max(s.zb, s.zt) });
export const DOORS = {
  front: { level: 0, x0: -1.6, x1: -0.2, z: HOUSE.z1, to: 'world', label: '🚪 Ra ngoài' },
  back: { level: 0, x0: -3.7, x1: -2.3, z: HOUSE.z0, to: 'garden', label: '🌿 Ra sân vườn' },
  balcony: { level: 1, x0: -3.4, x1: -1.8, z: HOUSE.z1 },
};
// Vị trí xuất hiện khi vào nhà: từ ngoài đường (cửa chính) hoặc từ sân vườn (cửa sau).
export const SPAWN = { front: { x: -0.9, z: 4.5, angle: Math.PI }, back: { x: -3, z: -4.5, angle: 0 } };

export const ROOMS = [
  { level: 0, name: 'Phòng khách', x0: -8, x1: 8, z0: -1.5, z1: 5.5, label: [-3.4, 3.4] },
  { level: 0, name: 'Nhà bếp', x0: -8, x1: 2, z0: -5.5, z1: -1.5, floor: 'tile', label: [-1.6, -3.4] },
  { level: 0, name: 'Nhà tắm', x0: 2, x1: 8, z0: -5.5, z1: -1.5, floor: 'bath', label: [4.4, -2.9] },
  { level: 1, name: 'Phòng ngủ 1', x0: -8, x1: -1.2, z0: -5.5, z1: 0.8, floor: 'wood2', label: [-2.6, -1.0] },
  { level: 1, name: 'Phòng ngủ 2', x0: -1.2, x1: 3.2, z0: -5.5, z1: 0.8, floor: 'wood2', label: [1.0, -1.6] },
  { level: 1, name: 'Sảnh lầu', x0: -8, x1: 4.4, z0: 0.8, z1: 5.5, label: [-5.8, 2.6] },
  { level: 1, name: 'Ban công', ...BALCONY, floor: 'deck', label: [-4.6, 6.6] },
  { level: 2, name: 'Sân thượng', ...HOUSE, floor: 'roof', label: [-3, 2] },
];

// Tường: đoạn thẳng song song trục. full = cao kịch trần, low = tường ngoài cắt thấp (phía camera),
// part = vách ngăn cắt lớp, rail = lan can, parapet = tường chắn sân thượng.
const W = (level, type, x0, z0, x1, z1) => ({ level, type, x0, z0, x1, z1 });
export const WALLS = [
  // Tầng trệt — tường ngoài
  W(0, 'full', -8, -5.5, -3.7, -5.5), W(0, 'full', -2.3, -5.5, 8, -5.5),
  W(0, 'full', -8, -5.5, -8, 5.5),
  W(0, 'low', -8, 5.5, -1.6, 5.5), W(0, 'low', -0.2, 5.5, 8, 5.5),
  W(0, 'low', 8, -5.5, 8, 5.5),
  // Tầng trệt — vách: bếp | phòng khách (cửa mở rộng), nhà tắm
  W(0, 'part', -8, -1.5, -6.5, -1.5), W(0, 'part', -0.5, -1.5, 3.2, -1.5), W(0, 'part', 4.4, -1.5, 8, -1.5),
  W(0, 'part', 2, -5.5, 2, -1.5),
  W(0, 'rail', 6.2, -0.9, 6.2, 4.6),
  // Lầu 1 — tường ngoài, cửa ra ban công
  W(1, 'full', -8, -5.5, 8, -5.5), W(1, 'full', -8, -5.5, -8, 5.5),
  W(1, 'low', -8, 5.5, -3.4, 5.5), W(1, 'low', -1.8, 5.5, 8, 5.5),
  W(1, 'low', 8, -5.5, 8, 5.5),
  // Lầu 1 — 2 phòng ngủ (mỗi phòng một cửa ra sảnh), lan can quanh cầu thang
  W(1, 'part', -8, 0.8, -5, 0.8), W(1, 'part', -3.8, 0.8, 0.6, 0.8), W(1, 'part', 1.8, 0.8, 3.2, 0.8),
  W(1, 'part', -1.2, -5.5, -1.2, 0.8), W(1, 'part', 3.2, -5.5, 3.2, 0.8),
  W(1, 'rail', 4.4, -0.9, 4.4, 4.6), W(1, 'rail', 6.1, -0.9, 6.1, 4.6), W(1, 'rail', 6.2, 4.6, 7.8, 4.6),
  // Ban công
  W(1, 'rail', -6, 5.5, -6, 7.5), W(1, 'rail', 2, 5.5, 2, 7.5), W(1, 'rail', -6, 7.5, 2, 7.5),
  // Sân thượng — tường chắn và lan can quanh lỗ cầu thang
  W(2, 'parapet', -8, -5.5, 8, -5.5), W(2, 'parapet', -8, -5.5, -8, 5.5), W(2, 'parapet', -8, 5.5, 8, 5.5), W(2, 'parapet', 8, -5.5, 8, 5.5),
  W(2, 'rail', 4.4, -0.9, 4.4, 4.6), W(2, 'rail', 6.0, -0.9, 6.0, 4.6), W(2, 'rail', 4.4, -0.9, 6.0, -0.9),
];
const THICK = { full: 0.24, low: 0.24, part: 0.14, rail: 0.08, parapet: 0.24 };
const HEIGHT = { full: LEVEL_H - 0.22, low: 0.5, part: 1.15, rail: 1.0, parapet: 0.9 };
const wallRect = w => {
  const t = THICK[w.type] / 2;
  return { x0: Math.min(w.x0, w.x1) - t, x1: Math.max(w.x0, w.x1) + t, z0: Math.min(w.z0, w.z1) - t, z1: Math.max(w.z0, w.z1) + t };
};

// Đồ cố định của ngôi nhà (không di chuyển được). solid = chặn đường đi / không đặt đồ chồng lên.
const F = (level, kind, x, z, w, d, rot = 0, solid = true) => ({ level, kind, x, z, w, d, rot, solid });
export const FIXTURES = [
  F(0, 'counter', -6.04, -5.065, 3.68, 0.63), F(0, 'counterSide', -7.565, -3.825, 0.63, 1.85),
  F(0, 'tv', -7.64, 2, 0.48, 2), F(0, 'shoes', -2.7, 5.15, 0.9, 0.4),
  F(0, 'bathtub', 6.79, -4.865, 2.18, 1.03), F(0, 'toilet', 2.75, -5.0, 0.5, 0.7), F(0, 'vanity', 4.3, -5.12, 1.2, 0.52),
  F(0, 'bathmat', 4.3, -4.3, 1.1, 0.6, 0, false), F(0, 'dogbed', 3.6, 4.5, 1.1, 0.9, 0, false),
  F(1, 'wardrobe', -7.58, -1.6, 0.6, 2.0, Math.PI / 2), F(1, 'wardrobe', 2.65, -5.08, 0.9, 0.6),
  F(1, 'planters', -2, 7.25, 7.6, 0.3, 0, false),
  F(2, 'tank', 7.0, -4.5, 1.4, 1.4), F(2, 'planterBox', -7.4, 0, 0.7, 3.2), F(2, 'clothesline', 0, -4.3, 5, 0.3, 0, false),
];
const fixtureRect = f => ({ x0: f.x - f.w / 2, x1: f.x + f.w / 2, z0: f.z - f.d / 2, z1: f.z + f.d / 2 });

// Vùng phải để trống (cửa, đầu cầu thang): không đặt đồ cứng lên.
const KEEP_CLEAR = [
  { level: 0, x0: -1.8, x1: 0, z0: 4.6, z1: 5.5 }, { level: 0, x0: -3.9, x1: -2.1, z0: -5.5, z1: -4.6 },
  { level: 0, x0: 6.2, x1: 7.9, z0: 4.6, z1: 5.5 }, { level: 0, x0: 3.0, x1: 4.6, z0: -1.9, z1: -1.1 },
  { level: 1, x0: 4.4, x1: 7.9, z0: -1.8, z1: -0.9 }, { level: 1, x0: -3.6, x1: -1.6, z0: 4.6, z1: 6.4 },
  { level: 1, x0: 3.2, x1: 4.4, z0: -0.9, z1: 0.8 }, { level: 1, x0: -5.1, x1: -3.7, z0: 0.3, z1: 1.3 }, { level: 1, x0: 0.5, x1: 1.9, z0: 0.3, z1: 1.3 },
  { level: 2, x0: 4.4, x1: 6.0, z0: 4.6, z1: 5.5 },
];

// ---------- Mặt bằng: các mặt sàn đi được ----------
const inR = (r, x, z) => x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1;
const FLOORS = [
  [HOUSE, { x0: DOORS.front.x0, x1: DOORS.front.x1, z0: HOUSE.z1, z1: HOUSE.z1 + 0.7 }, { x0: DOORS.back.x0, x1: DOORS.back.x1, z0: HOUSE.z0 - 0.7, z1: HOUSE.z0 }],
  [HOUSE, BALCONY],
  [HOUSE],
];
// Sàn tầng l có tại (x, z) không (trừ ô cầu thang: tầng dưới là khối cầu thang, tầng trên là lỗ cầu thang).
export function hasFloor(l, x, z) {
  if (!FLOORS[l]?.some(r => inR(r, x, z))) return false;
  return !STAIRS.some(s => (s.from === l || s.to === l) && inR(stairRect(s), x, z));
}
// Mặt đứng được ở (x, z) gần độ cao y nhất (chênh tối đa 0.45 m — như bước lên một bậc).
export function surfaceAt(x, z, y) {
  let best = null, bd = 0.45;
  for (const s of STAIRS) {
    if (!inR(stairRect(s), x, z)) continue;
    const t = Math.min(1, Math.max(0, (z - s.zb) / (s.zt - s.zb)));
    const h = levelY(s.from) + t * LEVEL_H, d = Math.abs(h - y);
    if (d < bd) { bd = d; best = { level: t < 0.5 ? s.from : s.to, y: h, stair: true }; }
  }
  for (let l = 0; l < LEVELS; l++) {
    const d = Math.abs(levelY(l) - y);
    if (d < bd && hasFloor(l, x, z)) { bd = d; best = { level: l, y: levelY(l), stair: false }; }
  }
  return best;
}
const wallsBy = Array.from({ length: LEVELS }, (_, l) => WALLS.filter(w => w.level === l).map(wallRect));
const solidsBy = Array.from({ length: LEVELS }, (_, l) => FIXTURES.filter(f => f.level === l && f.solid).map(fixtureRect));
const rectDist = (x, z, r) => Math.hypot(Math.max(r.x0 - x, 0, x - r.x1), Math.max(r.z0 - z, 0, z - r.z1));
// Người (bán kính r) đứng ở (x, z) tầng l có đụng tường / đồ cố định không.
export const structureHit = (l, x, z, r) => wallsBy[l].some(w => rectDist(x, z, w) < r) || solidsBy[l].some(f => rectDist(x, z, f) < r);
const boxHits = (a, b) => a.x0 < b.x1 && a.x1 > b.x0 && a.z0 < b.z1 && a.z1 > b.z0;
// Một món nội thất (tâm x, z, nửa cạnh hw, hd) đặt ở tầng l có hợp lệ với kết cấu nhà không.
export function placementOk(l, box, rug) {
  const r = { x0: box.x - box.hw, x1: box.x + box.hw, z0: box.z - box.hd, z1: box.z + box.hd };
  const pts = [[r.x0, r.z0], [r.x1, r.z0], [r.x0, r.z1], [r.x1, r.z1], [box.x, box.z]];
  if (!pts.every(([x, z]) => hasFloor(l, x, z))) return false;
  if (wallsBy[l].some(w => boxHits(r, w)) || solidsBy[l].some(f => boxHits(r, f))) return false;
  return rug || !KEEP_CLEAR.some(k => k.level === l && boxHits(r, k));
}

// ---------- Mô hình 3D ----------
const FLOOR_MAT = {
  wood: { color: '#ffffff', tex: rep => planks(rep) },
  wood2: { color: '#f3dccb', tex: rep => planks(rep) },
  deck: { color: '#d9b48a', tex: rep => planks(rep) },
  tile: { color: '#ffffff', tex: rep => checker('#f6f1e8', '#e8ddcc', 8, rep) },
  bath: { color: '#ffffff', tex: rep => checker('#e6f4f2', '#cfe8e4', 8, rep) },
  roof: { color: '#ffffff', tex: rep => checker('#ddd3c4', '#d0c4b2', 4, rep) },
};
const r2 = v => Math.max(0.5, Math.round(v * 2) / 2);
function FloorPatch({ r, type, y = 0.004 }) {
  const m = FLOOR_MAT[type] || FLOOR_MAT.wood;
  const w = r.x1 - r.x0, d = r.z1 - r.z0;
  const map = useMemo(() => m.tex([r2(w / 4), r2(d / 4)]), [m, w, d]);
  return (
    <mesh position={[(r.x0 + r.x1) / 2, y, (r.z0 + r.z1) / 2]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
      <planeGeometry args={[w, d]} /><Mat color={m.color} map={map} rough={0.75} />
    </mesh>
  );
}
// Tấm sàn (có khoét lỗ cầu thang): chia hình chữ nhật thành tối đa 4 mảnh quanh lỗ.
function slabPieces(r, holeIn) {
  if (!holeIn) return [r];
  const hole = { x0: Math.max(r.x0, holeIn.x0), x1: Math.min(r.x1, holeIn.x1), z0: Math.max(r.z0, holeIn.z0), z1: Math.min(r.z1, holeIn.z1) };
  if (hole.x1 <= hole.x0 || hole.z1 <= hole.z0) return [r];
  return [
    { x0: r.x0, x1: r.x1, z0: r.z0, z1: hole.z0 }, { x0: r.x0, x1: r.x1, z0: hole.z1, z1: r.z1 },
    { x0: r.x0, x1: hole.x0, z0: hole.z0, z1: hole.z1 }, { x0: hole.x1, x1: r.x1, z0: hole.z0, z1: hole.z1 },
  ].filter(p => p.x1 - p.x0 > 0.01 && p.z1 - p.z0 > 0.01);
}
function Slab({ r, thick = 0.22, color = '#efe2d2' }) {
  return (
    <mesh position={[(r.x0 + r.x1) / 2, -thick / 2 - 0.002, (r.z0 + r.z1) / 2]} castShadow receiveShadow>
      <boxGeometry args={[r.x1 - r.x0, thick, r.z1 - r.z0]} /><Mat color={color} rough={0.9} />
    </mesh>
  );
}

const WALL_COLOR = ['#f8efe6', '#f3e8f4', '#efe5d6'];
function WallSeg({ w, color }) {
  const len = Math.hypot(w.x1 - w.x0, w.z1 - w.z0), t = THICK[w.type], h = HEIGHT[w.type];
  const alongX = Math.abs(w.x1 - w.x0) > Math.abs(w.z1 - w.z0);
  const cx = (w.x0 + w.x1) / 2, cz = (w.z0 + w.z1) / 2;
  const size = alongX ? [len + t, h, t] : [t, h, len + t];
  if (w.type === 'rail') {
    // Lan can gỗ: thanh vịn + song chắn.
    const n = Math.max(2, Math.round(len / 0.45));
    return (
      <group>
        <mesh position={[cx, h, cz]} castShadow><boxGeometry args={alongX ? [len + 0.1, 0.08, 0.12] : [0.12, 0.08, len + 0.1]} /><Mat color="#b67a4b" /></mesh>
        {Array.from({ length: n + 1 }, (_, i) => {
          const k = i / n, x = w.x0 + (w.x1 - w.x0) * k, z = w.z0 + (w.z1 - w.z0) * k;
          return <mesh key={i} position={[x, h / 2, z]} castShadow><boxGeometry args={[0.06, h, 0.06]} /><Mat color={i % n === 0 ? '#b67a4b' : '#fff7ec'} /></mesh>;
        })}
      </group>
    );
  }
  const trim = w.type === 'full' ? null : <mesh position={[cx, h + 0.03, cz]}><boxGeometry args={[size[0] + 0.04, 0.06, size[2] + 0.04]} /><Mat color="#c9905e" /></mesh>;
  return (
    <group>
      <mesh position={[cx, h / 2, cz]} castShadow receiveShadow><boxGeometry args={size} /><Mat color={w.type === 'parapet' ? '#e9dccb' : color} rough={0.95} /></mesh>
      {trim}
      {w.type === 'full' && <mesh position={[cx, 0.08, cz]}><boxGeometry args={[size[0] + 0.03, 0.16, size[2] + 0.03]} /><Mat color="#efe2d2" /></mesh>}
    </group>
  );
}

// Cửa sổ trên tường sau (z-) và tường trái (x-).
const WINDOWS = [
  { level: 0, wall: 'back', at: -1.0, w: 1.6, h: 1.1, y: 2.0 }, { level: 0, wall: 'back', at: 6.8, w: 1.1, h: 0.8, y: 2.2 },
  { level: 0, wall: 'left', at: 3.9, w: 1.8, h: 1.4, y: 1.7 }, { level: 0, wall: 'left', at: -0.2, w: 1.3, h: 1.4, y: 1.7 },
  { level: 1, wall: 'back', at: -4.6, w: 2.0, h: 1.4, y: 1.8 }, { level: 1, wall: 'back', at: 0.9, w: 1.6, h: 1.4, y: 1.8 }, { level: 1, wall: 'back', at: 6.0, w: 1.2, h: 1.2, y: 1.8 },
  { level: 1, wall: 'left', at: -4.3, w: 1.3, h: 1.3, y: 1.8 }, { level: 1, wall: 'left', at: 3.1, w: 1.8, h: 1.4, y: 1.8 },
];
function Window({ win, night }) {
  const back = win.wall === 'back';
  const pos = back ? [win.at, win.y, HOUSE.z0 + 0.13] : [HOUSE.x0 + 0.13, win.y, win.at];
  const glass = night > 0.6 ? '#3d4a7d' : '#ffe2a8';
  return (
    <group position={pos} rotation={[0, back ? 0 : Math.PI / 2, 0]}>
      <mesh><boxGeometry args={[win.w + 0.2, win.h + 0.2, 0.06]} /><Mat color="#c89466" /></mesh>
      <mesh position={[0, 0, 0.03]}><boxGeometry args={[win.w, win.h, 0.04]} /><Mat color={glass} emissive={night > 0.6 ? '#6f7fc0' : '#ffd27a'} ei={night > 0.6 ? 0.35 : 0.9} toneMapped={false} /></mesh>
      <mesh position={[0, 0, 0.06]}><boxGeometry args={[0.06, win.h, 0.03]} /><Mat color="#c89466" /></mesh>
      <mesh position={[0, -win.h / 2 - 0.12, 0.1]}><boxGeometry args={[win.w + 0.3, 0.07, 0.24]} /><Mat color="#fff7ec" /></mesh>
    </group>
  );
}

function Stair({ s }) {
  const n = 16, len = Math.abs(s.zt - s.zb), run = len / n, rise = LEVEL_H / n, dir = Math.sign(s.zt - s.zb), w = s.x1 - s.x0, cx = (s.x0 + s.x1) / 2;
  const slope = Math.atan2(LEVEL_H, len);
  return (
    <group>
      {Array.from({ length: n }, (_, i) => {
        const top = (i + 1) * rise, z = s.zb + dir * (i + 0.5) * run;
        return (
          <group key={i}>
            <mesh position={[cx, top / 2, z]} castShadow receiveShadow><boxGeometry args={[w, top, run + 0.005]} /><Mat color={i % 2 ? '#e7c79f' : '#dfbb90'} /></mesh>
            <mesh position={[cx, top - 0.02, z - dir * (run / 2 - 0.04)]}><boxGeometry args={[w + 0.02, 0.05, 0.08]} /><Mat color="#b67a4b" /></mesh>
          </group>
        );
      })}
      {/* Tay vịn dốc theo cầu thang */}
      {[s.x0 + 0.05, s.x1 - 0.05].map(x => (
        <mesh key={x} position={[x, LEVEL_H / 2 + 0.95, (s.zb + s.zt) / 2]} rotation={[-dir * slope, 0, 0]} castShadow>
          <boxGeometry args={[0.07, 0.07, Math.hypot(len, LEVEL_H)]} /><Mat color="#b67a4b" />
        </mesh>
      ))}
    </group>
  );
}

// ---- Đồ cố định ----
function Counter({ w, d, side }) {
  const doors = Math.max(1, Math.round((side ? d : w) / 0.6));
  return (
    <group>
      <mesh position={[0, 0.45, 0]} castShadow receiveShadow><boxGeometry args={[w, 0.9, d]} /><Mat color="#fffaf2" /></mesh>
      <mesh position={[0, 0.93, 0]} castShadow><boxGeometry args={[w + 0.04, 0.06, d + 0.04]} /><Mat color="#d8b48c" /></mesh>
      {/* Tay nắm cánh tủ ở mặt trước (+z, hoặc +x với tủ dọc tường trái) */}
      {Array.from({ length: doors }, (_, i) => {
        const k = (i + 0.5) / doors - 0.5;
        return <mesh key={i} position={side ? [w / 2 + 0.01, 0.62, k * d] : [k * w, 0.62, d / 2 + 0.01]}><boxGeometry args={side ? [0.02, 0.04, 0.3] : [0.3, 0.04, 0.02]} /><Mat color="#c9905e" /></mesh>;
      })}
    </group>
  );
}
function Fixture({ f, night }) {
  const { kind, w, d } = f;
  let body = null;
  if (kind === 'counter') body = (
    <group>
      <Counter w={w} d={d} />
      {/* Bếp, chậu rửa, máy hút mùi, tủ treo */}
      <mesh position={[-0.75, 0.97, 0]}><boxGeometry args={[0.7, 0.03, 0.5]} /><Mat color="#3d3a3a" rough={0.4} /></mesh>
      {[-0.92, -0.58].map(x => <mesh key={x} position={[x, 0.99, 0]} rotation={[-Math.PI / 2, 0, 0]}><ringGeometry args={[0.07, 0.11, 18]} /><Mat color="#8a8a8a" /></mesh>)}
      <mesh position={[0.95, 0.94, 0.02]}><boxGeometry args={[0.6, 0.04, 0.4]} /><Mat color="#c9d6dc" metal={0.3} rough={0.3} /></mesh>
      <mesh position={[0.95, 1.12, -0.18]}><cylinderGeometry args={[0.025, 0.025, 0.3, 8]} /><Mat color="#b9c4ca" metal={0.4} /></mesh>
      <mesh position={[-0.75, 2.05, -0.1]} castShadow><boxGeometry args={[0.8, 0.35, 0.45]} /><Mat color="#e7c79f" /></mesh>
      {[-1.45, 0.3, 1.2].map(x => <mesh key={x} position={[x, 2.1, -0.12]} castShadow><boxGeometry args={[0.8, 0.6, 0.38]} /><Mat color="#9ed1c4" /></mesh>)}
      <mesh position={[0.2, 1.06, -0.1]}><cylinderGeometry args={[0.12, 0.1, 0.2, 12]} /><Mat color="#f2a3a1" /></mesh>
    </group>
  );
  else if (kind === 'counterSide') body = <Counter w={w} d={d} side />;
  else if (kind === 'tv') body = (
    <group>
      <mesh position={[0, 0.25, 0]} castShadow receiveShadow><boxGeometry args={[w, 0.5, d]} /><Mat color="#c89466" /></mesh>
      <mesh position={[-0.12, 1.25, 0]} castShadow><boxGeometry args={[0.08, 0.95, 1.6]} /><Mat color="#2f3138" rough={0.4} /></mesh>
      <mesh position={[-0.07, 1.25, 0]}><boxGeometry args={[0.02, 0.82, 1.48]} /><Mat color={night > 0.6 ? '#7fb8e6' : '#3b5f7a'} emissive="#5b9bd5" ei={night > 0.6 ? 0.6 : 0.15} /></mesh>
    </group>
  );
  else if (kind === 'shoes') body = (
    <group>
      <mesh position={[0, 0.3, 0]} castShadow><boxGeometry args={[w, 0.6, d]} /><Mat color="#e7c79f" /></mesh>
      {[-0.25, 0.1].map(x => <mesh key={x} position={[x, 0.66, 0]}><boxGeometry args={[0.22, 0.1, 0.3]} /><Mat color={x < 0 ? '#f2727a' : '#8fc6c9'} /></mesh>)}
    </group>
  );
  else if (kind === 'bathtub') body = (
    <group>
      <RoundedBox args={[w, 0.6, d]} radius={0.12} position={[0, 0.3, 0]} castShadow receiveShadow><Mat color="#ffffff" rough={0.3} /></RoundedBox>
      <mesh position={[0, 0.55, 0]}><boxGeometry args={[w - 0.3, 0.04, d - 0.3]} /><Mat color="#9fd8e6" rough={0.1} transparent opacity={0.85} /></mesh>
      <mesh position={[w / 2 - 0.2, 0.9, -d / 2 + 0.1]}><cylinderGeometry args={[0.03, 0.03, 0.5, 8]} /><Mat color="#b9c4ca" metal={0.5} /></mesh>
      <mesh position={[0, 1.7, -d / 2 + 0.02]}><boxGeometry args={[w, 0.04, 0.04]} /><Mat color="#b9c4ca" /></mesh>
      <mesh position={[-w / 4, 1.1, -d / 2 + 0.05]}><boxGeometry args={[w / 2, 1.2, 0.02]} /><Mat color="#f6c9d6" /></mesh>
    </group>
  );
  else if (kind === 'toilet') body = (
    <group>
      <RoundedBox args={[0.42, 0.42, 0.55]} radius={0.1} position={[0, 0.21, 0.05]} castShadow><Mat color="#ffffff" rough={0.3} /></RoundedBox>
      <RoundedBox args={[0.46, 0.5, 0.2]} radius={0.06} position={[0, 0.6, -0.26]} castShadow><Mat color="#ffffff" rough={0.3} /></RoundedBox>
      <mesh position={[0, 0.44, 0.05]}><boxGeometry args={[0.4, 0.03, 0.5]} /><Mat color="#e6f4f2" /></mesh>
    </group>
  );
  else if (kind === 'vanity') body = (
    <group>
      <mesh position={[0, 0.42, 0]} castShadow><boxGeometry args={[w, 0.84, d]} /><Mat color="#c89466" /></mesh>
      <mesh position={[0, 0.88, 0.02]}><cylinderGeometry args={[0.24, 0.2, 0.08, 20]} /><Mat color="#ffffff" rough={0.3} /></mesh>
      <mesh position={[0, 1.65, -d / 2 + 0.02]}><boxGeometry args={[0.8, 0.9, 0.03]} /><Mat color="#d9eef5" rough={0.05} metal={0.3} /></mesh>
    </group>
  );
  else if (kind === 'bathmat') body = <RoundedBox args={[w, 0.03, d]} radius={0.01} position={[0, 0.015, 0]}><Mat color="#f6c9d6" rough={1} /></RoundedBox>;
  else if (kind === 'dogbed') body = (
    <group>
      <mesh position={[0, 0.1, 0]} scale={[w / 2, 1, d / 2]}><cylinderGeometry args={[1, 1, 0.2, 24]} /><Mat color="#8fc6c9" /></mesh>
      <mesh position={[0, 0.17, 0]} scale={[w / 2 - 0.1, 1, d / 2 - 0.1]}><cylinderGeometry args={[1, 1, 0.08, 24]} /><Mat color="#fff4e4" /></mesh>
    </group>
  );
  else if (kind === 'wardrobe') body = (
    <group>
      <mesh position={[0, 1.05, 0]} castShadow receiveShadow><boxGeometry args={[Math.max(w, d), 2.1, Math.min(w, d)]} /><Mat color="#e7c79f" /></mesh>
      <mesh position={[0, 1.05, Math.min(w, d) / 2 + 0.005]}><boxGeometry args={[0.02, 2.0, 0.01]} /><Mat color="#b67a4b" /></mesh>
      {[-0.1, 0.1].map(x => <mesh key={x} position={[x, 1.1, Math.min(w, d) / 2 + 0.02]}><boxGeometry args={[0.03, 0.25, 0.03]} /><Mat color="#8a5a3c" /></mesh>)}
    </group>
  );
  else if (kind === 'planters') body = (
    <group>
      {[-3.4, -1.2, 1.2, 3.4].map((x, i) => (
        <group key={x} position={[x, 0, 0]}>
          <mesh position={[0, 0.2, 0]} castShadow><boxGeometry args={[0.8, 0.4, 0.3]} /><Mat color="#c98b5a" /></mesh>
          {[-0.25, 0, 0.25].map(fx => <mesh key={fx} position={[fx, 0.48, 0]}><icosahedronGeometry args={[0.15, 0]} /><Mat flat color={['#f2727a', '#f6c453', '#c9a3f0', '#7cbf7a'][(i + Math.round(fx * 8)) & 3]} /></mesh>)}
        </group>
      ))}
    </group>
  );
  else if (kind === 'tank') body = (
    <group>
      <mesh position={[0, 0.35, 0]} castShadow><boxGeometry args={[w, 0.7, d]} /><Mat color="#b9c4ca" metal={0.3} /></mesh>
      <mesh position={[0, 1.2, 0]} rotation={[0, 0, Math.PI / 2]} castShadow><cylinderGeometry args={[0.55, 0.55, w - 0.1, 20]} /><Mat color="#e8eef2" metal={0.4} rough={0.35} /></mesh>
    </group>
  );
  else if (kind === 'planterBox') body = (
    <group>
      <mesh position={[0, 0.3, 0]} castShadow><boxGeometry args={[w, 0.6, d]} /><Mat color="#b67a4b" /></mesh>
      {Array.from({ length: 6 }, (_, i) => <mesh key={i} position={[0, 0.78, -d / 2 + 0.3 + i * ((d - 0.6) / 5)]} castShadow><icosahedronGeometry args={[0.3, 0]} /><Mat flat color={i % 2 ? '#7cbf7a' : '#8fc782'} /></mesh>)}
    </group>
  );
  else if (kind === 'clothesline') body = (
    <group>
      {[-w / 2, w / 2].map(x => <mesh key={x} position={[x, 0.9, 0]} castShadow><cylinderGeometry args={[0.04, 0.04, 1.8, 8]} /><Mat color="#8a7a6a" /></mesh>)}
      <mesh position={[0, 1.75, 0]} rotation={[0, 0, Math.PI / 2]}><cylinderGeometry args={[0.012, 0.012, w, 6]} /><Mat color="#fffaf2" /></mesh>
      {[-1.6, -0.6, 0.5, 1.5].map((x, i) => <mesh key={x} position={[x, 1.45, 0]} castShadow><boxGeometry args={[0.6, 0.6, 0.02]} /><Mat color={['#f2a3a1', '#8fc6c9', '#f6c453', '#c5b5e6'][i]} side={THREE.DoubleSide} /></mesh>)}
    </group>
  );
  return <group position={[f.x, 0, f.z]} rotation={[0, f.rot, 0]}>{body}</group>;
}

// Cửa chính / cửa sau: khung cửa, thảm chùi chân và nhãn chỉ đường.
function DoorWay({ door, full, showLabel }) {
  const cx = (door.x0 + door.x1) / 2, wd = door.x1 - door.x0, out = door.z > 0 ? 1 : -1;
  const h = full ? 2.35 : 0.5;
  return (
    <group>
      {[door.x0, door.x1].map(x => <mesh key={x} position={[x, h / 2, door.z]} castShadow><boxGeometry args={[0.14, h, 0.3]} /><Mat color="#a9764f" /></mesh>)}
      {full && (
        <>
          <mesh position={[cx, h + 0.06, door.z]} castShadow><boxGeometry args={[wd + 0.14, 0.14, 0.3]} /><Mat color="#a9764f" /></mesh>
          {/* Phần tường phía trên cửa */}
          <mesh position={[cx, (h + 0.13 + HEIGHT.full) / 2, door.z]}><boxGeometry args={[wd, HEIGHT.full - h - 0.13, THICK.full]} /><Mat color={WALL_COLOR[0]} rough={0.95} /></mesh>
          {/* Cánh cửa mở hé ra ngoài */}
          <group position={[door.x0 + 0.05, 0, door.z]} rotation={[0, out * 1.1, 0]}>
            <mesh position={[wd / 2 - 0.05, h / 2, 0]} castShadow><boxGeometry args={[wd - 0.1, h - 0.05, 0.06]} /><Mat color="#8fc6c9" /></mesh>
            <mesh position={[wd / 2 - 0.05, h * 0.65, 0.035]}><boxGeometry args={[wd * 0.5, h * 0.35, 0.02]} /><Mat color="#e6f6fb" emissive="#ffe6b0" ei={0.3} /></mesh>
          </group>
        </>
      )}
      <RoundedBox args={[wd - 0.2, 0.03, 0.6]} radius={0.01} position={[cx, 0.015, door.z - out * 0.45]}><Mat color="#c98b5a" rough={1} /></RoundedBox>
      {/* Mũi tên chỉ lối ra trên sàn */}
      <mesh position={[cx, 0.035, door.z - out * 0.45]} rotation={[-Math.PI / 2, 0, out > 0 ? Math.PI : 0]}><circleGeometry args={[0.18, 3]} /><Mat color="#fff7ec" /></mesh>
      {showLabel && door.label && <ScreenLabel position={[cx, full ? 2.9 : 1.6, door.z - out * 0.3]} className="door-tag" text={door.label} />}
    </group>
  );
}

// Toàn bộ ngôi nhà. level = tầng đang đứng: chỉ hiện tầng đó và các tầng bên dưới (cắt lớp như nhà búp bê).
export function House({ level }) {
  const night = useNight();
  const holes = useMemo(() => Array.from({ length: LEVELS }, (_, l) => STAIRS.filter(s => s.to === l).map(stairRect)[0] || null), []);
  return (
    <group>
      {/* Nền móng; bãi cỏ, đường phố và nhà hàng xóm xung quanh do <Neighborhood> vẽ */}
      <mesh position={[0, -0.17, 0]} receiveShadow><boxGeometry args={[16.6, 0.32, 11.6]} /><Mat color="#d8cbb8" rough={1} /></mesh>
      <mesh position={[-0.9, -0.14, 6.6]} receiveShadow><boxGeometry args={[1.8, 0.08, 1.6]} /><Mat color="#e8dcc6" /></mesh>
      <mesh position={[-3, -0.14, -6.4]} receiveShadow><boxGeometry args={[1.8, 0.08, 1.6]} /><Mat color="#e8dcc6" /></mesh>
      {Array.from({ length: LEVELS }, (_, l) => (
        <group key={l} position={[0, levelY(l), 0]} visible={l <= level}>
          {slabPieces(HOUSE, holes[l]).map((p, i) => <Slab key={i} r={p} thick={l ? 0.22 : 0.3} />)}
          {l === 1 && <Slab r={BALCONY} />}
          {ROOMS.filter(r => r.level === l).map(r => (
            r.floor || l === 0 ? slabPieces(r, holes[l]).map((p, i) => <FloorPatch key={r.name + i} r={p} type={r.floor || 'wood'} y={r.floor ? 0.006 : 0.003} />) : null
          ))}
          {l === 1 && slabPieces({ x0: HOUSE.x0, x1: HOUSE.x1, z0: HOUSE.z0, z1: HOUSE.z1 }, holes[1]).map((p, i) => <FloorPatch key={'b' + i} r={p} type="wood" y={0.002} />)}
          {WALLS.filter(w => w.level === l).map((w, i) => <WallSeg key={i} w={w} color={WALL_COLOR[l]} />)}
          {WINDOWS.filter(w => w.level === l).map((w, i) => <Window key={i} win={w} night={night} />)}
          {FIXTURES.filter(f => f.level === l).map((f, i) => <Fixture key={i} f={f} night={night} />)}
          {STAIRS.filter(s => s.from === l).map((s, i) => <Stair key={i} s={s} />)}
          {l === 0 && <DoorWay door={DOORS.front} showLabel={level === 0} />}
          {l === 0 && <DoorWay door={DOORS.back} full showLabel={level === 0} />}
          {l === 1 && <DoorWay door={DOORS.balcony} />}
          {l === level && ROOMS.filter(r => r.level === l && r.label).map(r => (
            <ScreenLabel key={r.name} position={[r.label[0], 0.3, r.label[1]]} className="room-tag" text={r.name} />
          ))}
        </group>
      ))}
    </group>
  );
}

export const roomOf = (l, x, z) => {
  const list = ROOMS.filter(r => r.level === l && inR(r, x, z));
  return list.sort((a, b) => (a.x1 - a.x0) * (a.z1 - a.z0) - (b.x1 - b.x0) * (b.z1 - b.z0))[0] || null;
};
export { mix };
