import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { RoundedBox } from '@react-three/drei';
import * as THREE from 'three';
import { GhostCtx, Mat } from './kit.jsx';
import { Avatar, Puppy, hairColor, shirtColor } from './Characters.jsx';
import { stepWalker, useKeys } from './walk.js';
import { DOORS, FIXTURES, House, LEVEL_NAME, SPAWN, levelY, placementOk, roomOf, structureHit, surfaceAt } from './House.jsx';

const PLAYER_R = 0.28;
// Vùng nhân vật có thể tới (để stepWalker kẹp); va chạm thật do mặt bằng ngôi nhà quyết định.
const WALK = { x0: -7.9, x1: 7.9, z0: -6.2, z1: 7.4 };

// Kích thước chân đế từng loại đồ (rộng theo X, sâu theo Z khi chưa xoay).
const FOOT = { sofa: [2.4, 1.0], table: [1.7, 1.05], plant: [0.7, 0.7], bed: [2.1, 2.65], lamp: [0.55, 0.55], bookshelf: [1.5, 0.5], rug: [2.8, 1.8], chair: [0.6, 0.6], fridge: [1.0, 0.9] };
export function footprint(kind, rot) {
  const [w, d] = FOOT[kind] || [0.8, 0.8];
  const c = Math.abs(Math.cos(rot)), s = Math.abs(Math.sin(rot));
  return { hw: (c * w) / 2 + (s * d) / 2, hd: (s * w) / 2 + (c * d) / 2 };
}
const floorOf = f => Number(f.floor || 0);
const boxOf = f => ({ x: Number(f.pos_x), z: Number(f.pos_z), ...footprint(f.kind, Number(f.rotation_y || 0)), rug: f.kind === 'rug' });
const rectDist = (px, pz, b) => Math.hypot(Math.max(Math.abs(px - b.x) - b.hw, 0), Math.max(Math.abs(pz - b.z) - b.hd, 0));
const overlap = (a, b) => Math.abs(a.x - b.x) < a.hw + b.hw - 0.02 && Math.abs(a.z - b.z) < a.hd + b.hd - 0.02;
// Khung vuông (nửa cạnh = 1) dùng để đánh dấu món đồ đang nhắm tới.
const squareRing = new THREE.RingGeometry(1.32, 1.414, 4, 1).rotateZ(Math.PI / 4);
// Chỗ nằm của Mochi trong nhà.
const DOG_BED = FIXTURES.find(f => f.kind === 'dogbed');

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

// ---------- Trong nhà: chế độ trang trí, con trỏ chuột hiện bình thường, camera nhìn từ trên xuống ----------
// Nhân vật đi lại bằng WASD giữa các phòng, lên xuống cầu thang; đi qua cửa chính → ra đường, qua cửa sau → ra sân vườn.
// Rê chuột lên món đồ để chọn, chuột trái nhấc lên (giữ và kéo rồi thả = kéo thả; click = nhấc lên rồi click chỗ mới để đặt),
// chuột phải xoay. Đồ được đặt ở tầng nhân vật đang đứng.
// held: món đang cầm — { kind } (món mới từ thanh nội thất) hoặc { kind, id } (món đã đặt được nhấc lên).
const floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), floorHit = new THREE.Vector3(), pickRay = new THREE.Raycaster();
export function Interior({ me, view, player, entry = 'front', furniture, held, rotation, onPlace, onPick, onRotateHeld, onRotateItem, onTarget, onBlocked, onExit, onLevel }) {
  // useLayoutEffect: đặt vị trí xuất hiện trước khi frame đầu tiên chạy (tránh dùng toạ độ cũ còn nằm ngoài cửa).
  useLayoutEffect(() => {
    const s = SPAWN[entry] || SPAWN.front;
    Object.assign(player.current, { x: s.x, z: s.z, angle: s.angle, speed: 0, y: 0, level: 0 });
    // Chỉ khi chạy dev: cho script kiểm thử đọc / dịch chuyển nhân vật trong nhà.
    if (import.meta.env.DEV) window.__lwHouse = player;
  }, [player, entry]);
  const anim = useRef({ moving: false, run: false });
  const vel = useRef({ x: 0, z: 0 });
  const avatar = useRef(), ghost = useRef(), ghostRing = useRef(), targetRing = useRef();
  const spot = useRef({ x: 0, z: 0, valid: false });
  const drag = useRef(null); // { x, y, moved } khi đang giữ chuột trái sau khi nhấc đồ
  const exited = useRef(false);
  const [level, setLevel] = useState(0);
  const [hover, setHover] = useState(null);
  const hoverRef = useRef(null);
  hoverRef.current = hover;
  const { gl, camera } = useThree();
  const latest = useRef();
  latest.current = { furniture, held, rotation, level, onPlace, onPick, onRotateHeld, onRotateItem, onBlocked, onExit };
  const keys = useKeys();

  useEffect(() => { onTarget?.(hover); }, [hover, onTarget]);
  useEffect(() => { onLevel?.(level); }, [level, onLevel]);
  useEffect(() => { if (held) setHover(null); }, [held]);
  // Đổi tầng → bỏ chọn món ở tầng cũ.
  useEffect(() => { setHover(null); }, [level]);
  // Món đang chọn được xoay / cập nhật → lấy bản mới nhất.
  useEffect(() => { setHover(h => (h ? furniture.find(f => f.id === h.id) || null : h)); }, [furniture]);

  useEffect(() => {
    const el = gl.domElement;
    const tryPlace = () => {
      const L = latest.current, s = spot.current;
      if (!L.held) return;
      if (s.valid) L.onPlace({ x: s.x, z: s.z, floor: L.level }); else L.onBlocked?.();
    };
    const pdown = e => {
      const L = latest.current;
      // Đang ngắm cảnh (chuột bị khoá) thì không thao tác đồ đạc.
      if (document.pointerLockElement) return;
      if (e.button === 0 && L.held && !drag.current) tryPlace();
      else if (e.button === 2) { if (L.held) L.onRotateHeld(); else if (hoverRef.current) L.onRotateItem(hoverRef.current); }
    };
    const pmove = e => { const d = drag.current; if (d && Math.hypot(e.clientX - d.x, e.clientY - d.y) > 6) d.moved = true; };
    // Thả chuột sau khi đã kéo → đặt món đồ tại chỗ thả.
    const pup = e => { const d = drag.current; if (e.button !== 0 || !d) return; drag.current = null; if (d.moved) tryPlace(); };
    const ctx = e => e.preventDefault();
    el.addEventListener('pointerdown', pdown); el.addEventListener('contextmenu', ctx);
    window.addEventListener('pointermove', pmove); window.addEventListener('pointerup', pup);
    return () => {
      el.removeEventListener('pointerdown', pdown); el.removeEventListener('contextmenu', ctx);
      window.removeEventListener('pointermove', pmove); window.removeEventListener('pointerup', pup);
      el.style.cursor = '';
    };
  }, [gl]);

  // Sự kiện R3F trên từng món đồ ở tầng đang đứng (raycast đúng hình dạng 3D, kể cả đồ cao như tủ sách).
  const itemEvents = item => ({
    onPointerOver: e => { e.stopPropagation(); if (!latest.current.held && !document.pointerLockElement) setHover(item); },
    onPointerOut: () => setHover(h => (h?.id === item.id ? null : h)),
    onPointerDown: e => {
      if (e.button !== 0 || latest.current.held || document.pointerLockElement) return;
      e.stopPropagation();
      drag.current = { x: e.nativeEvent.clientX, y: e.nativeEvent.clientY, moved: false };
      latest.current.onPick(item);
    },
  });

  useFrame((state, rawDt) => {
    const dt = Math.min(rawDt, 0.06), p = player.current, v = vel.current;
    const L = latest.current;
    if (p.y == null) { p.y = 0; p.level = 0; }
    const all = L.furniture.filter(f => f.id !== L.held?.id).map(f => ({ f, fl: floorOf(f), ...boxOf(f) }));
    const furnHit = (l, x, z) => all.some(b => b.fl === l && !b.rug && rectDist(x, z, b) < PLAYER_R);
    // Đang kẹt sẵn trong đồ đạc (vd. vừa đặt đồ lên chỗ đứng) thì bỏ qua đồ đạc để bước ra.
    const stuck = furnHit(p.level, p.x, p.z);
    // ---- Đi lại: chỉ bước tới chỗ có mặt sàn / bậc thang cao gần bằng chỗ đang đứng, không xuyên tường, đồ cố định, đồ đạc ----
    const hit = (x, z) => {
      const s = surfaceAt(x, z, p.y);
      if (!s) return true;
      return structureHit(s.level, x, z, PLAYER_R) || (!stuck && furnHit(s.level, x, z));
    };
    // Ngắm cảnh trên sân thượng: WASD đi theo hướng camera.
    stepWalker({ p, v, k: keys.current, yaw: view?.current.tp ? view.current.roomLook.yaw : null, dt, anim, walk: WALK, hit });
    const s = surfaceAt(p.x, p.z, p.y);
    if (s) { p.y = s.y; p.level = s.level; }
    avatar.current?.position.set(p.x, p.y, p.z);
    if (avatar.current) avatar.current.rotation.y = p.angle;
    if (p.level !== L.level) setLevel(p.level);
    // ---- Đi qua cửa: cửa chính → ra đường, cửa sau → ra sân vườn ----
    if (!exited.current && p.level === 0) {
      // Chỉ tính khi đang bước ra phía ngoài cửa.
      const out = p.z > DOORS.front.z + 0.25 && v.z > 0 ? 'world' : p.z < DOORS.back.z - 0.25 && v.z < 0 ? 'garden' : null;
      if (out) { exited.current = true; L.onExit?.(out); }
    }

    const cursor = L.held ? (drag.current ? 'grabbing' : 'move') : hoverRef.current ? 'grab' : 'default';
    if (gl.domElement.style.cursor !== cursor) gl.domElement.style.cursor = cursor;

    if (L.held) {
      // ---- Đang cầm đồ: món đồ bám theo con trỏ trên sàn tầng hiện tại, khớp lưới 0.5 m ----
      floorPlane.constant = -levelY(L.level);
      pickRay.setFromCamera(state.pointer, camera);
      if (!pickRay.ray.intersectPlane(floorPlane, floorHit)) return;
      const fp = footprint(L.held.kind, L.rotation);
      const sx = Math.round(floorHit.x * 2) / 2, sz = Math.round(floorHit.z * 2) / 2;
      const box = { x: sx, z: sz, ...fp, rug: L.held.kind === 'rug' };
      const valid = placementOk(L.level, box, box.rug) && !all.some(b => b.fl === L.level && b.rug === box.rug && overlap(box, b));
      spot.current = { x: sx, z: sz, valid };
      if (ghost.current) { ghost.current.position.set(sx, levelY(L.level), sz); ghost.current.rotation.y = L.rotation; }
      ghostRing.current?.material.color.set(valid ? '#5fbfae' : '#f2727a');
      if (targetRing.current) targetRing.current.visible = false;
      return;
    }
    // ---- Tay không: khung vuông quanh món đồ đang rê chuột ----
    const h = hoverRef.current, b = h && boxOf(h);
    if (targetRing.current) {
      targetRing.current.visible = !!b;
      if (b) { targetRing.current.position.set(b.x, levelY(floorOf(h)) + 0.04, b.z); targetRing.current.scale.set(b.hw + 0.2, b.hd + 0.2, 1); }
    }
  });

  return (
    <group>
      <House level={level} />
      {/* Đồ ở tầng trên tầng đang đứng bị ẩn; chỉ đồ ở tầng hiện tại mới chọn được */}
      {furniture.filter(item => item.id !== held?.id && floorOf(item) <= level).map(item => {
        const here = floorOf(item) === level;
        return (
          <group key={item.id} position={[Number(item.pos_x), levelY(floorOf(item)), Number(item.pos_z)]} rotation={[0, Number(item.rotation_y || 0), 0]}
            scale={hover?.id === item.id ? 1.05 : 1} {...(here ? itemEvents(item) : {})}>
            <FurnitureModel kind={item.kind} />
          </group>
        );
      })}
      {/* Khung vuông đánh dấu món đồ đang chọn */}
      <mesh ref={targetRing} geometry={squareRing} rotation={[-Math.PI / 2, 0, 0]} visible={false} raycast={() => null}>
        <meshBasicMaterial color="#5fbfae" transparent opacity={0.9} depthWrite={false} />
      </mesh>
      {held && (
        <group ref={ghost}>
          <GhostCtx.Provider value={true}><FurnitureModel kind={held.kind} ghost /></GhostCtx.Provider>
          <mesh ref={ghostRing} position={[0, 0.03, 0]} rotation={[-Math.PI / 2, 0, 0]}><ringGeometry args={[0.85, 1, 32]} /><meshBasicMaterial color="#5fbfae" transparent opacity={0.8} depthWrite={false} /></mesh>
        </group>
      )}
      <group ref={avatar}>
        <Avatar anim={anim} shirt={shirtColor(me?.id)} hair={hairColor(me?.id)} name={me?.display_name} />
      </group>
      {/* Mochi nằm chờ trên ổ của mình ở phòng khách */}
      <Puppy position={[DOG_BED.x, 0.12, DOG_BED.z]} rotation={-0.6} />
    </group>
  );
}

export { LEVEL_NAME, roomOf };
