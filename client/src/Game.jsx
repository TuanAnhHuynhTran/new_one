import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { MAP, defaultPlots, skyColors, sunState } from './world.js';
import { buildColliders } from './scene/colliders.js';
import { Mat, TimeCtx, lerpFov, makeFader } from './scene/kit.jsx';
import { Balloons, Clouds, SkyDome, Stars, SunMoon, Trees, buildNature } from './scene/Nature.jsx';
import { Cafe, Cars, CityBuilding, CityGround, StreetLamps, cityLampSpots } from './scene/City.jsx';
import { Farmstead, RuralDecor, RuralGround } from './scene/Rural.jsx';
import { Avatar, Puppy, hairColor, shirtColor } from './scene/Characters.jsx';
import { Interior } from './scene/Interior.jsx';
import { Garden } from './scene/Garden.jsx';

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
function InteriorLights({ night }) {
  return (
    <>
      <hemisphereLight args={['#fff4e6', '#e8cdb8', 0.75 - night * 0.3]} />
      <ambientLight intensity={0.15} />
      <directionalLight position={[3, 7, -6]} intensity={night > 0.6 ? 0.3 : 1.6} color={night > 0.6 ? '#9fb0ff' : '#ffd2a0'} />
      <directionalLight
        position={[8, 12, 9]} intensity={0.9 - night * 0.4} castShadow
        shadow-mapSize={[2048, 2048]} shadow-bias={-0.0004} shadow-normalBias={0.03}
        shadow-camera-left={-8} shadow-camera-right={8} shadow-camera-top={8} shadow-camera-bottom={-8}
      />
      <pointLight position={[2.4, 2.4, -2.6]} intensity={night > 0.6 ? 1 : 6} distance={9} decay={2} color={night > 0.6 ? '#aab8ff' : '#ffc27a'} />
    </>
  );
}

// ---------- Điều khiển nhân vật ----------
const keys = {};
// Góc camera mặc định (offset 9, 12, 14 so với nhân vật).
const CAM_BASE_YAW = Math.atan2(9, 14), CAM_DIST = Math.hypot(9, 12, 14), CAM_PITCH = Math.atan2(12, Math.hypot(9, 14));
const camHead = new THREE.Vector3(), camWant = new THREE.Vector3();
const groundRay = new THREE.Raycaster(), groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), groundHit = new THREE.Vector3();

// Góc nhìn thứ 3: camera thấp sau lưng nhân vật.
const TP = { dist: 6.2, pitch: 0.28, fov: 58, isoFov: 45 };
function PlayerController({ me, player, anim, hit, onMove, view }) {
  const group = useRef();
  const zoom = useRef(1);
  // Góc xoay camera do người chơi kéo chuột phải; giữ trong player ref để không mất khi ra/vào nhà.
  if (player.current.yaw == null) { player.current.yaw = 0; player.current.pitch = CAM_PITCH; }
  const fader = useMemo(() => makeFader(), []);
  const dragRef = useRef(false);
  const vel = useRef({ x: 0, z: 0 });
  const mouse = useRef({ held: false, since: 0, ndc: new THREE.Vector2(), target: null });
  const marker = useRef();
  const { camera, gl } = useThree();
  useEffect(() => {
    // Chỉ lấy vị trí đã lưu ở lần đầu; khi ra/vào nhà, nhân vật giữ nguyên vị trí hiện tại.
    if (player.current.owner !== me?.id) {
      player.current = { x: Number(me?.last_x ?? me?.world_x ?? 0), z: Number(me?.last_z ?? me?.world_z ?? 0), angle: 0, owner: me?.id, yaw: 0, pitch: CAM_PITCH };
    }
    camera.position.set(player.current.x + 9, 12, player.current.z + 14);
  }, [me?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const down = e => {
      if (['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)) return;
      keys[e.code] = true;
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
    };
    const up = e => { keys[e.code] = false; };
    const blur = () => Object.keys(keys).forEach(k => delete keys[k]);
    const wheel = e => { e.preventDefault(); zoom.current = THREE.MathUtils.clamp(zoom.current * (e.deltaY > 0 ? 1.1 : 0.9), 0.55, 1.7); };
    // Chuột phải + kéo: xoay camera. Chuột trái: giữ để đi theo con trỏ, click để đi tới điểm đó.
    const el = gl.domElement;
    let dragging = false;
    const m = mouse.current;
    const setNdc = e => { const r = el.getBoundingClientRect(); m.ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1); };
    const pdown = e => {
      if (e.button === 2) { dragging = true; dragRef.current = true; el.setPointerCapture(e.pointerId); el.style.cursor = 'grabbing'; return; }
      if (e.button !== 0) return;
      el.setPointerCapture(e.pointerId);
      setNdc(e);
      m.held = true; m.since = performance.now();
    };
    const pmove = e => {
      if (m.held) setNdc(e);
      if (!dragging) return;
      const p = player.current, vw = view.current;
      if (vw.tp) {
        vw.wYaw -= e.movementX * 0.006;
        vw.wPitch = THREE.MathUtils.clamp(vw.wPitch + e.movementY * 0.004, -0.05, 1.1);
      } else {
        p.yaw -= e.movementX * 0.006;
        p.pitch = THREE.MathUtils.clamp(p.pitch + e.movementY * 0.004, 0.22, 1.25);
      }
    };
    const pup = e => {
      if (e.button === 0 && m.held) {
        m.held = false;
        el.releasePointerCapture?.(e.pointerId);
        // Click nhanh → giữ lại điểm đích để nhân vật tự đi tới; giữ lâu → dừng khi thả chuột.
        if (performance.now() - m.since > 250) m.target = null;
        return;
      }
      if (e.button !== 2 || !dragging) return;
      dragging = false; dragRef.current = false; el.releasePointerCapture?.(e.pointerId); el.style.cursor = '';
    };
    const ctx = e => e.preventDefault();
    window.addEventListener('keydown', down); window.addEventListener('keyup', up); window.addEventListener('blur', blur);
    el.addEventListener('wheel', wheel, { passive: false });
    el.addEventListener('pointerdown', pdown); el.addEventListener('pointermove', pmove); el.addEventListener('pointerup', pup); el.addEventListener('contextmenu', ctx);
    return () => {
      window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); window.removeEventListener('blur', blur);
      el.removeEventListener('wheel', wheel);
      el.removeEventListener('pointerdown', pdown); el.removeEventListener('pointermove', pmove); el.removeEventListener('pointerup', pup); el.removeEventListener('contextmenu', ctx);
      el.style.cursor = '';
      blur();
    };
  }, [gl, player]);
  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.06), p = player.current, m = mouse.current, v = vel.current, vw = view.current;
    if (vw.wYaw == null) { vw.wYaw = CAM_BASE_YAW + p.yaw; vw.wPitch = TP.pitch; }
    // Hướng phím theo camera: góc nhìn trên cao xoay theo p.yaw, góc nhìn thứ 3 theo đúng hướng camera (W = tiến về phía trước).
    const rot = vw.tp ? vw.wYaw : p.yaw;
    const c = Math.cos(rot), s = Math.sin(rot);
    // ---- 1. Hướng muốn đi (wx, wz), độ lớn 0..1 ----
    let wx = 0, wz = 0, run = !!(keys.ShiftLeft || keys.ShiftRight);
    const kx = Number(!!(keys.KeyD || keys.ArrowRight)) - Number(!!(keys.KeyA || keys.ArrowLeft));
    const kz = Number(!!(keys.KeyS || keys.ArrowDown)) - Number(!!(keys.KeyW || keys.ArrowUp));
    const pad = navigator.getGamepads?.()[0];
    let ax = 0, az = 0;
    if (pad) {
      ax = pad.axes[0] || 0; az = pad.axes[1] || 0;
      const mag = Math.hypot(ax, az);
      if (mag < 0.18) { ax = 0; az = 0; } else { const k = Math.min(1, (mag - 0.18) / 0.82) / mag; ax *= k; az *= k; }
      if (Math.hypot(ax, az) > 0.92 || pad.buttons[10]?.pressed) run = true;
    }
    const ix = kx + ax, iz = kz + az;
    if (ix || iz) {
      // Phím / cần analog: xoay theo góc camera (W luôn là "đi ra xa camera").
      const l = Math.max(1, Math.hypot(ix, iz));
      wx = (ix * c + iz * s) / l; wz = (iz * c - ix * s) / l;
      m.target = null;
    } else {
      // Chuột trái: lấy điểm trên mặt đất dưới con trỏ.
      if (m.held) {
        groundRay.setFromCamera(m.ndc, camera);
        if (groundRay.ray.intersectPlane(groundPlane, groundHit)) m.target = { x: groundHit.x, z: groundHit.z, t: 0 };
      }
      if (m.target) {
        const tx = m.target.x - p.x, tz = m.target.z - p.z, dist = Math.hypot(tx, tz);
        if (dist < 0.25) m.target = null;
        else {
          // Giảm tốc khi gần tới đích, chạy khi điểm đích ở xa.
          const k = Math.min(1, dist / 1.2) / dist;
          wx = tx * k; wz = tz * k;
          if (dist > 12) run = true;
        }
      }
    }
    // ---- 2. Vận tốc có quán tính: tăng/giảm tốc mượt, đổi hướng theo đường cong ----
    const maxSp = run ? 9 : 5;
    const accel = (wx || wz) ? 14 : 18;
    v.x += (wx * maxSp - v.x) * Math.min(1, accel * dt);
    v.z += (wz * maxSp - v.z) * Math.min(1, accel * dt);
    const speed = Math.hypot(v.x, v.z);
    if (speed < 0.05) { v.x = 0; v.z = 0; }
    anim.current.run = run && speed > 6;
    anim.current.moving = speed > 0.4;
    if (speed > 0.05) {
      const { x0, x1, z0, z1 } = MAP.bounds;
      const nx = THREE.MathUtils.clamp(p.x + v.x * dt, x0, x1), nz = THREE.MathUtils.clamp(p.z + v.z * dt, z0, z1);
      // Nếu đang kẹt sẵn trong vật cản (vị trí lưu cũ) thì cho đi tự do để thoát ra.
      const stuck = hit(p.x, p.z);
      const ok = (x, z) => stuck || !hit(x, z);
      const ox = p.x, oz = p.z;
      // Trượt dọc vật cản: thử cả hai trục, rồi từng trục riêng (mất vận tốc theo trục bị chặn).
      if (ok(nx, nz)) { p.x = nx; p.z = nz; }
      else if (ok(nx, p.z)) { p.x = nx; v.z *= 0.2; }
      else if (ok(p.x, nz)) { p.z = nz; v.x *= 0.2; }
      else { v.x *= 0.2; v.z *= 0.2; }
      // Đi bằng click mà bị kẹt quá lâu thì bỏ điểm đích.
      if (m.target && !m.held) { m.target.t = Math.hypot(p.x - ox, p.z - oz) < 0.01 ? m.target.t + dt : 0; if (m.target.t > 0.4) m.target = null; }
      const target = Math.atan2(v.x, v.z);
      let diff = target - p.angle; diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      p.angle += diff * Math.min(1, dt * 12);
      onMove?.(p);
    }
    // Vòng đánh dấu điểm click.
    if (marker.current) {
      const show = !!m.target && !m.held;
      marker.current.visible = show;
      if (show) { marker.current.position.set(m.target.x, 0.06, m.target.z); marker.current.scale.setScalar(1 + Math.sin(performance.now() / 160) * 0.12); }
    }
    group.current?.position.set(p.x, 0, p.z);
    if (group.current) group.current.rotation.y = p.angle;
    if (vw.tp) {
      // ---- Góc nhìn thứ 3: camera tự xoay về sau lưng khi nhân vật tiến lên / đi bằng chuột ----
      const forward = kz < 0 || az < -0.3 || (!!m.target && !m.held);
      if (!dragRef.current && speed > 1 && forward) {
        let diff = p.angle + Math.PI - vw.wYaw; diff = Math.atan2(Math.sin(diff), Math.cos(diff));
        vw.wYaw += diff * Math.min(1, dt * 1.8);
      }
      const d = TP.dist * zoom.current, hh = Math.cos(vw.wPitch) * d;
      camWant.set(p.x + Math.sin(vw.wYaw) * hh, Math.max(0.5, 1.9 + Math.sin(vw.wPitch) * d), p.z + Math.cos(vw.wYaw) * hh);
      camera.position.lerp(camWant, Math.min(dt * 8, 1));
      camera.lookAt(p.x, 1.75, p.z);
      lerpFov(camera, TP.fov, dt);
    } else {
      const d = CAM_DIST * zoom.current, th = CAM_BASE_YAW + p.yaw;
      const hh = Math.cos(p.pitch) * d;
      camWant.set(p.x + Math.sin(th) * hh, 1.6 + Math.sin(p.pitch) * d, p.z + Math.cos(th) * hh);
      camera.position.lerp(camWant, Math.min(dt * 6, 1));
      camera.lookAt(p.x, 1.2, p.z);
      lerpFov(camera, TP.isoFov, dt);
    }
    // Nhà cửa chắn giữa camera và nhân vật thì làm mờ đi để luôn nhìn thấy nhân vật.
    fader.update(camera, camHead.set(p.x, 1.4, p.z));
  });
  useEffect(() => () => fader.clear(), [fader]);
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

// Camera trong nhà / sân vườn: góc diorama (cố định, hoặc đi theo nhân vật nếu follow), hoặc góc nhìn thứ 3 sau lưng. Cuộn chuột để zoom.
function InteriorCamera({ view, roomPlayer, follow = false }) {
  const { camera, gl } = useThree();
  const zoom = useRef(1);
  const fader = useMemo(() => makeFader(), []);
  useEffect(() => () => fader.clear(), [fader]);
  useEffect(() => {
    const wheel = e => { e.preventDefault(); zoom.current = THREE.MathUtils.clamp(zoom.current * (e.deltaY > 0 ? 1.08 : 0.92), 0.7, 1.4); };
    gl.domElement.addEventListener('wheel', wheel, { passive: false });
    camera.position.set(10, 9.5, 11);
    return () => gl.domElement.removeEventListener('wheel', wheel);
  }, [camera, gl]);
  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.06), z = zoom.current, vw = view.current, p = roomPlayer.current;
    if (vw.tp) {
      if (vw.rYaw == null) { vw.rYaw = p.angle + Math.PI; vw.rPitch = 0.42; }
      // Khi tiến lên, camera từ từ quay về sau lưng nhân vật.
      if (p.forward && p.speed > 0.5) {
        let diff = p.angle + Math.PI - vw.rYaw; diff = Math.atan2(Math.sin(diff), Math.cos(diff));
        vw.rYaw += diff * Math.min(1, dt * 2.2);
      }
      const d = (follow ? 5.4 : 4.6) * z, hh = Math.cos(vw.rPitch) * d;
      camWant.set(p.x + Math.sin(vw.rYaw) * hh, 1.7 + Math.sin(vw.rPitch) * d, p.z + Math.cos(vw.rYaw) * hh);
      camera.position.lerp(camWant, Math.min(1, dt * 8));
      camera.lookAt(p.x, 1.25, p.z);
      lerpFov(camera, 62, dt);
      fader.update(camera, camHead.set(p.x, 1.3, p.z));
    } else if (follow) {
      // Nhìn vào điểm hơi lệch về phía camera để nhân vật nằm cao hơn thanh công cụ ở dưới màn hình.
      camWant.set(p.x + 1 + 6.5 * z, 0.6 + 8.5 * z, p.z + 2.4 + 9.5 * z);
      camera.position.lerp(camWant, Math.min(1, dt * 5));
      camera.lookAt(camera.position.x - 6.5 * z, 0.6, camera.position.z - 9.5 * z);
      lerpFov(camera, TP.isoFov, dt);
      fader.clear();
    } else {
      camWant.set(10 * z, 1 + 8.5 * z, 11 * z);
      camera.position.lerp(camWant, Math.min(1, dt * 6));
      camera.lookAt(0, 0.8, 0);
      lerpFov(camera, TP.isoFov, dt);
      fader.clear();
    }
  });
  return null;
}

// ---------- Thế giới ngoài trời ----------
function World({ me, nodes, trees, player, anim, hit, onPosition, feedTick, night, view }) {
  const lampSpots = useMemo(() => cityLampSpots(), []);
  const ownerPlot = me?.plot_id;
  return (
    <>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[20, 0, 0]} receiveShadow><planeGeometry args={[600, 600]} /><Mat color="#9fd07f" rough={1} /></mesh>
      <CityGround />
      <RuralGround />
      <Cafe />
      <StreetLamps spots={lampSpots} />
      {nodes.map(p => (p.zone === 'rural'
        ? <Farmstead key={p.id} plot={p} owned={p.id === ownerPlot} />
        : <CityBuilding key={p.id} plot={p} owned={p.id === ownerPlot} />))}
      <RuralDecor nodes={nodes} />
      <Trees trees={trees} />
      <Cars player={player} />
      <Clouds night={night} />
      <Balloons />
      <PlayerController me={me} player={player} anim={anim} hit={hit} onMove={onPosition} view={view} />
      <Puppy player={player} feedTick={feedTick} />
    </>
  );
}

export default function Game({ me, plots, mode, furniture, held, rotation, onPlace, onPick, onRotateHeld, onRotateItem, onTarget, onBlocked, onPosition, feedTick, thirdPerson, garden }) {
  const player = useRef({ x: 0, z: 0, angle: 0 });
  const anim = useRef({ moving: false, run: false });
  // Trạng thái camera dùng chung: tp = góc nhìn thứ 3; wYaw/wPitch ngoài trời, rYaw/rPitch trong nhà.
  const view = useRef({ tp: thirdPerson, wYaw: null, wPitch: 0.28, rYaw: null, rPitch: 0.32 });
  view.current.tp = thirdPerson;
  const roomPlayer = useRef({ x: 0, z: 3, angle: Math.PI, speed: 0, forward: false });
  const [sun, setSun] = useState(() => sunState());
  useEffect(() => { const i = setInterval(() => setSun(sunState()), 30000); return () => clearInterval(i); }, []);
  const nodes = useMemo(() => (plots.length ? plots : defaultPlots()), [plots]);
  const trees = useMemo(() => buildNature(nodes), [nodes]);
  const hit = useMemo(() => buildColliders(nodes, trees), [nodes, trees]);
  const time = useMemo(() => ({ level: sun.level, night: sun.night }), [sun.level, sun.night]);
  const sky = skyColors(sun.night);
  const world = mode === 'world';
  return (
    <Canvas shadows="soft" dpr={[1, 1.75]} camera={{ fov: 45, position: [10, 12, 16], near: 0.1, far: 900 }} gl={{ antialias: true }}>
      <TimeCtx.Provider value={time}>
        {mode === 'garden' && garden ? (
          <>
            <color attach="background" args={[sky.bottom]} />
            <fog attach="fog" args={[sky.bottom, 40, 120]} />
            <SkyDome top={sky.top} bottom={sky.bottom} />
            <Stars night={sun.night} />
            <SunMoon night={sun.night} />
            <WorldLights player={roomPlayer} level={sun.level} night={sun.night} />
            <Garden me={me} view={view} player={roomPlayer} {...garden} />
            <InteriorCamera view={view} roomPlayer={roomPlayer} follow />
          </>
        ) : world ? (
          <>
            <color attach="background" args={[sky.bottom]} />
            <fog attach="fog" args={[sky.bottom, 120, 320]} />
            <SkyDome top={sky.top} bottom={sky.bottom} />
            <Stars night={sun.night} />
            <SunMoon night={sun.night} />
            <WorldLights player={player} level={sun.level} night={sun.night} />
            <World me={me} nodes={nodes} trees={trees} player={player} anim={anim} hit={hit} onPosition={onPosition} feedTick={feedTick} night={sun.night} view={view} />
          </>
        ) : (
          <>
            <color attach="background" args={[sun.night > 0.6 ? '#3a3550' : '#ead8cf']} />
            <InteriorLights night={sun.night} />
            <Interior me={me} view={view} player={roomPlayer} furniture={furniture} held={held} rotation={rotation} onPlace={onPlace} onPick={onPick}
              onRotateHeld={onRotateHeld} onRotateItem={onRotateItem} onTarget={onTarget} onBlocked={onBlocked} />
            <InteriorCamera view={view} roomPlayer={roomPlayer} />
          </>
        )}
      </TimeCtx.Provider>
    </Canvas>
  );
}
