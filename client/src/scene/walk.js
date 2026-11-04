// Điều khiển đi bộ dùng chung cho các cảnh nhỏ (trong nhà, sân vườn):
// WASD/mũi tên, chuột trái/phải gọi onButton, góc nhìn thứ 3 khoá chuột và di chuột để nhìn quanh.
import { useEffect, useRef } from 'react';

export const clamp = (v, a, b) => (a > b ? (a + b) / 2 : Math.max(a, Math.min(b, v)));

export function useWalkControls(gl, view, onButton) {
  const keys = useRef({});
  const btn = useRef(onButton);
  btn.current = onButton;
  useEffect(() => {
    const el = gl.domElement;
    const k = keys.current;
    const down = e => { if (['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)) return; k[e.code] = true; if (e.code.startsWith('Arrow')) e.preventDefault(); };
    const up = e => { k[e.code] = false; };
    const blur = () => Object.keys(k).forEach(c => delete k[c]);
    const pdown = e => {
      if (view.current.tp && document.pointerLockElement !== el) el.requestPointerLock?.()?.catch?.(() => {});
      btn.current?.(e.button);
    };
    const ctx = e => e.preventDefault();
    const look = e => {
      const vw = view.current;
      if (!vw.tp || document.pointerLockElement !== el || vw.rYaw == null) return;
      vw.rYaw -= e.movementX * 0.004;
      vw.rPitch = Math.max(0.05, Math.min(1.1, vw.rPitch + e.movementY * 0.003));
    };
    el.style.cursor = 'none';
    el.addEventListener('mousemove', look);
    window.addEventListener('keydown', down); window.addEventListener('keyup', up); window.addEventListener('blur', blur);
    el.addEventListener('pointerdown', pdown); el.addEventListener('contextmenu', ctx);
    return () => {
      el.style.cursor = '';
      window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); window.removeEventListener('blur', blur);
      el.removeEventListener('pointerdown', pdown); el.removeEventListener('contextmenu', ctx); el.removeEventListener('mousemove', look);
      if (document.pointerLockElement === el) document.exitPointerLock?.();
    };
  }, [gl, view]);
  return keys;
}

// Một bước di chuyển có quán tính, trượt dọc vật cản. hit(x, z) → true nếu vị trí bị chặn; walk = vùng đi được.
export function stepWalker({ p, v, k, view, dt, hit, walk, anim, speed: sp = 3.2 }) {
  const ix = Number(!!(k.KeyD || k.ArrowRight)) - Number(!!(k.KeyA || k.ArrowLeft));
  const iz = Number(!!(k.KeyS || k.ArrowDown)) - Number(!!(k.KeyW || k.ArrowUp));
  const run = !!(k.ShiftLeft || k.ShiftRight);
  const l = Math.hypot(ix, iz) || 1, max = run ? sp * 1.7 : sp;
  // Góc nhìn thứ 3: hướng phím theo camera (W = tiến về phía trước camera).
  const ry = view.current.tp && view.current.rYaw != null ? view.current.rYaw : 0;
  const rc = Math.cos(ry), rs = Math.sin(ry);
  const wx = (ix * rc + iz * rs) / l, wz = (iz * rc - ix * rs) / l;
  v.x += (wx * max - v.x) * Math.min(1, dt * 14);
  v.z += (wz * max - v.z) * Math.min(1, dt * 14);
  const speed = Math.hypot(v.x, v.z);
  p.speed = speed; p.forward = iz < 0;
  anim.current.moving = speed > 0.3;
  anim.current.run = run && speed > sp * 1.2;
  if (speed > 0.05) {
    const nx = clamp(p.x + v.x * dt, walk.x0, walk.x1), nz = clamp(p.z + v.z * dt, walk.z0, walk.z1);
    // Đang kẹt sẵn trong vật cản thì cho đi tự do để thoát ra.
    const stuck = hit(p.x, p.z), ok = (x, z) => stuck || !hit(x, z);
    if (ok(nx, nz)) { p.x = nx; p.z = nz; } else if (ok(nx, p.z)) { p.x = nx; v.z *= 0.2; } else if (ok(p.x, nz)) { p.z = nz; v.x *= 0.2; } else { v.x *= 0.2; v.z *= 0.2; }
    let diff = Math.atan2(v.x, v.z) - p.angle; diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    p.angle += diff * Math.min(1, dt * 12);
  } else { v.x = 0; v.z = 0; }
}
