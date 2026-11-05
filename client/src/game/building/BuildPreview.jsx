// Bản xem trước theo chuột (không bao giờ lưu vào database).
// Hiệu năng: mọi mesh xem trước được tạo MỘT lần; mỗi frame chỉ cập nhật vị trí / kích thước / màu / ẩn-hiện qua ref.
// Mỗi frame chỉ giao tia chuột với MẶT PHẲNG xây dựng (không raycast cả thế giới) → vẫn đúng khi camera xoay / zoom / pan
// mà chuột đứng yên. Store chỉ nhận cập nhật khi ô / kết quả thay đổi (setPreview tự so sánh).
import React, { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { ScreenLabel } from '../../scene/kit.jsx';
import { buildPlaneY, getBuildPlaneIntersection, plotFrame } from './buildingUtils.js';
import { objectAt } from './BuildValidation.js';
import { computePreview } from './previewLogic.js';
import { useBuildingStore } from './buildingStore.js';
import { MarkerModel } from './BuildSelection.jsx';
import { UNIT_BOX } from './WallMeshes.jsx';

const GOOD = new THREE.Color('#3fd0b4'), BAD = new THREE.Color('#f2727a'), NEUTRAL = new THREE.Color('#ffffff');
const ray = new THREE.Raycaster();

export function BuildPreview({ plot, input }) {
  const { camera } = useThree();
  const label = useBuildingStore(s => s.buildPreview?.label);
  const measure = useBuildingStore(s => s.measure);
  const refs = { group: useRef(), tile: useRef(), ghost: useRef(), dot: useRef(), rect: useRef(), line: useRef(), label: useRef(), wall: useRef() };
  // Vật liệu và hình học dùng chung, tạo một lần, dispose khi thoát.
  const res = useMemo(() => {
    const tileMat = new THREE.MeshBasicMaterial({ color: GOOD, transparent: true, opacity: 0.45, depthWrite: false, toneMapped: false });
    const rectMat = new THREE.MeshBasicMaterial({ color: GOOD, transparent: true, opacity: 0.35, depthWrite: false, toneMapped: false });
    const dotMat = new THREE.MeshBasicMaterial({ color: GOOD, depthWrite: false, toneMapped: false });
    const lineMat = new THREE.LineBasicMaterial({ color: GOOD, depthWrite: false, toneMapped: false });
    const plane = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    const ring = new THREE.RingGeometry(0.12, 0.2, 20).rotateX(-Math.PI / 2);
    const lineGeo = new THREE.BufferGeometry(); lineGeo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0, 0, 0], 3));
    // Tường xem trước: dùng chung hộp đơn vị với tường thật, chỉ đổi scale / vị trí / màu — không tạo mesh mới, không có va chạm.
    const wallMat = new THREE.MeshBasicMaterial({ color: GOOD, transparent: true, opacity: 0.5, depthWrite: false, toneMapped: false });
    return { tileMat, rectMat, dotMat, lineMat, plane, ring, lineGeo, wallMat };
  }, []);
  useEffect(() => () => Object.values(res).forEach(r => r.dispose?.()), [res]);
  const lineObj = useMemo(() => { const l = new THREE.Line(res.lineGeo, res.lineMat); l.raycast = () => null; l.renderOrder = 5; return l; }, [res]);

  useFrame(() => {
    const s = useBuildingStore.getState(), f = plotFrame(plot), r = refs;
    const hide = () => { ['tile', 'ghost', 'dot', 'rect', 'label', 'wall'].forEach(k => r[k].current && (r[k].current.visible = false)); lineObj.visible = false; };
    r.group.current?.position.set(f.x, buildPlaneY(plot, s.activeFloor, s.design.levels), f.z);
    if (r.group.current) r.group.current.rotation.y = f.rot;
    if (!input.inside) { hide(); s.setPreview(null); s.setHovered(null); input.preview = null; showMeasure(s.measure); return; }
    ray.setFromCamera(input.ndc, camera);
    const hit = getBuildPlaneIntersection(ray, plot, s.activeFloor, s.design.levels);
    if (!hit) { hide(); s.setPreview(null); input.preview = null; return; }
    const pv = computePreview(s, plot, hit.local, input.drag, input.altFree, { shift: input.shift, endDrag: input.endDrag });
    input.preview = pv;
    s.setPreview({ local: pv.local, world: hit.world, valid: pv.valid, reason: pv.reason, label: pv.label, ...(pv.kind === 'opening' ? { wallId: pv.wallId, opening: pv.opening } : {}), ...(pv.kind === 'stair' ? { stair: pv.stair } : {}) });
    if (['select', 'paint', 'delete', 'erase'].includes(s.activeTool)) s.setHovered(objectAt(s.design, s.activeFloor, hit.local)?.id || null);
    else s.setHovered(null);
    hide();
    const color = pv.valid ? GOOD : BAD;
    if (pv.kind === 'tile') {
      r.tile.current.visible = true; r.tile.current.position.set(pv.local.x, 0.02, pv.local.z); r.tile.current.scale.set(pv.size.w * 0.96, 1, pv.size.d * 0.96);
      res.tileMat.color.copy(color);
      r.ghost.current.visible = true; r.ghost.current.position.set(pv.local.x, 0, pv.local.z);
    } else if (pv.kind === 'point' || pv.kind === 'line' || pv.kind === 'rect' || pv.kind === 'wall') {
      r.dot.current.visible = true; r.dot.current.position.set(pv.local.x, 0.03, pv.local.z); res.dotMat.color.copy(color);
    }
    if (pv.kind === 'rect') {
      r.rect.current.visible = pv.size.w > 0 && pv.size.d > 0;
      r.rect.current.position.set(pv.center.x, 0.025, pv.center.z); r.rect.current.scale.set(Math.max(pv.size.w, 0.01), 1, Math.max(pv.size.d, 0.01));
      res.rectMat.color.copy(color);
    }
    if (pv.kind === 'wall') {
      const dx = pv.b.x - pv.a.x, dz = pv.b.z - pv.a.z, len = Math.hypot(dx, dz), m = r.wall.current;
      m.visible = len > 0.01;
      m.position.set((pv.a.x + pv.b.x) / 2, 0, (pv.a.z + pv.b.z) / 2); m.rotation.y = Math.atan2(-dz, dx);
      m.scale.set(len + pv.thickness, pv.height, pv.thickness);
      res.wallMat.color.copy(color);
    }
    if (pv.kind === 'line') setLine(pv.a, pv.b, color);
    else showMeasure(s.measure);
    if (pv.label && r.label.current) {
      r.label.current.visible = true;
      const at = pv.kind === 'rect' ? pv.center : pv.kind === 'line' || pv.kind === 'wall' ? { x: (pv.a.x + pv.b.x) / 2, z: (pv.a.z + pv.b.z) / 2 } : pv.local;
      r.label.current.position.set(at.x, pv.kind === 'wall' ? pv.height + 0.4 : 0.5, at.z);
    }
  });
  function setLine(a, b, color) {
    const pos = res.lineGeo.attributes.position;
    pos.setXYZ(0, a.x, 0.05, a.z); pos.setXYZ(1, b.x, 0.05, b.z); pos.needsUpdate = true;
    res.lineGeo.computeBoundingSphere();
    res.lineMat.color.copy(color);
    lineObj.visible = true;
  }
  // Kết quả đo gần nhất vẫn hiện cho tới khi đo lại / đổi công cụ.
  function showMeasure(m) {
    if (!m) return;
    setLine(m.a, m.b, NEUTRAL);
    if (refs.label.current && !(input.preview && input.preview.label)) refs.label.current.position.set((m.a.x + m.b.x) / 2, 0.5, (m.a.z + m.b.z) / 2);
  }

  const shownLabel = label || (measure ? `${measure.length} m` : null);
  return (
    <group ref={refs.group}>
      <mesh ref={refs.tile} geometry={res.plane} material={res.tileMat} visible={false} raycast={() => null} renderOrder={4} />
      <group ref={refs.ghost} visible={false}><MarkerModel color="#ffffff" ghost /></group>
      <mesh ref={refs.dot} geometry={res.ring} material={res.dotMat} visible={false} raycast={() => null} renderOrder={6} />
      <mesh ref={refs.rect} geometry={res.plane} material={res.rectMat} visible={false} raycast={() => null} renderOrder={4} />
      <primitive object={lineObj} />
      <mesh ref={refs.wall} geometry={UNIT_BOX} material={res.wallMat} visible={false} raycast={() => null} renderOrder={5} />
      <group ref={refs.label} visible={false}>{shownLabel && <ScreenLabel className="build-dim" text={shownLabel} />}</group>
    </group>
  );
}
