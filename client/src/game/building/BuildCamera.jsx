// Camera Build Mode: nhìn từ trên xuống / isometric quanh lô đất, con trỏ chuột hiện bình thường.
//   Cuộn chuột: zoom · kéo chuột phải: xoay (ngang) + nghiêng (dọc) · Q / E: xoay 45°
//   kéo chuột giữa hoặc Shift + kéo chuột phải: di chuyển (pan) · WASD / mũi tên: pan · R: về góc nhìn mặc định
// Điểm nhìn bị giới hạn quanh lô đất; khoảng cách và góc nghiêng có giới hạn. Không đụng tới camera / controls cũ:
// Game.jsx chỉ gắn component này khi đang ở Build Mode (camera thường bị tắt).
import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { buildPlaneY, plotFrame, plotLocalToWorld } from './buildingUtils.js';
import { useBuildingStore } from './buildingStore.js';

const PITCH = [0.5, 1.45];
const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
const tmp = new THREE.Vector3();

export function BuildCamera({ plot }) {
  const { camera, gl } = useThree();
  const st = useRef(null);
  const keys = useRef({});
  const f = plotFrame(plot), size = Math.max(f.width, f.length);
  const distRange = [size * 0.45 + 4, size * 2.2 + 10];
  const limit = { x: f.width / 2 + 3, z: f.length / 2 + 3 };

  const defaults = () => ({ tx: 0, tz: 0, yaw: f.rot + 0.6, pitch: 0.95, dist: size * 1.25 + 8 });
  if (!st.current) {
    // Bắt đầu từ đúng vị trí camera hiện tại (không giật), rồi trượt dần tới góc nhìn xây dựng.
    const want = defaults();
    const T = plotLocalToWorld(plot, 0, 0, 0), dx = camera.position.x - T.x, dy = camera.position.y - T.y, dz = camera.position.z - T.z;
    const d = Math.max(1, Math.hypot(dx, dy, dz));
    st.current = { want, cur: { tx: 0, tz: 0, yaw: Math.atan2(dx, dz), pitch: THREE.MathUtils.clamp(Math.asin(dy / d), 0.05, PITCH[1]), dist: d } };
  }

  useEffect(() => {
    const el = gl.domElement, s = st.current;
    let drag = null;
    const clampTarget = () => {
      s.want.tx = THREE.MathUtils.clamp(s.want.tx, -limit.x, limit.x);
      s.want.tz = THREE.MathUtils.clamp(s.want.tz, -limit.z, limit.z);
    };
    // Pan theo hướng màn hình: (sx sang phải, sz lùi ra xa camera) → đổi sang toạ độ local của lô.
    const pan = (sx, sz) => {
      const y = s.want.yaw, wx = Math.cos(y) * sx + Math.sin(y) * sz, wz = -Math.sin(y) * sx + Math.cos(y) * sz;
      const c = Math.cos(f.rot), sn = Math.sin(f.rot);
      s.want.tx += wx * c - wz * sn; s.want.tz += wx * sn + wz * c;
      clampTarget();
    };
    const wheel = e => { e.preventDefault(); s.want.dist = THREE.MathUtils.clamp(s.want.dist * (e.deltaY > 0 ? 1.1 : 0.9), distRange[0], distRange[1]); };
    const down = e => {
      if (e.button === 1 || (e.button === 2 && e.shiftKey)) { drag = { mode: 'pan', x: e.clientX, y: e.clientY }; e.preventDefault(); }
      else if (e.button === 2) drag = { mode: 'orbit', x: e.clientX, y: e.clientY };
      if (drag) el.setPointerCapture?.(e.pointerId);
    };
    const move = e => {
      if (!drag) return;
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      drag.x = e.clientX; drag.y = e.clientY;
      if (drag.mode === 'orbit') {
        s.want.yaw -= dx * 0.006;
        s.want.pitch = THREE.MathUtils.clamp(s.want.pitch + dy * 0.004, PITCH[0], PITCH[1]);
      } else {
        const k = s.cur.dist * 0.0016;
        pan(-dx * k, -dy * k);
      }
    };
    const up = e => { if (drag) { drag = null; el.releasePointerCapture?.(e.pointerId); } };
    const ctx = e => e.preventDefault();
    const kd = e => {
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName) || e.ctrlKey || e.metaKey) return;
      keys.current[e.code] = true;
      if (e.code === 'KeyQ') s.want.yaw += Math.PI / 4;
      if (e.code === 'KeyE') s.want.yaw -= Math.PI / 4;
      if (e.code === 'KeyR' && !useBuildingStore.getState().selectedObjectId) Object.assign(s.want, defaults());
      if (e.code.startsWith('Arrow')) e.preventDefault();
    };
    const ku = e => { keys.current[e.code] = false; };
    const blur = () => { keys.current = {}; };
    el.addEventListener('wheel', wheel, { passive: false });
    el.addEventListener('pointerdown', down);
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
    el.addEventListener('contextmenu', ctx);
    window.addEventListener('keydown', kd); window.addEventListener('keyup', ku); window.addEventListener('blur', blur);
    s.pan = pan;
    return () => {
      el.removeEventListener('wheel', wheel);
      el.removeEventListener('pointerdown', down);
      window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up);
      el.removeEventListener('contextmenu', ctx);
      window.removeEventListener('keydown', kd); window.removeEventListener('keyup', ku); window.removeEventListener('blur', blur);
    };
  }, [gl, plot]); // eslint-disable-line react-hooks/exhaustive-deps

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.06), s = st.current, k = keys.current;
    // WASD / mũi tên: pan (tốc độ tỉ lệ với độ zoom).
    const ix = Number(!!(k.KeyD || k.ArrowRight)) - Number(!!(k.KeyA || k.ArrowLeft));
    const iz = Number(!!(k.KeyS || k.ArrowDown)) - Number(!!(k.KeyW || k.ArrowUp));
    if ((ix || iz) && s.pan) s.pan(ix * s.cur.dist * 0.9 * dt, iz * s.cur.dist * 0.9 * dt);
    const a = 1 - Math.exp(-7 * dt);
    s.cur.tx += (s.want.tx - s.cur.tx) * a; s.cur.tz += (s.want.tz - s.cur.tz) * a;
    s.cur.yaw += wrap(s.want.yaw - s.cur.yaw) * a;
    s.cur.pitch += (s.want.pitch - s.cur.pitch) * a;
    s.cur.dist += (s.want.dist - s.cur.dist) * a;
    const bs = useBuildingStore.getState(), floorY = buildPlaneY(plot, bs.activeFloor, bs.design.levels) - plotFrame(plot).y;
    const T0 = plotLocalToWorld(plot, s.cur.tx, floorY, s.cur.tz);
    const h = Math.cos(s.cur.pitch) * s.cur.dist;
    // Dịch điểm nhìn về phía camera một chút → lô đất nằm cao hơn thanh công cụ ở dưới màn hình.
    const shift = h * 0.16, T = { x: T0.x + Math.sin(s.cur.yaw) * shift, y: T0.y, z: T0.z + Math.cos(s.cur.yaw) * shift };
    camera.position.set(T.x + Math.sin(s.cur.yaw) * h, T.y + Math.sin(s.cur.pitch) * s.cur.dist, T.z + Math.cos(s.cur.yaw) * h);
    camera.lookAt(tmp.set(T.x, T.y, T.z));
    if (Math.abs(camera.fov - 45) > 0.05) { camera.fov += (45 - camera.fov) * Math.min(1, dt * 5); camera.updateProjectionMatrix(); }
  });
  return null;
}
