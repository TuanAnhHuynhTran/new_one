// House Builder (phần 3D, nằm trong <Canvas>): camera xây dựng, ranh giới, lưới, cấu trúc, xem trước, xử lý chuột / phím.
// Toàn bộ trạng thái nằm ở buildingStore; Game.jsx chỉ gắn component này khi isBuildMode = true.
// Sự kiện chuột chỉ ghi trạng thái con trỏ (input); BuildPreview tính toán trong useFrame — mọi listener được gỡ khi thoát.
import React, { useEffect, useMemo } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { BuildCamera } from './BuildCamera.jsx';
import { BuildGrid } from './BuildGrid.jsx';
import { BuildPreview } from './BuildPreview.jsx';
import { BuildSelection } from './BuildSelection.jsx';
import { PlotBoundary } from './PlotBoundary.jsx';
import { objectAt } from './BuildValidation.js';
import { useBuildingStore } from './buildingStore.js';
import { buildPlaneY, plotLocalToWorld } from './buildingUtils.js';

const KEY_TOOLS = { Digit1: 'select', Digit2: 'wall', Digit3: 'floor', Digit4: 'door', Digit5: 'window', Digit6: 'stair', Digit7: 'roof', Digit8: 'paint' };
import { samePoint } from '../../../../shared/wallGeometry.mjs';

function BuildInput({ input, plot }) {
  const { gl, camera, scene } = useThree();
  const raycaster = useMemo(() => new THREE.Raycaster(), []);
  // Chỉ khi chạy dev: script kiểm thử đổi toạ độ local của lô → toạ độ màn hình để click đúng chỗ.
  useEffect(() => {
    if (!import.meta.env.DEV) return undefined;
    window.__lwBuildScreen = (lx, lz) => {
      const s = useBuildingStore.getState(), w = plotLocalToWorld(plot, lx, 0, lz), v = new THREE.Vector3(w.x, buildPlaneY(plot, s.activeFloor, s.design.levels), w.z).project(camera);
      const r = gl.domElement.getBoundingClientRect();
      return [Math.round(r.left + (v.x * 0.5 + 0.5) * r.width), Math.round(r.top + (-v.y * 0.5 + 0.5) * r.height)];
    };
    window.__lwBuild = useBuildingStore;
    return () => { delete window.__lwBuildScreen; };
  }, [gl, camera, plot]);
  useEffect(() => {
    const el = gl.domElement, S = useBuildingStore;
    let downAt = null;
    const setNdc = e => {
      const r = el.getBoundingClientRect();
      input.ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      input.inside = true; input.altFree = e.altKey; input.shift = e.shiftKey;
    };
    const move = e => setNdc(e);
    const down = e => {
      if (e.button !== 0) return;
      setNdc(e);
      downAt = { x: e.clientX, y: e.clientY };
      const s = S.getState(), pv = input.preview;
      // Công cụ Chọn + tường đang chọn: bấm vào tay nắm ở đầu tường → kéo dời đầu tường (các tường nối chung đầu đi theo).
      if (s.activeTool === 'select' && s.canEdit && pv) {
        const w = s.design.objects.find(o => o.id === s.selectedObjectId && o.type === 'wall');
        const which = w && ['start', 'end'].find(k => Math.hypot(w[k][0] - pv.raw.x, w[k][1] - pv.raw.z) < 0.4);
        if (which) { input.endDrag = { id: w.id, which }; return; }
      }
      // Vẽ vùng / đo: bắt đầu kéo từ điểm (đã khớp lưới) hợp lệ — không cho chọn điểm ngoài ranh giới xây dựng.
      if ((s.activeTool === 'zone' || s.activeTool === 'measure') && pv) {
        if (!pv.valid) { s.setMessage(pv.reason); return; }
        if (s.activeTool === 'zone' && !s.canEdit) return;
        input.drag = { start: { ...pv.local } };
        if (s.activeTool === 'measure') s.setMeasure(null);
      }
    };
    const up = e => {
      if (e.button !== 0) return;
      setNdc(e);
      const s = S.getState(), pv = input.preview, drag = input.drag;
      input.drag = null;
      if (input.endDrag) {
        const ed = input.endDrag;
        input.endDrag = null;
        const w = s.design.objects.find(o => o.id === ed.id);
        if (pv?.kind === 'wall' && w && !samePoint(w[ed.which], [pv.local.x, pv.local.z])) { if (pv.valid) s.moveWallEnd(ed.id, ed.which, pv.local); else s.setMessage(pv.reason); }
        downAt = null;
        return;
      }
      const moved = downAt && Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) > 5;
      downAt = null;
      if (drag) {
        if (!pv) return;
        if (s.activeTool === 'zone') { if (pv.kind === 'rect' && pv.size.w > 0 && pv.size.d > 0) s.placeZone(drag.start, pv.local); return; }
        if (s.activeTool === 'measure') {
          if (!pv.valid) { s.setMessage(pv.reason); return; }
          const len = +Math.hypot(pv.local.x - drag.start.x, pv.local.z - drag.start.z).toFixed(2);
          if (len > 0) s.setMeasure({ a: drag.start, b: { ...pv.local }, length: len });
          return;
        }
      }
      if (moved || !pv) return;
      let target = objectAt(s.design, s.activeFloor, pv.raw);
      if (['select', 'paint', 'delete'].includes(s.activeTool)) {
        raycaster.setFromCamera(input.ndc, camera);
        const hit = raycaster.intersectObjects(scene.children, true).find(h => h.object.userData?.buildObjectId && h.object.userData.buildFloor === s.activeFloor);
        if (hit) {
          const id = hit.object.userData.buildObjectId;
          target = s.design.objects.find(o => o.id === id) || s.findOpening(id)?.opening || target;
        }
      }
      if (s.activeTool === 'select') s.select(target?.id || null);
      else if (s.activeTool === 'paint') s.select(target?.id || null);
      else if (s.activeTool === 'delete' || s.activeTool === 'erase') { if (target) s.requestRemove(target.id); }
      else if (s.activeTool === 'marker') { if (pv.valid) s.place('marker', pv.local); else s.setMessage(pv.reason); }
      // Tường: click 1 = điểm đầu, click 2 = điểm cuối (tạo tường rồi vẽ tiếp từ điểm cuối).
      else if (s.activeTool === 'wall') {
        if (!pv.valid) { s.setMessage(pv.reason); return; }
        if (!s.wallDraft) s.startWall(pv.local); else s.addWallTo(pv.local);
      }
      // Cửa / cửa sổ: click lên tường để gắn (gắn với Wall ID, offset dọc tường).
      else if (s.activeTool === 'door' || s.activeTool === 'window') {
        if (pv.kind === 'opening' && pv.valid) s.placeOpening(pv.wallId, pv.opening.offset, s.activeTool); else s.setMessage(pv.reason);
      }
      // Cầu thang: click chân → click lần hai chốt hướng đi lên.
      else if (s.activeTool === 'stair') {
        if (!pv.valid) { s.setMessage(pv.reason); return; }
        if (!s.stairDraft) s.startStair(pv.local); else s.placeStair(pv.stair.dir);
      }
      // Mái: dựng từ footprint các phòng của tầng đang chọn (đã có mái → chọn mái đó).
      else if (s.activeTool === 'roof') {
        const cur = s.roofOf();
        if (cur) s.select(cur.id); else s.placeRoof();
      }
      // Sàn: click góc đầu → click góc đối diện.
      else if (s.activeTool === 'floor') {
        if (!pv.valid) { s.setMessage(pv.reason); return; }
        if (!s.floorDraft) s.startFloor(pv.local); else s.placeFloor(pv.local);
      }
    };
    const leave = () => { input.inside = false; };
    // Phím tắt trong Build Mode (B / Esc do App xử lý để thoát).
    const key = e => {
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) return;
      const s = S.getState();
      input.altFree = e.altKey; input.shift = e.shiftKey;
      if (e.altKey) e.preventDefault();
      if ((e.ctrlKey || e.metaKey) && e.code === 'KeyZ') { e.preventDefault(); if (e.shiftKey) s.redo(); else s.undo(); return; }
      if ((e.ctrlKey || e.metaKey) && e.code === 'KeyY') { e.preventDefault(); s.redo(); return; }
      if ((e.ctrlKey || e.metaKey) && e.code === 'KeyS') { e.preventDefault(); window.dispatchEvent(new CustomEvent('lw-build-save')); return; }
      if (e.ctrlKey || e.metaKey || e.repeat) return;
      if (KEY_TOOLS[e.code]) s.setTool(KEY_TOOLS[e.code]);
      else if (e.code === 'KeyG') s.toggle('showGrid');
      else if (e.code === 'KeyN') s.toggle('snapEnabled');
      else if (e.code === 'KeyT') s.cycleWallDisplay();
      else if (e.code === 'KeyM') s.toggle('showRoof'); // ẩn / hiện mái (chỉ hiển thị)
      else if (e.code === 'KeyR') { if (s.selectedObjectId) { e.preventDefault(); s.rotateSelected(); } }
      else if (e.code === 'PageUp') s.setFloor(s.activeFloor + 1);
      else if (e.code === 'PageDown') s.setFloor(s.activeFloor - 1);
      else if ((e.code === 'Delete' || e.code === 'Backspace') && s.selectedObjectId) s.requestRemove(s.selectedObjectId);
    };
    const keyUp = e => { input.altFree = e.altKey; input.shift = e.shiftKey; };
    el.style.cursor = 'crosshair';
    el.addEventListener('pointermove', move); el.addEventListener('pointerdown', down); window.addEventListener('pointerup', up); el.addEventListener('pointerleave', leave);
    window.addEventListener('keydown', key); window.addEventListener('keyup', keyUp);
    return () => {
      el.style.cursor = '';
      el.removeEventListener('pointermove', move); el.removeEventListener('pointerdown', down); window.removeEventListener('pointerup', up); el.removeEventListener('pointerleave', leave);
      window.removeEventListener('keydown', key); window.removeEventListener('keyup', keyUp);
    };
  }, [gl, input, camera, scene, raycaster]);
  return null;
}

export function HouseBuilder() {
  const plot = useBuildingStore(s => s.plot);
  const canEdit = useBuildingStore(s => s.canEdit);
  const showGrid = useBuildingStore(s => s.showGrid);
  const gridSize = useBuildingStore(s => s.gridSize);
  const floor = useBuildingStore(s => s.activeFloor);
  const setback = useBuildingStore(s => s.setback);
  const levels = useBuildingStore(s => s.design.levels);
  // Trạng thái con trỏ (không phải React state → di chuột không render lại).
  const input = useMemo(() => ({ ndc: new THREE.Vector2(), inside: false, drag: null, endDrag: null, altFree: false, shift: false, preview: null }), []);
  if (!plot) return null;
  return (
    <group>
      <BuildCamera plot={plot} />
      <BuildInput input={input} plot={plot} />
      <PlotBoundary plot={plot} canEdit={canEdit} setback={setback} />
      {showGrid && <BuildGrid plot={plot} gridSize={gridSize} floor={floor} levels={levels} />}
      <BuildSelection plot={plot} />
      <BuildPreview plot={plot} input={input} />
    </group>
  );
}
