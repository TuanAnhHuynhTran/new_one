// Điều khiển camera kiểu TPS: khoá chuột (Pointer Lock API) + Mouse Look + camera bám sau nhân vật.
// Camera chỉ xoay khi chuột đang bị khoá; không có cơ chế kéo chuột phải / tự quay nào khác.
import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { lerpFov, makeFader } from './kit.jsx';

const DEG = Math.PI / 180;
// pitch > 0: camera ở trên cao nhìn xuống; pitch < 0: camera hạ thấp, ngửa lên trời.
export const PITCH_MIN = -60 * DEG, PITCH_MAX = 70 * DEG;
// Radian / pixel ở độ nhạy 1.0.
const BASE_SENS = 0.0024;
// Bỏ qua các cú nhảy movementX/Y bất thường (Chrome đôi khi bắn ra ngay sau khi khoá chuột).
const MAX_STEP = 220;

export const isLocked = el => !!el && document.pointerLockElement === el;
export const exitPointerLock = () => { if (document.pointerLockElement) document.exitPointerLock?.(); };
// Trạng thái góc nhìn: yaw/pitch = góc người chơi muốn (đổi ngay theo chuột), cy/cp = góc camera đang có (nội suy dần tới).
export const newLook = (pitch = 0.3) => ({ yaw: null, pitch, cy: null, cp: pitch });

let lastUnlock = 0;
if (typeof document !== 'undefined') {
  document.addEventListener('pointerlockchange', () => { if (!document.pointerLockElement) lastUnlock = performance.now(); });
}
// Esc vừa dùng để thả chuột thì không xử lý tiếp như phím "thoát" của game.
export const justUnlocked = () => performance.now() - lastUnlock < 250;

// Dùng ngoài Canvas (giao diện): chuột có đang khoá không, lần khoá gần nhất có bị trình duyệt từ chối không.
export function usePointerLockState() {
  const [state, setState] = useState({ locked: !!document.pointerLockElement, error: false });
  useEffect(() => {
    const change = () => setState({ locked: !!document.pointerLockElement, error: false });
    const error = () => setState(s => ({ ...s, error: true }));
    document.addEventListener('pointerlockchange', change);
    document.addEventListener('pointerlockerror', error);
    return () => { document.removeEventListener('pointerlockchange', change); document.removeEventListener('pointerlockerror', error); };
  }, []);
  return state;
}

// Trong Canvas: khi enabled, click (thao tác trực tiếp của người chơi — trình duyệt bắt buộc) vào khung 3D để khoá chuột.
// enabled = false (vào chế độ trang trí, mở menu, tắt góc nhìn thứ 3) → thả chuột ngay.
export function usePointerLock(enabled) {
  const { gl } = useThree();
  useEffect(() => {
    const el = gl.domElement;
    if (!enabled) { if (isLocked(el)) document.exitPointerLock?.(); return undefined; }
    const pdown = e => {
      if (isLocked(el) || (e.button !== 0 && e.button !== 2)) return;
      try {
        // Chrome/Edge trả về Promise; bị từ chối (vd. click lại quá nhanh sau Esc) thì pointerlockerror sẽ báo lên giao diện.
        el.requestPointerLock?.()?.catch?.(() => {});
      } catch { /* trình duyệt không hỗ trợ */ }
    };
    el.addEventListener('pointerdown', pdown);
    return () => { el.removeEventListener('pointerdown', pdown); if (isLocked(el)) document.exitPointerLock?.(); };
  }, [gl, enabled]);
}

// Mouse Look: movementX/Y của mousemove → yaw/pitch, chỉ khi chuột đang khoá vào canvas.
// getLook() trả về object góc nhìn đang dùng; getSettings() → { sens, invertY }.
export function useMouseLook(enabled, getLook, getSettings) {
  const { gl } = useThree();
  const fns = useRef({ getLook, getSettings });
  fns.current = { getLook, getSettings };
  useEffect(() => {
    if (!enabled) return undefined;
    const el = gl.domElement;
    let skip = false;
    const lockChange = () => { skip = isLocked(el); };
    const move = e => {
      if (!isLocked(el)) return;
      if (skip) { skip = false; return; }
      const look = fns.current.getLook(), { sens = 1, invertY = false } = fns.current.getSettings() || {};
      if (!look || look.yaw == null) return;
      const mx = THREE.MathUtils.clamp(e.movementX || 0, -MAX_STEP, MAX_STEP), my = THREE.MathUtils.clamp(e.movementY || 0, -MAX_STEP, MAX_STEP);
      const k = BASE_SENS * sens;
      look.yaw -= mx * k;
      look.pitch = THREE.MathUtils.clamp(look.pitch + (invertY ? -my : my) * k * 0.8, PITCH_MIN, PITCH_MAX);
    };
    document.addEventListener('pointerlockchange', lockChange);
    document.addEventListener('mousemove', move);
    return () => { document.removeEventListener('pointerlockchange', lockChange); document.removeEventListener('mousemove', move); };
  }, [gl, enabled]);
}

const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));

// Camera góc nhìn thứ 3 bám theo target (ref { x, z, angle }).
// Góc nhìn và điểm bám đều được nội suy theo thời gian (không phụ thuộc FPS), camera luôn nằm đúng trên quỹ đạo quanh nhân vật.
export function ThirdPersonCamera({ target, look, dist = 6, height = 1.75, fov = 58, minY = 0.3, zoomRange = [0.55, 1.7] }) {
  const { camera, gl } = useThree();
  const zoom = useRef(1);
  const fader = useMemo(() => makeFader(), []);
  const focus = useMemo(() => new THREE.Vector3(), []), head = useMemo(() => new THREE.Vector3(), []);
  const orbit = useMemo(() => new THREE.Vector3(), []), start = useMemo(() => new THREE.Vector3(), []);
  const first = useRef(true), intro = useRef(1);
  useEffect(() => {
    const el = gl.domElement;
    const wheel = e => { e.preventDefault(); zoom.current = THREE.MathUtils.clamp(zoom.current * (e.deltaY > 0 ? 1.08 : 0.92), zoomRange[0], zoomRange[1]); };
    el.addEventListener('wheel', wheel, { passive: false });
    return () => { el.removeEventListener('wheel', wheel); fader.clear(); };
  }, [gl, fader]); // eslint-disable-line react-hooks/exhaustive-deps
  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.06), p = target.current, L = look, base = p.y || 0;
    if (L.yaw == null) L.yaw = p.angle + Math.PI;
    if (L.cy == null || first.current) { L.cy = L.yaw; L.cp = L.pitch; }
    const ka = 1 - Math.exp(-18 * dt), kf = 1 - Math.exp(-12 * dt);
    L.cy += wrap(L.yaw - L.cy) * ka;
    L.cp += (L.pitch - L.cp) * ka;
    if (first.current) {
      focus.set(p.x, base + height, p.z);
      // Camera đang ở gần (đổi góc nhìn trong cùng cảnh) → lướt mượt tới vị trí mới thay vì nhảy.
      start.copy(camera.position);
      intro.current = camera.position.distanceTo(focus) < 45 ? 0 : 1;
    } else focus.lerp(head.set(p.x, base + height, p.z), kf);
    first.current = false;
    const d = dist * zoom.current;
    let up = Math.sin(L.cp) * d, hh = Math.cos(L.cp) * d;
    // Ngửa lên trời: không cho camera chui xuống đất, kéo camera lại gần nhân vật.
    if (focus.y + up < base + minY) { const s = (focus.y - base - minY) / -up; up *= s; hh *= s; }
    orbit.set(focus.x + Math.sin(L.cy) * hh, focus.y + up, focus.z + Math.cos(L.cy) * hh);
    if (intro.current < 1) {
      intro.current = Math.min(1, intro.current + dt / 0.7);
      const e = 1 - (1 - intro.current) ** 3;
      camera.position.lerpVectors(start, orbit, e);
    } else camera.position.copy(orbit);
    camera.lookAt(focus);
    lerpFov(camera, fov, dt);
    // Vật cản giữa camera và nhân vật thì làm mờ đi.
    fader.update(camera, head.set(p.x, base + height - 0.35, p.z));
  });
  return null;
}
