// Hệ thống lô đất trong thế giới 3D: đất trống, biển tên lô, ranh giới (chỉ hiện khi lại gần), lô đang chọn, camera xem lô.
import React, { useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { Mat, canvasTexture, lerpFov } from './kit.jsx';
import { plotGeo, plotLabelMode } from '../world.js';

// Màu theo trạng thái (dùng cho ranh giới, minimap, giao diện).
export const PLOT_COLORS = { mine: '#f2727a', available: '#3fb39e', owned: '#f2a33a', reserved: '#c9a46b', disabled: '#9aa0a6' };
export const plotColor = (p, mineId) => (p.id === mineId ? PLOT_COLORS.mine : PLOT_COLORS[p.status] || PLOT_COLORS.owned);

// Nội dung biển tên của một lô (theo trạng thái và cấu hình world_settings.plot_label_mode: 'code' | 'owner' | 'both').
export function plotSignText(p, mineId) {
  if (p.status === 'available') return { title: 'Đất chưa có chủ', sub: `${p.plot_code} · ${p.width}×${p.length} m`, bg: '#3f9c8c' };
  if (p.status === 'disabled') return { title: 'Đang quy hoạch', sub: p.plot_code, bg: '#8a8f96' };
  if (p.status === 'reserved') return { title: p.plot_code, sub: 'Nhà dân', bg: '#a9764f' };
  const owner = p.id === mineId ? 'Nhà của bạn' : `Nhà của ${p.owner_name || '?'}`;
  const mode = plotLabelMode();
  if (mode === 'code') return { title: p.plot_code, sub: '', bg: p.id === mineId ? '#e0614f' : '#c98a3c' };
  if (mode === 'owner') return { title: owner, sub: '', bg: p.id === mineId ? '#e0614f' : '#c98a3c' };
  return { title: p.plot_code, sub: owner, bg: p.id === mineId ? '#e0614f' : '#c98a3c' };
}
const signTex = ({ title, sub, bg }) => canvasTexture(`plotsign:${title}:${sub}:${bg}`, 512, 256, (g, w, h) => {
  g.fillStyle = bg; g.beginPath(); g.roundRect(8, 8, w - 16, h - 16, 36); g.fill();
  g.strokeStyle = '#fff6e6'; g.lineWidth = 6; g.beginPath(); g.roundRect(24, 24, w - 48, h - 48, 26); g.stroke();
  g.fillStyle = '#fff6e6'; g.textAlign = 'center'; g.textBaseline = 'middle';
  const fit = (text, size, y) => { let s = size; do { g.font = `bold ${s}px Fredoka, Nunito, sans-serif`; s -= 4; } while (g.measureText(text).width > w - 80 && s > 20); g.fillText(text, w / 2, y); };
  if (sub) { fit(title, 64, h / 2 - 30); g.globalAlpha = 0.9; fit(sub, 44, h / 2 + 42); } else fit(title, 70, h / 2 + 4);
});

// Biển tên cắm trước mặt tiền lô (bên trái cổng).
function PlotSign({ plot, mineId }) {
  const text = plotSignText(plot, mineId);
  const map = useMemo(() => signTex(text), [text.title, text.sub, text.bg]); // eslint-disable-line react-hooks/exhaustive-deps
  const g = plotGeo(plot);
  // Đặt theo hệ toạ độ cục bộ của lô (mặt tiền hướng +Z cục bộ).
  const local = plot.zone === 'rural' ? [-4.6, g.length / 2 - 0.5] : [-3.8, g.length / 2 + 0.9];
  return (
    <group position={[g.x, 0, g.z]} rotation={[0, g.rot, 0]}>
      <group position={[local[0], 0, local[1]]}>
        {[-0.72, 0.72].map(x => <mesh key={x} position={[x, 0.75, 0]} castShadow><boxGeometry args={[0.1, 1.5, 0.1]} /><Mat color="#8a5a3c" /></mesh>)}
        <mesh position={[0, 1.45, 0]} castShadow><boxGeometry args={[1.86, 0.94, 0.08]} /><Mat color="#fff6e6" /></mesh>
        <mesh position={[0, 1.45, 0.045]}><planeGeometry args={[1.8, 0.9]} /><Mat map={map} rough={0.6} /></mesh>
        <mesh position={[0, 1.45, -0.045]} rotation={[0, Math.PI, 0]}><planeGeometry args={[1.8, 0.9]} /><Mat map={map} rough={0.6} /></mesh>
      </group>
    </group>
  );
}

// Lô đất trống / đang quy hoạch: nền đất, cọc mốc 4 góc (+ dây rào và cọc tiêu nếu đang quy hoạch).
function VacantLot({ plot }) {
  const g = plotGeo(plot), city = plot.zone === 'city', disabled = plot.status === 'disabled';
  const ground = city ? '#e7dfd1' : '#c8e8a2';
  const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sz]) => [sx * (g.width / 2 - 0.25), sz * (g.length / 2 - 0.25)]);
  return (
    <group position={[g.x, 0, g.z]} rotation={[0, g.rot, 0]}>
      <mesh position={[0, city ? 0.07 : 0.03, 0]} receiveShadow><boxGeometry args={[g.width - 0.2, city ? 0.1 : 0.04, g.length - 0.2]} /><Mat color={ground} rough={1} /></mesh>
      {city && <mesh position={[0, 0.05, 0]} receiveShadow><boxGeometry args={[g.width + 0.3, 0.08, g.length + 0.3]} /><Mat color="#cfc6b8" /></mesh>}
      {/* Vài khóm cỏ / sỏi cho đất trống đỡ trơn */}
      {[[-0.25, 0.1], [0.2, -0.22], [0.3, 0.28], [-0.32, -0.3]].map(([fx, fz], i) => (
        <mesh key={i} position={[fx * g.width, 0.12, fz * g.length]} scale={[1, 0.5, 1]}><icosahedronGeometry args={[0.32, 0]} /><Mat flat color={city ? '#c9c1b2' : '#9fd07f'} /></mesh>
      ))}
      {corners.map(([x, z], i) => (
        <group key={i} position={[x, 0, z]}>
          <mesh position={[0, 0.4, 0]} castShadow><boxGeometry args={[0.14, 0.8, 0.14]} /><Mat color={disabled ? '#f08a3c' : '#fff6e6'} /></mesh>
          <mesh position={[0, 0.82, 0]}><boxGeometry args={[0.18, 0.08, 0.18]} /><Mat color={disabled ? '#ffffff' : '#3f9c8c'} /></mesh>
        </group>
      ))}
      {disabled && (
        <>
          {[[0, -1], [0, 1], [-1, 0], [1, 0]].map(([sx, sz], i) => (
            <mesh key={i} position={[sx * (g.width / 2 - 0.25), 0.62, sz * (g.length / 2 - 0.25)]}>
              <boxGeometry args={sx ? [0.03, 0.06, g.length - 0.5] : [g.width - 0.5, 0.06, 0.03]} /><Mat color="#f08a3c" />
            </mesh>
          ))}
          {[[-1.5, 1.5], [1.4, -1.2]].map(([x, z]) => (
            <mesh key={x} position={[x, 0.35, z]} castShadow><coneGeometry args={[0.28, 0.7, 12]} /><Mat color="#f08a3c" /></mesh>
          ))}
        </>
      )}
    </group>
  );
}

// Ranh giới mọi lô: chỉ hiện khi nhân vật đứng trong / gần lô (≤ 8 m), luôn hiện và nhấp nháy với lô đang chọn.
const edgeGeo = new THREE.BoxGeometry(1, 1, 1);
function Boundary({ plot, mineId, player, selected }) {
  const g = plotGeo(plot);
  // Màu / độ mờ cập nhật mỗi frame nên một vật liệu dùng suốt vòng đời component.
  const mat = useMemo(() => new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }), []);
  const group = useRef();
  useFrame(({ clock }) => {
    const p = player.current;
    // Khoảng cách từ nhân vật tới hình chữ nhật của lô (trong hệ toạ độ cục bộ của lô).
    const c = Math.cos(-g.rot), s = Math.sin(-g.rot), dx = p.x - g.x, dz = p.z - g.z;
    const lx = dx * c + dz * s, lz = -dx * s + dz * c;
    const d = Math.hypot(Math.max(Math.abs(lx) - g.width / 2, 0), Math.max(Math.abs(lz) - g.length / 2, 0));
    const near = THREE.MathUtils.clamp(1 - (d - 1) / 7, 0, 1) * 0.75;
    const o = selected ? 0.55 + 0.4 * Math.sin(clock.elapsedTime * 4) : near;
    mat.opacity = o;
    mat.color.set(selected ? '#ffd166' : plotColor(plot, mineId));
    if (group.current) group.current.visible = o > 0.02;
  });
  const t = selected ? 0.22 : 0.12, h = selected ? 0.18 : 0.06;
  return (
    <group ref={group} position={[g.x, 0, g.z]} rotation={[0, g.rot, 0]} visible={false}>
      <mesh geometry={edgeGeo} material={mat} position={[0, h / 2 + 0.06, -g.length / 2]} scale={[g.width, h, t]} />
      <mesh geometry={edgeGeo} material={mat} position={[0, h / 2 + 0.06, g.length / 2]} scale={[g.width, h, t]} />
      <mesh geometry={edgeGeo} material={mat} position={[-g.width / 2, h / 2 + 0.06, 0]} scale={[t, h, g.length]} />
      <mesh geometry={edgeGeo} material={mat} position={[g.width / 2, h / 2 + 0.06, 0]} scale={[t, h, g.length]} />
    </group>
  );
}

// Mũi tên lơ lửng + cột sáng trên lô đang chọn (màn hình chọn đất).
function SelectedMarker({ plot }) {
  const g = plotGeo(plot);
  const arrow = useRef();
  useFrame(({ clock }) => {
    if (!arrow.current) return;
    arrow.current.position.y = 7 + Math.sin(clock.elapsedTime * 2.5) * 0.5;
    arrow.current.rotation.y = clock.elapsedTime * 1.2;
  });
  return (
    <group position={[g.x, 0, g.z]}>
      <mesh position={[0, 0.09, 0]} rotation={[-Math.PI / 2, 0, 0]}><planeGeometry args={[g.width - 0.4, g.length - 0.4]} /><meshBasicMaterial color="#ffd166" transparent opacity={0.18} depthWrite={false} /></mesh>
      <group ref={arrow}>
        <mesh rotation={[Math.PI, 0, 0]}><coneGeometry args={[0.9, 1.6, 4]} /><meshBasicMaterial color="#ffd166" toneMapped={false} /></mesh>
        <mesh position={[0, 1.3, 0]}><cylinderGeometry args={[0.35, 0.35, 1.2, 8]} /><meshBasicMaterial color="#ffd166" toneMapped={false} /></mesh>
      </group>
    </group>
  );
}

// Lớp lô đất: đất trống cho lô available / disabled, biển tên cho mọi lô, ranh giới khi lại gần, đánh dấu lô đang chọn.
// (Nhà của lô owned / reserved do World vẽ như trước.)
export function PlotLayer({ nodes, mineId, player, selectedId }) {
  return (
    <group>
      {nodes.filter(p => p.status === 'available' || p.status === 'disabled').map(p => <VacantLot key={p.id} plot={p} />)}
      {nodes.map(p => <PlotSign key={p.id} plot={p} mineId={mineId} />)}
      {player && nodes.map(p => <Boundary key={p.id} plot={p} mineId={mineId} player={player} selected={p.id === selectedId} />)}
      {selectedId && nodes.filter(p => p.id === selectedId).map(p => <SelectedMarker key={p.id} plot={p} />)}
    </group>
  );
}

// Camera xem lô: bay tới và chầm chậm quay quanh lô đang chọn (thay camera thường khi mở màn hình chọn đất).
const camWant = new THREE.Vector3(), lookWant = new THREE.Vector3(), lookNow = new THREE.Vector3();
export function FocusCamera({ plot }) {
  const { camera } = useThree();
  const st = useRef({ angle: 0.5, id: null });
  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.06), g = plotGeo(plot), s = st.current;
    // Lần đầu: nhìn thẳng vào lô; đổi sang lô khác: điểm nhìn lướt dần sang lô mới.
    if (s.id == null) lookNow.set(g.x, 0, g.z);
    if (s.id !== plot.id) { s.id = plot.id; s.angle = g.rot + 0.55; }
    s.angle += dt * 0.12;
    const size = Math.max(g.width, g.length), r = size * 1.15 + 10, h = size * 0.9 + 9;
    camWant.set(g.x + Math.sin(s.angle) * r, h, g.z + Math.cos(s.angle) * r);
    camera.position.lerp(camWant, 1 - Math.exp(-2.5 * dt));
    // Nhìn lệch sang trái một chút để lô đất nằm bên phải bảng chọn đất (bảng chiếm phía trái màn hình).
    const off = size * 0.32, rx = Math.cos(s.angle), rz = -Math.sin(s.angle);
    lookNow.lerp(lookWant.set(g.x - rx * off, 0, g.z - rz * off), 1 - Math.exp(-3 * dt));
    camera.lookAt(lookNow);
    lerpFov(camera, 45, dt);
  });
  return null;
}
