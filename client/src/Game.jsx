import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { MAP, defaultPlots, isBuilt, skyColors, sunState } from './world.js';
import { FocusCamera, PlotLayer } from './scene/Plots.jsx';
import { HouseBuilder, useBuildingStore } from './game/building/index.js';
import { WorldWalls } from './game/building/WallMeshes.jsx';
import { buildHouseWalk } from './game/building/walkSurfaces.js';
import { buildSurfaceY, plotLocalToWorld, worldToPlotLocal } from './game/building/buildingUtils.js';
import { pointInPolygon } from '../../shared/buildGeometry.mjs';
import { pointAlong, wallColliderSpans } from '../../shared/openingGeometry.mjs';
import { buildColliders } from './scene/colliders.js';
import { Mat, TimeCtx, lerpFov, makeFader } from './scene/kit.jsx';
import { Balloons, Clouds, SkyDome, Stars, SunMoon, Trees, buildNature } from './scene/Nature.jsx';
import { Cafe, Cars, CityBuilding, CityGround, StreetLamps, cityLampSpots } from './scene/City.jsx';
import { Farmstead, RuralDecor, RuralGround } from './scene/Rural.jsx';
import { Avatar, Puppy, hairColor, shirtColor } from './scene/Characters.jsx';
import { Interior } from './scene/Interior.jsx';
import { Garden } from './scene/Garden.jsx';
import { ThirdPersonCamera, newLook, useMouseLook, usePointerLock } from './scene/controls.js';

// ---------- Ánh sáng ----------
function WorldLights({ player, level, night }) {
  const light = useRef();
  const target = useMemo(() => new THREE.Object3D(), []);
  // Mặt trời đi theo người chơi để bóng đổ luôn sắc nét quanh nhân vật.
  useFrame(() => {
    const p = player.current;
    light.current?.position.set(p.x + 30, 48, p.z + 24);
    target.position.set(p.x, 0, p.z);
    target.updateMatrixWorld();
  });
  return (
    <>
      <hemisphereLight args={[night > 0.6 ? '#9fb0ff' : '#fff1dc', '#8fb57a', 0.5 + 0.5 * level]} />
      <ambientLight intensity={0.1 + 0.12 * level} />
      <directionalLight
        ref={light} target={target} castShadow
        color={night > 0.6 ? '#b8c6ff' : night > 0.2 ? '#ffc58f' : '#fff1d9'}
        intensity={0.35 + 2.3 * level}
        shadow-mapSize={[2048, 2048]} shadow-bias={-0.0004} shadow-normalBias={0.04}
        shadow-camera-left={-45} shadow-camera-right={45} shadow-camera-top={45} shadow-camera-bottom={-45}
        shadow-camera-near={1} shadow-camera-far={160}
      />
      <primitive object={target} />
    </>
  );
}
// Ánh sáng trong nhà; đèn trần ấm đi theo tầng đang đứng.
function InteriorLights({ night, level = 0 }) {
  const y = level * 3.4;
  return (
    <>
      <hemisphereLight args={['#fff4e6', '#e8cdb8', 0.8 - night * 0.3]} />
      <ambientLight intensity={0.16} />
      <directionalLight position={[3, 9, -8]} intensity={night > 0.6 ? 0.3 : 1.4} color={night > 0.6 ? '#9fb0ff' : '#ffd2a0'} />
      <directionalLight
        position={[10, 18, 12]} intensity={1.0 - night * 0.45} castShadow
        shadow-mapSize={[2048, 2048]} shadow-bias={-0.0004} shadow-normalBias={0.03}
        shadow-camera-left={-14} shadow-camera-right={14} shadow-camera-top={14} shadow-camera-bottom={-14} shadow-camera-far={60}
      />
      {level < 2 && [[-4, 1.5], [4, -3]].map(([x, z]) => (
        <pointLight key={x} position={[x, y + 2.6, z]} intensity={night > 0.6 ? 5 : 3} distance={11} decay={2} color="#ffcf8a" />
      ))}
    </>
  );
}

// Camera ngôi nhà: góc nhìn chéo từ trên xuống, bám nhẹ theo nhân vật và nâng lên theo tầng đang đứng. Cuộn chuột để zoom.
const houseFocus = new THREE.Vector3();
function HouseCamera({ roomPlayer }) {
  const { camera, gl } = useThree();
  const zoom = useRef(1);
  const first = useRef(true);
  useEffect(() => {
    const wheel = e => { e.preventDefault(); zoom.current = THREE.MathUtils.clamp(zoom.current * (e.deltaY > 0 ? 1.08 : 0.92), 0.6, 1.3); };
    gl.domElement.addEventListener('wheel', wheel, { passive: false });
    return () => gl.domElement.removeEventListener('wheel', wheel);
  }, [gl]);
  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.06), z = zoom.current, p = roomPlayer.current;
    const ly = (p.level || 0) * 3.4;
    // Tâm nhìn: giữa ngôi nhà, kéo 45% về phía nhân vật (đứng sát mép vẫn thấy rõ), cao theo tầng.
    const want = camHead.set(p.x * 0.45, ly + 0.6, (p.z || 0) * 0.45 + 2.6);
    if (first.current) houseFocus.copy(want); else houseFocus.lerp(want, 1 - Math.exp(-4 * dt));
    camWant.set(houseFocus.x + 13.5 * z, houseFocus.y + 14.5 * z, houseFocus.z + 15.5 * z);
    // Lần đầu: nếu camera đang ở gần (vd. vừa thôi ngắm cảnh trên sân thượng) thì lướt tới, còn lại đặt thẳng.
    if (first.current && camera.position.distanceTo(camWant) > 40) camera.position.copy(camWant); else camera.position.lerp(camWant, 1 - Math.exp(-6 * dt));
    first.current = false;
    camera.lookAt(houseFocus);
    lerpFov(camera, TP.isoFov, dt);
  });
  return null;
}

// ---------- Điều khiển nhân vật ----------
const keys = {};
// Góc camera nhìn từ trên cao (offset 9, 12, 14 so với nhân vật).
const CAM_BASE_YAW = Math.atan2(9, 14), CAM_DIST = Math.hypot(9, 12, 14), CAM_PITCH = Math.atan2(12, Math.hypot(9, 14));
const camHead = new THREE.Vector3(), camWant = new THREE.Vector3();
const groundRay = new THREE.Raycaster(), groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), groundHit = new THREE.Vector3();

// Góc nhìn thứ 3 ngoài trời / trong sân vườn.
const TP = { dist: 6.2, pitch: 0.28, fov: 58, isoFov: 45 };

// PlayerController (ngoài trời): WASD đi theo hướng camera, Shift chạy.
// Góc nhìn thứ 3: hướng camera do Mouse Look quyết định (view.current.look), camera do <ThirdPersonCamera> lo.
// Nhìn từ trên cao: con trỏ hiện bình thường, click / giữ chuột trái để đi tới chỗ đó; camera bám theo nhân vật.
// Tìm chỗ đứng trống gần (x, z) nhất (xoắn ốc ra ngoài) — tránh xuất hiện trong tường / vật cản.
function freeSpot(hit, x, z) {
  if (!hit(x, z)) return [x, z];
  for (let r = 0.5; r <= 8; r += 0.5) {
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI * 2, nx = x + Math.sin(a) * r, nz = z + Math.cos(a) * r;
      if (!hit(nx, nz)) return [nx, nz];
    }
  }
  return [x, z];
}

function PlayerController({ me, player, anim, hit, onMove, view, teleport, walk = null }) {
  const group = useRef();
  const zoom = useRef(1);
  if (player.current.yaw == null) { player.current.yaw = 0; player.current.pitch = CAM_PITCH; }
  const fader = useMemo(() => makeFader(), []);
  const vel = useRef({ x: 0, z: 0 });
  const mouse = useRef({ held: false, since: 0, ndc: new THREE.Vector2(), target: null });
  const marker = useRef();
  const prevTp = useRef(null);
  const { camera, gl } = useThree();
  useEffect(() => {
    // Chỉ lấy vị trí đã lưu ở lần đầu; khi ra/vào nhà, nhân vật giữ nguyên vị trí hiện tại.
    if (player.current.owner !== me?.id) {
      const [x, z] = freeSpot(hit, Number(me?.last_x ?? me?.world_x ?? 0), Number(me?.last_z ?? me?.world_z ?? 0));
      player.current = { x, z, angle: 0, owner: me?.id, yaw: 0, pitch: CAM_PITCH };
      view.current.look.yaw = null;
    }
    // Chỉ khi chạy dev: cho script kiểm thử đọc / dịch chuyển nhân vật ngoài thế giới.
    if (import.meta.env.DEV) window.__lwWorld = player;
    // Báo vị trí ngay từ đầu (không đợi bước chân đầu tiên) để giao diện biết nhân vật đang đứng ở lô nào.
    onMove?.(player.current);
    if (!view.current.tp) camera.position.set(player.current.x + 9, 12, player.current.z + 14);
  }, [me?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  // Dịch chuyển: tới trước cổng lô đất (về nhà / vừa nhận đất), quay mặt vào lô; camera góc nhìn thứ 3 đặt sau lưng.
  useEffect(() => {
    if (!teleport) return;
    const p = player.current, [x, z] = freeSpot(hit, teleport.x, teleport.z);
    Object.assign(p, { x, z, angle: teleport.angle ?? Math.PI, y: 0, level: 0 });
    vel.current.x = 0; vel.current.z = 0;
    mouse.current.target = null; mouse.current.held = false;
    view.current.look.yaw = p.angle + Math.PI; view.current.look.cy = null;
    onMove?.(p);
  }, [teleport?.seq]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const down = e => {
      if (['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)) return;
      keys[e.code] = true;
      // Alt dùng cho Alt + chuột phải (xoay góc nhìn): chặn để trình duyệt không nhảy focus lên thanh menu.
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'AltLeft', 'AltRight'].includes(e.code)) e.preventDefault();
    };
    const up = e => { keys[e.code] = false; };
    const clear = () => Object.keys(keys).forEach(k => delete keys[k]);
    const vis = () => { if (document.visibilityState === 'hidden') clear(); };
    const el = gl.domElement;
    const m = mouse.current;
    const wheel = e => { if (view.current.tp || view.current.focus) return; e.preventDefault(); zoom.current = THREE.MathUtils.clamp(zoom.current * (e.deltaY > 0 ? 1.1 : 0.9), 0.55, 1.7); };
    const setNdc = e => { const r = el.getBoundingClientRect(); m.ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1); };
    // Nhìn từ trên cao (con trỏ hiện bình thường):
    //   chuột phải: click để đi tới điểm đó, giữ để nhân vật đi theo con trỏ;
    //   Alt + giữ chuột phải và kéo: xoay góc nhìn quanh nhân vật (kéo ngang = xoay, kéo dọc = nghiêng).
    // Góc nhìn thứ 3: chuột chỉ dùng để khoá & nhìn quanh (usePointerLock / useMouseLook).
    const pdown = e => {
      if (view.current.tp || view.current.focus || e.button !== 2) return;
      e.preventDefault();
      el.setPointerCapture(e.pointerId);
      // Alt: lấy từ sự kiện chuột, dự phòng bằng trạng thái phím đang giữ.
      if (e.altKey || keys.AltLeft || keys.AltRight) { m.orbit = true; el.style.cursor = 'grabbing'; return; }
      setNdc(e);
      m.held = true; m.since = performance.now();
      // Lấy điểm đích ngay khi bấm (click rất nhanh vẫn đi được, kể cả khi FPS thấp).
      groundRay.setFromCamera(m.ndc, camera);
      if (groundRay.ray.intersectPlane(groundPlane, groundHit)) m.target = { x: groundHit.x, z: groundHit.z, t: 0 };
    };
    const pmove = e => {
      if (m.orbit) {
        const p = player.current, k = view.current.sens || 1;
        p.yaw -= e.movementX * 0.005 * k;
        p.pitch = THREE.MathUtils.clamp(p.pitch + e.movementY * 0.004 * k * (view.current.invertY ? -1 : 1), 0.22, 1.25);
        return;
      }
      if (m.held) setNdc(e);
    };
    const pup = e => {
      if (e.button !== 2) return;
      el.releasePointerCapture?.(e.pointerId);
      if (m.orbit) { m.orbit = false; el.style.cursor = ''; return; }
      if (!m.held) return;
      m.held = false;
      // Click nhanh → giữ lại điểm đích để nhân vật tự đi tới; giữ lâu → dừng khi thả chuột.
      if (performance.now() - m.since > 250) m.target = null;
    };
    const ctx = e => e.preventDefault();
    window.addEventListener('keydown', down); window.addEventListener('keyup', up); window.addEventListener('blur', clear);
    document.addEventListener('visibilitychange', vis);
    el.addEventListener('wheel', wheel, { passive: false });
    el.addEventListener('pointerdown', pdown); el.addEventListener('pointermove', pmove); el.addEventListener('pointerup', pup); el.addEventListener('contextmenu', ctx);
    return () => {
      window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); window.removeEventListener('blur', clear);
      document.removeEventListener('visibilitychange', vis);
      el.removeEventListener('wheel', wheel);
      el.removeEventListener('pointerdown', pdown); el.removeEventListener('pointermove', pmove); el.removeEventListener('pointerup', pup); el.removeEventListener('contextmenu', ctx);
      fader.clear();
      el.style.cursor = '';
      clear();
    };
  }, [gl, camera, player, view, fader]);
  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.06), p = player.current, m = mouse.current, v = vel.current, vw = view.current, look = vw.look, frozen = !!vw.focus;
    // Đổi góc nhìn giữ nguyên hướng: camera trên cao ↔ camera sau lưng nhìn cùng một phía.
    if (look.yaw == null) look.yaw = CAM_BASE_YAW + p.yaw;
    if (prevTp.current !== null && prevTp.current !== vw.tp) {
      if (vw.tp) { look.yaw = CAM_BASE_YAW + p.yaw; look.cy = null; m.held = false; m.target = null; if (m.orbit) { m.orbit = false; gl.domElement.style.cursor = ''; } }
      else p.yaw = (look.cy ?? look.yaw) - CAM_BASE_YAW;
    }
    prevTp.current = vw.tp;
    // Hướng phím theo camera: W = đi ra xa camera.
    const rot = vw.tp ? look.yaw : p.yaw;
    const c = Math.cos(rot), s = Math.sin(rot);
    // ---- 1. Hướng muốn đi (wx, wz), độ lớn 0..1 ----
    let wx = 0, wz = 0, run = !!(keys.ShiftLeft || keys.ShiftRight);
    // Đang xem lô đất (màn hình chọn đất) → nhân vật đứng yên.
    const kx = frozen ? 0 : Number(!!(keys.KeyD || keys.ArrowRight)) - Number(!!(keys.KeyA || keys.ArrowLeft));
    const kz = frozen ? 0 : Number(!!(keys.KeyS || keys.ArrowDown)) - Number(!!(keys.KeyW || keys.ArrowUp));
    const pad = navigator.getGamepads?.()[0];
    let ax = 0, az = 0;
    if (pad && !frozen) {
      ax = pad.axes[0] || 0; az = pad.axes[1] || 0;
      const mag = Math.hypot(ax, az);
      if (mag < 0.18) { ax = 0; az = 0; } else { const k = Math.min(1, (mag - 0.18) / 0.82) / mag; ax *= k; az *= k; }
      if (Math.hypot(ax, az) > 0.92 || pad.buttons[10]?.pressed) run = true;
    }
    const ix = kx + ax, iz = kz + az;
    if (ix || iz) {
      // Chuẩn hoá vector chéo để đi chéo không nhanh hơn.
      const l = Math.max(1, Math.hypot(ix, iz));
      wx = (ix * c + iz * s) / l; wz = (iz * c - ix * s) / l;
      m.target = null;
    } else if (!vw.tp && !frozen) {
      // Nhìn từ trên cao: lấy điểm trên mặt đất dưới con trỏ.
      if (m.held) {
        groundRay.setFromCamera(m.ndc, camera);
        if (groundRay.ray.intersectPlane(groundPlane, groundHit)) m.target = { x: groundHit.x, z: groundHit.z, t: 0 };
      }
      if (m.target) {
        const tx = m.target.x - p.x, tz = m.target.z - p.z, dist = Math.hypot(tx, tz);
        if (dist < 0.25) m.target = null;
        else {
          const k = Math.min(1, dist / 1.2) / dist;
          wx = tx * k; wz = tz * k;
          if (dist > 12) run = true;
        }
      }
    }
    // ---- 2. Vận tốc có quán tính (nội suy theo delta, không phụ thuộc FPS) ----
    const maxSp = run ? 9 : 5;
    const a = 1 - Math.exp(-((wx || wz) ? 14 : 18) * dt);
    v.x += (wx * maxSp - v.x) * a;
    v.z += (wz * maxSp - v.z) * a;
    const speed = Math.hypot(v.x, v.z);
    if (speed < 0.05) { v.x = 0; v.z = 0; }
    anim.current.run = run && speed > 6;
    anim.current.moving = speed > 0.4;
    if (speed > 0.05) {
      const { x0, x1, z0, z1 } = MAP.bounds;
      const nx = THREE.MathUtils.clamp(p.x + v.x * dt, x0, x1), nz = THREE.MathUtils.clamp(p.z + v.z * dt, z0, z1);
      // Nếu đang kẹt sẵn trong vật cản (vị trí lưu cũ) thì cho đi tự do để thoát ra.
      // Nhiều tầng: chỉ bước tới chỗ có "mặt đứng được" gần độ cao hiện tại (sàn, bậc thang, sàn tầng trên).
      // Tầng trệt dùng collider thế giới (nhà, cây, tường tầng trệt); tầng trên dùng tường của tầng đó.
      const blocked = (x, z) => {
        const sf = walk ? walk.surface(x, z, p.y ?? 0) : { level: 0 };
        if (!sf) return true;
        return sf.level === 0 ? hit(x, z) : walk.wallHit(sf.level, x, z);
      };
      const stuck = blocked(p.x, p.z);
      const ok = (x, z) => stuck || !blocked(x, z);
      const ox = p.x, oz = p.z;
      // Trượt dọc vật cản: thử cả hai trục, rồi từng trục riêng.
      if (ok(nx, nz)) { p.x = nx; p.z = nz; }
      else if (ok(nx, p.z)) { p.x = nx; v.z *= 0.2; }
      else if (ok(p.x, nz)) { p.z = nz; v.x *= 0.2; }
      else { v.x *= 0.2; v.z *= 0.2; }
      if (m.target && !m.held) { m.target.t = Math.hypot(p.x - ox, p.z - oz) < 0.01 ? m.target.t + dt : 0; if (m.target.t > 0.4) m.target = null; }
      // Nhân vật xoay mượt theo hướng di chuyển.
      const target = Math.atan2(v.x, v.z);
      let diff = target - p.angle; diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      p.angle += diff * Math.min(1, dt * 12);
      onMove?.(p);
    }
    if (marker.current) {
      const show = !!m.target && !m.held && !vw.tp;
      marker.current.visible = show;
      if (show) { marker.current.position.set(m.target.x, 0.06, m.target.z); marker.current.scale.setScalar(1 + Math.sin(performance.now() / 160) * 0.12); }
    }
    // Đứng trên tấm sàn tầng trệt (collider mặt sàn): nâng nhân vật lên mặt sàn, mượt.
    const sf = walk ? walk.surface(p.x, p.z, p.y ?? 0) : null;
    const gy = sf ? sf.y : walk ? (p.y ?? 0) : 0;
    p.level = sf ? sf.level : (p.level ?? 0);
    p.y = (p.y ?? 0) + (gy - (p.y ?? 0)) * Math.min(1, dt * 14);
    group.current?.position.set(p.x, p.y, p.z);
    if (group.current) group.current.rotation.y = p.angle;
    if (!vw.tp && !frozen) {
      const d = CAM_DIST * zoom.current, th = CAM_BASE_YAW + p.yaw;
      const hh = Math.cos(p.pitch) * d;
      camWant.set(p.x + Math.sin(th) * hh, (p.y || 0) + 1.6 + Math.sin(p.pitch) * d, p.z + Math.cos(th) * hh);
      camera.position.lerp(camWant, 1 - Math.exp(-6 * dt));
      camera.lookAt(p.x, (p.y || 0) + 1.2, p.z);
      lerpFov(camera, TP.isoFov, dt);
      fader.update(camera, camHead.set(p.x, (p.y || 0) + 1.4, p.z));
    }
  });
  return (
    <>
      <group ref={group}>
        <Avatar anim={anim} shirt={shirtColor(me?.id)} hair={hairColor(me?.id)} name={me?.display_name} />
      </group>
      <mesh ref={marker} rotation={[-Math.PI / 2, 0, 0]} visible={false}>
        <ringGeometry args={[0.35, 0.55, 28]} />
        <meshBasicMaterial color="#ffffff" transparent opacity={0.85} depthWrite={false} />
      </mesh>
    </>
  );
}

// Khoá chuột + Mouse Look cho các chế độ khám phá (ngoài trời, sân vườn) ở góc nhìn thứ 3.
function CameraControls({ enabled, view, which }) {
  usePointerLock(enabled);
  useMouseLook(enabled, () => view.current[which], () => view.current);
  return null;
}

// Camera nhìn từ trên xuống bám theo nhân vật trong sân vườn. Cuộn chuột để zoom.
function OverheadCamera({ roomPlayer }) {
  const { camera, gl } = useThree();
  const zoom = useRef(1);
  useEffect(() => {
    const wheel = e => { e.preventDefault(); zoom.current = THREE.MathUtils.clamp(zoom.current * (e.deltaY > 0 ? 1.08 : 0.92), 0.7, 1.4); };
    gl.domElement.addEventListener('wheel', wheel, { passive: false });
    return () => gl.domElement.removeEventListener('wheel', wheel);
  }, [camera, gl]);
  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.06), z = zoom.current, p = roomPlayer.current;
    // Nhìn vào điểm hơi lệch về phía camera để nhân vật nằm cao hơn thanh công cụ ở dưới màn hình.
    camWant.set(p.x + 1 + 6.5 * z, 0.6 + 8.5 * z, p.z + 2.4 + 9.5 * z);
    camera.position.lerp(camWant, 1 - Math.exp(-5 * dt));
    camera.lookAt(camera.position.x - 6.5 * z, 0.6, camera.position.z - 9.5 * z);
    lerpFov(camera, TP.isoFov, dt);
  });
  return null;
}

// ---------- Khu phố quanh ngôi nhà (thấy được từ trong nhà, rõ nhất khi lên sân thượng) ----------
// Dời toạ độ thế giới để ngôi nhà của mình nằm ở gốc; bỏ lô đất của mình và cây / đèn đường chạm vào nhà 2 lầu.
// Hạ thấp 0.16 m để mặt đường, vỉa hè không trồi lên sàn nhà.
const nobody = { current: { x: 1e5, z: 1e5, angle: 0 } };
function Neighborhood({ me, nodes, trees, night }) {
  const wx = Number(me?.world_x || 0), wz = Number(me?.world_z || 0);
  const clear = (x, z) => !(Math.abs(x - wx) < 9.5 && z - wz > -7 && z - wz < 9);
  const others = useMemo(() => nodes.filter(p => p.id !== me?.plot_id), [nodes, me?.plot_id]);
  const builtOthers = useMemo(() => others.filter(isBuilt), [others]);
  const nearTrees = useMemo(() => trees.filter(t => clear(t.x, t.z)), [trees, wx, wz]); // eslint-disable-line react-hooks/exhaustive-deps
  const lamps = useMemo(() => cityLampSpots().filter(([x, z]) => clear(x, z)), [wx, wz]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <group position={[-wx, -0.16, -wz]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[20, 0, 0]} receiveShadow><planeGeometry args={[600, 600]} /><Mat color="#9fd07f" rough={1} /></mesh>
      <CityGround />
      <RuralGround />
      <Cafe />
      <StreetLamps spots={lamps} />
      {others.filter(isBuilt).map(p => (p.zone === 'rural' ? <Farmstead key={p.id} plot={p} /> : <CityBuilding key={p.id} plot={p} />))}
      <RuralDecor nodes={builtOthers} />
      <PlotLayer nodes={others} mineId={me?.plot_id} />
      <Trees trees={nearTrees} />
      <Cars player={nobody} />
      <Clouds night={night} />
      <Balloons />
    </group>
  );
}

// ---------- Thế giới ngoài trời ----------
// Va chạm của tường đã lưu: mỗi đoạn tường tầng trệt = một collider đoạn thẳng (world), không thêm collider thừa.
function wallColliders(nodes, designs, doorStates = null) {
  const segs = [];
  for (const d of designs) {
    const plot = nodes.find(p => p.id === d.plot_id);
    if (!plot) continue;
    for (const w of d.design?.objects || []) {
      if (w.type !== 'wall' || w.floor !== 0) continue;
      const open = doorStates?.get(d.plot_id);
      for (const [s0, s1] of wallColliderSpans(w, id => !!open?.has(id))) {
        const p0 = pointAlong(w, s0), p1 = pointAlong(w, s1);
        const a = plotLocalToWorld(plot, p0[0], 0, p0[1]), b = plotLocalToWorld(plot, p1[0], 0, p1[1]);
        segs.push({ ax: a.x, az: a.z, bx: b.x, bz: b.z, r: w.thickness / 2 });
      }
    }
  }
  return segs;
}

function World({ me, nodes, trees, player, anim, hit, onPosition, feedTick, night, view, teleport, selectedPlotId, hideBuildingId = null, designs = [], buildPlotId = null, walk = null, doorStates = null }) {
  const lampSpots = useMemo(() => cityLampSpots(), []);
  const ownerPlot = me?.plot_id;
  // Chỉ lô owned / reserved có nhà; lô available / disabled là đất trống (PlotLayer vẽ).
  // Build Mode tắt "Nhà hiện có" → ẩn nhà mẫu trên lô đang xây để nhìn rõ mặt đất.
  const built = useMemo(() => nodes.filter(p => isBuilt(p) && p.id !== hideBuildingId), [nodes, hideBuildingId]);
  return (
    <>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[20, 0, 0]} receiveShadow><planeGeometry args={[600, 600]} /><Mat color="#9fd07f" rough={1} /></mesh>
      <CityGround />
      <RuralGround />
      <Cafe />
      <StreetLamps spots={lampSpots} />
      {built.map(p => (p.zone === 'rural'
        ? <Farmstead key={p.id} plot={p} owned={p.id === ownerPlot} />
        : <CityBuilding key={p.id} plot={p} owned={p.id === ownerPlot} />))}
      <RuralDecor nodes={built} />
      <PlotLayer nodes={nodes} mineId={ownerPlot} player={player} selectedId={selectedPlotId} />
      <WorldWalls nodes={nodes} designs={designs} skipPlotId={buildPlotId} doorStates={doorStates} player={player} />
      <Trees trees={trees} />
      <Cars player={player} />
      <Clouds night={night} />
      <Balloons />
      <PlayerController me={me} player={player} anim={anim} hit={hit} onMove={onPosition} view={view} teleport={teleport} walk={walk} />
      <Puppy player={player} feedTick={feedTick} />
    </>
  );
}

// mode: 'world' (khám phá) | 'garden' (sân vườn) | 'interior' (trang trí nhà).
// lockAllowed = false khi giao diện đang mở menu / hộp thoại → thả chuột.
export default function Game({ me, plots, mode, furniture, held, rotation, onPlace, onPick, onRotateHeld, onRotateItem, onTarget, onBlocked, onPosition, feedTick, thirdPerson, sensitivity = 1, invertY = false, lockAllowed = true, garden, houseEntry = 'front', onExitHouse, onHouseLevel, roofView = false, focusPlot = null, teleport = null, designs = [], doorStates = null }) {
  const [houseLevel, setHouseLevel] = useState(0);
  // Build Mode (House Builder): trạng thái nằm trong buildingStore, Game chỉ đổi camera / khoá điều khiển nhân vật.
  const buildMode = useBuildingStore(s => s.isBuildMode) && mode === 'world';
  const buildPlotId = useBuildingStore(s => s.plot?.id ?? null);
  const showWalls = useBuildingStore(s => s.showWalls);
  const changeLevel = useCallback(l => { setHouseLevel(l); onHouseLevel?.(l); }, [onHouseLevel]);
  const player = useRef({ x: 0, z: 0, angle: 0 });
  const anim = useRef({ moving: false, run: false });
  // Trạng thái camera dùng chung: tp = góc nhìn thứ 3; look = góc nhìn ngoài trời, roomLook = trong sân vườn.
  const view = useRef(null);
  if (!view.current) view.current = { tp: thirdPerson, look: newLook(TP.pitch), roomLook: newLook(0.42), sens: sensitivity, invertY };
  const inGarden = mode === 'garden' && !!garden, world = mode === 'world';
  // Trang trí nhà luôn nhìn từ trên xuống với con trỏ chuột bình thường.
  // Trong nhà luôn nhìn từ trên xuống để trang trí; riêng trên sân thượng có thể bật "ngắm cảnh" (góc nhìn thứ 3 + Mouse Look).
  const interiorTp = mode === 'interior' && roofView && houseLevel === 2;
  const tp = mode === 'interior' ? interiorTp : thirdPerson;
  // focus = camera khác đang điều khiển (xem lô / Build Mode) → nhân vật đứng yên, camera thường tạm nghỉ.
  Object.assign(view.current, { tp, sens: sensitivity, invertY, focus: world && (!!focusPlot || buildMode) });
  // Vừa bật ngắm cảnh trên sân thượng: camera bắt đầu sau lưng nhân vật, hơi ngang tầm mắt để thấy các toà nhà xung quanh.
  const prevRoof = useRef(false);
  if (interiorTp && !prevRoof.current) Object.assign(view.current.roomLook, { yaw: null, cy: null, pitch: 0.15, cp: 0.15 });
  prevRoof.current = interiorTp;
  const roomPlayer = useRef({ x: 0, z: 3, angle: Math.PI, speed: 0, forward: false });
  const [sun, setSun] = useState(() => sunState());
  // Ánh sáng theo giờ server, cập nhật mỗi 10 giây (level thay đổi liên tục nên chuyển tiếp mượt).
  useEffect(() => { const i = setInterval(() => setSun(sunState()), 10000); return () => clearInterval(i); }, []);
  const nodes = useMemo(() => (plots.length ? plots : defaultPlots()), [plots]);
  const trees = useMemo(() => buildNature(nodes), [nodes]);
  // Collider tường chỉ dựng lại khi danh sách thiết kế đã lưu thay đổi (lưu xong) — xem trước trong Build Mode không có va chạm.
  // Collider dựng lại khi thiết kế đã lưu hoặc trạng thái cửa thay đổi.
  const wallSegs = useMemo(() => wallColliders(nodes, designs, doorStates), [nodes, designs, doorStates]);
  // Mặt đứng được (nền, tấm sàn, cầu thang, sàn tầng trên) + tường tầng trên — dựng lại khi thiết kế / cửa thay đổi.
  const walk = useMemo(() => buildHouseWalk(nodes, designs, doorStates), [nodes, designs, doorStates]);
  if (import.meta.env.DEV) window.__lwWalk = walk;
  const hit = useMemo(() => buildColliders(nodes, trees, wallSegs), [nodes, trees, wallSegs]);
  // Chỉ khi chạy dev: script kiểm thử hỏi trực tiếp va chạm.
  if (import.meta.env.DEV) { window.__lwHit = hit; window.__lwWallSegs = wallSegs; }
  const time = useMemo(() => ({ level: sun.level, night: sun.night }), [sun.level, sun.night]);
  const sky = skyColors(sun.night);
  return (
    <Canvas shadows="soft" dpr={[1, 1.75]} camera={{ fov: 45, position: [10, 12, 16], near: 0.1, far: 900 }} gl={{ antialias: true }}>
      <TimeCtx.Provider value={time}>
        <CameraControls enabled={tp && lockAllowed && !(world && (focusPlot || buildMode))} view={view} which={world ? 'look' : 'roomLook'} />
        {inGarden ? (
          <>
            <color attach="background" args={[sky.bottom]} />
            <fog attach="fog" args={[sky.bottom, 40, 120]} />
            <SkyDome top={sky.top} bottom={sky.bottom} />
            <Stars night={sun.night} />
            <SunMoon night={sun.night} />
            <WorldLights player={roomPlayer} level={sun.level} night={sun.night} />
            <Garden me={me} view={view} player={roomPlayer} {...garden} />
            {tp
              ? <ThirdPersonCamera target={roomPlayer} look={view.current.roomLook} dist={5.4} height={1.45} fov={62} zoomRange={[0.7, 1.4]} />
              : <OverheadCamera roomPlayer={roomPlayer} />}
          </>
        ) : world ? (
          <>
            <color attach="background" args={[sky.bottom]} />
            <fog attach="fog" args={[sky.bottom, 120, 320]} />
            <SkyDome top={sky.top} bottom={sky.bottom} />
            <Stars night={sun.night} />
            <SunMoon night={sun.night} />
            <WorldLights player={player} level={sun.level} night={sun.night} />
            <World me={me} nodes={nodes} trees={trees} player={player} anim={anim} hit={hit} onPosition={onPosition} feedTick={feedTick} night={sun.night} view={view} teleport={teleport} selectedPlotId={focusPlot?.id} hideBuildingId={buildMode && !showWalls ? buildPlotId : null} designs={designs} buildPlotId={buildMode ? buildPlotId : null} walk={walk} doorStates={doorStates} />
            {buildMode ? <HouseBuilder /> : focusPlot ? <FocusCamera plot={focusPlot} /> : tp && <ThirdPersonCamera target={player} look={view.current.look} dist={TP.dist} height={1.75} fov={TP.fov} />}
          </>
        ) : (
          <>
            <color attach="background" args={[sky.bottom]} />
            <fog attach="fog" args={[sky.bottom, 60, 160]} />
            <SkyDome top={sky.top} bottom={sky.bottom} />
            <InteriorLights night={sun.night} level={houseLevel} />
            <Neighborhood me={me} nodes={nodes} trees={trees} night={sun.night} />
            <Interior me={me} view={view} player={roomPlayer} entry={houseEntry} onExit={onExitHouse} onLevel={changeLevel} furniture={furniture} held={held} rotation={rotation} onPlace={onPlace} onPick={onPick}
              onRotateHeld={onRotateHeld} onRotateItem={onRotateItem} onTarget={onTarget} onBlocked={onBlocked} />
            {interiorTp
              ? <ThirdPersonCamera key="roof" target={roomPlayer} look={view.current.roomLook} dist={6.5} height={1.6} fov={62} zoomRange={[0.6, 1.6]} />
              : <HouseCamera roomPlayer={roomPlayer} />}
          </>
        )}
      </TimeCtx.Provider>
    </Canvas>
  );
}
