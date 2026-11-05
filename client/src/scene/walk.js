// Điều khiển đi bộ dùng chung cho các cảnh nhỏ (trong nhà, sân vườn): WASD / mũi tên, Shift chạy.
import { useEffect, useRef } from 'react';
import { isLocked } from './controls.js';

export const clamp = (v, a, b) => (a > b ? (a + b) / 2 : Math.max(a, Math.min(b, v)));

// Trạng thái phím đang giữ. Mất focus / đổi tab → nhả hết phím để nhân vật không tự chạy.
export function useKeys() {
  const keys = useRef({});
  useEffect(() => {
    const k = keys.current;
    const down = e => { if (['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)) return; k[e.code] = true; if (e.code.startsWith('Arrow') || e.code === 'Space') e.preventDefault(); };
    const up = e => { k[e.code] = false; };
    const clear = () => Object.keys(k).forEach(c => delete k[c]);
    const vis = () => { if (document.visibilityState === 'hidden') clear(); };
    window.addEventListener('keydown', down); window.addEventListener('keyup', up); window.addEventListener('blur', clear);
    document.addEventListener('visibilitychange', vis);
    return () => {
      window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); window.removeEventListener('blur', clear);
      document.removeEventListener('visibilitychange', vis);
      clear();
    };
  }, []);
  return keys;
}

// Phím + nút chuột cho cảnh đi bộ (sân vườn). Ở góc nhìn thứ 3, cú click đầu tiên chỉ để khoá chuột,
// các nút chuột chỉ được xử lý khi chuột đã khoá. Luôn chặn menu chuột phải.
export function useWalkControls(gl, view, onButton) {
  const keys = useKeys();
  const btn = useRef(onButton);
  btn.current = onButton;
  useEffect(() => {
    const el = gl.domElement;
    const pdown = e => { if (!view.current.tp || isLocked(el)) btn.current?.(e.button); };
    const ctx = e => e.preventDefault();
    el.addEventListener('pointerdown', pdown); el.addEventListener('contextmenu', ctx);
    return () => { el.removeEventListener('pointerdown', pdown); el.removeEventListener('contextmenu', ctx); };
  }, [gl, view]);
  return keys;
}

// Một bước di chuyển có quán tính, trượt dọc vật cản. hit(x, z) → true nếu vị trí bị chặn; walk = vùng đi được.
// yaw: hướng camera (góc nhìn thứ 3) để W luôn là "tiến về phía trước camera"; null = theo trục thế giới.
export function stepWalker({ p, v, k, yaw = null, dt, hit, walk, anim, speed: sp = 3.2 }) {
  const ix = Number(!!(k.KeyD || k.ArrowRight)) - Number(!!(k.KeyA || k.ArrowLeft));
  const iz = Number(!!(k.KeyS || k.ArrowDown)) - Number(!!(k.KeyW || k.ArrowUp));
  const run = !!(k.ShiftLeft || k.ShiftRight);
  // Chuẩn hoá vector chéo (W+D...) để đi chéo không nhanh hơn đi thẳng.
  const l = Math.hypot(ix, iz) || 1, max = run ? sp * 1.7 : sp;
  const ry = yaw ?? 0, rc = Math.cos(ry), rs = Math.sin(ry);
  const wx = (ix * rc + iz * rs) / l, wz = (iz * rc - ix * rs) / l;
  const a = 1 - Math.exp(-14 * dt);
  v.x += (wx * max - v.x) * a;
  v.z += (wz * max - v.z) * a;
  const speed = Math.hypot(v.x, v.z);
  p.speed = speed; p.forward = iz < 0;
  anim.current.moving = speed > 0.3;
  anim.current.run = run && speed > sp * 1.2;
  if (speed > 0.05) {
    const nx = clamp(p.x + v.x * dt, walk.x0, walk.x1), nz = clamp(p.z + v.z * dt, walk.z0, walk.z1);
    // Đang kẹt sẵn trong vật cản thì cho đi tự do để thoát ra.
    const stuck = hit(p.x, p.z), ok = (x, z) => stuck || !hit(x, z);
    if (ok(nx, nz)) { p.x = nx; p.z = nz; } else if (ok(nx, p.z)) { p.x = nx; v.z *= 0.2; } else if (ok(p.x, nz)) { p.z = nz; v.x *= 0.2; } else { v.x *= 0.2; v.z *= 0.2; }
    // Nhân vật xoay mượt theo hướng di chuyển.
    let diff = Math.atan2(v.x, v.z) - p.angle; diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    p.angle += diff * Math.min(1, dt * 12);
  } else { v.x = 0; v.z = 0; }
}
