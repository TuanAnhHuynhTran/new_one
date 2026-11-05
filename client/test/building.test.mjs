// Kiểm thử hệ toạ độ xây dựng + kiểm tra đặt cấu trúc + store House Builder (chạy: npm test -w client).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { buildPlaneY, getBuildPlaneIntersection, isInsidePlot, plotCornersWorld, plotLocalToWorld, snapToGrid, worldToPlotLocal } from '../src/game/building/buildingUtils.js';
import { validatePlacement, objectAt } from '../src/game/building/BuildValidation.js';
import { useBuildingStore } from '../src/game/building/buildingStore.js';

const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} ≉ ${b}`);
const plot0 = { id: 1, position_x: 20, position_y: 0, position_z: -32, rotation_y: 0, width: 22, length: 22 };
const plotR = { id: 2, position_x: -10, position_y: 0, position_z: 5, rotation_y: Math.PI / 3, width: 12, length: 18 };

describe('buildingUtils — hệ toạ độ local của lô', () => {
  test('world ↔ local khứ hồi, cả khi lô xoay', () => {
    for (const plot of [plot0, plotR]) {
      for (const [x, z] of [[0, 0], [3.2, -4.1], [-5.5, 8.75]]) {
        const w = plotLocalToWorld(plot, x, 1.2, z), l = worldToPlotLocal(plot, w.x, w.y, w.z);
        near(l.x, x); near(l.y, 1.2); near(l.z, z);
      }
    }
  });
  test('gốc local = tâm lô; +Z local = mặt tiền, khớp rotation.y của three.js', () => {
    const c = plotLocalToWorld(plotR, 0, 0, 0);
    near(c.x, -10); near(c.z, 5);
    const obj = new THREE.Object3D(); obj.position.set(-10, 0, 5); obj.rotation.y = Math.PI / 3; obj.updateMatrixWorld();
    const ref = new THREE.Vector3(2, 0, 7).applyMatrix4(obj.matrixWorld), mine = plotLocalToWorld(plotR, 2, 0, 7);
    near(mine.x, ref.x); near(mine.z, ref.z);
  });
  test('snapToGrid khớp tâm ô lưới, căn từ góc lô', () => {
    assert.deepEqual(snapToGrid(plot0, 0.2, -0.3, 1), { x: 0.5, z: -0.5 });
    assert.deepEqual(snapToGrid({ ...plot0, width: 21 }, 0.2, 0, 1).x, 0);
    assert.deepEqual(snapToGrid(plot0, 1.26, 1.74, 0.5), { x: 1.25, z: 1.75 });
    assert.deepEqual(snapToGrid(plot0, 1.26, 1.74, 1, false), { x: 1.26, z: 1.74 });
  });
  test('isInsidePlot theo toạ độ local (lô xoay vẫn đúng)', () => {
    assert.ok(isInsidePlot(plotR, 5.9, 8.9));
    assert.ok(!isInsidePlot(plotR, 6.1, 0));
    assert.ok(!isInsidePlot(plotR, 5.9, 0, 0.25));
    // Điểm world nằm trong lô xoay: lấy từ góc lô dịch vào trong.
    const [cx, cz] = plotCornersWorld(plotR)[2], l = worldToPlotLocal(plotR, cx, 0, cz);
    near(Math.abs(l.x), 6); near(Math.abs(l.z), 9);
  });
  test('getBuildPlaneIntersection: tia từ camera cắt mặt sàn tầng đang chọn', () => {
    const cam = new THREE.PerspectiveCamera(45, 1.6, 0.1, 500);
    const target = { ...plotLocalToWorld(plotR, 2, 0, -3), y: buildPlaneY(plotR, 1) };
    cam.position.set(target.x + 8, target.y + 12, target.z + 9); cam.lookAt(target.x, target.y, target.z); cam.updateMatrixWorld();
    const rc = new THREE.Raycaster(); rc.setFromCamera(new THREE.Vector2(0, 0), cam);
    const hit = getBuildPlaneIntersection(rc, plotR, 1);
    near(hit.local.x, 2, 1e-4); near(hit.local.z, -3, 1e-4); near(hit.world.y, buildPlaneY(plotR, 1), 1e-6);
    rc.set(new THREE.Vector3(0, 10, 0), new THREE.Vector3(0, 1, 0)); // tia hướng lên trời
    assert.equal(getBuildPlaneIntersection(rc, plotR, 0), null);
  });
});

describe('BuildValidation', () => {
  const design = { objects: [{ id: 'marker_x1', type: 'marker', floor: 0, position: { x: 1, y: 0, z: 1 } }] };
  test('hợp lệ / ngoài ranh giới / trùng chỗ / không có quyền / tầng sai', () => {
    const base = { plot: plot0, design, canEdit: true, type: 'marker', floor: 0 };
    assert.ok(validatePlacement({ ...base, local: { x: 3, z: 3 } }).ok);
    assert.match(validatePlacement({ ...base, local: { x: 10.9, z: 0 } }).reason, /ranh giới/);
    assert.match(validatePlacement({ ...base, local: { x: 1.1, z: 1 } }).reason, /Trùng/);
    assert.ok(validatePlacement({ ...base, floor: 1, local: { x: 1, z: 1 } }).ok, 'tầng khác không trùng');
    assert.match(validatePlacement({ ...base, canEdit: false, local: { x: 3, z: 3 } }).reason, /xem/);
    assert.equal(validatePlacement({ ...base, floor: 7, local: { x: 3, z: 3 } }).ok, false);
    assert.equal(objectAt(design, 0, { x: 1.2, z: 0.9 }).id, 'marker_x1');
  });
});

describe('buildingStore', () => {
  const S = useBuildingStore;
  const enter = canEdit => S.setState({ ...S.getInitialState(), isBuildMode: true, plot: plot0, canEdit, activeTool: canEdit ? 'marker' : 'select' });
  test('đặt / xoá / hoàn tác / làm lại, đánh dấu chưa lưu', () => {
    enter(true);
    assert.ok(S.getState().place('marker', { x: 0.5, z: 0.5 }).ok);
    assert.ok(S.getState().place('marker', { x: 2.5, z: 0.5 }).ok);
    assert.equal(S.getState().design.objects.length, 2);
    assert.equal(S.getState().isDirty, true);
    S.getState().undo();
    assert.equal(S.getState().design.objects.length, 1);
    S.getState().redo();
    assert.equal(S.getState().design.objects.length, 2);
    const id = S.getState().design.objects[0].id;
    S.getState().remove(id);
    assert.equal(S.getState().design.objects.length, 1);
    assert.equal(S.getState().place('marker', { x: 11, z: 0 }).ok, false, 'ngoài lô');
    assert.equal(S.getState().undoStack.length, 3);
  });
  test('chế độ chỉ xem: không đặt / xoá / chọn công cụ sửa được', () => {
    enter(false);
    assert.equal(S.getState().place('marker', { x: 0.5, z: 0.5 }).ok, false);
    S.getState().setTool('marker');
    assert.equal(S.getState().activeTool, 'select');
    S.setState({ design: { schema: 1, objects: [{ id: 'marker_k1', type: 'marker', floor: 0, position: { x: 0, y: 0, z: 0 } }] } });
    assert.equal(S.getState().remove('marker_k1'), false);
  });
  test('thoát khi có thay đổi chưa lưu → hỏi lại; thoát hẳn → về trạng thái ban đầu', () => {
    enter(true);
    S.getState().place('marker', { x: 0.5, z: 0.5 });
    assert.equal(S.getState().exit(), false);
    assert.equal(S.getState().confirmExit, true);
    assert.equal(S.getState().exit(true), true);
    assert.equal(S.getState().isBuildMode, false);
    assert.equal(S.getState().design.objects.length, 0);
  });
  test('công cụ không tồn tại không chọn được; người xem không chọn được công cụ Mái', () => {
    enter(true);
    S.getState().setTool('chimney');
    assert.equal(S.getState().activeTool, 'marker');
    S.getState().setTool('roof');
    assert.equal(S.getState().activeTool, 'roof', 'Phase 02.7: công cụ Mái đã bật');
    enter(false);
    S.getState().setTool('roof');
    assert.equal(S.getState().activeTool, 'select');
  });
  test('Phase 02.8: command history có loại lệnh, xoá redo khi có thao tác mới và xác nhận thao tác phá huỷ', () => {
    enter(true);
    S.getState().place('marker', { x: 0.5, z: 0.5 });
    assert.equal(S.getState().undoStack.at(-1).type, 'CREATE_OBJECT');
    S.getState().undo();
    assert.equal(S.getState().redoStack.length, 1);
    S.getState().place('marker', { x: 2.5, z: 0.5 });
    assert.equal(S.getState().redoStack.length, 0, 'thao tác mới sau Undo phải xoá redo history');
    const roof = { id: 'roof_confirm', type: 'roof', floor: 0, level_id: 'level_0', kind: 'flat', pitch: 30, overhang: 0, ridge: 'auto', material_id: 'concrete' };
    S.setState({ design: { ...S.getState().design, objects: [...S.getState().design.objects, roof] }, selectedObjectId: roof.id });
    assert.equal(S.getState().requestRemove(roof.id), false);
    assert.equal(S.getState().pendingConfirm.kind, 'remove');
    assert.ok(S.getState().design.objects.some(o => o.id === roof.id), 'chưa xác nhận thì không được xoá');
    S.getState().cancelPending();
    assert.ok(S.getState().design.objects.some(o => o.id === roof.id));
  });
});
