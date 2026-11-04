import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { MAP, defaultPlots, skyColors, sunState } from './world.js';
import { buildColliders } from './scene/colliders.js';
import { Mat, TimeCtx, occluders } from './scene/kit.jsx';
import { Balloons, Clouds, SkyDome, Stars, SunMoon, Trees, buildNature } from './scene/Nature.jsx';
import { Cafe, Cars, CityBuilding, CityGround, StreetLamps, cityLampSpots } from './scene/City.jsx';
import { Farmstead, RuralDecor, RuralGround } from './scene/Rural.jsx';
import { Avatar, Puppy, hairColor, shirtColor } from './scene/Characters.jsx';
import { Interior } from './scene/Interior.jsx';

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
const camRay = new THREE.Raycaster(), camHead = new THREE.Vector3(), camWant = new THREE.Vector3(), camDir = new THREE.Vector3();

// Bật/tắt chế độ mờ cho toàn bộ vật liệu trong một khối nhà (lưu lại giá trị gốc để khôi phục).
function setFade(root, on) {
  root.traverse(m => {
    if (!m.isMesh) return;
    (Array.isArray(m.material) ? m.material : [m.material]).forEach(mt => {
      if (on && !mt.userData.fade) {
        mt.userData.fade = { t: mt.transparent, o: mt.opacity, d: mt.depthWrite };
        mt.transparent = true; mt.opacity = 0.18 * mt.opacity; mt.depthWrite = false; mt.needsUpdate = true;
      } else if (!on && mt.userData.fade) {
        const f = mt.userData.fade;
        mt.transparent = f.t; mt.opacity = f.o; mt.depthWrite = f.d; mt.needsUpdate = true;
        delete mt.userData.fade;
      }
    });
  });
}
function PlayerController({ me, player, anim, hit, onMove }) {
  const group = useRef();
  const zoom = useRef(1);
  // Góc xoay camera do người chơi kéo chuột phải; giữ trong player ref để không mất khi ra/vào nhà.
  if (player.current.yaw == null) { player.current.yaw = 0; player.current.pitch = CAM_PITCH; }
  const faded = useRef(new Set());
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
    // Giữ chuột phải và kéo để xoay camera quanh nhân vật.
    const el = gl.domElement;
    let dragging = false;
    const pdown = e => { if (e.button !== 2) return; dragging = true; el.setPointerCapture(e.pointerId); el.style.cursor = 'grabbing'; };
    const pmove = e => {
      if (!dragging) return;
      const p = player.current;
      p.yaw -= e.movementX * 0.006;
      p.pitch = THREE.MathUtils.clamp(p.pitch + e.movementY * 0.004, 0.22, 1.25);
    };
    const pup = e => { if (e.button !== 2 || !dragging) return; dragging = false; el.releasePointerCapture?.(e.pointerId); el.style.cursor = ''; };
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
    const dt = Math.min(rawDt, 0.06), p = player.current;
    const dx = Number(!!(keys.KeyD || keys.ArrowRight)) - Number(!!(keys.KeyA || keys.ArrowLeft));
    const dz = Number(!!(keys.KeyS || keys.ArrowDown)) - Number(!!(keys.KeyW || keys.ArrowUp));
    const len = Math.hypot(dx, dz);
    const run = !!(keys.ShiftLeft || keys.ShiftRight);
    anim.current.moving = false; anim.current.run = run;
    if (len) {
      const sp = (run ? 9 : 5) * dt;
      const { x0, x1, z0, z1 } = MAP.bounds;
      // Hướng phím tính theo góc camera hiện tại (W luôn là "đi ra xa camera").
      const c = Math.cos(p.yaw), s = Math.sin(p.yaw);
      const mx = (dx * c + dz * s) / len, mz = (dz * c - dx * s) / len;
      const nx = THREE.MathUtils.clamp(p.x + mx * sp, x0, x1), nz = THREE.MathUtils.clamp(p.z + mz * sp, z0, z1);
      // Nếu đang kẹt sẵn trong vật cản (vị trí lưu cũ) thì cho đi tự do để thoát ra.
      const stuck = hit(p.x, p.z);
      const ok = (x, z) => stuck || !hit(x, z);
      // Trượt dọc vật cản: thử cả hai trục, rồi từng trục riêng.
      if (ok(nx, nz)) { p.x = nx; p.z = nz; } else if (ok(nx, p.z)) p.x = nx; else if (ok(p.x, nz)) p.z = nz;
      const target = Math.atan2(mx, mz);
      let diff = target - p.angle; diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      p.angle += diff * Math.min(1, dt * 14);
      anim.current.moving = true;
      onMove?.(p);
    }
    group.current?.position.set(p.x, 0, p.z);
    if (group.current) group.current.rotation.y = p.angle;
    const d = CAM_DIST * zoom.current, th = CAM_BASE_YAW + p.yaw;
    const hh = Math.cos(p.pitch) * d;
    camWant.set(p.x + Math.sin(th) * hh, 1.6 + Math.sin(p.pitch) * d, p.z + Math.cos(th) * hh);
    camera.position.lerp(camWant, Math.min(dt * 6, 1));
    camera.lookAt(p.x, 1.2, p.z);
    // Nhà cửa chắn giữa camera và nhân vật thì làm mờ đi để luôn nhìn thấy nhân vật.
    camHead.set(p.x, 1.4, p.z);
    camDir.subVectors(camera.position, camHead);
    camRay.set(camHead, camDir.normalize());
    camRay.far = camHead.distanceTo(camera.position);
    const now = new Set();
    for (const h of camRay.intersectObjects([...occluders], true)) {
      let o = h.object;
      while (o && !occluders.has(o)) o = o.parent;
      if (o) now.add(o);
    }
    faded.current.forEach(o => { if (!now.has(o)) { setFade(o, false); faded.current.delete(o); } });
    now.forEach(o => { if (!faded.current.has(o)) { setFade(o, true); faded.current.add(o); } });
  });
  useEffect(() => () => { faded.current.forEach(o => setFade(o, false)); faded.current.clear(); }, []);
  return (
    <group ref={group}>
      <Avatar anim={anim} shirt={shirtColor(me?.id)} hair={hairColor(me?.id)} name={me?.display_name} />
    </group>
  );
}

function InteriorCamera() {
  const { camera } = useThree();
  useEffect(() => { camera.position.set(10, 9.5, 11); camera.lookAt(0, 1, 0); }, [camera]);
  return (
    <OrbitControls makeDefault target={[0, 1, 0]} enablePan={false} minDistance={9} maxDistance={20}
      minPolarAngle={0.45} maxPolarAngle={1.25} minAzimuthAngle={0.12} maxAzimuthAngle={1.45} enableDamping
      mouseButtons={{ LEFT: null, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.ROTATE }} />
  );
}

// ---------- Thế giới ngoài trời ----------
function World({ me, nodes, trees, player, anim, hit, onPosition, feedTick, night }) {
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
      <PlayerController me={me} player={player} anim={anim} hit={hit} onMove={onPosition} />
      <Puppy player={player} feedTick={feedTick} />
    </>
  );
}

export default function Game({ me, plots, mode, furniture, held, rotation, onPlace, onPick, onPosition, feedTick }) {
  const player = useRef({ x: 0, z: 0, angle: 0 });
  const anim = useRef({ moving: false, run: false });
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
        {world ? (
          <>
            <color attach="background" args={[sky.bottom]} />
            <fog attach="fog" args={[sky.bottom, 120, 320]} />
            <SkyDome top={sky.top} bottom={sky.bottom} />
            <Stars night={sun.night} />
            <SunMoon night={sun.night} />
            <WorldLights player={player} level={sun.level} night={sun.night} />
            <World me={me} nodes={nodes} trees={trees} player={player} anim={anim} hit={hit} onPosition={onPosition} feedTick={feedTick} night={sun.night} />
          </>
        ) : (
          <>
            <color attach="background" args={[sun.night > 0.6 ? '#3a3550' : '#ead8cf']} />
            <InteriorLights night={sun.night} />
            <Interior furniture={furniture} held={held} rotation={rotation} onPlace={onPlace} onPick={onPick} />
            <InteriorCamera />
          </>
        )}
      </TimeCtx.Provider>
    </Canvas>
  );
}
