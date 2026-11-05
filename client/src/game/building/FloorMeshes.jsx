// Vẽ sàn: tấm sàn (ExtrudeGeometry theo đa giác, có độ dày) và sàn phòng (ShapeGeometry theo đa giác phòng, có lỗ).
// - Mỗi đa giác dựng geometry một lần (useMemo theo toạ độ), dispose khi đổi / gỡ.
// - Chống z-fighting: sàn phòng nằm cao hơn mặt đất / mặt tấm sàn bên dưới 6 mm và dùng polygonOffset.
// - Build Mode: hiện ranh giới + nhãn (tên, diện tích) của phòng ở tầng đang chọn.
import React, { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { footprintInside, pointInPolygon } from '../../../../shared/buildGeometry.mjs';
import { floorHoles, levelHeight, stairLayout } from '../../../../shared/levelGeometry.mjs';
import { FLOOR_MATERIALS, ROOM_TYPES, polygonCentroid } from '../../../../shared/roomGeometry.mjs';
import { ScreenLabel } from '../../scene/kit.jsx';
import { UNIT_BOX, buildSurfaceY, floorY, plotFrame } from './buildingUtils.js';

const toShape = (poly, holes = []) => {
  const shape = new THREE.Shape(poly.map(([x, z]) => new THREE.Vector2(x, -z)));
  for (const h of holes) shape.holes.push(new THREE.Path(h.map(([x, z]) => new THREE.Vector2(x, -z))));
  return shape;
};
const matCache = new Map();
const PICK_MAT = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, colorWrite: false, side: THREE.DoubleSide });
const OUTLINE = { normal: new THREE.LineBasicMaterial({ color: '#f6a27e' }), selected: new THREE.LineBasicMaterial({ color: '#3fd0b4' }) };
function floorMaterial(id, variant = 'normal') {
  const k = `${id}|${variant}`;
  if (!matCache.has(k)) {
    const m = FLOOR_MATERIALS.find(x => x.id === id) || FLOOR_MATERIALS[0];
    const mat = new THREE.MeshStandardMaterial({ color: m.color, roughness: 0.85, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
    if (variant === 'selected') { mat.emissive = new THREE.Color('#3fd0b4'); mat.emissiveIntensity = 0.35; }
    if (variant === 'hover') { mat.emissive = new THREE.Color('#ffffff'); mat.emissiveIntensity = 0.15; }
    matCache.set(k, mat);
  }
  return matCache.get(k);
}

// Lỗ cầu thang nằm gọn trong đa giác sàn → khoét lỗ (tầng trên).
const holesIn = (poly, holes) => holes.filter(h => footprintInside(h, poly, 0.01));
// Tấm sàn: tầng trệt nổi lên khỏi nền (mặt trên = độ dày); tầng trên treo dưới cao độ tầng (mặt trên = cao độ tầng, đi lại được).
function Slab({ o, variant, levels, holes = [], selectable = false }) {
  const hs = o.floor > 0 ? holesIn(o.polygon, holes) : [];
  const sig = JSON.stringify([o.polygon, o.thickness, hs]);
  const geo = useMemo(() => new THREE.ExtrudeGeometry(toShape(o.polygon, hs), { depth: o.thickness, bevelEnabled: false }).rotateX(-Math.PI / 2), [sig]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => geo.dispose(), [geo]);
  const y = floorY(levels, o.floor) - (o.floor > 0 ? o.thickness : 0);
  return <mesh geometry={geo} material={floorMaterial(o.material_id, variant)} position={[0, y, 0]} castShadow receiveShadow
    userData={selectable ? { buildObjectId: o.id, buildObjectType: 'floor', buildFloor: o.floor } : undefined} raycast={selectable ? undefined : () => null} />;
}
// Cầu thang: mỗi bậc là một khối (đặc từ sàn lên mặt bậc), chiếu nghỉ, tay vịn hai bên. Dùng chung hộp đơn vị.
const STAIR_MAT = new THREE.MeshStandardMaterial({ color: '#d9b48a', roughness: 0.8 }), RAIL_MAT = new THREE.MeshStandardMaterial({ color: '#8a5a3c', roughness: 0.7 });
const tintCache = new Map();
const tintMat = c => { if (!tintCache.has(c)) tintCache.set(c, new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.5, depthWrite: false })); return tintCache.get(c); };
const GHOST_STAIR = new THREE.MeshStandardMaterial({ color: '#d9b48a', transparent: true, opacity: 0.4, depthWrite: false });
export function StairMesh({ st, levels, ghost = false, tint = null, selectable = false }) {
  const lay = useMemo(() => stairLayout(st, levelHeight(levels, st.floor)), [st, levels]);
  const mat = tint ? tintMat(tint) : ghost ? GHOST_STAIR : STAIR_MAT;
  const boxes = [];
  lay.parts.forEach((p, k) => {
    const ang = Math.atan2(-p.u[1], p.u[0]);
    const n = p.type === 'flight' ? p.steps : 1, d = p.len / n;
    for (let i = 0; i < n; i++) {
      const top = p.type === 'flight' ? p.y0 + ((i + 1) / n) * (p.y1 - p.y0) : p.y0;
      const s = (i + 0.5) * d, cx = p.a[0] + p.u[0] * s, cz = p.a[1] + p.u[1] * s;
      boxes.push(<mesh key={k + '_' + i} geometry={UNIT_BOX} material={mat} position={[cx, 0, cz]} rotation={[0, ang, 0]} scale={[d + 0.001, Math.max(0.02, top), p.width]} castShadow={!ghost && !tint} receiveShadow
        userData={selectable ? { buildObjectId: st.id, buildObjectType: 'stair', buildFloor: st.floor } : undefined} raycast={selectable ? undefined : () => null} />);
    }
    if (p.type === 'flight' && !tint) for (const side of [-1, 1]) {
      const len = Math.hypot(p.len, p.y1 - p.y0), mx = p.a[0] + p.u[0] * p.len / 2 - p.u[1] * side * (p.width / 2), mz = p.a[1] + p.u[1] * p.len / 2 + p.u[0] * side * (p.width / 2);
      boxes.push(<mesh key={k + 'r' + side} geometry={UNIT_BOX} material={RAIL_MAT} position={[mx, (p.y0 + p.y1) / 2 + 0.85, mz]} rotation={[0, ang, Math.atan2(p.y1 - p.y0, p.len)]} scale={[len, 0.06, 0.06]} raycast={() => null} />);
    }
  });
  return <group position={[0, floorY(levels, st.floor), 0]}>{boxes}</group>;
}
// Sàn phòng: tầng trệt = mặt mỏng (ShapeGeometry); tầng trên = khối dày 0.2 m dưới cao độ tầng (thấy được trần từ dưới), có lỗ cầu thang.
const UPPER_T = 0.2;
function RoomFloor({ o, y, variant, outline, label, levels, holes = [], selectable = false }) {
  const hs = o.floor > 0 ? holesIn(o.polygon, holes) : [];
  const sig = JSON.stringify([o.polygon, o.holes, hs]);
  const { geo, line, loop } = useMemo(() => {
    const shape = toShape(o.polygon, [...(o.holes || []), ...hs]);
    const g = o.floor > 0 ? new THREE.ExtrudeGeometry(shape, { depth: UPPER_T, bevelEnabled: false }).rotateX(-Math.PI / 2).translate(0, -UPPER_T, 0) : new THREE.ShapeGeometry(shape).rotateX(-Math.PI / 2);
    const pts = o.polygon.map(([x, z]) => new THREE.Vector3(x, 0.03, z));
    const lg = new THREE.BufferGeometry().setFromPoints(pts), loop = new THREE.LineLoop(lg, OUTLINE.normal);
    loop.raycast = () => null;
    return { geo: g, line: lg, loop };
  }, [sig]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => { geo.dispose(); line.dispose(); }, [geo, line]);
  loop.material = variant === 'selected' ? OUTLINE.selected : OUTLINE.normal;
  const c = polygonCentroid(o.polygon);
  return (
    <group position={[0, floorY(levels, o.floor) + y, 0]}>
      <mesh geometry={geo} material={floorMaterial(o.floor_material_id, variant)} castShadow={o.floor > 0} receiveShadow
        userData={selectable ? { buildObjectId: o.id, buildObjectType: 'room', buildFloor: o.floor } : undefined} raycast={selectable ? undefined : () => null} />
      {outline && <primitive object={loop} />}
      {label && <ScreenLabel position={[c[0], 0.3, c[1]]} className="room-label" text={`${o.name} · ${o.area} m²`} />}
    </group>
  );
}

// objects: mọi đối tượng thiết kế của một lô. activeFloor = null (Explore Mode) → vẽ mọi tầng, không nhãn.
// maxFloor: chỉ vẽ tới tầng này (ẩn tầng trên khi nhân vật ở trong nhà). levels: design.levels.
export function FloorLayer({ plot, objects, levels = null, activeFloor = null, maxFloor = null, labelFloor = null, selectedId = null, hoveredId = null, showRooms = true, selectable = false }) {
  const f = plotFrame(plot), y0 = buildSurfaceY(plot);
  const top = activeFloor ?? maxFloor ?? Infinity;
  const slabs = objects.filter(o => o.type === 'floor' && o.floor <= top);
  const rooms = objects.filter(o => o.type === 'room' && o.floor <= top);
  const stairs = objects.filter(o => o.type === 'stair' && o.floor <= top);
  const holes = useMemo(() => [1, 2].map(L => floorHoles({ levels, objects }, L)), [objects, levels]);
  // Sàn phòng nằm trên tấm sàn (nếu tâm phòng nằm trên một tấm sàn cùng tầng).
  const roomY = r => {
    const c = polygonCentroid(r.polygon);
    const under = slabs.filter(s => s.floor === r.floor && pointInPolygon(c[0], c[1], s.polygon));
    return under.length ? Math.max(...under.map(s => s.thickness)) + 0.006 : 0.006;
  };
  const variant = id => (id === selectedId ? 'selected' : id === hoveredId ? 'hover' : 'normal');
  return (
    <group position={[f.x, f.y + y0, f.z]} rotation={[0, f.rot, 0]}>
      {slabs.map(o => <Slab key={o.id} o={o} variant={variant(o.id)} levels={levels} holes={holes[o.floor - 1] || []} selectable={selectable && o.floor === labelFloor} />)}
      {stairs.map(o => <StairMesh key={o.id} st={o} levels={levels} ghost={labelFloor != null && o.floor !== labelFloor && o.floor + 1 !== labelFloor} tint={o.id === selectedId ? '#3fd0b4' : null} selectable={selectable && o.floor === labelFloor} />)}
      {rooms.map(o => {
        const here = (labelFloor ?? activeFloor) != null && o.floor === (labelFloor ?? activeFloor) && showRooms;
        return <RoomFloor key={o.id} o={o} y={o.floor > 0 ? 0 : roomY(o)} variant={variant(o.id)} outline={here} label={here} levels={levels} holes={holes[o.floor - 1] || []} selectable={selectable && o.floor === labelFloor} />;
      })}
    </group>
  );
}
export const roomTypeName = id => ROOM_TYPES.find(t => t.id === id)?.name || 'Phòng';
