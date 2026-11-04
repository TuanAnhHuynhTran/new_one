import React, { useEffect, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { RoundedBox } from '@react-three/drei';
import { Mat, ScreenLabel } from './kit.jsx';

const SKIN = '#ffd9bd';

// Nhân vật chibi, mặt hướng +Z. anim.current = { moving, run } điều khiển animation đi/chạy.
export function Avatar({ anim, shirt = '#5aa9e6', pants = '#3f4c6b', hair = '#6b4a3a', name }) {
  const body = useRef(), legL = useRef(), legR = useRef(), armL = useRef(), armR = useRef(), head = useRef();
  const phase = useRef(0);
  useFrame(({ clock }, dt) => {
    const a = anim?.current || {};
    const speed = a.moving ? (a.run ? 15 : 10) : 0;
    phase.current += dt * speed;
    const amp = a.moving ? (a.run ? 0.95 : 0.65) : 0;
    const sw = Math.sin(phase.current) * amp;
    const k = Math.min(1, dt * 14);
    const lerp = (ref, v) => { if (ref.current) ref.current.rotation.x += (v - ref.current.rotation.x) * k; };
    lerp(legL, sw); lerp(legR, -sw); lerp(armL, -sw * 0.8); lerp(armR, sw * 0.8);
    if (body.current) body.current.position.y = a.moving ? Math.abs(Math.sin(phase.current)) * 0.1 : Math.sin(clock.elapsedTime * 2.2) * 0.025;
    if (head.current) head.current.rotation.z = a.moving ? 0 : Math.sin(clock.elapsedTime * 0.9) * 0.05;
  });
  return (
    <group>
      <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}><circleGeometry args={[0.55, 20]} /><meshBasicMaterial color="#000" transparent opacity={0.12} depthWrite={false} /></mesh>
      <group ref={body}>
        {[[legL, -0.19], [legR, 0.19]].map(([ref, x]) => (
          <group key={x} ref={ref} position={[x, 0.78, 0]}>
            <mesh position={[0, -0.32, 0]} castShadow><capsuleGeometry args={[0.13, 0.36, 4, 10]} /><Mat color={SKIN} /></mesh>
            <RoundedBox args={[0.3, 0.2, 0.42]} radius={0.08} position={[0, -0.66, 0.06]} castShadow><Mat color="#ffffff" /></RoundedBox>
            <mesh position={[0, -0.7, 0.06]}><boxGeometry args={[0.31, 0.05, 0.43]} /><Mat color="#e8524a" /></mesh>
          </group>
        ))}
        <RoundedBox args={[0.66, 0.34, 0.44]} radius={0.12} position={[0, 0.86, 0]} castShadow><Mat color={pants} /></RoundedBox>
        <RoundedBox args={[0.7, 0.62, 0.46]} radius={0.18} position={[0, 1.27, 0]} castShadow><Mat color={shirt} /></RoundedBox>
        <mesh position={[0, 1.32, 0.235]}><circleGeometry args={[0.12, 16]} /><Mat color="#ffffff" /></mesh>
        {[[armL, -0.45], [armR, 0.45]].map(([ref, x]) => (
          <group key={x} ref={ref} position={[x, 1.48, 0]}>
            <mesh position={[0, -0.08, 0]} castShadow><sphereGeometry args={[0.15, 10, 8]} /><Mat color={shirt} /></mesh>
            <mesh position={[0, -0.32, 0]} castShadow><capsuleGeometry args={[0.1, 0.3, 4, 8]} /><Mat color={SKIN} /></mesh>
          </group>
        ))}
        <group ref={head} position={[0, 2.08, 0]}>
          <mesh castShadow><sphereGeometry args={[0.56, 24, 18]} /><Mat color={SKIN} rough={0.6} /></mesh>
          <mesh position={[0, 0.14, -0.06]} scale={[1.06, 0.9, 1.04]} castShadow><sphereGeometry args={[0.57, 20, 14, 0, Math.PI * 2, 0, Math.PI * 0.58]} /><Mat color={hair} rough={0.7} /></mesh>
          <mesh position={[0, 0.3, 0.38]} rotation={[0.5, 0, 0]} scale={[1, 0.45, 0.6]}><sphereGeometry args={[0.38, 14, 10]} /><Mat color={hair} rough={0.7} /></mesh>
          {[-0.19, 0.19].map(x => (
            <group key={x} position={[x, -0.03, 0.5]}>
              <mesh scale={[1, 1.35, 0.6]}><sphereGeometry args={[0.075, 12, 10]} /><Mat color="#2b2320" rough={0.3} /></mesh>
              <mesh position={[0.025, 0.04, 0.04]}><sphereGeometry args={[0.022, 8, 6]} /><meshBasicMaterial color="#ffffff" /></mesh>
              <mesh position={[x * 0.55, -0.15, -0.04]} scale={[1, 0.6, 0.3]}><sphereGeometry args={[0.09, 10, 8]} /><Mat color="#ff9e9e" transparent opacity={0.75} /></mesh>
            </group>
          ))}
          <mesh position={[0, -0.2, 0.52]} rotation={[0, 0, Math.PI]}><torusGeometry args={[0.06, 0.018, 6, 12, Math.PI]} /><Mat color="#8a4b3e" /></mesh>
          {[-0.55, 0.55].map(x => <mesh key={x} position={[x, -0.02, 0]}><sphereGeometry args={[0.11, 10, 8]} /><Mat color={SKIN} /></mesh>)}
        </group>
      </group>
      {name && <ScreenLabel position={[0, 3.1, 0]} className="name-tag" text={name} />}
    </group>
  );
}

// Chú chó Mochi. Có player → đi theo; không có → đứng tại chỗ vẫy đuôi (dùng ở màn đăng nhập).
export function Puppy({ player, feedTick = 0, position = [0, 0, 0], rotation = 0, bounds }) {
  const root = useRef(), body = useRef(), tail = useRef(), head = useRef(), legs = useRef([]);
  const state = useRef({ init: false, hop: 0, phase: 0, yaw: rotation });
  const [hearts, setHearts] = useState(false);
  useEffect(() => {
    if (!feedTick) return;
    state.current.hop = 1; setHearts(true);
    const id = setTimeout(() => setHearts(false), 1800);
    return () => clearTimeout(id);
  }, [feedTick]);
  useFrame(({ clock }, dt) => {
    const s = state.current, g = root.current;
    if (!g) return;
    dt = Math.min(dt, 0.05);
    let moving = false;
    if (player) {
      const p = player.current;
      // Đi bên cạnh (phía tay phải, lùi nửa bước) để không chắn camera ở góc nhìn thứ 3.
      const fa = p.angle || 0, fx = Math.sin(fa), fz = Math.cos(fa);
      let tx = p.x - fz * 1.4 - fx * 0.5, tz = p.z + fx * 1.4 - fz * 0.5;
      // Trong phòng: giữ Mochi trong sàn nhà (đứng phía bên kia nếu sát tường).
      if (bounds) { if (tx > bounds.x1 || tx < bounds.x0) tx = 2 * p.x - tx; if (tz > bounds.z1 || tz < bounds.z0) tz = 2 * p.z - tz; tx = Math.max(bounds.x0, Math.min(bounds.x1, tx)); tz = Math.max(bounds.z0, Math.min(bounds.z1, tz)); }
      if (!s.init) { g.position.set(tx, 0, tz); s.init = true; }
      const dx = tx - g.position.x, dz = tz - g.position.z, d = Math.hypot(dx, dz);
      if (d > 1.2) {
        const step = Math.min(d - 1.1, (d > 6 ? 11 : 6.5) * dt);
        g.position.x += (dx / d) * step; g.position.z += (dz / d) * step;
        moving = true;
        const yaw = Math.atan2(dx, dz);
        let diff = yaw - s.yaw; diff = Math.atan2(Math.sin(diff), Math.cos(diff));
        s.yaw += diff * Math.min(1, dt * 8);
      }
      g.rotation.y = s.yaw;
    }
    s.phase += dt * (moving ? 16 : 0);
    legs.current.forEach((l, i) => { if (l) l.rotation.x = moving ? Math.sin(s.phase + (i % 2 ? Math.PI : 0) + (i > 1 ? Math.PI : 0)) * 0.6 : 0; });
    const t = clock.elapsedTime;
    if (tail.current) tail.current.rotation.z = Math.sin(t * (moving || s.hop > 0 ? 22 : 9)) * 0.55;
    if (head.current) head.current.rotation.x = moving ? 0 : Math.sin(t * 1.4) * 0.06;
    let y = moving ? Math.abs(Math.sin(s.phase)) * 0.06 : 0;
    if (s.hop > 0) { y += Math.sin((1 - s.hop) * Math.PI) * 0.9; s.hop = Math.max(0, s.hop - dt * 1.4); }
    if (body.current) body.current.position.y = y;
  });
  const cream = '#fff4e6', orange = '#f0a347';
  return (
    <group ref={root} position={position} rotation={[0, rotation, 0]}>
      <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]} scale={[0.8, 1.1, 1]}><circleGeometry args={[0.55, 20]} /><meshBasicMaterial color="#000" transparent opacity={0.12} depthWrite={false} /></mesh>
      <group ref={body}>
        {[[-0.22, 0.3], [0.22, 0.3], [-0.22, -0.3], [0.22, -0.3]].map(([x, z], i) => (
          <group key={i} ref={el => (legs.current[i] = el)} position={[x, 0.36, z]}>
            <mesh position={[0, -0.18, 0]} castShadow><capsuleGeometry args={[0.09, 0.2, 4, 8]} /><Mat color={cream} /></mesh>
          </group>
        ))}
        <mesh position={[0, 0.55, 0]} scale={[0.5, 0.45, 0.68]} castShadow><sphereGeometry args={[1, 20, 16]} /><Mat color={cream} rough={0.9} /></mesh>
        <mesh position={[0.05, 0.78, -0.1]} scale={[0.42, 0.3, 0.45]}><sphereGeometry args={[1, 16, 12]} /><Mat color={orange} rough={0.9} /></mesh>
        <mesh position={[0, 0.82, 0.42]} rotation={[Math.PI / 2 - 0.3, 0, 0]}><torusGeometry args={[0.26, 0.055, 8, 20]} /><Mat color="#e8524a" /></mesh>
        <mesh position={[0, 0.7, 0.64]}><sphereGeometry args={[0.06, 8, 6]} /><Mat color="#f6c453" metal={0.4} rough={0.3} /></mesh>
        <group ref={head} position={[0, 1.0, 0.55]}>
          <mesh castShadow><sphereGeometry args={[0.42, 20, 16]} /><Mat color={cream} rough={0.9} /></mesh>
          <mesh position={[0.14, 0.14, 0.12]} scale={[0.25, 0.26, 0.3]}><sphereGeometry args={[1, 14, 10]} /><Mat color={orange} rough={0.9} /></mesh>
          {[-1, 1].map(s => (
            <mesh key={s} position={[s * 0.36, 0.06, -0.02]} rotation={[0, 0, s * 0.35]} scale={[0.13, 0.3, 0.2]} castShadow><sphereGeometry args={[1, 12, 10]} /><Mat color={orange} rough={0.9} /></mesh>
          ))}
          <mesh position={[0, -0.1, 0.33]} scale={[0.22, 0.16, 0.18]}><sphereGeometry args={[1, 14, 10]} /><Mat color="#ffffff" rough={0.9} /></mesh>
          <mesh position={[0, -0.04, 0.5]}><sphereGeometry args={[0.065, 10, 8]} /><Mat color="#2b2320" rough={0.3} /></mesh>
          {[-0.15, 0.15].map(x => (
            <mesh key={x} position={[x, 0.07, 0.36]} scale={[1, 1.2, 0.6]}><sphereGeometry args={[0.055, 10, 8]} /><Mat color="#2b2320" rough={0.3} /></mesh>
          ))}
          <mesh position={[0, -0.2, 0.36]} rotation={[0.3, 0, 0]} scale={[0.07, 0.05, 0.05]}><sphereGeometry args={[1, 8, 6]} /><Mat color="#f2727a" /></mesh>
        </group>
        <group ref={tail} position={[0, 0.78, -0.62]}>
          <mesh position={[0, 0.18, -0.08]} rotation={[-0.5, 0, 0]} castShadow><capsuleGeometry args={[0.07, 0.3, 4, 8]} /><Mat color={orange} /></mesh>
        </group>
      </group>
      {hearts && <ScreenLabel position={[0, 2, 0]} className="pet-hearts" text="❤️💛❤️" />}
    </group>
  );
}

export const shirtColor = id => ['#5aa9e6', '#f2727a', '#5fbf8f', '#f6c453', '#a58be0', '#ff9f6b'][Math.abs(Number(id) || 0) % 6];
export const hairColor = id => ['#6b4a3a', '#3a2c28', '#c98b4f', '#8a5a3c', '#e0b36a'][Math.abs(Number(id) * 7 || 0) % 5];
