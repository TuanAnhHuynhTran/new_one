import React, { useMemo, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Mat, TimeCtx, rng, pick } from './kit.jsx';
import { Cottage } from './Rural.jsx';
import { Trees, Shrubs } from './Nature.jsx';
import { Puppy } from './Characters.jsx';

// Hòn đảo nhỏ lơ lửng với ngôi nhà và Mochi — trang trí cho màn hình đăng nhập.
function Island() {
  const ref = useRef();
  useFrame(({ clock }, dt) => {
    if (!ref.current) return;
    ref.current.rotation.y += dt * 0.12;
    ref.current.position.y = Math.sin(clock.elapsedTime * 0.8) * 0.15;
  });
  const deco = useMemo(() => {
    const r = rng(12);
    const trees = [
      { x: -5.2, z: -3.2, s: 0.9, type: 'pine', c: 0.2 }, { x: -3.6, z: -5, s: 0.7, type: 'round', c: 0.6 },
      { x: 5, z: -3.6, s: 1, type: 'round', c: 0.1 }, { x: 4.4, z: 3.6, s: 0.6, type: 'pine', c: 0.8 }, { x: -5.4, z: 2.6, s: 0.65, type: 'round', c: 0.4 },
    ];
    const bushes = Array.from({ length: 8 }, (_, i) => ({ x: Math.cos(i * 0.8 + 2) * 5.6, z: Math.sin(i * 0.8 + 2) * 5.6, s: 0.6 + r() * 0.3, c: pick(['#7cc46b', '#f3f6ef', '#f7c5d2'], r()) }));
    const flowers = Array.from({ length: 40 }, () => { const a = r() * Math.PI * 2, d = 4 + r() * 2; return { x: Math.cos(a) * d, z: Math.sin(a) * d, c: pick(['#f2727a', '#fff4e4', '#f6c453', '#c9a3f0'], r()) }; });
    return { trees, bushes, flowers };
  }, []);
  return (
    <group ref={ref}>
      <mesh position={[0, -0.3, 0]} receiveShadow><cylinderGeometry args={[6.6, 6.4, 0.6, 40]} /><Mat color="#9fd67a" /></mesh>
      <mesh position={[0, -2.6, 0]} rotation={[Math.PI, 0, 0]}><coneGeometry args={[6.4, 4, 12]} /><Mat color="#c89b6d" flat /></mesh>
      <mesh position={[0, -1.1, 0]}><cylinderGeometry args={[6.45, 6.45, 1, 40]} /><Mat color="#b5875a" /></mesh>
      <group scale={0.62} position={[0, 0, -0.6]}><Cottage seed={3} /></group>
      {[-1, 1].map(s => (
        <group key={s} position={[s * 2.6, 0, 2.8]}>
          <mesh position={[0, 0.2, 0]} castShadow><boxGeometry args={[1.8, 0.4, 1.2]} /><Mat color="#9a6b47" /></mesh>
          <mesh position={[0, 0.22, 0]}><boxGeometry args={[1.6, 0.42, 1]} /><Mat color="#7a5238" /></mesh>
          {[-0.5, 0, 0.5].map(x => <mesh key={x} position={[x, 0.6, 0]} castShadow><icosahedronGeometry args={[0.28, 0]} /><Mat flat color={s > 0 ? '#5fa35a' : '#b8e08c'} /></mesh>)}
          {s > 0 && [-0.5, 0, 0.5].map(x => <mesh key={x} position={[x + 0.1, 0.7, 0.15]}><sphereGeometry args={[0.1, 8, 6]} /><Mat color="#e8483f" /></mesh>)}
        </group>
      ))}
      <Trees trees={deco.trees} />
      <Shrubs bushes={deco.bushes} flowers={deco.flowers} />
      <Puppy position={[1.2, 0, 4.2]} rotation={0.5} />
    </group>
  );
}

export default function LoginScene() {
  return (
    <Canvas shadows="soft" dpr={[1, 1.75]} camera={{ fov: 32, position: [14, 10, 16] }} gl={{ alpha: true, antialias: true }} onCreated={({ camera }) => camera.lookAt(0, 0.4, 0)}>
      <TimeCtx.Provider value={{ level: 1, night: 0 }}>
        <hemisphereLight args={['#fff4e0', '#b9d9a0', 0.9]} />
        <directionalLight position={[8, 14, 6]} intensity={2.2} color="#fff1d9" castShadow shadow-mapSize={[1024, 1024]} shadow-bias={-0.0005}
          shadow-camera-left={-10} shadow-camera-right={10} shadow-camera-top={10} shadow-camera-bottom={-10} />
        <Island />
      </TimeCtx.Provider>
    </Canvas>
  );
}
