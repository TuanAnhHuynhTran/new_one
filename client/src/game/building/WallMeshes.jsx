// Vẽ tường của một thiết kế (Build Mode và Explore Mode).
// - Lỗ mở THẬT: mỗi tường được chia thành các khối hộp quanh cửa / cửa sổ (wallPieces) — không dùng CSG, chỉ tính lại khi dữ liệu đổi.
// - Một BoxGeometry đơn vị dùng chung cho mọi khối (scale theo dài × cao × dày); vật liệu cache theo material_id / màu.
// - Góc L / T / chữ thập kín khít: đầu nối được kéo dài nửa độ dày (wallJoints).
// - Chế độ hiển thị chỉ đổi cách vẽ, KHÔNG đổi dữ liệu: full · cutaway (hạ tường phía camera) · down (hạ mọi tường) · hide.
import React, { useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { WALL_MATERIALS, wallAngle, wallBox, wallJoints, wallLength } from '../../../../shared/wallGeometry.mjs';
import { catalogItem, wallPieces } from '../../../../shared/openingGeometry.mjs';
import { floorArea } from '../../../../shared/levelGeometry.mjs';
import { pointInPolygon } from '../../../../shared/buildGeometry.mjs';
import { UNIT_BOX, buildSurfaceY, floorY, plotFrame, worldToPlotLocal } from './buildingUtils.js';
import { FloorLayer } from './FloorMeshes.jsx';
import { RoofLayer } from './RoofMeshes.jsx';

export { UNIT_BOX };
const matCache = new Map();
const cached = (key, make) => { if (!matCache.has(key)) matCache.set(key, make()); return matCache.get(key); };
export function wallMaterial(materialId, color, variant = 'normal') {
  return cached(`w|${materialId}|${color || ''}|${variant}`, () => {
    const m = WALL_MATERIALS.find(x => x.id === materialId) || WALL_MATERIALS[0];
    const mat = new THREE.MeshStandardMaterial({ color: color || m.color, roughness: m.rough });
    if (variant === 'selected') { mat.emissive = new THREE.Color('#3fd0b4'); mat.emissiveIntensity = 0.45; }
    if (variant === 'hover') { mat.emissive = new THREE.Color('#ffffff'); mat.emissiveIntensity = 0.18; }
    if (variant === 'ghost') { mat.transparent = true; mat.opacity = 0.35; mat.depthWrite = false; }
    return mat;
  });
}
const solid = (color, ghost) => cached(`s|${color}|${ghost ? 1 : 0}`, () => new THREE.MeshStandardMaterial({ color, roughness: 0.6, transparent: !!ghost, opacity: ghost ? 0.55 : 1, depthWrite: !ghost }));
// Kính: một vật liệu trong suốt dùng chung theo màu (không ghi depth, hai mặt) → nhìn xuyên qua, không lỗi thứ tự khi có nhiều cửa sổ.
const glass = tint => cached(`g|${tint}`, () => new THREE.MeshStandardMaterial({ color: tint, roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.32, depthWrite: false, side: THREE.DoubleSide }));
const HL = new THREE.MeshBasicMaterial({ color: '#3fd0b4', transparent: true, opacity: 0.35, depthWrite: false, toneMapped: false });
export const PICK_MAT = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, colorWrite: false, side: THREE.DoubleSide });
const DOWN_H = 0.6, CUT_H = 0.35;
const tmpCam = new THREE.Vector3();

// Một khối hộp: dọc tường từ s0 → s1, độ cao y0 → y1, dày t (căn giữa tim tường), lệch z theo phương ngang tường.
function Box({ s0, s1, y0, y1, t, z = 0, material, shadow = true }) {
  return <mesh geometry={UNIT_BOX} material={material} position={[(s0 + s1) / 2, y0, z]} scale={[s1 - s0, y1 - y0, t]} castShadow={shadow} receiveShadow raycast={() => null} />;
}

// Cánh cửa xoay quanh bản lề, mở / đóng mượt (lerp theo thời gian).
function HingedLeaf({ open, hingeAt, dir, width, height, thick, children }) {
  const g = useRef();
  useFrame((_, dt) => {
    if (!g.current) return;
    const target = open ? dir * (Math.PI / 2) * 0.92 : 0;
    g.current.rotation.y += (target - g.current.rotation.y) * Math.min(1, dt * 6);
  });
  return (
    <group ref={g} position={[hingeAt, 0, 0]}>{children(width, height, thick)}</group>
  );
}
function SlidingPanel({ open, from, shift, children }) {
  const g = useRef();
  useFrame((_, dt) => { if (g.current) g.current.position.x += ((open ? from + shift : from) - g.current.position.x) * Math.min(1, dt * 6); });
  return <group ref={g} position={[from, 0, 0]}>{children}</group>;
}

// Mô hình cửa / cửa sổ (toạ độ dọc tường: x = s, y = độ cao, z = phương ngang). ghost = bản xem trước.
export function OpeningModel({ op, thickness, open = false, ghost = false, tint = null, selected = false }) {
  const c = catalogItem(op.catalog_id) || {}, frameT = Math.min(thickness + 0.04, 0.3), f = 0.06;
  const frameMat = solid(tint || (op.type === 'door' ? '#efe3d2' : op.color || c.frame || '#fff7ec'), ghost);
  const leafMat = solid(tint || op.color || c.color || '#b98552', ghost), glassMat = glass(c.glass || '#bfe3f0');
  const { offset: s0, width: w, height: h, sill: y0 } = op, s1 = s0 + w;
  const dirZ = op.swing_dir === 'out' ? 1 : -1;
  const frame = (
    <>
      <Box s0={s0 - f} s1={s0} y0={y0} y1={y0 + h} t={frameT} material={frameMat} />
      <Box s0={s1} s1={s1 + f} y0={y0} y1={y0 + h} t={frameT} material={frameMat} />
      <Box s0={s0 - f} s1={s1 + f} y0={y0 + h} y1={y0 + h + f} t={frameT} material={frameMat} />
      {op.type === 'window' && <Box s0={s0 - f} s1={s1 + f} y0={y0 - f} y1={y0} t={frameT + 0.06} material={frameMat} />}
    </>
  );
  let inner = null;
  if (op.type === 'door') {
    const leaf = (lw, glassy) => (
      <>
        <Box s0={0} s1={lw} y0={0} y1={h - 0.01} t={0.05} material={leafMat} />
        {glassy && <Box s0={0.08} s1={lw - 0.08} y0={0.15} y1={h - 0.15} t={0.06} material={glassMat} shadow={false} />}
        <Box s0={lw - 0.12} s1={lw - 0.06} y0={h * 0.47} y1={h * 0.47 + 0.05} t={0.12} material={solid('#c9a46b', ghost)} shadow={false} />
      </>
    );
    if (c.kind === 'double') {
      inner = (
        <>
          <HingedLeaf open={open} hingeAt={s0} dir={dirZ} width={w / 2} height={h} thick={0.05}>{lw => leaf(lw, false)}</HingedLeaf>
          <group position={[s1, 0, 0]} scale={[-1, 1, 1]}>
            <HingedLeaf open={open} hingeAt={0} dir={-dirZ} width={w / 2} height={h} thick={0.05}>{lw => leaf(lw, false)}</HingedLeaf>
          </group>
        </>
      );
    } else if (c.kind === 'sliding') {
      inner = (
        <>
          <group position={[0, 0, 0.04]}><Box s0={s0} s1={s0 + w / 2 + 0.03} y0={0} y1={h} t={0.04} material={leafMat} /><Box s0={s0 + 0.06} s1={s0 + w / 2 - 0.03} y0={0.08} y1={h - 0.08} t={0.05} material={glassMat} shadow={false} /></group>
          <SlidingPanel open={open} from={0} shift={-(w / 2 - 0.05)}>
            <group position={[0, 0, -0.04]}><Box s0={s0 + w / 2 - 0.03} s1={s1} y0={0} y1={h} t={0.04} material={leafMat} /><Box s0={s0 + w / 2 + 0.03} s1={s1 - 0.06} y0={0.08} y1={h - 0.08} t={0.05} material={glassMat} shadow={false} /></group>
          </SlidingPanel>
        </>
      );
    } else {
      // Bản lề bên trái (gần start) hoặc bên phải (gần end).
      const right = op.swing === 'right';
      inner = right ? (
        <group position={[s1, 0, 0]} scale={[-1, 1, 1]}>
          <HingedLeaf open={open} hingeAt={0} dir={-dirZ} width={w} height={h} thick={0.05}>{lw => leaf(lw, c.kind === 'glass')}</HingedLeaf>
        </group>
      ) : <HingedLeaf open={open} hingeAt={s0} dir={dirZ} width={w} height={h} thick={0.05}>{lw => leaf(lw, c.kind === 'glass')}</HingedLeaf>;
    }
  } else {
    const mid = (s0 + s1) / 2;
    inner = (
      <>
        <Box s0={s0} s1={s1} y0={y0} y1={y0 + h} t={0.03} material={glassMat} shadow={false} />
        {(c.kind === 'double' || c.kind === 'sliding') && <Box s0={mid - 0.025} s1={mid + 0.025} y0={y0} y1={y0 + h} t={0.08} material={frameMat} />}
        {c.kind === 'single' && <Box s0={s0} s1={s1} y0={y0 + h / 2 - 0.02} y1={y0 + h / 2 + 0.02} t={0.06} material={frameMat} />}
      </>
    );
  }
  return (
    <group>
      {frame}{inner}
      {selected && <Box s0={s0 - 0.08} s1={s1 + 0.08} y0={Math.max(0, y0 - 0.08)} y1={y0 + h + 0.08} t={thickness + 0.12} material={HL} shadow={false} />}
    </group>
  );
}

// walls: các đoạn tường (cùng lô). openDoors: Set id cửa đang mở. selectedId / hoveredId có thể là id tường hoặc id lỗ mở.
export function WallLayer({ plot, walls, mode = 'full', selectedId = null, hoveredId = null, activeFloor = null, castShadow = true, openDoors = null, levels = null, ghostBelow = true, selectable = false }) {
  const f = plotFrame(plot), y0 = buildSurfaceY(plot);
  const items = useMemo(() => {
    const joints = wallJoints(walls);
    // Đẩy nhẹ chiều cao (≤ 3 mm) theo thứ tự để mặt trên hai tường chồng ở góc không nhấp nháy (z-fighting).
    return walls.filter(w => wallLength(w) > 0).map((w, i) => {
      const j = joints.get(w.id), eps = (i % 4) * 0.001, wE = { ...w, height: w.height + eps };
      return { w, b: wallBox(w, j), angle: wallAngle(w), full: wallPieces(wE, j), cut: wallPieces(w, { ...j, cap: CUT_H }), down: wallPieces(w, { ...j, cap: DOWN_H }) };
    });
  }, [walls]);
  const center = useMemo(() => {
    if (!items.length) return { x: 0, z: 0 };
    let x = 0, z = 0;
    for (const { b } of items) { x += b.cx; z += b.cz; }
    return { x: x / items.length, z: z / items.length };
  }, [items]);
  const fullRefs = useRef([]), cutRefs = useRef([]);
  useFrame(({ camera }) => {
    if (mode !== 'cutaway') return;
    camera.getWorldPosition(tmpCam);
    const c = worldToPlotLocal(plot, tmpCam.x, 0, tmpCam.z), dx = c.x - center.x, dz = c.z - center.z, L = Math.hypot(dx, dz) || 1;
    items.forEach(({ b }, i) => {
      // Tường nằm phía camera so với tâm nhà → hạ thấp.
      const near = ((b.cx - center.x) * dx + (b.cz - center.z) * dz) / L > 0.4;
      if (fullRefs.current[i]) fullRefs.current[i].visible = !near;
      if (cutRefs.current[i]) cutRefs.current[i].visible = near;
    });
  });
  if (mode === 'hide') return null;
  return (
    <group position={[f.x, f.y + y0, f.z]} rotation={[0, f.rot, 0]}>
      {items.map(({ w, angle, full, cut, down }, i) => {
        const variant = w.id === selectedId ? 'selected' : w.id === hoveredId ? 'hover' : activeFloor != null && ((w.floor < activeFloor && ghostBelow) || w.floor > activeFloor) ? 'ghost' : 'normal';
        const mat = wallMaterial(w.material_id, w.color, variant), sh = castShadow && variant !== 'ghost';
        const pieces = list => list.map((p, k) => <Box key={k} {...p} t={w.thickness} material={mat} shadow={sh} />);
        return (
          <group key={w.id} position={[w.start[0], floorY(levels, w.floor), w.start[1]]} rotation={[0, angle, 0]}>
            {selectable && <mesh geometry={UNIT_BOX} material={PICK_MAT} position={[wallLength(w) / 2, w.height / 2, 0]} scale={[wallLength(w), w.height, w.thickness + 0.08]}
              userData={{ buildObjectId: w.id, buildObjectType: 'wall', buildFloor: w.floor }} />}
            {mode === 'down' ? pieces(down) : (
              <>
                <group ref={el => { fullRefs.current[i] = el; }}>
                  {pieces(full)}
                  {(w.openings || []).map(o => (
                    <React.Fragment key={o.id}>
                      <OpeningModel op={o} thickness={w.thickness} open={!!openDoors?.has(o.id)} selected={o.id === selectedId} ghost={variant === 'ghost'} />
                      {selectable && <mesh geometry={UNIT_BOX} material={PICK_MAT} position={[o.offset + o.width / 2, o.sill + o.height / 2, 0]} scale={[o.width, o.height, w.thickness + 0.16]}
                        userData={{ buildObjectId: o.id, buildObjectType: o.type, buildFloor: w.floor }} />}
                    </React.Fragment>
                  ))}
                </group>
                {mode === 'cutaway' && <group ref={el => { cutRefs.current[i] = el; }} visible={false}>{pieces(cut)}</group>}
              </>
            )}
          </group>
        );
      })}
    </group>
  );
}

// Nhà đã lưu của mọi lô trong thế giới (Explore Mode): tường (có cửa) + tấm sàn + sàn phòng. skipPlotId: lô đang mở Build Mode.
const BUILT = ['wall', 'floor', 'room'];
// player: khi nhân vật đứng trong nhà (kể cả nhà một tầng có mái) (trong vùng sàn) → ẩn các tầng phía trên tầng nhân vật để không che khuất.
export function WorldWalls({ nodes, designs, skipPlotId = null, doorStates = null, player = null }) {
  const [cut, setCut] = useState(() => new Map());
  useFrame(() => {
    const p = player?.current;
    if (!p) return;
    let key = null, lvl = null;
    for (const d of designs) {
      if ((d.design?.levels?.length || 1) < 2 && !d.design?.objects?.some(o => o.type === 'roof')) continue;
      const plot = nodes.find(q => q.id === d.plot_id);
      if (!plot) continue;
      const l = worldToPlotLocal(plot, p.x, 0, p.z);
      if (floorArea(d.design, 0).some(poly => pointInPolygon(l.x, l.z, poly)) || (p.level || 0) > 0 && floorArea(d.design, p.level).some(poly => pointInPolygon(l.x, l.z, poly))) { key = d.plot_id; lvl = p.level || 0; break; }
    }
    const cur = [...cut][0];
    if ((cur?.[0] ?? null) !== key || (cur?.[1] ?? null) !== lvl) setCut(key == null ? new Map() : new Map([[key, lvl]]));
  });
  return designs.filter(d => d.plot_id !== skipPlotId && d.design?.objects?.some(o => BUILT.includes(o.type))).map(d => {
    const plot = nodes.find(p => p.id === d.plot_id);
    if (!plot) return null;
    return (
      <group key={d.plot_id}>
        <WallLayer plot={plot} walls={d.design.objects.filter(o => o.type === 'wall' && o.floor <= (cut.get(d.plot_id) ?? Infinity))} openDoors={doorStates?.get(d.plot_id)} levels={d.design.levels} />
        <FloorLayer plot={plot} objects={d.design.objects} levels={d.design.levels} maxFloor={cut.get(d.plot_id) ?? null} />
        {/* Mái hiện bình thường; nhân vật vào trong nhà thì ẩn mái từ tầng nhân vật trở lên để không che khuất. */}
        <RoofLayer plot={plot} design={d.design} visibleFn={r => (cut.has(d.plot_id) && r.floor >= cut.get(d.plot_id) ? null : 'normal')} />
      </group>
    );
  });
}
